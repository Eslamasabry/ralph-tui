/**
 * ABOUTME: Beads tracker plugin for bd (beads) issue tracking.
 * Integrates with the local beads issue tracker using the bd CLI.
 * Implements full CRUD operations via bd commands with --json output.
 */

import { spawn } from 'node:child_process';
import { access, constants, readFileSync } from 'node:fs';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseTrackerPlugin } from '../../base.js';
import { appendTrackerEvent } from '../../../../logs/index.js';
import type {
  SetupQuestion,
  SyncResult,
  TaskCompletionResult,
  TaskFilter,
  TaskPriority,
  TrackerPluginFactory,
  TrackerPluginMeta,
  TrackerTask,
  TrackerTaskStatus,
} from '../../types.js';

/**
 * Raw bead structure from bd list --json output.
 */
interface BeadJson {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'closed' | 'cancelled';
  priority: number;
  issue_type?: string;
  owner?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  labels?: string[];
  parent?: string;
  dependency_count?: number;
  dependent_count?: number;
  dependencies?: Array<{
    id: string;
    title: string;
    status: string;
    dependency_type: 'blocks' | 'parent-child';
  }>;
  dependents?: Array<{
    id: string;
    title: string;
    status: string;
    dependency_type: 'blocks' | 'parent-child';
  }>;
  external_ref?: string;
}

/**
 * Result of detect() operation.
 */
interface DetectResult {
  available: boolean;
  beadsDir?: string;
  bdPath?: string;
  bdVersion?: string;
  error?: string;
}

/**
 * Get the directory containing this module (for locating template.hbs).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Cache for the template content to avoid repeated file reads.
 */
let templateCache: string | null = null;

/**
 * Execute a bd command and return the output.
 */
async function execBd(
  args: string[],
  cwd?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('bd', args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      stderr += err.message;
      resolve({ stdout, stderr, exitCode: 1 });
    });
  });
}

/**
 * Convert bd status to TrackerTaskStatus.
 */
function mapStatus(bdStatus: string): TrackerTaskStatus {
  switch (bdStatus) {
    case 'open':
      return 'open';
    case 'in_progress':
      return 'in_progress';
    case 'blocked':
      return 'blocked';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'open';
  }
}

/**
 * Convert TrackerTaskStatus back to bd status.
 */
function mapStatusToBd(status: TrackerTaskStatus): string {
  switch (status) {
    case 'open':
      return 'open';
    case 'in_progress':
      return 'in_progress';
    case 'completed':
      return 'closed';
    case 'cancelled':
      return 'cancelled';
    case 'blocked':
      return 'blocked';
    default:
      return 'open';
  }
}

/**
 * Convert bd priority (0-4) to TaskPriority.
 */
function mapPriority(bdPriority: number): TaskPriority {
  const clamped = Math.max(0, Math.min(4, bdPriority));
  return clamped as TaskPriority;
}

/**
 * Convert a BeadJson object to TrackerTask.
 */
function beadToTask(bead: BeadJson): TrackerTask {
  // Extract blocking dependencies (tasks this depends on that aren't done)
  const dependsOn: string[] = [];
  const blocks: string[] = [];

  if (bead.dependencies) {
    for (const dep of bead.dependencies) {
      if (dep.dependency_type === 'blocks') {
        dependsOn.push(dep.id);
      }
    }
  }

  if (bead.dependents) {
    for (const dep of bead.dependents) {
      if (dep.dependency_type === 'blocks') {
        blocks.push(dep.id);
      }
    }
  }

  // Infer parentId from bead ID if not provided (bd list --json bug)
  // e.g., "ralph-tui-45r.37" -> parent is "ralph-tui-45r"
  let parentId = bead.parent;
  if (!parentId && bead.id.includes('.')) {
    const lastDotIndex = bead.id.lastIndexOf('.');
    parentId = bead.id.substring(0, lastDotIndex);
  }

  return {
    id: bead.id,
    title: bead.title,
    status: mapStatus(bead.status),
    priority: mapPriority(bead.priority),
    description: bead.description,
    labels: bead.labels,
    type: bead.issue_type,
    parentId,
    dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    blocks: blocks.length > 0 ? blocks : undefined,
    assignee: bead.owner,
    createdAt: bead.created_at,
    updatedAt: bead.updated_at,
    metadata: {
      closedAt: bead.closed_at,
      dependencyCount: bead.dependency_count,
      dependentCount: bead.dependent_count,
    },
  };
}

/**
 * Beads tracker plugin implementation.
 * Uses the bd CLI to interact with beads issues.
 */
export class BeadsTrackerPlugin extends BaseTrackerPlugin {
  readonly meta: TrackerPluginMeta = {
    id: 'beads',
    name: 'Beads Issue Tracker',
    description: 'Track issues using the bd (beads) CLI',
    version: '1.0.0',
    supportsBidirectionalSync: true,
    supportsHierarchy: true,
    supportsDependencies: true,
  };

  private beadsDir: string = '.beads';
  private epicId: string = '';
  protected labels: string[] = [];
  private workingDir: string = process.cwd();
  private knownTaskIds: Set<string> | null = null;
  private taskCache = new Map<string, TrackerTask>();
  private refreshInFlight = false;
  private refreshQueued = false;

  private async getLockDir(): Promise<string> {
    const lockDir = join(this.workingDir, this.beadsDir, '.locks');
    await mkdir(lockDir, { recursive: true });
    return lockDir;
  }

  private async logNewTasks(tasks: TrackerTask[]): Promise<void> {
    if (!this.knownTaskIds) {
      this.knownTaskIds = new Set(tasks.map((task) => task.id));
      return;
    }

    const newTasks = tasks.filter((task) => !this.knownTaskIds!.has(task.id));
    if (newTasks.length === 0) {
      return;
    }

    for (const task of newTasks) {
      this.knownTaskIds.add(task.id);
      await appendTrackerEvent(this.workingDir, {
        type: 'tracker:new-task',
        timestamp: new Date().toISOString(),
        tracker: this.meta.id,
        taskId: task.id,
        title: task.title,
        parentId: task.parentId,
        status: task.status,
        priority: task.priority,
      });
    }
  }

  private async createTaskLock(taskId: string, workerId: string): Promise<boolean> {
    const lockDir = await this.getLockDir();
    const lockPath = join(lockDir, `${taskId}.lock`);
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(
        JSON.stringify({ taskId, workerId, claimedAt: new Date().toISOString() }),
        'utf-8'
      );
      await handle.close();
      return true;
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'EEXIST') {
        return false;
      }
      throw err;
    }
  }

  private async removeTaskLock(taskId: string): Promise<void> {
    const lockDir = await this.getLockDir();
    const lockPath = join(lockDir, `${taskId}.lock`);
    try {
      await unlink(lockPath);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  override async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);

    if (typeof config.beadsDir === 'string') {
      this.beadsDir = config.beadsDir;
    }

    if (typeof config.epicId === 'string') {
      this.epicId = config.epicId;
    }

    // Handle labels as either string or array
    if (typeof config.labels === 'string') {
      // Single string or comma-separated string
      this.labels = config.labels.split(',').map((l) => l.trim()).filter(Boolean);
    } else if (Array.isArray(config.labels)) {
      this.labels = config.labels.filter(
        (l): l is string => typeof l === 'string'
      );
    }

    if (typeof config.workingDir === 'string') {
      this.workingDir = config.workingDir;
    }

    // Validate readiness
    const detection = await this.detect();
    this.ready = detection.available;
  }

  /**
   * Detect if beads is available in the current environment.
   * Checks for .beads/ directory and bd binary.
   */
  async detect(): Promise<DetectResult> {
    // Check for .beads directory
    const beadsDirPath = join(this.workingDir, this.beadsDir);
    try {
      await new Promise<void>((resolve, reject) => {
        access(beadsDirPath, constants.R_OK, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch {
      return {
        available: false,
        error: `Beads directory not found: ${beadsDirPath}`,
      };
    }

    // Check for bd binary
    const { stdout, stderr, exitCode } = await execBd(
      ['--version'],
      this.workingDir
    );

    if (exitCode !== 0) {
      return {
        available: false,
        error: `bd binary not available: ${stderr}`,
      };
    }

    // Parse version from output (format: "bd version X.Y.Z (hash)")
    const versionMatch = stdout.match(/bd version (\S+)/);
    const version = versionMatch ? versionMatch[1] : 'unknown';

    return {
      available: true,
      beadsDir: beadsDirPath,
      bdPath: 'bd',
      bdVersion: version,
    };
  }

  override async isReady(): Promise<boolean> {
    if (!this.ready) {
      const detection = await this.detect();
      this.ready = detection.available;
    }
    return this.ready;
  }

  getSetupQuestions(): SetupQuestion[] {
    // Note: epicId is NOT asked here - it should be specified via CLI flag (--epic)
    // when starting the TUI, not saved in config
    return [
      {
        id: 'beadsDir',
        prompt: 'Path to .beads directory:',
        type: 'path',
        default: '.beads',
        required: false,
        help: 'Directory containing beads issues (default: .beads in project root)',
      },
      {
        id: 'labels',
        prompt: 'Labels to filter issues by (comma-separated):',
        type: 'text',
        default: '',
        required: false,
        help: 'Only show issues with these labels (e.g., "ralph,frontend"). Leave empty to show all epics.',
      },
    ];
  }

  override async validateSetup(
    _answers: Record<string, unknown>
  ): Promise<string | null> {
    // Note: epicId is validated at runtime when specified via CLI, not during setup

    // Check if beads is available
    const detection = await this.detect();
    if (!detection.available) {
      return detection.error ?? 'Beads tracker not available';
    }

    return null;
  }

  private lastTasks: TrackerTask[] = [];

  async getTasks(filter?: TaskFilter): Promise<TrackerTask[]> {
    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return this.lastTasks; // Return last cached tasks to avoid empty list
    }

    this.refreshInFlight = true;
    try {
      do {
        this.refreshQueued = false;

        // Build bd list command args
        // Use --all to include closed issues (TUI filters visibility via showClosedTasks state)
        const args = ['list', '--json', '--all'];

        // Filter by parent (epic) - beads in an epic are children of the epic issue
        if (filter?.parentId) {
          args.push('--parent', filter.parentId);
        } else if (this.epicId) {
          args.push('--parent', this.epicId);
        }

        // Filter by status
        if (filter?.status) {
          const statuses = Array.isArray(filter.status)
            ? filter.status
            : [filter.status];
          // Map our statuses to bd statuses
          const bdStatuses = statuses.map(mapStatusToBd);
          // bd only supports single --status, so use the first one
          // For multiple statuses, we'll filter in memory
          if (bdStatuses.length === 1) {
            args.push('--status', bdStatuses[0]!);
          }
        }

        // Filter by labels (separate from epic hierarchy)
        const labelsToFilter =
          filter?.labels && filter.labels.length > 0 ? filter.labels : this.labels;
        if (labelsToFilter.length > 0) {
          args.push('--label', labelsToFilter.join(','));
        }

        const { stdout, exitCode, stderr } = await execBd(args, this.workingDir);

        if (exitCode !== 0) {
          console.error('bd list failed:', stderr);
          return this.lastTasks;
        }

        // Parse JSON output
        let beads: BeadJson[];
        try {
          beads = JSON.parse(stdout) as BeadJson[];
        } catch (err) {
          console.error('Failed to parse bd list output:', err);
          return this.lastTasks;
        }

        // Convert to TrackerTask
        let tasks = beads.map(beadToTask);

        // Hydrate dependencies if bd list didn't include them
        const needsDeps = tasks.filter((task) => {
          if (task.dependsOn && task.dependsOn.length > 0) {
            return false;
          }
          const dependencyCount = typeof task.metadata?.dependencyCount === 'number'
            ? task.metadata.dependencyCount
            : 0;
          return dependencyCount > 0;
        });

        if (needsDeps.length > 0) {
          const hydrated = await Promise.all(
            needsDeps.map(async (task) => {
              // Check if we already have this task in cache
              if (this.taskCache.has(task.id)) {
                return this.taskCache.get(task.id);
              }
              // Fetch from bd show
              const hydratedTask = await this.getTask(task.id);
              if (hydratedTask) {
                this.taskCache.set(task.id, hydratedTask);
              }
              return hydratedTask;
            })
          );
          
          const taskMap = new Map(tasks.map((task) => [task.id, task]));
          for (const hydratedTask of hydrated) {
            if (hydratedTask) {
              const existing = taskMap.get(hydratedTask.id);
              if (existing) {
                taskMap.set(hydratedTask.id, {
                  ...existing,
                  dependsOn: hydratedTask.dependsOn,
                  blocks: hydratedTask.blocks,
                });
              }
            }
          }
          tasks = Array.from(taskMap.values());
        }

        // Apply additional filtering that bd doesn't support directly
        // Note: Remove parentId from filter since bd already handled it via --parent flag
        // (bd list --json doesn't include parent field in output, so filterTasks would incorrectly remove tasks)
        const filterWithoutParent = filter ? { ...filter, parentId: undefined } : undefined;
        const filteredTasks = this.filterTasks(tasks, filterWithoutParent);

        void this.logNewTasks(filteredTasks);
        this.lastTasks = filteredTasks; // Cache the result
        if (!this.refreshQueued) {
          return filteredTasks;
        }
      } while (this.refreshQueued);

      // This line is theoretically unreachable, but TypeScript requires a return
      return this.lastTasks;
    } finally {
      this.refreshInFlight = false;
    }
  }

  override async getTask(id: string): Promise<TrackerTask | undefined> {
    // Check if we already have this task in cache
    if (this.taskCache.has(id)) {
      return this.taskCache.get(id);
    }
    
    const { stdout, exitCode, stderr } = await execBd(
      ['show', id, '--json'],
      this.workingDir
    );

    if (exitCode !== 0) {
      console.error(`bd show ${id} failed:`, stderr);
      return undefined;
    }

    // bd show --json returns an array with one element
    let beads: BeadJson[];
    try {
      beads = JSON.parse(stdout) as BeadJson[];
    } catch (err) {
      console.error('Failed to parse bd show output:', err);
      return undefined;
    }

    if (beads.length === 0) {
      return undefined;
    }

    const task = beadToTask(beads[0]!);
    this.taskCache.set(id, task); // Cache the task
    return task;
  }

  async completeTask(
    id: string,
    reason?: string
  ): Promise<TaskCompletionResult> {
    // Use --force to ensure close succeeds even if issue is pinned
    const args = ['close', id, '--force'];

    if (reason) {
      args.push('--reason', reason);
    }

    const { exitCode, stderr, stdout } = await execBd(args, this.workingDir);

    if (exitCode !== 0) {
      return {
        success: false,
        message: `Failed to close task ${id}`,
        error: stderr || stdout,
      };
    }

    // Clean up claim lock if present
    await this.removeTaskLock(id);

    // Fetch the updated task
    const task = await this.getTask(id);

    return {
      success: true,
      message: `Task ${id} closed successfully`,
      task,
    };
  }

  async updateTaskStatus(
    id: string,
    status: TrackerTaskStatus
  ): Promise<TrackerTask | undefined> {
    const bdStatus = mapStatusToBd(status);
    const args = ['update', id, '--status', bdStatus];

    const { exitCode, stderr } = await execBd(args, this.workingDir);

    if (exitCode !== 0) {
      console.error(`bd update ${id} --status ${bdStatus} failed:`, stderr);
      return undefined;
    }

    // Fetch and return the updated task
    return this.getTask(id);
  }

  /**
   * Mark a task as pending-main (commits waiting to merge to main branch).
   * For beads, this marks the task as blocked and adds a note.
   * The task will not be returned by getNextTask while in pending-main state.
   *
   * @param id - The task ID to mark as pending-main
   * @param pendingCommits - Number of commits pending merge
   * @param commits - Optional array of commit SHAs pending merge
   * @returns The updated task, or undefined if not found
   */
  async markTaskPendingMain(
    id: string,
    pendingCommits: number,
    commits?: string[]
  ): Promise<TrackerTask | undefined> {
    // Mark as blocked so getNextTask won't return it
    const updated = await this.updateTaskStatus(id, 'blocked');
    if (!updated) {
      return undefined;
    }

    // Add note about pending-main status
    const note = `[pending-main] ${pendingCommits} commit(s) pending merge to main branch${commits ? `: ${commits.join(', ')}` : ''}`;

    const { exitCode, stderr } = await execBd(
      ['update', id, '--note', note],
      this.workingDir
    );

    if (exitCode !== 0) {
      console.error(`bd update ${id} --note failed:`, stderr);
      // Still return the task even if note update failed
      return updated;
    }

    // Fetch and return the updated task with note
    return this.getTask(id);
  }

  /**
   * Clear the pending-main status from a task (after successful merge to main).
   * This is called when all pending commits have been merged.
   *
   * @param id - The task ID to clear pending-main status
   * @param reason - Optional reason for clearing (e.g., "Merged to main")
   * @returns The updated task, or undefined if not found
   */
  async clearPendingMain(
    id: string,
    reason?: string
  ): Promise<TrackerTask | undefined> {
    // Get current note and append merge complete message
    const task = await this.getTask(id);
    if (!task) {
      return undefined;
    }

    const mergeNote = reason || '[pending-main] Commits merged to main';
    const existingNote = task.metadata?.notes as string | undefined;
    const newNote = existingNote ? `${existingNote}\n${mergeNote}` : mergeNote;

    const { exitCode, stderr } = await execBd(
      ['update', id, '--note', newNote],
      this.workingDir
    );

    if (exitCode !== 0) {
      console.error(`bd update ${id} --note failed:`, stderr);
    }

    // Reset status to open (not blocked anymore)
    return this.updateTaskStatus(id, 'open');
  }

  override async claimTask(id: string, workerId: string): Promise<boolean> {
    let locked = await this.createTaskLock(id, workerId);
    if (!locked) {
      const existing = await this.getTask(id);
      if (existing && existing.status !== 'in_progress') {
        await this.removeTaskLock(id);
        locked = await this.createTaskLock(id, workerId);
      }
    }

    if (!locked) {
      return false;
    }

    const updated = await this.updateTaskStatus(id, 'in_progress');
    if (!updated) {
      await this.removeTaskLock(id);
      return false;
    }

    return true;
  }

  override async releaseTask(id: string, _workerId: string): Promise<void> {
    await this.removeTaskLock(id);
  }

  override async sync(): Promise<SyncResult> {
    const startedAt = new Date();
    void appendTrackerEvent(this.workingDir, {
      type: 'tracker:sync-start',
      timestamp: startedAt.toISOString(),
      tracker: this.meta.id,
      epicId: this.epicId || undefined,
      workingDir: this.workingDir,
    });

    // Run bd sync to synchronize with git
    const { exitCode, stderr, stdout } = await execBd(
      ['sync'],
      this.workingDir
    );

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();

    if (exitCode !== 0) {
      void appendTrackerEvent(this.workingDir, {
        type: 'tracker:sync-complete',
        timestamp: endedAt.toISOString(),
        tracker: this.meta.id,
        success: false,
        durationMs,
        error: stderr || stdout,
      });
      return {
        success: false,
        message: 'Beads sync failed',
        error: stderr || stdout,
        syncedAt: new Date().toISOString(),
      };
    }

    void appendTrackerEvent(this.workingDir, {
      type: 'tracker:sync-complete',
      timestamp: endedAt.toISOString(),
      tracker: this.meta.id,
      success: true,
      durationMs,
      message: 'Beads synced with git',
    });
    return {
      success: true,
      message: 'Beads synced with git',
      syncedAt: new Date().toISOString(),
    };
  }

  override async isComplete(filter?: TaskFilter): Promise<boolean> {
    // Get all tasks for the epic (or filtered set)
    const tasks = await this.getTasks({
      ...filter,
      parentId: filter?.parentId ?? this.epicId,
    });

    // Check if all tasks are completed or cancelled
    return tasks.every(
      (t) => t.status === 'completed' || t.status === 'cancelled'
    );
  }

  /**
   * Get all available epics from the beads tracker.
   * Queries for beads with type='epic' and open/in_progress status.
   */
  override async getEpics(): Promise<TrackerTask[]> {
    // Query for epics using bd list with type filter
    const args = ['list', '--json', '--type', 'epic'];

    // Filter by labels if configured
    if (this.labels.length > 0) {
      args.push('--label', this.labels.join(','));
    }

    const { stdout, exitCode, stderr } = await execBd(args, this.workingDir);

    if (exitCode !== 0) {
      console.error('bd list --type epic failed:', stderr);
      return [];
    }

    // Parse JSON output
    let beads: BeadJson[];
    try {
      beads = JSON.parse(stdout) as BeadJson[];
    } catch (err) {
      console.error('Failed to parse bd list output:', err);
      return [];
    }

    // Convert to TrackerTask and filter to top-level epics (no parent)
    // Also include open/in_progress epics only (not closed)
    const tasks = beads.map(beadToTask);
    return tasks.filter(
      (t) =>
        !t.parentId &&
        (t.status === 'open' || t.status === 'in_progress')
    );
  }

   /**
    * Get the next task to work on using bd ready.
    * Overrides base implementation to leverage bd's server-side dependency filtering,
    * since bd list --json doesn't include dependency data needed for client-side filtering.
    * Also filters out tasks with pending-main status (marked as blocked with pending-main note).
    * See: https://github.com/subsy/ralph-tui/issues/97
    */
   override async getNextTask(filter?: TaskFilter): Promise<TrackerTask | undefined> {
     // Build bd ready command args
     const args = ['ready', '--json'];

     // Apply limit - we only need the first task, but get a few for in_progress preference
     args.push('--limit', '10');

     // Filter by parent (epic)
     if (filter?.parentId) {
       args.push('--parent', filter.parentId);
     } else if (this.epicId) {
       args.push('--parent', this.epicId);
     }

     // Filter by labels
     const labelsToFilter =
       filter?.labels && filter.labels.length > 0 ? filter.labels : this.labels;
     if (labelsToFilter.length > 0) {
       args.push('--label', labelsToFilter.join(','));
     }

     // Filter by priority
     if (filter?.priority !== undefined) {
       const priorities = Array.isArray(filter.priority)
         ? filter.priority
         : [filter.priority];
       // bd ready only supports single priority, use highest (lowest number)
       const highestPriority = Math.min(...priorities);
       args.push('--priority', String(highestPriority));
     }

     // Filter by assignee
     if (filter?.assignee) {
       args.push('--assignee', filter.assignee);
     }

     const { stdout, exitCode, stderr } = await execBd(args, this.workingDir);

     if (exitCode !== 0) {
       console.error('bd ready failed:', stderr);
       return undefined;
     }

     // Parse JSON output
     let beads: BeadJson[];
     try {
       beads = JSON.parse(stdout) as BeadJson[];
     } catch (err) {
       console.error('Failed to parse bd ready output:', err);
       return undefined;
     }

     if (beads.length === 0) {
       return undefined;
     }

     // Convert to TrackerTask
     let tasks = beads.map(beadToTask);

     // Filter out excluded task IDs (used by engine for skipped/failed tasks)
     if (filter?.excludeIds && filter.excludeIds.length > 0) {
       const excludeSet = new Set(filter.excludeIds);
       tasks = tasks.filter((t) => !excludeSet.has(t.id));
     }

     const statusFilter = filter?.status
       ? Array.isArray(filter.status)
         ? filter.status
         : [filter.status]
       : undefined;

     if (statusFilter) {
       tasks = tasks.filter((t) => statusFilter.includes(t.status));
     }

     // Additional safety filter: exclude tasks with pending-main notes
     // This handles cases where a task might not be properly marked as blocked
     tasks = tasks.filter((t) => {
       const notes = t.metadata?.notes as string | undefined;
       if (notes && notes.includes('[pending-main]')) {
         return false;
       }
       return true;
     });

    if (tasks.length === 0) {
      const shouldFallback = !statusFilter || statusFilter.includes('open');
      if (shouldFallback) {
        const fallbackTasks = await this.getTasks({
          ...filter,
          status: 'open',
          ready: true,
        });
        if (fallbackTasks.length === 0) {
          return undefined;
        }
        fallbackTasks.sort((a, b) => a.priority - b.priority);
        return fallbackTasks[0];
      }
      return undefined;
    }

    // Prefer in_progress tasks only when allowed by filter
    if (!statusFilter || statusFilter.includes('in_progress')) {
      const inProgress = tasks.find((t) => t.status === 'in_progress');
      if (inProgress) {
        return inProgress;
      }
    }

    // Return the first ready task (bd ready already sorted by priority/hybrid)
    return tasks[0];
  }

  /**
   * Set the epic ID for filtering tasks.
   * Used when user selects an epic from the TUI.
   */
  setEpicId(epicId: string): void {
    this.epicId = epicId;
  }

  /**
   * Get the currently configured epic ID.
   */
  getEpicId(): string {
    return this.epicId;
  }

  /**
   * Get the configured labels for filtering epics.
   * Used by the empty state guidance to help users understand why no epics are shown.
   */
  getConfiguredLabels(): string[] {
    return this.labels;
  }

  /**
   * Get the prompt template for the Beads tracker.
   * Reads from the co-located template.hbs file.
   */
  override getTemplate(): string {
    // Return cached template if available
    if (templateCache !== null) {
      return templateCache;
    }

    // Read template from co-located file
    const templatePath = join(__dirname, 'template.hbs');
    try {
      templateCache = readFileSync(templatePath, 'utf-8');
      return templateCache;
    } catch (err) {
      console.error(`Failed to read template from ${templatePath}:`, err);
      // Return a minimal fallback template
      return `## Task: {{taskTitle}}
{{#if taskDescription}}
{{taskDescription}}
{{/if}}

When finished, signal completion with:
<promise>COMPLETE</promise>
`;
    }
  }

  /**
   * Get PRD context for template rendering.
   * Checks current task's external_ref, falls back to parent epic.
   */
  async getPrdContext(): Promise<{
    name: string;
    description?: string;
    content: string;
    completedCount: number;
    totalCount: number;
  } | null> {
    // Need current task context - get from epicId or return null
    const epicId = this.epicId;
    if (!epicId) {
      return null;
    }

    try {
      // Get epic to find external_ref with PRD link
      const epicResult = await execBd(['show', epicId, '--json'], this.workingDir);
      if (epicResult.exitCode !== 0) {
        return null;
      }

      // bd show --json returns an array with one element
      const epics = JSON.parse(epicResult.stdout) as BeadJson[];
      if (epics.length === 0) {
        return null;
      }
      const epic = epics[0]!;
      const externalRef = epic.external_ref;

      if (!externalRef || !externalRef.startsWith('prd:')) {
        return null;
      }

      // Parse path from "prd:./path/to/file.md"
      const prdPath = externalRef.substring(4); // Remove "prd:" prefix
      const fullPath = prdPath.startsWith('/')
        ? prdPath
        : resolve(this.workingDir, prdPath);

      // Read PRD content
      const content = await readFile(fullPath, 'utf-8');

      // Get completion stats from epic children
      const childrenResult = await execBd(
        ['list', '--json', '--parent', epicId],
        this.workingDir
      );

      let completedCount = 0;
      let totalCount = 0;

      if (childrenResult.exitCode === 0) {
        const children = JSON.parse(childrenResult.stdout) as BeadJson[];
        totalCount = children.length;
        completedCount = children.filter(
          (c) => c.status === 'closed' || c.status === 'cancelled'
        ).length;
      }

      return {
        name: epic.title,
        description: epic.description,
        content,
        completedCount,
        totalCount,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Factory function for the Beads tracker plugin.
 */
const createBeadsTracker: TrackerPluginFactory = () => new BeadsTrackerPlugin();

export default createBeadsTracker;

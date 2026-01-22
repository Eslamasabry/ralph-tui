/**
 * ABOUTME: Parallel coordinator managing worktree workers and task dispatch.
 */

import type { RalphConfig } from '../../config/types.js';
import { spawn } from 'node:child_process';
import type { TrackerPlugin, TrackerTask } from '../../plugins/trackers/types.js';
import type { AgentPlugin, AgentExecutionResult } from '../../plugins/agents/types.js';
import { getAgentRegistry } from '../../plugins/agents/registry.js';
import { getTrackerRegistry } from '../../plugins/trackers/registry.js';
import { buildParallelPrompt } from './prompt.js';
import { WorktreeManager } from './worktree-manager.js';
import { ParallelWorker } from './worker.js';
import type { ParallelEvent, ParallelTaskResult, CommitMetadata } from './types.js';
import { MainSyncWorktree } from '../../git/main-sync-worktree.js';

export interface ParallelCoordinatorOptions {
  maxWorkers: number;
}

export class ParallelCoordinator {
  private config: RalphConfig;
  private tracker: TrackerPlugin | null = null;
  private worktreeManager: WorktreeManager;
  private workers: ParallelWorker[] = [];
  private listeners: Array<(event: ParallelEvent) => void> = [];
  private running = false;
  private paused = false;
  private mergeQueue: Array<{ task: TrackerTask; workerId: string; commit: string; filesChanged?: string[] }> = [];
  private merging = false;
  private pendingMergeCounts = new Map<string, number>();
  private workerBaseCommits = new Map<string, string>();
  private blockedTaskIds = new Set<string>();
  private pendingMainSyncTasks = new Map<string, { task: TrackerTask; workerId: string }>();
  private commitRecoveryAttempts = new Map<string, number>();
  private lastMainSyncAttemptAt = 0;
  private pendingMainSyncRetryCount = 0;
  private readonly maxMainSyncRetries = 10;
  private mainSyncWorktree: MainSyncWorktree | null = null;
  private mergeWorktreePath: string | null = null;
  private mergeBranch = 'parallel/integration';
  private baseBranch = 'main';
  private snapshotCreated = false;
  private snapshotTag: string | null = null;

  constructor(config: RalphConfig, options: ParallelCoordinatorOptions) {
    this.config = config;
    this.worktreeManager = new WorktreeManager({ repoRoot: config.cwd });
    this.maxWorkers = options.maxWorkers;
  }

  private maxWorkers: number;

  on(listener: (event: ParallelEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getPendingMainTaskIds(): string[] {
    return Array.from(this.pendingMainSyncTasks.keys());
  }

  private emit(event: ParallelEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  async initialize(): Promise<void> {
    const trackerRegistry = getTrackerRegistry();
    this.tracker = await trackerRegistry.getInstance(this.config.tracker);
    await this.tracker.sync();

    await this.worktreeManager.pruneWorktrees();
    this.baseBranch = await this.getCurrentBranch();
    this.mergeBranch = `parallel/integration/${this.baseBranch}`;
    await this.ensureBranchAt(this.mergeBranch, this.baseBranch);
    this.mergeWorktreePath = await this.worktreeManager.createWorktree({
      workerId: 'merge',
      branchName: this.mergeBranch,
      baseRef: this.baseBranch,
      lockReason: 'merge queue',
    });
    await this.initializeWorkers();
  }

  private async initializeWorkers(): Promise<void> {
    const agentRegistry = getAgentRegistry();
    const baseCommit = await this.resolveCommit(this.mergeBranch);

    for (let i = 0; i < this.maxWorkers; i++) {
      const workerId = `worker-${i + 1}`;
      const branchName = `worker/${workerId}/${Date.now()}`;
      const worktreePath = await this.worktreeManager.createWorktree({
        workerId,
        branchName,
        baseRef: this.mergeBranch,
        lockReason: 'parallel worker active',
      });

      const agent = await this.createAgentInstance(agentRegistry);
      const worker = new ParallelWorker(workerId, worktreePath, agent, this.config);
      this.workerBaseCommits.set(workerId, baseCommit);
      this.workers.push(worker);
    }
  }

  private async createAgentInstance(agentRegistry: ReturnType<typeof getAgentRegistry>): Promise<AgentPlugin> {
    const instance = agentRegistry.createInstance(this.config.agent.plugin);
    if (!instance) {
      throw new Error(`Unknown agent plugin: ${this.config.agent.plugin}`);
    }

    const initConfig: Record<string, unknown> = {
      ...this.config.agent.options,
      command: this.config.agent.command,
      defaultFlags: this.config.agent.defaultFlags,
      timeout: this.config.agent.timeout,
    };

    await instance.initialize(initConfig);
    return instance;
  }

  async start(): Promise<void> {
    if (!this.tracker) {
      throw new Error('Coordinator not initialized');
    }

    this.running = true;
    this.mainSyncWorktree = new MainSyncWorktree({
      repoRoot: this.config.cwd,
      mainBranch: this.baseBranch,
    });
    try {
      await this.mainSyncWorktree.create();
    } catch {
      // Ignore worktree creation failures; sync will report failures
    }
    await this.createSnapshotIfNeeded();
    this.emit({ type: 'parallel:started', timestamp: new Date().toISOString(), workerCount: this.workers.length });

    while (this.running) {
      if (this.paused) {
        await this.delay(100);
        continue;
      }
      const idleWorker = this.workers.find((worker) => !worker.isBusy());
      if (!idleWorker) {
        await this.delay(100);
        continue;
      }

      const task = await this.getNextReadyTask();
      if (!task) {
        const busyWorkers = this.workers.some((worker) => worker.isBusy());
        if (!busyWorkers) {
          await this.trySyncPendingMainTasks();
          const resetCount = await this.resetStaleInProgressTasks();
          if (resetCount > 0) {
            await this.delay(100);
            continue;
          }

          if (this.pendingMainSyncTasks.size > 0) {
            await this.delay(250);
            continue;
          }

          const hasPending = await this.hasPendingWork();
          if (!hasPending) {
            break;
          }
        }
        await this.delay(150);
        continue;
      }

      const claimed = await this.claimTask(task, idleWorker.workerId);
      if (!claimed) {
        await this.delay(50);
        continue;
      }

      if (!(await this.isTaskReady(task))) {
        await this.tracker.updateTaskStatus(task.id, 'open');
        await this.tracker.releaseTask?.(task.id, idleWorker.workerId);
        await this.delay(50);
        continue;
      }

      this.emit({ type: 'parallel:task-claimed', timestamp: new Date().toISOString(), workerId: idleWorker.workerId, task });
      void this.runTaskOnWorker(idleWorker, task);
    }

    this.emit({ type: 'parallel:stopped', timestamp: new Date().toISOString() });
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async dispose(): Promise<void> {
    this.running = false;
    const removals = this.workers.map(async (worker) => {
      await worker.dispose();
      await this.worktreeManager.removeWorktree(worker.workerId);
    });
    await Promise.all(removals);
    this.workers = [];

    if (this.mergeWorktreePath) {
      await this.worktreeManager.removeWorktree('merge');
      this.mergeWorktreePath = null;
    }

    if (this.mainSyncWorktree) {
      await this.mainSyncWorktree.cleanup();
      this.mainSyncWorktree = null;
    }
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  private async runTaskOnWorker(worker: ParallelWorker, task: TrackerTask): Promise<void> {
    if (!this.tracker) return;

    const prompt = await buildParallelPrompt(task, this.config, this.tracker, worker.worktreePath);

    this.emit({ type: 'parallel:task-started', timestamp: new Date().toISOString(), workerId: worker.workerId, task });

    const { result, completed } = await worker.executeTask(task, prompt, {
      onStdout: (data) => {
        this.emit({
          type: 'parallel:task-output',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          data,
          stream: 'stdout',
        });
      },
      onStdoutSegments: (segments) => {
        this.emit({
          type: 'parallel:task-segments',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          segments,
        });
      },
      onStderr: (data) => {
        this.emit({
          type: 'parallel:task-output',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          data,
          stream: 'stderr',
        });
      },
    });

    const taskResult: ParallelTaskResult = { task, result, completed };
    await this.handleTaskResult(taskResult, worker);

    this.emit({
      type: 'parallel:task-finished',
      timestamp: new Date().toISOString(),
      workerId: worker.workerId,
      task,
      result,
      completed,
    });

    this.emit({
      type: 'parallel:worker-idle',
      timestamp: new Date().toISOString(),
      workerId: worker.workerId,
    });
  }

  private async handleTaskResult(taskResult: ParallelTaskResult, worker: ParallelWorker): Promise<void> {
    if (!this.tracker) return;
    const workerId = worker.workerId;

    if (taskResult.completed) {
      const commits = await this.collectCommits(taskResult.task, workerId);
      if (commits.length === 0) {
        const statusLines = await this.getRepoStatusLines(worker.worktreePath);
        if (statusLines.length > 0) {
          const recovered = await this.attemptCommitRecovery(worker, taskResult.task, statusLines, taskResult.result);
          if (!recovered) {
            const fallbackCommits = await this.collectCommits(taskResult.task, workerId);
            if (fallbackCommits.length === 0) {
              await this.handleMergeFailure(
                { task: taskResult.task, workerId, commit: 'none' },
                'Uncommitted changes after completion; commit recovery failed'
              );
              return;
            }

            this.pendingMergeCounts.set(taskResult.task.id, fallbackCommits.length);
            for (const commit of fallbackCommits) {
              void this.enqueueMerge({ task: taskResult.task, workerId, commit });
            }
            this.commitRecoveryAttempts.delete(taskResult.task.id);
            return;
          }

          const retryCommits = await this.collectCommits(taskResult.task, workerId);
          if (retryCommits.length === 0) {
            const retryStatus = await this.getRepoStatusLines(worker.worktreePath);
            if (retryStatus.length > 0) {
              await this.handleMergeFailure(
                { task: taskResult.task, workerId, commit: 'none' },
                'Uncommitted changes after completion; no commit produced'
              );
              return;
            }
            await this.markMergeSuccess({ task: taskResult.task, workerId, commit: 'none' }, false, []);
            this.commitRecoveryAttempts.delete(taskResult.task.id);
            return;
          }

          this.pendingMergeCounts.set(taskResult.task.id, retryCommits.length);
          for (const commit of retryCommits) {
            void this.enqueueMerge({ task: taskResult.task, workerId, commit });
          }
          this.commitRecoveryAttempts.delete(taskResult.task.id);
          return;
        }

        await this.markMergeSuccess({ task: taskResult.task, workerId, commit: 'none' }, false, []);
        this.commitRecoveryAttempts.delete(taskResult.task.id);
        return;
      }

      this.pendingMergeCounts.set(taskResult.task.id, commits.length);
      for (const commit of commits) {
        void this.enqueueMerge({ task: taskResult.task, workerId, commit });
      }
      return;
    }

    await this.tracker.updateTaskStatus(taskResult.task.id, 'open');
    await this.tracker.releaseTask?.(taskResult.task.id, workerId);
  }

  private async getNextReadyTask(): Promise<TrackerTask | undefined> {
    if (!this.tracker) return undefined;
    const excludeIds = Array.from(this.blockedTaskIds);
    return this.tracker.getNextTask({ status: 'open', ready: true, excludeIds });
  }

  private async isTaskReady(task: TrackerTask): Promise<boolean> {
    if (!this.tracker) {
      return false;
    }

    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }

    const allTasks = await this.tracker.getTasks({ parentId: task.parentId });
    const deps = new Set(task.dependsOn);
    for (const candidate of allTasks) {
      if (!deps.has(candidate.id)) {
        continue;
      }
      if (candidate.status !== 'completed' && candidate.status !== 'cancelled') {
        return false;
      }
    }

    return true;
  }

  private async hasPendingWork(): Promise<boolean> {
    if (!this.tracker) return false;
    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress'] });
    return tasks.length > 0 || this.pendingMainSyncTasks.size > 0;
  }

  private async handleMergeFailure(
    entry: { task: TrackerTask; workerId: string; commit: string },
    reason: string,
    conflictFiles?: string[]
  ): Promise<void> {
    const commitMetadata = await this.getCommitMetadata(entry.commit, this.config.cwd);
    this.emit({
      type: 'parallel:merge-failed',
      timestamp: new Date().toISOString(),
      workerId: entry.workerId,
      task: entry.task,
      commit: entry.commit,
      commitMetadata,
      reason,
      conflictFiles,
    });

    this.pendingMergeCounts.delete(entry.task.id);
    this.mergeQueue = this.mergeQueue.filter((queued) => queued.task.id !== entry.task.id);
    this.blockedTaskIds.add(entry.task.id);

    if (this.tracker) {
      await this.tracker.updateTaskStatus(entry.task.id, 'blocked');
      await this.tracker.releaseTask?.(entry.task.id, entry.workerId);
    }
  }

  private async markMergeSuccess(
    entry: { task: TrackerTask; workerId: string; commit: string },
    resolved = false,
    filesChanged?: string[],
    conflictFiles?: string[]
  ): Promise<void> {
    const commitMetadata = await this.getCommitMetadata(entry.commit, this.config.cwd);
    this.emit({
      type: 'parallel:merge-succeeded',
      timestamp: new Date().toISOString(),
      workerId: entry.workerId,
      task: entry.task,
      commit: entry.commit,
      commitMetadata,
      resolved,
      filesChanged,
      conflictFiles,
    });

    this.blockedTaskIds.delete(entry.task.id);

    const remaining = (this.pendingMergeCounts.get(entry.task.id) ?? 1) - 1;
    if (remaining <= 0) {
      this.pendingMergeCounts.delete(entry.task.id);
    } else {
      this.pendingMergeCounts.set(entry.task.id, remaining);
    }

    if (entry.commit === 'none') {
      if (remaining <= 0) {
        await this.tracker?.completeTask(entry.task.id, 'Completed by parallel worker');
      }
      return;
    }

    const syncResult = await this.syncMainBranch();

    if (remaining <= 0) {
      if (syncResult.success) {
        await this.tracker?.completeTask(entry.task.id, 'Completed by parallel worker');
      } else {
        this.pendingMainSyncTasks.set(entry.task.id, { task: entry.task, workerId: entry.workerId });
        this.blockedTaskIds.add(entry.task.id);
        await this.tracker?.updateTaskStatus(entry.task.id, 'blocked');
        await this.tracker?.releaseTask?.(entry.task.id, entry.workerId);
        this.emit({
          type: 'parallel:main-sync-failed',
          timestamp: new Date().toISOString(),
          task: entry.task,
          reason: syncResult.reason ?? 'Main sync failed',
        });
        // Mark as pending-main in tracker (if supported)
        if (this.tracker && 'markTaskPendingMain' in this.tracker && typeof this.tracker.markTaskPendingMain === 'function') {
          const pendingCount = this.pendingMergeCounts.get(entry.task.id) ?? 1;
          await this.tracker.markTaskPendingMain(entry.task.id, pendingCount, [entry.commit]);
        }
      }
    }
  }

  private async syncMainBranch(): Promise<{ success: boolean; reason?: string; commit?: string }> {
    if (!this.mainSyncWorktree) {
      return { success: false, reason: 'Main sync worktree unavailable.' };
    }

    const integrationCommit = await this.resolveCommit(this.mergeBranch);
    const syncResult = await this.mainSyncWorktree.fastForwardTo(integrationCommit);
    if (!syncResult.success) {
      const reason = syncResult.error ?? 'Main sync failed';
      this.emit({
        type: 'parallel:main-sync-skipped',
        timestamp: new Date().toISOString(),
        reason,
      });
      return { success: false, reason };
    }

    // Now update the repo root main ref to match integration
    const rootResult = await this.fastForwardRootMain(integrationCommit);
    if (!rootResult.success) {
      const reason = rootResult.reason ?? 'Failed to update main ref';
      this.emit({
        type: 'parallel:main-sync-skipped',
        timestamp: new Date().toISOString(),
        reason,
      });
      return { success: false, reason };
    }

    const head = await this.execGitIn(this.config.cwd, ['rev-parse', 'HEAD']);
    if (head.exitCode === 0) {
      this.emit({
        type: 'parallel:main-sync-succeeded',
        timestamp: new Date().toISOString(),
        commit: head.stdout.trim(),
      });
      await this.completePendingMainSyncTasks();
      return { success: true, commit: head.stdout.trim() };
    }

    return { success: false, reason: 'Unable to resolve main HEAD after sync.' };
  }

  private async trySyncPendingMainTasks(): Promise<void> {
    if (this.pendingMainSyncTasks.size === 0) {
      // Reset retry count when no pending tasks
      this.pendingMainSyncRetryCount = 0;
      return;
    }

    const now = Date.now();
    // Calculate exponential backoff: start at 2s, double each retry, cap at 30s
    const baseDelayMs = 2000;
    const maxDelayMs = 30000;
    const backoffMs = Math.min(baseDelayMs * Math.pow(2, this.pendingMainSyncRetryCount), maxDelayMs);

    // Rate limit sync attempts based on backoff
    if (now - this.lastMainSyncAttemptAt < backoffMs) {
      return;
    }

    this.lastMainSyncAttemptAt = now;

    // Increment retry count (will be reset on success)
    this.pendingMainSyncRetryCount++;

    const result = await this.syncMainBranch();

    if (result.success) {
      // Reset retry count on success
      this.pendingMainSyncRetryCount = 0;
      await this.completePendingMainSyncTasks();
    } else if (this.pendingMainSyncRetryCount <= this.maxMainSyncRetries) {
      // Emit retrying event with backoff info
      const nextDelayMs = Math.min(
        baseDelayMs * Math.pow(2, this.pendingMainSyncRetryCount),
        maxDelayMs
      );
      this.emit({
        type: 'parallel:main-sync-retrying',
        timestamp: new Date().toISOString(),
        retryAttempt: this.pendingMainSyncRetryCount,
        maxRetries: this.maxMainSyncRetries,
        reason: result.reason ?? 'Unknown sync failure',
        delayMs: nextDelayMs,
      });
    } else {
      // Max retries reached - emit alert
      const affectedTaskCount = this.pendingMainSyncTasks.size;
      this.emit({
        type: 'parallel:main-sync-alert',
        timestamp: new Date().toISOString(),
        retryAttempt: this.pendingMainSyncRetryCount,
        maxRetries: this.maxMainSyncRetries,
        reason: result.reason ?? 'Unknown sync failure',
        affectedTaskCount,
      });
    }
  }

  private async completePendingMainSyncTasks(): Promise<void> {
    if (!this.tracker || this.pendingMainSyncTasks.size === 0) {
      return;
    }

    for (const [taskId, entry] of this.pendingMainSyncTasks) {
      // Clear the pending-main status in the tracker (if supported)
      if ('clearPendingMain' in this.tracker && typeof this.tracker.clearPendingMain === 'function') {
        await this.tracker.clearPendingMain(taskId, 'Commits merged to main');
      }
      await this.tracker.completeTask(taskId, 'Completed after main sync');
      await this.tracker.releaseTask?.(taskId, entry.workerId);
      this.blockedTaskIds.delete(taskId);
    }

    this.pendingMainSyncTasks.clear();
  }

  private async fastForwardRootMain(commit: string): Promise<{ success: boolean; reason?: string }> {
    const currentBranch = await this.getCurrentBranch();

    // If main is not checked out here, update the ref directly
    if (currentBranch !== this.baseBranch) {
      const updateRef = await this.execGitIn(this.config.cwd, [
        'update-ref',
        `refs/heads/${this.baseBranch}`,
        commit,
      ]);
      if (updateRef.exitCode !== 0) {
        return { success: false, reason: updateRef.stderr.trim() || 'Failed to update main ref' };
      }
      return { success: true };
    }

    const clean = await this.isRepoClean(this.config.cwd);
    if (clean) {
      const result = await this.execGitIn(this.config.cwd, ['merge', '--ff-only', commit]);
      if (result.exitCode !== 0) {
        return { success: false, reason: result.stderr.trim() || 'merge --ff-only failed' };
      }
      return { success: true };
    }

    // Dirty main - attempt safe stash + fast-forward + apply
    const stashName = `ralph-main-sync-${Date.now()}`;
    const stashResult = await this.execGitIn(this.config.cwd, ['stash', 'push', '-u', '-m', stashName]);
    if (stashResult.exitCode !== 0) {
      return { success: false, reason: stashResult.stderr.trim() || 'Failed to stash working tree' };
    }

    const stashRefResult = await this.execGitIn(this.config.cwd, ['stash', 'list', '-n', '1', '--format=%gd']);
    const stashRef = stashRefResult.exitCode === 0 ? stashRefResult.stdout.trim() : '';

    const mergeResult = await this.execGitIn(this.config.cwd, ['merge', '--ff-only', commit]);
    if (mergeResult.exitCode !== 0) {
      if (stashRef) {
        await this.execGitIn(this.config.cwd, ['stash', 'apply', stashRef]);
      }
      return { success: false, reason: mergeResult.stderr.trim() || 'merge --ff-only failed' };
    }

    if (stashRef) {
      const applyResult = await this.execGitIn(this.config.cwd, ['stash', 'apply', stashRef]);
      if (applyResult.exitCode === 0) {
        await this.execGitIn(this.config.cwd, ['stash', 'drop', stashRef]);
      } else {
        const affectedTaskCount = this.pendingMainSyncTasks.size;
        this.emit({
          type: 'parallel:main-sync-alert',
          timestamp: new Date().toISOString(),
          retryAttempt: this.pendingMainSyncRetryCount,
          maxRetries: this.maxMainSyncRetries,
          reason: applyResult.stderr.trim() || 'Stash apply failed after main sync',
          affectedTaskCount,
        });
      }
    }

    return { success: true };
  }

  private async getCommitFiles(commit: string, repoPath: string): Promise<string[]> {
    const result = await this.execGitIn(repoPath, ['diff-tree', '--no-commit-id', '--name-only', '-r', commit]);
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  /**
   * Get detailed commit metadata using git log with format options.
   * Falls back to basic info if full metadata unavailable.
   */
  private async getCommitMetadata(commit: string, repoPath: string): Promise<CommitMetadata> {
    // Use git log with format strings for detailed commit info
    const formatArgs = [
      commit,
      '--format=',
      '%H%n%h%n%s%n%B%n%an%n%ae%n%ad%n%cn%n%ce%n%cd%n%P%n%T',
    ];

    const result = await this.execGitIn(repoPath, ['log', ...formatArgs]);

    if (result.exitCode !== 0 || !result.stdout.trim()) {
      // Fallback: return basic info from diff-tree
      const filesResult = await this.execGitIn(repoPath, ['diff-tree', '--no-commit-id', '-r', '--stat', commit]);
      const fileNames = await this.getCommitFiles(commit, repoPath);

      const statMatch = filesResult.stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      const filesChanged = statMatch ? parseInt(statMatch[1] || '0', 10) : fileNames.length;
      const insertions = statMatch ? parseInt(statMatch[2] || '0', 10) : 0;
      const deletions = statMatch ? parseInt(statMatch[3] || '0', 10) : 0;

      return {
        hash: commit,
        shortHash: commit.slice(0, 7),
        message: '',
        fullMessage: '',
        authorName: '',
        authorEmail: '',
        authorDate: '',
        committerName: '',
        committerEmail: '',
        committerDate: '',
        filesChanged,
        insertions,
        deletions,
        fileNames,
        parents: [],
        treeHash: '',
      };
    }

    const lines = result.stdout.split('\n').filter((line) => line.trim() !== '');

    // Parse the output based on the format:
    // Line 0: full hash
    // Line 1: short hash
    // Line 2: subject (first line of message)
    // Line 3+: body (full message)
    // Then: author name, author email, author date, committer name, committer email, committer date, parents, tree hash

    let idx = 0;
    const fullHash = lines[idx++] || commit;
    const shortHash = lines[idx++] || commit.slice(0, 7);

    // Collect full message (subject + body)
    const messageLines: string[] = [];
    while (idx < lines.length && !lines[idx].includes('@')) {
      messageLines.push(lines[idx]);
      idx++;
    }

    const fullMessage = messageLines.join('\n').trim();
    const message = messageLines[0] || '';

    const authorName = lines[idx++] || '';
    const authorEmail = lines[idx++] || '';
    const authorDate = lines[idx++] || '';
    const committerName = lines[idx++] || '';
    const committerEmail = lines[idx++] || '';
    const committerDate = lines[idx++] || '';

    // Parents and tree hash (may be empty)
    const parents = idx < lines.length && lines[idx] ? lines[idx].split(' ') : [];
    idx++;
    const treeHash = idx < lines.length && lines[idx] ? lines[idx] : '';

    // Get file statistics
    const statResult = await this.execGitIn(repoPath, ['diff-tree', '--no-commit-id', '-r', '--stat', commit]);
    const statMatch = statResult.stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    const filesChanged = statMatch ? parseInt(statMatch[1] || '0', 10) : 0;
    const insertions = statMatch ? parseInt(statMatch[2] || '0', 10) : 0;
    const deletions = statMatch ? parseInt(statMatch[3] || '0', 10) : 0;

    // Get file names
    const fileNames = await this.getCommitFiles(commit, repoPath);

    return {
      hash: fullHash,
      shortHash,
      message,
      fullMessage,
      authorName,
      authorEmail,
      authorDate,
      committerName,
      committerEmail,
      committerDate,
      filesChanged,
      insertions,
      deletions,
      fileNames,
      parents,
      treeHash,
    };
  }

  private isEmptyCherryPick(result: { stdout: string; stderr: string }): boolean {
    const message = `${result.stdout}\n${result.stderr}`.toLowerCase();
    return message.includes('cherry-pick is now empty') || message.includes('previous cherry-pick is now empty');
  }
  private async resetStaleInProgressTasks(): Promise<number> {
    if (!this.tracker) return 0;
    const tasks = await this.tracker.getTasks({ status: 'in_progress' });
    if (tasks.length === 0) return 0;

    let resetCount = 0;
    for (const task of tasks) {
      try {
        await this.tracker.updateTaskStatus(task.id, 'open');
        await this.tracker.releaseTask?.(task.id, 'stale');
        resetCount += 1;
      } catch {
        // ignore individual failures
      }
    }

    if (resetCount > 0) {
      console.warn(`Reset ${resetCount} stale in_progress task(s) to open.`);
    }

    return resetCount;
  }

  private async ensureBranchAt(branchName: string, ref: string): Promise<void> {
    await this.execGitIn(this.config.cwd, ['branch', '-f', branchName, ref]);
  }

  private async createSnapshotIfNeeded(): Promise<void> {
    if (this.snapshotCreated) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBranch = this.baseBranch.replace(/[^\w.-]/g, '_');
    const tagName = `parallel-snapshot-${safeBranch}-${timestamp}`;
    const commit = await this.resolveCommit(this.baseBranch);

    const result = await this.execGitIn(this.config.cwd, [
      'tag',
      '-a',
      tagName,
      '-m',
      `Parallel snapshot before run (${this.baseBranch})`,
      commit,
    ]);

    if (result.exitCode !== 0) {
      console.warn(`Snapshot tag failed: ${result.stderr.trim() || tagName}`);
      return;
    }

    this.snapshotCreated = true;
    this.snapshotTag = tagName;
    console.log(`Snapshot created: ${tagName} (${commit.slice(0, 7)})`);
  }

  getSnapshotTag(): string | null {
    return this.snapshotTag;
  }

  private async getCurrentBranch(): Promise<string> {
    const result = await this.execGitIn(this.config.cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = result.stdout.trim();
    return branch.length > 0 ? branch : 'main';
  }

  private async enqueueMerge(entry: { task: TrackerTask; workerId: string; commit: string }): Promise<void> {
    const filesChanged = await this.getCommitFiles(entry.commit, this.config.cwd);
    const commitMetadata = await this.getCommitMetadata(entry.commit, this.config.cwd);
    const queuedEntry = { ...entry, filesChanged };
    this.mergeQueue.push(queuedEntry);
    this.emit({
      type: 'parallel:merge-queued',
      timestamp: new Date().toISOString(),
      workerId: entry.workerId,
      task: entry.task,
      commit: entry.commit,
      commitMetadata,
      filesChanged,
    });
    void this.processMergeQueue();
  }

  private async processMergeQueue(): Promise<void> {
    if (this.merging) return;
    this.merging = true;

    while (this.mergeQueue.length > 0) {
      const entry = this.mergeQueue.shift();
      if (!entry) break;

      const mergePath = this.mergeWorktreePath ?? this.config.cwd;

      try {
        const clean = await this.isRepoClean(mergePath);
        if (!clean) {
          const reason = 'Merge worktree has uncommitted changes. Resolve before merge.';
          await this.handleMergeFailure(entry, reason);
          continue;
        }

        const filesChanged = entry.filesChanged ?? (await this.getCommitFiles(entry.commit, mergePath));
        const result = await this.execGitIn(mergePath, ['cherry-pick', entry.commit]);
        if (result.exitCode !== 0) {
          if (this.isEmptyCherryPick(result)) {
            const skipResult = await this.execGitIn(mergePath, ['cherry-pick', '--skip']);
            if (skipResult.exitCode !== 0) {
              await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
            }
            await this.markMergeSuccess(entry, false, filesChanged);
            continue;
          }

          await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
          const resolved = await this.attemptMergeResolution(entry);
          if (!resolved.success || !resolved.commit) {
            const stderr = result.stderr.trim();
            const reason = resolved.reason ?? (stderr || 'Cherry-pick failed');
            await this.handleMergeFailure(entry, reason, resolved.conflictFiles);
            continue;
          }

          const resolvedResult = await this.execGitIn(mergePath, ['cherry-pick', resolved.commit]);
          if (resolvedResult.exitCode !== 0) {
            if (this.isEmptyCherryPick(resolvedResult)) {
              const skipResult = await this.execGitIn(mergePath, ['cherry-pick', '--skip']);
              if (skipResult.exitCode !== 0) {
                await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
              }
              await this.markMergeSuccess({ ...entry, commit: resolved.commit }, false, filesChanged, resolved.conflictFiles);
              continue;
            }

            await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
            const reason = resolvedResult.stderr.trim() || 'Cherry-pick failed after auto-resolve';
            await this.handleMergeFailure({ ...entry, commit: resolved.commit }, reason, resolved.conflictFiles);
            continue;
          }

          const resolvedFiles = await this.getCommitFiles(resolved.commit, mergePath);
          const mergedFiles = resolvedFiles.length > 0 ? resolvedFiles : filesChanged;
          await this.markMergeSuccess({ ...entry, commit: resolved.commit }, true, mergedFiles, resolved.conflictFiles);
          continue;
        }

        await this.markMergeSuccess(entry, false, filesChanged);
      } finally {
        // no-op
      }
    }

    this.merging = false;
  }

  private async collectCommits(task: TrackerTask, workerId: string): Promise<string[]> {
    const worker = this.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) return [];

    const worktreePath = worker.worktreePath;
    const status = await this.execGitIn(worktreePath, ['status', '--porcelain']);
    const relevant = this.filterStatusLines(status.stdout);
    if (relevant.length > 0) {
      await this.execGitIn(worktreePath, ['add', '-A']);
      await this.execGitIn(worktreePath, ['reset', '--', '.beads', '.ralph-tui', 'worktrees']);
      const staged = await this.execGitIn(worktreePath, ['diff', '--name-only', '--cached']);
      if (staged.stdout.trim().length > 0) {
        const message = this.buildCommitMessage(task);
        await this.execGitIn(worktreePath, ['commit', '-m', message]);
      }
    }

    const baseCommit = this.workerBaseCommits.get(workerId) ?? (await this.resolveCommit('HEAD'));
    const revList = await this.execGitIn(worktreePath, ['rev-list', '--reverse', `${baseCommit}..HEAD`]);
    const commits = revList.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
    if (headCommit.exitCode === 0) {
      this.workerBaseCommits.set(workerId, headCommit.stdout.trim());
    }
    return commits;
  }

  private async attemptMergeResolution(entry: { task: TrackerTask; workerId: string; commit: string }): Promise<{ success: boolean; commit?: string; reason?: string; conflictFiles?: string[] }> {
    const mergeWorkerId = `merge-${entry.workerId}-${Date.now()}`;
    const branchName = `merge/${entry.task.id}/${Date.now()}`;
    const worktreePath = await this.worktreeManager.createWorktree({
      workerId: mergeWorkerId,
      branchName,
      baseRef: this.mergeBranch,
      lockReason: 'merge resolution',
    });

    try {
      const cherryResult = await this.execGitIn(worktreePath, ['cherry-pick', entry.commit]);
      if (cherryResult.exitCode === 0) {
        const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
        return { success: true, commit: headCommit.stdout.trim() };
      }

      const conflicts = await this.execGitIn(worktreePath, ['diff', '--name-only', '--diff-filter=U']);
      const conflictFiles = conflicts.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      const prompt = this.buildMergePrompt(entry.task, entry.commit, conflicts.stdout.trim());

      const agentRegistry = getAgentRegistry();
      const agent = await this.createAgentInstance(agentRegistry);
      const resolver = new ParallelWorker(mergeWorkerId, worktreePath, agent, this.config);
      const result = await resolver.executeTask(entry.task, prompt);
      await resolver.dispose();

      if (!result.completed) {
        return { success: false, reason: 'Merge resolution agent did not complete', conflictFiles };
      }

      const unresolved = await this.execGitIn(worktreePath, ['diff', '--name-only', '--diff-filter=U']);
      if (unresolved.stdout.trim().length > 0) {
        return { success: false, reason: 'Conflicts remain after auto-resolve', conflictFiles };
      }

      await this.execGitIn(worktreePath, ['add', '-A']);
      const continueResult = await this.execGitIn(worktreePath, ['cherry-pick', '--continue']);
      if (continueResult.exitCode !== 0) {
        const cherryHead = await this.execGitIn(worktreePath, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']);
        if (cherryHead.exitCode === 0) {
          return { success: false, reason: continueResult.stderr.trim() || 'Cherry-pick continue failed' };
        }
      }

      const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
      return { success: true, commit: headCommit.stdout.trim(), conflictFiles };
    } catch (error) {
      return { success: false, reason: error instanceof Error ? error.message : 'Merge resolution failed', conflictFiles: [] };
    } finally {
      await this.worktreeManager.removeWorktree(mergeWorkerId).catch((err) => {
        // Log worktree cleanup errors - orphaned worktrees can accumulate
        console.warn(`[ParallelCoordinator] Failed to remove merge worktree ${mergeWorkerId}: ${err instanceof Error ? err.message : 'unknown error'}`);
      });
    }
  }

  private buildMergePrompt(task: TrackerTask, commit: string, conflictFiles: string): string {
    const files = conflictFiles ? conflictFiles.split('\n').filter(Boolean).map((file) => `- ${file}`) : [];
    return [
      `## Merge Conflict Resolution`,
      `Task: ${task.id} - ${task.title}`,
      `Commit: ${commit}`,
      '',
      'Conflicting files:',
      files.length > 0 ? files.join('\n') : '- (unknown)',
      '',
      '## Instructions',
      '- Resolve merge conflicts in the listed files.',
      '- Do NOT refactor unrelated code.',
      '- Do NOT switch branches (no `git checkout main`).',
      '- Do NOT run tests or lint unless explicitly asked.',
      '- After resolving, run: git add -A',
      '- Then run: git cherry-pick --continue',
      '- If cherry-pick already completed, ensure changes are committed.',
      '',
      'When done, output: <promise>COMPLETE</promise>',
    ].join('\n');
  }

  private formatOutputTail(output: string, maxLines = 20, maxChars = 2000): string {
    if (!output.trim()) {
      return '(no output)';
    }

    const lines = output.trimEnd().split('\n');
    const tailLines = lines.slice(-maxLines);
    let tail = tailLines.join('\n');
    if (tail.length > maxChars) {
      tail = tail.slice(-maxChars);
    }
    return tail;
  }

  private async buildRecoveryPrompt(
    task: TrackerTask,
    statusLines: string[],
    lastResult: AgentExecutionResult,
    worktreePath: string
  ): Promise<string> {
    const basePrompt = await buildParallelPrompt(task, this.config, this.tracker ?? undefined, worktreePath);
    const files = statusLines.map((line) => `- ${line}`);
    const stdoutTail = this.formatOutputTail(lastResult.stdout);

    return [
      basePrompt,
      '',
      '## Recovery Context',
      '- Previous iteration reported <promise>COMPLETE</promise> but there are uncommitted changes and no commits.',
      '',
      'Changed files (git status --porcelain):',
      files.length > 0 ? files.join('\n') : '- (none)',
      '',
      'Last iteration stdout (tail):',
      '```',
      stdoutTail,
      '```',
      '',
      '## Recovery Instructions',
      '- Continue the task. Verify all requirements are complete (not just files already touched).',
      '- If anything is missing, finish it before committing.',
      `- Commit message: "${this.buildCommitMessage(task)}"`,
      '- If no changes are needed, revert to a clean working tree (no commit).',
      '- You may append to `.ralph-tui/progress.md` for local context, but do NOT stage or commit it.',
      '- Do NOT run `git add .` or `git add -A`. Stage only relevant task files.',
      '- Do NOT merge, rebase, or push.',
      '- Do NOT switch branches (no `git checkout main`).',
      '- Do NOT run tests or lint unless explicitly asked.',
      '',
      'When done, output: <promise>COMPLETE</promise>',
    ].join('\n');
  }

  private async attemptCommitRecovery(
    worker: ParallelWorker,
    task: TrackerTask,
    statusLines: string[],
    lastResult: AgentExecutionResult
  ): Promise<boolean> {
    const attempts = this.commitRecoveryAttempts.get(task.id) ?? 0;
    if (attempts >= 1) {
      return false;
    }

    this.commitRecoveryAttempts.set(task.id, attempts + 1);

    const prompt = await this.buildRecoveryPrompt(task, statusLines, lastResult, worker.worktreePath);
    const { completed } = await worker.executeTask(task, prompt, {
      onStdout: (data) => {
        this.emit({
          type: 'parallel:task-output',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          data,
          stream: 'stdout',
        });
      },
      onStderr: (data) => {
        this.emit({
          type: 'parallel:task-output',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          data,
          stream: 'stderr',
        });
      },
      onStdoutSegments: (segments) => {
        this.emit({
          type: 'parallel:task-segments',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          segments,
        });
      },
    });

    return completed;
  }

  private buildCommitMessage(task: TrackerTask): string {
    const title = task.title.replace(/\s+/g, ' ').trim();
    const truncated = title.length > 60 ? `${title.slice(0, 57)}...` : title;
    return `${task.id}: ${truncated}`;
  }

  private async isRepoClean(repoPath: string): Promise<boolean> {
    const statusLines = await this.getRepoStatusLines(repoPath);
    return statusLines.length === 0;
  }

  private async getRepoStatusLines(repoPath: string): Promise<string[]> {
    const status = await this.execGitIn(repoPath, ['status', '--porcelain']);
    return this.filterStatusLines(status.stdout);
  }

  private filterStatusLines(statusOutput: string): string[] {
    return statusOutput
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => {
        const path = line.slice(3).trim();
        return !(
          path.startsWith('.beads/') ||
          path.startsWith('.ralph-tui/') ||
          path.startsWith('worktrees/')
        );
      });
  }

  private async resolveCommit(ref: string): Promise<string> {
    const result = await this.execGitIn(this.config.cwd, ['rev-parse', ref]);
    return result.stdout.trim();
  }

  private execGitIn(path: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['-C', path, ...args], {
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

      proc.on('close', (code: number | null) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err: Error) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
  }

  private async claimTask(task: TrackerTask, workerId: string): Promise<boolean> {
    if (!this.tracker) return false;

    if (this.tracker.claimTask) {
      return this.tracker.claimTask(task.id, workerId);
    }

    const updated = await this.tracker.updateTaskStatus(task.id, 'in_progress');
    return Boolean(updated);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

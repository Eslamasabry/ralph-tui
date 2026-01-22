/**
 * ABOUTME: Reconciliation logic for verifying closed tasks are merged to main branch.
 * On startup/resume, checks if completed tasks have their commits on main.
 * Reopens tasks or logs issues if commits are not reachable from main.
 */

import { spawn } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { TrackerPlugin } from '../plugins/trackers/types.js';

/**
 * Result of checking if a commit is reachable from a branch
 */
interface CommitReachabilityResult {
  /** Whether the commit is reachable from the branch */
  isReachable: boolean;
  /** The commit hash if found, or the input commit if not */
  commit?: string;
}

/**
 * Check if a commit is reachable from a given branch (e.g., main).
 * Uses git merge-base --is-ancestor to check ancestry.
 */
async function isCommitReachableFromBranch(
  repoPath: string,
  commit: string,
  branch: string = 'main'
): Promise<CommitReachabilityResult> {
  // First, resolve the commit to a full hash if possible
  const resolveResult = await execGit(repoPath, ['rev-parse', commit]);
  if (resolveResult.exitCode !== 0) {
    return { isReachable: false };
  }
  const resolvedCommit = resolveResult.stdout.trim();

  // Check if this commit is an ancestor of the branch tip
  // git merge-base --is-ancestor A B returns 0 if A is ancestor of B, 1 otherwise
  const ancestorResult = await execGit(repoPath, ['merge-base', '--is-ancestor', resolvedCommit, branch]);
  const isReachable = ancestorResult.exitCode === 0;

  return { isReachable, commit: resolvedCommit };
}

/**
 * Execute a git command and return the result.
 */
async function execGit(
  repoPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, {
      cwd: repoPath,
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

    proc.on('close', (code: number) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err: Error) => {
      stderr += err.message;
      resolve({ stdout, stderr, exitCode: 1 });
    });
  });
}

/**
 * Get the current main branch name from git config.
 * Falls back to 'main' if not configured or on error.
 */
async function getMainBranchName(repoPath: string): Promise<string> {
  // Get current branch from HEAD
  const branchResult = await execGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);

  if (branchResult.exitCode === 0 && branchResult.stdout.trim()) {
    return branchResult.stdout.trim();
  }

  // Check common default branch names
  for (const branch of ['main', 'master', 'develop']) {
    const checkResult = await execGit(repoPath, ['rev-parse', '--verify', '--quiet', branch]);
    if (checkResult.exitCode === 0) {
      return branch;
    }
  }

  return 'main';
}

/**
 * Get commits associated with a task from the git history.
 * Looks for commits with the task ID in the message.
 */
async function getTaskCommits(
  repoPath: string,
  taskId: string
): Promise<string[]> {
  // Search git log for commits mentioning this task ID
  const result = await execGit(repoPath, [
    'log',
    '--all',
    '--format=%H',
    `--grep=${taskId}`,
    '--no-walk',
  ]);

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout.trim().split('\n').filter(Boolean);
}

/**
 * Reconciliation action types
 */
export type ReconciliationAction =
  | { type: 'verified'; taskId: string; commit: string }
  | { type: 'reopened'; taskId: string; reason: string }
  | { type: 'skipped'; taskId: string; reason: string }
  | { type: 'error'; taskId: string; error: string };

/**
 * Result of the reconciliation process
 */
export interface ReconciliationResult {
  /** Total closed tasks checked */
  totalChecked: number;
  /** Tasks verified as merged to main */
  verifiedCount: number;
  /** Tasks that were reopened */
  reopenedCount: number;
  /** Tasks that were skipped (e.g., no commits found) */
  skippedCount: number;
  /** Tasks with errors during reconciliation */
  errorCount: number;
  /** Details of each action taken */
  actions: ReconciliationAction[];
  /** Any errors encountered during the reconciliation process */
  processErrors: string[];
}

/**
 * Reconcile closed tasks against the main branch.
 * For each closed task:
 * 1. Find associated commits (by task ID in message)
 * 2. Check if commits are reachable from main
 * 3. If not reachable, reopen the task
 * 4. Log all actions
 *
 * @param repoPath - Repository path to check
 * @param tracker - Tracker plugin instance
 * @param options - Reconciliation options
 * @returns Reconciliation result with details
 */
export async function reconcileClosedTasks(
  repoPath: string,
  tracker: TrackerPlugin,
  options: {
    /** Whether to actually reopen tasks (false = dry run) */
    shouldReopen?: boolean;
    /** Custom main branch name (auto-detected if not provided) */
    mainBranch?: string;
    /** Callback for each action taken */
    onAction?: (action: ReconciliationAction) => void;
  } = {}
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    totalChecked: 0,
    verifiedCount: 0,
    reopenedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    actions: [],
    processErrors: [],
  };

  const mainBranch = options.mainBranch ?? await getMainBranchName(repoPath);

  // Get all completed/closed tasks from the tracker
  const closedTasks = await tracker.getTasks({ status: ['completed'] });

  if (closedTasks.length === 0) {
    return result;
  }

  result.totalChecked = closedTasks.length;

  for (const task of closedTasks) {
    try {
      // Find commits associated with this task
      const commits = await getTaskCommits(repoPath, task.id);

      if (commits.length === 0) {
        // No commits found - skip this task
        const action: ReconciliationAction = {
          type: 'skipped',
          taskId: task.id,
          reason: 'No commits found with task ID',
        };
        result.actions.push(action);
        result.skippedCount++;
        options.onAction?.(action);
        continue;
      }

      // Check if any commit is reachable from main
      let verified = false;
      let reachableCommit: string | undefined;

      for (const commit of commits) {
        const reachability = await isCommitReachableFromBranch(repoPath, commit, mainBranch);
        if (reachability.isReachable) {
          verified = true;
          reachableCommit = reachability.commit;
          break;
        }
      }

      if (verified) {
        // Task is verified - commit is on main
        const action: ReconciliationAction = {
          type: 'verified',
          taskId: task.id,
          commit: reachableCommit!,
        };
        result.actions.push(action);
        result.verifiedCount++;
        options.onAction?.(action);
      } else if (options.shouldReopen) {
        // Commit not on main - reopen the task
        await tracker.updateTaskStatus(task.id, 'open');
        const action: ReconciliationAction = {
          type: 'reopened',
          taskId: task.id,
          reason: `Commit(s) ${commits.slice(0, 3).join(', ')}${commits.length > 3 ? '...' : ''} not reachable from ${mainBranch}`,
        };
        result.actions.push(action);
        result.reopenedCount++;
        options.onAction?.(action);
      } else {
        // Would reopen but dry run mode
        const action: ReconciliationAction = {
          type: 'skipped',
          taskId: task.id,
          reason: `Would reopen - commits not on ${mainBranch} (dry run)`,
        };
        result.actions.push(action);
        result.skippedCount++;
        options.onAction?.(action);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const action: ReconciliationAction = {
        type: 'error',
        taskId: task.id,
        error: errorMessage,
      };
      result.actions.push(action);
      result.errorCount++;
      options.onAction?.(action);
    }
  }

  return result;
}

/**
 * Generate a human-readable reconciliation report.
 */
export function formatReconciliationReport(
  result: ReconciliationResult,
  options: {
    mainBranch?: string;
    verbose?: boolean;
  } = {}
): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('              TASK RECONCILIATION REPORT                       ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Total Closed Tasks Checked: ${result.totalChecked}`);
  lines.push(`Verified on ${options.mainBranch ?? 'main'}:    ${result.verifiedCount}`);
  lines.push(`Reopened:                  ${result.reopenedCount}`);
  lines.push(`Skipped:                   ${result.skippedCount}`);
  lines.push(`Errors:                    ${result.errorCount}`);
  lines.push('');

  if (result.processErrors.length > 0) {
    lines.push('Process Errors:');
    for (const error of result.processErrors) {
      lines.push(`  - ${error}`);
    }
    lines.push('');
  }

  if (options.verbose) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('                         DETAILS                              ');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');

    for (const action of result.actions) {
      switch (action.type) {
        case 'verified':
          lines.push(`✓ ${action.taskId}: Verified on main (${action.commit?.slice(0, 7)})`);
          break;
        case 'reopened':
          lines.push(`⟳ ${action.taskId}: Reopened - ${action.reason}`);
          break;
        case 'skipped':
          lines.push(`⊘ ${action.taskId}: Skipped - ${action.reason}`);
          break;
        case 'error':
          lines.push(`✗ ${action.taskId}: Error - ${action.error}`);
          break;
      }
    }
    lines.push('');
  }

  if (result.reopenedCount > 0) {
    lines.push('⚠️  Some tasks were reopened because their commits were not');
    lines.push('    found on the main branch. These tasks need to be completed');
    lines.push('    and merged before the session can be considered complete.');
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Log reconciliation result to console and optionally to a file.
 */
export async function logReconciliationResult(
  result: ReconciliationResult,
  options: {
    mainBranch?: string;
    verbose?: boolean;
    cwd?: string;
  } = {}
): Promise<void> {
  const report = formatReconciliationReport(result, {
    mainBranch: options.mainBranch,
    verbose: options.verbose,
  });

  // Log to console
  console.log('');
  console.log(report);

  // Log summary to stderr for headless mode (so it doesn't interfere with structured logs)
  console.error(`[reconciliation] Checked: ${result.totalChecked}, Verified: ${result.verifiedCount}, Reopened: ${result.reopenedCount}, Skipped: ${result.skippedCount}, Errors: ${result.errorCount}`);

  const cwd = options.cwd ?? process.cwd();
  const logTargets = [
    join(cwd, '.ralph-tui', 'logs', 'reconciliation.log'),
    join(cwd, 'logs', 'reconciliation.log'),
  ];

  for (const logPath of logTargets) {
    try {
      await mkdir(dirname(logPath), { recursive: true });
      await appendFile(logPath, `${report}\n`);
    } catch {
      // Ignore logging failures
    }
  }
}

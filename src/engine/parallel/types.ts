/**
  * ABOUTME: Types for parallel execution with worktree workers.
  */

import type { TrackerTask } from '../../plugins/trackers/types.js';
import type { AgentExecutionResult } from '../../plugins/agents/types.js';
import type { FormattedSegment } from '../../plugins/agents/output-formatting.js';
import type { TaskImpactObserved, ValidationPlan, ValidationStatus } from '../types.js';

/**
 * Health status of a worktree based on its state.
 */
export type WorktreeHealthStatus = 'active' | 'locked' | 'stale' | 'prunable';

/**
 * Summary of worktree health counts for dashboard display.
 */
export interface WorktreeHealthSummary {
  /** Total number of worktrees */
  total: number;
  /** Number of active (unlocked) worktrees */
  active: number;
  /** Number of locked worktrees */
  locked: number;
  /** Number of stale worktrees (on old commits) */
  stale: number;
  /** Number of prunable worktrees (already removed from disk) */
  prunable: number;
}

/**
 * Detailed information about a single worktree.
 */
export interface WorktreeInfo {
  /** Worktree path */
  path: string;
  /** Branch name */
  branch: string;
  /** Commit hash */
  commit: string;
  /** Whether the worktree is locked */
  locked: boolean;
  /** Lock reason if locked */
  lockReason?: string;
  /** Current health status */
  status: WorktreeHealthStatus;
}

/**
 * Worktree status with computed health information.
 */
export interface WorktreeStatus {
  /** Full path to worktree */
  path: string;
  /** Relative path from repo root */
  relativePath: string;
  /** Commit hash */
  commit: string;
  /** Branch name */
  branch: string;
  /** Whether the worktree is locked */
  locked: boolean;
  /** Lock reason if locked */
  lockReason?: string;
  /** Prunable reason if prunable */
  prunableReason?: string;
  /** Current health status */
  status: WorktreeHealthStatus;
  /** Whether the worktree is bare */
  bare?: boolean;
}

/**
 * Commit metadata captured for merge events.
 * Provides detailed information about commits being merged.
 */
export interface CommitMetadata {
  /** Full commit hash */
  hash: string;
  /** Abbreviated commit hash (first 7 characters) */
  shortHash: string;
  /** Commit message (first line) */
  message: string;
  /** Full commit message including body */
  fullMessage: string;
  /** Author name */
  authorName: string;
  /** Author email */
  authorEmail: string;
  /** Author date (ISO 8601) */
  authorDate: string;
  /** Committer name */
  committerName: string;
  /** Committer email */
  committerEmail: string;
  /** Committer date (ISO 8601) */
  committerDate: string;
  /** Number of files changed */
  filesChanged: number;
  /** Number of insertions (additions) */
  insertions: number;
  /** Number of deletions */
  deletions: number;
  /** List of files changed */
  fileNames: string[];
  /** Parent commit hashes */
  parents: string[];
  /** Tree hash */
  treeHash: string;
}

/**
 * File change details for a single file in a commit.
 */
export interface FileChange {
  /** File path */
  path: string;
  /** Type of change: 'added', 'modified', 'deleted', 'renamed' */
  type: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Old path (for renames) */
  oldPath?: string;
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
}

/**
 * Extended commit metadata with file-level details.
 */
export interface CommitMetadataDetailed extends CommitMetadata {
  /** Detailed file changes */
  files: FileChange[];
}

export interface ParallelWorkerState {
  workerId: string;
  worktreePath: string;
  busy: boolean;
  currentTask?: TrackerTask;
}

export interface ParallelTaskResult {
  task: TrackerTask;
  result: AgentExecutionResult;
  completed: boolean;
}

export type ParallelEvent =
  | { type: 'parallel:started'; timestamp: string; workerCount: number }
  | { type: 'parallel:stopped'; timestamp: string }
  | { type: 'parallel:worker-idle'; timestamp: string; workerId: string }
  | { type: 'parallel:task-claimed'; timestamp: string; workerId: string; task: TrackerTask }
  | { type: 'parallel:task-started'; timestamp: string; workerId: string; task: TrackerTask }
  | { type: 'parallel:task-output'; timestamp: string; workerId: string; taskId: string; data: string; stream: 'stdout' | 'stderr' }
  | { type: 'parallel:task-segments'; timestamp: string; workerId: string; taskId: string; segments: FormattedSegment[] }
  | { type: 'parallel:task-finished'; timestamp: string; workerId: string; task: TrackerTask; result: AgentExecutionResult; completed: boolean }
  | { type: 'parallel:merge-queued'; timestamp: string; workerId: string; task: TrackerTask; commit: string; commitMetadata: CommitMetadata; filesChanged?: string[] }
  | { type: 'parallel:merge-started'; timestamp: string; workerId: string; task: TrackerTask; commit: string; queuePosition: number }
  | { type: 'parallel:merge-resolving'; timestamp: string; workerId: string; task: TrackerTask; commit: string; attempt: number; conflictFiles?: string[] }
  | { type: 'parallel:merge-validated'; timestamp: string; workerId: string; task: TrackerTask; commit: string; checks: Array<{ name: string; command: string; exitCode: number }>; success: boolean }
  | { type: 'parallel:merge-blocked'; timestamp: string; workerId: string; task: TrackerTask; commit: string; reason: string; attemptsUsed: number; conflictFiles?: string[] }
  | { type: 'parallel:merge-succeeded'; timestamp: string; workerId: string; task: TrackerTask; commit: string; commitMetadata: CommitMetadata; resolved?: boolean; filesChanged?: string[]; conflictFiles?: string[] }
  | { type: 'parallel:merge-failed'; timestamp: string; workerId: string; task: TrackerTask; commit: string; commitMetadata: CommitMetadata; reason: string; conflictFiles?: string[] }
  | { type: 'parallel:impact-drift'; timestamp: string; task: TrackerTask; observed: TaskImpactObserved }
  | { type: 'parallel:impact-missing'; timestamp: string; task: TrackerTask; reason: string }
  | { type: 'parallel:validation-queued'; timestamp: string; plan: ValidationPlan; queueDepth: number }
  | { type: 'parallel:validation-started'; timestamp: string; plan: ValidationPlan }
  | { type: 'parallel:validation-check-started'; timestamp: string; planId: string; checkId: string }
  | { type: 'parallel:validation-check-finished'; timestamp: string; planId: string; checkId: string; exitCode: number; durationMs: number; outputPath?: string }
  | { type: 'parallel:validation-passed'; timestamp: string; planId: string; status: ValidationStatus }
  | { type: 'parallel:validation-failed'; timestamp: string; planId: string; status: ValidationStatus; failedCheckId: string; reason: string }
  | { type: 'parallel:validation-fix-started'; timestamp: string; planId: string; attempt: number }
  | { type: 'parallel:validation-fix-succeeded'; timestamp: string; planId: string; attempt: number }
  | { type: 'parallel:validation-fix-failed'; timestamp: string; planId: string; attempt: number; reason: string }
  | { type: 'parallel:validation-reverted'; timestamp: string; planId: string; commit: string; reason: string }
  | { type: 'parallel:validation-blocked'; timestamp: string; planId: string; reason: string }
  | { type: 'parallel:main-sync-skipped'; timestamp: string; reason: string }
  | { type: 'parallel:main-sync-succeeded'; timestamp: string; commit: string }
  | { type: 'parallel:main-sync-failed'; timestamp: string; task: TrackerTask; reason: string }
  | { type: 'parallel:main-sync-retrying'; timestamp: string; retryAttempt: number; maxRetries: number; reason: string; delayMs: number }
  | { type: 'parallel:main-sync-alert'; timestamp: string; retryAttempt: number; maxRetries: number; reason: string; affectedTaskCount: number };

/**
 * ABOUTME: Types for parallel execution with worktree workers.
 */

import type { TrackerTask } from '../../plugins/trackers/types.js';
import type { AgentExecutionResult } from '../../plugins/agents/types.js';
import type { FormattedSegment } from '../../plugins/agents/output-formatting.js';

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
  | { type: 'parallel:merge-queued'; timestamp: string; workerId: string; task: TrackerTask; commit: string; filesChanged?: string[] }
  | { type: 'parallel:merge-succeeded'; timestamp: string; workerId: string; task: TrackerTask; commit: string; resolved?: boolean; filesChanged?: string[]; conflictFiles?: string[] }
  | { type: 'parallel:merge-failed'; timestamp: string; workerId: string; task: TrackerTask; commit: string; reason: string; conflictFiles?: string[] }
  | { type: 'parallel:main-sync-skipped'; timestamp: string; reason: string }
  | { type: 'parallel:main-sync-succeeded'; timestamp: string; commit: string };

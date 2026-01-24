/**
 * ABOUTME: Exports for parallel execution engine components.
 */

export { WorktreeManager } from './worktree/worktree-manager.js';
export type { WorktreeValidationResult } from './worktree/types.js';
export { ParallelWorker } from './worker.js';
export { ParallelCoordinator } from './coordinator.js';
export { ParallelExecutionEngine } from './engine.js';
export type { ParallelEvent, ParallelTaskResult, ParallelWorkerState } from './types.js';

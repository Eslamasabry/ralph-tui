/**
 * ABOUTME: External store slice for parallel pipeline and merge/validation dashboard state.
 * Tracks parallel iteration/timing maps plus merge, validation, and worktree health metrics.
 */

import type { ValidationStatus } from '../../engine/types.js';
import type { IterationTimingInfo } from '../types.js';
import type { WorktreeHealthSummary } from '../../engine/parallel/types.js';
import {
  applyPatch,
  createExternalStore,
  useStoreDispatch,
  useStoreSelector,
  type ExternalStore,
  type StoreSelector,
} from './store-utils.js';

export interface MergeStats {
  worktrees: number;
  queued: number;
  merged: number;
  resolved: number;
  failed: number;
  syncPending: number;
}

export interface ValidationStats {
  queued: number;
  running: boolean;
  lastStatus?: ValidationStatus;
}

export type PipelineFailurePhase =
  | 'merge'
  | 'sync'
  | 'recovery'
  | 'execution'
  | 'validation';

export interface PipelineRunFailure {
  taskId: string;
  taskTitle: string;
  commitHash?: string;
  reason: string;
  conflictFiles?: string[];
  phase: PipelineFailurePhase;
  iteration?: number;
}

export interface PendingMainTask {
  taskId: string;
  taskTitle: string;
  commitCount: number;
}

export interface PipelineState {
  parallelTimings: Map<string, IterationTimingInfo>;
  parallelIterations: Map<string, number>;
  mergeStats: MergeStats;
  validationStats: ValidationStats;
  worktreeHealthSummary: WorktreeHealthSummary;
  pruning: boolean;
  pendingMainCount: number;
  runFailures: PipelineRunFailure[];
  pendingMainTasks: PendingMainTask[];
  mainSyncFailureReason?: string;
}

export type PipelineAction =
  | { type: 'pipeline/reset'; state?: Partial<PipelineState> }
  | { type: 'pipeline/patch'; patch: Partial<PipelineState> }
  | { type: 'pipeline/set-parallel-timing'; key: string; timing: IterationTimingInfo }
  | { type: 'pipeline/remove-parallel-timing'; key: string }
  | { type: 'pipeline/set-parallel-iteration'; key: string; iteration: number }
  | { type: 'pipeline/remove-parallel-iteration'; key: string }
  | { type: 'pipeline/set-merge-stats'; stats: MergeStats }
  | { type: 'pipeline/patch-merge-stats'; patch: Partial<MergeStats> }
  | { type: 'pipeline/set-validation-stats'; stats: ValidationStats }
  | { type: 'pipeline/patch-validation-stats'; patch: Partial<ValidationStats> }
  | { type: 'pipeline/set-worktree-health'; summary: WorktreeHealthSummary }
  | { type: 'pipeline/set-pruning'; pruning: boolean }
  | { type: 'pipeline/set-pending-main-count'; count: number }
  | { type: 'pipeline/set-run-failures'; failures: PipelineRunFailure[] }
  | { type: 'pipeline/add-run-failure'; failure: PipelineRunFailure }
  | { type: 'pipeline/set-pending-main-tasks'; tasks: PendingMainTask[] }
  | { type: 'pipeline/set-main-sync-failure'; reason?: string };

export type PipelineStore = ExternalStore<PipelineState, PipelineAction>;

const DEFAULT_MERGE_STATS: MergeStats = {
  worktrees: 0,
  queued: 0,
  merged: 0,
  resolved: 0,
  failed: 0,
  syncPending: 0,
};

const DEFAULT_VALIDATION_STATS: ValidationStats = {
  queued: 0,
  running: false,
  lastStatus: undefined,
};

const DEFAULT_WORKTREE_HEALTH: WorktreeHealthSummary = {
  total: 0,
  active: 0,
  locked: 0,
  stale: 0,
  prunable: 0,
};

function cloneFailure(failure: PipelineRunFailure): PipelineRunFailure {
  return {
    ...failure,
    conflictFiles: failure.conflictFiles ? [...failure.conflictFiles] : undefined,
  };
}

function createInitialState(initialState: Partial<PipelineState> = {}): PipelineState {
  return {
    parallelTimings: new Map(initialState.parallelTimings ?? []),
    parallelIterations: new Map(initialState.parallelIterations ?? []),
    mergeStats: {
      ...DEFAULT_MERGE_STATS,
      ...(initialState.mergeStats ?? {}),
    },
    validationStats: {
      ...DEFAULT_VALIDATION_STATS,
      ...(initialState.validationStats ?? {}),
    },
    worktreeHealthSummary: {
      ...DEFAULT_WORKTREE_HEALTH,
      ...(initialState.worktreeHealthSummary ?? {}),
    },
    pruning: initialState.pruning ?? false,
    pendingMainCount: initialState.pendingMainCount ?? 0,
    runFailures: (initialState.runFailures ?? []).map(cloneFailure),
    pendingMainTasks: [...(initialState.pendingMainTasks ?? [])],
    mainSyncFailureReason: initialState.mainSyncFailureReason,
  };
}

function pipelineReducer(state: Readonly<PipelineState>, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'pipeline/reset':
      return createInitialState(action.state);

    case 'pipeline/patch':
      return applyPatch(state, action.patch);

    case 'pipeline/set-parallel-timing': {
      const current = state.parallelTimings.get(action.key);
      if (Object.is(current, action.timing)) {
        return state;
      }
      const nextTimings = new Map(state.parallelTimings);
      nextTimings.set(action.key, action.timing);
      return applyPatch(state, { parallelTimings: nextTimings });
    }

    case 'pipeline/remove-parallel-timing': {
      if (!state.parallelTimings.has(action.key)) {
        return state;
      }
      const nextTimings = new Map(state.parallelTimings);
      nextTimings.delete(action.key);
      return applyPatch(state, { parallelTimings: nextTimings });
    }

    case 'pipeline/set-parallel-iteration': {
      if (state.parallelIterations.get(action.key) === action.iteration) {
        return state;
      }
      const nextIterations = new Map(state.parallelIterations);
      nextIterations.set(action.key, action.iteration);
      return applyPatch(state, { parallelIterations: nextIterations });
    }

    case 'pipeline/remove-parallel-iteration': {
      if (!state.parallelIterations.has(action.key)) {
        return state;
      }
      const nextIterations = new Map(state.parallelIterations);
      nextIterations.delete(action.key);
      return applyPatch(state, { parallelIterations: nextIterations });
    }

    case 'pipeline/set-merge-stats':
      return applyPatch(state, {
        mergeStats: {
          ...action.stats,
        },
      });

    case 'pipeline/patch-merge-stats':
      return applyPatch(state, {
        mergeStats: {
          ...state.mergeStats,
          ...action.patch,
        },
      });

    case 'pipeline/set-validation-stats':
      return applyPatch(state, {
        validationStats: {
          ...action.stats,
        },
      });

    case 'pipeline/patch-validation-stats':
      return applyPatch(state, {
        validationStats: {
          ...state.validationStats,
          ...action.patch,
        },
      });

    case 'pipeline/set-worktree-health':
      return applyPatch(state, {
        worktreeHealthSummary: {
          ...action.summary,
        },
      });

    case 'pipeline/set-pruning':
      return applyPatch(state, { pruning: action.pruning });

    case 'pipeline/set-pending-main-count':
      return applyPatch(state, { pendingMainCount: Math.max(0, action.count) });

    case 'pipeline/set-run-failures':
      return applyPatch(state, {
        runFailures: action.failures.map(cloneFailure),
      });

    case 'pipeline/add-run-failure':
      return applyPatch(state, {
        runFailures: [...state.runFailures, cloneFailure(action.failure)],
      });

    case 'pipeline/set-pending-main-tasks':
      return applyPatch(state, {
        pendingMainTasks: [...action.tasks],
      });

    case 'pipeline/set-main-sync-failure':
      return applyPatch(state, {
        mainSyncFailureReason: action.reason,
      });

    default:
      return state;
  }
}

export function createPipelineStore(initialState: Partial<PipelineState> = {}): PipelineStore {
  return createExternalStore<PipelineState, PipelineAction>({
    initialState: createInitialState(initialState),
    reducer: pipelineReducer,
  });
}

export function usePipelineSelector<Selected>(
  store: PipelineStore,
  selector: StoreSelector<PipelineState, Selected>
): Selected {
  return useStoreSelector(store, selector);
}

export function usePipelineDispatch(store: PipelineStore): (action: PipelineAction) => void {
  return useStoreDispatch(store);
}

export function useMergeStatus(store: PipelineStore): MergeStats {
  return usePipelineSelector(store, (state) => state.mergeStats);
}

/**
 * ABOUTME: External store slice for iteration history, activity log, and cached output.
 * Tracks bounded iteration/activity FIFOs plus detail selection and historical output cache entries.
 */

import type { IterationResult } from '../../engine/types.js';
import type { ActivityEvent } from '../../logs/activity-events.js';
import type { IterationTimingInfo } from '../types.js';
import {
  applyPatch,
  createExternalStore,
  useStoreDispatch,
  useStoreSelector,
  type ExternalStore,
  type StoreSelector,
} from './store-utils.js';

export interface HistoricalOutputCacheEntry {
  output: string;
  timing: IterationTimingInfo;
  agentPlugin?: string;
  model?: string;
}

export interface HistoryState {
  iterations: IterationResult[];
  totalIterations: number;
  activityEvents: ActivityEvent[];
  selectedIndex: number;
  detailIteration: IterationResult | null;
  historicalOutputCache: Map<string, HistoricalOutputCacheEntry>;
}

export type HistoryAction =
  | { type: 'history/reset'; state?: Partial<HistoryState> }
  | { type: 'history/clear' }
  | { type: 'history/patch'; patch: Partial<HistoryState> }
  | { type: 'history/set-iterations'; iterations: IterationResult[] }
  | { type: 'history/append-iteration'; iteration: IterationResult }
  | { type: 'history/set-total-iterations'; total: number }
  | { type: 'history/set-activity-events'; events: ActivityEvent[] }
  | { type: 'history/append-activity'; event: ActivityEvent }
  | { type: 'history/set-selected-index'; index: number }
  | { type: 'history/set-detail-iteration'; iteration: IterationResult | null }
  | { type: 'history/cache-output'; taskId: string; entry: HistoricalOutputCacheEntry }
  | { type: 'history/remove-cached-output'; taskId: string }
  | { type: 'history/clear-cache' };

export type HistoryStore = ExternalStore<HistoryState, HistoryAction>;
const ITERATION_CAP = 100;
const ACTIVITY_EVENT_CAP = 1_000;

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  if (index < 0) {
    return 0;
  }

  if (index >= length) {
    return length - 1;
  }

  return index;
}

function cloneOutputEntry(entry: HistoricalOutputCacheEntry): HistoricalOutputCacheEntry {
  return {
    ...entry,
    timing: {
      ...entry.timing,
    },
  };
}

function capTail<T>(items: readonly T[], cap: number): T[] {
  if (cap <= 0) {
    return [];
  }
  if (items.length <= cap) {
    return [...items];
  }
  return items.slice(items.length - cap);
}

function createInitialState(initialState: Partial<HistoryState> = {}): HistoryState {
  const iterations = capTail(initialState.iterations ?? [], ITERATION_CAP);
  return {
    iterations,
    totalIterations: initialState.totalIterations ?? 0,
    activityEvents: capTail(initialState.activityEvents ?? [], ACTIVITY_EVENT_CAP),
    selectedIndex: clampIndex(initialState.selectedIndex ?? 0, iterations.length),
    detailIteration: initialState.detailIteration ?? null,
    historicalOutputCache: new Map(
      Array.from(initialState.historicalOutputCache ?? [], ([taskId, entry]) => [taskId, cloneOutputEntry(entry)])
    ),
  };
}

function historyReducer(state: Readonly<HistoryState>, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'history/reset':
      return createInitialState(action.state);

    case 'history/clear':
      return applyPatch(state, {
        iterations: [],
        totalIterations: 0,
        activityEvents: [],
        selectedIndex: 0,
        detailIteration: null,
        historicalOutputCache: new Map(),
      });

    case 'history/patch':
      return applyPatch(state, action.patch);

    case 'history/set-iterations': {
      const nextIterations = capTail(action.iterations, ITERATION_CAP);
      return applyPatch(state, {
        iterations: nextIterations,
        selectedIndex: clampIndex(state.selectedIndex, nextIterations.length),
      });
    }

    case 'history/append-iteration': {
      const nextIterations = capTail([...state.iterations, action.iteration], ITERATION_CAP);
      return applyPatch(state, {
        iterations: nextIterations,
        selectedIndex: clampIndex(state.selectedIndex, nextIterations.length),
      });
    }

    case 'history/set-total-iterations':
      return applyPatch(state, {
        totalIterations: Math.max(0, action.total),
      });

    case 'history/set-activity-events':
      return applyPatch(state, {
        activityEvents: capTail(action.events, ACTIVITY_EVENT_CAP),
      });

    case 'history/append-activity':
      return applyPatch(state, {
        activityEvents: capTail([...state.activityEvents, action.event], ACTIVITY_EVENT_CAP),
      });

    case 'history/set-selected-index':
      return applyPatch(state, {
        selectedIndex: clampIndex(action.index, state.iterations.length),
      });

    case 'history/set-detail-iteration':
      return applyPatch(state, {
        detailIteration: action.iteration,
      });

    case 'history/cache-output': {
      const nextCache = new Map(state.historicalOutputCache);
      nextCache.set(action.taskId, cloneOutputEntry(action.entry));
      return applyPatch(state, {
        historicalOutputCache: nextCache,
      });
    }

    case 'history/remove-cached-output': {
      if (!state.historicalOutputCache.has(action.taskId)) {
        return state;
      }
      const nextCache = new Map(state.historicalOutputCache);
      nextCache.delete(action.taskId);
      return applyPatch(state, {
        historicalOutputCache: nextCache,
      });
    }

    case 'history/clear-cache':
      if (state.historicalOutputCache.size === 0) {
        return state;
      }
      return applyPatch(state, {
        historicalOutputCache: new Map(),
      });

    default:
      return state;
  }
}

export function createHistoryStore(initialState: Partial<HistoryState> = {}): HistoryStore {
  return createExternalStore<HistoryState, HistoryAction>({
    initialState: createInitialState(initialState),
    reducer: historyReducer,
  });
}

export function useHistorySelector<Selected>(
  store: HistoryStore,
  selector: StoreSelector<HistoryState, Selected>
): Selected {
  return useStoreSelector(store, selector);
}

export function useHistoryDispatch(store: HistoryStore): (action: HistoryAction) => void {
  return useStoreDispatch(store);
}

export function useIterations(store: HistoryStore): IterationResult[] {
  return useHistorySelector(store, (state) => state.iterations);
}

export function useActivityLog(store: HistoryStore): ActivityEvent[] {
  return useHistorySelector(store, (state) => state.activityEvents);
}

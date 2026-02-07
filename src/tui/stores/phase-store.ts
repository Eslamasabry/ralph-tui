/**
 * ABOUTME: External store slice for run phase and header-level execution state.
 * Tracks status, iteration progress, current task context, and active agent metadata.
 */

import type { RalphStatus } from '../theme.js';
import type { ActiveAgentState, RateLimitState, TrackerRealtimeStatus } from '../../engine/types.js';
import {
  applyPatch,
  createExternalStore,
  useStoreDispatch,
  useStoreSelector,
  type ExternalStore,
  type StoreSelector,
} from './store-utils.js';

export interface PhaseState {
  status: RalphStatus;
  currentIteration: number;
  maxIterations: number;
  currentTaskId?: string;
  currentTaskTitle?: string;
  runStartedAtMs?: number;
  runEndedAtMs?: number;
  activeAgentState: ActiveAgentState | null;
  rateLimitState: RateLimitState | null;
  rateLimitElapsedSeconds: number;
  trackerRealtimeStatus?: TrackerRealtimeStatus;
  currentModel?: string;
}

export type PhaseAction =
  | { type: 'phase/reset'; state?: Partial<PhaseState> }
  | { type: 'phase/patch'; patch: Partial<PhaseState> }
  | { type: 'phase/set-status'; status: RalphStatus }
  | { type: 'phase/set-iteration'; currentIteration: number }
  | { type: 'phase/set-max-iterations'; maxIterations: number }
  | { type: 'phase/set-current-task'; taskId?: string; taskTitle?: string }
  | { type: 'phase/set-run-timing'; startedAtMs?: number; endedAtMs?: number }
  | { type: 'phase/set-active-agent'; activeAgentState: ActiveAgentState | null }
  | { type: 'phase/set-rate-limit'; rateLimitState: RateLimitState | null }
  | { type: 'phase/tick-rate-limit' }
  | { type: 'phase/set-tracker-realtime'; trackerRealtimeStatus?: TrackerRealtimeStatus }
  | { type: 'phase/set-current-model'; currentModel?: string };

export type PhaseStore = ExternalStore<PhaseState, PhaseAction>;

const DEFAULT_PHASE_STATE: PhaseState = {
  status: 'ready',
  currentIteration: 0,
  maxIterations: 0,
  currentTaskId: undefined,
  currentTaskTitle: undefined,
  runStartedAtMs: undefined,
  runEndedAtMs: undefined,
  activeAgentState: null,
  rateLimitState: null,
  rateLimitElapsedSeconds: 0,
  trackerRealtimeStatus: undefined,
  currentModel: undefined,
};

const PHASE_GUARDS: Record<RalphStatus, ReadonlySet<RalphStatus>> = {
  ready: new Set(['ready', 'running', 'selecting', 'executing', 'pausing', 'paused', 'stopped', 'complete', 'error', 'idle']),
  running: new Set(['running', 'selecting', 'executing', 'pausing', 'paused', 'stopped', 'complete', 'error']),
  selecting: new Set(['selecting', 'executing', 'running', 'pausing', 'paused', 'stopped', 'complete', 'error']),
  executing: new Set(['executing', 'selecting', 'running', 'pausing', 'paused', 'stopped', 'complete', 'error']),
  pausing: new Set(['pausing', 'paused', 'running', 'selecting', 'stopped', 'error']),
  paused: new Set(['paused', 'selecting', 'running', 'stopped', 'error', 'complete']),
  stopped: new Set(['stopped', 'ready', 'selecting', 'running', 'idle', 'error', 'complete']),
  complete: new Set(['complete', 'ready', 'selecting', 'running', 'idle']),
  idle: new Set(['idle', 'ready', 'running', 'selecting', 'executing', 'stopped', 'error']),
  error: new Set(['error', 'ready', 'selecting', 'running', 'stopped', 'complete']),
};

export function canTransitionPhase(from: RalphStatus, to: RalphStatus): boolean {
  const allowed = PHASE_GUARDS[from];
  return allowed?.has(to) ?? false;
}

function createInitialState(initialState: Partial<PhaseState> = {}): PhaseState {
  const limitedAt = initialState.rateLimitState?.limitedAt;
  const elapsedSeconds = limitedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(limitedAt).getTime()) / 1000))
    : 0;

  return {
    ...DEFAULT_PHASE_STATE,
    ...initialState,
    rateLimitElapsedSeconds: initialState.rateLimitElapsedSeconds ?? elapsedSeconds,
  };
}

function phaseReducer(state: Readonly<PhaseState>, action: PhaseAction): PhaseState {
  switch (action.type) {
    case 'phase/reset':
      return createInitialState(action.state);

    case 'phase/patch':
      return applyPatch(state, action.patch);

    case 'phase/set-status':
      if (!canTransitionPhase(state.status, action.status)) {
        return state;
      }
      return applyPatch(state, { status: action.status });

    case 'phase/set-iteration':
      return applyPatch(state, { currentIteration: Math.max(0, action.currentIteration) });

    case 'phase/set-max-iterations':
      return applyPatch(state, { maxIterations: Math.max(0, action.maxIterations) });

    case 'phase/set-current-task':
      return applyPatch(state, {
        currentTaskId: action.taskId,
        currentTaskTitle: action.taskTitle,
      });

    case 'phase/set-run-timing':
      return applyPatch(state, {
        runStartedAtMs: action.startedAtMs,
        runEndedAtMs: action.endedAtMs,
      });

    case 'phase/set-active-agent':
      return applyPatch(state, { activeAgentState: action.activeAgentState });

    case 'phase/set-rate-limit':
      return applyPatch(state, {
        rateLimitState: action.rateLimitState,
        rateLimitElapsedSeconds: action.rateLimitState?.limitedAt
          ? Math.max(0, Math.floor((Date.now() - new Date(action.rateLimitState.limitedAt).getTime()) / 1000))
          : 0,
      });

    case 'phase/tick-rate-limit': {
      const limitedAt = state.rateLimitState?.limitedAt;
      if (!limitedAt) {
        if (state.rateLimitElapsedSeconds === 0) {
          return state;
        }
        return applyPatch(state, { rateLimitElapsedSeconds: 0 });
      }

      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(limitedAt).getTime()) / 1000));
      if (elapsed === state.rateLimitElapsedSeconds) {
        return state;
      }

      return applyPatch(state, { rateLimitElapsedSeconds: elapsed });
    }

    case 'phase/set-tracker-realtime':
      return applyPatch(state, { trackerRealtimeStatus: action.trackerRealtimeStatus });

    case 'phase/set-current-model':
      return applyPatch(state, { currentModel: action.currentModel });

    default:
      return state;
  }
}

export function createPhaseStore(initialState: Partial<PhaseState> = {}): PhaseStore {
  return createExternalStore<PhaseState, PhaseAction>({
    initialState: createInitialState(initialState),
    reducer: phaseReducer,
  });
}

export function usePhaseSelector<Selected>(
  store: PhaseStore,
  selector: StoreSelector<PhaseState, Selected>
): Selected {
  return useStoreSelector(store, selector);
}

export function usePhaseDispatch(store: PhaseStore): (action: PhaseAction) => void {
  return useStoreDispatch(store);
}

export function usePhase(store: PhaseStore): RalphStatus {
  return usePhaseSelector(store, (state) => state.status);
}

export function useIsRunning(store: PhaseStore): boolean {
  return usePhaseSelector(
    store,
    (state) =>
      state.status === 'running' ||
      state.status === 'selecting' ||
      state.status === 'executing' ||
      state.status === 'pausing'
  );
}

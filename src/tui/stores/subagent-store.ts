/**
 * ABOUTME: External store slice for subagent tracing state and panel behavior.
 * Tracks local/remote subagent trees, selection, detail-level preferences, and cached trace stats.
 */

import type { SubagentDetailLevel } from '../../config/types.js';
import type { SubagentTraceStats, SubagentHierarchyNode } from '../../logs/types.js';
import type { SubagentTreeNode } from '../types.js';
import {
  applyPatch,
  createExternalStore,
  useStoreDispatch,
  useStoreSelector,
  type ExternalStore,
  type StoreSelector,
} from './store-utils.js';

export interface HistoricExecutionContextState {
  agentPlugin?: string;
  model?: string;
  sandboxMode?: string;
  resolvedSandboxMode?: string;
  sandboxNetwork?: boolean;
}

export interface SubagentState {
  detailLevel: SubagentDetailLevel;
  tree: SubagentTreeNode[];
  remoteTree: SubagentTreeNode[];
  selectedSubagentId?: string;
  focusedSubagentId?: string;
  panelVisible: boolean;
  userManuallyHidPanel: boolean;
  statsCache: Map<number, SubagentTraceStats>;
  iterationDetailTree?: SubagentHierarchyNode[];
  iterationDetailStats?: SubagentTraceStats;
  iterationDetailLoading: boolean;
  iterationDetailHistoricContext?: HistoricExecutionContextState;
}

export type SubagentAction =
  | { type: 'subagent/reset'; state?: Partial<SubagentState> }
  | { type: 'subagent/patch'; patch: Partial<SubagentState> }
  | { type: 'subagent/set-detail-level'; detailLevel: SubagentDetailLevel }
  | { type: 'subagent/set-tree'; tree: SubagentTreeNode[] }
  | { type: 'subagent/set-remote-tree'; tree: SubagentTreeNode[] }
  | { type: 'subagent/set-selected-id'; subagentId?: string }
  | { type: 'subagent/set-focused-id'; subagentId?: string }
  | { type: 'subagent/set-panel-visible'; visible: boolean }
  | { type: 'subagent/set-user-manual-hide'; hidden: boolean }
  | { type: 'subagent/set-stats-cache'; cache: Map<number, SubagentTraceStats> }
  | { type: 'subagent/set-stat'; iteration: number; stats: SubagentTraceStats }
  | { type: 'subagent/remove-stat'; iteration: number }
  | { type: 'subagent/set-iteration-detail-tree'; tree?: SubagentHierarchyNode[] }
  | { type: 'subagent/set-iteration-detail-stats'; stats?: SubagentTraceStats }
  | { type: 'subagent/set-iteration-detail-loading'; loading: boolean }
  | { type: 'subagent/set-iteration-detail-context'; context?: HistoricExecutionContextState }
  | { type: 'subagent/clear-iteration-detail' }
  | { type: 'subagent/clear-on-task-switch' };

export type SubagentStore = ExternalStore<SubagentState, SubagentAction>;

const DEFAULT_SUBAGENT_STATE: SubagentState = {
  detailLevel: 'moderate',
  tree: [],
  remoteTree: [],
  selectedSubagentId: undefined,
  focusedSubagentId: undefined,
  panelVisible: false,
  userManuallyHidPanel: false,
  statsCache: new Map(),
  iterationDetailTree: undefined,
  iterationDetailStats: undefined,
  iterationDetailLoading: false,
  iterationDetailHistoricContext: undefined,
};

function createInitialState(initialState: Partial<SubagentState> = {}): SubagentState {
  return {
    detailLevel: initialState.detailLevel ?? DEFAULT_SUBAGENT_STATE.detailLevel,
    tree: [...(initialState.tree ?? DEFAULT_SUBAGENT_STATE.tree)],
    remoteTree: [...(initialState.remoteTree ?? DEFAULT_SUBAGENT_STATE.remoteTree)],
    selectedSubagentId: initialState.selectedSubagentId,
    focusedSubagentId: initialState.focusedSubagentId,
    panelVisible: initialState.panelVisible ?? DEFAULT_SUBAGENT_STATE.panelVisible,
    userManuallyHidPanel: initialState.userManuallyHidPanel ?? DEFAULT_SUBAGENT_STATE.userManuallyHidPanel,
    statsCache: new Map(initialState.statsCache ?? DEFAULT_SUBAGENT_STATE.statsCache),
    iterationDetailTree: initialState.iterationDetailTree ? [...initialState.iterationDetailTree] : undefined,
    iterationDetailStats: initialState.iterationDetailStats,
    iterationDetailLoading: initialState.iterationDetailLoading ?? DEFAULT_SUBAGENT_STATE.iterationDetailLoading,
    iterationDetailHistoricContext: initialState.iterationDetailHistoricContext
      ? { ...initialState.iterationDetailHistoricContext }
      : undefined,
  };
}

function subagentReducer(state: Readonly<SubagentState>, action: SubagentAction): SubagentState {
  switch (action.type) {
    case 'subagent/reset':
      return createInitialState(action.state);

    case 'subagent/patch':
      return applyPatch(state, action.patch);

    case 'subagent/set-detail-level':
      return applyPatch(state, {
        detailLevel: action.detailLevel,
      });

    case 'subagent/set-tree':
      return applyPatch(state, {
        tree: [...action.tree],
      });

    case 'subagent/set-remote-tree':
      return applyPatch(state, {
        remoteTree: [...action.tree],
      });

    case 'subagent/set-selected-id':
      return applyPatch(state, {
        selectedSubagentId: action.subagentId,
      });

    case 'subagent/set-focused-id':
      return applyPatch(state, {
        focusedSubagentId: action.subagentId,
      });

    case 'subagent/set-panel-visible':
      return applyPatch(state, {
        panelVisible: action.visible,
      });

    case 'subagent/set-user-manual-hide':
      return applyPatch(state, {
        userManuallyHidPanel: action.hidden,
      });

    case 'subagent/set-stats-cache':
      return applyPatch(state, {
        statsCache: new Map(action.cache),
      });

    case 'subagent/set-stat': {
      const nextCache = new Map(state.statsCache);
      nextCache.set(action.iteration, action.stats);
      return applyPatch(state, {
        statsCache: nextCache,
      });
    }

    case 'subagent/remove-stat': {
      if (!state.statsCache.has(action.iteration)) {
        return state;
      }
      const nextCache = new Map(state.statsCache);
      nextCache.delete(action.iteration);
      return applyPatch(state, {
        statsCache: nextCache,
      });
    }

    case 'subagent/set-iteration-detail-tree':
      return applyPatch(state, {
        iterationDetailTree: action.tree ? [...action.tree] : undefined,
      });

    case 'subagent/set-iteration-detail-stats':
      return applyPatch(state, {
        iterationDetailStats: action.stats,
      });

    case 'subagent/set-iteration-detail-loading':
      return applyPatch(state, {
        iterationDetailLoading: action.loading,
      });

    case 'subagent/set-iteration-detail-context':
      return applyPatch(state, {
        iterationDetailHistoricContext: action.context ? { ...action.context } : undefined,
      });

    case 'subagent/clear-iteration-detail':
      return applyPatch(state, {
        iterationDetailTree: undefined,
        iterationDetailStats: undefined,
        iterationDetailHistoricContext: undefined,
        iterationDetailLoading: false,
      });

    case 'subagent/clear-on-task-switch':
      return applyPatch(state, {
        tree: [],
        selectedSubagentId: undefined,
        focusedSubagentId: undefined,
        iterationDetailTree: undefined,
        iterationDetailStats: undefined,
        iterationDetailHistoricContext: undefined,
        iterationDetailLoading: false,
      });

    default:
      return state;
  }
}

export function createSubagentStore(initialState: Partial<SubagentState> = {}): SubagentStore {
  return createExternalStore<SubagentState, SubagentAction>({
    initialState: createInitialState(initialState),
    reducer: subagentReducer,
  });
}

export function useSubagentSelector<Selected>(
  store: SubagentStore,
  selector: StoreSelector<SubagentState, Selected>
): Selected {
  return useStoreSelector(store, selector);
}

export function useSubagentDispatch(store: SubagentStore): (action: SubagentAction) => void {
  return useStoreDispatch(store);
}

export function useSubagentTree(store: SubagentStore): SubagentTreeNode[] {
  return useSubagentSelector(store, (state) => state.tree);
}

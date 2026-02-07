/**
 * ABOUTME: React context provider for the TUI external-store layer.
 * Composes all TUI store slices and exposes context-backed selector/dispatch hooks.
 */

import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  createPhaseStore,
  usePhaseDispatch,
  usePhaseSelector,
  type PhaseAction,
  type PhaseState,
  type PhaseStore,
} from './phase-store.js';
import {
  createOutputBufferStore,
  useOutputBufferDispatch,
  useRawLog,
  useOutputBufferSelector,
  type OutputBufferAction,
  type OutputBufferState,
  type OutputBufferStore,
} from './output-buffer.js';
import {
  createPipelineStore,
  usePipelineDispatch,
  usePipelineSelector,
  type PipelineAction,
  type PipelineState,
  type PipelineStore,
} from './pipeline-store.js';
import {
  createHistoryStore,
  useHistoryDispatch,
  useHistorySelector,
  type HistoryAction,
  type HistoryState,
  type HistoryStore,
} from './history-store.js';
import {
  createTaskStore,
  useTaskDispatch,
  useTaskSelector,
  type TaskStore,
  type TaskStoreAction,
  type TaskStoreState,
} from './task-store.js';
import {
  createUIStore,
  useUIDispatch,
  useUISelector,
  type UIAction,
  type UIState,
  type UIStore,
} from './ui-store.js';
import {
  createSubagentStore,
  useSubagentDispatch,
  useSubagentSelector,
  type SubagentAction,
  type SubagentState,
  type SubagentStore,
} from './subagent-store.js';
import type { TaskItem } from '../types.js';
import type { StoreSelector } from './store-utils.js';

export interface TuiStores {
  phase: PhaseStore;
  output: OutputBufferStore;
  pipeline: PipelineStore;
  history: HistoryStore;
  tasks: TaskStore;
  ui: UIStore;
  subagent: SubagentStore;
}

export interface TuiStoreInitialState {
  phase?: Partial<PhaseState>;
  output?: Partial<OutputBufferState>;
  pipeline?: Partial<PipelineState>;
  history?: Partial<HistoryState>;
  tasks?: Partial<TaskStoreState>;
  ui?: Partial<UIState>;
  subagent?: Partial<SubagentState>;
}

export function createTuiStores(initialState: TuiStoreInitialState = {}): TuiStores {
  return {
    phase: createPhaseStore(initialState.phase),
    output: createOutputBufferStore(initialState.output),
    pipeline: createPipelineStore(initialState.pipeline),
    history: createHistoryStore(initialState.history),
    tasks: createTaskStore(initialState.tasks),
    ui: createUIStore(initialState.ui),
    subagent: createSubagentStore(initialState.subagent),
  };
}

const TuiStoresContext = createContext<TuiStores | null>(null);

export interface TuiProviderProps {
  children: ReactNode;
  stores?: TuiStores;
  initialState?: TuiStoreInitialState;
}

export function TuiProvider({ children, stores, initialState }: TuiProviderProps): ReactNode {
  const localStoresRef = useRef<TuiStores | null>(null);

  if (!stores && localStoresRef.current === null) {
    localStoresRef.current = createTuiStores(initialState);
  }

  const contextValue = stores ?? localStoresRef.current;
  if (!contextValue) {
    throw new Error('TuiProvider failed to initialize stores.');
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const syncRateLimitTicker = (): void => {
      const limitedAt = contextValue.phase.getState().rateLimitState?.limitedAt;
      if (limitedAt) {
        if (interval !== null) {
          return;
        }

        contextValue.phase.dispatch({ type: 'phase/tick-rate-limit' });
        interval = setInterval(() => {
          contextValue.phase.dispatch({ type: 'phase/tick-rate-limit' });
        }, 1000);
        return;
      }

      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };

    syncRateLimitTicker();
    const unsubscribe = contextValue.phase.subscribe(syncRateLimitTicker);

    return () => {
      unsubscribe();
      if (interval !== null) {
        clearInterval(interval);
      }
    };
  }, [contextValue]);

  return <TuiStoresContext.Provider value={contextValue}>{children}</TuiStoresContext.Provider>;
}

export function useTuiStores(): TuiStores {
  const stores = useContext(TuiStoresContext);
  if (!stores) {
    throw new Error('useTuiStores must be used inside TuiProvider.');
  }
  return stores;
}

export function useTuiPhaseSelector<Selected>(
  selector: StoreSelector<PhaseState, Selected>
): Selected {
  const { phase } = useTuiStores();
  return usePhaseSelector(phase, selector);
}

export function useTuiPhaseDispatch(): (action: PhaseAction) => void {
  const { phase } = useTuiStores();
  return usePhaseDispatch(phase);
}

export function useTuiOutputSelector<Selected>(
  selector: StoreSelector<OutputBufferState, Selected>
): Selected {
  const { output } = useTuiStores();
  return useOutputBufferSelector(output, selector);
}

export function useTuiOutputDispatch(): (action: OutputBufferAction) => void {
  const { output } = useTuiStores();
  return useOutputBufferDispatch(output);
}

export function useTuiRawLog(): string {
  const { output } = useTuiStores();
  return useRawLog(output);
}

export function useTuiPipelineSelector<Selected>(
  selector: StoreSelector<PipelineState, Selected>
): Selected {
  const { pipeline } = useTuiStores();
  return usePipelineSelector(pipeline, selector);
}

export function useTuiPipelineDispatch(): (action: PipelineAction) => void {
  const { pipeline } = useTuiStores();
  return usePipelineDispatch(pipeline);
}

export function useTuiHistorySelector<Selected>(
  selector: StoreSelector<HistoryState, Selected>
): Selected {
  const { history } = useTuiStores();
  return useHistorySelector(history, selector);
}

export function useTuiHistoryDispatch(): (action: HistoryAction) => void {
  const { history } = useTuiStores();
  return useHistoryDispatch(history);
}

export function useTuiTaskSelector<Selected>(selector: StoreSelector<TaskStoreState, Selected>): Selected {
  const { tasks } = useTuiStores();
  return useTaskSelector(tasks, selector);
}

export function useTuiTaskDispatch(): (action: TaskStoreAction) => void {
  const { tasks } = useTuiStores();
  return useTaskDispatch(tasks);
}

export function useTuiUISelector<Selected>(selector: StoreSelector<UIState, Selected>): Selected {
  const { ui } = useTuiStores();
  return useUISelector(ui, selector);
}

export function useTuiUIDispatch(): (action: UIAction) => void {
  const { ui } = useTuiStores();
  return useUIDispatch(ui);
}

export function useTuiSubagentSelector<Selected>(
  selector: StoreSelector<SubagentState, Selected>
): Selected {
  const { subagent } = useTuiStores();
  return useSubagentSelector(subagent, selector);
}

export function useTuiSubagentDispatch(): (action: SubagentAction) => void {
  const { subagent } = useTuiStores();
  return useSubagentDispatch(subagent);
}

export function useTuiSelectedTask(): TaskItem | null {
  const selectedTaskId = useTuiUISelector((state) => state.selectedTaskId);
  const selectedIndex = useTuiTaskSelector((state) => state.selectedIndex);
  const tasks = useTuiTaskSelector((state) => state.tasks);

  if (tasks.length === 0) {
    return null;
  }

  if (selectedTaskId) {
    const byId = tasks.find((task) => task.id === selectedTaskId);
    if (byId) {
      return byId;
    }
  }

  const safeIndex = Math.max(0, Math.min(selectedIndex, tasks.length - 1));
  return tasks[safeIndex] ?? null;
}

/**
 * Back-compat selector alias for UI-focused selected task access.
 */
export function useSelectedTask(): TaskItem | null {
  return useTuiSelectedTask();
}

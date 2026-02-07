/**
 * ABOUTME: Data source context provider for tab-driven data selection.
 * Starts with local-only resolution and includes tab-switch hook scaffolding.
 */

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTuiStores } from '../stores/tui-provider.js';
import type { TuiStores } from '../stores/tui-provider.js';
import type { PhaseState } from '../stores/phase-store.js';
import type { OutputBufferState } from '../stores/output-buffer.js';
import type { PipelineState } from '../stores/pipeline-store.js';
import type { HistoryState } from '../stores/history-store.js';
import type { TaskStoreState } from '../stores/task-store.js';
import type { SubagentState } from '../stores/subagent-store.js';

/**
 * Lightweight tab descriptor used for data source routing.
 */
export interface DataSourceTab {
  id: string;
  isLocal?: boolean;
  alias?: string;
}

/**
 * Current data source descriptor.
 * Step 3 keeps execution local while preserving requested remote alias for later wiring.
 */
export interface DataSourceDescriptor {
  kind: 'local';
  id: 'local';
  requestedRemoteAlias?: string;
}

/**
 * Tab switch event payload.
 */
export interface TabSwitchEvent {
  fromTabIndex: number;
  toTabIndex: number;
  source: DataSourceDescriptor;
}

/**
 * Listener signature for tab switch notifications.
 */
export type TabSwitchListener = (event: TabSwitchEvent) => void;

export interface DataSourceSnapshot {
  phase: PhaseState;
  output: OutputBufferState;
  pipeline: PipelineState;
  history: HistoryState;
  tasks: TaskStoreState;
  subagent: SubagentState;
}

/**
 * Clamp a tab index to valid range.
 */
export function clampTabIndex(index: number, tabCount: number): number {
  if (tabCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, tabCount - 1));
}

/**
 * Resolve data source from tab metadata.
 * Remote tabs currently map to local source while preserving alias for future remote binding.
 */
export function resolveDataSourceForTab(tab?: DataSourceTab): DataSourceDescriptor {
  if (!tab || tab.isLocal || !tab.alias) {
    return {
      kind: 'local',
      id: 'local',
    };
  }

  return {
    kind: 'local',
    id: 'local',
    requestedRemoteAlias: tab.alias,
  };
}

/**
 * Compare two data source descriptors.
 */
export function isSameDataSource(a: DataSourceDescriptor, b: DataSourceDescriptor): boolean {
  return a.kind === b.kind && a.id === b.id && a.requestedRemoteAlias === b.requestedRemoteAlias;
}

/**
 * Build a tab switch event from indices and tabs.
 */
export function buildTabSwitchEvent(
  fromTabIndex: number,
  toTabIndex: number,
  tabs: DataSourceTab[]
): TabSwitchEvent {
  const safeIndex = clampTabIndex(toTabIndex, tabs.length);
  const targetTab = tabs[safeIndex];

  return {
    fromTabIndex,
    toTabIndex: safeIndex,
    source: resolveDataSourceForTab(targetTab),
  };
}

/**
 * Capture a local snapshot of all cross-view stores for tab restoration.
 */
export function createDataSourceSnapshot(stores: TuiStores): DataSourceSnapshot {
  return {
    phase: stores.phase.getState(),
    output: stores.output.getState(),
    pipeline: stores.pipeline.getState(),
    history: stores.history.getState(),
    tasks: stores.tasks.getState(),
    subagent: stores.subagent.getState(),
  };
}

/**
 * Restore a previously captured snapshot into stores.
 */
export function restoreDataSourceSnapshot(
  stores: TuiStores,
  snapshot: DataSourceSnapshot
): void {
  stores.phase.dispatch({ type: 'phase/reset', state: snapshot.phase });
  stores.output.dispatch({ type: 'output/reset', state: snapshot.output });
  stores.pipeline.dispatch({ type: 'pipeline/reset', state: snapshot.pipeline });
  stores.history.dispatch({ type: 'history/reset', state: snapshot.history });
  stores.tasks.dispatch({ type: 'tasks/reset', state: snapshot.tasks });
  stores.subagent.dispatch({ type: 'subagent/reset', state: snapshot.subagent });
}

interface DataSourceContextValue {
  source: DataSourceDescriptor;
  selectedTabIndex: number;
  switchTab: (nextTabIndex: number) => void;
  subscribeTabSwitch: (listener: TabSwitchListener) => () => void;
}

const DEFAULT_TABS: DataSourceTab[] = [{ id: 'local', isLocal: true }];

const DataSourceContext = createContext<DataSourceContextValue | null>(null);

/**
 * Props for DataSourceProvider.
 */
export interface DataSourceProviderProps {
  children: ReactNode;
  selectedTabIndex?: number;
  tabs?: DataSourceTab[];
}

/**
 * Data source provider with local-mode tab-switch scaffolding.
 */
export function DataSourceProvider({
  children,
  selectedTabIndex = 0,
  tabs = DEFAULT_TABS,
}: DataSourceProviderProps): ReactNode {
  const stores = useTuiStores();
  const resolvedTabs = tabs.length > 0 ? tabs : DEFAULT_TABS;
  const initialTabIndex = clampTabIndex(selectedTabIndex, resolvedTabs.length);
  const [activeTabIndex, setActiveTabIndex] = useState(initialTabIndex);
  const [source, setSource] = useState<DataSourceDescriptor>(() =>
    resolveDataSourceForTab(resolvedTabs[initialTabIndex])
  );
  const listenersRef = useRef<Set<TabSwitchListener>>(new Set());
  const localSnapshotRef = useRef<DataSourceSnapshot | null>(null);

  const subscribeTabSwitch = useCallback((listener: TabSwitchListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const emitTabSwitch = useCallback((event: TabSwitchEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  }, []);

  const switchTab = useCallback(
    (nextTabIndex: number) => {
      const boundedIndex = clampTabIndex(nextTabIndex, resolvedTabs.length);

      setActiveTabIndex((currentIndex) => {
        if (currentIndex === boundedIndex) {
          return currentIndex;
        }

        stores.ui.dispatch({ type: 'ui/set-tab-switching', switching: true });
        const event = buildTabSwitchEvent(currentIndex, boundedIndex, resolvedTabs);
        setSource(event.source);
        emitTabSwitch(event);
        return event.toTabIndex;
      });
    },
    [emitTabSwitch, resolvedTabs, stores.ui]
  );

  useEffect(() => {
    switchTab(selectedTabIndex);
  }, [selectedTabIndex, switchTab]);

  useEffect(() => {
    const boundedIndex = clampTabIndex(activeTabIndex, resolvedTabs.length);
    if (boundedIndex !== activeTabIndex) {
      setActiveTabIndex(boundedIndex);
      return;
    }

    const nextSource = resolveDataSourceForTab(resolvedTabs[boundedIndex]);
    setSource((currentSource) => (isSameDataSource(currentSource, nextSource) ? currentSource : nextSource));
  }, [activeTabIndex, resolvedTabs]);

  useEffect(() => {
    const currentTab = resolvedTabs[activeTabIndex];
    const isLocal = currentTab?.isLocal !== false;

    if (!isLocal) {
      if (!localSnapshotRef.current) {
        localSnapshotRef.current = createDataSourceSnapshot(stores);
      }

      stores.ui.dispatch({
        type: 'ui/push-toast',
        toast: {
          message: `Viewing remote tab ${currentTab?.alias ?? currentTab?.id ?? ''}`.trim(),
          variant: 'info',
          autoDismissMs: 2000,
        },
      });
      stores.ui.dispatch({ type: 'ui/set-tab-switching', switching: false });
      return;
    }

    const snapshot = localSnapshotRef.current;
    if (snapshot) {
      restoreDataSourceSnapshot(stores, snapshot);
    }

    stores.ui.dispatch({ type: 'ui/set-tab-switching', switching: false });
  }, [
    activeTabIndex,
    resolvedTabs,
    stores.history,
    stores.output,
    stores.phase,
    stores.pipeline,
    stores.subagent,
    stores.tasks,
    stores.ui,
  ]);

  const contextValue = useMemo<DataSourceContextValue>(
    () => ({
      source,
      selectedTabIndex: activeTabIndex,
      switchTab,
      subscribeTabSwitch,
    }),
    [activeTabIndex, source, subscribeTabSwitch, switchTab]
  );

  return (
    <DataSourceContext.Provider value={contextValue}>
      {children}
    </DataSourceContext.Provider>
  );
}

/**
 * Access active data source context.
 */
export function useDataSource(): DataSourceContextValue {
  const context = useContext(DataSourceContext);
  if (!context) {
    throw new Error('useDataSource must be used inside DataSourceProvider');
  }
  return context;
}

/**
 * Register callback for tab switch events.
 * Scaffolding hook for future remote data fetch orchestration.
 */
export function useDataSourceTabSwitch(listener: TabSwitchListener): void {
  const { subscribeTabSwitch } = useDataSource();

  useEffect(() => subscribeTabSwitch(listener), [listener, subscribeTabSwitch]);
}

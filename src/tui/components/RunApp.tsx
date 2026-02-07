/**
 * ABOUTME: Canonical run app entrypoint with store/provider wiring.
 * Composes external stores, event bridge integration, keyboard routing,
 * and the AppShell view container used by run/resume commands.
 */

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type {
  StoredConfig,
  SandboxConfig,
  SandboxMode,
  SubagentDetailLevel,
} from '../../config/types.js';
import type { EngineController } from '../../engine/types.js';
import type { AgentPluginMeta } from '../../plugins/agents/types.js';
import type { TrackerTask, TrackerPluginMeta } from '../../plugins/trackers/types.js';
import type { InstanceManager } from '../../remote/instance-manager.js';
import type { InstanceTab } from '../../remote/client.js';
import { colors } from '../theme.js';
import { AppShell } from './AppShell.js';
import { DataSourceProvider, type DataSourceTab } from './DataSourceProvider.js';
import { ErrorBoundary, type ErrorBoundaryProps } from './ErrorBoundary.js';
import { KeyboardManager, type KeyboardStores } from './KeyboardManager.js';
import type { ConnectionToastMessage } from './Toast.js';
import { formatConnectionToast } from './Toast.js';
import {
  createEventBridge,
  createTuiStores,
  TuiProvider,
  type TuiStores,
} from '../stores/index.js';
import { convertTasksWithDependencyStatus } from '../stores/task-store.js';

/**
 * Props for the canonical RunApp component.
 */
export interface RunAppProps {
  /** Execution engine instance. */
  engine?: EngineController;
  /** Optional initial task snapshot prior to engine start. */
  initialTasks?: TrackerTask[];
  /** Optional instance tabs for data source selection. */
  instanceTabs?: InstanceTab[];
  /** Optional selected tab index. */
  selectedTabIndex?: number;
  /** Optional quit callback for shell-level escape hatches. */
  onQuit?: () => void | Promise<void>;
  /** Optional workspace cwd for local config operations. */
  cwd?: string;
  /** Optional current stored configuration (for settings view). */
  storedConfig?: StoredConfig;
  /** Optional available agent plugin metadata (for settings view). */
  availableAgents?: AgentPluginMeta[];
  /** Optional available tracker plugin metadata (for settings view). */
  availableTrackers?: TrackerPluginMeta[];
  /** Optional callback when settings should be saved. */
  onSaveSettings?: (config: StoredConfig) => Promise<void>;
  /** Optional callback to load available epics. */
  onLoadEpics?: () => Promise<TrackerTask[]>;
  /** Optional callback when epic is selected. */
  onEpicSwitch?: (epic: TrackerTask) => Promise<void>;
  /** Optional callback when PRD file path is submitted. */
  onFilePathSwitch?: (path: string) => Promise<boolean>;
  /** Optional tracker type to resolve epic loader mode. */
  trackerType?: string;
  /** Optional current epic id. */
  currentEpicId?: string;
  /** Optional callback to sync selected tab with parent instance manager flow. */
  onSelectTab?: (index: number) => void;
  /** Optional instance manager for remote operations. */
  instanceManager?: InstanceManager;
  /** Optional start callback (ready-state flow from run command). */
  onStart?: () => Promise<void>;
  /** Optional interrupt dialog visibility controlled externally. */
  showInterruptDialog?: boolean;
  /** Optional interrupt confirm callback (run command interrupt handler). */
  onInterruptConfirm?: () => void | Promise<void>;
  /** Optional interrupt cancel callback (run command interrupt handler). */
  onInterruptCancel?: () => void;
  /** Start with epic loader overlay open. */
  initialShowEpicLoader?: boolean;
  /** Initial subagent panel visibility from persisted session. */
  initialSubagentPanelVisible?: boolean;
  /** Persist subagent panel visibility changes. */
  onSubagentPanelVisibilityChange?: (visible: boolean) => void;
  /** Optional model to seed header state before first events. */
  currentModel?: string;
  /** Optional selected agent plugin name for header visibility. */
  agentPlugin?: string;
  /** Optional version string (retained for command-level API compatibility). */
  appVersion?: string;
  /** Optional local git info (retained for command-level API compatibility). */
  localGitInfo?: {
    repoName?: string;
    branch?: string;
    isDirty?: boolean;
    commitHash?: string;
  };
  /** Optional incoming connection toast events from instance manager. */
  connectionToast?: ConnectionToastMessage | null;
  /** Optional sandbox display config for header context. */
  sandboxConfig?: SandboxConfig;
  /** Optional resolved sandbox mode for header context. */
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>;
}

interface EventBridgeHookProps {
  engine?: EngineController;
  stores: TuiStores;
}

function useEventBridgeIntegration({ engine, stores }: EventBridgeHookProps): void {
  useEffect(() => {
    if (!engine) {
      return;
    }

    const bridge = createEventBridge(engine, stores);
    return () => {
      bridge.destroy();
    };
  }, [engine, stores]);
}

function toDataSourceTabs(instanceTabs: InstanceTab[] | undefined): DataSourceTab[] {
  if (!instanceTabs || instanceTabs.length === 0) {
    return [{ id: 'local', isLocal: true }];
  }

  return instanceTabs.map((tab) => ({
    id: tab.id,
    isLocal: tab.isLocal,
    alias: tab.alias,
  }));
}

function createKeyboardStores(
  stores: TuiStores,
  engine: EngineController | undefined,
  onQuit: (() => void | Promise<void>) | undefined,
  onStart: (() => Promise<void>) | undefined,
  onInterruptConfirm: (() => void | Promise<void>) | undefined,
  onInterruptCancel: (() => void) | undefined
): KeyboardStores {
  const cycleSubagentDetailLevel = (): void => {
    const levelOrder: SubagentDetailLevel[] = ['off', 'minimal', 'moderate', 'full'];
    const currentLevel = stores.subagent.getState().detailLevel;
    const currentIndex = levelOrder.indexOf(currentLevel);
    const nextLevel = levelOrder[(currentIndex + 1) % levelOrder.length] ?? 'moderate';
    stores.subagent.dispatch({ type: 'subagent/set-detail-level', detailLevel: nextLevel });
  };

  const drillIntoIteration = (): void => {
    const history = stores.history.getState();
    const iteration = history.iterations[history.selectedIndex];
    if (!iteration) {
      return;
    }

    stores.history.dispatch({ type: 'history/set-detail-iteration', iteration });
    stores.ui.dispatch({ type: 'ui/drill-into-iteration', iterationId: String(iteration.iteration) });
  };

  const goToIterationTask = (): void => {
    const detail = stores.history.getState().detailIteration;
    if (!detail) {
      stores.ui.dispatch({ type: 'ui/set-view-mode', viewMode: 'tasks' });
      return;
    }

    stores.ui.dispatch({ type: 'ui/select-task', taskId: detail.task.id });
    stores.tasks.dispatch({ type: 'tasks/select-task-by-id', taskId: detail.task.id });
    stores.ui.dispatch({ type: 'ui/set-view-mode', viewMode: 'tasks' });
  };

  return {
    uiStore: {
      selectors: {
        getActiveView: () => stores.ui.getState().viewMode,
        getSelectedTabIndex: () => stores.ui.getState().selectedTabIndex,
        getTabCount: () => stores.ui.getState().tabCount,
        getOverlay: () => stores.ui.getState().overlay,
        isViewingRemote: () => stores.ui.getState().selectedTabIndex > 0,
      },
      dispatchers: {
        cycleView: (direction) => {
          stores.ui.dispatch({ type: direction === 'next' ? 'ui/next-view' : 'ui/prev-view' });
        },
        cycleTab: (direction) => {
          stores.ui.dispatch({ type: direction === 'next' ? 'ui/next-tab' : 'ui/prev-tab' });
        },
        setSelectedTabIndex: (index) => {
          stores.ui.dispatch({ type: 'ui/set-selected-tab-index', index });
        },
        openOverlay: (overlay) => {
          const allowed = new Set([
            'help',
            'quit',
            'interrupt',
            'epicLoader',
            'remoteConfig',
            'remoteManagement',
            'runSummary',
          ]);
          if (!allowed.has(overlay)) {
            return;
          }

          stores.ui.dispatch({
            type: 'ui/open-overlay',
            overlay:
              overlay as
                | 'help'
                | 'quit'
                | 'interrupt'
                | 'epicLoader'
                | 'remoteConfig'
                | 'remoteManagement'
                | 'runSummary',
          });
        },
        closeOverlay: () => {
          stores.ui.dispatch({ type: 'ui/close-overlay' });
        },
        setView: (view) => {
          const allowed = new Set([
            'tasks',
            'iterations',
            'iteration-detail',
            'activity',
            'chat',
            'logs',
            'settings',
          ]);
          if (!allowed.has(view)) {
            return;
          }
          stores.ui.dispatch({
            type: 'ui/set-view-mode',
            viewMode:
              view as
                | 'tasks'
                | 'iterations'
                | 'iteration-detail'
                | 'activity'
                | 'chat'
                | 'logs'
                | 'settings',
          });
        },
        cycleFocus: () => {
          stores.ui.dispatch({ type: 'ui/cycle-focus' });
        },
        toggleDashboard: () => {
          stores.ui.dispatch({ type: 'ui/toggle-dashboard' });
        },
        toggleClosedTasks: () => {
          const nextShowClosed = !stores.ui.getState().showClosedTasks;
          stores.ui.dispatch({ type: 'ui/set-show-closed-tasks', show: nextShowClosed });
          stores.tasks.dispatch({ type: 'tasks/set-show-closed', showClosedTasks: nextShowClosed });
        },
        toggleSubagentPanel: () => {
          const isVisible = stores.subagent.getState().panelVisible;
          stores.subagent.dispatch({ type: 'subagent/set-panel-visible', visible: !isVisible });
          stores.subagent.dispatch({ type: 'subagent/set-user-manual-hide', hidden: isVisible });
        },
        cycleSubagentDetail: cycleSubagentDetailLevel,
        setDetailsViewMode: (mode) => {
          stores.ui.dispatch({ type: 'ui/set-details-view-mode', detailsViewMode: mode });
        },
        drillIntoIteration,
        backFromDetail: () => {
          stores.ui.dispatch({ type: 'ui/back-from-detail' });
          stores.history.dispatch({ type: 'history/set-detail-iteration', iteration: null });
        },
        goToIterationTask,
        refreshTasks: () => {
          stores.tasks.dispatch({ type: 'tasks/set-refreshing', refreshing: true });
          if (!engine) {
            stores.tasks.dispatch({ type: 'tasks/set-refreshing', refreshing: false });
            return;
          }

          let settled = false;
          const timeout = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            stores.tasks.dispatch({ type: 'tasks/set-refreshing', refreshing: false });
            stores.ui.dispatch({
              type: 'ui/push-toast',
              toast: {
                message: 'Task refresh timed out.',
                variant: 'error',
              },
            });
          }, 10_000);

          void Promise.resolve(engine.refreshTasks())
            .then(() => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timeout);
            })
            .catch((error: unknown) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timeout);
              stores.tasks.dispatch({ type: 'tasks/set-refreshing', refreshing: false });
              stores.ui.dispatch({
                type: 'ui/push-toast',
                toast: {
                  message: error instanceof Error ? error.message : 'Task refresh failed.',
                  variant: 'error',
                },
              });
            });
        },
        openEpicLoader: () => {
          stores.ui.dispatch({ type: 'ui/open-overlay', overlay: 'epicLoader' });
        },
        openRemoteConfig: () => {
          const ui = stores.ui.getState();
          const selected = ui.instances[ui.selectedTabIndex];
          stores.ui.dispatch({
            type: 'ui/set-remote-config-target',
            targetAlias: selected?.isLocal ? undefined : selected?.label,
          });
          stores.ui.dispatch({ type: 'ui/open-overlay', overlay: 'remoteConfig' });
        },
        openRemoteManagement: (mode) => {
          const ui = stores.ui.getState();
          const selected = ui.instances[ui.selectedTabIndex];
          stores.ui.dispatch({
            type: 'ui/set-remote-management-context',
            mode,
            targetAlias: selected?.isLocal ? undefined : selected?.label,
          });
          stores.ui.dispatch({ type: 'ui/open-overlay', overlay: 'remoteManagement' });
        },
        pruneWorktrees: () => {
          stores.ui.dispatch({
            type: 'ui/push-toast',
            toast: {
              message: 'Worktree prune requested.',
              variant: 'info',
              autoDismissMs: 3000,
            },
          });
        },
      },
    },
    phaseStore: {
      selectors: {
        getPhase: () => stores.phase.getState().status,
        isKeyboardCaptured: () => {
          const ui = stores.ui.getState();
          return ui.overlay !== null || ui.viewMode === 'settings';
        },
      },
      dispatchers: {
        requestQuit: () => {
          void engine?.stop();
          void onQuit?.();
        },
        toggleHelp: () => {
          const overlay = stores.ui.getState().overlay;
          if (overlay === 'help') {
            stores.ui.dispatch({ type: 'ui/close-overlay' });
            return;
          }
          stores.ui.dispatch({ type: 'ui/open-overlay', overlay: 'help' });
        },
        start: () => {
          const previousStatus = stores.phase.getState().status;
          stores.phase.dispatch({ type: 'phase/set-status', status: 'selecting' });

          const startOperation = onStart ? onStart() : engine?.start();
          if (!startOperation || typeof (startOperation as Promise<void>).then !== 'function') {
            return;
          }

          let settled = false;
          const timeout = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            stores.phase.dispatch({ type: 'phase/set-status', status: previousStatus });
            stores.ui.dispatch({
              type: 'ui/push-toast',
              toast: {
                message: 'Engine failed to start.',
                variant: 'error',
              },
            });
          }, 3000);

          void Promise.resolve(startOperation)
            .then(() => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timeout);
            })
            .catch((error: unknown) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timeout);
              stores.phase.dispatch({ type: 'phase/set-status', status: previousStatus });
              stores.ui.dispatch({
                type: 'ui/push-toast',
                toast: {
                  message: error instanceof Error ? error.message : 'Engine failed to start.',
                  variant: 'error',
                },
              });
            });
        },
        pause: () => {
          engine?.pause();
          stores.phase.dispatch({ type: 'phase/set-status', status: 'pausing' });
        },
        resume: () => {
          engine?.resume();
          stores.phase.dispatch({ type: 'phase/set-status', status: 'selecting' });
        },
        interrupt: () => {
          if (onInterruptConfirm) {
            void onInterruptConfirm();
          } else {
            void engine?.stop();
          }
          stores.phase.dispatch({ type: 'phase/set-status', status: 'stopped' });
        },
        cancelInterrupt: () => {
          onInterruptCancel?.();
        },
        addIterations: (count) => {
          void engine?.addIterations?.(count);
          const phase = stores.phase.getState();
          stores.phase.dispatch({
            type: 'phase/set-max-iterations',
            maxIterations: Math.max(phase.maxIterations + count, 0),
          });
        },
        removeIterations: (count) => {
          void engine?.removeIterations?.(count);
          const phase = stores.phase.getState();
          stores.phase.dispatch({
            type: 'phase/set-max-iterations',
            maxIterations: Math.max(phase.maxIterations - count, 0),
          });
        },
      },
    },
  };
}

const ErrorBoundaryComponent = ErrorBoundary as unknown as (
  props: ErrorBoundaryProps
) => ReactNode;

/**
 * Canonical RunApp shell wiring.
 */
export function RunApp({
  engine,
  cwd,
  initialTasks,
  storedConfig,
  availableAgents = [],
  availableTrackers = [],
  onSaveSettings,
  onLoadEpics,
  onEpicSwitch,
  onFilePathSwitch,
  trackerType,
  currentEpicId,
  instanceTabs,
  selectedTabIndex = 0,
  onSelectTab,
  instanceManager,
  onQuit,
  onStart,
  showInterruptDialog,
  onInterruptConfirm,
  onInterruptCancel,
  initialShowEpicLoader = false,
  initialSubagentPanelVisible = false,
  onSubagentPanelVisibilityChange,
  currentModel,
  agentPlugin,
  connectionToast,
  sandboxConfig,
  resolvedSandboxMode,
}: RunAppProps): ReactNode {
  const stores = useMemo(() => {
    const initialTaskItems = initialTasks ? convertTasksWithDependencyStatus(initialTasks) : [];
    const initialPhaseStatus = onStart
      ? 'ready'
      : initialTaskItems.length > 0
        ? 'running'
        : 'idle';

    return createTuiStores({
      tasks: {
        tasks: initialTaskItems,
      },
      phase: {
        status: initialPhaseStatus,
        currentModel,
      },
      ui: {
        selectedTabIndex,
        tabCount: Math.max(1, instanceTabs?.length ?? 1),
      },
      subagent: {
        panelVisible: initialSubagentPanelVisible,
      },
    });
  }, [
    initialTasks,
    instanceTabs?.length,
    selectedTabIndex,
    onStart,
    currentModel,
    initialSubagentPanelVisible,
  ]);

  useEventBridgeIntegration({ engine, stores });

  useEffect(() => {
    stores.ui.dispatch({
      type: 'ui/set-tab-count',
      count: Math.max(1, instanceTabs?.length ?? 1),
    });
    stores.ui.dispatch({
      type: 'ui/set-instances',
      instances:
        instanceTabs?.map((tab) => ({
          id: tab.id,
          label: tab.alias ?? tab.label,
          isLocal: tab.isLocal,
          status: tab.status,
        })) ?? [{ id: 'local', label: 'Local', isLocal: true, status: 'connected' }],
    });
    stores.ui.dispatch({
      type: 'ui/set-selected-tab-index',
      index: selectedTabIndex,
    });
  }, [instanceTabs, selectedTabIndex, stores]);

  const keyboardStores = useMemo(
    () =>
      createKeyboardStores(
        stores,
        engine,
        onQuit,
        onStart,
        onInterruptConfirm,
        onInterruptCancel
      ),
    [stores, engine, onQuit, onStart, onInterruptConfirm, onInterruptCancel]
  );

  const activeTabIndex = useSyncExternalStore(
    stores.ui.subscribe,
    () => stores.ui.getState().selectedTabIndex,
    () => stores.ui.getState().selectedTabIndex
  );

  const overlay = useSyncExternalStore(
    stores.ui.subscribe,
    () => stores.ui.getState().overlay,
    () => stores.ui.getState().overlay
  );

  const subagentPanelVisible = useSyncExternalStore(
    stores.subagent.subscribe,
    () => stores.subagent.getState().panelVisible,
    () => stores.subagent.getState().panelVisible
  );

  const lastPanelVisibilityRef = useRef<boolean>(subagentPanelVisible);
  useEffect(() => {
    if (!onSubagentPanelVisibilityChange) {
      return;
    }

    if (lastPanelVisibilityRef.current === subagentPanelVisible) {
      return;
    }

    lastPanelVisibilityRef.current = subagentPanelVisible;
    onSubagentPanelVisibilityChange(subagentPanelVisible);
  }, [subagentPanelVisible, onSubagentPanelVisibilityChange]);

  useEffect(() => {
    if (onSelectTab) {
      onSelectTab(activeTabIndex);
    }
  }, [activeTabIndex, onSelectTab]);

  const hasOpenedInitialEpicLoaderRef = useRef(false);
  useEffect(() => {
    if (!initialShowEpicLoader || hasOpenedInitialEpicLoaderRef.current) {
      return;
    }

    hasOpenedInitialEpicLoaderRef.current = true;
    stores.ui.dispatch({ type: 'ui/open-overlay', overlay: 'epicLoader' });
  }, [initialShowEpicLoader, stores]);

  useEffect(() => {
    if (typeof showInterruptDialog !== 'boolean') {
      return;
    }

    if (showInterruptDialog && overlay !== 'interrupt') {
      stores.ui.dispatch({ type: 'ui/open-overlay', overlay: 'interrupt' });
      return;
    }

    if (!showInterruptDialog && overlay === 'interrupt') {
      stores.ui.dispatch({ type: 'ui/close-overlay' });
    }
  }, [showInterruptDialog, overlay, stores]);

  const lastConnectionToastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!connectionToast) {
      return;
    }

    const toastKey = JSON.stringify(connectionToast);
    if (toastKey === lastConnectionToastKeyRef.current) {
      return;
    }

    lastConnectionToastKeyRef.current = toastKey;
    const formatted = formatConnectionToast(connectionToast);
    stores.ui.dispatch({
      type: 'ui/push-toast',
      toast: {
        message: formatted.message,
        variant: formatted.variant,
        autoDismissMs: 3000,
      },
    });
  }, [connectionToast, stores]);

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: colors.bg.primary,
      }}
    >
      <TuiProvider stores={stores}>
        <DataSourceProvider
          selectedTabIndex={activeTabIndex}
          tabs={toDataSourceTabs(instanceTabs)}
        >
          <ErrorBoundaryComponent context="run-app-v2">
            <KeyboardManager
              uiStore={keyboardStores.uiStore}
              phaseStore={keyboardStores.phaseStore}
            />
            <AppShell
              onQuit={onQuit}
              cwd={cwd}
              storedConfig={storedConfig}
              availableAgents={availableAgents}
              availableTrackers={availableTrackers}
              onSaveSettings={onSaveSettings}
              onLoadEpics={onLoadEpics}
              onEpicSwitch={onEpicSwitch}
              onFilePathSwitch={onFilePathSwitch}
              trackerType={trackerType}
              currentEpicId={currentEpicId}
              instanceManager={instanceManager}
              agentPlugin={agentPlugin}
              sandboxConfig={sandboxConfig}
              resolvedSandboxMode={resolvedSandboxMode}
            />
          </ErrorBoundaryComponent>
        </DataSourceProvider>
      </TuiProvider>
    </box>
  );
}

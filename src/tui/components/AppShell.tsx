/**
 * ABOUTME: V2 TUI shell that renders store-driven views, overlays, and shortcuts.
 * Composes Header/Tab bars/content/footer and maps UIStore state to active views.
 */

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { SandboxConfig, SandboxMode } from '../../config/types.js';
import type { ConnectionStatus, InstanceTab } from '../../remote/client.js';
import type { IterationStatus, SubagentTreeNode } from '../../engine/types.js';
import type { ChatMessage } from '../../chat/types.js';
import type { StoredConfig } from '../../config/types.js';
import type { AgentPluginMeta } from '../../plugins/agents/types.js';
import type { TrackerPluginMeta } from '../../plugins/trackers/types.js';
import type { TrackerTask } from '../../plugins/trackers/types.js';
import type { InstanceManager } from '../../remote/instance-manager.js';
import { addRemote, getRemote, removeRemote } from '../../remote/config.js';
import { colors } from '../theme.js';
import { ActiveView, type ViewRegistry } from './ActiveView.js';
import { ActivityView } from './ActivityView.js';
import { ChatView } from './ChatView.js';
import { ConfirmationDialog } from './ConfirmationDialog.js';
import { DashboardBanner } from './DashboardBanner.js';
import { EpicLoaderOverlay, type EpicLoaderMode } from './EpicLoaderOverlay.js';
import { Footer } from './Footer.js';
import { FocusRegion } from './FocusRegion.js';
import { Header } from './Header.js';
import { HelpOverlay } from './HelpOverlay.js';
import { IterationDetailView } from './IterationDetailView.js';
import { IterationHistoryView } from './IterationHistoryView.js';
import {
  formatKeyboardBindingsForFooter,
  getKeyboardBindingsForContext,
} from './KeyboardManager.js';
import { LeftPanel } from './LeftPanel.js';
import { LogPane } from './LogPane.js';
import { OverlayLayer } from './OverlayLayer.js';
import { RemoteConfigView, type RemoteConfigData } from './RemoteConfigView.js';
import {
  RemoteManagementOverlay,
  type ExistingRemoteData,
} from './RemoteManagementOverlay.js';
import { RightPanel } from './RightPanel.js';
import { RunSummaryOverlay } from './RunSummaryOverlay.js';
import { SettingsView } from './SettingsView.js';
import { SubagentTreePanel } from './SubagentTreePanel.js';
import { TabBar } from './TabBar.js';
import { ToastContainer } from './ToastContainer.js';
import { ViewTabBar } from './ViewTabBar.js';
import {
  useTuiHistoryDispatch,
  useTuiHistorySelector,
  useTuiOutputSelector,
  useTuiRawLog,
  useTuiPhaseSelector,
  useTuiPipelineDispatch,
  useTuiPipelineSelector,
  useTuiSubagentSelector,
  useTuiTaskSelector,
  useTuiUIDispatch,
  useTuiUISelector,
} from '../stores/tui-provider.js';
import { VIEW_TAB_ORDER, type ViewMode } from '../stores/ui-store.js';
import type { TaskItem } from '../types.js';

/**
 * Primary tab-stoppable app shell views.
 */
export type AppShellView = Exclude<ViewMode, 'iteration-detail'>;

const VIEW_DEFINITIONS: Array<{ id: AppShellView; label: string }> = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'iterations', label: 'Iterations' },
  { id: 'activity', label: 'Activity' },
  { id: 'chat', label: 'Chat' },
  { id: 'logs', label: 'Logs' },
  { id: 'settings', label: 'Settings' },
];

const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];

/**
 * Resolve the next shell tab view in cyclic order.
 */
export function getNextAppShellView(currentView: AppShellView, direction: 1 | -1): AppShellView {
  const currentIndex = VIEW_TAB_ORDER.indexOf(currentView);
  if (currentIndex < 0) {
    return 'tasks';
  }

  const nextIndex = (currentIndex + direction + VIEW_TAB_ORDER.length) % VIEW_TAB_ORDER.length;
  const nextView = VIEW_TAB_ORDER[nextIndex] ?? 'tasks';
  return nextView as AppShellView;
}

/**
 * Numeric view hotkeys are intentionally disabled in V2 to avoid conflicts.
 */
export function getAppShellViewFromHotkey(_keyName: string): AppShellView | null {
  return null;
}

/**
 * AppShell props.
 */
export interface AppShellProps {
  /** Optional quit callback reserved for shell-level escape hatches. */
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
  /** Optional instance manager for remote operations. */
  instanceManager?: InstanceManager;
  /** Optional selected agent plugin name (shown in header). */
  agentPlugin?: string;
  /** Optional sandbox config for header display. */
  sandboxConfig?: SandboxConfig;
  /** Optional resolved sandbox mode for header display. */
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>;
}

function phaseToIterationStatus(phase: string): IterationStatus {
  if (phase === 'error') {
    return 'failed';
  }
  if (phase === 'complete') {
    return 'completed';
  }
  if (phase === 'paused' || phase === 'stopped') {
    return 'interrupted';
  }
  if (phase === 'ready' || phase === 'idle') {
    return 'running';
  }
  return 'running';
}

function toInstanceTabs(instances: InstanceTab[]): InstanceTab[] {
  if (instances.length > 0) {
    return instances;
  }

  return [
    {
      id: 'local',
      label: 'Local',
      isLocal: true,
      status: 'connected',
    },
  ];
}

function resolveSelectedTask(
  tasks: TaskItem[],
  selectedTaskId: string | undefined,
  selectedIndex: number
): TaskItem | null {
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

function getTaskStats(tasks: TaskItem[]): {
  total: number;
  completed: number;
  active: number;
  blocked: number;
  queued: number;
  failed: number;
} {
  let completed = 0;
  let active = 0;
  let blocked = 0;
  let queued = 0;
  let failed = 0;

  for (const task of tasks) {
    if (task.status === 'done' || task.status === 'closed') {
      completed += 1;
    } else if (task.status === 'active') {
      active += 1;
    } else if (task.status === 'blocked') {
      blocked += 1;
    } else if (task.status === 'error') {
      failed += 1;
    } else {
      queued += 1;
    }
  }

  return {
    total: tasks.length,
    completed,
    active,
    blocked,
    queued,
    failed,
  };
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return undefined;
  }
}

async function loadLocalConfigData(cwd: string): Promise<RemoteConfigData> {
  const globalPath = join(homedir(), '.config', 'ralph-tui', 'config.toml');
  const projectPath = join(cwd, '.ralph-tui', 'config.toml');

  const [globalContent, projectContent] = await Promise.all([
    readOptionalFile(globalPath),
    readOptionalFile(projectPath),
  ]);

  return {
    globalExists: globalContent !== undefined,
    projectExists: projectContent !== undefined,
    globalPath: globalContent !== undefined ? globalPath : undefined,
    projectPath: projectContent !== undefined ? projectPath : undefined,
    globalContent,
    projectContent,
    remoteCwd: cwd,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Main V2 shell that renders the currently selected UIStore view.
 */
export function AppShell(props: AppShellProps): ReactNode {
  const phase = useTuiPhaseSelector((state) => state);
  const ui = useTuiUISelector((state) => state);
  const tasksState = useTuiTaskSelector((state) => state);
  const output = useTuiOutputSelector((state) => state);
  const rawLog = useTuiRawLog();
  const history = useTuiHistorySelector((state) => state);
  const pipeline = useTuiPipelineSelector((state) => state);
  const subagent = useTuiSubagentSelector((state) => state);
  const uiDispatch = useTuiUIDispatch();
  const historyDispatch = useTuiHistoryDispatch();
  const pipelineDispatch = useTuiPipelineDispatch();

  const [remoteConfigData, setRemoteConfigData] = useState<RemoteConfigData | null>(null);
  const [remoteConfigLoading, setRemoteConfigLoading] = useState(false);
  const [remoteConfigError, setRemoteConfigError] = useState<string | undefined>(undefined);

  const [epicLoaderEpics, setEpicLoaderEpics] = useState<TrackerTask[]>([]);
  const [epicLoaderLoading, setEpicLoaderLoading] = useState(false);
  const [epicLoaderError, setEpicLoaderError] = useState<string | undefined>(undefined);

  const [editingRemote, setEditingRemote] = useState<ExistingRemoteData | undefined>(undefined);

  const runtimeCwd = props.cwd ?? process.cwd();

  const tabs = useMemo(
    () =>
      toInstanceTabs(
        ui.instances.map((tab) => ({
          id: tab.id,
          label: tab.label,
          isLocal: tab.isLocal,
          status: (tab.status ?? 'connected') as ConnectionStatus,
          alias: tab.isLocal ? undefined : tab.label,
        }))
      ),
    [ui.instances]
  );

  const selectedTab = tabs[ui.selectedTabIndex];
  const isViewingRemote = ui.selectedTabIndex > 0;
  const selectedRemoteAlias = useMemo(() => {
    if (!isViewingRemote) {
      return undefined;
    }
    return selectedTab?.alias ?? selectedTab?.label;
  }, [isViewingRemote, selectedTab]);

  const visibleTasks = useMemo(() => {
    if (tasksState.showClosedTasks) {
      return tasksState.tasks;
    }
    return tasksState.tasks.filter((task) => task.status !== 'closed');
  }, [tasksState.showClosedTasks, tasksState.tasks]);

  const selectedTask = useMemo(
    () => resolveSelectedTask(visibleTasks, ui.selectedTaskId, tasksState.selectedIndex),
    [visibleTasks, ui.selectedTaskId, tasksState.selectedIndex]
  );

  const taskStats = useMemo(() => getTaskStats(tasksState.tasks), [tasksState.tasks]);

  const currentSubagentTree = (ui.selectedTabIndex > 0 ? subagent.remoteTree : subagent.tree) as SubagentTreeNode[];

  const trackerName =
    props.trackerType ?? props.storedConfig?.defaultTracker ?? props.storedConfig?.tracker ?? 'beads';
  const epicLoaderMode: EpicLoaderMode = props.trackerType === 'json' ? 'file-prompt' : 'list';

  const pushToast = useCallback(
    (message: string, variant: 'info' | 'success' | 'warning' | 'error', autoDismissMs = 3000) => {
      uiDispatch({
        type: 'ui/push-toast',
        toast: {
          message,
          variant,
          autoDismissMs,
        },
      });
    },
    [uiDispatch]
  );

  const closeOverlay = useCallback(() => {
    uiDispatch({ type: 'ui/close-overlay' });
  }, [uiDispatch]);

  useEffect(() => {
    if (ui.overlay !== 'epicLoader') {
      return;
    }

    if (epicLoaderMode === 'file-prompt') {
      setEpicLoaderLoading(false);
      setEpicLoaderError(undefined);
      return;
    }

    if (!props.onLoadEpics) {
      setEpicLoaderLoading(false);
      setEpicLoaderError('Epic loading is not configured for this run.');
      setEpicLoaderEpics([]);
      return;
    }

    let cancelled = false;
    setEpicLoaderLoading(true);
    setEpicLoaderError(undefined);

    withTimeout(props.onLoadEpics(), 5000, 'Epic loading timed out.')
      .then((epics) => {
        if (cancelled) {
          return;
        }
        setEpicLoaderEpics(epics);
        setEpicLoaderLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load epics.';
        setEpicLoaderError(message);
        pushToast(message, 'error');
        setEpicLoaderLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ui.overlay, epicLoaderMode, props.onLoadEpics, pushToast]);

  useEffect(() => {
    if (ui.overlay !== 'remoteConfig') {
      return;
    }

    let cancelled = false;
    setRemoteConfigLoading(true);
    setRemoteConfigError(undefined);
    setRemoteConfigData(null);

    if (isViewingRemote) {
      if (!props.instanceManager) {
        setRemoteConfigError('Instance manager not available for remote config view.');
        setRemoteConfigLoading(false);
        return;
      }

      withTimeout(props.instanceManager.checkRemoteConfig(), 10000, 'Failed to fetch remote state.')
        .then((data) => {
          if (cancelled) {
            return;
          }
          if (!data) {
            setRemoteConfigError('Failed to fetch remote configuration.');
            setRemoteConfigLoading(false);
            return;
          }
          setRemoteConfigData(data);
          setRemoteConfigLoading(false);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          setRemoteConfigError(error instanceof Error ? error.message : 'Failed to fetch remote configuration.');
          setRemoteConfigLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }

    withTimeout(loadLocalConfigData(runtimeCwd), 10000, 'Failed to load local config.')
      .then((data) => {
        if (cancelled) {
          return;
        }
        setRemoteConfigData(data);
        setRemoteConfigLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setRemoteConfigError(error instanceof Error ? error.message : 'Failed to load local config.');
        setRemoteConfigLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ui.overlay, isViewingRemote, props.instanceManager, runtimeCwd]);

  useEffect(() => {
    if (ui.overlay !== 'remoteManagement') {
      return;
    }

    if (ui.remoteManagementMode === 'add') {
      setEditingRemote(undefined);
      return;
    }

    const alias = ui.remoteManagementTargetAlias ?? selectedRemoteAlias;
    if (!alias) {
      setEditingRemote(undefined);
      return;
    }

    let cancelled = false;
    getRemote(alias)
      .then((config) => {
        if (cancelled) {
          return;
        }
        if (!config) {
          setEditingRemote(undefined);
          pushToast(`Remote '${alias}' was not found in config.`, 'warning');
          return;
        }
        setEditingRemote({
          alias,
          host: config.host,
          port: config.port,
          token: config.token,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setEditingRemote(undefined);
        pushToast(
          error instanceof Error
            ? `Failed to load remote '${alias}': ${error.message}`
            : `Failed to load remote '${alias}'.`,
          'error'
        );
      });

    return () => {
      cancelled = true;
    };
  }, [
    ui.overlay,
    ui.remoteManagementMode,
    ui.remoteManagementTargetAlias,
    selectedRemoteAlias,
    pushToast,
  ]);

  const handleSaveSettings = useCallback(
    async (nextConfig: StoredConfig) => {
      if (!props.onSaveSettings) {
        pushToast('Settings save callback is not configured.', 'warning');
        return;
      }

      await props.onSaveSettings(nextConfig);
    },
    [props.onSaveSettings, pushToast]
  );

  const handleEpicSelect = useCallback(
    async (epic: TrackerTask) => {
      if (!props.onEpicSwitch) {
        pushToast('Epic switch callback is not configured.', 'warning');
        closeOverlay();
        return;
      }

      await props.onEpicSwitch(epic);
      pushToast(`Switched to epic: ${epic.id}`, 'success');
      closeOverlay();
    },
    [props.onEpicSwitch, closeOverlay, pushToast]
  );

  const handleFilePathSwitch = useCallback(
    async (path: string) => {
      if (!props.onFilePathSwitch) {
        setEpicLoaderError('File path switching is not configured.');
        return;
      }

      const success = await props.onFilePathSwitch(path);
      if (success) {
        pushToast(`Loaded PRD: ${path}`, 'success');
        closeOverlay();
      } else {
        setEpicLoaderError(`Failed to load file: ${path}`);
      }
    },
    [props.onFilePathSwitch, closeOverlay, pushToast]
  );

  const handleRemoteSave = useCallback(
    async (data: { alias: string; host: string; port: number; token: string }) => {
      const instanceManager = props.instanceManager;
      if (!instanceManager) {
        throw new Error('Instance manager not available');
      }

      if (ui.remoteManagementMode === 'add') {
        const addResult = await addRemote(data.alias, data.host, data.port, data.token);
        if (!addResult.success) {
          throw new Error(addResult.error ?? 'Failed to add remote');
        }

        await withTimeout(
          instanceManager.addAndConnectRemote(data.alias, data.host, data.port, data.token),
          15000,
          `Connection to ${data.alias} timed out.`
        );
        const newIndex = instanceManager.getTabIndexByAlias(data.alias);
        if (newIndex >= 0) {
          uiDispatch({ type: 'ui/set-selected-tab-index', index: newIndex });
        }

        pushToast(`Remote added: ${data.alias}`, 'success');
        closeOverlay();
        return;
      }

      if (!editingRemote) {
        throw new Error('No remote selected for edit');
      }

      if (editingRemote.alias !== data.alias) {
        const removeOld = await removeRemote(editingRemote.alias);
        if (!removeOld.success) {
          throw new Error(removeOld.error ?? `Failed to remove remote ${editingRemote.alias}`);
        }

        instanceManager.removeTab(editingRemote.alias);

        const addNew = await addRemote(data.alias, data.host, data.port, data.token);
        if (!addNew.success) {
          throw new Error(addNew.error ?? `Failed to add remote ${data.alias}`);
        }

        await withTimeout(
          instanceManager.addAndConnectRemote(data.alias, data.host, data.port, data.token),
          15000,
          `Connection to ${data.alias} timed out.`
        );
      } else {
        const removeCurrent = await removeRemote(data.alias);
        if (!removeCurrent.success) {
          throw new Error(removeCurrent.error ?? `Failed to update remote ${data.alias}`);
        }

        const addCurrent = await addRemote(data.alias, data.host, data.port, data.token);
        if (!addCurrent.success) {
          throw new Error(addCurrent.error ?? `Failed to update remote ${data.alias}`);
        }

        await withTimeout(
          instanceManager.reconnectRemote(data.alias, data.host, data.port, data.token),
          15000,
          `Connection to ${data.alias} timed out.`
        );
      }

      const updatedIndex = instanceManager.getTabIndexByAlias(data.alias);
      if (updatedIndex >= 0) {
        uiDispatch({ type: 'ui/set-selected-tab-index', index: updatedIndex });
      }

      pushToast(`Remote updated: ${data.alias}`, 'success');
      closeOverlay();
    },
    [props.instanceManager, ui.remoteManagementMode, editingRemote, uiDispatch, pushToast, closeOverlay]
  );

  const handleRemoteDelete = useCallback(
    async (alias: string) => {
      const instanceManager = props.instanceManager;
      if (!instanceManager) {
        throw new Error('Instance manager not available');
      }

      const removeResult = await removeRemote(alias);
      if (!removeResult.success) {
        throw new Error(removeResult.error ?? `Failed to remove remote ${alias}`);
      }

      instanceManager.removeTab(alias);
      uiDispatch({ type: 'ui/set-selected-tab-index', index: 0 });
      pushToast(`Remote removed: ${alias}`, 'success');
      closeOverlay();
    },
    [props.instanceManager, uiDispatch, pushToast, closeOverlay]
  );

  const handleRunSummaryAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case 'pruneWorktrees':
          pipelineDispatch({ type: 'pipeline/set-pruning', pruning: true });
          pipelineDispatch({ type: 'pipeline/set-pruning', pruning: false });
          pushToast('Worktree prune requested.', 'info');
          return;
        case 'syncMain':
          pushToast('Main sync action requested.', 'info');
          return;
        case 'deleteBranches':
          pushToast('Delete branches action requested.', 'info');
          return;
        case 'push':
          pushToast('Push action requested.', 'info');
          return;
        default:
          pushToast(`Action requested: ${actionId}`, 'info');
      }
    },
    [pipelineDispatch, pushToast]
  );

  const viewRegistry: ViewRegistry = {
    tasks: () => (
      <box
        style={{
          width: '100%',
          height: '100%',
          flexDirection: 'row',
          gap: 1,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            width: '35%',
            minWidth: 30,
            maxWidth: 54,
            flexDirection: 'column',
          }}
        >
          <FocusRegion
            isFocused={ui.focusPerView[ui.viewMode] === 'taskList'}
            title="▸ Task List"
            border={false}
          >
            <LeftPanel
              tasks={visibleTasks}
              selectedIndex={tasksState.selectedIndex}
              isFocused={ui.focusPerView[ui.viewMode] === 'taskList'}
              isViewingRemote={isViewingRemote}
            />
          </FocusRegion>
        </box>

        <box
          style={{
            flexGrow: 1,
            flexDirection: 'row',
            gap: 1,
          }}
        >
          <box
            style={{
              flexGrow: 1,
              flexDirection: 'column',
              minWidth: 40,
            }}
          >
            <FocusRegion
              isFocused={
                ui.focusPerView[ui.viewMode] === 'outputPane' ||
                ui.focusPerView[ui.viewMode] === 'taskDetail'
              }
              title="▸ Task Detail"
              border={false}
            >
              <RightPanel
                selectedTask={selectedTask}
                currentIteration={phase.currentIteration}
                iterationOutput={output.currentOutput}
                cliOutput={output.currentCliOutput}
                iterationSegments={output.currentSegments}
                viewMode={ui.detailsViewMode}
                agentName={phase.activeAgentState?.plugin}
                currentModel={phase.currentModel}
                isFocused={
                  ui.focusPerView[ui.viewMode] === 'outputPane' ||
                  ui.focusPerView[ui.viewMode] === 'taskDetail'
                }
                isViewingRemote={isViewingRemote}
              />
            </FocusRegion>
          </box>

          {subagent.panelVisible ? (
            <box
              style={{
                width: '30%',
                minWidth: 26,
                maxWidth: 46,
                flexDirection: 'column',
              }}
            >
              <FocusRegion
                isFocused={ui.focusPerView[ui.viewMode] === 'subagentTree'}
                title="▸ Subagents"
                border={false}
              >
                <SubagentTreePanel
                  tree={currentSubagentTree}
                  currentTaskId={selectedTask?.id}
                  currentTaskTitle={selectedTask?.title}
                  selectedId={subagent.selectedSubagentId}
                  isFocused={ui.focusPerView[ui.viewMode] === 'subagentTree'}
                />
              </FocusRegion>
            </box>
          ) : null}
        </box>
      </box>
    ),

    iterations: () => (
      <box style={{ width: '100%', height: '100%', paddingLeft: 1, paddingRight: 1 }}>
        <IterationHistoryView
          iterations={history.iterations}
          totalIterations={Math.max(history.totalIterations, history.iterations.length)}
          selectedIndex={history.selectedIndex}
          runningIteration={phase.currentIteration}
          subagentStats={subagent.statsCache}
          onIterationDrillDown={(iteration) => {
            historyDispatch({ type: 'history/set-detail-iteration', iteration });
            uiDispatch({ type: 'ui/drill-into-iteration', iterationId: String(iteration.iteration) });
          }}
        />
      </box>
    ),

    'iteration-detail': () => {
      const detail = history.detailIteration ?? history.iterations[history.selectedIndex] ?? null;
      if (!detail) {
        return (
          <box style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
            <text fg={colors.fg.muted}>No iteration selected. Press Enter in Iterations view.</text>
          </box>
        );
      }

      return (
        <box style={{ width: '100%', height: '100%', paddingLeft: 1, paddingRight: 1 }}>
          <IterationDetailView
            iteration={detail}
            totalIterations={Math.max(history.totalIterations, history.iterations.length)}
            subagentTree={subagent.iterationDetailTree}
            subagentStats={subagent.iterationDetailStats}
            subagentTraceLoading={subagent.iterationDetailLoading}
            onBack={() => {
              uiDispatch({ type: 'ui/back-from-detail' });
              historyDispatch({ type: 'history/set-detail-iteration', iteration: null });
            }}
          />
        </box>
      );
    },

    activity: () => (
      <box style={{ width: '100%', height: '100%', paddingLeft: 1, paddingRight: 1 }}>
        <ActivityView
          currentIteration={phase.currentIteration}
          maxIterations={phase.maxIterations}
          currentTaskId={phase.currentTaskId}
          currentTaskTitle={phase.currentTaskTitle}
          currentStatus={phaseToIterationStatus(phase.status)}
          timerStartMs={phase.runStartedAtMs}
          timerStatus={phase.status}
          isExecuting={
            phase.status === 'running' || phase.status === 'executing' || phase.status === 'selecting'
          }
          subagentTree={currentSubagentTree}
          subagentStats={subagent.statsCache.get(phase.currentIteration)}
          iterations={history.iterations}
          activityEvents={history.activityEvents}
        />
      </box>
    ),

    chat: () => (
      <box style={{ width: '100%', height: '100%', paddingLeft: 1, paddingRight: 1 }}>
        <ChatView
          title="Agent Chat"
          subtitle="Live agent conversation"
          messages={EMPTY_CHAT_MESSAGES}
          inputValue=""
          isLoading={phase.status === 'running' || phase.status === 'executing'}
          streamingChunk={output.currentOutput}
          agentName={phase.activeAgentState?.plugin}
        />
      </box>
    ),

    logs: () => (
      <box style={{ width: '100%', height: '100%', paddingLeft: 1, paddingRight: 1 }}>
        <LogPane
          taskTitle={selectedTask?.title}
          taskId={selectedTask?.id}
          currentIteration={phase.currentIteration}
          iterationOutput={rawLog}
          currentModel={phase.currentModel}
          agentName={phase.activeAgentState?.plugin}
          isFocused={ui.focusPerView[ui.viewMode] === 'logPane'}
        />
      </box>
    ),

    settings: () => (
      <box style={{ width: '100%', height: '100%' }}>
        <SettingsView
          visible
          config={props.storedConfig ?? {}}
          agents={props.availableAgents ?? []}
          trackers={props.availableTrackers ?? []}
          onSave={handleSaveSettings}
          onClose={() => uiDispatch({ type: 'ui/set-view-mode', viewMode: 'tasks' })}
        />
      </box>
    ),
  };

  const runElapsedSeconds = useMemo(() => {
    if (!phase.runStartedAtMs) {
      return 0;
    }
    const endMs = phase.runEndedAtMs ?? Date.now();
    return Math.max(0, Math.floor((endMs - phase.runStartedAtMs) / 1000));
  }, [phase.runStartedAtMs, phase.runEndedAtMs]);

  const helpBindings = useMemo(
    () =>
      getKeyboardBindingsForContext({
        view: ui.viewMode,
        overlay: null,
        phase: phase.status,
        isViewingRemote,
      }),
    [ui.viewMode, phase.status, isViewingRemote]
  );

  const footerHint = useMemo(
    () =>
      formatKeyboardBindingsForFooter(
        getKeyboardBindingsForContext({
          view: ui.viewMode,
          overlay: ui.overlay,
          phase: phase.status,
          isViewingRemote,
        })
      ),
    [ui.viewMode, ui.overlay, phase.status, isViewingRemote]
  );

  const overlayNode = (() => {
    if (!ui.overlay) {
      return null;
    }

    if (ui.overlay === 'help') {
      return (
        <HelpOverlay
          visible
          shortcuts={helpBindings}
        />
      );
    }

    if (ui.overlay === 'quit') {
      return (
        <ConfirmationDialog
          visible
          title="Quit Ralph?"
          message="Stop current run and exit."
        />
      );
    }

    if (ui.overlay === 'interrupt') {
      return (
        <ConfirmationDialog
          visible
          title="Interrupt Execution?"
          message="Current run will be stopped immediately."
        />
      );
    }

    if (ui.overlay === 'remoteConfig') {
      return (
        <RemoteConfigView
          visible
          remoteAlias={
            isViewingRemote ? ui.remoteConfigTargetAlias ?? selectedRemoteAlias ?? 'remote' : 'Local'
          }
          configData={remoteConfigData}
          loading={remoteConfigLoading}
          error={remoteConfigError}
          onClose={closeOverlay}
        />
      );
    }

    if (ui.overlay === 'epicLoader') {
      return (
        <EpicLoaderOverlay
          visible
          mode={epicLoaderMode}
          epics={epicLoaderEpics}
          loading={epicLoaderLoading}
          error={epicLoaderError}
          trackerName={trackerName}
          currentEpicId={props.currentEpicId}
          onSelect={(epic) => {
            void handleEpicSelect(epic);
          }}
          onCancel={closeOverlay}
          onFilePath={(path) => {
            void handleFilePathSwitch(path);
          }}
        />
      );
    }

    if (ui.overlay === 'remoteManagement') {
      return (
        <RemoteManagementOverlay
          visible
          mode={ui.remoteManagementMode}
          existingRemote={editingRemote}
          onSave={(data) => handleRemoteSave(data)}
          onDelete={(alias) => handleRemoteDelete(alias)}
          onClose={closeOverlay}
        />
      );
    }

    if (ui.overlay === 'runSummary') {
      return (
        <RunSummaryOverlay
          visible
          status={phase.status === 'error' ? 'error' : 'complete'}
          elapsedTime={runElapsedSeconds}
          totalTasks={taskStats.total}
          completedTasks={taskStats.completed}
          failedTasks={taskStats.failed + pipeline.runFailures.length}
          pendingMainTasks={pipeline.pendingMainTasks.length}
          mergeStats={pipeline.mergeStats}
          mainSyncStatus={{
            hasFailure: Boolean(pipeline.mainSyncFailureReason),
            failureReason: pipeline.mainSyncFailureReason,
          }}
          failures={pipeline.runFailures}
          pendingMainTasksList={pipeline.pendingMainTasks}
          onCleanupAction={handleRunSummaryAction}
          onClose={closeOverlay}
        />
      );
    }

    return (
      <ConfirmationDialog
        visible
        title="Overlay"
        message={`Overlay '${ui.overlay}' is not supported in this context.`}
        hint="Esc Close"
      />
    );
  })();

  return (
    <OverlayLayer overlay={overlayNode}>
      <box
        style={{
          width: '100%',
          height: '100%',
          flexDirection: 'column',
          backgroundColor: colors.bg.primary,
        }}
      >
        {tabs.length > 1 ? (
          <TabBar
            tabs={tabs}
            selectedIndex={ui.selectedTabIndex}
          />
        ) : null}

        <ViewTabBar
          currentView={ui.viewMode}
          views={VIEW_DEFINITIONS.map((view) => ({ id: view.id, label: view.label }))}
        />

        <Header
          status={phase.status}
          timerStartMs={phase.runStartedAtMs}
          currentTaskId={phase.currentTaskId}
          currentTaskTitle={phase.currentTaskTitle}
          completedTasks={taskStats.completed}
          totalTasks={taskStats.total}
          currentIteration={phase.currentIteration}
          maxIterations={phase.maxIterations}
          agentName={props.agentPlugin}
          trackerName={trackerName}
          activeAgentState={phase.activeAgentState}
          rateLimitState={phase.rateLimitState}
          currentModel={phase.currentModel}
          sandboxConfig={props.sandboxConfig}
          resolvedSandboxMode={props.resolvedSandboxMode}
          trackerRealtimeStatus={phase.trackerRealtimeStatus}
          remoteInfo={
            isViewingRemote
              ? { name: tabs[ui.selectedTabIndex]?.label ?? 'remote', host: 'remote', port: 0 }
              : undefined
          }
        />

        {ui.showDashboard ? (
          <DashboardBanner
            executionMode={pipeline.parallelIterations.size > 0 ? 'parallel' : 'sequential'}
            totalTasks={taskStats.total}
            activeTasks={taskStats.active}
            queuedTasks={taskStats.queued}
            blockedTasks={taskStats.blocked}
            completedTasks={taskStats.completed}
            failedTasks={taskStats.failed + pipeline.runFailures.length}
            worktreeCount={pipeline.worktreeHealthSummary.total}
            worktreeActive={pipeline.worktreeHealthSummary.active}
            worktreeLocked={pipeline.worktreeHealthSummary.locked}
            worktreeStale={pipeline.worktreeHealthSummary.stale}
            worktreePrunable={pipeline.worktreeHealthSummary.prunable}
            mergesQueued={pipeline.mergeStats.queued}
            mergesSucceeded={pipeline.mergeStats.merged}
            mergesFailed={pipeline.mergeStats.failed}
            mainSyncPending={pipeline.mergeStats.syncPending}
            validationsQueued={pipeline.validationStats.queued}
            validating={pipeline.validationStats.running}
            lastValidationStatus={pipeline.validationStats.lastStatus}
          />
        ) : null}

        <box
          style={{
            flexGrow: 1,
            minHeight: 1,
            flexDirection: 'column',
          }}
        >
          <ActiveView
            viewId={ui.viewMode}
            views={viewRegistry}
          />
        </box>

        <ToastContainer
          toasts={ui.toasts.map((toast) => ({
            id: toast.id,
            message: toast.message,
            variant: toast.variant,
            createdAtMs: toast.createdAtMs,
            autoDismissMs: toast.autoDismissMs,
          }))}
          paused={ui.overlay !== null}
          visible={ui.overlay === null}
          onExpire={(id) => uiDispatch({ type: 'ui/dismiss-toast', id })}
        />

        <Footer
          shortcutHints={footerHint}
          sandboxMode={
            props.resolvedSandboxMode
              ? props.sandboxConfig?.network === false
                ? `${props.resolvedSandboxMode} (no-net)`
                : props.resolvedSandboxMode
              : null
          }
          remoteAlias={isViewingRemote ? selectedRemoteAlias ?? selectedTab?.label ?? null : null}
          remoteConnectionStatus={selectedTab?.status}
          autoCommitEnabled={props.storedConfig?.autoCommit !== false}
        />
      </box>
    </OverlayLayer>
  );
}

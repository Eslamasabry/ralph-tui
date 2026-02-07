/**
 * ABOUTME: External store slice for TUI presentation state and modal visibility.
 * Tracks active views, panel focus, overlays, tab state, and transient feedback.
 */

import type { DetailsViewMode } from '../types.js';
import {
  applyPatch,
  createExternalStore,
  useStoreDispatch,
  useStoreSelector,
  type ExternalStore,
  type StoreSelector,
} from './store-utils.js';

export type ViewMode = 'tasks' | 'iterations' | 'iteration-detail' | 'activity' | 'chat' | 'logs' | 'settings';

export type PanelId =
  | 'taskList'
  | 'taskDetail'
  | 'outputPane'
  | 'subagentTree'
  | 'iterationList'
  | 'iterationDetail'
  | 'activityList'
  | 'chatPane'
  | 'logPane'
  | 'settingsList';

export type OverlayId =
  | 'help'
  | 'quit'
  | 'interrupt'
  | 'epicLoader'
  | 'remoteConfig'
  | 'remoteManagement'
  | 'runSummary';

export type FocusedPane = 'output' | 'subagentTree';

export type ScrollLockMode = 'auto' | 'user';

export interface ToastState {
  id: string;
  message: string;
  variant: 'info' | 'success' | 'warning' | 'error';
  autoDismissMs?: number;
  createdAtMs?: number;
}

export interface InstanceTabState {
  id: string;
  label: string;
  isLocal: boolean;
  status?: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
}

export const VIEW_TAB_ORDER: ReadonlyArray<ViewMode> = [
  'tasks',
  'iterations',
  'activity',
  'chat',
  'logs',
  'settings',
] as const;

const DEFAULT_FOCUS_PER_VIEW: Record<ViewMode, PanelId> = {
  tasks: 'taskList',
  iterations: 'iterationList',
  'iteration-detail': 'iterationDetail',
  activity: 'activityList',
  chat: 'chatPane',
  logs: 'logPane',
  settings: 'settingsList',
};

const DEFAULT_SCROLL_POSITIONS: Record<PanelId, number> = {
  taskList: 0,
  taskDetail: 0,
  outputPane: 0,
  subagentTree: 0,
  iterationList: 0,
  iterationDetail: 0,
  activityList: 0,
  chatPane: 0,
  logPane: 0,
  settingsList: 0,
};

const DEFAULT_SCROLL_LOCKS: Record<PanelId, ScrollLockMode> = {
  taskList: 'auto',
  taskDetail: 'auto',
  outputPane: 'auto',
  subagentTree: 'auto',
  iterationList: 'auto',
  iterationDetail: 'auto',
  activityList: 'auto',
  chatPane: 'auto',
  logPane: 'auto',
  settingsList: 'auto',
};

export interface UIState {
  viewMode: ViewMode;
  detailsViewMode: DetailsViewMode;
  focusPerView: Record<ViewMode, PanelId>;
  focusedPane: FocusedPane;
  overlay: OverlayId | null;
  preOverlayFocus: { viewMode: ViewMode; panel: PanelId } | null;
  selectedTabIndex: number;
  tabCount: number;
  instances: InstanceTabState[];
  remoteManagementMode: 'add' | 'edit' | 'delete';
  remoteManagementTargetAlias?: string;
  remoteConfigTargetAlias?: string;
  isTabSwitching: boolean;
  showDashboard: boolean;
  showClosedTasks: boolean;
  selectedTaskId?: string;
  iterationSelectedIndex: number;
  detailIterationId: string | null;
  scrollPositions: Record<PanelId, number>;
  scrollLockPerPanel: Record<PanelId, ScrollLockMode>;
  toasts: ToastState[];

  // Legacy compatibility fields
  showHelp: boolean;
  showRemoteConfig: boolean;
  showRemoteManagement: boolean;
  showQuitDialog: boolean;
  showEpicLoader: boolean;
  showRunSummary: boolean;
  copyFeedback: string | null;
  infoFeedback: string | null;
}

export type UIAction =
  | { type: 'ui/reset'; state?: Partial<UIState> }
  | { type: 'ui/patch'; patch: Partial<UIState> }
  | { type: 'ui/set-view-mode'; viewMode: ViewMode }
  | { type: 'ui/next-view' }
  | { type: 'ui/prev-view' }
  | { type: 'ui/set-details-view-mode'; detailsViewMode: DetailsViewMode }
  | { type: 'ui/set-focused-pane'; focusedPane: FocusedPane }
  | { type: 'ui/set-focus-panel'; panel: PanelId }
  | { type: 'ui/cycle-focus' }
  | { type: 'ui/open-overlay'; overlay: OverlayId }
  | { type: 'ui/close-overlay' }
  | { type: 'ui/set-selected-tab-index'; index: number }
  | { type: 'ui/set-tab-count'; count: number }
  | { type: 'ui/next-tab' }
  | { type: 'ui/prev-tab' }
  | { type: 'ui/set-instances'; instances: InstanceTabState[] }
  | { type: 'ui/add-instance'; instance: InstanceTabState }
  | { type: 'ui/remove-instance'; index: number }
  | { type: 'ui/set-remote-management-context'; mode: 'add' | 'edit' | 'delete'; targetAlias?: string }
  | { type: 'ui/set-remote-config-target'; targetAlias?: string }
  | { type: 'ui/set-tab-switching'; switching: boolean }
  | { type: 'ui/toggle-dashboard' }
  | { type: 'ui/set-show-closed-tasks'; show: boolean }
  | { type: 'ui/select-task'; taskId?: string }
  | { type: 'ui/set-iteration-selected-index'; index: number }
  | { type: 'ui/drill-into-iteration'; iterationId: string }
  | { type: 'ui/back-from-detail' }
  | { type: 'ui/push-toast'; toast: Omit<ToastState, 'id'> & { id?: string } }
  | { type: 'ui/dismiss-toast'; id?: string; index?: number }
  | { type: 'ui/set-scroll-position'; panel: PanelId; offset: number }
  | { type: 'ui/set-scroll-lock'; panel: PanelId; lock: ScrollLockMode }

  // Legacy overlay actions kept during migration
  | { type: 'ui/set-show-help'; show: boolean }
  | { type: 'ui/set-show-remote-config'; show: boolean }
  | { type: 'ui/set-show-remote-management'; show: boolean }
  | { type: 'ui/set-show-quit-dialog'; show: boolean }
  | { type: 'ui/set-show-epic-loader'; show: boolean }
  | { type: 'ui/set-show-run-summary'; show: boolean }
  | { type: 'ui/set-copy-feedback'; message: string | null }
  | { type: 'ui/set-info-feedback'; message: string | null };

export type UIStore = ExternalStore<UIState, UIAction>;

const DEFAULT_UI_STATE: UIState = {
  viewMode: 'tasks',
  detailsViewMode: 'details',
  focusPerView: { ...DEFAULT_FOCUS_PER_VIEW },
  focusedPane: 'output',
  overlay: null,
  preOverlayFocus: null,
  selectedTabIndex: 0,
  tabCount: 1,
  instances: [{ id: 'local', label: 'Local', isLocal: true, status: 'connected' }],
  remoteManagementMode: 'add',
  remoteManagementTargetAlias: undefined,
  remoteConfigTargetAlias: undefined,
  isTabSwitching: false,
  showDashboard: false,
  showClosedTasks: true,
  selectedTaskId: undefined,
  iterationSelectedIndex: 0,
  detailIterationId: null,
  scrollPositions: { ...DEFAULT_SCROLL_POSITIONS },
  scrollLockPerPanel: { ...DEFAULT_SCROLL_LOCKS },
  toasts: [],
  showHelp: false,
  showRemoteConfig: false,
  showRemoteManagement: false,
  showQuitDialog: false,
  showEpicLoader: false,
  showRunSummary: false,
  copyFeedback: null,
  infoFeedback: null,
};

function cloneFocusPerView(focus?: Partial<Record<ViewMode, PanelId>>): Record<ViewMode, PanelId> {
  return {
    ...DEFAULT_FOCUS_PER_VIEW,
    ...focus,
  };
}

function cloneScrollPositions(positions?: Partial<Record<PanelId, number>>): Record<PanelId, number> {
  return {
    ...DEFAULT_SCROLL_POSITIONS,
    ...positions,
  };
}

function cloneScrollLocks(
  locks?: Partial<Record<PanelId, ScrollLockMode>>
): Record<PanelId, ScrollLockMode> {
  return {
    ...DEFAULT_SCROLL_LOCKS,
    ...locks,
  };
}

function createInitialState(initialState: Partial<UIState> = {}): UIState {
  return {
    ...DEFAULT_UI_STATE,
    ...initialState,
    focusPerView: cloneFocusPerView(initialState.focusPerView),
    scrollPositions: cloneScrollPositions(initialState.scrollPositions),
    scrollLockPerPanel: cloneScrollLocks(initialState.scrollLockPerPanel),
    instances: initialState.instances ? [...initialState.instances] : [...DEFAULT_UI_STATE.instances],
    toasts: initialState.toasts ? [...initialState.toasts] : [],
  };
}

function cycleView(viewMode: ViewMode, direction: 1 | -1): ViewMode {
  const tabReference = viewMode === 'iteration-detail' ? 'iterations' : viewMode;
  const currentIndex = VIEW_TAB_ORDER.indexOf(tabReference);
  if (currentIndex < 0) {
    return VIEW_TAB_ORDER[0] ?? 'tasks';
  }

  const nextIndex = (currentIndex + direction + VIEW_TAB_ORDER.length) % VIEW_TAB_ORDER.length;
  return VIEW_TAB_ORDER[nextIndex] ?? VIEW_TAB_ORDER[0] ?? 'tasks';
}

function clampTabIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, count - 1));
}

function getFocusChain(state: Readonly<UIState>, view: ViewMode): PanelId[] {
  switch (view) {
    case 'tasks':
      return ['taskList', 'taskDetail', 'outputPane', 'subagentTree'];
    case 'iterations':
      return ['iterationList', 'iterationDetail'];
    case 'iteration-detail':
      return ['iterationDetail'];
    case 'activity':
      return ['activityList'];
    case 'chat':
      return ['chatPane'];
    case 'logs':
      return ['logPane'];
    case 'settings':
      return ['settingsList'];
    default:
      return [state.focusPerView[state.viewMode] ?? 'outputPane'];
  }
}

function panelToLegacyFocusedPane(panel: PanelId): FocusedPane {
  return panel === 'subagentTree' ? 'subagentTree' : 'output';
}

function overlayFlagPatch(overlay: OverlayId | null): Pick<
  UIState,
  'showHelp' | 'showRemoteConfig' | 'showRemoteManagement' | 'showQuitDialog' | 'showEpicLoader' | 'showRunSummary'
> {
  return {
    showHelp: overlay === 'help',
    showRemoteConfig: overlay === 'remoteConfig',
    showRemoteManagement: overlay === 'remoteManagement',
    showQuitDialog: overlay === 'quit',
    showEpicLoader: overlay === 'epicLoader',
    showRunSummary: overlay === 'runSummary',
  };
}

function withOverlay(state: Readonly<UIState>, overlay: OverlayId | null): UIState {
  const currentPanel = state.focusPerView[state.viewMode] ?? 'outputPane';
  const preOverlayFocus = overlay
    ? { viewMode: state.viewMode, panel: currentPanel }
    : state.preOverlayFocus;

  return applyPatch(state, {
    overlay,
    preOverlayFocus,
    ...overlayFlagPatch(overlay),
  });
}

function closeOverlay(state: Readonly<UIState>): UIState {
  const restoration = state.preOverlayFocus;
  if (!restoration) {
    return applyPatch(state, {
      overlay: null,
      ...overlayFlagPatch(null),
    });
  }

  const nextFocusPerView = {
    ...state.focusPerView,
    [restoration.viewMode]: restoration.panel,
  };

  return applyPatch(state, {
    overlay: null,
    preOverlayFocus: null,
    remoteManagementMode: state.overlay === 'remoteManagement' ? 'add' : state.remoteManagementMode,
    remoteManagementTargetAlias: state.overlay === 'remoteManagement' ? undefined : state.remoteManagementTargetAlias,
    remoteConfigTargetAlias: state.overlay === 'remoteConfig' ? undefined : state.remoteConfigTargetAlias,
    focusPerView: nextFocusPerView,
    focusedPane: panelToLegacyFocusedPane(restoration.panel),
    ...overlayFlagPatch(null),
  });
}

function openLegacyOverlay(state: Readonly<UIState>, show: boolean, overlay: OverlayId): UIState {
  if (show) {
    return withOverlay(state, overlay);
  }

  if (state.overlay === overlay) {
    return closeOverlay(state);
  }

  return state;
}

function uiReducer(state: Readonly<UIState>, action: UIAction): UIState {
  switch (action.type) {
    case 'ui/reset':
      return createInitialState(action.state);

    case 'ui/patch':
      return applyPatch(state, action.patch);

    case 'ui/set-view-mode': {
      const nextView = action.viewMode;
      const nextPanel = state.focusPerView[nextView] ?? DEFAULT_FOCUS_PER_VIEW[nextView];
      return applyPatch(state, {
        viewMode: nextView,
        focusedPane: panelToLegacyFocusedPane(nextPanel),
      });
    }

    case 'ui/next-view': {
      const nextView = cycleView(state.viewMode, 1);
      const nextPanel = state.focusPerView[nextView] ?? DEFAULT_FOCUS_PER_VIEW[nextView];
      return applyPatch(state, {
        viewMode: nextView,
        focusedPane: panelToLegacyFocusedPane(nextPanel),
      });
    }

    case 'ui/prev-view': {
      const nextView = cycleView(state.viewMode, -1);
      const nextPanel = state.focusPerView[nextView] ?? DEFAULT_FOCUS_PER_VIEW[nextView];
      return applyPatch(state, {
        viewMode: nextView,
        focusedPane: panelToLegacyFocusedPane(nextPanel),
      });
    }

    case 'ui/set-details-view-mode':
      return applyPatch(state, { detailsViewMode: action.detailsViewMode });

    case 'ui/set-focused-pane': {
      const panel = action.focusedPane === 'subagentTree' ? 'subagentTree' : 'outputPane';
      return applyPatch(state, {
        focusedPane: action.focusedPane,
        focusPerView: {
          ...state.focusPerView,
          [state.viewMode]: panel,
        },
      });
    }

    case 'ui/set-focus-panel':
      return applyPatch(state, {
        focusPerView: {
          ...state.focusPerView,
          [state.viewMode]: action.panel,
        },
        focusedPane: panelToLegacyFocusedPane(action.panel),
      });

    case 'ui/cycle-focus': {
      const chain = getFocusChain(state, state.viewMode);
      const currentPanel = state.focusPerView[state.viewMode] ?? chain[0] ?? 'outputPane';
      const currentIndex = chain.indexOf(currentPanel);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % chain.length;
      const nextPanel = chain[nextIndex] ?? currentPanel;

      return applyPatch(state, {
        focusPerView: {
          ...state.focusPerView,
          [state.viewMode]: nextPanel,
        },
        focusedPane: panelToLegacyFocusedPane(nextPanel),
      });
    }

    case 'ui/open-overlay':
      return withOverlay(state, action.overlay);

    case 'ui/close-overlay':
      return closeOverlay(state);

    case 'ui/set-selected-tab-index':
      return applyPatch(state, {
        selectedTabIndex: clampTabIndex(action.index, state.tabCount),
      });

    case 'ui/set-tab-count': {
      const tabCount = Math.max(1, action.count);
      return applyPatch(state, {
        tabCount,
        selectedTabIndex: clampTabIndex(state.selectedTabIndex, tabCount),
      });
    }

    case 'ui/next-tab':
      return applyPatch(state, {
        selectedTabIndex: clampTabIndex(state.selectedTabIndex + 1, state.tabCount),
      });

    case 'ui/prev-tab':
      return applyPatch(state, {
        selectedTabIndex: clampTabIndex(state.selectedTabIndex - 1, state.tabCount),
      });

    case 'ui/set-instances': {
      const safeInstances = action.instances.length > 0 ? [...action.instances] : [...DEFAULT_UI_STATE.instances];
      return applyPatch(state, {
        instances: safeInstances,
        tabCount: Math.max(1, safeInstances.length),
        selectedTabIndex: clampTabIndex(state.selectedTabIndex, Math.max(1, safeInstances.length)),
      });
    }

    case 'ui/add-instance': {
      const nextInstances = [...state.instances, action.instance];
      return applyPatch(state, {
        instances: nextInstances,
        tabCount: Math.max(1, nextInstances.length),
      });
    }

    case 'ui/remove-instance': {
      if (action.index < 0 || action.index >= state.instances.length) {
        return state;
      }

      const nextInstances = state.instances.filter((_, index) => index !== action.index);
      const nextTabCount = Math.max(1, nextInstances.length);
      return applyPatch(state, {
        instances: nextInstances.length > 0 ? nextInstances : [...DEFAULT_UI_STATE.instances],
        tabCount: nextTabCount,
        selectedTabIndex: clampTabIndex(state.selectedTabIndex, nextTabCount),
      });
    }

    case 'ui/set-remote-management-context':
      return applyPatch(state, {
        remoteManagementMode: action.mode,
        remoteManagementTargetAlias: action.targetAlias,
      });

    case 'ui/set-remote-config-target':
      return applyPatch(state, {
        remoteConfigTargetAlias: action.targetAlias,
      });

    case 'ui/set-tab-switching':
      return applyPatch(state, { isTabSwitching: action.switching });

    case 'ui/toggle-dashboard':
      return applyPatch(state, { showDashboard: !state.showDashboard });

    case 'ui/set-show-closed-tasks':
      return applyPatch(state, { showClosedTasks: action.show });

    case 'ui/select-task':
      return applyPatch(state, { selectedTaskId: action.taskId });

    case 'ui/set-iteration-selected-index':
      return applyPatch(state, { iterationSelectedIndex: Math.max(0, action.index) });

    case 'ui/drill-into-iteration':
      return applyPatch(state, {
        detailIterationId: action.iterationId,
        viewMode: 'iteration-detail',
      });

    case 'ui/back-from-detail':
      return applyPatch(state, {
        viewMode: 'iterations',
        detailIterationId: null,
      });

    case 'ui/push-toast': {
      const toast: ToastState = {
        id: action.toast.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message: action.toast.message,
        variant: action.toast.variant,
        autoDismissMs: action.toast.autoDismissMs,
        createdAtMs: Date.now(),
      };
      const nextToasts = [...state.toasts, toast];
      const trimmed = nextToasts.length > 3 ? nextToasts.slice(nextToasts.length - 3) : nextToasts;
      return applyPatch(state, { toasts: trimmed });
    }

    case 'ui/dismiss-toast': {
      if (state.toasts.length === 0) {
        return state;
      }

      let nextToasts = state.toasts;
      if (action.id) {
        nextToasts = state.toasts.filter((toast) => toast.id !== action.id);
      } else if (action.index !== undefined) {
        if (action.index < 0 || action.index >= state.toasts.length) {
          return state;
        }
        nextToasts = state.toasts.filter((_, index) => index !== action.index);
      } else {
        nextToasts = state.toasts.slice(0, -1);
      }

      return applyPatch(state, { toasts: nextToasts });
    }

    case 'ui/set-scroll-position':
      return applyPatch(state, {
        scrollPositions: {
          ...state.scrollPositions,
          [action.panel]: Math.max(0, action.offset),
        },
      });

    case 'ui/set-scroll-lock':
      return applyPatch(state, {
        scrollLockPerPanel: {
          ...state.scrollLockPerPanel,
          [action.panel]: action.lock,
        },
      });

    case 'ui/set-show-help':
      return openLegacyOverlay(state, action.show, 'help');

    case 'ui/set-show-remote-config':
      return openLegacyOverlay(state, action.show, 'remoteConfig');

    case 'ui/set-show-remote-management':
      return openLegacyOverlay(state, action.show, 'remoteManagement');

    case 'ui/set-show-quit-dialog':
      return openLegacyOverlay(state, action.show, 'quit');

    case 'ui/set-show-epic-loader':
      return openLegacyOverlay(state, action.show, 'epicLoader');

    case 'ui/set-show-run-summary':
      return openLegacyOverlay(state, action.show, 'runSummary');

    case 'ui/set-copy-feedback':
      return applyPatch(state, { copyFeedback: action.message });

    case 'ui/set-info-feedback':
      return applyPatch(state, { infoFeedback: action.message });

    default:
      return state;
  }
}

export function createUIStore(initialState: Partial<UIState> = {}): UIStore {
  return createExternalStore<UIState, UIAction>({
    initialState: createInitialState(initialState),
    reducer: uiReducer,
  });
}

export function useUISelector<Selected>(
  store: UIStore,
  selector: StoreSelector<UIState, Selected>
): Selected {
  return useStoreSelector(store, selector);
}

export function useUIDispatch(store: UIStore): (action: UIAction) => void {
  return useStoreDispatch(store);
}

export function useCurrentView(store: UIStore): ViewMode {
  return useUISelector(store, (state) => state.viewMode);
}

export function useOverlay(store: UIStore): OverlayId | null {
  return useUISelector(store, (state) => state.overlay);
}

export function useToasts(store: UIStore): ToastState[] {
  return useUISelector(store, (state) => state.toasts);
}

export function useActivePanel(store: UIStore): PanelId {
  return useUISelector(store, (state) => state.focusPerView[state.viewMode]);
}

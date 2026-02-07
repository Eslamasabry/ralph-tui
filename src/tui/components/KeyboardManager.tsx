/**
 * ABOUTME: Centralized keyboard routing infrastructure for TUI key handling.
 * Routes key input through a layered model: overlay -> global -> view-specific.
 */

import { useKeyboard } from '@opentui/react';
import type { KeyEvent } from '@opentui/core';
import type { ReactNode } from 'react';
import { useCallback } from 'react';

/**
 * Execution phase values used for keyboard routing decisions.
 */
export type RunPhase =
  | 'ready'
  | 'running'
  | 'executing'
  | 'selecting'
  | 'pausing'
  | 'paused'
  | 'stopped'
  | 'idle'
  | 'complete'
  | 'error';

/**
 * Minimal keyboard event shape for pure routing logic.
 */
export interface KeyboardInput {
  name?: string;
  sequence?: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  option?: boolean;
}

/**
 * UI store selectors consumed by keyboard router.
 */
export interface UIStoreSelectors {
  getActiveView: () => string;
  getSelectedTabIndex: () => number;
  getTabCount: () => number;
  getOverlay?: () => string | null;
  isViewingRemote?: () => boolean;
}

/**
 * Navigation direction for view cycling.
 */
export type ViewCycleDirection = 'next' | 'prev';

/**
 * Navigation direction for tab cycling.
 */
export type TabCycleDirection = 'next' | 'prev';

/**
 * Details pane mode switches in logs/detail contexts.
 */
export type DetailsMode = 'details' | 'output' | 'cli' | 'prompt';

/**
 * UI store dispatchers consumed by keyboard router.
 */
export interface UIStoreDispatchers {
  cycleView: (direction: ViewCycleDirection) => void;
  cycleTab: (direction: TabCycleDirection) => void;
  setSelectedTabIndex: (index: number) => void;
  openOverlay?: (overlay: string) => void;
  closeOverlay?: () => void;
  setView?: (view: string) => void;
  cycleFocus?: () => void;
  toggleDashboard?: () => void;
  toggleClosedTasks?: () => void;
  toggleSubagentPanel?: () => void;
  cycleSubagentDetail?: () => void;
  setDetailsViewMode?: (mode: DetailsMode) => void;
  drillIntoIteration?: () => void;
  backFromDetail?: () => void;
  goToIterationTask?: () => void;
  refreshTasks?: () => void;
  openEpicLoader?: () => void;
  openRemoteConfig?: () => void;
  openRemoteManagement?: (mode: 'add' | 'edit' | 'delete') => void;
  pruneWorktrees?: () => void;
}

/**
 * Phase store selectors consumed by keyboard router.
 */
export interface PhaseStoreSelectors {
  getPhase: () => RunPhase;
  isKeyboardCaptured?: () => boolean;
}

/**
 * Phase store dispatchers consumed by keyboard router.
 */
export interface PhaseStoreDispatchers {
  requestQuit?: () => void;
  toggleHelp?: () => void;
  pause?: () => void;
  resume?: () => void;
  start?: () => void;
  interrupt?: () => void;
  cancelInterrupt?: () => void;
  addIterations?: (count: number) => void;
  removeIterations?: (count: number) => void;
}

/**
 * Store contract for keyboard routing.
 */
export interface KeyboardStores {
  uiStore: {
    selectors: UIStoreSelectors;
    dispatchers: UIStoreDispatchers;
  };
  phaseStore: {
    selectors: PhaseStoreSelectors;
    dispatchers: PhaseStoreDispatchers;
  };
}

/**
 * Props for KeyboardManager.
 */
export interface KeyboardManagerProps extends KeyboardStores {
  enabled?: boolean;
  onUnhandledKey?: (key: KeyboardInput) => void;
}

/**
 * Public key binding descriptor used by footer/help renderers.
 */
export interface KeyboardBinding {
  key: string;
  description: string;
  category: 'General' | 'Execution' | 'Views' | 'Navigation' | 'Instances' | 'System';
}

/**
 * Context used for resolving active bindings.
 */
export interface KeyboardBindingContext {
  view: string;
  overlay: string | null;
  phase: RunPhase;
  isViewingRemote: boolean;
}

const OVERLAY_BINDINGS: Record<string, KeyboardBinding[]> = {
  help: [
    { key: 'Esc', description: 'Close help', category: 'General' },
    { key: '?', description: 'Close help', category: 'General' },
  ],
  quit: [
    { key: 'y', description: 'Confirm quit', category: 'General' },
    { key: 'n/Esc', description: 'Cancel quit', category: 'General' },
  ],
  interrupt: [
    { key: 'y', description: 'Confirm interrupt', category: 'Execution' },
    { key: 'n/Esc', description: 'Cancel interrupt', category: 'Execution' },
  ],
  runSummary: [
    { key: 'r', description: 'Run again', category: 'Execution' },
    { key: 'e/Esc', description: 'Close summary', category: 'General' },
  ],
};

const BASE_BINDINGS: KeyboardBinding[] = [
  { key: '?', description: 'Help', category: 'General' },
  { key: 'q', description: 'Quit', category: 'General' },
  { key: 'Tab/Shift+Tab', description: 'Next/prev view', category: 'Views' },
  { key: '[ ]', description: 'Prev/next instance', category: 'Instances' },
  { key: 'd', description: 'Toggle dashboard', category: 'Views' },
  { key: 'r', description: 'Refresh tasks', category: 'Execution' },
  { key: '+ / -', description: 'Adjust iterations', category: 'Execution' },
  { key: 'Ctrl+C', description: 'Interrupt', category: 'System' },
  { key: ',', description: 'Settings view', category: 'Views' },
  { key: 'C', description: 'View config', category: 'Instances' },
  { key: 'a', description: 'Add remote', category: 'Instances' },
];

const TASK_VIEW_BINDINGS: KeyboardBinding[] = [
  { key: 'f', description: 'Cycle focus', category: 'Views' },
  { key: 'h', description: 'Toggle closed tasks', category: 'Views' },
  { key: 'T', description: 'Toggle subagent panel', category: 'Views' },
  { key: 't', description: 'Cycle subagent detail', category: 'Views' },
];

const ITERATIONS_VIEW_BINDINGS: KeyboardBinding[] = [
  { key: 'f', description: 'Cycle focus', category: 'Views' },
  { key: 'Enter', description: 'Open iteration detail', category: 'Navigation' },
];

const ITERATION_DETAIL_BINDINGS: KeyboardBinding[] = [
  { key: 'Esc', description: 'Back to iterations', category: 'Navigation' },
  { key: 'g', description: 'Jump to task', category: 'Navigation' },
];

const LOG_VIEW_BINDINGS: KeyboardBinding[] = [
  { key: '1/2/3', description: 'Output/CLI/Prompt', category: 'Views' },
];

const VIEW_BINDINGS: Record<string, KeyboardBinding[]> = {
  tasks: TASK_VIEW_BINDINGS,
  iterations: ITERATIONS_VIEW_BINDINGS,
  'iteration-detail': ITERATION_DETAIL_BINDINGS,
  logs: LOG_VIEW_BINDINGS,
};

function getPhaseBinding(phase: RunPhase): KeyboardBinding {
  if (phase === 'paused' || phase === 'pausing') {
    return { key: 'p', description: 'Resume', category: 'Execution' };
  }

  if (phase === 'ready' || phase === 'complete' || phase === 'idle' || phase === 'stopped' || phase === 'error') {
    return { key: 's', description: 'Start/continue', category: 'Execution' };
  }

  return { key: 'p', description: 'Pause', category: 'Execution' };
}

/**
 * Returns active keyboard bindings for the current UI context.
 */
export function getKeyboardBindingsForContext(context: KeyboardBindingContext): KeyboardBinding[] {
  if (context.overlay) {
    return OVERLAY_BINDINGS[context.overlay] ?? [{ key: 'Esc', description: 'Close overlay', category: 'General' }];
  }

  const bindings: KeyboardBinding[] = [getPhaseBinding(context.phase), ...BASE_BINDINGS];
  if (context.isViewingRemote) {
    bindings.push(
      { key: 'e', description: 'Edit remote', category: 'Instances' },
      { key: 'x', description: 'Delete remote', category: 'Instances' }
    );
  } else {
    bindings.push(
      { key: 'l', description: 'Load epic', category: 'Execution' },
      { key: 'Shift+P', description: 'Prune worktrees', category: 'Execution' }
    );
  }

  const viewBindings = VIEW_BINDINGS[context.view] ?? [];
  return [...bindings, ...viewBindings];
}

/**
 * Converts bindings into a compact footer hint line.
 */
export function formatKeyboardBindingsForFooter(bindings: KeyboardBinding[], maxItems = 8): string {
  return bindings
    .slice(0, Math.max(1, maxItems))
    .map((binding) => `${binding.key} ${binding.description}`)
    .join('  ');
}

/**
 * Determine whether current phase can transition to pause.
 */
export function canPausePhase(phase: RunPhase): boolean {
  return phase === 'running' || phase === 'executing' || phase === 'selecting';
}

/**
 * Determine whether current phase can transition to resume.
 */
export function canResumePhase(phase: RunPhase): boolean {
  return phase === 'paused' || phase === 'pausing';
}

function canStartPhase(phase: RunPhase): boolean {
  return phase === 'ready' || phase === 'paused' || phase === 'complete';
}

function canInterruptPhase(phase: RunPhase): boolean {
  return phase === 'running' || phase === 'executing' || phase === 'selecting' || phase === 'pausing' || phase === 'paused';
}

function keyName(input: KeyboardInput): string {
  return input.name ?? input.sequence ?? '';
}

function isEnter(input: KeyboardInput): boolean {
  const name = keyName(input);
  return name === 'enter' || name === 'return';
}

function isQuestion(input: KeyboardInput): boolean {
  const name = keyName(input);
  return name === '?' || input.sequence === '?';
}

function isPlus(input: KeyboardInput): boolean {
  const name = keyName(input);
  return name === '+' || name === '=';
}

function isMinus(input: KeyboardInput): boolean {
  const name = keyName(input);
  return name === '-' || name === '_';
}

function handleOverlayLayer(input: KeyboardInput, stores: KeyboardStores, overlay: string): boolean {
  const name = keyName(input);
  const { uiStore, phaseStore } = stores;

  if (name === 'escape') {
    if (overlay === 'interrupt') {
      phaseStore.dispatchers.cancelInterrupt?.();
    }
    uiStore.dispatchers.closeOverlay?.();
    return true;
  }

  if (overlay === 'help' && isQuestion(input)) {
    uiStore.dispatchers.closeOverlay?.();
    return true;
  }

  if (overlay === 'quit') {
    if (name === 'y') {
      phaseStore.dispatchers.requestQuit?.();
      return true;
    }
    if (name === 'n') {
      uiStore.dispatchers.closeOverlay?.();
      return true;
    }
    return true;
  }

  if (overlay === 'interrupt') {
    if (name === 'y') {
      phaseStore.dispatchers.interrupt?.();
      return true;
    }
    if (name === 'n') {
      phaseStore.dispatchers.cancelInterrupt?.();
      uiStore.dispatchers.closeOverlay?.();
      return true;
    }
    return true;
  }

  if (overlay === 'runSummary') {
    if (name === 'r') {
      phaseStore.dispatchers.start?.();
      return true;
    }
    if (name === 'e') {
      uiStore.dispatchers.closeOverlay?.();
      return true;
    }
    return true;
  }

  // Swallow all keys while any overlay is active.
  return true;
}

function handleGlobalLayer(input: KeyboardInput, stores: KeyboardStores): boolean {
  const name = keyName(input);
  const phase = stores.phaseStore.selectors.getPhase();
  const isViewingRemote = stores.uiStore.selectors.isViewingRemote?.() ?? false;

  if (isQuestion(input)) {
    if (stores.uiStore.dispatchers.openOverlay) {
      stores.uiStore.dispatchers.openOverlay('help');
    } else {
      stores.phaseStore.dispatchers.toggleHelp?.();
    }
    return true;
  }

  if (name === 'q') {
    if (stores.uiStore.dispatchers.openOverlay) {
      stores.uiStore.dispatchers.openOverlay('quit');
    } else {
      stores.phaseStore.dispatchers.requestQuit?.();
    }
    return true;
  }

  if (name === 'c' && input.ctrl) {
    if (canInterruptPhase(phase)) {
      if (stores.uiStore.dispatchers.openOverlay) {
        stores.uiStore.dispatchers.openOverlay('interrupt');
      } else {
        stores.phaseStore.dispatchers.interrupt?.();
      }
    }
    return true;
  }

  if (name === 's') {
    if (canStartPhase(phase)) {
      stores.phaseStore.dispatchers.start?.();
    }
    return true;
  }

  if (name === 'p') {
    if (canPausePhase(phase)) {
      stores.phaseStore.dispatchers.pause?.();
      return true;
    }
    if (canResumePhase(phase)) {
      stores.phaseStore.dispatchers.resume?.();
      return true;
    }
    return false;
  }

  if (name === 'd') {
    stores.uiStore.dispatchers.toggleDashboard?.();
    return true;
  }

  if (name === 'r') {
    stores.uiStore.dispatchers.refreshTasks?.();
    return true;
  }

  if (isPlus(input)) {
    stores.phaseStore.dispatchers.addIterations?.(10);
    return true;
  }

  if (isMinus(input)) {
    stores.phaseStore.dispatchers.removeIterations?.(10);
    return true;
  }

  if (name === 'tab') {
    const direction: ViewCycleDirection = input.shift ? 'prev' : 'next';
    stores.uiStore.dispatchers.cycleView(direction);
    return true;
  }

  if (name === '[') {
    stores.uiStore.dispatchers.cycleTab('prev');
    return true;
  }

  if (name === ']') {
    stores.uiStore.dispatchers.cycleTab('next');
    return true;
  }

  if (name === ',') {
    stores.uiStore.dispatchers.setView?.('settings');
    return true;
  }

  if (name === 'C') {
    stores.uiStore.dispatchers.openRemoteConfig?.();
    return true;
  }

  if (name === 'a') {
    stores.uiStore.dispatchers.openRemoteManagement?.('add');
    return true;
  }

  if (name === 'e') {
    if (isViewingRemote) {
      stores.uiStore.dispatchers.openRemoteManagement?.('edit');
    }
    return true;
  }

  if (name === 'x') {
    if (isViewingRemote) {
      stores.uiStore.dispatchers.openRemoteManagement?.('delete');
    }
    return true;
  }

  if (name === 'l') {
    if (!isViewingRemote) {
      stores.uiStore.dispatchers.openEpicLoader?.();
    }
    return true;
  }

  if (name === 'P') {
    if (!isViewingRemote) {
      stores.uiStore.dispatchers.pruneWorktrees?.();
    }
    return true;
  }

  return false;
}

function handleViewLayer(input: KeyboardInput, stores: KeyboardStores): boolean {
  const view = stores.uiStore.selectors.getActiveView();
  const name = keyName(input);

  if (name === 'f') {
    stores.uiStore.dispatchers.cycleFocus?.();
    return true;
  }

  if (view === 'tasks') {
    if (name === 'h') {
      stores.uiStore.dispatchers.toggleClosedTasks?.();
      return true;
    }

    if (name === 'T') {
      stores.uiStore.dispatchers.toggleSubagentPanel?.();
      return true;
    }

    if (name === 't') {
      stores.uiStore.dispatchers.cycleSubagentDetail?.();
      return true;
    }
  }

  if (view === 'iterations' && isEnter(input)) {
    stores.uiStore.dispatchers.drillIntoIteration?.();
    return true;
  }

  if (view === 'iteration-detail') {
    if (name === 'escape') {
      stores.uiStore.dispatchers.backFromDetail?.();
      return true;
    }
    if (name === 'g') {
      stores.uiStore.dispatchers.goToIterationTask?.();
      return true;
    }
  }

  if (view === 'logs') {
    if (name === '1') {
      stores.uiStore.dispatchers.setDetailsViewMode?.('output');
      return true;
    }
    if (name === '2') {
      stores.uiStore.dispatchers.setDetailsViewMode?.('cli');
      return true;
    }
    if (name === '3') {
      stores.uiStore.dispatchers.setDetailsViewMode?.('prompt');
      return true;
    }
  }

  return false;
}

/**
 * Convert OpenTUI KeyEvent into a test-friendly keyboard input object.
 */
export function keyEventToInput(key: KeyEvent): KeyboardInput {
  return {
    name: key.name,
    sequence: key.sequence,
    shift: key.shift,
    ctrl: key.ctrl,
    meta: key.meta,
    option: key.option,
  };
}

/**
 * Route a single keyboard event through overlay, global, then view-specific layers.
 * Returns true when the key was handled.
 */
export function routeKeyboardKey(key: KeyboardInput, stores: KeyboardStores): boolean {
  const overlay = stores.uiStore.selectors.getOverlay?.() ?? null;
  const keyboardCaptured = stores.phaseStore.selectors.isKeyboardCaptured?.() ?? false;

  if (overlay) {
    return handleOverlayLayer(key, stores, overlay);
  }

  if (keyboardCaptured) {
    if (isQuestion(key)) {
      if (stores.uiStore.dispatchers.openOverlay) {
        stores.uiStore.dispatchers.openOverlay('help');
      } else {
        stores.phaseStore.dispatchers.toggleHelp?.();
      }
      return true;
    }
    if (keyName(key) === 'q') {
      if (stores.uiStore.dispatchers.openOverlay) {
        stores.uiStore.dispatchers.openOverlay('quit');
      } else {
        stores.phaseStore.dispatchers.requestQuit?.();
      }
      return true;
    }
    return false;
  }

  if (handleGlobalLayer(key, stores)) {
    return true;
  }

  return handleViewLayer(key, stores);
}

/**
 * Keyboard manager component that binds centralized routing to OpenTUI keyboard input.
 */
export function KeyboardManager({
  uiStore,
  phaseStore,
  enabled = true,
  onUnhandledKey,
}: KeyboardManagerProps): ReactNode {
  const handleKeyboard = useCallback(
    (key: KeyEvent) => {
      if (!enabled) {
        return;
      }

      const input = keyEventToInput(key);
      const handled = routeKeyboardKey(input, { uiStore, phaseStore });
      if (!handled) {
        onUnhandledKey?.(input);
      }
    },
    [enabled, onUnhandledKey, phaseStore, uiStore]
  );

  useKeyboard(handleKeyboard);

  return null;
}

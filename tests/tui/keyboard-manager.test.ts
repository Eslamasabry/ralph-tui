/**
 * ABOUTME: Tests centralized keyboard routing logic in KeyboardManager.
 * Verifies layer priority and context-aware key dispatch.
 */

import { describe, expect, test } from 'bun:test';
import {
  canPausePhase,
  canResumePhase,
  routeKeyboardKey,
  type KeyboardStores,
  type RunPhase,
} from '../../src/tui/components/KeyboardManager.js';

interface KeyboardRecorder {
  actions: string[];
  phase: RunPhase;
  activeView: string;
  selectedTabIndex: number;
  tabCount: number;
  keyboardCaptured: boolean;
  overlay: string | null;
}

function createKeyboardStores(
  options: Partial<
    Pick<
      KeyboardRecorder,
      'phase' | 'activeView' | 'selectedTabIndex' | 'tabCount' | 'keyboardCaptured' | 'overlay'
    >
  > = {}
): { stores: KeyboardStores; recorder: KeyboardRecorder } {
  const recorder: KeyboardRecorder = {
    actions: [],
    phase: options.phase ?? 'ready',
    activeView: options.activeView ?? 'tasks',
    selectedTabIndex: options.selectedTabIndex ?? 0,
    tabCount: options.tabCount ?? 3,
    keyboardCaptured: options.keyboardCaptured ?? false,
    overlay: options.overlay ?? null,
  };

  const stores: KeyboardStores = {
    uiStore: {
      selectors: {
        getActiveView: () => recorder.activeView,
        getSelectedTabIndex: () => recorder.selectedTabIndex,
        getTabCount: () => recorder.tabCount,
        getOverlay: () => recorder.overlay,
      },
      dispatchers: {
        cycleView: (direction) => recorder.actions.push(`view:${direction}`),
        cycleTab: (direction) => recorder.actions.push(`tab:${direction}`),
        setSelectedTabIndex: (index) => {
          recorder.selectedTabIndex = index;
          recorder.actions.push(`tab:set:${index}`);
        },
        openOverlay: (overlay) => {
          recorder.overlay = overlay;
          recorder.actions.push(`overlay:open:${overlay}`);
        },
        closeOverlay: () => {
          recorder.overlay = null;
          recorder.actions.push('overlay:close');
        },
        setView: (view) => {
          recorder.activeView = view;
          recorder.actions.push(`view:set:${view}`);
        },
        cycleFocus: () => recorder.actions.push('focus:cycle'),
        toggleDashboard: () => recorder.actions.push('ui:dashboard'),
        toggleClosedTasks: () => recorder.actions.push('ui:toggle-closed'),
        toggleSubagentPanel: () => recorder.actions.push('ui:toggle-subagent'),
        cycleSubagentDetail: () => recorder.actions.push('ui:subagent-detail'),
        setDetailsViewMode: (mode) => recorder.actions.push(`ui:details:${mode}`),
        drillIntoIteration: () => recorder.actions.push('ui:drill-iteration'),
        backFromDetail: () => recorder.actions.push('ui:back-detail'),
        goToIterationTask: () => recorder.actions.push('ui:go-task'),
        refreshTasks: () => recorder.actions.push('ui:refresh'),
        openEpicLoader: () => recorder.actions.push('ui:open-epic-loader'),
        openRemoteConfig: () => recorder.actions.push('ui:open-remote-config'),
        openRemoteManagement: (mode) => recorder.actions.push(`ui:open-remote-management:${mode}`),
        pruneWorktrees: () => recorder.actions.push('ui:prune-worktrees'),
      },
    },
    phaseStore: {
      selectors: {
        getPhase: () => recorder.phase,
        isKeyboardCaptured: () => recorder.keyboardCaptured,
      },
      dispatchers: {
        requestQuit: () => recorder.actions.push('phase:quit'),
        toggleHelp: () => recorder.actions.push('phase:help'),
        pause: () => recorder.actions.push('phase:pause'),
        resume: () => recorder.actions.push('phase:resume'),
        start: () => recorder.actions.push('phase:start'),
        interrupt: () => recorder.actions.push('phase:interrupt'),
        addIterations: (count) => recorder.actions.push(`phase:add:${count}`),
        removeIterations: (count) => recorder.actions.push(`phase:remove:${count}`),
      },
    },
  };

  return { stores, recorder };
}

describe('KeyboardManager helpers', () => {
  test('canPausePhase handles active execution phases', () => {
    expect(canPausePhase('running')).toBe(true);
    expect(canPausePhase('executing')).toBe(true);
    expect(canPausePhase('selecting')).toBe(true);
    expect(canPausePhase('paused')).toBe(false);
    expect(canPausePhase('complete')).toBe(false);
  });

  test('canResumePhase handles paused phases', () => {
    expect(canResumePhase('paused')).toBe(true);
    expect(canResumePhase('pausing')).toBe(true);
    expect(canResumePhase('running')).toBe(false);
    expect(canResumePhase('idle')).toBe(false);
  });
});

describe('routeKeyboardKey', () => {
  test('routes tab to view cycle by default', () => {
    const { stores, recorder } = createKeyboardStores();
    const handled = routeKeyboardKey({ name: 'tab' }, stores);

    expect(handled).toBe(true);
    expect(recorder.actions).toEqual(['view:next']);
  });

  test('routes [ and ] to tab cycle', () => {
    const { stores, recorder } = createKeyboardStores();
    const prevHandled = routeKeyboardKey({ name: '[' }, stores);
    const nextHandled = routeKeyboardKey({ name: ']' }, stores);

    expect(prevHandled).toBe(true);
    expect(nextHandled).toBe(true);
    expect(recorder.actions).toEqual(['tab:prev', 'tab:next']);
  });

  test('does not bind numeric tab jumps', () => {
    const { stores, recorder } = createKeyboardStores({ tabCount: 4 });
    const handled = routeKeyboardKey({ name: '3' }, stores);

    expect(handled).toBe(false);
    expect(recorder.selectedTabIndex).toBe(0);
    expect(recorder.actions).toEqual([]);
  });

  test('routes pause key to pause dispatcher when phase is pausable', () => {
    const { stores, recorder } = createKeyboardStores({ phase: 'running' });
    const handled = routeKeyboardKey({ name: 'p' }, stores);

    expect(handled).toBe(true);
    expect(recorder.actions).toEqual(['phase:pause']);
  });

  test('routes pause key to resume dispatcher when phase is resumable', () => {
    const { stores, recorder } = createKeyboardStores({ phase: 'paused' });
    const handled = routeKeyboardKey({ name: 'p' }, stores);

    expect(handled).toBe(true);
    expect(recorder.actions).toEqual(['phase:resume']);
  });

  test('routes start and iteration controls', () => {
    const { stores, recorder } = createKeyboardStores({ phase: 'ready' });

    expect(routeKeyboardKey({ name: 's' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: '+' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: '-' }, stores)).toBe(true);

    expect(recorder.actions).toEqual(['phase:start', 'phase:add:10', 'phase:remove:10']);
  });

  test('routes help and quit to overlay layer', () => {
    const { stores, recorder } = createKeyboardStores();

    expect(routeKeyboardKey({ name: '?' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'escape' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'q' }, stores)).toBe(true);

    expect(recorder.actions).toEqual(['overlay:open:help', 'overlay:close', 'overlay:open:quit']);
  });

  test('routes ctrl+c to interrupt overlay in active phases', () => {
    const { stores, recorder } = createKeyboardStores({ phase: 'executing' });
    const handled = routeKeyboardKey({ name: 'c', ctrl: true }, stores);

    expect(handled).toBe(true);
    expect(recorder.actions).toEqual(['overlay:open:interrupt']);
  });

  test('overlay swallows keys and escape closes it', () => {
    const { stores, recorder } = createKeyboardStores({ overlay: 'help' });

    const swallowed = routeKeyboardKey({ name: 'z' }, stores);
    const closed = routeKeyboardKey({ name: 'escape' }, stores);

    expect(swallowed).toBe(true);
    expect(closed).toBe(true);
    expect(recorder.actions).toEqual(['overlay:close']);
  });

  test('routes view-layer keys by context', () => {
    const { stores, recorder } = createKeyboardStores({ activeView: 'tasks' });

    expect(routeKeyboardKey({ name: 'f' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'h' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'T' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 't' }, stores)).toBe(true);

    recorder.activeView = 'iterations';
    expect(routeKeyboardKey({ name: 'return' }, stores)).toBe(true);

    recorder.activeView = 'iteration-detail';
    expect(routeKeyboardKey({ name: 'g' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'escape' }, stores)).toBe(true);

    recorder.activeView = 'logs';
    expect(routeKeyboardKey({ name: '1' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: '2' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: '3' }, stores)).toBe(true);

    expect(recorder.actions).toEqual([
      'focus:cycle',
      'ui:toggle-closed',
      'ui:toggle-subagent',
      'ui:subagent-detail',
      'ui:drill-iteration',
      'ui:go-task',
      'ui:back-detail',
      'ui:details:output',
      'ui:details:cli',
      'ui:details:prompt',
    ]);
  });

  test('routes global remote and epic shortcuts by context', () => {
    const { stores, recorder } = createKeyboardStores({ activeView: 'tasks', selectedTabIndex: 0 });

    expect(routeKeyboardKey({ name: 'C' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'a' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'l' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'P' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'e' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'x' }, stores)).toBe(true);

    recorder.selectedTabIndex = 1;
    stores.uiStore.selectors.isViewingRemote = () => true;

    expect(routeKeyboardKey({ name: 'e' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'x' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'l' }, stores)).toBe(true);
    expect(routeKeyboardKey({ name: 'P' }, stores)).toBe(true);

    expect(recorder.actions).toEqual([
      'ui:open-remote-config',
      'ui:open-remote-management:add',
      'ui:open-epic-loader',
      'ui:prune-worktrees',
      'ui:open-remote-management:edit',
      'ui:open-remote-management:delete',
    ]);
  });

  test('suppresses non-priority keys while keyboard is captured', () => {
    const { stores, recorder } = createKeyboardStores({ keyboardCaptured: true });
    const handled = routeKeyboardKey({ name: 'tab' }, stores);

    expect(handled).toBe(false);
    expect(recorder.actions).toEqual([]);
  });

  test('returns false for keys without configured routing', () => {
    const { stores, recorder } = createKeyboardStores();
    const handled = routeKeyboardKey({ name: 'z' }, stores);

    expect(handled).toBe(false);
    expect(recorder.actions).toEqual([]);
  });
});

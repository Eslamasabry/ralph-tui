/**
 * ABOUTME: Tests for the UI external store slice.
 * Validates view/focus transitions, overlay toggles, and feedback message state.
 */

import { describe, expect, test } from 'bun:test';
import { createUIStore } from '../../../src/tui/stores/ui-store.js';

describe('ui-store', () => {
  test('initializes with default UI state', () => {
    const store = createUIStore();
    const state = store.getState();

    expect(state.viewMode).toBe('tasks');
    expect(state.detailsViewMode).toBe('details');
    expect(state.focusedPane).toBe('output');
    expect(state.showHelp).toBe(false);
    expect(state.copyFeedback).toBeNull();
  });

  test('updates view, details mode, and focus', () => {
    const store = createUIStore();

    store.dispatch({ type: 'ui/set-view-mode', viewMode: 'logs' });
    store.dispatch({ type: 'ui/set-details-view-mode', detailsViewMode: 'output' });
    store.dispatch({ type: 'ui/set-focused-pane', focusedPane: 'subagentTree' });

    const state = store.getState();
    expect(state.viewMode).toBe('logs');
    expect(state.detailsViewMode).toBe('output');
    expect(state.focusedPane).toBe('subagentTree');
  });

  test('toggles overlays and stores feedback messages', () => {
    const store = createUIStore();

    store.dispatch({ type: 'ui/toggle-dashboard' });
    store.dispatch({ type: 'ui/set-show-help', show: true });
    store.dispatch({ type: 'ui/set-show-run-summary', show: true });
    store.dispatch({ type: 'ui/set-copy-feedback', message: 'Copied to clipboard' });
    store.dispatch({ type: 'ui/set-info-feedback', message: 'Run restored' });

    const state = store.getState();
    expect(state.showDashboard).toBe(true);
    expect(state.overlay).toBe('runSummary');
    expect(state.showHelp).toBe(false);
    expect(state.showRunSummary).toBe(true);
    expect(state.copyFeedback).toBe('Copied to clipboard');
    expect(state.infoFeedback).toBe('Run restored');
  });

  test('supports subscribe/unsubscribe', () => {
    const store = createUIStore();

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({ type: 'ui/set-show-help', show: true });
    expect(notifications).toBe(1);

    unsubscribe();
    store.dispatch({ type: 'ui/set-show-help', show: false });
    expect(notifications).toBe(1);
  });

  test('cycles through tab-stop views and skips iteration detail', () => {
    const store = createUIStore();

    store.dispatch({ type: 'ui/next-view' });
    expect(store.getState().viewMode).toBe('iterations');

    store.dispatch({ type: 'ui/drill-into-iteration', iterationId: '12' });
    expect(store.getState().viewMode).toBe('iteration-detail');

    store.dispatch({ type: 'ui/next-view' });
    expect(store.getState().viewMode).toBe('activity');
  });

  test('opens and closes overlays while preserving pre-overlay focus', () => {
    const store = createUIStore();
    store.dispatch({ type: 'ui/set-focus-panel', panel: 'subagentTree' });
    store.dispatch({ type: 'ui/open-overlay', overlay: 'help' });

    expect(store.getState().overlay).toBe('help');
    expect(store.getState().preOverlayFocus).toEqual({
      viewMode: 'tasks',
      panel: 'subagentTree',
    });

    store.dispatch({ type: 'ui/close-overlay' });
    expect(store.getState().overlay).toBeNull();
    expect(store.getState().focusPerView.tasks).toBe('subagentTree');
  });

  test('evicts toast queue to the most recent 3 items', () => {
    const store = createUIStore();

    store.dispatch({ type: 'ui/push-toast', toast: { message: 'one', variant: 'info' } });
    store.dispatch({ type: 'ui/push-toast', toast: { message: 'two', variant: 'success' } });
    store.dispatch({ type: 'ui/push-toast', toast: { message: 'three', variant: 'warning' } });
    store.dispatch({ type: 'ui/push-toast', toast: { message: 'four', variant: 'error' } });

    const toasts = store.getState().toasts;
    expect(toasts).toHaveLength(3);
    expect(toasts[0]?.message).toBe('two');
    expect(toasts[2]?.message).toBe('four');
  });

  test('persists scroll offsets and lock mode by panel', () => {
    const store = createUIStore();
    store.dispatch({ type: 'ui/set-scroll-position', panel: 'logPane', offset: 42 });
    store.dispatch({ type: 'ui/set-scroll-lock', panel: 'logPane', lock: 'user' });

    const state = store.getState();
    expect(state.scrollPositions.logPane).toBe(42);
    expect(state.scrollLockPerPanel.logPane).toBe('user');
  });

  test('ignores equivalent instance updates to avoid update loops', () => {
    const store = createUIStore();
    const before = store.getState();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({
      type: 'ui/set-instances',
      instances: [{ id: 'local', label: 'Local', isLocal: true, status: 'connected' }],
    });

    expect(notifications).toBe(0);
    expect(store.getState()).toBe(before);
    unsubscribe();
  });
});

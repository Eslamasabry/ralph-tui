/**
 * ABOUTME: Tests for the subagent external store slice.
 * Ensures subagent tree, selection, stats cache, and iteration-detail trace state update correctly.
 */

import { describe, expect, test } from 'bun:test';
import { createSubagentStore } from '../../../src/tui/stores/subagent-store.js';

describe('subagent-store', () => {
  test('initializes with expected defaults', () => {
    const store = createSubagentStore();
    const state = store.getState();

    expect(state.detailLevel).toBe('moderate');
    expect(state.tree).toEqual([]);
    expect(state.remoteTree).toEqual([]);
    expect(state.panelVisible).toBe(false);
    expect(state.statsCache.size).toBe(0);
    expect(state.iterationDetailLoading).toBe(false);
  });

  test('updates tree, selection, and panel visibility', () => {
    const store = createSubagentStore();

    store.dispatch({
      type: 'subagent/set-tree',
      tree: [
        {
          state: {
            id: 'sub-1',
            type: 'Task',
            description: 'Inspect files',
            status: 'running',
            startedAt: '2026-01-01T00:00:00.000Z',
            children: [],
            depth: 1,
          },
          children: [],
        },
      ],
    });
    store.dispatch({ type: 'subagent/set-selected-id', subagentId: 'sub-1' });
    store.dispatch({ type: 'subagent/set-focused-id', subagentId: 'sub-1' });
    store.dispatch({ type: 'subagent/set-panel-visible', visible: true });

    const state = store.getState();
    expect(state.tree).toHaveLength(1);
    expect(state.selectedSubagentId).toBe('sub-1');
    expect(state.focusedSubagentId).toBe('sub-1');
    expect(state.panelVisible).toBe(true);
  });

  test('stores and removes cached stats per iteration', () => {
    const store = createSubagentStore();

    store.dispatch({
      type: 'subagent/set-stat',
      iteration: 3,
      stats: {
        totalSubagents: 2,
        byType: { Task: 2 },
        totalDurationMs: 1200,
        failureCount: 0,
        maxDepth: 2,
      },
    });

    expect(store.getState().statsCache.get(3)?.totalSubagents).toBe(2);

    store.dispatch({ type: 'subagent/remove-stat', iteration: 3 });
    expect(store.getState().statsCache.has(3)).toBe(false);
  });

  test('sets and clears iteration-detail trace state', () => {
    const store = createSubagentStore();

    store.dispatch({ type: 'subagent/set-iteration-detail-loading', loading: true });
    store.dispatch({
      type: 'subagent/set-iteration-detail-context',
      context: {
        agentPlugin: 'claude',
        model: 'anthropic/claude-3-5-sonnet',
      },
    });

    expect(store.getState().iterationDetailLoading).toBe(true);
    expect(store.getState().iterationDetailHistoricContext?.agentPlugin).toBe('claude');

    store.dispatch({ type: 'subagent/clear-iteration-detail' });

    const state = store.getState();
    expect(state.iterationDetailLoading).toBe(false);
    expect(state.iterationDetailHistoricContext).toBeUndefined();
    expect(state.iterationDetailTree).toBeUndefined();
    expect(state.iterationDetailStats).toBeUndefined();
  });

  test('supports subscribe/unsubscribe', () => {
    const store = createSubagentStore();

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({ type: 'subagent/set-detail-level', detailLevel: 'full' });
    expect(notifications).toBe(1);

    unsubscribe();
    store.dispatch({ type: 'subagent/set-detail-level', detailLevel: 'off' });
    expect(notifications).toBe(1);
  });

  test('clears active tree and selection on task switch', () => {
    const store = createSubagentStore({
      tree: [
        {
          state: {
            id: 'sub-1',
            type: 'Task',
            description: 'Inspect files',
            status: 'running',
            startedAt: '2026-01-01T00:00:00.000Z',
            children: [],
            depth: 1,
          },
          children: [],
        },
      ],
      selectedSubagentId: 'sub-1',
      focusedSubagentId: 'sub-1',
      iterationDetailLoading: true,
    });

    store.dispatch({ type: 'subagent/clear-on-task-switch' });

    const state = store.getState();
    expect(state.tree).toEqual([]);
    expect(state.selectedSubagentId).toBeUndefined();
    expect(state.focusedSubagentId).toBeUndefined();
    expect(state.iterationDetailLoading).toBe(false);
  });
});

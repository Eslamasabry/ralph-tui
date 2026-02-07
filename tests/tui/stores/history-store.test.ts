/**
 * ABOUTME: Tests for the history external store slice.
 * Verifies iteration list updates, selection clamping, and historical output caching.
 */

import { describe, expect, test } from 'bun:test';
import type { IterationResult } from '../../../src/engine/types.js';
import { createHistoryStore } from '../../../src/tui/stores/history-store.js';

function makeIteration(iteration: number): IterationResult {
  return {
    iteration,
    status: 'completed',
    task: {
      id: `task-${iteration}`,
      title: `Task ${iteration}`,
      status: 'completed',
      priority: 2,
    },
    taskCompleted: true,
    promiseComplete: true,
    durationMs: 250,
    startedAt: `2026-01-0${iteration}T00:00:00.000Z`,
    endedAt: `2026-01-0${iteration}T00:00:00.250Z`,
  };
}

describe('history-store', () => {
  test('initializes with defaults', () => {
    const store = createHistoryStore();
    const state = store.getState();

    expect(state.iterations).toEqual([]);
    expect(state.totalIterations).toBe(0);
    expect(state.activityEvents).toEqual([]);
    expect(state.selectedIndex).toBe(0);
    expect(state.detailIteration).toBeNull();
    expect(state.historicalOutputCache.size).toBe(0);
  });

  test('sets and appends iterations', () => {
    const store = createHistoryStore();

    store.dispatch({ type: 'history/set-iterations', iterations: [makeIteration(1)] });
    store.dispatch({ type: 'history/append-iteration', iteration: makeIteration(2) });

    const state = store.getState();
    expect(state.iterations).toHaveLength(2);
    expect(state.iterations[1]?.iteration).toBe(2);
  });

  test('clamps selected index against available iterations', () => {
    const store = createHistoryStore({
      iterations: [makeIteration(1), makeIteration(2)],
      selectedIndex: 1,
    });

    store.dispatch({ type: 'history/set-iterations', iterations: [makeIteration(1)] });

    expect(store.getState().selectedIndex).toBe(0);

    store.dispatch({ type: 'history/set-selected-index', index: 99 });
    expect(store.getState().selectedIndex).toBe(0);
  });

  test('caches and removes historical output entries', () => {
    const store = createHistoryStore();

    store.dispatch({
      type: 'history/cache-output',
      taskId: 'task-1',
      entry: {
        output: 'persisted output',
        timing: { durationMs: 1000, startedAt: '2026-01-01T00:00:00.000Z' },
        agentPlugin: 'claude',
      },
    });

    expect(store.getState().historicalOutputCache.get('task-1')?.output).toBe('persisted output');

    store.dispatch({ type: 'history/remove-cached-output', taskId: 'task-1' });
    expect(store.getState().historicalOutputCache.has('task-1')).toBe(false);
  });

  test('supports subscribe/unsubscribe', () => {
    const store = createHistoryStore();

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({ type: 'history/set-total-iterations', total: 6 });
    expect(notifications).toBe(1);

    unsubscribe();
    store.dispatch({ type: 'history/set-total-iterations', total: 7 });
    expect(notifications).toBe(1);
  });

  test('caps iteration history to 100 entries (FIFO eviction)', () => {
    const store = createHistoryStore();

    for (let iteration = 1; iteration <= 130; iteration += 1) {
      store.dispatch({
        type: 'history/append-iteration',
        iteration: makeIteration(iteration),
      });
    }

    const state = store.getState();
    expect(state.iterations).toHaveLength(100);
    expect(state.iterations[0]?.iteration).toBe(31);
    expect(state.iterations[99]?.iteration).toBe(130);
  });

  test('caps activity log to 1000 entries (FIFO eviction)', () => {
    const store = createHistoryStore();

    for (let index = 1; index <= 1_050; index += 1) {
      store.dispatch({
        type: 'history/append-activity',
        event: {
          id: `evt-${index}`,
          category: 'engine',
          eventType: 'started',
          timestamp: `2026-02-07T00:00:${String(index % 60).padStart(2, '0')}.000Z`,
          severity: 'info',
          description: `event ${index}`,
        },
      });
    }

    const state = store.getState();
    expect(state.activityEvents).toHaveLength(1_000);
    expect(state.activityEvents[0]?.id).toBe('evt-51');
    expect(state.activityEvents[999]?.id).toBe('evt-1050');
  });

  test('clears iterations, activity, and cache for a fresh run', () => {
    const store = createHistoryStore({
      iterations: [makeIteration(1)],
      totalIterations: 9,
      activityEvents: [
        {
          id: 'evt-1',
          category: 'engine',
          eventType: 'started',
          timestamp: '2026-02-07T00:00:00.000Z',
          severity: 'info',
          description: 'start',
        },
      ],
    });

    store.dispatch({
      type: 'history/cache-output',
      taskId: 'task-1',
      entry: {
        output: 'cached',
        timing: { durationMs: 10 },
      },
    });

    store.dispatch({ type: 'history/clear' });

    const state = store.getState();
    expect(state.iterations).toEqual([]);
    expect(state.totalIterations).toBe(0);
    expect(state.activityEvents).toEqual([]);
    expect(state.historicalOutputCache.size).toBe(0);
  });
});

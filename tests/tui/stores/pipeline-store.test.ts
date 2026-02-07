/**
 * ABOUTME: Tests for the pipeline external store slice.
 * Covers merge/validation metrics, failure tracking, and parallel map updates.
 */

import { describe, expect, test } from 'bun:test';
import { createPipelineStore } from '../../../src/tui/stores/pipeline-store.js';

describe('pipeline-store', () => {
  test('initializes with zeroed metrics', () => {
    const store = createPipelineStore();
    const state = store.getState();

    expect(state.mergeStats.queued).toBe(0);
    expect(state.validationStats.running).toBe(false);
    expect(state.worktreeHealthSummary.total).toBe(0);
    expect(state.parallelTimings.size).toBe(0);
    expect(state.parallelIterations.size).toBe(0);
  });

  test('updates and removes parallel timing/iteration entries', () => {
    const store = createPipelineStore();

    store.dispatch({
      type: 'pipeline/set-parallel-timing',
      key: 'task-1',
      timing: { startedAt: '2026-01-01T00:00:00.000Z', isRunning: true },
    });
    store.dispatch({ type: 'pipeline/set-parallel-iteration', key: 'task-1', iteration: 4 });

    expect(store.getState().parallelTimings.get('task-1')?.isRunning).toBe(true);
    expect(store.getState().parallelIterations.get('task-1')).toBe(4);

    store.dispatch({ type: 'pipeline/remove-parallel-timing', key: 'task-1' });
    store.dispatch({ type: 'pipeline/remove-parallel-iteration', key: 'task-1' });

    expect(store.getState().parallelTimings.has('task-1')).toBe(false);
    expect(store.getState().parallelIterations.has('task-1')).toBe(false);
  });

  test('tracks merge and validation stats', () => {
    const store = createPipelineStore();

    store.dispatch({ type: 'pipeline/patch-merge-stats', patch: { queued: 2, merged: 1 } });
    store.dispatch({ type: 'pipeline/patch-validation-stats', patch: { queued: 3, running: true } });
    store.dispatch({ type: 'pipeline/set-pending-main-count', count: 5 });

    const state = store.getState();
    expect(state.mergeStats.queued).toBe(2);
    expect(state.mergeStats.merged).toBe(1);
    expect(state.validationStats.queued).toBe(3);
    expect(state.validationStats.running).toBe(true);
    expect(state.pendingMainCount).toBe(5);
  });

  test('adds failures and pending-main task entries', () => {
    const store = createPipelineStore();

    store.dispatch({
      type: 'pipeline/add-run-failure',
      failure: {
        taskId: 'task-1',
        taskTitle: 'Broken merge',
        reason: 'conflict',
        phase: 'merge',
      },
    });

    store.dispatch({
      type: 'pipeline/set-pending-main-tasks',
      tasks: [{ taskId: 'task-2', taskTitle: 'Needs sync', commitCount: 2 }],
    });

    const state = store.getState();
    expect(state.runFailures).toHaveLength(1);
    expect(state.runFailures[0]?.taskId).toBe('task-1');
    expect(state.pendingMainTasks).toHaveLength(1);
    expect(state.pendingMainTasks[0]?.commitCount).toBe(2);
  });

  test('supports subscribe/unsubscribe', () => {
    const store = createPipelineStore();

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({ type: 'pipeline/set-pruning', pruning: true });
    expect(notifications).toBe(1);

    unsubscribe();
    store.dispatch({ type: 'pipeline/set-pruning', pruning: false });
    expect(notifications).toBe(1);
  });
});

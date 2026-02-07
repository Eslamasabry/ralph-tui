/**
 * ABOUTME: Tests for the task external store slice.
 * Covers tracker conversion, dependency status recalculation, and task selection/filtering.
 */

import { describe, expect, test } from 'bun:test';
import type { TrackerTask } from '../../../src/plugins/trackers/types.js';
import {
  createTaskStore,
  getVisibleTasks,
  trackerStatusToTaskStatus,
  convertTasksWithDependencyStatus,
} from '../../../src/tui/stores/task-store.js';

describe('task-store', () => {
  test('initializes loading flags as false', () => {
    const store = createTaskStore();
    const state = store.getState();

    expect(state.isLoading).toBe(false);
    expect(state.isRefreshing).toBe(false);
  });

  test('maps tracker statuses to task statuses', () => {
    expect(trackerStatusToTaskStatus('open')).toBe('pending');
    expect(trackerStatusToTaskStatus('in_progress')).toBe('active');
    expect(trackerStatusToTaskStatus('completed')).toBe('closed');
    expect(trackerStatusToTaskStatus('blocked')).toBe('blocked');
    expect(trackerStatusToTaskStatus('cancelled')).toBe('closed');
    expect(trackerStatusToTaskStatus('unknown')).toBe('pending');
  });

  test('converts tracker tasks with dependency awareness', () => {
    const trackerTasks: TrackerTask[] = [
      { id: 't1', title: 'Task 1', status: 'completed', priority: 1 },
      { id: 't2', title: 'Task 2', status: 'open', priority: 1, dependsOn: ['t1'] },
      { id: 't3', title: 'Task 3', status: 'open', priority: 1, dependsOn: ['missing'] },
    ];

    const converted = convertTasksWithDependencyStatus(trackerTasks);

    expect(converted[1]?.status).toBe('actionable');
    expect(converted[2]?.status).toBe('blocked');
    expect(converted[2]?.blockedByTasks?.[0]?.id).toBe('missing');
  });

  test('recalculates dependent tasks when blocker status changes', () => {
    const store = createTaskStore();

    store.dispatch({
      type: 'tasks/set-tasks',
      tasks: [
        { id: 't1', title: 'Task 1', status: 'pending' },
        { id: 't2', title: 'Task 2', status: 'pending', dependsOn: ['t1'] },
      ],
    });

    expect(store.getState().tasks[1]?.status).toBe('blocked');

    store.dispatch({ type: 'tasks/update-task-status', taskId: 't1', status: 'done' });

    const dependentTask = store.getState().tasks.find((task) => task.id === 't2');
    expect(dependentTask?.status).toBe('actionable');
    expect(dependentTask?.blockedByTasks).toBeUndefined();
  });

  test('filters closed tasks based on visibility toggle', () => {
    const store = createTaskStore({
      tasks: [
        { id: 'open-1', title: 'Open Task', status: 'actionable' },
        { id: 'closed-1', title: 'Closed Task', status: 'closed' },
      ],
      showClosedTasks: true,
    });

    expect(getVisibleTasks(store.getState())).toHaveLength(2);

    store.dispatch({ type: 'tasks/set-show-closed', showClosedTasks: false });
    expect(getVisibleTasks(store.getState())).toHaveLength(1);
    expect(getVisibleTasks(store.getState())[0]?.id).toBe('open-1');
  });

  test('supports subscribe/unsubscribe', () => {
    const store = createTaskStore();

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({ type: 'tasks/set-selected-index', index: 1 });
    expect(notifications).toBe(0);

    store.dispatch({
      type: 'tasks/set-tasks',
      tasks: [{ id: 'x', title: 'X', status: 'pending' }],
    });
    expect(notifications).toBe(1);

    unsubscribe();
    store.dispatch({ type: 'tasks/set-selected-index', index: 0 });
    expect(notifications).toBe(1);
  });

  test('tracks loading and refresh lifecycle flags', () => {
    const store = createTaskStore();
    store.dispatch({ type: 'tasks/set-loading', loading: true });
    expect(store.getState().isLoading).toBe(true);

    store.dispatch({ type: 'tasks/set-refreshing', refreshing: true });
    expect(store.getState().isRefreshing).toBe(true);

    store.dispatch({
      type: 'tasks/refresh',
      tasks: [{ id: 'r1', title: 'Refreshed', status: 'open', priority: 1 }],
    });

    const state = store.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.id).toBe('r1');
    expect(state.isLoading).toBe(false);
    expect(state.isRefreshing).toBe(false);
  });
});

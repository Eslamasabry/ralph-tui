/**
 * ABOUTME: External store slice for task list state and dependency-aware status derivation.
 * Includes tracker-to-TUI conversion helpers plus task selection and closed-task filtering.
 */

import type { TrackerTask } from '../../plugins/trackers/types.js';
import type { TaskItem, BlockerInfo } from '../types.js';
import type { TaskStatus } from '../theme.js';
import {
  applyPatch,
  createExternalStore,
  useStoreDispatch,
  useStoreSelector,
  type ExternalStore,
  type StoreSelector,
} from './store-utils.js';

export interface TaskStoreState {
  tasks: TaskItem[];
  selectedIndex: number;
  showClosedTasks: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
}

export type TaskStoreAction =
  | { type: 'tasks/reset'; state?: Partial<TaskStoreState> }
  | { type: 'tasks/patch'; patch: Partial<TaskStoreState> }
  | { type: 'tasks/set-tasks'; tasks: TaskItem[]; recalculateDependencies?: boolean }
  | { type: 'tasks/set-tracker-tasks'; tasks: TrackerTask[] }
  | { type: 'tasks/upsert-task'; task: TaskItem }
  | { type: 'tasks/update-task-status'; taskId: string; status: TaskStatus }
  | { type: 'tasks/set-selected-index'; index: number }
  | { type: 'tasks/select-task-by-id'; taskId: string }
  | { type: 'tasks/set-show-closed'; showClosedTasks: boolean }
  | { type: 'tasks/recalculate-dependencies' }
  | { type: 'tasks/set-loading'; loading: boolean }
  | { type: 'tasks/set-refreshing'; refreshing: boolean }
  | { type: 'tasks/refresh'; tasks: TrackerTask[] };

export type TaskStore = ExternalStore<TaskStoreState, TaskStoreAction>;

const DEFAULT_TASK_STORE_STATE: TaskStoreState = {
  tasks: [],
  selectedIndex: 0,
  showClosedTasks: true,
  isLoading: false,
  isRefreshing: false,
};

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }

  if (index < 0) {
    return 0;
  }

  if (index >= length) {
    return length - 1;
  }

  return index;
}

function cloneBlocker(blocker: BlockerInfo): BlockerInfo {
  return {
    ...blocker,
  };
}

function cloneTask(task: TaskItem): TaskItem {
  return {
    ...task,
    labels: task.labels ? [...task.labels] : undefined,
    dependsOn: task.dependsOn ? [...task.dependsOn] : undefined,
    blocks: task.blocks ? [...task.blocks] : undefined,
    blockedByTasks: task.blockedByTasks ? task.blockedByTasks.map(cloneBlocker) : undefined,
  };
}

function cloneTasks(tasks: TaskItem[]): TaskItem[] {
  return tasks.map(cloneTask);
}

function createInitialState(initialState: Partial<TaskStoreState> = {}): TaskStoreState {
  const tasks = cloneTasks(initialState.tasks ?? []);
  return {
    tasks,
    selectedIndex: clampIndex(initialState.selectedIndex ?? 0, tasks.length),
    showClosedTasks: initialState.showClosedTasks ?? DEFAULT_TASK_STORE_STATE.showClosedTasks,
    isLoading: initialState.isLoading ?? DEFAULT_TASK_STORE_STATE.isLoading,
    isRefreshing: initialState.isRefreshing ?? DEFAULT_TASK_STORE_STATE.isRefreshing,
  };
}

/**
 * Convert tracker status to TUI task status (basic mapping without dependency checks).
 */
export function trackerStatusToTaskStatus(trackerStatus: string): TaskStatus {
  switch (trackerStatus) {
    case 'open':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'completed':
      return 'closed';
    case 'blocked':
      return 'blocked';
    case 'cancelled':
      return 'closed';
    default:
      return 'pending';
  }
}

/**
 * Convert a tracker task into a TUI task item.
 */
export function trackerTaskToTaskItem(task: TrackerTask): TaskItem {
  return {
    id: task.id,
    title: task.title,
    status: trackerStatusToTaskStatus(task.status),
    description: task.description,
    priority: task.priority,
    labels: task.labels,
    type: task.type,
    dependsOn: task.dependsOn,
    blocks: task.blocks,
    assignee: task.assignee,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    parentId: task.parentId,
    metadata: task.metadata,
  };
}

/**
 * Recalculate blocked/actionable status based on TaskItem dependency statuses.
 */
export function recalculateDependencyStatus(tasks: TaskItem[]): TaskItem[] {
  const statusMap = new Map<string, { status: TaskStatus; title: string }>();
  for (const task of tasks) {
    statusMap.set(task.id, { status: task.status, title: task.title });
  }

  return tasks.map((task) => {
    if (task.status !== 'pending' && task.status !== 'blocked' && task.status !== 'actionable') {
      return cloneTask(task);
    }

    if (!task.dependsOn || task.dependsOn.length === 0) {
      if (task.status === 'pending') {
        return {
          ...cloneTask(task),
          status: 'actionable',
        };
      }
      return cloneTask(task);
    }

    const blockers: BlockerInfo[] = [];
    for (const depId of task.dependsOn) {
      const dep = statusMap.get(depId);
      if (dep) {
        if (dep.status !== 'done' && dep.status !== 'closed') {
          blockers.push({
            id: depId,
            title: dep.title,
            status: dep.status,
          });
        }
      } else {
        blockers.push({
          id: depId,
          title: `(external: ${depId})`,
          status: 'unknown',
        });
      }
    }

    if (blockers.length > 0) {
      return {
        ...cloneTask(task),
        status: 'blocked',
        blockedByTasks: blockers,
      };
    }

    return {
      ...cloneTask(task),
      status: 'actionable',
      blockedByTasks: undefined,
    };
  });
}

/**
 * Convert tracker tasks and derive actionable/blocked status from dependency graph.
 */
export function convertTasksWithDependencyStatus(trackerTasks: TrackerTask[]): TaskItem[] {
  const taskMap = new Map<string, { status: BlockerInfo['status']; title: string }>();
  for (const task of trackerTasks) {
    taskMap.set(task.id, { status: task.status as BlockerInfo['status'], title: task.title });
  }

  return trackerTasks.map((task) => {
    const baseItem = trackerTaskToTaskItem(task);

    if (baseItem.status !== 'pending') {
      return baseItem;
    }

    if (!task.dependsOn || task.dependsOn.length === 0) {
      return {
        ...baseItem,
        status: 'actionable',
      };
    }

    const blockers: BlockerInfo[] = [];
    for (const depId of task.dependsOn) {
      const dep = taskMap.get(depId);
      if (dep) {
        if (dep.status !== 'completed' && dep.status !== 'cancelled' && dep.status !== 'closed') {
          blockers.push({
            id: depId,
            title: dep.title,
            status: dep.status,
          });
        }
      } else {
        blockers.push({
          id: depId,
          title: `(external: ${depId})`,
          status: 'unknown',
        });
      }
    }

    if (blockers.length > 0) {
      return {
        ...baseItem,
        status: 'blocked',
        blockedByTasks: blockers,
      };
    }

    return {
      ...baseItem,
      status: 'actionable',
    };
  });
}

/**
 * Returns visible tasks according to the closed-task filter.
 */
export function getVisibleTasks(state: Readonly<TaskStoreState>): TaskItem[] {
  if (state.showClosedTasks) {
    return state.tasks;
  }

  return state.tasks.filter((task) => task.status !== 'closed');
}

function taskReducer(state: Readonly<TaskStoreState>, action: TaskStoreAction): TaskStoreState {
  switch (action.type) {
    case 'tasks/reset':
      return createInitialState(action.state);

    case 'tasks/patch':
      return applyPatch(state, action.patch);

    case 'tasks/set-tasks': {
      const nextTasks = action.recalculateDependencies === false
        ? cloneTasks(action.tasks)
        : recalculateDependencyStatus(cloneTasks(action.tasks));

      return applyPatch(state, {
        tasks: nextTasks,
        selectedIndex: clampIndex(state.selectedIndex, nextTasks.length),
        isLoading: false,
      });
    }

    case 'tasks/set-tracker-tasks': {
      const nextTasks = convertTasksWithDependencyStatus(action.tasks);
      return applyPatch(state, {
        tasks: nextTasks,
        selectedIndex: clampIndex(state.selectedIndex, nextTasks.length),
        isLoading: false,
        isRefreshing: false,
      });
    }

    case 'tasks/upsert-task': {
      const existingIndex = state.tasks.findIndex((task) => task.id === action.task.id);
      const nextTasks = [...state.tasks];

      if (existingIndex >= 0) {
        nextTasks[existingIndex] = cloneTask(action.task);
      } else {
        nextTasks.push(cloneTask(action.task));
      }

      const recalculatedTasks = recalculateDependencyStatus(nextTasks);
      return applyPatch(state, {
        tasks: recalculatedTasks,
        selectedIndex: clampIndex(state.selectedIndex, recalculatedTasks.length),
      });
    }

    case 'tasks/update-task-status': {
      let updated = false;
      const nextTasks = state.tasks.map((task) => {
        if (task.id !== action.taskId) {
          return cloneTask(task);
        }

        if (task.status === action.status) {
          return cloneTask(task);
        }

        updated = true;
        return {
          ...cloneTask(task),
          status: action.status,
        };
      });

      if (!updated) {
        return state;
      }

      const recalculatedTasks = recalculateDependencyStatus(nextTasks);
      return applyPatch(state, {
        tasks: recalculatedTasks,
      });
    }

    case 'tasks/set-selected-index':
      return applyPatch(state, {
        selectedIndex: clampIndex(action.index, state.tasks.length),
      });

    case 'tasks/select-task-by-id': {
      const index = state.tasks.findIndex((task) => task.id === action.taskId);
      if (index === -1) {
        return state;
      }

      return applyPatch(state, {
        selectedIndex: index,
      });
    }

    case 'tasks/set-show-closed':
      return applyPatch(state, {
        showClosedTasks: action.showClosedTasks,
      });

    case 'tasks/recalculate-dependencies':
      return applyPatch(state, {
        tasks: recalculateDependencyStatus(state.tasks),
      });

    case 'tasks/set-loading':
      return applyPatch(state, {
        isLoading: action.loading,
      });

    case 'tasks/set-refreshing':
      return applyPatch(state, {
        isRefreshing: action.refreshing,
      });

    case 'tasks/refresh': {
      const refreshedTasks = convertTasksWithDependencyStatus(action.tasks);
      return applyPatch(state, {
        tasks: refreshedTasks,
        selectedIndex: clampIndex(state.selectedIndex, refreshedTasks.length),
        isRefreshing: false,
        isLoading: false,
      });
    }

    default:
      return state;
  }
}

export function createTaskStore(initialState: Partial<TaskStoreState> = {}): TaskStore {
  return createExternalStore<TaskStoreState, TaskStoreAction>({
    initialState: createInitialState(initialState),
    reducer: taskReducer,
  });
}

export function useTaskSelector<Selected>(
  store: TaskStore,
  selector: StoreSelector<TaskStoreState, Selected>
): Selected {
  return useStoreSelector(store, selector);
}

export function useTaskDispatch(store: TaskStore): (action: TaskStoreAction) => void {
  return useStoreDispatch(store);
}

export function useTaskList(store: TaskStore): TaskItem[] {
  return useTaskSelector(store, (state) => state.tasks);
}

export function useTaskById(store: TaskStore, taskId: string): TaskItem | undefined {
  return useTaskSelector(store, (state) => state.tasks.find((task) => task.id === taskId));
}

export function useTaskCounts(store: TaskStore): {
  total: number;
  actionable: number;
  active: number;
  blocked: number;
  done: number;
  closed: number;
  error: number;
} {
  return useTaskSelector(store, (state) => {
    let actionable = 0;
    let active = 0;
    let blocked = 0;
    let done = 0;
    let closed = 0;
    let error = 0;

    for (const task of state.tasks) {
      if (task.status === 'actionable') {
        actionable += 1;
      } else if (task.status === 'active') {
        active += 1;
      } else if (task.status === 'blocked') {
        blocked += 1;
      } else if (task.status === 'done') {
        done += 1;
      } else if (task.status === 'closed') {
        closed += 1;
      } else if (task.status === 'error') {
        error += 1;
      }
    }

    return {
      total: state.tasks.length,
      actionable,
      active,
      blocked,
      done,
      closed,
      error,
    };
  });
}

export function useTaskLoadingState(store: TaskStore): {
  isLoading: boolean;
  isRefreshing: boolean;
} {
  return useTaskSelector(store, (state) => ({
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
  }));
}

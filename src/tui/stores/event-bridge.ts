/**
 * ABOUTME: Batched engine event bridge for TUI external stores.
 * Subscribes to engine and optional parallel events, coalesces output updates,
 * and dispatches mapped actions into store slices.
 */

import type { EngineController, EngineEvent } from '../../engine/types.js';
import type { ParallelEvent } from '../../engine/parallel/types.js';
import type { ActivityEvent } from '../../logs/activity-events.js';
import type { TuiStores } from './tui-provider.js';
import { convertTasksWithDependencyStatus } from './task-store.js';
import type { TaskItem } from '../types.js';

const OUTPUT_CAP_BYTES = 500_000;
const DEFAULT_BATCH_INTERVAL_MS = 50;

type BridgeEvent = EngineEvent | ParallelEvent;

export interface EventBridgeOptions {
  batchIntervalMs?: number;
  outputCapBytes?: number;
}

export interface EventBridgeControl {
  destroy(): void;
  flush(): void;
}

function createActivityEventId(event: BridgeEvent): string {
  const nonce = Math.random().toString(36).slice(2, 8);
  return `activity:${event.type}:${event.timestamp}:${nonce}`;
}

function eventTypeSuffix(type: string): string {
  const index = type.indexOf(':');
  if (index < 0) {
    return type;
  }
  return type.slice(index + 1);
}

function toActivityEvent(event: BridgeEvent): ActivityEvent | null {
  if (event.type === 'agent:output') {
    return null;
  }

  let category: ActivityEvent['category'] = 'system';
  let severity: ActivityEvent['severity'] = 'info';
  let description: string = event.type;
  let iteration: number | undefined;
  let taskId: string | undefined;
  let taskTitle: string | undefined;
  let agentPlugin: string | undefined;
  const metadata: Record<string, unknown> = {};

  if (event.type.startsWith('engine:')) {
    category = 'engine';
  } else if (event.type.startsWith('iteration:')) {
    category = 'iteration';
  } else if (event.type.startsWith('task:')) {
    category = 'task';
  } else if (event.type.startsWith('agent:')) {
    category = 'agent';
  } else if (event.type.startsWith('parallel:')) {
    category = 'system';
  }

  switch (event.type) {
    case 'engine:started':
      description = `Run started with ${event.tasks.length} task${event.tasks.length === 1 ? '' : 's'}.`;
      metadata.sessionId = event.sessionId;
      break;
    case 'engine:stopped':
      description = `Run stopped (${event.reason}) after ${event.totalIterations} iteration${event.totalIterations === 1 ? '' : 's'}.`;
      if (event.reason === 'error') {
        severity = 'error';
      } else if (event.reason === 'interrupted') {
        severity = 'warning';
      }
      break;
    case 'engine:paused':
      description = `Run paused at iteration ${event.currentIteration}.`;
      iteration = event.currentIteration;
      severity = 'warning';
      break;
    case 'engine:resumed':
      description = `Run resumed at iteration ${event.fromIteration}.`;
      iteration = event.fromIteration;
      break;
    case 'engine:warning':
      description = event.message;
      severity = 'warning';
      metadata.code = event.code;
      break;
    case 'engine:iterations-added':
      description = `Added ${event.added} iteration${event.added === 1 ? '' : 's'} (max ${event.newMax}).`;
      iteration = event.currentIteration;
      break;
    case 'engine:iterations-removed':
      description = `Removed ${event.removed} iteration${event.removed === 1 ? '' : 's'} (max ${event.newMax}).`;
      iteration = event.currentIteration;
      severity = 'warning';
      break;
    case 'iteration:started':
      description = `Iteration ${event.iteration} started on ${event.task.id}.`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      break;
    case 'iteration:completed':
      description = `Iteration ${event.result.iteration} completed for ${event.result.task.id}.`;
      iteration = event.result.iteration;
      taskId = event.result.task.id;
      taskTitle = event.result.task.title;
      break;
    case 'iteration:failed':
      description = `Iteration ${event.iteration} failed on ${event.task.id}: ${event.error}`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      severity = 'error';
      metadata.action = event.action;
      break;
    case 'iteration:retrying':
      description = `Retrying ${event.task.id} (${event.retryAttempt}/${event.maxRetries}).`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      severity = 'warning';
      metadata.delayMs = event.delayMs;
      break;
    case 'iteration:skipped':
      description = `Skipped ${event.task.id}: ${event.reason}`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      severity = 'warning';
      break;
    case 'iteration:rate-limited':
      description = `Rate limited on ${event.task.id} (retry ${event.retryAttempt}/${event.maxRetries}).`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      severity = 'warning';
      metadata.delayMs = event.delayMs;
      break;
    case 'iteration:commit-recovery':
      description = `Commit recovery for ${event.task.id} (${event.retryAttempt}/${event.maxRetries}).`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      severity = 'warning';
      metadata.reason = event.reason;
      break;
    case 'task:selected':
      description = `Selected task ${event.task.id}.`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      break;
    case 'task:activated':
      description = `Activated task ${event.task.id}.`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      break;
    case 'task:completed':
      description = `Completed task ${event.task.id}.`;
      iteration = event.iteration;
      taskId = event.task.id;
      taskTitle = event.task.title;
      break;
    case 'task:blocked':
      description = `Blocked task ${event.task.id}: ${event.reason}`;
      taskId = event.task.id;
      taskTitle = event.task.title;
      severity = 'warning';
      break;
    case 'agent:switched':
      description = `Switched agent to ${event.newAgent} (${event.reason}).`;
      agentPlugin = event.newAgent;
      if (event.reason === 'fallback') {
        severity = 'warning';
      }
      break;
    case 'agent:all-limited':
      description = `All agents rate limited for ${event.task.id}.`;
      taskId = event.task.id;
      taskTitle = event.task.title;
      severity = 'warning';
      metadata.triedAgents = event.triedAgents;
      break;
    case 'agent:recovery-attempted':
      description = event.success
        ? `Recovered primary agent ${event.primaryAgent}.`
        : `Primary agent ${event.primaryAgent} still rate limited.`;
      agentPlugin = event.primaryAgent;
      severity = event.success ? 'info' : 'warning';
      metadata.fallbackAgent = event.fallbackAgent;
      break;
    case 'all:complete':
      description = `All tasks complete (${event.totalCompleted} tasks, ${event.totalIterations} iterations).`;
      break;
    case 'tasks:refreshed':
      description = `Tasks refreshed (${event.tasks.length}).`;
      break;
    case 'tracker:realtime':
      description = `Tracker realtime status: ${event.status}.`;
      metadata.intervalMs = event.intervalMs;
      if (event.status === 'stale') {
        severity = 'warning';
      }
      break;
    case 'main-sync-skipped':
    case 'main-sync-failed':
    case 'main-sync-alert':
      description = event.reason;
      severity = event.type === 'main-sync-skipped' ? 'warning' : 'error';
      break;
    case 'main-sync-retrying':
      description = `Main sync retry ${event.retryAttempt}/${event.maxRetries}: ${event.reason}`;
      severity = 'warning';
      metadata.delayMs = event.delayMs;
      break;
    case 'main-sync-succeeded':
      description = `Main sync succeeded at ${event.commit.slice(0, 8)}.`;
      metadata.commit = event.commit;
      break;
    default: {
      if (event.type.startsWith('parallel:')) {
        description = `Parallel event: ${eventTypeSuffix(event.type)}`;
      }
      break;
    }
  }

  return {
    id: createActivityEventId(event),
    category,
    eventType: eventTypeSuffix(event.type),
    timestamp: event.timestamp,
    severity,
    description,
    iteration,
    taskId,
    taskTitle,
    agentPlugin,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function mapEngineEventToStoreActions(
  event: BridgeEvent,
  stores: TuiStores
): void {
  const dispatchPhase = (action: Parameters<typeof stores.phase.dispatch>[0]): void => {
    try {
      stores.phase.dispatch(action);
    } catch {
      // Fault isolation: one broken store update must not block other stores.
    }
  };
  const dispatchOutput = (action: Parameters<typeof stores.output.dispatch>[0]): void => {
    try {
      stores.output.dispatch(action);
    } catch {
      // Fault isolation: one broken store update must not block other stores.
    }
  };
  const dispatchPipeline = (action: Parameters<typeof stores.pipeline.dispatch>[0]): void => {
    try {
      stores.pipeline.dispatch(action);
    } catch {
      // Fault isolation: one broken store update must not block other stores.
    }
  };
  const dispatchHistory = (action: Parameters<typeof stores.history.dispatch>[0]): void => {
    try {
      stores.history.dispatch(action);
    } catch {
      // Fault isolation: one broken store update must not block other stores.
    }
  };
  const dispatchTasks = (action: Parameters<typeof stores.tasks.dispatch>[0]): void => {
    try {
      stores.tasks.dispatch(action);
    } catch {
      // Fault isolation: one broken store update must not block other stores.
    }
  };
  const dispatchUI = (action: Parameters<typeof stores.ui.dispatch>[0]): void => {
    try {
      stores.ui.dispatch(action);
    } catch {
      // Fault isolation: one broken store update must not block other stores.
    }
  };
  const dispatchSubagent = (action: Parameters<typeof stores.subagent.dispatch>[0]): void => {
    try {
      stores.subagent.dispatch(action);
    } catch {
      // Fault isolation: one broken store update must not block other stores.
    }
  };
  const activityEvent = toActivityEvent(event);
  if (activityEvent && event.type !== 'engine:started') {
    dispatchHistory({ type: 'history/append-activity', event: activityEvent });
  }

  switch (event.type) {
    case 'engine:started':
      dispatchHistory({ type: 'history/clear' });
      if (activityEvent) {
        dispatchHistory({ type: 'history/append-activity', event: activityEvent });
      }
      dispatchPhase({ type: 'phase/set-status', status: 'running' });
      dispatchPhase({ type: 'phase/set-iteration', currentIteration: 0 });
      dispatchPhase({
        type: 'phase/set-run-timing',
        startedAtMs: Date.now(),
        endedAtMs: undefined,
      });
      dispatchTasks({ type: 'tasks/set-tracker-tasks', tasks: event.tasks });
      dispatchUI({
        type: 'ui/set-tab-count',
        count: Math.max(1, stores.ui.getState().tabCount),
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: 'Run started.',
          variant: 'info',
          autoDismissMs: 3000,
        },
      });
      return;

    case 'engine:paused':
      dispatchPhase({ type: 'phase/set-status', status: 'paused' });
      return;

    case 'engine:resumed':
      dispatchPhase({ type: 'phase/set-status', status: 'running' });
      return;

    case 'engine:warning':
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: event.message,
          variant: 'warning',
        },
      });
      return;

    case 'engine:stopped':
      dispatchPhase({
        type: 'phase/set-status',
        status: event.reason === 'completed' ? 'complete' : 'stopped',
      });
      dispatchPhase({
        type: 'phase/set-run-timing',
        startedAtMs: stores.phase.getState().runStartedAtMs,
        endedAtMs: Date.now(),
      });
      dispatchHistory({
        type: 'history/set-total-iterations',
        total: event.totalIterations,
      });
      return;

    case 'engine:iterations-added':
    case 'engine:iterations-removed':
      dispatchPhase({
        type: 'phase/set-max-iterations',
        maxIterations: event.newMax,
      });
      return;

    case 'iteration:started':
      dispatchPhase({ type: 'phase/set-status', status: 'executing' });
      dispatchPhase({
        type: 'phase/set-iteration',
        currentIteration: event.iteration,
      });
      dispatchPhase({
        type: 'phase/set-current-task',
        taskId: event.task.id,
        taskTitle: event.task.title,
      });
      dispatchOutput({ type: 'output/set-current-output', output: '' });
      dispatchOutput({ type: 'output/set-cli-output', output: '' });
      dispatchOutput({ type: 'output/set-segments', segments: [] });
      dispatchSubagent({ type: 'subagent/clear-on-task-switch' });
      return;

    case 'iteration:retrying':
      dispatchPhase({ type: 'phase/set-status', status: 'executing' });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Retrying ${event.task.id} (${event.retryAttempt}/${event.maxRetries}).`,
          variant: 'warning',
        },
      });
      return;

    case 'iteration:skipped':
      dispatchTasks({
        type: 'tasks/update-task-status',
        taskId: event.task.id,
        status: 'blocked',
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Skipped ${event.task.id}: ${event.reason}`,
          variant: 'warning',
        },
      });
      return;

    case 'iteration:rate-limited':
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Rate limited on ${event.task.id}. Retrying in ${Math.ceil(event.delayMs / 1000)}s.`,
          variant: 'warning',
        },
      });
      return;

    case 'iteration:commit-recovery':
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Recovering commit for ${event.task.id}.`,
          variant: 'warning',
        },
      });
      return;

    case 'task:selected':
      dispatchPhase({ type: 'phase/set-status', status: 'selecting' });
      dispatchPhase({
        type: 'phase/set-current-task',
        taskId: event.task.id,
        taskTitle: event.task.title,
      });
      dispatchTasks({
        type: 'tasks/select-task-by-id',
        taskId: event.task.id,
      });
      dispatchSubagent({ type: 'subagent/clear-on-task-switch' });
      return;

    case 'task:activated':
      dispatchTasks({
        type: 'tasks/update-task-status',
        taskId: event.task.id,
        status: 'active',
      });
      return;

    case 'iteration:completed':
      dispatchPhase({ type: 'phase/set-status', status: 'selecting' });
      dispatchHistory({
        type: 'history/append-iteration',
        iteration: event.result,
      });
      return;

    case 'iteration:failed':
      dispatchPhase({ type: 'phase/set-status', status: 'error' });
      dispatchPhase({
        type: 'phase/set-current-task',
        taskId: event.task.id,
        taskTitle: event.task.title,
      });
      dispatchPipeline({
        type: 'pipeline/add-run-failure',
        failure: {
          taskId: event.task.id,
          taskTitle: event.task.title,
          reason: event.error,
          phase: 'execution',
          iteration: event.iteration,
        },
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Iteration failed on ${event.task.id}: ${event.error}`,
          variant: 'error',
        },
      });
      return;

    case 'task:completed': {
      dispatchTasks({
        type: 'tasks/update-task-status',
        taskId: event.task.id,
        status: 'done',
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `✓ Task ${event.task.title} complete.`,
          variant: 'success',
          autoDismissMs: 3000,
        },
      });
      return;
    }

    case 'task:blocked':
      dispatchTasks({
        type: 'tasks/update-task-status',
        taskId: event.task.id,
        status: 'blocked',
      });
      dispatchPipeline({
        type: 'pipeline/add-run-failure',
        failure: {
          taskId: event.task.id,
          taskTitle: event.task.title,
          reason: event.reason,
          phase: 'execution',
        },
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Task blocked: ${event.task.id}`,
          variant: 'warning',
        },
      });
      return;

    case 'all:complete':
      dispatchPhase({ type: 'phase/set-status', status: 'complete' });
      dispatchHistory({
        type: 'history/set-total-iterations',
        total: event.totalIterations,
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: 'All tasks complete! Press Enter for summary.',
          variant: 'success',
        },
      });
      dispatchUI({ type: 'ui/open-overlay', overlay: 'runSummary' });
      return;

    case 'tasks:refreshed':
      dispatchTasks({ type: 'tasks/refresh', tasks: event.tasks });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Tasks refreshed. ${event.tasks.length} tasks loaded.`,
          variant: 'info',
          autoDismissMs: 3000,
        },
      });
      return;

    case 'agent:switched':
      dispatchPhase({
        type: 'phase/set-active-agent',
        activeAgentState: {
          plugin: event.newAgent,
          reason: event.reason,
          since: event.timestamp,
        },
      });
      dispatchPhase({
        type: 'phase/set-rate-limit',
        rateLimitState: event.rateLimitState ?? null,
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Switched agent to ${event.newAgent}.`,
          variant: event.reason === 'fallback' ? 'warning' : 'info',
          autoDismissMs: event.reason === 'fallback' ? undefined : 3000,
        },
      });
      return;

    case 'agent:all-limited':
      dispatchPhase({ type: 'phase/set-status', status: 'paused' });
      dispatchPhase({
        type: 'phase/set-rate-limit',
        rateLimitState: event.rateLimitState,
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: 'All agents are rate limited.',
          variant: 'warning',
        },
      });
      return;

    case 'agent:recovery-attempted':
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: event.success
            ? `Rate limit cleared. Resumed ${event.primaryAgent}.`
            : `Primary agent ${event.primaryAgent} still rate limited.`,
          variant: event.success ? 'info' : 'warning',
          autoDismissMs: event.success ? 3000 : undefined,
        },
      });
      return;

    case 'tracker:realtime':
      dispatchPhase({
        type: 'phase/set-tracker-realtime',
        trackerRealtimeStatus: event.status,
      });
      return;

    case 'main-sync-failed':
      dispatchPipeline({
        type: 'pipeline/set-main-sync-failure',
        reason: event.reason,
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Main sync failed: ${event.reason}`,
          variant: 'warning',
        },
      });
      return;

    case 'main-sync-skipped':
      dispatchPipeline({
        type: 'pipeline/set-main-sync-failure',
        reason: event.reason,
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Main sync skipped: ${event.reason}`,
          variant: 'warning',
        },
      });
      return;

    case 'main-sync-succeeded':
      dispatchPipeline({
        type: 'pipeline/set-main-sync-failure',
        reason: undefined,
      });
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Main sync succeeded (${event.commit.slice(0, 8)}).`,
          variant: 'success',
          autoDismissMs: 3000,
        },
      });
      return;

    case 'main-sync-retrying':
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Main sync retry ${event.retryAttempt}/${event.maxRetries} in ${Math.ceil(event.delayMs / 1000)}s.`,
          variant: 'warning',
        },
      });
      return;

    case 'main-sync-alert':
      dispatchUI({
        type: 'ui/push-toast',
        toast: {
          message: `Main sync alert: ${event.reason}`,
          variant: 'error',
        },
      });
      return;

    case 'parallel:merge-queued':
      dispatchPipeline({
        type: 'pipeline/patch-merge-stats',
        patch: { queued: stores.pipeline.getState().mergeStats.queued + 1 },
      });
      return;

    case 'parallel:merge-succeeded':
      dispatchPipeline({
        type: 'pipeline/patch-merge-stats',
        patch: { merged: stores.pipeline.getState().mergeStats.merged + 1 },
      });
      return;

    case 'parallel:merge-failed':
      dispatchPipeline({
        type: 'pipeline/patch-merge-stats',
        patch: { failed: stores.pipeline.getState().mergeStats.failed + 1 },
      });
      dispatchPipeline({
        type: 'pipeline/add-run-failure',
        failure: {
          taskId: event.task.id,
          taskTitle: event.task.title,
          commitHash: event.commit,
          reason: event.reason,
          conflictFiles: event.conflictFiles,
          phase: 'merge',
        },
      });
      return;

    case 'parallel:validation-started':
      dispatchPipeline({
        type: 'pipeline/patch-validation-stats',
        patch: { running: true },
      });
      return;

    case 'parallel:validation-passed':
      dispatchPipeline({
        type: 'pipeline/patch-validation-stats',
        patch: {
          running: false,
          lastStatus: event.status,
        },
      });
      return;

    case 'parallel:validation-failed':
      dispatchPipeline({
        type: 'pipeline/patch-validation-stats',
        patch: {
          running: false,
          lastStatus: event.status,
        },
      });
      return;

    default:
      return;
  }
}

function trimOutputToCap(output: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(output);
  if (bytes.length <= maxBytes) {
    return output;
  }

  const overflow = bytes.length - maxBytes;
  // Conservative cut: slice string by overflow chars from the front.
  // For UTF-8 multi-byte chars this may over-trim slightly, which is acceptable.
  return output.slice(Math.max(0, overflow));
}

function safelyConvertInitialTasks(event: EngineEvent): TaskItem[] {
  if (event.type !== 'engine:started') {
    return [];
  }
  return convertTasksWithDependencyStatus(event.tasks);
}

export function createEventBridge(
  engine: EngineController,
  stores: TuiStores,
  options: EventBridgeOptions = {}
): EventBridgeControl {
  const batchIntervalMs = options.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS;
  const outputCapBytes = options.outputCapBytes ?? OUTPUT_CAP_BYTES;

  let pendingEvents: BridgeEvent[] = [];
  let pendingOutputStdout = '';
  let pendingOutputStderr = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const dispatchOutput = (action: Parameters<typeof stores.output.dispatch>[0]): void => {
    try {
      stores.output.dispatch(action);
    } catch {
      // Fault isolation for output store writes.
    }
  };
  const dispatchTasks = (action: Parameters<typeof stores.tasks.dispatch>[0]): void => {
    try {
      stores.tasks.dispatch(action);
    } catch {
      // Fault isolation for task store writes.
    }
  };

  const flush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (pendingOutputStdout.length > 0) {
      dispatchOutput({
        type: 'output/append-current-output',
        chunk: pendingOutputStdout,
      });

      const cappedOutput = trimOutputToCap(
        stores.output.getState().currentOutput,
        outputCapBytes
      );
      if (cappedOutput !== stores.output.getState().currentOutput) {
        dispatchOutput({
          type: 'output/set-current-output',
          output: cappedOutput,
        });
      }
      pendingOutputStdout = '';
    }

    if (pendingOutputStderr.length > 0) {
      dispatchOutput({
        type: 'output/append-cli-output',
        chunk: pendingOutputStderr,
      });
      pendingOutputStderr = '';
    }

    if (pendingEvents.length === 0) {
      return;
    }

    const eventsToFlush = pendingEvents;
    pendingEvents = [];

    for (const event of eventsToFlush) {
      mapEngineEventToStoreActions(event, stores);
    }
  };

  const scheduleFlush = () => {
    if (flushTimer) {
      return;
    }
    flushTimer = setTimeout(flush, batchIntervalMs);
  };

  const unsubscribeEngine = engine.on((event) => {
    if (event.type === 'agent:output') {
      if (event.stream === 'stderr') {
        pendingOutputStderr += event.data;
      } else {
        pendingOutputStdout += event.data;
      }

      if (event.taskId) {
        dispatchOutput({
          type: 'output/append-parallel-output',
          key: event.taskId,
          chunk: event.data,
        });
      }

      scheduleFlush();
      return;
    }

    if (event.type === 'engine:started') {
      const convertedTasks = safelyConvertInitialTasks(event);
      if (convertedTasks.length > 0) {
        dispatchTasks({
          type: 'tasks/set-tasks',
          tasks: convertedTasks,
          recalculateDependencies: false,
        });
      }
    }

    pendingEvents.push(event);
    scheduleFlush();
  });

  const unsubscribeParallel = engine.onParallel
    ? engine.onParallel((unknownEvent) => {
        const parallelEvent = unknownEvent as ParallelEvent;
        pendingEvents.push(parallelEvent);
        scheduleFlush();
      })
    : () => {};

  return {
    destroy(): void {
      unsubscribeEngine();
      unsubscribeParallel();
      flush();
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    },
    flush,
  };
}

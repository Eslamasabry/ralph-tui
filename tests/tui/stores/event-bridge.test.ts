/**
 * ABOUTME: Tests for the TUI event bridge batching and fault isolation behavior.
 * Verifies batched flushes, multi-store broadcast, store isolation on errors, and output cap enforcement.
 */

import { describe, expect, test } from 'bun:test';
import type {
  EngineController,
  EngineEvent,
  EngineEventListener,
  EngineState,
} from '../../../src/engine/types.js';
import type { ParallelEvent } from '../../../src/engine/parallel/types.js';
import { createEventBridge } from '../../../src/tui/stores/event-bridge.js';
import { createTuiStores } from '../../../src/tui/stores/tui-provider.js';
import type { TrackerTask } from '../../../src/plugins/trackers/types.js';

class FakeEngine implements EngineController {
  private listeners: EngineEventListener[] = [];
  private parallelListeners: Array<(event: unknown) => void> = [];

  async initialize(): Promise<void> {}

  async start(): Promise<void> {}

  stop(): void {}

  pause(): void {}

  resume(): void {}

  async refreshTasks(): Promise<void> {}

  getState(): Readonly<EngineState> {
    return {} as EngineState;
  }

  getTracker() {
    return null;
  }

  async resetTasksToOpen(): Promise<number> {
    return 0;
  }

  async dispose(): Promise<void> {}

  on(listener: EngineEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  onParallel(listener: (event: unknown) => void): () => void {
    this.parallelListeners.push(listener);
    return () => {
      this.parallelListeners = this.parallelListeners.filter((candidate) => candidate !== listener);
    };
  }

  emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  emitParallel(event: ParallelEvent): void {
    for (const listener of this.parallelListeners) {
      listener(event);
    }
  }
}

function makeTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    id: 'task-1',
    title: 'Task 1',
    status: 'open',
    ...overrides,
  };
}

function makeTimestamp(): string {
  return new Date('2026-02-07T00:00:00.000Z').toISOString();
}

describe('event-bridge', () => {
  test('buffers output until flush, then publishes to output store', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });

    engine.emit({
      type: 'agent:output',
      timestamp: makeTimestamp(),
      data: 'hello',
      stream: 'stdout',
      iteration: 1,
      taskId: 'task-1:1',
    });

    expect(stores.output.getState().currentOutput).toBe('');

    bridge.flush();

    expect(stores.output.getState().currentOutput).toBe('hello');
    expect(stores.output.getState().parallelOutputs.get('task-1:1')).toBe('hello');

    bridge.destroy();
  });

  test('maps a single event to multiple stores (broadcast behavior)', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });

    const task = makeTask({ id: 'task-7', title: 'Investigate bridge' });
    engine.emit({
      type: 'iteration:failed',
      timestamp: makeTimestamp(),
      iteration: 7,
      task,
      error: 'timeout',
      action: 'abort',
    });

    bridge.flush();

    expect(stores.phase.getState().status).toBe('error');
    expect(stores.pipeline.getState().runFailures.length).toBe(1);
    expect(stores.ui.getState().toasts.length).toBe(1);
    expect(stores.pipeline.getState().runFailures[0]?.taskId).toBe('task-7');

    bridge.destroy();
  });

  test('isolates store failures so one bad dispatch does not block others', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores({
      tasks: {
        tasks: [
          {
            id: 'task-2',
            title: 'Break task store',
            status: 'actionable',
          },
        ],
      },
    });

    const originalTaskDispatch = stores.tasks.dispatch;
    stores.tasks.dispatch = (() => {
      throw new Error('task store exploded');
    }) as typeof stores.tasks.dispatch;

    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });

    engine.emit({
      type: 'task:completed',
      timestamp: makeTimestamp(),
      task: makeTask({ id: 'task-2', title: 'Break task store' }),
      iteration: 2,
    });

    expect(() => bridge.flush()).not.toThrow();
    expect(stores.ui.getState().toasts.length).toBe(1);
    expect(stores.ui.getState().toasts[0]?.variant).toBe('success');

    stores.tasks.dispatch = originalTaskDispatch;
    bridge.destroy();
  });

  test('enforces output cap in bridge flush', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, {
      batchIntervalMs: 10_000,
      outputCapBytes: 20,
    });

    engine.emit({
      type: 'agent:output',
      timestamp: makeTimestamp(),
      data: '0123456789',
      stream: 'stdout',
      iteration: 1,
    });
    engine.emit({
      type: 'agent:output',
      timestamp: makeTimestamp(),
      data: 'abcdefghij',
      stream: 'stdout',
      iteration: 1,
    });
    engine.emit({
      type: 'agent:output',
      timestamp: makeTimestamp(),
      data: 'KLMNOPQRST',
      stream: 'stdout',
      iteration: 1,
    });

    bridge.flush();

    const output = stores.output.getState().currentOutput;
    expect(output.length).toBe(20);
    expect(output.endsWith('KLMNOPQRST')).toBe(true);

    bridge.destroy();
  });

  test('appends activity events to history store', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });

    engine.emit({
      type: 'task:selected',
      timestamp: makeTimestamp(),
      iteration: 1,
      task: makeTask({ id: 'task-9', title: 'Activity test' }),
    });

    bridge.flush();

    const activity = stores.history.getState().activityEvents;
    expect(activity.length).toBeGreaterThan(0);
    expect(activity[0]?.category).toBe('task');
    expect(activity[0]?.taskId).toBe('task-9');

    bridge.destroy();
  });

  test('engine start clears stale output buffers and closes the run summary overlay', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores({
      pipeline: {
        runFailures: [
          {
            taskId: 'stale-task',
            taskTitle: 'Stale task',
            reason: 'stale failure',
            phase: 'execution',
          },
        ],
        mergeStats: {
          queued: 1,
          merged: 2,
          failed: 3,
          resolved: 4,
          worktrees: 5,
          syncPending: 6,
        },
      },
      output: {
        currentOutput: 'stale stdout',
        currentCliOutput: 'stale stderr',
        parallelOutputs: new Map([['task-1', 'parallel stdout']]),
        parallelCliOutputs: new Map([['task-1', 'parallel stderr']]),
      },
      ui: {
        overlay: 'runSummary',
      },
    });
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });

    engine.emit({
      type: 'engine:started',
      timestamp: makeTimestamp(),
      sessionId: 'session-1',
      totalTasks: 1,
      tasks: [makeTask()],
    });

    bridge.flush();

    expect(stores.output.getState().currentOutput).toBe('');
    expect(stores.output.getState().currentCliOutput).toBe('');
    expect(stores.output.getState().parallelOutputs.size).toBe(0);
    expect(stores.output.getState().parallelCliOutputs.size).toBe(0);
    expect(stores.pipeline.getState().runFailures).toEqual([]);
    expect(stores.pipeline.getState().mergeStats.failed).toBe(0);
    expect(stores.ui.getState().overlay).toBeNull();

    bridge.destroy();
  });

  test('routes per-task stderr into the parallel CLI buffer instead of stdout', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });

    engine.emit({
      type: 'agent:output',
      timestamp: makeTimestamp(),
      data: 'stderr line',
      stream: 'stderr',
      iteration: 1,
      taskId: 'task-1:1',
    });

    bridge.flush();

    expect(stores.output.getState().parallelOutputs.get('task-1:1')).toBeUndefined();
    expect(stores.output.getState().parallelCliOutputs.get('task-1:1')).toBe('stderr line');

    bridge.destroy();
  });

  test('completed engine stop opens the run summary overlay when all:complete is absent', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });

    engine.emit({
      type: 'engine:stopped',
      timestamp: makeTimestamp(),
      reason: 'completed',
      totalIterations: 7,
    });

    bridge.flush();

    expect(stores.phase.getState().status).toBe('complete');
    expect(stores.history.getState().totalIterations).toBe(7);
    expect(stores.ui.getState().overlay).toBe('runSummary');
    expect(stores.ui.getState().toasts.some((toast) => toast.message.includes('summary'))).toBe(true);

    bridge.destroy();
  });

  test('failed iterations keep error phase without appending a misleading completed activity', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });
    const task = makeTask({ id: 'task-5', title: 'Failure history' });

    engine.emit({
      type: 'iteration:failed',
      timestamp: makeTimestamp(),
      iteration: 5,
      task,
      error: 'merge conflict',
      action: 'skip',
    });
    engine.emit({
      type: 'iteration:completed',
      timestamp: makeTimestamp(),
      result: {
        iteration: 5,
        status: 'failed',
        task,
        taskCompleted: false,
        promiseComplete: false,
        durationMs: 1000,
        error: 'merge conflict',
        startedAt: makeTimestamp(),
        endedAt: makeTimestamp(),
      },
    });

    bridge.flush();

    expect(stores.phase.getState().status).toBe('error');
    expect(stores.history.getState().iterations).toHaveLength(1);
    expect(stores.history.getState().activityEvents).toHaveLength(1);
    expect(stores.history.getState().activityEvents[0]?.eventType).toBe('failed');

    bridge.destroy();
  });

  test('parallel task segments are routed to per-task buffers', () => {
    const engine = new FakeEngine();
    const stores = createTuiStores();
    const bridge = createEventBridge(engine, stores, { batchIntervalMs: 10_000 });
    const task = makeTask({ id: 'task-3', title: 'Segmented task' });

    engine.emit({
      type: 'iteration:started',
      timestamp: makeTimestamp(),
      iteration: 3,
      task,
    });
    engine.emitParallel({
      type: 'parallel:task-segments',
      timestamp: makeTimestamp(),
      workerId: 'worker-1',
      taskId: task.id,
      segments: [{ text: 'hello', color: 'green' }],
    });

    bridge.flush();

    expect(stores.output.getState().parallelSegments.get(task.id)).toEqual([
      { text: 'hello', color: 'green' },
    ]);
    expect(stores.output.getState().currentSegments).toEqual([
      { text: 'hello', color: 'green' },
    ]);

    bridge.destroy();
  });
});

/**
 * ABOUTME: Regression tests for the parallel execution engine event stream.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EngineEvent } from '../../src/engine/types.js';
import { ParallelExecutionEngine } from '../../src/engine/parallel/engine.js';
import { createTrackerTask } from '../factories/tracker-task.js';
import { createFailedExecution } from '../mocks/agent-responses.js';

const tempDirs: string[] = [];

interface FakeCoordinator {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  pause(): void;
  resume(): void;
  on(listener: (_event: unknown) => void): void;
  getPendingMainTaskIds(): string[];
  getSnapshotTag(): string | null;
}

function createEngine(cwd: string): ParallelExecutionEngine {
  return new ParallelExecutionEngine(
    {
      cwd,
      model: 'test-model',
      agent: {
        name: 'test-agent',
        plugin: 'test-agent',
        options: {},
      },
      tracker: {
        name: 'json',
        plugin: 'json',
        options: {},
      },
    } as any,
    { maxWorkers: 2 }
  );
}

function createCoordinatorStub(overrides: Partial<FakeCoordinator> = {}): FakeCoordinator {
  return {
    async initialize() {},
    async start() {},
    async stop() {},
    async dispose() {},
    pause() {},
    resume() {},
    on() {},
    getPendingMainTaskIds() {
      return [];
    },
    getSnapshotTag() {
      return null;
    },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('ParallelExecutionEngine', () => {
  test('emits iteration:failed without a misleading iteration:completed event', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ralph-parallel-engine-'));
    tempDirs.push(cwd);

    const engine = createEngine(cwd);
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));

    const task = createTrackerTask({ id: 'task-001', title: 'Failing task' });
    const result = createFailedExecution('merge conflict');

    (
      engine as unknown as {
        handleParallelEvent: (event: {
          type: 'parallel:task-finished';
          timestamp: string;
          workerId: string;
          task: typeof task;
          result: typeof result;
          completed: boolean;
        }) => void;
      }
    ).handleParallelEvent({
      type: 'parallel:task-finished',
      timestamp: new Date().toISOString(),
      workerId: 'worker-1',
      task,
      result,
      completed: false,
    });

    expect(events.filter((event) => event.type === 'iteration:failed')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'iteration:completed')).toHaveLength(0);
    expect(engine.getState().iterations).toHaveLength(1);
    expect(engine.getState().iterations[0]?.status).toBe('failed');
  });

  test('emits all:complete before engine:stopped when parallel work finishes cleanly', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ralph-parallel-engine-'));
    tempDirs.push(cwd);

    const engine = createEngine(cwd);
    const events: EngineEvent[] = [];
    engine.on((event) => events.push(event));

    let taskQueryCount = 0;
    (
      engine as unknown as {
        tracker: {
          getTasks: (filter: { status?: string[] }) => Promise<unknown[]>;
        };
        coordinator: FakeCoordinator;
      }
    ).tracker = {
      async getTasks(filter: { status?: string[] }) {
        taskQueryCount += 1;
        if (filter.status?.includes('blocked')) {
          return [];
        }
        return [createTrackerTask({ id: 'task-001', title: 'Completed task', status: 'completed' })];
      },
    };

    (
      engine as unknown as {
        coordinator: FakeCoordinator;
      }
    ).coordinator = createCoordinatorStub();

    await engine.start();

    const allCompleteIndex = events.findIndex((event) => event.type === 'all:complete');
    const stoppedIndex = events.findIndex((event) => event.type === 'engine:stopped');

    expect(taskQueryCount).toBeGreaterThanOrEqual(2);
    expect(allCompleteIndex).toBeGreaterThanOrEqual(0);
    expect(stoppedIndex).toBeGreaterThan(allCompleteIndex);
    expect(events[stoppedIndex]).toMatchObject({
      type: 'engine:stopped',
      reason: 'completed',
    });
  });
});

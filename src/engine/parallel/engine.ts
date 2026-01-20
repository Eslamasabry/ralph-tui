/**
 * ABOUTME: Parallel execution engine using worktree-per-worker isolation.
 */

import type { RalphConfig } from '../../config/types.js';
import type { TrackerPlugin } from '../../plugins/trackers/types.js';
import type {
  EngineController,
  EngineEvent,
  EngineEventListener,
  EngineState,
  IterationResult,
} from '../types.js';
import { getTrackerRegistry } from '../../plugins/trackers/registry.js';
import { ParallelCoordinator } from './coordinator.js';
import type { ParallelEvent } from './types.js';

export interface ParallelEngineOptions {
  maxWorkers: number;
}

export class ParallelExecutionEngine implements EngineController {
  private config: RalphConfig;
  private tracker: TrackerPlugin | null = null;
  private coordinator: ParallelCoordinator;
  private listeners: EngineEventListener[] = [];
  private parallelListeners: Array<(event: ParallelEvent) => void> = [];
  private state: EngineState;
  private iterationCounter = 0;
  private taskIterations = new Map<string, number>();
  private stopReason: 'completed' | 'max_iterations' | 'interrupted' | 'error' | 'no_tasks' | null = null;

  constructor(config: RalphConfig, options: ParallelEngineOptions) {
    this.config = config;
    this.coordinator = new ParallelCoordinator(config, { maxWorkers: options.maxWorkers });
    this.state = {
      status: 'idle',
      currentIteration: 0,
      currentTask: null,
      totalTasks: 0,
      tasksCompleted: 0,
      iterations: [],
      startedAt: null,
      currentOutput: '',
      currentStderr: '',
      subagents: new Map(),
      activeAgent: {
        plugin: config.agent.plugin,
        reason: 'primary',
        since: new Date().toISOString(),
      },
      rateLimitState: {
        primaryAgent: config.agent.plugin,
      },
    };
  }

  async initialize(): Promise<void> {
    const trackerRegistry = getTrackerRegistry();
    this.tracker = await trackerRegistry.getInstance(this.config.tracker);
    await this.tracker.sync();

    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress'] });
    this.state.totalTasks = tasks.length;

    await this.coordinator.initialize();
    this.coordinator.on((event) => this.handleParallelEvent(event));
  }

  on(listener: EngineEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  onParallel(listener: (event: ParallelEvent) => void): () => void {
    this.parallelListeners.push(listener);
    return () => {
      const index = this.parallelListeners.indexOf(listener);
      if (index !== -1) {
        this.parallelListeners.splice(index, 1);
      }
    };
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  private emitParallel(event: ParallelEvent): void {
    for (const listener of this.parallelListeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  getState(): Readonly<EngineState> {
    return { ...this.state };
  }

  getTracker(): TrackerPlugin | null {
    return this.tracker;
  }

  async refreshTasks(): Promise<void> {
    if (!this.tracker) return;
    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress', 'completed'] });
    this.emit({ type: 'tasks:refreshed', timestamp: new Date().toISOString(), tasks });
  }

  async start(): Promise<void> {
    if (!this.tracker) {
      throw new Error('Parallel engine not initialized');
    }

    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start engine in ${this.state.status} state`);
    }

    this.state.status = 'running';
    this.state.startedAt = new Date().toISOString();

    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress', 'completed'] });
    this.emit({
      type: 'engine:started',
      timestamp: new Date().toISOString(),
      sessionId: '',
      totalTasks: this.state.totalTasks,
      tasks,
    });

    await this.coordinator.start();

    this.state.status = 'idle';
    this.emit({
      type: 'engine:stopped',
      timestamp: new Date().toISOString(),
      reason: this.stopReason ?? 'completed',
      totalIterations: this.state.currentIteration,
      tasksCompleted: this.state.tasksCompleted,
    });
    this.stopReason = null;
  }

  pause(): void {
    if (this.state.status !== 'running') return;
    this.state.status = 'paused';
    this.coordinator.pause();
    this.emit({
      type: 'engine:paused',
      timestamp: new Date().toISOString(),
      currentIteration: this.state.currentIteration,
    });
  }

  resume(): void {
    if (this.state.status !== 'paused') return;
    this.state.status = 'running';
    this.coordinator.resume();
    this.emit({
      type: 'engine:resumed',
      timestamp: new Date().toISOString(),
      fromIteration: this.state.currentIteration,
    });
  }

  stop(): void {
    this.stopReason = 'interrupted';
    void this.coordinator.stop();
    this.state.status = 'stopping';
  }

  async resetTasksToOpen(taskIds: string[]): Promise<number> {
    if (!this.tracker || taskIds.length === 0) return 0;
    let resetCount = 0;
    for (const taskId of taskIds) {
      try {
        await this.tracker.updateTaskStatus(taskId, 'open');
        await this.tracker.releaseTask?.(taskId, 'shutdown');
        resetCount++;
      } catch {
        // ignore individual failures
      }
    }
    return resetCount;
  }

  async dispose(): Promise<void> {
    await this.coordinator.dispose();
  }

  private handleParallelEvent(event: ParallelEvent): void {
    this.emitParallel(event);

    if (event.type === 'parallel:task-claimed') {
      const iteration = ++this.iterationCounter;
      this.taskIterations.set(event.task.id, iteration);
      this.state.currentIteration = iteration;
      this.state.currentTask = event.task;

      this.emit({
        type: 'task:selected',
        timestamp: new Date().toISOString(),
        task: event.task,
        iteration,
      });

      this.emit({
        type: 'task:activated',
        timestamp: new Date().toISOString(),
        task: event.task,
        iteration,
      });

      return;
    }

    if (event.type === 'parallel:task-started') {
      const iteration = this.taskIterations.get(event.task.id) ?? ++this.iterationCounter;
      this.taskIterations.set(event.task.id, iteration);
      this.state.currentIteration = iteration;
      this.state.currentTask = event.task;

      this.emit({
        type: 'iteration:started',
        timestamp: new Date().toISOString(),
        iteration,
        task: event.task,
      });
      return;
    }

    if (event.type === 'parallel:task-output') {
      const iteration = this.taskIterations.get(event.taskId) ?? this.state.currentIteration;
      this.emit({
        type: 'agent:output',
        timestamp: new Date().toISOString(),
        stream: event.stream,
        data: event.data,
        iteration,
        taskId: event.taskId,
      });
      return;
    }

    if (event.type === 'parallel:task-finished') {
      const iteration = this.taskIterations.get(event.task.id) ?? ++this.iterationCounter;
      const completed = event.completed;
      const status = completed ? 'completed' : event.result.status === 'failed' ? 'failed' : 'completed';

      const iterationResult: IterationResult = {
        iteration,
        status: status === 'failed' ? 'failed' : 'completed',
        task: event.task,
        agentResult: event.result,
        taskCompleted: completed,
        promiseComplete: completed,
        durationMs: event.result.durationMs,
        error: event.result.error,
        startedAt: event.result.startedAt,
        endedAt: event.result.endedAt,
      };

      this.state.iterations.push(iterationResult);
      this.state.currentIteration = iteration;

      if (completed) {
        this.state.tasksCompleted += 1;
        this.emit({
          type: 'task:completed',
          timestamp: new Date().toISOString(),
          task: event.task,
          iteration,
        });
      }

      this.emit({
        type: 'iteration:completed',
        timestamp: new Date().toISOString(),
        result: iterationResult,
      });
    }
  }
}

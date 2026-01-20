/**
 * ABOUTME: Parallel coordinator managing worktree workers and task dispatch.
 */

import type { RalphConfig } from '../../config/types.js';
import type { TrackerPlugin, TrackerTask } from '../../plugins/trackers/types.js';
import type { AgentPlugin } from '../../plugins/agents/types.js';
import { getAgentRegistry } from '../../plugins/agents/registry.js';
import { getTrackerRegistry } from '../../plugins/trackers/registry.js';
import { buildParallelPrompt } from './prompt.js';
import { WorktreeManager } from './worktree-manager.js';
import { ParallelWorker } from './worker.js';
import type { ParallelEvent, ParallelTaskResult } from './types.js';

export interface ParallelCoordinatorOptions {
  maxWorkers: number;
}

export class ParallelCoordinator {
  private config: RalphConfig;
  private tracker: TrackerPlugin | null = null;
  private worktreeManager: WorktreeManager;
  private workers: ParallelWorker[] = [];
  private listeners: Array<(event: ParallelEvent) => void> = [];
  private running = false;
  private paused = false;

  constructor(config: RalphConfig, options: ParallelCoordinatorOptions) {
    this.config = config;
    this.worktreeManager = new WorktreeManager({ repoRoot: config.cwd });
    this.maxWorkers = options.maxWorkers;
  }

  private maxWorkers: number;

  on(listener: (event: ParallelEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private emit(event: ParallelEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  async initialize(): Promise<void> {
    const trackerRegistry = getTrackerRegistry();
    this.tracker = await trackerRegistry.getInstance(this.config.tracker);
    await this.tracker.sync();

    await this.worktreeManager.pruneWorktrees();
    await this.initializeWorkers();
  }

  private async initializeWorkers(): Promise<void> {
    const agentRegistry = getAgentRegistry();

    for (let i = 0; i < this.maxWorkers; i++) {
      const workerId = `worker-${i + 1}`;
      const branchName = `worker/${workerId}/${Date.now()}`;
      const worktreePath = await this.worktreeManager.createWorktree({
        workerId,
        branchName,
        lockReason: 'parallel worker active',
      });

      const agent = await this.createAgentInstance(agentRegistry);
      const worker = new ParallelWorker(workerId, worktreePath, agent, this.config);
      this.workers.push(worker);
    }
  }

  private async createAgentInstance(agentRegistry: ReturnType<typeof getAgentRegistry>): Promise<AgentPlugin> {
    const instance = agentRegistry.createInstance(this.config.agent.plugin);
    if (!instance) {
      throw new Error(`Unknown agent plugin: ${this.config.agent.plugin}`);
    }

    const initConfig: Record<string, unknown> = {
      ...this.config.agent.options,
      command: this.config.agent.command,
      defaultFlags: this.config.agent.defaultFlags,
      timeout: this.config.agent.timeout,
    };

    await instance.initialize(initConfig);
    return instance;
  }

  async start(): Promise<void> {
    if (!this.tracker) {
      throw new Error('Coordinator not initialized');
    }

    this.running = true;
    this.emit({ type: 'parallel:started', timestamp: new Date().toISOString(), workerCount: this.workers.length });

    while (this.running) {
      if (this.paused) {
        await this.delay(100);
        continue;
      }
      const idleWorker = this.workers.find((worker) => !worker.isBusy());
      if (!idleWorker) {
        await this.delay(100);
        continue;
      }

      const task = await this.getNextReadyTask();
      if (!task) {
        const busyWorkers = this.workers.some((worker) => worker.isBusy());
        if (!busyWorkers) {
          break;
        }
        await this.delay(100);
        continue;
      }

      const claimed = await this.claimTask(task, idleWorker.workerId);
      if (!claimed) {
        await this.delay(50);
        continue;
      }

      this.emit({ type: 'parallel:task-claimed', timestamp: new Date().toISOString(), workerId: idleWorker.workerId, task });
      void this.runTaskOnWorker(idleWorker, task);
    }

    this.emit({ type: 'parallel:stopped', timestamp: new Date().toISOString() });
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async dispose(): Promise<void> {
    this.running = false;
    const removals = this.workers.map(async (worker) => {
      await worker.dispose();
      await this.worktreeManager.removeWorktree(worker.workerId);
    });
    await Promise.all(removals);
    this.workers = [];
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  private async runTaskOnWorker(worker: ParallelWorker, task: TrackerTask): Promise<void> {
    if (!this.tracker) return;

    const prompt = await buildParallelPrompt(task, this.config, this.tracker);

    this.emit({ type: 'parallel:task-started', timestamp: new Date().toISOString(), workerId: worker.workerId, task });

    const { result, completed } = await worker.executeTask(task, prompt, {
      onStdout: (data) => {
        this.emit({
          type: 'parallel:task-output',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          data,
          stream: 'stdout',
        });
      },
      onStdoutSegments: (segments) => {
        this.emit({
          type: 'parallel:task-segments',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          segments,
        });
      },
      onStderr: (data) => {
        this.emit({
          type: 'parallel:task-output',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          data,
          stream: 'stderr',
        });
      },
    });

    const taskResult: ParallelTaskResult = { task, result, completed };
    await this.handleTaskResult(taskResult, worker.workerId);

    this.emit({
      type: 'parallel:task-finished',
      timestamp: new Date().toISOString(),
      workerId: worker.workerId,
      task,
      result,
      completed,
    });

    this.emit({
      type: 'parallel:worker-idle',
      timestamp: new Date().toISOString(),
      workerId: worker.workerId,
    });
  }

  private async handleTaskResult(taskResult: ParallelTaskResult, workerId: string): Promise<void> {
    if (!this.tracker) return;

    if (taskResult.completed) {
      await this.tracker.completeTask(taskResult.task.id, 'Completed by parallel worker');
      return;
    }

    await this.tracker.updateTaskStatus(taskResult.task.id, 'open');
    await this.tracker.releaseTask?.(taskResult.task.id, workerId);
  }

  private async getNextReadyTask(): Promise<TrackerTask | undefined> {
    if (!this.tracker) return undefined;
    return this.tracker.getNextTask({ status: 'open', ready: true });
  }

  private async claimTask(task: TrackerTask, workerId: string): Promise<boolean> {
    if (!this.tracker) return false;

    if (this.tracker.claimTask) {
      return this.tracker.claimTask(task.id, workerId);
    }

    const updated = await this.tracker.updateTaskStatus(task.id, 'in_progress');
    return Boolean(updated);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

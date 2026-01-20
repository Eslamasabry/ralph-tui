/**
 * ABOUTME: Parallel coordinator managing worktree workers and task dispatch.
 */

import type { RalphConfig } from '../../config/types.js';
import { spawn } from 'node:child_process';
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
  private mergeQueue: Array<{ task: TrackerTask; workerId: string; commit: string }> = [];
  private merging = false;
  private pendingMergeCounts = new Map<string, number>();
  private workerBaseCommits = new Map<string, string>();

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
    const baseCommit = await this.resolveCommit('HEAD');

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
      this.workerBaseCommits.set(workerId, baseCommit);
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
          const hasPending = await this.hasPendingWork();
          if (!hasPending) {
            break;
          }
        }
        await this.delay(150);
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

    const prompt = await buildParallelPrompt(task, this.config, this.tracker, worker.worktreePath);

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
      const commits = await this.collectCommits(taskResult.task, workerId);
      if (commits.length === 0) {
        await this.tracker.completeTask(taskResult.task.id, 'Completed by parallel worker');
        return;
      }

      this.pendingMergeCounts.set(taskResult.task.id, commits.length);
      for (const commit of commits) {
        this.enqueueMerge({ task: taskResult.task, workerId, commit });
      }
      return;
    }

    await this.tracker.updateTaskStatus(taskResult.task.id, 'open');
    await this.tracker.releaseTask?.(taskResult.task.id, workerId);
  }

  private async getNextReadyTask(): Promise<TrackerTask | undefined> {
    if (!this.tracker) return undefined;
    return this.tracker.getNextTask({ status: 'open', ready: true });
  }

  private async hasPendingWork(): Promise<boolean> {
    if (!this.tracker) return false;
    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress'] });
    return tasks.length > 0;
  }

  private enqueueMerge(entry: { task: TrackerTask; workerId: string; commit: string }): void {
    this.mergeQueue.push(entry);
    this.emit({
      type: 'parallel:merge-queued',
      timestamp: new Date().toISOString(),
      workerId: entry.workerId,
      task: entry.task,
      commit: entry.commit,
    });
    void this.processMergeQueue();
  }

  private async processMergeQueue(): Promise<void> {
    if (this.merging) return;
    this.merging = true;

    while (this.mergeQueue.length > 0) {
      const entry = this.mergeQueue.shift();
      if (!entry) break;

      const clean = await this.isRepoClean(this.config.cwd);
      if (!clean) {
        const reason = 'Main working tree has uncommitted changes. Resolve before merge.';
        this.emit({
          type: 'parallel:merge-failed',
          timestamp: new Date().toISOString(),
          workerId: entry.workerId,
          task: entry.task,
          commit: entry.commit,
          reason,
        });
        continue;
      }

      const result = await this.execGitIn(this.config.cwd, ['cherry-pick', entry.commit]);
      if (result.exitCode !== 0) {
        await this.execGitIn(this.config.cwd, ['cherry-pick', '--abort']);
        const resolved = await this.attemptMergeResolution(entry);
        if (!resolved.success || !resolved.commit) {
          const stderr = result.stderr.trim();
          const reason = resolved.reason ?? (stderr || 'Cherry-pick failed');
          this.emit({
            type: 'parallel:merge-failed',
            timestamp: new Date().toISOString(),
            workerId: entry.workerId,
            task: entry.task,
            commit: entry.commit,
            reason,
          });
          continue;
        }

        const resolvedResult = await this.execGitIn(this.config.cwd, ['cherry-pick', resolved.commit]);
        if (resolvedResult.exitCode !== 0) {
          await this.execGitIn(this.config.cwd, ['cherry-pick', '--abort']);
          const reason = resolvedResult.stderr.trim() || 'Cherry-pick failed after auto-resolve';
          this.emit({
            type: 'parallel:merge-failed',
            timestamp: new Date().toISOString(),
            workerId: entry.workerId,
            task: entry.task,
            commit: resolved.commit,
            reason,
          });
          continue;
        }

        this.emit({
          type: 'parallel:merge-succeeded',
          timestamp: new Date().toISOString(),
          workerId: entry.workerId,
          task: entry.task,
          commit: resolved.commit,
        });

        const remaining = (this.pendingMergeCounts.get(entry.task.id) ?? 1) - 1;
        if (remaining <= 0) {
          this.pendingMergeCounts.delete(entry.task.id);
          await this.tracker?.completeTask(entry.task.id, 'Completed by parallel worker');
        } else {
          this.pendingMergeCounts.set(entry.task.id, remaining);
        }
        continue;
      }

      this.emit({
        type: 'parallel:merge-succeeded',
        timestamp: new Date().toISOString(),
        workerId: entry.workerId,
        task: entry.task,
        commit: entry.commit,
      });

      const remaining = (this.pendingMergeCounts.get(entry.task.id) ?? 1) - 1;
      if (remaining <= 0) {
        this.pendingMergeCounts.delete(entry.task.id);
        await this.tracker?.completeTask(entry.task.id, 'Completed by parallel worker');
      } else {
        this.pendingMergeCounts.set(entry.task.id, remaining);
      }
    }

    this.merging = false;
  }

  private async collectCommits(task: TrackerTask, workerId: string): Promise<string[]> {
    const worker = this.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) return [];

    const worktreePath = worker.worktreePath;
    const status = await this.execGitIn(worktreePath, ['status', '--porcelain', '--untracked-files=no']);
    if (status.stdout.trim().length > 0) {
      await this.execGitIn(worktreePath, ['add', '-A']);
      const message = this.buildCommitMessage(task);
      await this.execGitIn(worktreePath, ['commit', '-m', message]);
    }

    const baseCommit = this.workerBaseCommits.get(workerId) ?? (await this.resolveCommit('HEAD'));
    const revList = await this.execGitIn(worktreePath, ['rev-list', '--reverse', `${baseCommit}..HEAD`]);
    const commits = revList.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
    if (headCommit.exitCode === 0) {
      this.workerBaseCommits.set(workerId, headCommit.stdout.trim());
    }
    return commits;
  }

  private async attemptMergeResolution(entry: { task: TrackerTask; workerId: string; commit: string }): Promise<{ success: boolean; commit?: string; reason?: string }> {
    const mergeWorkerId = `merge-${entry.workerId}-${Date.now()}`;
    const branchName = `merge/${entry.task.id}/${Date.now()}`;
    const worktreePath = await this.worktreeManager.createWorktree({
      workerId: mergeWorkerId,
      branchName,
      lockReason: 'merge resolution',
    });

    try {
      const cherryResult = await this.execGitIn(worktreePath, ['cherry-pick', entry.commit]);
      if (cherryResult.exitCode === 0) {
        const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
        return { success: true, commit: headCommit.stdout.trim() };
      }

      const conflicts = await this.execGitIn(worktreePath, ['diff', '--name-only', '--diff-filter=U']);
      const prompt = this.buildMergePrompt(entry.task, entry.commit, conflicts.stdout.trim());

      const agentRegistry = getAgentRegistry();
      const agent = await this.createAgentInstance(agentRegistry);
      const resolver = new ParallelWorker(mergeWorkerId, worktreePath, agent, this.config);
      const result = await resolver.executeTask(entry.task, prompt);
      await resolver.dispose();

      if (!result.completed) {
        return { success: false, reason: 'Merge resolution agent did not complete' };
      }

      const unresolved = await this.execGitIn(worktreePath, ['diff', '--name-only', '--diff-filter=U']);
      if (unresolved.stdout.trim().length > 0) {
        return { success: false, reason: 'Conflicts remain after auto-resolve' };
      }

      await this.execGitIn(worktreePath, ['add', '-A']);
      const continueResult = await this.execGitIn(worktreePath, ['cherry-pick', '--continue']);
      if (continueResult.exitCode !== 0) {
        const cherryHead = await this.execGitIn(worktreePath, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']);
        if (cherryHead.exitCode === 0) {
          return { success: false, reason: continueResult.stderr.trim() || 'Cherry-pick continue failed' };
        }
      }

      const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
      return { success: true, commit: headCommit.stdout.trim() };
    } catch (error) {
      return { success: false, reason: error instanceof Error ? error.message : 'Merge resolution failed' };
    } finally {
      await this.worktreeManager.removeWorktree(mergeWorkerId).catch(() => undefined);
    }
  }

  private buildMergePrompt(task: TrackerTask, commit: string, conflictFiles: string): string {
    const files = conflictFiles ? conflictFiles.split('\n').filter(Boolean).map((file) => `- ${file}`) : [];
    return [
      `## Merge Conflict Resolution`,
      `Task: ${task.id} - ${task.title}`,
      `Commit: ${commit}`,
      '',
      'Conflicting files:',
      files.length > 0 ? files.join('\n') : '- (unknown)',
      '',
      '## Instructions',
      '- Resolve merge conflicts in the listed files.',
      '- Do NOT refactor unrelated code.',
      '- Do NOT switch branches (no `git checkout main`).',
      '- Do NOT run tests or lint unless explicitly asked.',
      '- After resolving, run: git add -A',
      '- Then run: git cherry-pick --continue',
      '- If cherry-pick already completed, ensure changes are committed.',
      '',
      'When done, output: <promise>COMPLETE</promise>',
    ].join('\n');
  }

  private buildCommitMessage(task: TrackerTask): string {
    const title = task.title.replace(/\s+/g, ' ').trim();
    const truncated = title.length > 60 ? `${title.slice(0, 57)}...` : title;
    return `${task.id}: ${truncated}`;
  }

  private async isRepoClean(repoPath: string): Promise<boolean> {
    const status = await this.execGitIn(repoPath, ['status', '--porcelain', '--untracked-files=no']);
    return status.stdout.trim().length === 0;
  }

  private async resolveCommit(ref: string): Promise<string> {
    const result = await this.execGitIn(this.config.cwd, ['rev-parse', ref]);
    return result.stdout.trim();
  }

  private execGitIn(path: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['-C', path, ...args], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err: Error) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
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

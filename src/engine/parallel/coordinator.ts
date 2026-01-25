/**
 * ABOUTME: Parallel coordinator managing worktree workers and task dispatch.
 */

import type { RalphConfig } from '../../config/types.js';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { TrackerPlugin, TrackerTask } from '../../plugins/trackers/types.js';
import type { AgentPlugin, AgentExecutionResult } from '../../plugins/agents/types.js';
import { getAgentRegistry } from '../../plugins/agents/registry.js';
import { getTrackerRegistry } from '../../plugins/trackers/registry.js';
import { buildParallelPrompt } from './prompt.js';
import { WorktreeManager } from './worktree-manager.js';
import { ParallelWorker } from './worker.js';
import type { ParallelEvent, ParallelTaskResult, CommitMetadata } from './types.js';
import { MainSyncWorktree } from '../../git/main-sync-worktree.js';
import { getImpactPlan, getImpactTable } from '../impact.js';
import type { ImpactEntry, TaskImpactPlan, ValidationCheck, ValidationPlan, ValidationStatus } from '../types.js';
import { stripAnsiCodes } from '../../plugins/agents/output-formatting.js';

export interface ParallelCoordinatorOptions {
  maxWorkers: number;
}

interface ValidationCheckOutcome {
  id: string;
  command: string;
  exitCode: number;
  durationMs: number;
  outputPath?: string;
  rerunExitCodes: number[];
}

export class ParallelCoordinator {
  private config: RalphConfig;
  private tracker: TrackerPlugin | null = null;
  private worktreeManager: WorktreeManager;
  private workers: ParallelWorker[] = [];
  private listeners: Array<(event: ParallelEvent) => void> = [];
  private running = false;
  private paused = false;
  private mergeQueue: Array<{ task: TrackerTask; workerId: string; commit: string; filesChanged?: string[] }> = [];
  private merging = false;
  private validationQueue: Array<{
    entry: { task: TrackerTask; workerId: string; commit: string; filesChanged?: string[] };
    plan: ValidationPlan;
    remaining: number;
  }> = [];
  private validationRunning = false;
  private validationBatchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingMergeCounts = new Map<string, number>();
  private workerBaseCommits = new Map<string, string>();
  private blockedTaskIds = new Set<string>();
  private activeTaskPlans = new Map<string, TaskImpactPlan>();
  private activeImpactTables = new Map<string, ImpactEntry[]>();
  private pendingMainSyncTasks = new Map<string, { task: TrackerTask; workerId: string }>();
  private commitRecoveryAttempts = new Map<string, number>();
  private lastMainSyncAttemptAt = 0;
  private pendingMainSyncRetryCount = 0;
  private readonly maxMainSyncRetries = 10;
  private mainSyncWorktree: MainSyncWorktree | null = null;
  private mergeWorktreePath: string | null = null;
  private validatorWorktreePath: string | null = null;
  private validatorBranch: string | null = null;
  private mergeBranch = 'parallel/integration';
  private baseBranch = 'main';
  private snapshotCreated = false;
  private snapshotTag: string | null = null;

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

  getPendingMainTaskIds(): string[] {
    return Array.from(this.pendingMainSyncTasks.keys());
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
    this.baseBranch = await this.getCurrentBranch();
    const target = this.config.merge.targetBranch;
    if (target === 'main') {
      this.mergeBranch = this.baseBranch;
    } else if (target === 'ralph/integration') {
      this.mergeBranch = `ralph/integration/${this.baseBranch}`;
    } else {
      this.mergeBranch = target;
    }
    if (this.config.qualityGates.integrationBranch) {
      this.mergeBranch = this.config.qualityGates.integrationBranch;
    }
    if (this.mergeBranch !== this.baseBranch) {
      await this.ensureBranchAt(this.mergeBranch, this.baseBranch);
    }

    // Create merge worktree and initialize workers in parallel for faster startup
    const [mergeWorktreePath] = (
      await this.worktreeManager.createWorktrees([
        {
          workerId: 'merge',
          branchName: this.mergeBranch,
          baseRef: this.baseBranch,
          lockReason: 'merge queue',
        },
      ])
    ).values();

    this.mergeWorktreePath = mergeWorktreePath;

    if (this.config.qualityGates.enabled) {
      const safeBranch = this.baseBranch.replace(/[^\w.-]/g, '_');
      this.validatorBranch = `ralph/validator/${safeBranch}`;
      if (this.config.qualityGates.validatorWorktreePath) {
        const validatorPath = resolve(this.config.qualityGates.validatorWorktreePath);
        await this.execGitIn(this.config.cwd, [
          'worktree',
          'add',
          '-B',
          this.validatorBranch,
          validatorPath,
          this.mergeBranch,
        ]);
        this.validatorWorktreePath = validatorPath;
      } else {
        const [validatorWorktreePath] = (
          await this.worktreeManager.createWorktrees([
            {
              workerId: 'validator',
              branchName: this.validatorBranch,
              baseRef: this.mergeBranch,
              lockReason: 'validation',
            },
          ])
        ).values();
        this.validatorWorktreePath = validatorWorktreePath;
      }
    }

    // Initialize all workers in parallel
    await this.initializeWorkers();
  }

  private async initializeWorkers(): Promise<void> {
    const agentRegistry = getAgentRegistry();
    const baseCommit = await this.resolveCommit(this.mergeBranch);

    // Create all worker worktrees in parallel
    const workerOptions = [];
    for (let i = 0; i < this.maxWorkers; i++) {
      const workerId = `worker-${i + 1}`;
      const branchName = `worker/${workerId}/${Date.now()}`;
      workerOptions.push({
        workerId,
        branchName,
        baseRef: this.mergeBranch,
        lockReason: 'parallel worker active',
      });
    }

    const worktreeMap = await this.worktreeManager.createWorktrees(workerOptions);

    for (let i = 0; i < this.maxWorkers; i++) {
      const workerId = `worker-${i + 1}`;
      const worktreePath = worktreeMap.get(workerId)!;
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
    this.mainSyncWorktree = new MainSyncWorktree({
      repoRoot: this.config.cwd,
      mainBranch: this.baseBranch,
    });
    try {
      await this.mainSyncWorktree.create();
    } catch {
      // Ignore worktree creation failures; sync will report failures
    }
    await this.createSnapshotIfNeeded();
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
          await this.trySyncPendingMainTasks();
          if (this.mergeQueue.length > 0 || this.pendingMergeCounts.size > 0) {
            await this.delay(150);
            continue;
          }
          const resetCount = await this.resetStaleInProgressTasks();
          if (resetCount > 0) {
            await this.delay(100);
            continue;
          }

          if (this.pendingMainSyncTasks.size > 0) {
            await this.delay(250);
            continue;
          }

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

      if (!(await this.isTaskReady(task))) {
        await this.tracker.updateTaskStatus(task.id, 'open');
        await this.tracker.releaseTask?.(task.id, idleWorker.workerId);
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

    if (this.mergeWorktreePath) {
      await this.worktreeManager.removeWorktree('merge');
      this.mergeWorktreePath = null;
    }

    if (this.validatorWorktreePath) {
      if (this.config.qualityGates.validatorWorktreePath) {
        await this.execGitIn(this.config.cwd, ['worktree', 'remove', '--force', this.validatorWorktreePath]);
      } else {
        await this.worktreeManager.removeWorktree('validator');
      }
      this.validatorWorktreePath = null;
    }

    if (this.mainSyncWorktree) {
      await this.mainSyncWorktree.cleanup();
      this.mainSyncWorktree = null;
    }
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
    await this.handleTaskResult(taskResult, worker);

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

  private async handleTaskResult(taskResult: ParallelTaskResult, worker: ParallelWorker): Promise<void> {
    if (!this.tracker) return;
    const workerId = worker.workerId;

    if (taskResult.completed) {
      const commits = await this.collectCommits(taskResult.task, workerId);
      if (commits.length === 0) {
        const statusLines = await this.getRepoStatusLines(worker.worktreePath);
        if (statusLines.length > 0) {
          const recovered = await this.attemptCommitRecovery(worker, taskResult.task, statusLines, taskResult.result);
          if (!recovered) {
            const fallbackCommits = await this.collectCommits(taskResult.task, workerId);
            if (fallbackCommits.length === 0) {
              await this.handleMergeFailure(
                { task: taskResult.task, workerId, commit: 'none' },
                'Uncommitted changes after completion; commit recovery failed'
              );
              return;
            }

            this.pendingMergeCounts.set(taskResult.task.id, fallbackCommits.length);
            for (const commit of fallbackCommits) {
              void this.enqueueMerge({ task: taskResult.task, workerId, commit });
            }
            this.commitRecoveryAttempts.delete(taskResult.task.id);
            return;
          }

          const retryCommits = await this.collectCommits(taskResult.task, workerId);
          if (retryCommits.length === 0) {
            const retryStatus = await this.getRepoStatusLines(worker.worktreePath);
            if (retryStatus.length > 0) {
              await this.handleMergeFailure(
                { task: taskResult.task, workerId, commit: 'none' },
                'Uncommitted changes after completion; no commit produced'
              );
              return;
            }
            await this.markMergeSuccess({ task: taskResult.task, workerId, commit: 'none' }, false, []);
            this.commitRecoveryAttempts.delete(taskResult.task.id);
            return;
          }

          this.pendingMergeCounts.set(taskResult.task.id, retryCommits.length);
          for (const commit of retryCommits) {
            void this.enqueueMerge({ task: taskResult.task, workerId, commit });
          }
          this.commitRecoveryAttempts.delete(taskResult.task.id);
          return;
        }

        await this.markMergeSuccess({ task: taskResult.task, workerId, commit: 'none' }, false, []);
        this.commitRecoveryAttempts.delete(taskResult.task.id);
        return;
      }

      this.pendingMergeCounts.set(taskResult.task.id, commits.length);
      for (const commit of commits) {
        void this.enqueueMerge({ task: taskResult.task, workerId, commit });
      }
      return;
    }

    await this.tracker.updateTaskStatus(taskResult.task.id, 'open');
    await this.tracker.releaseTask?.(taskResult.task.id, workerId);
  }

  private async getNextReadyTask(): Promise<TrackerTask | undefined> {
    if (!this.tracker) return undefined;
    const excludeIds = Array.from(this.blockedTaskIds);
    const task = await this.tracker.getNextTask({ status: 'open', ready: true, excludeIds });
    if (!task) return undefined;

    const plan = getImpactPlan(task);
    const table = getImpactTable(task);

    if (this.config.qualityGates.enabled && this.config.qualityGates.requireImpactTable) {
      if (!plan && !table) {
        this.blockedTaskIds.add(task.id);
        await this.tracker.updateTaskStatus(task.id, 'blocked');
        this.emit({
          type: 'parallel:impact-missing',
          timestamp: new Date().toISOString(),
          task,
          reason: 'Task Impact Table is required for parallel execution.',
        });
        return undefined;
      }
    }

    if (plan) {
      this.activeTaskPlans.set(task.id, plan);
    }
    if (table) {
      this.activeImpactTables.set(task.id, table);
      task.metadata = { ...(task.metadata ?? {}), impactTable: table };
    }

    return task;
  }

  private async isTaskReady(task: TrackerTask): Promise<boolean> {
    if (!this.tracker) {
      return false;
    }

    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }

    const allTasks = await this.tracker.getTasks({ parentId: task.parentId });
    const deps = new Set(task.dependsOn);
    for (const candidate of allTasks) {
      if (!deps.has(candidate.id)) {
        continue;
      }
      if (candidate.status !== 'completed' && candidate.status !== 'cancelled') {
        return false;
      }
    }

    return true;
  }

  private async hasPendingWork(): Promise<boolean> {
    if (!this.tracker) return false;
    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress'] });
    return tasks.length > 0 || this.pendingMainSyncTasks.size > 0;
  }

  private async handleMergeFailure(
    entry: { task: TrackerTask; workerId: string; commit: string },
    reason: string,
    conflictFiles?: string[]
  ): Promise<void> {
    const commitMetadata = await this.getCommitMetadata(entry.commit, this.config.cwd);
    const shortCommit = entry.commit.slice(0, 7);

    // Build enhanced error message with task ID, commit hash, conflict files, and suggestions
    const enhancedReason = this.buildEnhancedErrorMessage({
      taskId: entry.task.id,
      taskTitle: entry.task.title,
      commit: shortCommit,
      reason,
      conflictFiles,
    });

    this.emit({
      type: 'parallel:merge-failed',
      timestamp: new Date().toISOString(),
      workerId: entry.workerId,
      task: entry.task,
      commit: entry.commit,
      commitMetadata,
      reason: enhancedReason,
      conflictFiles,
    });

    this.pendingMergeCounts.delete(entry.task.id);
    this.mergeQueue = this.mergeQueue.filter((queued) => queued.task.id !== entry.task.id);
    this.blockedTaskIds.add(entry.task.id);

    if (this.tracker) {
      await this.tracker.updateTaskStatus(entry.task.id, 'blocked');
      await this.tracker.releaseTask?.(entry.task.id, entry.workerId);
    }
  }

  /**
   * Build an enhanced error message with task ID, commit hash, conflict files, and manual resolution suggestions.
   */
  private buildEnhancedErrorMessage(params: {
    taskId: string;
    taskTitle: string;
    commit: string;
    reason: string;
    conflictFiles?: string[];
  }): string {
    const { taskId, taskTitle, commit, reason, conflictFiles } = params;
    const lines: string[] = [];

    // Header with task and commit info
    lines.push(`Task: ${taskId}`);
    lines.push(`Title: ${taskTitle}`);
    lines.push(`Commit: ${commit}`);
    lines.push(`Reason: ${reason}`);

    // Add conflict files if available
    if (conflictFiles && conflictFiles.length > 0) {
      lines.push(`Conflict files: ${conflictFiles.join(', ')}`);
    }

    // Add suggestions for manual resolution
    lines.push('');
    lines.push('Suggestions for manual resolution:');
    lines.push('1. Run: git merge-tool or manually resolve conflicts in the listed files');
    lines.push('2. After resolving, run: git add <files> && git commit --amend --no-edit');
    lines.push('3. Alternatively, skip this commit with: git cherry-pick --skip');
    lines.push('4. To abort and try later: git cherry-pick --abort');

    return lines.join('\n');
  }

  private async markMergeSuccess(
    entry: { task: TrackerTask; workerId: string; commit: string },
    resolved = false,
    filesChanged?: string[],
    conflictFiles?: string[]
  ): Promise<void> {
    const commitMetadata = await this.getCommitMetadata(entry.commit, this.config.cwd);
    this.emit({
      type: 'parallel:merge-succeeded',
      timestamp: new Date().toISOString(),
      workerId: entry.workerId,
      task: entry.task,
      commit: entry.commit,
      commitMetadata,
      resolved,
      filesChanged,
      conflictFiles,
    });

    this.blockedTaskIds.delete(entry.task.id);

    const remaining = (this.pendingMergeCounts.get(entry.task.id) ?? 1) - 1;
    if (remaining <= 0) {
      this.pendingMergeCounts.delete(entry.task.id);
    } else {
      this.pendingMergeCounts.set(entry.task.id, remaining);
    }

    if (entry.commit === 'none') {
      if (remaining <= 0) {
        await this.tracker?.completeTask(entry.task.id, 'Completed by parallel worker');
        this.activeTaskPlans.delete(entry.task.id);
        this.activeImpactTables.delete(entry.task.id);
      }
      return;
    }

    if (!this.config.qualityGates.enabled) {
      await this.finalizeMergeSuccess(entry, remaining);
      return;
    }

    const plan = this.buildValidationPlan(entry, filesChanged);
    if (!plan) {
      await this.finalizeMergeSuccess(entry, remaining);
      return;
    }

    this.enqueueValidation({ entry: { ...entry, filesChanged }, plan, remaining });
  }

  private async finalizeMergeSuccess(
    entry: { task: TrackerTask; workerId: string; commit: string },
    remaining: number
  ): Promise<void> {
    const syncResult = await this.syncMainBranch();

    if (remaining <= 0) {
      if (syncResult.success) {
        await this.tracker?.completeTask(entry.task.id, 'Completed by parallel worker');
        this.activeTaskPlans.delete(entry.task.id);
        this.activeImpactTables.delete(entry.task.id);
      } else {
        this.pendingMainSyncTasks.set(entry.task.id, { task: entry.task, workerId: entry.workerId });
        this.blockedTaskIds.add(entry.task.id);
        await this.tracker?.updateTaskStatus(entry.task.id, 'blocked');
        await this.tracker?.releaseTask?.(entry.task.id, entry.workerId);
        this.emit({
          type: 'parallel:main-sync-failed',
          timestamp: new Date().toISOString(),
          task: entry.task,
          reason: syncResult.reason ?? 'Main sync failed',
        });
        if (this.tracker && 'markTaskPendingMain' in this.tracker && typeof this.tracker.markTaskPendingMain === 'function') {
          const pendingCount = this.pendingMergeCounts.get(entry.task.id) ?? 1;
          await this.tracker.markTaskPendingMain(entry.task.id, pendingCount, [entry.commit]);
        }
        this.activeTaskPlans.delete(entry.task.id);
        this.activeImpactTables.delete(entry.task.id);
      }
    }
  }

  private buildValidationPlan(
    entry: { task: TrackerTask; workerId: string; commit: string },
    filesChanged?: string[]
  ): ValidationPlan | null {
    const checksConfig = this.getQualityGateChecks();
    const checkIds = Object.keys(checksConfig);
    if (checkIds.length === 0) {
      return null;
    }

    const taskPlan = this.activeTaskPlans.get(entry.task.id) ?? getImpactPlan(entry.task);
    const impactTable = this.activeImpactTables.get(entry.task.id) ?? getImpactTable(entry.task);
    const impact = impactTable ?? this.buildImpactEntries(taskPlan, filesChanged);
    const selectedChecks = this.selectChecks(impact, checksConfig, filesChanged);

    if (selectedChecks.length === 0) {
      return null;
    }

    const planId = `plan-${new Date().toISOString().replace(/[:.]/g, '-')}-${entry.commit.slice(0, 7)}`;
    const rationale = this.buildValidationRationale(impact, selectedChecks);

    return {
      planId,
      taskIds: [entry.task.id],
      commits: [entry.commit],
      checks: selectedChecks,
      createdAt: new Date().toISOString(),
      rationale,
      impact,
    };
  }

  private getQualityGateChecks(): Record<string, { command: string; required?: boolean; timeoutMs?: number; retryOnFailure?: boolean; maxReruns?: number }> {
    if (Object.keys(this.config.qualityGates.checks).length > 0) {
      return this.config.qualityGates.checks;
    }

    if (this.config.checks.commands.length === 0) {
      return {};
    }

    const fallback: Record<string, { command: string; required?: boolean }> = {};
    for (const command of this.config.checks.commands) {
      const id = this.normalizeCheckId(command.name);
      fallback[id] = { command: command.command, required: true };
    }
    return fallback;
  }

  private normalizeCheckId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  private buildImpactEntries(taskPlan?: TaskImpactPlan, filesChanged?: string[]): ImpactEntry[] {
    if (taskPlan) {
      return [
        ...taskPlan.create.map((entry) => ({ path: entry.path, change: 'create' as const, purpose: entry.reason })),
        ...taskPlan.modify.map((entry) => ({ path: entry.path, change: 'modify' as const, purpose: entry.reason })),
        ...taskPlan.delete.map((entry) => ({ path: entry.path, change: 'delete' as const, purpose: entry.reason })),
        ...taskPlan.rename.map((entry) => ({
          path: `${entry.from} -> ${entry.to}`,
          change: 'rename' as const,
          purpose: entry.reason,
        })),
      ];
    }

    if (filesChanged && filesChanged.length > 0) {
      return filesChanged.map((path) => ({ path, change: 'modify' as const, purpose: 'Detected change' }));
    }

    return [];
  }

  private selectChecks(
    impact: ImpactEntry[],
    checksConfig: Record<string, { command: string; required?: boolean; timeoutMs?: number; retryOnFailure?: boolean; maxReruns?: number }>,
    filesChanged?: string[]
  ): ValidationCheck[] {
    const selected = new Set<string>();
    const rules = Object.keys(this.config.qualityGates.rules).length > 0
      ? this.config.qualityGates.rules
      : this.buildDefaultQualityGateRules(Object.keys(checksConfig));

    for (const [id, check] of Object.entries(checksConfig)) {
      if (check.required) {
        selected.add(id);
      }
    }
    if (checksConfig.sanity) {
      selected.add('sanity');
    }

    const matchPaths = impact.length > 0 ? impact.map((entry) => entry.path) : filesChanged ?? [];
    for (const path of matchPaths) {
      for (const [prefix, ruleChecks] of Object.entries(rules)) {
        if (path.startsWith(prefix)) {
          for (const checkId of ruleChecks) {
            selected.add(checkId);
          }
        }
      }
    }

    if (selected.size === 0) {
      for (const id of Object.keys(checksConfig)) {
        selected.add(id);
      }
    }

    const ordered = Array.from(selected);
    const checks: ValidationCheck[] = [];
    for (const id of ordered) {
      const check = checksConfig[id];
      if (!check) continue;
      checks.push({
        id,
        command: check.command,
        timeoutMs: check.timeoutMs,
        retryOnFailure: check.retryOnFailure,
        maxReruns: check.maxReruns,
        required: Boolean(check.required),
      });
    }
    return checks;
  }

  private buildDefaultQualityGateRules(checkIds: string[]): Record<string, string[]> {
    const hasSanity = checkIds.includes('sanity');
    const hasUnit = checkIds.includes('unit');
    const defaultChecks = [
      ...(hasSanity ? ['sanity'] : []),
      ...(hasUnit ? ['unit'] : []),
    ];
    const fallback = defaultChecks.length > 0 ? defaultChecks : checkIds;

    return {
      'package.json': fallback,
      'pnpm-lock.yaml': fallback,
      'package-lock.json': fallback,
      'yarn.lock': fallback,
      'bun.lock': fallback,
      'tsconfig': fallback,
      'vite.config': fallback,
      'next.config': fallback,
      'src/ui/': fallback,
      'src/engine/': fallback,
      'src/': fallback,
      'infra/': fallback,
    };
  }

  private buildValidationRationale(impact: ImpactEntry[], checks: ValidationCheck[]): string {
    const impactSummary = impact.length > 0 ? impact.map((entry) => entry.path).join(', ') : 'no impact entries';
    const checkSummary = checks.map((check) => check.id).join(', ');
    return `Selected checks (${checkSummary}) based on impact: ${impactSummary}`;
  }

  private enqueueValidation(item: { entry: { task: TrackerTask; workerId: string; commit: string; filesChanged?: string[] }; plan: ValidationPlan; remaining: number }): void {
    const mode = this.config.qualityGates.mode;

    if (mode === 'coalesce') {
      this.validationQueue = [item];
    } else {
      this.validationQueue.push(item);
    }

    this.emit({
      type: 'parallel:validation-queued',
      timestamp: new Date().toISOString(),
      plan: item.plan,
      queueDepth: this.validationQueue.length,
    });

    if (mode === 'batch-window') {
      if (!this.validationBatchTimer) {
        this.validationBatchTimer = setTimeout(() => {
          this.validationBatchTimer = null;
          void this.processValidationQueue();
        }, this.config.qualityGates.batchWindowMs);
      }
      return;
    }

    void this.processValidationQueue();
  }

  private async processValidationQueue(): Promise<void> {
    if (this.validationRunning) return;
    this.validationRunning = true;

    while (this.validationQueue.length > 0) {
      const item = this.validationQueue.shift();
      if (!item) break;
      await this.runValidationPlan(item);
    }

    this.validationRunning = false;
  }

  private async runValidationPlan(item: { entry: { task: TrackerTask; workerId: string; commit: string; filesChanged?: string[] }; plan: ValidationPlan; remaining: number }): Promise<void> {
    if (!this.validatorWorktreePath) {
      this.emit({
        type: 'parallel:validation-blocked',
        timestamp: new Date().toISOString(),
        planId: item.plan.planId,
        reason: 'Validator worktree unavailable.',
      });
      return;
    }

    const plan = item.plan;
    this.emit({ type: 'parallel:validation-started', timestamp: new Date().toISOString(), plan });

    const logDir = join(this.config.cwd, '.ralph-tui', 'logs', 'validations', plan.planId);
    await mkdir(logDir, { recursive: true });
    await writeFile(join(logDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf-8');

    const resetResult = await this.execGitIn(this.validatorWorktreePath, ['reset', '--hard', this.mergeBranch]);
    if (resetResult.exitCode !== 0) {
      this.emit({
        type: 'parallel:validation-blocked',
        timestamp: new Date().toISOString(),
        planId: plan.planId,
        reason: resetResult.stderr.trim() || 'Failed to reset validator worktree',
      });
      return;
    }

    if (this.config.qualityGates.cleanBeforeRun) {
      await this.execGitIn(this.validatorWorktreePath, ['clean', '-fdx']);
    }

    const checkResult = await this.runValidationChecks(plan, logDir);

    if (checkResult.status === 'passed' || checkResult.status === 'flaky') {
      this.emit({
        type: 'parallel:validation-passed',
        timestamp: new Date().toISOString(),
        planId: plan.planId,
        status: checkResult.status,
      });
      await this.writeValidationSummary(logDir, {
        planId: plan.planId,
        status: checkResult.status,
        failedCheckId: checkResult.failedCheckId,
        reason: checkResult.reason,
        checks: checkResult.checks,
        fixAttempts: 0,
      });
      await this.finalizeMergeSuccess(item.entry, item.remaining);
      return;
    }

    const failureReason = checkResult.reason ?? 'Validation checks failed';
    const failedCheckId = checkResult.failedCheckId ?? 'unknown';
    this.emit({
      type: 'parallel:validation-failed',
      timestamp: new Date().toISOString(),
      planId: plan.planId,
      status: 'failed',
      failedCheckId,
      reason: failureReason,
    });

    const fixResult = await this.attemptValidationFix(plan, logDir, failureReason, failedCheckId);
    if (fixResult.healed) {
      this.emit({
        type: 'parallel:validation-passed',
        timestamp: new Date().toISOString(),
        planId: plan.planId,
        status: 'healed',
      });
      await this.writeValidationSummary(logDir, {
        planId: plan.planId,
        status: 'healed',
        failedCheckId: checkResult.failedCheckId,
        reason: failureReason,
        checks: checkResult.checks,
        fixAttempts: fixResult.attemptsUsed,
      });
      await this.finalizeMergeSuccess(item.entry, item.remaining);
      return;
    }

    await this.writeValidationSummary(logDir, {
      planId: plan.planId,
      status: 'failed',
      failedCheckId: checkResult.failedCheckId,
      reason: failureReason,
      checks: checkResult.checks,
      fixAttempts: fixResult.attemptsUsed,
    });
    await this.handleValidationFailure(item.entry, plan, failureReason);
  }

  private async runValidationChecks(
    plan: ValidationPlan,
    logDir: string
  ): Promise<{ status: ValidationStatus; failedCheckId?: string; reason?: string; checks: ValidationCheckOutcome[] }> {
    let sawFlake = false;
    const outcomes: ValidationCheckOutcome[] = [];

    for (const check of plan.checks) {
      this.emit({
        type: 'parallel:validation-check-started',
        timestamp: new Date().toISOString(),
        planId: plan.planId,
        checkId: check.id,
      });

      const result = await this.runValidationCheck(check, logDir);

      this.emit({
        type: 'parallel:validation-check-finished',
        timestamp: new Date().toISOString(),
        planId: plan.planId,
        checkId: check.id,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        outputPath: result.outputPath,
      });

      let rerunExitCodes: number[] = [];
      if (result.exitCode === 0) {
        outcomes.push({
          id: check.id,
          command: check.command,
          exitCode: 0,
          durationMs: result.durationMs,
          outputPath: result.outputPath,
          rerunExitCodes,
        });
        continue;
      }

      const maxReruns = check.maxReruns ?? (check.retryOnFailure ? this.config.qualityGates.maxTestReruns : 0);
      let rerunSucceeded = false;
      for (let attempt = 0; attempt < maxReruns; attempt += 1) {
        const rerunResult = await this.runValidationCheck(check, logDir, attempt + 1);
        rerunExitCodes.push(rerunResult.exitCode);
        if (rerunResult.exitCode === 0) {
          rerunSucceeded = true;
          break;
        }
      }

      if (rerunSucceeded) {
        sawFlake = true;
        outcomes.push({
          id: check.id,
          command: check.command,
          exitCode: 0,
          durationMs: result.durationMs,
          outputPath: result.outputPath,
          rerunExitCodes,
        });
        continue;
      }

      outcomes.push({
        id: check.id,
        command: check.command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        outputPath: result.outputPath,
        rerunExitCodes,
      });

      if (check.required) {
        return { status: 'failed', failedCheckId: check.id, reason: `Check '${check.id}' failed`, checks: outcomes };
      }
    }

    return { status: sawFlake ? 'flaky' : 'passed', checks: outcomes };
  }

  private async runValidationCheck(
    check: ValidationCheck,
    logDir: string,
    rerunAttempt = 0
  ): Promise<{ exitCode: number; durationMs: number; outputPath?: string }> {
    const startedAt = Date.now();
    const outputPath = join(logDir, `${check.id}${rerunAttempt > 0 ? `-rerun-${rerunAttempt}` : ''}.log`);

    const result = await this.runCommand(check.command, this.validatorWorktreePath ?? this.config.cwd, check.timeoutMs);
    const output = stripAnsiCodes(`${result.stdout}\n${result.stderr}`).trimEnd();
    await writeFile(outputPath, `${output}\n`, 'utf-8');

    return { exitCode: result.exitCode, durationMs: Date.now() - startedAt, outputPath };
  }

  private async attemptValidationFix(
    plan: ValidationPlan,
    logDir: string,
    failureReason: string,
    failedCheckId: string
  ): Promise<{ healed: boolean; attemptsUsed: number }> {
    if (this.config.qualityGates.maxFixAttempts <= 0) {
      return { healed: false, attemptsUsed: 0 };
    }

    const agentRegistry = getAgentRegistry();
    for (let attempt = 1; attempt <= this.config.qualityGates.maxFixAttempts; attempt += 1) {
      this.emit({
        type: 'parallel:validation-fix-started',
        timestamp: new Date().toISOString(),
        planId: plan.planId,
        attempt,
      });

      const agent = await agentRegistry.getInstance(this.config.agent);
      const workerId = `validator-fix-${plan.planId}-${attempt}`;
      const worker = new ParallelWorker(workerId, this.validatorWorktreePath ?? this.config.cwd, agent, this.config);

      try {
        const prompt = await this.buildValidationFixPrompt(plan, failureReason, logDir, failedCheckId);
        const fixTask: TrackerTask = {
          id: `validation-fix-${plan.planId}`,
          title: `Fix validation ${plan.planId}`,
          status: 'open',
          priority: 1,
          description: failureReason,
          labels: ['validation', 'fix'],
          type: 'task',
        };
        const fixResult = await worker.executeTask(fixTask, prompt, {});
        if (!fixResult.completed) {
          this.emit({
            type: 'parallel:validation-fix-failed',
            timestamp: new Date().toISOString(),
            planId: plan.planId,
            attempt,
            reason: 'Fix agent did not signal completion',
          });
          continue;
        }
      } finally {
        await worker.dispose();
      }

      const status = await this.execGitIn(this.validatorWorktreePath ?? this.config.cwd, ['status', '--porcelain']);
      if (status.stdout.trim().length === 0) {
        this.emit({
          type: 'parallel:validation-fix-failed',
          timestamp: new Date().toISOString(),
          planId: plan.planId,
          attempt,
          reason: 'Fix attempt produced no changes',
        });
        continue;
      }

      await this.execGitIn(this.validatorWorktreePath ?? this.config.cwd, ['add', '-A']);
      const commitMessage = `chore(quality-gate): fix ${plan.planId} attempt ${attempt}`;
      await this.execGitIn(this.validatorWorktreePath ?? this.config.cwd, ['commit', '-m', commitMessage]);
      const fixCommit = await this.execGitIn(this.validatorWorktreePath ?? this.config.cwd, ['rev-parse', 'HEAD']);

      const checkResult = await this.runValidationChecks(plan, logDir);
      if (checkResult.status === 'passed' || checkResult.status === 'flaky') {
        if (this.mergeWorktreePath && fixCommit.exitCode === 0) {
          const cherry = await this.execGitIn(this.mergeWorktreePath, ['cherry-pick', fixCommit.stdout.trim()]);
          if (cherry.exitCode !== 0) {
            await this.execGitIn(this.mergeWorktreePath, ['cherry-pick', '--abort']);
            this.emit({
              type: 'parallel:validation-fix-failed',
              timestamp: new Date().toISOString(),
              planId: plan.planId,
              attempt,
              reason: cherry.stderr.trim() || 'Failed to apply fix to integration branch',
            });
            continue;
          }
        }
        this.emit({
          type: 'parallel:validation-fix-succeeded',
          timestamp: new Date().toISOString(),
          planId: plan.planId,
          attempt,
        });
        return { healed: true, attemptsUsed: attempt };
      }

      this.emit({
        type: 'parallel:validation-fix-failed',
        timestamp: new Date().toISOString(),
        planId: plan.planId,
        attempt,
        reason: checkResult.reason ?? 'Fix attempt did not pass validation',
      });
    }

    return { healed: false, attemptsUsed: this.config.qualityGates.maxFixAttempts };
  }

  private async buildValidationFixPrompt(
    plan: ValidationPlan,
    failureReason: string,
    logDir: string,
    failedCheckId: string
  ): Promise<string> {
    const impactPlan = plan.impact.length
      ? plan.impact.map((entry) => `- ${entry.change} ${entry.path}: ${entry.purpose}`).join('\n')
      : 'No impact entries provided.';
    const logTail = await this.readLogTail(join(logDir, `${failedCheckId}.log`), 200);

    return [
      'You are fixing a failed validation in a local integration worktree.',
      '',
      `Plan ID: ${plan.planId}`,
      `Failure: ${failureReason}`,
      `Failed check: ${failedCheckId}`,
      '',
      'Impact entries:',
      impactPlan,
      '',
      'Log tail:',
      logTail || '(no log output found)',
      '',
      `Logs directory: ${logDir}`,
      '',
      'Constraints:',
      '- Make the minimal changes required to pass validation.',
      '- Do not refactor unrelated code.',
      '- Do not run git commands; only edit files.',
      '- Do not modify task scope beyond the impact entries.',
    ].join('\n');
  }

  private async writeValidationSummary(
    logDir: string,
    summary: {
      planId: string;
      status: ValidationStatus;
      failedCheckId?: string;
      reason?: string;
      checks: ValidationCheckOutcome[];
      fixAttempts: number;
    }
  ): Promise<void> {
    const payload = {
      ...summary,
      endedAt: new Date().toISOString(),
    };
    await mkdir(logDir, { recursive: true });
    await writeFile(join(logDir, 'summary.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  }

  private async readLogTail(filePath: string, maxLines: number): Promise<string> {
    try {
      const contents = await import('node:fs/promises').then((fs) => fs.readFile(filePath, 'utf-8'));
      const lines = contents.split('\n');
      return lines.slice(Math.max(0, lines.length - maxLines)).join('\n').trim();
    } catch {
      return '';
    }
  }

  private async handleValidationFailure(
    entry: { task: TrackerTask; workerId: string; commit: string },
    plan: ValidationPlan,
    reason: string
  ): Promise<void> {
    switch (this.config.qualityGates.fallbackStrategy) {
      case 'revert':
        await this.revertCommits(plan.commits, plan.planId, reason);
        await this.blockTaskForValidation(entry, reason);
        return;
      case 'quarantine':
        await this.blockTaskForValidation(entry, reason);
        return;
      case 'pause':
        this.pause();
        this.emit({
          type: 'parallel:validation-blocked',
          timestamp: new Date().toISOString(),
          planId: plan.planId,
          reason,
        });
        return;
    }
  }

  private async revertCommits(commits: string[], planId: string, reason: string): Promise<void> {
    const targetPath = this.mergeWorktreePath ?? this.validatorWorktreePath;
    if (!targetPath) {
      return;
    }
    for (const commit of commits) {
      await this.execGitIn(targetPath, ['revert', '--no-edit', commit]);
      this.emit({
        type: 'parallel:validation-reverted',
        timestamp: new Date().toISOString(),
        planId,
        commit,
        reason,
      });
    }
  }

  private async blockTaskForValidation(
    entry: { task: TrackerTask; workerId: string; commit: string },
    reason: string
  ): Promise<void> {
    this.blockedTaskIds.add(entry.task.id);
    await this.tracker?.updateTaskStatus(entry.task.id, 'blocked');
    await this.tracker?.releaseTask?.(entry.task.id, entry.workerId);
    this.emit({
      type: 'parallel:validation-blocked',
      timestamp: new Date().toISOString(),
      planId: `task-${entry.task.id}`,
      reason,
    });
  }

  private async syncMainBranch(): Promise<{ success: boolean; reason?: string; commit?: string }> {
    if (!this.mainSyncWorktree) {
      return { success: false, reason: 'Main sync worktree unavailable.' };
    }

    const integrationCommit = await this.resolveCommit(this.mergeBranch);
    const syncResult = await this.mainSyncWorktree.fastForwardTo(integrationCommit);
    if (!syncResult.success) {
      const reason = syncResult.error ?? 'Main sync failed';
      this.emit({
        type: 'parallel:main-sync-skipped',
        timestamp: new Date().toISOString(),
        reason,
      });
      return { success: false, reason };
    }

    // Now update the repo root main ref to match integration
    const rootResult = await this.fastForwardRootMain(integrationCommit);
    if (!rootResult.success) {
      const reason = rootResult.reason ?? 'Failed to update main ref';
      this.emit({
        type: 'parallel:main-sync-skipped',
        timestamp: new Date().toISOString(),
        reason,
      });
      return { success: false, reason };
    }

    const head = await this.execGitIn(this.config.cwd, ['rev-parse', 'HEAD']);
    if (head.exitCode === 0) {
      this.emit({
        type: 'parallel:main-sync-succeeded',
        timestamp: new Date().toISOString(),
        commit: head.stdout.trim(),
      });
      await this.completePendingMainSyncTasks();
      return { success: true, commit: head.stdout.trim() };
    }

    return { success: false, reason: 'Unable to resolve main HEAD after sync.' };
  }

  private async trySyncPendingMainTasks(): Promise<void> {
    if (this.pendingMainSyncTasks.size === 0) {
      // Reset retry count when no pending tasks
      this.pendingMainSyncRetryCount = 0;
      return;
    }

    const now = Date.now();
    // Calculate exponential backoff: start at 2s, double each retry, cap at 30s
    const baseDelayMs = 2000;
    const maxDelayMs = 30000;
    const backoffMs = Math.min(baseDelayMs * Math.pow(2, this.pendingMainSyncRetryCount), maxDelayMs);

    // Rate limit sync attempts based on backoff
    if (now - this.lastMainSyncAttemptAt < backoffMs) {
      return;
    }

    this.lastMainSyncAttemptAt = now;

    // Increment retry count (will be reset on success)
    this.pendingMainSyncRetryCount++;

    const result = await this.syncMainBranch();

    if (result.success) {
      // Reset retry count on success
      this.pendingMainSyncRetryCount = 0;
      await this.completePendingMainSyncTasks();
    } else if (this.pendingMainSyncRetryCount <= this.maxMainSyncRetries) {
      // Emit retrying event with backoff info
      const nextDelayMs = Math.min(
        baseDelayMs * Math.pow(2, this.pendingMainSyncRetryCount),
        maxDelayMs
      );
      this.emit({
        type: 'parallel:main-sync-retrying',
        timestamp: new Date().toISOString(),
        retryAttempt: this.pendingMainSyncRetryCount,
        maxRetries: this.maxMainSyncRetries,
        reason: result.reason ?? 'Unknown sync failure',
        delayMs: nextDelayMs,
      });
    } else {
      // Max retries reached - emit alert
      const affectedTaskCount = this.pendingMainSyncTasks.size;
      this.emit({
        type: 'parallel:main-sync-alert',
        timestamp: new Date().toISOString(),
        retryAttempt: this.pendingMainSyncRetryCount,
        maxRetries: this.maxMainSyncRetries,
        reason: result.reason ?? 'Unknown sync failure',
        affectedTaskCount,
      });
    }
  }

  private async completePendingMainSyncTasks(): Promise<void> {
    if (!this.tracker || this.pendingMainSyncTasks.size === 0) {
      return;
    }

    for (const [taskId, entry] of this.pendingMainSyncTasks) {
      // Clear the pending-main status in the tracker (if supported)
      if ('clearPendingMain' in this.tracker && typeof this.tracker.clearPendingMain === 'function') {
        await this.tracker.clearPendingMain(taskId, 'Commits merged to main');
      }
      await this.tracker.completeTask(taskId, 'Completed after main sync');
      await this.tracker.releaseTask?.(taskId, entry.workerId);
      this.blockedTaskIds.delete(taskId);
    }

    this.pendingMainSyncTasks.clear();
  }

  private async fastForwardRootMain(commit: string): Promise<{ success: boolean; reason?: string }> {
    const currentBranch = await this.getCurrentBranch();

    // If main is not checked out here, update the ref directly
    if (currentBranch !== this.baseBranch) {
      const updateRef = await this.execGitIn(this.config.cwd, [
        'update-ref',
        `refs/heads/${this.baseBranch}`,
        commit,
      ]);
      if (updateRef.exitCode !== 0) {
        return { success: false, reason: updateRef.stderr.trim() || 'Failed to update main ref' };
      }
      return { success: true };
    }

    const clean = await this.isRepoClean(this.config.cwd);
    if (clean) {
      const result = await this.execGitIn(this.config.cwd, ['merge', '--ff-only', commit]);
      if (result.exitCode !== 0) {
        // Fast-forward failed - reset main branch to integration commit
        console.warn('Fast-forward merge failed, resetting main branch to integration commit');
        const resetResult = await this.execGitIn(this.config.cwd, ['reset', '--hard', commit]);
        if (resetResult.exitCode !== 0) {
          return { success: false, reason: resetResult.stderr.trim() || 'Failed to reset main branch' };
        }
        return { success: true };
      }
      return { success: true };
    }

    // Dirty main - attempt safe stash + fast-forward + apply
    const stashName = `ralph-main-sync-${Date.now()}`;
    const stashResult = await this.execGitIn(this.config.cwd, ['stash', 'push', '-u', '-m', stashName]);
    if (stashResult.exitCode !== 0) {
      return { success: false, reason: stashResult.stderr.trim() || 'Failed to stash working tree' };
    }

    const stashRefResult = await this.execGitIn(this.config.cwd, ['stash', 'list', '-n', '1', '--format=%gd']);
    const stashRef = stashRefResult.exitCode === 0 ? stashRefResult.stdout.trim() : '';

    const mergeResult = await this.execGitIn(this.config.cwd, ['merge', '--ff-only', commit]);
    if (mergeResult.exitCode !== 0) {
      // Fast-forward failed - reset main branch to integration commit
      console.warn('Fast-forward merge failed, resetting main branch to integration commit');
      const resetResult = await this.execGitIn(this.config.cwd, ['reset', '--hard', commit]);
      if (resetResult.exitCode !== 0) {
        if (stashRef) {
          await this.execGitIn(this.config.cwd, ['stash', 'apply', stashRef]);
        }
        return { success: false, reason: resetResult.stderr.trim() || 'Failed to reset main branch' };
      }
    }

    if (stashRef) {
      const applyResult = await this.execGitIn(this.config.cwd, ['stash', 'apply', stashRef]);
      if (applyResult.exitCode === 0) {
        await this.execGitIn(this.config.cwd, ['stash', 'drop', stashRef]);
      } else {
        const affectedTaskCount = this.pendingMainSyncTasks.size;
        this.emit({
          type: 'parallel:main-sync-alert',
          timestamp: new Date().toISOString(),
          retryAttempt: this.pendingMainSyncRetryCount,
          maxRetries: this.maxMainSyncRetries,
          reason: applyResult.stderr.trim() || 'Stash apply failed after main sync',
          affectedTaskCount,
        });
      }
    }

    return { success: true };
  }

  private async getCommitFiles(commit: string, repoPath: string): Promise<string[]> {
    const result = await this.execGitIn(repoPath, ['diff-tree', '--no-commit-id', '--name-only', '-r', commit]);
    if (result.exitCode !== 0) {
      return [];
    }
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  }

  /**
   * Get detailed commit metadata using git log with format options.
   * Falls back to basic info if full metadata unavailable.
   */
  private async getCommitMetadata(commit: string, repoPath: string): Promise<CommitMetadata> {
    if (commit === 'none') {
      return {
        hash: 'none',
        shortHash: 'none',
        message: '',
        fullMessage: '',
        authorName: '',
        authorEmail: '',
        authorDate: '',
        committerName: '',
        committerEmail: '',
        committerDate: '',
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        fileNames: [],
        parents: [],
        treeHash: '',
      };
    }

    const format = [
      '%H',
      '%h',
      '%s',
      '%B',
      '%an',
      '%ae',
      '%aI',
      '%cn',
      '%ce',
      '%cI',
      '%P',
      '%T',
    ].join('%x00');

    const meta = await this.execGitIn(repoPath, ['show', '-s', `--format=${format}`, commit]);

    if (meta.exitCode !== 0 || !meta.stdout) {
      const filesResult = await this.execGitIn(repoPath, ['diff-tree', '--no-commit-id', '-r', '--stat', commit]);
      const fileNames = await this.getCommitFiles(commit, repoPath);

      const statMatch = filesResult.stdout.match(
        /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
      );
      const filesChanged = statMatch ? parseInt(statMatch[1] || '0', 10) : fileNames.length;
      const insertions = statMatch ? parseInt(statMatch[2] || '0', 10) : 0;
      const deletions = statMatch ? parseInt(statMatch[3] || '0', 10) : 0;

      return {
        hash: commit,
        shortHash: commit.slice(0, 7),
        message: '',
        fullMessage: '',
        authorName: '',
        authorEmail: '',
        authorDate: '',
        committerName: '',
        committerEmail: '',
        committerDate: '',
        filesChanged,
        insertions,
        deletions,
        fileNames,
        parents: [],
        treeHash: '',
      };
    }

    const raw = meta.stdout.endsWith('\n') ? meta.stdout.slice(0, -1) : meta.stdout;
    const parts = raw.split('\0');

    if (parts.length < 12) {
      const fileNames = await this.getCommitFiles(commit, repoPath);
      return {
        hash: commit,
        shortHash: commit.slice(0, 7),
        message: '',
        fullMessage: '',
        authorName: '',
        authorEmail: '',
        authorDate: '',
        committerName: '',
        committerEmail: '',
        committerDate: '',
        filesChanged: fileNames.length,
        insertions: 0,
        deletions: 0,
        fileNames,
        parents: [],
        treeHash: '',
      };
    }

    const [
      hash,
      shortHash,
      message,
      fullMessage,
      authorName,
      authorEmail,
      authorDate,
      committerName,
      committerEmail,
      committerDate,
      parentsRaw,
      treeHash,
    ] = parts;

    const parents = parentsRaw.trim() ? parentsRaw.trim().split(/\s+/) : [];

    const statResult = await this.execGitIn(repoPath, ['diff-tree', '--no-commit-id', '-r', '--stat', commit]);
    const statMatch = statResult.stdout.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
    );
    const filesChanged = statMatch ? parseInt(statMatch[1] || '0', 10) : 0;
    const insertions = statMatch ? parseInt(statMatch[2] || '0', 10) : 0;
    const deletions = statMatch ? parseInt(statMatch[3] || '0', 10) : 0;

    const fileNames = await this.getCommitFiles(commit, repoPath);

    return {
      hash,
      shortHash,
      message,
      fullMessage: fullMessage.trimEnd(),
      authorName,
      authorEmail,
      authorDate,
      committerName,
      committerEmail,
      committerDate,
      filesChanged: filesChanged || fileNames.length,
      insertions,
      deletions,
      fileNames,
      parents,
      treeHash,
    };
  }

  private isEmptyCherryPick(result: { stdout: string; stderr: string }): boolean {
    const message = `${result.stdout}\n${result.stderr}`.toLowerCase();
    return message.includes('cherry-pick is now empty') || message.includes('previous cherry-pick is now empty');
  }
  private async resetStaleInProgressTasks(): Promise<number> {
    if (!this.tracker) return 0;
    const tasks = await this.tracker.getTasks({ status: 'in_progress' });
    if (tasks.length === 0) return 0;

    let resetCount = 0;
    for (const task of tasks) {
      try {
        await this.tracker.updateTaskStatus(task.id, 'open');
        await this.tracker.releaseTask?.(task.id, 'stale');
        resetCount += 1;
      } catch {
        // ignore individual failures
      }
    }

    if (resetCount > 0) {
      console.warn(`Reset ${resetCount} stale in_progress task(s) to open.`);
    }

    return resetCount;
  }

  private async ensureBranchAt(branchName: string, ref: string): Promise<void> {
    await this.execGitIn(this.config.cwd, ['branch', '-f', branchName, ref]);
  }

  private async createSnapshotIfNeeded(): Promise<void> {
    if (this.snapshotCreated) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeBranch = this.baseBranch.replace(/[^\w.-]/g, '_');
    const tagName = `parallel-snapshot-${safeBranch}-${timestamp}`;
    const commit = await this.resolveCommit(this.baseBranch);

    const result = await this.execGitIn(this.config.cwd, [
      'tag',
      '-a',
      tagName,
      '-m',
      `Parallel snapshot before run (${this.baseBranch})`,
      commit,
    ]);

    if (result.exitCode !== 0) {
      console.warn(`Snapshot tag failed: ${result.stderr.trim() || tagName}`);
      return;
    }

    this.snapshotCreated = true;
    this.snapshotTag = tagName;
    console.log(`Snapshot created: ${tagName} (${commit.slice(0, 7)})`);
  }

  getSnapshotTag(): string | null {
    return this.snapshotTag;
  }

  private async getCurrentBranch(): Promise<string> {
    const result = await this.execGitIn(this.config.cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = result.stdout.trim();
    return branch.length > 0 ? branch : 'main';
  }

  private async enqueueMerge(entry: { task: TrackerTask; workerId: string; commit: string }): Promise<void> {
    const filesChanged = await this.getCommitFiles(entry.commit, this.config.cwd);
    const commitMetadata = await this.getCommitMetadata(entry.commit, this.config.cwd);
    const queuedEntry = { ...entry, filesChanged };
    this.mergeQueue.push(queuedEntry);
    this.emit({
      type: 'parallel:merge-queued',
      timestamp: new Date().toISOString(),
      workerId: entry.workerId,
      task: entry.task,
      commit: entry.commit,
      commitMetadata,
      filesChanged,
    });
    void this.processMergeQueue();
  }

  private async processMergeQueue(): Promise<void> {
    if (this.merging) return;
    this.merging = true;

    while (this.mergeQueue.length > 0) {
      const entry = this.mergeQueue.shift();
      if (!entry) break;

      const mergePath = this.mergeWorktreePath ?? this.config.cwd;

      try {
        const clean = await this.isRepoClean(mergePath);
        if (!clean) {
          const reason = 'Merge worktree has uncommitted changes. Resolve before merge.';
          await this.handleMergeFailure(entry, reason);
          continue;
        }

        const filesChanged = entry.filesChanged ?? (await this.getCommitFiles(entry.commit, mergePath));
        const result = await this.execGitIn(mergePath, ['cherry-pick', entry.commit]);
        if (result.exitCode !== 0) {
          if (this.isEmptyCherryPick(result)) {
            const skipResult = await this.execGitIn(mergePath, ['cherry-pick', '--skip']);
            if (skipResult.exitCode !== 0) {
              await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
            }
            await this.markMergeSuccess(entry, false, filesChanged);
            continue;
          }

          await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
          const resolved = await this.attemptMergeResolution(entry);
          if (!resolved.success || !resolved.commit) {
            const stderr = result.stderr.trim();
            const reason = resolved.reason ?? (stderr || 'Cherry-pick failed');
            await this.handleMergeFailure(entry, reason, resolved.conflictFiles);
            continue;
          }

          const resolvedResult = await this.execGitIn(mergePath, ['cherry-pick', resolved.commit]);
          if (resolvedResult.exitCode !== 0) {
            if (this.isEmptyCherryPick(resolvedResult)) {
              const skipResult = await this.execGitIn(mergePath, ['cherry-pick', '--skip']);
              if (skipResult.exitCode !== 0) {
                await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
              }
              await this.markMergeSuccess({ ...entry, commit: resolved.commit }, false, filesChanged, resolved.conflictFiles);
              continue;
            }

            await this.execGitIn(mergePath, ['cherry-pick', '--abort']);
            const reason = resolvedResult.stderr.trim() || 'Cherry-pick failed after auto-resolve';
            await this.handleMergeFailure({ ...entry, commit: resolved.commit }, reason, resolved.conflictFiles);
            continue;
          }

          const resolvedFiles = await this.getCommitFiles(resolved.commit, mergePath);
          const mergedFiles = resolvedFiles.length > 0 ? resolvedFiles : filesChanged;
          await this.markMergeSuccess({ ...entry, commit: resolved.commit }, true, mergedFiles, resolved.conflictFiles);
          continue;
        }

        await this.markMergeSuccess(entry, false, filesChanged);
      } finally {
        // no-op
      }
    }

    this.merging = false;
  }

  private async collectCommits(task: TrackerTask, workerId: string): Promise<string[]> {
    const worker = this.workers.find((candidate) => candidate.workerId === workerId);
    if (!worker) return [];

    const worktreePath = worker.worktreePath;
    const status = await this.execGitIn(worktreePath, ['status', '--porcelain']);
    const relevant = this.filterStatusLines(status.stdout);
    if (relevant.length > 0) {
      await this.execGitIn(worktreePath, ['add', '-A']);
      await this.execGitIn(worktreePath, ['reset', '--', '.beads', '.ralph-tui', 'worktrees']);
      const staged = await this.execGitIn(worktreePath, ['diff', '--name-only', '--cached']);
      if (staged.stdout.trim().length > 0) {
        const message = this.buildCommitMessage(task);
        await this.execGitIn(worktreePath, ['commit', '-m', message]);
      }
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

  private async attemptMergeResolution(entry: { task: TrackerTask; workerId: string; commit: string }): Promise<{ success: boolean; commit?: string; reason?: string; conflictFiles?: string[] }> {
    const mergeWorkerId = `merge-${entry.workerId}-${Date.now()}`;
    const branchName = `merge/${entry.task.id}/${Date.now()}`;
    const worktreePath = await this.worktreeManager.createWorktree({
      workerId: mergeWorkerId,
      branchName,
      baseRef: this.mergeBranch,
      lockReason: 'merge resolution',
    });

    let conflictFiles: string[] = [];

    try {
      const cherryResult = await this.execGitIn(worktreePath, ['cherry-pick', entry.commit]);
      if (cherryResult.exitCode === 0) {
        const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
        return { success: true, commit: headCommit.stdout.trim() };
      }

      const conflicts = await this.execGitIn(worktreePath, ['diff', '--name-only', '--diff-filter=U']);
      conflictFiles = conflicts.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      
      // Attempt programmatic conflict resolution first
      const programmaticResolved = await this.attemptProgrammaticConflictResolution(worktreePath, conflictFiles);
      if (programmaticResolved) {
        await this.execGitIn(worktreePath, ['add', '-A']);
        const continueResult = await this.execGitIn(worktreePath, ['cherry-pick', '--continue']);
        if (continueResult.exitCode === 0) {
          const headCommit = await this.execGitIn(worktreePath, ['rev-parse', 'HEAD']);
          return { success: true, commit: headCommit.stdout.trim(), conflictFiles };
        }
      }

      // Fallback to LLM-based conflict resolution
      console.warn(`[ParallelCoordinator] Programmatic conflict resolution failed for ${entry.task.id}, falling back to LLM`);
      const prompt = this.buildMergePrompt(entry.task, entry.commit, conflicts.stdout.trim());

      const agentRegistry = getAgentRegistry();
      const agent = await this.createAgentInstance(agentRegistry);
      const resolver = new ParallelWorker(mergeWorkerId, worktreePath, agent, this.config);
      const result = await resolver.executeTask(entry.task, prompt);
      await resolver.dispose();

      if (!result.completed) {
        return { success: false, reason: 'Merge resolution agent did not complete', conflictFiles };
      }

      const unresolved = await this.execGitIn(worktreePath, ['diff', '--name-only', '--diff-filter=U']);
      if (unresolved.stdout.trim().length > 0) {
        return { success: false, reason: 'Conflicts remain after auto-resolve', conflictFiles };
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
      return { success: true, commit: headCommit.stdout.trim(), conflictFiles };
    } catch (error) {
      return { success: false, reason: error instanceof Error ? error.message : 'Merge resolution failed', conflictFiles };
    } finally {
      await this.worktreeManager.removeWorktree(mergeWorkerId).catch((err) => {
        // Log worktree cleanup errors - orphaned worktrees can accumulate
        console.warn(`[ParallelCoordinator] Failed to remove merge worktree ${mergeWorkerId}: ${err instanceof Error ? err.message : 'unknown error'}`);
      });
    }
  }

  private async attemptProgrammaticConflictResolution(worktreePath: string, conflictFiles: string[]): Promise<boolean> {
    console.log(`[ParallelCoordinator] Attempting programmatic conflict resolution for ${conflictFiles.length} files`);
    
    // Try simple resolution strategies for each conflicting file
    for (const file of conflictFiles) {
      const filePath = join(worktreePath, file);
      
      try {
        // Strategy 1: Check if we can use git mergetool with auto-resolve (if configured)
        const mergetoolResult = await this.execGitIn(worktreePath, ['mergetool', '--no-prompt', file]);
        if (mergetoolResult.exitCode === 0) {
          console.log(`[ParallelCoordinator] Auto-resolved conflict in ${file} using mergetool`);
          continue;
        }

        // Strategy 2: Check if the conflict is simple and can be auto-merged
        const content = await Bun.file(filePath).text();
        if (this.isSimpleConflict(content)) {
          const resolvedContent = this.resolveSimpleConflict(content);
          if (resolvedContent !== null) {
            await Bun.write(filePath, resolvedContent);
            console.log(`[ParallelCoordinator] Auto-resolved simple conflict in ${file}`);
            continue;
          }
          // If resolveSimpleConflict returns null, the conflict couldn't be cleanly
          // resolved - fall through to LLM fallback below
        }

        // Strategy 3: Try to accept incoming changes (theirs) or current changes (ours)
        // For now, try accepting incoming changes (worker's changes)
        const theirsResult = await this.execGitIn(worktreePath, ['checkout', '--theirs', file]);
        if (theirsResult.exitCode === 0) {
          console.log(`[ParallelCoordinator] Auto-resolved conflict in ${file} by accepting incoming changes`);
          continue;
        }

        // Strategy 4: Try accepting current changes (ours) if theirs failed
        const oursResult = await this.execGitIn(worktreePath, ['checkout', '--ours', file]);
        if (oursResult.exitCode === 0) {
          console.log(`[ParallelCoordinator] Auto-resolved conflict in ${file} by accepting current changes`);
          continue;
        }

        console.warn(`[ParallelCoordinator] Failed to auto-resolve conflict in ${file}`);
        return false;
        
      } catch (error) {
        console.warn(`[ParallelCoordinator] Error resolving conflict in ${file}: ${error}`);
        return false;
      }
    }

    return true;
  }

  private isSimpleConflict(content: string): boolean {
    const openCount = content.match(/<<<<<<<[^\n]*\n/g)?.length ?? 0;
    if (openCount !== 1) return false;
    return content.includes('\n=======\n') && content.includes('\n>>>>>>>');
  }

  private resolveSimpleConflict(content: string): string | null {
    // For simple conflicts, try to automatically merge by:
    // 1. Removing conflict markers
    // 2. Keeping the worker's changes (theirs) when similar
    // 3. Returning null when conflicts can't be cleanly resolved (fall back to LLM)

    // First, detect the conflict pattern
    const conflictPattern = /<<<<<<<[^\n]*\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>>[^\n]*\n?/;
    const match = content.match(conflictPattern);

    if (!match) {
      return null;
    }

    const ours = match[1];
    const theirs = match[2];

    // If changes are similar, keep theirs (worker's changes)
    if (this.areChangesSimilar(ours, theirs)) {
      return content.replace(conflictPattern, theirs);
    }

    // If changes are different and can't be cleanly merged, return null
    // to fall back to LLM resolution. Do NOT produce conflict markers.
    return null;
  }

  private areChangesSimilar(ours: string, theirs: string): boolean {
    const normalize = (str: string) => str.replace(/\s+/g, '');
    return normalize(ours) === normalize(theirs);
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
      '- Your sole task is to resolve merge conflicts in the listed files.',
      '- For each conflict, carefully examine both versions (HEAD and incoming) and determine the correct resolution.',
      '- If changes are complementary, combine them. If there are contradictions, prioritize the incoming changes.',
      '- Do NOT refactor unrelated code.',
      '- Do NOT switch branches (no `git checkout main`).',
      '- Do NOT run tests or lint unless explicitly asked.',
      '',
      '## Conflict Resolution Strategy',
      'For each conflicting file:',
      '1. Examine the conflict markers: <<<<<<< HEAD (current), ======= (separator), >>>>>>> incoming',
      '2. Understand what changes each version is trying to make',
      '3. Determine the correct resolution',
      '4. Remove the conflict markers',
      '5. Save the resolved file',
      '',
      '## After Resolving',
      '- Run: git add -A',
      '- Then run: git cherry-pick --continue',
      '- If cherry-pick already completed, ensure changes are committed.',
      '',
      'When done, output: <promise>COMPLETE</promise>',
    ].join('\n');
  }

  private formatOutputTail(output: string, maxLines = 20, maxChars = 2000): string {
    if (!output.trim()) {
      return '(no output)';
    }

    const lines = output.trimEnd().split('\n');
    const tailLines = lines.slice(-maxLines);
    let tail = tailLines.join('\n');
    if (tail.length > maxChars) {
      tail = tail.slice(-maxChars);
    }
    return tail;
  }

  private async buildRecoveryPrompt(
    task: TrackerTask,
    statusLines: string[],
    lastResult: AgentExecutionResult,
    worktreePath: string
  ): Promise<string> {
    const basePrompt = await buildParallelPrompt(task, this.config, this.tracker ?? undefined, worktreePath);
    const files = statusLines.map((line) => `- ${line}`);
    const stdoutTail = this.formatOutputTail(lastResult.stdout);

    return [
      basePrompt,
      '',
      '## Recovery Context',
      '- Previous iteration reported <promise>COMPLETE</promise> but there are uncommitted changes and no commits.',
      '',
      'Changed files (git status --porcelain):',
      files.length > 0 ? files.join('\n') : '- (none)',
      '',
      'Last iteration stdout (tail):',
      '```',
      stdoutTail,
      '```',
      '',
      '## Recovery Instructions',
      '- Continue the task. Verify all requirements are complete (not just files already touched).',
      '- If anything is missing, finish it before committing.',
      `- Commit message: "${this.buildCommitMessage(task)}"`,
      '- If no changes are needed, revert to a clean working tree (no commit).',
      '- You may append to `.ralph-tui/progress.md` for local context, but do NOT stage or commit it.',
      '- Do NOT run `git add .` or `git add -A`. Stage only relevant task files.',
      '- Do NOT merge, rebase, or push.',
      '- Do NOT switch branches (no `git checkout main`).',
      '- Do NOT run tests or lint unless explicitly asked.',
      '',
      'When done, output: <promise>COMPLETE</promise>',
    ].join('\n');
  }

  private async attemptCommitRecovery(
    worker: ParallelWorker,
    task: TrackerTask,
    statusLines: string[],
    lastResult: AgentExecutionResult
  ): Promise<boolean> {
    const attempts = this.commitRecoveryAttempts.get(task.id) ?? 0;
    if (attempts >= 1) {
      return false;
    }

    this.commitRecoveryAttempts.set(task.id, attempts + 1);

    const prompt = await this.buildRecoveryPrompt(task, statusLines, lastResult, worker.worktreePath);
    const { completed } = await worker.executeTask(task, prompt, {
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
      onStdoutSegments: (segments) => {
        this.emit({
          type: 'parallel:task-segments',
          timestamp: new Date().toISOString(),
          workerId: worker.workerId,
          taskId: task.id,
          segments,
        });
      },
    });

    return completed;
  }

  private buildCommitMessage(task: TrackerTask): string {
    const title = task.title.replace(/\s+/g, ' ').trim();
    const truncated = title.length > 60 ? `${title.slice(0, 57)}...` : title;
    return `${task.id}: ${truncated}`;
  }

  private async isRepoClean(repoPath: string): Promise<boolean> {
    const statusLines = await this.getRepoStatusLines(repoPath);
    return statusLines.length === 0;
  }

  private async getRepoStatusLines(repoPath: string): Promise<string[]> {
    const status = await this.execGitIn(repoPath, ['status', '--porcelain']);
    return this.filterStatusLines(status.stdout);
  }

  private filterStatusLines(statusOutput: string): string[] {
    return statusOutput
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
      .filter(Boolean)
      .filter((line) => {
        const path = line.slice(3).trim();
        return !(
          path.startsWith('.beads/') ||
          path.startsWith('.ralph-tui/') ||
          path.startsWith('worktrees/')
        );
      });
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

  private runCommand(
    command: string,
    cwd: string,
    timeoutMs?: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn(command, {
        cwd,
        env: { ...process.env },
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      const timer = timeoutMs
        ? setTimeout(() => {
            proc.kill('SIGKILL');
          }, timeoutMs)
        : null;

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (timer) clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err: Error) => {
        if (timer) clearTimeout(timer);
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

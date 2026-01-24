/**
 * ABOUTME: Git worktree manager for parallel worker isolation.
 * Creates, locks, prunes, and removes worktrees per worker.
 */

import os from 'node:os';
import { mkdir, rm, access, writeFile, chmod } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { Semaphore } from './semaphore.js';
import { execGit } from './git.js';

import type {
  WorktreeStatus,
  WorktreeHealthSummary,
  WorktreeManagerOptions,
  CreateWorktreeOptions,
  WorktreeValidationResult,
  ManagedMetadataV1,
} from './types.js';

function sanitizePathSegment(input: string): string {
  const trimmed = input.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  const finalSeg = safe.length ? safe : 'unknown';
  if (finalSeg === '.' || finalSeg === '..') {
    return `_${finalSeg.replace(/\./g, 'dot')}_`;
  }
  return finalSeg.slice(0, 120);
}

function ensureTrailingSep(value: string): string {
  return value.endsWith(sep) ? value : `${value}${sep}`;
}

export class WorktreeManager {
  private readonly repoRoot: string;
  private readonly worktreesDir: string;
  private readonly sem: Semaphore;
  private readonly gitTimeoutMs: number;
  private readonly ephemeralBranchPrefixes: string[];
  private readonly lockOnCreate: boolean;

  constructor(options: WorktreeManagerOptions) {
    this.repoRoot = options.repoRoot;
    this.worktreesDir = options.worktreesDir ?? join(this.repoRoot, 'worktrees');
    this.sem = new Semaphore(options.maxConcurrency ?? 6);
    this.gitTimeoutMs = options.gitTimeoutMs ?? 60_000;
    this.ephemeralBranchPrefixes = options.ephemeralBranchPrefixes ?? [
      'worker/',
      'merge/',
      'parallel/',
      'ralph/',
      'wt/',
    ];
    this.lockOnCreate = options.lockOnCreate ?? true;
  }

  async ensureWorktreesDir(): Promise<void> {
    await mkdir(this.worktreesDir, { recursive: true });
  }

  getWorktreePath(workerId: string): string {
    const safe = sanitizePathSegment(workerId);
    return join(this.worktreesDir, safe);
  }

  private isManagedPath(worktreePath: string): boolean {
    const root = ensureTrailingSep(resolve(this.worktreesDir));
    const resolvedPath = ensureTrailingSep(resolve(worktreePath));
    return resolvedPath.startsWith(root);
  }

  private assertEphemeralBranch(branchName: string): void {
    const ok = this.ephemeralBranchPrefixes.some((prefix) => branchName.startsWith(prefix));
    if (!ok) {
      throw new Error(
        `Refusing to reset non-ephemeral branch '${branchName}'. ` +
          `Use a prefix like ${this.ephemeralBranchPrefixes.join(', ')} for worker branches, ` +
          'or change ephemeralBranchPrefixes.'
      );
    }
  }

  private async git(args: string[], cwd?: string) {
    return execGit(args, { cwd, timeoutMs: this.gitTimeoutMs });
  }

  private async resolveRef(ref: string): Promise<string> {
    const result = await this.git(['-C', this.repoRoot, 'rev-parse', ref]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to resolve ref '${ref}': ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  private async getCurrentBranch(worktreePath: string): Promise<string> {
    const result = await this.git(['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get current branch: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  private async getCurrentCommit(worktreePath: string): Promise<string> {
    const result = await this.git(['-C', worktreePath, 'rev-parse', 'HEAD']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get current commit: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  async validateWorktree(
    worktreePath: string,
    expectedBranch: string,
    expectedCommit: string
  ): Promise<WorktreeValidationResult> {
    try {
      const currentBranch = await this.getCurrentBranch(worktreePath);
      const currentCommit = await this.getCurrentCommit(worktreePath);

      if (currentBranch !== expectedBranch) {
        return {
          valid: false,
          currentBranch,
          currentCommit,
          expectedBranch,
          expectedCommit,
          error: `Expected branch '${expectedBranch}', got '${currentBranch}'`,
        };
      }

      if (currentCommit !== expectedCommit) {
        return {
          valid: false,
          currentBranch,
          currentCommit,
          expectedBranch,
          expectedCommit,
          error: `Expected commit '${expectedCommit.slice(0, 7)}', got '${currentCommit.slice(0, 7)}'`,
        };
      }

      return {
        valid: true,
        currentBranch,
        currentCommit,
        expectedBranch,
        expectedCommit,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }

  private managedMetaPath(worktreePath: string): string {
    return join(worktreePath, '.ralph-tui', 'managed.json');
  }

  private async writeManagedMetadata(meta: ManagedMetadataV1): Promise<void> {
    const dir = join(meta.worktreePath, '.ralph-tui');
    await mkdir(dir, { recursive: true });
    await writeFile(this.managedMetaPath(meta.worktreePath), JSON.stringify(meta, null, 2), 'utf8');
  }

  private async hasManagedMetadata(worktreePath: string): Promise<boolean> {
    try {
      await access(this.managedMetaPath(worktreePath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Batch cleanup: unlock/remove per worker, prune once.
   * Does not throw on cleanup failures (cleanup never blocks shutdown).
   */
  async cleanupWorktrees(workerIds: string[]): Promise<void> {
    await this.ensureWorktreesDir();

    const paths = workerIds.map((id) => this.getWorktreePath(id));

    await Promise.all(
      paths.map((path) =>
        this.sem.with(async () => {
          if (!this.isManagedPath(path)) {
            return;
          }

          await this.git(['-C', this.repoRoot, 'worktree', 'unlock', path]);

          const removeResult = await this.git([
            '-C',
            this.repoRoot,
            'worktree',
            'remove',
            '--force',
            path,
          ]);

          if (removeResult.exitCode !== 0) {
            const managed = await this.hasManagedMetadata(path);
            if (managed) {
              await this.git([
                '-C',
                this.repoRoot,
                'worktree',
                'remove',
                '--force',
                '--force',
                path,
              ]);
            }
          }

          await rm(path, { recursive: true, force: true });
        })
      )
    );

    await this.git(['-C', this.repoRoot, 'worktree', 'prune']);
  }

  async createWorktrees(options: CreateWorktreeOptions[]): Promise<Map<string, string>> {
    await this.ensureWorktreesDir();

    const workerIds = options.map((opt) => opt.workerId);
    await this.cleanupWorktrees(workerIds);

    const results = await Promise.all(
      options.map((opt) =>
        this.sem.with(async () => {
          const workerId = opt.workerId;
          const branchName = opt.branchName;
          const baseRef = opt.baseRef ?? 'HEAD';
          const lockReason = this.lockOnCreate ? (opt.lockReason ?? `worker:${workerId}`) : undefined;

          this.assertEphemeralBranch(branchName);

          const worktreePath = this.getWorktreePath(workerId);
          const expectedCommit = await this.resolveRef(baseRef);

          const addArgs = [
            '-C',
            this.repoRoot,
            'worktree',
            'add',
            '--force',
          ];
          if (this.lockOnCreate && lockReason) {
            addArgs.push('--lock', '--reason', lockReason);
          }
          addArgs.push('-B', branchName, worktreePath, baseRef);

          const addResult = await this.git(addArgs);
          if (addResult.exitCode !== 0) {
            await this.git(['-C', this.repoRoot, 'worktree', 'prune']);
            const retryResult = await this.git(addArgs);
            if (retryResult.exitCode !== 0) {
              throw new Error(`git worktree add failed: ${retryResult.stderr || retryResult.stdout}`);
            }
          }

          const meta: ManagedMetadataV1 = {
            schemaVersion: 1,
            tool: 'ralph',
            repoRoot: this.repoRoot,
            worktreePath,
            workerId,
            branchName,
            baseRef,
            expectedCommit,
            createdAt: new Date().toISOString(),
            host: os.hostname(),
            pid: process.pid,
          };
          await this.writeManagedMetadata(meta);

          const validation = await this.validateWorktree(worktreePath, branchName, expectedCommit);
          if (!validation.valid) {
            await this.cleanupWorktrees([workerId]);
            throw new Error(
              `Worktree validation failed for ${workerId}: ${validation.error}. ` +
                `Expected '${branchName}' at '${expectedCommit.slice(0, 7)}'.`
            );
          }

          await this.ensureWorktreeShims(worktreePath);

          return { workerId, worktreePath };
        })
      )
    );

    const map = new Map<string, string>();
    for (const result of results) {
      map.set(result.workerId, result.worktreePath);
    }
    return map;
  }

  async createWorktree(options: CreateWorktreeOptions): Promise<string> {
    const worktrees = await this.createWorktrees([options]);
    return worktrees.get(options.workerId)!;
  }

  async lockWorktree(worktreePath: string, reason?: string): Promise<void> {
    const args = ['-C', this.repoRoot, 'worktree', 'lock'];
    if (reason) {
      args.push('--reason', reason);
    }
    args.push(worktreePath);
    const { exitCode, stderr } = await this.git(args);
    if (exitCode !== 0) {
      throw new Error(`git worktree lock failed: ${stderr}`);
    }
  }

  async unlockWorktree(worktreePath: string): Promise<void> {
    const { exitCode, stderr } = await this.git([
      '-C',
      this.repoRoot,
      'worktree',
      'unlock',
      worktreePath,
    ]);
    if (exitCode !== 0) {
      throw new Error(`git worktree unlock failed: ${stderr}`);
    }
  }

  async removeWorktree(workerId: string, options: { skipGitRemove?: boolean } = {}): Promise<void> {
    const worktreePath = this.getWorktreePath(workerId);

    if (!options.skipGitRemove) {
      await this.git(['-C', this.repoRoot, 'worktree', 'unlock', worktreePath]);
      const removeResult = await this.git([
        '-C',
        this.repoRoot,
        'worktree',
        'remove',
        '--force',
        worktreePath,
      ]);
      if (removeResult.exitCode !== 0 && await this.hasManagedMetadata(worktreePath)) {
        await this.git([
          '-C',
          this.repoRoot,
          'worktree',
          'remove',
          '--force',
          '--force',
          worktreePath,
        ]);
      }
    }

    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // ignore missing path
    }
  }

  async pruneWorktrees(): Promise<void> {
    const result = await this.git(['-C', this.repoRoot, 'worktree', 'prune']);
    if (result.exitCode !== 0) {
      throw new Error(`git worktree prune failed: ${result.stderr}`);
    }
  }

  /**
   * Robust list parsing using `--porcelain -z`.
   */
  async listWorktrees(): Promise<WorktreeStatus[]> {
    const result = await this.git(['-C', this.repoRoot, 'worktree', 'list', '--porcelain', '-z']);
    if (result.exitCode !== 0) {
      return [];
    }

    const tokens = result.stdout.split('\0');
    const worktrees: WorktreeStatus[] = [];

    let record: Partial<WorktreeStatus> & { prunable?: boolean; prunableReason?: string; bare?: boolean } = {};

    const flush = async (): Promise<void> => {
      if (!record.path) {
        return;
      }

      const path = record.path;
      const relativePath = record.relativePath ?? relative(this.repoRoot, path);
      const locked = record.locked ?? false;

      let status: WorktreeStatus['status'];
      if (record.prunable) {
        status = 'prunable';
      } else if (locked) {
        status = 'locked';
      } else {
        try {
          await access(path);
          status = 'active';
        } catch {
          status = 'stale';
        }
      }

      worktrees.push({
        path,
        relativePath,
        commit: record.commit ?? '',
        branch: record.branch ?? 'unknown',
        locked,
        lockReason: record.lockReason,
        prunableReason: record.prunableReason,
        status,
        bare: record.bare,
      });

      record = {};
    };

    for (const raw of tokens) {
      const line = raw.trim();

      if (line === '') {
        await flush();
        continue;
      }

      const [prefix, ...rest] = line.split(' ');
      const value = rest.join(' ');

      switch (prefix) {
        case 'worktree':
          if (record.path) {
            await flush();
          }
          record.path = value;
          record.relativePath = relative(this.repoRoot, value);
          record.locked = false;
          break;
        case 'HEAD':
          record.commit = value;
          break;
        case 'branch':
          record.branch = value.replace(/^refs\/heads\//, '');
          break;
        case 'locked':
          record.locked = true;
          record.lockReason = value || undefined;
          break;
        case 'prunable':
          record.prunable = true;
          record.prunableReason = value || undefined;
          break;
        case 'bare':
          record.bare = true;
          break;
      }
    }

    await flush();
    return worktrees;
  }

  async getWorktreeHealthSummary(): Promise<WorktreeHealthSummary> {
    const worktrees = await this.listWorktrees();
    const relevant = worktrees.filter((wt) => wt.relativePath !== '.' && wt.relativePath !== '');

    const summary: WorktreeHealthSummary = {
      total: relevant.length,
      active: 0,
      locked: 0,
      stale: 0,
      prunable: 0,
    };

    for (const wt of relevant) {
      summary[wt.status] += 1;
    }

    return summary;
  }

  async repairWorktree(pathOrWorktree?: string): Promise<void> {
    const args = ['-C', this.repoRoot, 'worktree', 'repair'];
    if (pathOrWorktree) {
      args.push(pathOrWorktree);
    }
    await this.git(args);
  }

  private async ensureWorktreeShims(worktreePath: string): Promise<void> {
    const binDir = join(worktreePath, '.ralph-tui', 'bin');
    await mkdir(binDir, { recursive: true });

    const bdShimPath = join(binDir, 'bd');
    const content = '#!/usr/bin/env bash\n' +
      'echo "bd is disabled in worker worktrees. Use tracker APIs only." >&2\n' +
      'exit 1\n';
    await writeFile(bdShimPath, content, 'utf-8');
    await chmod(bdShimPath, 0o755);
  }

  async forceCleanupStaleWorktree(worktreePath: string): Promise<void> {
    await this.git(['-C', this.repoRoot, 'worktree', 'unlock', worktreePath]);

    const removeResult = await this.git([
      '-C',
      this.repoRoot,
      'worktree',
      'remove',
      '--force',
      worktreePath,
    ]);
    if (removeResult.exitCode !== 0 && await this.hasManagedMetadata(worktreePath)) {
      await this.git([
        '-C',
        this.repoRoot,
        'worktree',
        'remove',
        '--force',
        '--force',
        worktreePath,
      ]);
    }

    await this.git(['-C', this.repoRoot, 'worktree', 'prune']);

    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * ABOUTME: Git worktree manager for parallel worker isolation.
 * Creates, locks, prunes, and removes worktrees per worker.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WorktreeManagerOptions {
  repoRoot: string;
  worktreesDir?: string;
}

export interface CreateWorktreeOptions {
  workerId: string;
  branchName: string;
  baseRef?: string;
  lockReason?: string;
}

export class WorktreeManager {
  private repoRoot: string;
  private worktreesDir: string;

  constructor(options: WorktreeManagerOptions) {
    this.repoRoot = options.repoRoot;
    this.worktreesDir = options.worktreesDir ?? join(this.repoRoot, 'worktrees');
  }

  async ensureWorktreesDir(): Promise<void> {
    await mkdir(this.worktreesDir, { recursive: true });
  }

  getWorktreePath(workerId: string): string {
    return join(this.worktreesDir, workerId);
  }

  async createWorktree(options: CreateWorktreeOptions): Promise<string> {
    const { workerId, branchName, baseRef = 'HEAD', lockReason } = options;
    await this.ensureWorktreesDir();

    const worktreePath = this.getWorktreePath(workerId);

    // Clean any stale worktree state before creating a new one
    await this.cleanupWorktree(workerId);

    const args = ['-C', this.repoRoot, 'worktree', 'add', '-b', branchName, worktreePath, baseRef];
    let result = await this.execGit(args);

    if (result.exitCode !== 0) {
      // Attempt recovery for stale locked/missing worktrees
      await this.cleanupWorktree(workerId);
      const retryArgs = ['-C', this.repoRoot, 'worktree', 'add', '-f', '-f', '-b', branchName, worktreePath, baseRef];
      result = await this.execGit(retryArgs);
      if (result.exitCode !== 0) {
        throw new Error(`git worktree add failed: ${result.stderr}`);
      }
    }

    if (lockReason) {
      await this.lockWorktree(worktreePath, lockReason);
    }

    return worktreePath;
  }

  async lockWorktree(worktreePath: string, reason?: string): Promise<void> {
    const args = ['-C', this.repoRoot, 'worktree', 'lock', worktreePath];
    if (reason) {
      args.push('--reason', reason);
    }
    const { exitCode, stderr } = await this.execGit(args);
    if (exitCode !== 0) {
      throw new Error(`git worktree lock failed: ${stderr}`);
    }
  }

  async unlockWorktree(worktreePath: string): Promise<void> {
    const args = ['-C', this.repoRoot, 'worktree', 'unlock', worktreePath];
    const { exitCode, stderr } = await this.execGit(args);
    if (exitCode !== 0) {
      throw new Error(`git worktree unlock failed: ${stderr}`);
    }
  }

  async removeWorktree(
    workerId: string,
    options: { skipGitRemove?: boolean } = {}
  ): Promise<void> {
    const worktreePath = this.getWorktreePath(workerId);

    if (!options.skipGitRemove) {
      await this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'unlock', worktreePath]);
      const args = ['-C', this.repoRoot, 'worktree', 'remove', '--force', worktreePath];
      await this.execGitAllowFailure(args);
    }

    try {
      await access(worktreePath);
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // Ignore missing path
    }
  }

  async pruneWorktrees(): Promise<void> {
    const args = ['-C', this.repoRoot, 'worktree', 'prune'];
    const { exitCode, stderr } = await this.execGit(args);
    if (exitCode !== 0) {
      throw new Error(`git worktree prune failed: ${stderr}`);
    }
  }

  private async cleanupWorktree(workerId: string): Promise<void> {
    const worktreePath = this.getWorktreePath(workerId);
    await this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'unlock', worktreePath]);
    await this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'remove', '--force', worktreePath]);
    await this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'prune']);

    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // ignore missing path
    }
  }

  private async execGitAllowFailure(args: string[]): Promise<GitCommandResult> {
    return this.execGit(args);
  }

  private execGit(args: string[]): Promise<GitCommandResult> {
    return new Promise((resolve) => {
      const proc = spawn('git', args, {
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

      proc.on('close', (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
  }
}

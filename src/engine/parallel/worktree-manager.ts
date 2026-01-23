/**
 * ABOUTME: Git worktree manager for parallel worker isolation.
 * Creates, locks, prunes, and removes worktrees per worker.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, access, writeFile, chmod } from 'node:fs/promises';
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

export interface WorktreeValidationResult {
  valid: boolean;
  currentBranch?: string;
  currentCommit?: string;
  expectedBranch?: string;
  expectedCommit?: string;
  error?: string;
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

  /**
   * Create multiple worktrees in parallel for faster worker initialization.
   * This is significantly faster than creating worktrees sequentially.
   *
   * @param options Array of worktree creation options
   * @returns Map of workerId to worktreePath
   */
  async createWorktrees(options: CreateWorktreeOptions[]): Promise<Map<string, string>> {
    await this.ensureWorktreesDir();

    // Clean up all worktrees in parallel first
    await Promise.all(options.map((opt) => this.cleanupWorktree(opt.workerId)));

// OURS:
    // Get the expected commit before cleanup
    const expectedCommit = await this.resolveRef(baseRef);

    // Clean any stale worktree state before creating a new one
    await this.cleanupWorktree(workerId);

    const branchExists = await this.branchExists(branchName);
    let args = branchExists
      ? ['-C', this.repoRoot, 'worktree', 'add', worktreePath, branchName]
      : ['-C', this.repoRoot, 'worktree', 'add', '-b', branchName, worktreePath, baseRef];
    let result = await this.execGit(args);

    // Retry with force flags for stale state (e.g., locked worktree references)
    if (result.exitCode !== 0) {
      await this.cleanupWorktree(workerId);
      args = ['-C', this.repoRoot, 'worktree', 'add', '-f', '-b', branchName, worktreePath, baseRef];
      result = await this.execGit(args);
      if (result.exitCode !== 0) {
        // Final recovery: force remove any stale worktree and retry
        await this.forceCleanupStaleWorktree(worktreePath);
        args = ['-C', this.repoRoot, 'worktree', 'add', '-f', '-b', branchName, worktreePath, baseRef];
        result = await this.execGit(args);
        if (result.exitCode !== 0) {
          throw new Error(`git worktree add failed after retries: ${result.stderr}`);
        }
      }
    }

    // Validate the worktree is on the correct branch and commit
    const validation = await this.validateWorktree(worktreePath, branchName, expectedCommit);
    if (!validation.valid) {
      throw new Error(`Worktree validation failed: ${validation.error ?? 'Unknown validation error'}`);
    }

    if (lockReason) {
      await this.lockWorktree(worktreePath, lockReason);
    }
// THEIRS:
    // Create all worktrees in parallel
    const results = await Promise.all(
      options.map(async (opt) => {
        const { workerId, branchName, baseRef = 'HEAD', lockReason } = opt;
        const worktreePath = this.getWorktreePath(workerId);

        // Use -b flag directly - this creates a new branch if it doesn't exist
        // and works if branch already exists (git will reuse existing branch)
        const args = [
          '-C', this.repoRoot,
          'worktree',
          'add',
          '-b', branchName,
          worktreePath,
          baseRef,
        ];

        let result = await this.execGit(args);

        if (result.exitCode !== 0) {
          // Recovery: cleanup stale state and retry
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

        // Create shims in parallel with the worktree creation
        await this.ensureWorktreeShims(worktreePath);

        return { workerId, worktreePath };
      })
    );

    const worktreeMap = new Map<string, string>();
    for (const result of results) {
      worktreeMap.set(result.workerId, result.worktreePath);
    }

    return worktreeMap;
  } (feat: ralph-tui-wmr.7 - Optimize worktree creation < 500ms)

  /**
   * Create a single worktree with optimized operations.
   * Uses parallel operations where possible.
   */
  async createWorktree(options: CreateWorktreeOptions): Promise<string> {
    const worktrees = await this.createWorktrees([options]);
    return worktrees.get(options.workerId)!;
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

<<<<<<< HEAD
  private async branchExists(branchName: string): Promise<boolean> {
    const result = await this.execGit(['-C', this.repoRoot, 'rev-parse', '--verify', `refs/heads/${branchName}`]);
    return result.exitCode === 0;
  }

  private async resolveRef(ref: string): Promise<string> {
    const result = await this.execGit(['-C', this.repoRoot, 'rev-parse', ref]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to resolve ref '${ref}': ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  /**
   * Get the current branch name in a worktree
   */
  private async getCurrentBranch(worktreePath: string): Promise<string> {
    const result = await this.execGit(['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get current branch: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  /**
   * Get the current commit hash in a worktree
   */
  private async getCurrentCommit(worktreePath: string): Promise<string> {
    const result = await this.execGit(['-C', worktreePath, 'rev-parse', 'HEAD']);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get current commit: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  /**
   * Validate that a worktree is on the expected branch and commit
   */
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
          error: `Expected branch '${expectedBranch}', but worktree is on '${currentBranch}'`,
        };
      }

      if (currentCommit !== expectedCommit) {
        return {
          valid: false,
          currentBranch,
          currentCommit,
          expectedBranch,
          expectedCommit,
          error: `Expected commit '${expectedCommit.slice(0, 7)}', but worktree is at '${currentCommit.slice(0, 7)}'`,
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

  /**
   * Force cleanup stale worktree references that may be locked
   */
  private async forceCleanupStaleWorktree(worktreePath: string): Promise<void> {
    // Try to unlock first (ignore failures)
    await this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'unlock', worktreePath]);

    // Force remove via git
    await this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'remove', '--force', worktreePath]);

    // Prune stale references
    await this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'prune']);

    // Delete directory if exists
    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // Ignore if already deleted
    }
  }

=======
>>>>>>> 0cffeba (feat: ralph-tui-wmr.7 - Optimize worktree creation < 500ms)
  private async cleanupWorktree(workerId: string): Promise<void> {
    const worktreePath = this.getWorktreePath(workerId);

    // Run all git cleanup operations in parallel for faster cleanup
    await Promise.all([
      this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'unlock', worktreePath]),
      this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'remove', '--force', worktreePath]),
      this.execGitAllowFailure(['-C', this.repoRoot, 'worktree', 'prune']),
    ]);

    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // ignore missing path
    }
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

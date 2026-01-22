/**
 * ABOUTME: Main-sync worktree manager for fast-forward only syncs with main branch.
 * Creates a dedicated worktree that is always clean and used for syncing.
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, access } from 'node:fs/promises';
import { join } from 'node:path';

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface MainSyncWorktreeOptions {
  /** Root of the git repository */
  repoRoot: string;
  /** Directory for worktrees (default: repoRoot/worktrees) */
  worktreesDir?: string;
  /** Name of the main-sync worktree (default: main-sync) */
  worktreeName?: string;
  /** Remote to fetch from (default: origin) */
  remote?: string;
  /** Main branch name (default: main) */
  mainBranch?: string;
}

export interface SyncResult {
  success: boolean;
  /** Whether there were new commits to pull */
  updated: boolean;
  /** The commit hash before sync */
  previousCommit: string;
  /** The commit hash after sync */
  currentCommit: string;
  /** Error message if sync failed */
  error?: string;
}

export class MainSyncWorktree {
  private repoRoot: string;
  private worktreesDir: string;
  private worktreeName: string;
  private remote: string;
  private mainBranch: string;

  constructor(options: MainSyncWorktreeOptions) {
    this.repoRoot = options.repoRoot;
    this.worktreesDir = options.worktreesDir ?? join(this.repoRoot, 'worktrees');
    this.worktreeName = options.worktreeName ?? 'main-sync';
    this.remote = options.remote ?? 'origin';
    this.mainBranch = options.mainBranch ?? 'main';
  }

  /**
   * Get the path to the main-sync worktree
   */
  getWorktreePath(): string {
    return join(this.worktreesDir, this.worktreeName);
  }

  /**
   * Check if the main-sync worktree exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.getWorktreePath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the worktrees directory exists
   */
  private async ensureWorktreesDir(): Promise<void> {
    await mkdir(this.worktreesDir, { recursive: true });
  }

  /**
   * Create the main-sync worktree if it doesn't exist.
   * The worktree is always clean and tracks the main branch.
   */
  async create(): Promise<string> {
    await this.ensureWorktreesDir();

    const worktreePath = this.getWorktreePath();

    // Check if worktree already exists
    if (await this.exists()) {
      // Clean up any stale state
      await this.cleanup();
    }

    // Create the worktree from main branch
    const args = [
      '-C', this.repoRoot,
      'worktree',
      'add',
      '-b', this.worktreeName,
      worktreePath,
      this.mainBranch,
    ];

    let result = await this.execGit(args);

    if (result.exitCode !== 0) {
      // Try recovery for stale locked/missing worktrees
      await this.cleanup();
      const retryArgs = [
        '-C', this.repoRoot,
        'worktree',
        'add',
        '-f',
        '-b', this.worktreeName,
        worktreePath,
        this.mainBranch,
      ];
      result = await this.execGit(retryArgs);
      if (result.exitCode !== 0) {
        throw new Error(`Failed to create main-sync worktree: ${result.stderr}`);
      }
    }

    return worktreePath;
  }

  /**
   * Get the current commit hash in the worktree
   */
  async getCurrentCommit(): Promise<string> {
    const result = await this.execGit([
      '-C', this.getWorktreePath(),
      'rev-parse',
      'HEAD',
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Failed to get current commit: ${result.stderr}`);
    }

    return result.stdout.trim();
  }

  /**
   * Fetch from remote and fast-forward only sync to main.
   * Returns a SyncResult indicating success/failure and whether updated.
   */
  async sync(): Promise<SyncResult> {
    const worktreePath = this.getWorktreePath();

    // Get commit before sync
    let previousCommit: string;
    try {
      previousCommit = await this.getCurrentCommit();
    } catch {
      // If we can't get the commit, the worktree might not exist
      await this.create();
      previousCommit = await this.getCurrentCommit();
    }

    // Fetch from remote
    const fetchResult = await this.execGit([
      '-C', this.repoRoot,
      'fetch',
      this.remote,
      this.mainBranch,
    ]);

    if (fetchResult.exitCode !== 0) {
      return {
        success: false,
        updated: false,
        previousCommit,
        currentCommit: previousCommit,
        error: `Failed to fetch: ${fetchResult.stderr}`,
      };
    }

    // Check if there are updates
    const remoteCommitResult = await this.execGit([
      '-C', this.repoRoot,
      'rev-parse',
      `${this.remote}/${this.mainBranch}`,
    ]);

    if (remoteCommitResult.exitCode !== 0) {
      return {
        success: false,
        updated: false,
        previousCommit,
        currentCommit: previousCommit,
        error: `Failed to resolve remote commit: ${remoteCommitResult.stderr}`,
      };
    }

    const remoteCommit = remoteCommitResult.stdout.trim();

    // If already at remote commit, nothing to do
    if (remoteCommit === previousCommit) {
      return {
        success: true,
        updated: false,
        previousCommit,
        currentCommit: previousCommit,
      };
    }

    // Ensure worktree is clean before merge
    await this.ensureClean();

    // Try fast-forward only merge in the worktree
    const mergeResult = await this.execGit([
      '-C', worktreePath,
      'merge',
      '--ff-only',
      remoteCommit,
    ]);

    if (mergeResult.exitCode !== 0) {
      return {
        success: false,
        updated: false,
        previousCommit,
        currentCommit: previousCommit,
        error: `Fast-forward merge failed: ${mergeResult.stderr}`,
      };
    }

    // Get the new commit
    const currentCommit = await this.getCurrentCommit();

    return {
      success: true,
      updated: true,
      previousCommit,
      currentCommit,
    };
  }

  /**
   * Clean up the worktree: unlock, remove via git, and delete directory.
   */
  async cleanup(): Promise<void> {
    const worktreePath = this.getWorktreePath();

    // Unlock if locked (ignore failures)
    await this.execGitAllowFailure([
      '-C', this.repoRoot,
      'worktree',
      'unlock',
      worktreePath,
    ]);

    // Remove via git (ignore failures)
    await this.execGitAllowFailure([
      '-C', this.repoRoot,
      'worktree',
      'remove',
      '--force',
      worktreePath,
    ]);

    // Prune any stale worktree references
    await this.execGitAllowFailure([
      '-C', this.repoRoot,
      'worktree',
      'prune',
    ]);

    // Delete the directory if it exists
    try {
      await access(worktreePath);
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      // Ignore if already deleted
    }
  }

  /**
   * Check if the worktree has any uncommitted changes
   */
  async isDirty(): Promise<boolean> {
    const result = await this.execGit([
      '-C', this.getWorktreePath(),
      'status',
      '--porcelain',
    ]);

    return result.stdout.trim().length > 0;
  }

  /**
   * Ensure the worktree is clean by discarding any local changes
   */
  async ensureClean(): Promise<void> {
    if (await this.isDirty()) {
      // Reset to clean state
      await this.execGit([
        '-C', this.getWorktreePath(),
        'reset',
        '--hard',
        'HEAD',
      ]);
    }
  }

  /**
   * Get the status of the main-sync worktree
   */
  async getStatus(): Promise<{
    exists: boolean;
    clean: boolean;
    commit: string | null;
  }> {
    const exists = await this.exists();

    if (!exists) {
      return { exists: false, clean: true, commit: null };
    }

    try {
      const commit = await this.getCurrentCommit();
      const clean = !(await this.isDirty());
      return { exists: true, clean, commit };
    } catch {
      return { exists: true, clean: false, commit: null };
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

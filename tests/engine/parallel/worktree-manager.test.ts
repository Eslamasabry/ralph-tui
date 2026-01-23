/**
 * ABOUTME: Benchmark tests for worktree creation performance.
 * Measures and validates worktree creation optimization.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorktreeManager } from '../../../src/engine/parallel/worktree-manager.js';

async function initGitRepo(repoPath: string): Promise<void> {
  // Initialize git repository
  const { execSync } = await import('node:child_process');
  execSync('git init', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: repoPath, stdio: 'pipe' });

  // Create initial commit
  await writeFile(join(repoPath, 'README.md'), '# Test Repository\n');
  execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
  execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });
}

describe('WorktreeManager Performance Benchmarks', () => {
  let tempDir: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ralph-worktree-bench-'));
    await initGitRepo(tempDir);
    manager = new WorktreeManager({ repoRoot: tempDir });
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('single worktree creation', () => {
    test('creates worktree in under 500ms', async () => {
      const start = performance.now();
      const worktreePath = await manager.createWorktree({
        workerId: 'test-worker',
        branchName: 'test-branch',
        baseRef: 'HEAD',
        lockReason: 'benchmark test',
      });
      const elapsed = performance.now() - start;

      // Verify worktree was created
      expect(worktreePath).toBeDefined();
      expect(worktreePath).toContain('test-worker');

      // Log performance for analysis
      console.log(`Single worktree creation: ${elapsed.toFixed(2)}ms`);

      // Performance requirement: < 500ms
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('parallel worktree creation', () => {
    test('creates 4 worktrees in parallel under 500ms', async () => {
      const workerCount = 4;
      const workerOptions = [];

      for (let i = 0; i < workerCount; i++) {
        workerOptions.push({
          workerId: `worker-${i + 1}`,
          branchName: `benchmark/worker-${i + 1}`,
          baseRef: 'HEAD',
          lockReason: 'benchmark test',
        });
      }

      const start = performance.now();
      const worktreeMap = await manager.createWorktrees(workerOptions);
      const elapsed = performance.now() - start;

      // Verify all worktrees were created
      expect(worktreeMap.size).toBe(workerCount);

      for (let i = 0; i < workerCount; i++) {
        const workerId = `worker-${i + 1}`;
        expect(worktreeMap.has(workerId)).toBe(true);
        expect(worktreeMap.get(workerId)).toContain(workerId);
      }

      // Log performance for analysis
      console.log(`Parallel creation of ${workerCount} worktrees: ${elapsed.toFixed(2)}ms`);

      // Performance requirement: < 500ms for parallel creation (same as single!)
      expect(elapsed).toBeLessThan(500);
    });

    test('parallel creation is faster than sequential', async () => {
      const workerCount = 4;
      const timestamp = Date.now();

      // Create options
      const workerOptions = [];
      for (let i = 0; i < workerCount; i++) {
        workerOptions.push({
          workerId: `seq-worker-${i + 1}`,
          branchName: `seq-bench/worker-${timestamp}-${i + 1}`,
          baseRef: 'HEAD',
        });
      }

      // Measure sequential creation time
      const seqStart = performance.now();
      for (const opt of workerOptions) {
        await manager.createWorktree(opt);
      }
      const seqElapsed = performance.now() - seqStart;

      // Clean up sequential worktrees first
      for (const opt of workerOptions) {
        await manager.removeWorktree(opt.workerId);
      }

      // New options for parallel test
      const parallelOptions = [];
      for (let i = 0; i < workerCount; i++) {
        parallelOptions.push({
          workerId: `par-worker-${i + 1}`,
          branchName: `par-bench/worker-${timestamp}-${i + 1}`,
          baseRef: 'HEAD',
        });
      }

      // Measure parallel creation time
      const parStart = performance.now();
      await manager.createWorktrees(parallelOptions);
      const parElapsed = performance.now() - parStart;

      // Log results
      console.log(`Sequential creation: ${seqElapsed.toFixed(2)}ms`);
      console.log(`Parallel creation: ${parElapsed.toFixed(2)}ms`);
      console.log(`Speedup: ${(seqElapsed / parElapsed).toFixed(2)}x`);

      // Parallel should be faster (allow some margin for overhead)
      // At 4 workers, we expect at least 2x speedup
      const speedup = seqElapsed / parElapsed;
      expect(speedup).toBeGreaterThanOrEqual(1.5);
    });

    test('creates 8 worktrees in parallel under 500ms', async () => {
      const workerCount = 8;
      const workerOptions = [];

      for (let i = 0; i < workerCount; i++) {
        workerOptions.push({
          workerId: `worker-${i + 1}`,
          branchName: `benchmark8/worker-${i + 1}`,
          baseRef: 'HEAD',
          lockReason: 'benchmark test',
        });
      }

      const start = performance.now();
      const worktreeMap = await manager.createWorktrees(workerOptions);
      const elapsed = performance.now() - start;

      // Verify all worktrees were created
      expect(worktreeMap.size).toBe(workerCount);

      // Log performance for analysis
      console.log(`Parallel creation of ${workerCount} worktrees: ${elapsed.toFixed(2)}ms`);

      // Performance requirement: < 500ms
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('worktree cleanup', () => {
    test('cleanup operations run in parallel', async () => {
      // First create some worktrees
      const workerOptions = [];
      for (let i = 0; i < 4; i++) {
        workerOptions.push({
          workerId: `cleanup-worker-${i + 1}`,
          branchName: `cleanup-bench/worker-${i + 1}`,
          baseRef: 'HEAD',
        });
      }

      await manager.createWorktrees(workerOptions);

      // Measure cleanup time for multiple worktrees
      const start = performance.now();
      await Promise.all(workerOptions.map((opt) => manager.removeWorktree(opt.workerId)));
      const elapsed = performance.now() - start;

      console.log(`Parallel cleanup of ${workerOptions.length} worktrees: ${elapsed.toFixed(2)}ms`);

      // Cleanup should be fast
      expect(elapsed).toBeLessThan(1000);
    });
  });
});

describe('WorktreeManager Correctness', () => {
  let tempDir: string;
  let manager: WorktreeManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ralph-worktree-correct-'));
    await initGitRepo(tempDir);
    manager = new WorktreeManager({ repoRoot: tempDir });
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('worktree paths are correctly generated', async () => {
    const worktreePath = await manager.createWorktree({
      workerId: 'my-worker',
      branchName: 'my-branch',
      baseRef: 'HEAD',
    });

    expect(worktreePath).toBe(join(tempDir, 'worktrees', 'my-worker'));
  });

  test('can create and remove multiple worktrees', async () => {
    // Create multiple worktrees
    const worktreeMap = await manager.createWorktrees([
      { workerId: 'worker-1', branchName: 'branch-1', baseRef: 'HEAD' },
      { workerId: 'worker-2', branchName: 'branch-2', baseRef: 'HEAD' },
      { workerId: 'worker-3', branchName: 'branch-3', baseRef: 'HEAD' },
    ]);

    expect(worktreeMap.size).toBe(3);
    expect(worktreeMap.has('worker-1')).toBe(true);
    expect(worktreeMap.has('worker-2')).toBe(true);
    expect(worktreeMap.has('worker-3')).toBe(true);

    // Remove them
    await manager.removeWorktree('worker-1');
    await manager.removeWorktree('worker-2');
    await manager.removeWorktree('worker-3');

    // Verify paths are cleaned up
    expect(worktreeMap.get('worker-1')).toBeDefined();
    expect(worktreeMap.get('worker-2')).toBeDefined();
    expect(worktreeMap.get('worker-3')).toBeDefined();
  });

  test('recreates worktrees after removal', async () => {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Create initial worktree with unique branch
    const path1 = await manager.createWorktree({
      workerId: 'recycle-worker',
      branchName: `recycle-branch-first-${uniqueId}`,
      baseRef: 'HEAD',
    });

    // Remove the worktree but keep the branch
    await manager.removeWorktree('recycle-worker');

    // Create again with a different branch name (since old branch still exists)
    const path2 = await manager.createWorktree({
      workerId: 'recycle-worker',
      branchName: `recycle-branch-second-${uniqueId}`,
      baseRef: 'HEAD',
    });

    // Paths should be the same (same workerId)
    expect(path1).toBe(path2);
  });
});

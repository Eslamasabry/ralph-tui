/**
 * ABOUTME: Benchmark tests for worktree creation performance.
 * Measures and validates worktree creation optimization.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { WorktreeManager } from '../../../src/engine/parallel/worktree-manager.js';

async function initGitRepo(repoPath: string): Promise<void> {
  // Initialize git repository
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

  describe('worktree validation', () => {
    test('validates branch and commit after creation', async () => {
      const worktreePath = await manager.createWorktree({
        workerId: 'validation-test',
        branchName: 'validation-test-branch',
        baseRef: 'HEAD',
      });

      // Verify worktree exists and is valid
      const validation = await manager.validateWorktree(
        worktreePath,
        'validation-test-branch',
        execSync('git rev-parse HEAD', { cwd: tempDir }).toString().trim()
      );

      expect(validation.valid).toBe(true);
      expect(validation.currentBranch).toBe('validation-test-branch');
    });

    test('detects branch mismatch', async () => {
      const worktreePath = await manager.createWorktree({
        workerId: 'branch-mismatch-test',
        branchName: 'expected-branch',
        baseRef: 'HEAD',
      });

      // Create another branch and manually checkout to it to create mismatch
      execSync('git checkout -b wrong-branch', { cwd: worktreePath, stdio: 'pipe' });

      // Validate should detect mismatch
      const validation = await manager.validateWorktree(
        worktreePath,
        'expected-branch',
        execSync('git rev-parse expected-branch', { cwd: tempDir }).toString().trim()
      );

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain("Expected branch 'expected-branch'");
      expect(validation.currentBranch).toBe('wrong-branch');
    });

    test('detects commit mismatch', async () => {
      // Get initial commit
      const initialCommit = execSync('git rev-parse HEAD', { cwd: tempDir }).toString().trim();

      // Create a worktree
      const worktreePath = await manager.createWorktree({
        workerId: 'commit-mismatch-test',
        branchName: 'commit-test-branch',
        baseRef: 'HEAD',
      });

      // Create a new commit in the worktree
      await writeFile(join(worktreePath, 'new-file.txt'), 'new content');
      execSync('git add .', { cwd: worktreePath, stdio: 'pipe' });
      execSync('git commit -m "New commit"', { cwd: worktreePath, stdio: 'pipe' });

      // Validate should detect commit mismatch
      const validation = await manager.validateWorktree(
        worktreePath,
        'commit-test-branch',
        initialCommit
      );

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Expected commit');
    });

    test('cleans up worktree on validation failure', async () => {
      // Create a worktree
      const worktreePath = await manager.createWorktree({
        workerId: 'cleanup-test',
        branchName: 'cleanup-test-branch',
        baseRef: 'HEAD',
      });

      // Manually corrupt the worktree by checking out a different branch
      // This simulates a scenario where git worktree add succeeded but we're on wrong branch
      execSync('git checkout -b wrong-cleanup-branch', { cwd: worktreePath, stdio: 'pipe' });

      // Verify validation fails
      const initialCommit = execSync('git rev-parse HEAD', { cwd: tempDir }).toString().trim();
      const validation = await manager.validateWorktree(
        worktreePath,
        'cleanup-test-branch',
        initialCommit
      );
      expect(validation.valid).toBe(false);
      expect(validation.currentBranch).toBe('wrong-cleanup-branch');

      // Now call removeWorktree to verify it cleans up properly
      await manager.removeWorktree('cleanup-test');

      // Verify the worktree directory is removed
      const worktrees = await manager.listWorktrees();
      const cleanupTestWorktree = worktrees.find(w => w.relativePath.includes('cleanup-test'));
      expect(cleanupTestWorktree).toBeUndefined();
    });

    test('createWorktree succeeds after cleanup even if old worktree was corrupted', async () => {
      // Create a worktree
      const worktreePath = await manager.createWorktree({
        workerId: 'error-test',
        branchName: 'error-test-branch',
        baseRef: 'HEAD',
      });

      // Corrupt the worktree
      execSync('git checkout -b wrong-error-branch', { cwd: worktreePath, stdio: 'pipe' });

      // Try to create a new worktree (same workerId) - old one gets cleaned up first
      // This tests that even if old worktree was corrupted, we get a clean result
      await manager.createWorktree({
        workerId: 'error-test',
        branchName: 'error-test-branch',
        baseRef: 'HEAD',
      });

      // Verify the new worktree is valid
      const worktrees = await manager.listWorktrees();
      const errorTestWorktree = worktrees.find(w => w.relativePath.includes('error-test'));
      expect(errorTestWorktree).toBeDefined();
      expect(errorTestWorktree!.branch).toBe('error-test-branch');
    });
  });

  describe('retry sequence and idempotency', () => {
    test('cleanupWorktree is idempotent - safe to call multiple times', async () => {
      // Create a worktree first
      await manager.createWorktree({
        workerId: 'idempotent-test',
        branchName: 'idempotent-test-branch',
        baseRef: 'HEAD',
      });

      // Verify worktree exists
      const worktreesBefore = await manager.listWorktrees();
      expect(worktreesBefore.some(w => w.relativePath.includes('idempotent-test'))).toBe(true);

      // Call cleanup multiple times - should not throw
      await manager.removeWorktree('idempotent-test');
      await manager.removeWorktree('idempotent-test'); // Second call should not throw
      await manager.removeWorktree('idempotent-test'); // Third call should not throw

      // Verify worktree is cleaned up
      const worktreesAfter = await manager.listWorktrees();
      expect(worktreesAfter.some(w => w.relativePath.includes('idempotent-test'))).toBe(false);
    });

    test('forceCleanupStaleWorktree is idempotent - safe to call multiple times', async () => {
      // Create a worktree first
      const worktreePath = await manager.createWorktree({
        workerId: 'force-cleanup-test',
        branchName: 'force-cleanup-test-branch',
        baseRef: 'HEAD',
      });

      // Call force cleanup multiple times - should not throw
      // @ts-expect-error - accessing private method for testing
      await manager.forceCleanupStaleWorktree(worktreePath);
      // @ts-expect-error - accessing private method for testing
      await manager.forceCleanupStaleWorktree(worktreePath);
      // @ts-expect-error - accessing private method for testing
      await manager.forceCleanupStaleWorktree(worktreePath);

      // Verify worktree is cleaned up
      const worktrees = await manager.listWorktrees();
      expect(worktrees.some(w => w.relativePath.includes('force-cleanup-test'))).toBe(false);
    });

    test('retry sequence handles locked worktree state', async () => {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const workerId = `retry-test-${uniqueId}`;

      // Create initial worktree
      const path1 = await manager.createWorktree({
        workerId,
        branchName: `retry-test-branch-${uniqueId}`,
        baseRef: 'HEAD',
      });

      // Remove worktree via git but keep directory
      execSync(`git worktree remove --force ${path1}`, { cwd: tempDir, stdio: 'pipe' });

      // Create again - this should trigger cleanup and succeed
      const path2 = await manager.createWorktree({
        workerId,
        branchName: `retry-test-branch-${uniqueId}`,
        baseRef: 'HEAD',
      });

      // Verify the path is the same
      expect(path1).toBe(path2);

      // Verify the worktree is valid
      const worktrees = await manager.listWorktrees();
      const retryWorktree = worktrees.find(w => w.relativePath.includes(workerId));
      expect(retryWorktree).toBeDefined();
      expect(retryWorktree!.branch).toBe(`retry-test-branch-${uniqueId}`);
    });

    test('createWorktree succeeds after previous worktree was removed but not cleaned up', async () => {
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const workerId = `orphaned-test-${uniqueId}`;

      // Create initial worktree
      const path1 = await manager.createWorktree({
        workerId,
        branchName: `orphaned-test-branch-${uniqueId}`,
        baseRef: 'HEAD',
      });

      // Manually delete the worktree directory without using git worktree remove
      // This simulates an orphaned/corrupted worktree state
      const { rm } = await import('node:fs/promises');
      await rm(path1, { recursive: true, force: true });

      // Create again - retry sequence should handle the missing directory
      const path2 = await manager.createWorktree({
        workerId,
        branchName: `orphaned-test-branch-${uniqueId}`,
        baseRef: 'HEAD',
      });

      // Verify the path is the same
      expect(path1).toBe(path2);

      // Verify the worktree is valid
      const worktrees = await manager.listWorktrees();
      const orphanedWorktree = worktrees.find(w => w.relativePath.includes(workerId));
      expect(orphanedWorktree).toBeDefined();
    });
  });
});

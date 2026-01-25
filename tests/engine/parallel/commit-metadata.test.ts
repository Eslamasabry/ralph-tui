/**
 * ABOUTME: Tests commit metadata parsing for merge train events.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ParallelCoordinator } from '../../../src/engine/parallel/coordinator.js';
import type { RalphConfig } from '../../../src/config/types.js';
import {
  DEFAULT_CHECKS_CONFIG,
  DEFAULT_ERROR_HANDLING,
  DEFAULT_IMPACT_CONFIG,
  DEFAULT_MERGE_CONFIG,
  DEFAULT_PARALLEL_CONFIG,
  DEFAULT_QUALITY_GATES_CONFIG,
  DEFAULT_RESOLVER_CONFIG,
} from '../../../src/config/types.js';

function createTestConfig(cwd: string): RalphConfig {
  return {
    cwd,
    maxIterations: 1,
    iterationDelay: 0,
    outputDir: join(cwd, '.ralph-tui', 'outputs'),
    progressFile: join(cwd, '.ralph-tui', 'progress.md'),
    showTui: false,
    agent: {
      name: 'test-agent',
      plugin: 'claude',
      options: {},
    },
    tracker: {
      name: 'test-tracker',
      plugin: 'json',
      options: {},
    },
    errorHandling: DEFAULT_ERROR_HANDLING,
    parallel: DEFAULT_PARALLEL_CONFIG,
    impact: DEFAULT_IMPACT_CONFIG,
    merge: DEFAULT_MERGE_CONFIG,
    resolver: DEFAULT_RESOLVER_CONFIG,
    checks: DEFAULT_CHECKS_CONFIG,
    qualityGates: DEFAULT_QUALITY_GATES_CONFIG,
  };
}

describe('ParallelCoordinator commit metadata', () => {
  let repoPath: string;
  let baseCommit: string;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'ralph-commit-meta-'));
    execSync('git init -b main', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: repoPath, stdio: 'ignore' });

    await writeFile(join(repoPath, 'file.txt'), 'hello\n', 'utf8');
    execSync('git add file.txt', { cwd: repoPath, stdio: 'ignore' });
    execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'ignore' });
    baseCommit = execSync('git rev-parse HEAD', { cwd: repoPath, stdio: 'pipe' })
      .toString()
      .trim();

    await writeFile(join(repoPath, 'file.txt'), 'hello again\n', 'utf8');
    execSync('git add file.txt', { cwd: repoPath, stdio: 'ignore' });
    execSync('git commit -m "Second commit"', { cwd: repoPath, stdio: 'ignore' });

  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  test('reads commit metadata with ISO timestamps', async () => {
    const commit = execSync('git rev-parse HEAD', { cwd: repoPath, stdio: 'pipe' })
      .toString()
      .trim();
    const coordinator = new ParallelCoordinator(createTestConfig(repoPath), { maxWorkers: 1 });
    const metadata = await (coordinator as any).getCommitMetadata(commit, repoPath);

    expect(metadata.hash).toBe(commit);
    expect(metadata.shortHash).toBe(commit.slice(0, 7));
    expect(metadata.message).toBe('Second commit');
    expect(metadata.fullMessage).toContain('Second commit');
    expect(metadata.authorName).toBe('Test User');
    expect(metadata.authorEmail).toBe('test@example.com');
    expect(metadata.authorDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.committerDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(metadata.treeHash).toMatch(/^[0-9a-f]{40}$/);
    expect(metadata.parents).toEqual([baseCommit]);
    expect(metadata.fileNames).toContain('file.txt');
    expect(metadata.filesChanged).toBe(1);
  });

  test('returns sentinel metadata for "none" commit', async () => {
    const coordinator = new ParallelCoordinator(createTestConfig(repoPath), { maxWorkers: 1 });
    const metadata = await (coordinator as any).getCommitMetadata('none', repoPath);

    expect(metadata.hash).toBe('none');
    expect(metadata.shortHash).toBe('none');
    expect(metadata.fileNames).toEqual([]);
    expect(metadata.filesChanged).toBe(0);
  });
});

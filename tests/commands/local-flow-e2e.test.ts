/**
 * ABOUTME: End-to-end tests for the local headless run/resume flow using the real CLI,
 * parallel engine, git worktrees, and json tracker against disposable repos.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface CliResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}

interface SpawnedCli {
  child: ChildProcessWithoutNullStreams;
  done: Promise<CliResult>;
}

interface TestRepo {
  repoDir: string;
  prdPath: string;
}

interface TestSessionState {
  status?: string;
  activeTaskIds?: string[];
}

const tempDirs = new Set<string>();

function spawnCli(
  args: string[],
  env: NodeJS.ProcessEnv = {}
): SpawnedCli {
  const child = spawn(process.execPath, ['run', './src/cli.tsx', ...args], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', (chunk: Buffer | string) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer | string) => {
    output += chunk.toString();
  });

  const done = new Promise<CliResult>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code, signal, output });
    });
  });

  return { child, done };
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  timeoutMs = 15_000,
  intervalMs = 50
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await Bun.sleep(intervalMs);
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

function createPrd(taskCount: number): string {
  return JSON.stringify(
    {
      name: 'E2E Test PRD',
      branchName: 'main',
      userStories: Array.from({ length: taskCount }, (_, index) => ({
        id: `US-${String(index + 1).padStart(3, '0')}`,
        title: `Task ${index + 1}`,
        description: `Implement task ${index + 1}`,
        acceptanceCriteria: [`Task ${index + 1} is completed`],
        priority: 1,
        passes: false,
      })),
    },
    null,
    2
  );
}

async function createTestRepo(taskCount: number): Promise<TestRepo> {
  const repoDir = await mkdtemp(join(tmpdir(), 'ralph-local-flow-e2e-'));
  tempDirs.add(repoDir);

  const configDir = join(repoDir, '.ralph-tui');
  const fakeAgentPath = join(repoDir, 'fake-droid');
  const prdPath = join(repoDir, 'prd.json');

  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, 'config.toml'),
    `agent = "droid"
tracker = "json"
command = "${fakeAgentPath}"
maxIterations = 20

[qualityGates]
enabled = false
requireImpactTable = false
`,
    'utf-8'
  );
  await writeFile(
    fakeAgentPath,
    `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "--version" ]]; then
  echo "droid 0.0.1"
  exit 0
fi

if [[ "\${1:-}" != "exec" ]]; then
  echo "unsupported args: $*" >&2
  exit 1
fi

cwd="$(pwd)"
for ((i = 1; i <= $#; i++)); do
  if [[ "\${!i}" == "--cwd" ]]; then
    next_index=$((i + 1))
    cwd="\${!next_index}"
    break
  fi
done

prompt="\${!#}"
task_id="$(printf '%s\n' "$prompt" | sed -n 's/^## Your Task: \\([^ ]*\\) -.*/\\1/p' | head -n 1)"
if [[ -z "$task_id" ]]; then
  task_id="$(printf '%s\n' "$prompt" | sed -n 's/^\\*\\*ID\\*\\*: \\([^ ]*\\).*/\\1/p' | head -n 1)"
fi
if [[ -z "$task_id" ]]; then
  task_id="UNKNOWN"
fi

delay="\${RALPH_FAKE_DROID_DELAY_SECONDS:-0}"
echo "working $task_id"
if [[ "$delay" != "0" ]]; then
  sleep "$delay"
fi

mkdir -p "$cwd/fake-output"
printf 'completed %s\\n' "$task_id" > "$cwd/fake-output/$task_id.txt"
if [[ "\${RALPH_FAKE_DROID_STDERR:-0}" == "1" ]]; then
  echo "stderr $task_id" >&2
fi

git -C "$cwd" add "fake-output/$task_id.txt"
git -C "$cwd" commit -m "$task_id: fake work" -m "Ralph-Task: $task_id" >/dev/null
echo "<promise>COMPLETE</promise>"
`,
    'utf-8'
  );
  await chmod(fakeAgentPath, 0o755);
  await writeFile(prdPath, createPrd(taskCount), 'utf-8');
  await writeFile(join(repoDir, 'README.md'), '# Local flow E2E fixture\n', 'utf-8');

  execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Ralph E2E'], { cwd: repoDir, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'Initial fixture'], { cwd: repoDir, stdio: 'ignore' });

  return { repoDir, prdPath };
}

async function readSession(repoDir: string): Promise<TestSessionState | null> {
  const sessionPath = join(repoDir, '.ralph-tui', 'session.json');
  if (!(await pathExists(sessionPath))) {
    return null;
  }
  return readJsonFile<TestSessionState>(sessionPath);
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe('local headless flow end-to-end', () => {
  test(
    'completes a real parallel run through the CLI and merges worker commits',
    async () => {
      const { repoDir, prdPath } = await createTestRepo(2);

      const run = spawnCli([
        'run',
        '--headless',
        '--no-setup',
        '--cwd',
        repoDir,
        '--prd',
        prdPath,
      ]);

      const result = await run.done;

      expect(result.code).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.output).toContain('Session completed successfully');

      const prd = await readJsonFile<{
        userStories: Array<{ passes: boolean }>;
      }>(prdPath);
      expect(prd.userStories.every((story) => story.passes)).toBe(true);

      expect(await pathExists(join(repoDir, '.ralph-tui', 'session.json'))).toBe(false);
      expect(await pathExists(join(repoDir, 'fake-output', 'US-001.txt'))).toBe(true);
      expect(await pathExists(join(repoDir, 'fake-output', 'US-002.txt'))).toBe(true);

      const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: repoDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect(worktrees.match(/^worktree /gm)?.length).toBe(1);
    },
    30_000
  );

  test(
    'stops gracefully on SIGINT, persists a resumable session, and resume finishes the remaining work',
    async () => {
      const { repoDir, prdPath } = await createTestRepo(6);

      const run = spawnCli(
        [
          'run',
          '--headless',
          '--no-setup',
          '--cwd',
          repoDir,
          '--prd',
          prdPath,
        ],
        {
          RALPH_FAKE_DROID_DELAY_SECONDS: '0.7',
        }
      );

      await waitForCondition(async () => {
        const session = await readSession(repoDir);
        return (session?.activeTaskIds?.length ?? 0) === 5;
      });

      const interruptedAt = Date.now();
      run.child.kill('SIGINT');
      const interruptedResult = await run.done;
      const shutdownDurationMs = Date.now() - interruptedAt;

      expect(interruptedResult.code).toBe(0);
      expect(interruptedResult.signal).toBeNull();
      expect(shutdownDurationMs).toBeGreaterThanOrEqual(400);

      const interruptedSession = await readSession(repoDir);
      expect(interruptedSession?.status).toBe('interrupted');

      const interruptedPrd = await readJsonFile<{
        userStories: Array<{ passes: boolean }>;
      }>(prdPath);
      expect(interruptedPrd.userStories.filter((story) => story.passes)).toHaveLength(5);
      expect(interruptedPrd.userStories.filter((story) => !story.passes)).toHaveLength(1);

      const resume = spawnCli([
        'resume',
        '--headless',
        '--cwd',
        repoDir,
      ]);
      const resumedResult = await resume.done;

      expect(resumedResult.code).toBe(0);
      expect(resumedResult.signal).toBeNull();
      expect(resumedResult.output).toContain('Session completed and cleaned up.');

      const resumedPrd = await readJsonFile<{
        userStories: Array<{ passes: boolean }>;
      }>(prdPath);
      expect(resumedPrd.userStories.every((story) => story.passes)).toBe(true);
      expect(await pathExists(join(repoDir, '.ralph-tui', 'session.json'))).toBe(false);
      expect(await pathExists(join(repoDir, 'fake-output', 'US-006.txt'))).toBe(true);
    },
    45_000
  );
});

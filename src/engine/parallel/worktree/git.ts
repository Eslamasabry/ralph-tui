/**
 * ABOUTME: Git command execution with retries and timeouts.
 */

import { spawn } from 'node:child_process';
import type { GitCommandResult } from './types.js';

export interface GitExecOptions {
  cwd?: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
}

function buildIsolatedGitEnv(
  overrides?: Record<string, string | undefined>
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !key.startsWith('GIT_')) {
      env[key] = value;
    }
  }

  env.GIT_TERMINAL_PROMPT = '0';

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
  }

  return env;
}

function isTransientGitLockError(stderr: string): boolean {
  const text = stderr.toLowerCase();
  return (
    text.includes('another git process seems to be running') ||
    text.includes('index.lock') ||
    text.includes('cannot lock') ||
    (text.includes('unable to create') && text.includes('.lock')) ||
    (text.includes('fatal: could not') && text.includes('lock'))
  );
}

export async function execGit(
  args: string[],
  opts: GitExecOptions,
  retry: { attempts: number; baseDelayMs: number } = { attempts: 4, baseDelayMs: 150 }
): Promise<GitCommandResult> {
  let last: GitCommandResult | null = null;

  for (let i = 0; i < retry.attempts; i++) {
    const started = Date.now();
    const res = await execGitOnce(args, opts);
    res.durationMs = Date.now() - started;

    if (res.exitCode === 0) {
      return res;
    }

    last = res;
    const transient = isTransientGitLockError(res.stderr);
    if (!transient || i === retry.attempts - 1) {
      break;
    }

    const backoff = retry.baseDelayMs * Math.pow(2, i);
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }

  return last ?? { stdout: '', stderr: 'execGit: no result', exitCode: 1, durationMs: 0 };
}

async function execGitOnce(args: string[], opts: GitExecOptions): Promise<GitCommandResult> {
  return new Promise((resolve) => {
    const env = buildIsolatedGitEnv(opts.env);

    const proc = spawn('git', args, {
      cwd: opts.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const killTimer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, opts.timeoutMs);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString('utf8');
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString('utf8');
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ stdout, stderr, exitCode: code ?? 1, durationMs: 0 });
    });

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({ stdout, stderr: err.message, exitCode: 1, durationMs: 0 });
    });
  });
}

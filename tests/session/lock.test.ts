/**
 * ABOUTME: Tests atomic session lock acquisition to prevent concurrent runs.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, releaseLock } from '../../src/session/index.js';
import { acquireLockWithPrompt, releaseLock as releaseLockWithPrompt } from '../../src/session/lock.js';

const tempDirs: string[] = [];

async function createTempRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'ralph-lock-'));
  tempDirs.push(cwd);
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('session lock acquisition', () => {
  test('acquireLock allows only one concurrent winner', async () => {
    const cwd = await createTempRepo();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => acquireLock(cwd, `session-${index}`))
    );

    expect(results.filter(Boolean)).toHaveLength(1);

    await releaseLock(cwd);
  });

  test('acquireLockWithPrompt allows only one concurrent winner', async () => {
    const cwd = await createTempRepo();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        acquireLockWithPrompt(cwd, `session-${index}`, { nonInteractive: true })
      )
    );

    expect(results.filter((result) => result.acquired)).toHaveLength(1);

    await releaseLockWithPrompt(cwd);
  });

  test('concurrent stale lock cleanup still allows only one winner', async () => {
    const cwd = await createTempRepo();
    const sessionDir = join(cwd, '.ralph-tui');
    const lockPath = join(sessionDir, 'ralph.lock');

    await mkdir(sessionDir, { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({
        pid: 999_999,
        sessionId: 'stale-session',
        acquiredAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        cwd,
        hostname: 'test-host',
      }, null, 2)
    );

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        acquireLockWithPrompt(cwd, `session-${index}`, { nonInteractive: true })
      )
    );

    expect(results.filter((result) => result.acquired)).toHaveLength(1);

    const persistedLock = JSON.parse(await readFile(lockPath, 'utf-8')) as { sessionId: string };
    const winningSessionIds = results
      .map((result, index) => result.acquired ? `session-${index}` : null)
      .filter((sessionId): sessionId is string => sessionId !== null);

    expect(winningSessionIds).toHaveLength(1);
    expect(persistedLock.sessionId).toBe(winningSessionIds[0]);

    await releaseLockWithPrompt(cwd);
  });
});

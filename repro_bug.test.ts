
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { acquireLockWithPrompt } from './src/session/lock.js';
import { resumeSession, createSession, releaseLock } from './src/session/index.js';
import { rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Lock Contention Bug', () => {
  const testDir = join(tmpdir(), 'ralph-test-' + Math.random().toString(36).slice(2));

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test('resumeSession fails if lock already acquired by same process', async () => {
    const sessionId = 'test-session-1';
    
    // 1. Acquire lock at start (simulating run.tsx)
    const lockResult = await acquireLockWithPrompt(testDir, sessionId);
    expect(lockResult.acquired).toBe(true);

    // 2. Create a session metadata file manually so resumeSession has something to find
    const sessionMetadata = {
      id: sessionId,
      status: 'paused',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentPlugin: 'claude',
      trackerPlugin: 'beads',
      currentIteration: 0,
      maxIterations: 10,
      totalTasks: 0,
      tasksCompleted: 0,
      cwd: testDir,
    };
    await mkdir(join(testDir, '.ralph-tui'), { recursive: true });
    await Bun.write(join(testDir, '.ralph-tui', 'session-meta.json'), JSON.stringify(sessionMetadata));

    // 3. Try to resume session (simulating run.tsx's resume logic)
    // This should now SUCCEED
    const resumed = await resumeSession(testDir);
    
    expect(resumed).not.toBeNull(); 
    expect(resumed?.id).toBe(sessionId);
  });

  test('createSession fails if lock already acquired by same process', async () => {
    const sessionId = 'test-session-2';
    
    // 1. Acquire lock at start (simulating run.tsx)
    const lockResult = await acquireLockWithPrompt(testDir, sessionId);
    expect(lockResult.acquired).toBe(true);

    // 2. Try to create new session
    // This should also fail
    const session = await createSession({
      agentPlugin: 'claude',
      trackerPlugin: 'beads',
      maxIterations: 10,
      totalTasks: 0,
      cwd: testDir,
    }).catch(e => null);
    
    // createSession doesn't throw on lock failure, it just fails to acquire and returns the session but lock acquisition failed? 
    // Wait, let's look at createSession again.
  });
});

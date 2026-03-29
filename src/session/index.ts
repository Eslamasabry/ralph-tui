/**
 * ABOUTME: Session and lock management for Ralph TUI.
 * Handles session persistence, lock files, and resume functionality.
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';
import {
  readFile,
  writeFile,
  unlink,
  mkdir,
  access,
  constants,
  rename,
} from 'node:fs/promises';
import type {
  LockFile,
  SessionMetadata,
  SessionCheckResult,
  CreateSessionOptions,
  SessionStatus,
} from './types.js';

/**
 * Directory for session data (relative to cwd)
 */
const SESSION_DIR = '.ralph-tui';
const LOCK_FILE = 'ralph.lock';
const SESSION_FILE = 'session-meta.json';

/**
 * Check if a process is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the session directory path
 */
function getSessionDir(cwd: string): string {
  return join(cwd, SESSION_DIR);
}

/**
 * Get the lock file path
 */
function getLockPath(cwd: string): string {
  return join(getSessionDir(cwd), LOCK_FILE);
}

/**
 * Get the session file path
 */
function getSessionPath(cwd: string): string {
  return join(getSessionDir(cwd), SESSION_FILE);
}

/**
 * Ensure session directory exists
 */
async function ensureSessionDir(cwd: string): Promise<void> {
  const dir = getSessionDir(cwd);
  try {
    await access(dir, constants.F_OK);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Check if file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read lock file if it exists
 */
async function readLockFile(cwd: string): Promise<LockFile | null> {
  const lockPath = getLockPath(cwd);
  if (!(await fileExists(lockPath))) {
    return null;
  }

  try {
    const content = await readFile(lockPath, 'utf-8');
    return JSON.parse(content) as LockFile;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }
    throw new Error(
      `Failed to read lock file at ${lockPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Attempt to create a lock file exclusively.
 * Returns false when another process created the lock concurrently.
 */
async function tryWriteLockFile(cwd: string, sessionId: string): Promise<boolean> {
  await ensureSessionDir(cwd);
  const lockPath = getLockPath(cwd);

  const lock: LockFile = {
    pid: process.pid,
    sessionId,
    acquiredAt: new Date().toISOString(),
    cwd,
    hostname: hostname(),
  };

  try {
    await writeFile(lockPath, JSON.stringify(lock, null, 2), { flag: 'wx' });
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

function isSameLockFile(left: LockFile, right: LockFile): boolean {
  return left.pid === right.pid &&
    left.sessionId === right.sessionId &&
    left.acquiredAt === right.acquiredAt &&
    left.cwd === right.cwd &&
    left.hostname === right.hostname;
}

async function restoreClaimedLockFile(
  lockPath: string,
  claimedPath: string,
  claimedContents: string
): Promise<void> {
  try {
    await writeFile(lockPath, claimedContents, { flag: 'wx' });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'EEXIST') {
      throw error;
    }
  } finally {
    try {
      await unlink(claimedPath);
    } catch {
      // Ignore if the temporary claim is already gone.
    }
  }
}

async function claimLockFile(cwd: string, observedLock: LockFile): Promise<boolean> {
  const lockPath = getLockPath(cwd);
  const claimedPath = `${lockPath}.${process.pid}.${randomUUID()}.claim`;

  try {
    await rename(lockPath, claimedPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return false;
    }
    throw error;
  }

  const claimedContents = await readFile(claimedPath, 'utf-8');
  const claimedLock = JSON.parse(claimedContents) as LockFile;

  if (!isSameLockFile(claimedLock, observedLock)) {
    await restoreClaimedLockFile(lockPath, claimedPath, claimedContents);
    return false;
  }

  await unlink(claimedPath);
  return true;
}

/**
 * Read session metadata if it exists
 */
async function readSessionMetadata(
  cwd: string
): Promise<SessionMetadata | null> {
  const sessionPath = getSessionPath(cwd);
  if (!(await fileExists(sessionPath))) {
    return null;
  }

  try {
    const content = await readFile(sessionPath, 'utf-8');
    return JSON.parse(content) as SessionMetadata;
  } catch (error) {
    console.error(`[session] Failed to read session metadata from ${sessionPath}:`, error);
    return null;
  }
}

/**
 * Check for existing session and lock status
 */
export async function checkSession(cwd: string): Promise<SessionCheckResult> {
  const session = await readSessionMetadata(cwd);
  let lock: LockFile | null = null;
  try {
    lock = await readLockFile(cwd);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const errorCode = nodeError.code || 'UNKNOWN';
    const errorName = nodeError.name || 'Error';
    console.warn(
      `[session] Lock read failed (code=${errorCode}, type=${errorName}); treating session as locked to avoid concurrent runs: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {
      hasSession: session !== null && session.status !== 'completed',
      session: session ?? undefined,
      isLocked: true,
      isStale: false,
    };
  }

  if (!lock) {
    return {
      hasSession: session !== null && session.status !== 'completed',
      session: session ?? undefined,
      isLocked: false,
      isStale: false,
    };
  }

  // Check if the lock holder is still running
  const isRunning = isProcessRunning(lock.pid);
  const isStale = !isRunning;

  return {
    hasSession: session !== null && session.status !== 'completed',
    session: session ?? undefined,
    isLocked: !isStale,
    lock,
    isStale,
  };
}

/**
 * Acquire lock for a new session
 */
export async function acquireLock(
  cwd: string,
  sessionId: string
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existingLock = await readLockFile(cwd);
    if (!existingLock) {
      const acquired = await tryWriteLockFile(cwd, sessionId);
      if (acquired) {
        return true;
      }
      continue;
    }

    if (existingLock.pid === process.pid && existingLock.sessionId === sessionId) {
      return true;
    }

    if (isProcessRunning(existingLock.pid)) {
      return false;
    }

    const claimed = await claimLockFile(cwd, existingLock);
    if (!claimed) {
      continue;
    }
    const acquired = await tryWriteLockFile(cwd, sessionId);
    if (acquired) {
      return true;
    }
  }

  const finalLock = await readLockFile(cwd);
  if (!finalLock) {
    return false;
  }

  return finalLock.pid === process.pid && finalLock.sessionId === sessionId;
}

/**
 * Release the lock
 */
export async function releaseLock(cwd: string): Promise<void> {
  const lockPath = getLockPath(cwd);
  try {
    await unlink(lockPath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      console.warn(`[session] Failed to release lock at ${lockPath}:`, error);
    }
  }
}

/**
 * Clean up stale lock (when process is no longer running)
 */
export async function cleanStaleLock(cwd: string): Promise<boolean> {
  const lock = await readLockFile(cwd);
  if (!lock) {
    return false;
  }

  if (!isProcessRunning(lock.pid)) {
    await releaseLock(cwd);
    return true;
  }

  return false;
}

/**
 * Create a new session
 */
export async function createSession(
  options: CreateSessionOptions
): Promise<SessionMetadata> {
  await ensureSessionDir(options.cwd);
  const existingLock = await readLockFile(options.cwd);
  const hasCurrentProcessLock = existingLock?.pid === process.pid;

  const now = new Date().toISOString();
  const session: SessionMetadata = {
    id: hasCurrentProcessLock ? existingLock.sessionId : randomUUID(),
    status: 'running',
    startedAt: now,
    updatedAt: now,
    agentPlugin: options.agentPlugin,
    trackerPlugin: options.trackerPlugin,
    epicId: options.epicId,
    prdPath: options.prdPath,
    currentIteration: 0,
    maxIterations: options.maxIterations,
    totalTasks: options.totalTasks,
    tasksCompleted: 0,
    cwd: options.cwd,
  };

  let lockAcquiredBySession = false;
  if (!hasCurrentProcessLock) {
    const acquired = await acquireLock(options.cwd, session.id);
    if (!acquired) {
      throw new Error('Failed to acquire session lock');
    }
    lockAcquiredBySession = true;
  }

  try {
    await saveSession(session);
  } catch (error) {
    if (lockAcquiredBySession) {
      await releaseLock(options.cwd);
    }
    throw error;
  }

  return session;
}

/**
 * Save session metadata to disk
 */
export async function saveSession(session: SessionMetadata): Promise<void> {
  await ensureSessionDir(session.cwd);
  const sessionPath = getSessionPath(session.cwd);

  const updated: SessionMetadata = {
    ...session,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(sessionPath, JSON.stringify(updated, null, 2));
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  cwd: string,
  status: SessionStatus
): Promise<SessionMetadata | null> {
  const session = await readSessionMetadata(cwd);
  if (!session) {
    return null;
  }

  session.status = status;
  if (status === 'completed' || status === 'failed' || status === 'interrupted') {
    session.endedAt = new Date().toISOString();
  }

  await saveSession(session);
  return session;
}

/**
 * Update session iteration
 */
export async function updateSessionIteration(
  cwd: string,
  iteration: number,
  tasksCompleted?: number
): Promise<SessionMetadata | null> {
  const session = await readSessionMetadata(cwd);
  if (!session) {
    return null;
  }

  session.currentIteration = iteration;
  if (tasksCompleted !== undefined) {
    session.tasksCompleted = tasksCompleted;
  }

  await saveSession(session);
  return session;
}

/**
 * Update session maxIterations
 */
export async function updateSessionMaxIterations(
  cwd: string,
  maxIterations: number
): Promise<SessionMetadata | null> {
  const session = await readSessionMetadata(cwd);
  if (!session) {
    return null;
  }

  session.maxIterations = maxIterations;

  await saveSession(session);
  return session;
}

/**
 * End a session (release lock and update status)
 */
export async function endSession(
  cwd: string,
  status: SessionStatus = 'completed'
): Promise<void> {
  await updateSessionStatus(cwd, status);
  await releaseLock(cwd);
}

/**
 * Resume an existing session
 */
export async function resumeSession(
  cwd: string
): Promise<SessionMetadata | null> {
  const session = await readSessionMetadata(cwd);
  if (!session) {
    return null;
  }

  // Clean up stale lock if present
  await cleanStaleLock(cwd);

  // Acquire new lock
  const acquired = await acquireLock(cwd, session.id);
  if (!acquired) {
    return null;
  }

  // Update status to running
  session.status = 'running';
  await saveSession(session);

  return session;
}

// Re-export types
export type {
  LockFile,
  SessionMetadata,
  SessionCheckResult,
  CreateSessionOptions,
  SessionStatus,
};

// Re-export persistence module
export {
  hasPersistedSession,
  loadPersistedSession,
  savePersistedSession,
  deletePersistedSession,
  createPersistedSession,
  updateSessionAfterIteration,
  pauseSession,
  resumePersistedSession,
  completeSession,
  failSession,
  addSkippedTask,
  addActiveTask,
  removeActiveTask,
  clearActiveTasks,
  getActiveTasks,
  setSubagentPanelVisible,
  isSessionResumable,
  getSessionSummary,
  detectAndRecoverStaleSession,
} from './persistence.js';

export type {
  TaskStatusSnapshot,
  TrackerStateSnapshot,
  PersistedSessionState,
  PersistedIterationResult,
  StaleSessionRecoveryResult,
} from './persistence.js';

// Re-export lock module with single instance support
export {
  checkLock,
  acquireLockWithPrompt,
  releaseLock as releaseLockNew,
  registerLockCleanupHandlers,
  isLockStaleByTimestamp,
  checkAndCleanStaleLock,
  startPeriodicStaleLockCheck,
  DEFAULT_STALE_LOCK_TIMEOUT_MINUTES,
  type LockCheckResult,
  type LockAcquisitionResult,
  type PeriodicStaleLockCheckResult,
} from './lock.js';

// Re-export reconciliation module
export {
  reconcileClosedTasks,
  formatReconciliationReport,
  logReconciliationResult,
  type ReconciliationResult,
  type ReconciliationAction,
} from './reconciliation.js';

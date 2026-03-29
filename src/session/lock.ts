/**
 * ABOUTME: Single instance lock management for Ralph TUI.
 * Prevents concurrent runs in the same git repository to avoid state corruption.
 * Provides clear user feedback for lock conflicts and stale lock handling.
 */

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
import { unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { promptBoolean } from '../setup/prompts.js';
import type { LockFile } from './types.js';

/**
 * Directory for session data (relative to cwd)
 */
const SESSION_DIR = '.ralph-tui';
const LOCK_FILE = 'ralph.lock';

/**
 * Default timeout in minutes after which a lock is considered stale
 * if the process is no longer running.
 */
export const DEFAULT_STALE_LOCK_TIMEOUT_MINUTES = 30;

/**
 * Default interval in seconds for periodic stale lock checks
 */
const DEFAULT_STALE_LOCK_CHECK_INTERVAL_SECONDS = 60;

/**
 * Result of checking the lock status
 */
export interface LockCheckResult {
  /** Whether a valid lock exists (another process is running) */
  isLocked: boolean;

  /** Whether the lock is stale (process no longer running) */
  isStale: boolean;

  /** The lock file contents if a lock exists */
  lock?: LockFile;
}

/**
 * Result of attempting to acquire a lock
 */
export interface LockAcquisitionResult {
  /** Whether the lock was successfully acquired */
  acquired: boolean;

  /** Error message if acquisition failed */
  error?: string;

  /** PID of the existing lock holder if blocked */
  existingPid?: number;
}

/**
 * Check if a process is running by sending signal 0
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
 * Check if a lock is stale based on timestamp.
 * A lock is stale if it's older than the specified timeout.
 *
 * @param lock The lock file contents
 * @param timeoutMinutes Timeout in minutes (default: 30)
 * @returns true if the lock is stale based on timestamp
 */
export function isLockStaleByTimestamp(
  lock: LockFile,
  timeoutMinutes: number = DEFAULT_STALE_LOCK_TIMEOUT_MINUTES
): boolean {
  const acquiredAt = new Date(lock.acquiredAt);
  const now = new Date();
  const ageMinutes = (now.getTime() - acquiredAt.getTime()) / (1000 * 60);
  return ageMinutes >= timeoutMinutes;
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
 * Read the lock file if it exists
 */
async function readLockFile(cwd: string): Promise<LockFile | null> {
  const lockPath = getLockPath(cwd);

  try {
    const content = await readFile(lockPath, 'utf-8');
    return JSON.parse(content) as LockFile;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      // File doesn't exist - this is expected, not an error
      return null;
    }

    // Log corruption/permission errors for debugging
    // Still return null to allow recovery, but make the issue visible
    console.error(
      `[session/lock] Error reading lock file: ${nodeError.message || 'unknown error'}. ` +
        `This may indicate a corrupt lock file at ${lockPath}.`
    );
    return null;
  }
}

/**
 * Check the current lock status without modifying anything
 */
export async function checkLock(cwd: string): Promise<LockCheckResult> {
  const lock = await readLockFile(cwd);

  if (!lock) {
    return { isLocked: false, isStale: false };
  }

  const isRunning = isProcessRunning(lock.pid);

  return {
    isLocked: isRunning,
    isStale: !isRunning,
    lock,
  };
}

/**
 * Atomically attempt to create a lock file with O_CREAT | O_EXCL.
 * This ensures check-and-claim is atomic, preventing TOCTOU races.
 */
async function tryWriteLockFileAtomic(cwd: string, sessionId: string): Promise<
  | { success: true }
  | { success: false; reason: 'exists'; lock: LockFile }
  | { success: false; reason: 'other'; error: NodeJS.ErrnoException }
> {
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
    return { success: true };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EEXIST') {
      // Atomically failed - read the existing lock to return to caller
      const existingLock = await readLockFile(cwd);
      if (existingLock) {
        return { success: false, reason: 'exists', lock: existingLock };
      }
      // Lock disappeared between EEXIST and our read - caller should retry
      return { success: false, reason: 'other', error: nodeError };
    }
    return { success: false, reason: 'other', error: nodeError };
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
      // Ignore if another cleanup path already removed the temporary claim.
    }
  }
}

/**
 * Claim the currently observed lock file before replacing it.
 * This prevents stale-lock cleanup or force takeover from deleting a newer lock
 * that appeared after the caller's initial check.
 */
async function claimLockFile(
  cwd: string,
  observedLock: LockFile
): Promise<boolean> {
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
 * Remove the lock file
 */
async function deleteLockFile(cwd: string): Promise<void> {
  const lockPath = getLockPath(cwd);
  try {
    await unlink(lockPath);
  } catch {
    // Ignore if lock doesn't exist
  }
}

/**
 * Remove the lock file (synchronous version for exit handlers)
 */
function deleteLockFileSync(cwd: string): void {
  const lockPath = getLockPath(cwd);
  try {
    unlinkSync(lockPath);
  } catch {
    // Ignore if lock doesn't exist
  }
}

/**
 * Format the stale lock warning message
 */
function formatStaleLockWarning(lock: LockFile): string {
  const startTime = new Date(lock.acquiredAt).toLocaleString();
  return `
⚠️  Stale lock detected

A previous Ralph session did not exit cleanly:
  PID:      ${lock.pid} (no longer running)
  Started:  ${startTime}
  Host:     ${lock.hostname}

This may happen if Ralph was terminated unexpectedly (crash, kill -9, etc.).
`;
}

/**
 * Result of a periodic stale lock check
 */
export interface PeriodicStaleLockCheckResult {
  /** Whether a stale lock was found and cleaned */
  cleaned: boolean;

  /** The PID of the cleaned lock, if any */
  cleanedPid?: number;

  /** The lock file contents if a stale lock was found (before cleanup) */
  staleLock?: LockFile;
}

/**
 * Check for stale locks and clean them if found.
 * This is intended to be called periodically during a running session.
 *
 * @param cwd Working directory
 * @param timeoutMinutes Timeout in minutes after which a lock is considered stale
 * @returns Result indicating if a stale lock was cleaned
 */
export async function checkAndCleanStaleLock(
  cwd: string,
  timeoutMinutes: number = DEFAULT_STALE_LOCK_TIMEOUT_MINUTES
): Promise<PeriodicStaleLockCheckResult> {
  const result: PeriodicStaleLockCheckResult = { cleaned: false };

  const lockStatus = await checkLock(cwd);

  // No lock exists
  if (!lockStatus.lock) {
    return result;
  }

  // Check if process is running
  const processRunning = isProcessRunning(lockStatus.lock.pid);

  // Only clean locks owned by non-running processes.
  // Timestamp is used for observability but must never override a live PID check.
  const isStaleByProcess = !processRunning;
  const isStaleByTimestamp = isLockStaleByTimestamp(lockStatus.lock, timeoutMinutes);

  if (isStaleByProcess) {
    // Clean the stale lock
    await deleteLockFile(cwd);
    result.cleaned = true;
    result.cleanedPid = lockStatus.lock.pid;
    result.staleLock = lockStatus.lock;

    // Calculate lock age for detailed logging
    const acquiredAt = new Date(lockStatus.lock.acquiredAt);
    const now = new Date();
    const ageMinutes = Math.round((now.getTime() - acquiredAt.getTime()) / (1000 * 60));

    console.log(
      `[session/lock] Cleaned stale lock (PID: ${lockStatus.lock.pid}, age: ${ageMinutes} minutes, acquiredAt: ${lockStatus.lock.acquiredAt})`
    );
  } else if (isStaleByTimestamp) {
    const acquiredAt = new Date(lockStatus.lock.acquiredAt);
    const now = new Date();
    const ageMinutes = Math.round((now.getTime() - acquiredAt.getTime()) / (1000 * 60));
    console.log(
      `[session/lock] Lock age exceeded timeout (${ageMinutes} minutes) but process is still running (PID: ${lockStatus.lock.pid}); keeping lock.`
    );
  }

  return result;
}

/**
 * Start periodic stale lock checking.
 * Returns a cleanup function to stop the interval.
 *
 * @param cwd Working directory
 * @param timeoutMinutes Timeout in minutes after which a lock is considered stale
 * @param checkIntervalSeconds How often to check for stale locks (default: 60)
 * @returns Cleanup function to stop the periodic check
 */
export function startPeriodicStaleLockCheck(
  cwd: string,
  timeoutMinutes: number = DEFAULT_STALE_LOCK_TIMEOUT_MINUTES,
  checkIntervalSeconds: number = DEFAULT_STALE_LOCK_CHECK_INTERVAL_SECONDS
): () => void {
  const intervalId = setInterval(async () => {
    await checkAndCleanStaleLock(cwd, timeoutMinutes);
  }, checkIntervalSeconds * 1000);

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}

/**
 * Prompt user to clean stale lock
 */
async function promptCleanStaleLock(lock: LockFile): Promise<boolean> {
  console.log(formatStaleLockWarning(lock));

  const shouldClean = await promptBoolean(
    'Remove the stale lock and continue?',
    { default: true }
  );

  return shouldClean;
}

/**
 * Attempt to acquire the lock for starting a new session.
 *
 * This is the main entry point for lock management. It handles:
 * 1. Checking for existing locks
 * 2. Detecting stale locks and prompting for cleanup
 * 3. Blocking if another instance is running
 * 4. Creating a new lock file
 *
 * @param cwd - Working directory
 * @param sessionId - Session ID for the new lock
 * @param options - Configuration options
 * @returns Result indicating success or failure with details
 */
export async function acquireLockWithPrompt(
  cwd: string,
  sessionId: string,
  options: {
    /** Force acquisition even if locked (for --force flag) */
    force?: boolean;
    /** Skip interactive prompt for stale lock cleanup */
    nonInteractive?: boolean;
  } = {}
): Promise<LockAcquisitionResult> {
  const { force = false, nonInteractive = false } = options;
  let staleCleanupApproved = false;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const lockStatus = await checkLock(cwd);

    if (!lockStatus.lock) {
      const result = await tryWriteLockFileAtomic(cwd, sessionId);
      if (result.success) {
        return { acquired: true };
      }
      // Failed to acquire - another process got it, retry
      continue;
    }

    if (lockStatus.lock.pid === process.pid && lockStatus.lock.sessionId === sessionId) {
      return { acquired: true };
    }

    if (lockStatus.isLocked && !force) {
      const pid = lockStatus.lock.pid;
      return {
        acquired: false,
        error: `Ralph already running in this repo (PID: ${pid})`,
        existingPid: pid,
      };
    }

    if (lockStatus.isStale) {
      if (!staleCleanupApproved) {
        if (nonInteractive) {
          staleCleanupApproved = true;
        } else {
          const shouldClean = await promptCleanStaleLock(lockStatus.lock);
          if (!shouldClean) {
            return {
              acquired: false,
              error: 'Stale lock cleanup declined by user',
            };
          }
          staleCleanupApproved = true;
        }
      }

      const claimed = await claimLockFile(cwd, lockStatus.lock);
      if (!claimed) {
        continue;
      }
      if (nonInteractive) {
        console.log(`Warning: Removing stale lock (PID: ${lockStatus.lock.pid})`);
      }
      const result = await tryWriteLockFileAtomic(cwd, sessionId);
      if (result.success) {
        return { acquired: true };
      }
      // Failed - another process got it, retry
      continue;
    }

    if (force) {
      const claimed = await claimLockFile(cwd, lockStatus.lock);
      if (!claimed) {
        continue;
      }
      console.log(`Warning: Forcing lock acquisition (previous PID: ${lockStatus.lock.pid})`);
      const result = await tryWriteLockFileAtomic(cwd, sessionId);
      if (result.success) {
        return { acquired: true };
      }
      // Failed - another process got it, retry
      continue;
    }
  }

  const finalStatus = await checkLock(cwd);
  if (finalStatus.lock &&
      finalStatus.lock.pid === process.pid &&
      finalStatus.lock.sessionId === sessionId) {
    return { acquired: true };
  }

  if (finalStatus.lock && finalStatus.isLocked && finalStatus.lock.pid !== process.pid) {
    return {
      acquired: false,
      error: `Ralph already running in this repo (PID: ${finalStatus.lock.pid})`,
      existingPid: finalStatus.lock.pid,
    };
  }

  return {
    acquired: false,
    error: 'Failed to acquire lock due to concurrent changes',
  };
}

/**
 * Release the lock for the current session.
 * Should be called on clean exit, or during crash recovery.
 */
export async function releaseLock(cwd: string): Promise<void> {
  await deleteLockFile(cwd);
}

/**
 * Register cleanup handlers to ensure lock is released on exit.
 *
 * This should be called once after acquiring the lock. It registers
 * handlers for:
 * - Normal exit (process.on('exit'))
 * - SIGTERM (graceful shutdown)
 * - SIGINT (Ctrl+C) - handled separately by the run command
 * - Uncaught exceptions
 * - Unhandled promise rejections
 *
 * @param cwd - Working directory
 * @returns Cleanup function to remove the handlers
 */
export function registerLockCleanupHandlers(
  cwd: string,
  options: { staleLockTimeoutMinutes?: number } = {}
): () => void {
  const timeoutMinutes = options.staleLockTimeoutMinutes ?? DEFAULT_STALE_LOCK_TIMEOUT_MINUTES;
  const stopStaleLockCheck = startPeriodicStaleLockCheck(cwd, timeoutMinutes);
  // Synchronous cleanup for exit event
  const handleExit = (): void => {
    deleteLockFileSync(cwd);
  };

  // Async cleanup for signals
  const handleTermination = (): void => {
    try {
      deleteLockFileSync(cwd);
    } catch (err) {
      // Log but don't re-throw - we're shutting down anyway
      console.error('[session/lock] Error releasing lock during termination:', err);
    }
    // Don't call process.exit() here - let the calling code handle that
  };

  // Handle uncaught errors
  const handleUncaughtError = (_error: Error | unknown): void => {
    try {
      deleteLockFileSync(cwd);
    } catch (err) {
      // Log but don't re-throw - we're in an error state anyway
      console.error('[session/lock] Error releasing lock during error handling:', err);
    }
    // Don't exit here - let Node's default behavior happen
  };

  process.on('exit', handleExit);
  process.on('SIGTERM', handleTermination);
  process.on('uncaughtException', handleUncaughtError);
  process.on('unhandledRejection', handleUncaughtError);

  // Return cleanup function
  return () => {
    stopStaleLockCheck();
    process.off('exit', handleExit);
    process.off('SIGTERM', handleTermination);
    process.off('uncaughtException', handleUncaughtError);
    process.off('unhandledRejection', handleUncaughtError);
  };
}

// Re-export worktree cleanup for convenience
export { cleanupAllWorktrees, type CleanupResult } from '../worktree-cleanup/index.js';

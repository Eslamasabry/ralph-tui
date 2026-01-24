/**
 * ABOUTME: Snapshot backup system for worktree recovery.
 * Creates periodic snapshots of worktree metadata, handles rotation,
 * and provides restore functionality.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { WorktreeStatus } from '../engine/parallel/types.js';

/**
 * Backup configuration schema
 */
export interface BackupConfig {
	/** Whether periodic snapshots are enabled */
	enabled: boolean;
	/** How often to create snapshots in minutes (default: 5) */
	intervalMinutes: number;
	/** Maximum number of snapshots to keep (default: 10) */
	maxSnapshots: number;
	/** Directory for backup files (default: .ralph-tui/backups) */
	dir: string;
}

/**
 * Default backup configuration
 */
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
	enabled: true,
	intervalMinutes: 5,
	maxSnapshots: 10,
	dir: '.ralph-tui/backups',
};

/**
 * Lock metadata for snapshot
 */
export interface LockMetadata {
	/** Lock file path */
	lockPath: string;
	/** PID that holds the lock */
	pid: number;
	/** When the lock was acquired (ISO 8601) */
	acquiredAt: string;
	/** Reason/description for the lock */
	reason?: string;
	/** Whether the lock is stale */
	isStale: boolean;
}

/**
 * Worktree snapshot entry
 */
export interface WorktreeSnapshotEntry {
	/** Worktree path relative to repo root */
	relativePath: string;
	/** Full path to worktree */
	path: string;
	/** Branch name */
	branch: string;
	/** Commit hash */
	commit: string;
	/** Whether the worktree is locked */
	locked: boolean;
	/** Lock reason if locked */
	lockReason?: string;
	/** Worktree health status */
	status: 'active' | 'locked' | 'stale' | 'prunable';
}

/**
 * Complete snapshot metadata
 */
export interface SnapshotMetadata {
	/** Snapshot version */
	version: 1;
	/** When the snapshot was created (ISO 8601) */
	createdAt: string;
	/** Repository root path */
	repoRoot: string;
	/** Current git branch */
	branch: string;
	/** Current HEAD commit */
	commit: string;
	/** Worktree snapshots */
	worktrees: WorktreeSnapshotEntry[];
	/** Lock metadata */
	locks: LockMetadata[];
}

/**
 * Snapshot file header for identification
 */
const SNAPSHOT_HEADER = 'ralph-snapshot-v1';

/**
 * Result of a backup operation
 */
export interface BackupResult {
	/** Whether the operation succeeded */
	success: boolean;
	/** Path to the backup file if created */
	backupPath?: string;
	/** Error message if failed */
	error?: string;
}

/**
 * Result of a restore operation
 */
export interface RestoreResult {
	/** Whether the restore succeeded */
	success: boolean;
	/** Number of worktrees restored */
	worktreesRestored: number;
	/** Number of locks restored */
	locksRestored: number;
	/** Error message if failed */
	error?: string;
}

/**
 * List of available snapshots
 */
export interface SnapshotListItem {
	/** Path to snapshot file */
	path: string;
	/** Snapshot timestamp (ISO 8601) */
	timestamp: string;
	/** Number of worktrees in snapshot */
	worktreeCount: number;
	/** Number of locks in snapshot */
	lockCount: number;
}

/**
 * Execute a git command
 */
async function execGit(
	cwd: string,
	args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return new Promise((resolve) => {
		const proc = spawn('git', args, {
			cwd,
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

/**
 * Get the backup directory path
 */
function getBackupDirPath(cwd: string, config: BackupConfig): string {
	return join(cwd, config.dir);
}

/**
 * Generate snapshot filename with timestamp
 */
function generateSnapshotFilename(timestamp: Date): string {
	const iso = timestamp.toISOString().replace(/[:.]/g, '-');
	return `snapshot-${iso}.json`;
}

/**
 * Parse snapshot filename to extract timestamp
 */
function parseSnapshotFilename(filename: string): Date | null {
	const match = filename.match(/^snapshot-([\d-TZ]+)\.json$/);
	if (!match) return null;
	// The filename format is snapshot-YYYY-MM-DDTHH-MM-SS-mmmZ.json
	// Convert back to ISO: YYYY-MM-DDTHH:MM:SS.mmmZ
	const parts = match[1].split('T');
	if (parts.length !== 2) return null;
	
	// Date part is already in correct format: YYYY-MM-DD
	const datePart = parts[0];
	
	// Time part: HH-MM-SS-mmmZ → HH:MM:SS.mmmZ
	const timeMatch = parts[1].match(/^(\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/);
	if (!timeMatch) return null;
	
	const timePart = `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}.${timeMatch[4]}`;
	const dateStr = `${datePart}T${timePart}`;
	
	const date = new Date(dateStr);
	return isNaN(date.getTime()) ? null : date;
}

/**
 * Check if a file is a valid snapshot file
 */
async function isValidSnapshot(filePath: string): Promise<boolean> {
	try {
		const content = await readFile(filePath, 'utf-8');
		return content.startsWith(SNAPSHOT_HEADER);
	} catch {
		return false;
	}
}

/**
 * Ensure backup directory exists
 */
async function ensureBackupDir(cwd: string, config: BackupConfig): Promise<string> {
	const backupDir = getBackupDirPath(cwd, config);
	await mkdir(backupDir, { recursive: true });
	return backupDir;
}

/**
 * Create a snapshot of worktree metadata and lock state.
 *
 * @param cwd Working directory
 * @param worktrees Current worktree statuses
 * @param lockMetadatas Lock metadata for each worktree
 * @param config Backup configuration
 * @returns Result with path to created snapshot
 */
export async function createSnapshot(
	cwd: string,
	worktrees: WorktreeStatus[],
	lockMetadatas: LockMetadata[],
	config: BackupConfig = DEFAULT_BACKUP_CONFIG
): Promise<BackupResult> {
	if (!config.enabled) {
		return { success: true };
	}

	try {
		const backupDir = await ensureBackupDir(cwd, config);

		// Get current git state
		const branchResult = await execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
		const commitResult = await execGit(cwd, ['rev-parse', 'HEAD']);

		const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : 'unknown';
		const commit = commitResult.exitCode === 0 ? commitResult.stdout.trim() : 'unknown';

		// Build worktree entries
		const worktreeEntries: WorktreeSnapshotEntry[] = worktrees
			.filter((wt) => wt.relativePath !== '.' && wt.relativePath !== '')
			.map((wt) => ({
				relativePath: wt.relativePath,
				path: wt.path,
				branch: wt.branch,
				commit: wt.commit,
				locked: wt.locked,
				lockReason: wt.lockReason,
				status: wt.status,
			}));

		// Build snapshot metadata
		const metadata: SnapshotMetadata = {
			version: 1,
			createdAt: new Date().toISOString(),
			repoRoot: cwd,
			branch,
			commit,
			worktrees: worktreeEntries,
			locks: lockMetadatas,
		};

		// Write snapshot file with header for validation
		const timestamp = new Date();
		const filename = generateSnapshotFilename(timestamp);
		const backupPath = join(backupDir, filename);
		const content = `${SNAPSHOT_HEADER}\n${JSON.stringify(metadata, null, 2)}`;
		await writeFile(backupPath, content, 'utf-8');

		console.log(`[backup] Created snapshot: ${relative(cwd, backupPath)} (${worktreeEntries.length} worktrees, ${lockMetadatas.length} locks)`);

		// Perform rotation
		await rotateSnapshots(cwd, config);

		return { success: true, backupPath };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[backup] Failed to create snapshot: ${errorMessage}`);
		return { success: false, error: errorMessage };
	}
}

/**
 * Rotate old snapshots, keeping only the most recent N.
 */
export async function rotateSnapshots(
	cwd: string,
	config: BackupConfig = DEFAULT_BACKUP_CONFIG
): Promise<{ rotated: number }> {
	if (!config.enabled || config.maxSnapshots <= 0) {
		return { rotated: 0 };
	}

	try {
		const backupDir = getBackupDirPath(cwd, config);

		// List all snapshot files
		let files: string[];
		try {
			files = await readdir(backupDir);
		} catch {
			return { rotated: 0 };
		}

		// Filter and sort snapshots by date (newest first)
		const snapshots: { path: string; date: Date; filename: string }[] = [];
		for (const filename of files) {
			const filePath = join(backupDir, filename);
			if (await isValidSnapshot(filePath)) {
				const date = parseSnapshotFilename(filename);
				if (date) {
					snapshots.push({ path: filePath, date, filename });
				}
			}
		}

		snapshots.sort((a, b) => b.date.getTime() - a.date.getTime());

		// Delete excess snapshots
		const toDelete = snapshots.slice(config.maxSnapshots);
		let rotated = 0;

		for (const snapshot of toDelete) {
			try {
				await unlink(snapshot.path);
				rotated++;
			} catch {
				// Continue even if delete fails
			}
		}

		if (rotated > 0) {
			console.log(`[backup] Rotated ${rotated} old snapshot(s), keeping ${Math.min(snapshots.length, config.maxSnapshots)} of ${snapshots.length}`);
		}

		return { rotated };
	} catch (error) {
		console.error(`[backup] Failed to rotate snapshots: ${error}`);
		return { rotated: 0 };
	}
}

/**
 * List all available snapshots.
 */
export async function listSnapshots(
	cwd: string,
	config: BackupConfig = DEFAULT_BACKUP_CONFIG
): Promise<SnapshotListItem[]> {
	try {
		const backupDir = getBackupDirPath(cwd, config);
		const files = await readdir(backupDir);

		const snapshots: SnapshotListItem[] = [];
		for (const filename of files) {
			const filePath = join(backupDir, filename);
			if (!(await isValidSnapshot(filePath))) continue;

			const date = parseSnapshotFilename(filename);
			if (!date) continue;

			// Read snapshot to get counts
			const content = await readFile(filePath, 'utf-8');
			const jsonContent = content.replace(`${SNAPSHOT_HEADER}\n`, '');
			const metadata = JSON.parse(jsonContent) as SnapshotMetadata;

			snapshots.push({
				path: filePath,
				timestamp: metadata.createdAt,
				worktreeCount: metadata.worktrees.length,
				lockCount: metadata.locks.length,
			});
		}

		// Sort by timestamp (newest first)
		snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

		return snapshots;
	} catch {
		return [];
	}
}

/**
 * Load snapshot metadata from file.
 */
export async function loadSnapshot(
	snapshotPath: string
): Promise<SnapshotMetadata | null> {
	try {
		if (!(await isValidSnapshot(snapshotPath))) {
			return null;
		}

		const content = await readFile(snapshotPath, 'utf-8');
		const jsonContent = content.replace(`${SNAPSHOT_HEADER}\n`, '');
		const metadata = JSON.parse(jsonContent) as SnapshotMetadata;

		// Validate version
		if (metadata.version !== 1) {
			console.warn(`[backup] Unknown snapshot version: ${metadata.version}`);
			return null;
		}

		return metadata;
	} catch (error) {
		console.error(`[backup] Failed to load snapshot: ${error}`);
		return null;
	}
}

/**
 * Restore worktrees from a snapshot.
 * This creates the worktrees that exist in the snapshot but are missing locally.
 */
export async function restoreFromSnapshot(
	_cwd: string,
	snapshotPath: string,
	worktreeManager: {
		createWorktree: (options: { workerId: string; branchName: string; baseRef?: string; lockReason?: string }) => Promise<string>;
		lockWorktree: (path: string, reason?: string) => Promise<void>;
		listWorktrees: () => Promise<WorktreeStatus[]>;
	}
): Promise<RestoreResult> {
	const metadata = await loadSnapshot(snapshotPath);
	if (!metadata) {
		return { success: false, worktreesRestored: 0, locksRestored: 0, error: 'Invalid or missing snapshot' };
	}

	try {
		// Get current worktree state
		const currentWorktrees = await worktreeManager.listWorktrees();
		const currentPaths = new Set(currentWorktrees.map((wt) => wt.relativePath));

		let worktreesRestored = 0;
		let locksRestored = 0;

		// For each worktree in the snapshot, ensure it exists and is locked
		for (const snapshotWorktree of metadata.worktrees) {
			const workerId = snapshotWorktree.relativePath.replace(/[^a-zA-Z0-9-_]/g, '_');

			// Check if worktree already exists
			if (currentPaths.has(snapshotWorktree.relativePath)) {
				console.log(`[backup] Worktree already exists: ${snapshotWorktree.relativePath}`);
				continue;
			}

			// Create the worktree
			try {
				await worktreeManager.createWorktree({
					workerId,
					branchName: snapshotWorktree.branch,
					baseRef: snapshotWorktree.commit,
					lockReason: snapshotWorktree.lockReason || `Restored from snapshot ${metadata.createdAt}`,
				});
				worktreesRestored++;
				console.log(`[backup] Restored worktree: ${snapshotWorktree.relativePath} -> ${snapshotWorktree.branch}`);

				// Lock the worktree if it was locked
				if (snapshotWorktree.locked) {
					const worktreePath = snapshotWorktree.path;
					await worktreeManager.lockWorktree(worktreePath, snapshotWorktree.lockReason);
					locksRestored++;
					console.log(`[backup] Restored lock: ${snapshotWorktree.relativePath}`);
				}
			} catch (error) {
				console.error(`[backup] Failed to restore worktree ${snapshotWorktree.relativePath}: ${error}`);
			}
		}

		console.log(`[backup] Restore complete: ${worktreesRestored} worktrees, ${locksRestored} locks`);
		return { success: true, worktreesRestored, locksRestored };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[backup] Restore failed: ${errorMessage}`);
		return { success: false, worktreesRestored: 0, locksRestored: 0, error: errorMessage };
	}
}

/**
 * Delete a snapshot file.
 */
export async function deleteSnapshot(snapshotPath: string): Promise<boolean> {
	try {
		await unlink(snapshotPath);
		console.log(`[backup] Deleted snapshot: ${snapshotPath}`);
		return true;
	} catch (error) {
		console.error(`[backup] Failed to delete snapshot: ${error}`);
		return false;
	}
}

/**
 * Get the latest snapshot path, or null if none exist.
 */
export async function getLatestSnapshot(
	cwd: string,
	config: BackupConfig = DEFAULT_BACKUP_CONFIG
): Promise<string | null> {
	const snapshots = await listSnapshots(cwd, config);
	if (snapshots.length === 0) {
		return null;
	}
	return snapshots[0].path;
}

/**
 * Check if backup functionality is available (directory is writable).
 */
export async function isBackupAvailable(
	cwd: string,
	config: BackupConfig = DEFAULT_BACKUP_CONFIG
): Promise<boolean> {
	try {
		const backupDir = await ensureBackupDir(cwd, config);
		const testPath = join(backupDir, '.write-test');
		await writeFile(testPath, 'test', 'utf-8');
		await unlink(testPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Create a lock metadata snapshot from the session lock file.
 */
export async function captureLockMetadata(
	_cwd: string
): Promise<LockMetadata[]> {
	const lockMetadatas: LockMetadata[] = [];

	try {
		const { checkLock } = await import('../session/lock.js');
		const lockStatus = await checkLock(_cwd);

		if (lockStatus.lock) {
			const SESSION_DIR = '.ralph-tui';
			const LOCK_FILE = 'ralph.lock';
			const lockPath = join(_cwd, SESSION_DIR, LOCK_FILE);

			lockMetadatas.push({
				lockPath,
				pid: lockStatus.lock.pid,
				acquiredAt: lockStatus.lock.acquiredAt,
				isStale: lockStatus.isStale,
			});
		}
	} catch {
		// Lock file may not exist, which is fine
	}

	return lockMetadatas;
}

/**
 * ABOUTME: Worktree cleanup service for shutdown hooks and manual cleanup.
 * Provides idempotent cleanup of all worker/merge worktrees and main-sync worktree.
 */

import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { access, rm, readdir } from 'node:fs/promises';

export interface CleanupResult {
	/** Whether the cleanup succeeded */
	success: boolean;
	/** Any errors encountered */
	errors: string[];
	/** Items that were cleaned up */
	cleanedUp: string[];
}

export interface WorktreeCleanupOptions {
	/** Root of the git repository */
	repoRoot: string;
	/** Directory for worktrees (default: repoRoot/worktrees) */
	worktreesDir?: string;
	/** Name of the main-sync worktree (default: main-sync) */
	mainSyncName?: string;
}

/**
 * Get list of worker and merge worktree paths in the worktrees directory.
 * These follow patterns: worker-N, merge, merge-*, etc.
 */
async function getWorktreePaths(worktreesDir: string): Promise<string[]> {
	const worktrees: string[] = [];

	try {
		const entries = await readdir(worktreesDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const name = entry.name;
				if (
					name.startsWith('worker-') ||
					name === 'merge' ||
					name.startsWith('merge-')
				) {
					worktrees.push(join(worktreesDir, name));
				}
			}
		}
	} catch {
		// Directory doesn't exist or can't be read - return empty list
	}

	return worktrees;
}

/**
 * Execute a git command and return the result.
 */
async function execGit(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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
 * Execute a git command, ignoring failures (for idempotent operations).
 */
async function execGitAllowFailure(cwd: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	return execGit(cwd, args);
}

/**
 * Remove a single worktree by path.
 * Idempotent: safe to call even if worktree doesn't exist.
 */
async function removeWorktreeByPath(repoRoot: string, worktreePath: string): Promise<string | null> {
	const errors: string[] = [];

	// Try to unlock first (ignore failures)
	await execGitAllowFailure(repoRoot, ['worktree', 'unlock', worktreePath]);

	// Try to remove via git (ignore failures)
	const removeResult = await execGitAllowFailure(repoRoot, ['worktree', 'remove', '--force', worktreePath]);
	if (removeResult.exitCode !== 0) {
		const stderr = removeResult.stderr.toLowerCase();
		if (!stderr.includes('not a working tree')) {
			errors.push(`Git worktree remove failed: ${removeResult.stderr}`);
		}
	}

	// Delete the directory if it exists
	try {
		await access(worktreePath);
		await rm(worktreePath, { recursive: true, force: true });
	} catch {
		// Ignore if already deleted
	}

	if (errors.length > 0) {
		return errors.join('; ');
	}

	return null;
}

/**
 * Clean up all worker, merge, and main-sync worktrees.
 * This is idempotent and safe to call multiple times.
 *
 * @param options - Cleanup options including repo root and worktree directory
 * @returns CleanupResult with success status, errors, and cleaned up items
 */
export async function cleanupAllWorktrees(options: WorktreeCleanupOptions): Promise<CleanupResult> {
	const { repoRoot, worktreesDir = join(repoRoot, 'worktrees'), mainSyncName = 'main-sync' } = options;
	const errors: string[] = [];
	const cleanedUp: string[] = [];

	// 1. Clean up main-sync worktree
	const mainSyncPath = join(worktreesDir, mainSyncName);
	try {
		const error = await removeWorktreeByPath(repoRoot, mainSyncPath);
		if (error) {
			errors.push(`main-sync: ${error}`);
		} else {
			cleanedUp.push(mainSyncPath);
		}
	} catch (err) {
		errors.push(`main-sync: ${err instanceof Error ? err.message : 'unknown error'}`);
	}

	// 2. Get and clean up all worker/merge worktrees
	let worktrees: string[];
	try {
		worktrees = await getWorktreePaths(worktreesDir);
	} catch {
		worktrees = [];
	}

	for (const worktreePath of worktrees) {
		try {
			const error = await removeWorktreeByPath(repoRoot, worktreePath);
			if (error) {
				errors.push(`${worktreePath}: ${error}`);
			} else {
				cleanedUp.push(worktreePath);
			}
		} catch (err) {
			errors.push(`${worktreePath}: ${err instanceof Error ? err.message : 'unknown error'}`);
		}
	}

	// 3. Prune any stale worktree references
	try {
		await execGitAllowFailure(repoRoot, ['worktree', 'prune']);
	} catch (_err) {
		// Prune failure is non-critical
		void _err;
	}

	const success = errors.length === 0;

	return {
		success,
		errors,
		cleanedUp,
	};
}

/**
 * Get the status of worktrees (for display purposes).
 */
export interface WorktreeStatus {
	mainSync: {
		exists: boolean;
		path: string;
	};
	workers: Array<{
		name: string;
		exists: boolean;
		path: string;
	}>;
	totalWorkers: number;
}

export async function getWorktreeStatus(options: WorktreeCleanupOptions): Promise<WorktreeStatus> {
	const { repoRoot, worktreesDir = join(repoRoot, 'worktrees'), mainSyncName = 'main-sync' } = options;
	const workers: Array<{ name: string; exists: boolean; path: string }> = [];

	// Check main-sync worktree
	const mainSyncPath = join(worktreesDir, mainSyncName);
	let mainSyncExists = false;
	try {
		await access(mainSyncPath);
		mainSyncExists = true;
	} catch {
		mainSyncExists = false;
	}

	// Get worker/merge worktrees
	let worktreePaths: string[];
	try {
		worktreePaths = await getWorktreePaths(worktreesDir);
	} catch {
		worktreePaths = [];
	}

	for (const path of worktreePaths) {
		const name = path.split('/').pop() ?? path;
		let exists = false;
		try {
			await access(path);
			exists = true;
		} catch {
			exists = false;
		}
		workers.push({ name, exists, path });
	}

	return {
		mainSync: {
			exists: mainSyncExists,
			path: mainSyncPath,
		},
		workers,
		totalWorkers: workers.length,
	};
}

/**
 * Format cleanup result for display.
 */
export function formatCleanupResult(result: CleanupResult): string {
	const lines: string[] = [];

	if (result.cleanedUp.length === 0 && result.errors.length === 0) {
		lines.push('No worktrees to clean up.');
		return lines.join('\n');
	}

	if (result.cleanedUp.length > 0) {
		lines.push('Cleaned up:');
		for (const path of result.cleanedUp) {
			const name = path.split('/').pop() ?? path;
			lines.push(`  ✓ ${name}`);
		}
	}

	if (result.errors.length > 0) {
		lines.push('');
		lines.push('Errors:');
		for (const error of result.errors) {
			lines.push(`  ✗ ${error}`);
		}
	}

	lines.push('');
	lines.push(`Status: ${result.success ? 'Success' : 'Completed with errors'}`);

	return lines.join('\n');
}

/**
 * Format worktree status for display.
 */
export function formatWorktreeStatus(status: WorktreeStatus): string {
	const lines: string[] = [];

	lines.push('');
	lines.push('Worktree Status:');
	lines.push('');

	// Main-sync
	lines.push('  main-sync:');
	lines.push(`    Path: ${status.mainSync.path}`);
	lines.push(`    Exists: ${status.mainSync.exists ? 'Yes' : 'No'}`);
	lines.push('');

	// Workers
	lines.push(`  Workers (${status.totalWorkers}):`);
	if (status.workers.length === 0) {
		lines.push('    (none)');
	} else {
		for (const worker of status.workers) {
			lines.push(`    ${worker.exists ? '✓' : '○'} ${worker.name}`);
		}
	}

	return lines.join('\n');
}

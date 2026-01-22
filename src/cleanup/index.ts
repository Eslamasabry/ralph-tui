/**
 * ABOUTME: Cleanup service for post-run cleanup actions.
 * Handles sync, prune, delete branches, and push operations.
 */

import { spawn } from 'node:child_process';

/**
 * Result of a cleanup action
 */
export interface CleanupActionResult {
	/** Whether the action succeeded */
	success: boolean;
	/** Error message if the action failed */
	error?: string;
}

/**
 * Execute a git command and return the result
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
 * Get the current HEAD commit hash
 */
async function getHeadCommit(cwd: string): Promise<string | null> {
	const result = await execGit(cwd, ['rev-parse', 'HEAD']);
	if (result.exitCode !== 0) {
		return null;
	}
	return result.stdout.trim();
}

/**
 * Sync main branch by fast-forwarding to the current HEAD.
 * This assumes the main sync worktree is already set up.
 */
export async function syncMain(cwd: string, mainSyncWorktreePath?: string): Promise<CleanupActionResult> {
	// If no main sync worktree path provided, try to use the main repo directly
	const worktreePath = mainSyncWorktreePath ?? cwd;

	try {
		// Get current HEAD from main repo
		const headCommit = await getHeadCommit(cwd);
		if (!headCommit) {
			return { success: false, error: 'Failed to resolve HEAD commit in main repository' };
		}

		// Try to fast-forward the worktree to HEAD
		const result = await execGit(worktreePath, ['fetch', '--prune']);
		if (result.exitCode !== 0) {
			return { success: false, error: `Fetch failed: ${result.stderr}` };
		}

		// Attempt to reset to the integration commit
		const resetResult = await execGit(worktreePath, ['reset', '--hard', headCommit]);
		if (resetResult.exitCode !== 0) {
			// If reset fails, try fast-forward only
			const ffResult = await execGit(worktreePath, ['merge', '--ff-only', headCommit]);
			if (ffResult.exitCode !== 0) {
				return { success: false, error: `Sync failed: ${resetResult.stderr || ffResult.stderr}` };
			}
		}

		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error during sync' };
	}
}

/**
 * Prune stale worktrees
 */
export async function pruneWorktrees(cwd: string): Promise<CleanupActionResult> {
	try {
		const result = await execGit(cwd, ['worktree', 'prune']);
		if (result.exitCode !== 0) {
			return { success: false, error: `Prune failed: ${result.stderr}` };
		}
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error during prune' };
	}
}

/**
 * Get list of merged branches (excluding main and current branch)
 */
async function getMergedBranches(cwd: string, currentBranch: string): Promise<string[]> {
	try {
		// Get all merged branches
		const result = await execGit(cwd, ['branch', '--merged', 'main']);
		if (result.exitCode !== 0) {
			return [];
		}

		const branches = result.stdout
			.split('\n')
			.map((b) => b.trim())
			.filter((b) => b.length > 0 && !b.startsWith('* ') && b !== 'main' && b !== currentBranch);

		return branches;
	} catch {
		return [];
	}
}

/**
 * Delete merged branches
 */
export async function deleteBranches(cwd: string, options: { dryRun?: boolean } = {}): Promise<CleanupActionResult & { branchesDeleted: string[]; branchesFound: number }> {
	try {
		// Get current branch
		const headResult = await execGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
		const currentBranch = headResult.exitCode === 0 ? headResult.stdout.trim() : 'main';

		// Get list of merged branches
		const branches = await getMergedBranches(cwd, currentBranch);

		if (branches.length === 0) {
			return { success: true, branchesDeleted: [], branchesFound: 0 };
		}

		const deletedBranches: string[] = [];

		if (!options.dryRun) {
			for (const branch of branches) {
				try {
					const result = await execGit(cwd, ['branch', '-d', branch]);
					if (result.exitCode === 0) {
						deletedBranches.push(branch);
					}
				} catch {
					// Skip if deletion fails
				}
			}
		}

		return {
			success: true,
			branchesDeleted: options.dryRun ? branches : deletedBranches,
			branchesFound: branches.length,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error during branch deletion',
			branchesDeleted: [],
			branchesFound: 0,
		};
	}
}

/**
 * Push changes to remote
 */
export async function push(cwd: string, options: { remote?: string; branch?: string } = {}): Promise<CleanupActionResult> {
	try {
		const remote = options.remote ?? 'origin';
		const branch = options.branch ?? 'main';

		// First try to push the branch
		const result = await execGit(cwd, ['push', remote, branch]);
		if (result.exitCode !== 0) {
			// Check if it's a non-fast-forward error
			if (result.stderr.includes('non-fast-forward') || result.stderr.includes('Updates were rejected')) {
				return { success: false, error: 'Push rejected - may need to pull first or use --force-with-lease' };
			}
			return { success: false, error: `Push failed: ${result.stderr}` };
		}

		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : 'Unknown error during push' };
	}
}

/**
 * Cleanup options
 */
export interface CleanupOptions {
	/** Path to main sync worktree (if different from cwd) */
	mainSyncWorktreePath?: string;
	/** Remote to push to */
	remote?: string;
	/** Branch to push */
	branch?: string;
	/** Dry run mode (no actual changes) */
	dryRun?: boolean;
}

/**
 * Result of running all cleanup actions
 */
export interface CleanupResult {
	/** Overall success status */
	success: boolean;
	/** Results for each action */
	actions: {
		syncMain: CleanupActionResult;
		pruneWorktrees: CleanupActionResult;
		deleteBranches: CleanupActionResult & { branchesDeleted: string[]; branchesFound: number };
		push: CleanupActionResult;
	};
	/** Any errors encountered */
	errors: string[];
}

/**
 * Run all cleanup actions in order (sync -> prune -> delete -> push)
 */
export async function runCleanup(cwd: string, options: CleanupOptions = {}): Promise<CleanupResult> {
	const errors: string[] = [];

	// 1. Sync Main
	const syncResult = await syncMain(cwd, options.mainSyncWorktreePath);
	if (!syncResult.success && syncResult.error) {
		errors.push(`Sync Main: ${syncResult.error}`);
	}

	// 2. Prune Worktrees
	const pruneResult = await pruneWorktrees(cwd);
	if (!pruneResult.success && pruneResult.error) {
		errors.push(`Prune Worktrees: ${pruneResult.error}`);
	}

	// 3. Delete Branches
	const deleteResult = await deleteBranches(cwd, { dryRun: options.dryRun ?? false });
	if (!deleteResult.success && deleteResult.error) {
		errors.push(`Delete Branches: ${deleteResult.error}`);
	}

	// 4. Push (only if sync was successful)
	const pushResult: CleanupActionResult = syncResult.success
		? await push(cwd, { remote: options.remote, branch: options.branch })
		: { success: false, error: 'Skipped due to sync failure' };
	if (!pushResult.success && pushResult.error) {
		errors.push(`Push: ${pushResult.error}`);
	}

	const overallSuccess = errors.length === 0;

	return {
		success: overallSuccess,
		actions: {
			syncMain: syncResult,
			pruneWorktrees: pruneResult,
			deleteBranches: deleteResult,
			push: pushResult,
		},
		errors,
	};
}

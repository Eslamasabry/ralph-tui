/**
 * ABOUTME: Cleanup command for ralph-tui.
 * Manually cleans up worktrees created by the parallel execution engine.
 * Provides status display and idempotent cleanup.
 */

import { spawn } from 'node:child_process';
import {
	cleanupAllWorktrees,
	getWorktreeStatus,
	formatCleanupResult,
	formatWorktreeStatus,
} from '../worktree-cleanup/index.js';

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
 * Cleanup command options
 */
export interface CleanupOptions {
	/** Working directory (default: current directory) */
	cwd?: string;
	/** Show status only, don't clean up */
	status?: boolean;
	/** Force cleanup even if directory is not a git repo */
	force?: boolean;
}

/**
 * Execute the cleanup command
 */
export async function executeCleanupCommand(args: string[]): Promise<void> {
	// Parse arguments
	let cwd = process.cwd();
	let showStatus = false;
	let force = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--cwd' && args[i + 1]) {
			cwd = args[i + 1];
			i++; // Skip next arg
		} else if (arg === '--status' || arg === '-s') {
			showStatus = true;
		} else if (arg === '--force' || arg === '-f') {
			force = true;
		} else if (arg === '--help' || arg === '-h') {
			printCleanupHelp();
			return;
		} else {
			console.error(`Unknown option: ${arg}`);
			printCleanupHelp();
			process.exit(1);
		}
	}

	// Check if directory is a git repo (unless force is set)
	if (!force) {
		const gitResult = await execGit(cwd, ['rev-parse', '--git-dir']);
		if (gitResult.exitCode !== 0) {
			console.error(`Error: ${cwd} is not a git repository.`);
			console.error('Use --force to cleanup anyway, or run from within a git repository.');
			process.exit(1);
		}
	}

	// Show status or perform cleanup
	if (showStatus) {
		const status = await getWorktreeStatus({ repoRoot: cwd });
		console.log(formatWorktreeStatus(status));
		return;
	}

	console.log('Cleaning up worktrees...');
	console.log('');

	const result = await cleanupAllWorktrees({ repoRoot: cwd });
	console.log(formatCleanupResult(result));

	// Exit with appropriate code
	if (result.success) {
		process.exit(0);
	} else {
		process.exit(1);
	}
}

/**
 * Print cleanup command help
 */
export function printCleanupHelp(): void {
	console.log(`
ralph-tui cleanup - Clean up worktrees created by parallel execution

Usage: ralph-tui cleanup [options]

Options:
  --cwd <path>      Working directory (default: current directory)
  --status, -s      Show worktree status only, don't clean up
  --force, -f       Force cleanup even if not a git repository
  -h, --help        Show this help message

Description:
  Cleans up all worktrees created by Ralph's parallel execution engine:
  - main-sync worktree
  - worker worktrees (worker-1, worker-2, etc.)
  - merge worktrees

  This command is idempotent - safe to run multiple times. It will
  gracefully handle worktrees that don't exist.

  Worktrees are stored in the 'worktrees' directory alongside your
  main repository.

Examples:
  ralph-tui cleanup                     # Clean up all worktrees
  ralph-tui cleanup --status            # Show worktree status
  ralph-tui cleanup --cwd /path/to/repo # Clean up in specific directory

Note:
  This command does NOT affect:
  - Your main branch or working tree
  - Any other git worktrees you may have created manually
  - The .ralph-tui session directory
`);
}

/**
 * ABOUTME: Run summary logging for audit trail.
 * Writes summary of each run to .ralph-tui/logs and logs/ directories.
 * Includes failures, pending-main tasks, and cleanup results.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { EngineState } from '../engine/types.js';
import type { TrackerPlugin, TrackerTask } from '../plugins/trackers/types.js';

/**
 * Summary of a single task outcome
 */
export interface TaskSummary {
	taskId: string;
	title: string;
	status: 'completed' | 'failed' | 'skipped' | 'blocked' | 'pending-main';
	error?: string;
	durationMs: number;
}

/**
 * Run summary data structure
 */
export interface RunSummary {
	/** Session identifier */
	sessionId?: string;
	/** Total tasks */
	totalTasks: number;
	/** Tasks completed */
	completed: number;
	/** Tasks failed */
	failed: number;
	/** Tasks skipped */
	skipped: number;
	/** Tasks pending main sync */
	pendingMain: number;
	/** Total iterations */
	totalIterations: number;
	/** Elapsed time in milliseconds */
	elapsedMs: number;
	/** Reason for stopping */
	stopReason: string;
	/** Task summaries */
	tasks: TaskSummary[];
	/** Whether a snapshot tag exists */
	snapshotTag?: string;
}

/**
 * Format a duration in milliseconds to human readable string
 */
function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${seconds}s`;
}

/**
 * Format a date to ISO string for logging
 */
function formatDate(date: Date): string {
	return date.toISOString();
}

/**
 * Generate a human-readable run summary report
 */
export function formatRunSummaryReport(summary: RunSummary, options: {
	verbose?: boolean;
	includeHeader?: boolean;
} = {}): string {
	const lines: string[] = [];

	if (options.includeHeader !== false) {
		lines.push('═══════════════════════════════════════════════════════════════');
		lines.push('                        RUN SUMMARY                             ');
		lines.push('═══════════════════════════════════════════════════════════════');
		lines.push('');
	}

	// Session info
	if (summary.sessionId) {
		lines.push(`Session: ${summary.sessionId.slice(0, 8)}...`);
	}

	// Timing
	const startedAt = new Date(Date.now() - summary.elapsedMs);
	lines.push(`Started:  ${formatDate(startedAt)}`);
	lines.push(`Duration: ${formatDuration(summary.elapsedMs)}`);
	lines.push(`Stopped:  ${summary.stopReason}`);
	lines.push('');

	// Task summary
	lines.push('─────────────────────────────────────────────────────────────────');
	lines.push('                         TASK SUMMARY                            ');
	lines.push('─────────────────────────────────────────────────────────────────');
	lines.push('');
	lines.push(`Total Tasks:      ${summary.totalTasks}`);
	lines.push(`Completed:        ${summary.completed}`);
	lines.push(`Failed:           ${summary.failed}`);
	lines.push(`Skipped:          ${summary.skipped}`);
	lines.push(`Pending-Main:     ${summary.pendingMain}`);
	lines.push(`Total Iterations: ${summary.totalIterations}`);
	lines.push('');

	// Snapshot info
	if (summary.snapshotTag) {
		lines.push(`Snapshot: ${summary.snapshotTag}`);
		lines.push('');
	}

	// Failures section
	const failures = summary.tasks.filter((t) => t.status === 'failed');
	if (failures.length > 0) {
		lines.push('─────────────────────────────────────────────────────────────────');
		lines.push('                          FAILURES                              ');
		lines.push('─────────────────────────────────────────────────────────────────');
		lines.push('');

		for (const task of failures) {
			const errorInfo = task.error ? `: ${task.error}` : '';
			lines.push(`• ${task.taskId}: ${task.title}${errorInfo}`);
		}
		lines.push('');
	}

	// Pending-main section
	const pendingMain = summary.tasks.filter((t) => t.status === 'pending-main');
	if (pendingMain.length > 0) {
		lines.push('─────────────────────────────────────────────────────────────────');
		lines.push('                       PENDING-MAIN                             ');
		lines.push('─────────────────────────────────────────────────────────────────');
		lines.push('');

		for (const task of pendingMain) {
			lines.push(`• ${task.taskId}: ${task.title}`);
		}
		lines.push('');
	}

	// Skipped section
	const skipped = summary.tasks.filter((t) => t.status === 'skipped');
	if (skipped.length > 0 && options.verbose) {
		lines.push('─────────────────────────────────────────────────────────────────');
		lines.push('                          SKIPPED                               ');
		lines.push('─────────────────────────────────────────────────────────────────');
		lines.push('');

		for (const task of skipped) {
			const errorInfo = task.error ? `: ${task.error}` : '';
			lines.push(`• ${task.taskId}: ${task.title}${errorInfo}`);
		}
		lines.push('');
	}

	if (options.includeHeader !== false) {
		lines.push('═══════════════════════════════════════════════════════════════');
	}

	return lines.join('\n');
}

/**
 * Build a run summary from engine state
 */
export async function buildRunSummary(
	engineState: EngineState,
	options: {
		sessionId?: string;
		stopReason: string;
		elapsedMs: number;
		snapshotTag?: string;
		pendingMainTaskIds?: string[];
		tracker?: TrackerPlugin | null;
	}
): Promise<RunSummary> {
	const summary: RunSummary = {
		sessionId: options.sessionId,
		totalTasks: engineState.totalTasks,
		completed: engineState.tasksCompleted,
		failed: 0,
		skipped: 0,
		pendingMain: options.pendingMainTaskIds?.length ?? 0,
		totalIterations: engineState.currentIteration,
		elapsedMs: options.elapsedMs,
		stopReason: options.stopReason,
		tasks: [],
		snapshotTag: options.snapshotTag,
	};

	// Process each iteration result
	for (const iteration of engineState.iterations) {
		const taskSummary: TaskSummary = {
			taskId: iteration.task.id,
			title: iteration.task.title,
			status: 'completed',
			durationMs: iteration.durationMs,
		};

		// Check if this task is pending-main
		if (options.pendingMainTaskIds?.includes(iteration.task.id)) {
			taskSummary.status = 'pending-main';
			continue; // Don't count as failed or completed
		}

		if (!iteration.taskCompleted || iteration.status === 'failed') {
			if (iteration.status === 'failed' || iteration.error) {
				taskSummary.status = 'failed';
				taskSummary.error = iteration.error;
				summary.failed++;
			} else if (iteration.status === 'skipped') {
				taskSummary.status = 'skipped';
				taskSummary.error = iteration.error;
				summary.skipped++;
			}
		}

		summary.tasks.push(taskSummary);
	}

	// Add pending-main tasks to the summary
	if (options.pendingMainTaskIds && options.tracker) {
		for (const taskId of options.pendingMainTaskIds) {
			// Check if already added
			if (summary.tasks.some((t) => t.taskId === taskId)) {
				continue;
			}

			// Try to get task details from tracker
			const task = await options.tracker.getTask(taskId);
			if (task) {
				summary.tasks.push({
					taskId: task.id,
					title: task.title,
					status: 'pending-main',
					durationMs: 0,
				});
			}
		}
	}

	return summary;
}

/**
 * Write run summary to log files
 */
export async function logRunSummary(
	cwd: string,
	summary: RunSummary,
	options: {
		verbose?: boolean;
	} = {}
): Promise<void> {
	const report = formatRunSummaryReport(summary, {
		verbose: options.verbose,
		includeHeader: true,
	});

	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp}] Run completed: ${summary.completed}/${summary.totalTasks} tasks, ${summary.failed} failures, ${summary.pendingMain} pending-main\n`;

	const logTargets = [
		join(cwd, '.ralph-tui', 'logs', 'run-summary.log'),
		join(cwd, 'logs', 'run-summary.log'),
	];

	for (const logPath of logTargets) {
		try {
			await mkdir(dirname(logPath), { recursive: true });
			await appendFile(logPath, logEntry);
			await appendFile(logPath, report);
			await appendFile(logPath, '\n');
		} catch {
			// Ignore logging failures
		}
	}
}

/**
 * Create a task summary entry for pending-main status
 */
export function createPendingMainTaskSummary(task: TrackerTask, durationMs: number): TaskSummary {
	return {
		taskId: task.id,
		title: task.title,
		status: 'pending-main',
		durationMs,
	};
}

/**
 * ABOUTME: Run Summary Overlay component for displaying execution outcomes.
 * Shows totals, failures, pending-main tasks, merge stats, and cleanup actions when run completes/fails.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors, statusIndicators, formatElapsedTime } from '../theme.js';
import type { RalphStatus } from '../theme.js';
import type { CleanupConfig } from '../../config/types.js';

/**
 * Failure information for the summary display
 */
export interface FailureInfo {
	/** Task ID */
	taskId: string;
	/** Task title */
	taskTitle: string;
	/** Commit hash (for merge failures) */
	commitHash?: string;
	/** Reason for failure */
	reason: string;
	/** Conflict files (for merge failures) */
	conflictFiles?: string[];
	/** Phase when failure occurred: 'merge' | 'sync' | 'recovery' | 'execution' | 'validation' */
	phase: 'merge' | 'sync' | 'recovery' | 'execution' | 'validation';
	/** Iteration number when failure occurred */
	iteration?: number;
}

/**
 * Pending-main task information for the summary display
 */
export interface PendingMainInfo {
	/** Task ID */
	taskId: string;
	/** Task title */
	taskTitle: string;
	/** Number of pending commits */
	commitCount: number;
}

/**
 * Merge statistics for the summary display
 */
export interface MergeStatsSummary {
	worktrees: number;
	queued: number;
	merged: number;
	resolved: number;
	failed: number;
	syncPending: number;
}

/**
 * Main sync status for the summary display
 */
export interface MainSyncStatus {
	/** Whether main sync has a failure */
	hasFailure: boolean;
	/** Failure reason if any */
	failureReason?: string;
}

/**
 * Cleanup action status
 */
export type CleanupActionStatus = 'idle' | 'running' | 'success' | 'error';

/**
 * Cleanup action result for UI display
 */
export interface CleanupActionUiResult {
	/** Current status of the action */
	status: CleanupActionStatus;
	/** Error message if failed */
	error?: string;
	/** Details about what happened (e.g., "5 branches deleted") */
	details?: string;
}

/**
 * Cleanup action for the summary display
 */
interface CleanupAction {
	key: string;
	label: string;
	actionId: string;
}

/**
 * Props for the RunSummaryOverlay component
 */
export interface RunSummaryOverlayProps {
	/** Whether the overlay is visible */
	visible: boolean;

	/** Run completion status: 'complete' | 'error' */
	status: RalphStatus;

	/** Elapsed time in seconds */
	elapsedTime: number;

	/** Epic/project name */
	epicName?: string;

	/** Total number of tasks */
	totalTasks: number;

	/** Number of completed tasks */
	completedTasks: number;

	/** Number of failed tasks */
	failedTasks: number;

	/** Number of blocked/pending-main tasks */
	pendingMainTasks: number;

	/** Merge statistics */
	mergeStats: MergeStatsSummary;

	/** Main sync status */
	mainSyncStatus: MainSyncStatus;

	/** Snapshot tag (if created) */
	snapshotTag?: string;

	/** List of failures */
	failures: FailureInfo[];

	/** List of pending-main tasks */
	pendingMainTasksList: PendingMainInfo[];

	/** Cleanup configuration (for determining which actions are available) */
	cleanupConfig?: CleanupConfig;

	/** Cleanup action results (for displaying status) */
	cleanupActionResults?: Partial<Record<string, CleanupActionUiResult>>;

	/** Callback when user triggers a cleanup action */
	onCleanupAction?: (actionId: string) => void;

	/** Callback when user selects the restore snapshot action */
	onRestoreSnapshot?: () => Promise<void>;

	/** Callback when user closes the summary */
	onClose: () => void;
}

/**
 * Format the run status for display
 */
function getStatusDisplay(status: RalphStatus): { label: string; color: string; indicator: string } {
  switch (status) {
    case 'complete':
      return { label: 'Completed', color: colors.status.success, indicator: statusIndicators.complete };
    case 'error':
      return { label: 'Failed', color: colors.status.error, indicator: statusIndicators.error };
    default:
      return { label: status, color: colors.fg.muted, indicator: statusIndicators.stopped };
  }
}

/**
 * Run Summary Overlay - displays execution outcomes on completion or failure.
 * Shows totals, failures, pending-main tasks, and merge statistics.
 */
export function RunSummaryOverlay({
	visible,
	status,
	elapsedTime,
	epicName,
	totalTasks,
	completedTasks,
	failedTasks,
	pendingMainTasks,
	mergeStats,
	mainSyncStatus,
	snapshotTag,
	failures,
	pendingMainTasksList,
	cleanupConfig,
	cleanupActionResults = {},
	onCleanupAction,
	onRestoreSnapshot,
	onClose,
}: RunSummaryOverlayProps): ReactNode {
	const [selectedAction, setSelectedAction] = useState(0);
	const [isRestoring, setIsRestoring] = useState(false);
	const statusDisplay = getStatusDisplay(status);

	// Calculate actions based on cleanup config
	const actions = useMemo(() => {
		const allActions: Array<CleanupAction & { alwaysVisible?: boolean }> = [
			{ key: '1', label: 'Sync Main', actionId: 'syncMain' },
			{ key: '2', label: 'Prune Worktrees', actionId: 'pruneWorktrees' },
			{ key: '3', label: 'Delete Branches', actionId: 'deleteBranches' },
			{ key: '4', label: 'Push', actionId: 'push' },
			{ key: '5', label: 'Restore Snapshot', actionId: 'restoreSnapshot', alwaysVisible: true },
		];

		return allActions.filter((action) => {
			// Always show actions marked as alwaysVisible
			if (action.alwaysVisible) {
				return action.label === 'Restore Snapshot' ? !!snapshotTag : true;
			}
			// Filter based on cleanup config
			const config = cleanupConfig?.[action.actionId as keyof CleanupConfig];
			// Check if it's an object with enabled property (CleanupActionConfig)
			if (config && typeof config === 'object' && 'enabled' in config) {
				return (config as { enabled?: boolean }).enabled !== false;
			}
			// Default to enabled if not specified
			return true;
		});
	}, [cleanupConfig, snapshotTag]);

	// Handle keyboard navigation
	const handleKeyboard = useCallback(
		(key: { name: string; sequence?: string }) => {
			if (!visible) return;

			switch (key.name) {
				case 'escape':
					onClose();
					break;

				case 'left':
				case 'h':
					setSelectedAction((prev) => Math.max(0, prev - 1));
					break;

				case 'right':
				case 'l':
					setSelectedAction((prev) => Math.min(actions.length - 1, prev + 1));
					break;

				case 'return':
				case 'enter':
					// Trigger the selected cleanup action or restore snapshot
					if (!actions[selectedAction]) break;
					
					// Handle restore snapshot action specially
					if (actions[selectedAction].label === 'Restore Snapshot' && onRestoreSnapshot) {
						setIsRestoring(true);
						void onRestoreSnapshot().finally(() => {
							setIsRestoring(false);
						});
					} else if (onCleanupAction) {
						onCleanupAction(actions[selectedAction].actionId);
					}
					break;
			}
		},
		[visible, onClose, actions, selectedAction, onCleanupAction]
	);

	useKeyboard(handleKeyboard);

  // Reset selection when overlay becomes visible and when actions change
  useEffect(() => {
    if (visible) {
      setSelectedAction(0);
    }
  }, [visible, actions.length]);

  if (!visible) {
    return null;
  }

  const hasFailures = failures.length > 0;
  const hasPendingMain = pendingMainTasksList.length > 0;
  const hasMainSyncFailure = mainSyncStatus.hasFailure;

	// Calculate content height based on what we're showing
	const headerHeight = 1;
	const statsHeight = 2;
	const syncStatusHeight = hasMainSyncFailure ? 1 : 0;
	const snapshotHeight = snapshotTag ? 1 : 0;
	const failuresHeight = hasFailures ? Math.min(failures.length + 2, 6) : 0;
	const pendingHeight = hasPendingMain ? Math.min(pendingMainTasksList.length + 2, 4) : 0;
	const actionsHeight = actions.length > 0 ? 3 : 0; // Increased to show status
	const footerHeight = 1;
	const totalHeight =
		headerHeight + statsHeight + syncStatusHeight + snapshotHeight + failuresHeight + pendingHeight + actionsHeight + footerHeight;

	return (
		<box
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				justifyContent: 'center',
				alignItems: 'center',
				backgroundColor: '#00000080',
			}}
		>
			<box
				style={{
					width: 75,
					height: totalHeight,
					maxHeight: 28,
					backgroundColor: colors.bg.secondary,
					border: true,
					borderColor: statusDisplay.color,
					flexDirection: 'column',
				}}
			>
				{/* Header */}
				<box
					style={{
						width: '100%',
						height: headerHeight,
						flexDirection: 'row',
						justifyContent: 'space-between',
						alignItems: 'center',
						backgroundColor: colors.bg.tertiary,
						paddingLeft: 1,
						paddingRight: 1,
					}}
				>
					<text fg={statusDisplay.color}>Run Summary ({statusDisplay.label})</text>
				<text fg={colors.fg.muted}>
					Duration: {formatElapsedTime(elapsedTime)}
					{epicName ? ` • Epic: ${epicName}` : ''}
				</text>
				</box>

				{/* Task and Merge Stats */}
				<box
					style={{
						flexDirection: 'column',
						padding: 1,
						gap: 0,
					}}
				>
					{/* Tasks row */}
					<box style={{ flexDirection: 'row', gap: 2 }}>
						<text fg={colors.fg.muted}>Tasks: </text>
						<text fg={colors.fg.primary}>{String(totalTasks)} total</text>
						<text fg={colors.status.success}>• {String(completedTasks)} done</text>
						{failedTasks > 0 && <text fg={colors.status.error}>• {String(failedTasks)} failed</text>}
						{pendingMainTasks > 0 && <text fg={colors.status.warning}>• {String(pendingMainTasks)} pending-main</text>}
					</box>

					{/* Merge stats row */}
					<box style={{ flexDirection: 'row', gap: 2 }}>
						<text fg={colors.fg.muted}>Merges: </text>
						<text fg={colors.status.success}>{String(mergeStats.merged)} ok</text>
						{mergeStats.resolved > 0 && <text fg={colors.status.info}>• {String(mergeStats.resolved)} resolved</text>}
						{mergeStats.failed > 0 && <text fg={colors.status.error}>• {String(mergeStats.failed)} failed</text>}
						<text fg={colors.fg.muted}>• {String(mergeStats.queued)} queued</text>
					</box>
				</box>

				{/* Main sync status */}
				{hasMainSyncFailure && (
					<box style={{ paddingLeft: 1, paddingRight: 1 }}>
							<text fg={colors.status.warning}>Main sync failed: <span fg={colors.fg.secondary}>{mainSyncStatus.failureReason}</span></text>
					</box>
				)}

				{/* Snapshot tag */}
				{snapshotTag && (
					<box style={{ paddingLeft: 1, paddingRight: 1 }}>
						<text fg={colors.fg.muted}>Snapshot: </text>
						<text fg={colors.accent.primary}>{snapshotTag}</text>
					</box>
				)}

				{/* Failures list */}
				{hasFailures && (
					<box style={{ paddingLeft: 1, paddingRight: 1 }}>
						<text fg={colors.status.error}>Failures:</text>
						<box style={{ paddingLeft: 2 }}>
							{failures.slice(0, 4).map((failure, index) => (
								<box key={index} style={{ flexDirection: 'column', paddingBottom: 0 }}>
									<text fg={colors.fg.secondary}>
										- {failure.taskId}: {failure.reason}
									</text>
									{failure.phase === 'merge' && (
										<>
											{failure.commitHash && (
												<text fg={colors.fg.muted} style={{ paddingLeft: 2 }}>
													Commit: {failure.commitHash.slice(0, 8)}
												</text>
											)}
											{failure.conflictFiles && failure.conflictFiles.length > 0 && (
												<text fg={colors.fg.muted} style={{ paddingLeft: 2 }}>
												Conflicts: {failure.conflictFiles.slice(0, 3).join(', ')}
												{failure.conflictFiles.length > 3 ? ` +${failure.conflictFiles.length - 3} more` : ''}
											</text>
										)}
											<text fg={colors.accent.tertiary} style={{ paddingLeft: 2 }}>
												Try: cd worktrees/merge && git mergetool
											</text>
										</>
									)}
									{failure.phase === 'validation' && (
										<text fg={colors.fg.muted} style={{ paddingLeft: 2 }}>
											Check: .ralph-tui/logs/validations for details
										</text>
									)}
								</box>
							))}
							{failures.length > 4 && (
								<text fg={colors.fg.muted}>... and {String(failures.length - 4)} more</text>
							)}
						</box>
					</box>
				)}

				{/* Pending-main list */}
				{hasPendingMain && (
					<box style={{ paddingLeft: 1, paddingRight: 1 }}>
						<text fg={colors.status.warning}>Pending-main:</text>
						<box style={{ paddingLeft: 2 }}>
							{pendingMainTasksList.slice(0, 2).map((pending, index) => (
								<text key={index} fg={colors.fg.secondary}>
									- {pending.taskId} ({String(pending.commitCount)} commits)
								</text>
							))}
							{pendingMainTasksList.length > 2 && (
								<text fg={colors.fg.muted}>... and {String(pendingMainTasksList.length - 2)} more</text>
							)}
						</box>
					</box>
				)}

				{/* Actions with status */}
				{actions.length > 0 && (
					<box
						style={{
							flexDirection: 'column',
							paddingLeft: 1,
							paddingRight: 1,
							gap: 0,
						}}
					>
						{/* Action labels */}
						<box
							style={{
								flexDirection: 'row',
								justifyContent: 'flex-start',
								alignItems: 'center',
								gap: 1,
								flexWrap: 'wrap',
							}}
						>
							<text fg={colors.fg.muted}>Actions:</text>
							{actions.map((action, index) => {
								const result = cleanupActionResults[action.actionId];
								const status = result?.status ?? 'idle';
								const isSelected = selectedAction === index;
								// For restore action, check isRestoring state
								const isRestoreAction = action.label === 'Restore Snapshot';
								const showLoading = isRestoreAction && isSelected && isRestoring;

								return (
									<text
										key={action.key}
										fg={isSelected ? colors.bg.primary : (isRestoreAction ? getStatusColor(status) : getStatusColor(status))}
										bg={isSelected ? colors.accent.primary : undefined}
									>
										[{String(index + 1)}]{showLoading ? ' ⟳' : getStatusIcon(status)} {showLoading ? `${action.label}...` : action.label}
									</text>
								);
							})}
						</box>
						{/* Action errors and success details */}
						<box
							style={{
								flexDirection: 'row',
								justifyContent: 'flex-start',
								alignItems: 'center',
								gap: 1,
								paddingLeft: 9,
							}}
						>
							{actions.map((action) => {
								const result = cleanupActionResults[action.actionId];
								if (result?.status === 'error' && result.error) {
									return (
										<text key={`error-${action.actionId}`} fg={colors.status.error}>
											✗ {result.error}
										</text>
									);
								}
								if (result?.status === 'success' && result.details) {
									return (
										<text key={`success-${action.actionId}`} fg={colors.status.success}>
											✓ {result.details}
										</text>
									);
								}
								return null;
							})}
						</box>
					</box>
				)}

				{/* Footer */}
				<box
					style={{
						width: '100%',
						height: footerHeight,
						flexDirection: 'row',
						justifyContent: 'center',
						alignItems: 'center',
						backgroundColor: colors.bg.tertiary,
						gap: 3,
					}}
				>
					<text fg={colors.fg.muted}>
						<span fg={colors.accent.primary}>Esc</span> Close
					</text>
					<text fg={colors.fg.muted}>
						<span fg={colors.accent.primary}>←/→</span> Navigate
					</text>
					<text fg={colors.fg.muted}>
						<span fg={colors.accent.primary}>Enter</span> Run Action
					</text>
				</box>
			</box>
		</box>
	);
}

/**
 * Get status icon for cleanup action
 */
function getStatusIcon(status: CleanupActionStatus): string {
	switch (status) {
		case 'idle':
			return '○';
		case 'running':
			return '◐';
		case 'success':
			return '✓';
		case 'error':
			return '✗';
	}
}

/**
 * Get color for cleanup action status
 */
function getStatusColor(status: CleanupActionStatus): string {
	switch (status) {
		case 'idle':
			return colors.fg.muted;
		case 'running':
			return colors.status.info;
		case 'success':
			return colors.status.success;
		case 'error':
			return colors.status.error;
	}
}

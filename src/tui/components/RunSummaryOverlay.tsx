/**
 * ABOUTME: Run Summary Overlay component for displaying execution outcomes.
 * Shows totals, failures, pending-main tasks, and merge stats when run completes/fails.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors, statusIndicators, formatElapsedTime } from '../theme.js';
import type { RalphStatus } from '../theme.js';

/**
 * Failure information for the summary display
 */
export interface FailureInfo {
  /** Task ID */
  taskId: string;
  /** Task title */
  taskTitle: string;
  /** Reason for failure */
  reason: string;
  /** Phase when failure occurred: 'merge' | 'sync' | 'recovery' | 'execution' */
  phase: 'merge' | 'sync' | 'recovery' | 'execution';
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
  onClose,
}: RunSummaryOverlayProps): ReactNode {
  const [selectedAction, setSelectedAction] = useState(0);
  const statusDisplay = getStatusDisplay(status);

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
          setSelectedAction((prev) => Math.min(5, prev + 1));
          break;

        case 'return':
        case 'enter':
          // Actions would be triggered here (for US-003 onwards)
          break;
      }
    },
    [visible, onClose]
  );

  useKeyboard(handleKeyboard);

  // Reset selection when overlay becomes visible
  useEffect(() => {
    if (visible) {
      setSelectedAction(0);
    }
  }, [visible]);

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
  const actionsHeight = 2;
  const footerHeight = 1;
  const totalHeight = headerHeight + statsHeight + syncStatusHeight + snapshotHeight + failuresHeight + pendingHeight + actionsHeight + footerHeight;

  // Actions for the summary
  const actions = [
    { key: '1', label: 'Do All Cleanup' },
    { key: '2', label: 'Sync Main' },
    { key: '3', label: 'Prune Worktrees' },
    { key: '4', label: 'Delete Branches' },
    { key: '5', label: 'Push' },
    { key: '6', label: 'Restore Snapshot' },
  ];

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
          maxHeight: 25,
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
          <text fg={statusDisplay.color}>
            Run Summary ({statusDisplay.label})
          </text>
          <text fg={colors.fg.muted}>
            Duration: {formatElapsedTime(elapsedTime)}
            {epicName && ` • Epic: ${epicName}`}
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
            <text fg={colors.fg.primary}>{totalTasks} total</text>
            <text fg={colors.status.success}>• {completedTasks} done</text>
            {failedTasks > 0 && (
              <text fg={colors.status.error}>• {failedTasks} failed</text>
            )}
            {pendingMainTasks > 0 && (
              <text fg={colors.status.warning}>• {pendingMainTasks} pending-main</text>
            )}
          </box>

          {/* Merge stats row */}
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <text fg={colors.fg.muted}>Merges: </text>
            <text fg={colors.status.success}>{mergeStats.merged} ok</text>
            {mergeStats.resolved > 0 && (
              <text fg={colors.status.info}>• {mergeStats.resolved} resolved</text>
            )}
            {mergeStats.failed > 0 && (
              <text fg={colors.status.error}>• {mergeStats.failed} failed</text>
            )}
            <text fg={colors.fg.muted}>• {mergeStats.queued} queued</text>
          </box>
        </box>

        {/* Main sync status */}
        {hasMainSyncFailure && (
          <box style={{ paddingLeft: 1, paddingRight: 1 }}>
            <text fg={colors.status.warning}>Main sync failed:</text>{' '}
            <text fg={colors.fg.secondary}>{mainSyncStatus.failureReason}</text>
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
                <text key={index} fg={colors.fg.secondary}>
                  - {failure.taskId}: {failure.reason}
                </text>
              ))}
              {failures.length > 4 && (
                <text fg={colors.fg.muted}>
                  ... and {failures.length - 4} more
                </text>
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
                  - {pending.taskId} ({pending.commitCount} commits)
                </text>
              ))}
              {pendingMainTasksList.length > 2 && (
                <text fg={colors.fg.muted}>
                  ... and {pendingMainTasksList.length - 2} more
                </text>
              )}
            </box>
          </box>
        )}

        {/* Actions */}
        <box
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 1,
            paddingLeft: 1,
            paddingRight: 1,
            flexWrap: 'wrap',
          }}
        >
          <text fg={colors.fg.muted}>Actions:</text>
          {actions.map((action, index) => (
            <text
              key={action.key}
              fg={selectedAction === index ? colors.bg.primary : colors.fg.secondary}
              bg={selectedAction === index ? colors.accent.primary : undefined}
            >
              [{index + 1}]{action.label}
            </text>
          ))}
        </box>

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

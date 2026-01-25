/**
 * ABOUTME: Dashboard banner component showing task count statistics.
 * Displays compact header + stats rows with status indicator using nested text spans.
 */

import type { ReactNode } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import type { ValidationStatus } from '../../engine/types.js';
import { colors } from '../theme.js';

/**
 * Props for DashboardBanner component
 */
export interface DashboardBannerProps {
  /** Execution mode label */
  executionMode: 'parallel' | 'sequential';
  /** Total number of tasks */
  totalTasks: number;
  /** Number of currently active tasks (status: active) */
  activeTasks: number;
  /** Number of queued tasks (status: actionable + pending) */
  queuedTasks: number;
  /** Number of blocked tasks */
  blockedTasks: number;
  /** Number of completed tasks */
  completedTasks: number;
  /** Number of failed tasks */
  failedTasks: number;
  /** Total number of worktrees */
  worktreeCount: number;
  /** Number of active worktrees (locked for parallel worker) */
  worktreeActive: number;
  /** Number of locked worktrees (locked for other reasons) */
  worktreeLocked: number;
  /** Number of stale worktrees (directory missing) */
  worktreeStale: number;
  /** Number of prunable worktrees (manually deleted, git cleanup pending) */
  worktreePrunable: number;
  /** Number of queued merges */
  mergesQueued: number;
  /** Number of successful merges */
  mergesSucceeded: number;
  /** Number of failed merges */
  mergesFailed: number;
  /** Number of main sync pending events */
  mainSyncPending: number;
  /** Number of queued validation plans */
  validationsQueued: number;
  /** Whether validation is currently running */
  validating: boolean;
  /** Last validation status */
  lastValidationStatus?: ValidationStatus;
  /** Running ralph-tui version string (e.g., "v1.2.3") */
  appVersion?: string;
}

/**
 * Compact stat item component using inline text layout
 */
function StatItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): ReactNode {
  return (
    <text>
      <span fg={colors.fg.muted}>{label}:</span>{' '}
      <span fg={color}>{String(value)}</span>
    </text>
  );
}

/**
 * Dashboard banner showing compact task count statistics in a single row.
 * Uses OpenTUI row layout with nested text spans for colored values.
 * Displays status indicator based on active tasks count.
 */
export function DashboardBanner({
  executionMode,
  totalTasks,
  activeTasks,
  queuedTasks,
  blockedTasks,
  completedTasks,
  failedTasks,
  worktreeCount,
  worktreeActive,
  worktreeLocked,
  worktreeStale,
  worktreePrunable,
  mergesQueued,
  mergesSucceeded,
  mergesFailed,
  mainSyncPending,
  validationsQueued,
  validating,
  lastValidationStatus,
  appVersion,
}: DashboardBannerProps): ReactNode {
  const { width } = useTerminalDimensions();
  const isCompact = width < 90;
  const hasActive = activeTasks > 0;
  const hasQueued = queuedTasks > 0;
  const statusIndicator = hasActive ? '●' : hasQueued ? '◐' : '○';
  const statusColor = hasActive ? colors.task.active : hasQueued ? colors.status.warning : colors.fg.muted;
  const statusLabel = hasActive ? 'Running' : hasQueued ? 'Queued' : 'Idle';
  const validationLabel = validating
    ? 'Validating'
    : lastValidationStatus
      ? lastValidationStatus
      : 'Idle';
  const validationColor = validating
    ? colors.status.info
    : lastValidationStatus === 'passed' || lastValidationStatus === 'healed'
      ? colors.status.success
      : lastValidationStatus === 'flaky' || lastValidationStatus === 'reverted'
        ? colors.status.warning
        : lastValidationStatus === 'failed' || lastValidationStatus === 'blocked'
          ? colors.status.error
          : colors.fg.muted;

  return (
    <box
      style={{
        width: '100%',
        minHeight: 5,
        flexDirection: 'column',
        backgroundColor: colors.bg.secondary,
        border: true,
        borderStyle: 'rounded',
        borderColor: statusColor,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* Title row */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <text fg={colors.fg.primary}>
          <span fg={colors.fg.primary}>Run Command Center</span>
          <span fg={executionMode === 'parallel' ? colors.status.info : colors.fg.muted}>
            {executionMode === 'parallel' ? ' [Parallel]' : ' [Sequential]'}
          </span>
          <span fg={colors.fg.muted}>{appVersion && appVersion !== 'unknown' ? ` ${appVersion}` : ''}</span>
        </text>
        <text>
          <span fg={statusColor}>{statusIndicator}</span>
          <span fg={colors.fg.muted}> {statusLabel}</span>
        </text>
      </box>

      {/* Stats row */}
      <box
        style={{
          flexDirection: 'row',
          gap: 3,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <StatItem label="Total" value={totalTasks} color={colors.fg.primary} />
        <StatItem label="Active" value={activeTasks} color={colors.task.active} />
        <StatItem label="Queued" value={queuedTasks} color={colors.status.warning} />
        <StatItem label="Blocked" value={blockedTasks} color={colors.task.blocked} />
        <StatItem label="Done" value={completedTasks} color={colors.status.success} />
        <StatItem label="Failed" value={failedTasks} color={colors.status.error} />
      </box>

      {/* Merge status row */}
      <box
        style={{
          flexDirection: 'row',
          gap: 3,
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        {!isCompact && (
          <StatItem label="Worktrees" value={worktreeCount} color={colors.accent.primary} />
        )}
        {!isCompact && worktreeActive > 0 && (
          <StatItem label="Active" value={worktreeActive} color={colors.status.success} />
        )}
        {!isCompact && worktreeLocked > 0 && (
          <StatItem label="Locked" value={worktreeLocked} color={colors.status.warning} />
        )}
        {!isCompact && worktreeStale > 0 && (
          <StatItem label="Stale" value={worktreeStale} color={colors.status.error} />
        )}
        {!isCompact && worktreePrunable > 0 && (
          <StatItem label="Prunable" value={worktreePrunable} color={colors.status.warning} />
        )}
        <StatItem label={isCompact ? 'Merge Q' : 'Merge Queue'} value={mergesQueued} color={colors.fg.muted} />
        <StatItem label="Merged" value={mergesSucceeded} color={colors.status.success} />
        <StatItem label={isCompact ? 'Merge Fail' : 'Merge Failed'} value={mergesFailed} color={colors.status.error} />
        <StatItem label={isCompact ? 'Sync' : 'Sync Pending'} value={mainSyncPending} color={colors.status.warning} />
        <StatItem label={isCompact ? 'Valid Q' : 'Validation Queue'} value={validationsQueued} color={colors.fg.muted} />
        <text>
          <span fg={colors.fg.muted}>Validation:</span>{' '}
          <span fg={validationColor}>{validationLabel}</span>
        </text>
      </box>
    </box>
  );
}

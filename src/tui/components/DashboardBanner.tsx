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

  const completionPercent = totalTasks > 0
    ? Math.min(100, Math.round((completedTasks / totalTasks) * 100))
    : 0;
  const progressWidth = isCompact ? 16 : 22;
  const progressFilled = Math.round((completionPercent / 100) * progressWidth);
  const progressBar = `${'█'.repeat(progressFilled)}${'░'.repeat(progressWidth - progressFilled)}`;
  const pipelineBorder = mergesFailed > 0 ? colors.status.error : colors.border.muted;

  return (
    <box
      style={{
        width: '100%',
        minHeight: 6,
        flexDirection: 'column',
        backgroundColor: colors.bg.secondary,
        border: true,
        borderStyle: 'rounded',
        borderColor: statusColor,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        gap: 0,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 0,
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

      <box
        style={{
          flexDirection: isCompact ? 'column' : 'row',
          gap: 1,
          marginTop: 0,
        }}
      >
        <box
          style={{
            flexGrow: 1,
            border: true,
            borderColor: colors.border.muted,
            backgroundColor: colors.bg.secondary,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text fg={colors.accent.primary}>TASK VELOCITY</text>
            <text fg={colors.fg.muted}>{`${completionPercent}%`}</text>
          </box>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text>
              <span fg={colors.fg.muted}>Active: </span>
              <span fg={colors.task.active}>{String(activeTasks)}</span>
            </text>
            <text>
              <span fg={colors.fg.muted}>Done: </span>
              <span fg={colors.status.success}>{String(completedTasks)}</span>
            </text>
            <text>
              <span fg={colors.fg.muted}>Blocked: </span>
              <span fg={colors.task.blocked}>{String(blockedTasks)}</span>
            </text>
          </box>
          <text fg={colors.fg.secondary}>{progressBar}</text>
        </box>

        <box
          style={{
            flexGrow: 1,
            border: true,
            borderColor: pipelineBorder,
            backgroundColor: colors.bg.secondary,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text fg={colors.accent.secondary}>PIPELINE</text>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text>
              <span fg={colors.fg.muted}>Worktrees: </span>
              <span fg={colors.accent.primary}>{String(worktreeCount)}</span>
            </text>
            <text>
              <span fg={colors.fg.muted}>Merge Q: </span>
              <span fg={colors.fg.secondary}>{String(mergesQueued)}</span>
            </text>
          </box>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text>
              <span fg={colors.fg.muted}>Active: </span>
              <span fg={colors.status.success}>{String(worktreeActive)}</span>
            </text>
            <text>
              <span fg={colors.fg.muted}>Locked: </span>
              <span fg={colors.status.warning}>{String(worktreeLocked)}</span>
            </text>
          </box>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text>
              <span fg={colors.fg.muted}>Stale: </span>
              <span fg={colors.status.error}>{String(worktreeStale)}</span>
            </text>
            <text>
              <span fg={colors.fg.muted}>Prunable: </span>
              <span fg={colors.status.warning}>{String(worktreePrunable)}</span>
            </text>
          </box>
          <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <text>
              <span fg={colors.fg.muted}>Merged: </span>
              <span fg={colors.status.success}>{String(mergesSucceeded)}</span>
            </text>
            <text>
              <span fg={colors.fg.muted}>Failed: </span>
              <span fg={colors.status.error}>{String(mergesFailed)}</span>
            </text>
          </box>
          {mainSyncPending > 0 && (
            <text fg={colors.status.warning}>
              ⚠ Sync Pending: {String(mainSyncPending)}
            </text>
          )}
        </box>

        <box
          style={{
            flexGrow: 1,
            border: true,
            borderColor: colors.border.muted,
            backgroundColor: colors.bg.secondary,
            paddingLeft: 1,
            paddingRight: 1,
          }}
        >
          <text fg={colors.accent.tertiary}>VALIDATION</text>
          <text>
            <span fg={colors.fg.muted}>Status: </span>
            <span fg={validationColor}>{validationLabel}</span>
          </text>
          <text>
            <span fg={colors.fg.muted}>Queue: </span>
            <span fg={colors.fg.secondary}>{String(validationsQueued)}</span>
          </text>
          <text>
            <span fg={colors.fg.muted}>Failures: </span>
            <span fg={colors.status.error}>{String(failedTasks)}</span>
          </text>
          {validating && (
            <text fg={colors.status.info}>Running checks...</text>
          )}
        </box>
      </box>
    </box>
  );
}

/**
 * ABOUTME: Dashboard banner component showing task count statistics.
 * Displays compact header + stats rows with status indicator using nested text spans.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * Props for DashboardBanner component
 */
export interface DashboardBannerProps {
  /** Total number of tasks */
  totalTasks: number;
  /** Number of currently active tasks (status: active) */
  activeTasks: number;
  /** Number of queued tasks (status: actionable + pending) */
  queuedTasks: number;
  /** Number of completed tasks */
  completedTasks: number;
  /** Number of failed tasks */
  failedTasks: number;
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
      <span fg={color}>{value}</span>
    </text>
  );
}

/**
 * Dashboard banner showing compact task count statistics in a single row.
 * Uses OpenTUI row layout with nested text spans for colored values.
 * Displays status indicator based on active tasks count.
 */
export function DashboardBanner({
  totalTasks,
  activeTasks,
  queuedTasks,
  completedTasks,
  failedTasks,
}: DashboardBannerProps): ReactNode {
  const hasActive = activeTasks > 0;
  const hasQueued = queuedTasks > 0;
  const statusIndicator = hasActive ? '●' : hasQueued ? '◐' : '○';
  const statusColor = hasActive ? colors.task.active : hasQueued ? colors.status.warning : colors.fg.muted;
  const statusLabel = hasActive ? 'Running' : hasQueued ? 'Queued' : 'Idle';

  return (
    <box
      style={{
        width: '100%',
        height: 4,
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
          <strong>Parallel Command Center</strong>
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
          justifyContent: 'space-between',
        }}
      >
        <StatItem label="Total" value={totalTasks} color={colors.fg.primary} />
        <StatItem label="Active" value={activeTasks} color={colors.task.active} />
        <StatItem label="Queued" value={queuedTasks} color={colors.status.warning} />
        <StatItem label="Done" value={completedTasks} color={colors.status.success} />
        <StatItem label="Failed" value={failedTasks} color={colors.status.error} />
      </box>
    </box>
  );
}

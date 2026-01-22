/**
 * ABOUTME: Task cards row component displaying all tasks in a scrollable horizontal grid.
 * Shows task ID, title, status, blocker info, and worker/slot label with visual hierarchy.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { colors, formatElapsedTime, getTaskStatusColor, getTaskStatusIndicator } from '../theme.js';
import type { IterationTimingInfo, TaskItem, BlockerInfo } from '../types.js';

/**
 * Props for TaskCardsRow component
 */
export interface TaskCardsRowProps {
  /** List of ALL tasks to display as cards */
  tasks: TaskItem[];
  /** Currently selected task index */
  selectedIndex: number;
  /** Per-task timing information */
  timingByTaskId?: Map<string, IterationTimingInfo>;
  /** Whether the panel is focused */
  isFocused?: boolean;
  /** Scroll offset for horizontal scrolling */
  scrollOffset?: number;
  /** Callback when scroll offset changes */
  onScrollChange?: (offset: number) => void;
}

/**
 * Truncate text to fit within a maximum width
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Get worker/slot label for display
 * Uses workerId from parallel execution for stable slot assignment
 * Falls back to index-based label if workerId not available
 */
function getWorkerLabel(workerId: string | undefined, index: number): string {
  if (workerId) {
    // Extract slot number from workerId (e.g., "worker-2" -> "Slot 2")
    const match = workerId.match(/worker-(\d+)/);
    if (match) {
      return `Slot ${match[1]}`;
    }
  }
  return `Slot ${index + 1}`;
}

function formatTimestamp(isoString?: string): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getDurationDisplay(timing: IterationTimingInfo | undefined, nowMs: number): string {
  if (!timing) return '—';
  if (timing.isRunning && timing.startedAt) {
    const durationSeconds = Math.floor((nowMs - new Date(timing.startedAt).getTime()) / 1000);
    return formatElapsedTime(durationSeconds);
  }
  if (timing.durationMs !== undefined) {
    const durationSeconds = Math.floor(timing.durationMs / 1000);
    return formatElapsedTime(durationSeconds);
  }
  return '—';
}

/**
 * Get card background color based on task status and selection
 */
function getCardBackgroundColor(
  status: TaskItem['status'],
  isSelected: boolean
): string {
  if (isSelected) {
    return colors.bg.highlight;
  }
  switch (status) {
    case 'active':
      return colors.bg.secondary;
    case 'blocked':
      return colors.bg.tertiary;
    case 'done':
    case 'closed':
      return colors.bg.primary;
    default:
      return colors.bg.tertiary;
  }
}

/**
 * Get card border color based on status and selection
 */
function getCardBorderColor(
  status: TaskItem['status'],
  isSelected: boolean,
  isFocused: boolean,
  pulseOn: boolean
): string {
  if (isSelected) {
    return colors.accent.primary;
  }
  if (!isFocused) {
    return colors.border.normal;
  }
  switch (status) {
    case 'active':
      return pulseOn ? colors.task.active : colors.accent.tertiary;
    case 'actionable':
      return colors.task.actionable;
    case 'pending':
      return colors.status.warning;
    case 'blocked':
      return colors.task.blocked;
    case 'error':
      return colors.task.error;
    case 'done':
    case 'closed':
      return colors.task.closed;
    default:
      return colors.border.active;
  }
}

/**
 * Get status label for display
 */
function getStatusLabel(status: TaskItem['status'], blockedByTasks?: BlockerInfo[]): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'actionable':
      return 'Queued';
    case 'pending':
      return 'Pending';
    case 'blocked':
      if (blockedByTasks && blockedByTasks.length > 0) {
        const blockerIds = blockedByTasks.map(b => b.id).join(', ');
        return `Blocked by ${blockerIds}`;
      }
      return 'Blocked';
    case 'error':
      return 'Failed';
    case 'done':
      return 'Done';
    case 'closed':
      return 'Closed';
    default:
      return status;
  }
}

/**
 * Single task card component with improved visual hierarchy
 */
function TaskCard({
  task,
  index,
  isSelected,
  isFocused,
  pulseOn,
  timing,
  nowMs,
}: {
  task: TaskItem;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  pulseOn: boolean;
  timing?: IterationTimingInfo;
  nowMs: number;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);
  const workerLabel = task.workerId ? getWorkerLabel(task.workerId, index) : null;
  const backgroundColor = getCardBackgroundColor(task.status, isSelected);
  const borderColor = getCardBorderColor(task.status, isSelected, isFocused, pulseOn);

  const { width } = useTerminalDimensions();
  const columns = width >= 160 ? 5 : width >= 120 ? 4 : width >= 90 ? 3 : 2;
  const gap = 1;
  const availableWidth = Math.max(20, width - 4);
  const cardWidth = Math.max(
    18,
    Math.min(32, Math.floor((availableWidth - gap * (columns - 1)) / columns))
  );
  const titleMaxWidth = cardWidth - 4;

  const isRunning = task.status === 'active';
  const statusLabel = getStatusLabel(task.status, task.blockedByTasks);
  const durationDisplay = useMemo(() => getDurationDisplay(timing, nowMs), [timing, nowMs]);
  const startedDisplay = timing?.startedAt ? formatTimestamp(timing.startedAt) : '—';
  const endedDisplay = timing?.endedAt ? formatTimestamp(timing.endedAt) : '—';

  // Truncate status label if too long (for blocked by info)
  const maxStatusLen = cardWidth - 6;
  const displayStatusLabel = statusLabel.length > maxStatusLen 
    ? truncateText(statusLabel, maxStatusLen)
    : statusLabel;

  return (
    <box
      style={{
        width: cardWidth,
        minWidth: 18,
        flexGrow: 0,
        flexShrink: 0,
        flexDirection: 'column',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor,
        border: true,
        borderStyle: isSelected ? 'double' : 'rounded',
        borderColor,
        gap: 0,
      }}
    >
      {/* Worker label (if assigned) and status in header row */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 0,
        }}
      >
        <text fg={colors.fg.muted}>
          {workerLabel || '—'}
        </text>
        <text fg={statusColor}>
          <span>{statusIndicator}</span>
          <span> {isRunning ? 'Active' : ''}</span>
        </text>
      </box>

      {/* Task title (truncated) - prominent for selected task */}
      <box style={{ marginTop: 0 }}>
        <text
          fg={
            isSelected
              ? colors.fg.primary
              : isRunning
                ? colors.task.active
                : task.status === 'blocked'
                  ? colors.task.blocked
                  : task.status === 'done'
                    ? colors.fg.muted
                    : colors.fg.secondary
          }
        >
          {isRunning ? (
            <strong>{truncateText(task.title, titleMaxWidth)}</strong>
          ) : (
            truncateText(task.title, titleMaxWidth)
          )}
        </text>
      </box>

      {/* Status label (shows "Blocked by xxx" for blocked tasks) */}
      {task.status !== 'active' && (
        <box style={{ marginTop: 0 }}>
          <text fg={statusColor}>
            {displayStatusLabel}
          </text>
        </box>
      )}

      {/* Timing info for active/completed tasks */}
      {timing && (timing.startedAt || timing.endedAt || timing.durationMs !== undefined) && (
        <box style={{ marginTop: 0, flexDirection: 'row', gap: 2 }}>
          {isRunning ? (
            <>
              <text fg={colors.fg.muted}>Start</text>
              <text fg={colors.fg.secondary}>{startedDisplay}</text>
              <text fg={colors.fg.muted}>Dur</text>
              <text fg={colors.status.info}>{durationDisplay}</text>
            </>
          ) : (
            <>
              <text fg={colors.fg.muted}>End</text>
              <text fg={colors.fg.secondary}>{endedDisplay}</text>
              <text fg={colors.fg.muted}>Dur</text>
              <text fg={colors.accent.primary}>{durationDisplay}</text>
            </>
          )}
        </box>
      )}

      {/* Task ID and priority/label info (compact) */}
      <box
        style={{
          marginTop: 0,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <text fg={colors.fg.muted}>
          {task.id}
        </text>
        {task.priority !== undefined && (
          <text fg={colors.accent.tertiary}>
            P{task.priority}
          </text>
        )}
      </box>
    </box>
  );
}

/**
 * Summary stats component showing task counts by status
 */
function TaskSummary({ tasks }: { tasks: TaskItem[] }): ReactNode {
  const stats = useMemo(() => {
    const active = tasks.filter(t => t.status === 'active').length;
    const queued = tasks.filter(t => t.status === 'actionable' || t.status === 'pending').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const done = tasks.filter(t => t.status === 'done' || t.status === 'closed').length;
    const failed = tasks.filter(t => t.status === 'error').length;
    
    // Find unique blockers for blocked tasks
    const blockerIds = new Set<string>();
    tasks.filter(t => t.status === 'blocked' && t.blockedByTasks).forEach(t => {
      t.blockedByTasks?.forEach(b => blockerIds.add(b.id));
    });
    
    return { active, queued, blocked, done, failed, blockerIds: Array.from(blockerIds) };
  }, [tasks]);

  const parts: string[] = [];
  if (stats.active > 0) parts.push(`${stats.active} active`);
  if (stats.queued > 0) parts.push(`${stats.queued} queued`);
  if (stats.blocked > 0) {
    const blockerInfo = stats.blockerIds.length > 0 
      ? ` by ${stats.blockerIds.slice(0, 2).join(', ')}${stats.blockerIds.length > 2 ? '...' : ''}`
      : '';
    parts.push(`${stats.blocked} blocked${blockerInfo}`);
  }
  if (stats.done > 0) parts.push(`${stats.done} done`);
  if (stats.failed > 0) parts.push(`${stats.failed} failed`);

  return (
    <box style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
      <text>
        <span fg={colors.fg.muted}>Tasks:</span>{' '}
        <span fg={colors.task.active}>{stats.active} active</span>
        <span fg={colors.fg.muted}>,</span>{' '}
        <span fg={colors.status.warning}>{stats.queued} queued</span>
        <span fg={colors.fg.muted}>,</span>{' '}
        <span fg={colors.task.blocked}>{stats.blocked} blocked</span>
        {stats.blockerIds.length > 0 && (
          <>
            <span fg={colors.fg.muted}> by </span>
            <span fg={colors.task.blocked}>
              {stats.blockerIds.slice(0, 2).join(', ')}{stats.blockerIds.length > 2 ? '...' : ''}
            </span>
          </>
        )}
        <span fg={colors.fg.muted}>,</span>{' '}
        <span fg={colors.status.success}>{stats.done} done</span>
        {stats.failed > 0 && (
          <>
            <span fg={colors.fg.muted}>,</span>{' '}
            <span fg={colors.status.error}>{stats.failed} failed</span>
          </>
        )}
      </text>
    </box>
  );
}

/**
 * Task cards row showing ALL tasks in a scrollable horizontal grid layout.
 * Tasks are displayed as selectable cards with clear status distinction.
 * Selected card has prominent highlight; active tasks have warmer colors.
 */
export function TaskCardsRow({
  tasks,
  selectedIndex,
  timingByTaskId,
  isFocused = true,
  scrollOffset = 0,
  onScrollChange,
}: TaskCardsRowProps): ReactNode {
  const [pulseOn, setPulseOn] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [internalScrollOffset, setInternalScrollOffset] = useState(scrollOffset);
  const hasActive = tasks.some((task) => task.status === 'active');

  // Sync internal scroll offset with prop
  useEffect(() => {
    setInternalScrollOffset(scrollOffset);
  }, [scrollOffset]);

  useEffect(() => {
    if (!hasActive) {
      setPulseOn(true);
      return;
    }

    const interval = setInterval(() => {
      setPulseOn((prev) => !prev);
    }, 650);

    return () => clearInterval(interval);
  }, [hasActive]);

  useEffect(() => {
    if (!hasActive) {
      return;
    }

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [hasActive]);

  // Auto-scroll to keep selected task visible
  const { width } = useTerminalDimensions();
  const cardWidth = 24; // Approximate card width
  const visibleCards = Math.floor((width - 4) / cardWidth);

  useEffect(() => {
    if (selectedIndex < internalScrollOffset) {
      const newOffset = selectedIndex;
      setInternalScrollOffset(newOffset);
      onScrollChange?.(newOffset);
    } else if (selectedIndex >= internalScrollOffset + visibleCards) {
      const newOffset = selectedIndex - visibleCards + 1;
      setInternalScrollOffset(newOffset);
      onScrollChange?.(newOffset);
    }
  }, [selectedIndex, internalScrollOffset, visibleCards, onScrollChange]);

  // Calculate visible tasks based on scroll offset
  const visibleTasks = useMemo(() => {
    const start = Math.max(0, internalScrollOffset);
    const end = Math.min(tasks.length, start + visibleCards + 2); // +2 for partial visibility
    return tasks.slice(start, end).map((task, i) => ({
      task,
      originalIndex: start + i,
    }));
  }, [tasks, internalScrollOffset, visibleCards]);

  if (tasks.length === 0) {
    return (
      <box
        style={{
          width: '100%',
          flexGrow: 1,
          minHeight: 6,
          flexDirection: 'column',
          backgroundColor: colors.bg.primary,
          border: true,
          borderStyle: 'rounded',
          borderColor: colors.border.normal,
          padding: 2,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <text fg={colors.fg.muted}>No tasks</text>
      </box>
    );
  }

  const showScrollIndicators = tasks.length > visibleCards;
  const canScrollLeft = internalScrollOffset > 0;
  const canScrollRight = internalScrollOffset + visibleCards < tasks.length;

  return (
    <box
      style={{
        width: '100%',
        flexGrow: 1,
        minHeight: 8,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderStyle: 'rounded',
        borderColor: isFocused ? colors.accent.primary : colors.border.normal,
        padding: 0,
        gap: 0,
      }}
    >
      {/* Summary header */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <TaskSummary tasks={tasks} />
        {showScrollIndicators && (
          <text fg={colors.fg.muted}>
            {canScrollLeft ? '◀ ' : '  '}
            {internalScrollOffset + 1}-{Math.min(internalScrollOffset + visibleCards, tasks.length)}/{tasks.length}
            {canScrollRight ? ' ▶' : '  '}
          </text>
        )}
      </box>

      {/* Task cards with horizontal scroll */}
      <box
        style={{
          width: '100%',
          flexGrow: 1,
          flexDirection: 'row',
          padding: 1,
          gap: 1,
          overflow: 'hidden',
          alignItems: 'stretch',
        }}
      >
        {visibleTasks.map(({ task, originalIndex }) => (
          <TaskCard
            key={task.id}
            task={task}
            index={originalIndex}
            isSelected={originalIndex === selectedIndex}
            isFocused={isFocused}
            pulseOn={pulseOn}
            timing={timingByTaskId?.get(task.id)}
            nowMs={nowMs}
          />
        ))}
      </box>
    </box>
  );
}

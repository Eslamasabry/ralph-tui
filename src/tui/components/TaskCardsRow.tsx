/**
 * ABOUTME: Task cards row component displaying all tasks in a scrollable horizontal grid.
 * Shows task ID, title, status, blocker info, and worker/slot label with improved visual hierarchy.
 * Redesigned with better status indicators, colors, and responsive layout for better readability.
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
 * Truncate text to fit within a maximum width with smart ellipsis
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Get worker/slot label for display with enhanced styling
 * Uses workerId from parallel execution for stable slot assignment
 * Falls back to index-based label if workerId not available
 */
function getWorkerLabel(workerId: string | undefined, index: number): string {
  if (workerId) {
    // Extract slot number from workerId (e.g., "worker-2" -> "2")
    const match = workerId.match(/worker-(\d+)/);
    if (match) {
      return `Slot ${match[1]}`;
    }
  }
  return `Slot ${index + 1}`;
}

function getDurationDisplay(timing: IterationTimingInfo | undefined, nowMs: number): string {
  if (!timing) return '--';
  if (timing.isRunning && timing.startedAt) {
    const durationSeconds = Math.floor((nowMs - new Date(timing.startedAt).getTime()) / 1000);
    return formatElapsedTime(durationSeconds);
  }
  if (timing.durationMs !== undefined) {
    const durationSeconds = Math.floor(timing.durationMs / 1000);
    return formatElapsedTime(durationSeconds);
  }
  return '--';
}

/**
 * Get enhanced card background color based on task status and selection
 */
function getCardBackgroundColor(isSelected: boolean): string {
  return isSelected ? colors.bg.highlight : colors.bg.secondary;
}

function getCardBorderColor(isSelected: boolean, isFocused: boolean): string {
  if (isSelected && isFocused) {
    return colors.accent.primary;
  }
  return colors.border.muted;
}

/**
 * Get enhanced status label for display with better formatting
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
 * Get priority display with icon and color
 */
function getPriorityDisplay(priority?: number): { icon: string; color: string } {
  if (priority === undefined) {
    return { icon: '', color: colors.fg.muted };
  }
  const colors_pri = ['#f7768e', '#ff9e64', '#e0af68', '#9ece6a', '#565f89'];
  const index = Math.min(Math.max(0, priority), 4);
  return {
    icon: `P${priority}`,
    color: colors_pri[index],
  };
}

/**
 * Calculate responsive card dimensions based on terminal width
 */
function getCardDimensions(terminalWidth: number): {
  columns: number;
  cardWidth: number;
  titleMaxWidth: number;
} {
  const cardWidth = 28;
  const titleMaxWidth = 20;
  const columns = Math.max(1, Math.floor((terminalWidth - 6) / (cardWidth + 1)));
  return { columns, cardWidth, titleMaxWidth };
}

/**
 * Enhanced single task card component with improved visual hierarchy
 */
function TaskCard({
  task,
  index,
  isSelected,
  isFocused,
  timing,
  nowMs,
}: {
  task: TaskItem;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  timing?: IterationTimingInfo;
  nowMs: number;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);
  const workerLabel = task.workerId ? getWorkerLabel(task.workerId, index) : null;
  const backgroundColor = getCardBackgroundColor(isSelected);
  const borderColor = getCardBorderColor(isSelected, isFocused);

  const { width: terminalWidth } = useTerminalDimensions();
  const { cardWidth, titleMaxWidth } = getCardDimensions(terminalWidth);

  const isRunning = task.status === 'active';
  const statusLabel = getStatusLabel(task.status, task.blockedByTasks);
  const durationDisplay = useMemo(() => getDurationDisplay(timing, nowMs), [timing, nowMs]);
  const priorityDisplay = getPriorityDisplay(task.priority);

  // Truncate status label if too long (for blocked by info)
  const maxStatusLen = cardWidth - 8;
  const displayStatusLabel = statusLabel.length > maxStatusLen
    ? truncateText(statusLabel, maxStatusLen)
    : statusLabel;

  // Calculate title with emphasis for selected/running
  const displayTitle = truncateText(task.title, titleMaxWidth);
  const titleColor = isSelected ? colors.fg.primary : colors.fg.secondary;

  return (
    <box
      style={{
        width: cardWidth,
        minWidth: 28,
        height: 6,
        flexGrow: 0,
        flexShrink: 0,
        flexDirection: 'row',
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor,
        border: true,
        borderStyle: isSelected ? 'double' : 'rounded',
        borderColor,
        gap: 0,
      }}
    >
      {/* Status stripe */}
      <box style={{ width: 1, backgroundColor: statusColor }} />

      {/* Content */}
      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 0,
          paddingBottom: 0,
          gap: 0,
        }}
      >
        {/* Header row: Status + ID + Priority */}
        <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <text fg={statusColor}>
            {statusIndicator} {task.id}
          </text>
          {task.priority !== undefined && (
            <text fg={priorityDisplay.color}>{priorityDisplay.icon}</text>
          )}
        </box>

        {/* Task title */}
        <box>
          <text fg={titleColor}>{displayTitle}</text>
        </box>

        {/* Status label for non-active tasks */}
        {!isRunning && (
          <box>
            <text fg={statusColor}>{displayStatusLabel}</text>
          </box>
        )}

        {/* Footer: Worker + Duration */}
        <box style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {workerLabel ? (
            <text fg={colors.accent.tertiary}>
              [W-{workerLabel.split(' ').pop()}]
            </text>
          ) : (
            <text fg={colors.fg.muted}>{statusLabel}</text>
          )}
          <text fg={isRunning ? colors.status.info : colors.fg.muted}>
            {isRunning ? '⏱ ' : ''}
            {durationDisplay}
          </text>
        </box>
      </box>
    </box>
  );
}

/**
 * Enhanced summary stats component with better visual hierarchy
 */
function TaskSummary({ tasks }: { tasks: TaskItem[] }): ReactNode {
  const stats = useMemo(() => {
    const active = tasks.filter(t => t.status === 'active').length;
    const queued = tasks.filter(t => t.status === 'actionable').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const blocked = tasks.filter(t => t.status === 'blocked').length;
    const done = tasks.filter(t => t.status === 'done').length;
    const closed = tasks.filter(t => t.status === 'closed').length;
    const failed = tasks.filter(t => t.status === 'error').length;

    // Find unique blockers for blocked tasks
    const blockerIds = new Set<string>();
    tasks.filter(t => t.status === 'blocked' && t.blockedByTasks).forEach(t => {
      t.blockedByTasks?.forEach(b => blockerIds.add(b.id));
    });

    return {
      active,
      queued,
      pending,
      blocked,
      done,
      closed,
      failed,
      blockerIds: Array.from(blockerIds),
      total: tasks.length,
      completed: done + closed,
    };
  }, [tasks]);

  const progressPercent = stats.total > 0
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  return (
    <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Progress bar */}
      <box style={{ flexDirection: 'row', gap: 0, alignItems: 'center' }}>
        <text fg={colors.fg.muted}>[</text>
        <text fg={colors.status.success}>
          {'▓'.repeat(Math.floor(progressPercent / 10))}
        </text>
        <text fg={colors.fg.dim}>
          {'░'.repeat(10 - Math.floor(progressPercent / 10))}
        </text>
        <text fg={colors.fg.muted}>]</text>
        <text fg={colors.fg.secondary}> {String(progressPercent)}%</text>
      </box>

      {/* Status counts with color coding */}
      <text>
        <span fg={colors.task.active}>●{String(stats.active)}</span>
        <span fg={colors.fg.muted}> </span>
        <span fg={colors.task.actionable}>▶{String(stats.queued)}</span>
        <span fg={colors.fg.muted}> </span>
        <span fg={colors.status.warning}>○{String(stats.pending)}</span>
        <span fg={colors.fg.muted}> </span>
        <span fg={colors.task.blocked}>⊘{String(stats.blocked)}</span>
        <span fg={colors.fg.muted}>{stats.blockerIds.length > 0 ? ' by ' : ''}</span>
        <span fg={colors.task.blocked}>
          {stats.blockerIds.length > 0
            ? `${stats.blockerIds.slice(0, 2).join(', ')}${stats.blockerIds.length > 2 ? '...' : ''}`
            : ''}
        </span>
        <span fg={colors.fg.muted}> </span>
        <span fg={colors.status.success}>✓{String(stats.done)}</span>
        <span fg={colors.fg.muted}>{stats.closed > 0 ? '/' : ''}</span>
        <span fg={colors.fg.dim}>{stats.closed > 0 ? `✓${String(stats.closed)}` : ''}</span>
        <span fg={colors.fg.muted}>{stats.failed > 0 ? ' ' : ''}</span>
        <span fg={colors.status.error}>{stats.failed > 0 ? `✗${String(stats.failed)}` : ''}</span>
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [internalScrollOffset, setInternalScrollOffset] = useState(scrollOffset);
  const hasActive = tasks.some((task) => task.status === 'active');
  const { width } = useTerminalDimensions();
  const isCompact = width < 80;
  const panelMinHeight = isCompact ? 7 : 8;

  // Sync internal scroll offset with prop
  useEffect(() => {
    setInternalScrollOffset(scrollOffset);
  }, [scrollOffset]);

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
  const { cardWidth } = getCardDimensions(width);
  const cardSlot = cardWidth + 1; // card width + gap
  const visibleCards = Math.max(1, Math.floor((width - 6) / cardSlot));

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
        minHeight: panelMinHeight,
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
            {String(internalScrollOffset + 1)}-{String(Math.min(internalScrollOffset + visibleCards, tasks.length))}/{String(tasks.length)}
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
            timing={timingByTaskId?.get(task.id)}
            nowMs={nowMs}
          />
        ))}
      </box>
    </box>
  );
}

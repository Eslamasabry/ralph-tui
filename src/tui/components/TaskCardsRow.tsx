/**
 * ABOUTME: Task cards row component displaying running tasks in horizontal cards.
 * Shows task ID, title, status, and worker/slot label with distinct Active vs Queued visual hierarchy.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { colors, getTaskStatusColor, getTaskStatusIndicator } from '../theme.js';
import type { TaskItem } from '../types.js';

/**
 * Props for TaskCardsRow component
 */
export interface TaskCardsRowProps {
  /** List of tasks to display as cards */
  tasks: TaskItem[];
  /** Currently selected task index */
  selectedIndex: number;
  /** Whether the panel is focused */
  isFocused?: boolean;
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
 * Uses task index to assign "Worker 1", "Worker 2", etc.
 */
function getWorkerLabel(index: number): string {
  return `Slot ${index + 1}`;
}

/**
 * Get card background color based on task status and selection
 * Active tasks get a warmer background, queued tasks get cooler background
 * Selected task gets highlighted background regardless of status
 */
function getCardBackgroundColor(
  status: TaskItem['status'],
  isSelected: boolean
): string {
  if (isSelected) {
    return colors.bg.highlight;
  }
  if (status === 'active') {
    return colors.bg.secondary; // Warm secondary for active
  }
  return colors.bg.tertiary; // Cooler tertiary for queued
}

/**
 * Get card border color based on status and selection
 * Selected gets accent color, active gets blue, queued gets muted
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
 * Single task card component with improved visual hierarchy
 */
function TaskCard({
  task,
  index,
  isSelected,
  isFocused,
  pulseOn,
}: {
  task: TaskItem;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  pulseOn: boolean;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);
  const workerLabel = getWorkerLabel(index);
  const backgroundColor = getCardBackgroundColor(task.status, isSelected);
  const borderColor = getCardBorderColor(task.status, isSelected, isFocused, pulseOn);

  const { width } = useTerminalDimensions();
  const columns = width >= 160 ? 5 : width >= 120 ? 4 : width >= 90 ? 3 : 2;
  const gap = 1;
  const availableWidth = Math.max(20, width - 4);
  const cardWidth = Math.max(
    18,
    Math.min(28, Math.floor((availableWidth - gap * (columns - 1)) / columns))
  );
  const titleMaxWidth = cardWidth - 4; // Leave room for padding and borders

  // Determine if task is actively running vs queued
  const isRunning = task.status === 'active';
  const statusLabel = isRunning ? 'Active' : 'Queued';

  return (
    <box
      style={{
        width: cardWidth,
        minWidth: 18,
        flexGrow: 1,
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
      {/* Worker label and status in header row */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 0,
        }}
      >
        <text fg={colors.fg.muted}>
          {workerLabel}
        </text>
        <text fg={statusColor}>
          <span>{statusIndicator}</span>
          <span> {statusLabel}</span>
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
                : colors.fg.secondary
          }
        >
          {truncateText(task.title, titleMaxWidth)}
        </text>
      </box>

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
 * Task cards row showing running tasks in horizontal grid layout.
 * Tasks are displayed as selectable cards with clear Active vs Queued distinction.
 * Selected card has prominent highlight; active tasks have warmer colors.
 */
export function TaskCardsRow({
  tasks,
  selectedIndex,
  isFocused = true,
}: TaskCardsRowProps): ReactNode {
  const [pulseOn, setPulseOn] = useState(true);
  const hasActive = tasks.some((task) => task.status === 'active');

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
        <text fg={colors.fg.muted}>No active or queued tasks</text>
      </box>
    );
  }

  return (
    <box
      title="Slots (Active + Queued)"
      style={{
        width: '100%',
        flexGrow: 1,
        minHeight: 6,
        flexDirection: 'row',
        backgroundColor: colors.bg.primary,
        border: true,
        borderStyle: 'rounded',
        borderColor: isFocused ? colors.accent.primary : colors.border.normal,
        padding: 1,
        gap: 1,
        flexWrap: 'wrap',
        alignItems: 'stretch',
      }}
    >
      {tasks.map((task, index) => (
        <TaskCard
          key={task.id}
          task={task}
          index={index}
          isSelected={index === selectedIndex}
          isFocused={isFocused}
          pulseOn={pulseOn}
        />
      ))}
    </box>
  );
}

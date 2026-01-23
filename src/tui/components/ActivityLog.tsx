/**
 * ABOUTME: Activity log component for displaying parallel execution events.
 * Shows task and merge events with filtering capabilities (all/tasks/merges).
 */

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { colors } from '../theme.js';
import type { ParallelEvent } from '../../engine/parallel/types.js';

/**
 * Activity filter options
 */
export type ActivityFilter = 'all' | 'tasks' | 'merges';

/**
 * Props for ActivityLog component
 */
export interface ActivityLogProps {
  /** List of parallel events to display */
  events: ParallelEvent[];
  /** Current filter selection */
  filter: ActivityFilter;
  /** Maximum number of events to display */
  maxEvents?: number;
  /** Panel width for truncation calculations */
  width?: number;
  /** Whether this panel currently has keyboard focus */
  isFocused?: boolean;
}

/**
 * Event type categories for filtering
 */
const TASK_EVENTS = new Set<ParallelEvent['type']>([
  'parallel:task-claimed',
  'parallel:task-started',
  'parallel:task-output',
  'parallel:task-finished',
]);

const MERGE_EVENTS = new Set<ParallelEvent['type']>([
  'parallel:merge-queued',
  'parallel:merge-succeeded',
  'parallel:merge-failed',
  'parallel:main-sync-skipped',
  'parallel:main-sync-succeeded',
  'parallel:main-sync-failed',
  'parallel:main-sync-retrying',
  'parallel:main-sync-alert',
]);

/**
 * Check if an event is a task event
 */
function isTaskEvent(event: ParallelEvent): boolean {
  return TASK_EVENTS.has(event.type);
}

/**
 * Check if an event is a merge event
 */
function isMergeEvent(event: ParallelEvent): boolean {
  return MERGE_EVENTS.has(event.type);
}

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Get display label for event type
 */
function getEventTypeLabel(type: ParallelEvent['type']): string {
  switch (type) {
    case 'parallel:task-claimed':
      return 'Task claimed';
    case 'parallel:task-started':
      return 'Task started';
    case 'parallel:task-output':
      return 'Task output';
    case 'parallel:task-finished':
      return 'Task finished';
    case 'parallel:merge-queued':
      return 'Merge queued';
    case 'parallel:merge-succeeded':
      return 'Merge succeeded';
    case 'parallel:merge-failed':
      return 'Merge failed';
    case 'parallel:main-sync-skipped':
      return 'Sync skipped';
    case 'parallel:main-sync-succeeded':
      return 'Sync succeeded';
    case 'parallel:main-sync-failed':
      return 'Sync failed';
    case 'parallel:main-sync-retrying':
      return 'Sync retrying';
    case 'parallel:main-sync-alert':
      return 'Sync alert';
    case 'parallel:stopped':
      return 'Stopped';
    case 'parallel:started':
      return 'Started';
    default:
      return type;
  }
}

/**
 * Get color for event type
 */
function getEventColor(type: ParallelEvent['type']): string {
  if (type.startsWith('parallel:task')) {
    return colors.task.active;
  }
  if (type.startsWith('parallel:merge')) {
    return colors.status.warning;
  }
  if (type.startsWith('parallel:main-sync')) {
    if (type === 'parallel:main-sync-failed' || type === 'parallel:main-sync-alert') {
      return colors.status.error;
    }
    if (type === 'parallel:main-sync-retrying') {
      return colors.status.warning;
    }
    return colors.status.info;
  }
  return colors.fg.muted;
}

/**
 * Get symbol for event type
 */
function getEventSymbol(type: ParallelEvent['type']): string {
  switch (type) {
    case 'parallel:task-claimed':
      return '◎';
    case 'parallel:task-started':
      return '▶';
    case 'parallel:task-output':
      return '○';
    case 'parallel:task-finished':
      return '✓';
    case 'parallel:merge-queued':
      return '◐';
    case 'parallel:merge-succeeded':
      return '✓';
    case 'parallel:merge-failed':
      return '✗';
    case 'parallel:main-sync-skipped':
      return '⊘';
    case 'parallel:main-sync-succeeded':
      return '✓';
    case 'parallel:main-sync-failed':
      return '✗';
    case 'parallel:main-sync-retrying':
      return '⟳';
    case 'parallel:main-sync-alert':
      return '⚠';
    case 'parallel:stopped':
      return '■';
    case 'parallel:started':
      return '▶';
    default:
      return '●';
  }
}

/**
 * Format event description for display
 */
function formatEventDescription(event: ParallelEvent): string {
  switch (event.type) {
    case 'parallel:task-claimed':
      return `${event.workerId}: ${event.task.id}`;
    case 'parallel:task-started':
      return `${event.workerId}: ${event.task.id}`;
    case 'parallel:task-finished':
      return `${event.workerId}: ${event.task.id} (${event.completed ? 'done' : event.result.status})`;
    case 'parallel:merge-queued':
      return `${event.workerId}: ${event.commit.slice(0, 7)}`;
    case 'parallel:merge-succeeded':
      return `${event.commit.slice(0, 7)} ${event.resolved ? '(resolved)' : ''}`;
    case 'parallel:merge-failed':
// OURS:
      // Extract task ID and first line of reason for compact display
      const firstLine = event.reason.split('\n')[0] || '';
      const taskMatch = firstLine.match(/Task:\s*(\S+)/);
      const reasonMatch = firstLine.match(/Reason:\s*(.+)/);
      const taskId = taskMatch ? taskMatch[1] : event.task.id;
      const reason = reasonMatch ? reasonMatch[1] : firstLine;
      return `${event.commit.slice(0, 7)} [${taskId}]: ${reason}`;
// THEIRS:
      return formatMergeFailedDescription(event); (ralph-tui-wmr.6: task)
    case 'parallel:main-sync-skipped':
      return event.reason;
    case 'parallel:main-sync-succeeded':
      return event.commit.slice(0, 7);
    case 'parallel:main-sync-failed':
      return `${event.task.id}: ${event.reason}`;
    case 'parallel:main-sync-retrying':
      return `Attempt ${event.retryAttempt}/${event.maxRetries} in ${event.delayMs}ms: ${event.reason}`;
    case 'parallel:main-sync-alert':
      return `${event.affectedTaskCount} task(s) affected after ${event.maxRetries} retries: ${event.reason}`;
    default:
      return '';
  }
}

/**
 * Format detailed merge failure description with conflict files and suggestions
 */
function formatMergeFailedDescription(event: Extract<ParallelEvent, { type: 'parallel:merge-failed' }>): string {
  const parts: string[] = [];

  // Task ID and commit hash
  parts.push(`${event.task.id} @ ${event.commit.slice(0, 8)}`);

  // Reason
  parts.push(event.reason);

  // Conflict files (if any)
  if (event.conflictFiles && event.conflictFiles.length > 0) {
    const fileList = event.conflictFiles.length <= 3
      ? event.conflictFiles.join(', ')
      : `${event.conflictFiles.slice(0, 3).join(', ')} +${event.conflictFiles.length - 3} more`;
    parts.push(`Conflicts: ${fileList}`);
  }

  return parts.join(' | ');
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
 * Single activity row component
 */
function ActivityRow({
  event,
  maxWidth,
}: {
  event: ParallelEvent;
  maxWidth: number;
}): ReactNode {
  const timestamp = formatTimestamp(event.timestamp);
  const typeLabel = getEventTypeLabel(event.type);
  const description = formatEventDescription(event);
  const color = getEventColor(event.type);
  const symbol = getEventSymbol(event.type);

  // Calculate available width for description
  // Format: [timestamp] [symbol] [type] description
  const fixedWidth = timestamp.length + 3 + symbol.length + 1 + typeLabel.length + 3;
  const descWidth = Math.max(5, maxWidth - fixedWidth);
  const truncatedDesc = truncateText(description, descWidth);

  return (
    <box
      style={{
        flexDirection: 'row',
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      <text>
        <span fg={colors.fg.muted}>{timestamp}</span>
        <span> </span>
        <span fg={color}>{symbol}</span>
        <span> </span>
        <span fg={colors.accent.tertiary}>{typeLabel}</span>
        <span> </span>
        <span fg={colors.fg.primary}>{truncatedDesc}</span>
      </text>
    </box>
  );
}

/**
 * Filter button component (display only - filtering controlled via keyboard)
 */
function FilterButton({
  label,
  isActive,
  count,
}: {
  label: string;
  isActive: boolean;
  count: number;
}): ReactNode {
  return (
    <box
      style={{
        flexDirection: 'row',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: isActive ? colors.bg.highlight : 'transparent',
        border: isActive,
        borderColor: colors.accent.primary,
      }}
    >
      <text>
        <span fg={isActive ? colors.accent.primary : colors.fg.muted}>
          {isActive ? '●' : '○'}
        </span>
        <span> </span>
        <span fg={isActive ? colors.fg.primary : colors.fg.secondary}>
          {label}
        </span>
        <span> </span>
        <span fg={colors.fg.muted}>({String(count)})</span>
      </text>
    </box>
  );
}

/**
 * Activity log component displaying parallel execution events with filtering.
 * Supports filtering by event type (all/tasks/merges) with visual indicators.
 */
export function ActivityLog({
  events,
  filter,
  maxEvents = 50,
  width = 60,
  isFocused = false,
}: ActivityLogProps): ReactNode {
  const maxRowWidth = Math.max(20, width - 4);

  // Filter and limit events based on current filter
  const filteredEvents = useMemo(() => {
    let filtered = events;

    if (filter === 'tasks') {
      filtered = events.filter(isTaskEvent);
    } else if (filter === 'merges') {
      filtered = events.filter(isMergeEvent);
    }

    return filtered.slice(-maxEvents);
  }, [events, filter, maxEvents]);

  // Count events by category
  const counts = useMemo(() => ({
    all: events.length,
    tasks: events.filter(isTaskEvent).length,
    merges: events.filter(isMergeEvent).length,
  }), [events]);

  // Determine border color based on focus state
  const borderColor = isFocused ? colors.accent.primary : colors.border.normal;

  return (
    <box
      title="Activity Log (press 'L' to toggle, keys 1-3 to filter)"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 40,
        maxWidth: 70,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor,
      }}
    >
      {/* Header with filter controls */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 1,
          paddingRight: 1,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <text fg={colors.fg.primary}>
          <span fg={colors.fg.primary}>Activity</span>
          <span fg={colors.fg.muted}> (1-3: filter)</span>
        </text>
        <box style={{ flexDirection: 'row', gap: 0 }}>
          <FilterButton
            label="All"
            isActive={filter === 'all'}
            count={counts.all}
          />
          <FilterButton
            label="Tasks"
            isActive={filter === 'tasks'}
            count={counts.tasks}
          />
          <FilterButton
            label="Merges"
            isActive={filter === 'merges'}
            count={counts.merges}
          />
        </box>
      </box>
      {/* Header separator line */}
      <box
        style={{
          width: '100%',
          height: 1,
          border: true,
          borderStyle: 'rounded',
          borderColor: colors.border.normal,
        }}
      />

      {/* Events list */}
      <scrollbox
        style={{
          flexGrow: 1,
          width: '100%',
        }}
      >
        {filteredEvents.length === 0 ? (
          <box style={{ paddingLeft: 1, paddingTop: 1 }}>
            <text fg={colors.fg.muted}>No events to display</text>
          </box>
        ) : (
          filteredEvents.map((event, index) => (
            <ActivityRow
              key={`${event.timestamp}-${index}`}
              event={event}
              maxWidth={maxRowWidth}
            />
          ))
        )}
      </scrollbox>
    </box>
  );
}

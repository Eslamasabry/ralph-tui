/**
 * ABOUTME: ActivityView component for the Ralph TUI.
 * Full-screen overlay showing real-time timeline of agent activity.
 * Displays iteration events, subagent hierarchy, and execution progress.
 */

import type { ReactNode } from 'react';
import { useMemo, useCallback } from 'react';
import { useKeyboard } from '@opentui/react';
import { colors, formatElapsedTime } from '../theme.js';
import type { IterationResult, IterationStatus, EngineSubagentStatus } from '../../engine/types.js';
import type { SubagentTreeNode } from '../../engine/types.js';
import type { SubagentTraceStats } from '../../logs/types.js';
import type { ActivityEvent } from '../../logs/activity-events.js';

/**
 * Timeline event display type (internal representation for UI)
 */
interface TimelineEventDisplay {
  /** Event timestamp */
  timestamp: string;
  /** Event type for display */
  type: 'started' | 'agent_running' | 'task_completed' | 'completed' | 'failed' | 'skipped' | 'interrupted';
  /** Human-readable description */
  description: string;
  /** Severity level (from ActivityEvent) */
  severity?: 'info' | 'warning' | 'error';
  /** Category (from ActivityEvent) */
  category?: string;
}

/**
 * Props for the ActivityView component
 */
export interface ActivityViewProps {
  /** Whether the activity view is visible */
  visible: boolean;
  /** Callback when activity view should be closed */
  onClose: () => void;
  /** Current iteration number */
  currentIteration: number;
  /** Maximum iterations (0 = unlimited) */
  maxIterations: number;
  /** Current task ID */
  currentTaskId?: string;
  /** Current task title */
  currentTaskTitle?: string;
  /** Current iteration status */
  currentStatus?: IterationStatus;
  /** Current iteration start time */
  currentStartedAt?: string;
  /** Current iteration duration in milliseconds */
  currentDurationMs?: number;
  /** Elapsed time in seconds since execution started */
  elapsedTime: number;
  /** Whether an agent is currently executing */
  isExecuting: boolean;
  /** Subagent tree for the current iteration */
  subagentTree: SubagentTreeNode[];
  /** Subagent trace statistics */
  subagentStats?: SubagentTraceStats;
  /** Iteration history (for showing past iterations' events) */
  iterations?: IterationResult[];
  /** Activity events from ActivityEventBuffer for real-time timeline display */
  activityEvents?: ActivityEvent[];
  /** Timeline events in UI format (alternative to activityEvents) */
  timelineEvents?: TimelineEventDisplay[];
}

/**
 * Status indicator symbols
 */
const statusIndicators: Record<IterationStatus, string> = {
  completed: '✓',
  running: '▶',
  failed: '✗',
  interrupted: '⊘',
  skipped: '⊖',
};

/**
 * Status colors for iterations
 */
const statusColors: Record<IterationStatus, string> = {
  completed: colors.status.success,
  running: colors.accent.primary,
  failed: colors.status.error,
  interrupted: colors.status.warning,
  skipped: colors.fg.dim,
};

/**
 * Status labels for display
 */
const statusLabels: Record<IterationStatus, string> = {
  completed: 'Completed',
  running: 'Running',
  failed: 'Failed',
  interrupted: 'Interrupted',
  skipped: 'Skipped',
};

/**
 * Format an ISO timestamp for display
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Get the color for an activity event type
 */
function getEventColor(type: TimelineEventDisplay['type']): string {
  switch (type) {
    case 'started':
      return colors.accent.primary;
    case 'agent_running':
      return colors.accent.tertiary;
    case 'task_completed':
      return colors.status.success;
    case 'completed':
      return colors.status.success;
    case 'failed':
      return colors.status.error;
    case 'interrupted':
      return colors.status.warning;
    case 'skipped':
      return colors.fg.muted;
    default:
      return colors.fg.secondary;
  }
}

/**
 * Get the symbol for an activity event type
 */
function getEventSymbol(type: TimelineEventDisplay['type']): string {
  switch (type) {
    case 'started':
      return '▶';
    case 'agent_running':
      return '⚙';
    case 'task_completed':
      return '✓';
    case 'completed':
      return '✓';
    case 'failed':
      return '✗';
    case 'interrupted':
      return '⊘';
    case 'skipped':
      return '⊖';
    default:
      return '•';
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(durationMs?: number): string {
  if (durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Build activity events from current iteration state
 */
function buildCurrentActivityEvents(
  status: IterationStatus | undefined,
  startedAt: string | undefined,
  _durationMs: number | undefined,
  taskId: string | undefined,
  _taskTitle: string | undefined
): TimelineEventDisplay[] {
  const events: TimelineEventDisplay[] = [];

  if (!startedAt) return events;

  // Start event
  events.push({
    timestamp: startedAt,
    type: 'started',
    description: `Started working on ${taskId || 'task'}`,
  });

  // Agent running event (synthetic - represents agent execution phase)
  events.push({
    timestamp: startedAt,
    type: 'agent_running',
    description: 'Agent executing prompt',
  });

  // End event based on status
  if (status === 'completed') {
    events.push({
      timestamp: startedAt,
      type: 'task_completed',
      description: 'Task marked complete',
    });
    events.push({
      timestamp: startedAt,
      type: 'completed',
      description: 'Iteration completed successfully',
    });
  } else if (status === 'failed') {
    events.push({
      timestamp: startedAt,
      type: 'failed',
      description: 'Iteration failed',
    });
  } else if (status === 'interrupted') {
    events.push({
      timestamp: startedAt,
      type: 'interrupted',
      description: 'Iteration interrupted',
    });
  } else if (status === 'skipped') {
    events.push({
      timestamp: startedAt,
      type: 'skipped',
      description: 'Iteration skipped',
    });
  }

  return events;
}

/**
 * Status icon for subagent based on its completion state
 */
function getSubagentStatusIcon(status: EngineSubagentStatus): string {
  switch (status) {
    case 'running':
      return '◐';
    case 'completed':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '○';
  }
}

/**
 * Status color for subagent based on its completion state
 */
function getSubagentStatusColor(status: EngineSubagentStatus): string {
  switch (status) {
    case 'running':
      return colors.status.info;
    case 'completed':
      return colors.status.success;
    case 'error':
      return colors.status.error;
    default:
      return colors.fg.muted;
  }
}

/**
 * Props for subagent tree row component
 */
interface SubagentRowProps {
  node: SubagentTreeNode;
  depth: number;
  maxDepth: number;
}

/**
 * Render a single subagent tree row with indentation
 */
function SubagentTreeRow({ node, depth, maxDepth }: SubagentRowProps): ReactNode {
  const { state } = node;
  const statusIcon = getSubagentStatusIcon(state.status);
  const statusColor = getSubagentStatusColor(state.status);
  const indent = '  '.repeat(depth);
  const expandIcon = node.children.length > 0 ? (depth < maxDepth ? '▼' : '▶') : ' ';
  const duration = state.durationMs !== undefined ? ` [${formatDuration(state.durationMs)}]` : '';

  return (
    <>
      <box
        style={{
          flexDirection: 'row',
          paddingLeft: 1,
          paddingRight: 1,
          marginBottom: 0,
        }}
      >
        <text>
          <span fg={colors.fg.dim}>{indent}</span>
          <span fg={colors.fg.muted}>{expandIcon}</span>
          <span fg={statusColor}> {statusIcon}</span>
          <span fg={colors.accent.tertiary}> [{state.type}]</span>
          <span fg={colors.fg.secondary}> {state.description}</span>
          <span fg={colors.fg.muted}>{duration}</span>
        </text>
      </box>
      {node.children.map((child) => (
        <SubagentTreeRow
          key={child.state.id}
          node={child}
          depth={depth + 1}
          maxDepth={maxDepth}
        />
      ))}
    </>
  );
}

/**
 * Section header component for consistent styling
 */
function SectionHeader({ title }: { title: string }): ReactNode {
  return (
    <box style={{ marginBottom: 0 }}>
      <text fg={colors.accent.primary}>{title}</text>
    </box>
  );
}

/**
 * Map activity event type to timeline event type for display
 */
function mapActivityEventType(eventType: string): TimelineEventDisplay['type'] {
  switch (eventType) {
    case 'started':
      return 'started';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'interrupted':
      return 'interrupted';
    case 'skipped':
      return 'skipped';
    case 'output':
      return 'agent_running';
    default:
      return 'agent_running';
  }
}

/**
 * ActivityView component - full-screen overlay showing real-time timeline
 */
export function ActivityView({
  visible,
  onClose,
  currentIteration,
  maxIterations,
  currentTaskId,
  currentTaskTitle,
  currentStatus,
  currentStartedAt,
  currentDurationMs,
  elapsedTime,
  isExecuting,
  subagentTree,
  subagentStats,
  iterations = [],
  activityEvents = [],
  timelineEvents = [],
}: ActivityViewProps): ReactNode {
  if (!visible) return null;

  // Keyboard handler for closing the view
  useKeyboard(
    useCallback((key: { name: string }) => {
      if (key.name === 'escape' || key.name === 'A') {
        onClose();
      }
    }, [onClose])
  );

  // Build current activity events (fallback if no real events provided)
  const currentEvents = useMemo(
    () => {
      // If activityEvents are provided, convert them to display format
      if (activityEvents.length > 0) {
        return activityEvents.map((event) => ({
          timestamp: event.timestamp,
          type: mapActivityEventType(event.eventType),
          description: event.description,
          severity: event.severity,
          category: event.category,
        }));
      }
      // If timelineEvents are provided, convert them to display format
      if (timelineEvents.length > 0) {
        return timelineEvents.map((event) => ({
          timestamp: event.timestamp,
          type: event.type,
          description: event.description,
          severity: event.severity,
          category: event.category,
        }));
      }
      // Otherwise build synthetic events from current iteration state
      return buildCurrentActivityEvents(currentStatus, currentStartedAt, currentDurationMs ?? 0, currentTaskId, currentTaskTitle);
    },
    [currentStatus, currentStartedAt, currentDurationMs, currentTaskId, currentTaskTitle, activityEvents, timelineEvents]
  );

  // Calculate max depth for subagent tree expansion
  const maxSubagentDepth = useMemo(() => {
    let max = 1;
    function traverse(nodes: SubagentTreeNode[], depth: number) {
      for (const node of nodes) {
        max = Math.max(max, depth);
        traverse(node.children, depth + 1);
      }
    }
    traverse(subagentTree, 1);
    return max;
  }, [subagentTree]);

  // Build summary stats
  const stats = useMemo(() => {
    const parts: string[] = [];
    if (subagentStats) {
      parts.push(`${subagentStats.totalSubagents} subagents`);
      if (subagentStats.failureCount > 0) {
        parts.push(`${subagentStats.failureCount} failed`);
      }
      if (subagentStats.maxDepth > 1) {
        parts.push(`max depth ${subagentStats.maxDepth}`);
      }
    } else if (subagentTree.length > 0) {
      const total = subagentTree.reduce((sum, node) => sum + 1 + countSubagentChildren(node), 0);
      parts.push(`${total} subagents active`);
    }
    return parts.join(' • ');
  }, [subagentStats, subagentTree]);

  // Count total subagents in tree
  function countSubagentChildren(node: SubagentTreeNode): number {
    return node.children.reduce((sum, child) => sum + 1 + countSubagentChildren(child), 0);
  }

  // Determine iteration progress display
  const iterationProgress = maxIterations > 0
    ? `Iteration ${currentIteration} of ${maxIterations}`
    : `Iteration ${currentIteration}`;

  // Current status display
  const statusIndicator = currentStatus ? statusIndicators[currentStatus] : '○';
  const statusColor = currentStatus ? statusColors[currentStatus] : colors.fg.muted;
  const statusLabel = currentStatus ? statusLabels[currentStatus] : 'Unknown';

  return (
    <box
      title="Activity View [Press 'A' or Esc to close]"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 1,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <box>
          <text fg={colors.accent.primary}>═══ Activity View ═══</text>
        </box>
        <box>
          <text fg={colors.fg.muted}>Press </text>
          <text fg={colors.fg.secondary}>Esc</text>
          <text fg={colors.fg.muted}> or </text>
          <text fg={colors.fg.secondary}>A</text>
          <text fg={colors.fg.muted}> to close</text>
        </box>
      </box>

      {/* Header separator */}
      <box
        style={{
          border: true,
          borderColor: colors.border.muted,
        }}
      />

      {/* Main content - scrollable */}
      <scrollbox style={{ flexGrow: 1, padding: 1 }}>
        {/* Current iteration status */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader title="Current Iteration" />
          <box
            style={{
              padding: 1,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: statusColor,
              flexDirection: 'column',
            }}
          >
            {/* Status row */}
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text>
                <span fg={statusColor}>{statusIndicator}</span>
                <span fg={colors.fg.primary}> {iterationProgress}</span>
              </text>
            </box>

            {/* Task info */}
            {currentTaskId && (
              <box style={{ flexDirection: 'row', marginBottom: 0 }}>
                <text fg={colors.fg.muted}>Task: </text>
                <text fg={colors.accent.primary}>{currentTaskId}</text>
                {currentTaskTitle && (
                  <text fg={colors.fg.secondary}> - {currentTaskTitle}</text>
                )}
              </box>
            )}

            {/* Duration row */}
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Status: </text>
              <text fg={statusColor}>{statusLabel}</text>
              {currentDurationMs !== undefined && currentDurationMs > 0 && (
                <text fg={colors.fg.muted}> ({formatDuration(currentDurationMs)})</text>
              )}
              {isExecuting && (
                <text fg={colors.accent.primary}> (running...)</text>
              )}
            </box>

            {/* Elapsed time */}
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Total elapsed: </text>
              <text fg={colors.accent.tertiary}>{formatElapsedTime(elapsedTime)}</text>
            </box>
          </box>
        </box>

        {/* Activity events timeline */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader title="Activity Timeline" />
          <box
            style={{
              padding: 1,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: colors.border.muted,
              flexDirection: 'column',
            }}
          >
            {currentEvents.length > 0 ? (
              currentEvents.map((event, index) => (
                <box
                  key={index}
                  style={{
                    flexDirection: 'row',
                    marginBottom: index < currentEvents.length - 1 ? 1 : 0,
                  }}
                >
                  <text>
                    <span fg={colors.fg.dim}>{formatTimestamp(event.timestamp)}</span>
                    <span fg={getEventColor(event.type)}> {getEventSymbol(event.type)} </span>
                    <span fg={colors.fg.secondary}>{event.description}</span>
                  </text>
                </box>
              ))
            ) : (
              <text fg={colors.fg.muted}>No activity yet - waiting for iteration to start</text>
            )}
          </box>
        </box>

        {/* Subagent activity section */}
        {(subagentTree.length > 0 || subagentStats) && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="Subagent Activity" />
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* Summary line */}
              {stats && (
                <box style={{ marginBottom: 1 }}>
                  <text fg={colors.fg.muted}>{stats}</text>
                </box>
              )}

              {/* Subagent tree */}
              {subagentTree.map((node) => (
                <SubagentTreeRow
                  key={node.state.id}
                  node={node}
                  depth={0}
                  maxDepth={maxSubagentDepth}
                />
              ))}

              {subagentTree.length === 0 && (
                <text fg={colors.fg.muted}>No subagents spawned yet</text>
              )}
            </box>
          </box>
        )}

        {/* Recent iterations summary */}
        {iterations.length > 0 && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="Recent Iterations" />
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* Show last 5 iterations in reverse order */}
              {[...iterations].reverse().slice(0, 5).map((iter) => {
                const iterStatusIndicator = statusIndicators[iter.status];
                const iterStatusColor = statusColors[iter.status];
                const duration = formatDuration(iter.durationMs);
                return (
                  <box
                    key={iter.iteration}
                    style={{
                      flexDirection: 'row',
                      marginBottom: 0,
                    }}
                  >
                    <text>
                      <span fg={iterStatusColor}>{iterStatusIndicator}</span>
                      <span fg={colors.fg.primary}> #{iter.iteration}</span>
                      <span fg={colors.fg.muted}> - {iter.task.id}</span>
                      <span fg={colors.fg.secondary}> ({iter.task.title})</span>
                      {duration && <span fg={colors.fg.dim}> - {duration}</span>}
                    </text>
                  </box>
                );
              })}
            </box>
          </box>
        )}

        {/* Footer hint */}
        <box style={{ marginTop: 1 }}>
          <text fg={colors.fg.dim}>
            Press 'A' or Esc to toggle this view
          </text>
        </box>
      </scrollbox>
    </box>
  );
}

/**
 * ABOUTME: ActivityView component for the Ralph TUI.
 * Full-screen overlay showing real-time timeline of agent activity.
 * Displays iteration events, subagent hierarchy, and execution progress.
 * Features improved visual design with better event indicators and readability.
 */

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { colors, formatElapsedTime, layout } from '../theme.js';
import type { IterationResult, IterationStatus, EngineSubagentStatus } from '../../engine/types.js';
import type { SubagentTreeNode } from '../../engine/types.js';
import type { SubagentTraceStats } from '../../logs/types.js';
import type { ActivityEvent } from '../../logs/activity-events.js';

/** Activity view header icon */
const ACTIVITY_ICON = '◎';

/** Timer icon for duration display */
const TIMER_ICON = '⏱';

/** Events icon for metrics */
const EVENTS_ICON = '✦';

/** Subagent icon */
const SUBAGENT_ICON = '⬡';

/** History icon for iterations */
const HISTORY_ICON = '◫';

/** Calendar icon for timestamps */
const CALENDAR_ICON = '◷';

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
 * Metrics computed from activity events
 */
export interface ActivityMetrics {
  totalEvents: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  totalSubagents: number;
  completedIterations: number;
  failedIterations: number;
}

/**
 * Props for the ActivityView component
 */
export interface ActivityViewProps {
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
  /** Pre-computed activity metrics (optional, will be computed from props if not provided) */
  activityMetrics?: ActivityMetrics;
}

/**
 * Status indicator symbols (aligned with Header.tsx patterns)
 */
const statusIndicatorsEnhanced: Record<IterationStatus, string> = {
  completed: '✓',
  running: '▶',
  failed: '✗',
  interrupted: '⊘',
  skipped: '⊖',
};

/**
 * Section icons for visual appeal
 */
const SECTION_ICONS = {
  activity: '◎',
  subagents: '⚙',
  iterations: '◉',
  current: '▶',
  metrics: '▊',
} as const;

/**
 * Status colors for iterations - using theme colors consistently
 */
const statusColorsEnhanced: Record<IterationStatus, string> = {
  completed: colors.status.success,
  running: colors.status.info,
  failed: colors.status.error,
  interrupted: colors.status.warning,
  skipped: colors.fg.muted,
};

/**
 * Status labels for display - UPPERCASE for visual consistency with Header.tsx
 */
const statusLabelsEnhanced: Record<IterationStatus, string> = {
  completed: 'Completed',
  running: 'Running',
  failed: 'Failed',
  interrupted: 'Interrupted',
  skipped: 'Skipped',
};

/**
 * Format an ISO timestamp for display - compact format
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Get the color for an activity event type - refined color scheme
 */
function getEventColor(type: TimelineEventDisplay['type'], severity?: string): string {
  // If severity is provided, use it for coloring
  if (severity === 'error') return colors.status.error;
  if (severity === 'warning') return colors.status.warning;
  if (severity === 'info') return colors.status.info;

  switch (type) {
    case 'started':
      return colors.status.info;
    case 'agent_running':
      return colors.accent.primary;
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
 * Get the symbol for an activity event type - refined symbols
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
      return '⏸';
    case 'skipped':
      return '○';
    default:
      return '●';
  }
}

/**
 * Format duration in human-readable format with improved formatting
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
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Smart truncation that preserves the end of the string if possible.
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Count total subagents in tree (including root nodes)
 */
function countSubagentChildren(node: SubagentTreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countSubagentChildren(child), 0);
}

/**
 * Compute activity metrics from events and state
 */
function computeActivityMetrics(
  activityEvents: ActivityEvent[],
  subagentTree: SubagentTreeNode[],
  iterations: IterationResult[]
): ActivityMetrics {
  const errorCount = activityEvents.filter((e) => e.severity === 'error').length;
  const warningCount = activityEvents.filter((e) => e.severity === 'warning').length;
  const infoCount = activityEvents.filter((e) => e.severity === 'info').length;

  const totalSubagents = subagentTree.reduce(
    (sum, node) => sum + 1 + countSubagentChildren(node),
    0
  );

  const completedIterations = iterations.filter((i) => i.status === 'completed').length;
  const failedIterations = iterations.filter((i) => i.status === 'failed').length;

  return {
    totalEvents: activityEvents.length,
    errorCount,
    warningCount,
    infoCount,
    totalSubagents,
    completedIterations,
    failedIterations,
  };
}

/**
 * Compact stat item for metrics display - improved styling
 */
function MetricItem({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}): ReactNode {
  return (
    <text>
      <span fg={colors.fg.muted}>{icon} </span>
      <span fg={colors.fg.muted}>{label}:</span> <span fg={color}>{String(value)}</span>
    </text>
  );
}

/**
 * Activity metrics header section showing summary statistics
 * Enhanced with bracketed format and pipe separators following Header.tsx patterns
 */
function ActivityMetricsHeader({
  metrics,
}: {
  metrics: ActivityMetrics;
}): ReactNode {
  const hasErrors = metrics.errorCount > 0;
  const hasWarnings = metrics.warningCount > 0;
  const hasSubagents = metrics.totalSubagents > 0;
  const hasIterations = metrics.completedIterations > 0 || metrics.failedIterations > 0;

  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: layout.padding.small,
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: hasErrors ? colors.status.error : colors.border.normal,
        marginBottom: layout.padding.small,
      }}
    >
      {/* Left side: Event counts with improved visual hierarchy */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <MetricItem icon={SECTION_ICONS.activity} label="Events" value={metrics.totalEvents} color={colors.fg.primary} />
        {metrics.infoCount > 0 && (
          <MetricItem icon="ℹ" label="Info" value={metrics.infoCount} color={colors.status.info} />
        )}
        {hasWarnings && (
          <MetricItem icon="⚠" label="Warnings" value={metrics.warningCount} color={colors.status.warning} />
        )}
        {hasErrors && (
          <MetricItem icon="✗" label="Errors" value={metrics.errorCount} color={colors.status.error} />
        )}
      </box>

      {/* Right side: Progress and subagents */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        {hasIterations && (
          <>
            {metrics.completedIterations > 0 && (
              <MetricItem
                label="Done"
                value={metrics.completedIterations}
                color={colors.status.success}
                icon="✓"
              />
            )}
            {metrics.failedIterations > 0 && (
              <MetricItem
                label="Failed"
                value={metrics.failedIterations}
                color={colors.status.error}
                icon="✗"
              />
            )}
          </>
        )}
        {hasSubagents && (
          <MetricItem
            label="Subagents"
            value={metrics.totalSubagents}
            color={colors.accent.primary}
            icon={SECTION_ICONS.subagents}
          />
        )}
      </box>
    </box>
  );
}

/**
 * Status icon for subagent based on its completion state with enhanced symbols
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
  /** Maximum width for description truncation */
  maxWidth: number;
}

/**
 * Render a single subagent tree row with indentation
 * Enhanced with bracketed status indicators following Header.tsx patterns
 */
function SubagentTreeRow({ node, depth, maxDepth, maxWidth }: SubagentRowProps): ReactNode {
  const { state } = node;
  const statusColor = getSubagentStatusColor(state.status);
  const statusIcon = getSubagentStatusIcon(state.status);
  const indent = '  '.repeat(depth);
  const hasChildren = node.children.length > 0;
  const expandIcon = hasChildren ? (depth < maxDepth ? '▼' : '▶') : ' ';
  const duration = state.durationMs !== undefined ? ` [${formatDuration(state.durationMs)}]` : '';

  // Truncate long descriptions for better readability (adaptive)
  const truncatedDescription = truncateText(state.description, maxWidth);

  return (
    <>
      <box
        style={{
          flexDirection: 'row',
          paddingLeft: layout.padding.small,
          paddingRight: layout.padding.small,
          marginBottom: 0,
        }}
      >
        <text>
          <span fg={colors.fg.dim}>{indent}</span>
          <span fg={colors.fg.muted}>{expandIcon}</span>
          <span fg={statusColor}> {statusIcon}</span>
          <span fg={colors.accent.tertiary}> [{state.type}]</span>
          <span fg={colors.fg.secondary}> {truncatedDescription}</span>
          <span fg={colors.fg.muted}>{duration}</span>
        </text>
      </box>
      {node.children.map((child) => (
        <SubagentTreeRow
          key={child.state.id}
          node={child}
          depth={depth + 1}
          maxDepth={maxDepth}
          maxWidth={maxWidth}
        />
      ))}
    </>
  );
}

/**
 * Section header component with enhanced styling following Header.tsx patterns
 * Uses pipe separators and distinctive accent colors
 */
function SectionHeader({ icon, title }: { icon: string; title: string }): ReactNode {
  return (
    <box style={{ marginBottom: 0 }}>
      <text>
        <span fg={colors.accent.primary}>{icon}</span>
        <span fg={colors.fg.muted}> </span>
        <span fg={colors.accent.primary}>{title}</span>
      </text>
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
 * ActivityView component - view tab showing real-time timeline with improved visual design
 */
export function ActivityView({
  currentIteration,
  maxIterations,
  currentTaskId,
  currentTaskTitle,
  currentStatus,
  currentDurationMs,
  elapsedTime,
  isExecuting,
  subagentTree,
  subagentStats,
  iterations = [],
  activityEvents = [],
  timelineEvents = [],
  activityMetrics: providedMetrics,
}: ActivityViewProps): ReactNode {
  // Use terminal dimensions for responsive layout
  const { width } = useTerminalDimensions();

  // Calculate adaptive truncation widths based on terminal size
  const taskIdTruncWidth = width < 80 ? 20 : width < 120 ? 28 : 35;
  const taskTitleTruncWidth = width < 80 ? 40 : width < 120 ? 55 : 65;

  // Calculate adaptive max width for subagent descriptions
  const subagentDescWidth = Math.max(30, Math.min(50, width - 40));

  // Current status display with enhanced indicators
  const statusIndicator = currentStatus ? statusIndicatorsEnhanced[currentStatus] : '○';
  const statusColor = currentStatus ? statusColorsEnhanced[currentStatus] : colors.fg.muted;
  const statusLabel = currentStatus ? statusLabelsEnhanced[currentStatus] : 'Unknown';

  // Truncate task info for better display (adaptive truncation)
  const truncatedTaskId = truncateText(currentTaskId || '', taskIdTruncWidth);
  const truncatedTaskTitle = truncateText(currentTaskTitle || '', taskTitleTruncWidth);

  // Determine iteration progress display
  const iterationProgress = maxIterations > 0
    ? `Iteration ${currentIteration} of ${maxIterations}`
    : `Iteration ${currentIteration}`;

  // Build current activity events (fallback if no real events provided)
  const currentEvents = useMemo(() => {
    if (activityEvents.length > 0) {
      return activityEvents.map((event) => ({
        timestamp: event.timestamp,
        type: mapActivityEventType(event.eventType),
        description: event.description,
        severity: event.severity,
        category: event.category,
      }));
    }
    if (timelineEvents.length > 0) {
      return timelineEvents.map((event) => ({
        timestamp: event.timestamp,
        type: event.type,
        description: event.description,
        severity: event.severity,
        category: event.category,
      }));
    }
    return [];
  }, [activityEvents, timelineEvents]);

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

  // Compute activity metrics (use provided or compute from props)
  const metrics = useMemo(() => {
    if (providedMetrics) {
      return providedMetrics;
    }
    return computeActivityMetrics(activityEvents, subagentTree, iterations);
  }, [providedMetrics, activityEvents, subagentTree, iterations]);

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
      }}
    >
      {/* Header with status indicator and title */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: layout.padding.small,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <box style={{ flexDirection: 'row', alignItems: 'center' }}>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.muted}> </span>
            <span fg={colors.accent.primary}>{ACTIVITY_ICON}</span>
            <span fg={colors.fg.muted}> </span>
            <span fg={colors.accent.primary}>Activity View</span>
          </text>
        </box>
        <box style={{ flexDirection: 'row', alignItems: 'center' }}>
          <text fg={colors.fg.muted}>
            <span fg={colors.fg.muted}>{TIMER_ICON}</span>
            <span fg={colors.fg.muted}> </span>
            <span fg={colors.fg.muted}>Total:</span>{' '}
            <span fg={colors.accent.tertiary}>{formatElapsedTime(elapsedTime)}</span>
          </text>
        </box>
      </box>

      {/* Header separator - cleaner design */}
      <box
        style={{
          border: true,
          borderColor: colors.border.muted,
        }}
      />

      {/* Activity metrics header */}
      <ActivityMetricsHeader metrics={metrics} />

      {/* Main content - scrollable */}
      <scrollbox style={{ flexGrow: 1, padding: 1 }}>
        {/* Current iteration status - improved layout */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader icon="▶" title="Current Iteration" />
          <box
            style={{
              padding: layout.padding.small,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: statusColor,
              flexDirection: 'column',
            }}
          >
            {/* Status row with improved layout */}
            <box style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 0 }}>
              <text>
                <span fg={statusColor}>{statusIndicator}</span>
                <span fg={colors.fg.muted}> </span>
                <span fg={colors.fg.primary}>{iterationProgress}</span>
                <span fg={colors.status.success}>{isExecuting ? ' (running)' : ''}</span>
              </text>
            </box>

            {/* Task info with better formatting */}
            {currentTaskId && (
              <box style={{ flexDirection: 'row', marginBottom: 0 }}>
                <text fg={colors.fg.muted}>Task: </text>
                <text fg={colors.accent.primary}>{truncatedTaskId}</text>
                {currentTaskTitle && (
                  <text fg={colors.fg.secondary}> - {truncatedTaskTitle}</text>
                )}
              </box>
            )}

            {/* Duration and status with clear labels */}
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Status: </text>
              <text fg={statusColor}>{statusLabel}</text>
              {currentDurationMs !== undefined && currentDurationMs > 0 && (
                <text fg={colors.fg.muted}> ({formatDuration(currentDurationMs)})</text>
              )}
            </box>

            {/* Elapsed time with icon */}
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>{TIMER_ICON} Elapsed: </text>
              <text fg={colors.accent.tertiary}>{formatElapsedTime(elapsedTime)}</text>
            </box>
          </box>
        </box>

        {/* Activity events timeline with improved visual design */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader icon={EVENTS_ICON} title="Activity Timeline" />
          <box
            style={{
              padding: layout.padding.small,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: colors.border.muted,
              flexDirection: 'column',
            }}
          >
            {currentEvents.length > 0 ? (
              currentEvents.map((event, index) => {
                const eventColor = getEventColor(event.type, event.severity);
                const eventSymbol = getEventSymbol(event.type);
                const isLast = index === currentEvents.length - 1;

                return (
                  <box
                    key={index}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: isLast ? 0 : 1,
                    }}
                  >
                    {/* Timestamp with icon */}
                    <text>
                      <span fg={colors.fg.dim}>
                        <span fg={colors.fg.muted}>{CALENDAR_ICON}</span>
                        <span fg={colors.fg.muted}> </span>
                        {formatTimestamp(event.timestamp)}
                      </span>
                      <span fg={colors.fg.muted}> </span>
                    </text>

                    {/* Event indicator with color */}
                    <text>
                      <span fg={eventColor}>{eventSymbol}</span>
                      <span fg={colors.fg.muted}> </span>
                    </text>

                    {/* Event description */}
                    <text>
                      <span fg={colors.fg.secondary}>{event.description}</span>
                    </text>

                    {/* Severity badge if present */}
                    {event.severity && (
                      <text>
                        <span fg={colors.fg.muted}> [</span>
                        <span fg={eventColor}>{event.severity}</span>
                        <span fg={colors.fg.muted}>]</span>
                      </text>
                    )}
                  </box>
                );
              })
            ) : (
              <text fg={colors.fg.muted}>No activity yet - waiting for iteration to start</text>
            )}
          </box>
        </box>

        {/* Subagent activity section with improved styling */}
        {(subagentTree.length > 0 || subagentStats) && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader icon={SUBAGENT_ICON} title="Subagent Activity" />
            <box
              style={{
                padding: layout.padding.small,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* Summary line - improved styling */}
              {subagentStats && (
                <box style={{ marginBottom: 1 }}>
                <text fg={colors.fg.muted}>
                  {String(subagentStats.totalSubagents)} subagents
                  {subagentStats.failureCount > 0 ? ` ✗${String(subagentStats.failureCount)}` : ''}
                  {subagentStats.maxDepth > 1 ? ` (max depth ${String(subagentStats.maxDepth)})` : ''}
                </text>
              </box>
            )}

              {/* Subagent tree */}
              {subagentTree.map((node) => (
                <SubagentTreeRow
                  key={node.state.id}
                  node={node}
                  depth={0}
                  maxDepth={maxSubagentDepth}
                  maxWidth={subagentDescWidth}
                />
              ))}

              {subagentTree.length === 0 && (
                <text fg={colors.fg.muted}>No subagents spawned yet</text>
              )}
            </box>
          </box>
        )}

        {/* Recent iterations summary with improved layout */}
        {iterations.length > 0 && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader icon={HISTORY_ICON} title="Recent Iterations" />
            <box
              style={{
                padding: layout.padding.small,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* Show last 5 iterations in reverse order */}
              {[...iterations].reverse().slice(0, 5).map((iter) => {
                const iterStatusIndicator = statusIndicatorsEnhanced[iter.status];
                const iterStatusColor = statusColorsEnhanced[iter.status];
                const duration = formatDuration(iter.durationMs);
                const truncatedIterTaskId = truncateText(iter.task.id, 25);
                const truncatedIterTaskTitle = truncateText(iter.task.title, 35);

                return (
                  <box
                    key={iter.iteration}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 0,
                    }}
                  >
                    <text>
                      <span fg={iterStatusColor}>{iterStatusIndicator}</span>
                      <span fg={colors.fg.muted}> </span>
                      <span fg={colors.fg.secondary}>Iteration {String(iter.iteration)}:</span>
                      <span fg={colors.accent.primary}> {truncatedIterTaskId}</span>
                      <span fg={colors.fg.dim}> - </span>
                      <span fg={colors.fg.secondary}>{truncatedIterTaskTitle}</span>
                      <span fg={colors.fg.muted}> ({duration})</span>
                    </text>
                  </box>
                );
              })}
            </box>
          </box>
        )}
      </scrollbox>
    </box>
  );
}

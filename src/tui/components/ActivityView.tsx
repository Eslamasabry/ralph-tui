/**
// OURS:
 * ABOUTME: ActivityView component for the Ralph TUI - Facelift version.
 * Full-screen overlay showing real-time timeline of agent activity.
 * Displays iteration events, subagent hierarchy, and execution progress.
// OURS:
 * Features improved visual design with better event indicators and readability.
// THEIRS:
 * Redesigned with improved visual hierarchy, better event indicators,
 * optimized spacing, and enhanced readability. (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
// THEIRS:
 * ABOUTME: Modernized ActivityView component for Ralph TUI.
 * Full-screen overlay showing real-time timeline of agent activity with enhanced visual hierarchy.
 * Features bracketed status indicators, pipe separators, and improved readability following Header.tsx patterns. (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
 */

import type { ReactNode } from 'react';
import { useMemo } from 'react';
<<<<<<< HEAD
import { colors, formatElapsedTime, statusIndicators as themeStatusIndicators } from '../theme.js';
=======
import { colors, formatElapsedTime, layout } from '../theme.js';
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
<<<<<<< HEAD
 * Status indicator symbols with enhanced visibility
=======
 * Status indicator symbols (aligned with Header.tsx patterns)
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
 */
const statusIndicatorsEnhanced: Record<IterationStatus, string> = {
  completed: '✓',
  running: '▶',
  failed: '✗',
  interrupted: '⊘',
  skipped: '⊖',
};

/**
 * Status colors for iterations with improved contrast
=======
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
 * Status indicator symbols - refined for better visual clarity
 */
const iterationStatusIndicators: Record<IterationStatus, string> = {
  completed: themeStatusIndicators.done,
  running: themeStatusIndicators.running,
  failed: themeStatusIndicators.error,
  interrupted: themeStatusIndicators.paused,
  skipped: '○',
};

/**
 * Status colors for iterations - using theme colors consistently
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
const statusLabelsEnhanced: Record<IterationStatus, string> = {
  completed: 'Completed',
  running: 'Running',
  failed: 'Failed',
  interrupted: 'Interrupted',
  skipped: 'Skipped',
};

/**
<<<<<<< HEAD
 * Format an ISO timestamp for display in activity timeline
=======
 * Format an ISO timestamp for display - compact format
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
<<<<<<< HEAD
 * Get the enhanced color for an activity event type with improved contrast
=======
 * Get the color for an activity event type - refined color scheme
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
 * Get the enhanced symbol for an activity event type
=======
 * Get the symbol for an activity event type - refined symbols
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
=======
const statusLabels: Record<IterationStatus, string> = {
  completed: 'COMPLETED',
  running: 'RUNNING',
  failed: 'FAILED',
  interrupted: 'INTERRUPTED',
  skipped: 'SKIPPED',
};

/**
 * Get styled status display following Header.tsx patterns.
 * Returns bracketed indicator with optimized color treatment.
 */
function getStatusDisplay(status: IterationStatus | undefined): {
  indicator: string;
  color: string;
  label: string;
  bracketColor: string;
} {
  if (!status) {
    return {
      indicator: '○',
      color: colors.fg.muted,
      label: 'UNKNOWN',
      bracketColor: colors.fg.dim,
    };
  }

  const isFailureState = status === 'failed';

  return {
    indicator: statusIndicators[status],
    color: statusColors[status],
    label: statusLabels[status],
    bracketColor: isFailureState ? colors.status.error : colors.fg.dim,
  };
}

/**
 * Get enhanced event display with bracketed format for instant scannability.
 */
function getEventDisplay(type: TimelineEventDisplay['type']): {
  symbol: string;
  color: string;
  label: string;
  bracketColor: string;
} {
  const isError = type === 'failed';
  const bracketColor = isError ? colors.status.error : colors.fg.dim;

  switch (type) {
    case 'started':
      return { symbol: '▶', color: colors.accent.primary, label: 'STARTED', bracketColor };
    case 'agent_running':
      return { symbol: '⚙', color: colors.accent.tertiary, label: 'EXECUTING', bracketColor };
    case 'task_completed':
      return { symbol: '✓', color: colors.status.success, label: 'TASK DONE', bracketColor };
    case 'completed':
      return { symbol: '✓', color: colors.status.success, label: 'COMPLETED', bracketColor };
    case 'failed':
      return { symbol: '✗', color: colors.status.error, label: 'FAILED', bracketColor: colors.status.error };
    case 'interrupted':
      return { symbol: '⊘', color: colors.status.warning, label: 'INTERRUPTED', bracketColor };
    case 'skipped':
      return { symbol: '⊖', color: colors.fg.muted, label: 'SKIPPED', bracketColor };
    default:
      return { symbol: '•', color: colors.fg.secondary, label: 'EVENT', bracketColor };
  }
}

/**
 * Get metric display with bracketed format for consistency.
 */
function getMetricDisplay(
  label: string,
  value: number,
  color: string,
  isError: boolean = false
): { display: ReactNode; bracketColor: string } {
  return {
    display: (
      <text>
        <span fg={isError ? colors.status.error : colors.fg.dim}>[</span>
        <span fg={color}>{value}</span>
        <span fg={isError ? colors.status.error : colors.fg.dim}>]</span>
        <span fg={colors.fg.muted}> {label}</span>
      </text>
    ),
    bracketColor: isError ? colors.status.error : colors.fg.dim,
  };
}

/**
 * Format an ISO timestamp for display with bracketed format
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `[${time}]`;
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Smart truncation that preserves the end of the string if possible.
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
=======
 * Get subagent status display with bracketed format
 */
function getSubagentStatusDisplay(status: EngineSubagentStatus): {
  icon: string;
  color: string;
  label: string;
  bracketColor: string;
} {
  switch (status) {
    case 'running':
      return {
        icon: '◐',
        color: colors.status.info,
        label: 'RUNNING',
        bracketColor: colors.fg.dim,
      };
    case 'completed':
      return {
        icon: '✓',
        color: colors.status.success,
        label: 'COMPLETED',
        bracketColor: colors.fg.dim,
      };
    case 'error':
      return {
        icon: '✗',
        color: colors.status.error,
        label: 'ERROR',
        bracketColor: colors.status.error,
      };
    default:
      return {
        icon: '○',
        color: colors.fg.muted,
        label: 'UNKNOWN',
        bracketColor: colors.fg.dim,
      };
  }
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
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
=======
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
<<<<<<< HEAD
 * Compact stat item for metrics display with icon prefix
=======
 * Compact stat item for metrics display - improved styling
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
 */
function MetricItem({
  icon,
  label,
  value,
  color,
<<<<<<< HEAD
  showWhenZero = false,
=======
  icon,
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
<<<<<<< HEAD
  showWhenZero?: boolean;
=======
  icon?: string;
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
}): ReactNode {
  if (!showWhenZero && value === 0) return null;

  return (
    <text>
<<<<<<< HEAD
      <span fg={color}>{icon}</span>
      <span fg={colors.fg.muted}> </span>
      <span fg={colors.fg.muted}>{label}:</span>{' '}
      <span fg={color}>{value}</span>
=======
      {icon && <span fg={colors.fg.muted}>{icon} </span>}
      <span fg={colors.fg.muted}>{label}:</span> <span fg={color}>{value}</span>
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
    </text>
  );
}

/**
<<<<<<< HEAD
 * Activity metrics header section showing summary statistics with improved visual design
=======
 * Activity metrics header section showing summary statistics - facelift version
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
 * Activity metrics header section showing summary statistics
 * Enhanced with bracketed format and pipe separators following Header.tsx patterns
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
        borderColor: hasErrors ? colors.status.error : hasWarnings ? colors.status.warning : colors.border.normal,
        marginBottom: 1,
      }}
    >
<<<<<<< HEAD
      {/* Left side: Event counts with icon prefix */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <MetricItem icon={EVENTS_ICON} label="Events" value={metrics.totalEvents} color={colors.accent.primary} showWhenZero />
        <MetricItem icon="✗" label="Err" value={metrics.errorCount} color={colors.status.error} showWhenZero />
        <MetricItem icon="⚠" label="Warn" value={metrics.warningCount} color={colors.status.warning} showWhenZero />
        <MetricItem icon="ℹ" label="Info" value={metrics.infoCount} color={colors.status.info} showWhenZero />
=======
      {/* Left side: Event counts with improved visual hierarchy */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        <MetricItem label="Events" value={metrics.totalEvents} color={colors.fg.primary} icon={SECTION_ICONS.activity} />
        {metrics.infoCount > 0 && (
          <MetricItem label="Info" value={metrics.infoCount} color={colors.status.info} />
        )}
        {hasWarnings && (
          <MetricItem label="Warnings" value={metrics.warningCount} color={colors.status.warning} />
        )}
        {hasErrors && (
          <MetricItem label="Errors" value={metrics.errorCount} color={colors.status.error} />
        )}
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
        borderColor: hasErrors ? colors.status.error : colors.border.normal,
        marginBottom: layout.padding.small,
      }}
    >
      {/* Left side: Event counts */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
        {getMetricDisplay('EVENTS', metrics.totalEvents, colors.fg.primary).display}
        <text fg={colors.fg.dim}>│</text>
        {metrics.errorCount > 0 && (
          <>
            {getMetricDisplay('ERRORS', metrics.errorCount, colors.status.error, true).display}
            <text fg={colors.fg.dim}>│</text>
          </>
        )}
        {metrics.warningCount > 0 && (
          <>
            {getMetricDisplay('WARNINGS', metrics.warningCount, colors.status.warning).display}
            <text fg={colors.fg.dim}>│</text>
          </>
        )}
        {getMetricDisplay('INFO', metrics.infoCount, colors.fg.secondary).display}
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
      </box>

      {/* Right side: Progress and subagents */}
      <box style={{ flexDirection: 'row', gap: 2 }}>
<<<<<<< HEAD
<<<<<<< HEAD
        {metrics.completedIterations > 0 && (
          <MetricItem icon="✓" label="Done" value={metrics.completedIterations} color={colors.status.success} showWhenZero />
        )}
        {metrics.failedIterations > 0 && (
          <MetricItem icon="✗" label="Fail" value={metrics.failedIterations} color={colors.status.error} showWhenZero />
        )}
        {hasSubagents && (
          <MetricItem icon={SUBAGENT_ICON} label="Subagents" value={metrics.totalSubagents} color={colors.accent.primary} showWhenZero />
=======
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
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
        {metrics.completedIterations > 0 && (
          <>
            {getMetricDisplay('DONE', metrics.completedIterations, colors.status.success).display}
            <text fg={colors.fg.dim}>│</text>
          </>
        )}
        {metrics.failedIterations > 0 && (
          <>
            {getMetricDisplay('FAILED', metrics.failedIterations, colors.status.error, true).display}
            <text fg={colors.fg.dim}>│</text>
          </>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
        )}
        {hasSubagents && getMetricDisplay('SUBAGENTS', metrics.totalSubagents, colors.accent.primary).display}
      </box>
    </box>
  );
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
<<<<<<< HEAD
<<<<<<< HEAD
 * Render a single subagent tree row with improved visual design
=======
 * Render a single subagent tree row with improved indentation and hierarchy
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
 * Render a single subagent tree row with indentation
 * Enhanced with bracketed status indicators following Header.tsx patterns
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
 */
function SubagentTreeRow({ node, depth, maxDepth }: SubagentRowProps): ReactNode {
  const { state } = node;
  const statusDisplay = getSubagentStatusDisplay(state.status);
  const indent = '  '.repeat(depth);
<<<<<<< HEAD
  const hasChildren = node.children.length > 0;
  const expandIcon = hasChildren ? (depth < maxDepth ? '▼' : '▶') : ' ';
  const duration = state.durationMs !== undefined ? ` [${formatDuration(state.durationMs)}]` : '';
=======
  const expandIcon = node.children.length > 0 ? (depth < maxDepth ? '▼' : '▶') : ' ';
  const duration = state.durationMs !== undefined ? ` (${formatDuration(state.durationMs)})` : '';
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)

  // Truncate long descriptions for better readability
  const maxDescWidth = 50;
  const truncatedDescription = truncateText(state.description, maxDescWidth);

  // Determine agent type display
  const typeDisplay = `[${state.type}]`;

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
<<<<<<< HEAD
          <span fg={statusColor}> {statusIcon}</span>
<<<<<<< HEAD
          <span fg={colors.accent.tertiary}> [{state.type}]</span>
=======
          <span fg={statusDisplay.bracketColor}>[</span>
          <span fg={statusDisplay.color}>{statusDisplay.icon}</span>
          <span fg={statusDisplay.bracketColor}>]</span>
          <span fg={colors.accent.tertiary}> [{state.type.toUpperCase()}]</span>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
          <span fg={colors.fg.secondary}> {state.description}</span>
          <span fg={colors.fg.dim}>{duration}</span>
=======
          <span fg={colors.accent.tertiary}> {typeDisplay}</span>
          <span fg={colors.fg.secondary}> {truncatedDescription}</span>
          <span fg={colors.fg.muted}>{duration}</span>
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
<<<<<<< HEAD
 * Section header component with consistent styling using icon prefix
=======
 * Section header component with enhanced styling following Header.tsx patterns
 * Uses pipe separators and distinctive accent colors
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
 */
function SectionHeader({ icon, title }: { icon: string; title: string }): ReactNode {
  return (
    <box style={{ marginBottom: 0 }}>
<<<<<<< HEAD
      <text>
        <span fg={colors.accent.primary}>{icon}</span>
        <span fg={colors.fg.muted}> </span>
        <span fg={colors.accent.primary}>{title}</span>
=======
 * Section header component - improved styling with icon
 */
function SectionHeader({ title, icon }: { title: string; icon?: string }): ReactNode {
  return (
    <box style={{ marginBottom: 1 }}>
      <text fg={colors.accent.primary}>
        {icon && <span>{icon} </span>}
        <span>{title}</span>
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
      </text>
=======
      <text fg={colors.accent.primary}>│ {title.toUpperCase()}</text>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
 * ActivityView component - view tab showing real-time timeline with improved visual design
=======
 * ActivityView component - facelift version with improved visual design
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
 */
export function ActivityView({
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
  activityMetrics: providedMetrics,
}: ActivityViewProps): ReactNode {

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
    return node.children.reduce((sum, _child) => sum + 1 + countSubagentChildren(node), 0);
  }

  // Compute activity metrics (use provided or compute from props)
  const metrics = useMemo(() => {
    if (providedMetrics) {
      return providedMetrics;
    }
    return computeActivityMetrics(activityEvents, subagentTree, iterations);
  }, [providedMetrics, activityEvents, subagentTree, iterations]);

  // Determine iteration progress display with bracketed format
  const iterationProgress = maxIterations > 0
    ? `ITERATION ${currentIteration} OF ${maxIterations}`
    : `ITERATION ${currentIteration}`;

<<<<<<< HEAD
<<<<<<< HEAD
  // Current status display with enhanced indicators
  const statusIndicator = currentStatus ? statusIndicatorsEnhanced[currentStatus] : '○';
  const statusColor = currentStatus ? statusColorsEnhanced[currentStatus] : colors.fg.muted;
  const statusLabel = currentStatus ? statusLabelsEnhanced[currentStatus] : 'Unknown';
=======
  // Current status display
  const statusIndicator = currentStatus ? iterationStatusIndicators[currentStatus] : '○';
  const statusColor = currentStatus ? statusColors[currentStatus] : colors.fg.muted;
  const statusLabel = currentStatus ? statusLabels[currentStatus] : 'Unknown';
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)

  // Truncate task info for better display
  const truncatedTaskId = truncateText(currentTaskId || '', 30);
  const truncatedTaskTitle = truncateText(currentTaskTitle || '', 60);
=======
  // Current status display using helper function
  const statusDisplay = getStatusDisplay(currentStatus);
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
      }}
    >
<<<<<<< HEAD
      {/* Header with status indicator and title */}
=======
      {/* Header - simplified and cleaner */}
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: layout.padding.small,
          backgroundColor: colors.bg.secondary,
        }}
      >
<<<<<<< HEAD
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
=======
        <box>
<<<<<<< HEAD
          <text fg={colors.accent.primary}>Activity View</text>
        </box>
        <box style={{ flexDirection: 'row', gap: 2 }}>
          <text fg={colors.fg.muted}>
            <span fg={colors.accent.tertiary}>⏱</span> {formatElapsedTime(elapsedTime)}
          </text>
          {isExecuting && (
            <text fg={colors.status.success}>● Running</text>
          )}
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
          <text>
            <span fg={colors.fg.dim}>[</span>
            <span fg={colors.accent.primary}>▶</span>
            <span fg={colors.accent.primary}> ACTIVITY VIEW</span>
            <span fg={colors.fg.dim}>]</span>
          </text>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
        {/* Current iteration status - improved layout */}
        <box style={{ marginBottom: 2 }}>
<<<<<<< HEAD
          <SectionHeader icon="▶" title="Current Iteration" />
=======
          <SectionHeader title="Current Iteration" icon={SECTION_ICONS.current} />
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
        {/* Current iteration status */}
        <box style={{ marginBottom: layout.padding.medium }}>
          <SectionHeader title="Current Iteration" />
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
          <box
            style={{
              padding: layout.padding.small,
              backgroundColor: colors.bg.secondary,
              border: true,
              borderColor: statusDisplay.color,
              flexDirection: 'column',
            }}
          >
<<<<<<< HEAD
<<<<<<< HEAD
            {/* Status row with improved layout */}
            <box style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 0 }}>
=======
            {/* Status row with improved visual hierarchy */}
=======
            {/* Status row with bracketed format */}
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
              <text>
<<<<<<< HEAD
                <span fg={statusColor}>{statusIndicator}</span>
                <span fg={colors.fg.muted}> </span>
                <span fg={colors.fg.primary}>{iterationProgress}</span>
                {isExecuting && (
                  <span fg={colors.status.success}> (running)</span>
                )}
=======
                <span fg={statusDisplay.bracketColor}>[</span>
                <span fg={statusDisplay.color}>{statusDisplay.indicator}</span>
                <span fg={statusDisplay.color}> {statusDisplay.label}</span>
                <span fg={statusDisplay.bracketColor}>]</span>
                <span fg={colors.fg.dim}> │ </span>
                <span fg={colors.accent.primary}>{iterationProgress}</span>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
              </text>
            </box>

<<<<<<< HEAD
            {/* Task info with better formatting */}
=======
            {/* Task info - improved with better spacing */}
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
            {currentTaskId && (
              <box style={{ flexDirection: 'row', marginBottom: 0 }}>
<<<<<<< HEAD
                <text fg={colors.fg.muted}>Task: </text>
                <text fg={colors.accent.primary}>{truncatedTaskId}</text>
                {currentTaskTitle && (
                  <text fg={colors.fg.secondary}> - {truncatedTaskTitle}</text>
                )}
=======
                <text>
                  <span fg={colors.fg.muted}>TASK: </span>
                  <span fg={colors.accent.primary}>{currentTaskId}</span>
                  {currentTaskTitle && (
                    <>
                      <span fg={colors.fg.dim}> │ </span>
                      <span fg={colors.fg.secondary}>{currentTaskTitle}</span>
                    </>
                  )}
                </text>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
              </box>
            )}

<<<<<<< HEAD
            {/* Duration and status with clear labels */}
=======
            {/* Duration row - cleaner display */}
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
<<<<<<< HEAD
              <text fg={colors.fg.muted}>Status: </text>
              <text fg={statusColor}>{statusLabel}</text>
              {currentDurationMs !== undefined && currentDurationMs > 0 && (
                <text fg={colors.fg.muted}> ({formatDuration(currentDurationMs)})</text>
              )}
<<<<<<< HEAD
=======
              <text>
                <span fg={colors.fg.muted}>DURATION: </span>
                {currentDurationMs !== undefined && currentDurationMs > 0 ? (
                  <span fg={colors.accent.tertiary}>{formatDuration(currentDurationMs)}</span>
                ) : (
                  <span fg={colors.fg.muted}>N/A</span>
                )}
                {isExecuting && (
                  <>
                    <span fg={colors.fg.dim}> │ </span>
                    <span fg={colors.accent.primary}>(EXECUTING...)</span>
                  </>
                )}
              </text>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
            </box>

            {/* Elapsed time with icon */}
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
<<<<<<< HEAD
              <text fg={colors.fg.muted}>{TIMER_ICON} Elapsed: </text>
              <text fg={colors.accent.tertiary}>{formatElapsedTime(elapsedTime)}</text>
=======
              <text>
                <span fg={colors.fg.muted}>TOTAL ELAPSED: </span>
                <span fg={colors.accent.tertiary}>{formatElapsedTime(elapsedTime)}</span>
              </text>
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
            </box>
          </box>
        </box>

<<<<<<< HEAD
        {/* Activity events timeline with improved visual design */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader icon={EVENTS_ICON} title="Activity Timeline" />
=======
              {isExecuting && (
                <text fg={colors.accent.primary}> (running…)</text>
              )}
            </box>
          </box>
        </box>

        {/* Activity events timeline - improved visual design */}
        <box style={{ marginBottom: 2 }}>
          <SectionHeader title="Activity Timeline" icon={SECTION_ICONS.activity} />
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
        {/* Activity events timeline */}
        <box style={{ marginBottom: layout.padding.medium }}>
          <SectionHeader title="Activity Timeline" />
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
<<<<<<< HEAD
<<<<<<< HEAD
              currentEvents.map((event, index) => {
                const eventColor = getEventColor(event.type, event.severity);
                const eventSymbol = getEventSymbol(event.type);
                const isLast = index === currentEvents.length - 1;

=======
              currentEvents.map((event, index) => {
                const eventDisplay = getEventDisplay(event.type);
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
                return (
                  <box
                    key={index}
                    style={{
                      flexDirection: 'row',
<<<<<<< HEAD
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
=======
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
                    <span> </span>
                    <span fg={getEventColor(event.type)}>{getEventSymbol(event.type)}</span>
                    <span> </span>
                    <span fg={colors.fg.secondary}>{event.description}</span>
                  </text>
                </box>
              ))
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
                      marginBottom: index < currentEvents.length - 1 ? 1 : 0,
                    }}
                  >
                    <text>
                      <span fg={colors.fg.dim}>{formatTimestamp(event.timestamp)}</span>
                      <span fg={colors.fg.dim}> │ </span>
                      <span fg={eventDisplay.bracketColor}>[</span>
                      <span fg={eventDisplay.color}>{eventDisplay.symbol}</span>
                      <span fg={eventDisplay.bracketColor}>]</span>
                      <span fg={colors.fg.secondary}> {event.description}</span>
                    </text>
                  </box>
                );
              })
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
            ) : (
              <text fg={colors.fg.muted}>No activity yet - waiting for iteration to start</text>
            )}
          </box>
        </box>

<<<<<<< HEAD
        {/* Subagent activity section with improved styling */}
        {(subagentTree.length > 0 || subagentStats) && (
<<<<<<< HEAD
          <box style={{ marginBottom: 2 }}>
            <SectionHeader icon={SUBAGENT_ICON} title="Subagent Activity" />
=======
        {/* Subagent activity section - improved hierarchy */}
        {(subagentTree.length > 0 || subagentStats) && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="Subagent Activity" icon={SECTION_ICONS.subagents} />
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
          <box style={{ marginBottom: layout.padding.medium }}>
            <SectionHeader title="Subagent Activity" />
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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
              {stats && (
                <box style={{ marginBottom: 1 }}>
                  <text fg={colors.fg.muted}>│ {stats}</text>
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
                <text fg={colors.fg.muted}>│ No subagents spawned yet</text>
              )}
            </box>
          </box>
        )}

<<<<<<< HEAD
        {/* Recent iterations summary with improved layout */}
        {iterations.length > 0 && (
<<<<<<< HEAD
          <box style={{ marginBottom: 2 }}>
            <SectionHeader icon={HISTORY_ICON} title="Recent Iterations" />
=======
        {/* Recent iterations summary - improved layout */}
        {iterations.length > 0 && (
          <box style={{ marginBottom: 2 }}>
            <SectionHeader title="Recent Iterations" icon={SECTION_ICONS.iterations} />
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
          <box style={{ marginBottom: layout.padding.medium }}>
            <SectionHeader title="Recent Iterations" />
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
            <box
              style={{
                padding: layout.padding.small,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* Show last 5 iterations in reverse order with bracketed status */}
              {[...iterations].reverse().slice(0, 5).map((iter) => {
<<<<<<< HEAD
<<<<<<< HEAD
                const iterStatusIndicator = statusIndicatorsEnhanced[iter.status];
                const iterStatusColor = statusColorsEnhanced[iter.status];
                const duration = formatDuration(iter.durationMs);
                const isLast = iter.iteration === iterations[iterations.length - 1]?.iteration;
=======
                const iterStatusIndicator = iterationStatusIndicators[iter.status];
                const iterStatusColor = statusColors[iter.status];
=======
                const iterStatusDisplay = getStatusDisplay(iter.status);
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
                const duration = formatDuration(iter.durationMs);
                const truncatedIterTaskId = truncateText(iter.task.id, 25);
                const truncatedIterTaskTitle = truncateText(iter.task.title, 35);
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)

                return (
                  <box
                    key={iter.iteration}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: isLast ? 0 : 0,
                    }}
                  >
                    <text>
<<<<<<< HEAD
                      <span fg={iterStatusColor}>{iterStatusIndicator}</span>
<<<<<<< HEAD
                      <span fg={colors.fg.muted}> </span>
                      <span fg={colors.fg.primary}>#{iter.iteration}</span>
                      <span fg={colors.fg.muted}> - </span>
                      <span fg={colors.accent.primary}>{iter.task.id}</span>
                      <span fg={colors.fg.secondary}> ({iter.task.title})</span>
                      {duration && (
                        <>
                          <span fg={colors.fg.muted}> </span>
                          <span fg={colors.fg.dim}>[</span>
                          <span fg={colors.fg.muted}>{duration}</span>
                          <span fg={colors.fg.dim}>]</span>
                        </>
                      )}
=======
                      <span fg={colors.fg.primary}> #{iter.iteration}</span>
                      <span fg={colors.fg.muted}> - {truncatedIterTaskId}</span>
                      <span fg={colors.fg.secondary}> ({truncatedIterTaskTitle})</span>
                      {duration && <span fg={colors.fg.dim}> - {duration}</span>}
>>>>>>> e5772cd (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
=======
                      <span fg={iterStatusDisplay.bracketColor}>[</span>
                      <span fg={iterStatusDisplay.color}>{iterStatusDisplay.indicator}</span>
                      <span fg={iterStatusDisplay.color}> {iterStatusDisplay.label}</span>
                      <span fg={iterStatusDisplay.bracketColor}>]</span>
                      <span fg={colors.fg.dim}> │ </span>
                      <span fg={colors.accent.primary}>#{iter.iteration}</span>
                      <span fg={colors.fg.dim}> │ </span>
                      <span fg={colors.fg.secondary}>{iter.task.id}</span>
                      <span fg={colors.fg.muted}> ({iter.task.title})</span>
                      {duration && (
                        <>
                          <span fg={colors.fg.dim}> │ </span>
                          <span fg={colors.fg.muted}>{duration}</span>
                        </>
                      )}
>>>>>>> 4b45e08 (feat: ralph-tui-5no.5 - US-005: Activity View Facelift)
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

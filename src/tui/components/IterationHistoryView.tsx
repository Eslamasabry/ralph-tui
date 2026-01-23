/**
 * ABOUTME: IterationHistoryView component for the Ralph TUI.
 * Displays a list of all iterations with status, task, duration, outcome, and subagent summary.
 * Supports keyboard navigation through iterations with Enter to drill into details.
 * Redesigned with card-based layout for improved visual clarity.
 */

import type { ReactNode } from 'react';
import { colors, formatElapsedTime } from '../theme.js';
import type { IterationResult, IterationStatus } from '../../engine/types.js';
import type { SubagentTraceStats } from '../../logs/types.js';

/**
 * Extended status type that includes 'pending' for display purposes
 * (pending iterations don't have an IterationResult yet)
 */
type DisplayIterationStatus = IterationStatus | 'pending';

/**
 * Status indicator symbols for iterations
 */
const iterationStatusIndicators: Record<DisplayIterationStatus, string> = {
  completed: '✓',
  running: '▶',
  pending: '○',
  failed: '✗',
  interrupted: '⊘',
  skipped: '⊖',
};

/**
 * Status colors for iterations (foreground text color)
 */
const iterationStatusColors: Record<DisplayIterationStatus, string> = {
  completed: colors.status.success,
  running: colors.accent.primary,
  pending: colors.fg.muted,
  failed: colors.status.error,
  interrupted: colors.status.warning,
  skipped: colors.fg.dim,
};

/**
 * Background colors for status badges
 */
const iterationStatusBadgeBg: Record<DisplayIterationStatus, string> = {
  completed: 'transparent',
  running: colors.bg.tertiary,
  pending: 'transparent',
  failed: 'transparent',
  interrupted: 'transparent',
  skipped: 'transparent',
};

/**
 * Status labels for display in badges
 */
const iterationStatusLabels: Record<DisplayIterationStatus, string> = {
  completed: 'Completed',
  running: 'Running',
  pending: 'Pending',
  failed: 'Failed',
  interrupted: 'Interrupted',
  skipped: 'Skipped',
};

/**
 * Get display text for iteration outcome
 */
function getOutcomeText(result: IterationResult, isRunning: boolean): string {
  if (isRunning) return 'Running...';
  if (result.status === 'skipped') return 'Skipped';
  if (result.status === 'interrupted') return 'Interrupted';
  if (result.status === 'failed') return result.error || 'Failed';
  // Completed - show if task was completed or just iteration
  if (result.promiseComplete) return 'Task completed';
  if (result.taskCompleted) return 'Success';
  return 'Completed';
}

/**
 * Format subagent summary for display in iteration card.
 * Shows count and failure indicator if any subagents failed.
 * Examples: "3 subagents", "5 subagents ✗1"
 */
function formatSubagentSummary(stats: SubagentTraceStats | undefined): string {
  if (!stats || stats.totalSubagents === 0) return '';

  const count = stats.totalSubagents;
  const label = count === 1 ? 'subagent' : 'subagents';

  if (stats.failureCount > 0) {
    return `${count} ${label} ✗${stats.failureCount}`;
  }

  return `${count} ${label}`;
}

/**
 * Format duration in milliseconds to human-readable format
 */
function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  return formatElapsedTime(seconds);
}

/**
 * Truncate text to fit within max width
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Props for the IterationHistoryView component
 */
export interface IterationHistoryViewProps {
  /** List of iteration results to display */
  iterations: IterationResult[];
  /** Total number of iterations (for display like "1 of 10") */
  totalIterations: number;
  /** Currently selected iteration index */
  selectedIndex: number;
  /** Current running iteration number (0 if none running) */
  runningIteration: number;
  /** Callback when Enter is pressed to drill into iteration details */
  onIterationDrillDown?: (iteration: IterationResult) => void;
  /** Width of the component (for truncation calculations) */
  width?: number;
  /** Subagent trace stats per iteration (keyed by iteration number) for summary display */
  subagentStats?: Map<number, SubagentTraceStats>;
}

/**
 * Status badge component with colored indicator
 */
function StatusBadge({
  status,
  isSelected,
}: {
  status: DisplayIterationStatus;
  isSelected: boolean;
}): ReactNode {
  const indicator = iterationStatusIndicators[status];
  const color = iterationStatusColors[status];
  const label = iterationStatusLabels[status];

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        backgroundColor: iterationStatusBadgeBg[status],
        border: true,
        borderColor: isSelected ? colors.border.active : colors.border.muted,
      }}
    >
      <text>
        <span fg={color}>{indicator}</span>
        <span fg={colors.fg.secondary}> {label}</span>
      </text>
    </box>
  );
}

/**
 * Single iteration card component with improved visual design
 */
function IterationCard({
  result,
  totalIterations,
  isSelected,
  isRunning,
  maxWidth,
  subagentStats,
}: {
  result: IterationResult;
  totalIterations: number;
  isSelected: boolean;
  isRunning: boolean;
  maxWidth: number;
  subagentStats?: SubagentTraceStats;
}): ReactNode {
  // Determine effective display status (override to 'running' if this is the current iteration)
  const effectiveStatus: DisplayIterationStatus = isRunning ? 'running' : result.status;
  const statusColor = iterationStatusColors[effectiveStatus];

  // Format iteration label
  const iterationLabel = `Iteration ${result.iteration} of ${totalIterations}`;

  // Format task info
  const taskId = result.task.id;
  const taskTitle = result.task.title;

  // Calculate max widths for content
  const taskIdWidth = Math.min(20, Math.floor(maxWidth * 0.25));
  const titleWidth = Math.max(30, maxWidth - taskIdWidth - 40);
  const truncatedTaskId = truncateText(taskId, taskIdWidth);
  const truncatedTitle = truncateText(taskTitle, titleWidth);

  // Duration and outcome
  const duration = isRunning ? '...' : formatDuration(result.durationMs);
  const outcome = getOutcomeText(result, isRunning);
  const subagentSummary = formatSubagentSummary(subagentStats);
  const hasSubagentFailure = subagentStats && subagentStats.failureCount > 0;

  // Border color based on selection and status
  const borderColor = isSelected
    ? colors.border.active
    : effectiveStatus === 'failed'
      ? colors.status.error
      : effectiveStatus === 'running'
        ? colors.accent.primary
        : colors.border.normal;

  // Background based on selection
  const bgColor = isSelected ? colors.bg.highlight : colors.bg.secondary;

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
        padding: 1,
        marginBottom: 1,
        backgroundColor: bgColor,
        border: true,
        borderColor: borderColor,
      }}
    >
      {/* Header row: Status badge + Iteration label + Duration */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 0,
        }}
      >
        <StatusBadge status={effectiveStatus} isSelected={isSelected} />
        <text>
          <span fg={isSelected ? colors.fg.primary : colors.fg.secondary}>{iterationLabel}</span>
        </text>
        <text>
          <span fg={colors.fg.muted}>Duration: </span>
          <span fg={colors.accent.tertiary}>{duration}</span>
        </text>
      </box>

      {/* Separator line */}
      <box
        style={{
          border: true,
          borderColor: colors.border.muted,
          marginTop: 0,
          marginBottom: 0,
        }}
      />

      {/* Task info row */}
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 0,
        }}
      >
        <text>
          <span fg={colors.fg.muted}>Task: </span>
          <span fg={colors.accent.primary}>{truncatedTaskId}</span>
          <span fg={colors.fg.dim}>{taskTitle ? ' - ' : ''}</span>
          <span fg={colors.fg.secondary}>{taskTitle ? truncatedTitle : ''}</span>
        </text>
      </box>

      {/* Outcome and subagents row */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 0,
        }}
      >
        <text>
          <span fg={colors.fg.muted}>Result: </span>
          <span fg={statusColor}>{outcome}</span>
        </text>
        {subagentSummary && (
          <text>
            <span fg={hasSubagentFailure ? colors.status.error : colors.fg.dim}>
              {hasSubagentFailure ? '⚠ ' : ''}{subagentSummary}
            </span>
          </text>
        )}
      </box>
    </box>
  );
}

/**
 * Pending iteration placeholder card
 */
function PendingIterationCard({
  iteration,
  totalIterations,
  isSelected,
}: {
  iteration: number;
  totalIterations: number;
  isSelected: boolean;
}): ReactNode {
  const iterationLabel = `Iteration ${iteration} of ${totalIterations}`;

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'column',
        padding: 1,
        marginBottom: 1,
        backgroundColor: isSelected ? colors.bg.highlight : colors.bg.secondary,
        border: true,
        borderColor: isSelected ? colors.border.active : colors.border.muted,
      }}
    >
      {/* Header row */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 0,
        }}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 0,
            paddingBottom: 0,
            border: true,
            borderColor: colors.border.muted,
          }}
        >
          <text>
            <span fg={colors.fg.muted}>{iterationStatusIndicators.pending}</span>
            <span fg={colors.fg.secondary}> {iterationStatusLabels.pending}</span>
          </text>
        </box>
        <text>
          <span fg={isSelected ? colors.fg.primary : colors.fg.secondary}>{iterationLabel}</span>
        </text>
        <text fg={colors.fg.muted}>Waiting...</text>
      </box>

      {/* Separator line */}
      <box
        style={{
          border: true,
          borderColor: colors.border.muted,
          marginTop: 0,
          marginBottom: 0,
        }}
      />

      {/* Task placeholder */}
      <box
        style={{
          flexDirection: 'row',
          marginBottom: 0,
        }}
      >
        <text>
          <span fg={colors.fg.muted}>Task: </span>
          <span fg={colors.fg.dim}>(not yet assigned)</span>
        </text>
      </box>
    </box>
  );
}

/**
 * IterationHistoryView component showing all iterations with their status
 * Redesigned with card-based layout for improved visual clarity
 */
export function IterationHistoryView({
  iterations,
  totalIterations,
  selectedIndex,
  runningIteration,
  width = 80,
  subagentStats,
}: IterationHistoryViewProps): ReactNode {
  // Calculate max width for card content (width minus padding and border)
  const maxCardWidth = Math.max(40, width - 6);

  // Build display list: completed iterations + pending placeholders
  const displayItems: Array<{ type: 'result'; result: IterationResult } | { type: 'pending'; iteration: number }> = [];

  // Add completed/running iterations
  for (const result of iterations) {
    displayItems.push({ type: 'result', result });
  }

  // Add pending placeholders for remaining iterations
  const completedCount = iterations.length;
  for (let i = completedCount + 1; i <= totalIterations; i++) {
    displayItems.push({ type: 'pending', iteration: i });
  }

  return (
    <box
      title="Iterations"
      style={{
        flexGrow: 1,
        flexShrink: 1,
        minWidth: 40,
        maxWidth: 80,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
      <scrollbox
        style={{
          flexGrow: 1,
          width: '100%',
          padding: 1,
        }}
      >
        {displayItems.length === 0 ? (
          <box
            style={{
              padding: 2,
              border: true,
              borderColor: colors.border.muted,
              backgroundColor: colors.bg.secondary,
            }}
          >
            <text fg={colors.fg.muted}>No iterations yet</text>
          </box>
        ) : (
          displayItems.map((item, index) => {
            if (item.type === 'result') {
              return (
                <IterationCard
                  key={`iteration-${item.result.iteration}`}
                  result={item.result}
                  totalIterations={totalIterations}
                  isSelected={index === selectedIndex}
                  isRunning={item.result.iteration === runningIteration}
                  maxWidth={maxCardWidth}
                  subagentStats={subagentStats?.get(item.result.iteration)}
                />
              );
            } else {
              return (
                <PendingIterationCard
                  key={`pending-${item.iteration}`}
                  iteration={item.iteration}
                  totalIterations={totalIterations}
                  isSelected={index === selectedIndex}
                />
              );
            }
          })
        )}
      </scrollbox>
    </box>
  );
}

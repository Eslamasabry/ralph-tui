/**
 * ABOUTME: Single log pane component displaying logs for the selected task.
 * Shows iteration output with timing, model info, and enhanced syntax highlighting.
 * Redesigned with improved visual hierarchy and terminal-size optimization.
 */

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { colors, formatElapsedTime } from '../theme.js';
import type { IterationTimingInfo } from '../types.js';
import { stripAnsiCodes } from '../../plugins/agents/output-formatting.js';
import { parseAgentOutput } from '../output-parser.js';

/**
 * Props for LogPane component
 */
export interface LogPaneProps {
  /** Selected task title */
  taskTitle?: string;
  /** Selected task ID */
  taskId?: string;
  /** Current iteration number */
  currentIteration: number;
  /** Iteration output text */
  iterationOutput?: string;
  /** Iteration timing information */
  iterationTiming?: IterationTimingInfo;
  /** Agent name being used */
  agentName?: string;
  /** Current model */
  currentModel?: string;
  /** Whether pane is focused */
  isFocused?: boolean;
  /** Available width for responsive layout */
  width?: number;
}

/**
 * Format an ISO 8601 timestamp to a human-readable time string
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Log line types for enhanced syntax highlighting
 */
type LogLineType = 'tool' | 'error' | 'warning' | 'success' | 'info' | 'path' | 'pattern' | 'code' | 'default';

/**
 * Detect the type of log line for syntax highlighting
 */
function detectLogLineType(line: string): LogLineType {
  const trimmed = line.trim();

  // Tool call pattern: [toolname]
  if (/^\[[\w-]+\]/.test(trimmed)) {
    return 'tool';
  }

  // Error patterns
  if (/^(Error|✗|×|FAIL|FAILED|Exception|Traceback)/i.test(trimmed)) {
    return 'error';
  }

  // Warning patterns
  if (/^(Warning|Warn|⚠|ALERT)/i.test(trimmed)) {
    return 'warning';
  }

  // Success patterns
  if (/^(✓|✓|Success|Done|COMPLETE|SUCCESS)/i.test(trimmed)) {
    return 'success';
  }

  // File path pattern
  if (/(?:\/[\w.-]+)+[\/\w.-]*\.\w+/.test(trimmed) || /^[a-zA-Z]:\\/.test(trimmed)) {
    return 'path';
  }

  // Pattern/query pattern
  if (/^(pattern|query|search):/i.test(trimmed)) {
    return 'pattern';
  }

  // Code block markers
  if (trimmed.startsWith('```') || trimmed.startsWith('$ ') || /^\s*\w+\s*=/.test(trimmed)) {
    return 'code';
  }

  // Info/system patterns
  if (/^(INFO|SYSTEM|USER|ASSISTANT):/i.test(trimmed)) {
    return 'info';
  }

  return 'default';
}

/**
 * Get color for log line type
 */
function getLogLineColor(type: LogLineType): string {
  switch (type) {
    case 'error':
      return colors.status.error;
    case 'warning':
      return colors.status.warning;
    case 'success':
      return colors.status.success;
    case 'tool':
      return colors.status.success;
    case 'info':
      return colors.status.info;
    case 'path':
      return colors.accent.secondary;
    case 'pattern':
      return colors.accent.tertiary;
    case 'code':
      return colors.accent.primary;
    default:
      return colors.fg.secondary;
  }
}

/**
 * Truncate text for display based on available width
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return '…';
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Timing summary component showing start, end, and duration
 * Redesigned with improved visual hierarchy
 */
function TimingSummary({ timing }: { timing?: IterationTimingInfo }): ReactNode {
  if (!timing || (!timing.startedAt && !timing.isRunning)) {
    return null;
  }

  // Calculate duration for display
  let durationDisplay: string;
  if (timing.isRunning && timing.startedAt) {
    // Show live elapsed time
    const durationMs = Date.now() - new Date(timing.startedAt).getTime();
    const durationSeconds = Math.floor(durationMs / 1000);
    durationDisplay = '⏱ ' + formatElapsedTime(durationSeconds);
  } else if (timing.durationMs !== undefined) {
    const durationSeconds = Math.floor(timing.durationMs / 1000);
    durationDisplay = formatElapsedTime(durationSeconds);
  } else {
    durationDisplay = '—';
  }

  const startedAt = timing.startedAt ? formatTimestamp(timing.startedAt) : '—';
  const endedAt = timing.endedAt ? formatTimestamp(timing.endedAt) : (timing.isRunning ? 'running...' : '—');

  return (
    <box
      style={{
        marginBottom: 1,
        padding: 1,
        border: true,
        borderStyle: 'rounded',
        borderColor: colors.border.muted,
        backgroundColor: colors.bg.secondary,
      }}
    >
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {/* Duration - most prominent */}
        <box style={{ flexDirection: 'row', marginBottom: 0 }}>
          <text fg={colors.fg.muted}>Duration: </text>
          <text fg={timing.isRunning ? colors.status.info : colors.accent.primary}>
            {durationDisplay}
          </text>
        </box>
        {/* Timing row */}
        <box style={{ flexDirection: 'row', gap: 3 }}>
          <text fg={colors.fg.muted}>
            Started: <text fg={colors.fg.secondary}>{startedAt}</text>
          </text>
          <text fg={colors.fg.muted}>
            Ended: <text fg={colors.fg.secondary}>{endedAt}</text>
          </text>
        </box>
      </box>
    </box>
  );
}

/**
 * Model info display component with badge styling
 */
function ModelInfo({ currentModel }: { currentModel?: string }): ReactNode {
  if (!currentModel) return null;

  const [provider, model] = currentModel.includes('/')
    ? currentModel.split('/')
    : ['', currentModel];
  const display = provider ? `${provider}/${model}` : model;

  return (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: colors.bg.tertiary,
        border: true,
        borderStyle: 'rounded',
        borderColor: colors.border.muted,
      }}
    >
      <text fg={colors.fg.muted}>Model: </text>
      <text fg={colors.accent.primary}>{display}</text>
    </box>
  );
}

/**
 * Single log line with enhanced syntax highlighting
 */
function LogLine({ line, lineNumber, maxWidth }: { line: string; lineNumber: number; maxWidth: number }): ReactNode {
  const lineType = detectLogLineType(line);
  const color = getLogLineColor(lineType);
  const truncatedLine = truncateText(line, maxWidth);

  // For tool calls, show tool name separately colored
  const toolMatch = line.match(/^(\[[\w-]+\])(.*)/);
  if (toolMatch) {
    const [, toolName, rest] = toolMatch;
    return (
      <box style={{ flexDirection: 'row' }}>
        {/* Line number indicator */}
        <text fg={colors.fg.dim}>{lineNumber.toString().padStart(4, ' ')} </text>
        <text fg={colors.status.success}>{toolName}</text>
        <text fg={colors.fg.secondary}>{truncateText(rest, maxWidth - toolName.length - 1)}</text>
      </box>
    );
  }

  // For error lines, show with error color
  if (lineType === 'error') {
    return (
      <box style={{ flexDirection: 'row' }}>
        <text fg={colors.fg.dim}>{lineNumber.toString().padStart(4, ' ')} </text>
        <text fg={colors.status.error}>{truncatedLine}</text>
      </box>
    );
  }

  // For warning lines
  if (lineType === 'warning') {
    return (
      <box style={{ flexDirection: 'row' }}>
        <text fg={colors.fg.dim}>{lineNumber.toString().padStart(4, ' ')} </text>
        <text fg={colors.status.warning}>{truncatedLine}</text>
      </box>
    );
  }

  // Default line with type-based coloring
  return (
    <box style={{ flexDirection: 'row' }}>
      <text fg={colors.fg.dim}>{lineNumber.toString().padStart(4, ' ')} </text>
      <text fg={color}>{truncatedLine}</text>
    </box>
  );
}

/**
 * Empty state component for different scenarios
 */
function EmptyState({ state, isLive }: { state: 'none' | 'pending' | 'empty'; isLive: boolean }): ReactNode {
  const messages = {
    none: { text: 'Task not yet executed', icon: '○' },
    pending: { text: 'Waiting for output...', icon: '◐' },
    empty: { text: 'No output captured', icon: '○' },
  };
  const msg = messages[state];

  return (
    <box style={{ padding: 2, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <text fg={colors.fg.muted}>{msg.icon}</text>
      <text fg={colors.fg.muted}>{msg.text}</text>
      {isLive && (
        <text fg={colors.fg.dim} style={{ marginTop: 1 }}>
          Agent is running...
        </text>
      )}
    </box>
  );
}

/**
 * Header component with task info and iteration badge
 */
function LogPaneHeader({
  taskTitle,
  taskId,
  currentIteration,
  agentName,
}: {
  taskTitle?: string;
  taskId?: string;
  currentIteration: number;
  agentName?: string;
}): ReactNode {
  return (
    <box
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 1,
      }}
    >
      <box style={{ flexDirection: 'column' }}>
        {/* Main title row */}
        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          {taskTitle ? (
            <>
              <text fg={colors.fg.primary}>{taskTitle}</text>
              {taskId && <text fg={colors.fg.muted}>({taskId})</text>}
            </>
          ) : (
            <text fg={colors.fg.primary}>
              {currentIteration > 0 ? `Iteration ${currentIteration}` : 'Logs'}
            </text>
          )}
        </box>
        {/* Subtitle with agent and iteration info */}
        {(agentName || currentIteration > 0) && (
          <box style={{ flexDirection: 'row', gap: 2, marginTop: 0 }}>
            {agentName && (
              <text fg={colors.fg.muted}>
                Agent: <text fg={colors.accent.tertiary}>{agentName}</text>
              </text>
            )}
            {currentIteration > 0 && (
              <text fg={colors.fg.muted}>
                Iter: <text fg={colors.accent.secondary}>{String(currentIteration)}</text>
              </text>
            )}
          </box>
        )}
      </box>
    </box>
  );
}

/**
 * Single log pane showing output for the selected task.
 * Displays timing summary, model info, and scrollable output content.
 * Redesigned with improved visual hierarchy and enhanced syntax highlighting.
 */
export function LogPane({
  taskTitle,
  taskId,
  currentIteration,
  iterationOutput,
  iterationTiming,
  agentName,
  currentModel,
  isFocused = true,
  width = 60,
}: LogPaneProps): ReactNode {
  // Check if we're live streaming
  const isLiveStreaming = iterationTiming?.isRunning === true;

  // Calculate content width based on available terminal width
  const contentWidth = Math.max(20, width - 8);
  const lineNumberWidth = 6;

  // For live streaming, prefer segments for TUI-native colors
  // For historical/completed output, parse to extract readable content
  const displayOutput = useMemo(() => {
    if (!iterationOutput) return undefined;
    // For live output during execution, strip ANSI but keep raw content
    if (isLiveStreaming) {
      return stripAnsiCodes(iterationOutput);
    }
    // For completed output, parse to extract readable content
    return parseAgentOutput(iterationOutput, agentName);
  }, [iterationOutput, isLiveStreaming, agentName]);

  // Determine state for empty display
  const state = useMemo(() => {
    if (!displayOutput) return 'none';
    if (displayOutput === '') return 'empty';
    return 'pending';
  }, [displayOutput]);

  // Build header sections
  const hasHeader = taskTitle || currentModel || agentName;

  return (
    <box
      title={
        taskTitle
          ? `Logs: ${taskTitle} (${taskId})`
          : currentIteration > 0
            ? `Iteration ${currentIteration}`
            : 'Logs'
      }
      style={{
        flexGrow: 1,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderStyle: 'rounded',
        borderColor: isFocused ? colors.accent.primary : colors.border.normal,
        padding: 1,
      }}
    >
      {/* Header section with task info */}
      {hasHeader && (
        <>
          <LogPaneHeader taskTitle={taskTitle} taskId={taskId} currentIteration={currentIteration} agentName={agentName} />
          {/* Model info row */}
          {currentModel && (
            <box style={{ marginBottom: 1 }}>
              <ModelInfo currentModel={currentModel} />
            </box>
          )}
        </>
      )}

      {/* Timing summary - only show if we have timing info */}
      <TimingSummary timing={iterationTiming} />

      {/* Output display area with improved styling */}
      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          border: true,
          borderStyle: 'rounded',
          borderColor: colors.border.muted,
          backgroundColor: colors.bg.secondary,
        }}
      >
        {/* Output header */}
        <box
          style={{
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: colors.bg.tertiary,
          }}
        >
          <text fg={colors.fg.muted}>
            {isLiveStreaming ? '● Live Output' : 'Output'}
            {displayOutput && ` (${displayOutput.split('\n').length} lines)`}
          </text>
        </box>
        {/* Header separator line */}
        <box
          style={{
            width: '100%',
            height: 1,
            border: true,
            borderStyle: 'rounded',
            borderColor: colors.border.muted,
          }}
        />

        {/* Scrollable content */}
        <scrollbox style={{ flexGrow: 1, padding: 1 }}>
          {displayOutput !== undefined && displayOutput.length > 0 ? (
            <box style={{ flexDirection: 'column' }}>
              {displayOutput.split('\n').map((line, i) => (
                <LogLine
                  key={i}
                  line={line}
                  lineNumber={i + 1}
                  maxWidth={contentWidth - lineNumberWidth}
                />
              ))}
            </box>
          ) : (
            <EmptyState state={state} isLive={isLiveStreaming} />
          )}
        </scrollbox>
      </box>

      {/* Footer with iteration indicator */}
      {currentIteration > 0 && (
        <box style={{ marginTop: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <text fg={colors.fg.muted}>
            Iteration <text fg={colors.accent.primary}>{currentIteration}</text>
          </text>
        </box>
      )}
    </box>
  );
}

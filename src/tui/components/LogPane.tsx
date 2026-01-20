/**
 * ABOUTME: Single log pane component displaying logs for the selected task.
 * Shows iteration output with timing and model information.
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
}

/**
 * Format an ISO 8601 timestamp to a human-readable time string
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Timing summary component showing start, end, and duration
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
    durationDisplay = formatElapsedTime(durationSeconds);
  } else if (timing.durationMs !== undefined) {
    const durationSeconds = Math.floor(timing.durationMs / 1000);
    durationDisplay = formatElapsedTime(durationSeconds);
  } else {
    durationDisplay = '—';
  }

  return (
    <box
      style={{
        marginBottom: 1,
        padding: 1,
        border: true,
        borderColor: colors.border.muted,
        backgroundColor: colors.bg.tertiary,
      }}
    >
      <box style={{ flexDirection: 'row', gap: 3 }}>
        <text fg={colors.fg.muted}>
          Started:{' '}
          <span fg={colors.fg.secondary}>
            {timing.startedAt ? formatTimestamp(timing.startedAt) : '—'}
          </span>
        </text>
        <text fg={colors.fg.muted}>
          Ended:{' '}
          <span fg={colors.fg.secondary}>
            {timing.endedAt ? formatTimestamp(timing.endedAt) : '—'}
          </span>
        </text>
        <text fg={colors.fg.muted}>
          Duration:{' '}
          <span fg={timing.isRunning ? colors.status.info : colors.accent.primary}>
            {durationDisplay}
          </span>
        </text>
      </box>
    </box>
  );
}

/**
 * Model info display component
 */
function ModelInfo({ currentModel }: { currentModel?: string }): ReactNode {
  if (!currentModel) return null;

  const [provider, model] = currentModel.includes('/')
    ? currentModel.split('/')
    : ['', currentModel];
  const display = provider ? `${provider}/${model}` : model;

  return (
    <box style={{ flexDirection: 'row', marginBottom: 1 }}>
      <text fg={colors.fg.muted}>Model: </text>
      <text fg={colors.accent.primary}>{display}</text>
    </box>
  );
}

/**
 * Single log pane showing output for the selected task.
 * Displays timing summary, model info, and scrollable output content.
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
}: LogPaneProps): ReactNode {
  // Check if we're live streaming
  const isLiveStreaming = iterationTiming?.isRunning === true;

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
        borderColor: isFocused ? colors.accent.primary : colors.border.normal,
        padding: 1,
      }}
    >
      {/* Task header with model info */}
      {(taskTitle || currentModel) && (
        <box style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
          <box>
            {taskTitle && (
              <text>
                <span fg={colors.fg.primary}>{taskTitle}</span>
                {taskId && <span fg={colors.fg.muted}> ({taskId})</span>}
              </text>
            )}
          </box>
          <ModelInfo currentModel={currentModel} />
        </box>
      )}

      {/* Timing summary */}
      <TimingSummary timing={iterationTiming} />

      {/* Output display */}
      <box
        style={{
          flexGrow: 1,
          border: true,
          borderColor: colors.border.normal,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <scrollbox style={{ flexGrow: 1, padding: 1 }}>
          {displayOutput !== undefined && displayOutput.length > 0 ? (
            <box style={{ flexDirection: 'column' }}>
              {displayOutput.split('\n').map((line, i) => {
                // Check if line starts with [toolname] pattern
                const toolMatch = line.match(/^(\[[\w-]+\])(.*)/);
                if (toolMatch) {
                  const [, toolName, rest] = toolMatch;
                  return (
                    <box key={i} style={{ flexDirection: 'row' }}>
                      <text fg={colors.status.success}>{toolName}</text>
                      <text fg={colors.fg.secondary}>{rest}</text>
                    </box>
                  );
                }
                return (
                  <text key={i} fg={colors.fg.secondary}>
                    {line}
                  </text>
                );
              })}
            </box>
          ) : displayOutput === '' ? (
            <text fg={colors.fg.muted}>No output captured</text>
          ) : currentIteration === 0 ? (
            <text fg={colors.fg.muted}>Task not yet executed</text>
          ) : (
            <text fg={colors.fg.muted}>Waiting for output...</text>
          )}
        </scrollbox>
      </box>
    </box>
  );
}

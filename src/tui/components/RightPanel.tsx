/**
 * ABOUTME: RightPanel component for the Ralph TUI.
 * Displays the current iteration details or selected task details.
 * Supports toggling between details view and output view with 'o' key.
 * Includes collapsible subagent sections when subagent tracing is enabled.
 */

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { colors, getTaskStatusColor, getTaskStatusIndicator } from '../theme.js';
import type { RightPanelProps, DetailsViewMode, IterationTimingInfo, TaskPriority } from '../types.js';
import { stripAnsiCodes, type FormattedSegment } from '../../plugins/agents/output-formatting.js';
import { parseAgentOutput } from '../output-parser.js';

/**
 * Priority label mapping for display
 */
const priorityLabels: Record<TaskPriority, string> = {
  0: 'P0 - Critical',
  1: 'P1 - High',
  2: 'P2 - Medium',
  3: 'P3 - Low',
  4: 'P4 - Backlog',
};

/**
 * Get color for priority display
 */
function getPriorityColor(priority: TaskPriority): string {
  switch (priority) {
    case 0:
      return colors.status.error;
    case 1:
      return colors.status.warning;
    case 2:
      return colors.fg.primary;
    case 3:
      return colors.fg.secondary;
    case 4:
      return colors.fg.muted;
  }
}

/**
 * Parse acceptance criteria from description, dedicated field, or metadata array.
 * Looks for markdown checklist items (- [ ] or - [x])
 * JSON tracker stores criteria in metadata.acceptanceCriteria as string array.
 */
function parseAcceptanceCriteria(
  description?: string,
  acceptanceCriteria?: string,
  metadataCriteria?: unknown
): Array<{ text: string; checked: boolean }> {
  // If metadata contains criteria array (from JSON tracker), use that
  if (Array.isArray(metadataCriteria) && metadataCriteria.length > 0) {
    return metadataCriteria
      .filter((c): c is string => typeof c === 'string')
      .map((text) => ({ text, checked: false }));
  }

  const content = acceptanceCriteria || description || '';
  const lines = content.split('\n');
  const criteria: Array<{ text: string; checked: boolean }> = [];

  // Look for acceptance criteria section
  let inCriteriaSection = false;

  for (const line of lines) {
    // Check for section header
    if (line.toLowerCase().includes('acceptance criteria')) {
      inCriteriaSection = true;
      continue;
    }

    // Parse checklist items (anywhere in content if no section, or only in section)
    const checkboxMatch = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch) {
      criteria.push({
        checked: checkboxMatch[1].toLowerCase() === 'x',
        text: checkboxMatch[2].trim(),
      });
    }

    // Also accept bullet points in the criteria section
    if (inCriteriaSection) {
      const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (bulletMatch && !checkboxMatch) {
        criteria.push({
          checked: false,
          text: bulletMatch[1].trim(),
        });
      }
    }
  }

  return criteria;
}

/**
 * Extract description without acceptance criteria section
 */
function extractDescription(description?: string): string {
  if (!description) return '';

  const lines = description.split('\n');
  const result: string[] = [];
  let inCriteriaSection = false;

  for (const line of lines) {
    if (line.toLowerCase().includes('acceptance criteria')) {
      inCriteriaSection = true;
      continue;
    }

    // Stop including lines once we hit the acceptance criteria section
    // unless we encounter another section header
    if (inCriteriaSection && line.match(/^#+\s/)) {
      inCriteriaSection = false;
    }

    if (!inCriteriaSection) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

/**
 * Display when no task is selected.
 * Shows connection status for remote instances, or setup instructions for local.
 */
function NoSelection({
  isViewingRemote = false,
  remoteConnectionStatus,
  remoteAlias,
}: {
  isViewingRemote?: boolean;
  remoteConnectionStatus?: 'connected' | 'connecting' | 'disconnected' | 'reconnecting';
  remoteAlias?: string;
}): ReactNode {
  // Show connection-specific help for remote instances
  if (isViewingRemote && remoteConnectionStatus !== 'connected') {
    return (
      <box
        style={{
          flexGrow: 1,
          flexDirection: 'column',
          padding: 2,
        }}
      >
        <box style={{ marginBottom: 1 }}>
          <text fg={colors.status.warning}>
            {remoteConnectionStatus === 'connecting'
              ? '◐ Connecting...'
              : remoteConnectionStatus === 'reconnecting'
                ? '⟳ Reconnecting...'
                : remoteConnectionStatus === 'disconnected'
                  ? '○ Not Connected'
                  : ''}
          </text>
        </box>

        {remoteConnectionStatus === 'disconnected' && (
          <>
            <box style={{ marginBottom: 2 }}>
              <text fg={colors.fg.secondary}>
                Remote "{remoteAlias}" is not connected.
              </text>
            </box>
            <box style={{ flexDirection: 'column', gap: 1 }}>
              <text fg={colors.fg.muted}>Possible causes:</text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> Remote server is not running
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> Network connectivity issues
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> Incorrect host/port configuration
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> Authentication token mismatch
              </text>
            </box>
            <box style={{ marginTop: 2, flexDirection: 'column', gap: 1 }}>
              <text fg={colors.fg.muted}>Try:</text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> Press{' '}
                <span fg={colors.fg.secondary}>[</span> or{' '}
                <span fg={colors.fg.secondary}>]</span> to switch tabs
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> Press{' '}
                <span fg={colors.fg.secondary}>e</span> to edit remote config
              </text>
              <text fg={colors.fg.muted}>
                <span fg={colors.accent.primary}>•</span> Press{' '}
                <span fg={colors.fg.secondary}>x</span> to delete this remote
              </text>
            </box>
          </>
        )}

        {(remoteConnectionStatus === 'connecting' || remoteConnectionStatus === 'reconnecting') && (
          <box style={{ marginTop: 1 }}>
            <text fg={colors.fg.muted}>
              Attempting to connect to {remoteAlias}...
            </text>
          </box>
        )}
      </box>
    );
  }

  // Default: show setup instructions for local instance
  return (
    <box
      style={{
        flexGrow: 1,
        flexDirection: 'column',
        padding: 2,
      }}
    >
      <box style={{ marginBottom: 1 }}>
        <text fg={colors.fg.primary}>Getting Started</text>
      </box>
      <box style={{ marginBottom: 2 }}>
        <text fg={colors.fg.secondary}>
          No tasks available. To start working with Ralph:
        </text>
      </box>
      <box style={{ flexDirection: 'column', gap: 1 }}>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>1.</span> Run{' '}
          <span fg={colors.fg.secondary}>ralph-tui setup</span> to configure your project
        </text>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>2.</span> Run{' '}
          <span fg={colors.fg.secondary}>ralph-tui run</span> to start execution
        </text>
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>3.</span> Or run{' '}
          <span fg={colors.fg.secondary}>ralph-tui --help</span> for more options
        </text>
      </box>
      <box style={{ marginTop: 2 }}>
        <text fg={colors.fg.dim}>Press 'q' or Esc to quit</text>
      </box>
    </box>
  );
}

/**
 * Full task details view - shows comprehensive task information including
 * metadata, description, acceptance criteria, dependencies, and timestamps.
 * This replaces the previous minimal TaskMetadataView.
 */
function TaskMetadataView({
  task,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);
  // Check metadata for acceptance criteria (JSON tracker stores it there)
  const metadataCriteria = task.metadata?.acceptanceCriteria;
  const criteria = parseAcceptanceCriteria(task.description, undefined, metadataCriteria);
  const cleanDescription = extractDescription(task.description);
  const labels = task.labels ?? [];

  return (
    <box style={{ flexDirection: 'column', padding: 1, flexGrow: 1 }}>
      <scrollbox style={{ flexGrow: 1 }}>
        {/* Task title and status */}
        <box style={{ marginBottom: 1 }}>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.primary}> {task.title}</span>
          </text>
        </box>

        {/* Task ID */}
        <box style={{ marginBottom: 1 }}>
          <text fg={colors.fg.muted}>ID: {task.id}</text>
        </box>

        {/* Metadata section - compact row of key info */}
        <box
          style={{
            marginBottom: 1,
            padding: 1,
            backgroundColor: colors.bg.secondary,
            border: true,
            borderColor: colors.border.muted,
            flexDirection: 'column',
          }}
        >
          {/* Status row */}
          <box style={{ flexDirection: 'row', marginBottom: 0 }}>
            <text fg={colors.fg.muted}>Status: </text>
            <text fg={statusColor}>{task.status}</text>
          </box>

          {/* Priority row */}
          {task.priority !== undefined && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Priority: </text>
              <text fg={getPriorityColor(task.priority)}>{priorityLabels[task.priority]}</text>
            </box>
          )}

          {/* Type row */}
          {task.type && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Type: </text>
              <text fg={colors.fg.secondary}>{task.type}</text>
            </box>
          )}

          {/* Assignee row */}
          {task.assignee && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Assignee: </text>
              <text fg={colors.fg.secondary}>{task.assignee}</text>
            </box>
          )}

          {/* Labels row */}
          {labels.length > 0 && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Labels: </text>
              <text>
                <span>
                  {labels.map((label, i) => (
                    <span key={label}>
                      <span fg={colors.accent.secondary}>{label}</span>
                      {i < labels.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </span>
              </text>
            </box>
          )}

          {/* Iteration row */}
          {task.iteration !== undefined && (
            <box style={{ flexDirection: 'row', marginBottom: 0 }}>
              <text fg={colors.fg.muted}>Iteration: </text>
              <text fg={colors.accent.primary}>{String(task.iteration)}</text>
            </box>
          )}
        </box>

        {/* Description section */}
        {cleanDescription && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>Description</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.tertiary,
                border: true,
                borderColor: colors.border.muted,
              }}
            >
              <text fg={colors.fg.secondary}>{cleanDescription}</text>
            </box>
          </box>
        )}

        {/* Acceptance criteria section */}
        {criteria.length > 0 && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>Acceptance Criteria</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {criteria.map((item, index) => (
                <box key={index} style={{ flexDirection: 'row', marginBottom: 0 }}>
                  <text>
                    <span fg={item.checked ? colors.status.success : colors.fg.muted}>
                      {item.checked ? '[x]' : '[ ]'}
                    </span>
                    <span fg={item.checked ? colors.fg.muted : colors.fg.secondary}>
                      {' '}
                      {item.text}
                    </span>
                  </text>
                </box>
              ))}
            </box>
          </box>
        )}

        {/* Dependencies section */}
        {((task.dependsOn && task.dependsOn.length > 0) ||
          (task.blocks && task.blocks.length > 0) ||
          (task.blockedByTasks && task.blockedByTasks.length > 0)) && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>Dependencies</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.secondary,
                border: true,
                borderColor: colors.border.muted,
                flexDirection: 'column',
              }}
            >
              {/* Show detailed blocker info if available (with title and status) */}
              {task.blockedByTasks && task.blockedByTasks.length > 0 && (
                <box style={{ marginBottom: 1 }}>
                  <text fg={colors.status.error}>⊘ Blocked by (unresolved):</text>
                  {task.blockedByTasks.map((blocker) => (
                    <text key={blocker.id} fg={colors.fg.secondary}>
                      {'  '}- {blocker.id}: {blocker.title}
                      <span fg={colors.fg.muted}> [{blocker.status}]</span>
                    </text>
                  ))}
                </box>
              )}

              {/* Fallback to dependsOn IDs if blockedByTasks not available */}
              {(!task.blockedByTasks || task.blockedByTasks.length === 0) &&
                task.dependsOn && task.dependsOn.length > 0 && (
                <box style={{ marginBottom: 1 }}>
                  <text fg={colors.status.warning}>Depends on:</text>
                  {task.dependsOn.map((dep) => (
                    <text key={dep} fg={colors.fg.secondary}>
                      {'  '}- {dep}
                    </text>
                  ))}
                </box>
              )}

              {task.blocks && task.blocks.length > 0 && (
                <box>
                  <text fg={colors.accent.tertiary}>Blocks:</text>
                  {task.blocks.map((dep) => (
                    <text key={dep} fg={colors.fg.secondary}>
                      {'  '}- {dep}
                    </text>
                  ))}
                </box>
              )}
            </box>
          </box>
        )}

        {/* Completion notes section */}
        {task.closeReason && (
          <box style={{ marginBottom: 1 }}>
            <box style={{ marginBottom: 0 }}>
              <text fg={colors.accent.primary}>Completion Notes</text>
            </box>
            <box
              style={{
                padding: 1,
                backgroundColor: colors.bg.tertiary,
                border: true,
                borderColor: colors.status.success,
              }}
            >
              <text fg={colors.fg.secondary}>{task.closeReason}</text>
            </box>
          </box>
        )}

        {/* Timestamps */}
        {(task.createdAt || task.updatedAt) && (
          <box style={{ marginTop: 1 }}>
            {task.createdAt && (
              <text fg={colors.fg.dim}>
                Created: {new Date(task.createdAt).toLocaleString()}
              </text>
            )}
            {task.updatedAt && (
              <text fg={colors.fg.dim}>
                {' '}| Updated: {new Date(task.updatedAt).toLocaleString()}
              </text>
            )}
          </box>
        )}
      </scrollbox>
    </box>
  );
}

/**
 * Prompt preview view - shows the full rendered prompt that will be sent to the agent.
 * Displays the template source indicator and scrollable prompt content.
 *
 * Note: This shows a "point-in-time" preview - dynamic content like progress.md
 * may change before the actual prompt is sent during execution.
 */
function PromptPreviewView({
  task,
  promptPreview,
  templateSource,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
  promptPreview?: string;
  templateSource?: string;
}): ReactNode {
  const statusColor = getTaskStatusColor(task.status);
  const statusIndicator = getTaskStatusIndicator(task.status);

  return (
    <box style={{ flexDirection: 'column', padding: 1, flexGrow: 1 }}>
      {/* Compact task header with template source */}
      <box style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
        <box>
          <text>
            <span fg={statusColor}>{statusIndicator}</span>
            <span fg={colors.fg.primary}> {task.title}</span>
            <span fg={colors.fg.muted}> ({task.id})</span>
          </text>
        </box>
        {templateSource && (
          <box>
            <text fg={colors.accent.secondary}>[{templateSource}]</text>
          </box>
        )}
      </box>

      {/* Dynamic content notice */}
      <box
        style={{
          marginBottom: 1,
          padding: 1,
          border: true,
          borderColor: colors.status.warning,
          backgroundColor: colors.bg.tertiary,
        }}
      >
        <text fg={colors.status.warning}>
          ⚠ Preview only - dynamic content may change before execution
        </text>
      </box>

      {/* Full-height prompt preview */}
      <box
        title="Prompt Preview"
        style={{
          flexGrow: 1,
          border: true,
          borderColor: colors.accent.primary,
          backgroundColor: colors.bg.secondary,
        }}
      >
        <scrollbox style={{ flexGrow: 1, padding: 1 }}>
          {promptPreview ? (
            <box style={{ flexDirection: 'column' }}>
              {promptPreview.split('\n').map((line, i) => {
                // Always wrap in box to ensure consistent structure
                if (line.match(/^#+\s/)) {
                  return (
                    <box key={i} style={{ flexDirection: 'row' }}>
                      <text fg={colors.accent.primary}>{line}</text>
                    </box>
                  );
                }
                // Highlight bullet points
                if (line.match(/^\s*[-*]\s/)) {
                  return (
                    <box key={i} style={{ flexDirection: 'row' }}>
                      <text fg={colors.fg.secondary}>{line}</text>
                    </box>
                  );
                }
                // Highlight code fences
                if (line.match(/^```/)) {
                  return (
                    <box key={i} style={{ flexDirection: 'row' }}>
                      <text fg={colors.accent.tertiary}>{line}</text>
                    </box>
                  );
                }
                // Regular text
                return (
                  <box key={i} style={{ flexDirection: 'row' }}>
                    <text fg={colors.fg.secondary}>{line}</text>
                  </box>
                );
              })}
            </box>
          ) : (
            <text fg={colors.fg.muted}>
              Cycle views with 'o' or press Shift+O for prompt preview
            </text>
          )}
        </scrollbox>
      </box>
    </box>
  );
}

/**
 * Task output view - shows full-height scrollable iteration output
 * with optional collapsible subagent sections
 */
function TaskOutputView({
  task: _task,
  currentIteration,
  iterationOutput,
  iterationSegments,
  iterationTiming,
  agentName,
  currentModel: _currentModel,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
  currentIteration: number;
  iterationOutput?: string;
  iterationSegments?: FormattedSegment[];
  iterationTiming?: IterationTimingInfo;
  agentName?: string;
  currentModel?: string;
}): ReactNode {
  // Check if we're live streaming
  const isLiveStreaming = iterationTiming?.isRunning === true;

  // For live streaming, prefer segments for TUI-native colors
  // For historical/completed output, parse the string to extract readable content
  // ALWAYS strip ANSI codes - they cause black background artifacts in OpenTUI
  const displayOutput = useMemo(() => {
    if (!iterationOutput) return undefined;
    // For live output during execution, strip ANSI but keep raw content
    if (isLiveStreaming) {
      return stripAnsiCodes(iterationOutput);
    }
    // For completed output (historical or from current session), parse to extract readable content
    // parseAgentOutput already strips ANSI codes
    return parseAgentOutput(iterationOutput, agentName);
  }, [iterationOutput, isLiveStreaming, agentName]);

  // Note: Full segment-based coloring (FormattedText) disabled due to OpenTUI
  // span rendering issues causing black backgrounds and character loss.
  // Using simple line-based coloring for tool calls instead.
  void iterationSegments;

  void _task;
  void _currentModel;

  return (
    <box
      title={
        currentIteration === -1
          ? 'Historical Output'
          : currentIteration > 0
            ? `Iteration ${currentIteration}`
            : 'Output'
      }
      style={{
        flexGrow: 1,
        border: true,
        borderColor: colors.border.normal,
        backgroundColor: colors.bg.secondary,
      }}
    >
      <scrollbox style={{ flexGrow: 1, padding: 1 }}>
          {/* Line-based coloring with tool names in green */}
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
                // Always return a box for consistency to avoid TextNodeRenderable issues
                return (
                  <box key={i} style={{ flexDirection: 'row' }}>
                    <text fg={colors.fg.secondary}>{line}</text>
                  </box>
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
  );
}

/**
 * Raw CLI output view (unparsed), useful for debugging agent/CLI logs.
 */
function CliOutputView({
  task,
  currentIteration,
  cliOutput,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
  currentIteration: number;
  cliOutput?: string;
}): ReactNode {
  const displayOutput = useMemo(() => {
    if (!cliOutput) return undefined;
    return stripAnsiCodes(cliOutput);
  }, [cliOutput]);

  return (
    <box style={{ flexGrow: 1, flexDirection: 'column' }}>
      <box style={{ marginBottom: 1 }}>
        <text fg={colors.fg.muted}>
          Raw CLI Logs • Iter {currentIteration} • {task.id}
        </text>
      </box>
      <box style={{ flexGrow: 1 }}>
        <scrollbox height="100%" focused>
          {displayOutput !== undefined && displayOutput.length > 0 ? (
            <box style={{ flexDirection: 'column', gap: 0 }}>
              {displayOutput.split('\n').map((line, i) => (
                <box key={i} style={{ flexDirection: 'row' }}>
                  <text fg={colors.fg.secondary}>{line}</text>
                </box>
              ))}
            </box>
          ) : displayOutput === '' ? (
            <text fg={colors.fg.muted}>No CLI output captured</text>
          ) : currentIteration === 0 ? (
            <text fg={colors.fg.muted}>Task not yet executed</text>
          ) : (
            <text fg={colors.fg.muted}>Waiting for CLI output...</text>
          )}
        </scrollbox>
      </box>
    </box>
  );
}

/**
 * Task details view - switches between metadata, output, and prompt views
 */
function TaskDetails({
  task,
  currentIteration,
  iterationOutput,
  iterationSegments,
  cliOutput,
  viewMode = 'details',
  agentName,
  promptPreview,
  templateSource,
}: {
  task: NonNullable<RightPanelProps['selectedTask']>;
  currentIteration: number;
  iterationOutput?: string;
  iterationSegments?: FormattedSegment[];
  cliOutput?: string;
  viewMode?: DetailsViewMode;
  agentName?: string;
  promptPreview?: string;
  templateSource?: string;
}): ReactNode {
  if (viewMode === 'output') {
    return (
      <TaskOutputView
        task={task}
        currentIteration={currentIteration}
        iterationOutput={iterationOutput}
        iterationSegments={iterationSegments}
        agentName={agentName}
      />
    );
  }

  if (viewMode === 'prompt') {
    return (
      <PromptPreviewView
        task={task}
        promptPreview={promptPreview}
        templateSource={templateSource}
      />
    );
  }

  if (viewMode === 'cli') {
    return (
      <CliOutputView
        task={task}
        currentIteration={currentIteration}
        cliOutput={cliOutput}
      />
    );
  }

  return <TaskMetadataView task={task} />;
}

/**
 * RightPanel component showing task details, iteration output, or prompt preview
 */
export function RightPanel({
  selectedTask,
  currentIteration,
  iterationOutput,
  iterationSegments,
  cliOutput,
  viewMode = 'details',
  iterationTiming: _iterationTiming,
  agentName,
  currentModel: _currentModel,
  promptPreview,
  templateSource,
  isViewingRemote = false,
  remoteConnectionStatus,
  remoteAlias,
  isFocused = true,
}: RightPanelProps): ReactNode {
  // Build title with view mode indicator
  const modeIndicators: Record<typeof viewMode, string> = {
    details: '[Details]',
    output: '[Output]',
    cli: '[CLI]',
    prompt: '[Prompt]',
  };
  const modeIndicator = modeIndicators[viewMode];
  const title = `Details ${modeIndicator}`;

  return (
    <box
      title={title}
      style={{
        flexGrow: 2,
        flexShrink: 1,
        minWidth: 40,
        flexDirection: 'column',
        backgroundColor: colors.bg.primary,
        border: true,
        borderColor: isFocused ? colors.accent.primary : colors.border.normal,
      }}
    >
      {selectedTask ? (
        <TaskDetails
          task={selectedTask}
          currentIteration={currentIteration}
          iterationOutput={iterationOutput}
          iterationSegments={iterationSegments}
          cliOutput={cliOutput}
          viewMode={viewMode}
          agentName={agentName}
          promptPreview={promptPreview}
          templateSource={templateSource}
        />
      ) : (
        <NoSelection
          isViewingRemote={isViewingRemote}
          remoteConnectionStatus={remoteConnectionStatus}
          remoteAlias={remoteAlias}
        />
      )}
    </box>
  );
}

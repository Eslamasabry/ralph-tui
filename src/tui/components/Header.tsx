/**
// OURS:
// OURS:
// OURS:
// OURS:
 * ABOUTME: Modern header component for the Ralph TUI.
 * Displays status indicator, current task (if running), progress (X/Y), elapsed time.
 * Also shows active agent name with fallback indicator and rate limit status.
 * Designed with improved visual hierarchy, better spacing, and clearer status indicators.
// THEIRS:
 * ABOUTME: Modernized header component for Ralph TUI.
 * Features improved visual hierarchy, distinctive status styling, and better information density.
 * Uses bracketed status indicators, pipe separators, and enhanced progress display. (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
// THEIRS:
 * ABOUTME: Header component for the Ralph TUI with modern, clean design.
 * Displays status indicator, current task info, agent/tracker configuration,
 * progress, and elapsed time with improved visual hierarchy and spacing.
 * Designed for clarity and quick status scanning at a glance. (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
// THEIRS:
 * ABOUTME: Modern header component for the Ralph TUI.
 * Displays status indicator, current task (if running), progress (X/Y), elapsed time.
 * Also shows active agent name with fallback indicator and rate limit status.
 * Designed with improved visual hierarchy, better spacing, and responsive truncation. (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
// THEIRS:
 * ABOUTME: Header component for the Ralph TUI with modern, clean design.
 * Displays essential info: status indicator, current task, progress, elapsed time.
 * Also shows active agent name, model, tracker, sandbox status, and rate limit indicators.
 * Designed for minimal vertical footprint while providing clear visibility into current state. (ralph-tui-5no.2: US-002: Footer Component Facelift)
 */

import type { ReactNode } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { colors, statusIndicators, formatElapsedTime, layout, type RalphStatus } from '../theme.js';
import type { HeaderProps } from '../types.js';

// ============================================================================
// Icons and Special Characters
// ============================================================================

const RATE_LIMIT_ICON = '⏳';
const SANDBOX_ICON = '🔒';
const REMOTE_ICON = '🌐';
const STALE_ICON = '⚡';
const SEPARATOR = '│';
const ARROW = '→';
const PROGRESS_BRACKET_LEFT = '[';
const PROGRESS_BRACKET_RIGHT = ']';

// ============================================================================
// Truncation Utilities
// ============================================================================

/**
// OURS:
 * Get available width for header sections based on terminal width
 */
function getAvailableWidth(terminalWidth: number): {
  leftSection: number;
  rightSection: number;
  taskDisplay: number;
} {
  // Reserve space for padding (2 chars each side), separators, and right section essentials
  const rightSectionMinWidth = 25; // Progress bar (8) + tasks (5) + iterations (10) + time (8) = ~31 minimum
  const padding = 4;

  if (terminalWidth < 60) {
    return {
      leftSection: Math.floor(terminalWidth * 0.35),
      rightSection: Math.floor(terminalWidth * 0.65) - padding,
      taskDisplay: 15,
    };
  }

  return {
    leftSection: Math.floor(terminalWidth * 0.4),
    rightSection: Math.floor(terminalWidth * 0.6) - padding,
    taskDisplay: 40,
  };
}

<<<<<<< HEAD
<<<<<<< HEAD
/** Version indicator icon */
const VERSION_ICON = '◆';

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Uses terminal-aware truncation based on available width.
// THEIRS:
/** Timer icon */
const TIMER_ICON = '⏱';

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Handles edge cases for very small widths. (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
/** Timer icon */
const TIMER_ICON = '⏱';

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Smart truncation that preserves the end of the string if possible.
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
 * Truncate text to fit within a given width, adding ellipsis if needed
>>>>>>> c33fffd (fix: ralph-tui-5no.1 - US-001: Header Component Facelift fixes)
 */
function truncateText(text: string, maxWidth: number): string {
  if (!text) return '';
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
 * Get compact status display for the current Ralph status.
<<<<<<< HEAD
 * Returns a short, scannable label optimized for the header with clear color coding.
=======
 * Get styled status display for the current Ralph status.
 * Returns bracketed indicator with optimized color treatment.
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
 * Get enhanced status display for the current Ralph status.
 * Returns a clear label with consistent color scheme optimized for visibility.
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
 */
function getStatusDisplay(status: RalphStatus): { indicator: string; color: string; label: string; bracketColor: string } {
=======
 * Returns a styled badge with indicator for improved visibility.
 */
function getStatusBadge(status: RalphStatus): { indicator: string; color: string; label: string } {
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
  switch (status) {
    case 'ready':
      return {
        indicator: statusIndicators.ready,
        color: colors.status.info,
        label: 'READY',
        bracketColor: colors.fg.dim,
      };
    case 'running':
      return {
        indicator: statusIndicators.running,
        color: colors.status.success,
        label: 'RUNNING',
        bracketColor: colors.fg.dim,
      };
    case 'selecting':
      return {
        indicator: statusIndicators.selecting,
        color: colors.status.info,
        label: 'SELECTING',
        bracketColor: colors.fg.dim,
      };
    case 'executing':
      return {
        indicator: statusIndicators.executing,
        color: colors.status.success,
        label: 'EXECUTING',
        bracketColor: colors.fg.dim,
      };
    case 'pausing':
      return {
        indicator: statusIndicators.pausing,
        color: colors.status.warning,
        label: 'PAUSING',
        bracketColor: colors.fg.dim,
      };
    case 'paused':
      return {
        indicator: statusIndicators.paused,
        color: colors.status.warning,
        label: 'PAUSED',
        bracketColor: colors.fg.dim,
      };
    case 'stopped':
      return {
        indicator: statusIndicators.stopped,
        color: colors.fg.muted,
        label: 'STOPPED',
        bracketColor: colors.fg.dim,
      };
    case 'complete':
      return {
        indicator: statusIndicators.complete,
        color: colors.status.success,
        label: 'COMPLETE',
        bracketColor: colors.fg.dim,
      };
    case 'idle':
      return {
        indicator: statusIndicators.idle,
        color: colors.fg.muted,
        label: 'IDLE',
        bracketColor: colors.fg.dim,
      };
    case 'error':
      return {
        indicator: statusIndicators.blocked,
        color: colors.status.error,
        label: 'ERROR',
        bracketColor: colors.status.error,
      };
  }
}

/**
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
 * Mini progress bar with improved visual clarity.
 * Shows completed vs total with distinct filled/empty sections.
=======
 * Enhanced progress bar with percentage display
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
 */
function EnhancedProgressBar({
=======
 * Compact progress bar for header display with smooth visual appearance.
 */
function CompactProgressBar({
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
  completed,
  total,
  width,
}: {
  completed: number;
  total: number;
  width: number;
}): ReactNode {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filledWidth = Math.floor((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filledBar = '█'.repeat(filledWidth);
  const emptyBar = '░'.repeat(emptyWidth);

  return (
    <text>
      <span fg={colors.status.success}>{filledBar}</span>
      <span fg={colors.fg.dim}>{emptyBar}</span>
      <span fg={colors.fg.dim}> </span>
      <span fg={colors.fg.secondary}>{percentage}%</span>
    </text>
  );
}

/**
<<<<<<< HEAD
 * Get display information for the active agent with enhanced styling.
 * Shows fallback indicator with distinctive treatment when applicable.
=======
=======
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
 * Get the display name and styling for the active agent.
 * Shows fallback indicator when on fallback agent with appropriate coloring.
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
 * Truncate task ID to a shorter length
 */
function truncateTaskId(taskId: string | undefined, maxWidth: number): string {
  if (!taskId) return '';
  return truncateText(taskId, maxWidth);
}

// ============================================================================
// Status Display
// ============================================================================

/**
 * Status display configuration with enhanced colors and labels
 */
interface StatusDisplay {
  indicator: string;
  color: string;
  label: string;
}

/**
 * Get enhanced status display for the current Ralph status.
 * Returns configuration optimized for the header with clear visual hierarchy.
 */
function getStatusDisplay(status: RalphStatus): StatusDisplay {
  const baseConfig: Record<RalphStatus, StatusDisplay> = {
    ready: { indicator: statusIndicators.ready, color: colors.status.info, label: 'Ready' },
    running: { indicator: statusIndicators.running, color: colors.status.success, label: 'Running' },
    selecting: { indicator: statusIndicators.selecting, color: colors.status.info, label: 'Selecting' },
    executing: { indicator: statusIndicators.executing, color: colors.status.success, label: 'Executing' },
    pausing: { indicator: statusIndicators.pausing, color: colors.status.warning, label: 'Pausing' },
    paused: { indicator: statusIndicators.paused, color: colors.status.warning, label: 'Paused' },
    stopped: { indicator: statusIndicators.stopped, color: colors.fg.muted, label: 'Stopped' },
    complete: { indicator: statusIndicators.complete, color: colors.status.success, label: 'Complete' },
    idle: { indicator: statusIndicators.idle, color: colors.fg.muted, label: 'Idle' },
    error: { indicator: statusIndicators.error, color: colors.status.error, label: 'Error' },
  };

  return baseConfig[status];
}

// ============================================================================
// Agent Display
// ============================================================================

/**
 * Agent display information including fallback status
 */
interface AgentDisplayInfo {
  displayName: string;
  color: string;
  showRateLimitIcon: boolean;
  statusLine: string | null;
}

/**
 * Get the display name and styling for the active agent.
 * Shows fallback indicator when on fallback agent with appropriate color.
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
 */
function getAgentDisplay(
  agentName: string | undefined,
  activeAgentState: HeaderProps['activeAgentState'],
  rateLimitState: HeaderProps['rateLimitState']
<<<<<<< HEAD
<<<<<<< HEAD
): { displayName: string; color: string; showRateLimitIcon: boolean; statusLine: string | null } {
=======
): {
  displayName: string;
  color: string;
  showRateLimitIcon: boolean;
  statusLine: string | null;
  bracketColor: string;
} {
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
): AgentDisplayInfo {
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
  const activeAgent = activeAgentState?.plugin ?? agentName;
  const isOnFallback = activeAgentState?.reason === 'fallback';
  const isPrimaryRateLimited = rateLimitState?.limitedAt !== undefined;
  const primaryAgent = rateLimitState?.primaryAgent;

  if (!activeAgent) {
<<<<<<< HEAD
    return {
      displayName: '',
      color: colors.accent.secondary,
      showRateLimitIcon: false,
      statusLine: null,
      bracketColor: colors.fg.dim,
    };
=======
    return { displayName: '', color: colors.accent.secondary, showRateLimitIcon: false, statusLine: null };
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
  }

  if (isOnFallback && isPrimaryRateLimited && primaryAgent) {
    return {
<<<<<<< HEAD
      displayName: `${activeAgent}`,
      color: colors.status.warning,
      showRateLimitIcon: true,
      statusLine: `Primary agent (${primaryAgent}) rate limited, using fallback`,
      bracketColor: colors.status.warning,
=======
      displayName: `${activeAgent} (fallback)`,
      color: colors.status.warning,
      showRateLimitIcon: true,
      statusLine: `Primary (${primaryAgent}) rate limited, using fallback`,
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
    };
  }

  if (isOnFallback) {
    return {
<<<<<<< HEAD
      displayName: `${activeAgent}`,
      color: colors.status.warning,
      showRateLimitIcon: false,
      statusLine: null,
      bracketColor: colors.fg.dim,
=======
      displayName: `${activeAgent} (fallback)`,
      color: colors.status.warning,
      showRateLimitIcon: false,
      statusLine: null,
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
    };
  }

  return {
    displayName: activeAgent,
    color: colors.accent.secondary,
    showRateLimitIcon: false,
    statusLine: null,
<<<<<<< HEAD
    bracketColor: colors.fg.dim,
  };
}

/**
 * Get sandbox display string with mode and network status.
 */
function getSandboxDisplay(sandboxConfig: HeaderProps['sandboxConfig']): string | null {
  if (!sandboxConfig?.enabled) {
    return null;
  }

  const mode = sandboxConfig.mode ?? 'auto';
  if (mode === 'off') {
    return null;
  }
=======
  };
}

// ============================================================================
// Sandbox Display
// ============================================================================

/**
 * Get the sandbox display string.
 * Returns null if sandbox is disabled, otherwise returns mode with optional suffix.
 */
function getSandboxDisplay(sandboxConfig: HeaderProps['sandboxConfig']): string | null {
  if (!sandboxConfig?.enabled) return null;

  const mode = sandboxConfig.mode ?? 'auto';
  if (mode === 'off') return null;
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)

  const networkSuffix = sandboxConfig.network === false ? ' (no-net)' : '';
  return `${mode}${networkSuffix}`;
}

<<<<<<< HEAD
/**
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
 * Calculate responsive truncation widths based on terminal width.
 * Ensures content is properly truncated on narrow terminals.
 */
function getTruncationWidths(terminalWidth: number): {
  taskTitle: number;
  agentName: number;
  modelName: number;
} {
  // Very narrow terminals (< 60 columns)
  if (terminalWidth < 60) {
    return { taskTitle: 15, agentName: 10, modelName: 10 };
  }
  // Narrow terminals (60-79 columns)
  if (terminalWidth < 80) {
    return { taskTitle: 25, agentName: 15, modelName: 15 };
  }
  // Standard terminals (80-119 columns)
  if (terminalWidth < 120) {
    return { taskTitle: 35, agentName: 20, modelName: 20 };
  }
  // Wide terminals (120+ columns)
  return { taskTitle: 50, agentName: 30, modelName: 30 };
}

/**
 * Modern header component with improved visual hierarchy:
 * - Status indicator and label with clear color coding
 * - Current task (when executing) with truncation for narrow terminals
 * - Agent, tracker plugin, and model names for configuration visibility
 * - Sandbox status when enabled (mode + network status)
 * - Fallback indicator when using fallback agent
 * - Rate limit icon when primary agent is limited
 * - Progress (X/Y tasks) with mini bar and percentage
 * - Elapsed time with icon
 * - Iteration counter [current/max] or [current/∞]
 * - Version indicator for app version display
=======
 * Modernized header with enhanced visual hierarchy:
 * - Bracketed status indicator for instant scannability
 * - Clear pipe separators between sections
 * - Enhanced progress bar with percentage
 * - Better color treatment for special states
 * - Improved rate limit warning styling
 * - Optimized spacing and typography
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
 * Header component showing essential execution information:
 * - Status indicator and label with clear visual hierarchy
 * - Current task (when executing) with truncated display
 * - Agent and tracker plugin names for configuration visibility
 * - Model being used (provider/model format)
 * - Sandbox status when enabled
 * - Fallback indicator when using fallback agent
 * - Rate limit icon when primary agent is limited
 * - Progress (X/Y tasks) with compact progress bar
 * - Iteration counter and elapsed time
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
 * Compact progress bar component for header display with improved visuals.
=======
// ============================================================================
// Model Display
// ============================================================================

/**
 * Parsed model display information
 */
interface ModelDisplayInfo {
  provider: string;
  model: string;
  display: string;
}

/**
 * Parse model info for display in a compact format
 */
function getModelDisplay(currentModel: string | undefined): ModelDisplayInfo | null {
  if (!currentModel) return null;

  const [provider, model] = currentModel.includes('/') ? currentModel.split('/') : ['', currentModel];
  return {
    provider,
    model: model || currentModel,
    display: provider ? `${provider}/${model}` : model,
  };
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Compact mini progress bar for header display
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
 */
function MiniProgressBar({
  completed,
  total,
  width,
}: {
  completed: number;
  total: number;
  width: number;
}): ReactNode {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filledWidth = Math.floor((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filledBar = '▓'.repeat(filledWidth);
  const emptyBar = '░'.repeat(emptyWidth);

  return (
    <text>
      <span fg={colors.status.success}>{filledBar}</span>
      <span fg={colors.fg.dim}>{emptyBar}</span>
    </text>
  );
}

// ============================================================================
// Header Section Components
// ============================================================================

/**
<<<<<<< HEAD
 * Separator component for visual division.
 */
function Separator(): ReactNode {
  return <text fg={colors.fg.dim}> │ </text>;
}

/**
 * Modern header component showing essential information with improved visual hierarchy:
 * - Status badge with indicator and label (left side)
 * - Current task (when executing)
 * - Agent and tracker plugin names (for configuration visibility)
 * - Model being used (provider/model format with logo)
 * - Sandbox status when enabled (mode + network status)
 * - Fallback indicator when using fallback agent
 * - Rate limit icon when primary agent is limited
 * - Status line when primary agent is rate limited (explains fallback)
 * - Progress (X/Y tasks) with progress bar
 * - Elapsed time
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
 * Status section showing the current status indicator and label
 */
function StatusSection({ statusDisplay }: { statusDisplay: StatusDisplay }): ReactNode {
  return (
    <text>
      <span fg={statusDisplay.color}>{statusDisplay.indicator}</span>
      <span fg={statusDisplay.color}> {statusDisplay.label}</span>
    </text>
  );
}

/**
 * Remote indicator section when viewing a remote instance
 */
function RemoteSection({
  name,
  host,
  port,
}: {
  name: string;
  host: string;
  port: number;
}): ReactNode {
  return (
    <text>
      <span fg={colors.accent.primary}>{REMOTE_ICON} {name}</span>
      <span fg={colors.fg.dim}> ({host}:{port})</span>
      <span fg={colors.fg.dim}> {SEPARATOR} </span>
    </text>
  );
}

/**
 * Stale indicator section when tracker data is stale
 */
function StaleSection(): ReactNode {
  return (
    <text>
      <span fg={colors.fg.dim}> {SEPARATOR} </span>
      <span fg={colors.status.warning}>{STALE_ICON} Stale</span>
    </text>
  );
}

/**
 * Task display section showing current task being worked on
 */
function TaskSection({
  taskTitle,
  taskId,
  taskDisplayWidth,
}: {
  taskTitle: string | undefined;
  taskId: string | undefined;
  taskDisplayWidth: number;
}): ReactNode {
  if (!taskTitle && !taskId) return null;

  const displayTask = taskTitle
    ? truncateText(taskTitle, taskDisplayWidth)
    : truncateTaskId(taskId, taskDisplayWidth);

  if (!displayTask) return null;

  return (
    <text>
      <span fg={colors.fg.muted}> {ARROW} </span>
      <span fg={colors.accent.tertiary}>{displayTask}</span>
    </text>
  );
}

/**
 * Progress section showing task completion progress
 */
function ProgressSection({
  completedTasks,
  totalTasks,
  currentIteration,
  maxIterations,
  elapsedTime,
}: {
  completedTasks: number;
  totalTasks: number;
  currentIteration: number | undefined;
  maxIterations: number | undefined;
  elapsedTime: number;
}): ReactNode {
  const formattedTime = formatElapsedTime(elapsedTime);
  const iterationDisplay =
    currentIteration !== undefined && maxIterations !== undefined
      ? ` ${PROGRESS_BRACKET_LEFT}${currentIteration}/${maxIterations === 0 ? '∞' : maxIterations}${PROGRESS_BRACKET_RIGHT}`
      : '';

  return (
    <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
      <MiniProgressBar completed={completedTasks} total={totalTasks} width={8} />
      <text fg={colors.fg.secondary}>
        {completedTasks}/{totalTasks}
      </text>
      <text fg={colors.fg.muted}>{iterationDisplay}</text>
      <text fg={colors.fg.muted}>⏱</text>
      <text fg={colors.fg.secondary}>{formattedTime}</text>
    </box>
  );
}

/**
 * Agent/Model/Tracker/Sandbox info section
 */
function AgentInfoSection({
  agentDisplay,
  modelDisplay,
  trackerName,
  sandboxDisplay,
}: {
  agentDisplay: AgentDisplayInfo;
  modelDisplay: ModelDisplayInfo | null;
  trackerName: string | undefined;
  sandboxDisplay: string | null;
}): ReactNode {
  const showAnyInfo = agentDisplay.displayName || modelDisplay || trackerName || sandboxDisplay;
  if (!showAnyInfo) return null;

  return (
    <text fg={colors.fg.muted}>
      {agentDisplay.showRateLimitIcon && (
        <span fg={colors.status.warning}>{RATE_LIMIT_ICON} </span>
      )}
      {agentDisplay.displayName && (
        <span fg={agentDisplay.color}>{agentDisplay.displayName}</span>
      )}
      {agentDisplay.displayName && (modelDisplay || trackerName || sandboxDisplay) && (
        <span fg={colors.fg.dim}> {SEPARATOR} </span>
      )}
      {modelDisplay && (
        <span fg={colors.accent.primary}>{modelDisplay.display}</span>
      )}
      {(agentDisplay.displayName || modelDisplay) && (trackerName || sandboxDisplay) && (
        <span fg={colors.fg.dim}> {SEPARATOR} </span>
      )}
      {trackerName && <span fg={colors.accent.tertiary}>{trackerName}</span>}
      {trackerName && sandboxDisplay && <span fg={colors.fg.dim}> {SEPARATOR} </span>}
      {sandboxDisplay && (
        <span fg={colors.status.info}>{SANDBOX_ICON} {sandboxDisplay}</span>
      )}
    </text>
  );
}

// ============================================================================
// Main Header Component
// ============================================================================

/**
 * Header component showing essential information with modern, clean design:
 * - Status indicator and label (left side)
 * - Current task when executing (left side)
 * - Agent, model, tracker, sandbox info (right side)
 * - Progress bar and task count (right side)
 * - Iteration counter and elapsed time (right side)
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
 */
export function Header({
  status,
  elapsedTime,
  currentTaskId,
  currentTaskTitle,
  completedTasks = 0,
  totalTasks = 0,
  agentName,
  trackerName,
  activeAgentState,
  rateLimitState,
  currentIteration,
  maxIterations,
  currentModel,
  sandboxConfig,
  remoteInfo,
  trackerRealtimeStatus,
}: HeaderProps): ReactNode {
<<<<<<< HEAD
  const { width: terminalWidth } = useTerminalDimensions();
  const truncationWidths = getTruncationWidths(terminalWidth);
  const statusDisplay = getStatusDisplay(status);
<<<<<<< HEAD
=======
  const statusBadge = getStatusBadge(status);
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
  const formattedTime = formatElapsedTime(elapsedTime);
  const agentDisplay = getAgentDisplay(agentName, activeAgentState, rateLimitState);

  // Parse model info for display with truncation
  const modelDisplay = currentModel
    ? (() => {
        const [provider, model] = currentModel.includes('/') ? currentModel.split('/') : ['', currentModel];
        const display = provider ? `${provider}/${model}` : model;
        return {
          provider,
          model: truncateText(model, truncationWidths.modelName),
          full: currentModel,
          display: truncateText(display, truncationWidths.modelName),
        };
      })()
    : null;

  const sandboxDisplay = getSandboxDisplay(sandboxConfig);

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  // Show abbreviated task title when executing, with terminal-aware truncation
=======
  // Show abbreviated task title when executing (adaptive truncation based on importance)
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
  const isActive = status === 'executing' || status === 'running';
  const taskDisplay = isActive
    ? currentTaskTitle
      ? truncateText(currentTaskTitle, truncationWidths.taskTitle)
=======
  // Show task title when executing, truncated to fit
  const isActive = status === 'executing' || status === 'running';
  const taskDisplay = isActive
    ? currentTaskTitle
      ? truncateText(currentTaskTitle, 50)
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
  // Show abbreviated task title when executing
  const isActive = status === 'executing' || status === 'running';
  const taskDisplay = isActive
    ? currentTaskTitle
      ? truncateText(currentTaskTitle, 45)
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
      : currentTaskId
        ? truncateText(currentTaskId, 25)
        : null
    : null;

  // Header height: 1 row normally, 2 rows when status line is present
=======
  const agentDisplay = getAgentDisplay(agentName, activeAgentState, rateLimitState);
  const modelDisplay = getModelDisplay(currentModel);
  const sandboxDisplay = getSandboxDisplay(sandboxConfig);
  const isActive = status === 'executing' || status === 'running';
  const isStale = trackerRealtimeStatus === 'stale';

  // Calculate header height based on content
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
  const headerHeight = agentDisplay.statusLine ? 2 : layout.header.height;

  // Calculate progress percentage for display
  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <box
      style={{
        width: '100%',
        height: headerHeight,
        flexDirection: 'column',
        backgroundColor: colors.bg.secondary,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
      {/* Main header row with improved visual hierarchy */}
      <box
        style={{
          width: '100%',
          height: 1,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        {/* Left section: Remote indicator + Status indicator + label + optional current task */}
        <box style={{ flexDirection: 'row', gap: 1, flexShrink: 1, alignItems: 'center' }}>
          {/* Remote info (when viewing remote) */}
          {remoteInfo && (
            <text>
              <span fg={colors.accent.primary}>{REMOTE_ICON}</span>
              <span fg={colors.fg.dim}> </span>
            </text>
          )}

          {/* Status indicator with clear color coding */}
=======
        {/* Left section: Remote, Status, Tracker status, Task */}
        <box style={{ flexDirection: 'row', gap: 1, flexShrink: 1, alignItems: 'center' }}>
          {/* Remote indicator */}
          {remoteInfo && (
            <text>
              <span fg={colors.accent.primary}>{REMOTE_ICON}</span>
              <span fg={colors.fg.primary}> {remoteInfo.name}</span>
              <span fg={colors.fg.dim}> ({remoteInfo.host}:{remoteInfo.port})</span>
=======
        {/* Left section: Remote indicator + Status with clear visual hierarchy */}
        <box style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
          {/* Remote info prefix */}
          {remoteInfo && (
            <text>
              <span fg={colors.accent.primary}>{REMOTE_ICON} </span>
              <span fg={colors.fg.secondary}>{remoteInfo.name}</span>
              <span fg={colors.fg.dim}>:{remoteInfo.port}</span>
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
              <span fg={colors.fg.dim}> │ </span>
            </text>
          )}

<<<<<<< HEAD
          {/* Status indicator with brackets */}
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
          {/* Status indicator and label with emphasis */}
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          <text>
            <span fg={statusDisplay.bracketColor}>[</span>
            <span fg={statusDisplay.color}>{statusDisplay.indicator}</span>
<<<<<<< HEAD
            <span fg={statusDisplay.color}> {statusDisplay.label}</span>
            <span fg={statusDisplay.bracketColor}>]</span>
          </text>

<<<<<<< HEAD
          {/* Tracker stale indicator */}
          {trackerRealtimeStatus === 'stale' && (
            <text>
              <span fg={colors.fg.dim}>·</span>
              <span fg={colors.status.warning}> Stale</span>
            </text>
          )}

          {/* Current task display when active */}
          {taskDisplay && (
            <text>
              <span fg={colors.fg.muted}>› </span>
              <span fg={colors.accent.tertiary}>{taskDisplay}</span>
=======
          {/* Stale tracker status */}
=======
            <span fg={statusDisplay.color}> </span>
            <span fg={statusDisplay.color}>{statusDisplay.label}</span>
          </text>

          {/* Stale tracker indicator */}
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          {trackerRealtimeStatus === 'stale' && (
            <text>
              <span fg={colors.fg.dim}> │ </span>
              <span fg={colors.fg.dim}>[</span>
              <span fg={colors.status.warning}>{statusIndicators.paused} STALE</span>
              <span fg={colors.fg.dim}>]</span>
            </text>
          )}

<<<<<<< HEAD
          {/* Current task */}
=======
          {/* Current task display */}
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          {taskDisplay && (
            <text>
              <span fg={colors.fg.dim}> │ </span>
              <span fg={colors.fg.dim}>→</span>
              <span fg={colors.accent.tertiary}> {taskDisplay}</span>
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
            </text>
          )}
        </box>

<<<<<<< HEAD
<<<<<<< HEAD
        {/* Right section: Agent/Model/Tracker + Sandbox + Progress + Time */}
        <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center', flexShrink: 0 }}>
          {/* Agent, model, tracker, and sandbox indicators - improved grouping */}
=======
        {/* Right section: Agent info + Progress + Time with clean spacing */}
        <box style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
          {/* Agent, model, tracker, and sandbox indicators - compact layout */}
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
        {/* Left section: Status badge with remote indicator + optional current task */}
        <box style={{ flexDirection: 'row', gap: 1, flexShrink: 1, alignItems: 'center' }}>
          {/* Remote indicator (if viewing remote) */}
          {remoteInfo && (
            <>
              <text fg={colors.accent.primary}>{REMOTE_ICON}</text>
              <text fg={colors.fg.secondary}>{remoteInfo.name}</text>
              <Separator />
            </>
          )}

          {/* Status badge with indicator */}
          <text>
            <span fg={statusBadge.color}>{statusBadge.indicator}</span>
            <span fg={statusBadge.color}> {statusBadge.label}</span>
          </text>

          {/* Tracker stale indicator */}
          {trackerRealtimeStatus === 'stale' && (
            <>
              <Separator />
              <text fg={colors.status.warning}>{statusIndicators.paused} Stale</text>
            </>
          )}

          {/* Current task display */}
          {taskDisplay && (
            <>
              <Separator />
              <text>
                <span fg={colors.fg.muted}>→ </span>
                <span fg={colors.accent.tertiary}>{taskDisplay}</span>
              </text>
            </>
          )}
        </box>

        {/* Right section: Agent/Tracker + Model + Sandbox + Progress + Time */}
        <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          {/* Agent, model, tracker, and sandbox indicators */}
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          {(agentDisplay.displayName || trackerName || modelDisplay || sandboxDisplay) && (
            <text fg={colors.fg.secondary}>
              {/* Rate limit warning */}
=======
        {/* Right section: Agent | Model | Tracker | Sandbox | Progress | Iterations | Time */}
        <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          {/* Agent, model, tracker, and sandbox section */}
          {(agentDisplay.displayName || modelDisplay || trackerName || sandboxDisplay) && (
            <text fg={colors.fg.muted}>
<<<<<<< HEAD
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
              {/* Rate limit indicator */}
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
              {agentDisplay.showRateLimitIcon && (
                <span fg={colors.status.warning}>{RATE_LIMIT_ICON} </span>
              )}

<<<<<<< HEAD
              {/* Agent name with fallback styling */}
=======
              {/* Agent name */}
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
              {agentDisplay.displayName && (
                <span fg={agentDisplay.color}>{truncateText(agentDisplay.displayName, truncationWidths.agentName)}</span>
              )}
<<<<<<< HEAD

              {/* Model display */}
              {(agentDisplay.displayName || modelDisplay) && modelDisplay && (
                <>
                  <span fg={colors.fg.dim}>·</span>
                  <span fg={colors.accent.primary}>{modelDisplay.display}</span>
                </>
              )}

              {/* Tracker name */}
              {(agentDisplay.displayName || modelDisplay) && trackerName && (
                <>
                  <span fg={colors.fg.dim}>·</span>
                  <span fg={colors.accent.tertiary}>{trackerName}</span>
                </>
              )}

              {/* Sandbox status */}
=======
              {agentDisplay.displayName && (trackerName || modelDisplay || sandboxDisplay) && (
                <span fg={colors.fg.dim}> | </span>
              )}
<<<<<<< HEAD
              {modelDisplay && (
                <span fg={colors.accent.primary}>{modelDisplay.display}</span>
              )}
              {(agentDisplay.displayName || modelDisplay) && (trackerName || sandboxDisplay) && (
                <span fg={colors.fg.dim}> | </span>
              )}
              {trackerName && <span fg={colors.accent.tertiary}>{trackerName}</span>}
              {trackerName && sandboxDisplay && <span fg={colors.fg.dim}> | </span>}
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
              {sandboxDisplay && (
                <>
                  <span fg={colors.fg.dim}>·</span>
                  <span fg={colors.status.info}>{SANDBOX_ICON}</span>
                  <span fg={colors.status.info}> {sandboxDisplay}</span>
                </>
=======

              {/* Model */}
              {agentDisplay.displayName && (trackerName || modelDisplay || sandboxDisplay) && <Separator />}
              {modelDisplay && <span fg={colors.accent.primary}>{modelDisplay.display}</span>}

              {/* Tracker */}
              {(agentDisplay.displayName || modelDisplay) && (trackerName || sandboxDisplay) && <Separator />}
              {trackerName && <span fg={colors.accent.tertiary}>{trackerName}</span>}

              {/* Sandbox */}
              {trackerName && sandboxDisplay && <Separator />}
              {sandboxDisplay && (
                <span fg={colors.status.info}>
                  {SANDBOX_ICON} {sandboxDisplay}
                </span>
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
              )}
            </text>
          )}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
          {/* Progress section with mini bar and percentage */}
=======
          {/* Progress bar with percentage */}
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
          {/* Progress bar and count */}
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
            <span fg={colors.fg.dim}>|</span>
            <EnhancedProgressBar completed={completedTasks} total={totalTasks} width={8} />
            <text fg={colors.fg.secondary}>
              {completedTasks}/{totalTasks}
            </text>
            <text fg={colors.fg.muted}>
              ({progressPercentage}%)
            </text>
          </box>

<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          {/* Iteration counter - show current/max or current/∞ for unlimited */}
          {currentIteration !== undefined && maxIterations !== undefined && (
            <text fg={colors.fg.muted}>
              <span fg={colors.fg.secondary}>[</span>
              <span fg={colors.accent.tertiary}>{currentIteration}</span>
              <span fg={colors.fg.secondary}>/{maxIterations === 0 ? '∞' : maxIterations}]</span>
=======
          {/* Progress bar and task count */}
          {(completedTasks > 0 || totalTasks > 0) && (
            <box style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 1 }}>
              <CompactProgressBar completed={completedTasks} total={totalTasks} width={10} />
              <text fg={colors.fg.secondary}> {completedTasks}/{totalTasks}</text>
            </box>
          )}

          {/* Iteration counter */}
          {currentIteration !== undefined && maxIterations !== undefined && (
            <text fg={colors.fg.muted}>
              {' '}
              <span fg={colors.fg.secondary}>
                [{currentIteration}/{maxIterations === 0 ? '∞' : maxIterations}]
              </span>
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
            </text>
          )}

<<<<<<< HEAD
          {/* Elapsed time with icon */}
<<<<<<< HEAD
          <box style={{ flexDirection: 'row', gap: 0, alignItems: 'center' }}>
            <text fg={colors.fg.muted}>⏱</text>
            <text fg={colors.fg.secondary}> {formattedTime}</text>
          </box>

          {/* Version indicator (subtle) */}
          <text fg={colors.fg.dim}>
            {VERSION_ICON}
=======
          {/* Iteration counter */}
          {currentIteration !== undefined && maxIterations !== undefined && (
            <text fg={colors.fg.muted}>
              <span fg={colors.fg.dim}>| </span>
              <span fg={colors.fg.dim}>[</span>
              <span fg={colors.fg.secondary}>{currentIteration}/{maxIterations === 0 ? '∞' : maxIterations}</span>
              <span fg={colors.fg.dim}>]</span>
            </text>
          )}

          {/* Elapsed time */}
          <text fg={colors.fg.muted}>
            <span fg={colors.fg.dim}>| </span>
            <span fg={colors.fg.secondary}>⏱ {formattedTime}</span>
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          </text>
=======
          <text fg={colors.fg.muted}>
            {' '}{TIMER_ICON}{' '}
          </text>
=======
          {/* Elapsed time */}
          <text fg={colors.fg.muted}>{TIMER_ICON}</text>
>>>>>>> e351128 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
          <text fg={colors.fg.secondary}>{formattedTime}</text>
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
=======
        {/* Left section: Remote indicator (if viewing remote) + Status + Task */}
        <box style={{ flexDirection: 'row', gap: 0, flexShrink: 1, alignItems: 'center' }}>
          {remoteInfo && (
            <RemoteSection name={remoteInfo.name} host={remoteInfo.host} port={remoteInfo.port} />
          )}
          <StatusSection statusDisplay={statusDisplay} />
          {isStale && <StaleSection />}
          {isActive && (
            <TaskSection
              taskTitle={currentTaskTitle}
              taskId={currentTaskId}
              taskDisplayWidth={40}
            />
          )}
        </box>

        {/* Right section: Agent info + Progress + Time */}
        <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center', flexShrink: 0 }}>
          <AgentInfoSection
            agentDisplay={agentDisplay}
            modelDisplay={modelDisplay}
            trackerName={trackerName}
            sandboxDisplay={sandboxDisplay}
          />
          <ProgressSection
            completedTasks={completedTasks}
            totalTasks={totalTasks}
            currentIteration={currentIteration}
            maxIterations={maxIterations}
            elapsedTime={elapsedTime}
          />
>>>>>>> f77e912 (ralph-tui-5no.2: US-002: Footer Component Facelift)
        </box>
      </box>

      {/* Rate limit status row - shown when primary agent is rate limited */}
      {agentDisplay.statusLine && (
        <box
          style={{
            width: '100%',
            height: 1,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: colors.bg.tertiary,
          }}
        >
          <text fg={colors.status.warning}>
            <span>{RATE_LIMIT_ICON} </span>
            <span fg={colors.fg.secondary}>{agentDisplay.statusLine}</span>
          </text>
        </box>
      )}
    </box>
  );
}

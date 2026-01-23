/**
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
 */

import type { ReactNode } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { colors, statusIndicators, formatElapsedTime, layout, type RalphStatus } from '../theme.js';
import type { HeaderProps } from '../types.js';

/** Rate limit indicator icon */
const RATE_LIMIT_ICON = '⏳';

/** Sandbox indicator icon */
const SANDBOX_ICON = '🔒';

/** Remote indicator icon */
const REMOTE_ICON = '🌐';

<<<<<<< HEAD
/** Version indicator icon */
const VERSION_ICON = '◆';

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Uses terminal-aware truncation based on available width.
=======
/** Timer icon */
const TIMER_ICON = '⏱';

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Handles edge cases for very small widths.
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
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
 * Get compact status display for the current Ralph status.
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
 * Get the display name and styling for the active agent.
 * Shows fallback indicator when on fallback agent with appropriate coloring.
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
 */
function getAgentDisplay(
  agentName: string | undefined,
  activeAgentState: HeaderProps['activeAgentState'],
  rateLimitState: HeaderProps['rateLimitState']
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
  const activeAgent = activeAgentState?.plugin ?? agentName;
  const isOnFallback = activeAgentState?.reason === 'fallback';
  const isPrimaryRateLimited = rateLimitState?.limitedAt !== undefined;
  const primaryAgent = rateLimitState?.primaryAgent;

  if (!activeAgent) {
    return {
      displayName: '',
      color: colors.accent.secondary,
      showRateLimitIcon: false,
      statusLine: null,
      bracketColor: colors.fg.dim,
    };
  }

  if (isOnFallback && isPrimaryRateLimited && primaryAgent) {
    return {
      displayName: `${activeAgent}`,
      color: colors.status.warning,
      showRateLimitIcon: true,
      statusLine: `Primary agent (${primaryAgent}) rate limited, using fallback`,
      bracketColor: colors.status.warning,
    };
  }

  if (isOnFallback) {
    return {
      displayName: `${activeAgent}`,
      color: colors.status.warning,
      showRateLimitIcon: false,
      statusLine: null,
      bracketColor: colors.fg.dim,
    };
  }

  return {
    displayName: activeAgent,
    color: colors.accent.secondary,
    showRateLimitIcon: false,
    statusLine: null,
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

  const networkSuffix = sandboxConfig.network === false ? ' (no-net)' : '';
  return `${mode}${networkSuffix}`;
}

/**
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
  const { width: terminalWidth } = useTerminalDimensions();
  const truncationWidths = getTruncationWidths(terminalWidth);
  const statusDisplay = getStatusDisplay(status);
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
  // Show abbreviated task title when executing, with terminal-aware truncation
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
          {(agentDisplay.displayName || trackerName || modelDisplay || sandboxDisplay) && (
            <text fg={colors.fg.secondary}>
              {/* Rate limit warning */}
=======
        {/* Right section: Agent | Model | Tracker | Sandbox | Progress | Iterations | Time */}
        <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          {/* Agent, model, tracker, and sandbox section */}
          {(agentDisplay.displayName || modelDisplay || trackerName || sandboxDisplay) && (
            <text fg={colors.fg.muted}>
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
              {agentDisplay.showRateLimitIcon && (
                <span fg={colors.status.warning}>{RATE_LIMIT_ICON} </span>
              )}

              {/* Agent name with fallback styling */}
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
              )}
            </text>
          )}

<<<<<<< HEAD
<<<<<<< HEAD
          {/* Progress section with mini bar and percentage */}
=======
          {/* Progress bar with percentage */}
>>>>>>> d2818d9 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
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
          <text fg={colors.fg.secondary}>{formattedTime}</text>
>>>>>>> 92824a0 (feat: ralph-tui-5no.1 - US-001: Header Component Facelift)
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

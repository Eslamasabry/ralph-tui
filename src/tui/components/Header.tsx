/**
 * ABOUTME: Modern header component for the Ralph TUI.
 * Displays status indicator, current task (if running), progress (X/Y), elapsed time.
 * Also shows active agent name with fallback indicator and rate limit status.
 * Designed with improved visual hierarchy, better spacing, and responsive truncation.
 */

import type { ReactNode } from 'react';
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
const TIMER_ICON = '⏱';

// ============================================================================
// Truncation Utilities
// ============================================================================

/**
 * Truncate text to fit within a given width, adding ellipsis if needed.
 * Smart truncation that preserves the end of the string if possible.
 */
function truncateText(text: string, maxWidth: number): string {
  if (!text) return '';
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
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
 */
function getAgentDisplay(
  agentName: string | undefined,
  activeAgentState: HeaderProps['activeAgentState'],
  rateLimitState: HeaderProps['rateLimitState']
): AgentDisplayInfo {
  const activeAgent = activeAgentState?.plugin ?? agentName;
  const isOnFallback = activeAgentState?.reason === 'fallback';
  const isPrimaryRateLimited = rateLimitState?.limitedAt !== undefined;
  const primaryAgent = rateLimitState?.primaryAgent;

  if (!activeAgent) {
    return { displayName: '', color: colors.accent.secondary, showRateLimitIcon: false, statusLine: null };
  }

  if (isOnFallback && isPrimaryRateLimited && primaryAgent) {
    return {
      displayName: `${activeAgent} (fallback)`,
      color: colors.status.warning,
      showRateLimitIcon: true,
      statusLine: `Primary (${primaryAgent}) rate limited, using fallback`,
    };
  }

  if (isOnFallback) {
    return {
      displayName: `${activeAgent} (fallback)`,
      color: colors.status.warning,
      showRateLimitIcon: false,
      statusLine: null,
    };
  }

  return {
    displayName: activeAgent,
    color: colors.accent.secondary,
    showRateLimitIcon: false,
    statusLine: null,
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

  const networkSuffix = sandboxConfig.network === false ? ' (no-net)' : '';
  return `${mode}${networkSuffix}`;
}

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
      <span fg={colors.fg.dim}> ({host}:{String(port)})</span>
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
        {String(completedTasks)}/{String(totalTasks)}
      </text>
      <text fg={colors.fg.muted}>{iterationDisplay}</text>
      <text fg={colors.fg.muted}>{TIMER_ICON}</text>
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
      <span fg={colors.accent.tertiary}>{trackerName || ''}</span>
      <span fg={colors.fg.dim}>{(trackerName && sandboxDisplay) ? `${SEPARATOR} ` : ''}</span>
      <span fg={colors.status.info}>{sandboxDisplay ? `${SANDBOX_ICON} ${sandboxDisplay}` : ''}</span>
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
  const statusDisplay = getStatusDisplay(status);
  const agentDisplay = getAgentDisplay(agentName, activeAgentState, rateLimitState);
  const modelDisplay = getModelDisplay(currentModel);
  const sandboxDisplay = getSandboxDisplay(sandboxConfig);
  const isActive = status === 'executing' || status === 'running';
  const isStale = trackerRealtimeStatus === 'stale';

  // Calculate header height based on content
  const headerHeight = agentDisplay.statusLine ? 2 : layout.header.height;

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

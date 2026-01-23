/**
 * ABOUTME: Progress Dashboard component for the Ralph TUI.
 * Displays execution status, current task info, and agent/tracker configuration.
 * Shows detailed activity information to make engine state clear.
 * Redesigned with improved visual hierarchy, better status indicators, and optimized spacing.
 */

import type { ReactNode } from 'react';
import { useTerminalDimensions } from '@opentui/react';
import { colors, statusIndicators, layout, type RalphStatus } from '../theme.js';
import type { SandboxConfig, SandboxMode, CleanupConfig } from '../../config/types.js';

/**
 * Props for the ProgressDashboard component
 */
/**
 * Git repository information for display
 */
export interface GitInfo {
  repoName?: string;
  branch?: string;
  isDirty?: boolean;
  commitHash?: string;
}

export interface ProgressDashboardProps {
  /** Current Ralph execution status */
  status: RalphStatus;
  /** Name of the agent being used */
  agentName: string;
  /** Model being used (provider/model format) */
  currentModel?: string;
  /** Name of the tracker being used */
  trackerName: string;
  /** Epic or project name */
  epicName?: string;
  /** Current task ID being worked on (if any) */
  currentTaskId?: string;
  /** Current task title being worked on (if any) */
  currentTaskTitle?: string;
  /** Sandbox configuration (if sandboxing is enabled) */
  sandboxConfig?: SandboxConfig;
  /** Resolved sandbox mode (when mode is 'auto', this shows what it resolved to) */
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>;
  /** Remote instance info (when viewing a remote) */
  remoteInfo?: {
    name: string;
    host: string;
    port: number;
  };
  /** Whether auto-commit is enabled */
  autoCommit?: boolean;
  /** Git repository information */
  gitInfo?: GitInfo;
  /** Number of tasks pending main sync (delivery guarantee blocked) */
  pendingMainCount?: number;
  /** Cleanup configuration (if cleanup is enabled) */
  cleanupConfig?: CleanupConfig;
}

/**
 * Section icons for visual hierarchy (learned from ActivityView patterns)
 */
const SECTIONS = {
  status: '◎',
  config: '⚙',
  task: '▶',
} as const;

/**
 * Truncate text to fit within a given width, adding ellipsis if needed
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Get status display configuration with detailed activity info
 */
function getStatusDisplay(
  status: RalphStatus,
  currentTaskId?: string
): { label: string; color: string; indicator: string } {
  switch (status) {
    case 'ready':
      return { label: 'Ready - Press Enter or s to start', color: colors.status.info, indicator: statusIndicators.ready };
    case 'running':
      return { label: 'Running', color: colors.status.success, indicator: statusIndicators.running };
    case 'selecting':
      return { label: 'Selecting next task...', color: colors.status.info, indicator: statusIndicators.selecting };
    case 'executing': {
      const taskLabel = currentTaskId ? ` (${currentTaskId})` : '';
      return { label: `Agent running${taskLabel}`, color: colors.status.success, indicator: statusIndicators.executing };
    }
    case 'pausing':
      return { label: 'Pausing after current iteration...', color: colors.status.warning, indicator: statusIndicators.pausing };
    case 'paused':
      return { label: 'Paused - Press p to resume', color: colors.status.warning, indicator: statusIndicators.paused };
    case 'stopped':
      return { label: 'Stopped', color: colors.fg.muted, indicator: statusIndicators.stopped };
    case 'complete':
      return { label: 'All tasks complete!', color: colors.status.success, indicator: statusIndicators.complete };
    case 'idle':
      return { label: 'No more tasks available', color: colors.fg.muted, indicator: statusIndicators.idle };
    case 'error':
      return { label: 'Failed - Check logs for details', color: colors.status.error, indicator: statusIndicators.blocked };
  }
}

/**
 * Get sandbox display info from config
 * Always returns a display value with icon indicating enabled/disabled state
 */
function getSandboxDisplay(
  sandboxConfig?: SandboxConfig,
  resolvedSandboxMode?: Exclude<SandboxMode, 'auto'>
): { enabled: boolean; icon: string; text: string } {
  const isEnabled = sandboxConfig?.enabled && sandboxConfig.mode !== 'off';

  if (!isEnabled) {
    return { enabled: false, icon: '🔓', text: 'off' };
  }

  const mode = sandboxConfig.mode ?? 'auto';
  // Show resolved mode when mode is 'auto' (e.g., "auto (bwrap)")
  const modeDisplay = mode === 'auto' && resolvedSandboxMode
    ? `auto (${resolvedSandboxMode})`
    : mode;
  const networkSuffix = sandboxConfig.network === false ? ' (no-net)' : '';
  return { enabled: true, icon: '🔒', text: `${modeDisplay}${networkSuffix}` };
}

/**
 * Get cleanup display info from config
 * Shows cleanup mode and whether individual actions are enabled
 */
function getCleanupDisplay(
  cleanupConfig?: CleanupConfig
): { enabled: boolean; icon: string; text: string } {
  const mode = cleanupConfig?.mode ?? 'manual';

  if (mode === 'off') {
    return { enabled: false, icon: '🧹', text: 'off' };
  }

  // Count enabled actions
  const actions = cleanupConfig ?? {};
  let enabledCount = 0;
  let totalCount = 0;

  const actionKeys: (keyof CleanupConfig)[] = ['syncMain', 'pruneWorktrees', 'deleteBranches', 'push', 'cleanupLogs'];
  for (const key of actionKeys) {
    if (key === 'mode') continue;
    totalCount++;
    if (actions[key]?.enabled !== false) {
      enabledCount++;
    }
  }

  return {
    enabled: true,
    icon: '🧹',
    text: `${mode} (${enabledCount}/${totalCount})`,
  };
}

/**
 * Compact stat item for configuration display
 */
function ConfigStat({
  label,
  value,
  color,
}: {
  label: string;
  value: ReactNode;
  color?: string;
}): ReactNode {
  return (
    <text>
      <span fg={colors.fg.muted}>{label}:</span>{' '}
      <span fg={color ?? colors.fg.primary}>{value}</span>
    </text>
  );
}

/**
 * Progress Dashboard component showing comprehensive execution status.
 * Provides clear visibility into what the engine is doing at any moment.
 * Redesigned with improved visual hierarchy and consistent styling.
 */
export function ProgressDashboard({
  status,
  agentName,
  currentModel,
  trackerName,
  epicName,
  currentTaskId,
  currentTaskTitle,
  sandboxConfig,
  resolvedSandboxMode,
  remoteInfo,
  autoCommit,
  gitInfo,
  pendingMainCount,
  cleanupConfig,
}: ProgressDashboardProps): ReactNode {
  // Use terminal dimensions for responsive layout
  const { width } = useTerminalDimensions();

  // Calculate adaptive task title truncation based on available space
  const taskTruncationWidth = Math.max(20, Math.min(45, width - 70));

  const statusDisplay = getStatusDisplay(status, currentTaskId);
  const sandboxDisplay = getSandboxDisplay(sandboxConfig, resolvedSandboxMode);
  const cleanupDisplay = getCleanupDisplay(cleanupConfig);

  // Determine border color based on status for visual feedback
  const borderColor = status === 'error' ? colors.status.error
    : status === 'complete' ? colors.status.success
    : status === 'paused' || status === 'pausing' ? colors.status.warning
    : colors.border.normal;

  // Format git info for display
  const gitDisplay = gitInfo?.branch
    ? `${gitInfo.repoName ?? 'repo'}:${gitInfo.branch}${gitInfo.isDirty ? '*' : ''}`
    : null;

  // Show current task title when executing (adaptive truncation)
  const taskDisplay = currentTaskTitle && (status === 'executing' || status === 'running')
    ? truncateText(currentTaskTitle, taskTruncationWidth)
    : null;

  // Parse model info for display
  const modelDisplay = currentModel
    ? (() => {
        const [provider, model] = currentModel.includes('/') ? currentModel.split('/') : ['', currentModel];
        return { provider, model, full: currentModel, display: provider ? `${provider}/${model}` : model };
      })()
    : null;

  // Calculate adaptive right column width based on terminal size
  // Small terminals (< 100): use more compact display
  // Medium terminals (100-140): use 40 width
  // Large terminals (>= 140): use 50 width
  const rightColumnWidth = width < 100 ? 30 : width < 140 ? 40 : 50;

  // Status indicator for border styling
  const statusIndicator = status === 'running' || status === 'executing' ? '●'
    : status === 'selecting' ? '◐'
    : status === 'paused' ? '⏸'
    : status === 'complete' ? '✓'
    : status === 'error' ? '✗'
    : status === 'ready' ? '◉'
    : '○';

  return (
    <box
      style={{
        width: '100%',
        height: layout.progressDashboard.height,
        flexDirection: 'column',
        backgroundColor: colors.bg.secondary,
        padding: 1,
        border: true,
        borderStyle: 'rounded',
        borderColor: borderColor,
        overflow: 'hidden',
      }}
    >
      {/* Title row with status indicator */}
      <box
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 1,
        }}
      >
        <text fg={colors.fg.primary}>
          <strong>Progress Dashboard</strong>
        </text>
        <text>
          <span fg={borderColor}>{statusIndicator}</span>
          <span fg={colors.fg.muted}> {statusDisplay.label}</span>
        </text>
      </box>

      {/* Main content - two column layout */}
      <box
        style={{
          flexDirection: 'row',
          flexGrow: 1,
          gap: 2,
        }}
      >
        {/* Left column: Status and current context */}
        <box style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 1 }}>
          {/* Remote info (if viewing remote) */}
          {remoteInfo && (
            <box style={{ flexDirection: 'row' }}>
              <text fg={colors.accent.primary}>{SECTIONS.status} </text>
              <text fg={colors.fg.secondary}>Remote: </text>
              <text fg={colors.accent.primary}>{remoteInfo.name}</text>
              <text fg={colors.fg.muted}> ({remoteInfo.host}:{String(remoteInfo.port)})</text>
            </box>
          )}

          {/* Epic name (if any) */}
          {epicName && (
            <box style={{ flexDirection: 'row' }}>
              <text fg={colors.accent.tertiary}>{SECTIONS.task} </text>
              <text fg={colors.fg.secondary}>Epic: </text>
              <text fg={colors.accent.primary}>{epicName}</text>
            </box>
          )}

          {/* Current task info - shown when executing */}
          {taskDisplay && currentTaskId && (
            <box style={{ flexDirection: 'row' }}>
              <text fg={colors.status.info}>{SECTIONS.task} </text>
              <text fg={colors.fg.secondary}>Task: </text>
              <text fg={colors.accent.tertiary}>{currentTaskId}</text>
              <text fg={colors.fg.dim}> - </text>
              <text fg={colors.fg.primary}>{taskDisplay}</text>
            </box>
          )}

          {/* Pending main sync warning */}
          {pendingMainCount !== undefined && pendingMainCount > 0 && (
            <box style={{ flexDirection: 'row' }}>
              <text fg={colors.status.warning}>⚠ </text>
              <text fg={colors.fg.secondary}>Pending main: </text>
              <text fg={colors.status.warning}>{String(pendingMainCount)}</text>
              <text fg={colors.fg.muted}> task(s)</text>
            </box>
          )}
        </box>

        {/* Right column: Configuration items (adaptive width) */}
        <box style={{ flexDirection: 'column', width: rightColumnWidth, flexShrink: 0, gap: 1 }}>
          {/* Section header */}
          <text fg={colors.fg.muted}>{SECTIONS.config} Configuration</text>

          {/* Row 1: Agent and Model */}
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <ConfigStat label="Agent" value={agentName} color={colors.accent.secondary} />
            {modelDisplay && (
              <ConfigStat label="Model" value={modelDisplay.display} color={colors.accent.primary} />
            )}
          </box>

          {/* Row 2: Tracker */}
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <ConfigStat label="Tracker" value={trackerName} color={colors.accent.tertiary} />
          </box>

          {/* Row 3: Git branch */}
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <ConfigStat
              label="Git"
              value={gitDisplay ?? 'not a repo'}
              color={gitInfo?.isDirty ? colors.status.warning : colors.accent.primary}
            />
          </box>

          {/* Row 4: Sandbox and Commit */}
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <text>
              <span fg={sandboxDisplay.enabled ? colors.status.success : colors.status.warning}>
                {sandboxDisplay.icon}
              </span>
              <span fg={sandboxDisplay.enabled ? colors.status.info : colors.fg.muted}>
                {' '}{sandboxDisplay.text}
              </span>
            </text>
            <text fg={colors.fg.muted}>·</text>
            <text>
              <span fg={colors.fg.secondary}>Commit: </span>
              <span fg={autoCommit ? colors.status.success : colors.fg.muted}>
                {autoCommit ? '✓ auto' : '✗ manual'}
              </span>
            </text>
          </box>

          {/* Row 5: Cleanup mode */}
          <box style={{ flexDirection: 'row', gap: 2 }}>
            <text>
              <span fg={cleanupDisplay.enabled ? colors.status.info : colors.fg.muted}>
                {cleanupDisplay.icon}
              </span>
              <span fg={cleanupDisplay.enabled ? colors.status.info : colors.fg.muted}>
                {' '}Cleanup: {cleanupDisplay.text}
              </span>
            </text>
          </box>
        </box>
      </box>
    </box>
  );
}

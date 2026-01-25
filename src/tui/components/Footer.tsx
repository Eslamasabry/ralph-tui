/**
 * ABOUTME: Footer component for the Ralph TUI.
 * Displays keyboard shortcuts, version info, and system status.
 * Redesigned with improved layout, visual hierarchy, and system information.
 */

import type { ReactNode } from 'react';
import { getColors, keyboardShortcuts, layout } from '../theme.js';
import type { FooterProps } from '../types.js';

/** Icons for system information display */
const ICONS = {
  version: '◆',
  sandbox: '🔒',
  remote: '🌐',
  autoCommit: '✓',
  manualCommit: '✗',
  separator: '│',
} as const;

/**
 * Format keyboard shortcuts for display with visual key styling.
 * Each shortcut is displayed as [key] description for clarity.
 */
function formatShortcut(key: string, description: string): ReactNode {
  const shortcutColors = getColors();
  return (
    <span>
      <span fg={shortcutColors.accent.primary}>[{key}]</span>
      <span fg={shortcutColors.fg.secondary}> {description}</span>
    </span>
  );
}

/**
 * Format system info section with icon and value.
 */
function formatSystemInfo(icon: string, value: string | null | undefined, color: string): ReactNode {
  if (!value) return null;
  const footerColors = getColors();
  return (
    <text>
      <span fg={footerColors.fg.dim}> {ICONS.separator} </span>
      <span fg={footerColors.fg.muted}>{icon}</span>
      <span fg={color}> {value}</span>
    </text>
  );
}

/**
 * Get connection status color for remote indicator.
 */
function getConnectionStatusColor(status: string | undefined): string {
  const statusColors = getColors();
  switch (status) {
    case 'connected':
      return statusColors.status.success;
    case 'connecting':
    case 'reconnecting':
      return statusColors.status.warning;
    case 'disconnected':
      return statusColors.status.error;
    default:
      return statusColors.fg.muted;
  }
}

/**
 * Footer component showing keyboard shortcuts and system information.
 * Provides a clear, organized display with:
 * - Top row: Primary keyboard shortcuts + system info
 * - Middle row: Secondary keyboard shortcuts
 * - Bottom row: Status bar divider
 */
export function Footer({
  version = '0.3.0',
  sandboxMode,
  remoteAlias,
  remoteConnectionStatus,
  autoCommitEnabled = true,
}: FooterProps): ReactNode {
  const footerColors = getColors();
  const connectionColor = getConnectionStatusColor(remoteConnectionStatus);

  // Group shortcuts by priority (most common first)
  const primaryShortcuts = keyboardShortcuts.filter((s) =>
    ['q', 's', 'p', 'd', '?', 'Tab', '↑↓'].includes(s.key)
  );
  const secondaryShortcuts = keyboardShortcuts.filter(
    (s) => !primaryShortcuts.includes(s)
  );

  return (
    <box
      style={{
        width: '100%',
        height: layout.footer.height,
        minHeight: layout.footer.height,
        flexShrink: 0,
        flexDirection: 'column',
        backgroundColor: footerColors.bg.secondary,
        border: true,
        borderColor: footerColors.border.normal,
      }}
    >
      {/* Top row: Primary keyboard shortcuts */}
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
        {/* Primary shortcuts section */}
        <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center', flexShrink: 1, overflow: 'hidden' }}>
          {primaryShortcuts.map((shortcut, index) => (
            <text key={shortcut.key} fg={footerColors.fg.muted}>
              {index > 0 ? ' ' : ''}
              {formatShortcut(shortcut.key, shortcut.description)}
            </text>
          ))}
        </box>

        {/* System information section */}
        <box style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
          {/* Version indicator */}
          <text fg={footerColors.fg.dim}>{ICONS.version}</text>
          <text fg={footerColors.fg.secondary}> {version}</text>

          {/* Sandbox mode */}
          {formatSystemInfo(ICONS.sandbox, sandboxMode, footerColors.status.info)}

          {/* Remote indicator */}
          {remoteAlias && (
            <text>
              <span fg={footerColors.fg.dim}> {ICONS.separator} </span>
              <span fg={footerColors.fg.muted}>{ICONS.remote}</span>
              <span fg={connectionColor}> {remoteAlias}</span>
            </text>
          )}

          {/* Auto-commit indicator */}
          <text>
            <span fg={footerColors.fg.dim}> {ICONS.separator} </span>
            <span fg={autoCommitEnabled ? footerColors.status.success : footerColors.status.error}>
              {autoCommitEnabled ? ICONS.autoCommit : ICONS.manualCommit}
            </span>
            <span fg={footerColors.fg.muted}> Auto</span>
          </text>
        </box>
      </box>

      {/* Middle row: Secondary keyboard shortcuts */}
      <box
        style={{
          width: '100%',
          height: 1,
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingLeft: 1,
          paddingRight: 1,
          flexShrink: 0,
        }}
      >
        <text fg={footerColors.fg.dim}>
          {ICONS.separator}{' '}
        </text>
        {secondaryShortcuts.map((shortcut, index) => (
          <text key={shortcut.key} fg={footerColors.fg.muted}>
            {index > 0 ? ' ' : ''}
            {formatShortcut(shortcut.key, shortcut.description)}
          </text>
        ))}
      </box>

      {/* Bottom row: Status bar divider */}
      <box
        style={{
          width: '100%',
          height: 1,
          flexDirection: 'row',
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingLeft: 1,
          paddingRight: 1,
          border: false,
        }}
      >
        <text fg={footerColors.border.muted}>
          {'─'.repeat(Math.min(80, 80))}
        </text>
      </box>
    </box>
  );
}

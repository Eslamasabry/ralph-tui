/**
 * ABOUTME: Footer component for the Ralph TUI.
// OURS:
 * Displays keyboard shortcuts, version info, and system status.
 * Redesigned with improved layout, visual hierarchy, and system information.
 */

import type { ReactNode } from 'react';
// OURS:
import { colors, keyboardShortcuts, layout, statusIndicators } from '../theme.js';
// THEIRS:
import { getColors, keyboardShortcuts, layout } from '../theme.js'; (ralph-tui-5no.1: US-001: Header Component Facelift)

/**
 * Version info from package.json
 */
const APP_VERSION = '0.3.0';

/**
 * Mode indicator icon (local/remote)
 */
const MODE_ICON = '●';

/**
 * Format a single keyboard shortcut with visual distinction between key and description
 */
function formatShortcut(key: string, description: string): ReactNode {
  return (
    <text>
      <span fg={colors.accent.secondary} bg={colors.bg.tertiary}>{key}</span>
      <span fg={colors.fg.muted}>{description}</span>
    </text>
  );
}

/**
 * Group keyboard shortcuts by category for better organization
 */
function getGroupedShortcuts() {
  const groups: Record<string, Array<{ key: string; description: string }>> = {
    'Actions': [],
    'Navigation': [],
    'Views': [],
    'Other': [],
  };

  // Define category mappings for each shortcut
  const categoryMap: Record<string, string> = {
    'q': 'Actions',
    's': 'Actions',
    'p': 'Actions',
    '+': 'Actions',
    '-': 'Actions',
    'r': 'Actions',
    'l': 'Actions',
    ',': 'Actions',
    '?': 'Actions',
    'd': 'Views',
    't': 'Views',
    'T': 'Views',
    'Tab': 'Views',
    '1-9': 'Navigation',
    '[]': 'Navigation',
    '↑↓': 'Navigation',
  };

  for (const shortcut of keyboardShortcuts) {
    const category = categoryMap[shortcut.key] || 'Other';
    groups[category].push(shortcut);
  }

  return groups;
}

/**
 * Render grouped shortcuts with separators between groups
 */
function renderGroupedShortcuts(): ReactNode {
  const groups = getGroupedShortcuts();
  const renderedGroups: ReactNode[] = [];
  let firstGroup = true;

  const groupOrder = ['Actions', 'Views', 'Navigation', 'Other'] as const;

  for (const groupName of groupOrder) {
    const shortcuts = groups[groupName];
    if (shortcuts.length === 0) continue;

    if (!firstGroup) {
      renderedGroups.push(<text fg={colors.border.muted}> | </text>);
    }

    renderedGroups.push(
      ...shortcuts.flatMap((shortcut, index) => [
        ...(index > 0 ? [<text fg={colors.fg.dim}> </text>] : []),
        formatShortcut(shortcut.key, shortcut.description),
      ])
    );

    firstGroup = false;
  }

  return <>{renderedGroups}</>;
}

/**
 * Footer component showing keyboard shortcuts, version info, and system status
 */
export function Footer(): ReactNode {
<<<<<<< HEAD
// THEIRS:
  const colors = getColors();
  // Format keyboard shortcuts as a single string
  const shortcutText = keyboardShortcuts
    .map(({ key, description }) => `${key}:${description}`)
    .join('  ');
=======
 * Displays keyboard shortcuts, system information, and mode indicators.
 * Redesigned with improved layout, visual hierarchy, and consistent styling.
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
    <text>
      <span fg={shortcutColors.accent.primary}>[{key}]</span>
      <span fg={shortcutColors.fg.secondary}> {description}</span>
    </text>
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
  ); (ralph-tui-5no.1: US-001: Header Component Facelift)

>>>>>>> 5976c14 (ralph-tui-5no.1: US-001: Header Component Facelift)
  return (
    <box
      style={{
        width: '100%',
        height: layout.footer.height,
<<<<<<< HEAD
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
=======
        flexDirection: 'column',
        backgroundColor: footerColors.bg.secondary,
>>>>>>> 6b14f9e (ralph-tui-5no.1: US-001: Header Component Facelift)
        border: true,
        borderColor: footerColors.border.normal,
      }}
    >
<<<<<<< HEAD
      {/* Left section: Keyboard shortcuts with improved layout */}
      <box style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, overflow: 'hidden' }}>
        <box style={{ flexDirection: 'row', alignItems: 'center' }}>
          <text fg={colors.fg.muted}>Keys: </text>
          {renderGroupedShortcuts()}
        </box>
      </box>

      {/* Right section: Version and mode info */}
      <box style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {/* Version indicator */}
        <text fg={colors.fg.muted}>
          <span fg={colors.accent.primary}>v</span>
          <span fg={colors.fg.secondary}>{APP_VERSION}</span>
        </text>

        {/* Mode indicator */}
        <text fg={colors.status.success}>
          {MODE_ICON} Local
        </text>

        {/* Status indicator */}
        <text fg={colors.fg.muted}>
          <span fg={colors.status.info}>{statusIndicators.ready}</span>
          <span fg={colors.fg.secondary}> Ready</span>
=======
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
              {index > 0 && ' '}
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
            {index > 0 && ' '}
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
>>>>>>> 6b14f9e (ralph-tui-5no.1: US-001: Header Component Facelift)
        </text>
      </box>
    </box>
  );
}

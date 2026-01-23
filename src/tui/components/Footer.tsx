/**
 * ABOUTME: Footer component for the Ralph TUI.
 * Displays keyboard shortcuts, version info, and system status.
 * Redesigned with improved layout, visual hierarchy, and system information.
 */

import type { ReactNode } from 'react';
import { colors, keyboardShortcuts, layout, statusIndicators } from '../theme.js';

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
  return (
    <box
      style={{
        width: '100%',
        height: layout.footer.height,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
        border: true,
        borderColor: colors.border.normal,
      }}
    >
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
        </text>
      </box>
    </box>
  );
}

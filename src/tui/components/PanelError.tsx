/**
 * ABOUTME: Error state component for panel-level failures inside a larger view.
 * Keeps failures localized and visible without crashing the entire screen.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * Props for PanelError.
 */
export interface PanelErrorProps {
  panelId: string;
  message?: string;
  compact?: boolean;
}

/**
 * Format user-facing panel error message.
 */
export function formatPanelErrorMessage(panelId: string, message?: string): string {
  if (message && message.trim().length > 0) {
    return message;
  }
  return `Panel "${panelId}" failed to render.`;
}

/**
 * Panel-scoped error renderer.
 */
export function PanelError({ panelId, message, compact = false }: PanelErrorProps): ReactNode {
  const resolvedMessage = formatPanelErrorMessage(panelId, message);

  return (
    <box
      style={{
        width: '100%',
        minHeight: 1,
        flexDirection: 'column',
        border: true,
        borderColor: colors.border.error,
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {compact ? null : <text fg={colors.status.error}>Panel Error</text>}
      <text fg={colors.fg.secondary}>{resolvedMessage}</text>
    </box>
  );
}

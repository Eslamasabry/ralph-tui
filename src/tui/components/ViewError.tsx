/**
 * ABOUTME: Error state component for missing or failed top-level view rendering.
 * Provides a consistent styled fallback when a view id cannot be resolved.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * Props for ViewError component.
 */
export interface ViewErrorProps {
  viewId: string;
  message?: string;
}

/**
 * Format user-facing view error message.
 */
export function formatViewErrorMessage(viewId: string, message?: string): string {
  if (message && message.trim().length > 0) {
    return message;
  }
  return `View "${viewId}" is unavailable.`;
}

/**
 * View-level fallback panel.
 */
export function ViewError({ viewId, message }: ViewErrorProps): ReactNode {
  const resolvedMessage = formatViewErrorMessage(viewId, message);

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        border: true,
        borderColor: colors.border.error,
        backgroundColor: colors.bg.secondary,
      }}
    >
      <text fg={colors.status.error}>View Error</text>
      <text fg={colors.fg.secondary}>{resolvedMessage}</text>
    </box>
  );
}

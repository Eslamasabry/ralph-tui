/**
 * ABOUTME: Full-screen crash fallback for unrecoverable TUI component errors.
 * Presents a concise, ANSI-safe error message and restart hint.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * Props for crash fallback screen.
 */
export interface CrashScreenProps {
  error?: unknown;
  context?: string;
  hint?: string;
}

/**
 * Normalize any thrown value into a concise crash message.
 */
export function formatCrashMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.length > 0 ? error.message : error.name;
  }

  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed.length > 0 ? trimmed : 'Unknown runtime error';
  }

  if (error && typeof error === 'object') {
    return 'Unexpected object error';
  }

  return 'Unknown runtime error';
}

/**
 * Crash screen component for the outer ErrorBoundary fallback.
 */
export function CrashScreen({
  error,
  context = 'runtime',
  hint = 'Press q to quit, then restart ralph-tui.',
}: CrashScreenProps): ReactNode {
  const message = formatCrashMessage(error);
  const contextLine = `Context: ${context}`;

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.bg.primary,
        paddingLeft: 2,
        paddingRight: 2,
      }}
    >
      <text fg={colors.status.error}>Ralph TUI encountered an unrecoverable error</text>
      <text fg={colors.fg.secondary}>{contextLine}</text>
      <text fg={colors.fg.primary}>{message}</text>
      <text fg={colors.fg.dim}>{hint}</text>
    </box>
  );
}

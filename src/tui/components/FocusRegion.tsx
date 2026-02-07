/**
 * ABOUTME: Focus-aware wrapper component for keyboard-navigable TUI regions.
 * Applies consistent border and title styling for focused/unfocused states.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * Props for FocusRegion.
 */
export interface FocusRegionProps {
  isFocused: boolean;
  title?: string;
  children?: ReactNode;
  border?: boolean;
  paddingX?: number;
  paddingY?: number;
}

/**
 * Focus styling wrapper for panel regions.
 */
export function FocusRegion({
  isFocused,
  title,
  children,
  border = true,
  paddingX = 0,
  paddingY = 0,
}: FocusRegionProps): ReactNode {
  const borderColor = isFocused ? colors.border.focused : colors.border.normal;
  const titleColor = isFocused ? colors.accent.primary : colors.fg.secondary;

  return (
    <box
      style={{
        width: '100%',
        minHeight: 1,
        flexDirection: 'column',
        border,
        borderColor,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingTop: paddingY,
        paddingBottom: paddingY,
      }}
    >
      {title ? <text fg={titleColor}>{title}</text> : null}
      {children}
    </box>
  );
}

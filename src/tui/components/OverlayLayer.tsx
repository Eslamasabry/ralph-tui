/**
 * ABOUTME: Overlay composition primitive for the V2 TUI shell.
 * Keeps shell content and optional overlay content in one place.
 */

import type { ReactNode } from 'react';

/**
 * Props for OverlayLayer.
 */
export interface OverlayLayerProps {
  /** Base shell content. */
  children: ReactNode;
  /** Optional overlay content rendered above the shell body. */
  overlay?: ReactNode;
}

/**
 * Overlay layer container for V2 shell content.
 */
export function OverlayLayer({ children, overlay }: OverlayLayerProps): ReactNode {
  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        flexDirection: 'column',
      }}
    >
      {children}
      {overlay ? (
        <box
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 999,
            flexShrink: 0,
          }}
        >
          {overlay}
        </box>
      ) : null}
    </box>
  );
}

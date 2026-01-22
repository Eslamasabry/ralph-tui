/**
 * ABOUTME: View tab bar component for Ralph TUI.
 * Displays view navigation tabs: Tasks | Iterations | Activity | Logs | Settings.
 */

import type { ReactNode } from 'react';
import { colors } from '../theme.js';

/**
 * Props for ViewTabBar component
 */
export interface ViewTabBarProps {
  /** Current active view mode */
  currentView: string;
  /** Available view tabs */
  views: Array<{ id: string; label: string }>;
}

/**
 * View tab bar component showing navigation tabs
 */
export function ViewTabBar({ currentView, views }: ViewTabBarProps): ReactNode {
  return (
    <box
      style={{
        width: '100%',
        height: 1,
        flexDirection: 'row',
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {views.map((view, index) => {
        const isActive = view.id === currentView;
        return (
          <text key={view.id}>
            <span fg={colors.fg.muted}>{index > 0 ? ' │ ' : ''}</span>
            {isActive ? (
              <text fg={colors.accent.primary} style={{ paddingLeft: 1, paddingRight: 1 }}>
                <strong>{view.label}</strong>
              </text>
            ) : (
              <text fg={colors.fg.secondary}>{view.label}</text>
            )}
          </text>
        );
      })}
    </box>
  );
}

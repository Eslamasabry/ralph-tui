/**
 * ABOUTME: Theme constants and types for the Ralph TUI application.
 * Provides consistent styling across all TUI components with a modern dark theme.
 */

/**
 * Color palette for the Ralph TUI
 */
export const colors = {
  // Background colors
  bg: {
    primary: '#1a1b26',
    secondary: '#24283b',
    tertiary: '#2f3449',
    highlight: '#3d4259',
  },

  // Foreground (text) colors
  fg: {
    primary: '#c0caf5',
    secondary: '#a9b1d6',
    muted: '#565f89',
    dim: '#414868',
  },

  // Status colors
  status: {
    success: '#9ece6a',
    warning: '#e0af68',
    error: '#f7768e',
    info: '#7aa2f7',
  },

  // Task status colors
  task: {
    done: '#9ece6a',
    active: '#7aa2f7',
    pending: '#565f89',
    blocked: '#f7768e',
  },

  // Accent colors
  accent: {
    primary: '#7aa2f7',
    secondary: '#bb9af7',
    tertiary: '#7dcfff',
  },

  // Border colors
  border: {
    normal: '#3d4259',
    active: '#7aa2f7',
    muted: '#2f3449',
  },
} as const;

/**
 * Status indicator symbols
 * Task status: ✓ (done), ▶ (active), ○ (pending), ⊘ (blocked)
 * Ralph status: ▶ (running), ◎ (pausing), ⏸ (paused), ■ (stopped)
 */
export const statusIndicators = {
  done: '✓',
  active: '▶',
  pending: '○',
  blocked: '⊘',
  running: '▶',
  pausing: '◎',
  paused: '⏸',
  stopped: '■',
} as const;

/**
 * Keyboard shortcut display mappings for footer (condensed)
 */
export const keyboardShortcuts = [
  { key: 'q', description: 'Quit' },
  { key: 'p', description: 'Pause/Resume' },
  { key: 'd', description: 'Dashboard' },
  { key: '↑↓', description: 'Navigate' },
  { key: '?', description: 'Help' },
] as const;

/**
 * Full keyboard shortcuts for help overlay
 */
export const fullKeyboardShortcuts = [
  { key: '?', description: 'Show/hide this help', category: 'General' },
  { key: 'q', description: 'Quit Ralph', category: 'General' },
  { key: 'Esc', description: 'Go back / Cancel', category: 'General' },
  { key: 'p', description: 'Pause / Resume execution', category: 'Execution' },
  { key: 'd', description: 'Toggle progress dashboard', category: 'Views' },
  { key: 'i', description: 'Toggle iterations / tasks view', category: 'Views' },
  { key: 't', description: 'Switch to tasks view', category: 'Views' },
  { key: '↑ / k', description: 'Move selection up', category: 'Navigation' },
  { key: '↓ / j', description: 'Move selection down', category: 'Navigation' },
  { key: 'Enter', description: 'View selected item details', category: 'Navigation' },
  { key: 'Ctrl+C', description: 'Interrupt (with confirmation)', category: 'System' },
  { key: 'Ctrl+C ×2', description: 'Force quit immediately', category: 'System' },
] as const;

/**
 * Layout dimensions
 */
export const layout = {
  header: {
    height: 3,
  },
  footer: {
    height: 3,
  },
  leftPanel: {
    minWidth: 30,
    maxWidth: 50,
    defaultWidthPercent: 35,
  },
  rightPanel: {
    minWidth: 40,
  },
  padding: {
    small: 1,
    medium: 2,
  },
} as const;

/**
 * Ralph status types
 * - 'running': Actively executing iterations
 * - 'pausing': Pause requested, waiting for current iteration to complete
 * - 'paused': Paused, waiting to resume
 * - 'stopped': Not running
 * - 'error': Stopped due to error
 */
export type RalphStatus = 'running' | 'pausing' | 'paused' | 'stopped' | 'error';

/**
 * Task status types matching the acceptance criteria
 */
export type TaskStatus = 'done' | 'active' | 'pending' | 'blocked';

/**
 * Get the color for a given task status
 */
export function getTaskStatusColor(status: TaskStatus): string {
  return colors.task[status];
}

/**
 * Get the indicator symbol for a given task status
 */
export function getTaskStatusIndicator(status: TaskStatus): string {
  return statusIndicators[status];
}

/**
 * Format elapsed time in human-readable format
 */
export function formatElapsedTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

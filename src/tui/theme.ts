/**
 * ABOUTME: Theme constants and types for the Ralph TUI application.
// OURS:
 * Provides consistent styling across all TUI components with modern dark and light themes.
 */

/**
 * Color schemes for light and dark themes
 */
export const colorSchemes = {
  dark: {
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
      actionable: '#9ece6a',
      pending: '#565f89',
      blocked: '#f7768e',
      error: '#f7768e',
      closed: '#414868',
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
  },
  light: {
    // Background colors - softer, lighter palette
    bg: {
      primary: '#fafafa',
      secondary: '#ffffff',
      tertiary: '#f0f0f0',
      highlight: '#e0e0e0',
    },
    // Foreground (text) colors - darker for contrast on light backgrounds
    fg: {
      primary: '#1a1a2e',
      secondary: '#4a4a68',
      muted: '#8888a0',
      dim: '#b0b0c0',
    },
    // Status colors - slightly muted for light theme
    status: {
      success: '#2d8a3e',
      warning: '#b8860b',
      error: '#c41e3a',
      info: '#2563eb',
    },
    // Task status colors
    task: {
      done: '#2d8a3e',
      active: '#2563eb',
      actionable: '#2d8a3e',
      pending: '#8888a0',
      blocked: '#c41e3a',
      error: '#c41e3a',
      closed: '#b0b0c0',
    },
    // Accent colors
    accent: {
      primary: '#2563eb',
      secondary: '#7c3aed',
      tertiary: '#0891b2',
    },
    // Border colors
    border: {
      normal: '#d0d0e0',
      active: '#2563eb',
      muted: '#e8e8f0',
    },
// THEIRS:
 * Provides consistent styling across all TUI components with a modern dark theme.
 * Supports both dark and light color schemes with enhanced semantic color categories.
 */

/**
 * Dark theme color palette - Tokyo Night inspired with modern enhancements
 * Optimized for high contrast and readability in terminal environments
 */
export const darkColors = {
  // Background colors - layered depth for visual hierarchy
  bg: {
    primary: '#1a1b26',
    secondary: '#24283b',
    tertiary: '#2f3449',
    highlight: '#3d4259',
    overlay: '#16161e',
  },

  // Foreground (text) colors - optimized contrast ratios
  fg: {
    primary: '#c0caf5',
    secondary: '#a9b1d6',
    muted: '#565f89',
    dim: '#414868',
    inverse: '#15161e',
  },

  // Status colors - universally recognizable semantic colors
  status: {
    success: '#9ece6a',
    warning: '#e0af68',
    error: '#f7768e',
    info: '#7aa2f7',
  },

  // Task status colors - specific to task lifecycle
  task: {
    done: '#9ece6a',
    active: '#7aa2f7',
    actionable: '#9ece6a',
    pending: '#565f89',
    blocked: '#f7768e',
    error: '#f7768e',
    closed: '#414868',
    queued: '#e0af68',
  },

  // Accent colors - for emphasis and branding
  accent: {
    primary: '#7aa2f7',
    secondary: '#bb9af7',
    tertiary: '#7dcfff',
    quaternary: '#f9e2af',
  },

  // Border colors - for separation and structure
  border: {
    normal: '#3d4259',
    active: '#7aa2f7',
    muted: '#2f3449',
    highlight: '#565f89', (ralph-tui-5no.7: US-007: Settings View Facelift)
  },

  // Interaction states - for user feedback
  interaction: {
    hover: '#3d4259',
    focus: '#7aa2f7',
    active: '#2f3449',
    selected: '#3d4259',
    disabled: '#414868',
  },

  // Link and reference colors
  link: {
    default: '#7aa2f7',
    hover: '#bb9af7',
    visited: '#9ece6a',
  },

  // Code and syntax colors - for code blocks and technical content
  code: {
    keyword: '#bb9af7',
    string: '#9ece6a',
    number: '#ff9e64',
    comment: '#565f89',
    function: '#7aa2f7',
    type: '#7dcfff',
    operator: '#c0caf5',
    variable: '#c0caf5',
    attribute: '#e0af68',
  },
};

/**
 * Light theme color palette - Clean and readable for bright environments
 */
export const lightColors = {
  // Background colors - clean, light palette
  bg: {
    primary: '#fafafa',
    secondary: '#ffffff',
    tertiary: '#f0f0f5',
    highlight: '#e0e0eb',
    overlay: '#f5f5fa',
  },

  // Foreground (text) colors - high contrast on light backgrounds
  fg: {
    primary: '#1a1b26',
    secondary: '#414868',
    muted: '#565f89',
    dim: '#787c99',
    inverse: '#ffffff',
  },

  // Status colors - same recognizability, adjusted for light backgrounds
  status: {
    success: '#2d7d46',
    warning: '#b45309',
    error: '#dc2626',
    info: '#1d4ed8',
  },

  // Task status colors
  task: {
    done: '#2d7d46',
    active: '#1d4ed8',
    actionable: '#2d7d46',
    pending: '#565f89',
    blocked: '#dc2626',
    error: '#dc2626',
    closed: '#787c99',
    queued: '#b45309',
  },

  // Accent colors - adjusted for light theme visibility
  accent: {
    primary: '#2563eb',
    secondary: '#7c3aed',
    tertiary: '#0891b2',
    quaternary: '#d97706',
  },

  // Border colors
  border: {
    normal: '#e0e0eb',
    active: '#2563eb',
    muted: '#f0f0f5',
    highlight: '#787c99',
  },

  // Interaction states
  interaction: {
    hover: '#e0e0eb',
    focus: '#2563eb',
    active: '#f0f0f5',
    selected: '#e0e0eb',
    disabled: '#d1d5db',
  },

  // Link colors
  link: {
    default: '#2563eb',
    hover: '#7c3aed',
    visited: '#2d7d46',
  },

  // Code and syntax colors
  code: {
    keyword: '#7c3aed',
    string: '#2d7d46',
    number: '#b45309',
    comment: '#787c99',
    function: '#2563eb',
    type: '#0891b2',
    operator: '#1a1b26',
    variable: '#1a1b26',
    attribute: '#b45309',
  },
};

/**
 * Theme mode type
 */
export type ThemeMode = 'dark' | 'light';

/**
 * Current theme mode - defaults to dark
 */
export let currentThemeMode: ThemeMode = 'dark';

/**
 * Set the current theme mode
 */
export function setThemeMode(mode: ThemeMode): void {
  currentThemeMode = mode;
}

/**
 * Get the active color palette based on current theme mode
 */
export function getColors() {
  return currentThemeMode === 'dark' ? darkColors : lightColors;
}

/**
 * Color palette for the Ralph TUI (defaults to dark theme for backwards compatibility)
 */
export const colors = darkColors;

/**
 * Current color scheme (defaults to dark)
 * Can be changed via setColorScheme('light') or setColorScheme('dark')
 */
let currentColorScheme: keyof typeof colorSchemes = 'dark';

/**
 * Set the current color scheme
 */
export function setColorScheme(scheme: 'light' | 'dark'): void {
  if (scheme in colorSchemes) {
    currentColorScheme = scheme;
  }
}

/**
 * Get the current color scheme name
 */
export function getColorScheme(): 'light' | 'dark' {
  return currentColorScheme;
}

/**
 * Get colors for the current color scheme
 */
export function getColors() {
  return colorSchemes[currentColorScheme];
}

/**
 * Active color scheme colors (convenience export for current theme)
 */
export const colors = colorSchemes.dark;

/**
 * Status indicator symbols
 * Task status: ✓ (done), ▶ (active/actionable), ○ (pending), ⊘ (blocked), ✓ (closed - greyed)
 * Ralph status: ▶ (running), ◎ (pausing), ⏸ (paused), ■ (stopped), ✓ (complete), ○ (idle/ready)
 */
export const statusIndicators = {
  done: '✓',
  active: '▶',
  actionable: '▶', // Ready to work on - green arrow
  pending: '○',
  blocked: '⊘',
  error: '✗', // Error/failed task
  closed: '✓', // Same indicator as done, but will be greyed out
  running: '▶',
  selecting: '◐', // Selecting next task - half-filled circle (animated feel)
  executing: '⏵', // Executing agent - play with bar
  pausing: '◎',
  paused: '⏸',
  stopped: '■',
  complete: '✓',
  idle: '○',
  ready: '◉', // Ready to start - waiting for user action
} as const;

/**
 * Keyboard shortcut display mappings for footer (condensed)
 */
export const keyboardShortcuts = [
  { key: 'q', description: 'Quit' },
  { key: 's', description: 'Start' },
  { key: 'p', description: 'Pause/Resume' },
  { key: '+', description: '+10 iters' },
  { key: '-', description: '-10 iters' },
  { key: 'r', description: 'Refresh' },
  { key: 'l', description: 'Load Epic' },
  { key: ',', description: 'Settings' },
  { key: 'd', description: 'Dashboard' },
  { key: 't', description: 'Trace Level' },
  { key: 'T', description: 'Trace Panel' },
  { key: 'Tab', description: 'Cycle Views' },
  { key: '1-9', description: 'Switch Instance Tab' },
  { key: '[]', description: 'Prev/Next Instance Tab' },
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
  { key: ',', description: 'Switch to Settings view', category: 'General' },
  { key: 's', description: 'Start execution (when ready)', category: 'Execution' },
  { key: 'p', description: 'Pause / Resume execution', category: 'Execution' },
  { key: '+', description: 'Add 10 iterations', category: 'Execution' },
  { key: '-', description: 'Remove 10 iterations', category: 'Execution' },
  { key: 'r', description: 'Refresh task list from tracker', category: 'Execution' },
  { key: 'l', description: 'Load / switch epic', category: 'Execution' },
  { key: 'd', description: 'Toggle progress dashboard', category: 'Views' },
  { key: 'h', description: 'Toggle show/hide closed tasks', category: 'Views' },
  { key: 't', description: 'Cycle subagent detail level', category: 'Views' },
  { key: 'T', description: 'Toggle subagent tree panel', category: 'Views' },
  { key: 'f', description: 'Focus output/subagent panel (tasks/iterations)', category: 'Views' },
  { key: 'Tab', description: 'Cycle view tabs (Tasks|Iterations|Activity|Logs|Settings)', category: 'Views' },
  { key: 'Shift+Tab', description: 'Previous view tab', category: 'Views' },
  { key: '1/2/3', description: 'Logs view: Output/CLI/Prompt', category: 'Views' },
  { key: '↑ / k', description: 'Move selection up', category: 'Navigation' },
  { key: '↓ / j', description: 'Move selection down', category: 'Navigation' },
  { key: 'Enter', description: 'View selected item details', category: 'Navigation' },
  { key: '1', description: 'Switch to instance tab by number', category: 'Instances' },
  { key: '[', description: 'Previous instance tab', category: 'Instances' },
  { key: ']', description: 'Next instance tab', category: 'Instances' },
  { key: 'Ctrl+Tab', description: 'Next instance tab (alternate)', category: 'Instances' },
  { key: 'Ctrl+Shift+Tab', description: 'Previous instance tab (alternate)', category: 'Instances' },
  { key: 'Ctrl+C', description: 'Interrupt (with confirmation)', category: 'System' },
  { key: 'Ctrl+C ×2', description: 'Force quit immediately', category: 'System' },
] as const;

/**
 * Layout dimensions
 */
export const layout = {
  tabBar: {
    // Tab bar for instance navigation
    height: 1,
  },
  header: {
    // Compact single-line header (no border)
    height: 1,
  },
  footer: {
    height: 3,
  },
  progressDashboard: {
    // Height when dashboard is shown: 2 (border) + 2 (padding) + 4 (content rows for grid layout)
    height: 8,
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
 * - 'ready': Waiting for user to start execution (interactive mode)
 * - 'running': Actively executing iterations (generic running state)
 * - 'selecting': Selecting next task to work on
 * - 'executing': Executing agent on current task
 * - 'pausing': Pause requested, waiting for current iteration to complete
 * - 'paused': Paused, waiting to resume
 * - 'stopped': Not running (generic)
 * - 'complete': All tasks finished successfully
 * - 'idle': Stopped, no more tasks available
 * - 'error': Stopped due to error
 */
export type RalphStatus = 'ready' | 'running' | 'selecting' | 'executing' | 'pausing' | 'paused' | 'stopped' | 'complete' | 'idle' | 'error';

/**
 * Task status types matching the acceptance criteria
 * - 'done': Task completed in current session (green checkmark)
 * - 'active': Task currently being worked on (blue arrow)
 * - 'actionable': Task ready to work on with no blocking dependencies (green arrow)
 * - 'pending': Task waiting to be worked on (grey circle) - legacy, prefer actionable
 * - 'blocked': Task blocked by dependencies (red symbol)
 * - 'error': Task execution failed (red X)
 * - 'closed': Previously completed task (greyed out checkmark for historical tasks)
 */
export type TaskStatus = 'done' | 'active' | 'actionable' | 'pending' | 'blocked' | 'error' | 'closed';

/**
 * Ralph status color mapping - returns the appropriate status color for each Ralph status
 */
export const ralphStatusColors: Record<RalphStatus, string> = {
  ready: getColors().status.info,
  running: getColors().status.success,
  selecting: getColors().status.info,
  executing: getColors().status.success,
  pausing: getColors().status.warning,
  paused: getColors().status.warning,
  stopped: getColors().fg.muted,
  complete: getColors().status.success,
  idle: getColors().fg.muted,
  error: getColors().status.error,
};

/**
 * Get the color for a given task status
 */
export function getTaskStatusColor(status: TaskStatus): string {
  return getColors().task[status];
}

/**
 * Get the indicator symbol for a given task status
 */
export function getTaskStatusIndicator(status: TaskStatus): string {
  return statusIndicators[status];
}

/**
 * Get the color for a given Ralph status
 */
export function getRalphStatusColor(status: RalphStatus): string {
  return ralphStatusColors[status];
}

/**
 * Get the indicator symbol for a given Ralph status
 */
export function getRalphStatusIndicator(status: RalphStatus): string {
  return statusIndicators[status];
}

/**
 * Generic status color lookup - works for both task and ralph statuses
 * Useful for components that need to display status colors generically
 */
export function getStatusColor(status: TaskStatus | RalphStatus, isRalphStatus?: boolean): string {
  if (isRalphStatus || (status in ralphStatusColors)) {
    return ralphStatusColors[status as RalphStatus];
  }
  return getColors().task[status as TaskStatus];
}

/**
 * Get interaction state colors
 */
export const interactionColors = {
  hover: getColors().interaction.hover,
  focus: getColors().interaction.focus,
  active: getColors().interaction.active,
  selected: getColors().interaction.selected,
  disabled: getColors().interaction.disabled,
};

/**
 * Get link colors for the current theme
 */
export const linkColors = {
  default: getColors().link.default,
  hover: getColors().link.hover,
  visited: getColors().link.visited,
};

/**
 * Get code syntax colors for the current theme
 */
export const codeColors = {
  keyword: getColors().code.keyword,
  string: getColors().code.string,
  number: getColors().code.number,
  comment: getColors().code.comment,
  function: getColors().code.function,
  type: getColors().code.type,
  operator: getColors().code.operator,
  variable: getColors().code.variable,
  attribute: getColors().code.attribute,
};

/**
 * Contrast utility: Get a text color that contrasts well with a background color
 * Returns inverse text color for dark backgrounds, standard for light
 */
export function getContrastTextColor(backgroundColor: string): string {
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128 ? getColors().fg.inverse : getColors().fg.primary;
}

/**
 * Get semantic color for common UI patterns
 */
export const semanticColors = {
  primaryAction: getColors().accent.primary,
  secondaryAction: getColors().accent.secondary,
  destructiveAction: getColors().status.error,
  success: getColors().status.success,
  warning: getColors().status.warning,
  error: getColors().status.error,
  info: getColors().status.info,
  activeTab: getColors().accent.primary,
  inactiveTab: getColors().fg.muted,
  selected: getColors().interaction.selected,
  highlighted: getColors().bg.highlight,
};

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

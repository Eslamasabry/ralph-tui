/**
 * ABOUTME: Theme constants and types for the Ralph TUI application.
 * Provides consistent styling across all TUI components with modern dark and light themes.
 */

/**
 * Theme mode type
 */
export type ThemeMode = 'dark' | 'light';

/**
 * Dark theme color palette - "Deep Cosmos"
 * High contrast, saturated accents against a deep slate background.
 */
export const darkColors = {
  // Background colors - moved to deeper, richer blacks/slates for better depth
  bg: {
    primary: '#0f1117',    // Deepest background
    secondary: '#181b25',  // Panel background
    tertiary: '#232736',   // Inactive tabs / borders
    highlight: '#2f3549',  // Hover states
    overlay: '#090a0f',    // Modals/Dropdowns
  },

  // Foreground (text) colors - significantly brighter for readability
  fg: {
    primary: '#e4e7eb',    // Bright white-ish grey
    secondary: '#9aa5ce',  // Soft blue-grey
    muted: '#636da6',      // Comments/Meta
    dim: '#464f72',        // Disabled text
    inverse: '#0f1117',    // Text on bright backgrounds
  },

  // Status colors - vibrant neon tones for immediate recognition
  status: {
    success: '#4ade80', // Neon Green
    warning: '#fbbf24', // Amber
    error: '#f87171',   // Soft Red
    info: '#38bdf8',    // Sky Blue
  },

  // Task status colors - optimized for scanning lists quickly
  task: {
    done: '#4ade80',       // Green
    active: '#60a5fa',     // Blue
    actionable: '#34d399', // Emerald (distinct from done)
    pending: '#636da6',    // Muted Blue
    queued: '#636da6',     // Alias of pending for legacy compatibility
    blocked: '#f472b6',    // Pink (distinct from error)
    error: '#ef4444',      // Red
    closed: '#475569',     // Slate (faded)
  },

  // Accent colors - pop colors for UI elements
  accent: {
    primary: '#818cf8',    // Indigo
    secondary: '#c084fc',  // Violet
    tertiary: '#22d3ee',   // Cyan
    quaternary: '#fcd34d', // Yellow
  },

  // Border colors - subtle but distinct structure
  border: {
    normal: '#232736',
    active: '#818cf8',     // Matches primary accent
    focused: '#818cf8',    // Explicit focused border alias (V2)
    muted: '#181b25',
    highlight: '#636da6',
    error: '#f87171',      // Error boundary borders
  },

  // Interaction states
  interaction: {
    hover: '#2f3549',
    focus: '#818cf8',
    active: '#232736',
    selected: '#2f3549',
    disabled: '#334155',
  },

  // Link and reference colors
  link: {
    default: '#60a5fa',
    hover: '#c084fc',
    visited: '#a78bfa',
  },

  // Code syntax highlighting
  code: {
    keyword: '#c084fc',   // Purple
    string: '#4ade80',    // Green
    number: '#fbbf24',    // Orange/Yellow
    comment: '#636da6',   // Muted Blue
    function: '#60a5fa',  // Blue
    type: '#22d3ee',      // Cyan
    operator: '#e4e7eb',  // White
    variable: '#e4e7eb',  // White
    attribute: '#f472b6', // Pink
  },
};

/**
 * Light theme color palette - "Crisp Day"
 * Sharp contrast to prevent the "washed out" look common in light TUI themes.
 */
export const lightColors = {
  // Background colors - warmer whites/greys
  bg: {
    primary: '#ffffff',
    secondary: '#f8fafc',  // Very subtle grey
    tertiary: '#f1f5f9',
    highlight: '#e2e8f0',
    overlay: '#ffffff',
  },

  // Foreground (text) colors - Dark slate/navy for sharpness
  fg: {
    primary: '#0f172a',    // Almost black navy
    secondary: '#334155',  // Slate
    muted: '#64748b',
    dim: '#94a3b8',
    inverse: '#ffffff',
  },

  // Status colors - darker shades for visibility on light bg
  status: {
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    info: '#0284c7',
  },

  // Task status colors
  task: {
    done: '#16a34a',
    active: '#2563eb',
    actionable: '#059669',
    pending: '#64748b',
    queued: '#64748b',     // Alias of pending for legacy compatibility
    blocked: '#db2777',
    error: '#dc2626',
    closed: '#94a3b8',
  },

  // Accent colors
  accent: {
    primary: '#4f46e5',    // Indigo
    secondary: '#9333ea',  // Purple
    tertiary: '#0891b2',   // Cyan
    quaternary: '#d97706', // Amber
  },

  // Border colors
  border: {
    normal: '#e2e8f0',
    active: '#4f46e5',
    focused: '#4f46e5',    // Explicit focused border alias (V2)
    muted: '#f1f5f9',
    highlight: '#94a3b8',
    error: '#dc2626',      // Error boundary borders
  },

  // Interaction states
  interaction: {
    hover: '#f1f5f9',
    focus: '#4f46e5',
    active: '#e2e8f0',
    selected: '#f1f5f9',
    disabled: '#cbd5e1',
  },

  // Link colors
  link: {
    default: '#2563eb',
    hover: '#7c3aed',
    visited: '#166534',
  },

  // Code and syntax colors
  code: {
    keyword: '#7c3aed',
    string: '#16a34a',
    number: '#ea580c',
    comment: '#94a3b8',
    function: '#2563eb',
    type: '#0891b2',
    operator: '#0f172a',
    variable: '#0f172a',
    attribute: '#c026d3',
  },
};

/**
 * Color schemes for light and dark themes
 */
export const colorSchemes = {
  dark: darkColors,
  light: lightColors,
};

/**
 * Current theme mode - defaults to dark
 */
export let currentThemeMode: ThemeMode = 'dark';

/**
 * Set the current theme mode
 */
export function setThemeMode(mode: ThemeMode): void {
  currentThemeMode = mode;
  colors = getColors();
  loadingColors = getLoadingColors();
  loadingTokens = getLoadingTokens();
}

/**
 * Get the active color palette based on current theme mode
 */
export function getColors() {
  return currentThemeMode === 'dark' ? darkColors : lightColors;
}

/**
 * Active color scheme colors (convenience export for current theme)
 */
export let colors = getColors();

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
} satisfies Record<TaskStatus | RalphStatus, string>;

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
  { key: 'Shift+P', description: 'Prune worktrees (local only)', category: 'Execution' },
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
  { key: 'x', description: 'Delete remote (remote tabs)', category: 'Instances' },
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
 * WCAG contrast notes for dark theme:
 * - fg.primary (#e4e7eb on #0f1117): passes AA comfortably
 * - fg.secondary (#9aa5ce on #0f1117): passes AA comfortably
 * - fg.muted (#636da6 on #0f1117): ~4.0:1 (fails 4.5:1 for normal text)
 * - fg.dim (#464f72 on #0f1117): ~2.5:1 (fails AA)
 *
 * Mitigation rule: fg.muted/fg.dim are never the sole channel for actionable
 * or safety-critical state. Use icon/label/position redundancy.
 */

/**
 * Loading-specific semantic colors used by V2 feedback components.
 * Recomputed from current theme so mode switches stay consistent.
 */
export function getLoadingColors() {
  const palette = getColors();
  return {
    spinner: palette.accent.primary,
    skeleton: palette.fg.dim,
    text: palette.fg.muted,
  } as const;
}

/**
 * Active loading colors for convenience imports.
 * Updated when theme mode changes via setThemeMode.
 */
export let loadingColors = getLoadingColors();

/**
 * Loading semantic token group.
 * Includes requested tokens: spinner.fg and loading.bg.
 */
export function getLoadingTokens() {
  const palette = getColors();
  return {
    spinner: {
      fg: palette.accent.primary,
    },
    loading: {
      bg: palette.bg.secondary,
    },
  } as const;
}

export let loadingTokens = getLoadingTokens();

/**
 * Shared timing constants for UI updates and interaction behavior.
 */
export const timing = {
  outputFlush: 50,
  batchInterval: 50,
  activityFlush: 200,
  subagentFlush: 150,
  toastDuration: 3000,
  spinnerFrame: 80,
  focusHintDuration: 1500,
  successFlashDuration: 2000,
  debounceToggle: 200,
  debounceAction: 300,
} as const;

/**
 * Consistent spacing scale in terminal cells.
 */
export const spacing = {
  xs: 0,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  none: 0,
  line: 1,
  group: 2,
} as const;

/**
 * Named typography styles for consistent text hierarchy in the TUI.
 */
export const typography = {
  heading: { color: 'fg.primary', bold: true },
  body: { color: 'fg.primary', bold: false },
  label: { color: 'fg.secondary', bold: false },
  caption: { color: 'fg.muted', bold: false },
  badge: { color: 'fg.inverse', bold: true },
  code: { color: 'code.variable', bold: false },
  keyHint: { color: 'accent.primary', bold: true },
  disabled: { color: 'fg.dim', bold: false },
  error: { color: 'status.error', bold: true },
  success: { color: 'status.success', bold: false },
  link: { color: 'link.default', bold: false, underline: true },
} as const;

/**
 * Ralph status types
 */
export type RalphStatus = 'ready' | 'running' | 'selecting' | 'executing' | 'pausing' | 'paused' | 'stopped' | 'complete' | 'idle' | 'error';

/**
 * Task status types
 */
export type TaskStatus = 'done' | 'active' | 'actionable' | 'pending' | 'blocked' | 'error' | 'closed';

/**
 * Ralph status color mapping - returns the appropriate status color for each Ralph status
 */
export const ralphStatusColors: Record<RalphStatus, keyof typeof darkColors.status> = {
  ready: 'info',
  running: 'success',
  selecting: 'info',
  executing: 'success',
  pausing: 'warning',
  paused: 'warning',
  stopped: 'info',
  complete: 'success',
  idle: 'info',
  error: 'error',
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
  const colorKey = ralphStatusColors[status];
  return getColors().status[colorKey];
}

/**
 * Get the indicator symbol for a given Ralph status
 */
export function getRalphStatusIndicator(status: RalphStatus): string {
  return statusIndicators[status];
}

/**
 * Generic status color lookup - works for both task and ralph statuses
 */
export function getStatusColor(status: TaskStatus | RalphStatus, isRalphStatus?: boolean): string {
  if (isRalphStatus || (status in ralphStatusColors)) {
    const colorKey = ralphStatusColors[status as RalphStatus];
    return getColors().status[colorKey];
  }
  return getColors().task[status as TaskStatus];
}

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

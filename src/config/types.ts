/**
 * ABOUTME: Type definitions for Ralph TUI configuration.
 * Defines the structure of configuration files and runtime options.
 */

import type { AgentPluginConfig } from '../plugins/agents/types.js';
import type { TrackerPluginConfig } from '../plugins/trackers/types.js';
import type { ErrorHandlingConfig, ErrorHandlingStrategy } from '../engine/types.js';

/**
 * Rate limit handling configuration for agents.
 * Controls how ralph-tui responds when an agent hits API rate limits.
 */
export interface RateLimitHandlingConfig {
  /** Whether rate limit handling is enabled (default: true) */
  enabled?: boolean;

  /** Maximum retries before switching to fallback agent (default: 3) */
  maxRetries?: number;

  /** Base backoff time in milliseconds for exponential retry (default: 5000) */
  baseBackoffMs?: number;

  /** Whether to attempt switching back to primary agent between iterations (default: true) */
  recoverPrimaryBetweenIterations?: boolean;
}

/**
 * Default rate limit handling configuration
 */
export const DEFAULT_RATE_LIMIT_HANDLING: Required<RateLimitHandlingConfig> = {
  enabled: true,
  maxRetries: 3,
  baseBackoffMs: 5000,
  recoverPrimaryBetweenIterations: true,
};

/**
 * Subagent tracing detail level controls how much subagent information is displayed.
 * - 'off': No tracing, use raw output (current default behavior)
 * - 'minimal': Show start/complete events only
 * - 'moderate': Show events + description + duration
 * - 'full': Show events + nested output + hierarchy panel
 */
export type SubagentDetailLevel = 'off' | 'minimal' | 'moderate' | 'full';

/**
 * Sound mode for notifications.
 * - 'off': No sound (default)
 * - 'system': Use OS default notification sound
 * - 'ralph': Play random Ralph Wiggum sound clips
 */
export type NotificationSoundMode = 'off' | 'system' | 'ralph';

/**
 * Notifications configuration for desktop notifications.
 */
export interface NotificationsConfig {
  /** Whether desktop notifications are enabled (default: true) */
  enabled?: boolean;
  /** Sound mode for notifications (default: 'off') */
  sound?: NotificationSoundMode;
}

/**
 * Cleanup mode - controls when automatic cleanup runs.
 * - 'off': Cleanup actions are disabled
 * - 'auto': Cleanup runs automatically when run completes
 * - 'manual': User must trigger cleanup from Run Summary overlay
 */
export type CleanupMode = 'off' | 'auto' | 'manual';

/**
 * Individual cleanup action configuration.
 */
export interface CleanupActionConfig {
  /** Whether this cleanup action is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Cleanup configuration for post-run cleanup actions.
 */
export interface CleanupConfig {
  /** Overall cleanup mode: off, auto (runs on completion), manual (user must trigger) */
  mode?: CleanupMode;
  /** Sync with main branch after run completes */
  syncMain?: CleanupActionConfig;
  /** Prune stale worktrees after run completes */
  pruneWorktrees?: CleanupActionConfig;
  /** Delete merged branches after run completes */
  deleteBranches?: CleanupActionConfig;
  /** Push changes to remote after run completes */
  push?: CleanupActionConfig;
  /** Clean up iteration logs (respects logs.keep setting) */
  cleanupLogs?: CleanupActionConfig;
}

/**
 * Default cleanup configuration.
 */
export const DEFAULT_CLEANUP_CONFIG: Required<CleanupConfig> = {
  mode: 'manual',
  syncMain: { enabled: true },
  pruneWorktrees: { enabled: true },
  deleteBranches: { enabled: true },
  push: { enabled: true },
  cleanupLogs: { enabled: true },
};

export type SandboxMode = 'auto' | 'bwrap' | 'sandbox-exec' | 'off';

export interface SandboxConfig {
  enabled?: boolean;
  mode?: SandboxMode;
  network?: boolean;
  allowPaths?: string[];
  readOnlyPaths?: string[];
}

export const DEFAULT_SANDBOX_CONFIG: Required<
  Pick<SandboxConfig, 'enabled' | 'mode' | 'network'>
> = {
  enabled: false,
  mode: 'auto',
  network: true,
};

/**
 * Backup configuration for worktree snapshots.
 */
export interface BackupConfig {
  /** Whether periodic snapshots are enabled (default: true) */
  enabled?: boolean;
  /** How often to create snapshots in minutes (default: 5) */
  intervalMinutes?: number;
  /** Maximum number of snapshots to keep (default: 10) */
  maxSnapshots?: number;
  /** Directory for backup files (default: .ralph-tui/backups) */
  dir?: string;
}

/**
 * Default backup configuration.
 */
export const DEFAULT_BACKUP_CONFIG: Required<BackupConfig> = {
  enabled: true,
  intervalMinutes: 5,
  maxSnapshots: 10,
  dir: '.ralph-tui/backups',
};

/**
 * Runtime options that can be passed via CLI flags
 */
export interface RuntimeOptions {
  /** Override agent plugin */
  agent?: string;

  /** Override model for the agent */
  model?: string;

  /** Override model variant for the agent (e.g., minimal, high, max for Gemini) */
  variant?: string;

  /** Override tracker plugin */
  tracker?: string;

  /** Epic ID for beads-based trackers */
  epicId?: string;

  /** PRD file path for json tracker */
  prdPath?: string;

  /** Maximum iterations to run */
  iterations?: number;

  /** Delay between iterations in milliseconds */
  iterationDelay?: number;

  /** Working directory for execution */
  cwd?: string;

  /** Whether to resume existing session */
  resume?: boolean;

  /** Force start even if lock exists */
  force?: boolean;

  /** Run in headless mode (no TUI) */
  headless?: boolean;

  /** Error handling strategy override */
  onError?: ErrorHandlingStrategy;

  /** Maximum retries for error handling */
  maxRetries?: number;

  /** Custom prompt file path (overrides config and defaults) */
  promptPath?: string;

  /** Output directory for iteration logs (overrides config) */
  outputDir?: string;

  /** Progress file path for cross-iteration context */
  progressFile?: string;

  /** Override notifications enabled state (--notify or --no-notify CLI flags) */
  notify?: boolean;

  sandbox?: SandboxConfig;
}

/**
 * Parallel scheduler mode
 */
export type SchedulerMode = 'strict' | 'balanced' | 'off';

/**
 * Parallel execution configuration
 */
export interface ParallelConfig {
  /** Scheduler mode for overlap avoidance */
  schedulerMode: SchedulerMode;
}

/**
 * Impact plan enforcement and drift policy
 */
export interface ImpactConfig {
  /** Require impact plan for execution */
  required: boolean;
  /** Block merge on high-risk drift */
  blockOnHighRiskDrift: boolean;
  /** Allowed unplanned files before warning/blocking */
  allowedUnplannedFiles: number;
  /** Allowed unplanned directories before warning/blocking */
  allowedUnplannedDirs: number;
}

/**
 * Merge train configuration
 */
export interface MergeConfig {
  /** Target branch for integration (e.g., "main" or "ralph/integration") */
  targetBranch: string;
  /** Continue merging other independent commits when a merge is blocked */
  continueOnBlockedIndependent: boolean;
}

/**
 * Resolver configuration for merge conflicts and semantic failures
 */
export interface ResolverConfig {
  /** Whether resolver is enabled */
  enabled: boolean;
  /** Maximum attempts per merge */
  maxAttempts: number;
  /** Delay between attempts (ms) */
  retryDelayMs: number;
  /** Escalation policy after max attempts */
  escalation: 'block' | 'abort';
}

/**
 * Validation checks configuration
 */
export type ChecksMode = 'none' | 'smoke' | 'standard' | 'strict';

export interface ChecksCommand {
  /** Display name for the check */
  name: string;
  /** Command to run */
  command: string;
}

export interface ChecksConfig {
  /** Profile mode */
  mode: ChecksMode;
  /** Commands to run */
  commands: ChecksCommand[];
}

export type QualityGateMode = 'per-merge' | 'coalesce' | 'batch-window';

export type QualityGateFallbackStrategy = 'revert' | 'quarantine' | 'pause';

export interface QualityGateCheckConfig {
  /** Command to run */
  command: string;
  /** Whether the check is required */
  required?: boolean;
  /** Optional timeout in milliseconds */
  timeoutMs?: number;
  /** Whether to retry on failure */
  retryOnFailure?: boolean;
  /** Max reruns for this check */
  maxReruns?: number;
}

export interface QualityGatesConfig {
  /** Enable quality gates */
  enabled: boolean;
  /** Require impact table before parallel execution */
  requireImpactTable: boolean;
  /** Validation mode */
  mode: QualityGateMode;
  /** Batch window for batch-window mode */
  batchWindowMs: number;
  /** Optional worktree path override for validator */
  validatorWorktreePath?: string;
  /** Optional integration branch override */
  integrationBranch?: string;
  /** Max attempts for fix loop */
  maxFixAttempts: number;
  /** Max reruns for flaky tests */
  maxTestReruns: number;
  /** Clean repo before running checks */
  cleanBeforeRun: boolean;
  /** Fallback strategy after failures */
  fallbackStrategy: QualityGateFallbackStrategy;
  /** Named checks */
  checks: Record<string, QualityGateCheckConfig>;
  /** Path-based rules to select checks */
  rules: Record<string, string[]>;
}

/**
 * Stored configuration (from YAML config file)
 */
export interface StoredConfig {
  /** Config version for migrations (e.g., "2.0") */
  configVersion?: string;

  /** Default agent to use */
  defaultAgent?: string;

  /** Default tracker to use */
  defaultTracker?: string;

  /** Default maximum iterations */
  maxIterations?: number;

  /** Default iteration delay in milliseconds */
  iterationDelay?: number;

  /** Configured agent plugins */
  agents?: AgentPluginConfig[];

  /** Configured tracker plugins */
  trackers?: TrackerPluginConfig[];

  /** Output directory for iteration logs */
  outputDir?: string;

  /** Progress file path for cross-iteration context */
  progressFile?: string;

  /** Error handling configuration */
  errorHandling?: Partial<ErrorHandlingConfig>;

  sandbox?: SandboxConfig;

  /** Parallel scheduler configuration */
  parallel?: Partial<ParallelConfig>;

  /** Impact plan enforcement configuration */
  impact?: Partial<ImpactConfig>;

  /** Merge train configuration */
  merge?: Partial<MergeConfig>;

  /** Resolver configuration */
  resolver?: Partial<ResolverConfig>;

  /** Validation checks configuration */
  checks?: Partial<ChecksConfig>;

  /** Quality gates configuration */
  qualityGates?: Partial<QualityGatesConfig>;

  /** Shorthand: agent plugin name */
  agent?: string;

  /** Legacy alias: agent command name */
  agentCommand?: string;

  /**
   * Custom command/executable path for the agent.
   *
   * Use this to route agent requests through wrapper tools like Claude Code Router (CCR)
   * or to specify a custom binary location.
   *
   * Precedence (highest to lowest):
   * 1. Agent-specific: [[agents]] command field
   * 2. Top-level: this field
   * 3. Plugin default: e.g., "claude" for Claude plugin
   *
   * @example "ccr code" - Route through Claude Code Router
   * @example "/opt/bin/my-claude" - Absolute path to custom binary
   */
  command?: string;

  /** Shorthand: tracker plugin name */
  tracker?: string;

  /** Shorthand: agent-specific options */
  agentOptions?: Record<string, unknown>;

  /** Shorthand: tracker-specific options */
  trackerOptions?: Record<string, unknown>;

  /**
   * Shorthand: fallback agents for the default agent.
   * Ordered list of agent names/plugins to try when the primary agent hits rate limits.
   */
  fallbackAgents?: string[];

  /** Shorthand: rate limit handling configuration for the default agent */
  rateLimitHandling?: RateLimitHandlingConfig;

  /** Whether to auto-commit after successful tasks */
  autoCommit?: boolean;

  /** Custom prompt template path (relative to cwd or absolute) */
  prompt_template?: string;

  skills_dir?: string;

  /** Subagent tracing detail level for controlling display verbosity */
  subagentTracingDetail?: SubagentDetailLevel;

  /** Notifications configuration */
  notifications?: NotificationsConfig;

  /** Cleanup configuration for post-run cleanup actions */
  cleanup?: CleanupConfig;

  /** Timeout in minutes after which a lock is considered stale (default: 30) */
  staleLockTimeoutMinutes?: number;

  /** Backup configuration for worktree snapshots */
  backup?: BackupConfig;
}

/**
 * Merged runtime configuration (stored config + CLI options)
 */
export interface RalphConfig {
  /** Active agent configuration */
  agent: AgentPluginConfig;

  /** Active tracker configuration */
  tracker: TrackerPluginConfig;

  /** Maximum iterations (0 = unlimited) */
  maxIterations: number;

  /** Delay between iterations in milliseconds */
  iterationDelay: number;

  /** Working directory */
  cwd: string;

  /** Output directory for iteration logs */
  outputDir: string;

  /** Progress file path for cross-iteration context */
  progressFile: string;

  /** Epic ID (for beads trackers) */
  epicId?: string;

  /** PRD path (for json tracker) */
  prdPath?: string;

  /** Model override for agent */
  model?: string;

  /** Whether to show TUI */
  showTui: boolean;

  /** Error handling configuration */
  errorHandling: ErrorHandlingConfig;

  sandbox?: SandboxConfig;

  /** Parallel scheduler configuration */
  parallel: ParallelConfig;

  /** Impact plan enforcement configuration */
  impact: ImpactConfig;

  /** Merge train configuration */
  merge: MergeConfig;

  /** Resolver configuration */
  resolver: ResolverConfig;

  /** Validation checks configuration */
  checks: ChecksConfig;

  /** Quality gates configuration */
  qualityGates: QualityGatesConfig;

  /** Cleanup configuration for post-run cleanup actions */
  cleanup?: CleanupConfig;

  /** Timeout in minutes after which a lock is considered stale (default: 30) */
  staleLockTimeoutMinutes?: number;

  /** Backup configuration for worktree snapshots */
  backup?: BackupConfig;

  /** Custom prompt template path (resolved) */
  promptTemplate?: string;
}

/**
 * Validation result for configuration
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;

  /** Error messages if invalid */
  errors: string[];

  /** Warning messages (non-fatal) */
  warnings: string[];
}

/**
 * Default error handling configuration
 */
export const DEFAULT_ERROR_HANDLING: ErrorHandlingConfig = {
  strategy: 'skip',
  maxRetries: 3,
  retryDelayMs: 5000,
  continueOnNonZeroExit: false,
};

export const DEFAULT_PARALLEL_CONFIG: ParallelConfig = {
  schedulerMode: 'balanced',
};

export const DEFAULT_IMPACT_CONFIG: ImpactConfig = {
  required: true,
  blockOnHighRiskDrift: true,
  allowedUnplannedFiles: 2,
  allowedUnplannedDirs: 0,
};

export const DEFAULT_MERGE_CONFIG: MergeConfig = {
  targetBranch: 'ralph/integration',
  continueOnBlockedIndependent: true,
};

export const DEFAULT_RESOLVER_CONFIG: ResolverConfig = {
  enabled: true,
  maxAttempts: 3,
  retryDelayMs: 2000,
  escalation: 'block',
};

export const DEFAULT_CHECKS_CONFIG: ChecksConfig = {
  mode: 'standard',
  commands: [],
};

export const DEFAULT_QUALITY_GATES_CONFIG: QualityGatesConfig = {
  enabled: true,
  requireImpactTable: true,
  mode: 'per-merge',
  batchWindowMs: 5000,
  maxFixAttempts: 2,
  maxTestReruns: 2,
  cleanBeforeRun: true,
  fallbackStrategy: 'revert',
  checks: {},
  rules: {},
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Omit<RalphConfig, 'agent' | 'tracker'> = {
  maxIterations: 10,
  iterationDelay: 1000,
  cwd: process.cwd(),
  outputDir: '.ralph-tui/iterations',
  progressFile: '.ralph-tui/progress.md',
  showTui: true,
  errorHandling: DEFAULT_ERROR_HANDLING,
  sandbox: DEFAULT_SANDBOX_CONFIG,
  parallel: DEFAULT_PARALLEL_CONFIG,
  impact: DEFAULT_IMPACT_CONFIG,
  merge: DEFAULT_MERGE_CONFIG,
  resolver: DEFAULT_RESOLVER_CONFIG,
  checks: DEFAULT_CHECKS_CONFIG,
  qualityGates: DEFAULT_QUALITY_GATES_CONFIG,
};

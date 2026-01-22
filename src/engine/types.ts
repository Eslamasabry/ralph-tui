/**
 * ABOUTME: Type definitions for the Ralph execution engine.
 * Defines events, iteration results, engine state types, and error handling strategies.
 */

import type { TrackerTask, TrackerPlugin } from '../plugins/trackers/types.js';
import type { AgentExecutionResult } from '../plugins/agents/types.js';
import type { SubagentState as ParserSubagentState } from '../plugins/agents/tracing/types.js';

/**
 * Reason why an agent is currently active.
 * - 'primary': The configured primary agent
 * - 'fallback': A fallback agent due to rate limiting of primary
 */
export type ActiveAgentReason = 'primary' | 'fallback';

/**
 * Tracks which agent is currently active and why.
 * Used by TUI to display accurate agent status.
 */
export interface ActiveAgentState {
  /** Plugin identifier of the active agent (e.g., 'claude', 'opencode') */
  plugin: string;

  /** Why this agent is active */
  reason: ActiveAgentReason;

  /** When this agent became active (ISO 8601) */
  since: string;
}

/**
 * Tracks rate limit state for agents.
 * Persists across iterations until primary agent is recovered.
 */
export interface RateLimitState {
  /** Plugin identifier of the primary agent */
  primaryAgent: string;

  /** When the primary agent was rate limited (ISO 8601), undefined if not limited */
  limitedAt?: string;

  /** Plugin identifier of the fallback agent in use, undefined if not using fallback */
  fallbackAgent?: string;
}

/**
 * Status of a tracked subagent in the engine.
 */
export type EngineSubagentStatus = 'running' | 'completed' | 'error';

/**
 * State of a subagent tracked by the engine during an iteration.
 * This interface matches the acceptance criteria for US-004.
 */
export interface EngineSubagentState {
  /** Unique identifier for this subagent */
  id: string;

  /** Type of agent (e.g., 'Explore', 'Bash', 'Plan') */
  type: string;

  /** Human-readable description of what the subagent is doing */
  description: string;

  /** Current status of the subagent */
  status: EngineSubagentStatus;

  /** Timestamp when the subagent started (ISO 8601) */
  startedAt: string;

  /** Timestamp when the subagent completed or errored (ISO 8601) */
  completedAt?: string;

  /** ID of the parent subagent if this is a nested call */
  parentId?: string;

  /** IDs of child subagents spawned by this subagent */
  children: string[];

  /** Duration in milliseconds (computed when ended) */
  durationMs?: number;

  /** Nesting depth (1 = top-level, 2 = child of top-level, etc.) */
  depth: number;
}

/**
 * Tree node representation of a subagent for TUI rendering.
 */
export interface SubagentTreeNode {
  /** The subagent state */
  state: EngineSubagentState;

  /** Child nodes in the tree */
  children: SubagentTreeNode[];
}

/**
 * Convert parser SubagentState to engine EngineSubagentState.
 */
export function toEngineSubagentState(
  parserState: ParserSubagentState,
  depth: number
): EngineSubagentState {
  return {
    id: parserState.id,
    type: parserState.agentType,
    description: parserState.description,
    status: parserState.status,
    startedAt: parserState.spawnedAt,
    completedAt: parserState.endedAt,
    parentId: parserState.parentId,
    children: [...parserState.childIds],
    durationMs: parserState.durationMs,
    depth,
  };
}

/**
 * Strategy for handling agent execution errors.
 * - 'retry': Retry the same task up to maxRetries times
 * - 'skip': Skip the failed task and move to the next one
 * - 'abort': Stop the engine immediately on error
 */
export type ErrorHandlingStrategy = 'retry' | 'skip' | 'abort';

/**
 * Configuration for error handling behavior.
 */
export interface ErrorHandlingConfig {
  /** Strategy to use when an agent execution fails */
  strategy: ErrorHandlingStrategy;

  /** Maximum number of retries (only used when strategy is 'retry') */
  maxRetries: number;

  /** Delay in milliseconds between retries */
  retryDelayMs: number;

  /** Whether to continue on non-zero exit codes */
  continueOnNonZeroExit: boolean;
}

/**
 * Status of an iteration
 */
export type IterationStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'interrupted'
  | 'skipped';

/**
 * Result of a single iteration
 */
export interface IterationResult {
  /** Iteration number (1-based) */
  iteration: number;

  /** Status of the iteration */
  status: IterationStatus;

  /** Task that was worked on */
  task: TrackerTask;

  /** Agent execution result */
  agentResult?: AgentExecutionResult;

  /** Whether the task was completed */
  taskCompleted: boolean;

  /** Whether <promise>COMPLETE</promise> was detected */
  promiseComplete: boolean;

  /** Duration of the iteration in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;

  /** Timestamp when iteration started (ISO 8601) */
  startedAt: string;

  /** Timestamp when iteration ended (ISO 8601) */
  endedAt: string;
}

/**
 * Engine event types
 */
export type EngineEventType =
  | 'engine:started'
  | 'engine:stopped'
  | 'engine:paused'
  | 'engine:resumed'
  | 'engine:warning'
  | 'engine:iterations-added'
  | 'engine:iterations-removed'
  | 'iteration:started'
  | 'iteration:completed'
  | 'iteration:failed'
  | 'iteration:retrying'
  | 'iteration:skipped'
  | 'iteration:rate-limited'
  | 'iteration:commit-recovery'
  | 'task:selected'
  | 'task:activated'
  | 'task:completed'
  | 'task:blocked'
  | 'agent:output'
  | 'agent:switched'
  | 'agent:all-limited'
  | 'agent:recovery-attempted'
  | 'all:complete'
  | 'tasks:refreshed'
  | 'tracker:realtime'
  /** Main sync events - emitted when syncing completed work to main branch */
  | 'main-sync-skipped'
  | 'main-sync-succeeded'
  | 'main-sync-failed'
  | 'main-sync-retrying'
  | 'main-sync-alert';

/**
 * Tracker realtime status
 */
export type TrackerRealtimeStatus = 'live' | 'stale';

/**
 * Base engine event
 */
export interface EngineEventBase {
  /** Event type */
  type: EngineEventType;

  /** Timestamp of the event (ISO 8601) */
  timestamp: string;
}

/**
 * Engine started event
 */
export interface EngineStartedEvent extends EngineEventBase {
  type: 'engine:started';
  /** Session ID */
  sessionId: string;
  /** Total tasks available (open and in_progress only, not closed) */
  totalTasks: number;
  /** All tasks to be displayed (open, in_progress, and completed for historical view) */
  tasks: TrackerTask[];
}

/**
 * Engine stopped event
 */
export interface EngineStoppedEvent extends EngineEventBase {
  type: 'engine:stopped';
  /** Reason for stopping */
  reason: 'completed' | 'max_iterations' | 'interrupted' | 'error' | 'no_tasks';
  /** Total iterations run */
  totalIterations: number;
  /** Total tasks completed */
  tasksCompleted: number;
}

/**
 * Engine paused event
 */
export interface EnginePausedEvent extends EngineEventBase {
  type: 'engine:paused';
  /** Current iteration when paused */
  currentIteration: number;
}

/**
 * Engine resumed event
 */
export interface EngineResumedEvent extends EngineEventBase {
  type: 'engine:resumed';
  /** Iteration resuming from */
  fromIteration: number;
}

/**
 * Engine warning event - emitted for configuration warnings that don't block execution
 */
export interface EngineWarningEvent extends EngineEventBase {
  type: 'engine:warning';
  /** Warning code for programmatic handling */
  code: 'sandbox-network-conflict';
  /** Human-readable warning message */
  message: string;
}

/**
 * Iterations added event - emitted when maxIterations is increased at runtime
 */
export interface IterationsAddedEvent extends EngineEventBase {
  type: 'engine:iterations-added';
  /** Number of iterations added */
  added: number;
  /** New maxIterations value */
  newMax: number;
  /** Previous maxIterations value */
  previousMax: number;
  /** Current iteration at time of addition */
  currentIteration: number;
}

/**
 * Iterations removed event - emitted when maxIterations is decreased at runtime
 */
export interface IterationsRemovedEvent extends EngineEventBase {
  type: 'engine:iterations-removed';
  /** Number of iterations removed */
  removed: number;
  /** New maxIterations value */
  newMax: number;
  /** Previous maxIterations value */
  previousMax: number;
  /** Current iteration at time of removal */
  currentIteration: number;
}

/**
 * Iteration started event
 */
export interface IterationStartedEvent extends EngineEventBase {
  type: 'iteration:started';
  /** Iteration number */
  iteration: number;
  /** Task being worked on */
  task: TrackerTask;
}

/**
 * Iteration completed event
 */
export interface IterationCompletedEvent extends EngineEventBase {
  type: 'iteration:completed';
  /** Iteration result */
  result: IterationResult;
}

/**
 * Iteration failed event
 */
export interface IterationFailedEvent extends EngineEventBase {
  type: 'iteration:failed';
  /** Iteration number */
  iteration: number;
  /** Error message */
  error: string;
  /** Task that failed */
  task: TrackerTask;
  /** Action that will be taken */
  action: 'retry' | 'skip' | 'abort';
}

/**
 * Iteration retrying event
 */
export interface IterationRetryingEvent extends EngineEventBase {
  type: 'iteration:retrying';
  /** Iteration number */
  iteration: number;
  /** Retry attempt number (1-based) */
  retryAttempt: number;
  /** Maximum retries allowed */
  maxRetries: number;
  /** Task being retried */
  task: TrackerTask;
  /** Error from previous attempt */
  previousError: string;
  /** Delay before retry in milliseconds */
  delayMs: number;
}

/**
 * Iteration skipped event
 */
export interface IterationSkippedEvent extends EngineEventBase {
  type: 'iteration:skipped';
  /** Iteration number */
  iteration: number;
  /** Task that was skipped */
  task: TrackerTask;
  /** Reason for skipping */
  reason: string;
}

/**
 * Iteration rate-limited event - emitted when agent hits API rate limit
 * and engine is waiting before retry.
 */
export interface IterationRateLimitedEvent extends EngineEventBase {
  type: 'iteration:rate-limited';
  /** Iteration number */
  iteration: number;
  /** Task that hit rate limit */
  task: TrackerTask;
  /** Retry attempt number (1-based) */
  retryAttempt: number;
  /** Maximum retries allowed before fallback */
  maxRetries: number;
  /** Delay in milliseconds before retry */
  delayMs: number;
  /** Rate limit message from agent output */
  rateLimitMessage?: string;
  /** Whether delayMs came from retryAfter in response (vs calculated backoff) */
  usedRetryAfter: boolean;
}

/**
 * Iteration commit recovery event - emitted when agent signals completion but
 * repo is dirty (has uncommitted changes) or no commits were made.
 * The engine will rerun the agent with recovery context.
 */
export interface IterationCommitRecoveryEvent extends EngineEventBase {
  type: 'iteration:commit-recovery';
  /** Iteration number */
  iteration: number;
  /** Task being recovered */
  task: TrackerTask;
  /** Recovery attempt number (1-based) */
  retryAttempt: number;
  /** Maximum recovery retries allowed */
  maxRetries: number;
  /** Reason for recovery (dirty repo, no commits, etc.) */
  reason: string;
  /** Changed files detected (if any) */
  changedFiles: string[];
  /** Stdout tail included in recovery prompt */
  stdoutTail: string;
}

/**
 * Task blocked event (e.g., merge conflict, recovery failed)
 */
export interface TaskBlockedEvent extends EngineEventBase {
  type: 'task:blocked';
  /** Blocked task */
  task: TrackerTask;
  /** Reason for blocking */
  reason: string;
  /** If blocked due to recovery failure, the recovery attempt count */
  recoveryAttemptCount?: number;
}

/**
 * Task selected event
 */
export interface TaskSelectedEvent extends EngineEventBase {
  type: 'task:selected';
  /** Selected task */
  task: TrackerTask;
  /** Iteration number */
  iteration: number;
}

/**
 * Task activated event - emitted when a task status is set to in_progress.
 * Used for crash recovery: tracks which tasks this session "owns" so they
 * can be reset back to open on graceful shutdown or detected as stale on startup.
 */
export interface TaskActivatedEvent extends EngineEventBase {
  type: 'task:activated';
  /** Activated task */
  task: TrackerTask;
  /** Iteration number */
  iteration: number;
}

/**
 * Task completed event
 */
export interface TaskCompletedEvent extends EngineEventBase {
  type: 'task:completed';
  /** Completed task */
  task: TrackerTask;
  /** Iteration that completed it */
  iteration: number;
}


/**
 * Agent output event (streaming)
 */
export interface AgentOutputEvent extends EngineEventBase {
  type: 'agent:output';
  /** Output type */
  stream: 'stdout' | 'stderr';
  /** Output data */
  data: string;
  /** Iteration number */
  iteration: number;
  /** Task ID for parallel execution (optional) */
  taskId?: string;
}

/**
 * Agent switched event - emitted when the engine switches between primary and fallback agents.
 */
export interface AgentSwitchedEvent extends EngineEventBase {
  type: 'agent:switched';
  /** Previous agent plugin identifier */
  previousAgent: string;
  /** New agent plugin identifier */
  newAgent: string;
  /** Reason for the switch */
  reason: ActiveAgentReason;
  /** Rate limit state at time of switch (if switching due to rate limit) */
  rateLimitState?: RateLimitState;
}

/**
 * All agents limited event - emitted when all agents (primary and fallbacks) are rate limited.
 * Engine will pause execution when this occurs.
 */
export interface AllAgentsLimitedEvent extends EngineEventBase {
  type: 'agent:all-limited';
  /** Task that caused the rate limit exhaustion */
  task: TrackerTask;
  /** List of agents that were tried (primary + fallbacks) */
  triedAgents: string[];
  /** Rate limit state at time of event */
  rateLimitState: RateLimitState;
}

/**
 * Agent recovery attempted event - emitted when attempting to recover primary agent between iterations.
 * Indicates whether the recovery test succeeded or if primary is still rate limited.
 */
export interface AgentRecoveryAttemptedEvent extends EngineEventBase {
  type: 'agent:recovery-attempted';
  /** Primary agent that was tested */
  primaryAgent: string;
  /** Fallback agent that was being used */
  fallbackAgent: string;
  /** Whether the recovery was successful (primary is no longer rate limited) */
  success: boolean;
  /** Duration of the test in milliseconds */
  testDurationMs: number;
  /** If recovery failed, the rate limit message detected */
  rateLimitMessage?: string;
}

/**
 * All tasks complete event
 */
export interface AllCompleteEvent extends EngineEventBase {
  type: 'all:complete';
  /** Total tasks completed */
  totalCompleted: number;
  /** Total iterations run */
  totalIterations: number;
}

/**
 * Tasks refreshed event - emitted when task list is manually refreshed
 */
export interface TasksRefreshedEvent extends EngineEventBase {
  type: 'tasks:refreshed';
  /** Refreshed task list */
  tasks: TrackerTask[];
}

/**
 * Tracker realtime status event
 */
export interface TrackerRealtimeEvent extends EngineEventBase {
  type: 'tracker:realtime';
  /** Current realtime status */
  status: TrackerRealtimeStatus;
  /** Polling interval used for this mode */
  intervalMs: number;
  /** Optional reason for fallback */
  reason?: string;
}

/**
 * Main sync skipped event - emitted when main sync was skipped (dirty repo, wrong branch, etc.)
 */
export interface MainSyncSkippedEvent extends EngineEventBase {
  type: 'main-sync-skipped';
  /** Reason for skipping the sync */
  reason: string;
}

/**
 * Main sync succeeded event - emitted when main sync completed successfully
 */
export interface MainSyncSucceededEvent extends EngineEventBase {
  type: 'main-sync-succeeded';
  /** The commit hash after sync */
  commit: string;
}

/**
 * Main sync failed event - emitted when main sync failed
 */
export interface MainSyncFailedEvent extends EngineEventBase {
  type: 'main-sync-failed';
  /** Task that was blocked due to sync failure (optional, may be null between iterations) */
  task?: TrackerTask;
  /** Reason for the sync failure */
  reason: string;
}

/**
 * Main sync retrying event - emitted when retrying main sync with backoff
 */
export interface MainSyncRetryingEvent extends EngineEventBase {
  type: 'main-sync-retrying';
  /** Current retry attempt number (1-based) */
  retryAttempt: number;
  /** Maximum retries allowed */
  maxRetries: number;
  /** Reason for the sync failure being retried */
  reason: string;
  /** Delay before next retry in milliseconds */
  delayMs: number;
}

/**
 * Main sync alert event - emitted when max retries is reached
 */
export interface MainSyncAlertEvent extends EngineEventBase {
  type: 'main-sync-alert';
  /** Final retry attempt number */
  retryAttempt: number;
  /** Maximum retries that was configured */
  maxRetries: number;
  /** Reason for the sync failure */
  reason: string;
  /** Number of tasks affected */
  affectedTaskCount: number;
}

/**
 * Union of all engine events
 */
export type EngineEvent =
  | EngineStartedEvent
  | EngineStoppedEvent
  | EnginePausedEvent
  | EngineResumedEvent
  | EngineWarningEvent
  | IterationsAddedEvent
  | IterationsRemovedEvent
  | IterationStartedEvent
  | IterationCompletedEvent
  | IterationFailedEvent
  | IterationRetryingEvent
  | IterationSkippedEvent
  | IterationRateLimitedEvent
  | IterationCommitRecoveryEvent
  | TaskSelectedEvent
  | TaskActivatedEvent
  | TaskCompletedEvent
  | TaskBlockedEvent
  | AgentOutputEvent
  | AgentSwitchedEvent
  | AllAgentsLimitedEvent
  | AgentRecoveryAttemptedEvent
  | AllCompleteEvent
  | TasksRefreshedEvent
  | TrackerRealtimeEvent
  | MainSyncSkippedEvent
  | MainSyncSucceededEvent
  | MainSyncFailedEvent
  | MainSyncRetryingEvent
  | MainSyncAlertEvent;

/**
 * Event listener function type
 */
export type EngineEventListener = (event: EngineEvent) => void;

/**
 * Shared engine controller interface for sequential and parallel engines.
 */
export interface EngineController {
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): void | Promise<void>;
  pause(): void;
  resume(): void;
  refreshTasks(): Promise<void>;
  getState(): Readonly<EngineState>;
  getTracker(): TrackerPlugin | null;
  resetTasksToOpen(taskIds: string[]): Promise<number>;
  dispose(): Promise<void>;
  on(listener: EngineEventListener): () => void;
  onParallel?: (listener: (event: unknown) => void) => () => void;
  getIterationInfo?: () => { currentIteration: number; maxIterations: number };
  addIterations?: (count: number) => void;
  removeIterations?: (count: number) => void;
  continueExecution?: () => Promise<void>;
  getSubagentTree?: () => unknown;
  getSubagentOutput?: (subagentId: string) => string | undefined;
  getSubagentDetails?: (subagentId: string) => unknown;
  generatePromptPreview?: (
    taskId: string
  ) => Promise<{ success: true; prompt: string; source: string } | { success: false; error: string }>;
}

/**
 * Engine status
 * - 'idle': Not running
 * - 'running': Executing iterations
 * - 'pausing': Pause requested, waiting for current iteration to complete
 * - 'paused': Paused, waiting to resume
 * - 'stopping': Stop requested, shutting down
 */
export type EngineStatus = 'idle' | 'running' | 'pausing' | 'paused' | 'stopping';

/**
 * Engine state snapshot
 */
export interface EngineState {
  /** Current status */
  status: EngineStatus;

  /** Current iteration number */
  currentIteration: number;

  /** Current task being worked on */
  currentTask: TrackerTask | null;

  /** Total tasks */
  totalTasks: number;

  /** Tasks completed */
  tasksCompleted: number;

  /** Iteration history */
  iterations: IterationResult[];

  /** Start time (ISO 8601) */
  startedAt: string | null;

  /** Current iteration stdout buffer */
  currentOutput: string;

  /** Current iteration stderr buffer */
  currentStderr: string;

  /**
   * Subagents tracked during the current iteration.
   * Maps subagent ID to its state.
   */
  subagents: Map<string, EngineSubagentState>;

  /**
   * Currently active agent state.
   * Tracks which agent is running and why (primary or fallback).
   */
  activeAgent: ActiveAgentState | null;

  /**
   * Rate limit state for agent switching.
   * Persists across iterations until primary agent is recovered.
   */
  rateLimitState: RateLimitState | null;

  /** Tracker realtime status (if supported by tracker) */
  trackerRealtimeStatus?: TrackerRealtimeStatus;
  /** Polling interval for realtime/fallback mode */
  trackerRealtimeIntervalMs?: number;
}

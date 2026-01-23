/**
 * ABOUTME: Execution engine for Ralph TUI agent loop.
 * Handles the iteration cycle: select task → inject prompt → run agent → check result → update tracker.
 * Supports configurable error handling strategies: retry, skip, abort.
 */

import type {
  ActiveAgentState,
  ActiveAgentReason,
  AgentRecoveryAttemptedEvent,
  AgentSwitchedEvent,
  AllAgentsLimitedEvent,
  EngineEvent,
  EngineEventListener,
  EngineState,
  EngineStatus,
  EngineSubagentState,
  ErrorHandlingConfig,
  ErrorHandlingStrategy,
  IterationResult,
  IterationStatus,
  IterationRateLimitedEvent,
  RateLimitState,
  TrackerRealtimeStatus,
  SubagentTreeNode,
} from './types.js';
import { toEngineSubagentState } from './types.js';
import type { RalphConfig, RateLimitHandlingConfig } from '../config/types.js';
import { DEFAULT_RATE_LIMIT_HANDLING } from '../config/types.js';
import { RateLimitDetector, type RateLimitDetectionResult } from './rate-limit-detector.js';
import type { TrackerPlugin, TrackerTask } from '../plugins/trackers/types.js';
import type { AgentPlugin, AgentExecutionHandle } from '../plugins/agents/types.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { getTrackerRegistry } from '../plugins/trackers/registry.js';
import { SubagentTraceParser } from '../plugins/agents/tracing/parser.js';
import type { SubagentEvent } from '../plugins/agents/tracing/types.js';
import type { ClaudeJsonlMessage } from '../plugins/agents/builtin/claude.js';
import { createDroidStreamingJsonlParser, isDroidJsonlMessage, toClaudeJsonlMessages } from '../plugins/agents/droid/outputParser.js';
import {
  isOpenCodeTaskTool,
  openCodeTaskToClaudeMessages,
} from '../plugins/agents/opencode/outputParser.js';
import { updateSessionIteration, updateSessionStatus, updateSessionMaxIterations } from '../session/index.js';
import { spawn } from 'node:child_process';
import {
  saveIterationLog,
  buildSubagentTrace,
  createProgressEntry,
  appendProgress,
  getRecentProgressSummary,
  getCodebasePatternsForPrompt,
  appendTrackerEvent,
} from '../logs/index.js';
import type { AgentSwitchEntry } from '../logs/index.js';
import { renderPrompt } from '../templates/index.js';
import { BeadsRealtimeWatcher } from './beads-realtime.js';
import { MainSyncWorktree } from '../git/index.js';
import { join } from 'node:path';

/**
 * Pattern to detect completion signal in agent output
 */
const PROMISE_COMPLETE_PATTERN = /<promise>\s*COMPLETE\s*<\/promise>/i;

/**
 * Timeout for primary agent recovery test (5 seconds).
 * This is intentionally short to avoid delays when testing if the rate limit has lifted.
 */
const PRIMARY_RECOVERY_TEST_TIMEOUT_MS = 5000;

/**
 * Minimal test prompt for checking rate limit status.
 * Kept simple to minimize token usage and allow fast response.
 */
const PRIMARY_RECOVERY_TEST_PROMPT = 'Reply with just the word "ok".';

/**
 * Maximum number of commit recovery attempts before blocking the task.
 */
const COMMIT_RECOVERY_MAX_RETRIES = 1;

/**
 * Maximum lines to include in stdout tail for recovery prompt.
 */
const RECOVERY_TAIL_MAX_LINES = 20;

/**
 * Maximum characters for stdout tail in recovery prompt.
 */
const RECOVERY_TAIL_MAX_CHARS = 2000;

/**
 * Build prompt for the agent based on task using the template system.
 * Falls back to a hardcoded default if template rendering fails.
 * Includes recent progress from previous iterations for context.
 * Includes PRD context if the tracker provides it.
 * Uses the tracker's getTemplate() method for plugin-owned templates.
 */
async function buildPrompt(
  task: TrackerTask,
  config: RalphConfig,
  tracker?: TrackerPlugin
): Promise<string> {
  // Load recent progress for context (last 5 iterations)
  const recentProgress = await getRecentProgressSummary(config.cwd, 5);

  // Load codebase patterns from progress.md (if any exist)
  const codebasePatterns = await getCodebasePatternsForPrompt(config.cwd);

  // Get template from tracker plugin (new architecture: templates owned by plugins)
  // Use optional call syntax since not all tracker plugins implement getTemplate
  const trackerTemplate = tracker?.getTemplate?.();

  // Get PRD context if the tracker supports it
  const prdContext = await tracker?.getPrdContext?.();

  // Build extended template context with PRD data and patterns
  const extendedContext = {
    recentProgress,
    codebasePatterns,
    prd: prdContext ?? undefined,
  };

  // Use the template system (tracker template used if no custom/user override)
  const result = renderPrompt(task, config, undefined, extendedContext, trackerTemplate);

  if (result.success && result.prompt) {
    return result.prompt;
  }

  // Log template error and fall back to simple format
  console.error(`Template rendering failed: ${result.error}`);

  // Fallback prompt
  const lines: string[] = [];
  lines.push('## Task');
  lines.push(`**ID**: ${task.id}`);
  lines.push(`**Title**: ${task.title}`);

  if (task.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(task.description);
  }

  lines.push('');
  lines.push('## Instructions');
  lines.push('Complete the task described above. When finished, signal completion with:');
  lines.push('<promise>COMPLETE</promise>');

  return lines.join('\n');
}

/**
 * Execution engine for the agent loop
 */
export class ExecutionEngine {
  private config: RalphConfig;
  private agent: AgentPlugin | null = null;
  private tracker: TrackerPlugin | null = null;
  private listeners: EngineEventListener[] = [];
  private state: EngineState;
  private currentExecution: AgentExecutionHandle | null = null;
  private shouldStop = false;
  /** Track retry attempts per task */
  private retryCountMap: Map<string, number> = new Map();
  /** Track skipped tasks to avoid retrying them */
  private skippedTasks: Set<string> = new Set();
  /** Parser for extracting subagent lifecycle events from agent output */
  private subagentParser: SubagentTraceParser;
  /** Rate limit detector for parsing agent output */
  private rateLimitDetector: RateLimitDetector;
  /** Track rate limit retry attempts per task (separate from generic retries) */
  private rateLimitRetryMap: Map<string, number> = new Map();
  /** Rate limit handling configuration */
  private rateLimitConfig: Required<RateLimitHandlingConfig>;
  /** Track agents that have been rate-limited for the current task (cleared on task completion) */
  private rateLimitedAgents: Set<string> = new Set();
  /** Primary agent instance - preserved when switching to fallback for recovery attempts */
  private primaryAgentInstance: AgentPlugin | null = null;
  /** Track agent switches during the current iteration for logging */
  private currentIterationAgentSwitches: AgentSwitchEntry[] = [];
  /** Beads realtime watcher (SQLite data_version polling) */
  private trackerRealtimeWatcher: BeadsRealtimeWatcher | null = null;
  /** Track commit recovery attempts per task (separate from generic retries) */
  private commitRecoveryAttempts: Map<string, number> = new Map();
  /** Main sync worktree for fast-forward syncs to main branch */
  private mainSyncWorktree: MainSyncWorktree | null = null;
  /** Track tasks pending main sync (blocked until main sync succeeds) */
  private pendingMainSyncTasks: Map<string, { task: TrackerTask; workerId: string }> = new Map();
  /** Timestamp of last main sync attempt (for rate limiting retries) */
  private lastMainSyncAttemptAt = 0;
  /** Current retry attempt number for pending main sync (resets on success) */
  private pendingMainSyncRetryCount = 0;
  /** Wait counter for pending main sync in run loop (resets on task found) */
  private pendingMainSyncWaitCount = 0;
  /** Maximum retries for pending main sync before alerting */
  private readonly maxMainSyncRetries = 10;
  /** Flag to prevent repeated main sync alert spam (reset when pending tasks cleared) */
  private mainSyncAlertEmitted = false;

  constructor(config: RalphConfig) {
    this.config = config;
    this.state = {
      status: 'idle',
      currentIteration: 0,
      currentTask: null,
      totalTasks: 0,
      tasksCompleted: 0,
      iterations: [],
      startedAt: null,
      currentOutput: '',
      currentStderr: '',
      subagents: new Map(),
      activeAgent: null,
      rateLimitState: null,
    };

    // Initialize subagent parser with event handler
    this.subagentParser = new SubagentTraceParser({
      onEvent: (event) => this.handleSubagentEvent(event),
      trackHierarchy: true,
    });

    // Initialize rate limit detector
    this.rateLimitDetector = new RateLimitDetector();

    // Get rate limit handling config from agent config or use defaults
    const agentRateLimitConfig = this.config.agent.rateLimitHandling;
    this.rateLimitConfig = {
      ...DEFAULT_RATE_LIMIT_HANDLING,
      ...agentRateLimitConfig,
    };
  }

  /**
   * Initialize the engine with plugins
   */
  async initialize(): Promise<void> {
    // Get agent instance
    const agentRegistry = getAgentRegistry();
    this.agent = await agentRegistry.getInstance(this.config.agent);

    // Detect agent availability
    const detectResult = await this.agent.detect();
    if (!detectResult.available) {
      throw new Error(
        `Agent '${this.config.agent.plugin}' not available: ${detectResult.error}`
      );
    }

    // Validate model if specified
    if (this.config.model) {
      const modelError = this.agent.validateModel(this.config.model);
      if (modelError) {
        throw new Error(modelError);
      }
    }

    // Store reference to primary agent for recovery attempts
    this.primaryAgentInstance = this.agent;

    // Initialize active agent state
    const now = new Date().toISOString();
    this.state.activeAgent = {
      plugin: this.config.agent.plugin,
      reason: 'primary',
      since: now,
    };

    // Initialize rate limit state tracking the primary agent
    this.state.rateLimitState = {
      primaryAgent: this.config.agent.plugin,
    };

    // Get tracker instance
    const trackerRegistry = getTrackerRegistry();
    this.tracker = await trackerRegistry.getInstance(this.config.tracker);

    // Sync tracker
    await this.tracker.sync();

    // Get initial task count
    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress'] });
    this.state.totalTasks = tasks.length;

    this.startTrackerRealtimeWatcher();

    // Initialize main sync worktree for fast-forward syncs
    this.mainSyncWorktree = new MainSyncWorktree({
      repoRoot: this.config.cwd,
    });
  }

  private startTrackerRealtimeWatcher(): void {
    if (this.trackerRealtimeWatcher) {
      this.trackerRealtimeWatcher.stop();
      this.trackerRealtimeWatcher = null;
    }

    if (!this.tracker) {
      return;
    }

    if (!this.config.tracker.plugin.includes('beads')) {
      return;
    }

    const trackerOptions = this.config.tracker.options as Record<string, unknown> | undefined;
    const workingDir = (trackerOptions?.workingDir as string) ?? this.config.cwd ?? process.cwd();
    const beadsDir = (trackerOptions?.beadsDir as string) ?? '.beads';
    const dbPath = join(workingDir, beadsDir, 'beads.db');

    this.trackerRealtimeWatcher = new BeadsRealtimeWatcher({
      dbPath,
      liveIntervalMs: 1000,
      fallbackIntervalMs: 5000,
      onChange: async () => {
        await this.refreshTasks();
      },
      onStatusChange: (status, intervalMs, reason) => {
        this.setTrackerRealtimeStatus(status, intervalMs, reason);
      },
    });

    this.trackerRealtimeWatcher.start();
  }

  private setTrackerRealtimeStatus(
    status: TrackerRealtimeStatus,
    intervalMs: number,
    reason?: string
  ): void {
    if (
      this.state.trackerRealtimeStatus === status &&
      this.state.trackerRealtimeIntervalMs === intervalMs
    ) {
      return;
    }

    this.state.trackerRealtimeStatus = status;
    this.state.trackerRealtimeIntervalMs = intervalMs;
    this.emit({
      type: 'tracker:realtime',
      timestamp: new Date().toISOString(),
      status,
      intervalMs,
      reason,
    });
  }

  /**
   * Add event listener
   */
  on(listener: EngineEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private shouldLogTrackerEvents(): boolean {
    return this.config.tracker.plugin.includes('beads');
  }

  private logIterationFailure(task: TrackerTask, error: string, action: 'retry' | 'skip' | 'abort'): void {
    if (!this.shouldLogTrackerEvents()) {
      return;
    }

    void appendTrackerEvent(this.config.cwd, {
      type: 'iteration:failed',
      timestamp: new Date().toISOString(),
      tracker: this.config.tracker.plugin,
      iteration: this.state.currentIteration,
      taskId: task.id,
      taskTitle: task.title,
      error,
      action,
    });
  }

  /**
   * Get current engine state
   */
  getState(): Readonly<EngineState> {
    // Clone the state with a new Map to prevent external mutation
    return {
      ...this.state,
      subagents: new Map(this.state.subagents),
    };
  }

  /**
   * Get current status
   */
  getStatus(): EngineStatus {
    return this.state.status;
  }

  /**
   * Refresh the task list from the tracker and emit a tasks:refreshed event.
   * Call this when the user wants to manually refresh the task list (e.g., 'r' key).
   * Implements single-flight refresh with queuing to prevent race conditions.
   */
  private refreshInFlight = false;
  private refreshQueued = false;
  
  async refreshTasks(): Promise<void> {
    if (!this.tracker) {
      return;
    }

    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return;
    }

    this.refreshInFlight = true;
    try {
      do {
        this.refreshQueued = false;

        // Fetch all tasks including completed for TUI display
        const tasks = await this.tracker.getTasks({
          status: ['open', 'in_progress', 'completed'],
        });

        // Update total task count (open/in_progress only)
        const activeTasks = tasks.filter(
          (t) => t.status === 'open' || t.status === 'in_progress'
        );
        this.state.totalTasks = activeTasks.length;

        this.emit({
          type: 'tasks:refreshed',
          timestamp: new Date().toISOString(),
          tasks,
        });
      } while (this.refreshQueued);
    } finally {
      this.refreshInFlight = false;
    }
  }

  /**
   * Generate a preview of the prompt that would be sent to the agent for a given task.
   * Useful for debugging and understanding what the agent will receive.
   *
   * @param taskId - The ID of the task to generate prompt for
   * @returns Object with prompt content and template source, or error message
   */
  async generatePromptPreview(
    taskId: string
  ): Promise<{ success: true; prompt: string; source: string } | { success: false; error: string }> {
    if (!this.tracker) {
      return { success: false, error: 'No tracker configured' };
    }

    // Get the task (include completed tasks so we can review prompts after execution)
    const tasks = await this.tracker.getTasks({ status: ['open', 'in_progress', 'completed'] });
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      return { success: false, error: `Task not found: ${taskId}` };
    }

    // Get tracker template (if tracker provides one)
    const trackerTemplate = this.tracker.getTemplate?.();

    // Get recent progress summary for context
    const recentProgress = await getRecentProgressSummary(this.config.cwd, 5);

    // Get codebase patterns from progress.md (if any exist)
    const codebasePatterns = await getCodebasePatternsForPrompt(this.config.cwd);

    // Get PRD context if the tracker supports it
    const prdContext = await this.tracker.getPrdContext?.();

    // Build extended template context with PRD data and patterns
    const extendedContext = {
      recentProgress,
      codebasePatterns,
      prd: prdContext ?? undefined,
    };

    // Generate the prompt
    const result = renderPrompt(task, this.config, undefined, extendedContext, trackerTemplate);

    if (!result.success || !result.prompt) {
      return { success: false, error: result.error ?? 'Unknown error generating prompt' };
    }

    return {
      success: true,
      prompt: result.prompt,
      source: result.source ?? 'unknown',
    };
  }

  /**
   * Start the execution loop
   */
  async start(): Promise<void> {
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start engine in ${this.state.status} state`);
    }

    if (!this.agent || !this.tracker) {
      throw new Error('Engine not initialized');
    }

    this.state.status = 'running';
    this.state.startedAt = new Date().toISOString();
    this.shouldStop = false;

    // Fetch all tasks including completed for TUI display
    // Open/in_progress tasks are actionable; completed tasks are for historical view
    const initialTasks = await this.tracker.getTasks({
      status: ['open', 'in_progress', 'completed'],
    });

    this.emit({
      type: 'engine:started',
      timestamp: new Date().toISOString(),
      sessionId: '',
      totalTasks: this.state.totalTasks, // Only counts open/in_progress
      tasks: initialTasks,
    });

    // Warn if sandbox network is disabled but agent requires network
    if (
      this.config.sandbox?.enabled &&
      this.config.sandbox?.network === false &&
      this.agent!.getSandboxRequirements().requiresNetwork
    ) {
      this.emit({
        type: 'engine:warning',
        timestamp: new Date().toISOString(),
        code: 'sandbox-network-conflict',
        message: `Warning: Agent '${this.config.agent.plugin}' requires network access but --no-network is enabled. LLM API calls will fail.`,
      });
    }

    try {
      await this.runLoop();
    } finally {
      this.state.status = 'idle';
    }
  }

  /**
   * Main execution loop
   */
  private async runLoop(): Promise<void> {
    while (!this.shouldStop) {
      // Check if pausing - if so, transition to paused and wait
      if (this.state.status === 'pausing') {
        this.state.status = 'paused';
        this.emit({
          type: 'engine:paused',
          timestamp: new Date().toISOString(),
          currentIteration: this.state.currentIteration,
        });

        // Wait until resumed
        while (this.state.status === 'paused' && !this.shouldStop) {
          await this.delay(100); // Poll every 100ms
        }

        // If we were stopped while paused, exit the loop
        if (this.shouldStop) {
          break;
        }

        // Emit resumed event and continue
        this.emit({
          type: 'engine:resumed',
          timestamp: new Date().toISOString(),
          fromIteration: this.state.currentIteration,
        });
      }

      // Try to sync pending main sync tasks before getting next task
      // This allows blocked tasks to complete once main is synced
      await this.trySyncPendingMainTasks();

      // Attempt primary agent recovery at the start of each iteration
      // This allows the engine to switch back to the preferred agent when rate limits lift
      if (this.shouldRecoverPrimaryAgent()) {
        await this.attemptPrimaryAgentRecovery();
      }

      // Check max iterations
      if (
        this.config.maxIterations > 0 &&
        this.state.currentIteration >= this.config.maxIterations
      ) {
        this.emit({
          type: 'engine:stopped',
          timestamp: new Date().toISOString(),
          reason: 'max_iterations',
          totalIterations: this.state.currentIteration,
          tasksCompleted: this.state.tasksCompleted,
        });
        break;
      }

      // Check if all tasks complete
      const isComplete = await this.tracker!.isComplete();
      if (isComplete) {
        this.emit({
          type: 'all:complete',
          timestamp: new Date().toISOString(),
          totalCompleted: this.state.tasksCompleted,
          totalIterations: this.state.currentIteration,
        });
        this.emit({
          type: 'engine:stopped',
          timestamp: new Date().toISOString(),
          reason: 'completed',
          totalIterations: this.state.currentIteration,
          tasksCompleted: this.state.tasksCompleted,
        });
        break;
      }

      // Get next task (excluding skipped tasks)
      const task = await this.getNextAvailableTask();
      if (!task) {
        // If there are pending main sync tasks, wait and retry (with a limit)
        if (this.pendingMainSyncTasks.size > 0) {
          // Track wait attempts to prevent infinite loop
          this.pendingMainSyncWaitCount++;
          const maxWaitAttempts = 20; // 20 * 250ms = 5 seconds max wait

          if (this.pendingMainSyncWaitCount < maxWaitAttempts) {
            await this.delay(250);
            continue;
          }

          // Max wait reached - pause instead of stopping to allow background recovery
          // or manual intervention while keeping session alive
          console.log(`[engine] Max wait for pending main sync reached (${maxWaitAttempts} attempts). Pausing.`);
          this.pendingMainSyncWaitCount = 0;
          this.emit({
            type: 'engine:warning',
            timestamp: new Date().toISOString(),
            code: 'sandbox-network-conflict', // Reusing warning type for "sync blocked"
            message: `Engine paused: ${this.pendingMainSyncTasks.size} tasks blocked pending main sync.`,
          });
          this.pause();
          continue;
        }

        this.emit({
          type: 'engine:stopped',
          timestamp: new Date().toISOString(),
          reason: 'no_tasks',
          totalIterations: this.state.currentIteration,
          tasksCompleted: this.state.tasksCompleted,
        });
        break;
      }

      // Reset wait count when we successfully get a task
      this.pendingMainSyncWaitCount = 0;

      // Run iteration with error handling
      const result = await this.runIterationWithErrorHandling(task);

      // Check if we should abort
      if (result.status === 'failed' && this.config.errorHandling.strategy === 'abort') {
        this.emit({
          type: 'engine:stopped',
          timestamp: new Date().toISOString(),
          reason: 'error',
          totalIterations: this.state.currentIteration,
          tasksCompleted: this.state.tasksCompleted,
        });
        break;
      }

      // Update session
      await updateSessionIteration(
        this.config.cwd,
        this.state.currentIteration,
        this.state.tasksCompleted
      );

      // Wait between iterations
      if (this.config.iterationDelay > 0 && !this.shouldStop) {
        await this.delay(this.config.iterationDelay);
      }
    }
  }

  /**
   * Get the next available task, excluding skipped ones.
   * Delegates to the tracker's getNextTask() for proper dependency-aware ordering.
   * See: https://github.com/subsy/ralph-tui/issues/97
   */
  private async getNextAvailableTask(): Promise<TrackerTask | null> {
    // Convert skipped tasks Set to array for the filter
    const excludeIds = Array.from(this.skippedTasks);

    // Delegate to tracker's getNextTask for dependency-aware ordering
    // The tracker (e.g., beads) uses bd ready which properly handles dependencies
    const task = await this.tracker!.getNextTask({
      status: ['open', 'in_progress'],
      excludeIds: excludeIds.length > 0 ? excludeIds : undefined,
    });

    return task ?? null;
  }

  /**
   * Run iteration with error handling strategy
   */
  private async runIterationWithErrorHandling(task: TrackerTask): Promise<IterationResult> {
    const errorConfig = this.config.errorHandling;

    while (true) {
      let result = await this.runIteration(task);
      this.state.iterations.push(result);

      // Handle success
      if (result.status !== 'failed') {
        if (result.taskCompleted) {
          this.state.tasksCompleted++;
          // Clear retry count on success
          this.retryCountMap.delete(task.id);
        }
        return result;
      }

      // Handle failure according to strategy
      const errorMessage = result.error ?? 'Unknown error';

      switch (errorConfig.strategy) {
        case 'retry': {
          const currentRetries = this.retryCountMap.get(task.id) ?? 0;

          if (currentRetries < errorConfig.maxRetries && !this.shouldStop) {
            // Emit failed event with retry action
            this.emit({
              type: 'iteration:failed',
              timestamp: new Date().toISOString(),
              iteration: this.state.currentIteration,
              error: errorMessage,
              task,
              action: 'retry',
            });
            this.logIterationFailure(task, errorMessage, 'retry');

            // Emit retry event
            this.emit({
              type: 'iteration:retrying',
              timestamp: new Date().toISOString(),
              iteration: this.state.currentIteration,
              retryAttempt: currentRetries + 1,
              maxRetries: errorConfig.maxRetries,
              task,
              previousError: errorMessage,
              delayMs: errorConfig.retryDelayMs,
            });

            // Update retry count
            this.retryCountMap.set(task.id, currentRetries + 1);

            // Wait before retry
            if (errorConfig.retryDelayMs > 0 && !this.shouldStop) {
              await this.delay(errorConfig.retryDelayMs);
            }

            // Continue the loop to retry the iteration
            // We NO LONGER decrement this.state.currentIteration here.
            // Each retry becomes a new iteration in the monotonic sequence.
            continue;
          } else if (currentRetries >= errorConfig.maxRetries) {
            // Max retries exceeded - treat as skip
            const skipReason = `Max retries (${errorConfig.maxRetries}) exceeded: ${errorMessage}`;
            this.emit({
              type: 'iteration:failed',
              timestamp: new Date().toISOString(),
              iteration: this.state.currentIteration,
              error: skipReason,
              task,
              action: 'skip',
            });
            this.logIterationFailure(task, skipReason, 'skip');
            this.emitSkipEvent(task, skipReason);
            this.skippedTasks.add(task.id);
            this.retryCountMap.delete(task.id);
            // Fix 2: Prevent tracker task from being stuck in in_progress forever
            await this.tracker!.updateTaskStatus(task.id, 'open');
          }
          break;
        }

        case 'skip': {
          // Emit failed event with skip action
          this.emit({
            type: 'iteration:failed',
            timestamp: new Date().toISOString(),
            iteration: this.state.currentIteration,
            error: errorMessage,
            task,
            action: 'skip',
          });
          this.logIterationFailure(task, errorMessage, 'skip');
          this.emitSkipEvent(task, errorMessage);
          this.skippedTasks.add(task.id);
          // Bug fix: Reset task status to 'open' so it doesn't stay stuck as in_progress
          await this.tracker!.updateTaskStatus(task.id, 'open');
          break;
        }

        case 'abort': {
          // Emit failed event with abort action
          this.emit({
            type: 'iteration:failed',
            timestamp: new Date().toISOString(),
            iteration: this.state.currentIteration,
            error: errorMessage,
            task,
            action: 'abort',
          });
          this.logIterationFailure(task, errorMessage, 'abort');
          // Bug fix: Reset task status to 'open' so it doesn't stay stuck as in_progress
          await this.tracker!.updateTaskStatus(task.id, 'open');
          break;
        }
      }

      return result;
    }
  }

  /**
   * Emit a skip event for a task
   */
  private emitSkipEvent(task: TrackerTask, reason: string): void {
    this.emit({
      type: 'iteration:skipped',
      timestamp: new Date().toISOString(),
      iteration: this.state.currentIteration,
      task,
      reason,
    });
  }

  /**
   * Check agent output for rate limit conditions.
   * Returns detection result if rate limit is detected.
   */
  private checkForRateLimit(
    stdout: string,
    stderr: string,
    exitCode?: number
  ): RateLimitDetectionResult {
    if (!this.rateLimitConfig.enabled) {
      return { isRateLimit: false };
    }

    return this.rateLimitDetector.detect({
      stderr,
      stdout,
      exitCode,
      // Use active agent (handles fallback) instead of always using primary from config
      agentId: this.state.activeAgent?.plugin ?? this.agent?.meta.id ?? this.config.agent.plugin,
    });
  }

  /**
   * Handle rate limit with exponential backoff retry.
   * Returns true if retry should be attempted, false if max retries exceeded.
   *
   * @param task - The task that hit the rate limit
   * @param rateLimitResult - The rate limit detection result
   * @param iteration - Current iteration number
   * @returns true if engine should retry the task
   */
  private async handleRateLimitWithBackoff(
    task: TrackerTask,
    rateLimitResult: RateLimitDetectionResult,
    iteration: number
  ): Promise<boolean> {
    const currentRetries = this.rateLimitRetryMap.get(task.id) ?? 0;
    const maxRetries = this.rateLimitConfig.maxRetries;

    // Check if we've exhausted retries
    if (currentRetries >= maxRetries) {
      // Clear retry count - fallback will handle this
      this.rateLimitRetryMap.delete(task.id);
      return false;
    }

    // Calculate backoff delay
    const { delayMs, usedRetryAfter } = this.calculateBackoffDelay(
      currentRetries,
      rateLimitResult.retryAfter
    );

    // Increment retry count
    this.rateLimitRetryMap.set(task.id, currentRetries + 1);

    // Emit rate limit event
    const event: IterationRateLimitedEvent = {
      type: 'iteration:rate-limited',
      timestamp: new Date().toISOString(),
      iteration,
      task,
      retryAttempt: currentRetries + 1,
      maxRetries,
      delayMs,
      rateLimitMessage: rateLimitResult.message,
      usedRetryAfter,
    };
    this.emit(event);

    // Log retry attempt
    const delaySeconds = Math.round(delayMs / 1000);
    const retrySource = usedRetryAfter ? 'from retryAfter header' : 'exponential backoff';
    console.log(
      `[rate-limit] Retry ${currentRetries + 1}/${maxRetries} in ${delaySeconds}s (${retrySource})`
    );

    // Wait for backoff delay
    if (!this.shouldStop) {
      await this.delay(delayMs);
    }

    return !this.shouldStop;
  }

  /**
   * Clear rate limit retry count for a task (called on success).
   */
  private clearRateLimitRetryCount(taskId: string): void {
    this.rateLimitRetryMap.delete(taskId);
  }

  /**
   * Run a single iteration
   */
  private async runIteration(task: TrackerTask): Promise<IterationResult> {
    this.state.currentIteration++;
    this.state.currentTask = task;
    this.state.currentOutput = '';
    this.state.currentStderr = '';

    // Reset subagent tracking for this iteration
    this.state.subagents.clear();
    this.subagentParser.reset();

    // Reset agent switch tracking for this iteration
    this.currentIterationAgentSwitches = [];

    const startedAt = new Date();

    while (true) {
      const iteration = this.state.currentIteration;

      try {
        this.emit({
          type: 'iteration:started',
          timestamp: new Date().toISOString(),
          iteration,
          task,
        });

        if (this.shouldLogTrackerEvents()) {
          void appendTrackerEvent(this.config.cwd, {
            type: 'iteration:started',
            timestamp: new Date().toISOString(),
            tracker: this.config.tracker.plugin,
            iteration,
            taskId: task.id,
            taskTitle: task.title,
          });
        }

        this.emit({
          type: 'task:selected',
          timestamp: new Date().toISOString(),
          task,
          iteration,
        });

        // Update task status to in_progress
        await this.tracker!.updateTaskStatus(task.id, 'in_progress');

        // Emit task:activated for crash recovery tracking
        this.emit({
          type: 'task:activated',
          timestamp: new Date().toISOString(),
          task,
          iteration,
        });

        // Build prompt (includes recent progress context + tracker-owned template)
        const prompt = await buildPrompt(task, this.config, this.tracker ?? undefined);

        // Build agent flags
        const flags: string[] = [];
        if (this.config.model) {
          flags.push('--model', this.config.model);
        }

        // Check if agent declares subagent tracing support
        const supportsTracing = this.agent!.meta.supportsSubagentTracing;

        const isDroidAgent = this.agent?.meta.id === 'droid';
        const droidJsonlParser = isDroidAgent ? createDroidStreamingJsonlParser() : null;

        // Execute agent
        const handle = this.agent!.execute(prompt, [], {
          cwd: this.config.cwd,
          flags,
          sandbox: this.config.sandbox,
          subagentTracing: supportsTracing,
          onJsonlMessage: (message: Record<string, unknown>) => {
            // OpenCode format detection
            const part = message.part as Record<string, unknown> | undefined;
            if (message.type === 'tool_use' && part?.tool) {
              const openCodeMessage = {
                source: 'opencode' as const,
                type: message.type as string,
                timestamp: message.timestamp as number | undefined,
                sessionID: message.sessionID as string | undefined,
                part: part as import('../plugins/agents/opencode/outputParser.js').OpenCodePart,
                raw: message,
              };
              if (isOpenCodeTaskTool(openCodeMessage)) {
                for (const claudeMessage of openCodeTaskToClaudeMessages(openCodeMessage)) {
                  this.subagentParser.processMessage(claudeMessage);
                }
              }
              return;
            }

            // Claude format
            const claudeMessage: ClaudeJsonlMessage = {
              type: message.type as string | undefined,
              message: message.message as string | undefined,
              tool: message.tool as { name?: string; input?: Record<string, unknown> } | undefined,
              result: message.result,
              cost: message.cost as { inputTokens?: number; outputTokens?: number; totalUSD?: number } | undefined,
              sessionId: message.sessionId as string | undefined,
              raw: message,
            };
            this.subagentParser.processMessage(claudeMessage);
          },
          onStdout: (data) => {
            this.state.currentOutput += data;
            this.emit({
              type: 'agent:output',
              timestamp: new Date().toISOString(),
              stream: 'stdout',
              data,
              iteration,
            });

            if (droidJsonlParser && isDroidAgent) {
              const results = droidJsonlParser.push(data);
              for (const result of results) {
                if (result.success) {
                  if (isDroidJsonlMessage(result.message)) {
                    for (const normalized of toClaudeJsonlMessages(result.message)) {
                      this.subagentParser.processMessage(normalized);
                    }
                  } else {
                    this.subagentParser.processMessage(result.message);
                  }
                }
              }
            }
          },
          onStderr: (data) => {
            this.state.currentStderr += data;
            this.emit({
              type: 'agent:output',
              timestamp: new Date().toISOString(),
              stream: 'stderr',
              data,
              iteration,
            });
          },
        });

        this.currentExecution = handle;
        const agentResult = await handle.promise;
        this.currentExecution = null;

        if (droidJsonlParser && isDroidAgent) {
          const remaining = droidJsonlParser.flush();
          for (const result of remaining) {
            if (result.success) {
              if (isDroidJsonlMessage(result.message)) {
                for (const normalized of toClaudeJsonlMessages(result.message)) {
                  this.subagentParser.processMessage(normalized);
                }
              } else {
                this.subagentParser.processMessage(result.message);
              }
            }
          }
        }

        // Check for rate limit
        const rateLimitResult = this.checkForRateLimit(
          agentResult.stdout,
          agentResult.stderr,
          agentResult.exitCode
        );

        if (rateLimitResult.isRateLimit) {
          const shouldRetry = await this.handleRateLimitWithBackoff(task, rateLimitResult, iteration);

          if (shouldRetry && !this.shouldStop) {
            // Increment iteration for the retry
            this.state.currentIteration++;
            continue;
          }

          // Try fallback agent
          const currentAgentPlugin = this.state.activeAgent?.plugin ?? this.config.agent.plugin;
          this.rateLimitedAgents.add(currentAgentPlugin);

          const fallbackResult = await this.tryFallbackAgent(task, iteration, startedAt);
          if (fallbackResult.switched && !this.shouldStop) {
            // Increment iteration for the retry with fallback
            this.state.currentIteration++;
            continue;
          }

          if (fallbackResult.allAgentsLimited) {
            this.emit({
              type: 'agent:all-limited',
              timestamp: new Date().toISOString(),
              task,
              triedAgents: Array.from(this.rateLimitedAgents),
              rateLimitState: this.state.rateLimitState!,
            });
            this.pause();
          }

          const endedAt = new Date();
          return {
            iteration,
            status: 'failed',
            task,
            taskCompleted: false,
            promiseComplete: false,
            durationMs: endedAt.getTime() - startedAt.getTime(),
            error: `Rate limit exceeded after ${this.rateLimitConfig.maxRetries} retries: ${rateLimitResult.message}`,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
          };
        }

        // Success (not rate limited)
        this.clearRateLimitedAgents();
        this.clearRateLimitRetryCount(task.id);

        const endedAt = new Date();
        const durationMs = endedAt.getTime() - startedAt.getTime();
        const promiseComplete = PROMISE_COMPLETE_PATTERN.test(agentResult.stdout);

        // Check if commit recovery is needed (repo is dirty after completion signal)
        let recoveryNeeded = false;
        let recoveryResult: { success: boolean; recoveryCount: number; reason?: string } | null = null;

        if (promiseComplete) {
          recoveryNeeded = await this.needsCommitRecovery(task, agentResult.stdout);

          if (recoveryNeeded) {
            // Run commit recovery loop
            recoveryResult = await this.runCommitRecovery(task, iteration, agentResult.stdout, prompt);

            if (!recoveryResult.success) {
              // Recovery failed - task will be blocked, not completed
              console.log(`[commit-recovery] Task ${task.id} blocked: ${recoveryResult.reason}`);

              // Explicitly update tracker and emit event to match Option A (Block) semantics
              await this.tracker!.updateTaskStatus(task.id, 'blocked');
              this.emit({
                type: 'task:blocked',
                timestamp: new Date().toISOString(),
                task,
                reason: `Commit recovery failed after ${recoveryResult.recoveryCount} attempts: ${recoveryResult.reason}`,
                recoveryAttemptCount: recoveryResult.recoveryCount,
              });
            }
          }
        }

        // Determine if task was completed (only if no pending recovery or recovery succeeded)
        // Fix 4: Strict completion logic - require explicit <promise>COMPLETE</promise> signal
        const taskCompleted =
          promiseComplete &&
          (!recoveryNeeded || (recoveryResult?.success ?? false));

        // Update tracker if task completed (gated on main sync success)
        if (taskCompleted) {
          // Try to sync with main branch before completing
          const syncResult = await this.syncMainBranch();

          if (syncResult.success) {
            // Main sync succeeded - complete the task
            await this.tracker!.completeTask(task.id, 'Completed by agent');
            this.emit({
              type: 'task:completed',
              timestamp: new Date().toISOString(),
              task,
              iteration,
            });

            // Clear rate-limited agents tracking on task completion
            // This allows agents to be retried for the next task
            this.clearRateLimitedAgents();
          } else {
            // Main sync failed or was skipped - block the task pending main sync
            console.log(`[main-sync] Task ${task.id} blocked: ${syncResult.reason}`);

            // Get pending commits to mark in tracker
            const pendingInfo = await this.getPendingMainCommits();

            // Add to pending main sync tasks
            this.pendingMainSyncTasks.set(task.id, { task, workerId: 'main' });

            // Mark task as blocked in tracker
            await this.tracker!.updateTaskStatus(task.id, 'blocked');

            // Mark as pending-main in tracker (if supported)
            if (this.tracker && 'markTaskPendingMain' in this.tracker && typeof this.tracker.markTaskPendingMain === 'function') {
              await this.tracker.markTaskPendingMain(task.id, pendingInfo.count, pendingInfo.commits);
            }

            // Emit task blocked event
            this.emit({
              type: 'task:blocked',
              timestamp: new Date().toISOString(),
              task,
              reason: `Main sync required: ${syncResult.reason}`,
            });
          }
        }

        // Determine iteration status
        let status: IterationStatus;
        if (agentResult.interrupted) {
          status = 'interrupted';
        } else if (agentResult.status === 'failed') {
          status = 'failed';
        } else if (recoveryNeeded && !recoveryResult?.success) {
          // Recovery was needed but failed - mark as failed, not completed
          status = 'failed';
        } else {
          status = 'completed';
        }

        const result: IterationResult = {
          iteration,
          status,
          task,
          agentResult,
          taskCompleted,
          promiseComplete,
          durationMs,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        };

        // Save iteration output to .ralph-tui/iterations/ directory
        // Include subagent trace if any subagents were spawned
        const events = this.subagentParser.getEvents();
        const states = this.subagentParser.getAllSubagents();
        const subagentTrace =
          events.length > 0 ? buildSubagentTrace(events, states) : undefined;

        // Build completion summary if agent switches occurred
        const completionSummary = this.buildCompletionSummary(result);

        await saveIterationLog(this.config.cwd, result, agentResult.stdout, agentResult.stderr ?? this.state.currentStderr, {
          config: this.config,
          subagentTrace,
          agentSwitches: this.currentIterationAgentSwitches.length > 0 ? [...this.currentIterationAgentSwitches] : undefined,
          completionSummary,
          sandboxConfig: this.config.sandbox,
        });

        // Append progress entry for cross-iteration context
        // This provides agents with history of what's been done
        try {
          const progressEntry = createProgressEntry(result);
          await appendProgress(this.config.cwd, progressEntry);
        } catch {
          // Don't fail iteration if progress append fails
        }

        this.emit({
          type: 'iteration:completed',
          timestamp: endedAt.toISOString(),
          result,
        });

        if (this.shouldLogTrackerEvents()) {
          void appendTrackerEvent(this.config.cwd, {
            type: 'iteration:completed',
            timestamp: endedAt.toISOString(),
            tracker: this.config.tracker.plugin,
            iteration,
            taskId: task.id,
            taskTitle: task.title,
            status: result.status,
            durationMs,
            taskCompleted,
          });
        }

        return result;
      } catch (error) {
        const endedAt = new Date();
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Note: We don't emit iteration:failed here anymore - it's handled
        // by runIterationWithErrorHandling which determines the action.
        // This keeps the error handling logic centralized.

        const failedResult: IterationResult = {
          iteration,
          status: 'failed',
          task,
          taskCompleted: false,
          promiseComplete: false,
          durationMs: endedAt.getTime() - startedAt.getTime(),
          error: errorMessage,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        };

        // Append progress entry for failed iterations too
        try {
          const progressEntry = createProgressEntry(failedResult);
          await appendProgress(this.config.cwd, progressEntry);
        } catch {
          // Don't fail iteration if progress append fails
        }

        return failedResult;
      } finally {
        this.state.currentTask = null;
      }
    }
  }

  /**
   * Stop the execution loop
   */
  async stop(): Promise<void> {
    this.shouldStop = true;
    this.state.status = 'stopping';

    // Interrupt current execution if any
    if (this.currentExecution) {
      this.currentExecution.interrupt();
    }

    // Update session status
    await updateSessionStatus(this.config.cwd, 'interrupted');

    this.emit({
      type: 'engine:stopped',
      timestamp: new Date().toISOString(),
      reason: 'interrupted',
      totalIterations: this.state.currentIteration,
      tasksCompleted: this.state.tasksCompleted,
    });
  }

  /**
   * Request to pause the execution loop after the current iteration completes.
   * If already pausing or paused, this is a no-op.
   */
  pause(): void {
    if (this.state.status !== 'running') {
      return;
    }

    // Set to 'pausing' - the loop will transition to 'paused' after the current iteration
    this.state.status = 'pausing';
    // Note: We don't emit engine:paused here. That happens in runLoop when we actually pause.
  }

  /**
   * Resume the execution loop from a paused state.
   * This can also be used to cancel a pending pause (when status is 'pausing').
   */
  resume(): void {
    if (this.state.status === 'pausing') {
      // Cancel the pending pause - just go back to running
      this.state.status = 'running';
      return;
    }

    if (this.state.status !== 'paused') {
      return;
    }

    // Resume from paused state - the runLoop will detect this and continue
    this.state.status = 'running';
    // Note: engine:resumed event is emitted in runLoop when we actually resume
  }

  /**
   * Check if the engine is pausing or paused
   */
  isPaused(): boolean {
    return this.state.status === 'paused';
  }

  /**
   * Check if the engine is in the process of pausing
   */
  isPausing(): boolean {
    return this.state.status === 'pausing';
  }

  /**
   * Add iterations to maxIterations at runtime.
   * Useful for extending a session without stopping.
   * @param count - Number of iterations to add (must be positive)
   * @returns true if the engine should be restarted (was idle after hitting max_iterations)
   */
  async addIterations(count: number): Promise<boolean> {
    if (count <= 0) {
      return false;
    }

    const previousMax = this.config.maxIterations;
    // Handle unlimited case (0 means unlimited) - true no-op
    if (previousMax === 0) {
      return false;
    }

    const newMax = previousMax + count;

    // Check if we should restart (engine is idle and we're adding to a non-unlimited max)
    const shouldRestart = this.state.status === 'idle' && previousMax > 0;

    // Update config
    this.config.maxIterations = newMax;

    // Persist to session
    await updateSessionMaxIterations(this.config.cwd, newMax);

    // Emit event
    this.emit({
      type: 'engine:iterations-added',
      timestamp: new Date().toISOString(),
      added: count,
      newMax,
      previousMax,
      currentIteration: this.state.currentIteration,
    });

    return shouldRestart;
  }

  /**
   * Remove iterations from maxIterations at runtime.
   * Useful for limiting a session that's running longer than expected.
   * @param count - Number of iterations to remove (must be positive)
   * @returns true if successful, false if removal would go below 1 or current iteration
   */
  async removeIterations(count: number): Promise<boolean> {
    if (count <= 0) {
      return false;
    }

    const previousMax = this.config.maxIterations;
    // Handle unlimited case (0 means unlimited) - cannot reduce unlimited
    if (previousMax === 0) {
      return false;
    }

    // Calculate new max, but don't go below 1 or current iteration
    const minAllowed = Math.max(1, this.state.currentIteration);
    const newMax = Math.max(minAllowed, previousMax - count);

    // Check if we actually made a change
    if (newMax === previousMax) {
      return false;
    }

    // Update config
    this.config.maxIterations = newMax;

    // Persist to session
    await updateSessionMaxIterations(this.config.cwd, newMax);

    // Emit event
    this.emit({
      type: 'engine:iterations-removed',
      timestamp: new Date().toISOString(),
      removed: previousMax - newMax,
      newMax,
      previousMax,
      currentIteration: this.state.currentIteration,
    });

    return true;
  }

  /**
   * Continue execution after adding more iterations.
   * Call this after addIterations() returns true.
   */
  async continueExecution(): Promise<void> {
    if (this.state.status !== 'idle') {
      return; // Only continue from idle state
    }

    if (!this.agent || !this.tracker) {
      throw new Error('Engine not initialized');
    }

    this.state.status = 'running';
    this.shouldStop = false;

    // Emit resumed event
    this.emit({
      type: 'engine:resumed',
      timestamp: new Date().toISOString(),
      fromIteration: this.state.currentIteration,
    });

    try {
      await this.runLoop();
    } finally {
      this.state.status = 'idle';
    }
  }

  /**
   * Get current iteration info.
   * @returns Object with currentIteration and maxIterations
   */
  getIterationInfo(): { currentIteration: number; maxIterations: number } {
    return {
      currentIteration: this.state.currentIteration,
      maxIterations: this.config.maxIterations,
    };
  }

  /**
   * Delay for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay for rate limit retries.
   * Uses formula: baseBackoffMs * 3^attempt (5s, 15s, 45s with default 5s base)
   *
   * @param attempt - The retry attempt number (0-based)
   * @param retryAfter - Optional retryAfter value from rate limit response (in seconds)
   * @returns Object with delay in milliseconds and whether retryAfter was used
   */
  private calculateBackoffDelay(
    attempt: number,
    retryAfter?: number
  ): { delayMs: number; usedRetryAfter: boolean } {
    // If retryAfter is provided from the rate limit response, use it
    if (retryAfter !== undefined && retryAfter > 0) {
      return {
        delayMs: retryAfter * 1000, // Convert seconds to milliseconds
        usedRetryAfter: true,
      };
    }

    // Otherwise calculate exponential backoff: base * 3^attempt
    // With default base of 5000ms: 5s, 15s, 45s
    const delayMs = this.rateLimitConfig.baseBackoffMs * Math.pow(3, attempt);
    return {
      delayMs,
      usedRetryAfter: false,
    };
  }

  /**
   * Reset specific task IDs back to open status.
   * Used during graceful shutdown to release tasks that were set to in_progress
   * by this session but not completed.
   *
   * @param taskIds - Array of task IDs to reset to open
   * @returns Number of tasks successfully reset
   */
  async resetTasksToOpen(taskIds: string[]): Promise<number> {
    if (!this.tracker || taskIds.length === 0) {
      return 0;
    }

    let resetCount = 0;
    for (const taskId of taskIds) {
      try {
        await this.tracker.updateTaskStatus(taskId, 'open');
        resetCount++;
      } catch {
        // Silently continue on individual task reset failures
        // The task may have been deleted or modified externally
      }
    }

    return resetCount;
  }

  /**
   * Get the tracker instance for external operations.
   * Used by the run command for stale task detection and reset.
   */
  getTracker(): TrackerPlugin | null {
    return this.tracker;
  }

  /**
   * Get the list of task IDs that are pending main sync.
   * Used for summary logging to report pending-main tasks.
   */
  getPendingMainTaskIds(): string[] {
    return Array.from(this.pendingMainSyncTasks.keys());
  }

  /**
   * Get the snapshot tag if one was created (parallel execution only).
   * Sequential execution does not create snapshots.
   */
  getSnapshotTag(): string | null {
    return null;
  }

  /**
   * Handle a subagent event from the parser and update engine state.
   */
  private handleSubagentEvent(event: SubagentEvent): void {
    const parserState = this.subagentParser.getSubagent(event.id);
    if (!parserState) {
      return;
    }

    // Calculate depth for this subagent
    const depth = this.calculateSubagentDepth(event.id);

    // Convert to engine state format and update map
    const engineState = toEngineSubagentState(parserState, depth);
    this.state.subagents.set(event.id, engineState);
  }

  /**
   * Calculate the nesting depth for a subagent.
   * Top-level subagents have depth 1, their children have depth 2, etc.
   */
  private calculateSubagentDepth(subagentId: string): number {
    let depth = 1;
    let current = this.subagentParser.getSubagent(subagentId);

    while (current?.parentId) {
      depth++;
      current = this.subagentParser.getSubagent(current.parentId);
    }

    return depth;
  }

  /**
   * Get output/result for a specific subagent by ID.
   * For completed subagents, returns their result content.
   * For running subagents, returns undefined (use currentOutput for live streaming).
   *
   * @param id - Subagent ID to get output for
   * @returns Subagent result content, or undefined if not found or still running
   */
  getSubagentOutput(id: string): string | undefined {
    const state = this.subagentParser.getSubagent(id);
    if (!state) return undefined;
    // Return result only for completed/errored subagents
    if (state.status === 'completed' || state.status === 'error') {
      return state.result;
    }
    return undefined;
  }

  /**
   * Get detailed information about a subagent for display.
   * Returns the prompt, result, and timing information.
   *
   * @param id - Subagent ID to get details for
   * @returns Subagent details or undefined if not found
   */
  getSubagentDetails(id: string): {
    prompt?: string;
    result?: string;
    spawnedAt: string;
    endedAt?: string;
    childIds: string[];
  } | undefined {
    const state = this.subagentParser.getSubagent(id);
    if (!state) return undefined;
    return {
      prompt: state.prompt,
      result: state.result,
      spawnedAt: state.spawnedAt,
      endedAt: state.endedAt,
      childIds: state.childIds,
    };
  }

  /**
   * Get the currently active subagent ID (deepest in the hierarchy).
   * Returns undefined if no subagent is currently active.
   */
  getActiveSubagentId(): string | undefined {
    const stack = this.subagentParser.getActiveStack();
    // Return the deepest subagent in the stack.
    // NOTE: SubagentTraceParser.getActiveStack() returns the stack in [deepest, ..., root] order
    // because it calls .reverse() on its internal [root, ..., deepest] array.
    return stack.length > 0 ? stack[0] : undefined;
  }

  /**
   * Get the subagent tree for TUI rendering.
   * Returns an array of root-level subagent tree nodes with their children nested.
   */
  getSubagentTree(): SubagentTreeNode[] {
    const roots: SubagentTreeNode[] = [];
    const nodeMap = new Map<string, SubagentTreeNode>();

    // First pass: create nodes for all subagents
    for (const state of this.state.subagents.values()) {
      nodeMap.set(state.id, {
        state,
        children: [],
      });
    }

    // Second pass: build the tree structure
    for (const state of this.state.subagents.values()) {
      const node = nodeMap.get(state.id)!;

      if (state.parentId && nodeMap.has(state.parentId)) {
        // Add as child of parent
        const parentNode = nodeMap.get(state.parentId)!;
        parentNode.children.push(node);
      } else {
        // This is a root node
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Get the current active agent information.
   * Returns the active agent state for TUI display.
   */
  getActiveAgentInfo(): Readonly<ActiveAgentState> | null {
    return this.state.activeAgent ? { ...this.state.activeAgent } : null;
  }

  /**
   * Get the current rate limit state.
   * Returns rate limit tracking state for TUI display.
   */
  getRateLimitState(): Readonly<RateLimitState> | null {
    return this.state.rateLimitState ? { ...this.state.rateLimitState } : null;
  }

  /**
   * Switch to a different agent.
   * Updates state, emits agent:switched event, and persists across iterations.
   *
   * @param newAgentPlugin - Plugin identifier of the agent to switch to
   * @param reason - Why the switch is happening (primary recovery or fallback)
   */
  private switchAgent(newAgentPlugin: string, reason: ActiveAgentReason): void {
    const previousAgent = this.state.activeAgent?.plugin ?? this.config.agent.plugin;
    const now = new Date().toISOString();

    // Update active agent state
    this.state.activeAgent = {
      plugin: newAgentPlugin,
      reason,
      since: now,
    };

    // Update rate limit state based on reason
    if (reason === 'fallback' && this.state.rateLimitState) {
      this.state.rateLimitState = {
        ...this.state.rateLimitState,
        limitedAt: now,
        fallbackAgent: newAgentPlugin,
      };
    } else if (reason === 'primary' && this.state.rateLimitState) {
      // Recovering to primary - clear rate limit tracking
      this.state.rateLimitState = {
        primaryAgent: this.state.rateLimitState.primaryAgent,
        // Clear limitedAt and fallbackAgent on recovery
      };
    }

    // Record the agent switch for iteration logging
    const switchEntry: AgentSwitchEntry = {
      at: now,
      from: previousAgent,
      to: newAgentPlugin,
      reason,
    };
    this.currentIterationAgentSwitches.push(switchEntry);

    // Log the switch to console for visibility
    if (reason === 'fallback') {
      console.log(
        `[agent-switch] Switching to fallback: ${previousAgent} → ${newAgentPlugin} (rate limit)`
      );
    } else {
      // Calculate duration on fallback for recovery logging
      let durationOnFallback = '';
      if (this.state.rateLimitState?.limitedAt) {
        const limitedAt = new Date(this.state.rateLimitState.limitedAt);
        const durationMs = Date.now() - limitedAt.getTime();
        const durationSecs = Math.round(durationMs / 1000);
        if (durationSecs >= 60) {
          const mins = Math.floor(durationSecs / 60);
          const secs = durationSecs % 60;
          durationOnFallback = ` (${mins}m ${secs}s on fallback)`;
        } else {
          durationOnFallback = ` (${durationSecs}s on fallback)`;
        }
      }
      console.log(
        `[agent-switch] Recovering to primary: ${previousAgent} → ${newAgentPlugin}${durationOnFallback}`
      );
    }

    // Emit agent switched event
    const event: AgentSwitchedEvent = {
      type: 'agent:switched',
      timestamp: now,
      previousAgent,
      newAgent: newAgentPlugin,
      reason,
      rateLimitState: this.state.rateLimitState ?? undefined,
    };
    this.emit(event);
  }

  /**
   * Check if primary agent should be recovered between iterations.
   * Called when recoverPrimaryBetweenIterations is enabled.
   */
  private shouldRecoverPrimaryAgent(): boolean {
    // Only attempt recovery if currently using a fallback
    if (this.state.activeAgent?.reason !== 'fallback') {
      return false;
    }

    // Check if recovery is enabled
    return this.rateLimitConfig.recoverPrimaryBetweenIterations;
  }

  /**
   * Attempt to recover the primary agent by testing if rate limit has lifted.
   * Executes a minimal test prompt with short timeout to verify primary agent availability.
   * If the test succeeds (no rate limit detected), switches back to primary agent.
   *
   * Called between iterations when recoverPrimaryBetweenIterations is enabled.
   * Returns true if recovery was successful.
   */
  private async attemptPrimaryAgentRecovery(): Promise<boolean> {
    const primaryAgent = this.state.rateLimitState?.primaryAgent ?? this.config.agent.plugin;
    const fallbackAgent = this.state.activeAgent?.plugin ?? '';

    // Must have preserved primary agent instance
    if (!this.primaryAgentInstance) {
      console.log('[recovery] No primary agent instance available');
      return false;
    }

    console.log(`[recovery] Testing if primary agent '${primaryAgent}' rate limit has lifted...`);
    const startTime = Date.now();

    try {
      // Execute minimal test prompt with short timeout
      // Include model flags and sandbox config to match production execution
      const flags: string[] = [];
      if (this.config.model) {
        flags.push('--model', this.config.model);
      }
      const supportsTracing = this.primaryAgentInstance.meta.supportsSubagentTracing;

      const handle = this.primaryAgentInstance.execute(
        PRIMARY_RECOVERY_TEST_PROMPT,
        [], // No file context for recovery test
        {
          cwd: this.config.cwd,
          timeout: PRIMARY_RECOVERY_TEST_TIMEOUT_MS,
          sandbox: this.config.sandbox,
          flags,
          subagentTracing: supportsTracing,
        }
      );

      const result = await handle.promise;
      const testDurationMs = Date.now() - startTime;

      // Check for rate limit in the test output
      const rateLimitResult = this.rateLimitDetector.detect({
        stderr: result.stderr,
        stdout: result.stdout,
        exitCode: result.exitCode,
        agentId: primaryAgent,
      });

      // Emit recovery attempted event
      const event: AgentRecoveryAttemptedEvent = {
        type: 'agent:recovery-attempted',
        timestamp: new Date().toISOString(),
        primaryAgent,
        fallbackAgent,
        success: !rateLimitResult.isRateLimit && result.status === 'completed',
        testDurationMs,
        rateLimitMessage: rateLimitResult.message,
      };
      this.emit(event);

      if (rateLimitResult.isRateLimit) {
        // Primary still rate limited
        console.log(
          `[recovery] Primary agent '${primaryAgent}' still rate limited: ${rateLimitResult.message ?? 'rate limit detected'}`
        );
        return false;
      }

      if (result.status !== 'completed') {
        // Test failed for other reason (timeout, error, etc.)
        console.log(
          `[recovery] Primary agent test failed with status: ${result.status}`
        );
        return false;
      }

      // Recovery successful - switch back to primary
      console.log(
        `[recovery] Primary agent '${primaryAgent}' recovered! Switching back from '${fallbackAgent}'`
      );
      this.agent = this.primaryAgentInstance;
      this.switchAgent(primaryAgent, 'primary');

      // Clear rate-limited agents tracking since we're back on primary
      this.rateLimitedAgents.clear();

      return true;
    } catch (error) {
      const testDurationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Emit recovery attempted event with failure
      const event: AgentRecoveryAttemptedEvent = {
        type: 'agent:recovery-attempted',
        timestamp: new Date().toISOString(),
        primaryAgent,
        fallbackAgent,
        success: false,
        testDurationMs,
        rateLimitMessage: errorMessage,
      };
      this.emit(event);

      console.log(`[recovery] Primary agent test error: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Legacy method for backward compatibility.
   * Use attemptPrimaryAgentRecovery() instead for full recovery with testing.
   * @deprecated Use attemptPrimaryAgentRecovery() instead
   */
  recoverPrimaryAgent(): boolean {
    if (!this.shouldRecoverPrimaryAgent()) {
      return false;
    }

    // Switch back to primary agent without testing (legacy behavior)
    const primaryAgent = this.state.rateLimitState?.primaryAgent ?? this.config.agent.plugin;
    if (this.primaryAgentInstance) {
      this.agent = this.primaryAgentInstance;
    }
    this.switchAgent(primaryAgent, 'primary');
    return true;
  }

  /**
   * Switch to a fallback agent due to rate limiting.
   * Called when primary agent hits rate limit and max retries exceeded.
   *
   * @param fallbackAgentPlugin - Plugin identifier of the fallback agent
   */
  switchToFallbackAgent(fallbackAgentPlugin: string): void {
    this.switchAgent(fallbackAgentPlugin, 'fallback');
  }

  /**
   * Get the next available fallback agent that hasn't been rate-limited.
   * Returns undefined if no fallback agents are configured or all are rate-limited.
   */
  private getNextFallbackAgent(): string | undefined {
    const fallbackAgents = this.config.agent.fallbackAgents;
    if (!fallbackAgents || fallbackAgents.length === 0) {
      return undefined;
    }

    // Find the first fallback that hasn't been rate-limited
    for (const fallbackPlugin of fallbackAgents) {
      if (!this.rateLimitedAgents.has(fallbackPlugin)) {
        return fallbackPlugin;
      }
    }

    return undefined;
  }

  /**
   * Try to switch to a fallback agent after rate limit exhaustion.
   * Initializes the fallback agent with the same config/options as primary.
   *
   * @param task - Current task being processed
   * @param iteration - Current iteration number
   * @param startedAt - When the iteration started
   * @returns Object indicating whether switch occurred and if all agents are limited
   */
  private async tryFallbackAgent(
    task: TrackerTask,
    _iteration: number,
    _startedAt: Date
  ): Promise<{ switched: boolean; allAgentsLimited: boolean }> {
    while (true) {
      const nextFallback = this.getNextFallbackAgent();

      if (!nextFallback) {
        // No more fallback agents available
        return { switched: false, allAgentsLimited: true };
      }

      try {
        // Create agent config for fallback - inherit options from primary
        const fallbackConfig = {
          name: nextFallback,
          plugin: nextFallback,
          options: { ...this.config.agent.options },
          command: this.config.agent.command,
          defaultFlags: this.config.agent.defaultFlags,
          timeout: this.config.agent.timeout,
        };

        // Get fallback agent instance from registry
        const agentRegistry = getAgentRegistry();
        const fallbackInstance = await agentRegistry.getInstance(fallbackConfig);

        // Verify fallback agent is available
        const detectResult = await fallbackInstance.detect();
        if (!detectResult.available) {
          // Fallback not available - mark as limited and try next
          console.log(
            `[fallback] Agent '${nextFallback}' not available: ${detectResult.error}`
          );
          this.rateLimitedAgents.add(nextFallback);
          continue; // Bug 8: Use loop (continue) instead of recursion
        }

        // Switch to fallback agent
        this.agent = fallbackInstance;
        this.switchToFallbackAgent(nextFallback);

        // Clear rate limit retry count for the task since we're switching agents
        this.clearRateLimitRetryCount(task.id);

        console.log(
          `[fallback] Switched from '${this.config.agent.plugin}' to '${nextFallback}'`
        );

        return { switched: true, allAgentsLimited: false };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[fallback] Failed to initialize fallback agent '${nextFallback}': ${errorMessage}`
        );

        // Mark this fallback as unavailable and try the next one
        this.rateLimitedAgents.add(nextFallback);
        continue; // Bug 8: Use loop (continue) instead of recursion
      }
    }
  }

  /**
   * Build a completion summary string for the iteration.
   * Returns a human-readable summary when agent switches occurred.
   *
   * @param result - The iteration result
   * @returns Completion summary string or undefined if no switches occurred
   */
  private buildCompletionSummary(result: IterationResult): string | undefined {
    // No switches during this iteration - no special summary needed
    if (this.currentIterationAgentSwitches.length === 0) {
      return undefined;
    }

    const currentAgent = this.state.activeAgent?.plugin ?? this.config.agent.plugin;
    const statusWord = result.taskCompleted ? 'Completed' : result.status === 'failed' ? 'Failed' : 'Finished';

    // Check if we're on a fallback agent
    const lastSwitch = this.currentIterationAgentSwitches[this.currentIterationAgentSwitches.length - 1];
    if (lastSwitch && lastSwitch.reason === 'fallback') {
      return `${statusWord} on fallback (${currentAgent}) due to rate limit`;
    }

    // Check if we recovered to primary during this iteration
    if (lastSwitch && lastSwitch.reason === 'primary') {
      const fallbackSwitches = this.currentIterationAgentSwitches.filter(s => s.reason === 'fallback');
      if (fallbackSwitches.length > 0) {
        const fallbackAgent = fallbackSwitches[0].to;
        return `${statusWord} on primary after recovering from fallback (${fallbackAgent})`;
      }
      return `${statusWord} on primary (${currentAgent}) after recovery`;
    }

    // Generic summary for other cases
    return `${statusWord} with ${this.currentIterationAgentSwitches.length} agent switch(es)`;
  }

  /**
      * Clear rate-limited agents tracking.
      * Called when a task completes successfully to allow agents to be used again.
      */
  private clearRateLimitedAgents(): void {
    this.rateLimitedAgents.clear();
  }

  /**
    * Execute a git command and return the result.
    *
    * @param args - Git command arguments
    * @returns Object with stdout, stderr, and exitCode
    */
  private execGit(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['-C', this.config.cwd, ...args], {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        resolve({ stdout, stderr, exitCode: code ?? 1 });
      });

      proc.on('error', (err: Error) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 });
      });
    });
  }

  /**
    * Check if the repository has uncommitted changes.
    * Returns true if there are changes that need to be committed.
    */
  private async isRepoDirty(): Promise<boolean> {
    const status = await this.execGit(['status', '--porcelain']);
    const relevant = this.filterRelevantStatusLines(status.stdout);
    return relevant.length > 0;
  }

  /**
    * Get the list of changed files in the repository.
    * Filters out .beads, .ralph-tui, and worktrees directories.
    */
  private async getChangedFiles(): Promise<string[]> {
    const status = await this.execGit(['status', '--porcelain']);
    return this.filterRelevantStatusLines(status.stdout);
  }

  /**
    * Filter git status output to relevant files.
    * Excludes .beads, .ralph-tui, and worktrees directories.
    */
  private filterRelevantStatusLines(statusOutput: string): string[] {
    return statusOutput
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        // Bug 12: Porcelain status lines MUST NOT be trimmed before slicing.
        // Format is: XY PATH (where X, Y are 1char status each, followed by space)
        // Path starts at index 3.
        const path = line.slice(3).trim();
        return { line, path };
      })
      .filter(({ path }) => {
        return (
          path &&
          !(
            path.startsWith('.beads/') ||
            path.startsWith('.ralph-tui/') ||
            path.startsWith('worktrees/')
          )
        );
      })
      .map(({ path }) => path);
  }

  /**
    * Format the output tail for inclusion in recovery prompt.
    * Extracts the last N lines, limited to max characters.
    */
  private formatOutputTail(output: string, maxLines = RECOVERY_TAIL_MAX_LINES, maxChars = RECOVERY_TAIL_MAX_CHARS): string {
    const lines = output.split('\n');
    const tailLines = lines.slice(-maxLines);
    const tail = tailLines.join('\n');
    if (tail.length <= maxChars) {
      return tail;
    }
    return tail.slice(-maxChars);
  }

  /**
    * Build a recovery prompt with the standard task prompt plus recovery context.
    * Called when agent signals completion but repo is dirty.
    *
    * @param task - The task being recovered
    * @param basePrompt - The original prompt that was sent (used to extract worktree-specific sections)
    * @param changedFiles - List of changed files
    * @param stdoutTail - Last N lines of stdout for context
    * @returns Recovery prompt string with full task context + recovery sections
    */
  private async buildRecoveryPrompt(
    basePrompt: string,
    changedFiles: string[],
    stdoutTail: string
  ): Promise<string> {
    // Fix 3: Reuse basePrompt instead of rebuilding it twice
    const taskPrompt = basePrompt;

    // Extract worktree-specific instructions from basePrompt if present
    // These need to be adapted for recovery context
    const worktreeSection = this.extractWorktreeSection(basePrompt);
    const adaptedWorktreeSection = worktreeSection
      ?.replace('After finishing, ensure your changes are committed in THIS worktree.', '')
      .replace('The coordinator will cherry-pick your commit into main.', '')
      .trim();

    // Build recovery sections
    const recoveryLines: string[] = [];

    recoveryLines.push('');
    recoveryLines.push('## Recovery Context');
    recoveryLines.push('- Previous iteration reported <promise>COMPLETE</promise> but there are uncommitted changes.');
    recoveryLines.push('');
    recoveryLines.push('Changed files (git status --porcelain):');
    if (changedFiles.length > 0) {
      for (const file of changedFiles) {
        recoveryLines.push(`- ${file}`);
      }
    } else {
      recoveryLines.push('- (none)');
    }
    recoveryLines.push('');
    recoveryLines.push('Last iteration stdout (tail):');
    recoveryLines.push('```');
    recoveryLines.push(stdoutTail || '(no output)');
    recoveryLines.push('```');
    recoveryLines.push('');

    recoveryLines.push('## Recovery Instructions');
    recoveryLines.push('- Review the changed files above');
    recoveryLines.push('- If anything is missing, finish it before committing');
    recoveryLines.push('- If no changes are needed, revert to a clean working tree (no commit)');
    recoveryLines.push('- Commit message format: "<task-id>: <short title>"');
    recoveryLines.push('- Do NOT run `git add .` or `git add -A`. Stage only relevant task files');
    recoveryLines.push('- Do NOT stage or commit `.ralph-tui/progress.md` (local-only context file)');
    recoveryLines.push('- Do NOT merge, rebase, or push unless explicitly asked');
    recoveryLines.push('');

    // Add worktree-specific guidance if applicable
    if (adaptedWorktreeSection) {
      recoveryLines.push('## Worktree Context');
      recoveryLines.push(adaptedWorktreeSection);
      recoveryLines.push('');
    }

    recoveryLines.push('When done and changes are committed, output: <promise>COMPLETE</promise>');

    return taskPrompt + recoveryLines.join('\n');
  }

  /**
    * Extract the worktree-specific instructions section from a prompt.
    * Looks for the "## Worktree + Merge Phase" section.
    */
  private extractWorktreeSection(prompt: string): string | undefined {
    const worktreeMatch = prompt.match(/## Worktree \+ Merge Phase[\s\S]*?(?=##|$)/);
    return worktreeMatch ? worktreeMatch[0] : undefined;
  }

  /**
    * Run commit recovery for a task.
    * Called when agent signals completion but repo is dirty or no commits were made.
    *
    * @param task - The task to recover
    * @param iteration - Current iteration number
    * @param stdout - The stdout from the original agent execution
    * @returns Recovery result indicating success or failure
    */
  private async runCommitRecovery(
    task: TrackerTask,
    iteration: number,
    stdout: string,
    basePrompt: string
  ): Promise<{ success: boolean; recoveryCount: number; reason?: string }> {
    const currentAttempts = this.commitRecoveryAttempts.get(task.id) ?? 0;

    // Check if we've exceeded max recovery attempts
    if (currentAttempts >= COMMIT_RECOVERY_MAX_RETRIES) {
      // Max attempts exceeded - block the task
      const reason = `Max commit recovery attempts (${COMMIT_RECOVERY_MAX_RETRIES}) exceeded. Repository still has uncommitted changes.`;
      console.log(`[commit-recovery] ${reason}`);

      // Emit task blocked event
      this.emit({
        type: 'task:blocked',
        timestamp: new Date().toISOString(),
        task,
        reason,
        recoveryAttemptCount: currentAttempts,
      });

      // Clear recovery tracking for this task
      this.commitRecoveryAttempts.delete(task.id);

      return { success: false, recoveryCount: currentAttempts, reason };
    }

    // Get changed files and stdout tail
    const changedFiles = await this.getChangedFiles();
    const stdoutTail = this.formatOutputTail(stdout);

    // Increment recovery attempt count
    this.commitRecoveryAttempts.set(task.id, currentAttempts + 1);
    const attemptNumber = currentAttempts + 1;

    console.log(
      `[commit-recovery] Attempt ${attemptNumber}/${COMMIT_RECOVERY_MAX_RETRIES + 1} for task ${task.id} (${changedFiles.length} changed files)`
    );

    // Emit recovery event
    const recoveryEvent: import('./types.js').IterationCommitRecoveryEvent = {
      type: 'iteration:commit-recovery',
      timestamp: new Date().toISOString(),
      iteration,
      task,
      retryAttempt: attemptNumber,
      maxRetries: COMMIT_RECOVERY_MAX_RETRIES,
      reason: changedFiles.length > 0 ? 'uncommitted changes' : 'no commits',
      changedFiles,
      stdoutTail,
    };
    this.emit(recoveryEvent);

    // Build recovery prompt (reuses basePrompt sections)
    const recoveryPrompt = await this.buildRecoveryPrompt(basePrompt, changedFiles, stdoutTail);

    // Run agent with recovery prompt
    const result = await this.executeAgentWithPrompt(recoveryPrompt, task);

    // Log recovery attempt result
    const recoveryPromiseComplete = PROMISE_COMPLETE_PATTERN.test(result.stdout);
    if (recoveryPromiseComplete) {
      console.log(`[commit-recovery] Agent signaled COMPLETE, checking repo status...`);
    }

    // Check if recovery was successful
    const repoClean = !(await this.isRepoDirty());
    if (repoClean) {
      // Recovery successful - clear tracking and complete
      console.log(`[commit-recovery] Recovery successful for task ${task.id}`);
      this.commitRecoveryAttempts.delete(task.id);
      return { success: true, recoveryCount: attemptNumber };
    }

    // Still dirty - check if we should retry
    if (currentAttempts < COMMIT_RECOVERY_MAX_RETRIES) {
      // Will retry on next call
      return { success: false, recoveryCount: attemptNumber };
    }

    // Max attempts exceeded - block the task
    const finalReason = `Max commit recovery attempts (${COMMIT_RECOVERY_MAX_RETRIES}) exceeded. Repository still has uncommitted changes.`;
    console.log(`[commit-recovery] ${finalReason}`);

    // Emit task blocked event
    this.emit({
      type: 'task:blocked',
      timestamp: new Date().toISOString(),
      task,
      reason: finalReason,
      recoveryAttemptCount: attemptNumber,
    });

    // Clear recovery tracking for this task
    this.commitRecoveryAttempts.delete(task.id);

    return { success: false, recoveryCount: attemptNumber, reason: finalReason };
  }

  /**
    * Execute the agent with a given prompt.
    * Helper method used by commit recovery.
    */
  private async executeAgentWithPrompt(prompt: string, _task: TrackerTask): Promise<import('../plugins/agents/types.js').AgentExecutionResult> {
    const flags: string[] = [];
    if (this.config.model) {
      flags.push('--model', this.config.model);
    }

    const handle = this.agent!.execute(prompt, [], {
      cwd: this.config.cwd,
      flags,
      sandbox: this.config.sandbox,
    });

    const result = await handle.promise;
    return result;
  }

  /**
    * Check if commit recovery is needed for a task.
    * Called after agent signals completion.
    *
    * @param _task - The completed task (reserved for future use)
    * @param stdout - Agent stdout
    * @returns true if recovery should be attempted
    */
  private async needsCommitRecovery(_task: TrackerTask, stdout: string): Promise<boolean> {
    // Only check for recovery if <promise>COMPLETE</promise> was detected
    if (!PROMISE_COMPLETE_PATTERN.test(stdout)) {
      return false;
    }

    // Check if repo is dirty
    return this.isRepoDirty();
  }

  /**
   * Sync the main branch using fast-forward only merge from the worktree.
   * Returns { success: true, commit } if sync succeeded.
   * Returns { success: false, reason } if sync was skipped or failed.
   */
  private async syncMainBranch(): Promise<{ success: boolean; reason?: string; commit?: string }> {
    if (!this.mainSyncWorktree) {
      return { success: false, reason: 'Main sync worktree not initialized' };
    }

    try {
      const headResult = await this.execGit(['rev-parse', 'HEAD']);
      if (headResult.exitCode !== 0) {
        return { success: false, reason: headResult.stderr.trim() || 'Failed to resolve HEAD' };
      }

      const headCommit = headResult.stdout.trim();
      const syncResult = await this.mainSyncWorktree.fastForwardTo(headCommit);

      if (!syncResult.success) {
        // Sync failed or was skipped
        const reason = syncResult.error ?? 'Unknown sync failure';

        // Emit appropriate event based on the structured error code
        switch (syncResult.code) {
          case 'FETCH_FAILED':
            this.emit({
              type: 'main-sync-failed',
              timestamp: new Date().toISOString(),
              task: this.state.currentTask ?? undefined,
              reason: `Fetch failed: ${syncResult.error}`,
            });
            break;
          case 'FAST_FORWARD_FAILED':
            this.emit({
              type: 'main-sync-failed',
              timestamp: new Date().toISOString(),
              task: this.state.currentTask ?? undefined,
              reason: `Merge failed: ${syncResult.error}`,
            });
            break;
          default:
            this.emit({
              type: 'main-sync-skipped',
              timestamp: new Date().toISOString(),
              reason,
            });
        }

        return { success: false, reason };
      }

      // Sync succeeded
      if (syncResult.updated) {
        this.emit({
          type: 'main-sync-succeeded',
          timestamp: new Date().toISOString(),
          commit: syncResult.currentCommit,
        });
      } else {
        // No updates but still successful (already at main)
        this.emit({
          type: 'main-sync-succeeded',
          timestamp: new Date().toISOString(),
          commit: syncResult.currentCommit,
        });
      }

      return { success: true, commit: syncResult.currentCommit };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      this.emit({
        type: 'main-sync-failed',
        timestamp: new Date().toISOString(),
        task: this.state.currentTask ?? undefined,
        reason,
      });
      return { success: false, reason };
    }
  }

  /**
   * Try to sync pending main sync tasks.
   * Called periodically when there are pending tasks.
   * Implements exponential backoff retry with alert on max retries.
   */
  private async trySyncPendingMainTasks(): Promise<void> {
    if (this.pendingMainSyncTasks.size === 0) {
      // Reset retry count and alert flag when no pending tasks
      this.pendingMainSyncRetryCount = 0;
      this.mainSyncAlertEmitted = false;
      return;
    }

    const now = Date.now();
    // Calculate exponential backoff: start at 2s, double each retry, cap at 30s
    const baseDelayMs = 2000;
    const maxDelayMs = 30000;
    const backoffMs = Math.min(baseDelayMs * Math.pow(2, this.pendingMainSyncRetryCount), maxDelayMs);

    // Rate limit sync attempts based on backoff
    if (now - this.lastMainSyncAttemptAt < backoffMs) {
      return;
    }

    this.lastMainSyncAttemptAt = now;

    // Increment retry count (will be reset on success)
    this.pendingMainSyncRetryCount++;

    const result = await this.syncMainBranch();

    if (result.success) {
      // Reset retry count on success
      this.pendingMainSyncRetryCount = 0;
      await this.completePendingMainSyncTasks();
    } else if (this.pendingMainSyncRetryCount <= this.maxMainSyncRetries) {
      // Emit retrying event with backoff info
      const nextDelayMs = Math.min(
        baseDelayMs * Math.pow(2, this.pendingMainSyncRetryCount),
        maxDelayMs
      );
      this.emit({
        type: 'main-sync-retrying',
        timestamp: new Date().toISOString(),
        retryAttempt: this.pendingMainSyncRetryCount,
        maxRetries: this.maxMainSyncRetries,
        reason: result.reason ?? 'Unknown sync failure',
        delayMs: nextDelayMs,
      });
    } else if (!this.mainSyncAlertEmitted) {
      // Max retries reached - emit alert (only once to prevent spam)
      this.mainSyncAlertEmitted = true;
      const affectedTasks = Array.from(this.pendingMainSyncTasks.values()).map((e) => e.task);
      this.emit({
        type: 'main-sync-alert',
        timestamp: new Date().toISOString(),
        retryAttempt: this.pendingMainSyncRetryCount,
        maxRetries: this.maxMainSyncRetries,
        reason: result.reason ?? 'Unknown sync failure',
        affectedTaskCount: affectedTasks.length,
      });
    }
  }

  /**
   * Get commits that are ahead of main branch (pending to merge).
   * Used for pending-main tracking when main sync fails.
   *
   * @returns Object with count and array of commit SHAs
   */
  private async getPendingMainCommits(): Promise<{ count: number; commits: string[] }> {
    try {
      // Get the list of commits between main and current HEAD
      const result = await this.execGit(['rev-list', '--reverse', 'main..HEAD']);
      if (result.exitCode !== 0 || !result.stdout.trim()) {
        return { count: 0, commits: [] };
      }

      const commits = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      return { count: commits.length, commits };
    } catch {
      return { count: 0, commits: [] };
    }
  }

  /**
   * Complete all tasks that were pending main sync.
   * Called after a successful main sync.
   * Uses clearPendingMain to properly clear the pending-main status in the tracker.
   */
  private async completePendingMainSyncTasks(): Promise<void> {
    if (!this.tracker || this.pendingMainSyncTasks.size === 0) {
      return;
    }

    for (const [taskId, entry] of this.pendingMainSyncTasks) {
      // Clear the pending-main status in the tracker (if supported)
      if ('clearPendingMain' in this.tracker && typeof this.tracker.clearPendingMain === 'function') {
        await this.tracker.clearPendingMain(taskId, 'Commits merged to main');
      }
      // Complete the task
      await this.tracker.completeTask(taskId, 'Completed after main sync');
      await this.tracker.releaseTask?.(taskId, entry.workerId);
    }

    this.pendingMainSyncTasks.clear();
  }

  /**
   * Dispose of engine resources
   */
  async dispose(): Promise<void> {
    await this.stop();
    if (this.trackerRealtimeWatcher) {
      this.trackerRealtimeWatcher.stop();
      this.trackerRealtimeWatcher = null;
    }
    this.listeners = [];
  }
}

// Re-export types
export type {
  ActiveAgentReason,
  ActiveAgentState,
  AgentRecoveryAttemptedEvent,
  AgentSwitchedEvent,
  AllAgentsLimitedEvent,
  EngineEvent,
  EngineEventListener,
  EngineState,
  EngineStatus,
  EngineSubagentState,
  ErrorHandlingConfig,
  ErrorHandlingStrategy,
  IterationRateLimitedEvent,
  IterationResult,
  IterationStatus,
  RateLimitState,
  SubagentTreeNode,
};

// Re-export rate limit detector
export {
  RateLimitDetector,
  type RateLimitDetectionResult,
  type RateLimitDetectionInput,
} from './rate-limit-detector.js';

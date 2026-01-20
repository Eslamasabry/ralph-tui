# Parallel Execution Handler - TUI-Only Implementation Plan

**Generated:** 2026-01-20  
**Feature:** Parallel task execution controlled entirely via TUI

---

## Overview

Add parallel task execution with all controls inside the TUI interface. No CLI flags or config file changes required - users toggle and configure parallel mode through UI.

### TUI-Only Controls
- **Toggle button** in Header or Footer to enable/disable parallel mode
- **Worker count slider** in Settings view or a new Settings tab
- **Worker status panel** showing active workers and their tasks
- **Start/Stop** workers from the parallel panel

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ParallelExecutionEngine                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Task Queue  │  │ Worker Pool │  │ Event Aggregator        │  │
│  │ (Priority)  │─▶│ (N workers) │─▶│ (Per-task + Global)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                                             │         │
│         ▼                                             ▼         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    ParallelTUIState                      │    │
│  │  activeTasks: Map<taskId, ParallelTaskState>            │    │
│  │  completedTasks, failedTasks, totalProgress              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Engine Events
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                           TUI Interface                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Header: Add parallel indicator [⚡ 2/3 workers]         │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌───────────────────────┐ ┌───────────────────────────────┐    │
│  │ LeftPanel             │ │ RightPanel                     │    │
│  │ - Task list           │ │ - Output tabs                  │    │
│  │ - Worker badges       │ │ - Worker output streams        │    │
│  │ - Progress per worker │ │ - Worker selection             │    │
│  └───────────────────────┘ └───────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Settings View:                                          │    │
│  │ □ Enable Parallel Mode [toggle]                        │    │
│  │   Workers: [−] 3 [+] (1-10)                            │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend Implementation Plan

### Phase 1: Core Types & Interfaces

#### 1.1 New Types (`src/engine/types.ts`)

```typescript
/**
 * Parallel execution mode
 * - 'sequential': Original single-task mode (default)
 * - 'parallel': Run multiple tasks concurrently
 */
export type ExecutionMode = 'sequential' | 'parallel';

/**
 * Configuration for parallel execution
 */
export interface ParallelExecutionConfig {
  /** Number of concurrent workers (1 = sequential, N = parallel) */
  maxConcurrency: number;
  
  /** Whether parallel mode is currently enabled */
  enabled: boolean;
  
  /** Max tasks per worker before restart (prevents memory leaks) */
  tasksPerWorker: number;
  
  /** Whether to respect task dependencies in parallel mode */
  respectDependencies: boolean;
}

/**
 * State of a single parallel task execution
 */
export interface ParallelTaskState {
  taskId: string;
  workerId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: string | null;
  endedAt: string | null;
  output: string;
  stderr: string;
  agent: string;
  progress: number; // 0-100 estimate
  error?: string;
}

/**
 * Worker state for TUI display
 */
export interface WorkerState {
  workerId: string;
  taskId: string | null;
  status: 'idle' | 'running' | 'error' | 'stopping';
  startedAt: string | null;
  lastActivity: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  currentOutput: string;
}

/**
 * Extended engine state for parallel execution
 */
export interface ParallelEngineState extends EngineState {
  /** Current execution mode */
  mode: ExecutionMode;
  
  /** Parallel execution configuration */
  parallelConfig: ParallelExecutionConfig;
  
  /** All active parallel task states */
  activeTasks: Map<string, ParallelTaskState>;
  
  /** Worker states for TUI display */
  workers: Map<string, WorkerState>;
  
  /** Number of running workers */
  activeWorkers: number;
  
  /** Total tasks started (including retries) */
  totalTasksStarted: number;
  
  /** Tasks that failed permanently */
  failedTaskIds: Set<string>;
}

/**
 * Parallel execution events
 */
export type ParallelEngineEventType =
  | 'parallel:mode-changed'
  | 'parallel:config-changed'
  | 'parallel:started'
  | 'parallel:stopped'
  | 'parallel:worker-started'
  | 'parallel:worker-stopped'
  | 'parallel:worker-error'
  | 'parallel:task-assigned'
  | 'parallel:task-started'
  | 'parallel:task-completed'
  | 'parallel:task-output'
  | 'parallel:all-complete'
  | 'parallel:progress';

export interface ParallelModeChangedEvent extends EngineEventBase {
  type: 'parallel:mode-changed';
  previousMode: ExecutionMode;
  newMode: ExecutionMode;
}

export interface ParallelConfigChangedEvent extends EngineEventBase {
  type: 'parallel:config-changed';
  config: ParallelExecutionConfig;
}

export interface ParallelWorkerStartedEvent extends EngineEventBase {
  type: 'parallel:worker-started';
  workerId: string;
}

export interface ParallelTaskAssignedEvent extends EngineEventBase {
  type: 'parallel:task-assigned';
  workerId: string;
  taskId: string;
}

export interface ParallelProgressEvent extends EngineEventBase {
  type: 'parallel:progress';
  activeCount: number;
  completedCount: number;
  failedCount: number;
  totalProgress: number; // 0-100
}
```

### Phase 2: Worker Pool Implementation

#### 2.1 Worker Class (`src/engine/worker.ts`)

```typescript
/**
 * ABOUTME: Worker thread for parallel task execution.
 * Handles single task execution with proper cleanup.
 */

import type { TrackerTask, TrackerPlugin } from '../plugins/trackers/types.js';
import type { AgentPlugin, AgentExecutionHandle } from '../plugins/agents/types.js';
import type { RalphConfig } from '../config/types.js';
import type { ParallelTaskState } from './types.js';

export interface WorkerOptions {
  workerId: string;
  config: RalphConfig;
  tracker: TrackerPlugin;
  agent: AgentPlugin;
  onTaskStart?: (task: TrackerTask) => void;
  onTaskOutput?: (taskId: string, data: string, stream: 'stdout' | 'stderr') => void;
  onTaskComplete?: (result: TaskExecutionResult) => void;
  onTaskError?: (error: Error) => void;
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  output: string;
  stderr: string;
  durationMs: number;
  error?: string;
  completed: boolean;
}

export class Worker {
  readonly workerId: string;
  private config: RalphConfig;
  private tracker: TrackerPlugin;
  private agent: AgentPlugin;
  private currentExecution: AgentExecutionHandle | null = null;
  private shouldStop = false;
  private currentTask: TrackerTask | null = null;
  
  // State for TUI
  public status: 'idle' | 'running' | 'error' | 'stopping' = 'idle';
  public tasksCompleted = 0;
  public tasksFailed = 0;
  public currentOutput = '';
  
  constructor(options: WorkerOptions) {
    this.workerId = options.workerId;
    this.config = options.config;
    this.tracker = options.tracker;
    this.agent = options.agent;
  }
  
  getState(): WorkerState {
    return {
      workerId: this.workerId,
      taskId: this.currentTask?.id ?? null,
      status: this.status,
      startedAt: null, // Set when first task starts
      lastActivity: new Date().toISOString(),
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      currentOutput: this.currentOutput,
    };
  }
  
  async executeTask(task: TrackerTask): Promise<TaskExecutionResult> {
    const startedAt = Date.now();
    this.shouldStop = false;
    this.currentTask = task;
    this.status = 'running';
    
    try {
      // Build prompt (reuse from main engine)
      const prompt = await this.buildPrompt(task);
      
      // Execute agent
      const handle = this.agent.execute(prompt, [], {
        cwd: this.config.cwd,
        flags: this.config.model ? ['--model', this.config.model] : [],
        sandbox: this.config.sandbox,
        onStdout: (data) => {
          this.currentOutput += data;
          this.onTaskOutput?.(task.id, data, 'stdout');
        },
        onStderr: (data) => {
          this.currentOutput += data;
          this.onTaskOutput?.(task.id, data, 'stderr');
        },
      });
      
      this.currentExecution = handle;
      const result = await handle.promise;
      
      // Check completion
      const completed = /<promise>\s*COMPLETE\s*<\/promise>/i.test(result.stdout);
      
      if (completed) {
        await this.tracker.completeTask(task.id, 'Completed by agent');
        this.tasksCompleted++;
      }
      
      return {
        taskId: task.id,
        success: true,
        output: result.stdout,
        stderr: result.stderr,
        durationMs: Date.now() - startedAt,
        completed,
      };
    } catch (error) {
      this.tasksFailed++;
      return {
        taskId: task.id,
        success: false,
        output: this.currentOutput,
        stderr: '',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        completed: false,
      };
    } finally {
      this.status = 'idle';
      this.currentTask = null;
      this.currentExecution = null;
    }
  }
  
  private async buildPrompt(task: TrackerTask): Promise<string> {
    // Simplified - in production, reuse buildPrompt from index.ts
    return `## Task\n**ID**: ${task.id}\n**Title**: ${task.title}\n\n## Instructions\nComplete the task. Signal completion with: <promise>COMPLETE</promise>`;
  }
  
  interrupt(): void {
    this.shouldStop = true;
    this.currentExecution?.interrupt();
    this.status = 'stopping';
  }
  
  dispose(): void {
    this.interrupt();
  }
}
```

### Phase 3: Parallel Engine

#### 3.1 ParallelExecutionEngine Class (`src/engine/parallel.ts`)

```typescript
/**
 * ABOUTME: Parallel execution engine for concurrent task processing.
 * Controlled entirely via TUI events - no CLI dependencies.
 */

import type {
  ParallelEngineState,
  ParallelExecutionConfig,
  ParallelTaskState,
  ParallelEngineEvent,
  ExecutionMode,
  WorkerState,
} from './types.js';
import type { TrackerTask } from '../plugins/trackers/types.js';
import type { RalphConfig } from '../config/types.js';
import { Worker, type TaskExecutionResult } from './worker.js';

export interface ParallelEngineOptions {
  config: RalphConfig;
  initialConfig?: Partial<ParallelExecutionConfig>;
}

export class ParallelExecutionEngine {
  private config: RalphConfig;
  private state: ParallelEngineState;
  private workers: Map<string, Worker> = new Map();
  private taskQueue: TrackerTask[] = [];
  private shouldStop = false;
  private eventListeners: Set<(event: ParallelEngineEvent) => void> = new Set();
  
  constructor(options: ParallelEngineOptions) {
    this.config = options.config;
    this.state = this.createInitialState(options.initialConfig);
  }
  
  private createInitialState(overrides?: Partial<ParallelExecutionConfig>): ParallelEngineState {
    const parallelConfig: ParallelExecutionConfig = {
      enabled: false, // Disabled by default
      maxConcurrency: 2,
      tasksPerWorker: 10,
      respectDependencies: true,
      ...overrides,
    };
    
    return {
      status: 'idle',
      mode: 'sequential',
      parallelConfig,
      currentTask: null,
      currentIteration: 0,
      currentOutput: '',
      currentStderr: '',
      totalTasks: 0,
      tasksCompleted: 0,
      iterations: [],
      startedAt: null,
      activeTasks: new Map(),
      workers: new Map(),
      activeWorkers: 0,
      totalTasksStarted: 0,
      failedTaskIds: new Set(),
      skippedDueToDependencies: new Set(),
      subagents: new Map(),
      activeAgent: null,
      rateLimitState: null,
    };
  }
  
  // ========== TUI Control Methods ==========
  
  /**
   * Toggle parallel mode on/off (called from TUI)
   */
  async toggleParallelMode(): Promise<void> {
    const newMode: ExecutionMode = this.state.parallelConfig.enabled ? 'sequential' : 'parallel';
    const previousMode = this.state.mode;
    
    if (newMode === 'parallel') {
      await this.enableParallelMode();
    } else {
      await this.disableParallelMode();
    }
    
    this.emit({
      type: 'parallel:mode-changed',
      timestamp: new Date().toISOString(),
      previousMode,
      newMode,
    });
  }
  
  /**
   * Set worker count (called from TUI Settings)
   */
  setWorkerCount(count: number): void {
    const clampedCount = Math.max(1, Math.min(10, count));
    
    if (clampedCount === this.state.parallelConfig.maxConcurrency) {
      return; // No change
    }
    
    this.state.parallelConfig.maxConcurrency = clampedCount;
    
    // Adjust worker pool if increasing
    this.adjustWorkerPool();
    
    this.emit({
      type: 'parallel:config-changed',
      timestamp: new Date().toISOString(),
      config: this.state.parallelConfig,
    });
  }
  
  /**
   * Start parallel execution (called from TUI)
   */
  async start(): Promise<void> {
    if (!this.state.parallelConfig.enabled) {
      throw new Error('Parallel mode is not enabled');
    }
    
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start in ${this.state.status} state`);
    }
    
    this.state.status = 'running';
    this.state.startedAt = new Date().toISOString();
    this.shouldStop = false;
    
    // Ensure workers are created
    await this.initializeWorkers();
    
    this.emit({
      type: 'parallel:started',
      timestamp: new Date().toISOString(),
    });
    
    await this.distributeTasks();
  }
  
  /**
   * Stop parallel execution (called from TUI)
   */
  async stop(): Promise<void> {
    this.shouldStop = true;
    this.state.status = 'stopping';
    
    // Interrupt all workers
    for (const worker of this.workers.values()) {
      worker.interrupt();
    }
    
    // Wait for workers to stop
    await this.waitForWorkersStopped();
    
    this.state.status = 'idle';
    this.emit({
      type: 'parallel:stopped',
      timestamp: new Date().toISOString(),
    });
  }
  
  // ========== Event System ==========
  
  on(listener: (event: ParallelEngineEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }
  
  private emit(event: ParallelEngineEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }
  
  // ========== Getters ==========
  
  getState(): Readonly<ParallelEngineState> {
    return { ...this.state };
  }
  
  getConfig(): Readonly<ParallelExecutionConfig> {
    return { ...this.state.parallelConfig };
  }
  
  getWorkerStates(): WorkerState[] {
    return Array.from(this.workers.values()).map(w => w.getState());
  }
  
  // ========== Private Methods ==========
  
  private async enableParallelMode(): Promise<void> {
    this.state.mode = 'parallel';
  }
  
  private async disableParallelMode(): Promise<void> {
    // Stop any running workers first
    if (this.state.status === 'running') {
      await this.stop();
    }
    this.state.mode = 'sequential';
    this.workers.clear();
  }
  
  private async initializeWorkers(): Promise<void> {
    if (this.workers.size > 0) return;
    
    const { maxConcurrency } = this.state.parallelConfig;
    
    for (let i = 0; i < maxConcurrency; i++) {
      const worker = await this.createWorker(`worker-${i + 1}`);
      this.workers.set(worker.workerId, worker);
    }
  }
  
  private async createWorker(workerId: string): Promise<Worker> {
    // Get agent and tracker instances
    const agent = await this.getAgentInstance();
    const tracker = await this.getTrackerInstance();
    
    return new Worker({
      workerId,
      config: this.config,
      tracker,
      agent,
      onTaskOutput: (taskId, data, stream) => {
        this.emit({
          type: 'parallel:task-output',
          timestamp: new Date().toISOString(),
          workerId,
          taskId,
          data,
          stream,
        });
      },
      onTaskComplete: (result, workerId) => {
        this.handleTaskComplete(result, workerId);
      },
    });
  }
  
  private adjustWorkerPool(): void {
    const target = this.state.parallelConfig.maxConcurrency;
    const current = this.workers.size;
    
    if (target > current) {
      // Add workers
      for (let i = current; i < target; i++) {
        this.createWorker(`worker-${i + 1}`).then(w => {
          this.workers.set(w.workerId, w);
        });
      }
    } else if (target < current) {
      // Remove excess workers (mark them for cleanup)
      const ids = Array.from(this.workers.keys());
      for (let i = target; i < current; i++) {
        const worker = this.workers.get(ids[i]);
        if (worker) {
          worker.dispose();
          this.workers.delete(ids[i]);
        }
      }
    }
  }
  
  private async distributeTasks(): Promise<void> {
    while (!this.shouldStop) {
      // Check for free workers
      const freeWorkers = Array.from(this.workers.values())
        .filter(w => w.status === 'idle');
      
      if (freeWorkers.length === 0) {
        await this.waitForWorkerComplete();
        continue;
      }
      
      // Get next task
      const task = await this.getNextTask();
      if (!task) {
        if (this.state.activeWorkers === 0) {
          break; // No more tasks and no active workers
        }
        await this.waitForWorkerComplete();
        continue;
      }
      
      // Assign to first free worker
      const worker = freeWorkers[0];
      await this.assignTaskToWorker(worker, task);
    }
    
    await this.shutdown();
  }
  
  private async assignTaskToWorker(worker: Worker, task: TrackerTask): Promise<void> {
    this.state.activeWorkers++;
    
    this.emit({
      type: 'parallel:task-assigned',
      timestamp: new Date().toISOString(),
      workerId: worker.workerId,
      taskId: task.id,
    });
    
    await worker.executeTask(task);
  }
  
  private handleTaskComplete(result: TaskExecutionResult, workerId: string): void {
    this.state.activeWorkers--;
    this.state.totalTasksStarted++;
    
    if (result.completed) {
      this.state.tasksCompleted++;
    } else if (!result.success) {
      this.state.failedTaskIds.add(result.taskId);
    }
    
    this.emit({
      type: 'parallel:task-completed',
      timestamp: new Date().toISOString(),
      workerId,
      taskId: result.taskId,
      success: result.success,
      durationMs: result.durationMs,
    });
    
    this.emitProgress();
  }
  
  private emitProgress(): void {
    const total = this.state.totalTasks;
    const completed = this.state.tasksCompleted;
    const failed = this.state.failedTaskIds.size;
    const progress = total > 0 ? ((completed + failed) / total) * 100 : 0;
    
    this.emit({
      type: 'parallel:progress',
      timestamp: new Date().toISOString(),
      activeCount: this.state.activeWorkers,
      completedCount: completed,
      failedCount: failed,
      totalProgress: progress,
    });
  }
  
  private async getNextTask(): Promise<TrackerTask | null> {
    // Get from tracker
    const tracker = await this.getTrackerInstance();
    return await tracker.getNextTask({ status: ['open', 'in_progress'] });
  }
  
  private async waitForWorkerComplete(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.shouldStop || this.state.activeWorkers === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
  
  private async waitForWorkersStopped(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        const allStopped = Array.from(this.workers.values())
          .every(w => w.status !== 'running');
        if (allStopped) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
  
  private async shutdown(): Promise<void> {
    // Emit completion
    this.emit({
      type: 'parallel:all-complete',
      timestamp: new Date().toISOString(),
      totalCompleted: this.state.tasksCompleted,
      totalFailed: this.state.failedTaskIds.size,
    });
  }
  
  // Placeholder methods - would use actual plugin system
  private async getAgentInstance() { /* ... */ }
  private async getTrackerInstance() { /* ... */ }
}
```

---

## Frontend Implementation Plan

### Phase 4: TUI Types Update

#### 4.1 Extended Types (`src/tui/types.ts`)

```typescript
/**
 * Parallel execution state for TUI
 */
export interface ParallelExecutionState {
  /** Whether parallel mode is enabled */
  enabled: boolean;
  
  /** Number of workers configured */
  workerCount: number;
  
  /** Worker states for display */
  workers: WorkerDisplayState[];
  
  /** Task-to-worker assignments */
  taskWorkerMap: Map<string, string>;
  
  /** Overall progress */
  progress: {
    active: number;
    completed: number;
    failed: number;
    total: number;
  };
}

/**
 * Worker display state
 */
export interface WorkerDisplayState {
  workerId: string;
  taskId: string | null;
  taskTitle: string | null;
  status: 'idle' | 'running' | 'error';
  progress: number; // 0-100
  output?: string;
}

/**
 * Settings panel state
 */
export interface SettingsPanelState {
  parallelEnabled: boolean;
  parallelWorkerCount: number;
  // ... other settings
}
```

### Phase 5: Settings View Update

#### 5.1 Updated Settings View (`src/tui/components/SettingsView.tsx`)

```typescript
/**
 * ABOUTME: Settings view with parallel mode controls.
 */

interface SettingsViewProps {
  parallelEnabled: boolean;
  parallelWorkerCount: number;
  onParallelToggle: () => void;
  onWorkerCountChange: (count: number) => void;
  // ... other props
}

export function SettingsView({
  parallelEnabled,
  parallelWorkerCount,
  onParallelToggle,
  onWorkerCountChange,
}: SettingsViewProps): ReactNode {
  const [localWorkerCount, setLocalWorkerCount] = useState(parallelWorkerCount);
  
  const handleWorkerDecrement = () => {
    const newCount = Math.max(1, localWorkerCount - 1);
    setLocalWorkerCount(newCount);
    onWorkerCountChange(newCount);
  };
  
  const handleWorkerIncrement = () => {
    const newCount = Math.min(10, localWorkerCount + 1);
    setLocalWorkerCount(newCount);
    onWorkerCountChange(newCount);
  };
  
  return (
    <box>
      {/* Parallel Mode Section */}
      <box marginBottom={1}>
        <text fg={colors.fg.primary}>⚡ Parallel Execution</text>
      </box>
      
      {/* Toggle */}
      <box flexDirection="row" alignItems="center" marginBottom={1}>
        <text>Enable Parallel Mode: </text>
        <checkbox
          checked={parallelEnabled}
          onChange={onParallelToggle}
        />
        <text fg={colors.fg.muted}>
          {parallelEnabled ? ' [Enabled]' : ' [Disabled]'}
        </text>
      </box>
      
      {/* Worker Count - only shown when parallel is enabled */}
      {parallelEnabled && (
        <box flexDirection="row" alignItems="center" marginLeft={2}>
          <text>Worker Count: </text>
          <button onClick={handleWorkerDecrement}>[−]</button>
          <text fg={colors.fg.primary} marginLeft={1} marginRight={1}>
            {localWorkerCount}
          </text>
          <button onClick={handleWorkerIncrement}>[+]</button>
          <text fg={colors.fg.dim} marginLeft={1}>
            (1-10 workers)
          </text>
        </box>
      )}
      
      {/* Info box */}
      {parallelEnabled && (
        <box marginTop={1} padding={1} borderStyle="round">
          <text fg={colors.fg.muted}>
            Running {localWorkerCount} concurrent workers.
            Tasks will be distributed across workers automatically.
          </text>
        </box>
      )}
    </box>
  );
}
```

### Phase 6: Header Update

#### 6.1 Updated Header (`src/tui/components/Header.tsx`)

```typescript
/**
 * Add parallel indicator to header when enabled
 */

interface HeaderProps {
  // ... existing props
  parallelEnabled?: boolean;
  parallelWorkerCount?: number;
  activeWorkers?: number;
}

export function Header({
  // ... existing destructuring
  parallelEnabled = false,
  parallelWorkerCount = 2,
  activeWorkers = 0,
}: HeaderProps): ReactNode {
  // ... existing code
  
  return (
    <box height={HEADER_HEIGHT}>
      {/* Existing status indicators */}
      
      {/* Parallel mode indicator */}
      {parallelEnabled && (
        <box marginLeft={1}>
          <text fg={colors.fg.accent}>
            ⚡ {activeWorkers}/{parallelWorkerCount}
          </text>
        </box>
      )}
    </box>
  );
}
```

### Phase 7: Parallel Panel

#### 7.1 New ParallelPanel Component (`src/tui/components/ParallelPanel.tsx`)

```typescript
/**
 * ABOUTME: Panel showing parallel task execution status.
 * Displays active workers, their current tasks, and progress.
 */

import { colors } from '../theme.js';
import type { WorkerDisplayState } from '../types.js';

interface ParallelPanelProps {
  workers: WorkerDisplayState[];
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string | null) => void;
}

export function ParallelPanel({
  workers,
  selectedWorkerId,
  onSelectWorker,
}: ParallelPanelProps): ReactNode {
  return (
    <box>
      {/* Header */}
      <box marginBottom={1}>
        <text fg={colors.fg.primary}>⚡ Parallel Workers</text>
      </box>
      
      {/* Worker rows */}
      {workers.map((worker) => (
        <WorkerRow
          key={worker.workerId}
          worker={worker}
          isSelected={worker.workerId === selectedWorkerId}
          onSelect={() => onSelectWorker(
            worker.workerId === selectedWorkerId ? null : worker.workerId
          )}
        />
      ))}
      
      {/* Summary */}
      <box marginTop={1}>
        <SummaryStats workers={workers} />
      </box>
    </box>
  );
}

function WorkerRow({
  worker,
  isSelected,
  onSelect,
}: {
  worker: WorkerDisplayState;
  isSelected: boolean;
  onSelect: () => void;
}): ReactNode {
  const statusColor = worker.status === 'running'
    ? colors.fg.primary
    : worker.status === 'error'
      ? colors.fg.error
      : colors.fg.dim;
      
  const statusIcon = worker.status === 'running'
    ? '▶'
    : worker.status === 'error'
      ? '✗'
      : '○';
  
  return (
    <box
      style={{
        backgroundColor: isSelected ? colors.bg.highlight : 'transparent',
        paddingLeft: 1,
        paddingRight: 1,
      }}
      onClick={onSelect}
    >
      {/* Status icon */}
      <text fg={statusColor}>{statusIcon}</text>
      
      {/* Worker ID */}
      <text fg={colors.fg.muted} marginLeft={1}>
        {worker.workerId}
      </text>
      
      {/* Task assignment */}
      {worker.taskId ? (
        <text fg={colors.fg.secondary}>
          {' → '}{worker.taskTitle ?? worker.taskId}
        </text>
      ) : (
        <text fg={colors.fg.dim}> (idle)</text>
      )}
      
      {/* Progress bar */}
      {worker.status === 'running' && (
        <ProgressBarSmall progress={worker.progress} />
      )}
    </box>
  );
}

function ProgressBarSmall({ progress }: { progress: number }): ReactNode {
  const width = 8;
  const filled = Math.round((progress / 100) * width);
  const bar = '▓'.repeat(filled) + '░'.repeat(width - filled);
  
  return <text fg={colors.fg.accent}> [{bar}]</text>;
}

function SummaryStats({ workers }: { workers: WorkerDisplayState[] }): ReactNode {
  const running = workers.filter(w => w.status === 'running').length;
  const idle = workers.filter(w => w.status === 'idle').length;
  const error = workers.filter(w => w.status === 'error').length;
  
  return (
    <box>
      <text fg={colors.fg.muted}>Workers: </text>
      <text fg={colors.fg.primary}>{running} running</text>
      <text fg={colors.fg.dim}>, {idle} idle</text>
      {error > 0 && <text fg={colors.fg.error}>, {error} error</text>}
    </box>
  );
}
```

### Phase 8: RunApp Integration

#### 8.1 Updated RunApp (`src/tui/components/RunApp.tsx`)

```typescript
export function RunApp({ engine, ...props }: RunAppProps): ReactNode {
  // ... existing state
  
  // Parallel execution state
  const [parallelEnabled, setParallelEnabled] = useState(false);
  const [parallelWorkers, setParallelWorkers] = useState<WorkerDisplayState[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  
  // Listen for parallel events
  useEffect(() => {
    if (!('on' in engine)) return; // Not a parallel engine
    
    const unsubscribe = (engine as any).on?.((event: ParallelEngineEvent) => {
      handleParallelEvent(event);
    });
    
    return () => unsubscribe?.();
  }, [engine]);
  
  const handleParallelEvent = (event: ParallelEngineEvent) => {
    switch (event.type) {
      case 'parallel:mode-changed':
        setParallelEnabled(event.newMode === 'parallel');
        break;
        
      case 'parallel:config-changed':
        // Worker count changed via settings
        break;
        
      case 'parallel:task-assigned':
        setParallelWorkers(prev => prev.map(w =>
          w.workerId === event.workerId
            ? { ...w, taskId: event.taskId, status: 'running' as const }
            : w
        ));
        break;
        
      case 'parallel:task-output':
        setParallelWorkers(prev => prev.map(w =>
          w.workerId === event.workerId
            ? { ...w, output: (w.output ?? '') + event.data }
            : w
        ));
        break;
        
      case 'parallel:task-completed':
        setParallelWorkers(prev => prev.map(w =>
          w.workerId === event.workerId
            ? { ...w, taskId: null, status: 'idle' as const }
            : w
        ));
        break;
        
      case 'parallel:progress':
        // Update overall progress
        break;
    }
  };
  
  // Settings handlers
  const handleParallelToggle = async () => {
    if (!('toggleParallelMode' in engine)) {
      console.warn('Engine does not support parallel mode');
      return;
    }
    await (engine as any).toggleParallelMode();
    setParallelEnabled(!parallelEnabled);
  };
  
  const handleWorkerCountChange = (count: number) => {
    if (!('setWorkerCount' in engine)) return;
    (engine as any).setWorkerCount(count);
  };
  
  return (
    <box>
      <Header
        // ... existing props
        parallelEnabled={parallelEnabled}
        parallelWorkerCount={parallelWorkers.length}
        activeWorkers={parallelWorkers.filter(w => w.status === 'running').length}
      />
      
      <box flexDirection="row" flexGrow={1}>
        {/* Main panels */}
        <LeftPanel
          tasks={formattedTasks}
          // ... existing props
          // Pass parallel info to show worker badges
        />
        
        <RightPanel
          selectedTask={selectedTask}
          // ... existing props
          // Show worker output if worker selected
          workerOutput={
            selectedWorkerId
              ? parallelWorkers.find(w => w.workerId === selectedWorkerId)?.output
              : undefined
          }
        />
        
        {/* Parallel Panel - toggle with 'P' key */}
        {showParallelPanel && (
          <ParallelPanel
            workers={parallelWorkers}
            selectedWorkerId={selectedWorkerId}
            onSelectWorker={setSelectedWorkerId}
          />
        )}
      </box>
      
      <Footer
        // ... existing props
        shortcuts={[
          // ... existing shortcuts
          { key: 'P', action: 'Toggle parallel panel', mode: 'running' },
        ]}
      />
      
      {/* Settings overlay */}
      {showSettings && (
        <SettingsOverlay>
          <SettingsView
            parallelEnabled={parallelEnabled}
            parallelWorkerCount={parallelWorkers.length}
            onParallelToggle={handleParallelToggle}
            onWorkerCountChange={handleWorkerCountChange}
          />
        </SettingsOverlay>
      )}
    </box>
  );
}
```

---

## Keyboard Shortcuts

| Key | Action | Mode |
|-----|--------|------|
| `P` | Toggle parallel panel | Running |
| `Ctrl+P` | Toggle parallel mode on/off | Ready/Running |
| `Ctrl++` | Increase worker count | Settings |
| `Ctrl+-` | Decrease worker count | Settings |

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `src/engine/parallel.ts` | ParallelExecutionEngine class |
| `src/engine/worker.ts` | Worker class for task execution |
| `src/tui/components/ParallelPanel.tsx` | Parallel execution visualization |
| `tests/engine/worker.test.ts` | Worker unit tests |
| `tests/engine/parallel.test.ts` | Parallel engine tests |

### Modified Files
| File | Change |
|------|--------|
| `src/engine/types.ts` | Add parallel types |
| `src/tui/types.ts` | Add parallel TUI types |
| `src/tui/components/SettingsView.tsx` | Add parallel settings |
| `src/tui/components/Header.tsx` | Add parallel indicator |
| `src/tui/components/RunApp.tsx` | Handle parallel events |
| `src/tui/components/Footer.tsx` | Add parallel shortcuts |

---

## Estimated Effort

| Phase | Complexity | Estimated Time |
|-------|------------|----------------|
| Phase 1: Core Types | Low | 1-2 hours |
| Phase 2: Worker Class | Medium | 3-4 hours |
| Phase 3: Parallel Engine | High | 6-8 hours |
| Phase 4-5: TUI Types & Settings | Medium | 2-3 hours |
| Phase 6: Parallel Panel | Medium | 3-4 hours |
| Phase 7-8: RunApp Integration | Medium | 4-5 hours |
| **Total** | - | **19-26 hours** |

---

## User Workflow

```
1. User opens Ralph TUI
2. Press 's' to start (sequential by default)
3. Press 'Ctrl+P' to toggle parallel mode
4. Open Settings (press ',') to adjust worker count [−] 3 [+]
5. Press 'P' to show parallel panel
6. See workers executing tasks in parallel
7. Click worker row to see that worker's output
```

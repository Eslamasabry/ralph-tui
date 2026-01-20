# Parallel Execution Handler - Implementation Plan

**Generated:** 2026-01-20  
**Feature:** Parallel task execution for Ralph TUI

---

## Overview

Add parallel task execution capability to Ralph TUI, allowing multiple AI agents to run simultaneously on independent tasks. This significantly improves throughput for task lists with no interdependencies.

### Key Benefits
- **3-5x faster completion** for independent task sets
- **Better resource utilization** during agent I/O wait times
- **Visual parallel progress** in TUI
- **Configurable concurrency** (1-N parallel workers)

---

## Architecture Summary

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
```

---

## Backend Implementation Plan

### Phase 1: Core Types & Interfaces

#### 1.1 New Types (`src/engine/types.ts`)

```typescript
/**
 * Parallel execution mode
 * - 'sequential': Original single-task mode
 * - 'parallel': Run multiple tasks concurrently
 */
export type ExecutionMode = 'sequential' | 'parallel';

/**
 * Configuration for parallel execution
 */
export interface ParallelExecutionConfig {
  /** Number of concurrent workers (1 = sequential, N = parallel) */
  maxConcurrency: number;
  
  /** Whether to auto-start next task when worker frees */
  autoStart: boolean;
  
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
 * Extended engine state for parallel execution
 */
export interface ParallelEngineState extends EngineState {
  /** Current execution mode */
  mode: ExecutionMode;
  
  /** Parallel execution configuration */
  parallelConfig: ParallelExecutionConfig;
  
  /** All active parallel task states */
  activeTasks: Map<string, ParallelTaskState>;
  
  /** Number of running workers */
  activeWorkers: number;
  
  /** Total tasks started (including retries) */
  totalTasksStarted: number;
  
  /** Tasks that failed permanently */
  failedTaskIds: Set<string>;
  
  /** Tasks skipped due to dependencies */
  skippedDueToDependencies: Set<string>;
}

/**
 * Parallel execution events
 */
export type ParallelEngineEventType =
  | 'parallel:started'
  | 'parallel:stopped'
  | 'parallel:worker-started'
  | 'parallel:worker-stopped'
  | 'parallel:task-started'
  | 'parallel:task-completed'
  | 'parallel:task-failed'
  | 'parallel:all-complete'
  | 'parallel:progress';

export interface ParallelWorkerStartedEvent extends EngineEventBase {
  type: 'parallel:worker-started';
  workerId: string;
  taskId: string;
}

export interface ParallelTaskStartedEvent extends EngineEventBase {
  type: 'parallel:task-started';
  workerId: string;
  taskId: string;
}

export interface ParallelTaskCompletedEvent extends EngineEventBase {
  type: 'parallel:task-completed';
  workerId: string;
  taskId: string;
  durationMs: number;
}

export interface ParallelProgressEvent extends EngineEventBase {
  type: 'parallel:progress';
  activeCount: number;
  completedCount: number;
  failedCount: number;
  totalProgress: number; // 0-100
}
```

#### 1.2 Configuration Update (`src/config/types.ts`)

```typescript
export interface RalphConfig {
  // ... existing fields ...
  
  /** Execution mode: sequential or parallel */
  executionMode?: ExecutionMode;
  
  /** Parallel execution configuration */
  parallel?: ParallelExecutionConfig;
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
import { buildPrompt } from './index.js';

export interface WorkerOptions {
  workerId: string;
  config: RalphConfig;
  tracker: TrackerPlugin;
  agent: AgentPlugin;
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
  private workerId: string;
  private config: RalphConfig;
  private tracker: TrackerPlugin;
  private agent: AgentPlugin;
  private currentExecution: AgentExecutionHandle | null = null;
  private shouldStop = false;
  
  constructor(options: WorkerOptions) {
    this.workerId = options.workerId;
    this.config = options.config;
    this.tracker = options.tracker;
    this.agent = options.agent;
  }
  
  async executeTask(task: TrackerTask): Promise<TaskExecutionResult> {
    const startedAt = Date.now();
    this.shouldStop = false;
    
    try {
      // Build prompt
      const prompt = await buildPrompt(task, this.config, this.tracker);
      
      // Execute agent
      const handle = this.agent.execute(prompt, [], {
        cwd: this.config.cwd,
        flags: this.config.model ? ['--model', this.config.model] : [],
        sandbox: this.config.sandbox,
        onStdout: (data) => {
          // Forward to aggregator
        },
        onStderr: (data) => {
          // Forward to aggregator
        },
      });
      
      this.currentExecution = handle;
      const result = await handle.promise;
      
      // Check completion
      const completed = /<promise>\s*COMPLETE\s*<\/promise>/i.test(result.stdout);
      
      if (completed) {
        await this.tracker.completeTask(task.id, 'Completed by agent');
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
      return {
        taskId: task.id,
        success: false,
        output: '',
        stderr: '',
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        completed: false,
      };
    } finally {
      this.currentExecution = null;
    }
  }
  
  interrupt(): void {
    this.shouldStop = true;
    this.currentExecution?.interrupt();
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
 * Extends ExecutionEngine with worker pool for parallel execution.
 */

import type {
  ParallelEngineState,
  ParallelExecutionConfig,
  ParallelTaskState,
  ParallelEngineEvent,
  ExecutionMode,
} from './types.js';
import type { TrackerTask } from '../plugins/trackers/types.js';
import type { RalphConfig } from '../config/types.js';
import { Worker, type TaskExecutionResult } from './worker.js';
import { EventEmitter } from 'events';

export class ParallelExecutionEngine extends EventEmitter {
  private config: RalphConfig;
  private state: ParallelEngineState;
  private workers: Map<string, Worker> = new Map();
  private taskQueue: TrackerTask[] = [];
  private shouldStop = false;
  
  constructor(config: RalphConfig) {
    super();
    this.config = config;
    this.state = this.createInitialState(config);
  }
  
  private createInitialState(config: RalphConfig): ParallelEngineState {
    const parallelConfig = config.parallel ?? {
      maxConcurrency: 2,
      autoStart: true,
      tasksPerWorker: 10,
      respectDependencies: true,
    };
    
    return {
      status: 'idle',
      mode: 'parallel',
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
      activeWorkers: 0,
      totalTasksStarted: 0,
      failedTaskIds: new Set(),
      skippedDueToDependencies: new Set(),
      subagents: new Map(),
      activeAgent: null,
      rateLimitState: null,
    };
  }
  
  async initialize(): Promise<void> {
    // Create worker pool
    const { maxConcurrency } = this.state.parallelConfig;
    
    for (let i = 0; i < maxConcurrency; i++) {
      const worker = await this.createWorker(`worker-${i}`);
      this.workers.set(worker.workerId, worker);
    }
  }
  
  private async createWorker(workerId: string): Promise<Worker> {
    // Get agent and tracker instances (similar to ExecutionEngine)
    const agent = await getAgentInstance(this.config.agent);
    const tracker = await getTrackerInstance(this.config.tracker);
    
    return new Worker({
      workerId,
      config: this.config,
      tracker,
      agent,
      onTaskComplete: (result) => this.handleTaskComplete(result, workerId),
      onTaskError: (error) => this.handleTaskError(error, workerId),
    });
  }
  
  async start(): Promise<void> {
    if (this.state.status !== 'idle') {
      throw new Error(`Cannot start in ${this.state.status} state`);
    }
    
    this.state.status = 'running';
    this.state.startedAt = new Date().toISOString();
    this.shouldStop = false;
    
    this.emit({
      type: 'parallel:started',
      timestamp: new Date().toISOString(),
    });
    
    // Start workers
    await this.distributeTasks();
  }
  
  private async distributeTasks(): Promise<void> {
    while (!this.shouldStop) {
      // Check if all workers are busy
      const busyWorkers = Array.from(this.workers.values()).filter(
        (w) => w.isBusy()
      );
      
      if (busyWorkers.length >= this.workers.size) {
        // All workers busy, wait for one to complete
        await this.waitForWorkerComplete();
        continue;
      }
      
      // Get next task
      const task = await this.getNextTask();
      if (!task) {
        // No more tasks, wait for running workers to complete
        if (this.state.activeWorkers === 0) {
          break;
        }
        await this.waitForWorkerComplete();
        continue;
      }
      
      // Assign to free worker
      const freeWorker = this.getFreeWorker();
      if (freeWorker) {
        await this.assignTaskToWorker(freeWorker, task);
      }
    }
    
    await this.shutdown();
  }
  
  private async assignTaskToWorker(worker: Worker, task: TrackerTask): Promise<void> {
    const taskState: ParallelTaskState = {
      taskId: task.id,
      workerId: worker.workerId,
      status: 'running',
      startedAt: new Date().toISOString(),
      output: '',
      stderr: '',
      agent: this.config.agent.plugin,
      progress: 0,
    };
    
    this.state.activeTasks.set(task.id, taskState);
    this.state.activeWorkers++;
    this.state.totalTasksStarted++;
    
    this.emit({
      type: 'parallel:task-started',
      timestamp: new Date().toISOString(),
      workerId: worker.workerId,
      taskId: task.id,
    });
    
    await worker.executeTask(task);
  }
  
  private handleTaskComplete(result: TaskExecutionResult, workerId: string): void {
    const taskState = this.state.activeTasks.get(result.taskId);
    if (!taskState) return;
    
    taskState.status = result.completed ? 'completed' : 'failed';
    taskState.endedAt = new Date().toISOString();
    taskState.output = result.output;
    taskState.stderr = result.stderr;
    
    if (result.completed) {
      this.state.tasksCompleted++;
    } else if (!result.success) {
      this.state.failedTaskIds.add(result.taskId);
    }
    
    this.state.activeWorkers--;
    this.state.activeTasks.delete(result.taskId);
    
    this.emit({
      type: 'parallel:task-completed',
      timestamp: new Date().toISOString(),
      workerId,
      taskId: result.taskId,
      durationMs: result.durationMs,
    });
    
    // Emit progress
    this.emitProgress();
  }
  
  private handleTaskError(error: Error, workerId: string): void {
    this.emit({
      type: 'parallel:task-failed',
      timestamp: new Date().toISOString(),
      workerId,
      error: error.message,
    });
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
  
  // ... stop, pause, resume methods
}
```

### Phase 4: Engine Factory

#### 4.1 Unified Entry Point (`src/engine/factory.ts`)

```typescript
/**
 * ABOUTME: Factory for creating appropriate execution engine based on config.
 */

import { ExecutionEngine } from './index.js';
import { ParallelExecutionEngine } from './parallel.js';
import type { RalphConfig, ExecutionMode } from '../config/types.js';

export function createExecutionEngine(config: RalphConfig): ExecutionEngine | ParallelExecutionEngine {
  const mode: ExecutionMode = config.executionMode ?? 'sequential';
  
  if (mode === 'parallel') {
    return new ParallelExecutionEngine(config);
  }
  
  return new ExecutionEngine(config);
}
```

---

## Frontend Implementation Plan

### Phase 5: TUI Types Update

#### 5.1 Extended Types (`src/tui/types.ts`)

```typescript
/**
 * Extended task item for parallel execution display
 */
export interface ParallelTaskItem extends TaskItem {
  /** Worker ID if task is running in parallel mode */
  workerId?: string;
  
  /** Estimated progress (0-100) */
  progress: number;
  
  /** When task started */
  startedAt?: string;
  
  /** Agent being used */
  agent?: string;
}

/**
 * Parallel execution state for TUI
 */
export interface ParallelExecutionState {
  mode: 'sequential' | 'parallel';
  activeWorkers: number;
  maxConcurrency: number;
  activeTasks: Map<string, ParallelTaskItem>;
  completedCount: number;
  failedCount: number;
  totalProgress: number;
}

/**
 * Worker status for parallel visualization
 */
export interface WorkerStatus {
  workerId: string;
  taskId: string | null;
  status: 'idle' | 'running' | 'error';
  duration: string;
}
```

### Phase 6: New TUI Components

#### 6.1 ParallelPanel Component (`src/tui/components/ParallelPanel.tsx`)

```typescript
/**
 * ABOUTME: Panel showing parallel task execution status.
 * Displays active workers, their current tasks, and progress.
 */

import { colors } from '../theme.js';
import type { ParallelExecutionState, WorkerStatus } from '../types.js';

interface ParallelPanelProps {
  state: ParallelExecutionState;
  workers: WorkerStatus[];
  onSelectTask?: (taskId: string) => void;
  selectedTaskId?: string | null;
}

export function ParallelPanel({ state, workers, onSelectTask, selectedTaskId }: ParallelPanelProps): ReactNode {
  const maxWorkers = state.maxConcurrency;
  
  return (
    <box>
      {/* Header */}
      <text>
        <span fg={colors.fg.primary}>⚡ Parallel Execution</span>
        <span fg={colors.fg.muted}> ({state.activeWorkers}/{maxWorkers} workers)</span>
      </text>
      
      {/* Progress bar */}
      <ProgressBar progress={state.totalProgress} />
      
      {/* Worker rows */}
      {workers.map((worker) => (
        <WorkerRow
          key={worker.workerId}
          worker={worker}
          isSelected={worker.taskId === selectedTaskId}
          onSelect={onSelectTask}
        />
      ))}
      
      {/* Stats */}
      <box marginTop={1}>
        <text fg={colors.fg.success}>✓ {state.completedCount} completed</text>
        <text fg={colors.fg.error}> ✗ {state.failedCount} failed</text>
      </box>
    </box>
  );
}

function WorkerRow({ worker, isSelected, onSelect }: WorkerRowProps): ReactNode {
  const statusColor = worker.status === 'running' 
    ? colors.fg.primary 
    : worker.status === 'error'
      ? colors.fg.error
      : colors.fg.dim;
      
  return (
    <box
      style={{
        backgroundColor: isSelected ? colors.bg.highlight : 'transparent',
      }}
      onClick={() => worker.taskId && onSelect?.(worker.taskId)}
    >
      <text>
        <span fg={statusColor}>
          {worker.status === 'running' ? '●' : worker.status === 'error' ? '✗' : '○'}
        </span>
        <span fg={colors.fg.muted}> {worker.workerId}</span>
        <span fg={colors.fg.secondary}>
          {worker.taskId ? ` → ${worker.taskId}` : ' (idle)'}
        </span>
        <span fg={colors.fg.dim}> {worker.duration}</span>
      </text>
    </box>
  );
}
```

#### 6.2 Updated LeftPanel (`src/tui/components/LeftPanel.tsx`)

```typescript
// Add parallel task visualization
interface TaskRowProps {
  task: ParallelTaskItem; // Extended with progress/workerId
  isSelected: boolean;
  showParallelIndicator?: boolean;
  // ... existing props
}

function ParallelTaskRow({ task, isSelected, showParallelIndicator = true }: TaskRowProps): ReactNode {
  // Show worker badge for running tasks in parallel mode
  const workerBadge = task.workerId ? (
    <span fg={colors.fg.accent}>[{task.workerId}]</span>
  ) : null;
  
  // Progress bar for running tasks
  const progressBar = task.status === 'in_progress' && task.progress > 0 ? (
    <ProgressIndicator progress={task.progress} />
  ) : null;
  
  return (
    <box style={{...}}>
      {workerBadge}
      {progressBar}
      {/* ... rest of task display */}
    </box>
  );
}
```

#### 6.3 Updated RightPanel (`src/tui/components/RightPanel.tsx`)

```typescript
// Add parallel execution details tab
function RightPanel({ 
  selectedTask, 
  parallelState,
  // ... existing props
}: RightPanelProps): ReactNode {
  const [viewMode, setViewMode] = useState<RightPanelViewMode>('output');
  
  const tabs = [
    { id: 'output', label: 'Output' },
    { id: 'subagent', label: 'Subagents' },
    { parallelState?.mode === 'parallel' ? { id: 'parallel', label: 'Parallel' } : null },
  ].filter(Boolean);
  
  return (
    <box>
      <TabBar tabs={tabs} activeTab={viewMode} onChange={setViewMode} />
      
      {viewMode === 'output' && <OutputView task={selectedTask} />}
      {viewMode === 'parallel' && parallelState && (
        <ParallelExecutionView state={parallelState} />
      )}
    </box>
  );
}
```

### Phase 7: RunApp Integration

#### 7.1 Updated RunApp (`src/tui/components/RunApp.tsx`)

```typescript
export function RunApp({ engine, ...props }: RunAppProps): ReactNode {
  const [parallelState, setParallelState] = useState<ParallelExecutionState | null>(null);
  
  // Listen for parallel events
  useEffect(() => {
    const unsubscribe = engine.on((event) => {
      if (event.type.startsWith('parallel:')) {
        handleParallelEvent(event);
      }
    });
    return unsubscribe;
  }, [engine]);
  
  const handleParallelEvent = (event: ParallelEngineEvent) => {
    switch (event.type) {
      case 'parallel:started':
        setParallelState({
          mode: 'parallel',
          activeWorkers: 0,
          maxConcurrency: engine.getParallelConfig()?.maxConcurrency ?? 2,
          activeTasks: new Map(),
          completedCount: 0,
          failedCount: 0,
          totalProgress: 0,
        });
        break;
        
      case 'parallel:task-started':
        setParallelState((prev) => {
          if (!prev) return prev;
          const newTasks = new Map(prev.activeTasks);
          newTasks.set(event.taskId, {
            id: event.taskId,
            status: 'in_progress',
            progress: 0,
            workerId: event.workerId,
            title: getTaskTitle(event.taskId),
          });
          return { ...prev, activeTasks: newTasks };
        });
        break;
        
      case 'parallel:progress':
        setParallelState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeWorkers: event.activeCount,
            completedCount: event.completedCount,
            failedCount: event.failedCount,
            totalProgress: event.totalProgress,
          };
        });
        break;
    }
  };
  
  return (
    <box>
      {parallelState && parallelState.mode === 'parallel' && (
        <ParallelPanel
          state={parallelState}
          workers={getWorkerStatuses(parallelState)}
          onSelectTask={setSelectedTaskId}
          selectedTaskId={selectedTaskId}
        />
      )}
      <LeftPanel tasks={formattedTasks} />
      <RightPanel selectedTask={selectedTask} parallelState={parallelState} />
    </box>
  );
}
```

---

## CLI & Configuration

### Phase 8: CLI Updates

#### 8.1 Run Command (`src/commands/run.tsx`)

```typescript
export async function executeRunCommand(args: RunArgs): Promise<void> {
  const config = await loadConfig(args);
  
  // Apply CLI flags for parallel execution
  if (args.parallel !== undefined) {
    config.executionMode = args.parallel ? 'parallel' : 'sequential';
  }
  
  if (args.parallelWorkers !== undefined) {
    config.parallel = {
      maxConcurrency: args.parallelWorkers,
      autoStart: true,
      tasksPerWorker: 10,
      respectDependencies: true,
    };
  }
  
  // Create appropriate engine
  const engine = createExecutionEngine(config);
  
  // Initialize and run
  await engine.initialize();
  await engine.start();
}
```

### Phase 9: Default Configuration

#### 9.1 Schema Update (`src/config/schema.ts`)

```typescript
export const ConfigSchema = z.object({
  // ... existing fields ...
  
  executionMode: z.enum(['sequential', 'parallel']).default('sequential'),
  
  parallel: z.object({
    maxConcurrency: z.number().min(1).max(10).default(2),
    autoStart: z.boolean().default(true),
    tasksPerWorker: z.number().min(1).max(100).default(10),
    respectDependencies: z.boolean().default(true),
  }).optional(),
});
```

---

## Testing Plan

### Phase 10: Test Coverage

| Test | Description | Files |
|------|-------------|-------|
| Unit | Worker execution | `tests/engine/worker.test.ts` |
| Unit | Parallel engine state transitions | `tests/engine/parallel.test.ts` |
| Unit | Task queue ordering | `tests/engine/parallel-queue.test.ts` |
| Integration | End-to-end parallel execution | `tests/engine/parallel-integration.test.ts` |
| Integration | TUI parallel panel rendering | `tests/tui/parallel-panel.test.ts` |
| Integration | CLI parallel flags | `tests/commands/run-parallel.test.ts` |

---

## Migration Path

### Backward Compatibility

1. **Default behavior unchanged**: `executionMode` defaults to `'sequential'`
2. **Existing configs work**: No breaking changes to config schema
3. **Progressive enhancement**: Parallel mode is opt-in

### Upgrade Steps for Users

```bash
# Enable parallel mode (2 workers)
ralph-tui run --parallel --parallel-workers 2

# Or in config
# .ralph-tui/config.toml
executionMode = "parallel"
[parallel]
maxConcurrency = 3
```

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `src/engine/parallel.ts` | ParallelExecutionEngine class |
| `src/engine/worker.ts` | Worker class for task execution |
| `src/engine/factory.ts` | Engine factory for mode selection |
| `src/tui/components/ParallelPanel.tsx` | Parallel execution visualization |
| `tests/engine/worker.test.ts` | Worker unit tests |
| `tests/engine/parallel.test.ts` | Parallel engine tests |
| `tests/tui/parallel-panel.test.ts` | TUI panel tests |

### Modified Files
| File | Change |
|------|--------|
| `src/engine/types.ts` | Add parallel types |
| `src/config/types.ts` | Add parallel config |
| `src/config/schema.ts` | Add parallel schema |
| `src/tui/types.ts` | Add parallel TUI types |
| `src/tui/components/LeftPanel.tsx` | Add parallel task rows |
| `src/tui/components/RightPanel.tsx` | Add parallel tab |
| `src/tui/components/RunApp.tsx` | Handle parallel events |
| `src/commands/run.tsx` | Add parallel CLI flags |

---

## Estimated Effort

| Phase | Complexity | Estimated Time |
|-------|------------|----------------|
| Phase 1-2: Core Types & Worker | Medium | 4-6 hours |
| Phase 3-4: Parallel Engine | High | 8-12 hours |
| Phase 5-7: TUI Updates | Medium | 6-8 hours |
| Phase 8-9: CLI & Config | Low | 2-3 hours |
| Phase 10: Testing | Medium | 4-6 hours |
| **Total** | - | **24-35 hours** |

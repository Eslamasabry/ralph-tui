/**
 * ABOUTME: Activity event model and buffer for capturing UI timeline events.
 * Provides a standardized way to collect and retrieve activity events for
 * timeline display in the TUI.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Categories of activity events.
 * Used to organize events in the timeline and filter by type.
 */
export type ActivityEventCategory =
  | 'engine'      // Engine lifecycle events (start, stop, pause, resume)
  | 'iteration'   // Iteration events (started, completed, failed)
  | 'task'        // Task events (selected, activated, completed, blocked)
  | 'agent'       // Agent events (output, switched, rate limited)
  | 'subagent'    // Subagent events (spawn, progress, complete, error)
  | 'system';     // System events (config changes, warnings)

/**
 * Severity level for activity events.
 * Used for filtering and display priority.
 */
export type ActivityEventSeverity = 'info' | 'warning' | 'error';

/**
 * Activity event captured for timeline display.
 * Represents a single unit of activity that occurred during execution.
 */
export interface ActivityEvent {
  /** Unique identifier for this event */
  id: string;

  /** Category of the event for organization */
  category: ActivityEventCategory;

  /** Type of event within the category (e.g., 'started', 'completed') */
  eventType: string;

  /** ISO 8601 timestamp when the event occurred */
  timestamp: string;

  /** Severity level of the event */
  severity: ActivityEventSeverity;

  /** Human-readable description of the event */
  description: string;

  /** Iteration number this event belongs to (if applicable) */
  iteration?: number;

  /** Task ID this event relates to (if applicable) */
  taskId?: string;

  /** Task title this event relates to (if applicable) */
  taskTitle?: string;

  /** Agent plugin name (if agent-related) */
  agentPlugin?: string;

  /** Additional metadata as key-value pairs */
  metadata?: Record<string, unknown>;

  /** Parent event ID for establishing event relationships */
  parentEventId?: string;
}

/**
 * Options for creating an ActivityEventBuffer.
 */
export interface ActivityEventBufferOptions {
  /** Maximum number of events to keep in memory (default: 1000) */
  maxEvents?: number;

  /** Directory path for persisting events to disk */
  persistDir?: string;

  /** Filename for persisted events (default: activity-events.jsonl) */
  persistFilename?: string;

  /** Whether to persist events to disk (default: false) */
  persistEnabled?: boolean;
}

/**
 * Activity event buffer for collecting and managing activity events.
 * Provides in-memory storage with optional disk persistence.
 */
export class ActivityEventBuffer {
  private events: ActivityEvent[];
  private maxEvents: number;
  private persistDir?: string;
  private persistFilename: string;
  private persistEnabled: boolean;
  private eventCounter: number;

  constructor(options: ActivityEventBufferOptions = {}) {
    this.maxEvents = options.maxEvents ?? 1000;
    this.persistDir = options.persistDir;
    this.persistFilename = options.persistFilename ?? 'activity-events.jsonl';
    this.persistEnabled = options.persistEnabled ?? false;
    this.events = [];
    this.eventCounter = 0;
  }

  /**
   * Generate a unique event ID.
   */
  private generateEventId(): string {
    this.eventCounter++;
    return `evt_${Date.now()}_${this.eventCounter}`;
  }

  /**
   * Append an activity event to the buffer.
   * Removes oldest events if buffer is full.
   */
  async append(event: Omit<ActivityEvent, 'id'>): Promise<ActivityEvent> {
    const fullEvent: ActivityEvent = {
      ...event,
      id: this.generateEventId(),
    };

    this.events.push(fullEvent);

    // Trim buffer if over capacity
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Persist to disk if enabled
    if (this.persistEnabled && this.persistDir) {
      await this.persistEvent(fullEvent);
    }

    return fullEvent;
  }

  /**
   * Append multiple events at once.
   */
  async appendMany(events: Omit<ActivityEvent, 'id'>[]): Promise<ActivityEvent[]> {
    const results: ActivityEvent[] = [];

    for (const event of events) {
      const fullEvent = await this.append(event);
      results.push(fullEvent);
    }

    return results;
  }

  /**
   * Get all events in the buffer.
   */
  getAll(): ActivityEvent[] {
    return [...this.events];
  }

  /**
   * Get events filtered by category.
   */
  getByCategory(category: ActivityEventCategory): ActivityEvent[] {
    return this.events.filter((e) => e.category === category);
  }

  /**
   * Get events filtered by iteration.
   */
  getByIteration(iteration: number): ActivityEvent[] {
    return this.events.filter((e) => e.iteration === iteration);
  }

  /**
   * Get events filtered by task.
   */
  getByTaskId(taskId: string): ActivityEvent[] {
    return this.events.filter((e) => e.taskId === taskId);
  }

  /**
   * Get the most recent N events.
   */
  getRecent(count: number): ActivityEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Get events within a time range.
   */
  getByTimeRange(startTime: string, endTime: string): ActivityEvent[] {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    return this.events.filter((e) => {
      const eventTime = new Date(e.timestamp).getTime();
      return eventTime >= start && eventTime <= end;
    });
  }

  /**
   * Clear all events from the buffer.
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get the number of events in the buffer.
   */
  size(): number {
    return this.events.length;
  }

  /**
   * Check if the buffer is empty.
   */
  isEmpty(): boolean {
    return this.events.length === 0;
  }

  /**
   * Persist a single event to disk as JSONL.
   */
  private async persistEvent(event: ActivityEvent): Promise<void> {
    if (!this.persistDir) return;

    const filePath = join(this.persistDir, this.persistFilename);

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });

    const line = JSON.stringify(event);
    await writeFile(filePath, line + '\n', 'utf-8');
  }

  /**
   * Persist all events to disk.
   * Overwrites the existing file with all current events.
   */
  async persistAll(): Promise<void> {
    if (!this.persistDir || this.events.length === 0) return;

    const filePath = join(this.persistDir, this.persistFilename);

    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });

    const lines = this.events.map((e) => JSON.stringify(e));
    await writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
  }

  /**
   * Load events from disk.
   * Merges with existing events, avoiding duplicates.
   */
  async loadFromDisk(): Promise<ActivityEvent[]> {
    if (!this.persistDir) return [];

    const filePath = join(this.persistDir, this.persistFilename);

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.trim());

      const loadedEvents: ActivityEvent[] = [];
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as ActivityEvent;
          loadedEvents.push(event);
        } catch {
          // Skip invalid lines
        }
      }

      // Merge loaded events, keeping the most recent ones
      if (loadedEvents.length > 0) {
        const existingIds = new Set(this.events.map((e) => e.id));
        const newEvents = loadedEvents.filter((e) => !existingIds.has(e.id));
        this.events = [...this.events, ...newEvents];

        // Trim to max capacity
        if (this.events.length > this.maxEvents) {
          this.events = this.events.slice(-this.maxEvents);
        }
      }

      return loadedEvents;
    } catch {
      return [];
    }
  }

  /**
   * Convert events to a format suitable for timeline display.
   * Maps activity events to timeline-compatible format.
   */
  toTimelineFormat(): TimelineEvent[] {
    return this.events.map((event) => ({
      timestamp: event.timestamp,
      type: this.mapCategoryToTimelineType(event.category),
      description: event.description,
      severity: event.severity,
      category: event.category,
      eventId: event.id,
      iteration: event.iteration,
      taskId: event.taskId,
    }));
  }

  /**
   * Map activity event category to timeline event type.
   */
  private mapCategoryToTimelineType(
    category: ActivityEventCategory
  ): 'started' | 'agent_running' | 'task_completed' | 'completed' | 'failed' | 'skipped' | 'interrupted' | 'info' {
    switch (category) {
      case 'engine':
        if (this.events.some((e) => e.id === 'started')) return 'started';
        return 'info';
      case 'iteration':
        if (this.events.some((e) => e.eventType === 'completed')) return 'completed';
        if (this.events.some((e) => e.eventType === 'failed')) return 'failed';
        return 'info';
      case 'task':
        if (this.events.some((e) => e.eventType === 'completed')) return 'task_completed';
        return 'info';
      case 'agent':
        return 'agent_running';
      case 'subagent':
        if (this.events.some((e) => e.eventType === 'error')) return 'failed';
        return 'info';
      default:
        return 'info';
    }
  }
}

/**
 * Timeline event format for UI display.
 * Derived from ActivityEvent but optimized for rendering.
 */
export interface TimelineEvent {
  /** Event timestamp */
  timestamp: string;
  /** Event type for display */
  type: 'started' | 'agent_running' | 'task_completed' | 'completed' | 'failed' | 'skipped' | 'interrupted' | 'info';
  /** Human-readable description */
  description: string;
  /** Severity level */
  severity: ActivityEventSeverity;
  /** Original category */
  category: ActivityEventCategory;
  /** Original event ID */
  eventId: string;
  /** Iteration number */
  iteration?: number;
  /** Task ID */
  taskId?: string;
}

/**
 * Create a helper function to create engine activity events.
 */
export function createEngineEvent(
  eventType: 'started' | 'stopped' | 'paused' | 'resumed' | 'warning',
  description: string,
  options: {
    iteration?: number;
    severity?: ActivityEventSeverity;
    metadata?: Record<string, unknown>;
  } = {}
): Omit<ActivityEvent, 'id'> {
  return {
    category: 'engine',
    eventType,
    timestamp: new Date().toISOString(),
    severity: options.severity ?? 'info',
    description,
    iteration: options.iteration,
    metadata: options.metadata,
  };
}

/**
 * Create a helper function to create iteration activity events.
 */
export function createIterationEvent(
  eventType: 'started' | 'completed' | 'failed' | 'retrying' | 'skipped' | 'rate-limited',
  description: string,
  options: {
    iteration: number;
    taskId: string;
    taskTitle: string;
    severity?: ActivityEventSeverity;
    metadata?: Record<string, unknown>;
  }
): Omit<ActivityEvent, 'id'> {
  let severity: ActivityEventSeverity = options.severity ?? 'info';
  if (eventType === 'failed' || eventType === 'rate-limited') {
    severity = 'warning';
  }
  if (eventType === 'failed' && options.metadata?.error) {
    severity = 'error';
  }

  return {
    category: 'iteration',
    eventType,
    timestamp: new Date().toISOString(),
    severity,
    description,
    iteration: options.iteration,
    taskId: options.taskId,
    taskTitle: options.taskTitle,
    metadata: options.metadata,
  };
}

/**
 * Create a helper function to create task activity events.
 */
export function createTaskEvent(
  eventType: 'selected' | 'activated' | 'completed' | 'blocked',
  description: string,
  options: {
    iteration: number;
    taskId: string;
    taskTitle: string;
    severity?: ActivityEventSeverity;
    metadata?: Record<string, unknown>;
  }
): Omit<ActivityEvent, 'id'> {
  const severity = eventType === 'blocked' ? 'warning' : options.severity ?? 'info';

  return {
    category: 'task',
    eventType,
    timestamp: new Date().toISOString(),
    severity,
    description,
    iteration: options.iteration,
    taskId: options.taskId,
    taskTitle: options.taskTitle,
    metadata: options.metadata,
  };
}

/**
 * Create a helper function to create agent activity events.
 */
export function createAgentEvent(
  eventType: 'output' | 'switched' | 'rate-limited' | 'recovery-attempted' | 'all-limited',
  description: string,
  options: {
    iteration?: number;
    taskId?: string;
    agentPlugin: string;
    severity?: ActivityEventSeverity;
    metadata?: Record<string, unknown>;
  }
): Omit<ActivityEvent, 'id'> {
  const severity =
    eventType === 'rate-limited' || eventType === 'all-limited'
      ? 'warning'
      : options.severity ?? 'info';

  return {
    category: 'agent',
    eventType,
    timestamp: new Date().toISOString(),
    severity,
    description,
    iteration: options.iteration,
    taskId: options.taskId,
    agentPlugin: options.agentPlugin,
    metadata: options.metadata,
  };
}

/**
 * Create a helper function to create subagent activity events.
 */
export function createSubagentEvent(
  eventType: 'spawn' | 'progress' | 'complete' | 'error',
  description: string,
  options: {
    iteration?: number;
    taskId?: string;
    agentPlugin?: string;
    subagentId?: string;
    severity?: ActivityEventSeverity;
    metadata?: Record<string, unknown>;
    parentEventId?: string;
  }
): Omit<ActivityEvent, 'id'> {
  const severity = eventType === 'error' ? 'error' : options.severity ?? 'info';

  return {
    category: 'subagent',
    eventType,
    timestamp: new Date().toISOString(),
    severity,
    description,
    iteration: options.iteration,
    taskId: options.taskId,
    agentPlugin: options.agentPlugin,
    parentEventId: options.parentEventId,
    metadata: {
      subagentId: options.subagentId,
      ...options.metadata,
    },
  };
}

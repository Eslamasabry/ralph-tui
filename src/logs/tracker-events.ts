/**
 * ABOUTME: Persists tracker and iteration metadata to a local JSONL log file.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { IterationStatus } from '../engine/types.js';

export const TRACKER_EVENTS_FILE = '.ralph-tui/tracker-events.jsonl';

export type TrackerLogEvent =
  | {
      type: 'tracker:sync-start';
      timestamp: string;
      tracker: string;
      epicId?: string;
      workingDir?: string;
    }
  | {
      type: 'tracker:sync-complete';
      timestamp: string;
      tracker: string;
      success: boolean;
      durationMs: number;
      message?: string;
      error?: string;
    }
  | {
      type: 'tracker:new-task';
      timestamp: string;
      tracker: string;
      taskId: string;
      title: string;
      parentId?: string;
      status?: string;
      priority?: number;
    }
  | {
      type: 'iteration:started';
      timestamp: string;
      tracker: string;
      iteration: number;
      taskId: string;
      taskTitle: string;
    }
  | {
      type: 'iteration:completed';
      timestamp: string;
      tracker: string;
      iteration: number;
      taskId: string;
      taskTitle: string;
      status: IterationStatus;
      durationMs: number;
      taskCompleted: boolean;
    }
  | {
      type: 'iteration:failed';
      timestamp: string;
      tracker: string;
      iteration: number;
      taskId: string;
      taskTitle: string;
      error: string;
      action: 'retry' | 'skip' | 'abort';
    };

export async function appendTrackerEvent(cwd: string, event: TrackerLogEvent): Promise<void> {
  const filePath = join(cwd, TRACKER_EVENTS_FILE);
  const dirPath = dirname(filePath);

  try {
    await mkdir(dirPath, { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf-8');
  } catch {
    // Ignore logging errors to avoid interrupting execution
  }
}

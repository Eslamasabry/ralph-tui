/**
 * ABOUTME: Persists parallel merge events to a local JSONL log file.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ParallelEvent } from '../engine/parallel/types.js';

export const PARALLEL_EVENTS_FILE = '.ralph-tui/logs/parallel-events.jsonl';
const PARALLEL_EVENTS_FALLBACK_FILE = 'logs/parallel-events.jsonl';

const LOGGABLE_TYPES = new Set<ParallelEvent['type']>([
  'parallel:started',
  'parallel:stopped',
  'parallel:merge-queued',
  'parallel:merge-succeeded',
  'parallel:merge-failed',
  'parallel:main-sync-skipped',
  'parallel:main-sync-succeeded',
]);

export function shouldLogParallelEvent(event: ParallelEvent): boolean {
  return LOGGABLE_TYPES.has(event.type);
}

export async function appendParallelEvent(cwd: string, event: ParallelEvent): Promise<void> {
  if (!shouldLogParallelEvent(event)) {
    return;
  }

  const targets = [PARALLEL_EVENTS_FILE, PARALLEL_EVENTS_FALLBACK_FILE];

  for (const target of targets) {
    try {
      const filePath = join(cwd, target);
      const dirPath = dirname(filePath);
      await mkdir(dirPath, { recursive: true });
      await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf-8');
    } catch {
      // Ignore logging errors to avoid interrupting execution
    }
  }
}

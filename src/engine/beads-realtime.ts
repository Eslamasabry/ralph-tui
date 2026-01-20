/**
 * ABOUTME: Beads SQLite realtime watcher using PRAGMA data_version polling.
 */

import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { TrackerRealtimeStatus } from './types.js';

export interface BeadsRealtimeWatcherOptions {
  dbPath: string;
  liveIntervalMs?: number;
  fallbackIntervalMs?: number;
  onChange: () => Promise<void>;
  onStatusChange?: (status: TrackerRealtimeStatus, intervalMs: number, reason?: string) => void;
}

type DataVersionRow = {
  data_version: number;
};

export class BeadsRealtimeWatcher {
  private readonly dbPath: string;
  private readonly liveIntervalMs: number;
  private readonly fallbackIntervalMs: number;
  private readonly onChange: () => Promise<void>;
  private readonly onStatusChange?: (status: TrackerRealtimeStatus, intervalMs: number, reason?: string) => void;

  private db: Database | null = null;
  private liveTimer: ReturnType<typeof setInterval> | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private lastDataVersion: number | null = null;
  private status: TrackerRealtimeStatus | null = null;
  private statusIntervalMs: number | null = null;
  private refreshInFlight = false;

  constructor(options: BeadsRealtimeWatcherOptions) {
    this.dbPath = options.dbPath;
    this.liveIntervalMs = options.liveIntervalMs ?? 1000;
    this.fallbackIntervalMs = options.fallbackIntervalMs ?? 5000;
    this.onChange = options.onChange;
    this.onStatusChange = options.onStatusChange;
  }

  start(): void {
    if (this.liveTimer || this.fallbackTimer) {
      return;
    }

    if (!this.tryStartLive()) {
      this.startFallback('Beads SQLite database not available');
    }
  }

  stop(): void {
    this.stopLiveTimer();
    this.stopFallbackTimer();
    this.closeDb();
  }

  private tryStartLive(): boolean {
    if (!existsSync(this.dbPath)) {
      return false;
    }

    try {
      this.db = new Database(this.dbPath, { readonly: true });
      this.lastDataVersion = this.readDataVersion();
      this.setStatus('live', this.liveIntervalMs);
      this.liveTimer = setInterval(() => {
        void this.checkForChanges();
      }, this.liveIntervalMs);
      return true;
    } catch (error) {
      this.closeDb();
      this.lastDataVersion = null;
      return false;
    }
  }

  private async checkForChanges(): Promise<void> {
    if (!this.db) {
      this.startFallback('Beads SQLite connection lost');
      return;
    }

    try {
      const currentVersion = this.readDataVersion();
      if (this.lastDataVersion === null) {
        this.lastDataVersion = currentVersion;
        return;
      }

      if (currentVersion !== this.lastDataVersion) {
        this.lastDataVersion = currentVersion;
        await this.refreshTasks();
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to read data_version';
      this.startFallback(reason);
    }
  }

  private startFallback(reason?: string): void {
    this.stopLiveTimer();
    this.closeDb();
    this.lastDataVersion = null;

    if (!this.fallbackTimer) {
      this.fallbackTimer = setInterval(() => {
        void this.handleFallbackTick();
      }, this.fallbackIntervalMs);
    }

    this.setStatus('stale', this.fallbackIntervalMs, reason);
    void this.refreshTasks();
  }

  private async handleFallbackTick(): Promise<void> {
    await this.refreshTasks();

    if (this.status === 'stale' && this.tryStartLive()) {
      this.stopFallbackTimer();
    }
  }

  private readDataVersion(): number {
    if (!this.db) {
      throw new Error('Database not open');
    }

    const row = this.db.query('PRAGMA data_version').get() as DataVersionRow | undefined;
    if (!row || typeof row.data_version !== 'number') {
      throw new Error('PRAGMA data_version returned no results');
    }

    return row.data_version;
  }

  private async refreshTasks(): Promise<void> {
    if (this.refreshInFlight) {
      return;
    }

    this.refreshInFlight = true;
    try {
      await this.onChange();
    } finally {
      this.refreshInFlight = false;
    }
  }

  private setStatus(status: TrackerRealtimeStatus, intervalMs: number, reason?: string): void {
    if (this.status === status && this.statusIntervalMs === intervalMs) {
      return;
    }

    this.status = status;
    this.statusIntervalMs = intervalMs;
    this.onStatusChange?.(status, intervalMs, reason);
  }

  private stopLiveTimer(): void {
    if (this.liveTimer) {
      clearInterval(this.liveTimer);
      this.liveTimer = null;
    }
  }

  private stopFallbackTimer(): void {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private closeDb(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Ignore close errors
      }
      this.db = null;
    }
  }
}

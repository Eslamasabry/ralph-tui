/**
 * ABOUTME: Tests for the output-buffer external store slice.
 * Validates live output append/set flows and parallel output buffer behavior.
 */

import { describe, expect, test } from 'bun:test';
import { createOutputBufferStore, selectRawLog } from '../../../src/tui/stores/output-buffer.js';

describe('output-buffer store', () => {
  test('initializes empty buffers', () => {
    const store = createOutputBufferStore();
    const state = store.getState();

    expect(state.currentOutput).toBe('');
    expect(state.currentCliOutput).toBe('');
    expect(state.currentSegments).toEqual([]);
    expect(state.parallelOutputs.size).toBe(0);
    expect(state.parallelSegments.size).toBe(0);
    expect(state.version).toBe(0);
  });

  test('appends output and bumps version', () => {
    const store = createOutputBufferStore();

    store.dispatch({ type: 'output/append-current-output', chunk: 'hello' });
    store.dispatch({ type: 'output/append-current-output', chunk: ' world' });
    store.dispatch({ type: 'output/append-cli-output', chunk: 'cli-line' });

    const state = store.getState();
    expect(state.currentOutput).toBe('hello world');
    expect(state.currentCliOutput).toBe('cli-line');
    expect(state.version).toBe(3);
  });

  test('stores parallel output independently by key', () => {
    const store = createOutputBufferStore();

    store.dispatch({ type: 'output/set-parallel-output', key: 'task-1:1', output: 'A' });
    store.dispatch({ type: 'output/append-parallel-output', key: 'task-1:1', chunk: 'B' });
    store.dispatch({ type: 'output/set-parallel-output', key: 'task-2:1', output: 'X' });

    const state = store.getState();
    expect(state.parallelOutputs.get('task-1:1')).toBe('AB');
    expect(state.parallelOutputs.get('task-2:1')).toBe('X');
  });

  test('enforces 500KB cap for current output using FIFO trimming', () => {
    const store = createOutputBufferStore();
    const chunk = 'a'.repeat(300_000);

    store.dispatch({ type: 'output/append-current-output', chunk });
    store.dispatch({ type: 'output/append-current-output', chunk });

    const state = store.getState();
    expect(state.currentOutput.length).toBe(500_000);
    expect(state.currentOutput.startsWith('a')).toBe(true);
  });

  test('enforces 500KB cap for parallel task output independently', () => {
    const store = createOutputBufferStore();
    const chunk = 'b'.repeat(260_000);

    store.dispatch({ type: 'output/append-parallel-output', key: 'task-1:1', chunk });
    store.dispatch({ type: 'output/append-parallel-output', key: 'task-1:1', chunk });
    store.dispatch({ type: 'output/append-parallel-output', key: 'task-2:1', chunk: 'short' });

    const state = store.getState();
    expect(state.parallelOutputs.get('task-1:1')?.length).toBe(500_000);
    expect(state.parallelOutputs.get('task-2:1')).toBe('short');
  });

  test('clears a single parallel buffer and all parallel buffers', () => {
    const store = createOutputBufferStore();

    store.dispatch({ type: 'output/set-parallel-output', key: 'task-1:1', output: 'abc' });
    store.dispatch({ type: 'output/set-parallel-output', key: 'task-2:1', output: 'xyz' });
    store.dispatch({ type: 'output/clear-parallel-output', key: 'task-1:1' });

    expect(store.getState().parallelOutputs.has('task-1:1')).toBe(false);
    expect(store.getState().parallelOutputs.has('task-2:1')).toBe(true);

    store.dispatch({ type: 'output/clear-parallel' });

    const state = store.getState();
    expect(state.parallelOutputs.size).toBe(0);
    expect(state.parallelSegments.size).toBe(0);
  });

  test('notifies subscribers for meaningful changes only', () => {
    const store = createOutputBufferStore();

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({ type: 'output/append-current-output', chunk: '' });
    expect(notifications).toBe(0);

    store.dispatch({ type: 'output/append-current-output', chunk: 'x' });
    expect(notifications).toBe(1);

    unsubscribe();
    store.dispatch({ type: 'output/append-current-output', chunk: 'y' });
    expect(notifications).toBe(1);
  });

  test('prefers CLI stream for raw logs when present', () => {
    const store = createOutputBufferStore();

    store.dispatch({ type: 'output/append-current-output', chunk: 'stdout chunk' });
    expect(selectRawLog(store.getState())).toBe('stdout chunk');

    store.dispatch({ type: 'output/append-cli-output', chunk: 'stderr chunk' });
    expect(selectRawLog(store.getState())).toBe('stderr chunk');
  });
});

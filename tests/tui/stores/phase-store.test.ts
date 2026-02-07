/**
 * ABOUTME: Tests for the phase external store slice.
 * Verifies phase transitions, header metadata updates, and subscription semantics.
 */

import { describe, expect, test } from 'bun:test';
import { canTransitionPhase, createPhaseStore } from '../../../src/tui/stores/phase-store.js';

describe('phase-store', () => {
  test('initializes with defaults', () => {
    const store = createPhaseStore();
    const state = store.getState();

    expect(state.status).toBe('ready');
    expect(state.currentIteration).toBe(0);
    expect(state.maxIterations).toBe(0);
    expect(state.activeAgentState).toBeNull();
    expect(state.rateLimitState).toBeNull();
    expect(state.rateLimitElapsedSeconds).toBe(0);
  });

  test('updates phase fields via dispatch', () => {
    const store = createPhaseStore();

    store.dispatch({ type: 'phase/set-status', status: 'running' });
    store.dispatch({ type: 'phase/set-iteration', currentIteration: 3 });
    store.dispatch({ type: 'phase/set-max-iterations', maxIterations: 10 });
    store.dispatch({ type: 'phase/set-current-task', taskId: 'task-7', taskTitle: 'Ship store layer' });
    store.dispatch({ type: 'phase/set-current-model', currentModel: 'anthropic/claude-3-5-sonnet' });

    const state = store.getState();
    expect(state.status).toBe('running');
    expect(state.currentIteration).toBe(3);
    expect(state.maxIterations).toBe(10);
    expect(state.currentTaskId).toBe('task-7');
    expect(state.currentTaskTitle).toBe('Ship store layer');
    expect(state.currentModel).toBe('anthropic/claude-3-5-sonnet');
  });

  test('resets to defaults with optional overrides', () => {
    const store = createPhaseStore({ status: 'running', currentIteration: 5, maxIterations: 12 });

    store.dispatch({ type: 'phase/reset', state: { status: 'paused' } });

    const state = store.getState();
    expect(state.status).toBe('paused');
    expect(state.currentIteration).toBe(0);
    expect(state.maxIterations).toBe(0);
  });

  test('notifies subscribers only when state changes', () => {
    const store = createPhaseStore();

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.dispatch({ type: 'phase/set-status', status: 'ready' });
    expect(notifications).toBe(0);

    store.dispatch({ type: 'phase/set-status', status: 'running' });
    expect(notifications).toBe(1);

    unsubscribe();
    store.dispatch({ type: 'phase/set-status', status: 'paused' });
    expect(notifications).toBe(1);
  });

  test('exposes all operational phases in guard table', () => {
    const phases = [
      'ready',
      'running',
      'selecting',
      'executing',
      'pausing',
      'paused',
      'stopped',
      'complete',
      'idle',
      'error',
    ] as const;

    for (const from of phases) {
      expect(canTransitionPhase(from, from)).toBe(true);
    }
  });

  test('accepts valid lifecycle transitions and rejects invalid transitions', () => {
    const store = createPhaseStore({ status: 'ready' });

    store.dispatch({ type: 'phase/set-status', status: 'selecting' });
    store.dispatch({ type: 'phase/set-status', status: 'executing' });
    store.dispatch({ type: 'phase/set-status', status: 'pausing' });
    store.dispatch({ type: 'phase/set-status', status: 'paused' });
    store.dispatch({ type: 'phase/set-status', status: 'running' });
    store.dispatch({ type: 'phase/set-status', status: 'complete' });

    expect(store.getState().status).toBe('complete');

    // Invalid from complete -> pausing should be rejected by guard table.
    store.dispatch({ type: 'phase/set-status', status: 'pausing' });
    expect(store.getState().status).toBe('complete');
  });

  test('rejects impossible idle -> complete transition', () => {
    const store = createPhaseStore({ status: 'idle' });

    store.dispatch({ type: 'phase/set-status', status: 'complete' });

    expect(store.getState().status).toBe('idle');
  });

  test('ticks rate-limit elapsed time while limited', () => {
    const limitedAt = new Date(Date.now() - 5_000).toISOString();
    const store = createPhaseStore();

    store.dispatch({
      type: 'phase/set-rate-limit',
      rateLimitState: {
        primaryAgent: 'claude',
        fallbackAgent: 'opencode',
        limitedAt,
      },
    });

    const beforeTick = store.getState().rateLimitElapsedSeconds;
    store.dispatch({ type: 'phase/tick-rate-limit' });
    const afterTick = store.getState().rateLimitElapsedSeconds;

    expect(afterTick).toBeGreaterThanOrEqual(beforeTick);

    store.dispatch({ type: 'phase/set-rate-limit', rateLimitState: null });
    expect(store.getState().rateLimitElapsedSeconds).toBe(0);
  });
});

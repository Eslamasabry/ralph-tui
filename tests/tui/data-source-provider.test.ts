/**
 * ABOUTME: Tests local data source provider routing helpers.
 * Verifies tab clamping, source resolution, and tab switch event construction.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildTabSwitchEvent,
  clampTabIndex,
  resolveDataSourceForTab,
  isSameDataSource,
  createDataSourceSnapshot,
  restoreDataSourceSnapshot,
  type DataSourceTab,
} from '../../src/tui/components/DataSourceProvider.js';
import { createTuiStores } from '../../src/tui/stores/tui-provider.js';

describe('clampTabIndex', () => {
  test('clamps to zero when tab count is empty', () => {
    expect(clampTabIndex(4, 0)).toBe(0);
  });

  test('clamps negative index to zero', () => {
    expect(clampTabIndex(-2, 3)).toBe(0);
  });

  test('clamps high index to last tab', () => {
    expect(clampTabIndex(99, 3)).toBe(2);
  });

  test('returns index when already in range', () => {
    expect(clampTabIndex(1, 3)).toBe(1);
  });
});

describe('resolveDataSourceForTab', () => {
  test('returns local source for local tab', () => {
    const source = resolveDataSourceForTab({ id: 'local', isLocal: true });
    expect(source).toEqual({ kind: 'local', id: 'local' });
  });

  test('returns local fallback with remote alias scaffold for remote tab', () => {
    const source = resolveDataSourceForTab({ id: 'remote-a', alias: 'prod-a', isLocal: false });
    expect(source).toEqual({ kind: 'local', id: 'local', requestedRemoteAlias: 'prod-a' });
  });

  test('returns local source when tab is undefined', () => {
    const source = resolveDataSourceForTab(undefined);
    expect(source).toEqual({ kind: 'local', id: 'local' });
  });
});

describe('buildTabSwitchEvent', () => {
  const tabs: DataSourceTab[] = [
    { id: 'local', isLocal: true },
    { id: 'remote-a', alias: 'prod-a', isLocal: false },
  ];

  test('builds event with requested source and indices', () => {
    const event = buildTabSwitchEvent(0, 1, tabs);
    expect(event.fromTabIndex).toBe(0);
    expect(event.toTabIndex).toBe(1);
    expect(event.source).toEqual({ kind: 'local', id: 'local', requestedRemoteAlias: 'prod-a' });
  });

  test('clamps event target index to available tabs', () => {
    const event = buildTabSwitchEvent(0, 99, tabs);
    expect(event.toTabIndex).toBe(1);
    expect(event.source.requestedRemoteAlias).toBe('prod-a');
  });
});

describe('isSameDataSource', () => {
  test('returns true for matching descriptors', () => {
    const a = { kind: 'local', id: 'local' as const };
    const b = { kind: 'local', id: 'local' as const };
    expect(isSameDataSource(a, b)).toBe(true);
  });

  test('returns false when requested alias differs', () => {
    const a = { kind: 'local', id: 'local' as const, requestedRemoteAlias: 'alpha' };
    const b = { kind: 'local', id: 'local' as const, requestedRemoteAlias: 'beta' };
    expect(isSameDataSource(a, b)).toBe(false);
  });
});

describe('snapshot helpers', () => {
  test('captures and restores store snapshot fidelity', () => {
    const stores = createTuiStores({
      phase: { status: 'running', currentIteration: 3 },
      output: { currentOutput: 'alpha' },
      tasks: {
        tasks: [{ id: 't1', title: 'Task 1', status: 'actionable' }],
      },
    });

    const snapshot = createDataSourceSnapshot(stores);

    stores.phase.dispatch({ type: 'phase/set-status', status: 'paused' });
    stores.output.dispatch({ type: 'output/set-current-output', output: 'mutated' });
    stores.tasks.dispatch({ type: 'tasks/set-tasks', tasks: [] });

    restoreDataSourceSnapshot(stores, snapshot);

    expect(stores.phase.getState().status).toBe('running');
    expect(stores.phase.getState().currentIteration).toBe(3);
    expect(stores.output.getState().currentOutput).toBe('alpha');
    expect(stores.tasks.getState().tasks).toHaveLength(1);
    expect(stores.tasks.getState().tasks[0]?.id).toBe('t1');
  });
});

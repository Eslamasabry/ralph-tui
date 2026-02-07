/**
 * ABOUTME: Tests active view resolution behavior.
 * Ensures ActiveView registry resolution handles static, factory, and missing views.
 */

import { describe, expect, test } from 'bun:test';
import { resolveActiveView, type ViewRegistry } from '../../src/tui/components/ActiveView.js';

describe('resolveActiveView', () => {
  test('returns static node when view id exists', () => {
    const views: ViewRegistry = {
      tasks: 'Tasks View',
    };

    const resolved = resolveActiveView('tasks', views);
    expect(resolved.found).toBe(true);
    expect(resolved.node).toBe('Tasks View');
  });

  test('invokes factory render function when view is callable', () => {
    const views: ViewRegistry = {
      logs: () => 'Logs View',
    };

    const resolved = resolveActiveView('logs', views);
    expect(resolved.found).toBe(true);
    expect(resolved.node).toBe('Logs View');
  });

  test('returns missing resolution for unknown id', () => {
    const views: ViewRegistry = {
      tasks: 'Tasks View',
      logs: () => 'Logs View',
    };

    const resolved = resolveActiveView('settings', views);
    expect(resolved.found).toBe(false);
    expect(resolved.node).toBeNull();
    expect(resolved.viewId).toBe('settings');
  });
});

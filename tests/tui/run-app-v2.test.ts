/**
 * ABOUTME: Render tests for RunApp shell wiring and placeholder view switching.
 * Verifies the shell boots and keyboard navigation changes active views.
 */

import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { act, createElement } from 'react';
import { AppShell, getAppShellViewFromHotkey, getNextAppShellView } from '../../src/tui/components/AppShell.js';
import { RunApp } from '../../src/tui/components/RunApp.js';
import { createTuiStores, TuiProvider } from '../../src/tui/stores/index.js';

async function setupRunApp() {
  return testRender(createElement(RunApp), {
    width: 120,
    height: 36,
  });
}

describe('RunApp', () => {
  test('renders shell and default tasks placeholder view', async () => {
    const app = await setupRunApp();

    try {
      await app.renderOnce();
      const frame = app.captureCharFrame();

      expect(frame).toContain('Tasks │ Iterations │ Activity │ Chat │ Logs │ Settings');
      expect(frame).toContain('Task List');
      expect(frame).toContain("No tasks found.");
    } finally {
      act(() => {
        app.renderer.destroy();
      });
    }
  });

  test('renders selected placeholder view in AppShell', async () => {
    const stores = createTuiStores({
      ui: {
        viewMode: 'chat',
      },
    });

    const app = await testRender(createElement(TuiProvider, { stores }, createElement(AppShell)), {
      width: 120,
      height: 36,
    });

    try {
      await app.renderOnce();
      expect(app.captureCharFrame()).toContain('Agent Chat');
    } finally {
      act(() => {
        app.renderer.destroy();
      });
    }
  });

  test('view switching helpers map hotkeys and tab order', () => {
    expect(getAppShellViewFromHotkey('1')).toBeNull();
    expect(getAppShellViewFromHotkey('2')).toBeNull();
    expect(getAppShellViewFromHotkey('3')).toBeNull();
    expect(getAppShellViewFromHotkey('4')).toBeNull();
    expect(getAppShellViewFromHotkey('5')).toBeNull();
    expect(getAppShellViewFromHotkey('6')).toBeNull();
    expect(getAppShellViewFromHotkey('9')).toBeNull();

    expect(getNextAppShellView('tasks', 1)).toBe('iterations');
    expect(getNextAppShellView('iterations', 1)).toBe('activity');
    expect(getNextAppShellView('settings', 1)).toBe('tasks');
    expect(getNextAppShellView('tasks', -1)).toBe('settings');
  });
});

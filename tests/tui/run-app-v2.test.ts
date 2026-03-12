/**
 * ABOUTME: Render tests for RunApp shell wiring and placeholder view switching.
 * Verifies the shell boots and keyboard navigation changes active views.
 */

import { describe, expect, test } from 'bun:test';
import { testRender } from '@opentui/react/test-utils';
import { act, createElement } from 'react';
import { AppShell, getAppShellViewFromHotkey, getNextAppShellView } from '../../src/tui/components/AppShell.js';
import { RunApp, monitorStartExecution } from '../../src/tui/components/RunApp.js';
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

  test('renders remote task state instead of stale local task state on remote tabs', async () => {
    const stores = createTuiStores({
      phase: {
        status: 'running',
        currentTaskId: 'local-1',
        currentTaskTitle: 'Local task',
      },
      tasks: {
        tasks: [{ id: 'local-1', title: 'Local task', status: 'actionable' }],
      },
      output: {
        currentOutput: 'local output',
      },
      ui: {
        selectedTabIndex: 1,
        instances: [
          { id: 'local', label: 'Local', isLocal: true, status: 'connected' },
          { id: 'remote-a', label: 'prod-a', isLocal: false, status: 'connected' },
        ],
      },
    });

    const remoteTask = {
      id: 'remote-1',
      title: 'Remote task',
      status: 'in_progress' as const,
      priority: 1 as const,
      description: 'Remote task body',
    };

    const instanceManager = {
      async getRemoteState() {
        return {
          status: 'running' as const,
          currentIteration: 4,
          currentTask: remoteTask,
          totalTasks: 1,
          tasksCompleted: 0,
          iterations: [],
          startedAt: '2026-03-10T12:00:00.000Z',
          currentOutput: 'remote output',
          currentStderr: 'remote stderr',
          activeAgent: null,
          rateLimitState: null,
          maxIterations: 10,
          tasks: [remoteTask],
          agentName: 'claude',
          trackerName: 'beads',
          currentModel: 'anthropic/claude-3-7-sonnet',
          subagentTree: [],
        };
      },
      async getRemoteTasks() {
        return [remoteTask];
      },
    };

    const app = await testRender(
      createElement(
        TuiProvider,
        { stores },
        createElement(AppShell, {
          instanceManager: instanceManager as never,
        })
      ),
      {
        width: 120,
        height: 36,
      }
    );

    try {
      await act(async () => {
        await app.renderOnce();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await app.renderOnce();

      const frame = app.captureCharFrame();
      expect(frame).toContain('Remote task');
      expect(frame).not.toContain('Local task');
    } finally {
      act(() => {
        app.renderer.destroy();
      });
    }
  });

  test('clears stale remote task state when a remote refresh fails', async () => {
    const stores = createTuiStores({
      ui: {
        selectedTabIndex: 1,
        instances: [
          { id: 'local', label: 'Local', isLocal: true, status: 'connected' },
          { id: 'remote-a', label: 'prod-a', isLocal: false, status: 'connected' },
        ],
      },
    });

    const remoteTask = {
      id: 'remote-1',
      title: 'Remote task',
      status: 'in_progress' as const,
      priority: 1 as const,
      description: 'Remote task body',
    };

    const stateResponses = [
      () => Promise.resolve({
        status: 'running' as const,
        currentIteration: 2,
        currentTask: remoteTask,
        totalTasks: 1,
        tasksCompleted: 0,
        iterations: [],
        startedAt: '2026-03-10T12:00:00.000Z',
        currentOutput: 'remote output',
        currentStderr: 'remote stderr',
        activeAgent: null,
        rateLimitState: null,
        maxIterations: 10,
        tasks: [remoteTask],
        agentName: 'claude',
        trackerName: 'beads',
        currentModel: 'anthropic/claude-3-7-sonnet',
        subagentTree: [],
      }),
      () => Promise.reject(new Error('Failed to fetch remote state.')),
    ];
    const taskResponses = [
      () => Promise.resolve([remoteTask]),
      () => Promise.reject(new Error('Failed to fetch remote tasks.')),
    ];

    const instanceManager = {
      async getRemoteState() {
        const nextResponse = stateResponses.shift();
        return nextResponse ? nextResponse() : Promise.reject(new Error('No state response queued.'));
      },
      async getRemoteTasks() {
        const nextResponse = taskResponses.shift();
        return nextResponse ? nextResponse() : Promise.reject(new Error('No task response queued.'));
      },
    };

    const app = await testRender(
      createElement(
        TuiProvider,
        { stores },
        createElement(AppShell, {
          instanceManager: instanceManager as never,
        })
      ),
      {
        width: 120,
        height: 36,
      }
    );

    try {
      await app.renderOnce();
      await act(async () => {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await app.renderOnce();

      expect(app.captureCharFrame()).toContain('Remote task');

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2100));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await app.renderOnce();

      const frame = app.captureCharFrame();
      expect(frame).not.toContain('Remote task');
      expect(frame).toContain('Idle');
    } finally {
      act(() => {
        app.renderer.destroy();
      });
    }
  });

  test('does not render live remote output for a non-current selected remote task', async () => {
    const stores = createTuiStores({
      ui: {
        selectedTabIndex: 1,
        selectedTaskId: 'remote-2',
        viewMode: 'logs',
        instances: [
          { id: 'local', label: 'Local', isLocal: true, status: 'connected' },
          { id: 'remote-a', label: 'prod-a', isLocal: false, status: 'connected' },
        ],
      },
    });

    const currentRemoteTask = {
      id: 'remote-1',
      title: 'Current remote task',
      status: 'in_progress' as const,
      priority: 1 as const,
      description: 'Current remote task body',
    };
    const selectedRemoteTask = {
      id: 'remote-2',
      title: 'Selected remote task',
      status: 'open' as const,
      priority: 2 as const,
      description: 'Selected remote task body',
    };

    const instanceManager = {
      async getRemoteState() {
        return {
          status: 'running' as const,
          currentIteration: 4,
          currentTask: currentRemoteTask,
          totalTasks: 2,
          tasksCompleted: 0,
          iterations: [],
          startedAt: '2026-03-10T12:00:00.000Z',
          currentOutput: 'current remote stdout',
          currentStderr: 'current remote stderr',
          activeAgent: null,
          rateLimitState: null,
          maxIterations: 10,
          tasks: [currentRemoteTask, selectedRemoteTask],
          agentName: 'claude',
          trackerName: 'beads',
          currentModel: 'anthropic/claude-3-7-sonnet',
          subagentTree: [],
        };
      },
      async getRemoteTasks() {
        return [currentRemoteTask, selectedRemoteTask];
      },
    };

    const app = await testRender(
      createElement(
        TuiProvider,
        { stores },
        createElement(AppShell, {
          instanceManager: instanceManager as never,
        })
      ),
      {
        width: 120,
        height: 36,
      }
    );

    try {
      await app.renderOnce();
      await act(async () => {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await app.renderOnce();

      const frame = app.captureCharFrame();
      expect(frame).toContain('Selected remote task');
      expect(frame).not.toContain('current remote stdout');
      expect(frame).not.toContain('current remote stderr');
    } finally {
      act(() => {
        app.renderer.destroy();
      });
    }
  });

  test('renders selected task output instead of the global live buffer in parallel mode', async () => {
    const stores = createTuiStores({
      phase: {
        status: 'running',
        currentTaskId: 'task-1',
        currentTaskTitle: 'Current task',
      },
      tasks: {
        selectedIndex: 1,
        tasks: [
          { id: 'task-1', title: 'Current task', status: 'active' },
          { id: 'task-2', title: 'Selected task', status: 'actionable' },
        ],
      },
      output: {
        currentOutput: 'current task output',
        parallelOutputs: new Map([['task-2', 'selected task output']]),
      },
      ui: {
        detailsViewMode: 'output',
      },
    });

    const app = await testRender(
      createElement(TuiProvider, { stores }, createElement(AppShell)),
      {
        width: 120,
        height: 36,
      }
    );

    try {
      await app.renderOnce();
      const frame = app.captureCharFrame();

      expect(frame).toContain('selected task output');
      expect(frame).not.toContain('current task output');
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

describe('monitorStartExecution', () => {
  test('restores the previous phase when start fails before the run leaves selecting', async () => {
    let phase: 'ready' | 'selecting' = 'selecting';
    const errors: string[] = [];

    monitorStartExecution({
      previousStatus: 'ready',
      startOperation: Promise.reject(new Error('start failed')),
      getCurrentStatus: () => phase,
      restoreStatus: (status) => {
        phase = status as typeof phase;
      },
      pushError: (message) => {
        errors.push(message);
      },
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(phase).toBe('ready');
    expect(errors).toEqual(['start failed']);
  });

  test('ignores late start failures after the phase has moved past selecting', async () => {
    let phase: 'ready' | 'selecting' | 'running' = 'selecting';
    const errors: string[] = [];
    let rejectStart: (error: Error) => void = () => {};

    const startOperation = new Promise<void>((_resolve, reject) => {
      rejectStart = reject;
    });

    monitorStartExecution({
      previousStatus: 'ready',
      startOperation,
      getCurrentStatus: () => phase,
      restoreStatus: (status) => {
        phase = status as typeof phase;
      },
      pushError: (message) => {
        errors.push(message);
      },
    });

    phase = 'running';
    rejectStart(new Error('late failure'));

    await Promise.resolve();
    await Promise.resolve();

    expect(phase).toBe('running');
    expect(errors).toEqual([]);
  });

  test('does not report a startup failure while start remains pending', async () => {
    let phase: 'ready' | 'selecting' = 'selecting';
    const errors: string[] = [];

    monitorStartExecution({
      previousStatus: 'ready',
      startOperation: new Promise<void>(() => {}),
      getCurrentStatus: () => phase,
      restoreStatus: (status) => {
        phase = status as typeof phase;
      },
      pushError: (message) => {
        errors.push(message);
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(phase).toBe('selecting');
    expect(errors).toEqual([]);
  });
});

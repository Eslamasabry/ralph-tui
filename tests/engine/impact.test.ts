/**
 * ABOUTME: Tests for impact plan helpers and formatting.
 */

import { describe, expect, test } from 'bun:test';
import { formatImpactPlan, getImpactPlan, getImpactTable, parseImpactTableMarkdown } from '../../src/engine/impact.js';
import type { TaskImpactPlan } from '../../src/engine/types.js';
import type { TrackerTask } from '../../src/plugins/trackers/types.js';

function createTask(overrides: Partial<TrackerTask> = {}): TrackerTask {
  return {
    id: 'task-1',
    title: 'Impact test task',
    status: 'open',
    priority: 1,
    description: 'Test task',
    labels: [],
    type: 'story',
    ...overrides,
  };
}

function createImpactPlan(overrides: Partial<TaskImpactPlan> = {}): TaskImpactPlan {
  return {
    version: 1,
    create: [],
    modify: [],
    delete: [],
    rename: [],
    ...overrides,
  };
}

describe('impact helpers', () => {
  describe('getImpactPlan', () => {
    test('returns undefined when no plan is present', () => {
      const task = createTask();
      expect(getImpactPlan(task)).toBeUndefined();
    });

    test('returns undefined when plan version is unsupported', () => {
      const task = createTask({
        metadata: {
          impactPlan: { version: 2, create: [], modify: [], delete: [], rename: [] },
        },
      });
      expect(getImpactPlan(task)).toBeUndefined();
    });

    test('returns undefined for invalid plan shapes', () => {
      const task = createTask({
        metadata: {
          impactPlan: {
            version: 1,
            create: [{ path: 123, reason: 'bad', risk: 'low' }],
            modify: [],
            delete: [],
            rename: [],
          },
        },
      });
      expect(getImpactPlan(task)).toBeUndefined();
    });

    test('returns the plan when valid', () => {
      const plan = createImpactPlan({
        create: [{ path: 'src/new.ts', reason: 'add file', risk: 'low' }],
      });
      const task = createTask({ metadata: { impactPlan: plan } });
      expect(getImpactPlan(task)).toEqual(plan);
    });
  });

  describe('formatImpactPlan', () => {
    test('renders a missing plan warning', () => {
      const output = formatImpactPlan(undefined);
      expect(output).toContain('MISSING: Task Impact Table is required');
    });

    test('renders a full impact plan table', () => {
      const plan = createImpactPlan({
        create: [{ path: 'src/new.ts', reason: 'add file', risk: 'low' }],
        modify: [{ path: 'src/edit.ts', reason: 'update logic', risk: 'med' }],
        delete: [{ path: 'src/old.ts', reason: 'remove dead code', risk: 'low' }],
        rename: [{ from: 'src/a.ts', to: 'src/b.ts', reason: 'rename', risk: 'low' }],
        expectedChecks: [{ name: 'test', command: 'bun test' }],
        moduleTags: ['core', 'ui'],
      });

      const output = formatImpactPlan(plan);
      expect(output).toContain('## Task Impact Table (Required)');
      expect(output).toContain('| create | src/new.ts | low | add file |');
      expect(output).toContain('| modify | src/edit.ts | med | update logic |');
      expect(output).toContain('| delete | src/old.ts | low | remove dead code |');
      expect(output).toContain(`| rename | src/a.ts \u2192 src/b.ts | low | rename |`);
      expect(output).toContain('Module tags: core, ui');
      expect(output).toContain('- test: `bun test`');
    });
  });

  describe('parseImpactTableMarkdown', () => {
    test('parses a valid impact table', () => {
      const markdown = [
        '### Impact Table',
        '| Path | Change | Purpose | Notes |',
        '|------|--------|---------|------|',
        '| src/app.ts | modify | Wire up UI | optional |',
        '| src/new.ts | create | Add helper | |',
      ].join('\n');
      const entries = parseImpactTableMarkdown(markdown);
      expect(entries).toEqual([
        { path: 'src/app.ts', change: 'modify', purpose: 'Wire up UI', notes: 'optional' },
        { path: 'src/new.ts', change: 'create', purpose: 'Add helper', notes: '' },
      ]);
    });

    test('returns empty array when table declares no changes', () => {
      const markdown = [
        '## Impact Table',
        '| Path | Change | Purpose | Notes |',
        '|------|--------|---------|------|',
        '| (none) | modify | none | |',
      ].join('\n');
      const entries = parseImpactTableMarkdown(markdown);
      expect(entries).toEqual([]);
    });
  });

  describe('getImpactTable', () => {
    test('reads structured impactTable from metadata', () => {
      const task = createTask({
        metadata: {
          impactTable: [
            { path: 'src/a.ts', change: 'modify', purpose: 'Update file', notes: 'n/a' },
          ],
        },
      });
      expect(getImpactTable(task)).toEqual([
        { path: 'src/a.ts', change: 'modify', purpose: 'Update file', notes: 'n/a' },
      ]);
    });

    test('parses impact table from description', () => {
      const task = createTask({
        description: [
          '### Impact Table',
          '| Path | Change | Purpose | Notes |',
          '|------|--------|---------|------|',
          '| src/ui.ts | modify | Update UI | |',
        ].join('\n'),
      });
      expect(getImpactTable(task)).toEqual([
        { path: 'src/ui.ts', change: 'modify', purpose: 'Update UI', notes: '' },
      ]);
    });
  });
});

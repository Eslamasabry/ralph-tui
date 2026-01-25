/**
 * ABOUTME: Tests quality gate selection and flake handling in parallel validation.
 */

import { describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { ParallelCoordinator } from '../../../src/engine/parallel/coordinator.js';
import type { RalphConfig } from '../../../src/config/types.js';
import {
  DEFAULT_CHECKS_CONFIG,
  DEFAULT_ERROR_HANDLING,
  DEFAULT_IMPACT_CONFIG,
  DEFAULT_MERGE_CONFIG,
  DEFAULT_PARALLEL_CONFIG,
  DEFAULT_QUALITY_GATES_CONFIG,
  DEFAULT_RESOLVER_CONFIG,
} from '../../../src/config/types.js';
import type { ImpactEntry, ValidationCheck, ValidationPlan } from '../../../src/engine/types.js';

function createConfig(overrides: Partial<RalphConfig> = {}): RalphConfig {
  return {
    cwd: process.cwd(),
    maxIterations: 1,
    iterationDelay: 0,
    outputDir: '.ralph-tui/iterations',
    progressFile: '.ralph-tui/progress.md',
    showTui: false,
    agent: { name: 'test-agent', plugin: 'claude', options: {} },
    tracker: { name: 'test-tracker', plugin: 'json', options: {} },
    errorHandling: DEFAULT_ERROR_HANDLING,
    parallel: DEFAULT_PARALLEL_CONFIG,
    impact: DEFAULT_IMPACT_CONFIG,
    merge: DEFAULT_MERGE_CONFIG,
    resolver: DEFAULT_RESOLVER_CONFIG,
    checks: DEFAULT_CHECKS_CONFIG,
    qualityGates: DEFAULT_QUALITY_GATES_CONFIG,
    ...overrides,
  };
}

describe('ParallelCoordinator validation', () => {
  test('selects sanity/unit checks for engine changes using default rules', () => {
    const config = createConfig({
      qualityGates: {
        ...DEFAULT_QUALITY_GATES_CONFIG,
        checks: {
          sanity: { command: 'echo sanity', required: true },
          unit: { command: 'echo unit', required: false },
        },
        rules: {},
      },
    });
    const coordinator = new ParallelCoordinator(config, { maxWorkers: 1 });
    const impact: ImpactEntry[] = [
      { path: 'src/engine/parallel/coordinator.ts', change: 'modify', purpose: 'test' },
    ];

    const checks = (coordinator as any).selectChecks(impact, config.qualityGates.checks, []);
    const ids = checks.map((check: ValidationCheck) => check.id);
    expect(ids).toContain('sanity');
    expect(ids).toContain('unit');
  });

  test('selects checks from custom rules', () => {
    const config = createConfig({
      qualityGates: {
        ...DEFAULT_QUALITY_GATES_CONFIG,
        checks: {
          sanity: { command: 'echo sanity', required: true },
          unit: { command: 'echo unit', required: false },
          ui: { command: 'echo ui', required: false },
        },
        rules: {
          'src/ui/': ['ui'],
        },
      },
    });
    const coordinator = new ParallelCoordinator(config, { maxWorkers: 1 });
    const impact: ImpactEntry[] = [
      { path: 'src/ui/Button.tsx', change: 'modify', purpose: 'test' },
    ];

    const checks = (coordinator as any).selectChecks(impact, config.qualityGates.checks, []);
    const ids = checks.map((check: ValidationCheck) => check.id);
    expect(ids).toContain('ui');
    expect(ids).toContain('sanity');
  });

  test('marks a failing check as flaky when rerun passes', async () => {
    const config = createConfig({
      qualityGates: {
        ...DEFAULT_QUALITY_GATES_CONFIG,
        maxTestReruns: 1,
      },
    });
    const coordinator = new ParallelCoordinator(config, { maxWorkers: 1 });
    let callCount = 0;
    (coordinator as any).runValidationCheck = async () => {
      callCount += 1;
      return {
        exitCode: callCount === 1 ? 1 : 0,
        durationMs: 5,
        outputPath: undefined,
      };
    };

    const plan: ValidationPlan = {
      planId: 'plan-test',
      taskIds: ['task-1'],
      commits: ['abc123'],
      createdAt: new Date().toISOString(),
      rationale: 'test',
      impact: [],
      checks: [
        {
          id: 'unit',
          command: 'echo unit',
          required: true,
          retryOnFailure: true,
        },
      ],
    };

    const result = await (coordinator as any).runValidationChecks(plan, '.');
    expect(result.status).toBe('flaky');
    expect(result.checks[0].rerunExitCodes).toEqual([0]);
  });

  test('writes validation summary payload', async () => {
    const coordinator = new ParallelCoordinator(createConfig(), { maxWorkers: 1 });
    const tmpDir = '.ralph-tui/tests/validation-summary';
    const summary = {
      planId: 'plan-test',
      status: 'passed' as const,
      checks: [
        {
          id: 'sanity',
          command: 'echo ok',
          exitCode: 0,
          durationMs: 5,
          outputPath: 'sanity.log',
          rerunExitCodes: [],
        },
      ],
      fixAttempts: 0,
    };
    await (coordinator as any).writeValidationSummary(tmpDir, summary);
    const contents = await import('node:fs/promises').then((fs) =>
      fs.readFile(`${tmpDir}/summary.json`, 'utf-8')
    );
    const parsed = JSON.parse(contents) as { planId: string; status: string; endedAt: string };
    expect(parsed.planId).toBe('plan-test');
    expect(parsed.status).toBe('passed');
    expect(parsed.endedAt).toMatch(/T/);
    await rm(tmpDir, { recursive: true, force: true });
  });
});

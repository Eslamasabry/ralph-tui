/**
 * ABOUTME: Regression tests for post-run summary overlay clarity helpers.
 * Verifies outcome messaging and actionable action filtering.
 */

import { describe, expect, test } from 'bun:test';
import type { CleanupConfig } from '../../src/config/types.js';
import { getAvailableSummaryActions, getOutcomeSummary } from '../../src/tui/components/RunSummaryOverlay.js';

describe('RunSummaryOverlay outcome summary', () => {
	test('returns a clean completion message when no follow-up is needed', () => {
		const summary = getOutcomeSummary({
			status: 'complete',
			failedTasks: 0,
			pendingMainTasks: 0,
			hasMainSyncFailure: false,
		});

		expect(summary.headline).toBe('Run finished cleanly.');
		expect(summary.nextStep).toContain('Close this summary');
	});

	test('returns an issue-focused message for error status', () => {
		const summary = getOutcomeSummary({
			status: 'error',
			failedTasks: 1,
			pendingMainTasks: 0,
			hasMainSyncFailure: false,
		});

		expect(summary.headline).toBe('Run stopped with issues.');
		expect(summary.detail).toContain('failed');
	});

	test('returns follow-up message when completed with blockers', () => {
		const summary = getOutcomeSummary({
			status: 'complete',
			failedTasks: 0,
			pendingMainTasks: 2,
			hasMainSyncFailure: false,
		});

		expect(summary.headline).toBe('Run finished with follow-up needed.');
		expect(summary.nextStep).toContain('main sync');
	});
});

describe('RunSummaryOverlay actionable actions', () => {
	test('hides all actions when no callbacks are provided', () => {
		const actions = getAvailableSummaryActions({});
		expect(actions).toEqual([]);
	});

	test('shows only restore snapshot when restore callback and snapshot exist', () => {
		const actions = getAvailableSummaryActions({
			snapshotTag: 'snapshot-123',
			onRestoreSnapshot: async () => {
				return;
			},
		});

		expect(actions.map((action) => action.actionId)).toEqual(['restoreSnapshot']);
	});

	test('shows cleanup actions when cleanup callback exists', () => {
		const actions = getAvailableSummaryActions({
			onCleanupAction: (_actionId: string) => {
				return;
			},
		});

		expect(actions.map((action) => action.actionId)).toEqual([
			'syncMain',
			'pruneWorktrees',
			'deleteBranches',
			'push',
		]);
	});

	test('respects cleanup action enabled flags', () => {
		const cleanupConfig: CleanupConfig = {
			syncMain: { enabled: true },
			pruneWorktrees: { enabled: false },
			deleteBranches: { enabled: true },
			push: { enabled: false },
		};

		const actions = getAvailableSummaryActions({
			cleanupConfig,
			onCleanupAction: (_actionId: string) => {
				return;
			},
		});

		expect(actions.map((action) => action.actionId)).toEqual(['syncMain', 'deleteBranches']);
	});

	test('includes restore snapshot alongside cleanup actions when both callbacks exist', () => {
		const actions = getAvailableSummaryActions({
			snapshotTag: 'snapshot-123',
			onCleanupAction: (_actionId: string) => {
				return;
			},
			onRestoreSnapshot: async () => {
				return;
			},
		});

		expect(actions.map((action) => action.actionId)).toEqual([
			'syncMain',
			'pruneWorktrees',
			'deleteBranches',
			'push',
			'restoreSnapshot',
		]);
	});
});

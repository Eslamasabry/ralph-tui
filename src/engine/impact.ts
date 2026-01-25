/**
 * ABOUTME: Helpers for impact plan formatting and validation.
 */

import type { TrackerTask } from '../plugins/trackers/types.js';
import type { ImpactEntry, TaskImpactPlan, TaskImpactPlanEntry, TaskImpactPlanRename } from './types.js';

function isEntryArray(value: unknown): value is TaskImpactPlanEntry[] {
  return Array.isArray(value) && value.every((entry) =>
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as TaskImpactPlanEntry).path === 'string' &&
    typeof (entry as TaskImpactPlanEntry).reason === 'string' &&
    typeof (entry as TaskImpactPlanEntry).risk === 'string'
  );
}

function isRenameArray(value: unknown): value is TaskImpactPlanRename[] {
  return Array.isArray(value) && value.every((entry) =>
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as TaskImpactPlanRename).from === 'string' &&
    typeof (entry as TaskImpactPlanRename).to === 'string' &&
    typeof (entry as TaskImpactPlanRename).reason === 'string' &&
    typeof (entry as TaskImpactPlanRename).risk === 'string'
  );
}

export function getImpactPlan(task: TrackerTask): TaskImpactPlan | undefined {
  const plan = task.metadata?.impactPlan as TaskImpactPlan | undefined;
  if (!plan || plan.version !== 1) return undefined;
  if (!isEntryArray(plan.create) || !isEntryArray(plan.modify) || !isEntryArray(plan.delete) || !isRenameArray(plan.rename)) {
    return undefined;
  }
  return plan;
}

function isImpactEntryArray(value: unknown): value is ImpactEntry[] {
  return Array.isArray(value) && value.every((entry) =>
    typeof entry === 'object' &&
    entry !== null &&
    typeof (entry as ImpactEntry).path === 'string' &&
    typeof (entry as ImpactEntry).change === 'string' &&
    typeof (entry as ImpactEntry).purpose === 'string'
  );
}

export function parseImpactTableMarkdown(text: string | undefined): ImpactEntry[] | undefined {
  if (!text) return undefined;
  const lines = text.split('\n');
  const headerIndex = lines.findIndex((line) => /impact table/i.test(line));
  if (headerIndex === -1) return undefined;

  let tableStart = -1;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    if (lines[i].trim().startsWith('|')) {
      tableStart = i;
      break;
    }
    if (lines[i].trim().length > 0) {
      break;
    }
  }
  if (tableStart === -1) return undefined;

  const rows: ImpactEntry[] = [];
  for (let i = tableStart; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    const cols = line.split('|').slice(1, -1).map((col) => col.trim());
    if (cols.length < 3) continue;
    const [path, change, purpose, notesRaw] = cols;
    const notes = notesRaw ?? '';
    if (path.toLowerCase() === 'path' && change.toLowerCase() === 'change') {
      continue;
    }
    if (/^-+$/.test(path) || /^-+$/.test(change)) {
      continue;
    }
    const changeNormalized = change.toLowerCase();
    if (path.toLowerCase() === '(none)') {
      return [];
    }
    if (!['create', 'modify', 'delete', 'rename'].includes(changeNormalized)) {
      continue;
    }
    rows.push({
      path,
      change: changeNormalized as ImpactEntry['change'],
      purpose,
      notes,
    });
  }

  return rows.length > 0 ? rows : [];
}

export function getImpactTable(task: TrackerTask): ImpactEntry[] | undefined {
  const table = task.metadata?.impactTable as ImpactEntry[] | undefined;
  if (table && isImpactEntryArray(table)) {
    return table;
  }
  return parseImpactTableMarkdown(task.description);
}

function formatEntries(label: string, entries: TaskImpactPlanEntry[]): string[] {
  if (entries.length === 0) return [];
  return entries.map((entry) => `| ${label} | ${entry.path} | ${entry.risk} | ${entry.reason} |`);
}

function formatRenames(entries: TaskImpactPlanRename[]): string[] {
  if (entries.length === 0) return [];
  return entries.map((entry) => `| rename | ${entry.from} → ${entry.to} | ${entry.risk} | ${entry.reason} |`);
}

export function formatImpactPlan(plan?: TaskImpactPlan): string {
  if (!plan) {
    return 'MISSING: Task Impact Table is required for autonomous parallel execution.';
  }

  const rows = [
    '| action | path | risk | rationale |',
    '|---|---|---|---|',
    ...formatEntries('create', plan.create),
    ...formatEntries('modify', plan.modify),
    ...formatEntries('delete', plan.delete),
    ...formatRenames(plan.rename),
  ];

  if (rows.length === 2) {
    rows.push('| (none) | (none) | low | No file changes declared |');
  }

  const checks = plan.expectedChecks?.length
    ? plan.expectedChecks.map((check) => `- ${check.name}: \`${check.command}\``).join('\n')
    : '- (none)';

  const tags = plan.moduleTags?.length ? plan.moduleTags.join(', ') : '(none)';

  return [
    '## Task Impact Table (Required)',
    rows.join('\n'),
    '',
    `Module tags: ${tags}`,
    `Expected checks:`,
    checks,
  ].join('\n');
}

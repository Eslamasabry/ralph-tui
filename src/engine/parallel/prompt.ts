/**
 * ABOUTME: Prompt builder for parallel worker execution.
 * Mirrors the core engine prompt construction logic.
 */

import type { TrackerTask, TrackerPlugin } from '../../plugins/trackers/types.js';
import type { RalphConfig } from '../../config/types.js';
import { renderPrompt } from '../../templates/index.js';
import { formatImpactPlan, getImpactPlan } from '../impact.js';
import { getRecentProgressSummary, getCodebasePatternsForPrompt } from '../../logs/index.js';

export async function buildParallelPrompt(
  task: TrackerTask,
  config: RalphConfig,
  tracker?: TrackerPlugin,
  worktreePath?: string
): Promise<string> {
  const cwd = worktreePath ?? config.cwd;
  const workerConfig: RalphConfig = { ...config, cwd };
  const recentProgress = await getRecentProgressSummary(cwd, 5);
  const codebasePatterns = await getCodebasePatternsForPrompt(cwd);
  const trackerTemplate = tracker?.getTemplate?.();
  const prdContext = await tracker?.getPrdContext?.();

  const extendedContext = {
    recentProgress,
    codebasePatterns,
    prd: prdContext ?? undefined,
    impactPlan: formatImpactPlan(getImpactPlan(task)),
  };

  const result = renderPrompt(task, workerConfig, undefined, extendedContext, trackerTemplate);

  if (result.success && result.prompt) {
    return [
      result.prompt,
      '',
      '## Worktree + Merge Phase',
      '- You are working in an isolated git worktree.',
      '- Do NOT merge, rebase, or push to main.',
      '- Do NOT switch branches (no `git checkout main`).',
      '- Do NOT use `bd` or modify `.beads`.',
      '- You may append to `.ralph-tui/progress.md` for local context, but do NOT stage or commit it.',
      '- Do NOT modify other `.ralph-tui` files.',
      '- Do NOT run tests or lint unless explicitly asked.',
      '- Do NOT run `git add .` or `git add -A`. Stage only relevant task files.',
      '- After finishing, ensure your changes are committed in THIS worktree.',
      '- Commit message format: "<task-id>: <short title>".',
      '- The coordinator will cherry-pick your commit into main.',
      '',
      '## Completion',
      'When finished, output: <promise>COMPLETE</promise>',
    ].join('\n');
  }

  console.error(`Template rendering failed: ${result.error}`);

  const lines: string[] = [];
  lines.push('## Task');
  lines.push(`**ID**: ${task.id}`);
  lines.push(`**Title**: ${task.title}`);

  if (task.description) {
    lines.push('');
    lines.push('## Description');
    lines.push(task.description);
  }

  lines.push('');
  lines.push('## Instructions');
  lines.push('Complete the task described above. When finished, signal completion with:');
  lines.push('<promise>COMPLETE</promise>');

  lines.push('');
  lines.push('## Worktree + Merge Phase');
  lines.push('- You are working in an isolated git worktree.');
  lines.push('- Do NOT merge, rebase, or push to main.');
  lines.push('- Do NOT switch branches (no `git checkout main`).');
  lines.push('- Do NOT use `bd` or modify `.beads`.');
  lines.push('- You may append to `.ralph-tui/progress.md` for local context, but do NOT stage or commit it.');
  lines.push('- Do NOT modify other `.ralph-tui` files.');
  lines.push('- Do NOT run tests or lint unless explicitly asked.');
  lines.push('- Do NOT run `git add .` or `git add -A`. Stage only relevant task files.');
  lines.push('- After finishing, ensure your changes are committed in THIS worktree.');
  lines.push('- Commit message format: "<task-id>: <short title>".');
  lines.push('- The coordinator will cherry-pick your commit into main.');

  return lines.join('\n');
}

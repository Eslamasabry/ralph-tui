/**
 * ABOUTME: Prompt builder for parallel worker execution.
 * Mirrors the core engine prompt construction logic.
 */

import type { TrackerTask, TrackerPlugin } from '../../plugins/trackers/types.js';
import type { RalphConfig } from '../../config/types.js';
import { renderPrompt } from '../../templates/index.js';
import { getRecentProgressSummary, getCodebasePatternsForPrompt } from '../../logs/index.js';

export async function buildParallelPrompt(
  task: TrackerTask,
  config: RalphConfig,
  tracker?: TrackerPlugin
): Promise<string> {
  const recentProgress = await getRecentProgressSummary(config.cwd, 5);
  const codebasePatterns = await getCodebasePatternsForPrompt(config.cwd);
  const trackerTemplate = tracker?.getTemplate?.();
  const prdContext = await tracker?.getPrdContext?.();

  const extendedContext = {
    recentProgress,
    codebasePatterns,
    prd: prdContext ?? undefined,
  };

  const result = renderPrompt(task, config, undefined, extendedContext, trackerTemplate);

  if (result.success && result.prompt) {
    return result.prompt;
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

  return lines.join('\n');
}

/**
 * ABOUTME: Parallel worker that runs a task in an isolated worktree.
 */

import type { AgentPlugin, AgentExecutionResult } from '../../plugins/agents/types.js';
import type { TrackerTask } from '../../plugins/trackers/types.js';
import type { RalphConfig } from '../../config/types.js';
import type { FormattedSegment } from '../../plugins/agents/output-formatting.js';

export interface WorkerCallbacks {
  onStdout?: (data: string) => void;
  onStdoutSegments?: (segments: FormattedSegment[]) => void;
  onStderr?: (data: string) => void;
  onJsonlMessage?: (message: Record<string, unknown>) => void;
}

export interface WorkerExecuteResult {
  result: AgentExecutionResult;
  completed: boolean;
}

export class ParallelWorker {
  readonly workerId: string;
  readonly worktreePath: string;

  private agent: AgentPlugin;
  private config: RalphConfig;
  private busy = false;

  constructor(workerId: string, worktreePath: string, agent: AgentPlugin, config: RalphConfig) {
    this.workerId = workerId;
    this.worktreePath = worktreePath;
    this.agent = agent;
    this.config = config;
  }

  isBusy(): boolean {
    return this.busy;
  }

  async executeTask(
    _task: TrackerTask,
    prompt: string,
    callbacks: WorkerCallbacks = {}
  ): Promise<WorkerExecuteResult> {
    this.busy = true;
    const flags: string[] = [];

    if (this.config.model) {
      flags.push('--model', this.config.model);
    }

    const supportsTracing = this.agent.meta.supportsSubagentTracing;

    try {
      const handle = this.agent.execute(prompt, [], {
        cwd: this.worktreePath,
        flags,
        sandbox: this.config.sandbox,
        subagentTracing: supportsTracing,
        onStdout: callbacks.onStdout,
        onStdoutSegments: callbacks.onStdoutSegments,
        onStderr: callbacks.onStderr,
        onJsonlMessage: callbacks.onJsonlMessage,
      });

      const result = await handle.promise;
      const completed = /<promise>\s*COMPLETE\s*<\/promise>/i.test(result.stdout);

      return { result, completed };
    } finally {
      this.busy = false;
    }
  }

  async dispose(): Promise<void> {
    await this.agent.dispose();
  }
}

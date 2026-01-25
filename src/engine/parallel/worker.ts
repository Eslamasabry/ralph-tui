/**
 * ABOUTME: Parallel worker that runs a task in an isolated worktree.
 */

import type { AgentPlugin, AgentExecutionResult } from '../../plugins/agents/types.js';
import { delimiter, join } from 'node:path';
import type { TrackerTask } from '../../plugins/trackers/types.js';
import type { RalphConfig } from '../../config/types.js';
import type { FormattedSegment } from '../../plugins/agents/output-formatting.js';
import { buildAgentEnv } from '../agent-env.js';

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

  tryReserve(): boolean {
    if (this.busy) {
      return false;
    }
    this.busy = true;
    return true;
  }

  releaseReservation(): void {
    this.busy = false;
  }

  async executeTask(
    _task: TrackerTask,
    prompt: string,
    callbacks: WorkerCallbacks = {}
  ): Promise<WorkerExecuteResult> {
    if (!this.busy) {
      this.busy = true;
    }
    const flags: string[] = [];

    if (this.config.model) {
      flags.push('--model', this.config.model);
    }

    const supportsTracing = this.agent.meta.supportsSubagentTracing;
    const shimPath = join(this.worktreePath, '.ralph-tui', 'bin');
    const baseEnv = await buildAgentEnv({
      cwd: this.config.cwd,
      agentId: this.config.agent.plugin,
    });
    const env = {
      ...baseEnv,
      PATH: `${shimPath}${delimiter}${process.env.PATH ?? ''}`,
      RALPH_TUI_DISABLE_BD: '1',
    };

    try {
      const handle = this.agent.execute(prompt, [], {
        cwd: this.worktreePath,
        flags,
        env,
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

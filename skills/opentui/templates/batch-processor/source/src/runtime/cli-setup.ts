#!/usr/bin/env bun
import { Command } from 'commander';
import { resolve } from 'node:path';
import type { CLIOptions } from '../core/types.js';

const VERSION = '0.1.0';

function parseOptions(options: Record<string, unknown>): CLIOptions {
  const input = options.input as string | undefined;

  return {
    input: input ? resolve(input) : undefined,
    recursive: Boolean(options.recursive),
    concurrency: Number(options.concurrency) || 5,
    dryRun: Boolean(options.dryRun),
    verbose: Boolean(options.verbose),
  };
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = new Command()
    .name('{{PROJECT_NAME}}')
    .version(VERSION)
    .description('{{PROJECT_DESCRIPTION}}')
    .option('-i, --input <path>', 'Input path')
    .option('-r, --recursive', 'Process recursively', false)
    .option('-c, --concurrency <n>', 'Concurrent operations', '5')
    .option('-d, --dry-run', 'Preview without processing', false)
    .option('-v, --verbose', 'Show detailed output', false)
    .action(async (options) => {
      const cliOptions = parseOptions(options);
      const { startTUI } = await import('../cli/tui/launcher.js');
      await startTUI(cliOptions);
    });

  await program.parseAsync(argv);
}

const isMainModule = process.argv[1]?.includes('cli-setup');
if (isMainModule) {
  runCli().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
  });
}

/**
 * ABOUTME: Build environment variables for agent execution with safe defaults.
 */

import { access, copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface AgentEnvOptions {
  cwd: string;
  agentId: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureOpenCodeDataFiles(dataHome: string): Promise<void> {
  const sourceRoot = join(homedir(), '.local', 'share', 'opencode');
  const destRoot = join(dataHome, 'opencode');
  const files = ['auth.json', 'mcp-auth.json'];

  for (const filename of files) {
    const source = join(sourceRoot, filename);
    const dest = join(destRoot, filename);

    if (await fileExists(dest)) {
      continue;
    }
    if (!(await fileExists(source))) {
      continue;
    }

    await mkdir(dirname(dest), { recursive: true });
    await copyFile(source, dest);
  }
}

async function ensureOpenCodeConfigFiles(configHome: string, safeMode: boolean): Promise<void> {
  const sourceRoots = [join(homedir(), '.config', 'opencode'), join(homedir(), '.opencode')];
  const destRoot = join(configHome, 'opencode');
  const files = ['config.json', 'opencode.json', 'opencode.jsonc'];

  if (safeMode) {
    const safeConfig = {
      $schema: 'https://opencode.ai/config.json',
      plugin: [],
    };
    await mkdir(destRoot, { recursive: true });
    await Promise.all(
      files.map((filename) => rm(join(destRoot, filename), { force: true }))
    );
    await writeFile(join(destRoot, 'opencode.json'), JSON.stringify(safeConfig, null, 2), 'utf8');
    return;
  }

  for (const filename of files) {
    const dest = join(destRoot, filename);
    if (await fileExists(dest)) {
      continue;
    }

    let copied = false;
    for (const root of sourceRoots) {
      const source = join(root, filename);
      if (!(await fileExists(source))) {
        continue;
      }
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(source, dest);
      copied = true;
      break;
    }

    if (!copied) {
      await mkdir(dirname(dest), { recursive: true });
    }
  }
}

export async function buildAgentEnv(options: AgentEnvOptions): Promise<Record<string, string>> {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  if (options.agentId === 'opencode') {
    const opencodeRoot = join(options.cwd, '.ralph-tui', 'opencode');
    const dataHome = join(opencodeRoot, 'data');
    const cacheHome = join(opencodeRoot, 'cache');
    const stateHome = join(opencodeRoot, 'state');
    const configHome = join(opencodeRoot, 'config');
    const tempDir = join(opencodeRoot, 'tmp');

    env.XDG_DATA_HOME = dataHome;
    env.XDG_CACHE_HOME = cacheHome;
    env.XDG_STATE_HOME = stateHome;
    env.XDG_CONFIG_HOME = configHome;
    env.TMPDIR = tempDir;
    env.TMP = tempDir;
    env.TEMP = tempDir;
    env.BUN_TMPDIR = tempDir;
    env.HOME = options.cwd;
    env.OPENCODE_LOG_DIR = join(dataHome, 'opencode', 'log');
    env.HUSKY = env.HUSKY ?? '0';
    env.HUSKY_SKIP_HOOKS = env.HUSKY_SKIP_HOOKS ?? '1';
    env.OPENCODE_DISABLE_PLUGINS = env.OPENCODE_DISABLE_PLUGINS ?? '1';
    env.OPENCODE_DISABLE_PLUGIN_AUTO_INSTALL =
      env.OPENCODE_DISABLE_PLUGIN_AUTO_INSTALL ?? '1';

    const safeMode = env.RALPH_TUI_OPENCODE_SAFE_CONFIG !== '0';
    await ensureOpenCodeDataFiles(dataHome);
    await ensureOpenCodeConfigFiles(configHome, safeMode);
    await mkdir(tempDir, { recursive: true });

    process.env.TMPDIR = tempDir;
    process.env.TMP = tempDir;
    process.env.TEMP = tempDir;
    process.env.BUN_TMPDIR = tempDir;
  }

  return env;
}

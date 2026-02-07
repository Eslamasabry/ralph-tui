/**
 * ABOUTME: Docs command for ralph-tui.
 * Opens documentation in the default browser or shows the URL.
 * Detects repository URL from git remote origin for accurate documentation links.
 */

import { spawn } from 'node:child_process';

/** Default repository base URL (used if git remote detection fails) */
const DEFAULT_REPO_URL = 'https://github.com/subsy/ralph-tui';

/** Documentation section paths relative to repo base */
const DOC_PATHS = {
  main: '#readme',
  quickstart: '#quick-start',
  cli: '#cli-reference',
  plugins: '#plugins',
  templates: '#prompt-templates',
  contributing: '/blob/main/CONTRIBUTING.md',
} as const;

type DocSection = keyof typeof DOC_PATHS;

/** Cached repo URL to avoid repeated git calls */
let cachedRepoUrl: string | null = null;

/**
 * Detect the GitHub repository URL from git remote origin.
 * Converts SSH URLs (git@github.com:user/repo.git) to HTTPS URLs.
 * Falls back to DEFAULT_REPO_URL if detection fails.
 */
async function getRepoUrl(): Promise<string> {
  if (cachedRepoUrl !== null) {
    return cachedRepoUrl;
  }

  try {
    const stdout = await runCommandForStdout('git', ['remote', 'get-url', 'origin']);
    const remoteUrl = stdout.trim();

    // Convert SSH URL to HTTPS URL
    // git@github.com:user/repo.git -> https://github.com/user/repo
    const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/);
    if (sshMatch) {
      cachedRepoUrl = `https://github.com/${sshMatch[1]}`;
      return cachedRepoUrl;
    }

    // Handle HTTPS URL
    // https://github.com/user/repo.git -> https://github.com/user/repo
    const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      cachedRepoUrl = `https://github.com/${httpsMatch[1]}`;
      return cachedRepoUrl;
    }

    // Fallback to default if URL format not recognized
    cachedRepoUrl = DEFAULT_REPO_URL;
    return cachedRepoUrl;
  } catch {
    // Not a git repo or git not available
    cachedRepoUrl = DEFAULT_REPO_URL;
    return cachedRepoUrl;
  }
}

async function runCommandForStdout(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      proc.kill('SIGTERM');
      reject(new Error(`Timed out running ${command}`));
    }, 5000);

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    });
    proc.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

async function runCommand(command: string, args: string[]): Promise<boolean> {
  try {
    await runCommandForStdout(command, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full documentation URL for a section.
 */
async function getDocUrl(section: DocSection): Promise<string> {
  const baseUrl = await getRepoUrl();
  return baseUrl + DOC_PATHS[section];
}

/**
 * Print help for the docs command.
 */
export function printDocsHelp(): void {
  console.log(`
ralph-tui docs - Open documentation in browser

Usage: ralph-tui docs [section] [options]

Sections:
  (none)        Open main documentation
  quickstart    Quick start guide
  cli           CLI reference
  plugins       Plugin development
  templates     Prompt templates
  contributing  Contributing guide

Options:
  --url, -u    Just print the URL (don't open browser)
  --help, -h   Show this help message

Description:
  Opens the Ralph TUI documentation in your default web browser.
  Use --url to just print the URL if you prefer to open it manually.

Examples:
  ralph-tui docs              # Open main documentation
  ralph-tui docs quickstart   # Open quick start guide
  ralph-tui docs --url        # Print main docs URL
  ralph-tui docs cli --url    # Print CLI reference URL
`);
}

/**
 * Parse docs command arguments.
 */
export function parseDocsArgs(args: string[]): { section: DocSection; urlOnly: boolean } {
  let section: DocSection = 'main';
  let urlOnly = false;

  for (const arg of args) {
    if (arg === '--url' || arg === '-u') {
      urlOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      printDocsHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      // Check if it's a valid section
      if (arg in DOC_PATHS) {
        section = arg as DocSection;
      } else {
        console.error(`Unknown section: ${arg}`);
        console.log('Available sections: quickstart, cli, plugins, templates, contributing');
        process.exit(1);
      }
    }
  }

  return { section, urlOnly };
}

/**
 * Open a URL in the default browser.
 * Uses xdg-open on Linux, open on macOS, start on Windows.
 */
async function openInBrowser(url: string): Promise<boolean> {
  const platform = process.platform;

  if (platform === 'darwin') {
    return runCommand('open', [url]);
  }

  if (platform === 'win32') {
    // explorer.exe opens URLs using the default browser.
    return runCommand('explorer.exe', [url]);
  }

  // Linux and others - try xdg-open first, then common browsers.
  if (await runCommand('xdg-open', [url])) {
    return true;
  }

  const browsers = ['firefox', 'google-chrome', 'chromium', 'brave'];
  for (const browser of browsers) {
    if (await runCommand(browser, [url])) {
      return true;
    }
  }

  return false;
}

/**
 * Execute the docs command.
 */
export async function executeDocsCommand(args: string[]): Promise<void> {
  const { section, urlOnly } = parseDocsArgs(args);
  const url = await getDocUrl(section);

  if (urlOnly) {
    console.log(url);
    return;
  }

  console.log(`Opening ${section === 'main' ? 'documentation' : section + ' documentation'}...`);
  console.log(`URL: ${url}`);
  console.log('');

  const success = await openInBrowser(url);

  if (!success) {
    console.log('Could not open browser automatically.');
    console.log('Please open the URL above manually.');
  } else {
    console.log('Documentation opened in your default browser.');
  }
}

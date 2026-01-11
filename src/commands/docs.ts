/**
 * ABOUTME: Docs command for ralph-tui.
 * Opens documentation in the default browser or shows the URL.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Documentation URLs */
const DOCS = {
  main: 'https://github.com/anthropics/ralph-tui#readme',
  quickstart: 'https://github.com/anthropics/ralph-tui#quick-start',
  cli: 'https://github.com/anthropics/ralph-tui#cli-reference',
  plugins: 'https://github.com/anthropics/ralph-tui#plugins',
  templates: 'https://github.com/anthropics/ralph-tui#prompt-templates',
  contributing: 'https://github.com/anthropics/ralph-tui/blob/main/CONTRIBUTING.md',
} as const;

type DocSection = keyof typeof DOCS;

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
      if (arg in DOCS) {
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

  try {
    if (platform === 'darwin') {
      await execAsync(`open "${url}"`);
    } else if (platform === 'win32') {
      await execAsync(`start "" "${url}"`);
    } else {
      // Linux and others - try xdg-open first, then common browsers
      try {
        await execAsync(`xdg-open "${url}"`);
      } catch {
        // Fallback to common browsers
        const browsers = ['firefox', 'google-chrome', 'chromium', 'brave'];
        let opened = false;
        for (const browser of browsers) {
          try {
            await execAsync(`which ${browser}`);
            await execAsync(`${browser} "${url}"`);
            opened = true;
            break;
          } catch {
            // Browser not found, try next
          }
        }
        if (!opened) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute the docs command.
 */
export async function executeDocsCommand(args: string[]): Promise<void> {
  const { section, urlOnly } = parseDocsArgs(args);
  const url = DOCS[section];

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

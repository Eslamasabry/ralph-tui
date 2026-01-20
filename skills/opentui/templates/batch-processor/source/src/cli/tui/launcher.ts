/**
 * TUI Launcher - Registers SolidJS transform before importing components
 */
import type { CLIOptions } from '../../core/types.js';

// CRITICAL: This must happen BEFORE any TSX imports
await import('@opentui/solid/preload');

/**
 * Start the TUI application
 */
export async function startTUI(options: CLIOptions): Promise<void> {
  // Dynamic import AFTER preload is registered
  const { startTUI: start } = await import('./app.js');
  await start(options);
}

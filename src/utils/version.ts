/**
 * ABOUTME: Resolve the running ralph-tui package version.
 */

import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Compute the path to package.json based on the current module location.
 * Works in both development (src/) and bundled (dist/) environments.
 */
export function computePackageJsonPath(currentDir: string): string {
  // Normalize path separators for consistent checking
  const normalized = currentDir.replace(/\\/g, '/');
  
  // Check if the current directory is named 'dist' (typical for bundled output)
  if (normalized.endsWith('/dist') || normalized === 'dist') {
    return join(currentDir, '..', 'package.json');
  }
  
  // Default to development structure (src/utils/ -> ../../package.json)
  return join(currentDir, '..', '..', 'package.json');
}

/**
 * Get the ralph-tui version from package.json.
 */
export async function getAppVersion(): Promise<string> {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = computePackageJsonPath(currentDir);
    const pkg = await readFile(packageJsonPath, 'utf-8');
    const parsed = JSON.parse(pkg) as { name?: string; version?: string };
    if (parsed.name === 'ralph-tui' && parsed.version) {
      return parsed.version;
    }
  } catch {
    // Fall through to unknown
  }
  return 'unknown';
}

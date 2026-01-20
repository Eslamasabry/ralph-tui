#!/usr/bin/env bun
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(repoRoot, 'dist');

// CRITICAL: Load OpenTUI's solid plugin for JSX transformation
const solidPluginPath = resolve(repoRoot, 'node_modules/@opentui/solid/scripts/solid-plugin.ts');
const solidPlugin = (await import(solidPluginPath)).default;

console.log('Building with SolidJS transform...');

mkdirSync(outdir, { recursive: true });

const result = await Bun.build({
  conditions: ['browser'],
  tsconfig: './tsconfig.json',
  plugins: [solidPlugin],
  target: 'bun',
  outdir: outdir,
  entrypoints: ['./src/runtime/cli-setup.ts'],
  minify: process.env.NODE_ENV === 'production',
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('Build complete!');
console.log(`Output: ${outdir}`);

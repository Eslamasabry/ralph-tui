#!/usr/bin/env bun
/**
 * Add Impact Tables to all open beads in ralph-tui-7py epic
 */

import { execSync } from 'child_process';

// Get all open beads
const output = execSync('bd list --parent ralph-tui-7py --status open 2>/dev/null', { encoding: 'utf-8' });
const lines = output.trim().split('\n');

const beads: Array<{ id: string; title: string; category: string }> = [];

for (const line of lines) {
  const match = line.match(/(ralph-tui-7py\.\d+).*\[●?\s*(\w+)\].*-\s*(.*)/);
  if (match) {
    beads.push({
      id: match[1],
      category: match[2],
      title: match[3].substring(0, 60),
    });
  }
}

console.log(`Found ${beads.length} open beads`);

// Map categories to likely file paths
const categoryToPath: Record<string, string> = {
  'P2': 'src/engine/index.ts',
  'task': 'tests/',
  'bug': 'src/',
  'task]': 'tests/',
  'bug]': 'src/',
};

// Add impact table to each bead
for (const bead of beads) { // All beads, not just first 10
  const path = categoryToPath[bead.category] || 'src/';
  
  const impactTable = `### Impact Table
| Path | Change | Purpose | Notes |
|---|---|---|---|
| ${path} | modify | ${bead.title} | P2 fix |`;

  try {
    // Get current description
    const showOutput = execSync(`bd show ${bead.id} 2>/dev/null`, { encoding: 'utf-8' });
    const descMatch = showOutput.match(/DESCRIPTION\n([\s\S]*?)(?:\nLABELS|\nCHILDREN|\nDEPENDS)/);
    const currentDesc = descMatch ? descMatch[1].trim() : bead.title;
    
    // Only add if not already present
    if (!currentDesc.includes('Impact Table')) {
      const newDesc = `${currentDesc}\n\n${impactTable}`;
      execSync(`bd update ${bead.id} --description "${newDesc.replace(/"/g, '\\"')}" 2>/dev/null`);
      console.log(`✓ Added impact table to ${bead.id}`);
    } else {
      console.log(`○ ${bead.id} already has impact table`);
    }
  } catch (e) {
    console.log(`✗ Failed to update ${bead.id}`);
  }
}

console.log('\nDone! Sync with: bd sync');

/**
 * Fake Test Epic Creator for Ralph TUI
 * 
 * Creates mock beads in the local beads tracker for testing parallel execution.
 * Run with: bun run scripts/create-test-epics.ts
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.test-epics');

cleanup();

interface TestBeadConfig {
  id: string;
  title: string;
  description: string;
  duration: number; // seconds of simulated work
  shouldFail: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

function createTestDirectory() {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, '.beads'), { recursive: true });
}

function createBeadsTracker(): void {
  const trackerConfig = {
    type: 'beads-local',
    path: TEST_DIR,
  };
  
  writeFileSync(
    join(TEST_DIR, '.beads', 'config.json'),
    JSON.stringify(trackerConfig, null, 2)
  );
}

function generateFakeBead(config: TestBeadConfig): object {
  return {
    key: config.id,
    fields: {
      summary: config.title,
      description: `${config.description}\n\n**Simulated Duration:** ${config.duration}s\n**Expected Outcome:** ${config.shouldFail ? 'FAIL' : 'PASS'}`,
      status: { name: 'Open' },
      priority: { name: config.priority },
      labels: ['test', 'fake', 'parallel-test'],
      customfield_10001: config.duration, // duration estimate
      customfield_10002: config.shouldFail ? 0 : 100, // confidence score
    },
  };
}

function createTestBeads(epicId: string, count: number): TestBeadConfig[] {
  const beads: TestBeadConfig[] = [];
  
  for (let i = 1; i <= count; i++) {
    const duration = Math.floor(Math.random() * 5) + 2; // 2-6 seconds
    const shouldFail = Math.random() < 0.1; // 10% failure rate
    
    const bead: TestBeadConfig = {
      id: `${epicId}.${String(i).padStart(3, '0')}`,
      title: `Test Bead ${i} - ${shouldFail ? 'Failure' : 'Success'} Scenario`,
      description: `Fake test bead that simulates ${duration} seconds of work.\nThis is bead ${i} of epic ${epicId}.`,
      duration,
      shouldFail,
      priority: shouldFail ? 'high' : 'medium',
    };
    
    beads.push(bead);
  }
  
  return beads;
}

function createEpic(epicNum: number, beadCount: number): string {
  const epicId = `TEST-EPIC-${String(epicNum).padStart(3, '0')}`;
  const epic = {
    key: epicId,
    fields: {
      summary: `Test Epic ${epicNum} - Parallel Execution Test`,
      description: `Fake epic for testing ralph-tui parallel orchestration.\nContains ${beadCount} test beads.`,
      status: { name: 'In Progress' },
      priority: { name: 'High' },
      labels: ['test', 'fake', 'epic', 'parallel-test'],
    },
  };
  
  // Write epic to file
  writeFileSync(
    join(TEST_DIR, '.beads', `epic-${epicId}.json`),
    JSON.stringify(epic, null, 2)
  );
  
  // Create beads
  const beads = createTestBeads(epicId, beadCount);
  
  for (const bead of beads) {
    const beadData = generateFakeBead(bead);
    writeFileSync(
      join(TEST_DIR, '.beads', `${bead.id}.json`),
      JSON.stringify(beadData, null, 2)
    );
  }
  
  // Create issues.jsonl for beads tracker
  const issues = beads.map(b => generateFakeBead(b));
  const issuesJsonl = issues.map(i => JSON.stringify(i)).join('\n');
  writeFileSync(
    join(TEST_DIR, '.beads', 'issues.jsonl'),
    issuesJsonl
  );
  
  return epicId;
}

function createRalphConfig(workers: number): void {
  const config = {
    version: '0.3.0',
    cwd: TEST_DIR,
    agent: {
      plugin: 'mock',
      command: 'echo',
      options: {
        mode: 'test',
        simulateWork: true,
      },
    },
    tracker: {
      type: 'beads-local',
      config: {
        path: join(TEST_DIR, '.beads'),
      },
    },
    model: 'test-model',
    parallel: {
      maxWorkers: workers,
      enabled: true,
    },
    qualityGates: {
      enabled: false,
    },
  };
  
  writeFileSync(
    join(TEST_DIR, 'ralph.json'),
    JSON.stringify(config, null, 2)
  );
}

function printUsage(epics: string[], workers: number): void {
  console.log('\n=== Test Epics Created ===\n');
  
  for (const epicId of epics) {
    console.log(`Epic: ${epicId}`);
    console.log(`  Command: bd list --parent ${epicId}`);
    console.log('');
  }
  
  console.log('=== How to Run Tests in Parallel ===\n');
  
  console.log('1. Using ralph-tui CLI:');
  console.log(`   cd ${TEST_DIR}`);
  console.log('   ralph-tui run --parallel');
  console.log('');
  
  console.log('2. Using bun dev mode:');
  console.log(`   cd ${TEST_DIR}`);
  console.log('   bun run ../../src/cli.tsx run --parallel');
  console.log('');
  
  console.log('3. Run with specific workers:');
  console.log(`   ralph-tui run --parallel --workers ${workers}`);
  console.log('');
  
  console.log('4. Using Kilo Code (parallel agents):');
  console.log('   Create multiple agents, each running:');
  for (const epicId of epics) {
    console.log(`     bd ready --parent ${epicId} --limit 3 | xargs -I {} ralph-tui run --bead {}`);
  }
  console.log('');
  
  console.log('5. Watch mode (TUI):');
  console.log('   ralph-tui run --parallel --watch');
  console.log('');
  
  console.log(`Test directory: ${TEST_DIR}`);
  console.log('Config file: ralph.json');
  console.log('');
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  
  // Parse args
  let numEpics = 3;
  let beadsPerEpic = 5;
  let workers = 4;
  
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--epics':
      case '-e':
        numEpics = parseInt(value, 10);
        break;
      case '--beads':
      case '-b':
        beadsPerEpic = parseInt(value, 10);
        break;
      case '--workers':
      case '-w':
        workers = parseInt(value, 10);
        break;
    }
  }
  
  console.log(`Creating ${numEpics} test epics with ${beadsPerEpic} beads each...`);
  
  createTestDirectory();
  createBeadsTracker();
  
  const epicIds: string[] = [];
  for (let i = 1; i <= numEpics; i++) {
    const epicId = createEpic(i, beadsPerEpic);
    epicIds.push(epicId);
    console.log(`  ✓ Created ${epicId} with ${beadsPerEpic} beads`);
  }
  
  createRalphConfig(workers);
  
  printUsage(epicIds, workers);
  
  console.log('Done! Test epics ready for parallel execution.');
}

main();

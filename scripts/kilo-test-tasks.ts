/**
 * Kilo Code Parallel Test Tasks for Ralph TUI
 * 
 * This file provides the task definitions for running Ralph TUI tests
 * in parallel using multiple Kilo Code agents.
 * 
 * Usage in Kilo Code:
 *   Use the Task tool with these prompts to run tests in parallel
 */

// Test suite configurations for parallel execution
export const TEST_SUITES = {
  engine: {
    name: 'Engine Tests',
    files: [
      'src/engine/index.test.ts',
      'tests/engine/execution-engine.test.ts',
      'tests/engine/parallel-engine.test.ts',
      'tests/engine/integration.test.ts',
      'tests/engine/rate-limit-detector.test.ts',
      'tests/engine/impact.test.ts',
      'tests/engine/types.test.ts',
      'tests/engine/parallel/validation.test.ts',
      'tests/engine/parallel/commit-metadata.test.ts',
      'tests/engine/parallel/worktree-manager.test.ts',
    ],
    timeout: 180,
    description: 'Core engine tests including parallel execution, rate limiting, and integration',
  },
  
  plugins: {
    name: 'Plugin Tests',
    files: [
      'tests/plugins/claude-agent.test.ts',
      'tests/plugins/opencode-agent.test.ts',
      'tests/plugins/beads-tracker.test.ts',
      'tests/plugins/json-tracker.test.ts',
      'tests/plugins/tracker-registry.test.ts',
      'tests/plugins/agent-registry.test.ts',
      'src/plugins/agents/base.test.ts',
      'src/plugins/agents/droid/outputParser.test.ts',
      'src/plugins/agents/output-formatting.test.ts',
      'tests/plugins/agents/opencode-output-parser.test.ts',
      'tests/plugins/agents/subagent-tracing-integration.test.ts',
    ],
    timeout: 180,
    description: 'Agent and tracker plugin tests including output parsing and tracing',
  },
  
  tui: {
    name: 'TUI Tests',
    files: [
      'tests/tui/stores/task-store.test.ts',
      'tests/tui/stores/output-buffer.test.ts',
      'tests/tui/stores/event-bridge.test.ts',
      'tests/tui/stores/ui-store.test.ts',
      'tests/tui/stores/pipeline-store.test.ts',
      'tests/tui/stores/phase-store.test.ts',
      'tests/tui/stores/history-store.test.ts',
      'tests/tui/stores/subagent-store.test.ts',
      'tests/tui/theme.test.ts',
      'tests/tui/keyboard-manager.test.ts',
      'tests/tui/error-boundary.test.ts',
    ],
    timeout: 120,
    description: 'TUI component and store tests',
  },
  
  commands: {
    name: 'Command Tests',
    files: [
      'tests/commands/run.test.ts',
      'tests/commands/status.test.ts',
      'tests/commands/config.test.ts',
      'tests/commands/local-flow-e2e.test.ts',
      'src/commands/remote.test.ts',
      'src/commands/info.test.ts',
      'src/commands/doctor.test.ts',
      'src/commands/skills.test.ts',
    ],
    timeout: 120,
    description: 'CLI command tests including e2e flows',
  },
  
  config: {
    name: 'Config & Utils',
    files: [
      'src/config/index.test.ts',
      'src/config/types.test.ts',
      'src/config/schema.test.ts',
      'tests/utils/files.test.ts',
      'tests/utils/logger.test.ts',
      'tests/utils/process.test.ts',
      'tests/utils/retry.test.ts',
      'tests/utils/validation.test.ts',
      'tests/utils/clipboard.test.ts',
    ],
    timeout: 60,
    description: 'Configuration and utility tests',
  },
  
  session: {
    name: 'Session & Remote',
    files: [
      'tests/session/lock.test.ts',
      'tests/remote/remote.test.ts',
      'src/remote/config.test.ts',
      'src/remote/token.test.ts',
      'src/remote/audit.test.ts',
    ],
    timeout: 120,
    description: 'Session lock and remote control tests',
  },
} as const;

export type TestSuiteName = keyof typeof TEST_SUITES;

/**
 * Generate a Kilo Code task prompt for running a test suite
 */
export function generateTestTaskPrompt(suiteName: TestSuiteName): string {
  const suite = TEST_SUITES[suiteName];
  const filesList = suite.files.join(' ');
  
  return `Run the ${suite.name} test suite for ralph-tui.

**Suite:** ${suite.name}
**Description:** ${suite.description}
**Timeout:** ${suite.timeout}s

**Test Files:**
${suite.files.map(f => `  - ${f}`).join('\n')}

**Command to Run:**
\`\`\`bash
bun test --timeout ${suite.timeout * 1000} ${filesList}
\`\`\`

**Requirements:**
1. Run all test files in this suite
2. Report the final result (pass/fail)
3. If tests fail, show the failure summary
4. Exit with appropriate code

**Acceptance Criteria:**
- [ ] All tests in ${suite.name} pass
- [ ] No test timeouts
- [ ] Clean exit with code 0 on success`;
}

/**
 * Get all test suite names for parallel execution
 */
export function getAllTestSuiteNames(): TestSuiteName[] {
  return Object.keys(TEST_SUITES) as TestSuiteName[];
}

/**
 * Generate Kilo Code task prompts for all test suites
 */
export function generateAllTestTaskPrompts(): Record<TestSuiteName, string> {
  const prompts: Partial<Record<TestSuiteName, string>> = {};
  
  for (const name of getAllTestSuiteNames()) {
    prompts[name] = generateTestTaskPrompt(name);
  }
  
  return prompts as Record<TestSuiteName, string>;
}

// CLI usage example
if (import.meta.main) {
  const suiteName = process.argv[2] as TestSuiteName;
  
  if (!suiteName || !(suiteName in TEST_SUITES)) {
    console.log('Usage: bun run scripts/kilo-test-tasks.ts <suite>');
    console.log('');
    console.log('Available suites:');
    for (const name of getAllTestSuiteNames()) {
      const suite = TEST_SUITES[name];
      console.log(`  ${name.padEnd(10)} - ${suite.name} (${suite.files.length} files)`);
    }
    process.exit(1);
  }
  
  console.log(generateTestTaskPrompt(suiteName));
}

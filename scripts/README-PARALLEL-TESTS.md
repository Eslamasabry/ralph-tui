# Kilo Code Parallel Test Execution for Ralph TUI

This directory contains scripts for running Ralph TUI tests in parallel using multiple Kilo Code agents.

## Quick Start

### Option 1: Using Kilo Code Task Tool (Recommended)

Ask Kilo Code to run tests in parallel:

```
"Run all test suites in parallel with 6 agents"
```

Kilo Code will automatically launch 6 parallel agents, each running a different test suite:
- Agent 1: Engine tests
- Agent 2: Plugin tests
- Agent 3: TUI tests
- Agent 4: Command tests
- Agent 5: Config & utils tests
- Agent 6: Session & remote tests

### Option 2: Manual Parallel Execution

Run the parallel test runner:

```bash
# Run all suites with 6 parallel workers
python3 scripts/run-parallel-tests.py --agents 6

# Run specific suites
python3 scripts/run-parallel-tests.py --suites engine,plugins,tui --agents 3

# List available suites
python3 scripts/run-parallel-tests.py --list
```

### Option 3: Shell Script

```bash
# In one terminal - Engine tests
./scripts/kilo-parallel-tests.sh engine

# In another terminal - Plugin tests  
./scripts/kilo-parallel-tests.sh plugins

# etc...
```

## Test Suite Breakdown

| Suite | Files | Timeout | Description |
|-------|-------|---------|-------------|
| engine | 10 | 180s | Core engine + parallel execution |
| plugins | 11 | 180s | Agents, trackers, output parsing |
| tui | 11 | 120s | Stores, components, theming |
| commands | 8 | 120s | CLI commands + e2e |
| config | 10 | 60s | Config + utilities |
| session | 5 | 120s | Session lock + remote |

**Total: ~55 test files**

## Kilo Code Task Prompts

Use these prompts with the Task tool to run specific test suites:

### Run Engine Tests
```
Run the Engine Tests suite for ralph-tui.

Command: bun test --timeout 180000 src/engine/index.test.ts tests/engine/execution-engine.test.ts tests/engine/parallel-engine.test.ts tests/engine/integration.test.ts tests/engine/rate-limit-detector.test.ts tests/engine/impact.test.ts

Requirements:
1. Run all test files
2. Report pass/fail count
3. Show any failures
```

### Run Plugin Tests
```
Run the Plugin Tests suite for ralph-tui.

Command: bun test --timeout 180000 tests/plugins/claude-agent.test.ts tests/plugins/opencode-agent.test.ts tests/plugins/beads-tracker.test.ts tests/plugins/json-tracker.test.ts tests/plugins/tracker-registry.test.ts tests/plugins/agent-registry.test.ts src/plugins/agents/base.test.ts

Requirements:
1. Run all test files
2. Report pass/fail count
3. Show any failures
```

### Run TUI Tests
```
Run the TUI Tests suite for ralph-tui.

Command: bun test --timeout 120000 tests/tui/stores/task-store.test.ts tests/tui/stores/output-buffer.test.ts tests/tui/stores/event-bridge.test.ts tests/tui/stores/ui-store.test.ts tests/tui/stores/pipeline-store.test.ts tests/tui/theme.test.ts

Requirements:
1. Run all test files
2. Report pass/fail count
3. Show any failures
```

## Parallel Execution Example

To run all 6 test suites simultaneously with Kilo Code:

```typescript
// Launch 6 parallel tasks
const suites = ['engine', 'plugins', 'tui', 'commands', 'config', 'session'];

for (const suite of suites) {
  // Each task runs one test suite
  task({
    description: `Run ${suite} tests`,
    prompt: generateTestTaskPrompt(suite),
    subagent_type: 'general'
  });
}
```

## Test Results Aggregation

After all parallel agents complete, results can be aggregated:

```bash
# Check all results
python3 scripts/run-parallel-tests.py --agents 6 --verbose
```

## Fake Test Epics (For Testing Ralph TUI)

To test ralph-tui's parallel orchestration itself, create fake epics:

```bash
# Generate fake test data
bun run scripts/create-test-epics.ts --epics 5 --beads 10 --workers 8

# Run ralph-tui on fake data
cd .test-epics
ralph-tui run --parallel --workers 8
```

This creates mock beads that simulate work for testing the parallel coordinator.

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `run-parallel-tests.py` | Python-based parallel test runner with result aggregation |
| `kilo-parallel-tests.sh` | Shell script for running individual suites |
| `kilo-test-tasks.ts` | TypeScript task prompt generator |
| `create-test-epics.ts` | Generate fake beads for testing ralph-tui |
| `generate-test-epics.sh` | Bash version of fake epic generator |

## Typical Usage Flow

1. **Development**: Make code changes
2. **Type check**: `bun run typecheck`
3. **Lint**: `bun run lint`
4. **Test**: Run parallel tests (this directory)
5. **Build**: `bun run build`

## Performance

Running tests in parallel typically reduces total time from ~5 minutes to ~1.5 minutes on a multi-core machine.

```
Sequential: ~300s (5 minutes)
Parallel (6 agents): ~90s (1.5 minutes)
Speedup: 3.3x
```

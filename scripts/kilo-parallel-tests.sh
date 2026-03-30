#!/bin/bash
#
# Kilo Code Parallel Test Runner for Ralph TUI
# 
# This script runs test suites in parallel using Kilo Code's task tool.
# Each test suite runs in a separate agent for maximum parallelism.
#
# Usage with Kilo Code:
#   1. Open Kilo Code in ralph-tui directory
#   2. Ask: "run tests in parallel with 6 agents"
#   3. Kilo Code will launch multiple agents running this script
#
# Manual usage:
#   ./scripts/kilo-parallel-tests.sh engine
#   ./scripts/kilo-parallel-tests.sh plugins  
#   ./scripts/kilo-parallel-tests.sh tui
#

set -e

SUITE=$1
VERBOSE=${2:-false}

# Test suite definitions
 case "$SUITE" in
  engine)
    FILES="src/engine/index.test.ts tests/engine/execution-engine.test.ts tests/engine/parallel-engine.test.ts tests/engine/integration.test.ts tests/engine/rate-limit-detector.test.ts tests/engine/impact.test.ts"
    TIMEOUT=180
    ;;
  plugins)
    FILES="tests/plugins/claude-agent.test.ts tests/plugins/opencode-agent.test.ts tests/plugins/beads-tracker.test.ts tests/plugins/json-tracker.test.ts tests/plugins/agent-registry.test.ts tests/plugins/tracker-registry.test.ts src/plugins/agents/base.test.ts"
    TIMEOUT=180
    ;;
  tui)
    FILES="tests/tui/stores/task-store.test.ts tests/tui/stores/output-buffer.test.ts tests/tui/stores/event-bridge.test.ts tests/tui/stores/ui-store.test.ts tests/tui/stores/pipeline-store.test.ts tests/tui/theme.test.ts tests/tui/keyboard-manager.test.ts"
    TIMEOUT=120
    ;;
  commands)
    FILES="tests/commands/run.test.ts tests/commands/status.test.ts tests/commands/config.test.ts tests/commands/local-flow-e2e.test.ts src/commands/remote.test.ts"
    TIMEOUT=120
    ;;
  config)
    FILES="src/config/index.test.ts src/config/types.test.ts src/config/schema.test.ts tests/utils/files.test.ts tests/utils/logger.test.ts tests/utils/validation.test.ts"
    TIMEOUT=60
    ;;
  session)
    FILES="tests/session/lock.test.ts tests/remote/remote.test.ts src/remote/config.test.ts src/remote/token.test.ts"
    TIMEOUT=120
    ;;
  all)
    # Run everything in one go (not recommended for parallel)
    exec bun test
    ;;
  *)
    echo "Usage: $0 <suite>"
    echo ""
    echo "Available test suites:"
    echo "  engine    - Engine and parallel execution tests"
    echo "  plugins   - Agent and tracker plugin tests"
    echo "  tui       - TUI component and store tests"
    echo "  commands  - Command and e2e tests"
    echo "  config    - Config and utility tests"
    echo "  session   - Session and remote tests"
    echo "  all       - Run all tests (bun test)"
    echo ""
    echo "Examples:"
    echo "  $0 engine"
    echo "  $0 plugins"
    exit 1
    ;;
esac

echo "=== Running $SUITE tests ==="
echo "Files: $FILES"
echo "Timeout: ${TIMEOUT}s"
echo ""

# Run tests
bun test --timeout $((TIMEOUT * 1000)) $FILES

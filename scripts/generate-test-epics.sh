#!/usr/bin/env bash
#
# Fake Test Epic Generator for Ralph TUI Testing
# Creates mock epics and beads to test parallel execution
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="$SCRIPT_DIR/.test-epics"

cleanup() {
  if [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
  fi
}

# Generate a fake epic with child beads
generate_test_epic() {
  local epic_num=$1
  local num_beads=$2
  local epic_id="test-epic-$(printf "%03d" $epic_num)"
  local epic_dir="$TEST_DIR/$epic_id"
  
  mkdir -p "$epic_dir"
  
  # Create epic metadata
  cat > "$epic_dir/epic.json" <<EOF
{
  "id": "$epic_id",
  "title": "Test Epic $epic_num - Parallel Execution Test",
  "description": "Fake epic for testing ralph-tui parallel orchestration with $num_beads child beads",
  "status": "open",
  "priority": "high",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

  # Generate child beads
  for i in $(seq 1 $num_beads); do
    local bead_id="$epic_id.bead-$(printf "%03d" $i)"
    local duration=$((RANDOM % 5 + 2))  # 2-6 second simulated work
    local should_fail=$((RANDOM % 10 == 0 ? 1 : 0))  # 10% chance of failure
    
    cat > "$epic_dir/bead-$(printf "%03d" $i).json" <<EOF
{
  "id": "$bead_id",
  "parent": "$epic_id",
  "title": "Test Bead $i - Simulated Task",
  "description": "Fake bead that simulates $duration seconds of work",
  "status": "open",
  "priority": "medium",
  "estimates": {
    "duration": $duration,
    "shouldFail": $should_fail
  },
  "acceptanceCriteria": [
    "Simulate work for $duration seconds",
    "Report success or failure"
  ]
}
EOF
  done
  
  echo "Created $epic_id with $num_beads beads"
}

# Create tracker config for fake epics
create_tracker_config() {
  local num_epics=$1
  local beads_per_epic=$2
  
  cat > "$TEST_DIR/tracker.json" <<EOF
{
  "type": "json",
  "config": {
    "path": "$TEST_DIR/tasks.json"
  },
  "epics": {
    "count": $num_epics,
    "beadsPerEpic": $beads_per_epic,
    "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }
}
EOF
}

# Create tasks.json for the fake tracker
create_tasks_file() {
  local num_epics=$1
  local beads_per_epic=$2
  
  echo '{"tasks": [' > "$TEST_DIR/tasks.json"
  
  local first=true
  for epic_num in $(seq 1 $num_epics); do
    for bead_num in $(seq 1 $beads_per_epic); do
      local epic_id="test-epic-$(printf "%03d" $epic_num)"
      local bead_id="$epic_id.bead-$(printf "%03d" $bead_num)"
      local duration=$((RANDOM % 5 + 2))
      
      if [ "$first" = true ]; then
        first=false
      else
        echo "," >> "$TEST_DIR/tasks.json"
      fi
      
      cat >> "$TEST_DIR/tasks.json" <<EOF
{
  "id": "$bead_id",
  "title": "Test Bead $bead_num for Epic $epic_num",
  "description": "Simulated task with ${duration}s duration",
  "status": "open",
  "estimates": {
    "bestCase": $duration,
    "mostLikely": $((duration + 1)),
    "worstCase": $((duration + 3))
  },
  "priority": "medium",
  "dependencies": []
}
EOF
    done
  done
  
  echo ']}' >> "$TEST_DIR/tasks.json"
}

# Create ralph-tui config
create_config() {
  local workers=$1
  
  cat > "$TEST_DIR/config.json" <<EOF
{
  "version": "0.3.0",
  "cwd": "$TEST_DIR",
  "agent": {
    "plugin": "mock",
    "command": "echo",
    "options": {
      "mode": "test"
    }
  },
  "tracker": {
    "type": "json",
    "config": {
      "path": "$TEST_DIR/tasks.json"
    }
  },
  "parallel": {
    "maxWorkers": $workers,
    "enabled": true
  },
  "qualityGates": {
    "enabled": false
  }
}
EOF
}

# Create mock agent plugin
create_mock_agent() {
  mkdir -p "$TEST_DIR/agents"
  
  cat > "$TEST_DIR/agents/mock.ts" <<'EOF'
import type { AgentPlugin, AgentExecutionResult, AgentPluginConfig } from '../../../src/plugins/agents/types.js';

export class MockAgentPlugin implements AgentPlugin {
  private config: AgentPluginConfig = {} as AgentPluginConfig;
  
  async initialize(config: AgentPluginConfig): Promise<void> {
    this.config = config;
  }
  
  async detect(): Promise<{ available: boolean; error?: string }> {
    return { available: true };
  }
  
  validateModel(_model: string): string | undefined {
    return undefined;
  }
  
  execute(prompt: string): { promise: Promise<AgentExecutionResult>; interrupt: () => void } {
    const taskData = JSON.parse(prompt);
    const duration = taskData.duration || 2;
    const shouldFail = taskData.shouldFail || false;
    
    const startTime = Date.now();
    
    const promise = new Promise<AgentExecutionResult>((resolve) => {
      setTimeout(() => {
        const endTime = Date.now();
        
        if (shouldFail) {
          resolve({
            executionId: `mock-${startTime}`,
            status: 'failed',
            stdout: '',
            stderr: 'Simulated failure',
            durationMs: endTime - startTime,
            error: 'Simulated task failure',
            interrupted: false,
            startedAt: new Date(startTime).toISOString(),
            endedAt: new Date(endTime).toISOString(),
          });
        } else {
          resolve({
            executionId: `mock-${startTime}`,
            status: 'completed',
            stdout: `<promise>COMPLETE</promise>\nTask completed successfully in ${duration}s`,
            stderr: '',
            durationMs: endTime - startTime,
            interrupted: false,
            startedAt: new Date(startTime).toISOString(),
            endedAt: new Date(endTime).toISOString(),
          });
        }
      }, duration * 1000);
    });
    
    return {
      promise,
      interrupt: () => {
        // No-op for mock
      }
    };
  }
  
  async dispose(): Promise<void> {
    // No cleanup needed
  }
}

export default MockAgentPlugin;
EOF
}

# Print usage
usage() {
  echo "Usage: $0 [OPTIONS]"
  echo ""
  echo "Generate fake test epics for ralph-tui parallel testing"
  echo ""
  echo "Options:"
  echo "  -e, --epics NUM       Number of epics to create (default: 3)"
  echo "  -b, --beads NUM       Beads per epic (default: 5)"
  echo "  -w, --workers NUM     Number of parallel workers (default: 4)"
  echo "  -c, --clean           Clean up existing test directory"
  echo "  -h, --help            Show this help message"
  echo ""
  echo "Example:"
  echo "  $0 --epics 5 --beads 10 --workers 8"
}

# Main
main() {
  local num_epics=3
  local beads_per_epic=5
  local workers=4
  local clean_only=false
  
  while [[ $# -gt 0 ]]; do
    case $1 in
      -e|--epics)
        num_epics="$2"
        shift 2
        ;;
      -b|--beads)
        beads_per_epic="$2"
        shift 2
        ;;
      -w|--workers)
        workers="$2"
        shift 2
        ;;
      -c|--clean)
        clean_only=true
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done
  
  # Clean up if requested
  if [ "$clean_only" = true ]; then
    cleanup
    echo "Test directory cleaned up"
    exit 0
  fi
  
  # Create test directory
  mkdir -p "$TEST_DIR"
  
  echo "Generating fake test data..."
  echo "  Epics: $num_epics"
  echo "  Beads per epic: $beads_per_epic"
  echo "  Workers: $workers"
  echo ""
  
  # Generate epics
  for i in $(seq 1 $num_epics); do
    generate_test_epic $i $beads_per_epic
  done
  
  # Create supporting files
  create_tracker_config $num_epics $beads_per_epic
  create_tasks_file $num_epics $beads_per_epic
  create_config $workers
  create_mock_agent
  
  echo ""
  echo "Test data generated in: $TEST_DIR"
  echo ""
  echo "To run ralph-tui with this test data:"
  echo "  cd $TEST_DIR"
  echo "  ralph-tui run --config config.json"
  echo ""
  echo "Or run in parallel mode:"
  echo "  ralph-tui run --parallel --workers $workers --config config.json"
  echo ""
  echo "Test directory: $TEST_DIR"
}

main "$@"

#!/usr/bin/env python3
"""
Parallel Test Runner for Ralph TUI
Runs test suites in parallel using multiple Kilo Code agents

Usage:
    python3 scripts/run-parallel-tests.py [--suites SUITE1,SUITE2] [--agents N]

Examples:
    # Run all test suites in parallel with 6 agents
    python3 scripts/run-parallel-tests.py --agents 6

    # Run specific suites
    python3 scripts/run-parallel-tests.py --suites engine,plugins,tui

    # Run with Kilo Code (creates parallel agents)
    kilo_code --parallel-agents 6 --script scripts/run-parallel-tests.py
"""

import argparse
import subprocess
import sys
import time
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Dict, Tuple
import os


@dataclass
class TestSuite:
    name: str
    pattern: str
    files: List[str]
    timeout: int = 120


# Test suite definitions
TEST_SUITES = {
    "engine": TestSuite(
        name="Engine Tests",
        pattern="src/engine/*.test.ts tests/engine/**/*.test.ts",
        files=[
            "src/engine/index.test.ts",
            "tests/engine/execution-engine.test.ts",
            "tests/engine/parallel-engine.test.ts",
            "tests/engine/integration.test.ts",
            "tests/engine/rate-limit-detector.test.ts",
            "tests/engine/types.test.ts",
            "tests/engine/impact.test.ts",
            "tests/engine/parallel/validation.test.ts",
            "tests/engine/parallel/commit-metadata.test.ts",
            "tests/engine/parallel/worktree-manager.test.ts",
        ],
        timeout=180,
    ),
    "plugins": TestSuite(
        name="Plugin Tests",
        pattern="tests/plugins/*.test.ts src/plugins/**/*.test.ts",
        files=[
            "tests/plugins/claude-agent.test.ts",
            "tests/plugins/opencode-agent.test.ts",
            "tests/plugins/beads-tracker.test.ts",
            "tests/plugins/json-tracker.test.ts",
            "tests/plugins/tracker-registry.test.ts",
            "tests/plugins/agent-registry.test.ts",
            "src/plugins/agents/base.test.ts",
            "src/plugins/agents/droid/outputParser.test.ts",
            "src/plugins/agents/output-formatting.test.ts",
            "tests/plugins/agents/opencode-output-parser.test.ts",
            "tests/plugins/agents/subagent-tracing-integration.test.ts",
        ],
        timeout=180,
    ),
    "tui": TestSuite(
        name="TUI Tests",
        pattern="tests/tui/**/*.test.ts",
        files=[
            "tests/tui/stores/task-store.test.ts",
            "tests/tui/stores/output-buffer.test.ts",
            "tests/tui/stores/event-bridge.test.ts",
            "tests/tui/stores/ui-store.test.ts",
            "tests/tui/stores/pipeline-store.test.ts",
            "tests/tui/stores/phase-store.test.ts",
            "tests/tui/stores/history-store.test.ts",
            "tests/tui/stores/subagent-store.test.ts",
            "tests/tui/theme.test.ts",
            "tests/tui/keyboard-manager.test.ts",
            "tests/tui/error-boundary.test.ts",
            "tests/tui/active-view.test.ts",
            "tests/tui/run-summary-overlay.test.ts",
            "tests/tui/output-parser.test.ts",
            "tests/tui/state-utils.test.ts",
            "tests/tui/subagent-tree-panel.test.ts",
            "tests/tui/data-source-provider.test.ts",
        ],
        timeout=120,
    ),
    "commands": TestSuite(
        name="Command Tests",
        pattern="tests/commands/*.test.ts src/commands/*.test.ts",
        files=[
            "tests/commands/run.test.ts",
            "tests/commands/status.test.ts",
            "tests/commands/config.test.ts",
            "tests/commands/local-flow-e2e.test.ts",
            "src/commands/remote.test.ts",
            "src/commands/info.test.ts",
            "src/commands/doctor.test.ts",
            "src/commands/skills.test.ts",
            "src/commands/listen.test.ts",
        ],
        timeout=120,
    ),
    "config": TestSuite(
        name="Config & Utils Tests",
        pattern="src/config/*.test.ts tests/utils/*.test.ts",
        files=[
            "src/config/index.test.ts",
            "src/config/types.test.ts",
            "src/config/schema.test.ts",
            "tests/utils/files.test.ts",
            "tests/utils/logger.test.ts",
            "tests/utils/process.test.ts",
            "tests/utils/retry.test.ts",
            "tests/utils/validation.test.ts",
            "tests/utils/clipboard.test.ts",
        ],
        timeout=60,
    ),
    "session": TestSuite(
        name="Session & Remote Tests",
        pattern="tests/session/*.test.ts tests/remote/*.test.ts src/remote/*.test.ts",
        files=[
            "tests/session/lock.test.ts",
            "tests/remote/remote.test.ts",
            "src/remote/config.test.ts",
            "src/remote/token.test.ts",
            "src/remote/audit.test.ts",
        ],
        timeout=120,
    ),
}


def run_test_suite(
    suite: TestSuite, verbose: bool = False
) -> Tuple[str, bool, str, float]:
    """Run a single test suite and return results."""
    start_time = time.time()

    # Build command
    cmd = ["bun", "test", "--timeout", str(suite.timeout * 1000)] + suite.files

    if verbose:
        print(f"\n[START] {suite.name}")
        print(f"  Command: {' '.join(cmd)}")

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=suite.timeout
        )

        elapsed = time.time() - start_time
        success = result.returncode == 0

        # Parse test count from output
        output = result.stdout + result.stderr

        if verbose:
            status = "✓ PASS" if success else "✗ FAIL"
            print(f"[{status}] {suite.name} ({elapsed:.1f}s)")

        return suite.name, success, output, elapsed

    except subprocess.TimeoutExpired:
        elapsed = time.time() - start_time
        return suite.name, False, f"Timeout after {suite.timeout}s", elapsed
    except Exception as e:
        elapsed = time.time() - start_time
        return suite.name, False, str(e), elapsed


def run_parallel(
    suites: List[TestSuite], max_workers: int, verbose: bool = False
) -> Dict:
    """Run multiple test suites in parallel."""
    results = {
        "total": len(suites),
        "passed": 0,
        "failed": 0,
        "suites": {},
        "total_time": 0,
    }

    print(f"\n{'=' * 60}")
    print(f"Running {len(suites)} test suites in parallel with {max_workers} workers")
    print(f"{'=' * 60}\n")

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_suite = {
            executor.submit(run_test_suite, suite, verbose): suite for suite in suites
        }

        # Collect results as they complete
        for future in as_completed(future_to_suite):
            suite = future_to_suite[future]
            name, success, output, elapsed = future.result()

            results["suites"][name] = {
                "success": success,
                "output": output,
                "time": elapsed,
            }

            if success:
                results["passed"] += 1
                print(f"✓ {name} ({elapsed:.1f}s)")
            else:
                results["failed"] += 1
                print(f"✗ {name} ({elapsed:.1f}s) - FAILED")
                if verbose:
                    print(f"  Error: {output[:500]}")

    results["total_time"] = time.time() - start_time
    return results


def print_summary(results: Dict):
    """Print test run summary."""
    print(f"\n{'=' * 60}")
    print("TEST RUN SUMMARY")
    print(f"{'=' * 60}")
    print(f"Total Suites: {results['total']}")
    print(f"Passed: {results['passed']}")
    print(f"Failed: {results['failed']}")
    print(f"Total Time: {results['total_time']:.1f}s")
    print(f"{'=' * 60}\n")

    if results["failed"] > 0:
        print("Failed Suites:")
        for name, data in results["suites"].items():
            if not data["success"]:
                print(f"  - {name}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Run Ralph TUI test suites in parallel"
    )
    parser.add_argument(
        "--suites",
        "-s",
        type=str,
        help="Comma-separated list of test suites to run (engine,plugins,tui,commands,config,session)",
    )
    parser.add_argument(
        "--agents",
        "-a",
        type=int,
        default=6,
        help="Number of parallel agents/workers (default: 6)",
    )
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument(
        "--list", "-l", action="store_true", help="List available test suites"
    )

    args = parser.parse_args()

    if args.list:
        print("\nAvailable Test Suites:")
        for key, suite in TEST_SUITES.items():
            print(f"  {key:12} - {suite.name} ({len(suite.files)} files)")
        print()
        return

    # Select suites
    if args.suites:
        suite_keys = [s.strip() for s in args.suites.split(",")]
        suites = []
        for key in suite_keys:
            if key in TEST_SUITES:
                suites.append(TEST_SUITES[key])
            else:
                print(f"Warning: Unknown suite '{key}'")
    else:
        suites = list(TEST_SUITES.values())

    if not suites:
        print("No test suites selected!")
        return

    # Run tests
    results = run_parallel(suites, args.agents, args.verbose)
    print_summary(results)

    # Exit with appropriate code
    sys.exit(0 if results["failed"] == 0 else 1)


if __name__ == "__main__":
    main()

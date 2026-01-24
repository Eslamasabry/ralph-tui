# Worktree Management Production Plan

**Generated:** 2026-01-24  
**Scope:** Make worktree management reliable, safe, observable, and recoverable for parallel execution.

## 1) Summary
This plan turns worktree management into a production-grade subsystem by hardening lifecycle operations, ensuring deterministic cleanup, improving conflict handling, and adding observability. It is structured into phases with concrete implementation tasks, verification steps, and operational runbook guidance.

## 2) Goals
- Ensure every worktree lifecycle is deterministic (create → validate → lock → use → unlock → cleanup).
- Eliminate orphaned worktrees and stale locks after crashes or forced exits.
- Provide accurate health metrics (active/locked/stale/prunable) in TUI and logs.
- Make merge failures actionable with conflict files and recovery steps.
- Keep performance under the current target (<500ms worktree creation for typical repos).

## 3) Non-Goals
- Replacing git worktrees with another isolation mechanism.
- Changing the high-level parallel execution architecture.
- Adding new external dependencies unless proven necessary.

## 4) Definitions
- **Active worktree:** Exists on disk, unlocked, valid HEAD/branch.
- **Locked worktree:** Worktree locked by parallel worker or reason.
- **Stale worktree:** Listed by git but missing on disk or mismatched metadata.
- **Prunable worktree:** Marked by git as prunable (already removed from disk).
- **Stale lock:** Lock whose process is dead or older than configured timeout.

## 5) Current System Map (Key Modules)
- Worktree lifecycle: `src/engine/parallel/worktree-manager.ts`
- Parallel coordinator: `src/engine/parallel/coordinator.ts`
- Locks & stale lock cleanup: `src/session/lock.ts`
- Worktree cleanup actions: `src/worktree-cleanup/index.ts`
- Run command lifecycle & shutdown: `src/commands/run.tsx`
- TUI health UI: `src/tui/components/RunApp.tsx`, `src/tui/components/DashboardBanner.tsx`, `src/tui/components/ProgressDashboard.tsx`

## 6) Risks Observed
- Merge artifacts and duplicated logic previously left invalid code paths.
- Worktree health and prune UI mismatched the actual backend APIs.
- Stale lock checks were not wired into runtime.
- Cleanup actions existed but were not consistently invoked on shutdown.

## 7) Requirements

### 7.1 Functional
- Worktree creation validates branch + commit identity before use.
- Worktree creation retries are deterministic and idempotent.
- Manual prune is safe and updates health counts.
- Stale locks are detected and cleaned periodically (configurable).
- Cleanup is triggered on normal shutdown and forced exits.

### 7.2 Reliability
- No unresolved conflict markers after operations.
- No locked worktree without a reason.
- All failures record actionable metadata (conflict files, commit, task id).

### 7.3 Performance
- Worktree creation remains <500ms for typical repos.
- Cleanup and health checks remain O(n) for number of worktrees.

### 7.4 Observability
- Health summary available in UI and logs.
- Failures show conflict files and suggested commands.
- Cleanup reports successes and errors.

## 8) Detailed Plan (Phased)

### Phase 1 — Lifecycle Hardening (WorktreeManager)
**Objective:** Single, reliable source for all worktree operations.

**Tasks**
- Centralize creation logic in `createWorktrees` with:
  - Branch existence detection (`branchExists`).
  - Expected commit capture (`resolveRef(baseRef)`), then validate.
  - Retry sequence: normal add → cleanup → force add → force cleanup → force add.
  - Mandatory `validateWorktree` before use.
- Ensure `listWorktrees`:
  - Parses `git worktree list --porcelain` robustly.
  - Recognizes `prunable` marker.
  - Generates consistent `WorktreeStatus` for UI and health counts.
- Ensure `getWorktreeHealthSummary`:
  - Excludes the main repo (`relativePath === '.'`).
  - Counts active/locked/stale/prunable correctly.

**Acceptance Criteria**
- `createWorktrees` always returns validated worktrees or throws with actionable error.
- `listWorktrees` never throws for malformed lines; returns empty on git failure.
- `getWorktreeHealthSummary` returns stable counts for the dashboard.

### Phase 2 — Lock & Stale Lock Management
**Objective:** Locks are always cleaned or reaped automatically.

**Tasks**
- Start periodic stale lock checks in `registerLockCleanupHandlers` and pass the configured timeout.
- Ensure `RalphConfig` exposes `staleLockTimeoutMinutes` and config build maps it from stored config.
- Log stale lock cleanup events with PID and age to allow troubleshooting.

**Acceptance Criteria**
- A stale lock older than the configured timeout is cleaned automatically.
- Lock cleanup stops when the process exits (no orphaned intervals).

### Phase 3 — Cleanup & Pruning
**Objective:** Worktrees never linger after termination or failure.

**Tasks**
- Call `cleanupAllWorktrees` on:
  - TUI shutdown (graceful exit).
  - Headless shutdown (SIGINT/SIGTERM).
  - Run completion (after engine dispose).
- Ensure cleanup errors are logged but do not block shutdown.
- Expose manual prune with immediate health refresh.

**Acceptance Criteria**
- After exit, `git worktree list` shows no stale entries for workers.
- Manual prune is safe when dashboard is visible and updates counts.

### Phase 4 — Merge & Conflict Handling
**Objective:** Merge failures are deterministic and always explainable.

**Tasks**
- Enforce `resolveSimpleConflict` never emits conflict markers.
- Always include conflict files in `parallel:merge-failed` events.
- Ensure merge recovery always cleans the worktree and leaves the repo consistent.

**Acceptance Criteria**
- No conflict markers are written to committed code.
- Conflict events always include file lists when available.

### Phase 5 — Observability & UX
**Objective:** Operators can tell system health at a glance.

**Tasks**
- Dashboard shows counts (active/locked/stale/prunable) and prune action state.
- Activity log uses consistent, detailed merge failure formatting.
- Provide a headless summary log for cleanup and stale lock events.

**Acceptance Criteria**
- TUI and logs match back-end health counts.
- Manual prune action has clear feedback for success/failure.

### Phase 6 — Tests & Validation
**Objective:** Prevent regressions with real git scenarios.

**Tasks**
- Add integration tests around:
  - Parallel worktree creation (multiple workers).
  - Forced cleanup (simulated crash/terminate).
  - Stale lock cleanup on interval.
  - Conflict resolution path with known conflicts.
- Add performance benchmark test for worktree creation.

**Acceptance Criteria**
- Tests cover lifecycle, cleanup, and stale lock behavior.
- Benchmark tests remain under the target threshold.

### Phase 7 — Rollout & Guardrails
**Objective:** Safe adoption in production.

**Tasks**
- Gate new cleanup behaviors behind existing config when applicable.
- Add a short upgrade note in `README.md` or `docs/` about new cleanup and stale lock behavior.
- Monitor logs for cleanup errors post-release.

**Acceptance Criteria**
- No breaking changes for existing config users.
- Operators have clear instructions for manual recovery.

## 9) Verification Checklist
- `bun run typecheck`
- `bun run build`
- `bun test tests/engine/parallel/worktree-manager.test.ts`
- Manual smoke:
  - Start `ralph-tui run` with parallel workers.
  - Confirm worktree counts appear in dashboard.
  - Trigger manual prune and verify counts update.
  - Simulate crash (Ctrl+C twice) and verify no stale worktrees remain.

## 10) Runbook (Ops)
- **Check worktrees:** `git worktree list --porcelain`
- **Manual prune:** `ralph-tui cleanup` (or `git worktree prune`)
- **Stale lock cleanup:** Delete `.ralph-tui/ralph.lock` only if PID is not running.
- **Conflict debugging:** Inspect conflict files listed in merge failure logs.

## 11) Success Metrics
- Zero reports of “stale lock” blocks when process is not running.
- No main sync failures caused by stash/merge artifacts.
- Manual prune resolves stale/prunable entries within one refresh cycle.
- Worktree creation latency stays below target.

## 12) Implementation Order (Suggested)
1. Finalize `WorktreeManager` logic and tests.
2. Wire stale lock checks and cleanup hooks with config.
3. Validate UI health and prune wiring.
4. Add tests and benchmark.
5. Document runbook updates and release notes.

# Parallel Execution with Worktree-per-Worker

**Generated:** 2026-01-20  
**Scope:** True parallel execution + git worktrees + TUI slots

---

## Goals
- Run **N workers in parallel** (default 5).
- **Isolate edits** per worker using git worktrees.
- Keep **central coordinator** for task assignment + tracker updates.
- Show **5 slots** in TUI (Active + Queued), logs in RightPanel.

---

## Architecture

```
┌──────────────────────────────┐
│ ParallelCoordinator          │
│ - claims tasks               │
│ - manages worktrees          │
│ - dispatches workers         │
│ - emits events               │
└───────────────┬──────────────┘
                │
        ┌───────┴─────────┐
        │ Worker Pool (N) │
        │ worker-1..N     │
        │ worktree dirs   │
        └───────┬─────────┘
                │
        ┌───────▼─────────┐
        │ Agent Execution  │
        │ (per worktree)   │
        └──────────────────┘
```

---

## Worktree Strategy

**Layout**
```
worktrees/
  worker-1/
  worker-2/
  worker-3/
  worker-4/
  worker-5/
```

**Rules**
- One worktree per worker
- Dedicated branch per worker: `worker/<id>/<timestamp>`
- Lock each active worktree (`git worktree lock`) to avoid prune
- Cleanup: `git worktree remove --force` + `git worktree prune`

---

## Tracker Concurrency

### New Tracker APIs
```
claimTask(taskId, workerId): Promise<boolean>
releaseTask(taskId, workerId): Promise<void>
```

### JSON tracker
- Use file-level lock + optimistic write
- Mark in-progress by updating local JSON
- Coordinator owns all tracker writes

### Beads tracker
- Use `.beads/.locks/{taskId}.lock` (atomic create)
- Update status via `bd update --status in_progress`

---

## Coordinator Responsibilities

- Fetch ready tasks (dependency-safe)
- Atomically claim tasks
- Assign tasks to workers
- Update tracker state on completion
- Emit worker + task events

---

## TUI Layout

**Top half:**
- Banner: Total / Active / Queued / Completed / Failed
- Task cards row (5 slots)

**Bottom half:**
- RightPanel (Output / Details / Prompt)

---

## Event Model

- `parallel:worker-started`
- `parallel:task-claimed`
- `parallel:task-started`
- `parallel:task-output`
- `parallel:task-finished`
- `parallel:worker-idle`

---

## Phased Implementation

### Phase 1 (now)
- WorktreeManager (create/remove/lock/prune)
- Tracker claim/release API

### Phase 2
- ParallelCoordinator + Worker
- Event bus + TUI wiring

### Phase 3
- Rate limit sharing
- Crash recovery + cleanup

---

## Risks & Fixes

| Risk | Fix |
|------|-----|
| Double-claim | claimTask w/ lock + CAS |
| Worktree leaks | remove + prune |
| Tracker races | coordinator owns writes |
| TUI event flood | debounce 100ms |

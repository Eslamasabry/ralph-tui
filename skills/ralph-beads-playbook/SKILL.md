---
name: ralph-beads-playbook
description: Playbook for creating high-quality beads (epic + tasks) in ralph-tui. Explains what to add, how to size stories, dependency rules, and acceptance criteria standards. Use when preparing next development sets.
triggers:
  - beads
  - ralph beads
  - create beads
  - beads playbook
  - ralph playbook
  - next dev set
  - ralph this
---

# Ralph Beads Playbook

## Purpose
Use this playbook to plan the next development set in ralph-tui by creating a beads epic with well-scoped child tasks. This ensures every task is independently completable, dependency-aware, and measurable.

## When to Use
- You are asked to define the "next set" of work
- You need to convert a roadmap/goal into actionable tasks
- You need a consistent format for beads tasks and acceptance criteria

## Inputs You Need
1. Current product context (what shipped, what’s missing, pain points)
2. Target scope (one feature area or several)
3. Quality gates (commands that must pass)

## Output You Must Produce
- One epic bead
- 6–15 child beads with clear dependencies
- Acceptance criteria for each child bead
- Quality gates appended to every bead
- Task Impact Table included for every child bead (required)

## Bead Sizing Rules
- Each task must fit in a single ralph-tui run (one agent context window)
- If you can’t explain a change in 2–3 sentences, split it
- Prefer more small tasks over fewer large tasks

## Dependency Rules
- Order foundational work first (types, data model, scheduler changes)
- UI/UX work depends on underlying data/state being ready
- Final polish depends on UI and logic changes
- Use `bd dep add <issue> <depends-on>` after creating beads

## Acceptance Criteria Standards
- Must be testable and explicit
- Avoid vague language ("works correctly")
- Prefer concrete checks ("Header shows X", "Key Y toggles Z")

## Task Impact Table (Required)
Each child bead must include a Task Impact Table that declares expected file changes.

**Required format:**
```
## Task Impact Table (Required)
| action | path | risk | rationale |
|---|---|---|---|
| create | src/new.ts | low | Add new helper |
| modify | src/app.tsx | med | Wire up UI |
| delete | src/legacy.ts | low | Remove unused code |
| rename | src/a.ts → src/b.ts | low | Clarify naming |

Module tags: core, ui
Expected checks:
- bun run typecheck: `bun run typecheck`
- bun run lint: `bun run lint`
- bun run build: `bun run build`
```

**No file changes example (still required):**
```
## Task Impact Table (Required)
| action | path | risk | rationale |
|---|---|---|---|
| (none) | (none) | low | No file changes declared |

Module tags: (none)
Expected checks:
- (none)
```

## Quality Gates (append to every task)
- `bun run typecheck`
- `bun run lint`
- `bun run build`

## Suggested Structure
1. Epic: name + short description + external PRD reference (if any)
2. Tasks: prefix with area (e.g., PC-001)
3. Dependencies: chain by foundation -> UI -> polish

## Example Task Format
```
Title: PC-003: Metrics Bar Threshold Colors
Description: As a power user, I want throughput and success metrics with clear thresholds so that I can identify unhealthy runs quickly.

## Task Impact Table (Required)
| action | path | risk | rationale |
|---|---|---|---|
| modify | src/tui/components/MetricsBar.tsx | med | Add thresholds and colors |

Module tags: tui
Expected checks:
- bun run typecheck: `bun run typecheck`
- bun run lint: `bun run lint`
- bun run build: `bun run build`

Acceptance Criteria:
- [ ] Metrics bar shows TPH, Success Rate, Efficiency, and Scheduler State
- [ ] Success rate color: green > 90, yellow 60-90, red < 60
- [ ] bun run typecheck
- [ ] bun run lint
- [ ] bun run build
```

## Common Mistakes to Avoid
- Bundling multiple features into one bead
- Missing dependencies (UI before data changes)
- Vague acceptance criteria
- Forgetting quality gates

## Hand-off
Once beads are created, report the epic ID and list of child tasks with dependencies.

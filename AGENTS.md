# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-20
**Commit:** 2f8b65d1
**Branch:** main

## OVERVIEW

Ralph TUI - AI Agent Loop Orchestrator built with TypeScript, Bun, and OpenTUI. Terminal UI for orchestrating AI coding agents (Claude Code, OpenCode, Factory Droid) to work through task lists autonomously.

## STRUCTURE

```
ralph-tui/
├── src/
│   ├── cli.tsx           # CLI entry point (binary)
│   ├── commands/         # CLI command implementations (22 files)
│   ├── config/           # Configuration loading with Zod schemas
│   ├── engine/           # Execution engine (iteration loop)
│   ├── plugins/
│   │   ├── agents/       # Agent plugins (claude, opencode, droid)
│   │   └── trackers/     # Tracker plugins (beads, beads-bv, json)
│   ├── remote/           # WebSocket server for remote control
│   ├── session/          # Lock management & persistence
│   ├── setup/            # Interactive setup wizard
│   ├── templates/        # Handlebars prompt templates
│   ├── tui/components/   # OpenTUI React components (26 files)
│   └── utils/            # Shared utilities
├── tests/                # Test suite (29 files, 1034 cases)
├── skills/               # Bundled PRD/task skills
└── website/              # Next.js documentation site
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI behavior | `src/cli.tsx`, `src/commands/` | Subcommand routing |
| Execution logic | `src/engine/index.ts` | Task → prompt → agent loop |
| Configuration | `src/config/schema.ts` | Zod validation rules |
| Agent plugins | `src/plugins/agents/` | Claude, OpenCode, Droid integrations |
| Tracker plugins | `src/plugins/trackers/` | beads, json tracker formats |
| Remote control | `src/remote/` | WebSocket server, multi-instance TUI |
| TUI components | `src/tui/components/` | OpenTUI React components |
| PRD generation | `src/prd/`, `src/chat/` | Interactive PRD creation |
| Tests | `tests/factories/`, `tests/mocks/` | Factory pattern + mock utilities |

## CONVENTIONS

**File Headers** - Required:
```typescript
/**
 * ABOUTME: Brief description of what this file does.
 */
```

**TypeScript** - Strict mode enabled:
- All strict flags on (`strictNullChecks`, `noImplicitAny`, etc.)
- `noUnusedLocals`/`noUnusedParameters`: error
- `_` prefix allowed for unused args/vars: `varsIgnorePattern: '^_'`
- Use `ReactNode` for component return types

**Testing**:
- Bun test runner (`bun test`)
- Factories in `tests/factories/` for test data
- Mocks in `tests/mocks/` for dependencies
- Test files: `*.test.ts` pattern
- Coverage threshold: 40% minimum, 80% target for new code

**Build**:
- Bun bundler: `bun run build`
- Templates copied post-build: `build:templates`
- After changes: `bun run typecheck && bun run build`

## ANTI-PATTERNS (THIS PROJECT)

**Schema violations** (prd.json):
- DO NOT wrap content in `"prd"` object
- DO NOT use `"tasks"` array (use `"userStories"`)
- DO NOT use `"status"` field (use `"passes": boolean`)
- DO NOT use `"subtasks"` or time estimates

**Display requirements**:
- ALWAYS strip ANSI codes (causes black background artifacts in OpenTUI)

**Workflow**:
- NEVER stop before pushing - work incomplete until `git push` succeeds
- NEVER say "ready to push" - YOU must push

## COMMANDS

```bash
# Build & Quality
bun run build && bun run typecheck
bun run lint && bun run lint:fix

# Test
bun test                    # All tests
bun test --watch           # Watch mode
bun test --coverage        # Coverage report

# Dev
bun run dev                # Run CLI from source

# Issue Tracking
bv --robot-triage          # Priority recommendations
bd ready                   # Find available work
```

## NOTES

- **Plugin Architecture**: Agent/tracker plugins use registry pattern (`src/plugins/*/registry.ts`)
- **Session Locks**: Prevents multiple instances via `.ralph-tui/ralph.lock`
- **Remote Control**: `--listen` flag enables WebSocket server for multi-instance TUI
- **Mock Conflicts**: Tests run in 10 batches to avoid `mock.module()` conflicts
- **Coverage Ignore**: TUI components, .test.ts files excluded from coverage targets

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

# src/commands/

CLI command implementations for ralph-tui.

## OVERVIEW

22 command handlers with registry pattern: each exports `execute*`, `parse*` (if args), and `printHelp` functions.

## STRUCTURE

| Pattern | Commands |
|---------|----------|
| `.tsx` (TUI) | `run.tsx`, `resume.tsx`, `create-prd.tsx` |
| `.ts` (headless) | `status.ts`, `logs.ts`, `config.ts`, `setup.ts`, `template.ts`, `doctor.ts`, `info.ts`, `skills.ts`, `plugins.ts`, `docs.ts`, `convert.ts`, `listen.ts`, `remote.ts` |

## WHERE TO LOOK

| Task | Command File |
|------|--------------|
| Execute tasks | `run.tsx` |
| Resume interrupted | `resume.tsx` |
| Create PRD interactively | `create-prd.tsx` |
| Check session status | `status.ts` |
| View iteration logs | `logs.ts` |
| Project setup wizard | `setup.ts` |
| System diagnostics | `doctor.ts` |
| Configuration management | `config.ts` |
| Template editing | `template.ts` |
| Plugin listing | `plugins.ts` |
| Remote server management | `remote.ts` |

## CONVENTIONS

- **Export pattern**: `{ executeXCommand, parseXArgs?, printXHelp }` from each file
- **ABOUTME header**: Required at top of every command file
- **Argument parsing**: Separate `parse*Args` function per command
- **Help output**: `print*Help` function for `--help` flag
- **Exit codes**: Status command uses `0` (success), `1` (in-progress), `2` (error)

## ANTI-PATTERNS

- Commands with TUI must use React entry points via OpenTUI (`createCliRenderer`, `createRoot`)
- Avoid mixing headless and TUI logic in single command file

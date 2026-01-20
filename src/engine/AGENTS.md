# ENGINE KNOWLEDGE BASE

**Generated:** 2026-01-20

## OVERVIEW

Execution engine that orchestrates the agent loop: select task → build prompt → run agent → detect completion → update tracker.

## STRUCTURE

```
src/engine/
├── index.ts              # ExecutionEngine class (1500+ lines)
├── types.ts              # Event types, state interfaces, error handling config
└── rate-limit-detector.ts # Pattern matching for API rate limit detection
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Iteration loop | `index.ts:runLoop()` | Main while loop, handles pausing/resuming |
| State machine | `index.ts:start()/stop()/pause()/resume()` | Transitions: idle→running→paused→idle |
| Task selection | `index.ts:getNextAvailableTask()` | Delegates to tracker for dependency ordering |
| Prompt building | `index.ts:buildPrompt()` | Template rendering with progress context |
| Error handling | `index.ts:runIterationWithErrorHandling()` | Strategies: retry/skip/abort |
| Rate limiting | `rate-limit-detector.ts` | Patterns for 429, rate limit, overloaded |
| Agent switching | `index.ts:switchAgent()` | Primary ↔ fallback on rate limit |
| Subagent tracing | `index.ts:getSubagentTree()` | Nested agent hierarchy for TUI |
| Types & events | `types.ts` | 20+ event types, EngineState, IterationResult |

## CONVENTIONS

**Event System** - `emit(event)` for all state changes:
- `engine:started/stopped/paused/resumed`
- `iteration:started/completed/failed/retried/skipped/rate-limited`
- `task:selected/activated/completed`
- `agent:output/switched/all-limited`

**Completion Signal** - Regex: `/<promise>\s*COMPLETE\s*<\/promise>/i`

**Error Handling Strategies**:
- `retry`: Up to `maxRetries`, with `retryDelayMs` between attempts
- `skip`: Mark task as skipped, continue to next
- `abort`: Stop engine immediately

**Rate Limit Backoff** - Formula: `baseBackoffMs * 3^attempt` (5s, 15s, 45s...)

## ANTI-PATTERNS

**Rate Limit Detection**:
- DO NOT check stdout for rate limit patterns (causes false positives from code output)
- DO check stderr only - CLI tools write errors there
- DO include agent-specific patterns (Anthropic, OpenAI, Azure)

**Task Status Updates**:
- DO update to `in_progress` when starting iteration (for crash recovery)
- DO call `tracker.completeTask()` when `promiseComplete` detected
- DO reset tasks to `open` on graceful shutdown (prevents stale ownership)

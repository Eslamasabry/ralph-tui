# Plugin Architecture

## OVERVIEW
Extensible plugin system for agents (AI coding assistants) and trackers (task sources), using base classes and registries for discovery and lifecycle management.

## STRUCTURE
```
src/plugins/
├── agents/               # Agent plugins (execute AI coding assistants)
│   ├── base.ts           # BaseAgentPlugin abstract class
│   ├── types.ts          # Agent plugin interfaces
│   ├── registry.ts       # AgentRegistry singleton
│   ├── builtin/          # Built-in agents (claude, opencode)
│   ├── droid/            # Factory Droid implementation
│   └── tracing/          # Subagent call tree parser
└── trackers/             # Tracker plugins (task sources)
    ├── base.ts           # BaseTrackerPlugin abstract class
    ├── types.ts          # Tracker plugin interfaces
    ├── registry.ts       # TrackerRegistry singleton
    └── builtin/          # Built-in trackers (beads, beads-bv, json)
```

## WHERE TO LOOK
| What | File |
|------|------|
| Agent lifecycle | `src/plugins/agents/base.ts` |
| Tracker lifecycle | `src/plugins/trackers/base.ts` |
| Plugin discovery | `src/plugins/*/registry.ts` |
| Agent implementations | `src/plugins/agents/builtin/*.ts`, `droid/` |
| Tracker implementations | `src/plugins/trackers/builtin/*/index.ts` |
| Plugin tests | `tests/plugins/` (agent-registry, tracker-registry, etc.) |

## CONVENTIONS
- **Factory pattern**: Plugins export a `default` factory function returning `AgentPlugin`/`TrackerPlugin`
- **Singleton registry**: Use `AgentRegistry.getInstance()` / `TrackerRegistry.getInstance()`
- **User plugins**: `~/.config/ralph-tui/plugins/{agents,trackers}/` (auto-discovered)
- **Built-in plugins**: Registered via `registerBuiltin()` at startup
- **Instance caching**: `getInstance(config)` caches by config name

## ANTI-PATTERNS
- **Bypass registry**: Always use registry methods, never instantiate plugins directly
- **Skip dispose()**: Always call dispose to clean up running processes and connections
- **Conflict IDs**: User plugins cannot override built-in plugin IDs
- **No stdin handling**: Agents should use `getStdinInput()` for prompt delivery when needed

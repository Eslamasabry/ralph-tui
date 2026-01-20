# AGENTS.md

**Configuration loading and validation for Ralph TUI using Zod schemas.**

## STRUCTURE

```
src/config/
├── index.ts          # Config loading, merging, buildConfig(), saveProjectConfig()
├── schema.ts         # Zod schemas, validateStoredConfig(), formatConfigErrors()
├── types.ts          # Type definitions (StoredConfig, RalphConfig, RuntimeOptions)
├── index.test.ts     # Integration tests for config loading
├── schema.test.ts    # Schema validation tests
└── types.test.ts     # Type definition tests
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Config loading/merging | `index.ts` | `loadStoredConfig()`, `mergeConfigs()`, `buildConfig()` |
| Zod schema definitions | `schema.ts` | `StoredConfigSchema`, `validateStoredConfig()`, `formatConfigErrors()` |
| Type definitions | `types.ts` | `StoredConfig`, `RalphConfig`, `RuntimeOptions` |
| Config validation | `index.ts` | `validateConfig()`, `checkSetupStatus()`, `requireSetup()` |

## CONVENTIONS

- **Config files**: TOML format using `smol-toml`
- **Schema validation**: All configs validated with Zod; errors formatted with path and message
- **File headers**: Required `ABOUTME` comment block
- **Strict mode**: `StoredConfigSchema` uses `.strict()` to reject unknown fields
- **Type exports**: All config types exported for programmatic use
- **Command validation**: Shell metacharacters (`;&|\`$()`) rejected in command field
- **Config precedence**: CLI > project > global > defaults

## ANTI-PATTERNS

- **Unknown fields**: Schema uses `.strict()` - unknown fields cause validation errors
- **Shell metacharacters**: Commands cannot contain `;&|\`$()` - use wrapper scripts instead
- **Arrays**: Arrays are replaced (not merged) - project config has full control
- **Missing validation**: Always use `validateConfig()` before starting execution

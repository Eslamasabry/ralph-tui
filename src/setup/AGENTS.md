# AGENTS.md - src/setup/

Interactive setup wizard for Ralph TUI project configuration, skill installation, and config migration.

## STRUCTURE

```
src/setup/
├── index.ts           # Module exports (SetupWizardState, SetupAnswers, runSetupWizard, prompts, migration)
├── types.ts           # Type definitions for wizard state, answers, results, options
├── prompts.ts         # Terminal prompts (promptText, promptBoolean, promptSelect, printSection, etc.)
├── wizard.ts          # Main setup wizard (runSetupWizard, checkAndRunSetup, projectConfigExists)
├── skill-installer.ts # Skill installation (installSkillTo, installSkillsForAgent, listBundledSkills)
├── migration.ts       # Config migration (migrateConfig, checkAndMigrate, CURRENT_CONFIG_VERSION)
├── wizard.test.ts     # Wizard integration tests
├── skill-installer.test.ts
└── migration.test.ts
```

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Wizard flow | `wizard.ts` | `runSetupWizard()` - 4 steps: tracker, agent, iterations, skills |
| Terminal prompts | `prompts.ts` | `promptSelect()` numbered choices, styled ANSI output |
| Skill installation | `skill-installer.ts` | `installSkillsForAgent()` - multi-agent support via plugin paths |
| Config migration | `migration.ts` | `migrateConfig()` - auto-updates skills/templates on version change |

## CONVENTIONS

- **File Headers**: `ABOUTME` comment required (see existing files)
- **Error Handling**: Return `{ success, error }` objects, never throw for user errors
- **Cancellation**: Catch `readline was closed` for Ctrl+C, return `{ cancelled: true }`
- **Color Output**: Use ANSI codes via `prompts.ts` constants (`colors.cyan`, `colors.green`, etc.)
- **Versioning**: `CURRENT_CONFIG_VERSION` in migration.ts - bump on breaking changes

## ANTI-PATTERNS

**Deprecation warnings** (use new functions instead):
- `getClaudeSkillsDir()` → `resolveSkillsPath()`
- `isSkillInstalled()` → `isSkillInstalledAt()`
- `installSkill()` → `installSkillTo()`
- `installAllSkills()` → `installAllSkillsTo()`

**Display requirements**:
- NEVER use raw `console.log()` for user-facing output in wizards - use prompt helpers
- ALWAYS use `printSection()`, `printSuccess()`, `printError()`, `printInfo()` for styled output

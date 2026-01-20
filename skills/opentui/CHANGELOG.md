# Changelog

All notable changes to the `opentui-maker` skill will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2024-12-30

### Added

- Initial release of `opentui-maker` skill
- **Core Skill Files**
  - `SKILL.md` - Main skill definition with template selection workflow
  - `WORKFLOW.md` - Complete OpenTUI + SolidJS patterns reference
  - `TROUBLESHOOTING.md` - Build issues and solutions guide
  - `README.md` - Skill overview and features
  - `USAGE.md` - Detailed usage instructions and example prompts
  - `CHANGELOG.md` - Version history (this file)

- **Template System**
  - `templates/_index.md` - Template registry with placeholder documentation
  - Template structure: `template.md`, `prompt.md`, `screenshot.png`, `source/`

- **Batch Processor Template** (`templates/batch-processor/`)
  - Complete working implementation for file processing TUIs
  - Components: Logo, ProgressBar, StatsPanel, FileList
  - Contexts: Theme provider, AppState management, Helper utilities
  - Full customization support (name, colors, subtitle)
  - All CLI options: `-i`, `-r`, `-c`, `-d`, `-v`
  - All statistics metrics: status, progress, active, completed, failed, elapsed, output, ETA

- **Validation Tools**
  - `scripts/validate-jsx.sh` - JSX pragma validation script

- **Critical Pattern Enforcement**
  - SolidJS preload registration in `launcher.ts`
  - JSX pragma `/** @jsxImportSource @opentui/solid */` in all TSX files
  - Build script with `solidPlugin` for correct JSX transformation
  - `--conditions=browser` flag in package.json scripts

- **Color Theme System**
  - Default violet theme (`#A855F7`)
  - Alternative themes: Emerald, Blue, Red, Amber, Cyan
  - Dark/light mode support in theme JSON

- **Documentation**
  - Visual layout ASCII diagrams
  - Status icon reference (completed, running, pending, failed, cancelled)
  - Box model quick reference
  - Component specifications

### Dependencies

- `@opentui/core@0.1.48`
- `@opentui/solid@0.1.48`
- `solid-js@1.9.9`
- `commander@^14.0.1`

---

## Version History Summary

| Version | Date | Summary |
|---------|------|---------|
| 1.0.0 | 2024-12-30 | Initial release with batch-processor template |

[Unreleased]: https://github.com/user/opentui-maker/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/user/opentui-maker/releases/tag/v1.0.0

# opentui-maker

A Claude Code skill for scaffolding Terminal User Interface (TUI) applications using **OpenTUI** with **SolidJS** reactivity.

## What This Skill Does

This skill generates complete, working TUI application projects from templates. It handles:

- **Project scaffolding** - Creates full directory structure with all required files
- **Critical pattern enforcement** - Ensures SolidJS preload, JSX pragma, and build configuration are correct
- **Customization** - Applies your project name, colors, and branding to templates
- **Dependency setup** - Generates correct `package.json` with OpenTUI and SolidJS dependencies

## When to Use This Skill

Use `opentui-maker` when you want to:

| Task | Example |
|------|---------|
| Create a new TUI application | "Create a video converter TUI" |
| Scaffold from a template | "Use the batch-processor template" |
| Build a file processing tool | "I need a batch image optimizer with progress bars" |
| Create CLI tools with rich UI | "Build a TUI for my backup script" |

## Available Templates

| Template | Description | Best For |
|----------|-------------|----------|
| `batch-processor` | File processing with progress tracking, stats panel, scrollable file list | Video/audio conversion, image optimization, file migration, batch operations |

## Key Features

### Automatic Pattern Enforcement

The skill ensures these **mandatory patterns** are present in every project:

1. **SolidJS Preload** - Registered before any TSX imports
2. **JSX Pragma** - `/** @jsxImportSource @opentui/solid */` in all `.tsx` files
3. **Build Configuration** - Correct `solidPlugin` setup for Bun
4. **Runtime Flags** - `--conditions=browser` in all scripts

### Customization Options

| Option | Description | Example |
|--------|-------------|---------|
| Project Name | Lowercase, hyphens allowed | `video-converter` |
| Description | One-sentence purpose | "Convert videos to MP3" |
| Logo Title | Short name for ASCII art | "VIDCNV" |
| Subtitle | Tagline below logo | ">>> Video Converter >>>" |
| Primary Color | Theme color (hex) | `#A855F7` |

### Color Themes

| Use Case | Color | Hex |
|----------|-------|-----|
| Video/Media | Violet | `#A855F7` |
| Images | Emerald | `#10B981` |
| Data/Analytics | Blue | `#3B82F6` |
| Security | Red | `#EF4444` |
| Files/Docs | Amber | `#F59E0B` |
| Network | Cyan | `#06B6D4` |

## Project Structure Generated

```
your-project/
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── scripts/
│   └── build.mjs           # Production build with solidPlugin
└── src/
    ├── runtime/
    │   └── cli-setup.ts    # CLI entry point (Commander.js)
    ├── core/
    │   └── types.ts        # Type definitions
    └── cli/tui/
        ├── launcher.ts     # SolidJS preload registration
        ├── app.tsx         # Root component
        ├── component/      # UI components
        ├── context/        # State and theme providers
        └── routes/         # Application views
```

## Requirements

- **Runtime**: [Bun](https://bun.sh) v1.3.0+
- **Dependencies**: Installed automatically via `bun install`
  - `@opentui/core` - Core TUI library
  - `@opentui/solid` - SolidJS integration
  - `solid-js` - Reactivity system
  - `commander` - CLI parsing

## Quick Start

1. Ask Claude Code to create a TUI project
2. Provide customization details when prompted
3. Run `bun install` in the generated project
4. Run `bun run dev` to start development

## Related Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Skill definition and workflow |
| `USAGE.md` | Detailed usage instructions and prompts |
| `CHANGELOG.md` | Version history |
| `WORKFLOW.md` | OpenTUI + SolidJS patterns reference |
| `TROUBLESHOOTING.md` | Common issues and solutions |
| `templates/` | Template source files |

## License

This skill is part of the OpenTUIMaker project.

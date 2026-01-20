# OpenTUI Template Registry

This directory contains template packages for scaffolding TUI applications.

## Available Templates

| ID | Name | Description | Use Case |
|----|------|-------------|----------|
| `batch-processor` | Batch Processor | File processing with progress tracking, stats panel, and scrollable file list | Video/audio conversion, image optimization, file migration |

## Template Structure

Each template directory contains:

```
template-name/
├── template.md         # Layout specification and component definitions
├── prompt.md           # User-facing prompt template for customization
├── screenshot.png      # Visual reference of the template
└── source/             # Complete working implementation
    ├── package.json
    ├── tsconfig.json
    ├── scripts/
    │   └── build.mjs
    └── src/
        ├── runtime/
        │   └── cli-setup.ts
        ├── core/
        │   └── types.ts
        └── cli/tui/
            ├── launcher.ts
            ├── app.tsx
            ├── component/
            ├── context/
            └── routes/
```

## Adding New Templates

1. Create a new directory under `templates/`
2. Add `template.md` with:
   - Visual layout ASCII diagram
   - Color scheme
   - Component specifications
   - Status icons used
3. Add `prompt.md` with:
   - User-facing customization prompt
   - Required/optional options
   - Example configurations
4. Add `screenshot.png` showing the template in action
5. Add `source/` directory with complete working implementation
6. Update this `_index.md` with the new template entry

## Template Placeholders

Templates use these placeholders that get replaced during scaffolding:

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `{{PROJECT_NAME}}` | Project name (lowercase, hyphens) | `video-converter` |
| `{{PROJECT_DESCRIPTION}}` | Short description | `Convert videos to MP3` |
| `{{PROJECT_SUBTITLE}}` | Tagline for logo | `Video → MP3 Converter` |
| `{{PRIMARY_COLOR}}` | Primary theme color hex | `#A855F7` |

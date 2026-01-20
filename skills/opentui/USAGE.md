# Usage Guide

This guide covers everything you need to know to use the `opentui-maker` skill effectively.

## Table of Contents

1. [Activating the Skill](#activating-the-skill)
2. [Example Prompts](#example-prompts)
3. [Template Selection](#template-selection)
4. [Customization Options](#customization-options)
5. [Generated Project Walkthrough](#generated-project-walkthrough)
6. [Running Your Project](#running-your-project)
7. [Adding Business Logic](#adding-business-logic)
8. [Common Workflows](#common-workflows)

---

## Activating the Skill

The skill activates automatically when Claude Code detects you want to create a TUI application. Use any of these trigger phrases:

### Direct Requests

```
Create a TUI for [purpose]
Build a terminal UI for [task]
Scaffold a TUI application
I need a batch processing TUI
Make a CLI tool with a rich interface
```

### Template-Specific Requests

```
Use the batch-processor template to create [project]
Create a file processor TUI
Build a batch converter with progress bars
```

### Feature-Specific Requests

```
Create a TUI with progress tracking
Build a terminal app with a stats panel
Make a CLI tool with a scrollable file list
```

---

## Example Prompts

### Basic Project Creation

```
Create a TUI for batch video conversion
```

**Result**: Creates a project with default settings (violet theme, standard layout)

### With Color Theme

```
Create an image optimizer TUI with emerald green theme
```

**Result**: Creates project with emerald (`#10B981`) as primary color

### With Full Customization

```
Create a backup tool TUI called "backup-buddy" with:
- Blue theme
- Logo title: BACKUP
- Subtitle: "Secure File Backup"
```

**Result**: Creates fully customized project with all specified options

### Specifying Template

```
Use the batch-processor template to create a log analyzer
```

**Result**: Uses batch-processor template explicitly

### Dry Run / Preview

```
Show me what files would be created for a TUI project called "file-mover"
```

**Result**: Lists files without creating them

---

## Template Selection

### Available Templates

| Template ID | Name | Description |
|-------------|------|-------------|
| `batch-processor` | Batch Processor | File processing with progress, stats, file list |

### How to Select a Template

**Option 1: Let Claude Code suggest** (recommended for beginners)
```
Create a TUI for processing files
```
Claude Code will recommend the appropriate template.

**Option 2: Specify explicitly**
```
Use the batch-processor template
```

**Option 3: List templates first**
```
What TUI templates are available?
```

### Template Details

#### batch-processor

**Best for:**
- Video/audio format conversion
- Image batch processing
- File migration/backup
- Archive extraction
- Data transformation

**Includes:**
- ASCII logo header
- Main progress bar
- Statistics panel (8 metrics)
- Scrollable file list with status icons
- Keyboard hint for graceful shutdown

**Visual Layout:**
```
┌────────────────────────────────────────────────────────────────────┐
│            ██╗      ██████╗  ██████╗  ██████╗                      │
│            ██║     ██╔═══██╗██╔════╝ ██╔═══██╗                     │
│            ██║     ██║   ██║██║  ███╗██║   ██║                     │
│            ██║     ██║   ██║██║   ██║██║   ██║                     │
│            ███████╗╚██████╔╝╚██████╔╝╚██████╔╝                     │
│            ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝                      │
│                  >>> Your Subtitle Here >>>                        │
│                                                                    │
│  Press Ctrl+C to gracefully stop                                   │
│  │████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 25% (100/400)          │
│                                                                    │
│  ┌─ Statistics ─────────────────────────────────────────────────┐  │
│  │ Status: Processing │ Progress: 100/400 (25%)                 │  │
│  │ Active: 5 │ Completed: 100 │ Failed: 0                       │  │
│  │ Elapsed: 00:05:32 │ Output: 150.5 MB │ ETA: 00:16:36         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ✓ file1.mp4                              [completed] 1.5 MB       │
│  ● file2.mp4                              │████░░░░│ 94%           │
│  ○ file3.mp4                              [pending]                │
└────────────────────────────────────────────────────────────────────┘
```

---

## Customization Options

### Required Information

| Option | Description | Example |
|--------|-------------|---------|
| Project Name | Lowercase, hyphens OK | `video-converter` |

### Optional Information

| Option | Description | Default | Example |
|--------|-------------|---------|---------|
| Description | One-sentence purpose | Template default | "Convert videos to MP3" |
| Logo Title | Short name (6-10 chars) | "LOGO" | "VIDCNV" |
| Subtitle | Tagline below logo | Template default | ">>> Video Converter >>>" |
| Primary Color | Theme hex color | `#A855F7` (violet) | `#10B981` |

### Color Themes

**Pre-defined themes:**

| Name | Hex | Best For |
|------|-----|----------|
| Violet | `#A855F7` | Video/media tools |
| Emerald | `#10B981` | Image processing |
| Blue | `#3B82F6` | Data/analytics |
| Red | `#EF4444` | Security tools |
| Amber | `#F59E0B` | File/document tools |
| Cyan | `#06B6D4` | Network tools |

**Custom colors:**
```
Create a TUI with primary color #FF6B6B
```

### CLI Options (batch-processor)

All projects include these CLI flags by default:

| Flag | Description | Default |
|------|-------------|---------|
| `-i, --input <path>` | Input directory or file | Required |
| `-o, --output <path>` | Output directory | Same as input |
| `-r, --recursive` | Process subdirectories | `false` |
| `-c, --concurrency <n>` | Parallel operations | `5` |
| `-d, --dry-run` | Preview without processing | `false` |
| `-v, --verbose` | Show detailed output | `false` |

---

## Generated Project Walkthrough

### Directory Structure

```
your-project/
├── package.json            # Project metadata and scripts
├── tsconfig.json           # TypeScript configuration
├── scripts/
│   └── build.mjs           # Production build script
└── src/
    ├── runtime/
    │   └── cli-setup.ts    # Entry point, CLI parsing
    ├── core/
    │   └── types.ts        # Type definitions
    └── cli/tui/
        ├── launcher.ts     # SolidJS preload (CRITICAL)
        ├── app.tsx         # Root component
        ├── component/
        │   ├── logo.tsx
        │   ├── progress-bar.tsx
        │   ├── stats-panel.tsx
        │   └── file-list.tsx
        ├── context/
        │   ├── helper.tsx
        │   ├── theme.tsx
        │   ├── app-state.tsx
        │   └── theme/
        │       └── default.json
        └── routes/
            └── main.tsx
```

### Key Files Explained

| File | Purpose | You Should |
|------|---------|------------|
| `cli-setup.ts` | CLI argument parsing | Add/modify CLI options |
| `types.ts` | Type definitions | Add your custom types |
| `launcher.ts` | SolidJS preload | **Don't modify** |
| `app.tsx` | Root component | Add global providers |
| `main.tsx` | Main view | Modify layout |
| `app-state.tsx` | State management | Add your state logic |
| `default.json` | Theme colors | Customize colors |

---

## Running Your Project

### After Scaffolding

```bash
# 1. Navigate to project
cd your-project

# 2. Install dependencies
bun install

# 3. Run in development mode
bun run dev

# 4. Run with options
bun run dev -- -i ./input-folder -r

# 5. Build for production
bun run build

# 6. Run production build
bun dist/cli-setup.js
```

### Development Workflow

```bash
# Run with dry-run to test
bun run dev -- -i ./test-files -d

# Run with verbose output
bun run dev -- -i ./test-files -v

# Run with concurrency limit
bun run dev -- -i ./test-files -c 3
```

---

## Adding Business Logic

The generated project is a UI shell. You need to add your processing logic.

### Step 1: Create a Processor

Create `src/core/processor.ts`:

```typescript
import type { Job } from './types.js';

export async function processFile(job: Job): Promise<void> {
  // Your processing logic here
  // Update job.progress as you work
  // Set job.status when done
}

export async function scanDirectory(path: string): Promise<string[]> {
  // Scan for files to process
  // Return array of file paths
}
```

### Step 2: Connect to State

In `src/cli/tui/app.tsx`, import and use your processor:

```typescript
import { processFile, scanDirectory } from '../../core/processor.js';
```

### Step 3: Wire Up Events

The `app-state.tsx` context provides actions:
- `setJobs(jobs)` - Set the job list
- `updateJob(id, updates)` - Update a single job
- `setStatus(status)` - Set overall status

---

## Common Workflows

### Creating a Video Converter

```
Create a TUI for batch video conversion called "vid2mp3" with violet theme
```

Then add FFmpeg processing logic to convert videos.

### Creating an Image Optimizer

```
Create an image optimizer TUI with emerald theme, logo "IMGOPT", subtitle "Batch Image Optimization"
```

Then add Sharp or ImageMagick processing logic.

### Creating a File Backup Tool

```
Create a backup tool TUI called "backup-pro" with:
- Blue theme
- Logo: BACKUP
- Subtitle: "Secure File Backup System"
```

Then add file copying and verification logic.

### Creating a Log Analyzer

```
Create a log analyzer TUI with cyan theme for processing server logs
```

Then add log parsing and aggregation logic.

---

## Troubleshooting

See `TROUBLESHOOTING.md` for common issues:
- JSX transform errors
- Build failures
- Runtime errors
- Theme not applying

## Getting Help

If the skill doesn't activate or behaves unexpectedly:

1. Be explicit: "Use the opentui-maker skill to create..."
2. Specify the template: "Use batch-processor template"
3. Check your working directory is writable
4. Ensure Bun is installed (`bun --version`)

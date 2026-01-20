# Batch Processor Template

A TUI template for file processing applications with progress tracking, statistics panel, and scrollable file list.

## Visual Layout

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│            ██╗      ██████╗  ██████╗  ██████╗                      │
│            ██║     ██╔═══██╗██╔════╝ ██╔═══██╗                     │
│            ██║     ██║   ██║██║  ███╗██║   ██║                     │ ← ASCII Logo (Violet)
│            ██║     ██║   ██║██║   ██║██║   ██║                     │
│            ███████╗╚██████╔╝╚██████╔╝╚██████╔╝                     │
│            ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝                      │
│                  >>> Subtitle Line >>> ♫                           │ ← Tagline (Muted)
│                                                                    │
│  Press Ctrl+C to gracefully stop (let active jobs finish)          │ ← Keyboard Hint
│  │████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 25% (100/400)          │ ← Main Progress Bar
│                                                                    │
│  ┌─ Statistics ─────────────────────────────────────────────────┐  │
│  │ Status: Processing │ Progress: 100/400 (25%) │               │  │ ← Stats Panel
│  │ Active: 5 │ Completed: 100 │ Failed: 0 │                     │  │
│  │ Elapsed: 00:05:32 │ Output: 150.5 MB │ ETA: 00:16:36 │       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ✓ 1-First-File.mp4                    [completed] 1.5 MB          │
│  ● 2-Second-File.mp4                   │████░░░░│ 94%              │ ← File List
│  ✓ 3-Third-File.mp4                    [completed] 1.6 MB          │   with status icons
│  ● 4-Fourth-File.mp4                   │██░░░░░░│ 33%              │
│  ○ 5-Fifth-File.mp4                    [pending]                   │
│  ... and 395 more files                                            │ ← Footer overflow
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Status Icons

| Icon | Status | Color |
|------|--------|-------|
| `✓` | Completed | success (green) |
| `●` | Running/Active | primary (violet) |
| `○` | Pending | muted (gray) |
| `✗` | Failed | error (red) |
| `⊘` | Cancelled | warning (yellow) |

## Default Color Scheme (Violet Theme)

```json
{
  "defs": {
    "darkPrimary": "#A855F7",
    "darkSecondary": "#C084FC",
    "darkRed": "#ef4444",
    "darkGreen": "#22c55e",
    "darkYellow": "#eab308",
    "darkText": "#f3f4f6",
    "darkMuted": "#9ca3af",
    "darkBorder": "#5a4f7a",
    "darkBorderSubtle": "#473e64",
    "darkBackground": "#1e1b2e"
  },
  "theme": {
    "primary": { "dark": "darkPrimary", "light": "#6d28d9" },
    "secondary": { "dark": "darkSecondary", "light": "#9333ea" },
    "error": { "dark": "darkRed", "light": "#dc2626" },
    "warning": { "dark": "darkYellow", "light": "#ca8a04" },
    "success": { "dark": "darkGreen", "light": "#16a34a" },
    "text": { "dark": "darkText", "light": "#1e1b2e" },
    "textMuted": { "dark": "darkMuted", "light": "#7c3aed" },
    "border": { "dark": "darkBorder", "light": "#c084fc" },
    "borderSubtle": { "dark": "darkBorderSubtle", "light": "#d8b4fe" }
  }
}
```

## Alternative Color Schemes

| Use Case | Primary Color | Hex |
|----------|---------------|-----|
| Video/Media | Violet | `#A855F7` |
| Images | Emerald | `#10B981` |
| Data/Analytics | Blue | `#3B82F6` |
| Security | Red | `#EF4444` |
| Files/Docs | Amber | `#F59E0B` |
| Network | Cyan | `#06B6D4` |

## Components

### Logo
- ASCII block text header
- Customizable title and subtitle
- Primary color for text

### Progress Bar
- Unicode block characters (█ for filled, ░ for empty)
- Vertical bar delimiters (│)
- Shows percentage and count
- Variants: primary, success, error, warning

### Stats Panel
- Box-drawing border characters
- Key metrics: Status, Progress, Active, Completed, Failed
- Optional: Elapsed, Output size, ETA

### File List
- Status icon prefix
- Truncated filename (40 chars max)
- Status-specific suffix:
  - Running: Mini progress bar
  - Completed: [completed] + file size
  - Failed: [failed]
  - Pending: [pending]
- Overflow indicator: "... and X more files"

## CLI Options (Default)

```
-i, --input <path>      Input directory or file
-o, --output <path>     Output directory (optional)
-r, --recursive         Process subdirectories
-c, --concurrency <n>   Parallel operations (default: 5)
-d, --dry-run           Preview without processing
-v, --verbose           Show detailed output
```

## Best Use Cases

- Video/audio format conversion
- Image optimization/resizing
- File migration/backup
- Batch renaming
- Archive extraction
- Data transformation pipelines

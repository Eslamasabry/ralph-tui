# Batch Processor - User Prompt Template

Use this template to create a TUI application for batch file processing.

---

## Application Details

**Name**: {{PROJECT_NAME}}
**Purpose**: {{PROJECT_DESCRIPTION}}
**Primary Color**: {{PRIMARY_COLOR}} (default: #A855F7 violet)

## CLI Options

### Required
- `-i, --input <path>`: Input directory or file path

### Optional
- `-o, --output <path>`: Output directory (default: same as input)
- `-r, --recursive`: Process subdirectories
- `-c, --concurrency <n>`: Parallel operations (default: 5)
- `-d, --dry-run`: Preview without processing
- `-v, --verbose`: Show detailed output

## Customization Points

### Logo
- **Title**: Short app name (6-10 chars works best for ASCII art)
- **Subtitle**: Descriptive tagline (e.g., "Video → MP3 Converter")

### Statistics Panel
Choose which metrics to display:
- [ ] Status (always shown)
- [ ] Progress count and percentage (always shown)
- [ ] Active jobs count
- [ ] Completed count
- [ ] Failed count
- [ ] Elapsed time
- [ ] Output size (cumulative)
- [ ] ETA (estimated time remaining)

### File List
- Visible items: 10 (adjustable based on terminal height)
- Scrolling: Arrow keys or auto-follow active

### Color Theme
Select a primary color or define custom:
- Violet (`#A855F7`) - Video/Media
- Emerald (`#10B981`) - Images
- Blue (`#3B82F6`) - Data/Analytics
- Red (`#EF4444`) - Security
- Amber (`#F59E0B`) - Files/Docs
- Cyan (`#06B6D4`) - Network
- Custom: `#XXXXXX`

---

## Example Configurations

### Video Converter
```
Name: video-converter
Purpose: Convert video files to MP3 audio
Primary Color: #A855F7 (violet)
Subtitle: Video → MP3 Batch Converter
```

### Image Optimizer
```
Name: image-optimizer
Purpose: Batch optimize and resize images
Primary Color: #10B981 (emerald)
Subtitle: Image Optimization Tool
```

### File Backup
```
Name: backup-tool
Purpose: Backup files to destination with verification
Primary Color: #3B82F6 (blue)
Subtitle: Secure File Backup
```

---

## Post-Scaffold Steps

After the project is scaffolded:

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Add your processing logic**
   - Edit `src/core/processor.ts` (create this file)
   - Implement file scanning, processing, and status updates

3. **Test in development**
   ```bash
   bun run dev -- -i ./test-files -d
   ```

4. **Build for production**
   ```bash
   bun run build
   ```

---

## Questions for Customization

When scaffolding, you'll be asked:

1. **Project name** (lowercase, hyphens allowed)
2. **Description** (one sentence)
3. **Logo title** (short, for ASCII art)
4. **Subtitle** (descriptive tagline)
5. **Primary color** (select or custom hex)
6. **CLI options** (which to include)
7. **Stats to display** (select metrics)

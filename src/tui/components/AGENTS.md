# AGENTS.md - TUI Components

**OVERVIEW**: 25 OpenTUI React components for the Ralph terminal UI.

## STRUCTURE

```
src/tui/components/
├── App.tsx              # Root component (Header, LeftPanel, RightPanel, Footer)
├── Header.tsx           # Top navigation bar with status indicators
├── Footer.tsx           # Bottom status bar with keyboard shortcuts
├── LeftPanel.tsx        # Task list navigation
├── RightPanel.tsx       # Task detail view with tabs
├── TabBar.tsx           # Remote instance tab navigation
├── ChatView.tsx         # AI chat interface for PRD creation
├── PrdChatApp.tsx       # PRD chat application wrapper
├── RunApp.tsx           # Main execution TUI app
├── EpicSelectionApp.tsx # Epic/bead selection UI
├── IterationHistoryView.tsx
├── IterationDetailView.tsx
├── TaskDetailView.tsx
├── SubagentTreePanel.tsx
├── SubagentSection.tsx
├── ProgressDashboard.tsx
├── SettingsView.tsx
├── RemoteConfigView.tsx
├── RemoteManagementOverlay.tsx
├── ConfirmationDialog.tsx
├── FormattedText.tsx    # ANSI-free text rendering
├── HelpOverlay.tsx
├── Toast.tsx
├── EpicLoaderOverlay.tsx
└── FormattedText.tsx
```

## WHERE TO LOOK

| For | Look At |
|-----|---------|
| Main layout | `App.tsx` |
| Text formatting (ANSI-safe) | `FormattedText.tsx` |
| Remote tabs | `TabBar.tsx`, `RemoteManagementOverlay.tsx` |
| Task UI | `TaskDetailView.tsx`, `IterationDetailView.tsx` |
| Subagent tracing | `SubagentTreePanel.tsx` |
| Tests | `tests/tui/` (output-parser, theme, state-utils, subagent-tree-panel) |

## CONVENTIONS

- **Return type**: `ReactNode` (not `JSX.Element`)
- **Imports**: Use `@opentui/react` for hooks/hooks (`useKeyboard`, `useTerminalDimensions`)
- **File header**: Required `ABOUTME` comment block
- **Theme colors**: Import from `../theme.js` (never hardcode hex values)
- **Types**: Import from `../types.js` for AppState, TaskItem, etc.

## ANTI-PATTERNS

- **Never use ANSI escape codes**: Causes black background artifacts in OpenTUI. Use `FormattedText.tsx` or theme colors instead.
- **Coverage ignored**: TUI components are excluded from coverage requirements (hard to test in headless environment).

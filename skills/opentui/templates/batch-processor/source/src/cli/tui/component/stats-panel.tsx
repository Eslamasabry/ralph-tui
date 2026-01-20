/** @jsxImportSource @opentui/solid */
import { useTheme } from '../context/theme.js';

export interface StatsPanelProps {
  status: string;
  progress: { current: number; total: number };
  active: number;
  completed: number;
  failed: number;
  elapsed: string;
  output?: string;
  eta?: string;
}

export function StatsPanel(props: StatsPanelProps) {
  const { theme } = useTheme();

  const progressPct = () =>
    props.progress.total > 0
      ? Math.round((props.progress.current / props.progress.total) * 100)
      : 0;

  return (
    <box flexDirection="column" paddingX={2}>
      <text style={{ fg: theme.border }}>┌─ Statistics ─────────────────────────────────────────────────┐</text>

      <box flexDirection="row">
        <text style={{ fg: theme.border }}>│ </text>
        <text style={{ fg: theme.text }}>Status: </text>
        <text style={{ fg: theme.success }}>{props.status}</text>
        <text style={{ fg: theme.textMuted }}> │ </text>
        <text style={{ fg: theme.text }}>Progress: </text>
        <text style={{ fg: theme.primary }}>{props.progress.current}/{props.progress.total}</text>
        <text style={{ fg: theme.textMuted }}> ({progressPct()}%)</text>
        <text style={{ fg: theme.textMuted }}> │</text>
      </box>

      <box flexDirection="row">
        <text style={{ fg: theme.border }}>│ </text>
        <text style={{ fg: theme.text }}>Active: </text>
        <text style={{ fg: theme.primary }}>{props.active}</text>
        <text style={{ fg: theme.textMuted }}> │ </text>
        <text style={{ fg: theme.text }}>Completed: </text>
        <text style={{ fg: theme.success }}>{props.completed}</text>
        <text style={{ fg: theme.textMuted }}> │ </text>
        <text style={{ fg: theme.text }}>Failed: </text>
        <text style={{ fg: props.failed > 0 ? theme.error : theme.textMuted }}>{props.failed}</text>
        <text style={{ fg: theme.textMuted }}> │</text>
      </box>

      <box flexDirection="row">
        <text style={{ fg: theme.border }}>│ </text>
        <text style={{ fg: theme.text }}>Elapsed: </text>
        <text style={{ fg: theme.primary }}>{props.elapsed}</text>
        {props.output && (
          <>
            <text style={{ fg: theme.textMuted }}> │ </text>
            <text style={{ fg: theme.text }}>Output: </text>
            <text style={{ fg: theme.primary }}>{props.output}</text>
          </>
        )}
        {props.eta && (
          <>
            <text style={{ fg: theme.textMuted }}> │ </text>
            <text style={{ fg: theme.text }}>ETA: </text>
            <text style={{ fg: theme.primary }}>{props.eta}</text>
          </>
        )}
        <text style={{ fg: theme.textMuted }}> │</text>
      </box>

      <text style={{ fg: theme.border }}>└──────────────────────────────────────────────────────────────┘</text>
    </box>
  );
}

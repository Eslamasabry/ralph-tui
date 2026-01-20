/** @jsxImportSource @opentui/solid */
import { Show } from 'solid-js';
import { useTheme } from '../context/theme.js';

export interface ProgressBarProps {
  current: number;
  total: number;
  width?: number;
  showPercentage?: boolean;
  showCount?: boolean;
  variant?: 'primary' | 'success' | 'error' | 'warning';
}

export function ProgressBar(props: ProgressBarProps) {
  const { theme } = useTheme();

  const width = () => props.width ?? 40;
  const percentage = () => props.total > 0 ? Math.round((props.current / props.total) * 100) : 0;
  const filledWidth = () => props.total > 0 ? Math.floor((props.current / props.total) * width()) : 0;

  const barColor = () => {
    switch (props.variant) {
      case 'success': return theme.success;
      case 'error': return theme.error;
      case 'warning': return theme.warning;
      default: return theme.primary;
    }
  };

  return (
    <box flexDirection="row" gap={1}>
      <text style={{ fg: theme.borderSubtle }}>│</text>
      <text style={{ fg: barColor() }}>{'█'.repeat(filledWidth())}</text>
      <text style={{ fg: theme.borderSubtle }}>{'░'.repeat(width() - filledWidth())}</text>
      <text style={{ fg: theme.borderSubtle }}>│</text>
      <Show when={props.showPercentage !== false}>
        <text style={{ fg: theme.text }}>{percentage()}%</text>
      </Show>
      <Show when={props.showCount}>
        <text style={{ fg: theme.textMuted }}>({props.current}/{props.total})</text>
      </Show>
    </box>
  );
}

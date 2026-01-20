/** @jsxImportSource @opentui/solid */
import { useTheme } from '../context/theme.js';

export interface LogoProps {
  title: string;
  subtitle?: string;
}

// ASCII block font generator (simple version)
const BLOCK_CHARS: Record<string, string[]> = {
  A: ['█████', '█   █', '█████', '█   █', '█   █'],
  B: ['████ ', '█   █', '████ ', '█   █', '████ '],
  C: ['█████', '█    ', '█    ', '█    ', '█████'],
  D: ['████ ', '█   █', '█   █', '█   █', '████ '],
  E: ['█████', '█    ', '████ ', '█    ', '█████'],
  F: ['█████', '█    ', '████ ', '█    ', '█    '],
  G: ['█████', '█    ', '█  ██', '█   █', '█████'],
  H: ['█   █', '█   █', '█████', '█   █', '█   █'],
  I: ['█████', '  █  ', '  █  ', '  █  ', '█████'],
  J: ['█████', '   █ ', '   █ ', '█  █ ', '████ '],
  K: ['█   █', '█  █ ', '███  ', '█  █ ', '█   █'],
  L: ['█    ', '█    ', '█    ', '█    ', '█████'],
  M: ['█   █', '██ ██', '█ █ █', '█   █', '█   █'],
  N: ['█   █', '██  █', '█ █ █', '█  ██', '█   █'],
  O: ['█████', '█   █', '█   █', '█   █', '█████'],
  P: ['█████', '█   █', '█████', '█    ', '█    '],
  Q: ['█████', '█   █', '█   █', '█  █ ', '████ '],
  R: ['█████', '█   █', '█████', '█  █ ', '█   █'],
  S: ['█████', '█    ', '█████', '    █', '█████'],
  T: ['█████', '  █  ', '  █  ', '  █  ', '  █  '],
  U: ['█   █', '█   █', '█   █', '█   █', '█████'],
  V: ['█   █', '█   █', '█   █', ' █ █ ', '  █  '],
  W: ['█   █', '█   █', '█ █ █', '██ ██', '█   █'],
  X: ['█   █', ' █ █ ', '  █  ', ' █ █ ', '█   █'],
  Y: ['█   █', ' █ █ ', '  █  ', '  █  ', '  █  '],
  Z: ['█████', '   █ ', '  █  ', ' █   ', '█████'],
  ' ': ['     ', '     ', '     ', '     ', '     '],
};

function generateBlockText(text: string): string[] {
  const chars = text.toUpperCase().split('');
  const lines: string[] = ['', '', '', '', ''];

  chars.forEach((char, idx) => {
    const block = BLOCK_CHARS[char] || BLOCK_CHARS[' '];
    for (let i = 0; i < 5; i++) {
      lines[i] += block[i] + (idx < chars.length - 1 ? ' ' : '');
    }
  });

  return lines;
}

export function Logo(props: LogoProps) {
  const { theme } = useTheme();
  const lines = () => generateBlockText(props.title);

  return (
    <box flexDirection="column" alignItems="center" paddingY={1}>
      {lines().map((line) => (
        <text style={{ fg: theme.primary }}>{line}</text>
      ))}
      {props.subtitle && (
        <text style={{ fg: theme.textMuted }}>{'>>> ' + props.subtitle + ' >>>'}</text>
      )}
    </box>
  );
}

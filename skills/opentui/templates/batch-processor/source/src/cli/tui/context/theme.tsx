/** @jsxImportSource solid-js */
import { RGBA } from '@opentui/core';
import { createMemo } from 'solid-js';
import { createSimpleContext } from './helper.js';
import themeJson from './theme/default.json' with { type: 'json' };

export type Theme = {
  primary: RGBA;
  secondary: RGBA;
  error: RGBA;
  warning: RGBA;
  success: RGBA;
  text: RGBA;
  textMuted: RGBA;
  border: RGBA;
  borderSubtle: RGBA;
};

type ThemeJson = {
  defs?: Record<string, string>;
  theme: Record<keyof Theme, string | { dark: string; light: string }>;
};

function resolveTheme(theme: ThemeJson, mode: 'dark' | 'light'): Theme {
  const defs = theme.defs ?? {};

  function resolveColor(c: string | { dark: string; light: string }): RGBA {
    if (typeof c === 'string') {
      return c.startsWith('#') ? RGBA.fromHex(c) : resolveColor(defs[c]);
    }
    return resolveColor(c[mode]);
  }

  return Object.fromEntries(
    Object.entries(theme.theme).map(([key, value]) => [key, resolveColor(value)])
  ) as Theme;
}

export const { use: useTheme, provider: ThemeProvider } = createSimpleContext({
  name: 'Theme',
  init: (props: { mode: 'dark' | 'light' }) => {
    const theme = createMemo(() => resolveTheme(themeJson as ThemeJson, props.mode));
    return {
      get theme() { return theme(); },
      mode: props.mode,
    };
  },
});

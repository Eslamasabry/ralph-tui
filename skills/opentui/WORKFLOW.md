# OpenTUI + SolidJS Workflow Guide

Complete reference for building TUI applications with OpenTUI and SolidJS reactivity.

## Overview

This workflow enables reactive terminal applications with:
- **SolidJS reactivity** - Signals, memos, effects for efficient updates
- **OpenTUI rendering** - Flexbox layout, colors, text styling
- **Commander.js CLI** - Structured argument parsing
- **Theming system** - Dark/light mode with JSON color definitions

## Entry Point Chain

```
cli-setup.ts → launcher.ts → app.tsx
     ↓              ↓            ↓
  Parse CLI    Preload JSX   Render TUI
```

## Critical Pattern: SolidJS Preload

**MANDATORY**: Import preload before any TSX files.

```typescript
// launcher.ts
await import('@opentui/solid/preload');

export async function startTUI(options: CLIOptions): Promise<void> {
  const { startTUI: start } = await import('./app.js');
  await start(options);
}
```

## Context System

### createSimpleContext Factory

```typescript
/** @jsxImportSource @opentui/solid */
import { createContext, Show, useContext, type ParentProps } from 'solid-js';

export function createSimpleContext<T, Props extends Record<string, any>>(input: {
  name: string;
  init: ((input: Props) => T) | (() => T);
}) {
  const ctx = createContext<T>();

  return {
    provider: (props: ParentProps<Props>) => {
      const init = input.init(props);
      return (
        <ctx.Provider value={init}>{props.children}</ctx.Provider>
      );
    },
    use() {
      const value = useContext(ctx);
      if (!value) throw new Error(`${input.name} context required`);
      return value;
    },
  };
}
```

### Theme Context with RGBA

```typescript
import { RGBA } from '@opentui/core';
import { createMemo } from 'solid-js';

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

// Use RGBA.fromHex('#A855F7') to create colors
```

## Box Model Reference

| Property | Values | Purpose |
|----------|--------|---------|
| `flexDirection` | `"row"` / `"column"` | Layout direction |
| `flexGrow` | number | Grow to fill space |
| `width` | `"100%"` / number | Element width |
| `height` | `"100%"` / number | Element height |
| `paddingX` | number | Horizontal padding |
| `paddingY` | number | Vertical padding |
| `gap` | number | Space between items |
| `alignItems` | `"center"` / `"flex-start"` / `"flex-end"` | Cross-axis |
| `justifyContent` | `"center"` / `"space-between"` | Main-axis |
| `overflow` | `"hidden"` | Clip overflow |

### Examples

```typescript
// Vertical layout with padding
<box flexDirection="column" paddingX={2} paddingY={1}>

// Horizontal row with gap
<box flexDirection="row" gap={1}>

// Fill remaining space
<box flexGrow={1} />

// Full screen container
<box width="100%" height="100%" overflow="hidden">
```

## Text Styling

```typescript
const { theme } = useTheme();

// Foreground colors
<text style={{ fg: theme.primary }}>Primary</text>
<text style={{ fg: theme.error }}>Error</text>
<text style={{ fg: theme.success }}>Success</text>

// Bold text
import { TextAttributes } from '@opentui/core';
<text attributes={TextAttributes.BOLD}>Bold</text>

// Inline spans
<text>
  <span style={{ fg: theme.primary }}>Colored</span>
  <span> normal </span>
</text>
```

## Reactive Patterns

### Signals

```typescript
import { createSignal } from 'solid-js';

const [count, setCount] = createSignal(0);
count();           // read
setCount(5);       // write
setCount(c => c+1) // update
```

### Memos (Computed)

```typescript
import { createMemo } from 'solid-js';

const percentage = createMemo(() =>
  total() > 0 ? Math.round((current() / total()) * 100) : 0
);
```

### Effects

```typescript
import { createEffect, onCleanup } from 'solid-js';

createEffect(() => {
  if (status() === 'running') {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    onCleanup(() => clearInterval(timer));
  }
});
```

### onMount

```typescript
import { onMount } from 'solid-js';

function Component() {
  onMount(async () => {
    await initialize();
  });
  return <box>...</box>;
}
```

## Conditional Rendering

### Show

```typescript
import { Show } from 'solid-js';

<Show when={isLoading()}>
  <text>Loading...</text>
</Show>

<Show when={items().length > 0} fallback={<text>Empty</text>}>
  <ItemList items={items()} />
</Show>
```

### For (Lists)

```typescript
import { For } from 'solid-js';

<For each={items()}>
  {(item, index) => (
    <text>{index() + 1}. {item.name}</text>
  )}
</For>
```

## Render Options

```typescript
render(() => <App />, {
  fps: 30,              // Frame rate
  useMouse: false,      // Disable mouse
  useKittyKeyboard: true // Kitty protocol
});
```

## Terminal Handling

```typescript
// Clear terminal and hide cursor
process.stdout.write('\x1b[2J\x1b[H\x1b[?25l');

// Show cursor and reset colors (cleanup)
process.stdout.write('\x1b[?25h\x1b[0m');

// Ctrl+C handler
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
```

## Quick Reference

```
IMPORT ORDER:
1. await import('@opentui/solid/preload')
2. const { ... } = await import('./app.js')

JSX PRAGMA (every .tsx file):
/** @jsxImportSource @opentui/solid */

RENDER:
render(() => <App />, { fps: 30, useMouse: false })

LAYOUT:
<box flexDirection="column" paddingX={2} gap={1}>

STYLING:
<text style={{ fg: theme.primary }}>Colored</text>

CONDITIONAL:
<Show when={cond} fallback={<Alt />}><Main /></Show>

LISTS:
<For each={items()}>{(item) => <Item {...item} />}</For>

SIGNALS:
const [val, setVal] = createSignal(init);
val()  // read
setVal(newVal)  // write
```

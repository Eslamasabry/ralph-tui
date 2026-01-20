# OpenTUI + SolidJS Troubleshooting Guide

Common issues and solutions when building TUI applications with OpenTUI and SolidJS.

## "React is not defined" Error

### Error Message
```
ReferenceError: React is not defined
    at <anonymous> (dist/cli-setup.js:103672:54)
```

### Cause
Bun's bundler defaults to React JSX transform. The `/** @jsxImportSource @opentui/solid */` pragma is ignored during bundling unless you use the SolidJS plugin.

### Solution
Use a build script with the SolidJS plugin:

```javascript
// scripts/build.mjs
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const solidPluginPath = resolve(repoRoot, 'node_modules/@opentui/solid/scripts/solid-plugin.ts');
const solidPlugin = (await import(solidPluginPath)).default;

await Bun.build({
  conditions: ['browser'],
  plugins: [solidPlugin],  // REQUIRED
  target: 'bun',
  entrypoints: ['./src/runtime/cli-setup.ts'],
  outdir: './dist',
});
```

**Never use bare `bun build`** - it will use React's JSX transform.

---

## "waitUntilExit is not a function" Error

### Error Message
```
Fatal error: instance.waitUntilExit is not a function
```

### Cause
OpenTUI's `render()` does NOT return `waitUntilExit()` like Ink does.

### Wrong Pattern
```typescript
const instance = render(() => <App />);
await instance.waitUntilExit();  // ERROR
```

### Correct Pattern
```typescript
export async function startTUI(options: CLIOptions): Promise<void> {
  // No Promise wrapper needed - render handles it
  render(
    () => <App options={options} />,
    {
      fps: 30,
      useMouse: false,
      useKittyKeyboard: true,
    }
  );
}
```

Use `useRenderer().destroy()` from components to trigger exit.

---

## JSX Not Compiling Correctly

### Symptoms
- Components render as `[object Object]`
- JSX syntax errors at runtime

### Checklist

1. **Every .tsx file has the pragma**:
```typescript
/** @jsxImportSource @opentui/solid */
```

2. **tsconfig.json has correct settings**:
```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid"
  }
}
```

3. **launcher.ts imports preload FIRST**:
```typescript
await import('@opentui/solid/preload');
// Then dynamic imports
const { startTUI } = await import('./app.js');
```

4. **Running with conditions flag**:
```bash
bun --conditions=browser src/runtime/cli-setup.ts
```

---

## Colors Not Showing

### Symptoms
- Text appears in default color
- Theme colors ignored

### Checklist

1. **Terminal supports true color**:
```bash
echo $COLORTERM  # Should be "truecolor" or "24bit"
```

2. **Theme JSON has valid hex colors**:
```json
{
  "primary": "#A855F7"
}
```

3. **Using RGBA correctly**:
```typescript
import { RGBA } from '@opentui/core';
const color = RGBA.fromHex('#A855F7');
```

4. **Applying to text style**:
```typescript
<text style={{ fg: theme.primary }}>Colored</text>
```

---

## Progress Not Updating

### Symptoms
- UI doesn't reflect state changes
- Progress bar stuck

### Checklist

1. **Using signals correctly**:
```typescript
// Wrong
count = count + 1;

// Correct
setCount(count() + 1);
// or
setCount(c => c + 1);
```

2. **Reading signal value in JSX**:
```typescript
// Wrong
<text>{count}</text>

// Correct
<text>{count()}</text>
```

3. **Render fps is set**:
```typescript
render(() => <App />, { fps: 30 });
```

---

## Build Works, Runtime Fails

### Cause
The preload mechanism only works at runtime from source, not during static bundling.

### Solution
Always use the build script with solidPlugin. The plugin transforms JSX at build time.

---

## "Export not found" Errors

### Symptoms
```
SyntaxError: Export named 'X' not found
```

### Checklist

1. **Using .js extension in imports**:
```typescript
// Correct
import { startTUI } from './app.js';

// Wrong
import { startTUI } from './app';
```

2. **File actually exports the symbol**:
```typescript
export function startTUI() { ... }
// or
export { startTUI };
```

---

## Configuration Files

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "jsxImportSource": "@opentui/solid",
    "resolveJsonModule": true,
    "types": ["bun-types"]
  }
}
```

### bunfig.toml (optional)
```toml
[run]
conditions = ["browser"]
```

---

## Quick Diagnostic Commands

```bash
# Check bun version
bun --version

# Run from source with verbose
bun --conditions=browser src/runtime/cli-setup.ts 2>&1

# Verify JSX pragma in all files
grep -rL "@jsxImportSource @opentui/solid" --include="*.tsx" src/

# Check dependencies
bun pm ls | grep opentui
```

---

## Summary Table

| Problem | Cause | Solution |
|---------|-------|----------|
| "React is not defined" | Wrong JSX transform | Use solidPlugin in build |
| "waitUntilExit not a function" | OpenTUI API difference | Remove waitUntilExit call |
| JSX not compiling | Missing pragma/preload | Add pragma + preload order |
| Colors missing | RGBA not applied | Use theme context correctly |
| Progress stuck | Signal mutation | Use setSignal() function |
| Build/runtime mismatch | Preload timing | Use build script with plugin |

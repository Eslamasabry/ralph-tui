
import { test, expect, describe } from 'bun:test';
import { formatCommand } from './src/plugins/agents/output-formatting.js';

describe('Output Formatting Bugs', () => {
  test('formatCommand should not break on semicolons inside strings', () => {
    const cmd = 'echo "hello; world"';
    const formatted = formatCommand(cmd);
    // Currently it returns "$ world"
    expect(formatted).toBe('$ echo "hello; world"');
  });

  test('formatCommand should handle multiple env vars and a command with semicolon', () => {
    const cmd = 'VAR1=val1 VAR2=val2 node -e "console.log(\'a;b\')"';
    const formatted = formatCommand(cmd);
    expect(formatted).toBe('$ node -e "console.log(\'a;b\')"');
  });
});

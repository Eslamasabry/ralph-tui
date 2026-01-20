/** @jsxImportSource @opentui/solid */
import { render } from '@opentui/solid';
import { ThemeProvider } from './context/theme.js';
import { AppStateProvider } from './context/app-state.js';
import { MainRoute } from './routes/main.js';
import type { CLIOptions } from '../../core/types.js';

interface AppProps {
  options: CLIOptions;
  mode: 'dark' | 'light';
}

function App(props: AppProps) {
  return (
    <ThemeProvider mode={props.mode}>
      <AppStateProvider options={props.options}>
        <box flexDirection="column" flexGrow={1}>
          <MainRoute />
        </box>
      </AppStateProvider>
    </ThemeProvider>
  );
}

export async function startTUI(options: CLIOptions): Promise<void> {
  const mode = 'dark';

  // Clear terminal and hide cursor
  process.stdout.write('\x1b[2J\x1b[H\x1b[?25l');

  const handleSigint = () => {
    cleanup();
    process.exit(0);
  };
  process.on('SIGINT', handleSigint);

  const cleanup = () => {
    process.stdout.write('\x1b[?25h'); // Show cursor
    process.stdout.write('\x1b[0m');   // Reset colors
    process.off('SIGINT', handleSigint);
  };

  render(
    () => (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        overflow="hidden"
      >
        <App options={options} mode={mode} />
      </box>
    ),
    {
      fps: 30,
      useMouse: false,
      useKittyKeyboard: true
    }
  );
}

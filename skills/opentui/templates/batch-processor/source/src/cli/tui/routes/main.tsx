/** @jsxImportSource @opentui/solid */
import { Show, createMemo } from 'solid-js';
import { useTheme } from '../context/theme.js';
import { useAppState } from '../context/app-state.js';
import { Logo } from '../component/logo.js';
import { ProgressBar } from '../component/progress-bar.js';
import { StatsPanel } from '../component/stats-panel.js';
import { FileList } from '../component/file-list.js';

export function MainRoute() {
  const { theme } = useTheme();
  const [state, actions] = useAppState();

  const completedCount = createMemo(() =>
    state.jobs.filter(j => j.status === 'completed').length
  );
  const activeCount = createMemo(() =>
    state.jobs.filter(j => j.status === 'running').length
  );
  const failedCount = createMemo(() =>
    state.jobs.filter(j => j.status === 'failed').length
  );

  return (
    <box flexDirection="column" height="100%" width="100%">
      {/* Logo Header */}
      <Logo title="{{PROJECT_NAME}}" subtitle="{{PROJECT_SUBTITLE}}" />

      {/* Keyboard Hint */}
      <box paddingX={2}>
        <Show when={state.status === 'processing'} fallback={
          <text style={{ fg: theme.textMuted }}>Press Ctrl+C to exit</text>
        }>
          <text style={{ fg: theme.textMuted }}>Press Ctrl+C to gracefully stop (let active jobs finish)</text>
        </Show>
      </box>

      {/* Main Progress Bar */}
      <box paddingX={2} paddingY={1}>
        <ProgressBar
          current={completedCount()}
          total={state.jobs.length}
          showPercentage
          showCount
        />
      </box>

      {/* Statistics Panel */}
      <StatsPanel
        status={state.status}
        progress={{ current: completedCount(), total: state.jobs.length }}
        active={activeCount()}
        completed={completedCount()}
        failed={failedCount()}
        elapsed={state.elapsed}
        output={state.outputSize}
        eta={state.eta}
      />

      {/* File List */}
      <box flexGrow={1} paddingY={1}>
        <FileList
          jobs={state.jobs}
          visibleCount={10}
          scrollOffset={state.scrollOffset}
        />
      </box>
    </box>
  );
}

/** @jsxImportSource @opentui/solid */
import { For, Show, createMemo } from 'solid-js';
import { useTheme } from '../context/theme.js';
import type { Job, JobStatus } from '../../../core/types.js';

export interface FileListProps {
  jobs: Job[];
  visibleCount?: number;
  scrollOffset?: number;
}

function StatusIcon(props: { status: JobStatus }) {
  const { theme } = useTheme();

  const icon = () => {
    switch (props.status) {
      case 'pending': return { char: '○', color: theme.textMuted };
      case 'running': return { char: '●', color: theme.primary };
      case 'completed': return { char: '✓', color: theme.success };
      case 'failed': return { char: '✗', color: theme.error };
      case 'cancelled': return { char: '⊘', color: theme.warning };
      default: return { char: '?', color: theme.textMuted };
    }
  };

  return <text style={{ fg: icon().color }}>{icon().char}</text>;
}

function MiniProgressBar(props: { progress: number; width?: number }) {
  const { theme } = useTheme();
  const w = () => props.width ?? 8;
  const filled = () => Math.floor((props.progress / 100) * w());

  return (
    <box flexDirection="row">
      <text style={{ fg: theme.borderSubtle }}>│</text>
      <text style={{ fg: theme.primary }}>{'█'.repeat(filled())}</text>
      <text style={{ fg: theme.borderSubtle }}>{'░'.repeat(w() - filled())}</text>
      <text style={{ fg: theme.borderSubtle }}>│</text>
      <text style={{ fg: theme.textMuted }}> {props.progress}%</text>
    </box>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncatePath(path: string, maxLen: number = 40): string {
  const filename = path.split(/[/\\]/).pop() || path;
  if (filename.length <= maxLen) return filename;
  return filename.slice(0, maxLen - 3) + '...';
}

export function FileList(props: FileListProps) {
  const { theme } = useTheme();

  const visibleCount = () => props.visibleCount ?? 10;
  const offset = () => props.scrollOffset ?? 0;
  const visibleJobs = createMemo(() =>
    props.jobs.slice(offset(), offset() + visibleCount())
  );
  const hasMore = () => props.jobs.length > offset() + visibleCount();
  const remainingCount = () => props.jobs.length - offset() - visibleCount();

  return (
    <box flexDirection="column" paddingX={2}>
      <Show when={props.jobs.length > 0} fallback={
        <text style={{ fg: theme.textMuted }}>No files to process</text>
      }>
        <For each={visibleJobs()}>
          {(job) => (
            <box flexDirection="row" gap={1}>
              <StatusIcon status={job.status} />
              <text style={{ fg: theme.text }}>{truncatePath(job.inputPath)}</text>
              <box flexGrow={1} />
              <Show when={job.status === 'running'}>
                <MiniProgressBar progress={job.progress} />
              </Show>
              <Show when={job.status === 'completed'}>
                <text style={{ fg: theme.success }}>[completed]</text>
                <text style={{ fg: theme.textMuted }}>{formatSize(job.outputSize)}</text>
              </Show>
              <Show when={job.status === 'failed'}>
                <text style={{ fg: theme.error }}>[failed]</text>
              </Show>
              <Show when={job.status === 'pending'}>
                <text style={{ fg: theme.textMuted }}>[pending]</text>
              </Show>
            </box>
          )}
        </For>
        <Show when={hasMore()}>
          <text style={{ fg: theme.textMuted }}>... and {remainingCount()} more files</text>
        </Show>
      </Show>
    </box>
  );
}

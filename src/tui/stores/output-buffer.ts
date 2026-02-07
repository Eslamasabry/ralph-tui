/**
 * ABOUTME: External store slice for streamed output buffers in the TUI.
 * Manages current output, CLI output, formatted segments, and parallel task outputs.
 */

import type { FormattedSegment } from '../../plugins/agents/output-formatting.js';
import {
  applyPatch,
  createExternalStore,
  useStoreDispatch,
  useStoreSelector,
  type ExternalStore,
  type StoreSelector,
} from './store-utils.js';

export interface OutputBufferState {
  currentOutput: string;
  currentCliOutput: string;
  currentSegments: FormattedSegment[];
  parallelOutputs: Map<string, string>;
  parallelSegments: Map<string, FormattedSegment[]>;
  version: number;
}

export type OutputBufferAction =
  | { type: 'output/reset'; state?: Partial<OutputBufferState> }
  | { type: 'output/patch'; patch: Partial<OutputBufferState> }
  | { type: 'output/set-current-output'; output: string }
  | { type: 'output/append-current-output'; chunk: string }
  | { type: 'output/set-cli-output'; output: string }
  | { type: 'output/append-cli-output'; chunk: string }
  | { type: 'output/set-segments'; segments: FormattedSegment[] }
  | { type: 'output/append-segments'; segments: FormattedSegment[] }
  | { type: 'output/set-parallel-output'; key: string; output: string }
  | { type: 'output/append-parallel-output'; key: string; chunk: string }
  | { type: 'output/set-parallel-segments'; key: string; segments: FormattedSegment[] }
  | { type: 'output/clear-parallel-output'; key: string }
  | { type: 'output/clear-parallel' };

export type OutputBufferStore = ExternalStore<OutputBufferState, OutputBufferAction>;
const OUTPUT_CAP_BYTES = 500_000;

function trimToCap(output: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  const encoder = new TextEncoder();
  const bytes = encoder.encode(output);
  if (bytes.length <= maxBytes) {
    return output;
  }

  const overflow = bytes.length - maxBytes;
  return output.slice(Math.max(0, overflow));
}

function cloneSegments(segments: FormattedSegment[]): FormattedSegment[] {
  return [...segments];
}

function createInitialState(initialState: Partial<OutputBufferState> = {}): OutputBufferState {
  return {
    currentOutput: initialState.currentOutput ?? '',
    currentCliOutput: initialState.currentCliOutput ?? '',
    currentSegments: cloneSegments(initialState.currentSegments ?? []),
    parallelOutputs: new Map(initialState.parallelOutputs ?? []),
    parallelSegments: new Map(
      Array.from(initialState.parallelSegments ?? [], ([key, segments]) => [key, cloneSegments(segments)])
    ),
    version: initialState.version ?? 0,
  };
}

function withVersion(
  state: Readonly<OutputBufferState>,
  patch: Partial<Omit<OutputBufferState, 'version'>>
): OutputBufferState {
  return applyPatch(state, {
    ...patch,
    version: state.version + 1,
  });
}

function outputBufferReducer(
  state: Readonly<OutputBufferState>,
  action: OutputBufferAction
): OutputBufferState {
  switch (action.type) {
    case 'output/reset':
      return createInitialState(action.state);

    case 'output/patch':
      return applyPatch(state, action.patch);

    case 'output/set-current-output':
      if (state.currentOutput === action.output) {
        return state;
      }
      return withVersion(state, { currentOutput: trimToCap(action.output, OUTPUT_CAP_BYTES) });

    case 'output/append-current-output':
      if (!action.chunk) {
        return state;
      }
      return withVersion(state, {
        currentOutput: trimToCap(state.currentOutput + action.chunk, OUTPUT_CAP_BYTES),
      });

    case 'output/set-cli-output':
      if (state.currentCliOutput === action.output) {
        return state;
      }
      return withVersion(state, { currentCliOutput: action.output });

    case 'output/append-cli-output':
      if (!action.chunk) {
        return state;
      }
      return withVersion(state, {
        currentCliOutput: state.currentCliOutput + action.chunk,
      });

    case 'output/set-segments': {
      const nextSegments = cloneSegments(action.segments);
      if (state.currentSegments === nextSegments) {
        return state;
      }
      return withVersion(state, { currentSegments: nextSegments });
    }

    case 'output/append-segments':
      if (action.segments.length === 0) {
        return state;
      }
      return withVersion(state, {
        currentSegments: [...state.currentSegments, ...action.segments],
      });

    case 'output/set-parallel-output': {
      if (state.parallelOutputs.get(action.key) === action.output) {
        return state;
      }
      const nextOutputs = new Map(state.parallelOutputs);
      nextOutputs.set(action.key, trimToCap(action.output, OUTPUT_CAP_BYTES));
      return withVersion(state, { parallelOutputs: nextOutputs });
    }

    case 'output/append-parallel-output': {
      if (!action.chunk) {
        return state;
      }
      const nextOutputs = new Map(state.parallelOutputs);
      const previousOutput = nextOutputs.get(action.key) ?? '';
      nextOutputs.set(
        action.key,
        trimToCap(previousOutput + action.chunk, OUTPUT_CAP_BYTES)
      );
      return withVersion(state, { parallelOutputs: nextOutputs });
    }

    case 'output/set-parallel-segments': {
      const nextSegments = new Map(state.parallelSegments);
      nextSegments.set(action.key, cloneSegments(action.segments));
      return withVersion(state, { parallelSegments: nextSegments });
    }

    case 'output/clear-parallel-output': {
      if (!state.parallelOutputs.has(action.key) && !state.parallelSegments.has(action.key)) {
        return state;
      }

      const nextOutputs = new Map(state.parallelOutputs);
      nextOutputs.delete(action.key);

      const nextSegments = new Map(state.parallelSegments);
      nextSegments.delete(action.key);

      return withVersion(state, {
        parallelOutputs: nextOutputs,
        parallelSegments: nextSegments,
      });
    }

    case 'output/clear-parallel':
      if (state.parallelOutputs.size === 0 && state.parallelSegments.size === 0) {
        return state;
      }
      return withVersion(state, {
        parallelOutputs: new Map(),
        parallelSegments: new Map(),
      });

    default:
      return state;
  }
}

export function createOutputBufferStore(
  initialState: Partial<OutputBufferState> = {}
): OutputBufferStore {
  return createExternalStore<OutputBufferState, OutputBufferAction>({
    initialState: createInitialState(initialState),
    reducer: outputBufferReducer,
  });
}

export function useOutputBufferSelector<Selected>(
  store: OutputBufferStore,
  selector: StoreSelector<OutputBufferState, Selected>
): Selected {
  return useStoreSelector(store, selector);
}

export function useOutputBufferDispatch(
  store: OutputBufferStore
): (action: OutputBufferAction) => void {
  return useStoreDispatch(store);
}

export function useCurrentOutput(store: OutputBufferStore): string {
  return useOutputBufferSelector(store, (state) => state.currentOutput);
}

export function selectRawLog(state: Readonly<OutputBufferState>): string {
  if (state.currentCliOutput.length > 0) {
    return state.currentCliOutput;
  }
  return state.currentOutput;
}

export function useRawLog(store: OutputBufferStore): string {
  return useOutputBufferSelector(store, selectRawLog);
}

export function useOutputForTask(store: OutputBufferStore, taskId: string): string {
  return useOutputBufferSelector(store, (state) => state.parallelOutputs.get(taskId) ?? '');
}

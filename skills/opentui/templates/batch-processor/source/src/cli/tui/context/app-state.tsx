/** @jsxImportSource @opentui/solid */
import { createStore } from 'solid-js/store';
import { createSimpleContext } from './helper.js';
import type { CLIOptions, Job, AppStatus } from '../../../core/types.js';

interface AppState {
  status: AppStatus;
  jobs: Job[];
  elapsed: string;
  outputSize?: string;
  eta?: string;
  scrollOffset: number;
}

interface AppActions {
  setStatus: (status: AppStatus) => void;
  addJob: (job: Job) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  setElapsed: (elapsed: string) => void;
  setOutputSize: (size: string) => void;
  setEta: (eta: string) => void;
  scrollUp: () => void;
  scrollDown: () => void;
}

type AppStateContextValue = [AppState, AppActions];

export const { use: useAppState, provider: AppStateProvider } = createSimpleContext<
  AppStateContextValue,
  { options: CLIOptions }
>({
  name: 'AppState',
  init: (props) => {
    const [state, setState] = createStore<AppState>({
      status: 'idle',
      jobs: [],
      elapsed: '00:00:00',
      outputSize: undefined,
      eta: undefined,
      scrollOffset: 0,
    });

    const actions: AppActions = {
      setStatus: (status) => setState('status', status),
      addJob: (job) => setState('jobs', (jobs) => [...jobs, job]),
      updateJob: (id, updates) =>
        setState('jobs', (j) => j.id === id, updates),
      setElapsed: (elapsed) => setState('elapsed', elapsed),
      setOutputSize: (size) => setState('outputSize', size),
      setEta: (eta) => setState('eta', eta),
      scrollUp: () =>
        setState('scrollOffset', (o) => Math.max(0, o - 1)),
      scrollDown: () =>
        setState('scrollOffset', (o) =>
          Math.min(state.jobs.length - 10, o + 1)
        ),
    };

    return [state, actions];
  },
});

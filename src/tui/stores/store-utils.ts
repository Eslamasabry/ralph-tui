/**
 * ABOUTME: Shared utilities for lightweight external TUI stores.
 * Provides a reducer-driven store primitive and selector hooks using useSyncExternalStore.
 */

import { useSyncExternalStore } from 'react';

export type StoreListener = () => void;

export type StoreReducer<State, Action> = (state: Readonly<State>, action: Action) => State;

export interface ExternalStore<State, Action> {
  getState(): Readonly<State>;
  subscribe(listener: StoreListener): () => void;
  dispatch(action: Action): void;
}

export interface CreateExternalStoreOptions<State, Action> {
  initialState: State;
  reducer: StoreReducer<State, Action>;
}

/**
 * Shallowly applies a partial patch and preserves object identity for no-op updates.
 */
export function applyPatch<State extends Record<string, unknown>>(
  state: State,
  patch: Partial<State>
): State {
  let changed = false;
  const nextState: State = { ...state };

  for (const key of Object.keys(patch) as Array<keyof State>) {
    const nextValue = patch[key] as State[keyof State];
    if (!Object.is(state[key], nextValue)) {
      nextState[key] = nextValue;
      changed = true;
    }
  }

  return changed ? nextState : state;
}

/**
 * Creates a minimal external store with reducer-based updates.
 */
export function createExternalStore<State, Action>(
  options: CreateExternalStoreOptions<State, Action>
): ExternalStore<State, Action> {
  let state = options.initialState;
  const listeners = new Set<StoreListener>();

  const store: ExternalStore<State, Action> = {
    getState(): Readonly<State> {
      return state;
    },

    subscribe(listener: StoreListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispatch(action: Action): void {
      const nextState = options.reducer(state, action);
      if (Object.is(nextState, state)) {
        return;
      }

      state = nextState;
      for (const listener of listeners) {
        listener();
      }
    },
  };

  return store;
}

export type StoreSelector<State, Selected> = (state: Readonly<State>) => Selected;

/**
 * Selects a value from an external store with useSyncExternalStore.
 */
export function useStoreSelector<State, Action, Selected>(
  store: ExternalStore<State, Action>,
  selector: StoreSelector<State, Selected>
): Selected {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}

/**
 * Returns the dispatch function for an external store.
 */
export function useStoreDispatch<State, Action>(
  store: ExternalStore<State, Action>
): (action: Action) => void {
  return store.dispatch;
}

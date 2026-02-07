/**
 * ABOUTME: Main App component for the Ralph TUI.
 * Delegates directly to the canonical RunApp implementation.
 */

import type { ReactNode } from 'react';
import type { AppState } from '../types.js';
import { RunApp } from './RunApp.js';

/**
 * Props for the App component.
 */
export interface AppProps {
  /** Optional initial state retained for API compatibility. */
  initialState?: Partial<AppState>;
  /** Callback when quit is requested. */
  onQuit?: () => void;
}

/**
 * Main App component.
 */
export function App({ initialState: _initialState, onQuit }: AppProps): ReactNode {
  return <RunApp onQuit={onQuit} />;
}

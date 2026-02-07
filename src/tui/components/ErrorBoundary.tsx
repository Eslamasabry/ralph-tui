/**
 * ABOUTME: React error boundary wrapper for TUI component trees.
 * Catches render/runtime errors and displays tiered crash fallbacks with retry support.
 */

import type { ErrorInfo, ReactNode } from 'react';
import { useCallback } from 'react';
import { Component } from 'react';
import { useKeyboard } from '@opentui/react';
import { CrashScreen } from './CrashScreen.js';

/**
 * Props for ErrorBoundary.
 */
export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | ErrorBoundaryFallbackRenderer;
  context?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
  onRetry?: () => void;
  resetKey?: string | number;
}

export interface ErrorBoundaryFallbackParams {
  error: Error | null;
  retry: () => void;
  context?: string;
}

export type ErrorBoundaryFallbackRenderer = (params: ErrorBoundaryFallbackParams) => ReactNode;

/**
 * Internal boundary state.
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Normalize any thrown value to Error.
 */
export function normalizeBoundaryError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (error && typeof error === 'object') {
    return new Error('Non-Error object was thrown');
  }

  return new Error('Unknown error');
}

/**
 * Build boundary state from a thrown value.
 */
export function createErrorBoundaryState(error: unknown): ErrorBoundaryState {
  return {
    hasError: true,
    error: normalizeBoundaryError(error),
  };
}

function isFallbackRenderer(
  fallback: ErrorBoundaryProps['fallback']
): fallback is ErrorBoundaryFallbackRenderer {
  return typeof fallback === 'function';
}

interface RetryCrashFallbackProps {
  error: Error | null;
  context?: string;
  onRetry: () => void;
}

/**
 * Default retry-capable fallback used by tiered boundaries.
 */
export function RetryCrashFallback({
  error,
  context,
  onRetry,
}: RetryCrashFallbackProps): ReactNode {
  const handleKeyboard = useCallback(
    (key: { name?: string; sequence?: string }) => {
      const keyName = key.name ?? key.sequence ?? '';
      if (keyName === 'r' || keyName === 'return' || keyName === 'enter') {
        onRetry();
      }
    },
    [onRetry]
  );

  useKeyboard(handleKeyboard);

  return (
    <CrashScreen
      error={error}
      context={context}
      hint="Press r to retry, or q to quit."
    />
  );
}

/**
 * Runtime boundary for isolating TUI crashes from collapsing the entire process.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return createErrorBoundaryState(error);
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const normalized = normalizeBoundaryError(error);
    this.props.onError?.(normalized, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.resetBoundary();
    }
  }

  private resetBoundary(): void {
    this.setState({
      hasError: false,
      error: null,
    });
    this.props.onRetry?.();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallback, context } = this.props;
      if (fallback) {
        if (isFallbackRenderer(fallback)) {
          return fallback({
            error: this.state.error,
            retry: () => this.resetBoundary(),
            context,
          });
        }
        return fallback;
      }

      return (
        <CrashScreen
          error={this.state.error}
          context={this.props.context}
        />
      );
    }

    return this.props.children ?? null;
  }
}

const ErrorBoundaryComponent = ErrorBoundary as unknown as (props: ErrorBoundaryProps) => ReactNode;

export interface AppErrorBoundaryProps extends Omit<ErrorBoundaryProps, 'context'> {
  context?: string;
}

/**
 * Top-level boundary for unrecoverable app-shell failures.
 */
export function AppErrorBoundary({
  children,
  context = 'app',
  fallback,
  ...rest
}: AppErrorBoundaryProps): ReactNode {
  return (
    <ErrorBoundaryComponent
      context={context}
      fallback={
        fallback ??
        ((params) => (
          <RetryCrashFallback
            error={params.error}
            context={params.context}
            onRetry={params.retry}
          />
        ))
      }
      {...rest}
    >
      {children}
    </ErrorBoundaryComponent>
  );
}

export interface ViewErrorBoundaryProps extends Omit<ErrorBoundaryProps, 'context'> {
  viewId: string;
}

/**
 * Mid-tier boundary for isolating per-view crashes.
 */
export function ViewErrorBoundary({
  children,
  viewId,
  fallback,
  ...rest
}: ViewErrorBoundaryProps): ReactNode {
  return (
    <ErrorBoundaryComponent
      context={`view:${viewId}`}
      fallback={
        fallback ??
        ((params) => (
          <RetryCrashFallback
            error={params.error}
            context={params.context}
            onRetry={params.retry}
          />
        ))
      }
      {...rest}
    >
      {children}
    </ErrorBoundaryComponent>
  );
}

export interface PanelErrorBoundaryProps extends Omit<ErrorBoundaryProps, 'context'> {
  panelId: string;
}

/**
 * Fine-grained boundary for panel-level rendering isolation.
 */
export function PanelErrorBoundary({
  children,
  panelId,
  fallback,
  ...rest
}: PanelErrorBoundaryProps): ReactNode {
  return (
    <ErrorBoundaryComponent
      context={`panel:${panelId}`}
      fallback={
        fallback ??
        ((params) => (
          <RetryCrashFallback
            error={params.error}
            context={params.context}
            onRetry={params.retry}
          />
        ))
      }
      {...rest}
    >
      {children}
    </ErrorBoundaryComponent>
  );
}

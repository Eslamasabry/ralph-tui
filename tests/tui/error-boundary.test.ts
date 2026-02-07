/**
 * ABOUTME: Tests error boundary normalization and state derivation helpers.
 * Covers fallback state creation and crash message formatting behavior.
 */

import { describe, expect, test } from 'bun:test';
import type { ErrorInfo } from 'react';
import {
  ErrorBoundary,
  AppErrorBoundary,
  ViewErrorBoundary,
  PanelErrorBoundary,
  createErrorBoundaryState,
  normalizeBoundaryError,
} from '../../src/tui/components/ErrorBoundary.js';
import { formatCrashMessage } from '../../src/tui/components/CrashScreen.js';

describe('normalizeBoundaryError', () => {
  test('returns original Error instance unchanged', () => {
    const source = new Error('boom');
    const normalized = normalizeBoundaryError(source);

    expect(normalized).toBe(source);
    expect(normalized.message).toBe('boom');
  });

  test('wraps string values in Error', () => {
    const normalized = normalizeBoundaryError('string-failure');
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe('string-failure');
  });

  test('handles unknown non-error values', () => {
    const normalized = normalizeBoundaryError(undefined);
    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.message).toBe('Unknown error');
  });
});

describe('ErrorBoundary state helpers', () => {
  test('createErrorBoundaryState flags error state', () => {
    const state = createErrorBoundaryState(new Error('render failed'));
    expect(state.hasError).toBe(true);
    expect(state.error?.message).toBe('render failed');
  });

  test('getDerivedStateFromError delegates to helper normalization', () => {
    const state = ErrorBoundary.getDerivedStateFromError('bad render');
    expect(state.hasError).toBe(true);
    expect(state.error?.message).toBe('bad render');
  });

  test('componentDidCatch forwards normalized error to onError', () => {
    const captured: string[] = [];
    const boundary = new ErrorBoundary({
      onError: (error) => captured.push(error.message),
      children: null,
    });
    const info: ErrorInfo = { componentStack: 'at FakeComponent' };

    boundary.componentDidCatch('catch-failure', info);
    expect(captured).toEqual(['catch-failure']);
  });

});

describe('tiered boundaries', () => {
  test('AppErrorBoundary, ViewErrorBoundary, and PanelErrorBoundary construct without throwing', () => {
    expect(() => AppErrorBoundary({ children: null })).not.toThrow();
    expect(() => ViewErrorBoundary({ viewId: 'tasks', children: null })).not.toThrow();
    expect(() => PanelErrorBoundary({ panelId: 'taskList', children: null })).not.toThrow();
  });
});

describe('formatCrashMessage', () => {
  test('formats error instance message', () => {
    expect(formatCrashMessage(new Error('exploded'))).toBe('exploded');
  });

  test('formats trimmed string message', () => {
    expect(formatCrashMessage('  broken  ')).toBe('broken');
  });

  test('falls back for object and null values', () => {
    expect(formatCrashMessage({ reason: 'nope' })).toBe('Unexpected object error');
    expect(formatCrashMessage(null)).toBe('Unknown runtime error');
  });
});

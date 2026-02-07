/**
 * ABOUTME: Active view resolver component for dynamic view rendering.
 * Chooses a registered view by id and falls back to a view-specific error panel.
 */

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ViewError } from './ViewError.js';

/**
 * Supported value types for a view registration entry.
 */
export type ActiveViewRenderable = ReactNode | (() => ReactNode);

/**
 * View registry keyed by view id.
 */
export type ViewRegistry = Partial<Record<string, ActiveViewRenderable>>;

/**
 * Result of resolving a view id against a registry.
 */
export interface ActiveViewResolution {
  found: boolean;
  viewId: string;
  node: ReactNode | null;
}

/**
 * Resolve an active view from the registry.
 */
export function resolveActiveView(viewId: string, views: ViewRegistry): ActiveViewResolution {
  const entry = views[viewId];
  if (typeof entry === 'function') {
    return {
      found: true,
      viewId,
      node: entry(),
    };
  }

  if (entry !== undefined && entry !== null) {
    return {
      found: true,
      viewId,
      node: entry,
    };
  }

  return {
    found: false,
    viewId,
    node: null,
  };
}

/**
 * Props for ActiveView.
 */
export interface ActiveViewProps {
  viewId: string;
  views: ViewRegistry;
  fallback?: ReactNode;
  onMissingView?: (viewId: string) => void;
}

/**
 * Render the currently active view by id.
 */
export function ActiveView({
  viewId,
  views,
  fallback,
  onMissingView,
}: ActiveViewProps): ReactNode {
  const resolution = resolveActiveView(viewId, views);

  useEffect(() => {
    if (!resolution.found) {
      onMissingView?.(viewId);
    }
  }, [onMissingView, resolution.found, viewId]);

  if (resolution.found) {
    return resolution.node;
  }

  return fallback ?? <ViewError viewId={viewId} />;
}

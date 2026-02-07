/**
 * ABOUTME: Multi-toast presenter that stacks Toast components with expiry handling.
 * Provides lightweight auto-expiry bookkeeping and rendering order control.
 */

import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Toast, type ToastVariant } from './Toast.js';

/**
 * Toast item model for container rendering.
 */
export interface ToastItem {
  id: string;
  message: string;
  variant?: ToastVariant;
  icon?: string;
  createdAtMs?: number;
  ttlMs?: number;
  autoDismissMs?: number;
}

/**
 * Determine whether a toast is expired at a given timestamp.
 */
export function isToastExpired(toast: ToastItem, nowMs: number): boolean {
  const ttlMs = toast.ttlMs ?? toast.autoDismissMs;
  if (toast.createdAtMs === undefined || ttlMs === undefined) {
    return false;
  }
  if (ttlMs <= 0) {
    return true;
  }
  return toast.createdAtMs + ttlMs <= nowMs;
}

/**
 * Partition toast list into active and expired buckets.
 */
export function splitToastsByExpiry(
  toasts: ToastItem[],
  nowMs: number
): { active: ToastItem[]; expired: ToastItem[] } {
  const active: ToastItem[] = [];
  const expired: ToastItem[] = [];

  for (const toast of toasts) {
    if (isToastExpired(toast, nowMs)) {
      expired.push(toast);
    } else {
      active.push(toast);
    }
  }

  return { active, expired };
}

/**
 * Props for ToastContainer.
 */
export interface ToastContainerProps {
  toasts: ToastItem[];
  nowMs?: number;
  paused?: boolean;
  visible?: boolean;
  right?: number;
  bottom?: number;
  maxVisible?: number;
  rowHeight?: number;
  onExpire?: (toastId: string) => void;
}

/**
 * Render and manage a stack of toasts.
 */
export function ToastContainer({
  toasts,
  nowMs,
  paused = false,
  visible = true,
  right = 2,
  bottom = 2,
  maxVisible = 3,
  rowHeight = 3,
  onExpire,
}: ToastContainerProps): ReactNode {
  const [clockNowMs, setClockNowMs] = useState<number>(() => nowMs ?? Date.now());
  const resolvedNowMs = nowMs ?? clockNowMs;

  useEffect(() => {
    if (nowMs !== undefined) {
      setClockNowMs(nowMs);
    }
  }, [nowMs]);

  useEffect(() => {
    if (nowMs !== undefined || paused) {
      return;
    }

    const hasTimedToasts = toasts.some((toast) => {
      const ttlMs = toast.ttlMs ?? toast.autoDismissMs;
      return ttlMs !== undefined;
    });
    if (!hasTimedToasts) {
      return;
    }

    const interval = setInterval(() => {
      setClockNowMs(Date.now());
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [nowMs, paused, toasts]);

  const { active, expired } = useMemo(
    () => splitToastsByExpiry(toasts, resolvedNowMs),
    [resolvedNowMs, toasts]
  );
  const notifiedExpiredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const toast of expired) {
      if (!notifiedExpiredRef.current.has(toast.id)) {
        notifiedExpiredRef.current.add(toast.id);
        onExpire?.(toast.id);
      }
    }
  }, [expired, onExpire]);

  const visibleToasts = active.slice(-maxVisible);
  if (!visible) {
    return null;
  }
  if (visibleToasts.length === 0) {
    return null;
  }

  return visibleToasts.map((toast, index) => (
    <Toast
      key={toast.id}
      visible
      message={toast.message}
      icon={toast.icon}
      variant={toast.variant ?? 'info'}
      right={right}
      bottom={bottom + (visibleToasts.length - 1 - index) * rowHeight}
    />
  ));
}

/**
 * ABOUTME: Isolated live timer for header display to avoid full app re-renders.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { formatElapsedTime } from '../theme.js';

export interface LiveTimerProps {
  startTimeMs?: number;
  status: string;
}

const ACTIVE_STATUSES = new Set(['running', 'executing', 'selecting', 'pausing']);

export function LiveTimer({ startTimeMs, status }: LiveTimerProps): ReactNode {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!startTimeMs || !ACTIVE_STATUSES.has(status)) {
      return;
    }

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [startTimeMs, status]);

  if (!startTimeMs) {
    return '--';
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startTimeMs) / 1000));
  return formatElapsedTime(elapsedSeconds);
}

/**
 * ABOUTME: Reusable animated spinner for loading states in TUI components.
 * Uses lightweight frame animation with configurable speed and label.
 */

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { loadingColors, timing } from '../theme.js';

/**
 * Default spinner frames.
 */
export const DEFAULT_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Compute next spinner frame index.
 */
export function nextSpinnerIndex(currentIndex: number, frameCount: number): number {
  if (frameCount <= 0) {
    return 0;
  }
  return (currentIndex + 1) % frameCount;
}

/**
 * Props for Spinner component.
 */
export interface SpinnerProps {
  label?: string;
  frames?: string[];
  intervalMs?: number;
  color?: string;
  paused?: boolean;
  static?: boolean;
}

/**
 * Animated spinner component.
 */
export function Spinner({
  label,
  frames = DEFAULT_SPINNER_FRAMES,
  intervalMs = timing.spinnerFrame,
  color = loadingColors.spinner,
  paused = false,
  static: staticMode = false,
}: SpinnerProps): ReactNode {
  const safeFrames = useMemo(() => (frames.length > 0 ? frames : DEFAULT_SPINNER_FRAMES), [frames]);
  const [frameIndex, setFrameIndex] = useState(0);
  const reduceMotion = staticMode || process.env.REDUCE_MOTION === '1';

  useEffect(() => {
    setFrameIndex((currentIndex) => {
      if (currentIndex < safeFrames.length) {
        return currentIndex;
      }
      return 0;
    });
  }, [safeFrames]);

  useEffect(() => {
    if (paused || reduceMotion || safeFrames.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      setFrameIndex((currentIndex) => nextSpinnerIndex(currentIndex, safeFrames.length));
    }, intervalMs);

    return () => clearInterval(interval);
  }, [intervalMs, paused, reduceMotion, safeFrames]);

  const currentFrame = reduceMotion ? '⟳' : safeFrames[frameIndex] ?? safeFrames[0] ?? '.';
  const output = label ? `${currentFrame} ${label}` : currentFrame;

  return <text fg={color}>{output}</text>;
}

/**
 * Hook to manage playback state and timeline scrubbing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  speed: number;
  timeRange: { min: number; max: number };
}

export interface PlaybackControls {
  play: () => void;
  pause: () => void;
  setCurrentTime: (time: number) => void;
  setSpeed: (speed: number) => void;
  reset: () => void;
}

/** Speed options in game-ms per real-ms (e.g. 30 = 30× faster than real-time).
 *  At 30×, a 10-min match plays in ~20 real seconds. */
export const SPEED_OPTIONS = [10, 30, 60, 120] as const;
export type SpeedOption = typeof SPEED_OPTIONS[number];

export function usePlayback(
  timeRange: { min: number; max: number },
  onTimeUpdate?: (time: number) => void,
): [PlaybackState, PlaybackControls] {
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(timeRange.min);
  const [speed, setSpeed]           = useState<number>(30);
  const rafRef     = useRef<number | undefined>(undefined);
  const lastWall   = useRef<number>(0);
  const currTimeRef = useRef(timeRange.min); // mutable, avoids stale closure

  // Sync currentTime ref
  currTimeRef.current = currentTime;

  // Reset when timeRange changes (new match selected)
  useEffect(() => {
    setCurrentTime(timeRange.min);
    setIsPlaying(false);
  }, [timeRange.min]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    lastWall.current = performance.now();

    const tick = () => {
      const now   = performance.now();
      const delta = now - lastWall.current;   // real ms since last frame
      lastWall.current = now;

      // Advance game time by delta × speed (1 real-ms = speed game-ms)
      const next = Math.min(timeRange.max, currTimeRef.current + delta * speed);
      setCurrentTime(next);
      onTimeUpdate?.(next);

      if (next >= timeRange.max) {
        setIsPlaying(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, speed, timeRange.max, onTimeUpdate]);

  const play  = useCallback(() => setIsPlaying(true),  []);
  const pause = useCallback(() => setIsPlaying(false), []);

  const seek = useCallback((time: number) => {
    const clamped = Math.max(timeRange.min, Math.min(timeRange.max, time));
    setCurrentTime(clamped);
    onTimeUpdate?.(clamped);
  }, [timeRange, onTimeUpdate]);

  const changeSpeed = useCallback((s: number) => setSpeed(s), []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(timeRange.min);
    onTimeUpdate?.(timeRange.min);
  }, [timeRange.min, onTimeUpdate]);

  return [
    { isPlaying, currentTime, speed, timeRange },
    { play, pause, setCurrentTime: seek, setSpeed: changeSpeed, reset },
  ];
}

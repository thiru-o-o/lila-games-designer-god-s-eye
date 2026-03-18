/**
 * PlaybackControls — floating bar at the bottom of the map.
 * Includes play/pause, scrubber, speed, save moment, and copy link.
 */

import { useState } from 'react';
import { Play, Pause, RotateCcw, Bookmark, Link2 } from 'lucide-react';
import { SPEED_OPTIONS } from '../hooks/usePlayback';
import type { PlaybackState, PlaybackControls as PlaybackControlsType } from '../hooks/usePlayback';
import { ACCENT, SURFACE_2, BORDER } from '../tokens';

interface PlaybackControlsProps {
  playbackState: PlaybackState;
  controls:      PlaybackControlsType;
  onSaveMoment:  () => void;
}

function fmtMs(ms: number, startMs: number): string {
  const elapsed  = Math.max(0, ms - startMs);
  const totalSec = Math.floor(elapsed / 1000);
  const mm       = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const ss       = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

const BTN: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
  transition: 'color 0.15s',
};

export function PlaybackControls({ playbackState, controls, onSaveMoment }: PlaybackControlsProps) {
  const { isPlaying, currentTime, speed, timeRange } = playbackState;
  const { play, pause, setCurrentTime, setSpeed, reset } = controls;

  const [savedFlash,  setSavedFlash]  = useState(false);
  const [copiedFlash, setCopiedFlash] = useState(false);

  const progress = timeRange.max > timeRange.min
    ? ((currentTime - timeRange.min) / (timeRange.max - timeRange.min)) * 100
    : 0;

  const cur      = fmtMs(currentTime,   timeRange.min);
  const duration = fmtMs(timeRange.max, timeRange.min);

  const handleSave = () => {
    onSaveMoment();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedFlash(true);
      setTimeout(() => setCopiedFlash(false), 1800);
    });
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      width: 'calc(100% - 32px)',
      maxWidth: 760,
      background: 'rgba(15,23,42,0.92)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(148,163,184,0.15)',
      borderRadius: 12,
      padding: '10px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Reset */}
        <button onClick={reset} title="Reset to start" style={BTN}>
          <RotateCcw size={15} />
        </button>

        {/* Play / Pause */}
        <button
          onClick={isPlaying ? pause : play}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: ACCENT, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#0f172a', flexShrink: 0,
            boxShadow: `0 0 0 3px rgba(56,189,248,0.25)`,
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
        </button>

        {/* Current time */}
        <span style={{ color: '#e2e8f0', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 38 }}>
          {cur}
        </span>

        {/* Slider */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="range"
            min={timeRange.min}
            max={timeRange.max}
            value={currentTime}
            onChange={(e) => setCurrentTime(Number(e.target.value))}
            style={{
              width: '100%', height: 4,
              appearance: 'none', WebkitAppearance: 'none',
              borderRadius: 2, cursor: 'pointer', outline: 'none',
              background: `linear-gradient(to right, ${ACCENT} 0%, ${ACCENT} ${progress}%, ${BORDER} ${progress}%, ${BORDER} 100%)`,
            }}
          />
        </div>

        {/* Duration */}
        <span style={{ color: '#64748b', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 38 }}>
          {duration}
        </span>

        {/* Speed */}
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          style={{
            background: SURFACE_2, color: '#94a3b8',
            border: `1px solid ${BORDER}`, borderRadius: 6,
            padding: '3px 6px', fontSize: 12,
            cursor: 'pointer', outline: 'none',
          }}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#334155', flexShrink: 0 }} />

        {/* Save Moment */}
        <button
          onClick={handleSave}
          title="Save this moment"
          style={{ ...BTN, color: savedFlash ? '#f59e0b' : '#94a3b8', gap: 4, fontSize: 11 }}
        >
          <Bookmark size={14} fill={savedFlash ? '#f59e0b' : 'none'} />
          {savedFlash && <span style={{ color: '#f59e0b', fontWeight: 600 }}>Saved!</span>}
        </button>

        {/* Copy Link */}
        <button
          onClick={handleCopyLink}
          title="Copy link to this moment"
          style={{ ...BTN, color: copiedFlash ? '#38bdf8' : '#94a3b8', gap: 4, fontSize: 11 }}
        >
          <Link2 size={14} />
          {copiedFlash && <span style={{ color: '#38bdf8', fontWeight: 600 }}>Copied!</span>}
        </button>

      </div>
    </div>
  );
}

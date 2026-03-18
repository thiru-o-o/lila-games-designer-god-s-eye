/**
 * PlayerDetails — "Player Profile" card for the right-pane micro view.
 *
 * Sections: Identity, Kills, Items Found, Outcome.
 * Uses is_bot from the DB-derived field for human/bot classification.
 */

import { useMemo } from 'react';
import type { GameEvent } from '../hooks/useMatchData';
import { SURFACE_1, SURFACE_2, BORDER, TEXT_SECONDARY, ACCENT } from '../tokens';

interface PlayerDetailsProps {
  playerId: string | null;
  events: GameEvent[];
}

/* ---- local aliases ---- */
const PANEL_BG   = SURFACE_1;
const TEXT_MUTED = TEXT_SECONDARY;

const DEATH_EVENTS = new Set(['Killed', 'BotKilled', 'KilledByStorm']);

const FATE_LABEL: Record<string, { text: string; color: string }> = {
  Killed:        { text: 'Eliminated by a player', color: '#ef4444' },
  BotKilled:     { text: 'Eliminated by a bot',    color: '#a855f7' },
  KilledByStorm: { text: 'Lost to the storm',      color: '#06b6d4' },
};

export function PlayerDetails({ playerId, events }: PlayerDetailsProps) {
  const playerEvents = useMemo(
    () => (playerId ? events.filter((e) => e.user_id === playerId) : []),
    [playerId, events],
  );

  const stats = useMemo(() => {
    if (playerEvents.length === 0) return null;

    const kills  = playerEvents.filter((e) => e.event === 'Kill' || e.event === 'BotKill').length;
    const loot   = playerEvents.filter((e) => e.event === 'Loot').length;
    const isBot  = playerEvents[0]?.is_bot ?? false;

    const sorted    = [...playerEvents].sort((a, b) => Number(a.ts) - Number(b.ts));
    const lastEvent = sorted[sorted.length - 1];
    const fateEntry = lastEvent && DEATH_EVENTS.has(lastEvent.event)
      ? FATE_LABEL[lastEvent.event] ?? { text: lastEvent.event, color: '#94a3b8' }
      : { text: 'Extracted safely', color: '#10b981' };

    return { kills, loot, isBot, fate: fateEntry };
  }, [playerEvents]);

  if (!playerId) {
    return (
      <div style={{
        background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: '12px 14px',
      }}>
        <p style={{ color: TEXT_MUTED, fontSize: 12, margin: 0 }}>
          Click any player dot on the map to see their journey.
        </p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
        <p style={{ color: TEXT_MUTED, fontSize: 12 }}>No events found for this player.</p>
      </div>
    );
  }

  return (
    <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>

      {/* Identity */}
      <div style={{
        padding: '10px 14px',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{stats.isBot ? '🤖' : '🧑'}</span>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700,
            color: stats.isBot ? '#9ca3af' : ACCENT,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {stats.isBot ? 'Bot' : 'Human Player'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: TEXT_MUTED }}>
            {playerId.slice(0, 8)}…{playerId.slice(-4)}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: BORDER }}>
        <StatCell label="Kills"       value={stats.kills} color="#ef4444" />
        <StatCell label="Items Found" value={stats.loot}  color="#10b981" />
      </div>

      {/* Outcome */}
      <div style={{
        padding: '10px 14px',
        borderTop: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 14, flexShrink: 0 }}>
          {stats.fate.text === 'Extracted safely' ? '✅' : '💀'}
        </span>
        <div>
          <div style={{
            fontSize: 10, color: TEXT_MUTED,
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2,
          }}>
            Outcome
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: stats.fate.color }}>
            {stats.fate.text}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '5px 14px', borderTop: `1px solid ${BORDER}`, background: '#0a1628' }}>
        <p style={{ fontSize: 10, color: '#475569', margin: 0 }}>
          {playerEvents.length} events tracked
        </p>
      </div>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: SURFACE_2, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{
        fontSize: 10, color: TEXT_MUTED,
        textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2,
      }}>
        {label}
      </div>
    </div>
  );
}

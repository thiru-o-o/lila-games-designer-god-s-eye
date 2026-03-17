/**
 * ContextInspector — right pane.
 *
 * All-Matches mode  → "Danger Zones" — deadliest 100 m grid
 * Single-match mode → 5 insight cards:
 *   1. Match Timeline    — duration, time to first elimination
 *   2. How Players Died  — death split by player / bot / storm %
 *   3. Loot & Combat     — items, kills, items-per-kill ratio
 *   4. Player Outcome    — extraction vs death survival bar
 *   5. Bot Pressure      — bot count, kills vs deaths vs bots
 */

import { useMemo } from 'react';
import { PlayerDetails } from './PlayerDetails';
import type { GameEvent } from '../hooks/useMatchData';
import { ALL_MATCHES } from '../hooks/useMatchData';
import { formatMsToMMSS } from '../utils/formatTime';

const BORDER     = '#334155';
const TEXT_MAIN  = '#e2e8f0';
const TEXT_MUTED = '#94a3b8';
const PANEL_BG   = '#0f172a';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: TEXT_MUTED,
  marginBottom: 6,
};

interface ContextInspectorProps {
  selectedPlayer: string | null;
  selectedMatch:  string | null;
  events: GameEvent[];
  onClearPlayer: () => void;
}

export function ContextInspector({ selectedPlayer, selectedMatch, events, onClearPlayer }: ContextInspectorProps) {
  const isAllMatches = !selectedMatch || selectedMatch === ALL_MATCHES;
  const isMicroView  = !!selectedPlayer && !isAllMatches;

  /* Deadliest 100-metre grid (All-Matches mode) */
  const deadliestGrid = useMemo(() => {
    const kills = events.filter((e) => e.event === 'Kill' || e.event === 'BotKill');
    if (!kills.length) return null;
    const grid = new Map<string, { gx: number; gz: number; count: number }>();
    for (const e of kills) {
      const gx  = Math.round(e.x / 100) * 100;
      const gz  = Math.round(e.z / 100) * 100;
      const key = `${gx},${gz}`;
      const c   = grid.get(key);
      if (c) c.count++; else grid.set(key, { gx, gz, count: 1 });
    }
    return Array.from(grid.values()).sort((a, b) => b.count - a.count).slice(0, 3);
  }, [events]);

  /* Card 1: Match Timeline */
  const pacing = useMemo(() => {
    if (isAllMatches || !events.length) return null;
    let minTs = Infinity, maxTs = -Infinity;
    for (const e of events) {
      const t = Number(e.ts);
      if (t < minTs) minTs = t;
      if (t > maxTs) maxTs = t;
    }
    const firstElim = events.find(
      (e) => e.event === 'Kill' || e.event === 'BotKill',
    );
    return {
      duration_ms:     maxTs - minTs,
      first_action_ms: firstElim ? Number(firstElim.ts) - minTs : null,
    };
  }, [events, isAllMatches]);

  /* Card 2: How Players Died */
  const lethality = useMemo(() => {
    if (isAllMatches || !events.length) return null;
    const pvp   = events.filter((e) => e.event === 'Killed').length;
    const pve   = events.filter((e) => e.event === 'BotKilled').length;
    const storm = events.filter((e) => e.event === 'KilledByStorm').length;
    const total = pvp + pve + storm;
    if (!total) return null;
    const pct = (n: number) => Math.round((n / total) * 100);
    return { total, pvp, pve, storm, pvpPct: pct(pvp), pvePct: pct(pve), stormPct: pct(storm) };
  }, [events, isAllMatches]);

  /* Card 3: Loot & Combat */
  const economy = useMemo(() => {
    if (isAllMatches || !events.length) return null;
    const loot     = events.filter((e) => e.event === 'Loot').length;
    const pvpKills = events.filter((e) => e.event === 'Kill').length;
    const ratio: number | null = pvpKills > 0 ? loot / pvpKills : null;
    return { loot, pvpKills, ratio };
  }, [events, isAllMatches]);

  /* Card 4: Player Outcome */
  const outcome = useMemo(() => {
    if (isAllMatches || !events.length) return null;
    const DEATH_EVENTS = new Set(['Killed', 'BotKilled', 'KilledByStorm']);
    const humans = [...new Set(
      events.filter((e) => !e.is_bot).map((e) => e.user_id),
    )];
    if (!humans.length) return null;
    const diedHumans = new Set(
      events
        .filter((e) => DEATH_EVENTS.has(e.event) && !e.is_bot)
        .map((e) => e.user_id),
    );
    const survived = humans.filter((id) => !diedHumans.has(id)).length;
    return { total: humans.length, survived, died: humans.length - survived };
  }, [events, isAllMatches]);

  /* Card 5: Bot Pressure */
  const botPressure = useMemo(() => {
    if (isAllMatches || !events.length) return null;
    const botCount  = new Set(events.filter((e) => e.is_bot).map((e) => e.user_id)).size;
    const botKills  = events.filter((e) => e.event === 'BotKill').length;
    const botDeaths = events.filter((e) => e.event === 'BotKilled').length;
    if (!botCount && !botKills && !botDeaths) return null;
    return { botCount, botKills, botDeaths };
  }, [events, isAllMatches]);

  /* render */
  return (
    <div style={{
      width: 300, minWidth: 300,
      background: '#1e293b',
      borderLeft: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      height: '100%', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>{isMicroView ? '🎯' : '🔍'}</span>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: TEXT_MAIN, margin: 0 }}>
              {isMicroView ? 'Player Profile' : 'Match Insights'}
            </h2>
          </div>
          {isMicroView && (
            <button
              onClick={onClearPlayer}
              title="Clear player selection"
              style={{
                background: 'none',
                border: `1px solid ${BORDER}`,
                borderRadius: 5,
                color: TEXT_MUTED,
                fontSize: 11,
                padding: '3px 8px',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#64748b';
                (e.currentTarget as HTMLButtonElement).style.color = TEXT_MAIN;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER;
                (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED;
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
        <p style={{ color: TEXT_MUTED, fontSize: 11, marginTop: 3, marginBottom: 0 }}>
          {isMicroView
            ? 'Path traced on map · stats below'
            : isAllMatches
              ? 'All matches — toggle heatmaps to explore'
              : 'Single match deep-dive'}
        </p>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* MICRO VIEW — player selected */}
        {isMicroView && (
          <section>
            <PlayerDetails playerId={selectedPlayer} events={events} />
          </section>
        )}

        {/* Player hint (non-micro) */}
        {!isMicroView && (
          <section>
            <p style={labelStyle}>Selected Player</p>
            <PlayerDetails playerId={selectedPlayer} events={events} />
          </section>
        )}

        {/* ALL-MATCHES BRANCH */}
        {isAllMatches && !isMicroView && (
          <section style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
            <p style={labelStyle}>🗺 Danger Zones (Map-Wide)</p>

            {!events.length ? (
              <p style={{ color: TEXT_MUTED, fontSize: 12 }}>
                Select a map and date range to begin exploring.
              </p>
            ) : !deadliestGrid?.length ? (
              <p style={{ color: TEXT_MUTED, fontSize: 12 }}>No elimination data for this selection.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  background: '#1a0a0a', border: '1px solid #7f1d1d',
                  borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 10, color: '#f87171', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginBottom: 6 }}>
                    ☠ Most Dangerous Zone
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 6, lineHeight: 1.6 }}>
                    X: <b style={{ color: TEXT_MAIN }}>{deadliestGrid[0].gx}</b>
                    {' → '}
                    <b style={{ color: TEXT_MAIN }}>{deadliestGrid[0].gx + 100}</b>
                    <br />
                    Z: <b style={{ color: TEXT_MAIN }}>{deadliestGrid[0].gz}</b>
                    {' → '}
                    <b style={{ color: TEXT_MAIN }}>{deadliestGrid[0].gz + 100}</b>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>
                    {deadliestGrid[0].count}
                    <span style={{ fontSize: 11, fontWeight: 400, color: TEXT_MUTED, marginLeft: 4 }}>eliminations</span>
                  </div>
                </div>

                {deadliestGrid.length > 1 && (
                  <div>
                    <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase',
                      letterSpacing: '0.06em', marginBottom: 6 }}>
                      Other Danger Zones
                    </div>
                    {deadliestGrid.map((g, i) => (
                      <div key={`${g.gx},${g.gz}`} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '5px 0',
                        borderBottom: i < deadliestGrid.length - 1 ? `1px solid ${BORDER}` : 'none',
                      }}>
                        <span style={{ fontSize: 11, color: TEXT_MUTED }}>
                          #{i + 1}&nbsp;
                          <span style={{ color: TEXT_MAIN }}>X{g.gx} Z{g.gz}</span>
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#eab308',
                        }}>
                          {g.count} elims
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* SINGLE-MATCH BRANCH */}
        {!isAllMatches && !isMicroView && (
          <>
            {/* Card 1 — Match Timeline */}
            <section style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
              <p style={labelStyle}>⏱ Match Timeline</p>
              {!pacing ? (
                <p style={{ color: TEXT_MUTED, fontSize: 12 }}>Loading data…</p>
              ) : (
                <div style={{
                  background: PANEL_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  <InsightRow
                    icon="⌛" label="Total Duration"
                    value={formatMsToMMSS(pacing.duration_ms)}
                    color="#38bdf8"
                    sub="from first to last event"
                  />
                  <div style={{ height: 1, background: BORDER }} />
                  <InsightRow
                    icon="🩸" label="First Elimination"
                    value={pacing.first_action_ms !== null
                      ? formatMsToMMSS(pacing.first_action_ms)
                      : 'None recorded'}
                    color="#ef4444"
                    sub={pacing.first_action_ms !== null ? 'after match started' : undefined}
                  />
                </div>
              )}
            </section>

            {/* Card 2 — How Players Died */}
            <section style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
              <p style={labelStyle}>💀 How Players Died</p>
              {!lethality ? (
                <p style={{ color: TEXT_MUTED, fontSize: 12 }}>
                  {events.length ? 'No casualties recorded.' : 'Loading data…'}
                </p>
              ) : (
                <div style={{
                  background: PANEL_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 8 }}>
                    {lethality.total} total {lethality.total === 1 ? 'casualty' : 'casualties'}
                  </div>
                  <LethalityBar label="Killed by a player" count={lethality.pvp}   pct={lethality.pvpPct}   barColor="#ef4444" />
                  <LethalityBar label="Killed by a bot"    count={lethality.pve}   pct={lethality.pvePct}   barColor="#a855f7" />
                  <LethalityBar label="Lost to the storm"  count={lethality.storm} pct={lethality.stormPct} barColor="#06b6d4" />
                </div>
              )}
            </section>

            {/* Card 3 — Loot & Combat */}
            <section style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
              <p style={labelStyle}>💰 Loot &amp; Combat</p>
              {!economy ? (
                <p style={{ color: TEXT_MUTED, fontSize: 12 }}>Loading data…</p>
              ) : (
                <div style={{
                  background: PANEL_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  <InsightRow
                    icon="📦" label="Items Picked Up"
                    value={String(economy.loot)} color="#10b981"
                  />
                  <div style={{ height: 1, background: BORDER }} />
                  <InsightRow
                    icon="⚔️" label="Player Kills"
                    value={String(economy.pvpKills)} color="#ef4444"
                  />
                  <div style={{ height: 1, background: BORDER }} />
                  <InsightRow
                    icon="📊" label="Items per Kill"
                    value={economy.ratio !== null ? `${economy.ratio.toFixed(1)}×` : 'N/A'}
                    color="#f59e0b"
                    sub={economy.ratio !== null ? 'items found per player kill' : 'no player kills recorded'}
                  />
                </div>
              )}
            </section>

            {/* Card 4 — Player Outcome */}
            {outcome && (
              <section style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                <p style={labelStyle}>🏃 Player Outcome</p>
                <div style={{
                  background: PANEL_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 8, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN, marginBottom: 8 }}>
                    {outcome.survived === outcome.total
                      ? 'All players extracted safely'
                      : outcome.survived === 0
                        ? 'No players extracted'
                        : `${outcome.survived} of ${outcome.total} player${outcome.total !== 1 ? 's' : ''} extracted`}
                  </div>
                  {/* Survival bar */}
                  <div style={{ height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{
                      height: '100%',
                      width: `${(outcome.survived / outcome.total) * 100}%`,
                      background: '#10b981',
                      borderRadius: 4,
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: TEXT_MUTED }}>
                    <span style={{ color: '#10b981' }}>{outcome.survived} extracted</span>
                    <span style={{ color: '#ef4444' }}>{outcome.died} eliminated</span>
                  </div>
                </div>
              </section>
            )}

            {/* Card 5 — Bot Pressure */}
            {botPressure && (
              <section style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                <p style={labelStyle}>🤖 Bot Pressure</p>
                <div style={{
                  background: PANEL_BG, border: `1px solid ${BORDER}`,
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  <InsightRow
                    icon="🤖" label="Bots in Match"
                    value={String(botPressure.botCount)} color="#6b7280"
                    sub="AI-controlled opponents"
                  />
                  <div style={{ height: 1, background: BORDER }} />
                  <InsightRow
                    icon="✅" label="Bots Eliminated"
                    value={String(botPressure.botKills)} color="#10b981"
                  />
                  <div style={{ height: 1, background: BORDER }} />
                  <InsightRow
                    icon="💀" label="Deaths to Bots"
                    value={String(botPressure.botDeaths)} color="#a855f7"
                  />
                </div>
              </section>
            )}
          </>
        )}

      </div>
    </div>
  );
}

/* Sub-components */

function InsightRow({
  icon, label, value, color, sub,
}: { icon: string; label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

function LethalityBar({
  label, count, pct, barColor,
}: { label: string; count: number; pct: number; barColor: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: TEXT_MUTED }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_MAIN }}>
          {count} <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: barColor,
          borderRadius: 3, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

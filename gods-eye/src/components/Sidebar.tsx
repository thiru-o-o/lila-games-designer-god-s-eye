/**
 * Sidebar — left pane: progress stepper, filters, stats, activity maps, insights, saved moments.
 * Pure-UI component — all data and callbacks come from App.tsx.
 */

import { useMemo } from 'react';
import type { GameEvent } from '../hooks/useMatchData';
import type { MatchMeta } from '../hooks/useMatchList';
import type { SavedMoment } from '../App';
import { ALL_MATCHES } from '../hooks/useMatchData';
import { formatMsToMMSS } from '../utils/formatTime';

/* ---- style tokens ---- */
const SIDEBAR_BG  = '#0f172a';
const PANEL_BG    = '#1e293b';
const BORDER      = '#334155';
const TEXT_MAIN   = '#e2e8f0';
const TEXT_MUTED  = '#94a3b8';
const ACCENT      = '#38bdf8';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: PANEL_BG,
  color: TEXT_MAIN,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: TEXT_MUTED,
  marginBottom: 4,
};

const sectionStyle: React.CSSProperties = {
  borderTop: `1px solid ${BORDER}`,
  paddingTop: 12,
};

/* ---- props ---- */
interface SidebarProps {
  selectedMap:     string | null;
  dateFrom:        string | null;
  dateTo:          string | null;
  selectedMatch:   string | null;
  availableMaps:   string[];
  availableDates:  string[];
  matchList:       MatchMeta[];
  matchListLoading: boolean;
  events:          GameEvent[];
  onMapChange:          (mapId: string) => void;
  onDateFromChange:     (date: string) => void;
  onDateToChange:       (date: string) => void;
  onMatchChange:        (matchId: string) => void;
  showHeatPvP:          boolean;
  showHeatPvE:          boolean;
  showHeatStorm:        boolean;
  showHeatTraffic:      boolean;
  showHeatLoot:         boolean;
  showHeatDropZones:    boolean;
  showHeatExtraction:   boolean;
  showPlayerMarkers:    boolean;
  onToggleHeatPvP:          () => void;
  onToggleHeatPvE:          () => void;
  onToggleHeatStorm:        () => void;
  onToggleHeatTraffic:      () => void;
  onToggleHeatLoot:         () => void;
  onToggleHeatDropZones:    () => void;
  onToggleHeatExtraction:   () => void;
  onTogglePlayerMarkers:    () => void;
  savedMoments:    SavedMoment[];
  onDeleteMoment:  (id: string) => void;
  onRestoreMoment: (moment: SavedMoment) => void;
}

export function Sidebar({
  selectedMap, dateFrom, dateTo, selectedMatch,
  availableMaps, availableDates, matchList, matchListLoading,
  events,
  onMapChange, onDateFromChange, onDateToChange, onMatchChange,
  showHeatPvP, showHeatPvE, showHeatStorm, showHeatTraffic,
  showHeatLoot, showHeatDropZones, showHeatExtraction, showPlayerMarkers,
  onToggleHeatPvP, onToggleHeatPvE, onToggleHeatStorm, onToggleHeatTraffic,
  onToggleHeatLoot, onToggleHeatDropZones, onToggleHeatExtraction, onTogglePlayerMarkers,
  savedMoments, onDeleteMoment, onRestoreMoment,
}: SidebarProps) {

  /* Event stats from loaded events */
  const stats = useMemo(() => {
    const playerKills = events.filter((e) => e.event === 'Kill').length;
    const botKills    = events.filter((e) => e.event === 'BotKill').length;
    const stormDeaths = events.filter((e) => e.event === 'KilledByStorm').length;
    const lootItems   = events.filter((e) => e.event === 'Loot').length;
    const humanSet    = new Set<string>();
    const botSet      = new Set<string>();
    for (const e of events) {
      if (e.is_bot) botSet.add(e.user_id);
      else          humanSet.add(e.user_id);
    }
    return { playerKills, botKills, stormDeaths, lootItems, humans: humanSet.size, bots: botSet.size };
  }, [events]);

  /* Storm death centroid for Map Insights */
  const stormCenter = useMemo(() => {
    const s = events.filter((e) => e.event === 'KilledByStorm');
    if (!s.length) return null;
    const avgX = Math.round(s.reduce((a, e) => a + e.x, 0) / s.length);
    const avgZ = Math.round(s.reduce((a, e) => a + e.z, 0) / s.length);
    return { avgX, avgZ, count: s.length };
  }, [events]);

  /* Steps for the progress stepper */
  const step1Done = !!selectedMap;
  const step2Done = !!dateFrom;
  const step3Done = !!selectedMatch;

  /* "To" dates — only dates >= dateFrom */
  const toDateOptions = useMemo(() => {
    if (!dateFrom) return availableDates;
    return availableDates.filter((d) => d >= dateFrom);
  }, [availableDates, dateFrom]);

  /* Date range label e.g. "5 days" */
  const dateRangeLabel = useMemo(() => {
    if (!dateFrom) return null;
    if (!dateTo || dateTo === dateFrom) return null;
    const fromIdx = availableDates.indexOf(dateFrom);
    const toIdx   = availableDates.indexOf(dateTo);
    if (fromIdx === -1 || toIdx === -1) return null;
    const days = toIdx - fromIdx + 1;
    return `${days} day${days !== 1 ? 's' : ''}`;
  }, [dateFrom, dateTo, availableDates]);

  return (
    <div style={{
      width: 300, minWidth: 300,
      background: SIDEBAR_BG,
      borderRight: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
      height: '100%', overflowY: 'auto',
    }}>

      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>👁</span>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: TEXT_MAIN, margin: 0 }}>God's Eye</h1>
        </div>
        <p style={{ color: TEXT_MUTED, fontSize: 11, marginTop: 2, marginBottom: 0 }}>
          LILA BLACK · Level Design Analytics
        </p>
      </div>

      {/* Progress Stepper */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <StepBadge n={1} label="Map"   done={step1Done} active={!step1Done} />
          <StepLine done={step1Done} />
          <StepBadge n={2} label="Dates" done={step2Done} active={step1Done && !step2Done} />
          <StepLine done={step3Done} />
          <StepBadge n={3} label="Match" done={step3Done} active={step2Done && !step3Done} />
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Map selector */}
        <div>
          <LabelWithTip label="Map" tip="The battle arena. Each map has a different layout, storm pattern, and bot density." />
          <select
            value={selectedMap ?? ''}
            onChange={(e) => onMapChange(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select a map to begin…</option>
            {availableMaps.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <LabelWithTip
            label="Date Range"
            tip="Analyse a single day or a multi-day window. All matches in the range are included."
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 3 }}>From</div>
              <select
                value={dateFrom ?? ''}
                onChange={(e) => onDateFromChange(e.target.value)}
                disabled={!selectedMap}
                style={{ ...inputStyle, fontSize: 12, opacity: selectedMap ? 1 : 0.45 }}
              >
                <option value="">— start —</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>{d.replace('2026-', 'Feb ')}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 3 }}>To</div>
              <select
                value={dateTo ?? ''}
                onChange={(e) => onDateToChange(e.target.value)}
                disabled={!dateFrom}
                style={{ ...inputStyle, fontSize: 12, opacity: dateFrom ? 1 : 0.45 }}
              >
                <option value="">— end —</option>
                {toDateOptions.map((d) => (
                  <option key={d} value={d}>{d.replace('2026-', 'Feb ')}</option>
                ))}
              </select>
            </div>
          </div>
          {dateRangeLabel && (
            <p style={{ fontSize: 10, color: ACCENT, marginTop: 4 }}>
              {dateRangeLabel} selected · {matchList.length} matches available
            </p>
          )}
          {!dateFrom && selectedMap && (
            <p style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
              Choose a start date to load match data
            </p>
          )}
        </div>

        {/* Match selector */}
        <div>
          <LabelWithTip
            label="Match"
            tip="Replay a specific match, or view all matches at once to see aggregate heatmaps."
          />
          {selectedMatch === ALL_MATCHES && (
            <span style={{
              display: 'inline-block', background: '#0ea5e9',
              color: '#fff', borderRadius: 99, fontSize: 9,
              fontWeight: 700, padding: '1px 7px', marginBottom: 4,
            }}>
              ALL MATCHES
            </span>
          )}
          <select
            value={selectedMatch ?? ''}
            onChange={(e) => onMatchChange(e.target.value)}
            disabled={!dateFrom || matchListLoading}
            style={{
              ...inputStyle,
              opacity: dateFrom ? 1 : 0.45,
              borderColor: selectedMatch === ALL_MATCHES ? '#0ea5e9' : BORDER,
            }}
          >
            {matchListLoading
              ? <option value="">Loading matches…</option>
              : <option value="">Select a match…</option>
            }
            <option value={ALL_MATCHES}>All Matches (aggregate view)</option>
            <optgroup label="──── Individual Matches ────" style={{ color: TEXT_MUTED }}>
              {matchList.map((m, i) => (
                <option key={m.match_id} value={m.match_id}>
                  {`Match #${i + 1} · ${m.humans === 1 ? '1 player' : `${m.humans} players`} · ${formatMsToMMSS(m.duration_ms)}`}
                </option>
              ))}
            </optgroup>
          </select>
          {selectedMatch === ALL_MATCHES && matchList.length > 0 && (
            <p style={{ fontSize: 10, color: '#0ea5e9', marginTop: 3 }}>
              Heatmaps cover all {matchList.length} match{matchList.length !== 1 ? 'es' : ''}
            </p>
          )}
          {!dateFrom && (
            <p style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
              Pick a date range first to see available matches
            </p>
          )}
        </div>

        {/* Quick Stats */}
        {events.length > 0 && (
          <div style={sectionStyle}>
            <p style={{ ...labelStyle, marginBottom: 8 }}>Quick Stats</p>
            <div style={{
              background: PANEL_BG, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: '10px 12px',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
            }}>
              <StatCell
                label="Player Kills" value={stats.playerKills} color="#ef4444"
                tip="Human vs human eliminations"
              />
              <StatCell
                label="Bots Eliminated" value={stats.botKills} color="#a855f7"
                tip="How many bots players destroyed"
              />
              <StatCell
                label="Storm Deaths" value={stats.stormDeaths} color="#06b6d4"
                tip="Players caught and killed by the storm"
              />
              <StatCell
                label="Players" value={stats.humans} color="#38bdf8"
                tip="Human players in this selection"
              />
              <StatCell
                label="Bots" value={stats.bots} color="#6b7280"
                tip="AI opponents in this selection"
              />
              <StatCell
                label="Items Looted" value={stats.lootItems} color="#10b981"
                tip="Total items picked up across all players"
              />
            </div>
          </div>
        )}

        {/* Activity Maps (Heatmaps) */}
        <div style={sectionStyle}>
          <LabelWithTip
            label="Activity Maps"
            tip="Overlay heatmaps to see where key actions are concentrated across the map."
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            <ToggleRow
              label="Player Markers"
              subLabel={selectedMatch === ALL_MATCHES ? 'Only available in single-match view' : 'Show player positions on the map'}
              checked={showPlayerMarkers && selectedMatch !== ALL_MATCHES}
              onChange={onTogglePlayerMarkers}
              dotColor="#3b82f6"
              disabled={selectedMatch === ALL_MATCHES}
            />

            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 6, marginTop: 2 }}>
              <p style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 6 }}>
                Combat &amp; Movement
              </p>
            </div>

            <ToggleRow
              label="Player Kill Zones"
              subLabel={`Where players eliminated each other${events.length > 0 ? ` · ${stats.playerKills} kills` : ''}`}
              checked={showHeatPvP}
              onChange={onToggleHeatPvP}
              dotColor="#ef4444"
              tip="Hot zones where human-vs-human combat happened most"
            />
            <ToggleRow
              label="Bot Encounter Zones"
              subLabel={`Where bots and players clashed${events.length > 0 ? ` · ${stats.botKills} bot kills` : ''}`}
              checked={showHeatPvE}
              onChange={onToggleHeatPvE}
              dotColor="#a855f7"
              tip="Areas with dense bot activity — useful for tuning AI patrol routes"
            />
            <ToggleRow
              label="Storm Deaths"
              subLabel="Where players were caught by the storm"
              checked={showHeatStorm}
              onChange={onToggleHeatStorm}
              dotColor="#06b6d4"
              tip="Storm kill positions — if players die here often, the storm boundary may need adjustment"
            />
            <ToggleRow
              label="Movement Density"
              subLabel="Most-travelled areas of the map"
              checked={showHeatTraffic}
              onChange={onToggleHeatTraffic}
              dotColor="#22c55e"
              tip="How players move through the map — dark areas may be underutilised design space"
            />

            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 6, marginTop: 2 }}>
              <p style={{ fontSize: 10, color: TEXT_MUTED, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 6 }}>
                Economy &amp; Flow
              </p>
            </div>

            <ToggleRow
              label="Loot Hotspots"
              subLabel="Where items are picked up most"
              checked={showHeatLoot}
              onChange={onToggleHeatLoot}
              dotColor="#f59e0b"
              tip="Reveals item concentration — if loot is too far from player paths, consider redistributing"
            />
            <ToggleRow
              label="Drop Zones"
              subLabel="Where players first appeared"
              checked={showHeatDropZones}
              onChange={onToggleHeatDropZones}
              dotColor="#38bdf8"
              tip="Starting positions — shows spawn distribution and whether spawns are balanced across the map"
            />
            <ToggleRow
              label="Extraction Corridors"
              subLabel="Paths of players who made it out"
              checked={showHeatExtraction}
              onChange={onToggleHeatExtraction}
              dotColor="#10b981"
              tip="Final positions of surviving players — reveals popular extraction routes"
            />
          </div>
        </div>

        {/* Map Insights */}
        <div style={sectionStyle}>
          <p style={labelStyle}>Map Insights</p>
          {stormCenter ? (
            <div style={{
              background: PANEL_BG, border: `1px solid #164e63`,
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ fontSize: 10, color: '#06b6d4', textTransform: 'uppercase',
                letterSpacing: '0.05em', marginBottom: 4 }}>
                Storm Epicentre
              </div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 4 }}>
                Most storm deaths concentrated near:
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#22d3ee' }}>
                X {stormCenter.avgX} · Z {stormCenter.avgZ}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                Based on {stormCenter.count} storm {stormCenter.count !== 1 ? 'deaths' : 'death'}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: TEXT_MUTED }}>
              {events.length === 0
                ? 'Select a match to see map insights.'
                : 'No storm deaths in the current selection.'}
            </p>
          )}
        </div>

        {/* Saved Moments */}
        <div style={sectionStyle}>
          <p style={labelStyle}>Saved Moments</p>
          {savedMoments.length === 0 ? (
            <p style={{ fontSize: 12, color: TEXT_MUTED }}>
              Use the bookmark button in the playback bar to save interesting moments for review.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {savedMoments.map((m) => (
                <div
                  key={m.id}
                  style={{
                    background: PANEL_BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 6,
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: TEXT_MAIN, fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
                        {m.map} · {m.dateFrom === m.dateTo
                          ? m.dateFrom.replace('2026-', 'Feb ')
                          : `${m.dateFrom.replace('2026-', 'Feb ')} – ${m.dateTo.replace('2026-', 'Feb ')}`}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteMoment(m.id)}
                      title="Remove"
                      style={{
                        background: 'none', border: 'none',
                        color: '#475569', cursor: 'pointer',
                        fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <button
                    onClick={() => onRestoreMoment(m)}
                    style={{
                      marginTop: 6, width: '100%',
                      background: 'transparent',
                      border: `1px solid ${BORDER}`,
                      borderRadius: 4, color: ACCENT,
                      fontSize: 11, padding: '4px 8px',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
                  >
                    Jump to moment
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function LabelWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
      <span style={{
        fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: TEXT_MUTED,
      }}>
        {label}
      </span>
      <InfoTip text={tip} />
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 13, height: 13, borderRadius: '50%',
        border: '1px solid #475569', color: '#475569',
        fontSize: 9, cursor: 'help', marginLeft: 5,
        flexShrink: 0, userSelect: 'none',
      }}
    >
      ?
    </span>
  );
}

function StatCell({
  label, value, color, tip,
}: { label: string; value: number; color: string; tip: string }) {
  return (
    <div style={{ textAlign: 'center' }} title={tip}>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: TEXT_MUTED, textTransform: 'uppercase',
        letterSpacing: '0.05em', lineHeight: 1.3 }}>
        {label}
      </div>
    </div>
  );
}

function ToggleRow({
  label, subLabel, checked, onChange, dotColor, disabled, tip,
}: {
  label: string; subLabel?: string; checked: boolean;
  onChange: () => void; dotColor: string; disabled?: boolean; tip?: string;
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ accentColor: dotColor, width: 14, height: 14,
          cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 13, color: TEXT_MAIN }}>{label}</span>
          {tip && <InfoTip text={tip} />}
        </div>
        {subLabel && <div style={{ fontSize: 10, color: TEXT_MUTED }}>{subLabel}</div>}
      </div>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: checked ? dotColor : BORDER,
        transition: 'background 0.2s', flexShrink: 0,
      }} />
    </label>
  );
}

/* Progress stepper */
function StepBadge({ n, label, done, active }: { n: number; label: string; done: boolean; active: boolean }) {
  const bg    = done ? ACCENT : active ? '#1e3a5f' : PANEL_BG;
  const color = done ? '#0f172a' : active ? ACCENT : TEXT_MUTED;
  const border = done ? ACCENT : active ? ACCENT : BORDER;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: bg, border: `1.5px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color,
        transition: 'all 0.2s',
      }}>
        {done ? '✓' : n}
      </div>
      <span style={{ fontSize: 9, color: active || done ? TEXT_MAIN : TEXT_MUTED,
        fontWeight: active || done ? 600 : 400, letterSpacing: '0.03em' }}>
        {label}
      </span>
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return (
    <div style={{
      flex: 1, height: 1.5, marginBottom: 12,
      background: done ? ACCENT : BORDER,
      transition: 'background 0.2s',
    }} />
  );
}

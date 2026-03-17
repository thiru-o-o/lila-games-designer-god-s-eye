/**
 * App — 3-pane workspace layout
 *
 *  ┌──────────────┬──────────────────────┬──────────────┐
 *  │  Left Pane   │    Center Pane       │  Right Pane  │
 *  │  (Controls)  │    (Leaflet Map)     │  (Inspector) │
 *  └──────────────┴──────────────────────┴──────────────┘
 *
 * State ownership:
 *  • metadata (maps, dates) fetched here so URL params can be applied before auto-select
 *  • useMatchList lives here so selectedDates is computed once and shared
 *  • Sidebar is a pure-UI component receiving all data as props
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapView }          from './components/MapView';
import { Sidebar }          from './components/Sidebar';
import { ContextInspector } from './components/ContextInspector';
import { PlaybackControls } from './components/PlaybackControls';
import { useMatchData, ALL_MATCHES } from './hooks/useMatchData';
import { useMatchList }    from './hooks/useMatchList';
import { usePlayback }     from './hooks/usePlayback';
import { useDuckDB, statusLabel } from './hooks/useDuckDB';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface SavedMoment {
  id:           string;
  label:        string;
  map:          string;
  dateFrom:     string;
  dateTo:       string;
  matchId:      string;
  scrubberTime: number;  // ms offset from match start
  playerId:     string | null;
  savedAt:      number;  // epoch-ms
}

/* ------------------------------------------------------------------ */
/*  Loading splash                                                      */
/* ------------------------------------------------------------------ */

function LoadingSplash({ status }: { status: string }) {
  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#0f172a',
    }}>
      <div style={{ textAlign: 'center', color: '#e2e8f0' }}>
        <div style={{
          width: 48, height: 48,
          border: '4px solid #334155', borderTop: '4px solid #38bdf8',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
          margin: '0 auto 20px',
        }} />
        <p style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>God's Eye</p>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{status}</p>
        <p style={{ fontSize: '0.75rem', color: '#475569', marginTop: 8 }}>
          First load takes ~10 s — the analytics engine downloads once and is cached after that
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supabase helpers                                                    */
/* ------------------------------------------------------------------ */

const SUPABASE_URL     = (import.meta.env.VITE_SUPABASE_URL  as string | undefined)?.replace(/\/$/, '') ?? '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

function supaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey:        SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

type RawMoment = Record<string, unknown>;

function rowToMoment(r: RawMoment): SavedMoment {
  return {
    id:           String(r.id ?? ''),
    label:        String(r.label ?? ''),
    map:          String(r.map ?? ''),
    dateFrom:     String(r.date_from ?? ''),
    dateTo:       String(r.date_to ?? ''),
    matchId:      String(r.match_id ?? ''),
    scrubberTime: Number(r.scrubber_time ?? 0),
    playerId:     r.player_id != null ? String(r.player_id) : null,
    savedAt:      Number(r.saved_at ?? 0),
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function readUrlParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

function loadLocalMoments(): SavedMoment[] {
  try {
    const raw = localStorage.getItem('gods-eye-moments');
    return raw ? (JSON.parse(raw) as SavedMoment[]) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Main App                                                            */
/* ------------------------------------------------------------------ */

function App() {
  /* Initialise from URL params synchronously (lazy useState) */
  const [selectedMap,    setSelectedMap]    = useState<string | null>(() => readUrlParam('map'));
  const [dateFrom,       setDateFrom]       = useState<string | null>(() => readUrlParam('from'));
  const [dateTo,         setDateTo]         = useState<string | null>(() => {
    const f = readUrlParam('from');
    return readUrlParam('to') ?? f;
  });
  const [selectedMatch,  setSelectedMatch]  = useState<string | null>(() => readUrlParam('match'));
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(() => readUrlParam('player'));

  /* Metadata */
  const [availableMaps,  setAvailableMaps]  = useState<string[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  /* Layer visibility */
  const [showHeatPvP,        setShowHeatPvP]        = useState(true);
  const [showHeatPvE,        setShowHeatPvE]        = useState(false);
  const [showHeatStorm,      setShowHeatStorm]      = useState(false);
  const [showHeatTraffic,    setShowHeatTraffic]    = useState(false);
  const [showHeatLoot,       setShowHeatLoot]       = useState(false);
  const [showHeatDropZones,  setShowHeatDropZones]  = useState(false);
  const [showHeatExtraction, setShowHeatExtraction] = useState(false);
  const [showPlayerMarkers,  setShowPlayerMarkers]  = useState(true);

  /* Saved moments — loaded async from Supabase (falls back to localStorage) */
  const [savedMoments, setSavedMoments] = useState<SavedMoment[]>([]);

  /* Pending scrubber time to apply after a moment is restored */
  const pendingScrubberRef = useRef<number | null>(
    (() => { const t = readUrlParam('t'); return t ? Number(t) : null; })()
  );

  /* DuckDB */
  const { loading: dbLoading, status: dbStatus, error: dbError } = useDuckDB();

  /* Derived: array of dates in selected range */
  const selectedDates = useMemo(() => {
    if (!dateFrom) return [];
    if (!dateTo || dateFrom === dateTo) return [dateFrom];
    const fromIdx = availableDates.indexOf(dateFrom);
    const toIdx   = availableDates.indexOf(dateTo);
    if (fromIdx === -1 || toIdx === -1) return [dateFrom];
    return availableDates.slice(fromIdx, toIdx + 1);
  }, [dateFrom, dateTo, availableDates]);

  /* Data */
  const { matches: matchList, loading: matchListLoading } = useMatchList(selectedMap, selectedDates);
  const matchData = useMatchData(selectedMap, selectedDates, selectedMatch);

  /* Playback */
  const [playbackState, playbackControls] = usePlayback(matchData.timeRange);

  /* Load metadata — from Supabase Storage if configured, else static file */
  useEffect(() => {
    const metaUrl = SUPABASE_URL
      ? `${SUPABASE_URL}/storage/v1/object/public/parquet/metadata.json`
      : '/metadata.json';
    fetch(metaUrl)
      .then((r) => r.json())
      .then((data: { maps: string[]; dates: string[] }) => {
        setAvailableMaps(data.maps ?? []);
        setAvailableDates(data.dates ?? []);
        setSelectedMap((prev) => prev ?? data.maps?.[0] ?? null);
        setDateFrom((prev) => prev ?? data.dates?.[0] ?? null);
        setDateTo((prev) => prev ?? data.dates?.[0] ?? null);
      })
      .catch((err) => console.error('[App] Metadata load failed:', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Load saved moments — from Supabase Postgres if configured, else localStorage */
  useEffect(() => {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      fetch(`${SUPABASE_URL}/rest/v1/saved_moments?select=*&order=saved_at.desc`, {
        headers: supaHeaders(),
      })
        .then((r) => r.json())
        .then((rows: RawMoment[]) => setSavedMoments(rows.map(rowToMoment)))
        .catch(() => setSavedMoments(loadLocalMoments()));
    } else {
      setSavedMoments(loadLocalMoments());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Auto-select "All Matches" when the match list first loads */
  useEffect(() => {
    if (matchList.length > 0 && !selectedMatch) {
      setSelectedMatch(ALL_MATCHES);
    }
  }, [matchList, selectedMatch]);

  /* Apply pending scrubber time once match data has loaded */
  useEffect(() => {
    if (pendingScrubberRef.current === null) return;
    if (matchData.loading || matchData.events.length === 0) return;
    playbackControls.setCurrentTime(matchData.timeRange.min + pendingScrubberRef.current);
    pendingScrubberRef.current = null;
  }, [matchData.loading, matchData.events.length, matchData.timeRange.min, playbackControls]);

  /* Sync URL whenever selection changes (only when playback is paused) */
  useEffect(() => {
    if (playbackState.isPlaying) return;
    const params = new URLSearchParams();
    if (selectedMap)                                     params.set('map',    selectedMap);
    if (dateFrom)                                        params.set('from',   dateFrom);
    if (dateTo && dateTo !== dateFrom)                   params.set('to',     dateTo);
    if (selectedMatch && selectedMatch !== ALL_MATCHES)  params.set('match',  selectedMatch);
    if (selectedPlayer)                                  params.set('player', selectedPlayer);
    const offset = playbackState.currentTime - playbackState.timeRange.min;
    if (offset > 1000) params.set('t', String(Math.round(offset)));
    window.history.replaceState({}, '', params.toString() ? `?${params}` : window.location.pathname);
  }, [selectedMap, dateFrom, dateTo, selectedMatch, selectedPlayer,
      playbackState.isPlaying, playbackState.currentTime, playbackState.timeRange.min]);

  /* All hooks MUST be defined before any early returns */
  const handleMatchChange = useCallback((matchId: string) => {
    setSelectedMatch(matchId);
    setSelectedPlayer(null);
    playbackControls.reset();
  }, [playbackControls]);

  const handleMapChange = useCallback((mapId: string) => {
    setSelectedMap(mapId);
    setSelectedMatch(null);
    setSelectedPlayer(null);
  }, []);

  const handleDateFromChange = useCallback((date: string) => {
    setDateFrom(date);
    setDateTo((prev) => (prev && date > prev ? date : prev));
    setSelectedMatch(null);
    setSelectedPlayer(null);
  }, []);

  const handleDateToChange = useCallback((date: string) => {
    setDateTo(date);
    setSelectedMatch(null);
    setSelectedPlayer(null);
  }, []);

  const handleSaveMoment = useCallback(() => {
    if (!selectedMap || !dateFrom || !selectedMatch || selectedMatch === ALL_MATCHES) return;
    const offset    = playbackState.currentTime - playbackState.timeRange.min;
    const matchNum  = matchList.findIndex((m) => m.match_id === selectedMatch) + 1;
    const nowMs     = Date.now();
    const label     = `Match #${matchNum} · ${
      dateFrom === dateTo ? dateFrom : `${dateFrom} – ${dateTo ?? dateFrom}`
    } · ${new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const momentBase = {
      label,
      map:          selectedMap,
      dateFrom,
      dateTo:       dateTo ?? dateFrom,
      matchId:      selectedMatch,
      scrubberTime: Math.max(0, offset),
      playerId:     selectedPlayer,
      savedAt:      nowMs,
    };

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      fetch(`${SUPABASE_URL}/rest/v1/saved_moments`, {
        method:  'POST',
        headers: supaHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          label:         momentBase.label,
          map:           momentBase.map,
          date_from:     momentBase.dateFrom,
          date_to:       momentBase.dateTo,
          match_id:      momentBase.matchId,
          player_id:     momentBase.playerId,
          scrubber_time: momentBase.scrubberTime,
          saved_at:      momentBase.savedAt,
        }),
      })
        .then((r) => r.json())
        .then((rows: RawMoment[]) => {
          const saved = rows[0] ? rowToMoment(rows[0]) : { ...momentBase, id: nowMs.toString() };
          setSavedMoments((prev) => [saved, ...prev]);
        })
        .catch(() => {
          const fallback: SavedMoment = { ...momentBase, id: nowMs.toString() };
          setSavedMoments((prev) => {
            const next = [fallback, ...prev];
            localStorage.setItem('gods-eye-moments', JSON.stringify(next));
            return next;
          });
        });
    } else {
      const fallback: SavedMoment = { ...momentBase, id: nowMs.toString() };
      setSavedMoments((prev) => {
        const next = [fallback, ...prev];
        localStorage.setItem('gods-eye-moments', JSON.stringify(next));
        return next;
      });
    }
  }, [selectedMap, dateFrom, dateTo, selectedMatch, selectedPlayer,
      playbackState, matchList]);

  const handleDeleteMoment = useCallback((id: string) => {
    setSavedMoments((prev) => prev.filter((m) => m.id !== id));
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      fetch(`${SUPABASE_URL}/rest/v1/saved_moments?id=eq.${id}`, {
        method:  'DELETE',
        headers: supaHeaders(),
      }).catch(() => { /* best-effort */ });
    } else {
      setSavedMoments((prev) => {
        const next = prev.filter((m) => m.id !== id);
        localStorage.setItem('gods-eye-moments', JSON.stringify(next));
        return next;
      });
    }
  }, []);

  const handleRestoreMoment = useCallback((moment: SavedMoment) => {
    setSelectedMap(moment.map);
    setDateFrom(moment.dateFrom);
    setDateTo(moment.dateTo || moment.dateFrom);
    setSelectedMatch(moment.matchId);
    setSelectedPlayer(moment.playerId);
    pendingScrubberRef.current = moment.scrubberTime;
    playbackControls.reset();
  }, [playbackControls]);

  /* Splash */
  if (dbLoading) return <LoadingSplash status={statusLabel(dbStatus)} />;
  if (dbError) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0f172a',
        color: '#fca5a5', textAlign: 'center', padding: 24,
      }}>
        <div>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Analytics engine failed to load</p>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{dbError}</p>
        </div>
      </div>
    );
  }

  const isSingleMatch = selectedMatch && selectedMatch !== ALL_MATCHES;

  /* 3-pane layout */
  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'row',
      background: '#020617', overflow: 'hidden',
    }}>

      {/* Left Pane */}
      <Sidebar
        selectedMap={selectedMap}
        dateFrom={dateFrom}
        dateTo={dateTo}
        selectedMatch={selectedMatch}
        availableMaps={availableMaps}
        availableDates={availableDates}
        matchList={matchList}
        matchListLoading={matchListLoading}
        events={matchData.events}
        onMapChange={handleMapChange}
        onDateFromChange={handleDateFromChange}
        onDateToChange={handleDateToChange}
        onMatchChange={handleMatchChange}
        showHeatPvP={showHeatPvP}
        showHeatPvE={showHeatPvE}
        showHeatStorm={showHeatStorm}
        showHeatTraffic={showHeatTraffic}
        showHeatLoot={showHeatLoot}
        showHeatDropZones={showHeatDropZones}
        showHeatExtraction={showHeatExtraction}
        showPlayerMarkers={showPlayerMarkers}
        onToggleHeatPvP={() => setShowHeatPvP((v) => !v)}
        onToggleHeatPvE={() => setShowHeatPvE((v) => !v)}
        onToggleHeatStorm={() => setShowHeatStorm((v) => !v)}
        onToggleHeatTraffic={() => setShowHeatTraffic((v) => !v)}
        onToggleHeatLoot={() => setShowHeatLoot((v) => !v)}
        onToggleHeatDropZones={() => setShowHeatDropZones((v) => !v)}
        onToggleHeatExtraction={() => setShowHeatExtraction((v) => !v)}
        onTogglePlayerMarkers={() => setShowPlayerMarkers((v) => !v)}
        savedMoments={savedMoments}
        onDeleteMoment={handleDeleteMoment}
        onRestoreMoment={handleRestoreMoment}
      />

      {/* Center Pane */}
      <div style={{
        flex: 1, position: 'relative',
        minWidth: 0, minHeight: 0,
        overflow: 'hidden', background: '#0f172a',
      }}>
        {matchData.loading && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2000,
            background: 'rgba(15,23,42,0.85)', color: '#e2e8f0',
            padding: '8px 14px', borderRadius: 8, fontSize: '0.8rem',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 12, height: 12,
              border: '2px solid #334155', borderTop: '2px solid #38bdf8',
              borderRadius: '50%', display: 'inline-block',
              animation: 'spin 1s linear infinite', flexShrink: 0,
            }} />
            Loading match data…
          </div>
        )}

        {selectedMap ? (
          <MapView
            mapId={selectedMap}
            events={matchData.events}
            currentTime={playbackState.currentTime}
            selectedPlayerId={selectedPlayer}
            showPlayerMarkers={showPlayerMarkers && !!isSingleMatch}
            showHeatPvP={showHeatPvP}
            showHeatPvE={showHeatPvE}
            showHeatStorm={showHeatStorm}
            showHeatTraffic={showHeatTraffic}
            showHeatLoot={showHeatLoot}
            showHeatDropZones={showHeatDropZones}
            showHeatExtraction={showHeatExtraction}
            onPlayerClick={setSelectedPlayer}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#475569' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🗺</div>
              <p style={{ fontSize: 15, marginBottom: 6 }}>Choose a map to start exploring</p>
              <p style={{ fontSize: 12, color: '#334155' }}>Use the controls on the left to select a map and date range</p>
            </div>
          </div>
        )}

        {isSingleMatch && matchData.events.length > 0 && (
          <PlaybackControls
            playbackState={playbackState}
            controls={playbackControls}
            onSaveMoment={handleSaveMoment}
          />
        )}
      </div>

      {/* Right Pane */}
      <ContextInspector
        selectedPlayer={selectedPlayer}
        selectedMatch={selectedMatch}
        events={matchData.events}
        onClearPlayer={() => setSelectedPlayer(null)}
      />

    </div>
  );
}

export default App;

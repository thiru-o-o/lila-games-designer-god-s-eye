/**
 * useMatchData — fetches game events from Parquet via DuckDB-WASM.
 *
 * Accepts a date RANGE (string[]) so events can be loaded across multiple
 * days. DuckDB's read_parquet([...]) unions the files transparently.
 *
 * Sentinel value: matchId = '__all__' → aggregate all matches in the date range.
 */

import { useEffect, useState, useMemo } from 'react';
import { useDuckDB, statusLabel } from './useDuckDB';
import type { QueryResult } from './useDuckDB';

export const ALL_MATCHES = '__all__';

const VALID_EVENTS = [
  'Position', 'BotPosition',
  'Kill', 'Killed',
  'BotKill', 'BotKilled',
  'KilledByStorm', 'Loot',
] as const;
export type EventType = typeof VALID_EVENTS[number];

export interface GameEvent {
  user_id:  string;
  match_id: string;
  map_id:   string;
  x: number;
  y: number;
  z: number;
  ts:     number;
  event:  string;
  is_bot: boolean;
}

export interface MatchData {
  events:        GameEvent[];
  timeRange:     { min: number; max: number };
  uniquePlayers: string[];
  loading:       boolean;
  dbStatusLabel: string;
  error:         string | null;
}

export function useMatchData(
  mapId:   string | null,
  dates:   string[],
  matchId: string | null,
): MatchData {
  const { db, loading: dbLoading, status: dbStatus, error: dbError, query } = useDuckDB();
  const [events,  setEvents]  = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const datesKey = dates.join(',');

  useEffect(() => {
    setEvents([]);
    setError(null);

    if (!db || !mapId || dates.length === 0 || matchId === null || dbLoading) return;

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
    const base = supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/parquets`
      : window.location.origin;
    const fileUrls = dates.map((d) => `'${base}/data/${mapId}/${d}.parquet'`);
    const parquetArg = fileUrls.length === 1
      ? fileUrls[0]
      : `[${fileUrls.join(', ')}]`;

    const isAllMatches = matchId === ALL_MATCHES;
    const matchLabel   = isAllMatches ? 'ALL' : matchId.slice(0, 8) + '…';

    console.log(`[MatchData] Querying ${mapId} / [${datesKey}] match=${matchLabel}`);

    const matchClause = isAllMatches
      ? ''
      : `AND match_id = '${matchId.replace(/'/g, "''")}'`;

    const validList = VALID_EVENTS.map((e) => `'${e}'`).join(', ');

    const sql = `
      WITH decoded AS (
        SELECT
          CAST(user_id  AS VARCHAR) AS user_id,
          CAST(match_id AS VARCHAR) AS match_id,
          CAST(map_id   AS VARCHAR) AS map_id,
          CAST(x AS DOUBLE)        AS x,
          CAST(y AS DOUBLE)        AS y,
          CAST(z AS DOUBLE)        AS z,
          CASE
            WHEN typeof(ts) LIKE 'TIMESTAMP%'
              THEN CAST(epoch(ts) * 1000000.0 AS DOUBLE)
            WHEN CAST(ts AS DOUBLE) > 1e11
              THEN CAST(ts AS DOUBLE)
            ELSE
              CAST(ts AS DOUBLE) * 1000.0
          END                      AS ts,
          CAST(event AS VARCHAR)   AS event
        FROM read_parquet(${parquetArg})
        WHERE TRUE ${matchClause}
      )
      SELECT
        user_id, match_id, map_id,
        x, y, z, ts, event,
        length(user_id) <= 10 AS is_bot
      FROM decoded
      WHERE event IN (${validList})
      ORDER BY ts ASC
    `;

    setLoading(true);

    query(sql)
      .then((result: QueryResult) => {
        const ci = (col: string) => result.columns.indexOf(col);

        const safeNum = (v: unknown): number => {
          if (v instanceof Date)     return v.getTime();
          if (typeof v === 'bigint') return Number(v);
          return Number(v ?? 0);
        };

        const gameEvents: GameEvent[] = result.rows.map((row) => ({
          user_id:  String(row[ci('user_id')]),
          match_id: String(row[ci('match_id')]),
          map_id:   String(row[ci('map_id')]),
          x:        safeNum(row[ci('x')]),
          y:        safeNum(row[ci('y')]),
          z:        safeNum(row[ci('z')]),
          ts:       safeNum(row[ci('ts')]),
          event:    String(row[ci('event')]),
          is_bot:   Boolean(row[ci('is_bot')]),
        }));

        const byType = Object.fromEntries(
          VALID_EVENTS.map((t) => [t, gameEvents.filter((e) => e.event === t).length])
        );
        const tsMin = gameEvents.length ? gameEvents[0].ts : 0;
        const tsMax = gameEvents.length ? gameEvents[gameEvents.length - 1].ts : 0;
        console.log(
          `[MatchData] ✓ ${gameEvents.length} events loaded`,
          byType,
          `| ts range: ${tsMin} – ${tsMax}`,
          `| duration: ${((tsMax - tsMin) / 60000).toFixed(1)} min`,
        );

        setEvents(gameEvents);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[MatchData] Query failed:', err);
        setError(err instanceof Error ? err.message : 'Query failed');
        setLoading(false);
      });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, mapId, datesKey, matchId, dbLoading, query]);

  const timeRange = useMemo(() => {
    if (events.length === 0) return { min: 0, max: 0 };
    let min = Infinity, max = -Infinity;
    for (const e of events) {
      if (e.ts < min) min = e.ts;
      if (e.ts > max) max = e.ts;
    }
    return { min, max };
  }, [events]);

  const uniquePlayers = useMemo(
    () => Array.from(new Set(events.map((e) => e.user_id))).sort(),
    [events],
  );

  return {
    events,
    timeRange,
    uniquePlayers,
    loading:       loading || dbLoading,
    dbStatusLabel: statusLabel(dbStatus),
    error:         error || dbError,
  };
}

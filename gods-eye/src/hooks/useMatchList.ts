/**
 * useMatchList — per-match aggregate stats for the match picker dropdown.
 *
 * Accepts a date RANGE (array of dates) so the dropdown shows matches
 * across multiple days. DuckDB's read_parquet([...]) handles multi-file loading.
 *
 * Extended MatchMeta includes bots, loot, storm deaths, bot kills/deaths,
 * and survival count (players whose last event was not a death).
 */

import { useEffect, useState } from 'react';
import { useDuckDB } from './useDuckDB';
import type { QueryResult } from './useDuckDB';

export interface MatchMeta {
  match_id:       string;
  humans:         number;
  bots:           number;
  pvp_kills:      number;
  bot_kills:      number;
  bot_deaths:     number;
  loot_events:    number;
  storm_deaths:   number;
  survival_count: number;
  duration_ms:    number;
}

export function useMatchList(
  mapId: string | null,
  dates: string[],
): { matches: MatchMeta[]; loading: boolean } {
  const { db, loading: dbLoading, query } = useDuckDB();
  const [matches, setMatches] = useState<MatchMeta[]>([]);
  const [loading, setLoading] = useState(false);

  // Stringify the array to use as a stable effect dependency
  const datesKey = dates.join(',');

  useEffect(() => {
    setMatches([]);
    if (!db || !mapId || dates.length === 0 || dbLoading) return;

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
    const base = supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/parquet`
      : window.location.origin;
    const fileUrls = dates.map((d) => `'${base}/data/${mapId}/${d}.parquet'`);
    const parquetArg = fileUrls.length === 1
      ? fileUrls[0]
      : `[${fileUrls.join(', ')}]`;

    // arg_max(event, ts_ms) returns the event at the latest timestamp — DuckDB ordered aggregate.
    const sql = `
      WITH decoded AS (
        SELECT
          CAST(match_id AS VARCHAR) AS match_id,
          CAST(user_id  AS VARCHAR) AS user_id,
          CAST(event    AS VARCHAR) AS event,
          CASE
            WHEN typeof(ts) LIKE 'TIMESTAMP%'
              THEN CAST(epoch(ts) * 1000000.0 AS DOUBLE)
            WHEN CAST(ts AS DOUBLE) > 1e11
              THEN CAST(ts AS DOUBLE)
            ELSE
              CAST(ts AS DOUBLE) * 1000.0
          END AS ts_ms
        FROM read_parquet(${parquetArg})
      ),
      human_last AS (
        SELECT
          match_id,
          user_id,
          arg_max(event, ts_ms) AS last_event
        FROM decoded
        WHERE length(user_id) > 10
        GROUP BY match_id, user_id
      ),
      survival AS (
        SELECT
          match_id,
          COUNT(DISTINCT user_id)
            FILTER (WHERE last_event NOT IN ('Killed', 'BotKilled', 'KilledByStorm'))
            AS survival_count
        FROM human_last
        GROUP BY match_id
      ),
      agg AS (
        SELECT
          match_id,
          COUNT(DISTINCT user_id) FILTER (WHERE length(user_id) > 10)   AS humans,
          COUNT(DISTINCT user_id) FILTER (WHERE length(user_id) <= 10)  AS bots,
          COUNT(*) FILTER (WHERE event = 'Kill')                         AS pvp_kills,
          COUNT(*) FILTER (WHERE event = 'BotKill')                     AS bot_kills,
          COUNT(*) FILTER (WHERE event = 'BotKilled')                   AS bot_deaths,
          COUNT(*) FILTER (WHERE event = 'Loot')                        AS loot_events,
          COUNT(*) FILTER (WHERE event = 'KilledByStorm')               AS storm_deaths,
          CAST(MAX(ts_ms) - MIN(ts_ms) AS DOUBLE)                       AS duration_ms
        FROM decoded
        GROUP BY match_id
      )
      SELECT
        a.match_id, a.humans, a.bots, a.pvp_kills, a.bot_kills,
        a.bot_deaths, a.loot_events, a.storm_deaths, a.duration_ms,
        COALESCE(s.survival_count, 0) AS survival_count
      FROM agg a
      LEFT JOIN survival s ON a.match_id = s.match_id
      ORDER BY a.match_id
    `;

    console.log(`[MatchList] Querying stats for ${mapId} / [${datesKey}]…`);
    setLoading(true);

    query(sql)
      .then((result: QueryResult) => {
        const ci = (col: string) => result.columns.indexOf(col);

        const safeNum = (v: unknown): number => {
          if (v instanceof Date)     return v.getTime();
          if (typeof v === 'bigint') return Number(v);
          return Number(v ?? 0);
        };

        const metas: MatchMeta[] = result.rows.map((row) => ({
          match_id:       String(row[ci('match_id')]),
          humans:         safeNum(row[ci('humans')]),
          bots:           safeNum(row[ci('bots')]),
          pvp_kills:      safeNum(row[ci('pvp_kills')]),
          bot_kills:      safeNum(row[ci('bot_kills')]),
          bot_deaths:     safeNum(row[ci('bot_deaths')]),
          loot_events:    safeNum(row[ci('loot_events')]),
          storm_deaths:   safeNum(row[ci('storm_deaths')]),
          survival_count: safeNum(row[ci('survival_count')]),
          duration_ms:    safeNum(row[ci('duration_ms')]),
        }));

        console.log(`[MatchList] ✓ ${metas.length} matches across ${dates.length} day(s)`);
        setMatches(metas);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[MatchList] Query failed:', err);
        setLoading(false);
      });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, mapId, datesKey, dbLoading, query]);

  return { matches, loading };
}

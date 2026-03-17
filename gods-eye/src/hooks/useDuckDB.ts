/**
 * DuckDB-WASM hook for querying Parquet files in the browser.
 */

import { useEffect, useState, useCallback } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

let dbInstance: duckdb.AsyncDuckDB | null = null;
let dbLoading = false;

export type DuckDBStatus =
  | 'idle'
  | 'selecting-bundle'
  | 'downloading-wasm'
  | 'initializing-worker'
  | 'ready'
  | 'error';

export interface QueryResult {
  columns: string[];
  rows: any[][];
}

// Status label shown to user
const STATUS_LABELS: Record<DuckDBStatus, string> = {
  idle: 'Waiting…',
  'selecting-bundle': 'Detecting browser capabilities…',
  'downloading-wasm': 'Downloading DuckDB engine (~20 MB)…',
  'initializing-worker': 'Initializing query engine…',
  ready: 'Ready',
  error: 'Error',
};

export function statusLabel(status: DuckDBStatus): string {
  return STATUS_LABELS[status];
}

/**
 * Hook to initialize and use DuckDB-WASM for querying Parquet files.
 */
export function useDuckDB() {
  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DuckDBStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initDuckDB() {
      // Already initialized - reuse
      if (dbInstance) {
        if (!cancelled) {
          setDb(dbInstance);
          setStatus('ready');
          setLoading(false);
        }
        return;
      }

      // Another component is already initializing - poll for completion
      if (dbLoading) {
        if (!cancelled) setStatus('downloading-wasm');
        const checkInterval = setInterval(() => {
          if (dbInstance) {
            clearInterval(checkInterval);
            if (!cancelled) {
              setDb(dbInstance);
              setStatus('ready');
              setLoading(false);
            }
          }
        }, 200);
        return () => clearInterval(checkInterval);
      }

      dbLoading = true;
      setLoading(true);

      const startTime = performance.now();
      try {
        // Step 1 — pick the right WASM bundle for this browser
        if (!cancelled) setStatus('selecting-bundle');
        console.log('[DuckDB] ⏱️  Starting initialization…');
        console.log('[DuckDB] Step 1/3: Selecting bundle for your browser…');
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        const t1 = performance.now();
        console.log(`[DuckDB] ✓ Bundle selected in ${(t1 - startTime).toFixed(0)}ms:`, bundle.mainModule);

        // Step 2 — the WASM file download starts here (tracked via browser DevTools)
        if (!cancelled) setStatus('downloading-wasm');
        console.log('[DuckDB] Step 2/3: Downloading WASM (~20 MB from jsDelivr CDN)…');
        console.log('[DuckDB] 💡 Tip: Check Network tab to see download progress');

        // Step 3 — spin up the worker and instantiate the DB
        if (!cancelled) setStatus('initializing-worker');
        console.log('[DuckDB] Step 3/3: Creating worker thread…');
        const worker = await duckdb.createWorker(bundle.mainWorker!);
        const logger = new duckdb.ConsoleLogger();
        const newDb = new duckdb.AsyncDuckDB(logger, worker);

        const t2 = performance.now();
        console.log(`[DuckDB] Worker created in ${(t2 - t1).toFixed(0)}ms`);
        console.log('[DuckDB] Loading WASM into worker (this may take 5-15 seconds)…');
        await newDb.instantiate(bundle.mainModule, bundle.pthreadWorker);

        const t3 = performance.now();
        const version = await newDb.getVersion();
        const totalTime = ((t3 - startTime) / 1000).toFixed(1);
        console.log(`[DuckDB] ✅ Ready! Total time: ${totalTime}s | Version: ${version}`);

        // Set the singleton OUTSIDE the cancelled guard so the polling branch
        // in any sibling hook instance can detect it (StrictMode double-invoke fix).
        dbInstance = newDb;
        dbLoading = false;
        console.log('[DuckDB] Singleton set — any polling hooks will now resolve');

        if (!cancelled) {
          setDb(newDb);
          setStatus('ready');
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to initialize DuckDB';
        console.error('[DuckDB] Initialization failed:', err);
        if (!cancelled) {
          setError(msg);
          setStatus('error');
          setLoading(false);
        }
      } finally {
        dbLoading = false;
      }
    }

    initDuckDB();
    return () => { cancelled = true; };
  }, []);

  /**
   * Register a Parquet file URL so DuckDB can query it.
   */
  const registerParquetFile = useCallback(
    async (name: string, url: string) => {
      if (!db) throw new Error('DuckDB not initialized');
      console.log(`[DuckDB] Registering file: ${name} → ${url}`);
      try {
        await db.registerFileURL(name, url, duckdb.DuckDBDataProtocol.HTTP, false);
        console.log(`[DuckDB] File registered: ${name}`);
      } catch (err) {
        console.error(`[DuckDB] Failed to register ${name}:`, err);
        throw err;
      }
    },
    [db]
  );

  /**
   * Execute a SQL query and return results as { columns, rows }.
   */
  const query = useCallback(
    async (sql: string, params?: any[]): Promise<QueryResult> => {
      if (!db) throw new Error('DuckDB not initialized');

      const t0 = performance.now();
      console.log('[DuckDB] Query ▶', sql.trim().slice(0, 120));

      try {
        const conn = await db.connect();
        let result;

        if (params && params.length > 0) {
          const stmt = await conn.prepare(sql);
          result = await stmt.query(...params);
        } else {
          result = await conn.query(sql);
        }

        const columns = result.schema.fields.map((f) => f.name);
        const rows: any[][] = [];

        for (let i = 0; i < result.numRows; i++) {
          const row: any[] = [];
          for (const col of columns) {
            const column = result.getChild(col);
            row.push(column ? column.get(i) : null);
          }
          rows.push(row);
        }

        await conn.close();
        console.log(`[DuckDB] Query ✓  ${rows.length} rows in ${(performance.now() - t0).toFixed(1)} ms`);

        return { columns, rows };
      } catch (err) {
        console.error('[DuckDB] Query failed:', err);
        throw err;
      }
    },
    [db]
  );

  return { db, loading, status, error, registerParquetFile, query };
  // Note: registerParquetFile kept for potential future use but
  // useMatchData now uses read_parquet() with absolute URLs directly.
}

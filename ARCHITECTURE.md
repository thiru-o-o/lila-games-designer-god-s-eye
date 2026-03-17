# God's Eye — Architecture Document

God's Eye is a browser-based level-design analytics tool for LILA BLACK.
It lets game designers replay matches frame-by-frame, trace player paths,
and identify dangerous zones and loot hotspots using interactive heatmaps.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Vercel)                                                   │
│                                                                     │
│  React UI ──► DuckDB-WASM ──► Parquet files (HTTPS GET)            │
│     │                              │                                │
│     │ REST API calls               │ public bucket URLs             │
│     ▼                              ▼                                │
│  Supabase Postgres          Supabase Storage                        │
│  (saved_moments)            (parquet/data/*/*.parquet)              │
│                                                                     │
│  ◄── new raw files ──── FastAPI backend (Render) ◄── ETL upload    │
└─────────────────────────────────────────────────────────────────────┘
```

### Services

| Layer | Technology | Hosting | Purpose |
|---|---|---|---|
| Frontend | React + Vite + TypeScript | Vercel | UI, analytics, map rendering |
| Query engine | DuckDB-WASM | In-browser | SQL over Parquet files, zero server load |
| File storage | Supabase Storage | Supabase (free) | Parquet files + metadata.json, served via HTTPS |
| Database | Supabase Postgres | Supabase (free) | `saved_moments` table |
| Backend API | FastAPI + Uvicorn | Render (free) | ETL endpoint for new .nakama-0 uploads |

**Fallback mode** (no Supabase configured): Parquet files are committed to
`gods-eye/public/data/` and served as Vercel static assets. Saved moments
fall back to `localStorage`. The app is fully functional in this mode.

---

## Data Pipeline

### Initial ETL (one-time)

```
player_data/
  February_10/*.nakama-0   ──┐
  February_11/*.nakama-0   ──┤
  February_12/*.nakama-0   ──┤──► scripts/prepare_data.py
  February_13/*.nakama-0   ──┤
  February_14/*.nakama-0   ──┘
        │
        ▼
  gods-eye/public/
    metadata.json
    data/
      AmbroseValley/2026-02-10.parquet
      AmbroseValley/2026-02-11.parquet
      ...
      GrandRift/...
      Lockdown/...
```

The ETL script:
1. Reads all `.nakama-0` files (Apache Parquet format, despite the extension).
2. Decodes the `event` column from bytes → UTF-8 strings.
3. Partitions by `map_id` + `date`, writes per-slice Parquet files.
4. Generates `metadata.json` listing all maps, dates, and match UUIDs.

### Migration to Supabase Storage (one-time)

```
scripts/upload_to_supabase.py
  ─► gods-eye/public/data/**/*.parquet  →  Supabase Storage: parquet/data/*
  ─► gods-eye/public/metadata.json      →  Supabase Storage: parquet/metadata.json
```

Run once after creating the Supabase project:

```bash
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_SERVICE_KEY=<service-role-key>
python scripts/upload_to_supabase.py
```

### Ongoing: new data via API

```
New .nakama-0 file
       │
       ▼  POST /api/upload?date=YYYY-MM-DD
  Render (FastAPI)
       │
       ├─► backend/etl.py — partition by map_id
       │
       ├─► Supabase Storage: data/{map}/{date}.parquet  (upsert)
       └─► Supabase Storage: metadata.json              (merge + upsert)
```

No frontend redeployment needed — the browser reads metadata.json on each
page load and discovers new files automatically.

---

## Frontend Architecture

### 3-Pane Layout

```
┌──────────────────┬────────────────────────┬──────────────────┐
│   Left Pane      │    Center Pane         │   Right Pane     │
│   (Sidebar)      │    (MapView)           │   (Inspector)    │
│                  │                        │                  │
│  Map selector    │  Leaflet map +         │  Match Insights  │
│  Date range      │  Player markers        │  or              │
│  Match picker    │  Heatmap layers        │  Player Profile  │
│  Layer toggles   │  Path polyline         │                  │
│  Saved moments   │  Playback controls     │                  │
└──────────────────┴────────────────────────┴──────────────────┘
```

### State Management (`App.tsx`)

All global state lives in `App.tsx` and flows down as props:

```
App
 ├── selectedMap, dateFrom, dateTo  (filter state)
 ├── selectedMatch, selectedPlayer  (selection state)
 ├── showHeat*, showPlayerMarkers   (layer visibility)
 ├── savedMoments                   (persisted state)
 ├── useMatchList(map, dates)       ─► matchList
 ├── useMatchData(map, dates, match) ─► events, timeRange
 └── usePlayback(timeRange)         ─► currentTime, isPlaying
```

### Key Hooks

| Hook | Input | Output | Where used |
|---|---|---|---|
| `useDuckDB` | — | `db`, `query()`, `status` | All data hooks |
| `useMatchList` | map, dates[] | `MatchMeta[]` | Sidebar dropdown |
| `useMatchData` | map, dates[], matchId | `GameEvent[]`, timeRange | MapView, Inspector |
| `usePlayback` | timeRange | currentTime, controls | PlaybackControls |

### URL State Synchronisation

The app encodes its current view into the URL query string:

```
?map=AmbroseValley&from=2026-02-10&to=2026-02-12&match=<uuid>&player=<uuid>&t=42000
```

`t` is the scrubber offset in milliseconds from match start. Sharing the
URL gives teammates an exact view of the same map moment.

---

## Coordinate System & Map Math

Map images are game-world screenshots with a known origin and pixel scale.
`coordinateMapper.ts` converts world coordinates `(x, z)` → Leaflet pixel
coordinates `[pixel_y, pixel_x]` using:

```typescript
pixel_x = (worldX - origin.x) * scale
pixel_y = (worldZ - origin.z) * scale
// Leaflet expects [lat, lng] which maps to [pixel_y, pixel_x]
leafletCoord = [pixel_y, pixel_x]
```

The map image is overlaid using `L.CRS.Simple` (no geographic projection).

---

## Timestamp Quirk (ETL Bug)

The raw `.nakama-0` files store timestamps as `TIMESTAMP` columns, but the
values inside represent **epoch-seconds**, not the Unix millisecond
convention. When DuckDB reads a `TIMESTAMP` column it interprets values as
microseconds, resulting in dates far in the future.

The SQL workaround in `useMatchData.ts` and `useMatchList.ts`:

```sql
CASE
  WHEN typeof(ts) LIKE 'TIMESTAMP%'
    THEN CAST(epoch(ts) * 1000000.0 AS DOUBLE)  -- re-extract as seconds, convert to µs
  WHEN CAST(ts AS DOUBLE) > 1e11
    THEN CAST(ts AS DOUBLE)                      -- already milliseconds
  ELSE
    CAST(ts AS DOUBLE) * 1000.0                  -- epoch-seconds → milliseconds
END AS ts_ms
```

JavaScript then receives `ts_ms` as a plain `DOUBLE` (not a `BigInt` or
`Date` object), so standard numeric math works.

---

## Saved Moments

A "moment" captures the complete app state at a point in time:

```typescript
interface SavedMoment {
  id:           string;   // UUID (Supabase) or timestamp string (localStorage)
  label:        string;   // human-readable description
  map:          string;
  dateFrom:     string;
  dateTo:       string;
  matchId:      string;
  scrubberTime: number;   // ms offset from match start
  playerId:     string | null;
  savedAt:      number;   // epoch-ms
}
```

**Persistence strategy (with graceful degradation):**

1. If `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set:
   - Load: `GET /rest/v1/saved_moments?order=saved_at.desc`
   - Save: `POST /rest/v1/saved_moments` (Supabase returns the generated UUID)
   - Delete: `DELETE /rest/v1/saved_moments?id=eq.<uuid>`
2. Otherwise: read/write `localStorage` key `gods-eye-moments`.

Moments are **shared across all teammates** when Supabase is configured.

---

## Deployment

### Vercel (Frontend)

The Vercel project root should be set to `gods-eye/`.

Required env vars (Vercel dashboard → Settings → Environment Variables):

```
VITE_SUPABASE_URL       https://<project-id>.supabase.co
VITE_SUPABASE_ANON_KEY  <anon-public-key>
```

`vercel.json` sets `Content-Type: application/octet-stream` and a 1-year
cache header on all `/data/**` paths so Parquet files are served efficiently.

### Render (Backend API)

Create a new **Web Service** on [render.com](https://render.com):
- **Root directory**: `backend`
- **Build command**: `pip install -r requirements.txt`
- **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

Required env vars (Render dashboard → Service → Environment):

```
SUPABASE_URL          https://<project-id>.supabase.co
SUPABASE_SERVICE_KEY  <service-role-key>
```

> The service-role key has admin access — never expose it to the browser.
> The frontend only uses the safe `anon` key.

### Supabase Setup Checklist

1. Create a new project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/001_saved_moments.sql` in the SQL editor.
3. Create a **Storage bucket** named `parquet` with **Public** access.
4. Run the migration script to upload existing files:
   ```bash
   export SUPABASE_URL=https://<project>.supabase.co
   export SUPABASE_SERVICE_KEY=<service-role-key>
   python scripts/upload_to_supabase.py
   ```
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel.
6. Set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in Render.

---

## File Structure

```
player_data/                       (repo root)
├── gods-eye/                      ← Vercel frontend root
│   ├── public/
│   │   ├── data/{map}/{date}.parquet   ← static fallback data
│   │   ├── metadata.json               ← static fallback metadata
│   │   └── minimaps/{Map}.png/jpg
│   ├── src/
│   │   ├── App.tsx                ← global state, routing, layout
│   │   ├── components/
│   │   │   ├── MapView.tsx        ← Leaflet map + heatmaps + path polyline
│   │   │   ├── Sidebar.tsx        ← filter controls + saved moments panel
│   │   │   ├── ContextInspector.tsx ← match insights / player profile
│   │   │   ├── PlaybackControls.tsx ← scrubber, play/pause, save/share
│   │   │   └── PlayerDetails.tsx  ← player stats card
│   │   ├── hooks/
│   │   │   ├── useDuckDB.ts       ← DuckDB-WASM init + query helper
│   │   │   ├── useMatchList.ts    ← match dropdown stats
│   │   │   ├── useMatchData.ts    ← full event stream for a match
│   │   │   └── usePlayback.ts     ← RAF-based scrubber
│   │   └── utils/
│   │       ├── coordinateMapper.ts ← world ↔ pixel coordinate conversion
│   │       ├── formatTime.ts       ← ms → MM:SS
│   │       └── playerUtils.ts      ← bot vs human detection, event categories
│   ├── vercel.json                ← MIME type + cache headers for /data/*
│   └── .env.local.example         ← copy → .env.local, fill in Supabase keys
│
├── backend/                       ← Render API root
│   ├── main.py                    ← FastAPI endpoints
│   ├── etl.py                     ← ETL logic (Parquet → Supabase Storage)
│   ├── requirements.txt
│   ├── render.yaml                ← Render deploy config
│   └── .env.example               ← copy → .env, fill in service-role key
│
├── scripts/
│   ├── prepare_data.py            ← initial ETL: .nakama-0 → public/data/
│   ├── upload_to_supabase.py      ← one-time migration to Supabase Storage
│   └── requirements.txt           ← pandas, pyarrow, requests
│
└── supabase/
    └── migrations/
        └── 001_saved_moments.sql  ← create table + RLS policies
```

---

## Local Development

```bash
# Frontend
cd gods-eye
npm install
npm run dev          # http://localhost:5173

# Backend (optional — only needed for new file uploads)
cd backend
pip install -r requirements.txt
uvicorn main:app --reload   # http://localhost:8000
```

For local backend dev, create `backend/.env` from `.env.example` and fill
in your Supabase credentials.

# God's Eye — Level Design Telemetry Tool

A browser-native analytics platform for LILA BLACK level designers. Load five days of raw match telemetry, replay any match frame-by-frame, cross-overlay seven heatmap layers, trace multiple player paths simultaneously, identify kill-density hotspots, and save annotated moments for team review — all running entirely inside the browser with no analytics server.

**Live demo:** https://lila-games-designer-god-s-eye.vercel.app/
**Repo:** `https://github.com/thiru-o-o/lila-games-designer-god-s-eye/'

---

## What it does

| Feature | Detail |
|---|---|
| **Match playback** | Scrub through any match at 10×/30×/60×/120× speed with a smooth rAF animation loop |
| **7 heatmap layers** | PvP Kill Zones, Bot Encounter Zones, Storm Deaths, Movement Density, Loot Hotspots, Drop Zones, Extraction Corridors — each toggled independently |
| **Multi-player path tracing** | Select 1–6 players from the in-panel roster; each gets a unique palette colour with their dashed path drawn on the map |
| **Match insights panel** | 7 stat cards: Match Timeline, How Players Died, Loot & Combat, Player Outcome, Bot Pressure, Danger Zones — plus a player roster for click-to-select |
| **Danger Zone marker** | Finds the deadliest 100 m grid cell and places a pulsing skull marker on the map with one click |
| **Map navigation controls** | On-screen +/− zoom, fit-to-screen, and directional pad — no scroll or drag required |
| **Saved Moments Library** | Bookmark any playback position, add tags and a description, search across label/description/tags, jump back to any moment |
| **Shareable URL** | Full view state (map, date range, match, selected players, scrubber position) encoded in the URL |
| **Bulk data upload** | Drag-and-drop or multi-select `.nakama-0` files in the Upload panel; server-side ETL merges and publishes the data without a Vercel redeploy |
| **Zero-config local mode** | Works fully without Supabase — static Parquet files in `public/data/` and `localStorage` for moments |

---

## Tech stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Component model maps cleanly to the 3-pane layout; Vite gives fast local iteration |
| Query engine | DuckDB-WASM | SQL over Parquet in the browser — zero backend latency for analytics; handles ~89 K rows in < 200 ms |
| Map rendering | Leaflet 1.9 + `leaflet.heat` | Lightweight; `L.CRS.Simple` works for flat minimap images; refs-based API allows 60 fps playback |
| File storage | Supabase Storage | Public HTTPS bucket — DuckDB HTTPFS reads Parquet files directly without a proxy |
| Database | Supabase Postgres | `saved_moments` table with RLS; shared across the whole team without authentication |
| Backend API | FastAPI (Python) on Render | Python-native ETL (pandas + pyarrow); only involved in the write path for new raw files |

---

## Quickstart — run locally

### Prerequisites
- Node.js 18+
- Python 3.9+ (only if running the backend or ETL scripts)

### 1. Frontend — static mode (no Supabase needed)

The app ships with pre-built Parquet files in `gods-eye/public/data/` and falls back to `localStorage` for saved moments. No credentials required.

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO
cd gods-eye

cp .env.local.example .env.local   # leave all values blank for local static-file mode

npm install
npm run dev                         # → http://localhost:5173
```

### 2. Frontend — Supabase mode (team-shared data and moments)

Fill in `gods-eye/.env.local`:

```env
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
VITE_API_URL=http://localhost:8000   # optional — enables the Upload panel
```

Then `npm run dev` as above.

### 3. Backend API (only needed to ingest new `.nakama-0` files via the Upload panel)

```bash
cd backend
cp .env.example .env               # fill in SUPABASE_URL + SUPABASE_SERVICE_KEY
pip install -r requirements.txt
uvicorn main:app --reload          # → http://localhost:8000
```

Upload new raw files via the Upload panel in the Sidebar (drag-and-drop or multi-select).

### 4. One-time data preparation (already done — only needed when bootstrapping from scratch)

```bash
cd scripts
pip install -r requirements.txt

# Convert .nakama-0 files to Parquet in gods-eye/public/data/
python prepare_data.py

# Upload Parquet files and metadata.json to Supabase Storage
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_SERVICE_KEY=<service-role-key>
python upload_to_supabase.py
```

---

## Environment variables

### Frontend (`gods-eye/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Optional | Supabase project URL. If absent, app reads from `public/data/` and uses `localStorage` |
| `VITE_SUPABASE_ANON_KEY` | Optional | Supabase anon/public key for browser-side Parquet reads and moment CRUD |
| `VITE_API_URL` | Optional | Backend base URL (e.g. `https://your-app.onrender.com`). If absent, the Upload panel is hidden |

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Same Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Service-role key — bypasses RLS for ETL uploads. **Never expose this to the browser.** |

---

## Deployment

### Vercel (frontend)

1. Import the repo. Set **Root Directory** to `gods-eye`.
2. Add env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` in Vercel → Settings → Environment Variables.
3. Deploy.

`vercel.json` already sets `Content-Type: application/octet-stream` and a one-year immutable cache header for all `/data/**` Parquet files.

### Render (backend)

Create a **Web Service** with:
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

### Supabase (one-time setup)

**SQL Editor** — run both migrations in order:

```sql
-- Create the saved_moments table with RLS
-- (paste contents of supabase/migrations/001_saved_moments.sql)

-- Add description + tags columns and update policy
-- (paste contents of supabase/migrations/002_saved_moments_v2.sql)
```

**Storage** — create a public bucket named `parquets`, then run `scripts/upload_to_supabase.py` to seed it with Parquet files and `metadata.json`.

---

## Repo layout

```
player_data/
├── gods-eye/                  Vercel frontend (React + Vite)
│   ├── public/
│   │   ├── metadata.json      fallback metadata (static seed)
│   │   ├── minimaps/          AmbroseValley, GrandRift, Lockdown map images
│   │   └── data/              fallback Parquet files (static seed)
│   └── src/
│       ├── App.tsx            global state hub + 3-pane layout
│       ├── tokens.ts          design token constants (colours, palette)
│       ├── components/        MapView, Sidebar, ContextInspector,
│       │                      MomentsLibrary, PlaybackControls,
│       │                      PlayerDetails, InfoTip
│       ├── hooks/             useDuckDB, useMatchData, useMatchList, usePlayback
│       └── utils/             coordinateMapper, formatTime, playerUtils
│
├── backend/                   Render API — write path only (FastAPI + Python)
│   ├── main.py                REST endpoints (/health, /api/upload, /api/metadata)
│   └── etl.py                 ETL logic (decode, partition, merge, upload)
│
├── scripts/                   One-time data preparation
│   ├── prepare_data.py        .nakama-0 → Parquet partitioned by map+date
│   └── upload_to_supabase.py  Push Parquet files to Supabase Storage
│
├── supabase/migrations/       SQL migration scripts
│   ├── 001_saved_moments.sql
│   └── 002_saved_moments_v2.sql
│
├── README.md                  ← you are here
├── ARCHITECTURE.md            Full system design, data pipeline, and all technical decisions
└── INSIGHTS.md                Ten data-driven game design findings from the telemetry
```

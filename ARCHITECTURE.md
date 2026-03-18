# God's Eye — Architecture

God's Eye is a browser-native level-design analytics platform for LILA BLACK. It transforms raw match telemetry from `.nakama-0` Parquet files into an interactive, queryable, annotatable map tool — letting game designers replay any match frame-by-frame, trace multiple player paths simultaneously, cross-overlay seven heatmap layers, identify kill-density hotspots, and bookmark moments for team review.

---

## 1. The Raw Data

### Source files

Five days of match telemetry (February 10–14, 2026) arrived as files with `.nakama-0` extensions, one or more per day. The files are named with match UUIDs (e.g. `3a4f8c12-…-.nakama-0`). No format documentation was provided.

**The extension is misleading.** `.nakama-0` is not a proprietary binary format — the files are valid Apache Parquet, a Nakama game-server export artifact. `pyarrow.read_table()` opens them without issue.

### Schema

| Column | Parquet type | Meaning |
|---|---|---|
| `user_id` | VARCHAR / BLOB | Player identifier. Human players: UUID v4, 36 chars. Bots: short numeric ID, ≤ 10 chars (e.g. `1440`). |
| `match_id` | VARCHAR / BLOB | UUID grouping all events in one match session. |
| `map_id` | VARCHAR / BLOB | `AmbroseValley`, `GrandRift`, or `Lockdown`. |
| `event` | **BLOB (bytes)** | Event type name stored as raw bytes — not a UTF-8 string. Every SQL query must `CAST(event AS VARCHAR)` before filtering; omitting this silently returns zero rows. |
| `x` | DOUBLE | World-space X (Unity: east/west). |
| `y` | DOUBLE | World-space Y (Unity: altitude — unused in the 2D map view). |
| `z` | DOUBLE | World-space Z (Unity: north/south depth). |
| `ts` | TIMESTAMP | Stores epoch-seconds, not microseconds. DuckDB interprets TIMESTAMP as microseconds, producing dates in year 52,140 CE if read literally. See Section 4. |

### The eight event types

| Event | Who emits it | What it records |
|---|---|---|
| `Position` | Human player | Player position at this moment (movement sample) |
| `BotPosition` | Bot | Bot position at this moment |
| `Kill` | Attacker | "I killed another human player here" |
| `Killed` | Victim | "I was killed by a human player here" |
| `BotKill` | Human | "I killed a bot here" |
| `BotKilled` | Human | "A bot killed me here" |
| `KilledByStorm` | Human | "The storm eliminated me here" |
| `Loot` | Human | "I picked up an item here" |

`Kill` and `Killed` are two sides of the same PvP fight — both land at the same `x, z` coordinates. Never count both as "deaths"; `Killed` counts victim deaths, `Kill` counts kill credits.

### What was absent from the data

| Missing field | How we derived it |
|---|---|
| Explicit match start / end events | `MIN(ts)` and `MAX(ts)` per `match_id` define the match window |
| Extraction events | Last `Position` of players who never received a death event is treated as extraction |
| Bot flag | `length(user_id) <= 10` in SQL; UUID regex in TypeScript — consistent across the stack |
| Map coordinate documentation | Empirically calibrated per map (see Section 5) |
| Round / phase markers | Storm phase inferred from `KilledByStorm` density over match time |
| Player display names | UUID substrings (`id.slice(0,8)…id.slice(-4)`) used throughout the UI |

---

## 2. Product Overview

God's Eye is a **3-pane single-page application** deployed on Vercel. All analytics run inside the browser — no server is involved in reading or querying data.

```
┌────────────────┬─────────────────────────────┬─────────────────┐
│  Left Pane     │       Centre Pane           │   Right Pane    │
│  Sidebar       │       MapView               │ ContextInspector│
│                │                             │ or              │
│ • Map select   │ • Leaflet map               │ MomentsLibrary  │
│ • Date range   │ • Minimap image overlay     │                 │
│ • Match pick   │ • Player dot markers        │ • Player roster │
│ • Quick stats  │ • 7 heatmap layers          │ • Player details│
│ • Heatmap      │ • Multi-player polylines    │ • Match stats   │
│   toggles      │ • Danger zone marker        │ • Danger zones  │
│ • Storm info   │ • Map controls overlay      │                 │
│ • Upload panel │ • Playback bar              │ OR              │
│ • Saved        │                             │ • Moments search│
│   moments      │                             │ • Edit/tag cards│
└────────────────┴─────────────────────────────┴─────────────────┘
```

### Feature inventory

| Feature | What it does |
|---|---|
| **7 heatmap layers** | PvP Kill Zones, Bot Encounter Zones, Storm Deaths, Movement Density, Loot Hotspots, Drop Zones, Extraction Corridors — each independently toggled |
| **Match playback** | Scrub any match at 10×/30×/60×/120× speed; all markers and polylines update per-frame |
| **Multi-player path tracing** | Select 1–6 players from the roster; each gets a unique palette colour (cyan → amber → violet → emerald → red → orange); dashed polylines drawn on the map |
| **Player Roster** | Scrollable list of all human players in a match; click to select/deselect |
| **PlayerDetails cards** | Per selected player: kill count, loot count, survival outcome, total events |
| **Match insights panel** | 7 stat cards: Match Timeline, How Players Died, Loot & Combat, Player Outcome, Bot Pressure, Danger Zones |
| **Danger Zone marker** | Identifies the deadliest 100×100 m kill grid cell; "☠ Mark on map" toggle places a pulsing skull marker directly on the map |
| **Map navigation controls** | On-screen +/− zoom, fit-to-screen, 3×3 directional pad — no scroll/drag required |
| **Saved Moments** | Bookmark any playback position; auto-generated label; add description + tags; shared across team via Supabase |
| **Moments Library** | Full-panel search (label + description + tags), inline description edit, add/remove tag pills, jump-to-moment |
| **Shareable URL** | Full view state (map, date range, match, player selection, scrubber position) encoded in URL query params |
| **Bulk file upload** | Drag-and-drop or multi-select `.nakama-0` files in the UI; ETL runs server-side; no redeploy needed |
| **Offline / zero-config mode** | Works without Supabase — static Parquet files + localStorage |

---

## 3. System Architecture

Five layers, three services.

```
┌─────────────────────────────────────────────────────────────────────┐
│  RAW DATA                                                           │
│  .nakama-0 files (Parquet)  ──►  Python ETL  ──►  Supabase Storage │
│  5 days × 3 maps                 (scripts/ or    parquets/data/    │
│                                   backend/)       {map}/{date}.parq │
│                                                   metadata.json     │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │ HTTPS (public bucket)
┌──────────────────────────────────────▼──────────────────────────────┐
│  BROWSER — Vercel CDN                                               │
│                                                                     │
│  React App (Vite + TypeScript)                                      │
│    │                                                                │
│    ├── DuckDB-WASM  ←  read_parquet([url...]) over HTTPS            │
│    │   SQL queries run in a WebWorker; results → GameEvent[]        │
│    │                                                                │
│    ├── Leaflet map  ←  GameEvent[] filtered by currentTime          │
│    │   markers / heatmaps / polylines rendered imperatively         │
│    │                                                                │
│    └── Supabase REST  ←  saved_moments CRUD (direct, no backend)   │
│        falls back to localStorage if not configured                 │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │ POST /api/upload only
┌──────────────────────────────────────▼──────────────────────────────┐
│  BACKEND — Render (FastAPI / Uvicorn)                               │
│  Write path only. Receives raw files, runs ETL, writes to Storage.  │
│  Uses service-role key. Never involved in reads.                    │
└──────────────────────────────────────┬──────────────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────────────┐
│  SUPABASE                                                           │
│  Storage bucket "parquets"   ←  Parquet files + metadata.json      │
│  Postgres table "saved_moments" ←  bookmarks, tags, descriptions   │
│  RLS: anon SELECT / INSERT / UPDATE / DELETE (team tool, no auth)   │
└─────────────────────────────────────────────────────────────────────┘
```

### Services at a glance

| Layer | Technology | Hosting | Role |
|---|---|---|---|
| Frontend | React 19 + Vite 8 + TypeScript | Vercel | UI, analytics, map rendering |
| Query engine | DuckDB-WASM 1.33 | In-browser WebWorker | SQL over Parquet, zero server cost |
| Map rendering | Leaflet 1.9 + leaflet.heat | In-browser | Interactive map, heatmaps, markers |
| File storage | Supabase Storage | Supabase (free tier) | Parquet files + metadata, served as HTTPS |
| Database | Supabase Postgres | Supabase (free tier) | Saved moments with tags and descriptions |
| Upload API | FastAPI + Uvicorn | Render (free tier) | Incremental ETL for new raw files |

---

## 4. Data Pipeline

### Initial ETL — `scripts/prepare_data.py`

Run once locally to bootstrap the static data in `gods-eye/public/data/`:

```
February_10/*.nakama-0
February_11/*.nakama-0          scripts/prepare_data.py
February_12/*.nakama-0    ──►   • reads each file as Parquet
February_13/*.nakama-0          • decodes event BLOB column → UTF-8
February_14/*.nakama-0          • maps folder name to date (hardcoded):
                                  February_10 → 2026-02-10 … Feb_14 → 2026-02-14
                                • groups by (map_id, date)
                                • writes gods-eye/public/data/{map}/{date}.parquet
                                • generates public/metadata.json
```

`metadata.json` lists every map, every date, and all match UUIDs per map+date. The browser reads this on every page load to know which Parquet files to offer.

### Migration to Supabase — `scripts/upload_to_supabase.py`

Also a one-time script. Uploads all files from `public/data/` to Supabase Storage:

```
public/data/**/*.parquet   ──►   POST /storage/v1/object/parquets/data/{map}/{date}.parquet
public/metadata.json       ──►   POST /storage/v1/object/parquets/metadata.json
```

`ensure_bucket_exists()` creates the `parquets` bucket (public, HTTP-accessible) if it doesn't exist yet. HTTP 409 (already exists) is handled gracefully.

### Ongoing ingestion — `backend/etl.py` via `POST /api/upload`

When new `.nakama-0` files arrive, the Upload Panel in the Sidebar sends them to the FastAPI backend as `multipart/form-data`. No Vercel redeploy is needed — `metadata.json` is re-read by the browser on every page load.

```
New .nakama-0 files (drag-dropped in browser UI)
        │
        ▼  POST /api/upload (multipart)
  FastAPI — backend/main.py
        │
        ▼  etl.py: run_etl()
  1. Read bytes as Parquet (pyarrow)
  2. Decode event BLOB column → UTF-8
  3. Derive date from min(ts):
       Pandas Timestamp → .date()
       numeric > 1e12   → ÷ 1000 (ms → s)
       else             → epoch-seconds directly
  4. Group by map_id
  5. For each map:
       Download existing {map}/{date}.parquet from Supabase (if any)
       pd.concat([existing, new]) + drop_duplicates
       Re-upload merged Parquet with x-upsert: true header
  6. Fetch metadata.json from Supabase
     Union new maps / dates / match_ids (set operations, no duplicates)
     Re-upload updated metadata.json
        │
        ▼  Response to browser:
  { files_processed, files_failed, total_rows,
    maps_updated, dates_updated, errors[] }
```

**Incremental merge safety:** uploading the same file twice produces no duplicates because `drop_duplicates` runs before re-upload. Uploading files from the same day in multiple batches accumulates correctly.

**Upload Panel UX:** Duplicate file detection (same filename already queued) shows a yellow banner that auto-dismisses after 3 seconds. Per-file remove buttons let the user trim the queue before sending. Four upload states (idle / uploading / done / error) each have a distinct colour.

---

## 5. Coordinate System

### The challenge

The Parquet data contains `x` and `z` world-space coordinates in Unity's convention (Y is altitude, unused). The minimap images are 1024×1024 PNG/JPEG files. No documentation was provided on map extents, world origin, or scale.

### Calibration process

We took the first five seconds of `Position` events from a known match (players near their drop points) and rendered them on the image using trial `scale` and `origin` values. We iterated until dots appeared inside map boundaries and distributed sensibly. We cross-validated across multiple matches and days. Each map required its own calibration.

**Results (`coordinateMapper.ts` — `MAP_CONFIGS`):**

| Map | scale | originX | originZ | Notes |
|---|---|---|---|---|
| AmbroseValley | 900 | −370 | −473 | Asymmetric origin — map offset from world zero |
| GrandRift | 581 | −290 | −290 | Smallest world area — players closest together |
| Lockdown | 1000 | −500 | −500 | Largest world area — longest rotation distances |

The `scale` value means "how many world units span the full 1024 pixels." GrandRift at 581 is the most compact arena; Lockdown at 1000 is the most spread-out.

### The UV conversion

```
u = (worldX - originX) / scale          // 0.0 = left edge,  1.0 = right edge
v = (worldZ - originZ) / scale          // 0.0 = bottom edge, 1.0 = top edge

pixelX = u * 1024                        // image x: left → right
pixelY = (1 - v) * 1024                 // image y: flip (image y=0 is top)
```

### Leaflet coordinate mapping

Leaflet's `L.CRS.Simple` places its origin at the **bottom-left** and increases latitude upward. Our PNG image has its origin at the **top-left** with y increasing downward. We cancel both flips:

```
leaflet_lat = 1024 - pixelY  =  v * 1024
leaflet_lng = pixelX         =  u * 1024
```

A Leaflet marker at `[lat, lng]` corresponds exactly to image pixel `[1024 - lat, lng]`.

### Two conversion functions, different rules

`worldToPixel(x, z, mapId)` — used for **event markers**. Clamps UV to `[0, 1]`. A player dying at the map boundary gets a skull icon at the boundary pixel rather than disappearing off-screen.

`worldToLeaflet(x, z, mapId)` — used for **heatmap points**. Returns `null` if UV is more than 5% outside `[0, 1]`. This prevents heatmap intensity from artificially accumulating at image borders when out-of-bounds events are clamped — which would produce false kill-cluster artefacts at the map edges.

---

## 6. The Timestamp Problem

`ts` is declared as `TIMESTAMP` in Parquet metadata. The stored values are epoch-seconds (e.g. `1707570000` for February 10 2026). DuckDB's internal TIMESTAMP representation is microseconds — reading `1707570000` microseconds gives a date in year **52,140 CE**.

This caused every time-ordered query to return a single match spanning 50,000 years.

We wrote a three-way `CASE` expression — identical in both `useMatchData.ts` and `useMatchList.ts` — that normalises `ts` to a plain `DOUBLE` in epoch-milliseconds, regardless of how DuckDB interpreted the Parquet column:

```sql
CASE
  WHEN typeof(ts) LIKE 'TIMESTAMP%'
    THEN CAST(epoch(ts) * 1000000.0 AS DOUBLE)  -- re-extract as seconds, convert to µs
  WHEN CAST(ts AS DOUBLE) > 1e11
    THEN CAST(ts AS DOUBLE)                      -- already in microseconds
  ELSE
    CAST(ts AS DOUBLE) * 1000.0                  -- epoch-seconds → milliseconds
END AS ts
```

JavaScript receives the value as a plain number (epoch-ms). DuckDB sometimes returns 64-bit integers as JavaScript `BigInt`, which breaks arithmetic — a `safeNum()` guard in the query result mapper coerces `BigInt` → `Number`.

---

## 7. Frontend Architecture

### State management — `App.tsx`

All global state lives in `App.tsx` and flows down as props. No external state library.

| State | Type | Purpose |
|---|---|---|
| `selectedMap` | `string \| null` | Which map is currently loaded |
| `dateFrom`, `dateTo` | `string \| null` | Date range (YYYY-MM-DD). Derives `selectedDates[]` |
| `selectedMatch` | `string \| null` | Specific match UUID, or `'__all__'` for aggregate view |
| `selectedPlayers` | `string[]` | Multi-select player IDs; index maps to palette colour |
| `showHeat*` (×7) | `boolean` | Visibility of each heatmap layer |
| `showPlayerMarkers` | `boolean` | Player dot visibility (disabled in all-matches mode) |
| `showDangerZone` | `boolean` | Danger zone skull marker visibility |
| `showMomentsLibrary` | `boolean` | Whether right pane shows MomentsLibrary or ContextInspector |
| `savedMoments` | `SavedMoment[]` | All bookmarks, loaded from Supabase or localStorage |
| `deadliestGrid` | computed | Top 3 kill-density 100m² cells, passed to both MapView and ContextInspector |

`selectedDates[]` is a derived `useMemo` — a contiguous slice of `availableDates[]` between `dateFrom` and `dateTo`. Multiple dates cause DuckDB to union multiple Parquet files.

`deadliestGrid` is computed in App.tsx (not in ContextInspector) so both the right panel display and the MapView marker share the same computed value.

**URL state sync:** Every state change when playback is paused writes `?map=&from=&to=&match=&player=&t=` to `window.history.replaceState`. The `t` param is the scrubber offset in ms from match start. Any view is shareable and deep-linkable.

### Hooks

| Hook | Input | Output |
|---|---|---|
| `useDuckDB` | — | `db`, `query()`, `status`, `error` |
| `useMatchList` | `mapId`, `dates[]` | `MatchMeta[]` with per-match aggregate stats |
| `useMatchData` | `mapId`, `dates[]`, `matchId` | `GameEvent[]`, `timeRange`, `uniquePlayers` |
| `usePlayback` | `timeRange` | `currentTime`, `isPlaying`, controls (`play`, `pause`, `reset`, `setCurrentTime`) |

**`useDuckDB` singleton pattern:** Two module-level variables (`dbInstance`, `dbLoading`) ensure the 20 MB WASM binary is downloaded only once even under React StrictMode's double-invoke. A 200 ms polling interval handles the race where a second hook instance mounts before the first finishes initialising.

**`useMatchData` query:** Loads all 8 event types for the selected map + date range + match. Normalises `ts`, casts all BLOB columns to VARCHAR, derives `is_bot` inline, and orders by `ts ASC`. The `ALL_MATCHES` sentinel (`'__all__'`) omits the `WHERE match_id = ?` clause to load all matches in the date range for aggregate heatmap views.

**`useMatchList` query:** Uses DuckDB's `arg_max(event, ts_ms)` ordered aggregate to find each human player's last event per match, then counts players whose last event was not a death event — that's `survival_count`. Returns: `humans`, `bots`, `pvp_kills`, `bot_kills`, `bot_deaths`, `loot_events`, `storm_deaths`, `survival_count`, `duration_ms`.

**`usePlayback` animation loop:** `requestAnimationFrame` advances `currentTime += realDelta * speedMultiplier`. `SPEED_OPTIONS = [10, 30, 60, 120]` game-ms per real-ms. At 120×, one real second covers 2 minutes of match time. A `useRef` stores current time to avoid stale closures in the rAF callback. rAF pauses automatically when the tab is hidden.

### Component tree

```
App.tsx (state hub)
│
├── Sidebar.tsx (left pane, pure UI)
│   ├── StepBadge / StepLine  — 3-step progress stepper (Map → Dates → Match)
│   ├── map / date / match selectors
│   ├── StatCell ×6  — live event counts (kills, bots, storm, loot, humans, bots)
│   ├── LabelWithTip — section headers with InfoTip
│   ├── ToggleRow ×8 — heatmap + player marker checkboxes with colour dots
│   ├── storm epicentre — avgX/avgZ of KilledByStorm events
│   ├── UploadPanel — drag-drop, file queue, POST /api/upload
│   └── saved moments preview — tag pills, "View all →", overflow button
│
├── MapView.tsx (centre pane, vanilla Leaflet behind refs)
│   ├── L.imageOverlay — minimap PNG/JPEG as background
│   ├── L.layerGroup (markersRef) — player dots, kill squares, loot squares, skulls
│   ├── heatPvPRef / heatPvERef / heatStormRef / heatTrafficRef
│   │   heatLootRef / heatDropZonesRef / heatExtractionRef — 7 independent heat layers
│   ├── polylinesRef (Map<string, L.Polyline>) — one dashed polyline per selected player
│   ├── dangerZoneLayerRef (L.LayerGroup) — pulsing circle + skull marker
│   └── MapControls — React overlay, not a Leaflet layer
│       ├── +/− zoom buttons
│       ├── ⊙ fit-to-screen
│       └── ▲▼◀▶ directional pad
│
├── PlaybackControls.tsx (floating bar at bottom of centre pane)
│   ├── reset / play / pause buttons
│   ├── range input scrubber (CSS gradient fill)
│   ├── speed selector (10×/30×/60×/120×)
│   ├── save moment button (flashes "Saved!")
│   └── copy link button (writes URL to clipboard, flashes "Copied!")
│
└── ContextInspector.tsx OR MomentsLibrary.tsx (right pane, swaps based on showMomentsLibrary)
    │
    ├── ContextInspector.tsx
    │   ├── Player Roster — humanPlayers[] from events, click-to-toggle, palette badges
    │   ├── PlayerDetails.tsx ×N — one per selectedPlayer, accentColor prop for header stripe
    │   │   └── kills, loot count, fate (Eliminated by player/bot/storm or Extracted safely)
    │   ├── Match Timeline card — duration_ms, first_action_ms
    │   ├── How Players Died card — LethalityBar for PvP/bot/storm %
    │   ├── Loot & Combat card — loot count, pvpKills, items-per-kill ratio
    │   ├── Player Outcome card — survival bar (green extracted / red eliminated)
    │   ├── Bot Pressure card — botCount, botKills, botDeaths
    │   └── Danger Zones card — top-3 grid cells, "☠ Mark on map" toggle
    │
    └── MomentsLibrary.tsx
        ├── search input — live filter (label + description + tags)
        ├── moment count display
        └── MomentCard ×N
            ├── label, map, date, relative time
            ├── description textarea (click-to-edit, blur-to-save, uncontrolled)
            ├── tag pills with × remove
            ├── + tag inline input (Enter or blur to save)
            └── ▶ Jump to moment, × Delete
```

### Design token system — `tokens.ts`

All colours in one file. Every component imports from here; no hardcoded hex values in components.

| Token | Value | Usage |
|---|---|---|
| `SURFACE_1` | `#0f172a` | Sidebar background, dark inner-cards on right pane |
| `SURFACE_2` | `#1e293b` | Right pane background, light inner-cards on left pane |
| `BORDER` | `#334155` | All dividers, outlines, input borders |
| `TEXT_PRIMARY` | `#e2e8f0` | Main readable text |
| `TEXT_SECONDARY` | `#94a3b8` | Labels, muted text |
| `TEXT_TERTIARY` | `#475569` | Very faint hints, disabled |
| `ACCENT` | `#38bdf8` | Sky-400 — single interactive colour (buttons, links, active states) |
| `PLAYER_PALETTE` | 6 colours | Cyan, amber, violet, emerald, red, orange — polylines, roster badges, card headers |

The two panes deliberately invert surface levels: the Sidebar uses `SURFACE_1` as background and `SURFACE_2` for its cards; the right pane uses `SURFACE_2` as background and `SURFACE_1` for its cards. Content always appears to float above its container.

---

## 8. The Map Rendering System

MapView uses **vanilla Leaflet behind `useRef`** — not `react-leaflet`. The reason: `react-leaflet` destroys and recreates layers on every React state update. During playback scrubbing (up to 60 state updates per second), every heatmap layer would flicker. With refs and dedicated `useEffect` hooks, each layer only recreates when its specific dependency changes.

`react-leaflet@5` is listed in `package.json` from early evaluation — it is not used.

### Map initialisation

```
useEffect (runs once on mount):
  L.map(el, { crs: L.CRS.Simple, zoomControl: false, preferCanvas: true, … })
  L.imageOverlay(minimapUrl, [[0,0],[1024,1024]])
  L.layerGroup()  ← markersRef
  requestAnimationFrame → map.invalidateSize() + map.fitBounds()
  setMapReady(true)
```

`preferCanvas: true` renders markers as Canvas elements rather than SVG DOM nodes — essential for performance when hundreds of markers are on screen simultaneously.

`zoomControl: false` disables the built-in zoom control (replaced by the custom MapControls overlay).

### Heatmap layers (7 independent effects)

Each layer has its own `useRef` handle and a `useEffect` keyed to `[visibleEvents, show{Layer}, mapReady]`:

| Layer | Events used | Gradient | radius / blur |
|---|---|---|---|
| PvP Kill Zones | Kill, Killed | orange → red | 30 / 20 |
| Bot Encounter | BotKill, BotKilled | yellow → purple | 28 / 18 |
| Storm Deaths | KilledByStorm | blue → cyan | 35 / 25 |
| Movement Density | Position, BotPosition | green → lime | 18 / 12, intensity 0.4 |
| Loot Hotspots | Loot | brown → amber → pale yellow | 25 / 18 |
| Drop Zones | First Position per player (de-duplicated) | dark-blue → sky → pale-blue | 30 / 20 |
| Extraction Corridors | Last Position of non-dying players | dark-green → green → pale-green | 30 / 20 |

The Drop Zone layer uses a `seen: Set<string>` to only take each player's first recorded position event. The Extraction Corridor layer collects the last position of players who never received a death event.

### Event markers

Every frame, `visibleEvents = events.filter(e => e.ts <= currentTime)`. The markers effect finds the latest `Position/BotPosition` per player using a `Map<userId, GameEvent>`, then iterates `visibleEvents` for combat and loot icons.

- Human player dots: blue (`#3b82f6`), 8 px.
- Selected player dots: palette colour, 12 px, glow shadow.
- Unselected when any player is selected: opacity 0.2 (still clickable).
- Kill events: red rotated 12 px square.
- Death events: 💀 emoji icon.
- Loot events: green 10 px square.

Clicking any player dot calls `onPlayerClick(userId)` → `handlePlayerToggle` in App.tsx.

### Multi-player polylines

One `L.Polyline` per selected player, stored in `polylinesRef: Map<string, L.Polyline>`. The effect runs on `[visibleEvents, selectedPlayerIds]`: removes all existing polylines, then for each selected player filters their position events, sorts by `ts`, draws a dashed polyline in their palette colour (weight 2.5, opacity 0.85, `dashArray: '5, 8'`).

### Danger Zone layer

When `showDangerZone` is true and `dangerZone` (top kill-grid cell from App.tsx) is not null, a `L.LayerGroup` is added containing:
- `L.circle` at the grid cell centre: red, dashed, radius 60 Leaflet units, `className: 'danger-zone-ring'` (receives the CSS `dzPulse` animation from `index.css` — opacity 0.6 → 1 → 0.6 over 2 s).
- `L.marker` with a skull `divIcon` and a popup showing coordinate range + elimination count.

---

## 9. The Persistence Layer — Saved Moments

### Data model (`SavedMoment` interface)

```typescript
interface SavedMoment {
  id:           string;          // UUID from Supabase, or epoch-ms string for localStorage
  label:        string;          // auto-generated: "Match #3 · Feb 12 · 14:23"
  map:          string;
  dateFrom:     string;
  dateTo:       string;
  matchId:      string;
  scrubberTime: number;          // ms offset from match start
  playerId:     string | null;   // first selected player at save time (for restore)
  savedAt:      number;          // epoch-ms
  description:  string;          // user-editable (added in migration 002)
  tags:         string[];        // user-editable (added in migration 002)
}
```

### Database schema (Supabase Postgres)

**Migration 001** creates the table with RLS enabled:
```sql
CREATE TABLE saved_moments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL DEFAULT '',
  map           TEXT,  date_from TEXT,  date_to TEXT,
  match_id      TEXT,  player_id TEXT,
  scrubber_time BIGINT DEFAULT 0,
  saved_at      BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
-- RLS: anon_select, anon_insert, anon_delete (all USING true)
```

**Migration 002** extends the table for annotation:
```sql
ALTER TABLE saved_moments
  ADD COLUMN IF NOT EXISTS description TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags        TEXT[]  NOT NULL DEFAULT '{}';
-- Adds anon_update policy
```

### Storage strategy (dual mode)

All moment operations go directly from the browser to Supabase REST — not via the FastAPI backend. This keeps the backend as a pure write path for raw data only.

| Operation | Supabase endpoint | Fallback (no credentials) |
|---|---|---|
| Load | `GET /rest/v1/saved_moments?order=saved_at.desc` | `localStorage.getItem('gods-eye-moments')` |
| Save | `POST /rest/v1/saved_moments` with `Prefer: return=representation` | Append to localStorage array |
| Edit description/tags | `PATCH /rest/v1/saved_moments?id=eq.{id}` | Update localStorage array |
| Delete | `DELETE /rest/v1/saved_moments?id=eq.{id}` | Filter from localStorage array |

`handleEditMoment` does an **optimistic update** first (instant UI response), then fires the PATCH. If the PATCH fails, the UI state is already updated — this is intentional; the tool prioritises responsiveness over strict consistency.

`handleSaveMoment` uses `Prefer: return=representation` to receive the server-generated UUID back from the POST, so the ID in local state matches Supabase rather than the fallback epoch-ms string.

---

## 10. Technical Decisions

| Decision | Alternative considered | Chosen approach | Reason |
|---|---|---|---|
| **Analytics engine** | REST API on FastAPI | DuckDB-WASM in browser | Zero server latency per query; no backend CPU cost; works offline after first load |
| **Parquet partitioning** | Single file per map | Per-map per-date files | Typical view loads ~3–8 K rows instead of 89 K; incremental uploads don't touch existing files |
| **Map library** | react-leaflet, custom Canvas | Vanilla Leaflet behind useRef | react-leaflet destroys layers on every React render — incompatible with 60fps scrubbing |
| **Heatmap plugin** | Custom WebGL shader | leaflet.heat | Renders 89 K points in < 100 ms; no custom shader needed at this data volume |
| **Playback loop** | setInterval | requestAnimationFrame | Pauses when tab hidden; self-corrects for dropped frames via elapsed-time multiplier |
| **Per-frame filtering** | Re-query DuckDB each frame | Client-side `events.filter(e => e.ts <= currentTime)` | DuckDB has ~20 ms minimum latency; synchronous array filter is < 1 ms |
| **Storage provider** | Firebase, custom Postgres+S3 | Supabase | One project for both object storage and Postgres; DuckDB HTTPFS reads Storage URLs directly |
| **Authentication** | OAuth / JWT | Anonymous RLS | Team-internal tool; no PII; shared team moments are the goal |
| **Zero-config mode** | Require Supabase | Static files + localStorage fallback | Evaluators and new team members see a working product without credentials |
| **Tooltip positioning** | `position: absolute` | `position: fixed` via getBoundingClientRect | Both panels scroll — absolute tooltips are clipped by `overflow: auto` ancestors |
| **Coordinate system** | Accept 2D world tile | Empirical per-map calibration | No documentation provided; iteration on first-position events produced accurate mapping |
| **Bot detection** | Explicit flag in schema | `length(user_id) <= 10` heuristic | No flag exists; UUID (36 chars) vs short numeric ID (≤10 chars) is consistent across the full dataset |
| **Timestamp normalisation** | Trust Parquet type declaration | 3-way CASE in SQL | `ts` declared as TIMESTAMP but contains epoch-seconds; DuckDB interprets as year 52,140 CE if read literally |

---

## 11. Deployment

### Vercel (frontend)

Vercel project root: `gods-eye/`. `vercel.json` adds two headers for all `/data/**` paths:
- `Content-Type: application/octet-stream` — prevents browser from trying to render Parquet as HTML.
- `Cache-Control: public, max-age=31536000, immutable` — 1-year cache. Filenames include the date and never change, so immutable caching is safe and eliminates re-downloads.

Environment variables required:
```
VITE_SUPABASE_URL       https://<project-id>.supabase.co
VITE_SUPABASE_ANON_KEY  <anon-public-key>
```

### Render (backend)

Root directory: `backend/`. Build: `pip install -r requirements.txt`. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`.

Environment variables required:
```
SUPABASE_URL          https://<project-id>.supabase.co
SUPABASE_SERVICE_KEY  <service-role-key>   # never in browser
```

The service-role key bypasses RLS — it is used only server-side for ETL uploads.

---

## 12. File Map

```
player_data/                           repo root
│
├── gods-eye/                          Vercel frontend
│   ├── public/
│   │   ├── metadata.json              fallback metadata
│   │   ├── minimaps/                  AmbroseValley_Minimap.png
│   │   │                              GrandRift_Minimap.png
│   │   │                              Lockdown_Minimap.jpg
│   │   └── data/{map}/{date}.parquet  fallback Parquet files
│   │
│   └── src/
│       ├── main.tsx                   entry point (Leaflet CSS import order critical)
│       ├── index.css                  reset, spin/dzPulse animations, dark scrollbar
│       ├── tokens.ts                  SURFACE_1/2, BORDER, TEXT_*, ACCENT, PLAYER_PALETTE
│       │
│       ├── App.tsx                    state hub, URL sync, Supabase REST, layout
│       │
│       ├── components/
│       │   ├── MapView.tsx            Leaflet init, 7 heatmaps, markers, polylines,
│       │   │                          danger zone layer, MapControls overlay
│       │   ├── Sidebar.tsx            stepper, selectors, stats, toggles, upload, moments
│       │   ├── ContextInspector.tsx   player roster, PlayerDetails, 7 stat cards
│       │   ├── MomentsLibrary.tsx     search, inline edit, tag pills, relative time
│       │   ├── PlaybackControls.tsx   scrubber, speed, save, share
│       │   ├── PlayerDetails.tsx      kills, loot, fate, accentColor prop
│       │   └── InfoTip.tsx            fixed-position tooltip (getBoundingClientRect)
│       │
│       ├── hooks/
│       │   ├── useDuckDB.ts           WASM singleton, jsDelivr bundles, query()
│       │   ├── useMatchList.ts        aggregate stats per match (arg_max survival)
│       │   ├── useMatchData.ts        full event stream, ts CASE normalisation
│       │   └── usePlayback.ts         rAF loop, speed multiplier, currTimeRef
│       │
│       └── utils/
│           ├── coordinateMapper.ts    worldToPixel (clamp), worldToLeaflet (reject OOB)
│           ├── formatTime.ts          formatMsToMMSS with NaN/Infinity guards
│           └── playerUtils.ts         UUID regex, EventCategory enum, event helpers
│
├── backend/
│   ├── main.py                        FastAPI: /health, /api/upload, /api/metadata,
│   │                                  /api/moments (GET/POST/DELETE)
│   └── etl.py                         decode_event_column, derive_date_from_df,
│                                      run_etl, upload_bytes_to_supabase
│
├── scripts/
│   ├── prepare_data.py                one-time local ETL (folder → Parquet)
│   └── upload_to_supabase.py          one-time Supabase seed upload
│
└── supabase/migrations/
    ├── 001_saved_moments.sql          CREATE TABLE + anon RLS (select/insert/delete)
    └── 002_saved_moments_v2.sql       ADD description + tags[], ADD anon_update policy
```

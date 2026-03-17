# God's Eye - Level Design Telemetry Tool

A web-based visualization tool for Level Designers to explore player behavior on game maps.

## Features

- **Interactive Map Visualization**: View player movements, kills, deaths, and loot events on minimap images
- **Timeline Playback**: Watch matches unfold over time with adjustable playback speed (1x, 5x, 10x)
- **Heatmap Overlays**: Visualize kill zones, death zones, and high-traffic areas
- **Player Details**: Click on players to see their stats and journey path
- **Filtering**: Filter by map, date, and match
- **Browser-Based**: Uses DuckDB-WASM to query Parquet files directly in the browser

## Tech Stack

- **Frontend**: React (Vite) + TypeScript + TailwindCSS
- **Map Engine**: react-leaflet with L.CRS.Simple
- **Data Engine**: DuckDB-WASM for browser-based SQL queries
- **Visualization**: leaflet.heat for heatmaps, lucide-react for icons

## Setup

### Prerequisites

- Node.js 18+ and npm
- Python 3.9+ (for data preparation script)

### Data Preparation

1. Run the ETL script to process raw Parquet files:

```bash
cd scripts
pip install -r requirements.txt
python prepare_data.py
```

This will:
- Read all `.nakama-0` files from `player_data/February_*/` folders
- Decode event columns from bytes to strings
- Partition data by `map_id` and `date` into `public/data/{map_id}/{date}.parquet`
- Generate `public/metadata.json` with available maps, dates, and matches

### Frontend Setup

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

4. Preview production build:

```bash
npm run preview
```

## Project Structure

```
gods-eye/
├── scripts/
│   └── prepare_data.py          # ETL script
├── public/
│   ├── data/                     # Partitioned Parquet files
│   ├── minimaps/                 # Map images
│   └── metadata.json             # Available maps/dates/matches
├── src/
│   ├── components/
│   │   ├── MapView.tsx           # Leaflet map component
│   │   ├── PlaybackControls.tsx  # Timeline controls
│   │   ├── Sidebar.tsx           # Filters and controls
│   │   └── PlayerDetails.tsx     # Player stats card
│   ├── hooks/
│   │   ├── useDuckDB.ts          # DuckDB-WASM integration
│   │   ├── useMatchData.ts       # Match data queries
│   │   └── usePlayback.ts        # Playback state management
│   ├── utils/
│   │   ├── coordinateMapper.ts   # World-to-pixel conversion
│   │   └── playerUtils.ts        # Player/event utilities
│   ├── App.tsx                   # Main app component
│   └── main.tsx                  # Entry point
└── package.json
```

## Deployment

### Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel`
3. The `vercel.json` configuration ensures Parquet files are served with correct MIME types

### Netlify

1. Install Netlify CLI: `npm i -g netlify-cli`
2. Deploy: `netlify deploy --prod`
3. The `netlify.toml` configuration handles Parquet file headers

### Other Platforms

Ensure that:
- Parquet files in `public/data/` are served with `Content-Type: application/octet-stream`
- Static files are served correctly
- The app is a Single Page Application (SPA) - configure redirects to `index.html` for client-side routing

## Architecture

### Data Flow

```
Raw Parquet Files → Python ETL Script → Partitioned Parquet Files → 
Public Folder → DuckDB-WASM → SQL Queries → React Components → Leaflet Map
```

### Key Components

1. **DuckDB-WASM**: Loads Parquet files from `public/data/` and executes SQL queries in the browser
2. **Coordinate Mapper**: Converts world coordinates (x, z) to minimap pixel coordinates using map-specific configurations
3. **Playback System**: Manages timeline scrubbing and speed control using `requestAnimationFrame`
4. **Map View**: Renders Leaflet map with minimap tiles, markers, paths, and heatmaps

## Trade-offs & Considerations

1. **Browser-based DuckDB**: Enables SQL queries without backend, but requires loading Parquet files into browser memory. Acceptable for ~89K rows partitioned by map/date.

2. **Pre-partitioned Data**: Reduces initial load time - only load data for selected map/date, not all 1,243 files.

3. **L.CRS.Simple**: Perfect for flat minimap images without geographic projection.

4. **Playback Performance**: Filter events client-side by timestamp rather than querying DuckDB on every frame.

5. **Heatmap Calculation**: Pre-aggregate heatmap data in DuckDB queries rather than calculating on-the-fly for better performance.

## License

MIT

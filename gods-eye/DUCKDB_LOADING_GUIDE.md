# DuckDB Loading Guide

## How to Start & Monitor

### 1. Start the Dev Server
The server is already running. Open:
```
http://localhost:5179/
```

If you need to restart:
```bash
cd gods-eye
npm run dev
```

### 2. Open Browser DevTools
**Press `F12` or `Ctrl+Shift+I`** to open DevTools, then:
- Go to the **Console** tab to see detailed logs
- Go to the **Network** tab to see the WASM download progress

### 3. Expected Wait Times

| Phase | Duration | What You'll See |
|-------|----------|-----------------|
| **Selecting bundle** | < 100ms | Console: `[DuckDB] Step 1/3: Selecting bundle...` |
| **Downloading WASM** | **10-60 seconds** ⏰ | Network tab shows `duckdb-*.wasm` downloading (~20 MB) |
| **Initializing worker** | **5-15 seconds** ⏰ | Console: `Loading WASM into worker...` |
| **Total** | **15-75 seconds** | Console: `✅ Ready! Total time: X.Xs` |

### 4. What to Look For in Console

```
[DuckDB] ⏱️  Starting initialization…
[DuckDB] Step 1/3: Selecting bundle for your browser…
[DuckDB] ✓ Bundle selected in 45ms: https://cdn.jsdelivr.net/...
[DuckDB] Step 2/3: Downloading WASM (~20 MB from jsDelivr CDN)…
[DuckDB] 💡 Tip: Check Network tab to see download progress
[DuckDB] Step 3/3: Creating worker thread…
[DuckDB] Worker created in 120ms
[DuckDB] Loading WASM into worker (this may take 5-15 seconds)…
[DuckDB] ✅ Ready! Total time: 12.3s | Version: v0.x.x
```

### 5. Network Tab Monitoring

In the **Network** tab:
- Filter by "WASM" or search for "duckdb"
- You'll see a request to `cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@.../duckdb-*.wasm`
- Watch the progress bar — it's a ~20 MB file
- **First load**: Downloads from CDN (slower, 10-60s depending on connection)
- **Subsequent loads**: Uses browser cache (instant)

### 6. If It's Taking Too Long

- **> 2 minutes**: Check Network tab — is the WASM file stuck?
- **Console errors**: Check for CORS or network errors
- **Hard refresh**: `Ctrl+Shift+R` to clear cache and retry

### 7. Visual Status

The app shows a loading splash screen with status messages:
- "Detecting browser capabilities…"
- "Downloading DuckDB engine (~20 MB)…"
- "Initializing query engine…"
- "Ready" (then the app loads)

---

**Note**: After the first successful load, DuckDB is cached in your browser. Subsequent page loads will be **much faster** (usually < 2 seconds).


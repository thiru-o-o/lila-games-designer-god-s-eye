/**
 * MapView — vanilla Leaflet (no react-leaflet).
 *
 * Heatmap layers:
 *   5a. Player Kill Zones    — Kill + Killed
 *   5b. Bot Encounter Zones  — BotKill + BotKilled
 *   5c. Storm Deaths         — KilledByStorm
 *   5d. Movement Density     — Position + BotPosition
 *   5e. Loot Hotspots        — Loot events
 *   5f. Drop Zones           — First Position per player
 *   5g. Extraction Corridors — Last Position of surviving players
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import L from 'leaflet';
// @ts-ignore - leaflet.heat has no types
import 'leaflet.heat';
import { worldToPixel, worldToLeaflet } from '../utils/coordinateMapper';
import type { GameEvent } from '../hooks/useMatchData';
import { PLAYER_PALETTE } from '../tokens';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const MAP_BOUNDS: L.LatLngBoundsExpression = [[0, 0], [1024, 1024]];

const MINIMAP_NAMES: Record<string, string> = {
  AmbroseValley: 'AmbroseValley_Minimap.png',
  GrandRift:     'GrandRift_Minimap.png',
  Lockdown:      'Lockdown_Minimap.jpg',
};

function minimapUrl(mapId: string): string {
  return `/minimaps/${MINIMAP_NAMES[mapId] ?? MINIMAP_NAMES.AmbroseValley}`;
}

export interface MapViewProps {
  mapId:              string;
  events:             GameEvent[];
  currentTime:        number;
  selectedPlayerIds:  string[];
  showPlayerMarkers:  boolean;
  showHeatPvP:        boolean;
  showHeatPvE:        boolean;
  showHeatStorm:      boolean;
  showHeatTraffic:    boolean;
  showHeatLoot:       boolean;
  showHeatDropZones:  boolean;
  showHeatExtraction: boolean;
  dangerZone:         { gx: number; gz: number; count: number } | null;
  showDangerZone:     boolean;
  onPlayerClick:      (playerId: string) => void;
}

function toLatLng(x: number, z: number, mapId: string): [number, number] {
  const [px, py] = worldToPixel(x, z, mapId);
  return [1024 - py, px];
}

/* ------------------------------------------------------------------ */
/*  MapControls overlay                                                 */
/* ------------------------------------------------------------------ */

const PAN_DELTA = 80;

const CTL_BTN: React.CSSProperties = {
  width: 30, height: 30,
  background: 'rgba(30,41,59,0.9)',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#94a3b8',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 700,
  transition: 'background 0.15s, color 0.15s',
  flexShrink: 0,
};

function MapControls({ mapRef, mapReady }: { mapRef: React.RefObject<L.Map | null>; mapReady: boolean }) {
  if (!mapReady) return null;

  const zoom = (delta: number) => {
    const map = mapRef.current;
    if (map) map.setZoom(map.getZoom() + delta);
  };
  const pan  = (dx: number, dy: number) => mapRef.current?.panBy([dy, dx]);
  const reset = () => mapRef.current?.fitBounds(MAP_BOUNDS, { padding: [10, 10], animate: true });

  const btn = (label: string, onClick: () => void, title?: string) => (
    <button
      style={CTL_BTN}
      onClick={onClick}
      title={title ?? label}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(56,189,248,0.15)';
        (e.currentTarget as HTMLButtonElement).style.color = '#38bdf8';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(30,41,59,0.9)';
        (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{
      position: 'absolute',
      bottom: 88,
      right: 12,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      pointerEvents: 'auto',
    }}>
      {/* Zoom */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {btn('+', () => zoom(1),  'Zoom in')}
        {btn('−', () => zoom(-1), 'Zoom out')}
      </div>

      {/* Reset */}
      <div style={{ marginTop: 2 }}>
        {btn('⊙', reset, 'Fit map to screen')}
      </div>

      {/* Directional pad */}
      <div style={{ display: 'grid', gridTemplateColumns: '30px 30px 30px', gap: 2, marginTop: 2 }}>
        <span />
        {btn('▲', () => pan(0, -PAN_DELTA), 'Pan north')}
        <span />
        {btn('◀', () => pan(-PAN_DELTA, 0), 'Pan west')}
        {btn('·', reset, 'Centre')}
        {btn('▶', () => pan(PAN_DELTA, 0),  'Pan east')}
        <span />
        {btn('▼', () => pan(0, PAN_DELTA),  'Pan south')}
        <span />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function MapView({
  mapId, events, currentTime, selectedPlayerIds,
  showPlayerMarkers, showHeatPvP, showHeatPvE, showHeatStorm, showHeatTraffic,
  showHeatLoot, showHeatDropZones, showHeatExtraction,
  dangerZone, showDangerZone,
  onPlayerClick,
}: MapViewProps) {
  const containerRef       = useRef<HTMLDivElement>(null);
  const mapRef             = useRef<L.Map | null>(null);
  const overlayRef         = useRef<L.ImageOverlay | null>(null);
  const markersRef         = useRef<L.LayerGroup | null>(null);
  const heatPvPRef         = useRef<any>(null);
  const heatPvERef         = useRef<any>(null);
  const heatStormRef       = useRef<any>(null);
  const heatTrafficRef     = useRef<any>(null);
  const heatLootRef        = useRef<any>(null);
  const heatDropZonesRef   = useRef<any>(null);
  const heatExtractionRef  = useRef<any>(null);
  /* Per-player polylines keyed by player ID */
  const polylinesRef       = useRef<Map<string, L.Polyline>>(new Map());
  const dangerZoneLayerRef = useRef<L.LayerGroup | null>(null);

  const [mapReady, setMapReady] = useState(false);

  const visibleEvents = useMemo(
    () => events.filter((e) => e.ts <= currentTime),
    [events, currentTime],
  );

  /* 1. Create the Leaflet map (once per mount) */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      crs: L.CRS.Simple, minZoom: -3, maxZoom: 4,
      zoomSnap: 0.25, zoomControl: false,   // using custom controls instead
      attributionControl: false, preferCanvas: true,
    });

    const overlay = L.imageOverlay(minimapUrl(mapId), MAP_BOUNDS).addTo(map);
    const markers = L.layerGroup().addTo(map);

    map.fitBounds(MAP_BOUNDS, { padding: [0, 0], animate: false });
    map.setMaxBounds(L.latLngBounds([-256, -256], [1280, 1280]));

    mapRef.current     = map;
    overlayRef.current = overlay;
    markersRef.current = markers;

    const raf = requestAnimationFrame(() => {
      map.invalidateSize();
      map.fitBounds(MAP_BOUNDS, { padding: [-1, -1], animate: false });
      setMapReady(true);
    });

    return () => {
      cancelAnimationFrame(raf);
      setMapReady(false);
      map.remove();
      mapRef.current           = null;
      overlayRef.current       = null;
      markersRef.current       = null;
      heatPvPRef.current       = null;
      heatPvERef.current       = null;
      heatStormRef.current     = null;
      heatTrafficRef.current   = null;
      heatLootRef.current      = null;
      heatDropZonesRef.current = null;
      heatExtractionRef.current = null;
      polylinesRef.current.clear();
      dangerZoneLayerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 2. Swap overlay image when map changes */
  useEffect(() => {
    overlayRef.current?.setUrl(minimapUrl(mapId));
    mapRef.current?.fitBounds(MAP_BOUNDS, { padding: [10, 10] });
  }, [mapId]);

  /* 3. Player / event markers */
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;
    group.clearLayers();

    if (showPlayerMarkers) {
      const latest = new Map<string, GameEvent>();
      for (const e of visibleEvents) {
        if (e.event !== 'Position' && e.event !== 'BotPosition') continue;
        const prev = latest.get(e.user_id);
        if (!prev || e.ts > prev.ts) latest.set(e.user_id, e);
      }

      latest.forEach((ev) => {
        const [lat, lng] = toLatLng(ev.x, ev.z, ev.map_id);
        const human      = !ev.is_bot;
        const palIdx     = selectedPlayerIds.indexOf(ev.user_id);
        const isSelected = palIdx >= 0;
        const isFaded    = selectedPlayerIds.length > 0 && !isSelected;

        const dotSize     = isSelected ? 12 : 8;
        const iconSize    = dotSize + 4;
        const dotColor    = isSelected
          ? PLAYER_PALETTE[palIdx % PLAYER_PALETTE.length]
          : (human ? '#3b82f6' : '#6b7280');
        const borderColor = isSelected ? dotColor : '#fff';
        const shadow      = isSelected
          ? `0 0 8px ${dotColor}cc, 0 0 2px #000`
          : '0 0 4px rgba(0,0,0,.6)';

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:${dotSize}px;height:${dotSize}px;background:${dotColor};border-radius:50%;border:2px solid ${borderColor};box-shadow:${shadow}"></div>`,
          iconSize:   [iconSize, iconSize],
          iconAnchor: [iconSize / 2, iconSize / 2],
        });
        L.marker([lat, lng], { icon, opacity: isFaded ? 0.2 : 1 })
          .on('click', () => onPlayerClick(ev.user_id))
          .bindPopup(`${human ? '🧑 Player' : '🤖 Bot'}: ${ev.user_id.slice(0, 8)}`)
          .addTo(group);
      });
    }

    const COMBAT_LOOT = new Set(['Kill', 'Killed', 'BotKill', 'BotKilled', 'KilledByStorm', 'Loot']);
    for (const ev of visibleEvents) {
      if (!COMBAT_LOOT.has(ev.event)) continue;
      const [lat, lng] = toLatLng(ev.x, ev.z, ev.map_id);
      const isFaded    = selectedPlayerIds.length > 0 && !selectedPlayerIds.includes(ev.user_id);

      let html: string;
      let size: [number, number];

      if (ev.event === 'Kill' || ev.event === 'BotKill') {
        html = `<div style="width:12px;height:12px;background:#ef4444;border-radius:2px;transform:rotate(45deg);box-shadow:0 0 4px rgba(239,68,68,.6)"></div>`;
        size = [12, 12];
      } else if (ev.event === 'Killed' || ev.event === 'BotKilled' || ev.event === 'KilledByStorm') {
        html = `<div style="font-size:14px;line-height:1;text-shadow:0 0 4px #000">💀</div>`;
        size = [16, 16];
      } else {
        html = `<div style="width:10px;height:10px;background:#10b981;border-radius:2px;box-shadow:0 0 4px rgba(16,185,129,.6)"></div>`;
        size = [10, 10];
      }

      const icon = L.divIcon({ className: '', html, iconSize: size, iconAnchor: [size[0] / 2, size[1] / 2] });
      L.marker([lat, lng], { icon, opacity: isFaded ? 0.15 : 1 })
        .bindPopup(`${ev.event} — ${ev.user_id.slice(0, 8)}`)
        .addTo(group);
    }
  }, [visibleEvents, showPlayerMarkers, selectedPlayerIds, onPlayerClick]);

  /* 4. Per-player path polylines (one per selected player, each in their palette colour) */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    /* Remove all existing polylines */
    polylinesRef.current.forEach((poly) => map.removeLayer(poly));
    polylinesRef.current.clear();

    selectedPlayerIds.forEach((playerId, idx) => {
      const color = PLAYER_PALETTE[idx % PLAYER_PALETTE.length];
      const pts = visibleEvents
        .filter((e) => e.user_id === playerId && (e.event === 'Position' || e.event === 'BotPosition'))
        .sort((a, b) => a.ts - b.ts)
        .map((e) => toLatLng(e.x, e.z, e.map_id) as L.LatLngTuple);

      if (pts.length > 1) {
        const poly = L.polyline(pts, {
          color, weight: 2.5, opacity: 0.85, dashArray: '5, 8',
        }).addTo(map);
        polylinesRef.current.set(playerId, poly);
      }
    });
  }, [visibleEvents, selectedPlayerIds]);

  /* 5h. Danger Zone marker */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (dangerZoneLayerRef.current) {
      map.removeLayer(dangerZoneLayerRef.current);
      dangerZoneLayerRef.current = null;
    }

    if (!showDangerZone || !dangerZone) return;

    const cx = dangerZone.gx + 50;
    const cz = dangerZone.gz + 50;
    const [lat, lng] = toLatLng(cx, cz, mapId);

    const group = L.layerGroup();

    /* Pulsing circle */
    L.circle([lat, lng], {
      radius: 60,
      color: '#ef4444', weight: 2,
      fillColor: '#ef4444', fillOpacity: 0.12,
      dashArray: '6, 4',
      className: 'danger-zone-ring',
    }).addTo(group);

    /* Skull marker with popup */
    const icon = L.divIcon({
      className: '',
      html: `<div style="font-size:20px;line-height:1;text-shadow:0 0 6px #ef4444,0 0 2px #000;filter:drop-shadow(0 0 4px #ef4444)">☠</div>`,
      iconSize:   [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([lat, lng], { icon })
      .bindPopup(
        `<b style="color:#ef4444">☠ Most Dangerous Zone</b><br/>` +
        `X: ${dangerZone.gx} – ${dangerZone.gx + 100}<br/>` +
        `Z: ${dangerZone.gz} – ${dangerZone.gz + 100}<br/>` +
        `<span style="color:#94a3b8">${dangerZone.count} eliminations</span>`,
        { maxWidth: 200 },
      )
      .addTo(group);

    group.addTo(map);
    dangerZoneLayerRef.current = group;
  }, [showDangerZone, dangerZone, mapId, mapReady]);

  /* Heat-point builders */
  function heatPts(evTypes: Set<string>, intensity: number): [number, number, number][] {
    const pts: [number, number, number][] = [];
    for (const e of events) {
      if (!evTypes.has(e.event)) continue;
      const ll = worldToLeaflet(e.x, e.z, e.map_id);
      if (ll) pts.push([ll[0], ll[1], intensity]);
    }
    return pts;
  }

  function heatPtsDropZones(): [number, number, number][] {
    const seen = new Set<string>();
    const pts: [number, number, number][] = [];
    for (const e of events) {
      if (e.event !== 'Position' && e.event !== 'BotPosition') continue;
      if (seen.has(e.user_id)) continue;
      seen.add(e.user_id);
      const ll = worldToLeaflet(e.x, e.z, e.map_id);
      if (ll) pts.push([ll[0], ll[1], 1]);
    }
    return pts;
  }

  function heatPtsExtraction(): [number, number, number][] {
    const DEATH_EVENTS = new Set(['Killed', 'BotKilled', 'KilledByStorm']);
    const diedPlayers  = new Set(
      events.filter((e) => DEATH_EVENTS.has(e.event)).map((e) => e.user_id),
    );
    const lastPos = new Map<string, GameEvent>();
    for (const e of events) {
      if (e.event !== 'Position' || diedPlayers.has(e.user_id)) continue;
      lastPos.set(e.user_id, e);
    }
    const pts: [number, number, number][] = [];
    for (const e of lastPos.values()) {
      const ll = worldToLeaflet(e.x, e.z, e.map_id);
      if (ll) pts.push([ll[0], ll[1], 1]);
    }
    return pts;
  }

  function makeHeatLayer(
    pts: [number, number, number][],
    opts: { radius: number; blur: number; gradient: Record<string, string> },
  ) {
    return (L as any).heatLayer(pts, { ...opts, maxZoom: 4, minOpacity: 0.4 });
  }

  const mapHasSize = (map: L.Map | null): boolean => {
    if (!map) return false;
    const size = map.getSize();
    return size.x > 0 && size.y > 0;
  };

  /* 5a. Player Kill Zones */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapHasSize(map)) return;
    if (heatPvPRef.current) { map.removeLayer(heatPvPRef.current); heatPvPRef.current = null; }
    if (!showHeatPvP) return;
    const pts = heatPts(new Set(['Kill', 'Killed']), 1);
    if (pts.length) {
      heatPvPRef.current = makeHeatLayer(pts, { radius: 30, blur: 20, gradient: { 0.4: 'orange', 1.0: 'red' } }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, showHeatPvP, mapReady]);

  /* 5b. Bot Encounter Zones */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapHasSize(map)) return;
    if (heatPvERef.current) { map.removeLayer(heatPvERef.current); heatPvERef.current = null; }
    if (!showHeatPvE) return;
    const pts = heatPts(new Set(['BotKill', 'BotKilled']), 1);
    if (pts.length) {
      heatPvERef.current = makeHeatLayer(pts, { radius: 28, blur: 18, gradient: { 0.4: 'yellow', 1.0: 'purple' } }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, showHeatPvE, mapReady]);

  /* 5c. Storm Deaths */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapHasSize(map)) return;
    if (heatStormRef.current) { map.removeLayer(heatStormRef.current); heatStormRef.current = null; }
    if (!showHeatStorm) return;
    const pts = heatPts(new Set(['KilledByStorm']), 1);
    if (pts.length) {
      heatStormRef.current = makeHeatLayer(pts, { radius: 35, blur: 25, gradient: { 0.5: 'blue', 1.0: 'cyan' } }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, showHeatStorm, mapReady]);

  /* 5d. Movement Density */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapHasSize(map)) return;
    if (heatTrafficRef.current) { map.removeLayer(heatTrafficRef.current); heatTrafficRef.current = null; }
    if (!showHeatTraffic) return;
    const pts = heatPts(new Set(['Position', 'BotPosition']), 0.4);
    if (pts.length) {
      heatTrafficRef.current = makeHeatLayer(pts, { radius: 18, blur: 12, gradient: { 0.4: 'green', 1.0: 'lime' } }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, showHeatTraffic, mapReady]);

  /* 5e. Loot Hotspots */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapHasSize(map)) return;
    if (heatLootRef.current) { map.removeLayer(heatLootRef.current); heatLootRef.current = null; }
    if (!showHeatLoot) return;
    const pts = heatPts(new Set(['Loot']), 1);
    if (pts.length) {
      heatLootRef.current = makeHeatLayer(pts, {
        radius: 25, blur: 18,
        gradient: { 0.3: '#78350f', 0.7: '#f59e0b', 1.0: '#fef08a' },
      }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, showHeatLoot, mapReady]);

  /* 5f. Drop Zones */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapHasSize(map)) return;
    if (heatDropZonesRef.current) { map.removeLayer(heatDropZonesRef.current); heatDropZonesRef.current = null; }
    if (!showHeatDropZones) return;
    const pts = heatPtsDropZones();
    if (pts.length) {
      heatDropZonesRef.current = makeHeatLayer(pts, {
        radius: 30, blur: 20,
        gradient: { 0.3: '#0c4a6e', 0.7: '#0ea5e9', 1.0: '#bae6fd' },
      }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, showHeatDropZones, mapReady]);

  /* 5g. Extraction Corridors */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !mapHasSize(map)) return;
    if (heatExtractionRef.current) { map.removeLayer(heatExtractionRef.current); heatExtractionRef.current = null; }
    if (!showHeatExtraction) return;
    const pts = heatPtsExtraction();
    if (pts.length) {
      heatExtractionRef.current = makeHeatLayer(pts, {
        radius: 30, blur: 20,
        gradient: { 0.3: '#052e16', 0.7: '#16a34a', 1.0: '#86efac' },
      }).addTo(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEvents, showHeatExtraction, mapReady]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0, background: '#1a1a2e' }}
      />
      <MapControls mapRef={mapRef} mapReady={mapReady} />
    </div>
  );
}

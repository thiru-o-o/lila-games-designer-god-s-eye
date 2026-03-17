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
  mapId: string;
  events: GameEvent[];
  currentTime: number;
  selectedPlayerId: string | null;
  showPlayerMarkers:  boolean;
  showHeatPvP:        boolean;
  showHeatPvE:        boolean;
  showHeatStorm:      boolean;
  showHeatTraffic:    boolean;
  showHeatLoot:       boolean;
  showHeatDropZones:  boolean;
  showHeatExtraction: boolean;
  onPlayerClick: (playerId: string) => void;
}

function toLatLng(x: number, z: number, mapId: string): [number, number] {
  const [px, py] = worldToPixel(x, z, mapId);
  return [1024 - py, px];
}

export function MapView({
  mapId, events, currentTime, selectedPlayerId,
  showPlayerMarkers, showHeatPvP, showHeatPvE, showHeatStorm, showHeatTraffic,
  showHeatLoot, showHeatDropZones, showHeatExtraction,
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
  const polylineRef        = useRef<L.Polyline | null>(null);

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
      zoomSnap: 0.25, zoomControl: true,
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
      polylineRef.current      = null;
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
        const isSelected = selectedPlayerId === ev.user_id;
        const isFaded    = selectedPlayerId !== null && !isSelected;

        const dotSize     = isSelected ? 12 : 8;
        const iconSize    = dotSize + 4;
        const dotColor    = isSelected ? '#22d3ee' : (human ? '#3b82f6' : '#6b7280');
        const borderColor = isSelected ? '#22d3ee' : '#fff';
        const shadow      = isSelected
          ? '0 0 8px rgba(34,211,238,.9), 0 0 2px #000'
          : '0 0 4px rgba(0,0,0,.6)';

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:${dotSize}px;height:${dotSize}px;background:${dotColor};border-radius:50%;border:2px solid ${borderColor};box-shadow:${shadow}"></div>`,
          iconSize:   [iconSize, iconSize],
          iconAnchor: [iconSize / 2, iconSize / 2],
        });
        L.marker([lat, lng], { icon, opacity: isFaded ? 0.15 : 1 })
          .on('click', () => onPlayerClick(ev.user_id))
          .bindPopup(`${human ? '🧑 Player' : '🤖 Bot'}: ${ev.user_id.slice(0, 8)}`)
          .addTo(group);
      });
    }

    const COMBAT_LOOT = new Set(['Kill', 'Killed', 'BotKill', 'BotKilled', 'KilledByStorm', 'Loot']);
    for (const ev of visibleEvents) {
      if (!COMBAT_LOOT.has(ev.event)) continue;
      const [lat, lng] = toLatLng(ev.x, ev.z, ev.map_id);
      const isFaded    = selectedPlayerId !== null && ev.user_id !== selectedPlayerId;

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
  }, [visibleEvents, showPlayerMarkers, selectedPlayerId, onPlayerClick]);

  /* 4. Player-path polyline */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (polylineRef.current) { map.removeLayer(polylineRef.current); polylineRef.current = null; }
    if (!selectedPlayerId) return;

    const pts = visibleEvents
      .filter((e) => e.user_id === selectedPlayerId && (e.event === 'Position' || e.event === 'BotPosition'))
      .sort((a, b) => a.ts - b.ts)
      .map((e) => toLatLng(e.x, e.z, e.map_id) as L.LatLngTuple);

    if (pts.length > 1) {
      polylineRef.current = L.polyline(pts, {
        color: '#22d3ee', weight: 3, opacity: 0.9, dashArray: '5, 10',
      }).addTo(map);
    }
  }, [visibleEvents, selectedPlayerId]);

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

  /* Drop Zones: first Position event per player (events are sorted ASC) */
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

  /* Extraction Corridors: last Position of players who were never killed */
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

  /* 5f. Drop Zones (first Position per player) */
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

  /* 5g. Extraction Corridors (last Position of surviving players) */
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
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#1a1a2e' }}
    />
  );
}

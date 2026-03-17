/**
 * Coordinate mapping utilities for converting world coordinates to minimap pixel coordinates.
 * Each map has specific scale and origin values for accurate projection.
 */

export interface MapConfig {
  scale: number;
  originX: number;
  originZ: number;
}

export const MAP_CONFIGS: Record<string, MapConfig> = {
  AmbroseValley: {
    scale: 900,
    originX: -370,
    originZ: -473,
  },
  GrandRift: {
    scale: 581,
    originX: -290,
    originZ: -290,
  },
  Lockdown: {
    scale: 1000,
    originX: -500,
    originZ: -500,
  },
};

const MINIMAP_SIZE = 1024;

/**
 * Convert world coordinates (x, z) to minimap pixel coordinates.
 * 
 * @param x - World X coordinate
 * @param z - World Z coordinate
 * @param mapId - Map identifier (AmbroseValley, GrandRift, or Lockdown)
 * @returns [pixel_x, pixel_y] coordinates on the 1024x1024 minimap image
 */
export function worldToPixel(
  x: number,
  z: number,
  mapId: string
): [number, number] {
  const config = MAP_CONFIGS[mapId];
  
  if (!config) {
    console.warn(`Unknown map ID: ${mapId}, using default config`);
    return [0, 0];
  }

  // Step 1: Convert world coords to UV (0-1 range)
  const u = (x - config.originX) / config.scale;
  const v = (z - config.originZ) / config.scale;

  // Step 2: Convert UV to pixel coords (1024x1024 image)
  // Y is flipped because image origin is top-left
  const pixelX = u * MINIMAP_SIZE;
  const pixelY = (1 - v) * MINIMAP_SIZE;

  // Clamp to valid pixel range
  const clampedX = Math.max(0, Math.min(MINIMAP_SIZE - 1, pixelX));
  const clampedY = Math.max(0, Math.min(MINIMAP_SIZE - 1, pixelY));

  return [clampedX, clampedY];
}

/**
 * Check if world coordinates are within the valid bounds for a map.
 */
export function isValidCoordinate(
  x: number,
  z: number,
  mapId: string
): boolean {
  const config = MAP_CONFIGS[mapId];
  if (!config) return false;

  const u = (x - config.originX) / config.scale;
  const v = (z - config.originZ) / config.scale;

  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/**
 * Convert world (x, z) → Leaflet [lat, lng] for L.CRS.Simple with
 * bounds [[0,0],[1024,1024]].
 *
 * Key difference from worldToPixel:
 *  • NO clamping — returns null when the point is outside the map image.
 *    This prevents spurious heat-clusters at the image border caused by
 *    clamped out-of-bounds data.
 *  • Returns Leaflet [lat, lng] directly so the caller never needs to
 *    reason about the y-axis flip.
 *
 * Coordinate derivation:
 *   pixel_x = u * 1024         (left → right)
 *   pixel_y = (1 − v) * 1024  (top → bottom in image space)
 *
 * With L.CRS.Simple and bounds SW=[0,0] NE=[1024,1024]:
 *   - lat increases upward  (lat=1024 = top of screen)
 *   - image pixel_y=0 lives at the TOP of the screen → lat = 1024 − pixel_y
 *
 * So: lat = 1024 − pixel_y = v * 1024
 *     lng = pixel_x         = u * 1024
 */
export function worldToLeaflet(
  x: number,
  z: number,
  mapId: string,
): [number, number] | null {
  const config = MAP_CONFIGS[mapId];
  if (!config) return null;

  const u = (x - config.originX) / config.scale;
  const v = (z - config.originZ) / config.scale;

  // Reject points outside the minimap image (adds a 5% tolerance at each edge)
  if (u < -0.05 || u > 1.05 || v < -0.05 || v > 1.05) return null;

  // Clamp gently to the image area for the final pixel value
  const uC = Math.max(0, Math.min(1, u));
  const vC = Math.max(0, Math.min(1, v));

  const pixel_x = uC * MINIMAP_SIZE;
  const pixel_y = (1 - vC) * MINIMAP_SIZE;

  // Leaflet [lat, lng]:  lat = 1024 − pixel_y  (flips image y → map y)
  return [MINIMAP_SIZE - pixel_y, pixel_x];
}


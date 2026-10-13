import { APPROX_COORD_STEP } from './config'

/**
 * Geo utilities. The spec targets PostGIS (ST_DWithin / ST_Distance); this
 * deployment runs SQLite, so distances use the haversine formula computed in
 * the app layer after a bounding-box pre-filter (see docs/DECISIONS.md).
 */

const EARTH_RADIUS_KM = 6371.0088
const KM_PER_DEG_LAT = 111.32

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLng = (lng2 - lng1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Bounding box around a point for a given radius — cheap SQL pre-filter. */
export function bboxForRadius(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / KM_PER_DEG_LAT
  const cosLat = Math.max(0.01, Math.cos((lat * Math.PI) / 180))
  const dLng = radiusKm / (KM_PER_DEG_LAT * cosLat)
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  }
}

/**
 * Public listings expose coordinates rounded to ~500 m so the general area is
 * visible on the map without revealing the exact pickup point.
 */
export function approxCoords(lat: number, lng: number): { lat: number; lng: number } {
  const s = APPROX_COORD_STEP
  return {
    lat: Math.round(lat / s) * s,
    lng: Math.round(lng / s) * s,
  }
}

/**
 * "Best match" ranking score, documented in docs/DECISIONS.md:
 *   score = 0.6 × (1 − min(distance_km / radius_km, 1))
 *         + 0.4 × clamp(hours_left / 24, 0, 1)
 * When the viewer has no coordinates, only the time component is used
 * (re-normalised to 0..1).
 */
export function bestMatchScore(distanceKm: number | null, hoursLeft: number, radiusKm: number): number {
  const timeComponent = Math.max(0, Math.min(1, hoursLeft / 24))
  if (distanceKm === null) return 0.4 * timeComponent + 0.6 * timeComponent
  const distanceComponent = 1 - Math.min(distanceKm / Math.max(1, radiusKm), 1)
  return 0.6 * distanceComponent + 0.4 * timeComponent
}

export function isValidCoords(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

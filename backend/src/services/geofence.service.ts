export interface LocationInput {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export type LocationVerificationReason =
  | "inside"
  | "outside"
  | "poor_accuracy";

export interface LocationVerificationResult {
  verified: boolean;
  distanceMeters: number;
  accuracy: number;
  reason: LocationVerificationReason;
}

/**
 * Hard ceiling for GPS accuracy (meters). Readings worse than this are never
 * trustworthy regardless of the configured geofence radius, so they are
 * rejected outright instead of being used for a boundary decision.
 */
export const MAX_ALLOWED_ACCURACY_METERS = 500;

const EARTH_RADIUS_METERS = 6371008.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates using the Haversine formula.
 * Accurate for the short distances involved in a school geofence.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/**
 * Verify a reported location against the school geofence on the server.
 *
 * Trust rules:
 * - Accuracy worse than the absolute ceiling is never trusted.
 * - Accuracy worse than the geofence radius makes the position too ambiguous
 *   to place confidently inside the fence, so the user is asked to retry.
 * - Otherwise the exact Haversine distance decides. A reading at the boundary
 *   (distance <= radius) counts as inside, keeping the rule deterministic.
 */
export function verifyLocation(
  input: LocationInput,
  schoolLatitude: number,
  schoolLongitude: number,
  geofenceRadius: number
): LocationVerificationResult {
  const distanceMeters = haversineDistanceMeters(
    input.latitude,
    input.longitude,
    schoolLatitude,
    schoolLongitude
  );

  if (input.accuracy > MAX_ALLOWED_ACCURACY_METERS) {
    return {
      verified: false,
      distanceMeters,
      accuracy: input.accuracy,
      reason: "poor_accuracy"
    };
  }

  if (input.accuracy > geofenceRadius) {
    return {
      verified: false,
      distanceMeters,
      accuracy: input.accuracy,
      reason: "poor_accuracy"
    };
  }

  return {
    verified: distanceMeters <= geofenceRadius,
    distanceMeters,
    accuracy: input.accuracy,
    reason: distanceMeters <= geofenceRadius ? "inside" : "outside"
  };
}
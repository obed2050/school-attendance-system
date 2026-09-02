import {
  haversineDistanceMeters,
  verifyLocation
} from "../src/services/geofence.service";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistanceMeters(-1.9441, 30.0619, -1.9441, 30.0619)).toBe(0);
  });

  it("returns the expected distance for a 1 degree of latitude", () => {
    const meters = haversineDistanceMeters(0, 0, 1, 0);
    expect(meters).toBeGreaterThan(110000);
    expect(meters).toBeLessThan(112000);
  });

  it("returns the expected distance for a 1 degree of longitude at the equator", () => {
    const meters = haversineDistanceMeters(0, 0, 0, 1);
    expect(meters).toBeGreaterThan(110000);
    expect(meters).toBeLessThan(112000);
  });

  it("is symmetric", () => {
    const a = haversineDistanceMeters(-1.9441, 30.0619, 0, 0);
    const b = haversineDistanceMeters(0, 0, -1.9441, 30.0619);
    expect(Math.abs(a - b)).toBeLessThan(0.000001);
  });

  it("is scale-accurate for short distances (100 m north of the centre)", () => {
    const distance = haversineDistanceMeters(-1.9441, 30.0619, -1.94321, 30.0619);
    expect(distance).toBeGreaterThan(98);
    expect(distance).toBeLessThan(102);
  });
});

describe("verifyLocation", () => {
  const SCHOOL_LAT = -1.9441;
  const SCHOOL_LON = 30.0619;
  const RADIUS = 100;

  it("accepts a precise reading inside the radius", () => {
    const result = verifyLocation(
      { latitude: SCHOOL_LAT, longitude: SCHOOL_LON, accuracy: 5 },
      SCHOOL_LAT,
      SCHOOL_LON,
      RADIUS
    );
    expect(result.verified).toBe(true);
    expect(result.reason).toBe("inside");
    expect(result.distanceMeters).toBe(0);
  });

  it("rejects a precise reading outside the radius", () => {
    const result = verifyLocation(
      { latitude: SCHOOL_LAT, longitude: 30.02, accuracy: 5 },
      SCHOOL_LAT,
      SCHOOL_LON,
      RADIUS
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("outside");
    expect(result.distanceMeters).toBeGreaterThan(1000);
  });

  it("treats the boundary as inside (distance <= radius)", () => {
    const distance = haversineDistanceMeters(
      SCHOOL_LAT,
      SCHOOL_LON,
      -1.9431972,
      SCHOOL_LON
    );
    expect(distance).toBeGreaterThan(99);
    expect(distance).toBeLessThan(101);
    const result = verifyLocation(
      { latitude: -1.9431972, longitude: SCHOOL_LON, accuracy: 5 },
      SCHOOL_LAT,
      SCHOOL_LON,
      RADIUS
    );
    expect(result.verified).toBe(distance <= RADIUS);
    expect(result.reason).toBe(distance <= RADIUS ? "inside" : "outside");
  });

  it("rejects accuracy worse than the hard ceiling even when very close", () => {
    const result = verifyLocation(
      { latitude: SCHOOL_LAT, longitude: SCHOOL_LON, accuracy: 600 },
      SCHOOL_LAT,
      SCHOOL_LON,
      RADIUS
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("poor_accuracy");
  });

  it("rejects accuracy worse than the radius as ambiguous", () => {
    const result = verifyLocation(
      { latitude: SCHOOL_LAT, longitude: SCHOOL_LON, accuracy: 150 },
      SCHOOL_LAT,
      SCHOOL_LON,
      RADIUS
    );
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("poor_accuracy");
  });

  it("accepts a precise reading exactly equal to a large radius", () => {
    const largeRadius = 2000000;
    const result = verifyLocation(
      { latitude: 0, longitude: 0, accuracy: 100 },
      0,
      0,
      largeRadius
    );
    expect(result.verified).toBe(true);
    expect(result.reason).toBe("inside");
  });
});
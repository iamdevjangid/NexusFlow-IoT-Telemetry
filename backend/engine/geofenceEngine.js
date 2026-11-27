/**
 * NexusFlow IoT Geospatial Geofence & Boundary Monitor
 * 
 * Provides real-time spatial evaluation for mobile IoT telemetry (fleets, drones, vessels):
 * - Haversine great-circle circular geofence boundary checks
 * - Ray-casting Point-in-Polygon (PIP) arbitrary geospatial perimeter containment
 * - State transition event tracking (ENTER, EXIT, DWELL)
 */

class GeofenceEngine {
  constructor() {
    this.geofences = new Map(); // id -> { id, name, type: 'CIRCLE'|'POLYGON', config }
    this.deviceStates = new Map(); // `${deviceId}::${geofenceId}` -> { isInside: boolean, enteredAt: number }
  }

  /**
   * Register a circular geofence
   * @param {string} id
   * @param {string} name
   * @param {number} latitude - Center latitude in degrees
   * @param {number} longitude - Center longitude in degrees
   * @param {number} radiusMeters - Radius boundary in meters
   */
  addCircularGeofence(id, name, latitude, longitude, radiusMeters) {
    this.geofences.set(id, {
      id,
      name,
      type: 'CIRCLE',
      center: { latitude, longitude },
      radiusMeters
    });
  }

  /**
   * Register a polygonal perimeter geofence
   * @param {string} id
   * @param {string} name
   * @param {Array<[number, number]>} coordinates - Array of [lat, lng] vertices forming closed polygon
   */
  addPolygonGeofence(id, name, coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 3) {
      throw new Error('Polygon geofence requires at least 3 vertices');
    }
    this.geofences.set(id, {
      id,
      name,
      type: 'POLYGON',
      coordinates
    });
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   * @returns {number} Distance in meters
   */
  static haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg) => (deg * Math.PI) / 180.0;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Ray-casting point-in-polygon containment test
   * @param {number} lat
   * @param {number} lon
   * @param {Array<[number, number]>} polygon - Array of [lat, lon]
   * @returns {boolean}
   */
  static isPointInPolygon(lat, lon, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > lon) !== (yj > lon)) &&
        (lat < (xj - xi) * (lon - yi) / (yj - yi || 0.00000001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /**
   * Evaluate a device's current GPS position against all registered geofences
   * @param {string} deviceId
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Array<Object>} List of geofence statuses and transition events
   */
  evaluatePosition(deviceId, latitude, longitude) {
    const results = [];
    const now = Date.now();

    for (const [geofenceId, gf] of this.geofences.entries()) {
      let isInside = false;
      let distanceMeters = null;

      if (gf.type === 'CIRCLE') {
        distanceMeters = GeofenceEngine.haversineDistanceMeters(
          latitude, longitude,
          gf.center.latitude, gf.center.longitude
        );
        isInside = distanceMeters <= gf.radiusMeters;
      } else if (gf.type === 'POLYGON') {
        isInside = GeofenceEngine.isPointInPolygon(latitude, longitude, gf.coordinates);
      }

      const stateKey = `${deviceId}::${geofenceId}`;
      const prevState = this.deviceStates.get(stateKey);

      let transition = 'NONE';
      if (!prevState) {
        transition = isInside ? 'INITIAL_INSIDE' : 'INITIAL_OUTSIDE';
        this.deviceStates.set(stateKey, { isInside, enteredAt: isInside ? now : null });
      } else if (!prevState.isInside && isInside) {
        transition = 'ENTER';
        prevState.isInside = true;
        prevState.enteredAt = now;
      } else if (prevState.isInside && !isInside) {
        transition = 'EXIT';
        prevState.isInside = false;
        prevState.enteredAt = null;
      }

      results.push({
        geofenceId,
        name: gf.name,
        type: gf.type,
        isInside,
        transition,
        distanceMeters: distanceMeters ? parseFloat(distanceMeters.toFixed(1)) : null,
        timestamp: now
      });
    }

    return results;
  }

  getGeofences() {
    return Array.from(this.geofences.values());
  }

  removeGeofence(id) {
    return this.geofences.delete(id);
  }
}

module.exports = { GeofenceEngine };

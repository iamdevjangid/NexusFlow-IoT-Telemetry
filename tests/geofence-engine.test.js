const test = require('node:test');
const assert = require('node:assert/strict');
const { GeofenceEngine } = require('../backend/engine/geofenceEngine');

test('GeofenceEngine - calculates accurate Haversine distance in meters', () => {
  // New Delhi to Connaught Place (~1.5 km)
  const dist = GeofenceEngine.haversineDistanceMeters(28.6139, 77.2090, 28.6315, 77.2167);
  assert.ok(dist > 1800 && dist < 2200, `Expected ~2000m, got ${dist}`);
});

test('GeofenceEngine - detects circular boundary containment and transitions', () => {
  const engine = new GeofenceEngine();
  engine.addCircularGeofence('gf_airport', 'IGI Airport Exclusion Zone', 28.5562, 77.1000, 5000); // 5km radius

  // Inside airport perimeter (~100m away)
  const pos1 = engine.evaluatePosition('drone_alpha', 28.5570, 77.1005);
  assert.equal(pos1.length, 1);
  assert.equal(pos1[0].isInside, true);
  assert.equal(pos1[0].transition, 'INITIAL_INSIDE');

  // Moves 10km away -> outside boundary
  const pos2 = engine.evaluatePosition('drone_alpha', 28.6500, 77.1000);
  assert.equal(pos2[0].isInside, false);
  assert.equal(pos2[0].transition, 'EXIT');

  // Returns back inside -> ENTER transition
  const pos3 = engine.evaluatePosition('drone_alpha', 28.5562, 77.1000);
  assert.equal(pos3[0].isInside, true);
  assert.equal(pos3[0].transition, 'ENTER');
});

test('GeofenceEngine - evaluates arbitrary polygon perimeter containment', () => {
  const engine = new GeofenceEngine();
  // Triangular polygon
  const triangle = [
    [0, 0],
    [10, 0],
    [5, 10]
  ];
  engine.addPolygonGeofence('gf_sector_7', 'Restricted Airspace Sector', triangle);

  // Point inside (5, 3)
  const inside = engine.evaluatePosition('uav_01', 5, 3);
  assert.equal(inside[0].isInside, true);

  // Point outside (12, 12)
  const outside = engine.evaluatePosition('uav_01', 12, 12);
  assert.equal(outside[0].isInside, false);
});

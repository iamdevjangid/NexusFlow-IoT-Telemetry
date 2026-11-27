const test = require('node:test');
const assert = require('node:assert/strict');
const { SpatialGridIndex } = require('../backend/engine/spatialIndex');

test('SpatialGridIndex - indexes bounding boxes and retrieves matching point candidates', () => {
  const index = new SpatialGridIndex(0.1);

  // Sector Alpha: Lat [28.5, 28.7], Lng [77.1, 77.3]
  index.insert('sector_alpha', 28.5, 28.7, 77.1, 77.3, { name: 'Alpha' });
  // Sector Beta: Lat [19.0, 19.2], Lng [72.8, 73.0]
  index.insert('sector_beta', 19.0, 19.2, 72.8, 73.0, { name: 'Beta' });

  // Point in Alpha
  const matchesAlpha = index.queryPoint(28.6, 77.2);
  assert.equal(matchesAlpha.length, 1);
  assert.equal(matchesAlpha[0].id, 'sector_alpha');

  // Point in Beta
  const matchesBeta = index.queryPoint(19.1, 72.9);
  assert.equal(matchesBeta.length, 1);
  assert.equal(matchesBeta[0].id, 'sector_beta');

  // Point in empty region
  const matchesEmpty = index.queryPoint(0.0, 0.0);
  assert.equal(matchesEmpty.length, 0);
});

/**
 * NexusFlow IoT 2D Spatial Grid Index
 * 
 * Partitions geospatial coordinates into uniform grid bins to accelerate
 * point-in-polygon and distance queries from O(N) to O(1) expected time.
 */

class SpatialGridIndex {
  /**
   * @param {number} [cellSizeDegrees=0.05] - Spatial grid bucket resolution in degrees (~5.5km)
   */
  constructor(cellSizeDegrees = 0.05) {
    this.cellSize = cellSizeDegrees;
    this.grid = new Map(); // `gridX:gridY` -> Set of item IDs
    this.items = new Map(); // id -> { id, bounds: { minLat, maxLat, minLng, maxLng }, data }
  }

  _hash(lat, lng) {
    const gx = Math.floor(lat / this.cellSize);
    const gy = Math.floor(lng / this.cellSize);
    return `${gx}:${gy}`;
  }

  /**
   * Insert an item with bounding box
   */
  insert(id, minLat, maxLat, minLng, maxLng, data = {}) {
    this.items.set(id, { id, bounds: { minLat, maxLat, minLng, maxLng }, data });

    const minGx = Math.floor(minLat / this.cellSize);
    const maxGx = Math.floor(maxLat / this.cellSize);
    const minGy = Math.floor(minLng / this.cellSize);
    const maxGy = Math.floor(maxLng / this.cellSize);

    for (let x = minGx; x <= maxGx; x++) {
      for (let y = minGy; y <= maxGy; y++) {
        const key = `${x}:${y}`;
        if (!this.grid.has(key)) {
          this.grid.set(key, new Set());
        }
        this.grid.get(key).add(id);
      }
    }
  }

  /**
   * Query candidate items that overlap a coordinate point
   * @param {number} lat
   * @param {number} lng
   * @returns {Array<Object>} List of candidate item records
   */
  queryPoint(lat, lng) {
    const key = this._hash(lat, lng);
    const candidateIds = this.grid.get(key);
    if (!candidateIds || candidateIds.size === 0) return [];

    const matches = [];
    for (const id of candidateIds) {
      const item = this.items.get(id);
      if (item &&
          lat >= item.bounds.minLat && lat <= item.bounds.maxLat &&
          lng >= item.bounds.minLng && lng <= item.bounds.maxLng) {
        matches.push(item);
      }
    }
    return matches;
  }

  clear() {
    this.grid.clear();
    this.items.clear();
  }
}

module.exports = { SpatialGridIndex };

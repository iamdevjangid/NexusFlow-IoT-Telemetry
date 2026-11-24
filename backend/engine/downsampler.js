/**
 * NexusFlow IoT Time-Series Downsampler & LTTB Decimation Engine
 * 
 * Implements high-fidelity data decimation algorithms for high-frequency IoT streams:
 * - Largest Triangle Three Buckets (LTTB): Downsamples while preserving peaks, valleys, and waveform envelope
 * - Min-Max Decimation: Preserves signal extrema for fast oscilloscope rendering
 * - Time-Bucket Statistical Aggregation: Downsamples into fixed chronological buckets (min, max, avg)
 */

class Downsampler {
  /**
   * Largest Triangle Three Buckets (LTTB) algorithm
   * Preserves visual fidelity and outlier peaks when reducing sample density.
   * 
   * @param {Array<{timestamp: number, value: number}>} data - Chronologically ordered data points
   * @param {number} threshold - Target number of points to output (must be >= 2)
   * @returns {Array<{timestamp: number, value: number}>}
   */
  static lttb(data, threshold) {
    if (!Array.isArray(data)) {
      throw new TypeError('Data must be an array of points');
    }
    const dataLen = data.length;
    if (threshold >= dataLen || threshold <= 0) {
      return [...data];
    }
    if (threshold === 1) {
      return [data[0]];
    }
    if (threshold === 2) {
      return [data[0], data[dataLen - 1]];
    }

    const sampled = [];
    let sampledIndex = 0;

    // Bucket size. Leave room for start and end data points
    const every = (dataLen - 2) / (threshold - 2);

    let a = 0; // Initially point a is the first point
    sampled[sampledIndex++] = data[a];

    for (let i = 0; i < threshold - 2; i++) {
      // Calculate point average for the next bucket (bucket c)
      let avgX = 0;
      let avgY = 0;
      let avgRangeStart = Math.floor((i + 1) * every) + 1;
      let avgRangeEnd = Math.floor((i + 2) * every) + 1;
      avgRangeEnd = avgRangeEnd < dataLen ? avgRangeEnd : dataLen;

      const avgRangeLength = avgRangeEnd - avgRangeStart;

      for (let j = avgRangeStart; j < avgRangeEnd; j++) {
        avgX += data[j].timestamp;
        avgY += data[j].value;
      }
      avgX /= (avgRangeLength || 1);
      avgY /= (avgRangeLength || 1);

      // Get the range for this bucket (bucket b)
      let rangeOffs = Math.floor(i * every) + 1;
      const rangeTo = Math.floor((i + 1) * every) + 1;

      // Point a
      const pointAX = data[a].timestamp;
      const pointAY = data[a].value;

      let maxArea = -1;
      let nextA = rangeOffs;

      for (; rangeOffs < rangeTo; rangeOffs++) {
        // Calculate triangle area over points a, candidate point b, and bucket c average
        const area = Math.abs(
          (pointAX - avgX) * (data[rangeOffs].value - pointAY) -
          (pointAX - data[rangeOffs].timestamp) * (avgY - pointAY)
        ) * 0.5;

        if (area > maxArea) {
          maxArea = area;
          nextA = rangeOffs;
        }
      }

      sampled[sampledIndex++] = data[nextA];
      a = nextA; // Current bucket selected point becomes next a
    }

    // Always include the last point
    sampled[sampledIndex++] = data[dataLen - 1];

    return sampled;
  }

  /**
   * Min-Max Peak Decimation
   * Splits data into chunks of size `chunkSize`, emitting the min and max point of each chunk.
   * 
   * @param {Array<{timestamp: number, value: number}>} data 
   * @param {number} chunkSize 
   * @returns {Array<{timestamp: number, value: number}>}
   */
  static minMax(data, chunkSize = 10) {
    if (!Array.isArray(data) || data.length === 0) return [];
    if (chunkSize <= 1) return [...data];

    const result = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize);
      let minPt = chunk[0];
      let maxPt = chunk[0];

      for (let j = 1; j < chunk.length; j++) {
        if (chunk[j].value < minPt.value) minPt = chunk[j];
        if (chunk[j].value > maxPt.value) maxPt = chunk[j];
      }

      // Preserve chronological order of min and max
      if (minPt.timestamp <= maxPt.timestamp) {
        result.push(minPt);
        if (minPt !== maxPt) result.push(maxPt);
      } else {
        result.push(maxPt);
        if (minPt !== maxPt) result.push(minPt);
      }
    }
    return result;
  }

  /**
   * Fixed time-bucket statistical aggregation
   * 
   * @param {Array<{timestamp: number, value: number}>} data 
   * @param {number} bucketDurationMs - Duration of each time window in milliseconds
   * @returns {Array<{bucketStart: number, count: number, min: number, max: number, avg: number}>}
   */
  static timeAggregate(data, bucketDurationMs = 60000) {
    if (!Array.isArray(data) || data.length === 0) return [];
    if (bucketDurationMs <= 0) throw new Error('bucketDurationMs must be positive');

    const buckets = new Map(); // bucketStart -> array of values

    for (const pt of data) {
      const bucketStart = Math.floor(pt.timestamp / bucketDurationMs) * bucketDurationMs;
      if (!buckets.has(bucketStart)) {
        buckets.set(bucketStart, []);
      }
      buckets.get(bucketStart).push(pt.value);
    }

    const aggregated = [];
    for (const [start, vals] of buckets.entries()) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const sum = vals.reduce((acc, v) => acc + v, 0);
      aggregated.push({
        bucketStart: start,
        count: vals.length,
        min,
        max,
        avg: parseFloat((sum / vals.length).toFixed(3))
      });
    }

    return aggregated.sort((a, b) => a.bucketStart - b.bucketStart);
  }
}

module.exports = { Downsampler };

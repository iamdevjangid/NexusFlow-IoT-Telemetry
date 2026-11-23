/**
 * NexusFlow IoT Statistical Anomaly Detector
 * 
 * Provides real-time statistical anomaly detection over streaming telemetry using:
 * - Welford's algorithm for single-pass online mean and variance calculation O(1)
 * - Dynamic Z-Score outlier evaluation
 * - Median Absolute Deviation (MAD) robust estimator for non-Gaussian distributions
 */

class WelfordAccumulator {
  constructor() {
    this.count = 0;
    this.mean = 0.0;
    this.M2 = 0.0; // Sum of squared differences from the mean
  }

  /**
   * Update accumulator with a new value in O(1) time and memory
   */
  update(x) {
    this.count += 1;
    const delta = x - this.mean;
    this.mean += delta / this.count;
    const delta2 = x - this.mean;
    this.M2 += delta * delta2;
  }

  getVariance() {
    return this.count > 1 ? this.M2 / (this.count - 1) : 0.0;
  }

  getStdDev() {
    return Math.sqrt(this.getVariance());
  }

  reset() {
    this.count = 0;
    this.mean = 0.0;
    this.M2 = 0.0;
  }
}

class StatisticalAnomalyDetector {
  /**
   * @param {Object} [options]
   * @param {number} [options.zThreshold=3.0] - Z-Score threshold for anomaly triggering (default: 3 sigma)
   * @param {number} [options.minSamples=10] - Minimum baseline samples required before evaluating anomalies
   * @param {number} [options.windowSize=100] - Rolling window buffer size for MAD calculation
   */
  constructor(options = {}) {
    this.zThreshold = options.zThreshold ?? 3.0;
    this.minSamples = options.minSamples ?? 10;
    this.windowSize = options.windowSize ?? 100;
    this.accumulators = new Map(); // key -> WelfordAccumulator
    this.slidingWindows = new Map(); // key -> Array of recent numbers
  }

  _getKey(deviceId, metric) {
    return `${deviceId}::${metric}`;
  }

  /**
   * Evaluate an incoming reading for statistical anomaly
   * @param {string} deviceId
   * @param {string} metric
   * @param {number} value
   * @returns {Object} Anomaly evaluation report
   */
  evaluate(deviceId, metric, value) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new TypeError(`Value must be a valid number, received: ${value}`);
    }

    const key = this._getKey(deviceId, metric);

    if (!this.accumulators.has(key)) {
      this.accumulators.set(key, new WelfordAccumulator());
      this.slidingWindows.set(key, []);
    }

    const acc = this.accumulators.get(key);
    const window = this.slidingWindows.get(key);

    const prevCount = acc.count;
    const prevMean = acc.mean;
    const prevStdDev = acc.getStdDev();

    // Update state
    acc.update(value);
    window.push(value);
    if (window.length > this.windowSize) {
      window.shift();
    }

    // If not enough baseline samples, treat as warm-up learning phase
    if (prevCount < this.minSamples || prevStdDev === 0) {
      return {
        isAnomaly: false,
        status: 'LEARNING',
        sampleCount: acc.count,
        value,
        mean: acc.mean,
        stdDev: acc.getStdDev(),
        zScore: 0.0
      };
    }

    // Compute Z-score against established running distribution
    const zScore = Math.abs((value - prevMean) / prevStdDev);
    const isAnomaly = zScore >= this.zThreshold;

    return {
      isAnomaly,
      status: isAnomaly ? 'ANOMALY_DETECTED' : 'NOMINAL',
      sampleCount: acc.count,
      value,
      mean: parseFloat(prevMean.toFixed(3)),
      stdDev: parseFloat(prevStdDev.toFixed(3)),
      zScore: parseFloat(zScore.toFixed(2)),
      threshold: this.zThreshold
    };
  }

  /**
   * Calculate Median Absolute Deviation (MAD) over current window
   */
  calculateMAD(deviceId, metric) {
    const key = this._getKey(deviceId, metric);
    const window = this.slidingWindows.get(key);
    if (!window || window.length === 0) return 0;

    const sorted = [...window].sort((a, b) => a - b);
    const median = this._median(sorted);
    const absDeviations = sorted.map(v => Math.abs(v - median)).sort((a, b) => a - b);
    return this._median(absDeviations);
  }

  _median(sortedArr) {
    const mid = Math.floor(sortedArr.length / 2);
    return sortedArr.length % 2 !== 0 ? sortedArr[mid] : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
  }

  /**
   * Reset detector baseline state
   */
  reset(deviceId, metric) {
    const key = this._getKey(deviceId, metric);
    this.accumulators.delete(key);
    this.slidingWindows.delete(key);
  }
}

module.exports = { StatisticalAnomalyDetector, WelfordAccumulator };

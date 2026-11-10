/**
 * NexusFlow IoT Telemetry Buffer
 * High-performance in-memory sliding-window ring buffer for time-series sensor streams.
 */

class TelemetryBuffer {
  constructor(maxRetentionMs = 60000, maxCapacityPerMetric = 1000) {
    this.maxRetentionMs = maxRetentionMs;
    this.maxCapacity = maxCapacityPerMetric;
    // Map<deviceId, Map<metricName, Array<{ timestamp: number, value: number }>>>
    this.deviceBuffers = new Map();
  }

  /**
   * Ingest a single telemetry sample into the device's metric buffer.
   */
  push(deviceId, metric, value, timestamp = Date.now()) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new TypeError(`Metric value must be a valid number, got: ${value}`);
    }

    if (!this.deviceBuffers.has(deviceId)) {
      this.deviceBuffers.set(deviceId, new Map());
    }

    const deviceMetrics = this.deviceBuffers.get(deviceId);
    if (!deviceMetrics.has(metric)) {
      deviceMetrics.set(metric, []);
    }

    const series = deviceMetrics.get(metric);
    series.push({ timestamp, value });

    // Enforce max capacity and prune expired samples
    this._prune(series, timestamp);
  }

  /**
   * Retrieve all samples for a device metric within the given time window.
   */
  getWindow(deviceId, metric, windowMs, now = Date.now()) {
    const series = this._getSeries(deviceId, metric);
    if (!series || series.length === 0) return [];

    const cutoff = now - windowMs;
    // Binary search or filter depending on size
    return series.filter(sample => sample.timestamp >= cutoff && sample.timestamp <= now);
  }

  /**
   * Get the most recent value for a metric.
   */
  getLatest(deviceId, metric) {
    const series = this._getSeries(deviceId, metric);
    if (!series || series.length === 0) return null;
    return series[series.length - 1];
  }

  /**
   * Compute aggregated statistics over a specified sliding window.
   */
  aggregate(deviceId, metric, aggregationType, windowMs, now = Date.now()) {
    const samples = this.getWindow(deviceId, metric, windowMs, now);
    if (samples.length === 0) return null;

    const values = samples.map(s => s.value);

    switch (aggregationType.toLowerCase()) {
      case 'latest':
        return values[values.length - 1];

      case 'count':
        return values.length;

      case 'sum':
        return values.reduce((acc, v) => acc + v, 0);

      case 'min':
        return Math.min(...values);

      case 'max':
        return Math.max(...values);

      case 'avg':
      case 'mean': {
        const sum = values.reduce((acc, v) => acc + v, 0);
        return sum / values.length;
      }

      case 'stddev': {
        if (values.length < 2) return 0;
        const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
        const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
        return Math.sqrt(variance);
      }

      case 'rate_of_change': {
        if (samples.length < 2) return 0;
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dtSec = (last.timestamp - first.timestamp) / 1000;
        if (dtSec <= 0) return 0;
        return (last.value - first.value) / dtSec;
      }

      default:
        throw new Error(`Unsupported aggregation type: ${aggregationType}`);
    }
  }

  /**
   * Clear all stored data for a device or entire buffer.
   */
  clear(deviceId = null) {
    if (deviceId) {
      this.deviceBuffers.delete(deviceId);
    } else {
      this.deviceBuffers.clear();
    }
  }

  _getSeries(deviceId, metric) {
    const deviceMetrics = this.deviceBuffers.get(deviceId);
    if (!deviceMetrics) return null;
    return deviceMetrics.get(metric) || null;
  }

  _prune(series, currentTimestamp) {
    const cutoff = currentTimestamp - this.maxRetentionMs;
    // Remove expired from the front
    while (series.length > 0 && series[0].timestamp < cutoff) {
      series.shift();
    }
    // Cap maximum length
    while (series.length > this.maxCapacity) {
      series.shift();
    }
  }
}

module.exports = { TelemetryBuffer };

/**
 * NexusFlow IoT Telemetry Pipeline
 * Coordinates streaming ingestion, sliding-window buffer, AST rule evaluation,
 * automated multi-channel dispatch, and device registry state tracking.
 */

const EventEmitter = require('events');
const { TelemetryBuffer } = require('./telemetryBuffer');
const { RuleEvaluator } = require('./ruleEvaluator');
const { AlertDispatcher } = require('./alertDispatcher');

class TelemetryPipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    this.buffer = new TelemetryBuffer(options.bufferRetentionMs || 300000);
    this.evaluator = new RuleEvaluator(this.buffer);
    this.dispatcher = new AlertDispatcher(options.dispatcherOptions || {});

    // Map<deviceId, { deviceId, firstSeen, lastSeen, totalSamples, metrics: Set<string> }>
    this.deviceRegistry = new Map();

    this.stats = {
      totalIngested: 0,
      totalAlerts: 0,
      startedAt: Date.now()
    };

    // Forward evaluator recovery events
    this.evaluator.on('recovery', (event) => {
      this.emit('recovery', event);
    });
  }

  /**
   * Ingest a telemetry reading: { deviceId, metric, value, timestamp? }
   */
  async ingest(reading) {
    if (!reading || typeof reading !== 'object') {
      throw new TypeError('Telemetry reading must be an object');
    }

    const { deviceId, metric, value } = reading;
    if (!deviceId || typeof deviceId !== 'string') {
      throw new Error('Telemetry reading must include a valid string deviceId');
    }
    if (!metric || typeof metric !== 'string') {
      throw new Error('Telemetry reading must include a valid string metric');
    }
    if (typeof value !== 'number' || isNaN(value)) {
      throw new TypeError(`Metric value must be a valid number, got: ${value}`);
    }

    const timestamp = reading.timestamp || Date.now();

    // 1. Update device registry
    this._updateDeviceRegistry(deviceId, metric, timestamp);

    // 2. Evaluate rules and buffer sample
    const alerts = this.evaluator.processTelemetry(deviceId, metric, value, timestamp);
    this.stats.totalIngested++;

    // 3. Dispatch any generated alerts
    const dispatchedAlerts = [];
    for (const alert of alerts) {
      this.stats.totalAlerts++;
      const dispatchRecord = await this.dispatcher.dispatch(alert, timestamp);
      dispatchedAlerts.push(dispatchRecord);
      this.emit('alert', alert);
    }

    const ingestEvent = {
      deviceId,
      metric,
      value,
      timestamp,
      alertCount: alerts.length
    };

    this.emit('telemetry', ingestEvent);

    return {
      success: true,
      ingested: ingestEvent,
      alerts
    };
  }

  /**
   * Batch ingest multiple telemetry readings.
   */
  async ingestBatch(readings) {
    if (!Array.isArray(readings)) {
      throw new TypeError('Batch readings must be an array');
    }

    const results = [];
    for (const item of readings) {
      results.push(await this.ingest(item));
    }
    return results;
  }

  _updateDeviceRegistry(deviceId, metric, timestamp) {
    let device = this.deviceRegistry.get(deviceId);
    if (!device) {
      device = {
        deviceId,
        firstSeen: timestamp,
        lastSeen: timestamp,
        totalSamples: 0,
        metrics: new Set()
      };
      this.deviceRegistry.set(deviceId, device);
      this.emit('device_discovered', { deviceId, timestamp });
    }

    device.lastSeen = Math.max(device.lastSeen, timestamp);
    device.totalSamples++;
    device.metrics.add(metric);
  }

  /**
   * List all registered devices with their telemetry metadata.
   */
  getDevices() {
    return Array.from(this.deviceRegistry.values()).map(dev => ({
      deviceId: dev.deviceId,
      firstSeen: dev.firstSeen,
      lastSeen: dev.lastSeen,
      totalSamples: dev.totalSamples,
      activeMetrics: Array.from(dev.metrics)
    }));
  }

  /**
   * Query device summary and current latest metric values.
   */
  getDeviceState(deviceId) {
    const device = this.deviceRegistry.get(deviceId);
    if (!device) return null;

    const latestMetrics = {};
    for (const metric of device.metrics) {
      latestMetrics[metric] = this.buffer.getLatest(deviceId, metric);
    }

    return {
      deviceId: device.deviceId,
      firstSeen: device.firstSeen,
      lastSeen: device.lastSeen,
      totalSamples: device.totalSamples,
      metrics: latestMetrics
    };
  }

  /**
   * Register a dynamic rule in the underlying evaluator.
   */
  registerRule(rule) {
    this.evaluator.registerRule(rule);
  }

  /**
   * Unregister a rule.
   */
  unregisterRule(ruleId) {
    this.evaluator.unregisterRule(ruleId);
  }

  /**
   * Get all registered rules.
   */
  getRules() {
    return Array.from(this.evaluator.rules.values());
  }

  /**
   * Retrieve operational telemetry pipeline statistics.
   */
  getStats() {
    return {
      uptimeSeconds: Math.floor((Date.now() - this.stats.startedAt) / 1000),
      totalIngested: this.stats.totalIngested,
      totalAlerts: this.stats.totalAlerts,
      activeDevices: this.deviceRegistry.size,
      registeredRules: this.evaluator.rules.size,
      dispatcherStats: this.dispatcher.stats
    };
  }
}

module.exports = { TelemetryPipeline };

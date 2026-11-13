/**
 * TelemetryPipeline & API Test Suite
 * Validates unified streaming ingest, device state registry,
 * alert propagation, and pipeline statistics.
 */

const test = require('node:test');
const assert = require('node:assert');
const { TelemetryPipeline } = require('../backend/engine/telemetryPipeline');

test('TelemetryPipeline - end-to-end ingestion and device lifecycle', async (t) => {
  const pipeline = new TelemetryPipeline();

  // Register an anomaly detection rule: vibration > 8.0
  pipeline.registerRule({
    id: 'heavy-vibration',
    name: 'Heavy Vibration Alert',
    severity: 'CRITICAL',
    condition: { metric: 'vibration', operator: 'GT', value: 8.0 }
  });

  await t.test('discovers and registers new IoT devices on telemetry ingestion', async () => {
    let discoveredDevice = null;
    pipeline.once('device_discovered', (e) => {
      discoveredDevice = e.deviceId;
    });

    const res = await pipeline.ingest({
      deviceId: 'generator-01',
      metric: 'rpm',
      value: 3600,
      timestamp: 1000
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(discoveredDevice, 'generator-01');

    const devices = pipeline.getDevices();
    assert.strictEqual(devices.length, 1);
    assert.strictEqual(devices[0].deviceId, 'generator-01');
    assert.deepStrictEqual(devices[0].activeMetrics, ['rpm']);
  });

  await t.test('triggers and dispatches alert through pipeline on threshold breach', async () => {
    let alertEmitted = null;
    pipeline.once('alert', (alert) => {
      alertEmitted = alert;
    });

    const res = await pipeline.ingest({
      deviceId: 'generator-01',
      metric: 'vibration',
      value: 9.4,
      timestamp: 2000
    });

    assert.strictEqual(res.alerts.length, 1);
    assert.strictEqual(res.alerts[0].ruleId, 'heavy-vibration');
    assert.notStrictEqual(alertEmitted, null);
    assert.strictEqual(alertEmitted.deviceId, 'generator-01');
  });

  await t.test('maintains device telemetry state snapshot across multiple metrics', async () => {
    await pipeline.ingest({
      deviceId: 'generator-01',
      metric: 'temp',
      value: 68.5,
      timestamp: 3000
    });

    const state = pipeline.getDeviceState('generator-01');
    assert.strictEqual(state.deviceId, 'generator-01');
    assert.strictEqual(state.totalSamples, 3);
    assert.strictEqual(state.metrics.rpm.value, 3600);
    assert.strictEqual(state.metrics.vibration.value, 9.4);
    assert.strictEqual(state.metrics.temp.value, 68.5);
  });

  await t.test('supports batch ingestion of heterogeneous sensor readings', async () => {
    const batch = [
      { deviceId: 'substation-04', metric: 'voltage', value: 239.5, timestamp: 4000 },
      { deviceId: 'substation-04', metric: 'current', value: 18.2, timestamp: 4000 },
      { deviceId: 'substation-05', metric: 'voltage', value: 241.0, timestamp: 4000 }
    ];

    const results = await pipeline.ingestBatch(batch);
    assert.strictEqual(results.length, 3);

    const stats = pipeline.getStats();
    assert.strictEqual(stats.activeDevices, 3); // generator-01, substation-04, substation-05
    assert.strictEqual(stats.totalIngested, 6);
  });

  await t.test('validates malformed telemetry readings gracefully', async () => {
    await assert.rejects(async () => {
      await pipeline.ingest({ deviceId: 'dev-x', metric: 'temp', value: 'not-a-number' });
    }, /Metric value must be a valid number/);

    await assert.rejects(async () => {
      await pipeline.ingest({ metric: 'temp', value: 25 });
    }, /must include a valid string deviceId/);
  });
});

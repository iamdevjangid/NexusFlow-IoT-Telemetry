const test = require('node:test');
const assert = require('node:assert/strict');
const { DeviceSimulator, DEVICE_PROFILES } = require('../backend/simulator/deviceSimulator');

test('DeviceSimulator - generates bounded telemetry samples for industrial profiles', () => {
  const sim = new DeviceSimulator();
  const sample = sim.generateSample('turbofan_01', 'turbofan', 'vibration_rms');

  assert.equal(sample.deviceId, 'turbofan_01');
  assert.equal(sample.metric, 'vibration_rms');
  assert.equal(sample.unit, 'mm/s');
  assert.equal(sample.isAnomaly, false);
  assert.ok(sample.value >= DEVICE_PROFILES.turbofan.metrics.vibration_rms.min);
  assert.ok(sample.value <= DEVICE_PROFILES.turbofan.metrics.vibration_rms.max);
});

test('DeviceSimulator - handles deliberate anomaly injection accurately', () => {
  const sim = new DeviceSimulator();
  sim.injectAnomaly('turbofan_01', 'vibration_rms', 24.5);

  const sample = sim.generateSample('turbofan_01', 'turbofan', 'vibration_rms');
  assert.equal(sample.isAnomaly, true);
  assert.equal(sample.value, 24.5);

  // Subsequent sample returns to nominal baseline
  const nextSample = sim.generateSample('turbofan_01', 'turbofan', 'vibration_rms');
  assert.equal(nextSample.isAnomaly, false);
});

test('DeviceSimulator - generates fleet batch snapshots', () => {
  const sim = new DeviceSimulator();
  const batch = sim.generateFleetBatch([
    { id: 'solar_farm_1', profile: 'solar_inverter' },
    { id: 'cold_hub_2', profile: 'cold_chain' }
  ]);

  assert.ok(Array.isArray(batch));
  // 4 metrics for solar + 3 metrics for cold chain = 7 readings
  assert.equal(batch.length, 7);
  const solarReadings = batch.filter(r => r.deviceId === 'solar_farm_1');
  assert.equal(solarReadings.length, 4);
});

test('DeviceSimulator - runs emission loop and terminates on maxTicks', async () => {
  const sim = new DeviceSimulator();
  const emittedBatches = [];

  await new Promise((resolve) => {
    sim.startEmissionLoop({
      intervalMs: 15,
      devices: [{ id: 'test_engine', profile: 'turbofan' }],
      maxTicks: 3,
      onEmit: (batch) => {
        emittedBatches.push(batch);
        if (emittedBatches.length >= 3) {
          resolve();
        }
      }
    });
  });

  assert.equal(emittedBatches.length, 3);
  sim.stopAll();
});

const test = require('node:test');
const assert = require('assert');
const { HostMetricsSensor } = require('../backend/engine/hostMetricsSensor');

test('HostMetricsSensor - physical hardware metrics sampling', (t) => {
  const sensor = new HostMetricsSensor({ deviceId: 'test_host_node' });
  const batch = sensor.sample();

  assert.ok(Array.isArray(batch), 'Sample returns an array of telemetry items');
  assert.ok(batch.length >= 4, 'Sample contains CPU, RAM %, RAM free, and Process RSS');

  const cpuSample = batch.find(s => s.metric === 'host_cpu_utilization');
  assert.ok(cpuSample, 'Contains host_cpu_utilization metric');
  assert.strictEqual(typeof cpuSample.value, 'number');
  assert.ok(cpuSample.value >= 0.0 && cpuSample.value <= 100.0, 'CPU utilization is between 0 and 100%');
  assert.strictEqual(cpuSample.unit, '%');
  assert.strictEqual(cpuSample.source, 'physical_os_kernel');

  const ramSample = batch.find(s => s.metric === 'host_ram_used_pct');
  assert.ok(ramSample, 'Contains host_ram_used_pct metric');
  assert.ok(ramSample.value >= 0.0 && ramSample.value <= 100.0, 'RAM used is between 0 and 100%');

  const freeMemSample = batch.find(s => s.metric === 'host_ram_free_mb');
  assert.ok(freeMemSample, 'Contains host_ram_free_mb');
  assert.ok(freeMemSample.value > 0, 'Free memory is greater than 0 MB');
});

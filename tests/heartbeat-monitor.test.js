const test = require('node:test');
const assert = require('node:assert/strict');
const { HeartbeatMonitor } = require('../backend/engine/heartbeatMonitor');

test('HeartbeatMonitor - records device heartbeats accurately', () => {
  const monitor = new HeartbeatMonitor(5000);
  const now = 100000;
  monitor.recordHeartbeat('device_a', now);
  assert.equal(monitor.isDeviceAlive('device_a', now + 2000), true);
  assert.equal(monitor.isDeviceAlive('device_a', now + 6000), false);
});

test('HeartbeatMonitor - detects stale disconnected devices', () => {
  const monitor = new HeartbeatMonitor(5000);
  const now = 100000;
  monitor.recordHeartbeat('active_dev', now);
  monitor.recordHeartbeat('stale_dev', now - 8000);
  const stale = monitor.checkStaleDevices(now);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].deviceId, 'stale_dev');
});

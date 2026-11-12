/**
 * AlertDispatcher Test Suite
 * Validates multi-channel notification dispatch, deduplication,
 * exponential retry logic, and delivery telemetry.
 */

const test = require('node:test');
const assert = require('node:assert');
const { AlertDispatcher } = require('../backend/engine/alertDispatcher');

test('AlertDispatcher - multi-channel delivery and rate limiting', async (t) => {
  await t.test('delivers alerts to registered handlers successfully', async () => {
    const dispatcher = new AlertDispatcher({ dedupWindowMs: 1000 });
    const received = [];

    dispatcher.registerDestination('slack-webhook', async (payload) => {
      received.push(payload);
    });

    const sampleAlert = {
      ruleId: 'temp-exceeded',
      deviceId: 'sensor-42',
      severity: 'CRITICAL',
      message: 'Temperature spike detected'
    };

    const res = await dispatcher.dispatch(sampleAlert, 1000);
    assert.strictEqual(res.success, true);
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].deviceId, 'sensor-42');
    assert.strictEqual(dispatcher.stats.delivered, 1);
  });

  await t.test('suppresses rapid duplicate alerts within deduplication window', async () => {
    const dispatcher = new AlertDispatcher({ dedupWindowMs: 2000 });
    const received = [];

    dispatcher.registerDestination('mock-channel', async (payload) => {
      received.push(payload);
    });

    const sampleAlert = {
      ruleId: 'pressure-drop',
      deviceId: 'pump-01',
      severity: 'WARNING'
    };

    // First alert at t = 1000
    const res1 = await dispatcher.dispatch(sampleAlert, 1000);
    assert.strictEqual(res1.status, undefined);
    assert.strictEqual(received.length, 1);

    // Duplicate at t = 1500 (within 2000ms window)
    const res2 = await dispatcher.dispatch(sampleAlert, 1500);
    assert.strictEqual(res2.status, 'suppressed');
    assert.strictEqual(received.length, 1);
    assert.strictEqual(dispatcher.stats.suppressed, 1);

    // After window elapsed at t = 3500
    const res3 = await dispatcher.dispatch(sampleAlert, 3500);
    assert.strictEqual(res3.success, true);
    assert.strictEqual(received.length, 2);
  });

  await t.test('retries transient handler failures with exponential backoff', async () => {
    const dispatcher = new AlertDispatcher({
      maxRetries: 2,
      initialBackoffMs: 10,
      backoffMultiplier: 2
    });

    let attempts = 0;
    dispatcher.registerDestination('flaky-webhook', async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('503 Service Unavailable');
      }
    });

    const sampleAlert = {
      ruleId: 'humidity-alert',
      deviceId: 'greenhouse-03',
      severity: 'INFO'
    };

    const res = await dispatcher.dispatch(sampleAlert, 5000);
    assert.strictEqual(res.success, true);
    assert.strictEqual(attempts, 2);
    assert.strictEqual(res.destinations[0].attempts, 2);
  });

  await t.test('marks destination as failed when max retries exceeded', async () => {
    const dispatcher = new AlertDispatcher({
      maxRetries: 1,
      initialBackoffMs: 5
    });

    dispatcher.registerDestination('dead-service', async () => {
      throw new Error('Connection refused');
    });

    const sampleAlert = {
      ruleId: 'motor-stall',
      deviceId: 'robot-arm-1',
      severity: 'CRITICAL'
    };

    const res = await dispatcher.dispatch(sampleAlert, 6000);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.destinations[0].success, false);
    assert.strictEqual(dispatcher.stats.failed, 1);
  });
});

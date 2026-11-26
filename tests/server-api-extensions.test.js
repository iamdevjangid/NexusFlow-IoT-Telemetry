const test = require('node:test');
const assert = require('assert');
const { TelemetryPipeline } = require('../backend/engine/telemetryPipeline');

test('Server API Extensions - Rule deletion and telemetry export', async (t) => {
  const pipeline = new TelemetryPipeline();
  // Test rule registration and unregistration
  const testRule = {
    id: 'test_temp_limit',
    name: 'Test Temperature Limit',
    severity: 'WARNING',
    condition: { metric: 'temperature', operator: '>', threshold: 75.0 }
  };

  pipeline.registerRule(testRule);
  const rules = pipeline.getRules();
  assert.ok(rules.some(r => r.id === 'test_temp_limit'), 'Rule was registered');

  pipeline.unregisterRule('test_temp_limit');
  const rulesAfter = pipeline.getRules();
  assert.strictEqual(rulesAfter.some(r => r.id === 'test_temp_limit'), false, 'Rule was unregistered');

  // Test buffer getAllSamples
  pipeline.buffer.push('device_test_1', 'temperature', 72.5, Date.now() - 5000);
  pipeline.buffer.push('device_test_1', 'vibration_rms', 4.2, Date.now() - 2000);

  const samples = pipeline.buffer.getAllSamples(60000);
  assert.ok(Array.isArray(samples), 'getAllSamples returns array');
  assert.ok(samples.length >= 2, 'getAllSamples contains at least 2 recorded samples');
  assert.strictEqual(samples[0].deviceId, 'device_test_1');

  // Test Stream Plagiarism rule ingestion
  pipeline.registerRule({
    id: 'rule_stream_plagiarism_clone',
    name: 'IoT Stream Data Plagiarism Breached',
    condition: { metric: 'stream_plagiarism_clone', operator: '>=', threshold: 1.0 },
    severity: 'CRITICAL'
  });

  let detectedAlert = null;
  pipeline.on('alert', (alert) => {
    if (alert.ruleId === 'rule_stream_plagiarism_clone') detectedAlert = alert;
  });

  await pipeline.ingest({
    deviceId: 'turbofan_alpha',
    metric: 'stream_plagiarism_clone',
    value: 1.0,
    timestamp: Date.now()
  });

  assert.ok(detectedAlert, 'Plagiarism alert was triggered');
  assert.strictEqual(detectedAlert.severity, 'CRITICAL');
});

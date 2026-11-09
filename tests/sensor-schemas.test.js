const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTelemetryPayload, SENSOR_TYPES } = require('../backend/models/sensorSchemas');

test('SensorSchemas - validates well-formed telemetry readings', () => {
  const result = validateTelemetryPayload({
    deviceId: 'turbine_01',
    metric: SENSOR_TYPES.TEMPERATURE,
    value: 78.4,
    timestamp: Date.now()
  });
  assert.equal(result.valid, true);
});

test('SensorSchemas - rejects invalid payload', () => {
  assert.equal(validateTelemetryPayload({ metric: 'pressure' }).valid, false);
  assert.equal(validateTelemetryPayload({ deviceId: 'dev_1', metric: 'temp', value: 'bad' }).valid, false);
});

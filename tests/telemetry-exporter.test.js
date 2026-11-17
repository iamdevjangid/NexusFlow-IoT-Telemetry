const test = require('node:test');
const assert = require('node:assert/strict');
const { TelemetryExporter } = require('../backend/engine/telemetryExporter');

test('TelemetryExporter - generates valid CSV with correct headers and rows', () => {
  const samples = [
    { deviceId: 'turbine_01', metric: 'temperature', value: 82.5, timestamp: 1700000000000 },
    { deviceId: 'turbine_01', metric: 'pressure', value: 145.2, timestamp: 1700000005000 }
  ];
  const csv = TelemetryExporter.toCSV(samples);
  assert.match(csv, /^timestamp,deviceId,metric,value/);
  assert.match(csv, /"turbine_01","temperature",82\.50/);
  assert.match(csv, /"turbine_01","pressure",145\.20/);
});

test('TelemetryExporter - produces valid formatted JSON structure', () => {
  const samples = [{ deviceId: 'dev_1', metric: 'vibration', value: 12.4 }];
  const jsonStr = TelemetryExporter.toFormattedJSON(samples, { environment: 'production' });
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.sampleCount, 1);
  assert.equal(parsed.metadata.environment, 'production');
  assert.equal(parsed.samples[0].value, 12.4);
});

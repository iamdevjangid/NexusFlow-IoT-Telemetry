/**
 * NexusFlow IoT Engine Test Suite
 * Validates AST evaluation, sliding-window telemetry metrics,
 * hysteresis damping, and stateful alert lifecycle.
 */

const test = require('node:test');
const assert = require('node:assert');
const { TelemetryBuffer } = require('../backend/engine/telemetryBuffer');
const { RuleEvaluator } = require('../backend/engine/ruleEvaluator');

test('TelemetryBuffer - sliding window and statistical aggregations', async (t) => {
  const buffer = new TelemetryBuffer(60000);
  const now = 100000;

  // Push 5 samples over 4 seconds
  buffer.push('dev-01', 'temp', 20.0, now - 4000);
  buffer.push('dev-01', 'temp', 22.0, now - 3000);
  buffer.push('dev-01', 'temp', 24.0, now - 2000);
  buffer.push('dev-01', 'temp', 26.0, now - 1000);
  buffer.push('dev-01', 'temp', 28.0, now);

  await t.test('calculates accurate sliding-window average', () => {
    const avg = buffer.aggregate('dev-01', 'temp', 'avg', 5000, now);
    assert.strictEqual(avg, 24.0);
  });

  await t.test('computes min and max correctly within time window', () => {
    const min = buffer.aggregate('dev-01', 'temp', 'min', 2500, now);
    const max = buffer.aggregate('dev-01', 'temp', 'max', 2500, now);
    assert.strictEqual(min, 24.0);
    assert.strictEqual(max, 28.0);
  });

  await t.test('calculates rate of change (slope) over time window', () => {
    // 28 - 20 = 8 degrees over 4 seconds = 2.0 deg/sec
    const roc = buffer.aggregate('dev-01', 'temp', 'rate_of_change', 5000, now);
    assert.strictEqual(roc, 2.0);
  });

  await t.test('calculates population/sample standard deviation', () => {
    const std = buffer.aggregate('dev-01', 'temp', 'stddev', 5000, now);
    assert(Math.abs(std - 3.162) < 0.01);
  });
});

test('RuleEvaluator - threshold and composite boolean evaluation', async (t) => {
  const buffer = new TelemetryBuffer(60000);
  const evaluator = new RuleEvaluator(buffer);

  // Register composite rule: (temp > 70 AND vibration > 5.0) OR pressure > 150
  evaluator.registerRule({
    id: 'turbine-critical',
    name: 'Turbine Thermal/Mechanical Critical Limit',
    severity: 'CRITICAL',
    condition: {
      or: [
        {
          and: [
            { metric: 'temperature', operator: 'GT', value: 70 },
            { metric: 'vibration', operator: 'GT', value: 5.0 }
          ]
        },
        { metric: 'pressure', operator: 'GT', value: 150 }
      ]
    }
  });

  await t.test('does not trigger when only temperature exceeds threshold', () => {
    const alerts = evaluator.processTelemetry('turbine-A', 'temperature', 75, 1000);
    assert.strictEqual(alerts.length, 0);
  });

  await t.test('triggers alert when both composite AND conditions are met', () => {
    const alerts = evaluator.processTelemetry('turbine-A', 'vibration', 6.2, 1100);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].ruleId, 'turbine-critical');
    assert.strictEqual(alerts[0].severity, 'CRITICAL');
  });

  await t.test('triggers alternative OR branch immediately', () => {
    const alerts = evaluator.processTelemetry('turbine-B', 'pressure', 162, 1200);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].deviceId, 'turbine-B');
  });
});

test('RuleEvaluator - hysteresis band damping and state recovery', async (t) => {
  const buffer = new TelemetryBuffer(60000);
  const evaluator = new RuleEvaluator(buffer);
  let recoveryEmitted = false;

  evaluator.on('recovery', (event) => {
    if (event.ruleId === 'boiler-high-temp') {
      recoveryEmitted = true;
    }
  });

  // Alert triggers when temp > 80, but only clears when temp < 70
  evaluator.registerRule({
    id: 'boiler-high-temp',
    name: 'Boiler Thermal Excursion with Hysteresis',
    condition: { metric: 'temp', operator: 'GT', value: 80 },
    clearCondition: { metric: 'temp', operator: 'LT', value: 70 }
  });

  await t.test('triggers alert at 85°C', () => {
    const alerts = evaluator.processTelemetry('boiler-01', 'temp', 85, 1000);
    assert.strictEqual(alerts.length, 1);
  });

  await t.test('stays in alerting state when temp drops to 75°C (in deadband)', () => {
    evaluator.processTelemetry('boiler-01', 'temp', 75, 2000);
    assert.strictEqual(recoveryEmitted, false);
  });

  await t.test('clears and emits recovery event when temp drops below 70°C', () => {
    evaluator.processTelemetry('boiler-01', 'temp', 68, 3000);
    assert.strictEqual(recoveryEmitted, true);
  });
});

test('RuleEvaluator - sliding-window aggregation rules', async (t) => {
  const buffer = new TelemetryBuffer(60000);
  const evaluator = new RuleEvaluator(buffer);

  // Trigger when 10-second average exceeds 50kW
  evaluator.registerRule({
    id: 'power-surge-window',
    condition: {
      metric: 'power',
      operator: 'GT',
      value: 50.0,
      aggregation: 'avg',
      windowMs: 10000
    }
  });

  const baseTime = 100000;
  // Push 40, 40, 40 -> avg 40 (no alert)
  evaluator.processTelemetry('inverter-1', 'power', 40, baseTime - 6000);
  evaluator.processTelemetry('inverter-1', 'power', 40, baseTime - 3000);
  let alerts = evaluator.processTelemetry('inverter-1', 'power', 40, baseTime);
  assert.strictEqual(alerts.length, 0);

  // Push spike 100 -> avg (40+40+40+100)/4 = 55 > 50 (triggers alert)
  alerts = evaluator.processTelemetry('inverter-1', 'power', 100, baseTime + 1000);
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].ruleId, 'power-surge-window');
});

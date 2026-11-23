const test = require('node:test');
const assert = require('node:assert/strict');
const { StatisticalAnomalyDetector, WelfordAccumulator } = require('../backend/engine/anomalyDetector');

test('WelfordAccumulator - accurately computes mean and sample variance online', () => {
  const acc = new WelfordAccumulator();
  const values = [10, 20, 30, 40, 50];
  values.forEach(v => acc.update(v));

  assert.equal(acc.count, 5);
  assert.equal(acc.mean, 30);
  assert.equal(acc.getVariance(), 250); // Sample variance of [10,20,30,40,50] is 250
  assert.equal(parseFloat(acc.getStdDev().toFixed(3)), 15.811);
});

test('StatisticalAnomalyDetector - reports LEARNING status during initial sample baseline', () => {
  const detector = new StatisticalAnomalyDetector({ minSamples: 5 });
  
  for (let i = 0; i < 4; i++) {
    const res = detector.evaluate('pump_01', 'vibration', 5.0 + i * 0.1);
    assert.equal(res.status, 'LEARNING');
    assert.equal(res.isAnomaly, false);
  }
});

test('StatisticalAnomalyDetector - flags outliers that breach Z-Score 3-sigma threshold', () => {
  const detector = new StatisticalAnomalyDetector({ zThreshold: 3.0, minSamples: 15 });

  // Train with stable readings centered at 50 with small variance
  for (let i = 0; i < 20; i++) {
    detector.evaluate('turbine_01', 'temp', 50 + (i % 2 === 0 ? 1 : -1));
  }

  // Nominal value
  const nominal = detector.evaluate('turbine_01', 'temp', 51);
  assert.equal(nominal.isAnomaly, false);
  assert.equal(nominal.status, 'NOMINAL');

  // Massive unexpected spike (+30 degrees)
  const spike = detector.evaluate('turbine_01', 'temp', 85);
  assert.equal(spike.isAnomaly, true);
  assert.equal(spike.status, 'ANOMALY_DETECTED');
  assert.ok(spike.zScore > 3.0);
});

test('StatisticalAnomalyDetector - calculates Median Absolute Deviation (MAD)', () => {
  const detector = new StatisticalAnomalyDetector();
  const samples = [10, 12, 11, 13, 12, 100]; // Outlier 100
  samples.forEach(s => detector.evaluate('sensor_a', 'pressure', s));

  const mad = detector.calculateMAD('sensor_a', 'pressure');
  // Median is 12. Deviations: |10-12|=2, |11-12|=1, |12-12|=0, |12-12|=0, |13-12|=1, |100-12|=88
  // Sorted deviations: [0, 0, 1, 1, 2, 88]. Median of deviations is (1+1)/2 = 1
  assert.equal(mad, 1);
});

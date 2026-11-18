const test = require('node:test');
const assert = require('node:assert/strict');
const { ExponentialMovingAverage, KalmanFilter1D } = require('../backend/engine/noiseFilter');

test('ExponentialMovingAverage - smooths noisy signals over time', () => {
  const ema = new ExponentialMovingAverage(0.5);
  assert.equal(ema.filter(100), 100);
  assert.equal(ema.filter(110), 105);
  assert.equal(ema.filter(120), 112.5);
});

test('KalmanFilter1D - converges towards true mean under Gaussian noise', () => {
  const kf = new KalmanFilter1D(0.01, 0.5, 1.0);
  let filtered = 0;
  for (let i = 0; i < 20; i++) {
    const noisySample = 50.0 + (i % 2 === 0 ? 3.0 : -3.0);
    filtered = kf.update(noisySample);
  }
  assert.ok(Math.abs(filtered - 50.0) < 2.0);
});

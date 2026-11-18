/**
 * Industrial Sensor Noise Reduction Filters
 * Implements 1D Kalman Filter and Exponential Moving Average (EMA).
 */
class ExponentialMovingAverage {
  constructor(alpha = 0.25) {
    this.alpha = alpha;
    this.currentValue = null;
  }

  filter(sample) {
    if (this.currentValue === null) {
      this.currentValue = sample;
    } else {
      this.currentValue = this.alpha * sample + (1 - this.alpha) * this.currentValue;
    }
    return this.currentValue;
  }

  reset() {
    this.currentValue = null;
  }
}

class KalmanFilter1D {
  constructor(processNoise = 0.05, measurementNoise = 1.0, estimatedError = 1.0) {
    this.q = processNoise;
    this.r = measurementNoise;
    this.p = estimatedError;
    this.x = null;
    this.k = 0;
  }

  update(measurement) {
    if (this.x === null) {
      this.x = measurement;
      return this.x;
    }
    this.p = this.p + this.q;
    this.k = this.p / (this.p + this.r);
    this.x = this.x + this.k * (measurement - this.x);
    this.p = (1 - this.k) * this.p;
    return this.x;
  }

  reset() {
    this.x = null;
  }
}

module.exports = { ExponentialMovingAverage, KalmanFilter1D };

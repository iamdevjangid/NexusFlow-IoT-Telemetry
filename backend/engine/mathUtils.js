function calculateMean(samples) {
  if (!samples || samples.length === 0) return 0;
  return samples.reduce((acc, val) => acc + val, 0) / samples.length;
}

function calculateVariance(samples) {
  if (!samples || samples.length < 2) return 0;
  const mean = calculateMean(samples);
  const sumDiffs = samples.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  return sumDiffs / (samples.length - 1);
}

function calculateStandardDeviation(samples) {
  return Math.sqrt(calculateVariance(samples));
}

module.exports = { calculateMean, calculateVariance, calculateStandardDeviation };

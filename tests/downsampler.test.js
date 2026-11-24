const test = require('node:test');
const assert = require('node:assert/strict');
const { Downsampler } = require('../backend/engine/downsampler');

test('Downsampler - LTTB produces exact requested number of threshold points', () => {
  const points = [];
  for (let i = 0; i < 500; i++) {
    points.push({ timestamp: i * 1000, value: Math.sin(i / 10) * 50 });
  }

  const downsampled = Downsampler.lttb(points, 50);
  assert.equal(downsampled.length, 50);
  assert.equal(downsampled[0].timestamp, points[0].timestamp);
  assert.equal(downsampled[downsampled.length - 1].timestamp, points[points.length - 1].timestamp);
});

test('Downsampler - LTTB retains critical transient peak spikes', () => {
  const points = [];
  for (let i = 0; i < 100; i++) {
    points.push({ timestamp: i * 100, value: 10 }); // Flat baseline at 10
  }
  // Inject sharp peak at index 45
  points[45] = { timestamp: 45 * 100, value: 999.0 };

  // Downsample to only 10 points
  const downsampled = Downsampler.lttb(points, 10);
  assert.equal(downsampled.length, 10);

  // The 999.0 peak MUST be captured in the downsampled output
  const hasPeak = downsampled.some(pt => pt.value === 999.0);
  assert.ok(hasPeak, 'LTTB algorithm must retain the extreme peak outlier');
});

test('Downsampler - handles boundary edge cases', () => {
  const smallData = [
    { timestamp: 100, value: 5 },
    { timestamp: 200, value: 15 }
  ];

  // Requesting more points than exist
  const res1 = Downsampler.lttb(smallData, 10);
  assert.equal(res1.length, 2);

  // Requesting threshold of 2
  const res2 = Downsampler.lttb(smallData, 2);
  assert.equal(res2.length, 2);
  assert.equal(res2[0].value, 5);
  assert.equal(res2[1].value, 15);
});

test('Downsampler - Min-Max preserves both global peak and valley', () => {
  const points = [
    { timestamp: 0, value: 20 },
    { timestamp: 10, value: 100 }, // Max in chunk 1
    { timestamp: 20, value: 5 },   // Min in chunk 1
    { timestamp: 30, value: 25 },
    { timestamp: 40, value: 30 },
    { timestamp: 50, value: 500 }, // Max in chunk 2
    { timestamp: 60, value: 1 }    // Min in chunk 2
  ];

  const decimated = Downsampler.minMax(points, 4);
  assert.ok(decimated.some(p => p.value === 100));
  assert.ok(decimated.some(p => p.value === 5));
  assert.ok(decimated.some(p => p.value === 500));
  assert.ok(decimated.some(p => p.value === 1));
});

test('Downsampler - timeAggregate groups into fixed chronological buckets', () => {
  const points = [
    { timestamp: 1000, value: 10 },
    { timestamp: 2000, value: 20 },
    { timestamp: 3000, value: 30 },
    { timestamp: 65000, value: 50 }, // Bucket 2 (60000)
    { timestamp: 70000, value: 70 }  // Bucket 2 (60000)
  ];

  const buckets = Downsampler.timeAggregate(points, 60000);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].bucketStart, 0);
  assert.equal(buckets[0].count, 3);
  assert.equal(buckets[0].min, 10);
  assert.equal(buckets[0].max, 30);
  assert.equal(buckets[0].avg, 20);

  assert.equal(buckets[1].bucketStart, 60000);
  assert.equal(buckets[1].count, 2);
  assert.equal(buckets[1].avg, 60);
});

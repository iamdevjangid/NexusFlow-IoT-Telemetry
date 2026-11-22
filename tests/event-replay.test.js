const test = require('node:test');
const assert = require('node:assert/strict');
const { EventReplayEngine } = require('../backend/engine/eventReplay');

test('EventReplayEngine - loads and orders events by timestamp', () => {
  const engine = new EventReplayEngine();
  const raw = [
    { deviceId: 'dev_1', metric: 'temp', value: 30, timestamp: 3000 },
    { deviceId: 'dev_1', metric: 'temp', value: 10, timestamp: 1000 },
    { deviceId: 'dev_1', metric: 'temp', value: 20, timestamp: 2000 }
  ];

  const count = engine.loadEvents(raw);
  assert.equal(count, 3);
  assert.equal(engine.events[0].timestamp, 1000);
  assert.equal(engine.events[1].timestamp, 2000);
  assert.equal(engine.events[2].timestamp, 3000);
});

test('EventReplayEngine - steps through events one by one', () => {
  const engine = new EventReplayEngine({
    events: [
      { deviceId: 'dev_1', metric: 'temp', value: 15, timestamp: 100 },
      { deviceId: 'dev_1', metric: 'temp', value: 25, timestamp: 200 }
    ]
  });

  const step1 = engine.stepNext();
  assert.equal(step1.value, 15);
  assert.equal(step1._replayMeta.index, 0);

  const step2 = engine.stepNext();
  assert.equal(step2.value, 25);
  assert.equal(step2._replayMeta.index, 1);

  const step3 = engine.stepNext();
  assert.equal(step3, null);
});

test('EventReplayEngine - seeks cursor by timestamp', () => {
  const engine = new EventReplayEngine({
    events: [
      { id: 1, timestamp: 1000 },
      { id: 2, timestamp: 2000 },
      { id: 3, timestamp: 3000 },
      { id: 4, timestamp: 4000 }
    ]
  });

  engine.seekToTimestamp(2500);
  const next = engine.stepNext();
  assert.equal(next.id, 3);
  assert.equal(next.timestamp, 3000);
});

test('EventReplayEngine - runs accelerated playback and invokes completion callback', async () => {
  const engine = new EventReplayEngine({
    events: [
      { id: 1, timestamp: 0 },
      { id: 2, timestamp: 100 },
      { id: 3, timestamp: 200 }
    ]
  });

  const replayed = [];
  await new Promise((resolve) => {
    engine.start({
      speedMultiplier: 20, // 20x faster: 200ms becomes 10ms
      onEvent: (e) => replayed.push(e.id),
      onComplete: (summary) => {
        assert.equal(summary.totalReplayed, 3);
        resolve();
      }
    });
  });

  assert.deepEqual(replayed, [1, 2, 3]);
  const status = engine.getStatus();
  assert.equal(status.isPlaying, false);
  assert.equal(status.progressPercent, 100);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { DeadLetterQueue } = require('../backend/engine/deadLetterQueue');

test('DeadLetterQueue - captures and quaranines rejected packets', () => {
  const dlq = new DeadLetterQueue();
  const rawPayload = { deviceId: 'broken_sensor', value: 'NOT_A_NUMBER' };

  const item = dlq.enqueue(rawPayload, 'SCHEMA_VALIDATION_FAILED', {
    sourceIp: '192.168.1.100',
    error: 'value must be numeric'
  });

  assert.ok(item.id.startsWith('dlq_'));
  assert.equal(item.reason, 'SCHEMA_VALIDATION_FAILED');
  assert.equal(item.status, 'QUARANTINED');
  assert.equal(dlq.peek().length, 1);
});

test('DeadLetterQueue - enforces capacity limit with FIFO eviction', () => {
  const dlq = new DeadLetterQueue({ maxCapacity: 3 });
  dlq.enqueue({ id: 1 }, 'ERR1');
  dlq.enqueue({ id: 2 }, 'ERR2');
  dlq.enqueue({ id: 3 }, 'ERR3');
  dlq.enqueue({ id: 4 }, 'ERR4');

  const items = dlq.peek();
  assert.equal(items.length, 3);
  assert.equal(items[0].payload.id, 2); // id: 1 evicted
  assert.equal(dlq.getMetrics().droppedDueToCapacity, 1);
});

test('DeadLetterQueue - retries packet with handler and evicts on success', async () => {
  const dlq = new DeadLetterQueue();
  const item = dlq.enqueue({ val: 42 }, 'TRANSIENT_NETWORK_ERR');

  // Success handler
  const successRes = await dlq.retry(item.id, async (payload) => {
    return { ingested: true, payload };
  });

  assert.equal(successRes.success, true);
  assert.equal(dlq.peek().length, 0); // Evicted after successful ingestion
});

test('DeadLetterQueue - preserves packet and increments retryCount on handler failure', async () => {
  const dlq = new DeadLetterQueue();
  const item = dlq.enqueue({ val: 99 }, 'DATABASE_DOWN');

  // Failing handler
  const failRes = await dlq.retry(item.id, async () => {
    throw new Error('Connection refused');
  });

  assert.equal(failRes.success, false);
  assert.equal(failRes.item.retryCount, 1);
  assert.equal(failRes.item.metadata.lastRetryError, 'Connection refused');
  assert.equal(dlq.peek().length, 1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker, CircuitBreakerOpenError } = require('../backend/engine/circuitBreaker');

test('CircuitBreaker - allows nominal calls through in CLOSED state', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 3 });
  const res = await cb.execute(async () => 'OK');

  assert.equal(res, 'OK');
  assert.equal(cb.state, 'CLOSED');
  assert.equal(cb.consecutiveFailures, 0);
});

test('CircuitBreaker - trips to OPEN after reaching failureThreshold', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, recoveryTimeoutMs: 1000 });

  // 1st failure
  await assert.rejects(async () => {
    await cb.execute(async () => { throw new Error('DB Error'); });
  });
  assert.equal(cb.state, 'CLOSED');
  assert.equal(cb.consecutiveFailures, 1);

  // 2nd failure -> trips to OPEN
  await assert.rejects(async () => {
    await cb.execute(async () => { throw new Error('DB Error 2'); });
  });
  assert.equal(cb.state, 'OPEN');
  assert.equal(cb.totalTrips, 1);

  // Immediate subsequent call must fail fast without executing action
  let executed = false;
  await assert.rejects(
    async () => {
      await cb.execute(async () => { executed = true; });
    },
    (err) => err instanceof CircuitBreakerOpenError
  );
  assert.equal(executed, false, 'Action must not be executed when circuit is OPEN');
});

test('CircuitBreaker - transitions to HALF_OPEN after timeout and recovers to CLOSED', async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    recoveryTimeoutMs: 50,
    halfOpenSuccessThreshold: 2
  });

  // Trip to OPEN
  await assert.rejects(async () => {
    await cb.execute(async () => { throw new Error('Down'); });
  });
  assert.equal(cb.state, 'OPEN');

  // Wait for recovery timeout
  await new Promise(r => setTimeout(r, 60));

  // 1st canary call in HALF_OPEN
  const canary1 = await cb.execute(async () => 'CANARY_1');
  assert.equal(canary1, 'CANARY_1');
  assert.equal(cb.state, 'HALF_OPEN');

  // 2nd canary call in HALF_OPEN -> closes circuit
  const canary2 = await cb.execute(async () => 'CANARY_2');
  assert.equal(canary2, 'CANARY_2');
  assert.equal(cb.state, 'CLOSED');
  assert.equal(cb.consecutiveFailures, 0);
});

test('CircuitBreaker - canary failure in HALF_OPEN immediately trips back to OPEN', async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    recoveryTimeoutMs: 30,
    halfOpenSuccessThreshold: 2
  });

  // Trip to OPEN
  await assert.rejects(async () => {
    await cb.execute(async () => { throw new Error('Fault'); });
  });

  await new Promise(r => setTimeout(r, 40));

  // Canary fails
  await assert.rejects(async () => {
    await cb.execute(async () => { throw new Error('Still dead'); });
  });

  assert.equal(cb.state, 'OPEN');
  assert.equal(cb.totalTrips, 2);
});

test('CircuitBreaker - manual trip and reset', () => {
  const cb = new CircuitBreaker();
  assert.equal(cb.state, 'CLOSED');

  cb.trip();
  assert.equal(cb.state, 'OPEN');

  cb.reset();
  assert.equal(cb.state, 'CLOSED');
  assert.equal(cb.consecutiveFailures, 0);
});

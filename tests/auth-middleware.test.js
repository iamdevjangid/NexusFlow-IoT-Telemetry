const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware, TokenBucketRateLimiter } = require('../backend/middleware/authMiddleware');

test('TokenBucketRateLimiter - enforces rate capacity and refills', () => {
  const limiter = new TokenBucketRateLimiter(2, 10);
  const now = 100000;
  assert.equal(limiter.allow('client_1', now), true);
  assert.equal(limiter.allow('client_1', now), true);
  assert.equal(limiter.allow('client_1', now), false);
  assert.equal(limiter.allow('client_1', now + 200), true);
});

test('createAuthMiddleware - blocks requests without valid API key', () => {
  const middleware = createAuthMiddleware(['valid-key']);
  let status = null;
  let jsonResponse = null;
  const req = { path: '/api/telemetry', headers: {} };
  const res = {
    status: (code) => { status = code; return { json: (data) => { jsonResponse = data; } }; }
  };
  middleware(req, res, () => {});
  assert.equal(status, 401);
  assert.match(jsonResponse.error, /Unauthorized/i);
});

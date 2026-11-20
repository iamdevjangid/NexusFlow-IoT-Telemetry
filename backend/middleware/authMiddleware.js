/**
 * API Key Authentication and Token Bucket Rate Limiter
 */
function createAuthMiddleware(validApiKeys = ['nexus-secret-key-prod', 'nexus-secret-key-dev']) {
  return function apiKeyAuth(req, res, next) {
    if (req.path === '/' || req.path === '/metrics' || req.path.startsWith('/api/metrics/summary')) {
      return next();
    }
    const apiKey = (req.headers && req.headers['x-api-key']) || (req.query && req.query.api_key);
    if (!apiKey || !validApiKeys.includes(apiKey)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing X-API-Key header' });
    }
    next();
  };
}

class TokenBucketRateLimiter {
  constructor(capacity = 100, refillRatePerSec = 20) {
    this.capacity = capacity;
    this.refillRate = refillRatePerSec;
    this.tokens = new Map();
  }

  allow(clientId, now = Date.now()) {
    let bucket = this.tokens.get(clientId);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.tokens.set(clientId, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillRate);
      bucket.lastRefill = now;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }
}

module.exports = { createAuthMiddleware, TokenBucketRateLimiter };

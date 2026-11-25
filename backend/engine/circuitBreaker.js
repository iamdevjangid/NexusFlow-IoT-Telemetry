/**
 * NexusFlow IoT Ingestion Circuit Breaker & Backpressure Regulator
 * 
 * Protects downstream storage, notification sinks, and ingestion pipelines
 * against cascade failures during edge telemetry bursts and broker outages.
 * 
 * Implements finite-state machine:
 * - CLOSED: Traffic flows nominally through the executor
 * - OPEN: Downstream degraded; calls fail-fast with CircuitBreakerOpenError
 * - HALF_OPEN: Canary probe mode verifying downstream recovery
 */

class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN. Upstream ingestion throttled by backpressure.') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.status = 503;
    this.isCircuitBreaker = true;
  }
}

class CircuitBreaker {
  /**
   * @param {Object} [options]
   * @param {number} [options.failureThreshold=5] - Consecutive failures needed to trip breaker
   * @param {number} [options.recoveryTimeoutMs=5000] - Duration to wait in OPEN before attempting HALF_OPEN canary probe
   * @param {number} [options.halfOpenSuccessThreshold=2] - Successful canary calls needed in HALF_OPEN to reset to CLOSED
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeoutMs = options.recoveryTimeoutMs ?? 5000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;

    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalTrips = 0;
    this.lastFailureTime = null;
    this.lastStateChangeTime = Date.now();
    this.listeners = new Set();
  }

  /**
   * Register a state change listener (fromState, toState) => void
   */
  onStateChange(fn) {
    if (typeof fn === 'function') this.listeners.add(fn);
  }

  _transitionTo(newState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = Date.now();

    if (newState === 'OPEN') {
      this.totalTrips++;
      this.consecutiveSuccesses = 0;
    } else if (newState === 'CLOSED') {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
    } else if (newState === 'HALF_OPEN') {
      this.consecutiveSuccesses = 0;
    }

    for (const listener of this.listeners) {
      try {
        listener(oldState, newState);
      } catch (e) {
        console.error('CircuitBreaker listener error:', e);
      }
    }
  }

  /**
   * Execute a protected asynchronous action through the circuit breaker
   * @param {Function} action - async () => result
   * @returns {Promise<*>}
   */
  async execute(action) {
    const now = Date.now();

    // Check if recovery timeout has elapsed to allow canary probe
    if (this.state === 'OPEN') {
      if (now - this.lastStateChangeTime >= this.recoveryTimeoutMs) {
        this._transitionTo('HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError();
      }
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }

  recordSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.halfOpenSuccessThreshold) {
        this._transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      this.consecutiveFailures = 0;
    }
  }

  recordFailure(err) {
    this.lastFailureTime = Date.now();
    this.consecutiveFailures++;

    if (this.state === 'HALF_OPEN') {
      // In canary mode, a single failure immediately trips back to OPEN
      this._transitionTo('OPEN');
    } else if (this.state === 'CLOSED') {
      if (this.consecutiveFailures >= this.failureThreshold) {
        this._transitionTo('OPEN');
      }
    }
  }

  /**
   * Manually trip the breaker into OPEN state
   */
  trip() {
    this._transitionTo('OPEN');
  }

  /**
   * Manually reset the breaker into CLOSED state
   */
  reset() {
    this._transitionTo('CLOSED');
  }

  /**
   * Get current telemetry health status of the breaker
   */
  getStatus() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalTrips: this.totalTrips,
      lastFailureTime: this.lastFailureTime,
      lastStateChangeTime: this.lastStateChangeTime,
      uptimeInCurrentStateMs: Date.now() - this.lastStateChangeTime,
      thresholds: {
        failureThreshold: this.failureThreshold,
        recoveryTimeoutMs: this.recoveryTimeoutMs,
        halfOpenSuccessThreshold: this.halfOpenSuccessThreshold
      }
    };
  }
}

module.exports = { CircuitBreaker, CircuitBreakerOpenError };

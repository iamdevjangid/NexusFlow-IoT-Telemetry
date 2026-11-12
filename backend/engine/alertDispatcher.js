/**
 * NexusFlow IoT Alert Dispatcher
 * Multi-channel notification routing with exponential retry,
 * rate limiting, and delivery status tracking.
 */

const EventEmitter = require('events');

class AlertDispatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxRetries = options.maxRetries || 3;
    this.initialBackoffMs = options.initialBackoffMs || 50;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.dedupWindowMs = options.dedupWindowMs || 5000;

    // Map<handlerId, handlerFunction>
    this.destinations = new Map();

    // Map<`${ruleId}:${deviceId}`, lastDispatchedTimestamp>
    this.lastDispatches = new Map();

    // In-memory audit log of dispatched notifications
    this.history = [];
    this.maxHistorySize = options.maxHistorySize || 200;

    this.stats = {
      dispatched: 0,
      delivered: 0,
      suppressed: 0,
      failed: 0
    };
  }

  /**
   * Register a delivery target (e.g., webhook sender, SMS adapter, pubsub producer).
   */
  registerDestination(id, handlerFn) {
    if (typeof handlerFn !== 'function') {
      throw new TypeError(`Handler for destination ${id} must be a function`);
    }
    this.destinations.set(id, handlerFn);
  }

  /**
   * Remove a delivery target.
   */
  unregisterDestination(id) {
    this.destinations.delete(id);
  }

  /**
   * Dispatch an alert payload to all registered destinations.
   */
  async dispatch(alert, now = Date.now()) {
    const dedupKey = `${alert.ruleId}:${alert.deviceId}`;
    const hasPriorDispatch = this.lastDispatches.has(dedupKey);
    const lastTime = hasPriorDispatch ? this.lastDispatches.get(dedupKey) : 0;

    // Deduplication / throttling check
    if (hasPriorDispatch && (now - lastTime < this.dedupWindowMs)) {
      this.stats.suppressed++;
      this.emit('suppressed', { alert, reason: 'deduplicated', timestamp: now });
      return { status: 'suppressed', reason: 'deduplication_active' };
    }

    this.lastDispatches.set(dedupKey, now);
    this.stats.dispatched++;

    const payload = {
      id: `alert-${now}-${Math.random().toString(36).substring(2, 8)}`,
      timestamp: now,
      ...alert
    };

    const deliveryPromises = [];
    for (const [destId, handler] of this.destinations.entries()) {
      deliveryPromises.push(this._deliverWithRetry(destId, handler, payload));
    }

    const results = await Promise.all(deliveryPromises);
    const overallSuccess = results.every(r => r.success);

    const record = {
      alertId: payload.id,
      timestamp: now,
      ruleId: alert.ruleId,
      deviceId: alert.deviceId,
      severity: alert.severity,
      destinations: results,
      success: overallSuccess
    };

    this.history.push(record);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    this.emit(overallSuccess ? 'delivered' : 'partial_failure', record);
    return record;
  }

  async _deliverWithRetry(destId, handler, payload) {
    let attempt = 0;
    let delay = this.initialBackoffMs;

    while (attempt <= this.maxRetries) {
      try {
        await handler(payload);
        this.stats.delivered++;
        return { destination: destId, success: true, attempts: attempt + 1 };
      } catch (err) {
        attempt++;
        if (attempt > this.maxRetries) {
          this.stats.failed++;
          return {
            destination: destId,
            success: false,
            attempts: attempt,
            error: err.message
          };
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= this.backoffMultiplier;
      }
    }
  }

  /**
   * Retrieve dispatch audit trail.
   */
  getHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  /**
   * Reset stats and in-memory caches.
   */
  reset() {
    this.lastDispatches.clear();
    this.history = [];
    this.stats = { dispatched: 0, delivered: 0, suppressed: 0, failed: 0 };
  }
}

module.exports = { AlertDispatcher };

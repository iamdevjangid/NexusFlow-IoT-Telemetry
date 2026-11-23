/**
 * NexusFlow IoT Dead-Letter Queue (DLQ) & Quarantine Manager
 * 
 * Captures, buffers, and manages malformed, unparseable, or out-of-order
 * IoT sensor packets to prevent pipeline halts and allow operator retries.
 */

class DeadLetterQueue {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxCapacity=1000] - Maximum quarantined items kept in memory
   */
  constructor(options = {}) {
    this.maxCapacity = options.maxCapacity ?? 1000;
    this.queue = [];
    this.droppedCounter = 0;
  }

  /**
   * Enqueue a failed packet into the dead-letter quarantine
   * @param {Object|string} payload - The raw or parsed payload that failed
   * @param {string} reason - Rejection category (e.g., 'SCHEMA_VALIDATION_FAILED', 'TIMESTAMP_DRIFT')
   * @param {Object} [metadata={}] - Contextual details (ip, headers, deviceId, error message)
   * @returns {Object} Quarantined packet record
   */
  enqueue(payload, reason, metadata = {}) {
    if (this.queue.length >= this.maxCapacity) {
      // FIFO eviction when capacity is reached
      this.queue.shift();
      this.droppedCounter++;
    }

    const item = {
      id: `dlq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: Date.now(),
      reason: reason || 'UNKNOWN_ERROR',
      payload,
      metadata: { ...metadata },
      retryCount: 0,
      status: 'QUARANTINED'
    };

    this.queue.push(item);
    return item;
  }

  /**
   * Retrieve quarantined packets with pagination
   */
  peek(limit = 50, offset = 0) {
    return this.queue.slice(offset, offset + limit);
  }

  /**
   * Find a specific quarantined item by ID
   */
  getById(id) {
    return this.queue.find(item => item.id === id) || null;
  }

  /**
   * Attempt to reprocess a quarantined packet using a supplied ingestion handler
   * @param {string} id
   * @param {Function} handler - async (payload) => result
   * @returns {Promise<Object>}
   */
  async retry(id, handler) {
    const item = this.getById(id);
    if (!item) {
      throw new Error(`DLQ item with ID '${id}' not found`);
    }

    item.retryCount++;
    try {
      const result = await handler(item.payload);
      // If handler resolves without error, remove from DLQ
      this.remove(id);
      return { success: true, item, result };
    } catch (err) {
      item.metadata.lastRetryError = err.message;
      item.metadata.lastRetryAt = Date.now();
      return { success: false, item, error: err.message };
    }
  }

  /**
   * Remove a specific item from DLQ
   */
  remove(id) {
    const initialLen = this.queue.length;
    this.queue = this.queue.filter(item => item.id !== id);
    return this.queue.length < initialLen;
  }

  /**
   * Purge the entire queue or items matching a reason filter
   */
  purge(reasonFilter) {
    if (reasonFilter) {
      const initial = this.queue.length;
      this.queue = this.queue.filter(i => i.reason !== reasonFilter);
      return initial - this.queue.length;
    }
    const count = this.queue.length;
    this.queue = [];
    return count;
  }

  /**
   * Aggregate metrics on quarantined events
   */
  getMetrics() {
    const reasonBreakdown = {};
    for (const item of this.queue) {
      reasonBreakdown[item.reason] = (reasonBreakdown[item.reason] || 0) + 1;
    }

    return {
      totalQuarantined: this.queue.length,
      maxCapacity: this.maxCapacity,
      droppedDueToCapacity: this.droppedCounter,
      reasons: reasonBreakdown
    };
  }
}

module.exports = { DeadLetterQueue };

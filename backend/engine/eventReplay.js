/**
 * NexusFlow IoT Historical Event Replay Engine
 * 
 * Replays historical time-series telemetry streams through the pipeline
 * at adjustable playback multipliers (1x, 5x, 10x, instantaneous)
 * to test declarative AST rules and audit post-mortem incident chronologies.
 */

class EventReplayEngine {
  /**
   * @param {Object} [options]
   * @param {Array<Object>} [options.events=[]]
   */
  constructor(options = {}) {
    this.events = [];
    if (options.events && Array.isArray(options.events)) {
      this.loadEvents(options.events);
    }
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.speedMultiplier = 1.0;
    this.timeoutId = null;
    this.callbacks = {
      onEvent: null,
      onComplete: null,
      onStateChange: null
    };
  }

  /**
   * Load and chronologically sort a series of telemetry events
   * @param {Array<Object>} rawEvents
   */
  loadEvents(rawEvents) {
    if (!Array.isArray(rawEvents)) {
      throw new TypeError('Events must be provided as an array');
    }
    // Deep copy and sort ascending by timestamp
    this.events = rawEvents
      .filter(e => e && typeof e.timestamp === 'number')
      .map(e => ({ ...e }))
      .sort((a, b) => a.timestamp - b.timestamp);

    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    return this.events.length;
  }

  /**
   * Start playback
   * @param {Object} [config]
   * @param {number} [config.speedMultiplier=1.0]
   * @param {Function} [config.onEvent]
   * @param {Function} [config.onComplete]
   */
  start(config = {}) {
    if (this.events.length === 0) {
      throw new Error('No telemetry events loaded for replay');
    }
    if (config.speedMultiplier && config.speedMultiplier > 0) {
      this.speedMultiplier = config.speedMultiplier;
    }
    if (config.onEvent) this.callbacks.onEvent = config.onEvent;
    if (config.onComplete) this.callbacks.onComplete = config.onComplete;

    this.isPlaying = true;
    this.isPaused = false;
    this._scheduleNext();
  }

  /**
   * Internal scheduler for next event emission
   */
  _scheduleNext() {
    if (!this.isPlaying || this.isPaused) return;

    if (this.currentIndex >= this.events.length) {
      this.isPlaying = false;
      if (typeof this.callbacks.onComplete === 'function') {
        this.callbacks.onComplete({
          totalReplayed: this.events.length,
          finishedAt: Date.now()
        });
      }
      return;
    }

    const currentEvent = this.events[this.currentIndex];
    const nextIndex = this.currentIndex + 1;

    // Emit current event
    if (typeof this.callbacks.onEvent === 'function') {
      try {
        this.callbacks.onEvent({
          ...currentEvent,
          _replayMeta: {
            index: this.currentIndex,
            total: this.events.length,
            progressRatio: (this.currentIndex + 1) / this.events.length
          }
        });
      } catch (err) {
        console.error('Event replay callback error:', err);
      }
    }

    this.currentIndex = nextIndex;

    if (this.currentIndex >= this.events.length) {
      this.isPlaying = false;
      if (typeof this.callbacks.onComplete === 'function') {
        this.callbacks.onComplete({
          totalReplayed: this.events.length,
          finishedAt: Date.now()
        });
      }
      return;
    }

    // Calculate delay to next event
    const nextEvent = this.events[this.currentIndex];
    const rawDelta = Math.max(0, nextEvent.timestamp - currentEvent.timestamp);
    const delay = Math.round(rawDelta / this.speedMultiplier);

    this.timeoutId = setTimeout(() => {
      this._scheduleNext();
    }, delay);
  }

  /**
   * Pause current playback
   */
  pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Resume playback from current position
   */
  resume() {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;
    this._scheduleNext();
  }

  /**
   * Stop playback and reset cursor to beginning
   */
  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.currentIndex = 0;
  }

  /**
   * Seek playback cursor to specific index or timestamp
   */
  seekToTimestamp(timestamp) {
    if (this.events.length === 0) return 0;
    let idx = this.events.findIndex(e => e.timestamp >= timestamp);
    if (idx === -1) idx = this.events.length;
    this.currentIndex = idx;
    return this.currentIndex;
  }

  /**
   * Step forward exactly one event (for debugging / single-stepping)
   */
  stepNext() {
    if (this.currentIndex >= this.events.length) return null;
    const event = this.events[this.currentIndex];
    this.currentIndex++;
    return {
      ...event,
      _replayMeta: {
        index: this.currentIndex - 1,
        total: this.events.length,
        progressRatio: this.currentIndex / this.events.length
      }
    };
  }

  /**
   * Get current playback status snapshot
   */
  getStatus() {
    const total = this.events.length;
    const startTime = total > 0 ? this.events[0].timestamp : null;
    const endTime = total > 0 ? this.events[total - 1].timestamp : null;
    const currentEvent = total > 0 && this.currentIndex < total ? this.events[this.currentIndex] : null;

    return {
      totalEvents: total,
      currentIndex: this.currentIndex,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      speedMultiplier: this.speedMultiplier,
      progressPercent: total > 0 ? Math.round((this.currentIndex / total) * 100) : 0,
      timeSpanMs: startTime && endTime ? endTime - startTime : 0,
      currentTimestamp: currentEvent ? currentEvent.timestamp : null
    };
  }
}

module.exports = { EventReplayEngine };

/**
 * NexusFlow IoT Rule Engine Evaluator
 * AST-based declarative stream rule evaluation with sliding window aggregation,
 * hysteresis damping, and stateful alert lifecycle management.
 */

const EventEmitter = require('events');

class RuleEvaluator extends EventEmitter {
  constructor(telemetryBuffer) {
    super();
    this.buffer = telemetryBuffer;
    // Map<ruleId, RuleDefinition>
    this.rules = new Map();
    // Map<`${ruleId}:${deviceId}`, { state: 'NORMAL'|'ALERTING', lastTriggeredAt: number, firstExceededAt: number }>
    this.ruleStates = new Map();
  }

  /**
   * Register a rule in the evaluation engine.
   */
  registerRule(rule) {
    if (!rule.id || !rule.condition) {
      throw new Error('Rule must specify a unique id and condition');
    }
    this.rules.set(rule.id, {
      id: rule.id,
      name: rule.name || rule.id,
      severity: rule.severity || 'WARNING',
      condition: rule.condition,
      clearCondition: rule.clearCondition || null, // Optional hysteresis recovery condition
      cooldownMs: rule.cooldownMs || 0,
      minDurationMs: rule.minDurationMs || 0, // Sustained violation requirement
      targetDevices: rule.targetDevices || null // null means all devices
    });
  }

  /**
   * Remove a rule from the evaluation engine.
   */
  unregisterRule(ruleId) {
    this.rules.delete(ruleId);
    // Clean up states
    for (const key of this.ruleStates.keys()) {
      if (key.startsWith(`${ruleId}:`)) {
        this.ruleStates.delete(key);
      }
    }
  }

  /**
   * Ingest a batch or single telemetry point and evaluate applicable rules.
   */
  processTelemetry(deviceId, metric, value, timestamp = Date.now()) {
    // 1. Buffer telemetry
    this.buffer.push(deviceId, metric, value, timestamp);

    // 2. Evaluate rules targeting this device or all devices
    const triggeredAlerts = [];

    for (const rule of this.rules.values()) {
      if (rule.targetDevices && !rule.targetDevices.includes(deviceId)) {
        continue;
      }

      const alert = this._evaluateRuleForDevice(rule, deviceId, timestamp);
      if (alert) {
        triggeredAlerts.push(alert);
      }
    }

    return triggeredAlerts;
  }

  _evaluateRuleForDevice(rule, deviceId, timestamp) {
    const stateKey = `${rule.id}:${deviceId}`;
    let currentState = this.ruleStates.get(stateKey) || {
      state: 'NORMAL',
      lastTriggeredAt: 0,
      firstExceededAt: 0
    };

    const conditionMet = this._evaluateNode(rule.condition, deviceId, timestamp);

    // Handle ALERTING state with hysteresis recovery
    if (currentState.state === 'ALERTING') {
      let shouldClear = false;

      if (rule.clearCondition) {
        shouldClear = this._evaluateNode(rule.clearCondition, deviceId, timestamp);
      } else {
        shouldClear = !conditionMet;
      }

      if (shouldClear) {
        currentState.state = 'NORMAL';
        currentState.firstExceededAt = 0;
        this.ruleStates.set(stateKey, currentState);

        const recoveryEvent = {
          type: 'RECOVERY',
          ruleId: rule.id,
          ruleName: rule.name,
          deviceId,
          severity: rule.severity,
          timestamp
        };
        this.emit('recovery', recoveryEvent);
        return null;
      }

      // Check cooldown if already alerting
      return null;
    }

    // Handle NORMAL state evaluation
    if (conditionMet) {
      if (currentState.firstExceededAt === 0) {
        currentState.firstExceededAt = timestamp;
      }

      const violationDuration = timestamp - currentState.firstExceededAt;
      if (violationDuration < rule.minDurationMs) {
        // Debouncing / sustained duration not met yet
        this.ruleStates.set(stateKey, currentState);
        return null;
      }

      // Check cooldown
      const timeSinceLastTrigger = timestamp - currentState.lastTriggeredAt;
      if (rule.cooldownMs > 0 && timeSinceLastTrigger < rule.cooldownMs && currentState.lastTriggeredAt !== 0) {
        return null;
      }

      // Transition to ALERTING
      currentState.state = 'ALERTING';
      currentState.lastTriggeredAt = timestamp;
      this.ruleStates.set(stateKey, currentState);

      const alertEvent = {
        type: 'ALERT',
        ruleId: rule.id,
        ruleName: rule.name,
        deviceId,
        severity: rule.severity,
        timestamp,
        details: {
          violationDurationMs: violationDuration
        }
      };

      this.emit('alert', alertEvent);
      return alertEvent;
    } else {
      // Condition not met, reset duration tracker
      if (currentState.firstExceededAt !== 0) {
        currentState.firstExceededAt = 0;
        this.ruleStates.set(stateKey, currentState);
      }
      return null;
    }
  }

  /**
   * Evaluate a recursive condition AST node.
   */
  _evaluateNode(node, deviceId, timestamp) {
    if (!node || typeof node !== 'object') return false;

    // 1. Logical Combinators: AND, OR, NOT
    if (node.and && Array.isArray(node.and)) {
      return node.and.every(child => this._evaluateNode(child, deviceId, timestamp));
    }

    if (node.or && Array.isArray(node.or)) {
      return node.or.some(child => this._evaluateNode(child, deviceId, timestamp));
    }

    if (node.not) {
      return !this._evaluateNode(node.not, deviceId, timestamp);
    }

    // 2. Metric Comparison Clause
    // Example: { metric: 'temperature', operator: 'GT', value: 80, aggregation: 'avg', windowMs: 5000 }
    if (node.metric && node.operator) {
      const metricValue = this._extractMetricValue(node, deviceId, timestamp);
      if (metricValue === null || metricValue === undefined) return false;

      return this._compare(metricValue, node.operator, node.value);
    }

    return false;
  }

  _extractMetricValue(node, deviceId, timestamp) {
    const metric = node.metric;
    const agg = node.aggregation || 'latest';
    const windowMs = node.windowMs || 0;

    if (agg === 'latest' || windowMs <= 0) {
      const latest = this.buffer.getLatest(deviceId, metric);
      return latest ? latest.value : null;
    }

    return this.buffer.aggregate(deviceId, metric, agg, windowMs, timestamp);
  }

  _compare(left, operator, right) {
    switch (operator.toUpperCase()) {
      case 'GT':
      case '>':
        return left > right;

      case 'GTE':
      case '>=':
        return left >= right;

      case 'LT':
      case '<':
        return left < right;

      case 'LTE':
      case '<=':
        return left <= right;

      case 'EQ':
      case '===':
      case '==':
        return left === right;

      case 'NEQ':
      case '!==':
      case '!=':
        return left !== right;

      case 'BETWEEN':
        // right is expected to be [min, max]
        if (!Array.isArray(right) || right.length !== 2) return false;
        return left >= right[0] && left <= right[1];

      case 'OUTSIDE':
        if (!Array.isArray(right) || right.length !== 2) return false;
        return left < right[0] || left > right[1];

      default:
        throw new Error(`Unsupported comparison operator: ${operator}`);
    }
  }
}

module.exports = { RuleEvaluator };

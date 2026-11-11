class HeartbeatMonitor {
  constructor(timeoutMs = 30000) {
    this.timeoutMs = timeoutMs;
    this.lastSeen = new Map();
  }

  recordHeartbeat(deviceId, timestamp = Date.now()) {
    this.lastSeen.set(deviceId, timestamp);
  }

  checkStaleDevices(now = Date.now()) {
    const staleDevices = [];
    for (const [deviceId, lastTimestamp] of this.lastSeen.entries()) {
      if (now - lastTimestamp > this.timeoutMs) {
        staleDevices.push({
          deviceId,
          lastSeen: lastTimestamp,
          inactiveDurationMs: now - lastTimestamp
        });
      }
    }
    return staleDevices;
  }

  isDeviceAlive(deviceId, now = Date.now()) {
    const lastTimestamp = this.lastSeen.get(deviceId);
    if (!lastTimestamp) return false;
    return now - lastTimestamp <= this.timeoutMs;
  }
}

module.exports = { HeartbeatMonitor };

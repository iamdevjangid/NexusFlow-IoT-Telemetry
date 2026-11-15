/**
 * NexusFlow IoT Fleet Device Simulator
 * 
 * Generates synthetic, mathematically bounded sensor time-series with:
 * - Gaussian jitter and cyclic daily oscillation
 * - Realistic industrial asset profiles (turbofan, solar inverter, cold chain)
 * - Controlled anomaly injection for AST threshold and recovery testing
 */

const DEVICE_PROFILES = {
  turbofan: {
    metrics: {
      vibration_rms: { base: 4.5, jitter: 0.8, min: 0.5, max: 25.0, unit: 'mm/s' },
      exhaust_temp: { base: 640.0, jitter: 15.0, min: 400.0, max: 950.0, unit: '°C' },
      oil_pressure: { base: 45.0, jitter: 2.5, min: 10.0, max: 80.0, unit: 'PSI' },
      core_rpm: { base: 8200, jitter: 120, min: 5000, max: 10500, unit: 'RPM' }
    }
  },
  solar_inverter: {
    metrics: {
      ac_voltage: { base: 230.0, jitter: 3.5, min: 200.0, max: 260.0, unit: 'V' },
      grid_frequency: { base: 50.02, jitter: 0.08, min: 48.5, max: 51.5, unit: 'Hz' },
      inverter_temp: { base: 52.0, jitter: 4.0, min: 25.0, max: 95.0, unit: '°C' },
      active_power_kw: { base: 48.5, jitter: 5.0, min: 0.0, max: 60.0, unit: 'kW' }
    }
  },
  cold_chain: {
    metrics: {
      storage_temp: { base: -20.0, jitter: 1.2, min: -30.0, max: 10.0, unit: '°C' },
      relative_humidity: { base: 85.0, jitter: 3.0, min: 50.0, max: 99.0, unit: '%' },
      door_open_duration: { base: 0.0, jitter: 0.5, min: 0.0, max: 600.0, unit: 's' }
    }
  }
};

class DeviceSimulator {
  constructor() {
    this.profiles = DEVICE_PROFILES;
    this.anomalyQueue = new Map(); // key -> queue of forced values
    this.runningTimers = new Set();
  }

  /**
   * Inject a forced anomaly value into the next reading for a specific device and metric
   */
  injectAnomaly(deviceId, metric, forcedValue) {
    const key = `${deviceId}::${metric}`;
    if (!this.anomalyQueue.has(key)) {
      this.anomalyQueue.set(key, []);
    }
    this.anomalyQueue.get(key).push(forcedValue);
  }

  /**
   * Generate a single synthetic telemetry sample
   */
  generateSample(deviceId, profileName, metricKey) {
    const profile = this.profiles[profileName] || this.profiles.turbofan;
    const config = profile.metrics[metricKey];
    if (!config) {
      throw new Error(`Metric '${metricKey}' not found in profile '${profileName}'`);
    }

    const anomalyKey = `${deviceId}::${metricKey}`;
    if (this.anomalyQueue.has(anomalyKey) && this.anomalyQueue.get(anomalyKey).length > 0) {
      const forced = this.anomalyQueue.get(anomalyKey).shift();
      return {
        deviceId,
        profile: profileName,
        metric: metricKey,
        value: forced,
        unit: config.unit,
        isAnomaly: true,
        timestamp: Date.now()
      };
    }

    // Box-Muller Gaussian jitter
    const u1 = Math.random() || 0.0001;
    const u2 = Math.random() || 0.0001;
    const gaussian = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    let val = config.base + gaussian * config.jitter;
    val = Math.max(config.min, Math.min(config.max, val));

    return {
      deviceId,
      profile: profileName,
      metric: metricKey,
      value: parseFloat(val.toFixed(2)),
      unit: config.unit,
      isAnomaly: false,
      timestamp: Date.now()
    };
  }

  /**
   * Generate complete telemetry snapshot for a device across all its metrics
   */
  generateDeviceSnapshot(deviceId, profileName) {
    const profile = this.profiles[profileName] || this.profiles.turbofan;
    return Object.keys(profile.metrics).map(m => this.generateSample(deviceId, profileName, m));
  }

  /**
   * Generate a fleet batch across multiple devices
   */
  generateFleetBatch(devices = [
    { id: 'turbofan_alpha', profile: 'turbofan' },
    { id: 'inverter_beta', profile: 'solar_inverter' },
    { id: 'cold_storage_gamma', profile: 'cold_chain' }
  ]) {
    const batch = [];
    for (const dev of devices) {
      batch.push(...this.generateDeviceSnapshot(dev.id, dev.profile));
    }
    return batch;
  }

  /**
   * Start automated stream emission loop
   */
  startEmissionLoop({ intervalMs = 1000, devices, onEmit, maxTicks = Infinity }) {
    let tickCount = 0;
    const timer = setInterval(() => {
      tickCount++;
      const batch = this.generateFleetBatch(devices);
      if (typeof onEmit === 'function') {
        onEmit(batch);
      }
      if (tickCount >= maxTicks) {
        clearInterval(timer);
        this.runningTimers.delete(timer);
      }
    }, intervalMs);

    this.runningTimers.add(timer);
    return timer;
  }

  /**
   * Stop all active emission loops
   */
  stopAll() {
    for (const timer of this.runningTimers) {
      clearInterval(timer);
    }
    this.runningTimers.clear();
  }
}

module.exports = { DeviceSimulator, DEVICE_PROFILES };

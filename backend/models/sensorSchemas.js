const SENSOR_TYPES = {
  TEMPERATURE: 'temperature',
  PRESSURE: 'pressure',
  VIBRATION: 'vibration',
  POWER: 'power'
};

const METRIC_BOUNDS = {
  temperature: { min: -40, max: 200, unit: 'celsius' },
  pressure: { min: 0, max: 1000, unit: 'psi' },
  vibration: { min: 0, max: 50, unit: 'mm/s' },
  power: { min: 0, max: 10000, unit: 'watts' }
};

function validateTelemetryPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object' };
  }
  const { deviceId, metric, value } = payload;
  if (!deviceId || typeof deviceId !== 'string') {
    return { valid: false, error: 'Missing or invalid deviceId' };
  }
  if (!metric || typeof metric !== 'string') {
    return { valid: false, error: 'Missing or invalid metric name' };
  }
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: 'Value must be a valid numeric reading' };
  }
  return { valid: true, error: null };
}

module.exports = { SENSOR_TYPES, METRIC_BOUNDS, validateTelemetryPayload };

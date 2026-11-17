/**
 * Telemetry Exporter
 * Exports windowed historical telemetry samples into CSV and JSON formats.
 */
class TelemetryExporter {
  static toCSV(samples, options = {}) {
    if (!Array.isArray(samples) || samples.length === 0) {
      return 'timestamp,deviceId,metric,value\n';
    }
    const headers = options.headers || ['timestamp', 'deviceId', 'metric', 'value'];
    const rows = samples.map(sample => {
      const ts = sample.timestamp ? new Date(sample.timestamp).toISOString() : new Date().toISOString();
      return `${ts},"${sample.deviceId}","${sample.metric}",${Number(sample.value).toFixed(2)}`;
    });
    return [headers.join(','), ...rows].join('\n') + '\n';
  }

  static toFormattedJSON(samples, metadata = {}) {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      sampleCount: Array.isArray(samples) ? samples.length : 0,
      metadata,
      samples: samples || []
    }, null, 2);
  }
}

module.exports = { TelemetryExporter };

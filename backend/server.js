const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const fs = require('fs');
const os = require('os');
const { TelemetryPipeline } = require('./engine/telemetryPipeline');
const { MetricExporter } = require('./engine/metricExporter');
const { EventReplayEngine } = require('./engine/eventReplay');
const { DeadLetterQueue } = require('./engine/deadLetterQueue');
const { Downsampler } = require('./engine/downsampler');
const { CircuitBreaker } = require('./engine/circuitBreaker');
const { DeviceSimulator, DEVICE_PROFILES } = require('./simulator/deviceSimulator');
const { TelemetryExporter } = require('./engine/telemetryExporter');
const { HostMetricsSensor } = require('./engine/hostMetricsSensor');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const pipeline = new TelemetryPipeline();
const exporter = new MetricExporter();
const replayEngine = new EventReplayEngine();
const dlq = new DeadLetterQueue();
const circuitBreaker = new CircuitBreaker();
const simulator = new DeviceSimulator();
let isSimulatorActive = false;
let simulatorEmittedCount = 0;

// Host Machine Real Hardware Sensor
const hostSensor = new HostMetricsSensor({
  deviceId: 'edge_gateway_host_pc',
  intervalMs: 1000,
  onSample: async (batch) => {
    for (const sample of batch) {
      try {
        await pipeline.ingest(sample);
      } catch (err) {}
    }
  }
});

// Load default AST rules on startup
try {
  const rulesPath = path.join(__dirname, 'config/defaultRules.json');
  if (fs.existsSync(rulesPath)) {
    const raw = fs.readFileSync(rulesPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.rules && Array.isArray(parsed.rules)) {
      parsed.rules.forEach(rule => pipeline.registerRule(rule));
    }
  }
} catch (e) {
  console.warn('Default rules load note:', e.message);
}

function startAllTelemetryFeeds(intervalMs = 1200) {
  hostSensor.start();
  if (!isSimulatorActive) {
    isSimulatorActive = true;
    simulator.startEmissionLoop({
      intervalMs,
      onEmit: async (batch) => {
        for (const sample of batch) {
          simulatorEmittedCount++;
          try {
            await pipeline.ingest(sample);
          } catch (e) {}
        }
      }
    });
  }
}

function stopAllTelemetryFeeds() {
  if (isSimulatorActive) {
    simulator.stopAll();
    isSimulatorActive = false;
  }
  hostSensor.stop();
}

// Track Prometheus metrics on pipeline events
pipeline.on('telemetry', (event) => {
  exporter.incCounter('nexusflow_telemetry_ingested_total', { device_id: event.deviceId }, 1, 'Total telemetry events ingested');
  if (typeof event.value === 'number') {
    exporter.setGauge('nexusflow_sensor_latest_value', { device_id: event.deviceId, metric: event.metric }, event.value, 'Latest sensor metric value');
  }
});

pipeline.on('alert', (alert) => {
  exporter.incCounter('nexusflow_alerts_triggered_total', { severity: alert.severity, rule_id: alert.ruleId }, 1, 'Total alerts triggered');
});

const wss = new WebSocketServer({ server });

// Real-time WebSocket broadcasting
pipeline.on('telemetry', (event) => {
  const message = JSON.stringify({ type: 'TELEMETRY_UPDATE', data: event });
  broadcast(message);
});

pipeline.on('alert', (alert) => {
  const message = JSON.stringify({ type: 'ALERT_TRIGGERED', data: alert });
  broadcast(message);
});

pipeline.on('recovery', (event) => {
  const message = JSON.stringify({ type: 'ALERT_RECOVERED', data: event });
  broadcast(message);
});

function broadcast(payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  // Send initial summary state to newly connected client
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    data: {
      stats: pipeline.getStats(),
      devices: pipeline.getDevices()
    }
  }));

  ws.on('message', async (data) => {
    try {
      const payload = JSON.parse(data);
      if (payload.type === 'INGEST_TELEMETRY' && payload.data) {
        await pipeline.ingest(payload.data);
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
    }
  });
});

// REST API Endpoints

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NexusFlow IoT Telemetry & Rule Engine',
    timestamp: new Date().toISOString()
  });
});

// Ingest single or batch telemetry
app.post('/api/telemetry', async (req, res) => {
  try {
    const body = req.body;
    if (Array.isArray(body)) {
      const result = await pipeline.ingestBatch(body);
      return res.status(201).json({ count: result.length, data: result });
    }
    const result = await pipeline.ingest(body);
    res.status(201).json(result);
  } catch (err) {
    dlq.enqueue(req.body, 'INGESTION_ERROR', { error: err.message });
    res.status(400).json({ error: err.message, quarantined: true });
  }
});

// List tracked devices
app.get('/api/devices', (req, res) => {
  res.json({ devices: pipeline.getDevices() });
});

// Get device telemetry state
app.get('/api/devices/:id', (req, res) => {
  const device = pipeline.getDeviceState(req.params.id);
  if (!device) {
    return res.status(404).json({ error: `Device ${req.params.id} not found` });
  }
  res.json(device);
});

// Query metric history window
app.get('/api/devices/:id/metrics/:metric', (req, res) => {
  const { id, metric } = req.params;
  const windowMs = parseInt(req.query.windowMs, 10) || 60000;
  const samples = pipeline.buffer.getWindow(id, metric, windowMs);
  res.json({
    deviceId: id,
    metric,
    windowMs,
    count: samples.length,
    samples
  });
});

// Downsampled metric history query (LTTB, MinMax, TimeAggregate)
app.get('/api/devices/:id/metrics/:metric/downsampled', (req, res) => {
  const { id, metric } = req.params;
  const windowMs = parseInt(req.query.windowMs, 10) || 300000;
  const threshold = parseInt(req.query.threshold, 10) || 50;
  const algorithm = req.query.algorithm || 'lttb';

  const rawSamples = pipeline.buffer.getWindow(id, metric, windowMs);
  let processed = [];

  if (algorithm === 'minmax') {
    const chunkSize = Math.max(2, Math.floor(rawSamples.length / threshold));
    processed = Downsampler.minMax(rawSamples, chunkSize);
  } else if (algorithm === 'aggregate') {
    const bucketDurationMs = parseInt(req.query.bucketMs, 10) || 60000;
    processed = Downsampler.timeAggregate(rawSamples, bucketDurationMs);
  } else {
    processed = Downsampler.lttb(rawSamples, threshold);
  }

  res.json({
    deviceId: id,
    metric,
    algorithm,
    rawCount: rawSamples.length,
    downsampledCount: processed.length,
    points: processed
  });
});

// Rule management
app.get('/api/rules', (req, res) => {
  res.json({ rules: pipeline.getRules() });
});

app.post('/api/rules', (req, res) => {
  try {
    pipeline.registerRule(req.body);
    res.status(201).json({ success: true, rule: req.body });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/rules/:id', (req, res) => {
  try {
    pipeline.unregisterRule(req.params.id);
    res.json({ success: true, message: `Rule ${req.params.id} unregistered` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// IoT Fleet Simulator Controller
app.get('/api/simulator/status', (req, res) => {
  res.json({
    isRunning: isSimulatorActive,
    emittedCount: simulatorEmittedCount,
    profiles: Object.keys(DEVICE_PROFILES)
  });
});

app.post('/api/simulator/start', (req, res) => {
  const intervalMs = parseInt(req.body.intervalMs, 10) || 1200;
  startAllTelemetryFeeds(intervalMs);
  res.json({ success: true, message: 'All telemetry feeds started', intervalMs, isRunning: true });
});

app.post('/api/simulator/stop', (req, res) => {
  stopAllTelemetryFeeds();
  res.json({ success: true, message: 'All telemetry feeds stopped', isRunning: false });
});

app.post('/api/stream/pause', (req, res) => {
  stopAllTelemetryFeeds();
  res.json({ success: true, message: 'Telemetry stream paused', isRunning: false });
});

app.post('/api/stream/resume', (req, res) => {
  startAllTelemetryFeeds();
  res.json({ success: true, message: 'Telemetry stream resumed', isRunning: true });
});

app.post('/api/simulator/inject-anomaly', (req, res) => {
  const { deviceId, metric, value } = req.body;
  if (!deviceId || !metric || value === undefined) {
    return res.status(400).json({ error: 'deviceId, metric, and value are required' });
  }
  if (deviceId === hostSensor.deviceId) {
    hostSensor.injectAnomaly(metric, parseFloat(value));
    return res.json({ success: true, message: `Host hardware anomaly queued for ${metric} with value ${value}` });
  }
  simulator.injectAnomaly(deviceId, metric, parseFloat(value));
  res.json({ success: true, message: `Anomaly queued for ${deviceId}::${metric} with value ${value}` });
});

// Telemetry Export Endpoints (CSV / JSON)
app.get('/api/export/csv', (req, res) => {
  const windowMs = parseInt(req.query.windowMs, 10) || 3600000; // 1 hour default
  const samples = pipeline.buffer.getAllSamples ? pipeline.buffer.getAllSamples(windowMs) : [];
  const csv = TelemetryExporter.toCSV(samples);
  res.header('Content-Type', 'text/csv');
  res.attachment(`nexusflow-telemetry-${Date.now()}.csv`);
  res.send(csv);
});

app.get('/api/export/json', (req, res) => {
  const windowMs = parseInt(req.query.windowMs, 10) || 3600000;
  const samples = pipeline.buffer.getAllSamples ? pipeline.buffer.getAllSamples(windowMs) : [];
  const json = TelemetryExporter.toFormattedJSON(samples, {
    generator: 'NexusFlow IoT Engine',
    deviceCount: pipeline.getDevices().length
  });
  res.header('Content-Type', 'application/json');
  res.attachment(`nexusflow-telemetry-${Date.now()}.json`);
  res.send(json);
});

// Alert history
app.get('/api/alerts/history', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json({ history: pipeline.dispatcher.getHistory(limit) });
});

// Metrics summary and telemetry engine statistics
app.get('/api/metrics/summary', (req, res) => {
  res.json(pipeline.getStats());
});

// OpenMetrics / Prometheus metrics endpoint
app.get('/metrics', (req, res) => {
  exporter.setGauge('nexusflow_active_devices_count', {}, pipeline.getDevices().length, 'Count of active tracked devices');
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(exporter.toPrometheusFormat());
});

// Historical Event Replay endpoints
app.post('/api/replay/start', async (req, res) => {
  try {
    const { events, speedMultiplier } = req.body;
    if (events && Array.isArray(events)) {
      replayEngine.loadEvents(events);
    }
    replayEngine.start({
      speedMultiplier: speedMultiplier || 1.0,
      onEvent: async (event) => {
        await pipeline.ingest(event);
      }
    });
    res.json({ success: true, status: replayEngine.getStatus() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/replay/status', (req, res) => {
  res.json(replayEngine.getStatus());
});

app.post('/api/replay/pause', (req, res) => {
  replayEngine.pause();
  res.json({ success: true, status: replayEngine.getStatus() });
});

app.post('/api/replay/resume', (req, res) => {
  replayEngine.resume();
  res.json({ success: true, status: replayEngine.getStatus() });
});

app.post('/api/replay/stop', (req, res) => {
  replayEngine.stop();
  res.json({ success: true, status: replayEngine.getStatus() });
});

// Dead-Letter Queue (DLQ) Quarantine Endpoints
app.get('/api/dlq', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  res.json({
    metrics: dlq.getMetrics(),
    items: dlq.peek(limit)
  });
});

app.post('/api/dlq/:id/retry', async (req, res) => {
  try {
    const outcome = await dlq.retry(req.params.id, async (payload) => {
      return await pipeline.ingest(payload);
    });
    res.json(outcome);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.delete('/api/dlq', (req, res) => {
  const purged = dlq.purge(req.query.reason);
  res.json({ success: true, purgedCount: purged });
});

// Ingestion Circuit Breaker & Backpressure Endpoints
app.get('/api/circuit-breaker/status', (req, res) => {
  res.json(circuitBreaker.getStatus());
});

app.post('/api/circuit-breaker/reset', (req, res) => {
  circuitBreaker.reset();
  res.json({ success: true, status: circuitBreaker.getStatus() });
});

app.post('/api/circuit-breaker/trip', (req, res) => {
  circuitBreaker.trip();
  res.json({ success: true, status: circuitBreaker.getStatus() });
});

// Host Physical Machine Edge Sensor API
app.get('/api/host-sensor/status', (req, res) => {
  res.json({
    deviceId: hostSensor.deviceId,
    isRunning: hostSensor.isRunning,
    systemInfo: {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || 'Generic CPU',
      totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
      uptimeSeconds: Math.floor(os.uptime())
    }
  });
});

const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`NexusFlow engine running on port ${PORT}`);
    startAllTelemetryFeeds();
  });
}

module.exports = { app, server, pipeline };

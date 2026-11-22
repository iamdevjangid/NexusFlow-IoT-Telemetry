const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const { TelemetryPipeline } = require('./engine/telemetryPipeline');
const { MetricExporter } = require('./engine/metricExporter');
const { EventReplayEngine } = require('./engine/eventReplay');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const pipeline = new TelemetryPipeline();
const exporter = new MetricExporter();
const replayEngine = new EventReplayEngine();

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
    res.status(400).json({ error: err.message });
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

const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`NexusFlow engine running on port ${PORT}`);
  });
}

module.exports = { app, server, pipeline };

# NexusFlow: Visual IoT Telemetry & Rule Engine

A real-time telemetry processing, AST rule evaluation, and notification platform for connected IoT devices.

## Features
- **High-throughput Ring Buffer**: In-memory sliding-window buffer with statistical aggregations (mean, standard deviation, min/max, rate-of-change).
- **AST Rule Evaluator**: Declarative threshold, composite boolean (`AND`/`OR`), and sliding-window aggregation rules with hysteresis deadband recovery.
- **Multi-channel Alert Dispatcher**: Multi-destination notification routing with exponential backoff retries, rate limiting, and deduplication.
- **End-to-End Pipeline**: Ingestion pipeline tracking device registry state, heartbeats, and active metric feeds.
- **Prometheus / OpenMetrics Exporter**: Native `/metrics` exposition of counters and gauges for enterprise observability.
- **IoT Fleet Device Simulator**: Configurable synthetic time-series generator with Gaussian jitter and anomaly injection across turbofan, solar inverter, and cold-chain asset profiles.
- **Historical Event Replay Engine**: Post-mortem telemetry replayer with variable speed multipliers (1x–100x), pause/resume, and chronological seeking for offline AST rule validation.
- **Statistical Anomaly Detector**: Real-time Welford online variance and dynamic Z-score / MAD outlier detection.
- **Dead-Letter Queue (DLQ)**: Quarantines malformed or out-of-bounds telemetry payloads with operator retry capabilities.
- **LTTB Downsampler & Decimation Engine**: Preserves critical peaks, envelope geometry, and transient anomalies while reducing time-series density via Largest-Triangle-Three-Buckets and Min-Max decimation.
- **Real-time WebSocket Streaming**: Live broadcast of telemetry updates and critical threshold alerts to dashboard clients.

## Architecture
- `backend/engine/telemetryBuffer.js`: In-memory sliding-window ring buffer and aggregation functions.
- `backend/engine/ruleEvaluator.js`: Declarative AST rule evaluator with stateful hysteresis damping.
- `backend/engine/alertDispatcher.js`: Notification dispatcher with exponential backoff and rate limiting.
- `backend/engine/telemetryPipeline.js`: Coordinates streaming ingest, device registry, and alert triggers.
- `backend/engine/metricExporter.js`: OpenMetrics and Prometheus text exposition serializer.
- `backend/engine/anomalyDetector.js`: Statistical online Welford variance and Z-Score outlier detector.
- `backend/engine/downsampler.js`: Largest-Triangle-Three-Buckets (LTTB) and Min-Max time-series decimation.
- `backend/engine/deadLetterQueue.js`: Ingestion packet quarantine, metrics, and retry dispatcher.
- `backend/engine/eventReplay.js`: Historical time-series replay engine with speed controls and seek capabilities.
- `backend/simulator/deviceSimulator.js`: Synthetic fleet time-series generator with Gaussian jitter & anomaly injection.
- `backend/server.js`: Express REST API and WebSocket broadcast server.
- `tests/`: Automated unit and integration test suite (`node --test`).

## REST API Summary
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/telemetry` | Ingest single reading or batch telemetry array |
| `GET` | `/api/devices` | List registered IoT devices and active metrics |
| `GET` | `/api/devices/:id` | Get latest telemetry state snapshot for a device |
| `GET` | `/api/devices/:id/metrics/:metric` | Query windowed time-series samples |
| `GET` | `/api/devices/:id/metrics/:metric/downsampled` | Decimated time-series query (LTTB, Min-Max, Aggregate) |
| `GET` | `/api/rules` | List active evaluator rules |
| `POST` | `/api/rules` | Register a new declarative rule |
| `GET` | `/api/alerts/history` | Audit log of dispatched alerts |
| `GET` | `/api/metrics/summary` | Pipeline uptime, ingestion count, and alert statistics |
| `GET` | `/metrics` | Prometheus / OpenMetrics text exposition format |
| `POST` | `/api/replay/start` | Start historical telemetry playback through pipeline |
| `GET` | `/api/replay/status` | Current replay progress and cursor offset |
| `POST` | `/api/replay/pause` | Pause active replay execution |
| `POST` | `/api/replay/resume` | Resume paused replay execution |
| `POST` | `/api/replay/stop` | Stop replay and reset cursor |
| `GET` | `/api/dlq` | List quarantined payloads and failure breakdown |
| `POST` | `/api/dlq/:id/retry` | Re-submit quarantined packet to ingestion pipeline |
| `DELETE` | `/api/dlq` | Purge quarantined queue items |

## Running Tests
```bash
node --test tests/*.test.js
```

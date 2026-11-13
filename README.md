# NexusFlow: Visual IoT Telemetry & Rule Engine

A real-time telemetry processing, AST rule evaluation, and notification platform for connected IoT devices.

## Features
- **High-throughput Ring Buffer**: In-memory sliding-window buffer with statistical aggregations (mean, standard deviation, min/max, rate-of-change).
- **AST Rule Evaluator**: Declarative threshold, composite boolean (`AND`/`OR`), and sliding-window aggregation rules with hysteresis deadband recovery.
- **Multi-channel Alert Dispatcher**: Multi-destination notification routing with exponential backoff retries, rate limiting, and deduplication.
- **End-to-End Pipeline**: Ingestion pipeline tracking device registry state, heartbeats, and active metric feeds.
- **Real-time WebSocket Streaming**: Live broadcast of telemetry updates and critical threshold alerts to dashboard clients.

## Architecture
- `backend/engine/telemetryBuffer.js`: In-memory sliding-window ring buffer and aggregation functions.
- `backend/engine/ruleEvaluator.js`: Declarative AST rule evaluator with stateful hysteresis damping.
- `backend/engine/alertDispatcher.js`: Notification dispatcher with exponential backoff and rate limiting.
- `backend/engine/telemetryPipeline.js`: Coordinates streaming ingest, device registry, and alert triggers.
- `backend/server.js`: Express REST API and WebSocket broadcast server.
- `tests/`: Automated unit and integration test suite (`node --test`).

## REST API Summary
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/telemetry` | Ingest single reading or batch telemetry array |
| `GET` | `/api/devices` | List registered IoT devices and active metrics |
| `GET` | `/api/devices/:id` | Get latest telemetry state snapshot for a device |
| `GET` | `/api/devices/:id/metrics/:metric` | Query windowed time-series samples |
| `GET` | `/api/rules` | List active evaluator rules |
| `POST` | `/api/rules` | Register a new declarative rule |
| `GET` | `/api/alerts/history` | Audit log of dispatched alerts |
| `GET` | `/api/metrics/summary` | Pipeline uptime, ingestion count, and alert statistics |

## Running Tests
```bash
node --test tests/*.test.js
```

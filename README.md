# NexusFlow: Visual IoT Telemetry & Rule Engine

A real-time telemetry processing and visual rule execution platform for connected IoT devices.

## Features
- Real-time sensor telemetry ingestion via WebSocket and REST
- Configurable threshold rule evaluation engine with automated alert dispatch
- Device registry and state tracking
- Visual dashboard for live data telemetry streams

## Architecture
- `backend/server.js`: Express server and WebSocket telemetry stream handler
- `backend/models/`: MongoDB schemas for Devices, Telemetry, and Rule Alerts
- `backend/engine/`: Stream-processing rule engine for metric evaluations
- `backend/routes/`: REST endpoints for telemetry queries and device registration
- `frontend/`: Real-time visual monitoring dashboard

## Getting Started
```bash
npm install
npm start
```

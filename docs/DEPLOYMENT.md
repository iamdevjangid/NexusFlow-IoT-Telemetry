# NexusFlow Production Deployment Guide

## Overview
NexusFlow runs as an event-driven telemetry processing engine with WebSocket broadcast capability.

## Docker Deployment
```bash
docker-compose up -d
```

## Monitoring Endpoints
- Telemetry Ingestion Stats: `GET /api/metrics/summary`
- Prometheus Scraping: `GET /metrics`
- Real-time WebSocket: `ws://<host>:3000`

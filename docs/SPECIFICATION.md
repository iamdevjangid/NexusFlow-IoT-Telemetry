# NexusFlow Architecture & IoT Telemetry Protocol
## Overview
NexusFlow provides real-time streaming telemetry ingestion, AST-based rule evaluation, and automated alert dispatching for industrial edge devices.

## Pipeline Architecture
1. Ingestion: Edge devices stream sensor readings via HTTP REST and WebSockets.
2. Buffer & Analytics: Sliding-window memory buffers calculate moving statistics (mean, variance, slope).
3. Rule Engine: Declarative boolean threshold and rate-of-change rules with hysteresis deadband.
4. Dispatcher: Multi-channel notifications (webhooks, email, SMS) with exponential retry.

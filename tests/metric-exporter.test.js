const test = require('node:test');
const assert = require('node:assert/strict');
const { MetricExporter } = require('../backend/engine/metricExporter');

test('MetricExporter - tracks and increments monotonic counters', () => {
    const exporter = new MetricExporter();
    exporter.incCounter('nexusflow_telemetry_messages_total', { device_type: 'turbofan' }, 1, 'Total telemetry messages received');
    exporter.incCounter('nexusflow_telemetry_messages_total', { device_type: 'turbofan' }, 3);

    const val = exporter.getMetricValue('nexusflow_telemetry_messages_total', { device_type: 'turbofan' });
    assert.equal(val, 4);
});

test('MetricExporter - records and updates gauges', () => {
    const exporter = new MetricExporter();
    exporter.setGauge('nexusflow_active_devices', { region: 'ap-south-1' }, 12, 'Number of active connected devices');
    assert.equal(exporter.getMetricValue('nexusflow_active_devices', { region: 'ap-south-1' }), 12);

    exporter.setGauge('nexusflow_active_devices', { region: 'ap-south-1' }, 15);
    assert.equal(exporter.getMetricValue('nexusflow_active_devices', { region: 'ap-south-1' }), 15);
});

test('MetricExporter - exports valid Prometheus text exposition output', () => {
    const exporter = new MetricExporter();
    exporter.incCounter('nexusflow_ingest_total', { status: 'success' }, 10, 'Total ingestion count');
    exporter.setGauge('nexusflow_temperature_celsius', { sensor: 'core_temp' }, 68.5, 'Latest sensor reading');

    const output = exporter.toPrometheusFormat();
    assert.match(output, /# HELP nexusflow_ingest_total Total ingestion count/);
    assert.match(output, /# TYPE nexusflow_ingest_total counter/);
    assert.match(output, /nexusflow_ingest_total\{status="success"\} 10/);
    assert.match(output, /# HELP nexusflow_temperature_celsius Latest sensor reading/);
    assert.match(output, /# TYPE nexusflow_temperature_celsius gauge/);
    assert.match(output, /nexusflow_temperature_celsius\{sensor="core_temp"\} 68.5/);
});

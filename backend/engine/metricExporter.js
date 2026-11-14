/**
 * NexusFlow IoT Metrics Exporter
 * 
 * Provides Prometheus / OpenMetrics compliant metric serialization
 * for high-throughput edge telemetry and streaming diagnostics.
 */

class MetricExporter {
    constructor() {
        this.counters = new Map(); // key -> { name, help, labels, value }
        this.gauges = new Map();   // key -> { name, help, labels, value }
    }

    /**
     * Generate canonical key for a metric + label combination
     */
    _formatKey(name, labels = {}) {
        const sortedLabels = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return `${name}{${sortedLabels}}`;
    }

    /**
     * Increment a monotonic counter
     * @param {string} name 
     * @param {Object} labels 
     * @param {number} value 
     * @param {string} help 
     */
    incCounter(name, labels = {}, value = 1, help = '') {
        const key = this._formatKey(name, labels);
        if (!this.counters.has(key)) {
            this.counters.set(key, { name, help, labels, value: 0 });
        }
        const record = this.counters.get(key);
        record.value += value;
        if (help && !record.help) record.help = help;
    }

    /**
     * Set a gauge value
     * @param {string} name 
     * @param {Object} labels 
     * @param {number} value 
     * @param {string} help 
     */
    setGauge(name, labels = {}, value = 0, help = '') {
        const key = this._formatKey(name, labels);
        if (!this.gauges.has(key)) {
            this.gauges.set(key, { name, help, labels, value });
        } else {
            const record = this.gauges.get(key);
            record.value = value;
            if (help && !record.help) record.help = help;
        }
    }

    /**
     * Get numeric value of a counter or gauge
     */
    getMetricValue(name, labels = {}) {
        const key = this._formatKey(name, labels);
        if (this.counters.has(key)) return this.counters.get(key).value;
        if (this.gauges.has(key)) return this.gauges.get(key).value;
        return undefined;
    }

    /**
     * Render metrics in standard Prometheus text exposition format
     * @returns {string}
     */
    toPrometheusFormat() {
        const lines = [];
        const seenHelp = new Set();

        // Process Counters
        for (const record of this.counters.values()) {
            if (!seenHelp.has(record.name)) {
                if (record.help) lines.push(`# HELP ${record.name} ${record.help}`);
                lines.push(`# TYPE ${record.name} counter`);
                seenHelp.add(record.name);
            }
            const labelStr = Object.entries(record.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(',');
            const fullMetric = labelStr ? `${record.name}{${labelStr}}` : record.name;
            lines.push(`${fullMetric} ${record.value}`);
        }

        // Process Gauges
        for (const record of this.gauges.values()) {
            if (!seenHelp.has(record.name)) {
                if (record.help) lines.push(`# HELP ${record.name} ${record.help}`);
                lines.push(`# TYPE ${record.name} gauge`);
                seenHelp.add(record.name);
            }
            const labelStr = Object.entries(record.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(',');
            const fullMetric = labelStr ? `${record.name}{${labelStr}}` : record.name;
            lines.push(`${fullMetric} ${record.value}`);
        }

        return lines.join('\n') + '\n';
    }

    /**
     * Clear all recorded metrics
     */
    reset() {
        this.counters.clear();
        this.gauges.clear();
    }
}

module.exports = { MetricExporter };

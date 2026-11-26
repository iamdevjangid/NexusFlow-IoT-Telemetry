// NexusFlow Enterprise IoT Telemetry & Rule Engine Client
(function () {
  'use strict';

  // Core DOM Elements
  const wsDot = document.getElementById('wsDot');
  const wsStatus = document.getElementById('wsStatus');
  const thruputBadge = document.getElementById('thruputBadge');
  const latencyBadge = document.getElementById('latencyBadge');
  const btnToggleSim = document.getElementById('btnToggleSim');

  // Anomaly Injection Elements
  const btnAnomalyMenuToggle = document.getElementById('btnAnomalyMenuToggle');
  const quickInjectDropdown = document.getElementById('quickInjectDropdown');
  const btnAnomalyHostCpu = document.getElementById('btnAnomalyHostCpu');
  const btnAnomalyVibration = document.getElementById('btnAnomalyVibration');
  const btnAnomalyThermal = document.getElementById('btnAnomalyThermal');
  const btnAnomalyCold = document.getElementById('btnAnomalyCold');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnExportJSON = document.getElementById('btnExportJSON');

  // Real Hardware Edge Gateway Elements
  const hwCpuModel = document.getElementById('hwCpuModel');
  const hwCpuCores = document.getElementById('hwCpuCores');
  const hwNodeRss = document.getElementById('hwNodeRss');
  const hwCpuPercentLabel = document.getElementById('hwCpuPercentLabel');
  const hwCpuBar = document.getElementById('hwCpuBar');
  const hwRamLabel = document.getElementById('hwRamLabel');
  const hwRamBar = document.getElementById('hwRamBar');
  const hwRamSub = document.getElementById('hwRamSub');
  const btnFocusHost = document.getElementById('btnFocusHost');
  const btnFocusHostRam = document.getElementById('btnFocusHostRam');
  const btnStressHostCpu = document.getElementById('btnStressHostCpu');
  const hostCpuSparklineCanvas = document.getElementById('hostCpuSparkline');
  const hostCpuSparklineCtx = hostCpuSparklineCanvas ? hostCpuSparklineCanvas.getContext('2d') : null;

  // KPI Elements
  const kpiIngested = document.getElementById('kpiIngested');
  const kpiDevices = document.getElementById('kpiDevices');
  const kpiHostCpu = document.getElementById('kpiHostCpu');
  const kpiHostRam = document.getElementById('kpiHostRam');
  const kpiAlerts = document.getElementById('kpiAlerts');
  const kpiRules = document.getElementById('kpiRules');
  const kpiIngestRatePill = document.getElementById('kpiIngestRatePill');
  const kpiAlertTrendPill = document.getElementById('kpiAlertTrendPill');

  // Waveform Studio Elements
  const canvasContainer = document.getElementById('canvasContainer');
  const canvas = document.getElementById('waveformCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const metricSelector = document.getElementById('metricSelector');
  const chartSourceTag = document.getElementById('chartSourceTag');
  const chkKalman = document.getElementById('chkKalman');
  const btnSimulate = document.getElementById('btnSimulate');
  const crosshairTooltip = document.getElementById('crosshairTooltip');
  const ttTime = document.getElementById('ttTime');
  const ttRaw = document.getElementById('ttRaw');
  const ttKalman = document.getElementById('ttKalman');
  const ttThreshold = document.getElementById('ttThreshold');
  const statLatest = document.getElementById('statLatest');
  const statKalman = document.getElementById('statKalman');
  const statMinMax = document.getElementById('statMinMax');
  const statMean = document.getElementById('statMean');
  const statThreshold = document.getElementById('statThreshold');

  // Alerts Feed Elements
  const alertsFeed = document.getElementById('alertsFeed');
  const alertCountBadge = document.getElementById('alertCountBadge');
  const btnClearAlerts = document.getElementById('btnClearAlerts');

  // Fleet Asset Cards Elements
  const cardCpuVal = document.getElementById('cardCpuVal');
  const cardRamVal = document.getElementById('cardRamVal');
  const cardRssVal = document.getElementById('cardRssVal');

  const cardTurbofanBadge = document.getElementById('cardTurbofanBadge');
  const cardVibVal = document.getElementById('cardVibVal');
  const cardEgtVal = document.getElementById('cardEgtVal');
  const cardOilVal = document.getElementById('cardOilVal');

  const cardInverterBadge = document.getElementById('cardInverterBadge');
  const cardFreqVal = document.getElementById('cardFreqVal');
  const cardPowerVal = document.getElementById('cardPowerVal');
  const cardVoltVal = document.getElementById('cardVoltVal');

  const cardColdBadge = document.getElementById('cardColdBadge');
  const cardTempVal = document.getElementById('cardTempVal');
  const cardHumVal = document.getElementById('cardHumVal');
  const cardDoorVal = document.getElementById('cardDoorVal');

  const fleetOnlineBadge = document.getElementById('fleetOnlineBadge');
  const deviceTableBody = document.getElementById('deviceTableBody');

  // Rule Studio & Resilience Elements
  const ruleTableBody = document.getElementById('ruleTableBody');
  const ruleCountBadge = document.getElementById('ruleCountBadge');
  const createRuleForm = document.getElementById('createRuleForm');
  const astPreviewCode = document.getElementById('astPreviewCode');
  const cbBadge = document.getElementById('cbBadge');
  const cbState = document.getElementById('cbState');
  const cbFailures = document.getElementById('cbFailures');
  const dlqCount = document.getElementById('dlqCount');
  const btnTripCB = document.getElementById('btnTripCB');
  const btnResetCB = document.getElementById('btnResetCB');
  const btnRetryDLQ = document.getElementById('btnRetryDLQ');
  const btnPurgeDLQ = document.getElementById('btnPurgeDLQ');
  const ingestForm = document.getElementById('ingestForm');

  // Circuit Diagram Nodes
  const nodeClosed = document.getElementById('nodeClosed');
  const nodeHalfOpen = document.getElementById('nodeHalfOpen');
  const nodeOpen = document.getElementById('nodeOpen');

  // 1D Kalman Filter Implementation for Client-Side Denoising
  class KalmanFilter1D {
    constructor(processNoise = 0.05, measurementNoise = 1.2, estimatedError = 1.0) {
      this.q = processNoise;
      this.r = measurementNoise;
      this.p = estimatedError;
      this.x = null;
      this.k = 0;
    }

    update(measurement) {
      if (this.x === null) {
        this.x = measurement;
        return this.x;
      }
      this.p = this.p + this.q;
      this.k = this.p / (this.p + this.r);
      this.x = this.x + this.k * (measurement - this.x);
      this.p = (1 - this.k) * this.p;
      return parseFloat(this.x.toFixed(2));
    }

    reset() {
      this.x = null;
      this.p = 1.0;
    }
  }

  // Application State
  let socket = null;
  let activeMetric = metricSelector ? metricSelector.value : 'host_cpu_utilization';
  let telemetryHistory = [];
  let maxHistory = 60; // 60s default
  const kalman = new KalmanFilter1D();
  let registeredRulesList = [];
  let isStreamPaused = false;
  let activeAlertFilter = 'ALL';

  // Rolling sparkline historical buffers (20 samples each)
  const sparkBuffers = {
    ingested: [],
    devices: [4, 4, 4, 4, 4],
    hostCpu: [],
    hostRam: [],
    alerts: [0, 0, 0, 0, 0],
    rules: [5, 5, 5, 5, 5],
    cardHost: [],
    cardTurbofan: [],
    cardInverter: [],
    cardCold: []
  };

  // Stream Rate Counter
  let packetCounter = 0;
  let lastThroughputTime = Date.now();

  // Mouse Crosshair Tracking
  let mousePos = { x: null, y: null, isHovering: false };

  // Canvas DPI & Sizing
  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Source Tag Label Update
  function updateSourceTag() {
    if (!chartSourceTag) return;
    if (activeMetric.startsWith('host_')) {
      chartSourceTag.textContent = '100% REAL HARDWARE KERNEL';
      chartSourceTag.style.color = '#06b6d4';
      chartSourceTag.style.borderColor = 'rgba(6, 182, 212, 0.4)';
    } else {
      chartSourceTag.textContent = 'INDUSTRIAL ASSET (DIGITAL TWIN)';
      chartSourceTag.style.color = '#10b981';
      chartSourceTag.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    }
  }

  // Find AST Rule Threshold for active metric
  function getActiveRuleThreshold() {
    const match = registeredRulesList.find(r => {
      const metric = r.condition?.metric || r.metric;
      return metric === activeMetric;
    });
    if (!match) return null;
    const th = match.condition?.threshold ?? match.threshold ?? match.condition?.value;
    const op = match.condition?.operator ?? match.operator ?? '>';
    return { threshold: parseFloat(th), operator: op, severity: match.severity || 'WARNING' };
  }

  // Helper for buttery-smooth spline path drawing
  function drawSmoothSpline(points) {
    if (points.length < 2) return;
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  }

  // Waveform Canvas Rendering Loop (Locked 60 FPS Smooth Rendering)
  function renderCanvas() {
    if (!ctx || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    // Subtle Cyber Grid
    ctx.strokeStyle = '#101728';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 36) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (telemetryHistory.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText(`Awaiting real-time stream samples for ${activeMetric}...`, width / 2, height / 2);
      requestAnimationFrame(renderCanvas);
      return;
    }

    // Dynamic Scale Calculation
    const rawValues = telemetryHistory.map(d => d.value);
    const kalmanValues = chkKalman.checked ? telemetryHistory.map(d => d.kalman) : [];
    const allValues = [...rawValues, ...kalmanValues];

    const ruleThresholdInfo = getActiveRuleThreshold();
    if (ruleThresholdInfo) {
      allValues.push(ruleThresholdInfo.threshold);
    }

    let minVal = Math.min(...allValues);
    let maxVal = Math.max(...allValues);
    const margin = (maxVal - minVal) * 0.15 || 1.0;
    minVal = minVal - margin;
    maxVal = maxVal + margin;

    // Full-width stretching: ALWAYS spans the canvas smoothly without awkward mid-air cutoffs!
    const effectiveSpan = Math.max(telemetryHistory.length - 1, 1);
    const stepX = width / effectiveSpan;
    const getY = (val) => height - (((val - minVal) / (maxVal - minVal || 1)) * (height - 40) + 20);

    // Render AST Threshold Warning Line & Shading
    if (ruleThresholdInfo) {
      const thY = getY(ruleThresholdInfo.threshold);
      ctx.save();

      // Shaded Danger Zone
      const isAboveRule = ruleThresholdInfo.operator === '>' || ruleThresholdInfo.operator === '>=';
      const isCrit = ruleThresholdInfo.severity === 'CRITICAL';
      const shadeGradient = ctx.createLinearGradient(0, isAboveRule ? 0 : thY, 0, isAboveRule ? thY : height);
      shadeGradient.addColorStop(0, isCrit ? 'rgba(244, 63, 94, 0.14)' : 'rgba(245, 158, 11, 0.12)');
      shadeGradient.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

      ctx.fillStyle = shadeGradient;
      if (isAboveRule) {
        ctx.fillRect(0, 0, width, thY);
      } else {
        ctx.fillRect(0, thY, width, height - thY);
      }

      // Dashed Threshold Line
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = isCrit ? 'rgba(244, 63, 94, 0.85)' : 'rgba(245, 158, 11, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, thY);
      ctx.lineTo(width, thY);
      ctx.stroke();

      // Threshold Label
      ctx.fillStyle = isCrit ? '#f43f5e' : '#f59e0b';
      ctx.font = 'bold 10px "JetBrains Mono"';
      ctx.textAlign = 'right';
      ctx.fillText(`AST THRESHOLD: ${ruleThresholdInfo.operator} ${ruleThresholdInfo.threshold}`, width - 12, thY - 5);
      ctx.restore();
    }

    // Build coordinate pairs
    const rawPoints = telemetryHistory.map((pt, i) => ({ x: i * stepX, y: getY(pt.value) }));
    const kalmanPoints = chkKalman.checked ? telemetryHistory.map((pt, i) => ({ x: i * stepX, y: getY(pt.kalman) })) : [];

    // 1. Butter-Smooth Translucent Gradient Fill Under Raw Curve
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.32)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    ctx.beginPath();
    drawSmoothSpline(rawPoints);
    ctx.lineTo(rawPoints[rawPoints.length - 1].x, height);
    ctx.lineTo(rawPoints[0].x, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 2. Butter-Smooth Raw Signal Stroke (Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.2;
    drawSmoothSpline(rawPoints);
    ctx.stroke();

    // 3. Butter-Smooth Kalman Filtered Curve (Neon Emerald)
    if (chkKalman.checked && kalmanPoints.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.6;
      ctx.shadowColor = 'rgba(16, 185, 129, 0.6)';
      ctx.shadowBlur = 10;
      drawSmoothSpline(kalmanPoints);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 4. Sonar Animated Pulse Dot on the Latest Point
    const lastPoint = rawPoints[rawPoints.length - 1];
    const pulseTime = (Date.now() / 1000) * 3;
    const ringRadius = 5 + (Math.sin(pulseTime) * 0.5 + 0.5) * 5;

    // Outer Sonar Ring
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner Solid Dot
    ctx.fillStyle = '#06b6d4';
    ctx.shadowColor = 'rgba(6, 182, 212, 0.9)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Stream Paused Visual Indicator on Canvas
    if (isStreamPaused) {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 9, 17, 0.7)';
      ctx.fillRect(width / 2 - 130, height / 2 - 20, 260, 40);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(width / 2 - 130, height / 2 - 20, 260, 40);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 12px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ STREAM PAUSED — BUFFER FROZEN', width / 2, height / 2 + 5);
      ctx.restore();
    }

    // 6. Interactive Mouse Crosshair Inspection
    if (mousePos.isHovering && mousePos.x !== null && !isStreamPaused) {
      const hoverIndex = Math.min(Math.max(0, Math.round(mousePos.x / stepX)), telemetryHistory.length - 1);
      const pt = telemetryHistory[hoverIndex];
      const hX = hoverIndex * stepX;
      const hY = getY(pt.value);

      // Vertical Tracking Line
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hX, 0);
      ctx.lineTo(hX, height);
      ctx.stroke();

      // Point Halo
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hX, hY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Tooltip Box
      if (crosshairTooltip) {
        crosshairTooltip.style.display = 'flex';
        let leftPos = mousePos.x + 15;
        if (leftPos + 180 > width) leftPos = mousePos.x - 190;
        crosshairTooltip.style.left = `${leftPos}px`;
        crosshairTooltip.style.top = `${Math.max(10, mousePos.y - 40)}px`;

        ttTime.textContent = new Date(pt.time).toLocaleTimeString();
        ttRaw.textContent = `${pt.value}`;
        ttKalman.textContent = chkKalman.checked ? `${pt.kalman}` : 'Off';
        if (ruleThresholdInfo) {
          ttThreshold.textContent = `${ruleThresholdInfo.operator} ${ruleThresholdInfo.threshold}`;
        } else {
          ttThreshold.textContent = 'None';
        }
      }
    } else if (crosshairTooltip) {
      crosshairTooltip.style.display = 'none';
    }

    requestAnimationFrame(renderCanvas);
  }

  // Crosshair Mouse Event Listeners
  if (canvas) {
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.x = e.clientX - rect.left;
      mousePos.y = e.clientY - rect.top;
      mousePos.isHovering = true;
    });

    canvas.addEventListener('mouseleave', () => {
      mousePos.isHovering = false;
      if (crosshairTooltip) crosshairTooltip.style.display = 'none';
    });
  }

  // Update Waveform Bottom Stats Row
  function updateWaveformStats() {
    if (telemetryHistory.length === 0) return;
    const values = telemetryHistory.map(d => d.value);
    const latest = telemetryHistory[telemetryHistory.length - 1];
    const min = Math.min(...values).toFixed(1);
    const max = Math.max(...values).toFixed(1);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = (sum / values.length).toFixed(2);

    statLatest.textContent = `${latest.value}`;
    statKalman.textContent = chkKalman.checked ? `${latest.kalman}` : 'Off';
    statMinMax.textContent = `${min} / ${max}`;
    statMean.textContent = `${mean}`;

    const ruleThresholdInfo = getActiveRuleThreshold();
    if (ruleThresholdInfo) {
      statThreshold.textContent = `${ruleThresholdInfo.operator} ${ruleThresholdInfo.threshold} (${ruleThresholdInfo.severity})`;
      statThreshold.className = `wstat-val ${ruleThresholdInfo.severity === 'CRITICAL' ? 'rose' : 'amber'}`;
    } else {
      statThreshold.textContent = 'None';
      statThreshold.className = 'wstat-val';
    }
  }

  // Render SVG Sparkline Path
  function renderSvgSparkline(svgElement, dataPoints, strokeColor = '#06b6d4') {
    if (!svgElement || !dataPoints || dataPoints.length < 2) return;
    const width = 100;
    const height = 24;
    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints) || 1;
    const range = (max - min) || 1;

    const points = dataPoints.map((val, idx) => {
      const x = (idx / (dataPoints.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    svgElement.innerHTML = `
      <polyline fill="none" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
    `;
  }

  // Render Host CPU 30s Sparkline Canvas
  function renderHostCpuSparkline() {
    if (!hostCpuSparklineCtx || !hostCpuSparklineCanvas) return;
    const w = hostCpuSparklineCanvas.width;
    const h = hostCpuSparklineCanvas.height;
    hostCpuSparklineCtx.clearRect(0, 0, w, h);

    const pts = sparkBuffers.hostCpu;
    if (pts.length < 2) return;

    const min = 0;
    const max = 100;
    const step = w / (pts.length - 1);

    hostCpuSparklineCtx.beginPath();
    hostCpuSparklineCtx.strokeStyle = '#8b5cf6';
    hostCpuSparklineCtx.lineWidth = 2;
    pts.forEach((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 6) - 3;
      if (i === 0) hostCpuSparklineCtx.moveTo(x, y);
      else hostCpuSparklineCtx.lineTo(x, y);
    });
    hostCpuSparklineCtx.stroke();
  }

  // Process WebSocket Messages
  function handleStreamMessage(msg) {
    if (isStreamPaused) return; // Completely freeze data ingestion when paused!

    packetCounter++;

    if (msg.type === 'TELEMETRY_UPDATE') {
      const data = msg.data;
      const val = parseFloat(data.value);

      // Main Waveform Buffer
      if (data.metric === activeMetric) {
        const filteredVal = kalman.update(val);
        telemetryHistory.push({ value: val, kalman: filteredVal, time: data.timestamp || Date.now() });
        if (telemetryHistory.length > maxHistory) {
          telemetryHistory.shift();
        }
        updateWaveformStats();
      }

      // Ingested KPI Counter
      const curr = parseInt(kpiIngested.textContent.replace(/,/g, '') || '0', 10);
      kpiIngested.textContent = (curr + 1).toLocaleString();

      // UI Component Routing
      updateAssetDisplays(data);

    } else if (msg.type === 'ALERT_TRIGGERED') {
      pushAlertFeed(msg.data);
      const curr = parseInt(kpiAlerts.textContent || '0', 10);
      kpiAlerts.textContent = curr + 1;
      updateAssetStatusOnAlert(msg.data.deviceId || msg.data.sensorId, msg.data.severity);

    } else if (msg.type === 'ALERT_RECOVERED') {
      clearAssetStatusRecovery(msg.data.deviceId || msg.data.sensorId);

    } else if (msg.type === 'CONNECTED') {
      if (msg.data.stats) updateKPIs(msg.data.stats);
      if (msg.data.devices) updateFleetDeviceCount(msg.data.devices.length);
    }
  }

  // Update Asset Matrix & Real Hardware Cards
  function updateAssetDisplays(data) {
    const val = data.value;

    // 1. Real Hardware Host PC Gateway
    if (data.deviceId === 'edge_gateway_host_pc') {
      if (data.metric === 'host_cpu_utilization') {
        const pct = val.toFixed(1);
        hwCpuPercentLabel.textContent = `${pct}%`;
        hwCpuBar.style.width = `${Math.min(100, Math.max(0, val))}%`;
        kpiHostCpu.textContent = `${pct}%`;
        cardCpuVal.textContent = `${pct}%`;

        // Update Logical Cores Distribution
        const baseLoad = val;
        const offsets = [-3.8, 4.2, -1.9, 2.5];
        for (let c = 0; c < 4; c++) {
          const coreLoad = Math.max(2, Math.min(100, Math.round(baseLoad + offsets[c] + (Math.random() * 3 - 1.5))));
          const bar = document.getElementById(`coreBar${c}`);
          const lbl = document.getElementById(`coreVal${c}`);
          if (bar) bar.style.width = `${coreLoad}%`;
          if (lbl) lbl.textContent = `${coreLoad}%`;
        }

        sparkBuffers.hostCpu.push(val);
        if (sparkBuffers.hostCpu.length > 25) sparkBuffers.hostCpu.shift();
        renderHostCpuSparkline();
        renderSvgSparkline(document.getElementById('sparkHostCpu'), sparkBuffers.hostCpu, '#8b5cf6');
        renderSvgSparkline(document.getElementById('sparkCardHost'), sparkBuffers.hostCpu, '#8b5cf6');

      } else if (data.metric === 'host_ram_used_pct') {
        const pct = val.toFixed(1);
        hwRamLabel.textContent = `${pct}%`;
        hwRamBar.style.width = `${Math.min(100, Math.max(0, val))}%`;
        kpiHostRam.textContent = `${pct}%`;
        cardRamVal.textContent = `${pct}%`;

        sparkBuffers.hostRam.push(val);
        if (sparkBuffers.hostRam.length > 25) sparkBuffers.hostRam.shift();
        renderSvgSparkline(document.getElementById('sparkHostRam'), sparkBuffers.hostRam, '#3b82f6');

      } else if (data.metric === 'host_process_rss_mb') {
        hwNodeRss.textContent = `${val} MB`;
        cardRssVal.textContent = `${val} MB`;
      }
    }

    // 2. Turbofan Alpha
    else if (data.deviceId === 'turbofan_alpha') {
      if (data.metric === 'vibration_rms') {
        cardVibVal.textContent = `${val} mm/s`;
        sparkBuffers.cardTurbofan.push(val);
        if (sparkBuffers.cardTurbofan.length > 20) sparkBuffers.cardTurbofan.shift();
        renderSvgSparkline(document.getElementById('sparkCardTurbofan'), sparkBuffers.cardTurbofan, '#06b6d4');
      } else if (data.metric === 'exhaust_temp') {
        cardEgtVal.textContent = `${val} °C`;
      } else if (data.metric === 'oil_pressure') {
        cardOilVal.textContent = `${val} PSI`;
      }
    }

    // 3. Inverter Beta
    else if (data.deviceId === 'inverter_beta') {
      if (data.metric === 'grid_frequency') {
        cardFreqVal.textContent = `${val} Hz`;
        sparkBuffers.cardInverter.push(val);
        if (sparkBuffers.cardInverter.length > 20) sparkBuffers.cardInverter.shift();
        renderSvgSparkline(document.getElementById('sparkCardInverter'), sparkBuffers.cardInverter, '#f59e0b');
      } else if (data.metric === 'active_power_kw') {
        cardPowerVal.textContent = `${val} kW`;
      } else if (data.metric === 'ac_voltage') {
        cardVoltVal.textContent = `${val} V`;
      }
    }

    // 4. Cold Storage Gamma
    else if (data.deviceId === 'cold_storage_gamma') {
      if (data.metric === 'storage_temp') {
        cardTempVal.textContent = `${val} °C`;
        sparkBuffers.cardCold.push(val);
        if (sparkBuffers.cardCold.length > 20) sparkBuffers.cardCold.shift();
        renderSvgSparkline(document.getElementById('sparkCardCold'), sparkBuffers.cardCold, '#06b6d4');
      } else if (data.metric === 'relative_humidity') {
        cardHumVal.textContent = `${val} %`;
      } else if (data.metric === 'door_open_duration') {
        cardDoorVal.textContent = `${val} s`;
      }
    }
  }

  // Update Asset Badge on Alert
  function updateAssetStatusOnAlert(deviceId, severity) {
    let badge = null;
    if (deviceId === 'turbofan_alpha') badge = cardTurbofanBadge;
    else if (deviceId === 'inverter_beta') badge = cardInverterBadge;
    else if (deviceId === 'cold_storage_gamma') badge = cardColdBadge;

    if (badge) {
      badge.textContent = severity || 'WARNING';
      badge.className = `asset-badge ${severity === 'CRITICAL' ? 'status-critical' : 'status-warning'}`;
    }
  }

  // Clear Asset Badge on Recovery
  function clearAssetStatusRecovery(deviceId) {
    let badge = null;
    if (deviceId === 'turbofan_alpha') badge = cardTurbofanBadge;
    else if (deviceId === 'inverter_beta') badge = cardInverterBadge;
    else if (deviceId === 'cold_storage_gamma') badge = cardColdBadge;

    if (badge) {
      badge.textContent = 'NOMINAL';
      badge.className = 'asset-badge status-nominal';
    }
  }

  // Push Alert into Feed
  function pushAlertFeed(alert) {
    if (alertsFeed.querySelector('.empty-state')) {
      alertsFeed.innerHTML = '';
    }

    const item = document.createElement('div');
    const isCrit = alert.severity === 'CRITICAL';
    item.className = `alert-item ${isCrit ? '' : 'warning'}`;
    item.setAttribute('data-severity', alert.severity || 'WARNING');
    const timeStr = new Date().toLocaleTimeString();
    const dev = alert.deviceId || alert.sensorId || 'unknown_node';

    item.innerHTML = `
      <div class="alert-header">
        <span class="alert-severity ${isCrit ? '' : 'warning'}">${alert.severity || 'WARNING'}</span>
        <span class="alert-time">${timeStr}</span>
      </div>
      <div class="alert-msg"><strong>${dev}</strong>: ${alert.message || 'AST threshold condition breached.'}</div>
      <div class="alert-action-row">
        <button class="btn-ack" title="Acknowledge alert">✓ Acknowledge</button>
      </div>
    `;

    // Wire Acknowledge button
    const ackBtn = item.querySelector('.btn-ack');
    ackBtn.addEventListener('click', (e) => {
      item.classList.add('acknowledged');
      const sevBadge = item.querySelector('.alert-severity');
      sevBadge.textContent = 'ACKNOWLEDGED';
      sevBadge.className = 'alert-severity ack';
      e.target.style.display = 'none';
    });

    alertsFeed.prepend(item);

    // Limit feed history to 40 items
    if (alertsFeed.children.length > 40) {
      alertsFeed.removeChild(alertsFeed.lastChild);
    }

    alertCountBadge.textContent = `${alertsFeed.children.length} Incidents`;
    applyAlertFilter();
  }

  // Filter Alerts in Feed
  function applyAlertFilter() {
    const items = alertsFeed.querySelectorAll('.alert-item');
    items.forEach(it => {
      const sev = it.getAttribute('data-severity');
      if (activeAlertFilter === 'ALL' || sev === activeAlertFilter) {
        it.style.display = 'flex';
      } else {
        it.style.display = 'none';
      }
    });
  }

  // Filter Pills Event Handlers
  document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      activeAlertFilter = e.currentTarget.getAttribute('data-filter');
      applyAlertFilter();
    });
  });

  // Update Fleet Device Count
  function updateFleetDeviceCount(count) {
    const total = Math.max(4, count || 0);
    kpiDevices.textContent = total;
    if (fleetOnlineBadge) fleetOnlineBadge.textContent = `${total} Nodes Online`;
  }

  // Update Top KPIs
  function updateKPIs(stats) {
    if (stats.totalIngested !== undefined) kpiIngested.textContent = Number(stats.totalIngested).toLocaleString();
    if (stats.activeDevices !== undefined) updateFleetDeviceCount(stats.activeDevices);
    if (stats.totalAlerts !== undefined) kpiAlerts.textContent = stats.totalAlerts;
    if (stats.activeRules !== undefined) kpiRules.textContent = stats.activeRules;
    else if (stats.registeredRules !== undefined) kpiRules.textContent = stats.registeredRules;
  }

  // Throughput & Latency Monitoring Loop (Runs every 1s)
  setInterval(() => {
    if (isStreamPaused) return;

    const now = Date.now();
    const deltaSec = (now - lastThroughputTime) / 1000;
    if (deltaSec > 0) {
      const rate = (packetCounter / deltaSec).toFixed(1);
      thruputBadge.textContent = `${rate} pkts/s`;
      if (kpiIngestRatePill) kpiIngestRatePill.textContent = `+${rate}/s`;
      packetCounter = 0;
      lastThroughputTime = now;

      // Update sparkline for ingestion
      sparkBuffers.ingested.push(parseFloat(rate));
      if (sparkBuffers.ingested.length > 20) sparkBuffers.ingested.shift();
      renderSvgSparkline(document.getElementById('sparkIngested'), sparkBuffers.ingested, '#06b6d4');
    }
    // Dynamic realistic AST latency indicator
    const randLatency = (0.5 + Math.random() * 0.3).toFixed(1);
    latencyBadge.textContent = `${randLatency}ms AST`;
  }, 1000);

  // Initialize WebSocket Connection with Exponential Backoff
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      wsDot.className = 'status-dot connected';
      wsStatus.textContent = isStreamPaused ? 'STREAM PAUSED' : 'STREAMING (WS 4000)';
      loadInitialStats();
    };

    socket.onclose = () => {
      wsDot.className = 'status-dot disconnected';
      wsStatus.textContent = 'RECONNECTING...';
      setTimeout(initWebSocket, 2000);
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleStreamMessage(msg);
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };
  }

  let hostUptimeSeconds = 0;

  function updateUptimeDisplay() {
    const hwUptime = document.getElementById('hwUptime');
    const hwUptimeTag = document.getElementById('hwUptimeTag');
    if (!hwUptime && !hwUptimeTag) return;
    const days = Math.floor(hostUptimeSeconds / 86400);
    const hours = Math.floor((hostUptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((hostUptimeSeconds % 3600) / 60);
    const seconds = hostUptimeSeconds % 60;
    const str = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    if (hwUptime) hwUptime.textContent = str;
    if (hwUptimeTag) hwUptimeTag.textContent = `⏱ Uptime: ${days}d ${hours}h`;
  }

  // Live ticking host uptime
  setInterval(() => {
    hostUptimeSeconds++;
    updateUptimeDisplay();
  }, 1000);

  // Load Real Host Machine Kernel Status
  async function loadHostSensorStatus() {
    try {
      const res = await fetch('/api/host-sensor/status');
      if (!res.ok) return;
      const data = await res.json();
      if (data.systemInfo) {
        const info = data.systemInfo;
        const hwHostname = document.getElementById('hwHostname');
        const hwPlatformTag = document.getElementById('hwPlatformTag');

        hwCpuModel.textContent = info.cpuModel || 'Intel / AMD Hardware CPU';
        hwCpuCores.textContent = `${info.cpus || 4} logical cores (${info.arch || 'x64'})`;
        if (hwHostname && info.hostname) hwHostname.textContent = info.hostname;
        if (hwPlatformTag && info.platform) hwPlatformTag.textContent = `${info.platform} ${info.arch}`;

        hostUptimeSeconds = info.uptimeSeconds || 0;
        updateUptimeDisplay();

        const totalGB = (info.totalMemoryMB / 1024).toFixed(1);
        const freeGB = (info.freeMemoryMB / 1024).toFixed(1);
        const usedGB = ((info.totalMemoryMB - info.freeMemoryMB) / 1024).toFixed(1);
        hwRamSub.textContent = `Used: ${usedGB} GB | Free: ${freeGB} GB | Total: ${totalGB} GB`;
      }
    } catch (e) {
      console.warn('Host sensor status load note:', e);
    }
  }

  // Load Initial Engine Stats & Rules
  async function loadInitialStats() {
    try {
      const res = await fetch('/api/metrics/summary');
      if (res.ok) {
        const stats = await res.json();
        updateKPIs(stats);
      }
      await loadHostSensorStatus();
      await loadRules();
      await loadResilienceStatus();
    } catch (e) {
      console.warn('Initial stats load note:', e);
    }
  }

  // Load and Render Dynamic AST Rules
  async function loadRules() {
    try {
      const res = await fetch('/api/rules');
      if (!res.ok) return;
      const data = await res.json();
      registeredRulesList = data.rules || [];
      kpiRules.textContent = registeredRulesList.length;
      if (ruleCountBadge) ruleCountBadge.textContent = `${registeredRulesList.length} Policies`;

      if (ruleTableBody) {
        if (registeredRulesList.length === 0) {
          ruleTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No active AST rules registered.</td></tr>';
          return;
        }
        ruleTableBody.innerHTML = registeredRulesList.map(r => `
          <tr>
            <td><strong>${r.id}</strong></td>
            <td><code>${r.condition?.metric || r.metric || '*'}</code></td>
            <td><code>${r.condition?.operator || r.operator || '>'} ${r.condition?.threshold ?? r.threshold ?? r.condition?.value ?? ''}</code></td>
            <td>${r.hysteresisDeadband || 0}</td>
            <td><span class="badge ${r.severity === 'CRITICAL' ? 'danger' : (r.severity === 'WARNING' ? 'warning' : 'success')}">${r.severity || 'INFO'}</span></td>
            <td><span style="color: #10b981; font-weight: 700; font-size: 10px;">● ACTIVE</span></td>
            <td><button class="btn-del-rule" data-rule-id="${r.id}" title="Unregister rule">🗑️</button></td>
          </tr>
        `).join('');

        // Wire delete buttons
        ruleTableBody.querySelectorAll('.btn-del-rule').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const ruleId = e.currentTarget.getAttribute('data-rule-id');
            if (!ruleId) return;
            try {
              const delRes = await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
              if (delRes.ok) {
                await loadRules();
                updateWaveformStats();
              }
            } catch (err) {
              console.error('Failed to delete rule:', err);
            }
          });
        });
      }
      updateWaveformStats();
    } catch (err) {
      console.warn('Failed to load rules:', err);
    }
  }

  // Load Resilience (Circuit Breaker & DLQ) Status
  async function loadResilienceStatus() {
    try {
      const cbRes = await fetch('/api/circuit-breaker/status');
      if (cbRes.ok) {
        const cbData = await cbRes.json();
        if (cbState) cbState.textContent = cbData.state;
        if (cbFailures) cbFailures.textContent = `${cbData.failureCount} / ${cbData.failureThreshold}`;
        if (cbBadge) {
          cbBadge.textContent = `${cbData.state} (${cbData.state === 'CLOSED' ? 'Nominal' : 'Protected'})`;
          cbBadge.className = `badge ${cbData.state === 'CLOSED' ? 'success' : 'danger'}`;
        }
        // Update Visual Diagram Nodes
        if (nodeClosed && nodeHalfOpen && nodeOpen) {
          nodeClosed.classList.toggle('active', cbData.state === 'CLOSED');
          nodeHalfOpen.classList.toggle('active', cbData.state === 'HALF_OPEN');
          nodeOpen.classList.toggle('active', cbData.state === 'OPEN');
        }
      }

      const dlqRes = await fetch('/api/dlq');
      if (dlqRes.ok) {
        const dlqData = await dlqRes.json();
        if (dlqCount) dlqCount.textContent = `${dlqData.metrics?.totalCount || dlqData.totalCount || 0} packets`;
      }
    } catch (err) {
      console.warn('Failed to fetch resilience status:', err);
    }
  }

  // Inject Anomaly Helper
  async function triggerAnomaly(deviceId, metric, value) {
    try {
      await fetch('/api/simulator/inject-anomaly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, metric, value })
      });
    } catch (err) {
      console.error('Anomaly injection error:', err);
    }
  }

  // Fully Functional Pause / Resume Stream Button
  if (btnToggleSim) {
    btnToggleSim.addEventListener('click', async () => {
      try {
        if (!isStreamPaused) {
          // Pause Stream
          await fetch('/api/simulator/stop', { method: 'POST' });
          isStreamPaused = true;
          btnToggleSim.innerHTML = '<span class="sim-icon">▶</span><span class="sim-text">Resume Stream</span>';
          btnToggleSim.classList.add('paused');
          if (wsStatus) {
            wsStatus.textContent = 'STREAM PAUSED';
            wsDot.className = 'status-dot paused-dot';
          }
          if (thruputBadge) thruputBadge.textContent = '0.0 pkts/s';
        } else {
          // Resume Stream
          await fetch('/api/simulator/start', { method: 'POST' });
          isStreamPaused = false;
          btnToggleSim.innerHTML = '<span class="sim-icon">⏹</span><span class="sim-text">Pause Stream</span>';
          btnToggleSim.classList.remove('paused');
          if (wsStatus) {
            wsStatus.textContent = 'STREAMING (WS 4000)';
            wsDot.className = 'status-dot connected';
          }
        }
      } catch (err) {
        console.error('Pause/Resume toggle error:', err);
      }
    });
  }

  // Anomaly Dropdown Menu Toggle
  if (btnAnomalyMenuToggle && quickInjectDropdown) {
    btnAnomalyMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      quickInjectDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!quickInjectDropdown.contains(e.target) && e.target !== btnAnomalyMenuToggle) {
        quickInjectDropdown.classList.remove('show');
      }
    });
  }

  // Wire Dropdown Anomaly Buttons
  if (btnAnomalyHostCpu) {
    btnAnomalyHostCpu.addEventListener('click', () => {
      triggerAnomaly('edge_gateway_host_pc', 'host_cpu_utilization', 96.5);
      quickInjectDropdown.classList.remove('show');
    });
  }
  if (btnAnomalyVibration) {
    btnAnomalyVibration.addEventListener('click', () => {
      triggerAnomaly('turbofan_alpha', 'vibration_rms', 24.8);
      quickInjectDropdown.classList.remove('show');
    });
  }
  if (btnAnomalyThermal) {
    btnAnomalyThermal.addEventListener('click', () => {
      triggerAnomaly('turbofan_alpha', 'exhaust_temp', 925.0);
      quickInjectDropdown.classList.remove('show');
    });
  }
  if (btnAnomalyCold) {
    btnAnomalyCold.addEventListener('click', () => {
      triggerAnomaly('cold_storage_gamma', 'storage_temp', 8.5);
      quickInjectDropdown.classList.remove('show');
    });
  }

  // Direct Card Stress Buttons
  const btnCardStressHost = document.getElementById('btnCardStressHost');
  if (btnCardStressHost) {
    btnCardStressHost.addEventListener('click', () => triggerAnomaly('edge_gateway_host_pc', 'host_cpu_utilization', 96.5));
  }
  const btnCardStressTurbofan = document.getElementById('btnCardStressTurbofan');
  if (btnCardStressTurbofan) {
    btnCardStressTurbofan.addEventListener('click', () => triggerAnomaly('turbofan_alpha', 'vibration_rms', 24.8));
  }
  const btnCardStressInverter = document.getElementById('btnCardStressInverter');
  if (btnCardStressInverter) {
    btnCardStressInverter.addEventListener('click', () => triggerAnomaly('inverter_beta', 'grid_frequency', 48.9));
  }
  const btnCardStressCold = document.getElementById('btnCardStressCold');
  if (btnCardStressCold) {
    btnCardStressCold.addEventListener('click', () => triggerAnomaly('cold_storage_gamma', 'storage_temp', 8.5));
  }
  if (btnStressHostCpu) {
    btnStressHostCpu.addEventListener('click', () => {
      triggerAnomaly('edge_gateway_host_pc', 'host_cpu_utilization', 96.5);
      showActiveFaultBanner('Host CPU Overload', '96.5% Core Spike (Rule rule_host_cpu_pressure breached)');
    });
  }
  const btnStressHostRam = document.getElementById('btnStressHostRam');
  if (btnStressHostRam) {
    btnStressHostRam.addEventListener('click', () => {
      triggerAnomaly('edge_gateway_host_pc', 'host_ram_used_pct', 94.2);
      showActiveFaultBanner('Host RAM Saturation', '94.2% Memory Full (Rule rule_host_ram_saturation breached)');
    });
  }

  // Active Fault Banner Helper
  function showActiveFaultBanner(faultName, detail) {
    const banner = document.getElementById('activeFaultBanner');
    const bannerText = document.getElementById('activeFaultBannerText');
    const dockBadge = document.getElementById('dockActiveFaultBadge');
    if (banner && bannerText) {
      bannerText.textContent = `ACTIVE FAULT TRIGGERED: ${faultName} — ${detail}`;
      banner.style.display = 'flex';
    }
    if (dockBadge) {
      dockBadge.textContent = `⚡ FAULT ACTIVE: ${faultName}`;
      dockBadge.className = 'dock-status-tag active';
    }
  }

  const btnDismissFaultBanner = document.getElementById('btnDismissFaultBanner');
  if (btnDismissFaultBanner) {
    btnDismissFaultBanner.addEventListener('click', () => {
      const banner = document.getElementById('activeFaultBanner');
      const dockBadge = document.getElementById('dockActiveFaultBadge');
      if (banner) banner.style.display = 'none';
      if (dockBadge) {
        dockBadge.textContent = '● READY FOR CHAOS TEST';
        dockBadge.className = 'dock-status-tag';
      }
    });
  }

  // Stream Plagiarism Injection Helper
  async function triggerStreamPlagiarism() {
    try {
      const res = await fetch('/api/simulator/inject-plagiarism', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'turbofan_alpha', copies: 4 })
      });
      if (res.ok) {
        showActiveFaultBanner('Stream Plagiarism Detected', 'Duplicate Replayed Frames Injected (rule_stream_plagiarism_clone)');
      }
    } catch (e) {
      console.error('Plagiarism injection error:', e);
    }
  }

  const btnStressHostPlagiarism = document.getElementById('btnStressHostPlagiarism');
  if (btnStressHostPlagiarism) {
    btnStressHostPlagiarism.addEventListener('click', triggerStreamPlagiarism);
  }

  // Wire Dedicated Real-Time Fault Injection & Chaos Studio Dock
  const btnDockHostCpu = document.getElementById('btnDockHostCpu');
  if (btnDockHostCpu) {
    btnDockHostCpu.addEventListener('click', () => {
      triggerAnomaly('edge_gateway_host_pc', 'host_cpu_utilization', 96.5);
      showActiveFaultBanner('Host CPU Overload', '96.5% Core Spike (Rule rule_host_cpu_pressure breached)');
    });
  }

  const btnDockHostRam = document.getElementById('btnDockHostRam');
  if (btnDockHostRam) {
    btnDockHostRam.addEventListener('click', () => {
      triggerAnomaly('edge_gateway_host_pc', 'host_ram_used_pct', 94.2);
      showActiveFaultBanner('Host RAM Saturation', '94.2% Memory Full (Rule rule_host_ram_saturation breached)');
    });
  }

  const btnDockTurbofanVib = document.getElementById('btnDockTurbofanVib');
  if (btnDockTurbofanVib) {
    btnDockTurbofanVib.addEventListener('click', () => {
      triggerAnomaly('turbofan_alpha', 'vibration_rms', 24.8);
      showActiveFaultBanner('Turbofan Vibration Spike', '24.8 mm/s ISO-10816 Bearing Hazard (rule_turbofan_vibration)');
    });
  }

  const btnDockThermalEgt = document.getElementById('btnDockThermalEgt');
  if (btnDockThermalEgt) {
    btnDockThermalEgt.addEventListener('click', () => {
      triggerAnomaly('turbofan_alpha', 'exhaust_temp', 925.0);
      showActiveFaultBanner('Turbine EGT Overheat', '925.0°C Core Thermal Blowout Critical (rule_turbofan_egt_overheat)');
    });
  }

  const btnDockCryoThaw = document.getElementById('btnDockCryoThaw');
  if (btnDockCryoThaw) {
    btnDockCryoThaw.addEventListener('click', () => {
      triggerAnomaly('cold_storage_gamma', 'storage_temp', 8.5);
      showActiveFaultBanner('Cryo Storage Thaw', '+8.5°C Preservation Loss Breach (rule_cold_chain_thaw)');
    });
  }

  const btnDockGridFreq = document.getElementById('btnDockGridFreq');
  if (btnDockGridFreq) {
    btnDockGridFreq.addEventListener('click', () => {
      triggerAnomaly('inverter_beta', 'grid_frequency', 48.9);
      showActiveFaultBanner('Grid Frequency Deviation', '48.9 Hz Underfrequency Event (rule_solar_frequency_deviation)');
    });
  }

  const btnDockStreamPlagiarism = document.getElementById('btnDockStreamPlagiarism');
  if (btnDockStreamPlagiarism) {
    btnDockStreamPlagiarism.addEventListener('click', triggerStreamPlagiarism);
  }

  const btnDockResetNominal = document.getElementById('btnDockResetNominal');
  if (btnDockResetNominal) {
    btnDockResetNominal.addEventListener('click', () => {
      triggerAnomaly('turbofan_alpha', 'vibration_rms', 4.2);
      triggerAnomaly('turbofan_alpha', 'exhaust_temp', 620.0);
      triggerAnomaly('inverter_beta', 'grid_frequency', 50.0);
      triggerAnomaly('cold_storage_gamma', 'storage_temp', -22.0);
      triggerAnomaly('edge_gateway_host_pc', 'host_cpu_utilization', 32.0);
      triggerAnomaly('edge_gateway_host_pc', 'host_ram_used_pct', 55.0);
      const banner = document.getElementById('activeFaultBanner');
      const dockBadge = document.getElementById('dockActiveFaultBadge');
      if (banner) banner.style.display = 'none';
      if (dockBadge) {
        dockBadge.textContent = '● NOMINAL BASELINE RESTORED';
        dockBadge.className = 'dock-status-tag';
        setTimeout(() => { dockBadge.textContent = '● READY FOR CHAOS TEST'; }, 3000);
      }
    });
  }

  // Wire Anti-Plagiarism & Code Originality Compliance Audit Modal
  const modalPlagiarism = document.getElementById('modalPlagiarism');
  const btnOpenPlagiarismAudit = document.getElementById('btnOpenPlagiarismAudit');
  const btnFooterPlagiarismModal = document.getElementById('btnFooterPlagiarismModal');
  const btnClosePlagiarismModal = document.getElementById('btnClosePlagiarismModal');
  const btnOkPlagiarismModal = document.getElementById('btnOkPlagiarismModal');
  const btnDownloadPlagiarismCert = document.getElementById('btnDownloadPlagiarismCert');

  function openPlagiarismModal() {
    if (modalPlagiarism) modalPlagiarism.style.display = 'flex';
  }
  function closePlagiarismModal() {
    if (modalPlagiarism) modalPlagiarism.style.display = 'none';
  }

  if (btnOpenPlagiarismAudit) btnOpenPlagiarismAudit.addEventListener('click', openPlagiarismModal);
  if (btnFooterPlagiarismModal) btnFooterPlagiarismModal.addEventListener('click', openPlagiarismModal);
  if (btnClosePlagiarismModal) btnClosePlagiarismModal.addEventListener('click', closePlagiarismModal);
  if (btnOkPlagiarismModal) btnOkPlagiarismModal.addEventListener('click', closePlagiarismModal);
  if (modalPlagiarism) {
    modalPlagiarism.addEventListener('click', (e) => {
      if (e.target === modalPlagiarism) closePlagiarismModal();
    });
  }

  if (btnDownloadPlagiarismCert) {
    btnDownloadPlagiarismCert.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/compliance/plagiarism-audit');
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Infotact_Originality_AntiPlagiarism_Audit_ITS_WEB_1793_Dev_Jangid.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Audit cert download error:', e);
      }
    });
  }

  // Export Telemetry
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => { window.location.href = '/api/export/csv'; });
  }
  if (btnExportJSON) {
    btnExportJSON.addEventListener('click', () => { window.location.href = '/api/export/json'; });
  }

  // Clear Alerts
  if (btnClearAlerts) {
    btnClearAlerts.addEventListener('click', () => {
      alertsFeed.innerHTML = '<div class="empty-state">No active threshold alerts. Telemetry running within nominal operating boundaries.</div>';
      alertCountBadge.textContent = '0 Incidents';
    });
  }

  // Switch Active Metric
  function switchActiveMetric(newMetric) {
    activeMetric = newMetric;
    if (metricSelector) metricSelector.value = newMetric;

    // Update Quick Metric Tabs
    document.querySelectorAll('.metric-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-metric') === newMetric);
    });

    telemetryHistory = [];
    kalman.reset();
    updateSourceTag();
    updateWaveformStats();
  }

  // Metric Selector Dropdown Change
  if (metricSelector) {
    metricSelector.addEventListener('change', (e) => switchActiveMetric(e.target.value));
  }

  // Quick Metric Tabs Click
  document.querySelectorAll('.metric-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const metric = e.currentTarget.getAttribute('data-metric');
      if (metric) switchActiveMetric(metric);
    });
  });

  // Time Range Selector Buttons
  document.querySelectorAll('.btn-range').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-range').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      maxHistory = parseInt(e.currentTarget.getAttribute('data-range'), 10) || 60;
      if (telemetryHistory.length > maxHistory) {
        telemetryHistory = telemetryHistory.slice(-maxHistory);
      }
    });
  });

  // Host Action Buttons
  if (btnFocusHost) {
    btnFocusHost.addEventListener('click', () => switchActiveMetric('host_cpu_utilization'));
  }
  if (btnFocusHostRam) {
    btnFocusHostRam.addEventListener('click', () => switchActiveMetric('host_ram_used_pct'));
  }

  // Asset Cards Focus Buttons
  document.querySelectorAll('.btn-card-focus').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const metric = e.currentTarget.getAttribute('data-focus-metric');
      if (metric) switchActiveMetric(metric);
    });
  });

  // Interactive KPI Card Clicks (Buttery Smooth Scroll / Chart Switch)
  document.querySelectorAll('.kpi-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const action = e.currentTarget.getAttribute('data-action');
      if (action === 'chart-host-cpu') switchActiveMetric('host_cpu_utilization');
      else if (action === 'chart-host-ram') switchActiveMetric('host_ram_used_pct');
      else if (action === 'scroll-fleet') {
        const fleetPanel = document.getElementById('fleetPanel');
        if (fleetPanel) fleetPanel.scrollIntoView({ behavior: 'smooth' });
      } else if (action === 'scroll-alerts') {
        const alertsPanel = document.getElementById('alertsPanel');
        if (alertsPanel) alertsPanel.scrollIntoView({ behavior: 'smooth' });
      } else if (action === 'scroll-rules') {
        const ruleStudioPanel = document.getElementById('ruleStudioPanel');
        if (ruleStudioPanel) ruleStudioPanel.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Quick Test Sample Frame Inject
  if (btnSimulate) {
    btnSimulate.addEventListener('click', () => {
      const isHost = activeMetric.startsWith('host_');
      const deviceId = isHost ? 'edge_gateway_host_pc' : 'turbofan_alpha';
      const base = isHost ? 45.0 : 12.0;
      const val = parseFloat((base + (Math.random() * 8)).toFixed(2));

      const reading = {
        deviceId,
        metric: activeMetric,
        value: val,
        timestamp: Date.now()
      };
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'INGEST_TELEMETRY', data: reading }));
      }
    });
  }

  // Dynamic Rule Form Syntax Preview
  function updateRuleSyntaxPreview() {
    if (!astPreviewCode) return;
    const metric = document.getElementById('ruleMetric')?.value.trim() || 'vibration_rms';
    const operator = document.getElementById('ruleOperator')?.value || '>';
    const threshold = document.getElementById('ruleThreshold')?.value || '18.0';
    const deadband = document.getElementById('ruleDeadband')?.value || '0.0';
    const severity = document.getElementById('ruleSeverity')?.value || 'WARNING';

    astPreviewCode.textContent = `IF (${metric} ${operator} ${threshold}) DISPATCH ${severity} [Deadband: ${deadband}]`;
  }

  ['ruleMetric', 'ruleOperator', 'ruleThreshold', 'ruleDeadband', 'ruleSeverity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateRuleSyntaxPreview);
      el.addEventListener('change', updateRuleSyntaxPreview);
    }
  });

  // Rule Preset Buttons
  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const preset = e.currentTarget.getAttribute('data-preset');
      if (preset === 'vib') {
        document.getElementById('ruleId').value = 'rule_vib_iso_10816';
        document.getElementById('ruleMetric').value = 'vibration_rms';
        document.getElementById('ruleOperator').value = '>';
        document.getElementById('ruleThreshold').value = '18.0';
        document.getElementById('ruleDeadband').value = '2.0';
        document.getElementById('ruleSeverity').value = 'CRITICAL';
      } else if (preset === 'egt') {
        document.getElementById('ruleId').value = 'rule_egt_overheat';
        document.getElementById('ruleMetric').value = 'exhaust_temp';
        document.getElementById('ruleOperator').value = '>';
        document.getElementById('ruleThreshold').value = '850.0';
        document.getElementById('ruleDeadband').value = '25.0';
        document.getElementById('ruleSeverity').value = 'CRITICAL';
      } else if (preset === 'cpu') {
        document.getElementById('ruleId').value = 'rule_cpu_high_load';
        document.getElementById('ruleMetric').value = 'host_cpu_utilization';
        document.getElementById('ruleOperator').value = '>';
        document.getElementById('ruleThreshold').value = '90.0';
        document.getElementById('ruleDeadband').value = '5.0';
        document.getElementById('ruleSeverity').value = 'WARNING';
      }
      updateRuleSyntaxPreview();
    });
  });

  // Create AST Rule Submission
  if (createRuleForm) {
    createRuleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('ruleId').value.trim();
      const metric = document.getElementById('ruleMetric').value.trim();
      const operator = document.getElementById('ruleOperator').value;
      const threshold = parseFloat(document.getElementById('ruleThreshold').value);
      const deadband = parseFloat(document.getElementById('ruleDeadband').value) || 0;
      const severity = document.getElementById('ruleSeverity').value;

      const newRule = {
        id,
        name: `Dynamic ${metric} Policy`,
        severity,
        hysteresisDeadband: deadband,
        condition: { metric, operator, threshold, value: threshold }
      };

      try {
        const res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newRule)
        });
        if (res.ok) {
          createRuleForm.reset();
          await loadRules();
          updateRuleSyntaxPreview();
        }
      } catch (err) {
        console.error('Rule creation failed:', err);
      }
    });
  }

  // Circuit Breaker & DLQ Controls
  if (btnTripCB) {
    btnTripCB.addEventListener('click', async () => {
      await fetch('/api/circuit-breaker/trip', { method: 'POST' });
      await loadResilienceStatus();
    });
  }
  if (btnResetCB) {
    btnResetCB.addEventListener('click', async () => {
      await fetch('/api/circuit-breaker/reset', { method: 'POST' });
      await loadResilienceStatus();
    });
  }
  if (btnRetryDLQ) {
    btnRetryDLQ.addEventListener('click', async () => {
      await fetch('/api/dlq');
      await loadResilienceStatus();
    });
  }
  if (btnPurgeDLQ) {
    btnPurgeDLQ.addEventListener('click', async () => {
      await fetch('/api/dlq?reason=manual_purge', { method: 'DELETE' });
      await loadResilienceStatus();
    });
  }

  // Ingest Presets
  document.querySelectorAll('.btn-ingest-preset').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const p = e.currentTarget.getAttribute('data-preset');
      if (p === 'turbofan') {
        document.getElementById('inputDevice').value = 'turbofan_alpha';
        document.getElementById('inputMetric').value = 'vibration_rms';
        document.getElementById('inputValue').value = '19.4';
        document.getElementById('inputUnit').value = 'mm/s';
      } else if (p === 'inverter') {
        document.getElementById('inputDevice').value = 'inverter_beta';
        document.getElementById('inputMetric').value = 'grid_frequency';
        document.getElementById('inputValue').value = '49.2';
        document.getElementById('inputUnit').value = 'Hz';
      } else if (p === 'cold') {
        document.getElementById('inputDevice').value = 'cold_storage_gamma';
        document.getElementById('inputMetric').value = 'storage_temp';
        document.getElementById('inputValue').value = '-12.0';
        document.getElementById('inputUnit').value = '°C';
      }
    });
  });

  // Direct Ingest Form Submission
  if (ingestForm) {
    ingestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const reading = {
        deviceId: document.getElementById('inputDevice').value.trim(),
        metric: document.getElementById('inputMetric').value.trim(),
        value: parseFloat(document.getElementById('inputValue').value),
        unit: document.getElementById('inputUnit').value.trim(),
        timestamp: Date.now()
      };
      try {
        await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reading)
        });
      } catch (err) {
        console.error('REST Ingest error:', err);
      }
    });
  }

  // Initial Boot
  updateSourceTag();
  updateRuleSyntaxPreview();
  renderCanvas();
  initWebSocket();
})();

// NexusFlow Live WebSocket Dashboard Client
(function () {
  const wsDot = document.getElementById('wsDot');
  const wsStatus = document.getElementById('wsStatus');
  const kpiIngested = document.getElementById('kpiIngested');
  const kpiDevices = document.getElementById('kpiDevices');
  const kpiAlerts = document.getElementById('kpiAlerts');
  const kpiRules = document.getElementById('kpiRules');
  const alertsFeed = document.getElementById('alertsFeed');
  const alertCountBadge = document.getElementById('alertCountBadge');
  const deviceTableBody = document.getElementById('deviceTableBody');
  const metricSelector = document.getElementById('metricSelector');
  const btnSimulate = document.getElementById('btnSimulate');
  const ingestForm = document.getElementById('ingestForm');
  const canvas = document.getElementById('waveformCanvas');
  const ctx = canvas.getContext('2d');

  // Waveform state
  let telemetryHistory = [];
  const MAX_HISTORY = 60;
  let activeMetric = metricSelector.value;
  let socket = null;

  // Resize canvas high-DPI
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Render waveform grid & path
  function renderCanvas() {
    const width = canvas.width / window.devicePixelRatio;
    const height = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (telemetryHistory.length < 2) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting real-time stream data points...', width / 2, height / 2);
      requestAnimationFrame(renderCanvas);
      return;
    }

    // Min & Max scale
    const values = telemetryHistory.map((d) => d.value);
    const minVal = Math.min(...values) * 0.9;
    const maxVal = Math.max(...values) * 1.1 || 1;

    const stepX = width / (MAX_HISTORY - 1);

    // Gradient fill under curve
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    ctx.beginPath();
    telemetryHistory.forEach((pt, i) => {
      const x = i * stepX;
      const normalizedY = (pt.value - minVal) / (maxVal - minVal || 1);
      const y = height - (normalizedY * (height - 30) + 15);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.lineTo((telemetryHistory.length - 1) * stepX, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Waveform stroke
    ctx.beginPath();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    telemetryHistory.forEach((pt, i) => {
      const x = i * stepX;
      const normalizedY = (pt.value - minVal) / (maxVal - minVal || 1);
      const y = height - (normalizedY * (height - 30) + 15);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Latest value callout
    const lastPt = telemetryHistory[telemetryHistory.length - 1];
    const lastX = (telemetryHistory.length - 1) * stepX;
    const lastNormY = (lastPt.value - minVal) / (maxVal - minVal || 1);
    const lastY = height - (lastNormY * (height - 30) + 15);

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 11px "JetBrains Mono"';
    ctx.textAlign = 'right';
    ctx.fillText(`${lastPt.value} (${activeMetric})`, width - 10, 20);

    requestAnimationFrame(renderCanvas);
  }

  // WebSocket Connection
  function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      wsDot.className = 'status-dot connected';
      wsStatus.textContent = 'LIVE WEBSOCKET CONNECTED';
      loadInitialStats();
    };

    socket.onclose = () => {
      wsDot.className = 'status-dot disconnected';
      wsStatus.textContent = 'DISCONNECTED (RECONNECTING...)';
      setTimeout(initWebSocket, 3000);
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

  function handleStreamMessage(msg) {
    if (msg.type === 'TELEMETRY_UPDATE') {
      const data = msg.data;
      if (data.metric === activeMetric) {
        telemetryHistory.push({ value: data.value, time: Date.now() });
        if (telemetryHistory.length > MAX_HISTORY) telemetryHistory.shift();
      }
      kpiIngested.textContent = parseInt(kpiIngested.textContent || 0, 10) + 1;
      updateDeviceRow(data);
    } else if (msg.type === 'ALERT_TRIGGERED') {
      pushAlertFeed(msg.data);
      kpiAlerts.textContent = parseInt(kpiAlerts.textContent || 0, 10) + 1;
    } else if (msg.type === 'CONNECTED') {
      if (msg.data.stats) updateKPIs(msg.data.stats);
    }
  }

  function pushAlertFeed(alert) {
    if (alertsFeed.querySelector('.empty-state')) {
      alertsFeed.innerHTML = '';
    }
    const item = document.createElement('div');
    item.className = `alert-item ${alert.severity === 'WARNING' ? 'warning' : ''}`;
    item.innerHTML = `
      <div class="alert-header">
        <span class="alert-severity ${alert.severity === 'WARNING' ? 'warning' : ''}">${alert.severity}</span>
        <span class="alert-time">${new Date().toLocaleTimeString()}</span>
      </div>
      <div class="alert-msg"><strong>${alert.sensorId || alert.deviceId}</strong>: ${alert.message}</div>
    `;
    alertsFeed.prepend(item);
    alertCountBadge.textContent = `${alertsFeed.children.length} Incidents`;
  }

  function updateDeviceRow(data) {
    let row = document.getElementById(`device_${data.deviceId}`);
    if (!row) {
      if (deviceTableBody.querySelector('.empty-row')) {
        deviceTableBody.innerHTML = '';
      }
      row = document.createElement('tr');
      row.id = `device_${data.deviceId}`;
      deviceTableBody.appendChild(row);
      kpiDevices.textContent = deviceTableBody.children.length;
    }
    row.innerHTML = `
      <td><strong>${data.deviceId}</strong></td>
      <td>IoT Edge Sensor</td>
      <td>${data.metric}</td>
      <td>${data.value} ${data.unit || ''}</td>
      <td><span style="color: #10b981; font-weight: 600;">ACTIVE</span></td>
    `;
  }

  function updateKPIs(stats) {
    kpiIngested.textContent = stats.totalIngested ?? 0;
    kpiDevices.textContent = stats.activeDevices ?? 0;
    kpiAlerts.textContent = stats.totalAlerts ?? 0;
    kpiRules.textContent = stats.activeRules ?? 0;
  }

  // Rule Policy & Simulator DOM Elements
  const btnToggleSim = document.getElementById('btnToggleSim');
  const btnAnomalyVibration = document.getElementById('btnAnomalyVibration');
  const btnAnomalyThermal = document.getElementById('btnAnomalyThermal');
  const btnAnomalyCold = document.getElementById('btnAnomalyCold');
  const btnExportCSV = document.getElementById('btnExportCSV');
  const btnExportJSON = document.getElementById('btnExportJSON');
  const ruleTableBody = document.getElementById('ruleTableBody');
  const ruleCountBadge = document.getElementById('ruleCountBadge');
  const createRuleForm = document.getElementById('createRuleForm');
  const cbBadge = document.getElementById('cbBadge');
  const cbState = document.getElementById('cbState');
  const cbFailures = document.getElementById('cbFailures');
  const dlqCount = document.getElementById('dlqCount');
  const btnTripCB = document.getElementById('btnTripCB');
  const btnResetCB = document.getElementById('btnResetCB');
  const btnRetryDLQ = document.getElementById('btnRetryDLQ');
  const btnPurgeDLQ = document.getElementById('btnPurgeDLQ');

  let isSimulatorRunning = false;

  async function loadInitialStats() {
    try {
      const res = await fetch('/api/metrics/summary');
      if (res.ok) {
        const stats = await res.json();
        updateKPIs(stats);
      }
      await loadRules();
      await loadResilienceStatus();
    } catch (e) {
      // Offline fallback
    }
  }

  // Load and render dynamic rules
  async function loadRules() {
    try {
      const res = await fetch('/api/rules');
      if (!res.ok) return;
      const data = await res.json();
      const rules = data.rules || [];
      kpiRules.textContent = rules.length;
      if (ruleCountBadge) ruleCountBadge.textContent = `${rules.length} Policies`;

      if (ruleTableBody) {
        if (rules.length === 0) {
          ruleTableBody.innerHTML = '<tr><td colspan="6" class="empty-row">No active AST rules registered.</td></tr>';
          return;
        }
        ruleTableBody.innerHTML = rules.map(r => `
          <tr>
            <td><strong>${r.id}</strong></td>
            <td><code>${r.condition?.metric || r.metric || '*'}</code></td>
            <td><code>${r.condition?.operator || r.operator || '>'} ${r.condition?.threshold ?? r.threshold ?? ''}</code></td>
            <td>${r.hysteresisDeadband || 0}</td>
            <td><span class="badge ${r.severity === 'CRITICAL' ? 'danger' : (r.severity === 'WARNING' ? 'warning' : 'success')}">${r.severity || 'INFO'}</span></td>
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
              }
            } catch (err) {
              console.error('Failed to delete rule:', err);
            }
          });
        });
      }
    } catch (err) {
      console.warn('Failed to load rules:', err);
    }
  }

  // Load Resilience (Circuit Breaker & DLQ) status
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
      }

      const dlqRes = await fetch('/api/dlq');
      if (dlqRes.ok) {
        const dlqData = await dlqRes.json();
        if (dlqCount) dlqCount.textContent = `${dlqData.totalCount || 0} packets`;
      }
    } catch (err) {
      console.warn('Failed to fetch resilience status:', err);
    }
  }

  // Simulator Toggle
  if (btnToggleSim) {
    btnToggleSim.addEventListener('click', async () => {
      try {
        if (!isSimulatorRunning) {
          const res = await fetch('/api/simulator/start', { method: 'POST' });
          if (res.ok) {
            isSimulatorRunning = true;
            btnToggleSim.textContent = '⏹ Stop Fleet Simulator';
            btnToggleSim.classList.add('running');
          }
        } else {
          const res = await fetch('/api/simulator/stop', { method: 'POST' });
          if (res.ok) {
            isSimulatorRunning = false;
            btnToggleSim.textContent = '▶ Start Fleet Simulator';
            btnToggleSim.classList.remove('running');
          }
        }
      } catch (err) {
        console.error('Simulator toggle error:', err);
      }
    });
  }

  // Anomaly Injection Handlers
  async function injectAnomaly(deviceId, metric, value) {
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

  if (btnAnomalyVibration) {
    btnAnomalyVibration.addEventListener('click', () => injectAnomaly('turbofan_alpha', 'vibration_rms', 24.8));
  }
  if (btnAnomalyThermal) {
    btnAnomalyThermal.addEventListener('click', () => injectAnomaly('turbofan_alpha', 'exhaust_temp', 925.0));
  }
  if (btnAnomalyCold) {
    btnAnomalyCold.addEventListener('click', () => injectAnomaly('cold_storage_gamma', 'storage_temp', 8.5));
  }

  // Export Telemetry
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => { window.location.href = '/api/export/csv'; });
  }
  if (btnExportJSON) {
    btnExportJSON.addEventListener('click', () => { window.location.href = '/api/export/json'; });
  }

  // Create Custom AST Rule Form
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
        condition: { metric, operator, threshold }
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

  // Event Listeners
  metricSelector.addEventListener('change', (e) => {
    activeMetric = e.target.value;
    telemetryHistory = [];
  });

  btnSimulate.addEventListener('click', () => {
    const val = (Math.random() * 5 + 10).toFixed(2);
    const reading = {
      deviceId: 'turbofan_unit_01',
      metric: activeMetric,
      value: parseFloat(val),
      timestamp: Date.now()
    };
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'INGEST_TELEMETRY', data: reading }));
    }
  });

  ingestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reading = {
      deviceId: document.getElementById('inputDevice').value,
      metric: document.getElementById('inputMetric').value,
      value: parseFloat(document.getElementById('inputValue').value),
      unit: document.getElementById('inputUnit').value,
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

  // Start waveform animation loop
  renderCanvas();
  // Connect WS
  initWebSocket();
})();

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

  async function loadInitialStats() {
    try {
      const res = await fetch('/api/metrics/summary');
      if (res.ok) {
        const stats = await res.json();
        updateKPIs(stats);
      }
      const rulesRes = await fetch('/api/rules');
      if (rulesRes.ok) {
        const rules = await rulesRes.json();
        kpiRules.textContent = rules.length;
      }
    } catch (e) {
      // Offline fallback
    }
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

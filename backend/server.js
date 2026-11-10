const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const payload = JSON.parse(data);
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(JSON.stringify(payload));
        }
      });
    } catch (err) {}
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NexusFlow IoT Telemetry & Rule Engine',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`NexusFlow engine running on port ${PORT}`);
});

module.exports = { app, server };

// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || ''; // set this in env
const TEMP_THRESHOLD = parseFloat(process.env.TEMP_THRESHOLD || '30'); // degC

// --- Setup Express ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Setup SQLite ---
const db = new Database(path.join(__dirname, 'data.sqlite'));

// Create table if not exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// prepared statements
const insertStmt = db.prepare('INSERT INTO readings (temperature, humidity) VALUES (?, ?)');
const selectRecentStmt = db.prepare('SELECT id, temperature, humidity, created_at FROM readings ORDER BY created_at DESC LIMIT ?');
const selectRangeStmt = db.prepare('SELECT id, temperature, humidity, created_at FROM readings WHERE created_at >= ? ORDER BY created_at ASC');
const selectLatestStmt = db.prepare('SELECT id, temperature, humidity, created_at FROM readings ORDER BY created_at DESC LIMIT 1');

// --- Helper: notify Discord ---
async function sendDiscordNotification(temperature, humidity) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('Discord webhook URL not configured; skipping notification.');
    return;
  }

  try {
    const content = `⚠️ Temperature alert: ${temperature.toFixed(2)} °C (Humidity: ${humidity.toFixed(2)}%). Threshold: ${TEMP_THRESHOLD}°C`;
    await axios.post(DISCORD_WEBHOOK_URL, {
      content
    });
    console.log('Discord notification sent.');
  } catch (err) {
    console.error('Failed to send Discord notification:', err.message);
  }
}

// --- Webhook endpoint for device POSTs ---
// Accepts JSON { "temperature": <float>, "humidity": <float> }
app.post('/webhook', async (req, res) => {
  try {
    const { temperature, humidity } = req.body;
    if (typeof temperature !== 'number' || typeof humidity !== 'number') {
      return res.status(400).json({ error: 'Invalid payload. Expected JSON with numeric temperature and humidity.' });
    }

    // Insert into DB
    const info = insertStmt.run(temperature, humidity);

    // Get inserted row
    const latest = selectLatestStmt.get();

    // Emit via socket.io to connected clients
    io.emit('reading', latest);

    // If temperature exceeds threshold, send discord webhook (non-blocking)
    if (temperature > TEMP_THRESHOLD) {
      sendDiscordNotification(temperature, humidity);
    }

    return res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error handling webhook:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// --- API: get recent n readings ---
app.get('/api/recent/:n?', (req, res) => {
  const n = Math.min(1000, Math.max(1, parseInt(req.params.n || '100')));
  const rows = selectRecentStmt.all(n);
  res.json(rows);
});

// --- API: get readings from timestamp (YYYY-MM-DD HH:MM:SS) ---
app.get('/api/range', (req, res) => {
  const since = req.query.since; // optional
  if (!since) {
    return res.status(400).json({ error: 'Missing "since" query param (e.g. 2025-12-09 00:00:00)' });
  }
  const rows = selectRangeStmt.all(since);
  res.json(rows);
});

// Serve dashboard at '/'
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connections
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send last 100 readings on connect
  const rows = selectRecentStmt.all(200);
  socket.emit('init', rows.reverse()); // oldest first

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Temp threshold: ${TEMP_THRESHOLD}°C`);
  if (!DISCORD_WEBHOOK_URL) {
    console.log('No DISCORD_WEBHOOK_URL set — Discord notifications disabled.');
  }
});

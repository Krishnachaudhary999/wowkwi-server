const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL"; // replace with your webhook

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // for dashboard.html

// ---------------- DATABASE ----------------
const db = new sqlite3.Database('./weather.db', (err) => {
    if (err) console.error(err.message);
    else console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS weather (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature REAL,
    humidity REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// ---------------- API ROUTES ----------------

// Receive data from Pico W
app.post('/api/update', (req, res) => {
    const { temperature, humidity } = req.body;
    if (typeof temperature !== 'number' || typeof humidity !== 'number') {
        return res.status(400).json({ error: "Invalid data" });
    }

    db.run(`INSERT INTO weather (temperature, humidity) VALUES (?, ?)`,
        [temperature, humidity],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            // Emit via WebSocket
            io.emit('new_data', { temperature, humidity, timestamp: new Date() });

            // Discord webhook alert if temperature > 30
            if (temperature > 30) {
                axios.post(DISCORD_WEBHOOK_URL, {
                    content: `:fire: Temperature alert! Current temperature: ${temperature}°C`
                }).catch(console.error);
            }

            res.json({ status: 'success' });
        });
});

// Get recent records
app.get('/api/recent', (req, res) => {
    const n = parseInt(req.query.n) || 10; // default 10 records
    db.all(`SELECT * FROM weather ORDER BY id DESC LIMIT ?`, [n], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ---------------- START SERVER ----------------
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// ---------------- WEBSOCKET ----------------
io.on('connection', (socket) => {
    console.log('Client connected via WebSocket');
});

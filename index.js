require('dotenv').config();

const express   = require('express');
const basicAuth = require('express-basic-auth');
const cors      = require('cors');
const path      = require('path');
const db        = require('./lib/database');
const { startScheduler } = require('./lib/scheduler');
const { checkAll, SERVER_IP } = require('./lib/monitor');
const { sendSMS } = require('./lib/sms');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(basicAuth({
  users: { 'jbains': '3502Kennemore$' },
  challenge: true,
  realm: 'Server Monitor',
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────

// Current status + uptime stats
app.get('/api/status', (req, res) => {
  try {
    const latest = db.getLatestCheck();
    const stats  = db.getUptimeStats();
    res.json({ server: SERVER_IP, latest, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent checks for the events table
app.get('/api/history', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    res.json(db.getRecentChecks(limit));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Time-series data for the chart
app.get('/api/chart', (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours) || 24, 168);
    const from  = Date.now() - hours * 60 * 60 * 1000;
    res.json(db.getChecksInRange(from, Date.now()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent SMS alerts
app.get('/api/alerts', (req, res) => {
  try {
    res.json(db.getRecentAlerts(20));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger a manual check immediately
app.post('/api/check', async (req, res) => {
  try {
    const result = await checkAll();
    db.insertCheck(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a test SMS
app.post('/api/test-sms', async (req, res) => {
  try {
    const latest = db.getLatestCheck();
    const stats  = db.getUptimeStats();
    const status = latest?.online ? 'ONLINE ✅' : 'OFFLINE 🔴';
    const fmtIP = (ip) => ip.replace(/\./g, '-');
    const msg = `🧪 Test SMS — Server ${fmtIP(SERVER_IP)} is currently ${status}. ` +
                `24h uptime: ${stats.day.uptime_pct != null ? stats.day.uptime_pct.toFixed(2) + '%' : 'N/A'}`;
    await sendSMS(msg);
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🖥️  Server Monitor Dashboard → http://localhost:${PORT}`);
  console.log(`📡  Monitoring: ${SERVER_IP}`);
  console.log(`🔔  Notifications → ntfy.sh/${process.env.NTFY_TOPIC || 'server-monitor-jbains'}\n`);

  // Initial check on startup
  try {
    const result = await checkAll();
    db.insertCheck(result);
    console.log(`[Startup] Initial check: ${result.online ? 'ONLINE ✅' : 'OFFLINE 🔴'} | Ping: ${result.ping_ms?.toFixed(1) ?? 'N/A'}ms`);
  } catch (err) {
    console.error(`[Startup] Initial check failed: ${err.message}`);
  }

  startScheduler();
});

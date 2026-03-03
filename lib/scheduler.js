const cron = require('node-cron');
const { checkAll, SERVER_IP } = require('./monitor');
const db = require('./database');
const { sendSMS } = require('./sms');

let lastKnownStatus = null; // track for incident alerts

function fmt(val, unit = 'ms', decimals = 0) {
  if (val == null) return 'N/A';
  return `${Number(val).toFixed(decimals)}${unit}`;
}

// Format IP with dashes to avoid SMS URL filters (e.g. 187.77.86.51 → 187-77-86-51)
function fmtIP(ip) {
  return ip.replace(/\./g, '-');
}

function buildHourlyMessage(latest, stats) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
  });

  const status     = latest.online ? 'ONLINE' : 'OFFLINE';
  const statusIcon = latest.online ? '✅' : '🔴';
  const uptime24h  = stats.day.uptime_pct  != null ? `${stats.day.uptime_pct.toFixed(2)}%`  : 'N/A';
  const uptime7d   = stats.week.uptime_pct != null ? `${stats.week.uptime_pct.toFixed(2)}%` : 'N/A';

  const ports = [
    `SSH(22):${latest.port_22  ? '✓' : '✗'}`,
    `HTTP(80):${latest.port_80  ? '✓' : '✗'}`,
    `HTTPS(443):${latest.port_443 ? '✓' : '✗'}`,
  ].join(' ');

  return [
    `🖥️ Hourly Server Report — ${dateStr} ${timeStr}`,
    `Server: ${fmtIP(SERVER_IP)}`,
    `Status: ${statusIcon} ${status}`,
    `Ping: ${fmt(latest.ping_ms, 'ms', 1)}`,
    `HTTP Response: ${fmt(latest.http_response_ms, 'ms')}`,
    `HTTP Status: ${latest.http_status || 'N/A'}`,
    `Uptime 24h: ${uptime24h} | 7d: ${uptime7d}`,
    `Ports: ${ports}`,
  ].join('\n');
}

function buildIncidentMessage(online, latest) {
  const timeStr = new Date().toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  if (!online) {
    return `🚨 ALERT: Server ${fmtIP(SERVER_IP)} is OFFLINE as of ${timeStr}.\nPing failed. All monitored ports unresponsive.`;
  } else {
    return `✅ RECOVERY: Server ${fmtIP(SERVER_IP)} is back ONLINE at ${timeStr}.\nPing: ${fmt(latest.ping_ms, 'ms', 1)} | HTTP: ${fmt(latest.http_response_ms, 'ms')}`;
  }
}

function startScheduler() {
  // ── Check every minute ──────────────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const result = await checkAll();
      db.insertCheck(result);

      const statusLabel = result.online ? 'ONLINE ' : 'OFFLINE';
      console.log(
        `[${new Date().toISOString()}] ${statusLabel} | ` +
        `Ping: ${fmt(result.ping_ms, 'ms', 1)} | ` +
        `HTTP: ${fmt(result.http_response_ms, 'ms')} (${result.http_status ?? '-'}) | ` +
        `Ports 22:${result.port_22 ? '✓' : '✗'} 80:${result.port_80 ? '✓' : '✗'} 443:${result.port_443 ? '✓' : '✗'}`
      );

      // Incident detection: send immediate SMS on status change
      const isOnline = Boolean(result.online);
      if (lastKnownStatus !== null && lastKnownStatus !== isOnline) {
        const msg = buildIncidentMessage(isOnline, result);
        await sendSMS(msg).catch(() => {});
        db.insertAlert({ timestamp: Date.now(), type: isOnline ? 'recovery' : 'outage', message: msg });
      }
      lastKnownStatus = isOnline;

    } catch (err) {
      console.error(`[Monitor] Check failed: ${err.message}`);
    }
  });

  // ── Send SMS every hour on the hour ─────────────────────────────
  cron.schedule('0 * * * *', async () => {
    try {
      const latest = db.getLatestCheck();
      const stats  = db.getUptimeStats();
      if (!latest) return;

      const message = buildHourlyMessage(latest, stats);
      await sendSMS(message);
      db.insertAlert({ timestamp: Date.now(), type: 'hourly', message });
    } catch (err) {
      console.error(`[Scheduler] Hourly SMS failed: ${err.message}`);
    }
  });

  console.log('[Scheduler] Started — checks every minute, SMS every hour on the hour + instant incident alerts.');
}

module.exports = { startScheduler };

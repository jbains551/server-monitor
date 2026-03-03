/**
 * Lightweight file-based store — no native dependencies required.
 * Checks are appended as NDJSON (one JSON per line).
 * Alerts are stored as a small JSON array.
 * Everything is cached in memory for fast reads.
 */

const fs   = require('fs');
const path = require('path');

const CHECKS_FILE = path.join(__dirname, '..', 'checks.ndjson');
const ALERTS_FILE = path.join(__dirname, '..', 'alerts.json');
const MAX_CACHE   = 50000; // ~35 days at 1 check/minute

let checksCache = [];
let alertsCache = [];
let nextId = 1;

// ── Boot: load existing data ──────────────────────────────────────
(function load() {
  if (fs.existsSync(CHECKS_FILE)) {
    const lines = fs.readFileSync(CHECKS_FILE, 'utf8').split('\n').filter(Boolean);
    const parsed = lines.slice(-MAX_CACHE).map((l) => JSON.parse(l));
    checksCache = parsed;
    if (parsed.length) nextId = parsed[parsed.length - 1].id + 1;
  }
  if (fs.existsSync(ALERTS_FILE)) {
    try { alertsCache = JSON.parse(fs.readFileSync(ALERTS_FILE, 'utf8')); }
    catch { alertsCache = []; }
  }
})();

// Periodically compact checks file to prevent unbounded growth
function compact() {
  if (checksCache.length >= MAX_CACHE) {
    checksCache = checksCache.slice(-MAX_CACHE);
    fs.writeFileSync(CHECKS_FILE, checksCache.map((c) => JSON.stringify(c)).join('\n') + '\n');
  }
}

// ── Public API ────────────────────────────────────────────────────
module.exports = {
  insertCheck(data) {
    const record = { id: nextId++, ...data };
    checksCache.push(record);
    fs.appendFileSync(CHECKS_FILE, JSON.stringify(record) + '\n');
    if (checksCache.length % 1000 === 0) compact();
    return record;
  },

  getLatestCheck() {
    return checksCache[checksCache.length - 1] ?? null;
  },

  getRecentChecks(limit = 120) {
    return checksCache.slice(-limit).reverse();
  },

  getChecksInRange(from, to) {
    return checksCache.filter((c) => c.timestamp >= from && c.timestamp <= to);
  },

  getUptimeStats() {
    const now = Date.now();
    const ranges = {
      day:   now - 24 * 60 * 60 * 1000,
      week:  now -  7 * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
    };

    const result = {};
    for (const [key, since] of Object.entries(ranges)) {
      const subset  = checksCache.filter((c) => c.timestamp >= since);
      const total   = subset.length;
      const online  = subset.filter((c) => c.online).length;
      const pings   = subset.filter((c) => c.online && c.ping_ms != null).map((c) => c.ping_ms);
      const resps   = subset.filter((c) => c.online && c.http_response_ms != null).map((c) => c.http_response_ms);
      const avg     = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

      result[key] = {
        total,
        online_count: online,
        uptime_pct:   total > 0 ? (online / total) * 100 : null,
        avg_ping:     avg(pings),
        min_ping:     pings.length ? Math.min(...pings) : null,
        max_ping:     pings.length ? Math.max(...pings) : null,
        avg_http:     avg(resps),
      };
    }
    return result;
  },

  insertAlert(data) {
    const record = { id: Date.now(), ...data };
    alertsCache.unshift(record);
    if (alertsCache.length > 500) alertsCache = alertsCache.slice(0, 500);
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alertsCache, null, 2));
    return record;
  },

  getRecentAlerts(limit = 20) {
    return alertsCache.slice(0, limit);
  },
};

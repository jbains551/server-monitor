'use strict';

// ── State ────────────────────────────────────────────────────────
let chart = null;
let currentHours = 1;
let countdown = 30;
let countdownTimer = null;

// ── Helpers ──────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function fmt(val, unit = 'ms', decimals = 0) {
  if (val == null || val === undefined) return '—';
  return `${Number(val).toFixed(decimals)}${unit}`;
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtDatetime(ts) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function colorForPing(ms) {
  if (ms == null) return '#8b949e';
  if (ms < 50)   return '#3fb950';
  if (ms < 150)  return '#d29922';
  return '#f85149';
}

function colorForHttp(ms) {
  if (ms == null) return '#8b949e';
  if (ms < 200)  return '#3fb950';
  if (ms < 800)  return '#d29922';
  return '#f85149';
}

function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, 4000);
}

// ── Chart ────────────────────────────────────────────────────────
function initChart() {
  const ctx = document.getElementById('responseChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Ping (ms)',
          data: [],
          borderColor: '#58a6ff',
          backgroundColor: 'rgba(88,166,255,0.08)',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          yAxisID: 'y',
        },
        {
          label: 'HTTP Response (ms)',
          data: [],
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63,185,80,0.06)',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          yAxisID: 'y',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#8b949e', font: { size: 11 }, boxWidth: 14 },
        },
        tooltip: {
          backgroundColor: '#21262d',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y != null ? ctx.parsed.y.toFixed(1) + 'ms' : 'N/A'}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { size: 10 }, maxTicksLimit: 8 },
          grid:  { color: '#21262d' },
        },
        y: {
          ticks: { color: '#8b949e', font: { size: 10 }, callback: (v) => v + 'ms' },
          grid:  { color: '#21262d' },
          beginAtZero: true,
        },
      },
    },
  });
}

async function loadChart(hours) {
  try {
    const data = await fetch(`/api/chart?hours=${hours}`).then((r) => r.json());
    const isCompact = data.length > 200;

    // Downsample if needed for performance
    const points = isCompact
      ? data.filter((_, i) => i % Math.ceil(data.length / 200) === 0)
      : data;

    chart.data.labels = points.map((c) => fmtTime(c.timestamp));
    chart.data.datasets[0].data = points.map((c) => c.ping_ms);
    chart.data.datasets[1].data = points.map((c) => c.http_response_ms);
    chart.update('none');
  } catch (err) {
    console.error('Chart load failed:', err);
  }
}

function setChartRange(hours, btn) {
  currentHours = hours;
  document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  btn.classList.add('active');
  loadChart(hours);
}

// ── Status Update ────────────────────────────────────────────────
function updateStatus(data) {
  const { latest, stats } = data;
  if (!latest) return;

  const banner = document.querySelector('.status-banner');
  const online = Boolean(latest.online);

  banner.className = `status-banner ${online ? 'online' : 'offline'}`;
  $('status-label').textContent = online ? 'ONLINE' : 'OFFLINE';
  $('status-sub').textContent = online
    ? `Server is reachable • Last checked ${fmtTime(latest.timestamp)}`
    : `Server is unreachable • Last checked ${fmtTime(latest.timestamp)}`;

  $('last-checked').textContent = fmtTime(latest.timestamp);
  $('http-code').textContent = latest.http_status ?? '—';

  // Stat cards
  const ping = latest.ping_ms;
  const http = latest.http_response_ms;

  $('stat-ping').textContent = fmt(ping, 'ms', 1);
  $('stat-ping').style.color = colorForPing(ping);
  $('stat-ping-sub').textContent = 'Current ICMP round-trip';

  $('stat-http').textContent = fmt(http, 'ms');
  $('stat-http').style.color = colorForHttp(http);
  $('stat-http-sub').textContent = latest.http_status ? `HTTP ${latest.http_status}` : 'Not available';

  // Uptime 24h card
  const u24 = stats.day;
  if (u24.uptime_pct != null) {
    $('stat-uptime-24h').textContent = `${u24.uptime_pct.toFixed(2)}%`;
    $('stat-uptime-24h').style.color = u24.uptime_pct >= 99 ? '#3fb950' : u24.uptime_pct >= 95 ? '#d29922' : '#f85149';
    $('stat-uptime-24h-sub').textContent = `${u24.online_count}/${u24.total} checks OK`;
  }

  // Avg ping 24h card
  if (u24.avg_ping != null) {
    $('stat-avg-ping').textContent = fmt(u24.avg_ping, 'ms', 1);
    $('stat-avg-ping').style.color = colorForPing(u24.avg_ping);
    $('stat-avg-ping-sub').textContent = `Min: ${fmt(u24.min_ping, 'ms', 1)} / Max: ${fmt(u24.max_ping, 'ms', 1)}`;
  }

  // Port grid
  const ports = {
    22:   latest.port_22,
    80:   latest.port_80,
    443:  latest.port_443,
    3000: latest.port_3000,
    8080: latest.port_8080,
  };

  for (const [p, val] of Object.entries(ports)) {
    const el = $(`port-${p}`);
    if (!el) continue;
    const open = Boolean(val);
    el.className = `port-item ${open ? 'open' : 'closed'}`;
    el.querySelector('.port-badge').textContent = open ? 'OPEN' : 'CLOSED';
  }

  // Uptime bars
  function setBar(barId, pctId, pct) {
    const el = $(barId);
    const label = $(pctId);
    if (pct != null) {
      el.style.width = `${Math.min(100, pct)}%`;
      el.style.background = pct >= 99 ? '#3fb950' : pct >= 95 ? '#d29922' : '#f85149';
      label.textContent = `${pct.toFixed(2)}%`;
    } else {
      el.style.width = '0%';
      label.textContent = '—';
    }
  }

  setBar('bar-24h', 'pct-24h', stats.day.uptime_pct);
  setBar('bar-7d',  'pct-7d',  stats.week.uptime_pct);
  setBar('bar-30d', 'pct-30d', stats.month.uptime_pct);

  $('ud-avg-http').textContent = fmt(u24.avg_http, 'ms', 0);
  $('ud-min-ping').textContent = fmt(u24.min_ping, 'ms', 1);
  $('ud-max-ping').textContent = fmt(u24.max_ping, 'ms', 1);
  $('ud-checks').textContent   = u24.total ?? '—';
}

// ── History Table ────────────────────────────────────────────────
async function loadHistory() {
  try {
    const rows = await fetch('/api/history?limit=100').then((r) => r.json());
    const tbody = $('events-body');
    $('events-count').textContent = `${rows.length} records`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-row">No data yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r) => {
      const online = Boolean(r.online);
      const pill = online
        ? `<span class="pill pill-online">ONLINE</span>`
        : `<span class="pill pill-offline">OFFLINE</span>`;

      const portDot = (v) => v
        ? `<span class="dot-open">✓</span>`
        : `<span class="dot-closed">✗</span>`;

      return `<tr>
        <td>${fmtDatetime(r.timestamp)}</td>
        <td>${pill}</td>
        <td style="color:${colorForPing(r.ping_ms)}">${fmt(r.ping_ms, 'ms', 1)}</td>
        <td style="color:${colorForHttp(r.http_response_ms)}">${fmt(r.http_response_ms, 'ms')}</td>
        <td>${r.http_status ?? '—'}</td>
        <td>${portDot(r.port_22)}</td>
        <td>${portDot(r.port_80)}</td>
        <td>${portDot(r.port_443)}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    console.error('History load failed:', err);
  }
}

// ── Alerts ───────────────────────────────────────────────────────
async function loadAlerts() {
  try {
    const alerts = await fetch('/api/alerts').then((r) => r.json());
    const list = $('alerts-list');
    $('sms-badge').textContent = `${alerts.length} sent`;

    if (!alerts.length) {
      list.innerHTML = `<div class="empty-msg">No alerts sent yet.</div>`;
      return;
    }

    list.innerHTML = alerts.map((a) => `
      <div class="alert-item">
        <div class="alert-meta">
          <span class="alert-time">${fmtDatetime(a.timestamp)}</span>
          <span class="alert-type type-${a.type}">${a.type}</span>
        </div>
        <pre class="alert-msg">${a.message}</pre>
      </div>
    `).join('');
  } catch (err) {
    console.error('Alerts load failed:', err);
  }
}

// ── Data Fetching ────────────────────────────────────────────────
async function fetchAll() {
  try {
    const data = await fetch('/api/status').then((r) => r.json());
    updateStatus(data);
  } catch (err) {
    console.error('Status fetch failed:', err);
  }

  await Promise.all([loadHistory(), loadAlerts(), loadChart(currentHours)]);
}

// ── Actions ──────────────────────────────────────────────────────
async function manualCheck() {
  const btn = $('btn-check');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  try {
    const result = await fetch('/api/check', { method: 'POST' }).then((r) => r.json());
    showToast(
      `Check complete: ${result.online ? '✅ ONLINE' : '🔴 OFFLINE'} — Ping: ${fmt(result.ping_ms, 'ms', 1)}`,
      result.online ? 'success' : 'error'
    );
    await fetchAll();
    resetCountdown();
  } catch (err) {
    showToast('Check failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check Now';
  }
}

async function testSMS() {
  const btn = $('btn-sms');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const res = await fetch('/api/test-sms', { method: 'POST' }).then((r) => r.json());
    if (res.error) {
      showToast('SMS failed: ' + res.error, 'error');
    } else {
      showToast('Test SMS sent to (205) 616-0901!', 'success');
      loadAlerts();
    }
  } catch (err) {
    showToast('SMS failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test SMS';
  }
}

// ── Auto-refresh countdown ────────────────────────────────────────
function resetCountdown() {
  countdown = 30;
  $('countdown').textContent = countdown;
}

function startCountdown() {
  countdownTimer = setInterval(() => {
    countdown -= 1;
    $('countdown').textContent = countdown;
    if (countdown <= 0) {
      fetchAll();
      resetCountdown();
    }
  }, 1000);
}

// ── Init ─────────────────────────────────────────────────────────
(async function init() {
  initChart();
  await fetchAll();
  resetCountdown();
  startCountdown();
})();

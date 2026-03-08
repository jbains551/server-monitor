const ping = require('ping');
const net = require('net');
const axios = require('axios');

const SERVER_IP = process.env.SERVER_IP || '187.77.86.51';

// External host used to measure outbound network latency.
// Since the monitor runs ON the server, pinging itself gives ~0ms (loopback).
// Pinging an external target gives a real network latency reading.
const PING_TARGET = '1.1.1.1';

const PORTS = [22, 80, 443, 3000, 8080];

// Probe ICMP ping against external target to measure network latency
async function checkPing() {
  try {
    const result = await ping.promise.probe(PING_TARGET, {
      timeout: 5,
      extra: ['-c', '3'],
    });
    return {
      alive: result.alive,
      time: result.avg !== 'unknown' ? parseFloat(result.avg) : null,
    };
  } catch {
    return { alive: false, time: null };
  }
}

// TCP port check
function checkPort(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (open) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(open);
      }
    };

    socket.setTimeout(timeout);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
    socket.connect(port, host);
  });
}

// HTTP response time check — tries http then https
async function checkHttp(host) {
  const protocols = ['http', 'https'];
  for (const proto of protocols) {
    const start = Date.now();
    try {
      const response = await axios.get(`${proto}://${host}`, {
        timeout: 10000,
        validateStatus: () => true,
        maxRedirects: 5,
        headers: { 'User-Agent': 'ServerMonitor/1.0' },
      });
      return {
        status: response.status,
        responseMs: Date.now() - start,
        protocol: proto,
      };
    } catch {
      // try next protocol
    }
  }
  return { status: null, responseMs: null, protocol: null };
}

// Run all checks concurrently
async function checkAll() {
  const timestamp = Date.now();

  const [pingResult, httpResult, ...portResults] = await Promise.all([
    checkPing(),
    checkHttp(SERVER_IP),
    ...PORTS.map((p) => checkPort(SERVER_IP, p)),
  ]);

  const portMap = {};
  PORTS.forEach((p, i) => { portMap[p] = portResults[i]; });

  // Server is "online" if ping succeeds OR any known port responds
  const anyPortOpen = Object.values(portMap).some(Boolean);
  const online = pingResult.alive || anyPortOpen;

  return {
    timestamp,
    online: online ? 1 : 0,
    ping_ms: pingResult.time,
    http_status: httpResult.status,
    http_response_ms: httpResult.responseMs,
    port_22:   portMap[22]   ? 1 : 0,
    port_80:   portMap[80]   ? 1 : 0,
    port_443:  portMap[443]  ? 1 : 0,
    port_3000: portMap[3000] ? 1 : 0,
    port_8080: portMap[8080] ? 1 : 0,
    notes: httpResult.protocol ? `HTTP via ${httpResult.protocol}` : null,
  };
}

module.exports = { checkAll, SERVER_IP, PORTS };

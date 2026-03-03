# Server Monitor

A real-time server monitoring dashboard with SMS alerts. Tracks uptime, latency, HTTP response times, and port availability — with instant outage/recovery notifications and hourly status reports via SMS.

![Dashboard](https://img.shields.io/badge/dashboard-live-green) ![SMS](https://img.shields.io/badge/SMS-Textbelt-blue) ![PM2](https://img.shields.io/badge/process-PM2-orange)

## Features

- **Live Dashboard** — Dark-themed UI with auto-refresh every 30 seconds
- **Response Time Chart** — Historical latency graph with 1h / 6h / 24h / 7d range
- **Port Monitoring** — Tracks SSH (22), HTTP (80), HTTPS (443), Node (3000), Alt HTTP (8080)
- **Uptime Stats** — 24h / 7d / 30d uptime percentage with visual progress bars
- **Hourly SMS Reports** — Status summary texted every hour on the hour
- **Instant Incident Alerts** — Immediate SMS when server goes down or recovers
- **Basic Auth** — Password-protected dashboard
- **Public URL** — Accessible from anywhere via ngrok tunnel
- **Background Service** — Runs via PM2, survives terminal closes and reboots

## Stack

- **Backend:** Node.js + Express
- **Database:** File-based NDJSON store (no native dependencies)
- **Monitoring:** ICMP ping + TCP port checks + HTTP response timing
- **SMS:** [Textbelt](https://textbelt.com) ($0.01/text)
- **Tunnel:** ngrok static domain
- **Process Manager:** PM2

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/jbains551/server-monitor.git
cd server-monitor
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
TEXTBELT_API_KEY=your_textbelt_key
SERVER_IP=your.server.ip
PORT=3000
```

Get a Textbelt API key at [textbelt.com/purchase](https://textbelt.com/purchase).

### 3. Add Basic Auth (optional)

In `index.js`, update the credentials:

```js
app.use(basicAuth({
  users: { 'your_username': 'your_password' },
  challenge: true,
}));
```

### 4. Start

```bash
npm start
```

Dashboard available at `http://localhost:3000`.

## Running as a Background Service

### Install PM2

```bash
npm install -g pm2
pm2 start index.js --name "server-monitor"
pm2 save
pm2 startup  # follow the printed command to enable auto-start on reboot
```

### Public URL via ngrok

```bash
# Install ngrok and authenticate
ngrok config add-authtoken YOUR_TOKEN

# Start tunnel with a static domain (free ngrok account)
pm2 start "ngrok http --url=your-domain.ngrok-free.dev 3000" --name "ngrok-tunnel"
pm2 save
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Current status + uptime stats |
| GET | `/api/history` | Recent checks (default 100) |
| GET | `/api/chart?hours=24` | Time-series data for chart |
| GET | `/api/alerts` | Recent SMS alert log |
| POST | `/api/check` | Trigger a manual check |
| POST | `/api/test-sms` | Send a test SMS |

## SMS Alert Examples

**Hourly Report:**
```
🖥️ Hourly Server Report — Mar 3 01:00 AM CST
Server: 187-77-86-51
Status: ✅ ONLINE
Ping: 127.6ms
HTTP Response: N/A
Uptime 24h: 99.98% | 7d: 99.95%
Ports: SSH(22):✓ HTTP(80):✗ HTTPS(443):✗
```

**Outage Alert:**
```
🚨 ALERT: Server 187-77-86-51 is OFFLINE as of 02:15 AM CST.
Ping failed. All monitored ports unresponsive.
```

**Recovery Alert:**
```
✅ RECOVERY: Server 187-77-86-51 is back ONLINE at 02:22 AM CST.
Ping: 127.6ms | HTTP: N/A
```

## License

MIT

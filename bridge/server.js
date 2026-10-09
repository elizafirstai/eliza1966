// $ELIZA1966 bridge: browser WebSocket <-> telnet line <-> ELIZA on CTSS on an
// emulated IBM 7094. Keeps a small pool of warm ELIZA sessions, one per CTSS
// account, hands one to each visitor, and recycles it when they leave.
//
//   env  ELIZA_LINES=ctss1:7094:eliza:eliza,ctss2:7094:eliza:eliza   (one per line)
//        or CTSS_HOST=127.0.0.1 CTSS_PORT=7094 ELIZA_LINES=eliza:eliza
//        ELIZA_SCRIPT=200   (200 = DOCTOR from the 1966 CACM paper, 100 = the printout's)
//        PORT=8080  ALLOWED_ORIGINS=https://eliza1966.xyz,http://localhost:8080
//        SITE_DIR=../site   (optional: also serve the static site)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { ElizaSession } from './session.js';

const env = process.env;
const CTSS = { host: env.CTSS_HOST || '127.0.0.1', port: +(env.CTSS_PORT || 7094) };
// One entry per line: user:password (on CTSS_HOST:CTSS_PORT) or
// host:port:user:password. The reconstructed CTSS only stays reliable with
// one ELIZA logged in at a time, so for several lines run several CTSS
// machines (docker-compose.yml does) and give each one its own entry.
const LINES = (env.ELIZA_LINES || env.ELIZA_USERS || 'eliza:eliza').split(',').map((e) => {
  const p = e.trim().split(':');
  return p.length >= 4
    ? { host: p[0], port: +p[1], user: p[2], password: p[3] }
    : { ...CTSS, user: p[0], password: p[1] };
});
const SCRIPT = env.ELIZA_SCRIPT || '200';
const PORT = +(env.PORT || 8080);
const ORIGINS = (env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
const SITE_DIR = env.SITE_DIR ? path.resolve(env.SITE_DIR) : null;
const IDLE_MS = +(env.IDLE_MS || 10 * 60 * 1000);
const MSGS_PER_MIN = +(env.MSGS_PER_MIN || 20);
const SOCKETS_PER_IP = +(env.SOCKETS_PER_IP || 2);

const log = (...a) => console.log(new Date().toISOString(), ...a);
const lineName = (s) => `${s.opts.host}:${s.opts.port}/${s.user}`;

// ------------------------------------------------------------------ pool

const slots = LINES.map((l) => ({
  session: new ElizaSession({ ...l, script: SCRIPT, log }),
  client: null,
  backoff: 2000,
}));

async function warm(slot) {
  slot.session.state = 'starting';
  try {
    await slot.session.start();
    slot.backoff = 2000;
  } catch (e) {
    log(`[${lineName(slot.session)}] start failed: ${e.message}; retry in ${slot.backoff / 1000}s`);
    slot.session.line?.close();
    setTimeout(() => warm(slot), slot.backoff);
    slot.backoff = Math.min(slot.backoff * 2, 60000);
  }
}

async function recycle(slot) {
  slot.client = null;
  await slot.session.stop().catch(() => {});
  setTimeout(() => warm(slot), 1000);
}

const take = () => slots.find((s) => !s.client && s.session.state === 'ready');

// ------------------------------------------------------------ rate limits

const perIp = new Map(); // ip -> { sockets, stamps[] }
function ipState(ip) {
  if (!perIp.has(ip)) perIp.set(ip, { sockets: 0, stamps: [] });
  return perIp.get(ip);
}
function allowMessage(ip) {
  const s = ipState(ip);
  const now = Date.now();
  s.stamps = s.stamps.filter((t) => now - t < 60000);
  if (s.stamps.length >= MSGS_PER_MIN) return false;
  s.stamps.push(now);
  return true;
}

// ------------------------------------------------------------------- http

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.wav': 'audio/wav', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const count = (st) => slots.filter((s) => s.session.state === st && !s.client).length;
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ready: count('ready'), inUse: slots.filter((s) => s.client).length, lines: slots.length }));
    return;
  }
  if (!SITE_DIR) { res.writeHead(404); res.end(); return; }
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const file = path.join(SITE_DIR, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(SITE_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });

wss.on('connection', (ws, req) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const origin = req.headers.origin || '';
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));

  if (ORIGINS.length && !ORIGINS.includes(origin)) { send({ type: 'error', reason: 'origin' }); ws.close(); return; }
  const ipst = ipState(ip);
  if (ipst.sockets >= SOCKETS_PER_IP) { send({ type: 'busy', reason: 'too many sessions from your address' }); ws.close(); return; }

  const slot = take();
  if (!slot) { send({ type: 'busy', reason: 'all lines in use' }); ws.close(); return; }

  ipst.sockets++;
  slot.client = ws;
  log(`[${lineName(slot.session)}] assigned to ${ip}`);
  send({ type: 'hello', mode: 'original', greeting: slot.session.greeting, machine: 'IBM 7094 (s709) / CTSS', script: SCRIPT });

  let idle = setTimeout(() => ws.close(), IDLE_MS);
  let pending = false;

  ws.on('message', async (raw) => {
    clearTimeout(idle);
    idle = setTimeout(() => ws.close(), IDLE_MS);
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.type !== 'say' || typeof msg.text !== 'string') return;
    if (pending) { send({ type: 'error', reason: 'one line at a time' }); return; }
    if (!allowMessage(ip)) { send({ type: 'error', reason: 'slow down' }); return; }
    pending = true;
    try {
      const text = await slot.session.say(msg.text);
      send({ type: 'reply', text: text ?? '' });
    } catch (e) {
      log(`[${lineName(slot.session)}] ${e.message}`);
      send({ type: 'error', reason: 'machine did not answer' });
      ws.close();
    } finally {
      pending = false;
    }
  });

  ws.on('close', () => {
    clearTimeout(idle);
    ipst.sockets--;
    log(`[${lineName(slot.session)}] released`);
    recycle(slot);
  });
});

server.listen(PORT, () => {
  log(`bridge on :${PORT}, ${slots.length} line(s): ${slots.map((s) => lineName(s.session)).join(', ')}, script ${SCRIPT}`);
  slots.forEach((s) => warm(s));
});

const shutdown = async () => {
  log('shutting down');
  await Promise.all(slots.map((s) => s.session.stop().catch(() => {})));
  setTimeout(() => process.exit(0), 5500); // let CTSS finish logging the lines out
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

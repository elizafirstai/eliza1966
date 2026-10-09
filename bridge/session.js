// One running copy of ELIZA on CTSS, reached through one telnet line.

import { CtssLine } from './ctss.js';


const SPELL = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

// What we pass through to the 7094. ELIZA reads a 72-column line; digits are
// spelled out because the 1965 code hangs when it tries to print a number
// (see KNOWN-ISSUES.md in rupertl/eliza-ctss). ? ! ; : become periods, which
// ELIZA treats as sentence delimiters anyway.
export function sanitize(text) {
  return String(text)
    .replace(/[\x00-\x1f\x7f-￿]/g, ' ')
    .replace(/[?!;:]/g, '.')
    .replace(/[^A-Za-z0-9 '.,\-]/g, ' ')
    .replace(/\d/g, (d) => ` ${SPELL[d]} `)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

const systemSetup = new Map(); // per CTSS: one-time compile of the loader and SLIP

// Work that makes CTSS load or run a big program (compiling, starting ELIZA,
// answering, quitting) is done one at a time per machine; the reconstructed
// CTSS is happier that way.
// One queue per CTSS machine.
const queues = new Map();
function serial(opts, fn) {
  const key = `${opts.host}:${opts.port}`;
  const prev = queues.get(key) || Promise.resolve();
  const run = prev.then(fn, fn);
  queues.set(key, run.catch(() => {}));
  return run;
}

// A telnet line that never gets CTSS's READY is wedged inside CTSS. If we
// hung up, s709 would hand the same dead tty to the next caller, so we keep a
// few of them open (doing nothing) and dial again to get a fresh tty.
const quarantine = [];
function park(line) {
  quarantine.push(line);
  while (quarantine.length > 3) quarantine.shift().close();
}

export async function openLine(opts, user, password, log) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const line = new CtssLine({ ...opts, log });
    await line.connect();
    try {
      await line.login(user, password);
      return line;
    } catch (e) {
      lastErr = e;
      if (line.stuck) park(line); else line.close();
      if (!line.stuck) throw e;
    }
  }
  throw lastErr;
}

// Log out and give CTSS time to finish with the line before hanging up;
// hanging up straight after LOGGED OUT is what wedges ttys.
export async function hangup(line, { quit = false } = {}) {
  if (!line || line.closed) return;
  try {
    if (quit) { // QUIT (Ctrl-\\): stop ELIZA, back to command level
      line.send('\x1c');
      await line.expect(/R [\d.]+\+[\d.]+/, 6000).catch(() => {});
      await line.sleep(600);
    }
    line.send('logout\r');
    await line.expect('LOGGED OUT', 10000);
  } catch {}
  // Keep holding the tty for a few seconds so CTSS can finish with it.
  setTimeout(() => line.close(), 5000);
}

async function runcom(opts, user, password, cmd, done, log) {
  const l = await openLine(opts, user, password, log);
  try {
    await l.command(cmd);
    await l.expect(done, 15 * 60 * 1000);
    await l.expect(/R [\d.]+\+[\d.]+/, 60000);
    await l.sleep(800);
  } finally {
    await hangup(l);
  }
}

function ensureSystem(opts, log) {
  const key = `${opts.host}:${opts.port}`;
  if (!systemSetup.has(key)) {
    systemSetup.set(key, serial(opts, async () => {
      log('[setup] building the huge loader and SLIP (first boot only, takes a few minutes)');
      await runcom(opts, 'sysdev', 'system', 'runcom mkhuge', 'MKHUGE HAS BEEN RUN', () => {});
      await runcom(opts, 'slip', 'slip', 'runcom make', 'MAKE HAS BEEN RUN', () => {});
      log('[setup] SLIP ready');
    }).catch((e) => { systemSetup.delete(key); throw e; }));
  }
  return systemSetup.get(key);
}

export class ElizaSession {
  constructor({ host, port, user, password, script = '200', log = () => {} }) {
    this.opts = { host, port };
    this.user = user;
    this.password = password;
    this.script = script;
    this.log = (m) => log(`[${host}:${port}/${user}] ${m}`);
    this.greeting = null;
    this.state = 'down'; // down | starting | ready | talking | broken
  }

  async start() {
    this.state = 'starting';
    for (let attempt = 0; attempt < 2; attempt++) {
      // Loading ELIZA is heavy work for CTSS, so it waits its turn too.
      const found = await serial(this.opts, async () => {
        const line = await openLine(this.opts, this.user, this.password);
        this.line = line;
        await line.command('r eliza');
        await line.expect(/WHICH SCRIPT DO YOU WISH TO PLAY|FILE NOT RESTORED/, 60000);
        if (!line.lastMatched.startsWith('WHICH')) {
          await line.expect(/R [\d.]+\+[\d.]+/, 10000).catch(() => {});
          await line.sleep(1000);
          await hangup(line);
          return false;
        }
        await line.sleep(800);
        line.send(`${this.script}\r`);
        const out = await line.expect('INPUT', 60000);
        this.greeting = cleanReply(out, this.script);
        await line.sleep(500);
        line.on('close', () => { if (this.state !== 'down') this.state = 'broken'; });
        return true;
      });
      if (found) {
        this.state = 'ready';
        this.log(`ready: ${this.greeting}`);
        return this;
      }
      // ELIZA not compiled for this account yet: compile it, then try again.
      this.log('ELIZA SAVED missing, compiling (first boot only)');
      await ensureSystem(this.opts, this.log);
      await serial(this.opts, () => runcom(this.opts, this.user, this.password, 'runcom make', 'MAKE HAS BEEN RUN', () => {}));
      this.log('compiled');
    }
    this.state = 'broken';
    throw new Error(`could not start ELIZA for ${this.user}`);
  }

  // Send one line, return ELIZA's reply exactly as the machine printed it.
  say(text, timeoutMs = 30000) {
    if (this.state !== 'ready') return Promise.reject(new Error('session not ready'));
    return serial(this.opts, () => this.#say(text, timeoutMs));
  }

  async #say(text, timeoutMs) {
    const clean = sanitize(text);
    if (!clean) return null;
    this.state = 'talking';
    const line = this.line;
    try {
      // CTSS drops characters typed before ELIZA is waiting to read, so type
      // the line, wait for CTSS to echo it, and retype once if it did not.
      const echo = clean.slice(0, 24);
      let echoed = false;
      for (let attempt = 0; attempt < 2 && !echoed; attempt++) {
        line.buf = '';
        line.send(`${clean}\r`);
        echoed = await line.expect(echo, 4000).then(() => true, () => false);
      }
      if (!echoed) throw new Error('line was not echoed');
      await line.expect('\n', 3000);
      // ELIZA reads until an empty line. A carriage return typed while she is
      // still digesting the first line is dropped (and not echoed), so keep
      // typing it until the machine shows any sign of having taken it.
      let taken = false;
      for (let attempt = 0; attempt < 6 && !taken; attempt++) {
        const mark = line.buf.length;
        line.send('\r');
        taken = await line.waitMore(mark, 2500);
      }
      if (!taken) throw new Error('empty line was not taken');
      const out = await line.expect(/INPUT|R [\d.]+\+[\d.]+|NEW SCRIPT/, timeoutMs);
      if (line.lastMatched !== 'INPUT') throw new Error(`ELIZA stopped (${line.lastMatched})`);
      this.state = 'ready';
      return cleanReply(out, clean);
    } catch (e) {
      this.log(`${e.message}; the machine printed ${JSON.stringify(line.buf.slice(-160))}`);
      this.state = 'broken';
      throw e;
    }
  }

  async stop() {
    const line = this.line;
    this.state = 'down';
    await serial(this.opts, () => hangup(line, { quit: true }));
  }
}

// Drop the echoed input, the script number and blank lines; join ELIZA's
// wrapped lines back into one.
function cleanReply(out, echoed) {
  const lines = out.split('\n').map((s) => s.trimEnd());
  const want = echoed.trim().toUpperCase();
  return lines
    .filter((s) => s.trim() !== '' && s.trim().toUpperCase() !== want)
    .map((s) => s.trim())
    .join(' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim();
}

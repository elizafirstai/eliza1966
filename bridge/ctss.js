// A single telnet line into CTSS running on the s709 IBM 7094 emulator.
// Minimal telnet: refuse every option the emulator offers except ECHO and
// SGA, strip IAC sequences, and expose a tiny expect() over the text stream.

import net from 'node:net';
import { EventEmitter } from 'node:events';

const IAC = 255, DONT = 254, DO = 253, WONT = 252, WILL = 251, SB = 250, SE = 240;

export class CtssLine extends EventEmitter {
  constructor({ host = '127.0.0.1', port = 7094, log = () => {} } = {}) {
    super();
    this.host = host;
    this.port = port;
    this.log = log;
    this.buf = '';      // text not yet consumed by expect()
    this.closed = false;
  }

  connect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port });
      this.sock = sock;
      const t = setTimeout(() => { sock.destroy(); reject(new Error('connect timeout')); }, timeoutMs);
      sock.once('connect', () => { clearTimeout(t); resolve(); });
      sock.once('error', (e) => { clearTimeout(t); this.closed = true; reject(e); this.emit('close'); });
      sock.on('close', () => { this.closed = true; this.emit('close'); });
      sock.on('data', (d) => this.#onData(d));
    });
  }

  #onData(data) {
    const text = [];
    for (let i = 0; i < data.length; i++) {
      const b = data[i];
      if (b === IAC) {
        const cmd = data[i + 1];
        if (cmd === DO || cmd === DONT || cmd === WILL || cmd === WONT) {
          const opt = data[i + 2];
          if (cmd === DO) this.sock.write(Buffer.from([IAC, opt === 1 || opt === 3 ? WILL : WONT, opt]));
          if (cmd === WILL) this.sock.write(Buffer.from([IAC, opt === 1 || opt === 3 ? DO : DONT, opt]));
          i += 2;
        } else if (cmd === SB) {
          while (i < data.length && !(data[i] === IAC && data[i + 1] === SE)) i++;
          i++;
        } else if (cmd === IAC) { text.push(IAC); i++; }
        else i++;
        continue;
      }
      text.push(b);
    }
    const s = Buffer.from(text).toString('latin1').replace(/\r/g, '');
    this.log(s);
    this.buf += s;
    this.emit('data');
  }

  send(s) {
    if (this.closed) throw new Error('line closed');
    this.sock.write(s, 'latin1');
  }

  // Wait until `pattern` (string or RegExp) appears. Resolves with everything
  // before it and consumes through the match.
  expect(pattern, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const check = () => {
        let idx = -1, len = 0;
        if (typeof pattern === 'string') { idx = this.buf.indexOf(pattern); len = pattern.length; }
        else { const m = pattern.exec(this.buf); if (m) { idx = m.index; len = m[0].length; } }
        if (idx >= 0) {
          const before = this.buf.slice(0, idx);
          this.lastMatched = this.buf.slice(idx, idx + len);
          this.buf = this.buf.slice(idx + len);
          cleanup();
          resolve(before);
          return true;
        }
        return false;
      };
      const onClose = () => { cleanup(); reject(new Error('line closed')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${pattern}`)); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.off('data', check); this.off('close', onClose); };
      if (check()) return;
      this.on('data', check);
      this.on('close', onClose);
    });
  }

  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async login(user, password) {
    // A line that was just hung up sometimes needs a carriage return before
    // CTSS prints READY.
    try { await this.expect('READY.', 15000); }
    catch {
      this.send('\r');
      try { await this.expect('READY.', 15000); }
      catch (e) { this.stuck = true; throw e; }
    }
    await this.sleep(300);
    this.send(`login ${user}\r`);
    await this.expect('Password', 45000);
    await this.sleep(300);
    this.send(`${password}\r`);
    await this.expect(/CTSS BEING USED|ALREADY LOGGED IN|LOGIN COMMAND INCORRECT/, 45000);
    if (this.lastMatched !== 'CTSS BEING USED') throw new Error(`login ${user}: ${this.lastMatched}`);
    await this.expect(/R [\d.]+\+[\d.]+/, 45000);
    await this.sleep(1200); // CTSS drops characters typed right after the R line
  }

  // Resolve true as soon as anything new arrives after `from` characters of
  // the buffer, false after `ms`.
  waitMore(from, ms) {
    return new Promise((resolve) => {
      if (this.buf.length > from) { resolve(true); return; }
      const on = () => { if (this.buf.length > from) { done(); resolve(true); } };
      const t = setTimeout(() => { done(); resolve(false); }, ms);
      const done = () => { clearTimeout(t); this.off('data', on); };
      this.on('data', on);
    });
  }

  // Type a command and wait for CTSS to acknowledge it with its "W hhmm.t"
  // line. Under load CTSS can drop what was typed, so retype once if needed.
  async command(cmd, ackTimeoutMs = 30000) {
    for (let attempt = 0; attempt < 3; attempt++) {
      this.send(`${cmd}\r`);
      try { await this.expect(/W \d{3,4}\.\d/, ackTimeoutMs); return; }
      catch (e) { if (this.closed) throw e; await this.sleep(1500); }
    }
    throw new Error(`CTSS ignored: ${cmd}`);
  }

  close() {
    this.closed = true;
    try { this.sock.end(); this.sock.destroy(); } catch {}
  }
}

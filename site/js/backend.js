// Two ways to reach ELIZA, and an honest label for whichever is in use.
//   original: the 1965 MAD-SLIP program on CTSS on an emulated IBM 7094,
//             through bridge/server.js over a WebSocket.
//   port:     the JavaScript port in engine.js, in the browser.
// The port always runs alongside, so the trace section has something to show.

export const LABELS = {
  connecting: 'connecting to the 7094…',
  original: 'running on an emulated IBM 7094',
  offline: 'faithful port, emulator offline',
  busy: 'faithful port, all 7094 lines busy',
};

export class Backend {
  constructor(engine, { url, connectTimeoutMs = 5000, replyTimeoutMs = 30000 }) {
    this.engine = engine;
    this.url = url;
    this.connectTimeoutMs = connectTimeoutMs;
    this.replyTimeoutMs = replyTimeoutMs;
    this.mode = 'connecting';
    this.reason = 'connecting';
    this.greeting = engine.greeting;
    this.script = '200';
    this.listeners = new Set();
    this.ws = null;
    this.waiting = null;
  }

  onChange(fn) { this.listeners.add(fn); fn(this); }
  get label() { return LABELS[this.mode === 'original' ? 'original' : this.reason]; }

  set(mode, reason) {
    this.mode = mode;
    this.reason = reason;
    this.listeners.forEach((fn) => fn(this));
  }

  connect() {
    if (!this.url) { this.set('port', 'offline'); return Promise.resolve(this); }
    return new Promise((resolve) => {
      let done = false;
      const finish = (mode, reason) => { if (done) return; done = true; this.set(mode, reason); resolve(this); };
      let ws;
      try { ws = new WebSocket(this.url); } catch { finish('port', 'offline'); return; }
      this.ws = ws;
      const timer = setTimeout(() => { try { ws.close(); } catch {} finish('port', 'offline'); }, this.connectTimeoutMs);
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'hello') {
          clearTimeout(timer);
          if (msg.greeting) this.greeting = msg.greeting;
          if (msg.script) this.script = String(msg.script);
          finish('original', 'original');
        } else if (msg.type === 'busy') {
          clearTimeout(timer);
          finish('port', 'busy');
        } else if (this.waiting) {
          const w = this.waiting;
          this.waiting = null;
          if (msg.type === 'reply') w.resolve(msg.text);
          else w.reject(new Error(msg.reason || 'error'));
        }
      };
      ws.onerror = () => { clearTimeout(timer); finish('port', 'offline'); };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.waiting) { this.waiting.reject(new Error('closed')); this.waiting = null; }
        if (done && this.mode === 'original') this.set('port', 'offline');
        finish('port', 'offline');
      };
    });
  }

  askMachine(text) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting = null; reject(new Error('timeout')); }, this.replyTimeoutMs);
      this.waiting = {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      };
      this.ws.send(JSON.stringify({ type: 'say', text }));
    });
  }

  // Returns { reply, trace, mode, portReply }
  async say(text) {
    const local = this.engine.respond(text);
    if (this.mode === 'original' && this.ws && this.ws.readyState === 1) {
      try {
        const reply = await this.askMachine(text);
        return { reply, trace: local.trace, mode: 'original', portReply: local.reply };
      } catch {
        try { this.ws.close(); } catch {}
        this.set('port', 'offline');
      }
    } else {
      await new Promise((r) => setTimeout(r, 260 + Math.random() * 240));
    }
    return { reply: local.reply, trace: local.trace, mode: 'port', portReply: local.reply };
  }
}

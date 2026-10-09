// The CRT: real text over the glass. Prints like a teletype, one character at
// a time, and feeds the paper up one line at a time in an 80 ms step.

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Screen {
  constructor({ machine, screen, paper, live, glass, crt }) {
    Object.assign(this, { machine, screen, paper, live, glass, crt });
    this.msPerChar = 35;
    this.instant = false;       // set while skipping the boot
    this.onPrint = () => {};    // (true|false) start/stop teletype chatter
    this.cursor = document.createElement('span');
    this.cursor.className = 'cursor';
    
    this.cursor.setAttribute('aria-hidden', 'true');
    this.inputLine = null;
    this.typed = null;
    this.scrollAnim = null;

    const ro = new ResizeObserver(() => this.layout());
    ro.observe(machine);
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  setGlass(glass) { this.glass = glass; this.layout(); }

  // Keep the HTML screen exactly over the SVG glass, and size the type so
  // about 18 lines fit under the title.
  layout() {
    if (!this.glass) return;
    const m = this.machine.getBoundingClientRect();
    const g = this.glass.getBoundingClientRect();
    if (!g.width) return;
    const s = this.screen.style;
    s.left = `${g.left - m.left}px`;
    s.top = `${g.top - m.top}px`;
    s.width = `${g.width}px`;
    s.height = `${g.height}px`;
    s.setProperty('--srad', `${g.width * 0.05}px`);
    const pad = Math.max(8, g.width * 0.045);
    s.setProperty('--spad', `${pad}px ${pad * 1.15}px`);
    const innerH = g.height - pad * 2;
    const innerW = g.width - pad * 2.3;
    let fs = innerH / (18 * 1.32 + 3.0);
    fs = Math.max(fs, 8.5);
    fs = Math.min(fs, innerW / (40 * 0.6));
    s.setProperty('--fs', `${fs.toFixed(2)}px`);
    s.setProperty('--pfs', `${(innerW / (78 * 0.6)).toFixed(2)}px`);
    this.lineH = fs * 1.32;
  }

  get speed() { return this.instant || reduced() ? 0 : this.msPerChar; }

  // ------------------------------------------------------------ scrolling
  feed() {
    const p = this.paper;
    const target = p.scrollHeight - p.clientHeight;
    if (target <= p.scrollTop + 0.5) return;
    if (this.instant || reduced()) { p.scrollTop = target; return; }
    const from = p.scrollTop;
    const t0 = performance.now();
    cancelAnimationFrame(this.scrollAnim);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 80);
      p.scrollTop = from + (target - from) * (1 - Math.pow(1 - k, 3));
      if (k < 1) this.scrollAnim = requestAnimationFrame(step);
    };
    this.scrollAnim = requestAnimationFrame(step);
  }

  // --------------------------------------------------------------- output
  newLine(cls = '') {
    const ln = document.createElement('div');
    ln.className = `ln ${cls}`.trim();
    if (this.inputLine && this.inputLine.parentNode === this.paper) this.paper.insertBefore(ln, this.inputLine);
    else this.paper.appendChild(ln);
    return ln;
  }

  blank() { this.newLine('blank'); this.feed(); }

  clear() { this.paper.textContent = ''; this.inputLine = null; }

  async print(text, { cls = 'eliza', speed } = {}) {
    const ms = speed ?? this.speed;
    const ln = this.newLine(cls);
    const node = document.createTextNode('');
    ln.append(node, this.cursor);
    this.cursor.classList.add('solid');
    if (ms > 0) this.onPrint(true);
    let lastH = ln.offsetHeight;
    for (const ch of text) {
      if (this.instant || reduced()) { node.data += text.slice(node.data.length); break; }
      node.data += ch;
      if (ln.offsetHeight !== lastH) { lastH = ln.offsetHeight; this.feed(); }
      if (ms > 0) await sleep(ms);
    }
    if (ms > 0) this.onPrint(false);
    this.cursor.classList.remove('solid');
    this.cursor.remove();
    this.feed();
    return ln;
  }

  // Something typed at the terminal by "the operator" during the boot.
  async typeAs(text, onKey) {
    const ln = this.newLine('user');
    const node = document.createTextNode('');
    ln.append(node, this.cursor);
    this.feed();
    if (!(this.instant || reduced())) await sleep(380);
    for (const ch of text) {
      if (this.instant || reduced()) { node.data = text; break; }
      onKey?.(ch);
      node.data += ch;
      await sleep(85 + Math.random() * 110);
    }
    if (!(this.instant || reduced())) { onKey?.('\n'); await sleep(160); }
    this.cursor.remove();
    this.feed();
  }

  async portrait(text) {
    const box = document.createElement('div');
    box.className = 'portrait';
    box.setAttribute('aria-hidden', 'true');
    this.paper.appendChild(box);
    for (const row of text.replace(/\n+$/, '').split('\n')) {
      if (this.instant) return;
      const ln = document.createElement('div');
      ln.className = 'ln';
      ln.textContent = row;
      box.appendChild(ln);
      this.feed();
      if (!reduced()) await sleep(42);
    }
    if (!this.instant && !reduced()) await sleep(1100);
    // feed the paper until the portrait is gone, one line at a time
    const spacer = document.createElement('div');
    this.paper.appendChild(spacer);
    const lines = Math.ceil(this.paper.clientHeight / this.lineH) + 1;
    for (let i = 0; i < lines && !this.instant; i++) {
      spacer.style.height = `${(i + 1) * this.lineH}px`;
      this.feed();
      if (!reduced()) await sleep(70);
    }
    this.clear();
  }

  // ---------------------------------------------------------------- input
  showInput() {
    if (!this.inputLine) {
      this.inputLine = document.createElement('div');
      this.inputLine.className = 'ln user live';
      this.typed = document.createTextNode('');
      this.inputLine.append(this.typed, this.cursor);
    }
    this.paper.appendChild(this.inputLine);
    this.inputLine.appendChild(this.cursor);
    this.feed();
  }

  setInput(text) {
    if (!this.inputLine) this.showInput();
    this.typed.data = text;
    this.feed();
  }

  // Turn the live input line into a plain transcript line.
  commitInput() {
    const ln = this.inputLine;
    if (!ln) return;
    this.cursor.remove();
    ln.classList.remove('live');
    this.inputLine = null;
  }

  announce(text) {
    this.live.textContent = '';
    setTimeout(() => { this.live.textContent = text; }, 30);
  }

  async powerOn() {
    this.machine.classList.add('powered');
    if (reduced()) return;
    this.crt.classList.add('on');
    await sleep(520);
  }
}

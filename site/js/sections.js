// Everything below the machine.

import SOURCE from './eliza-source.js';
import { CONFIG, TOKEN, isLive, shortAddr } from './config.js';
import { openWallet } from './wallet.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => window.matchMedia('(max-width: 767px)').matches;

// ------------------------------------------------------- smooth scrolling

export function setupScroll() {
  const gsap = window.gsap, ST = window.ScrollTrigger;
  if (gsap && ST) gsap.registerPlugin(ST);
  if (reduced() || !window.Lenis) return null;
  const lenis = new window.Lenis({ duration: 1.1, smoothWheel: true });
  if (gsap && ST) {
    lenis.on('scroll', ST.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
  return lenis;
}

// Scroll progress of an element through the viewport, for when GSAP is missing.
function scrubFallback(el, fn) {
  const update = () => {
    const r = el.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    fn(Math.min(1, Math.max(0, total > 0 ? -r.top / total : 0)));
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// -------------------------------------------------------------- printout

export function setupPrintout() {
  const pre = document.getElementById('source');
  const section = document.getElementById('code');
  const fan = document.getElementById('fanfold');
  const win = document.getElementById('paper-window');
  document.getElementById('source-link').href = CONFIG.links.source;

  const render = () => {
    // Columns 1-80 are the card; the last six are its sequence number.
    const lines = SOURCE.replace(/\n+$/, '').split('\n').map((l) => (narrow() ? l.slice(0, 80) : l).replace(/\s+$/, ''));
    pre.textContent = '';
    const head = document.createElement('span');
    head.className = 'head';
    head.textContent = '           R  ELIZA MAD-SLIP SOURCE\n\n';
    pre.append(head, lines.join('\n'));
  };
  render();
  matchMedia('(max-width: 767px)').addEventListener('change', render);

  if (reduced()) return;
  const move = (p) => {
    const dist = Math.max(0, fan.offsetHeight - win.clientHeight);
    fan.style.transform = `translateY(${(-dist * p).toFixed(1)}px)`;
  };
  if (window.gsap && window.ScrollTrigger) {
    window.ScrollTrigger.create({
      trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.6,
      onUpdate: (st) => move(st.progress), invalidateOnRefresh: true,
    });
  } else scrubFallback(section, move);
}

// ------------------------------------------------------------------ trace

const LABELS = {
  'you said': 'you said', keywords: 'keywords found', keyword: 'keyword', link: 'link',
  decomposition: 'decomposition', reassembly: 'reassembly', 'memory of': 'memory of', reply: 'reply',
};

export function createTrace() {
  const dl = document.getElementById('trace');
  const note = document.getElementById('trace-note');
  let pendingReplay = false;
  let visible = false;

  const play = () => {
    if (reduced()) return;
    dl.classList.remove('play');
    void dl.offsetWidth;
    dl.classList.add('play');
  };

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && pendingReplay) { pendingReplay = false; play(); }
  }, { threshold: 0.35 }).observe(dl);

  return function show(trace, { mode, reply, portReply } = {}) {
    dl.textContent = '';
    trace.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'row' + (s.label === 'reply' ? ' reply' : '');
      row.style.setProperty('--i', i);
      const dt = document.createElement('dt');
      dt.textContent = LABELS[s.label] || s.label;
      const dd = document.createElement('dd');
      dd.textContent = s.value;
      row.append(dt, dd);
      dl.appendChild(row);
    });
    if (mode === 'original' && reply && reply !== portReply) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.setProperty('--i', trace.length);
      row.innerHTML = '<dt>the 7094 said</dt><dd></dd>';
      row.querySelector('dd').textContent = reply;
      dl.appendChild(row);
    }
    note.textContent = mode === 'original'
      ? 'The 7094 answered you. This trace is the JavaScript port of the same algorithm replaying your sentence, since the 1965 program keeps its reasoning to itself.'
      : 'Trace from the JavaScript port of the 1966 algorithm, reading the original DOCTOR script.';
    if (visible) play(); else pendingReplay = true;
  };
}

// --------------------------------------------------------------- timeline

export function setupTimeline() {
  const tl = document.getElementById('tl');
  const items = [...tl.querySelectorAll('li')];
  const line = tl.querySelector('.tl-line');
  // the line runs from the first dot to the last one
  const fit = () => {
    const last = items[items.length - 1].querySelector('.dot').getBoundingClientRect();
    const box = tl.getBoundingClientRect();
    if (narrow()) { line.style.right = ''; line.style.bottom = `${box.bottom - last.top - 7}px`; }
    else { line.style.bottom = ''; line.style.right = `${box.right - last.left - 7}px`; }
  };
  fit();
  new ResizeObserver(fit).observe(tl);
  if (reduced()) return;
  const set = (p) => {
    tl.style.setProperty('--p', p.toFixed(3));
    items.forEach((li, i) => li.classList.toggle('on', p >= i / (items.length - 1) - 0.001));
  };
  if (window.gsap && window.ScrollTrigger) {
    window.ScrollTrigger.create({
      trigger: tl, start: 'top 80%', end: 'bottom 45%', scrub: 0.4,
      onUpdate: (st) => set(st.progress), onRefresh: (st) => set(st.progress),
    });
  } else {
    const update = () => {
      const r = tl.getBoundingClientRect();
      const a = window.innerHeight * 0.8, b = window.innerHeight * 0.45;
      set(Math.min(1, Math.max(0, (a - r.top) / (r.height + a - b))));
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }
}

// ------------------------------------------------------------------ token

export function setupToken() {
  const code = document.getElementById('ca-text');
  const copy = document.getElementById('ca-copy');
  const live = isLive();
  code.textContent = live ? shortAddr(TOKEN.mint) : 'CA: not live yet';
  code.title = live ? TOKEN.mint : 'The Solana mint address appears here at launch.';
  copy.hidden = !live;
  document.getElementById('chain').textContent = `on ${TOKEN.chain}`;
  document.getElementById('dex-link').href = TOKEN.dexscreener(TOKEN.mint);
  document.getElementById('x-link').href = CONFIG.links.x;
  document.getElementById('gh-link').href = CONFIG.links.github;

  let t;
  copy.addEventListener('click', async () => {
    const done = () => { copy.textContent = 'copied'; clearTimeout(t); t = setTimeout(() => { copy.textContent = 'copy'; }, 1200); };
    try {
      await navigator.clipboard.writeText(TOKEN.mint);
      done();
    } catch {
      const r = document.createRange();
      code.textContent = TOKEN.mint;
      r.selectNodeContents(code);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      copy.textContent = 'press ⌘C';
      clearTimeout(t);
      t = setTimeout(() => { copy.textContent = 'copy'; code.textContent = shortAddr(TOKEN.mint); }, 2400);
    }
  });
  document.getElementById('buy').addEventListener('click', openWallet);
}

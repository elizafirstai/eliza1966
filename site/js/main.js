import { Eliza } from './engine.js';
import DOCTOR from './doctor-script.js';
import PORTRAIT from './portrait.js';
import { buildTerminal } from './terminal.js';
import { Screen } from './screen.js';
import { Keyboard } from './keyboard.js';
import { Backend } from './backend.js';
import { sound } from './sound.js';
import { CONFIG } from './config.js';
import { setupScroll, setupPrintout, createTrace, setupTimeline, setupToken } from './sections.js';

const $ = (id) => document.getElementById(id);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const MAX_LINE = 72; // a teletype line

// ------------------------------------------------------------- the machine

const hero = $('hero');
const svg = $('terminal');
const machine = $('machine');
const mq = matchMedia('(max-width: 767px)');
let term = buildTerminal(svg, { compact: mq.matches });

const screen = new Screen({
  machine, screen: $('screen'), paper: $('paper'), live: $('live'), glass: term.glass, crt: $('crt'),
});
screen.onPrint = (on) => sound.chatter(on);

const engine = new Eliza(DOCTOR);
const params = new URLSearchParams(location.search);
// ?bridge= is for testing against a local bridge only, so a link can't point
// the page at someone else's server and have it labelled as the real 7094.
const testBridge = (() => {
  try {
    const u = new URL(params.get('bridge') || '');
    return /^wss?:$/.test(u.protocol) && ['localhost', '127.0.0.1', location.hostname].includes(u.hostname) ? u.href : '';
  } catch { return ''; }
})();
let bridgeUrl = testBridge || CONFIG.bridgeUrl;
if (bridgeUrl === 'same-origin' && /^https?:$/.test(location.protocol)) {
  bridgeUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
} else if (bridgeUrl === 'same-origin') bridgeUrl = '';
const backend = new Backend(engine, {
  url: bridgeUrl,
  connectTimeoutMs: CONFIG.connectTimeoutMs,
  replyTimeoutMs: CONFIG.replyTimeoutMs,
});
backend.onChange((b) => { $('mode-label').textContent = b.label; });
const connecting = backend.connect();

// --------------------------------------------------------------- typing

let ready = false;   // boot finished, input accepted
let busy = false;    // ELIZA is answering
let input = '';
let heroVisible = true;

new IntersectionObserver((e) => { heroVisible = e[0].intersectionRatio > 0.35; }, { threshold: [0, 0.35, 0.6] }).observe(machine);

const showTrace = createTrace();

const kb = new Keyboard({
  svg, sound,
  isActive: () => heroVisible && !document.querySelector('dialog[open]'),
  onChar(ch) {
    if (!ready || input.length >= MAX_LINE) return;
    input += ch;
    if (!busy) screen.setInput(input);
  },
  onBack() {
    if (!ready || !input) return;
    input = input.slice(0, -1);
    if (!busy) screen.setInput(input);
  },
  async onReturn() {
    if (!ready || busy) return;
    const text = input.trim();
    if (!text) return;
    busy = true;
    input = '';
    screen.commitInput();
    screen.blank();
    const r = await backend.say(text);
    await screen.print(r.reply);
    screen.announce(r.reply);
    screen.blank();
    busy = false;
    screen.showInput();
    screen.setInput(input);
    showTrace(r.trace, r);
  },
});
kb.setKeys(term.keys);
if (matchMedia('(pointer: coarse)').matches) kb.bindMobile($('mobile-input'), $('screen'));

mq.addEventListener('change', () => {
  term = buildTerminal(svg, { compact: mq.matches });
  kb.setKeys(term.keys);
  screen.setGlass(term.glass);
});

// --------------------------------------------------------------- toggles

const soundButtons = [$('sound-toggle'), $('sound-toggle-2')];
soundButtons.forEach((b) => b.addEventListener('click', () => sound.toggle()));
sound.subscribe((on) => soundButtons.forEach((b) => {
  b.textContent = `sound: ${on ? 'on' : 'off'}`;
  b.setAttribute('aria-pressed', String(on));
}));

const speed = $('speed-toggle');
speed.addEventListener('click', () => {
  const on = speed.getAttribute('aria-pressed') !== 'true';
  speed.setAttribute('aria-pressed', String(on));
  speed.textContent = `1966 speed: ${on ? 'on' : 'off'}`;
  screen.msPerChar = on ? 100 : 35; // 10 characters a second, a Model 33/35 teletype
});

// ------------------------------------------------------------------ boot

let skipped = false;
const wait = (ms) => (skipped ? Promise.resolve() : sleep(ms));
const skipBtn = $('skip');

function revealNow() {
  machine.classList.add('powered');
  term.root.removeAttribute('filter');
  hero.classList.add('reveal');
  hero.classList.remove('intro');
}

function dissolve(ms) {
  return new Promise((resolve) => {
    term.root.setAttribute('filter', 'url(#reveal)');
    term.revealK.setAttribute('k4', '0.38');
    hero.classList.add('reveal');
    const t0 = performance.now();
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 2.2);
      term.revealK.setAttribute('k4', (0.38 + e * 1.25).toFixed(3));
      if (k < 1 && !skipped) requestAnimationFrame(frame);
      else { revealNow(); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

function ctssClock(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const date = `${p(d.getMonth() + 1)}/${p(d.getDate())}/${p(d.getFullYear() % 100)}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}.${Math.floor(d.getSeconds() / 6)}`;
  return { date, time };
}

const keyForChar = (ch) => (ch === '\n' ? 'return' : ch === ' ' ? 'space' : ch.toLowerCase());

async function boot() {
  const short = !!store.get('eliza1966.booted');
  skipBtn.hidden = false;
  skipBtn.addEventListener('click', () => {
    skipped = true;
    screen.instant = true;
    revealNow();
    skipBtn.hidden = true;
  }, { once: true });

  if (reduced()) { skipped = true; screen.instant = true; revealNow(); }
  else {
    await wait(400);
    if (!skipped) await dissolve(short ? 700 : 1200);
    await wait(80);
    if (!skipped) await screen.powerOn();
  }

  const fast = { speed: skipped ? 0 : 12 };
  const operator = (s) => screen.typeAs(s, (ch) => kb.animate(keyForChar(ch)));
  const { date, time } = ctssClock();

  if (!short) {
    await screen.print('s709 2.4.4 COMM tty7 (KSR-37)', fast);
    screen.blank();
    await screen.print(`MIT8C0: 1 USER AT ${date} ${time}, MAX = 30`, fast);
    await screen.print('READY.', fast);
    screen.blank();
    await operator('login eliza');
    await screen.print(`W ${time}`, fast);
    await screen.print('Password', fast);
    await wait(700);
    await screen.print(` M1416    10 LOGGED IN  ${date} ${time} FROM 700000`, fast);
    await screen.print(' CTSS BEING USED IS: MIT8C0', fast);
    await screen.print('R .016+.000', fast);
    screen.blank();
  }
  await operator('r eliza');
  await screen.print(`W ${time}`, fast);
  await screen.print('EXECUTION.', fast);
  await screen.print('WHICH SCRIPT DO YOU WISH TO PLAY', fast);
  await Promise.race([connecting, sleep(1500)]);
  await operator(backend.script);
  if (!short && !skipped) await screen.portrait(PORTRAIT);
  else screen.blank();

  await connecting;
  skipBtn.hidden = true;
  screen.instant = false;
  if (skipped) screen.instant = true;
  await screen.print(backend.greeting);
  screen.instant = false;
  screen.announce(backend.greeting);
  screen.blank();
  ready = true;
  screen.showInput();
  screen.setInput(input);
  store.set('eliza1966.booted', '1');
}

// -------------------------------------------------------------- sections

setupScroll();
setupPrintout();
setupTimeline();
setupToken();
showTrace(new Eliza(DOCTOR).respond('men are all alike').trace, { mode: 'port' });

(document.fonts?.ready || Promise.resolve()).then(() => { screen.layout(); window.ScrollTrigger?.refresh(); });
boot();

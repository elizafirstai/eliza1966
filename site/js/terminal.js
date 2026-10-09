// The terminal, drawn as one inline SVG. Flat fills from the five-colour
// palette; all shading is stipple made by SVG filters (noise thresholded
// against a blurred density shape), so lit areas stay flat and shadows turn
// into dots, like a printed manual illustration.

const NS = 'http://www.w3.org/2000/svg';
export const C = { black: '#0A0A08', cream: '#E9E3B4', shadow: '#B9B183', dark: '#2A2A24' };

// ------------------------------------------------------------ key layout

const ROWS = [
  { off: 0, keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', "'", ['back', 1.5]] },
  { off: 0.5, keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '!', '?'] },
  { off: 0.75, keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ',', ['return', 1.75]] },
  { off: 0, keys: [['shift', 1.75], 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', ['shift', 2.75]] },
  { off: 2.75, keys: [['space', 7]] },
];
const PAD = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  [['0', 2], '.'],
];
const LABEL = { back: 'BACK', return: 'RETURN', shift: 'SHIFT', space: '' };
const NAME = { back: 'backspace', return: 'return', shift: 'shift', space: 'space', "'": 'apostrophe',
  ',': 'comma', '.': 'period', '?': 'question mark', '!': 'exclamation mark' };

// ------------------------------------------------------------- geometry

const W = 1200, H = 1060;
const HOOD = 'M232 24 H968 C1012 24 1042 54 1042 98 L1054 668 H146 L158 98 C158 54 188 24 232 24 Z';
const BEZEL = { x: 212, y: 70, w: 776, h: 560, rx: 54 };
export const GLASS = { x: 238, y: 94, w: 724, h: 510, rx: 38 };
const DECK = 'M146 668 H1054 L1112 968 H88 Z';
const WELL = { top: 690, bottom: 952, topL: 196, topR: 1004, botL: 134, botR: 1066 };
const WELL_PATH = `M${WELL.topL} ${WELL.top} H${WELL.topR} L${WELL.botR} ${WELL.bottom} H${WELL.botL} Z`;
const LIP = 'M88 968 H1112 L1110 1004 Q1109 1012 1100 1012 H100 Q91 1012 90 1004 Z';

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// Stipple filter: blur the source shape into a density map, compare it with
// stretched noise, keep the pixels where density wins, paint them one colour.
function stippleFilter(defs, id, { color, blur, freq = 0.42, seed = 3, gain = 1 }) {
  const f = el('filter', { id, x: '-5%', y: '-5%', width: '110%', height: '110%',
    'color-interpolation-filters': 'sRGB', filterUnits: 'objectBoundingBox' }, defs);
  el('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: blur, result: 'b' }, f);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: freq, numOctaves: 1, seed, result: 'n' }, f);
  el('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0', result: 'na' }, f);
  const ct = el('feComponentTransfer', { in: 'na', result: 'ns' }, f);
  el('feFuncA', { type: 'linear', slope: 3.4, intercept: -1.2 }, ct);
  el('feComposite', { in: 'b', in2: 'ns', operator: 'arithmetic', k1: 0, k2: gain, k3: -1, k4: 0.49, result: 'd' }, f);
  const th = el('feComponentTransfer', { in: 'd', result: 't' }, f);
  el('feFuncA', { type: 'discrete', tableValues: '0 1' }, th);
  el('feFlood', { 'flood-color': color, result: 'c' }, f);
  el('feComposite', { in: 'c', in2: 't', operator: 'in' }, f);
}

// Whole-machine reveal: show only pixels whose noise is under a threshold T.
function revealFilter(defs) {
  const f = el('filter', { id: 'reveal', x: '0', y: '0', width: '100%', height: '100%',
    'color-interpolation-filters': 'sRGB', filterUnits: 'userSpaceOnUse' }, defs);
  f.setAttribute('x', 0); f.setAttribute('y', 0); f.setAttribute('width', W); f.setAttribute('height', H);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.4, numOctaves: 1, seed: 66, result: 'n' }, f);
  el('feColorMatrix', { in: 'n', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0', result: 'na' }, f);
  const ct = el('feComponentTransfer', { in: 'na', result: 'ns' }, f);
  el('feFuncA', { type: 'linear', slope: 3.4, intercept: -1.2 }, ct);
  const k = el('feComposite', { id: 'reveal-k', in: 'ns', in2: 'ns', operator: 'arithmetic', k1: 0, k2: -1, k3: 0, k4: 0.4, result: 'd' }, f);
  const th = el('feComponentTransfer', { in: 'd', result: 'm' }, f);
  el('feFuncA', { type: 'discrete', tableValues: '0 1' }, th);
  el('feComposite', { in: 'SourceGraphic', in2: 'm', operator: 'in' }, f);
  return k;
}

function shadeGroup(parent, filter, clip) {
  return el('g', { filter: `url(#${filter})`, 'clip-path': clip ? `url(#${clip})` : '', 'aria-hidden': 'true' }, parent);
}

// Coiled cable: a prolate cycloid wrapped along a bezier.
function coilPath() {
  const P = [[124, 842], [60, 860], [30, 940], [26, 1062]];
  const bez = (t, i) => {
    const m = 1 - t;
    return m * m * m * P[0][i] + 3 * m * m * t * P[1][i] + 3 * m * t * t * P[2][i] + t * t * t * P[3][i];
  };
  const pts = [];
  const loops = 15, r = 15, steps = 900;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = bez(t, 0), y = bez(t, 1);
    const dx = bez(Math.min(1, t + 0.001), 0) - bez(Math.max(0, t - 0.001), 0);
    const dy = bez(Math.min(1, t + 0.001), 1) - bez(Math.max(0, t - 0.001), 1);
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
    const th = t * loops * Math.PI * 2;
    pts.push([x + nx * r * Math.cos(th) + tx * r * 0.62 * Math.sin(th), y + ny * r * Math.cos(th) + ty * r * 0.62 * Math.sin(th)]);
  }
  return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
}

// ----------------------------------------------------------------- build

export function buildTerminal(svg, { compact = false } = {}) {
  svg.innerHTML = '';
  const vb = compact ? '78 0 1044 1050' : `0 0 ${W} ${H}`;
  svg.setAttribute('viewBox', vb);
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Terminal keyboard. Click the keys to type to ELIZA.');

  const defs = el('defs', {}, svg);
  stippleFilter(defs, 'st-dark', { color: C.dark, blur: 12, freq: 0.45, seed: 4, gain: 1.0 });
  stippleFilter(defs, 'st-mid', { color: C.shadow, blur: 18, freq: 0.42, seed: 9, gain: 1.0 });
  stippleFilter(defs, 'st-tight', { color: C.dark, blur: 5, freq: 0.5, seed: 12, gain: 1.1 });
  stippleFilter(defs, 'st-black', { color: C.black, blur: 7, freq: 0.5, seed: 21, gain: 1.05 });
  const revealK = revealFilter(defs);

  const clip = (id, d) => { const c = el('clipPath', { id }, defs); el('path', { d }, c); };
  clip('c-hood', HOOD);
  clip('c-deck', DECK);
  clip('c-well', WELL_PATH);
  clip('c-lip', LIP);

  const root = el('g', { id: 'machine-root' }, svg);
  const art = el('g', { id: 'machine-art' }, root);

  // floor shadow
  const floor = shadeGroup(art, 'st-dark');
  el('ellipse', { cx: 600, cy: 1022, rx: 560, ry: 16, fill: '#000' }, floor);

  // cable (behind the body)
  const cable = el('g', { 'aria-hidden': 'true' }, art);
  const cp = coilPath();
  el('path', { d: cp, fill: 'none', stroke: C.shadow, 'stroke-width': 6.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, cable);
  el('path', { d: cp, fill: 'none', stroke: C.cream, 'stroke-width': 2.2, transform: 'translate(-1.2 -1.4)', 'stroke-linecap': 'round' }, cable);
  el('path', { d: 'M104 830 h22 v26 h-22 z', fill: C.dark }, cable);

  // hood
  el('path', { d: HOOD, fill: C.cream }, art);
  const hs = shadeGroup(art, 'st-mid', 'c-hood');
  el('path', { d: HOOD, fill: 'none', stroke: '#000', 'stroke-width': 30 }, hs);
  el('rect', { x: 1000, y: 40, width: 80, height: 640, fill: '#000' }, hs);
  el('rect', { x: 140, y: 646, width: 920, height: 40, fill: '#000' }, hs);
  const hd = shadeGroup(art, 'st-dark', 'c-hood');
  el('path', { d: HOOD, fill: 'none', stroke: '#000', 'stroke-width': 9 }, hd);
  el('rect', { x: 1032, y: 60, width: 40, height: 620, fill: '#000' }, hd);
  // dots crowding around the screen recess
  const rim = shadeGroup(art, 'st-tight', 'c-hood');
  el('rect', { x: BEZEL.x - 3, y: BEZEL.y - 3, width: BEZEL.w + 6, height: BEZEL.h + 6, rx: BEZEL.rx + 3, fill: 'none', stroke: '#000', 'stroke-width': 10 }, rim);

  // bezel recess and glass
  el('rect', { x: BEZEL.x, y: BEZEL.y, width: BEZEL.w, height: BEZEL.h, rx: BEZEL.rx, fill: C.dark }, art);
  const bz = shadeGroup(art, 'st-black');
  el('rect', { x: BEZEL.x + 6, y: BEZEL.y + 6, width: BEZEL.w - 12, height: 30, rx: 20, fill: '#000' }, bz);
  el('rect', { x: BEZEL.x + 6, y: BEZEL.y + 6, width: 26, height: BEZEL.h - 12, rx: 13, fill: '#000' }, bz);
  el('rect', { id: 'glass', x: GLASS.x, y: GLASS.y, width: GLASS.w, height: GLASS.h, rx: GLASS.rx, fill: C.black }, art);

  // controls under the screen
  el('circle', { cx: 236, cy: 650, r: 8, fill: C.dark }, art);
  el('circle', { cx: 262, cy: 650, r: 8, fill: C.dark }, art);
  const badge = el('text', { x: 986, y: 655, 'text-anchor': 'end', fill: C.shadow,
    style: "font: 800 14px 'Archivo', sans-serif; font-stretch: 87.5%; letter-spacing: .12em" }, art);
  badge.textContent = 'MODEL 1966';

  // deck, seam, well
  el('path', { d: DECK, fill: C.cream }, art);
  const ds = shadeGroup(art, 'st-mid', 'c-deck');
  el('rect', { x: 100, y: 640, width: 1000, height: 46, fill: '#000' }, ds);
  el('path', { d: 'M146 668 L88 968', stroke: '#000', 'stroke-width': 40 }, ds);
  el('path', { d: 'M1054 668 L1112 968', stroke: '#000', 'stroke-width': 60 }, ds);
  const dd = shadeGroup(art, 'st-dark', 'c-deck');
  el('rect', { x: 100, y: 658, width: 1000, height: 18, fill: '#000' }, dd);
  el('path', { d: 'M1054 668 L1112 968', stroke: '#000', 'stroke-width': 14 }, dd);
  el('path', { d: 'M146 668 H1054', stroke: C.dark, 'stroke-width': 3 }, art);

  el('path', { d: WELL_PATH, fill: C.shadow }, art);
  const ws = shadeGroup(art, 'st-dark', 'c-well');
  el('rect', { x: 120, y: 670, width: 960, height: 36, fill: '#000' }, ws);
  el('path', { d: `M${WELL.topL} ${WELL.top} L${WELL.botL} ${WELL.bottom}`, stroke: '#000', 'stroke-width': 26 }, ws);

  // front lip
  el('path', { d: LIP, fill: C.shadow }, art);
  const ls = shadeGroup(art, 'st-dark', 'c-lip');
  el('rect', { x: 80, y: 994, width: 1040, height: 30, fill: '#000' }, ls);
  el('rect', { x: 80, y: 960, width: 1040, height: 12, fill: '#000' }, ls);

  // ------------------------------------------------------------- keys
  const U = compact ? 12.5 : 16.25;
  const frontW = WELL.botR - WELL.botL;
  const unit = compact ? 62 : (frontW - 44) / U;
  const yOf = (v) => { const t = v / 5; return 703 + 240 * (t * (0.9 + 0.1 * t)); };
  const sOf = (y) => ((WELL.topR - WELL.topL) + (y - WELL.top) * (frontW - (WELL.topR - WELL.topL)) / (WELL.bottom - WELL.top)) / frontW;
  const map = (u, v) => { const y = yOf(v); return [600 + (u - U / 2) * unit * sOf(y), y]; };
  const quad = (pts) => 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' Z';

  const keyShadow = shadeGroup(art, 'st-dark', 'c-well');
  const keyLayer = el('g', { class: 'keys' }, root);
  const keys = new Map(); // key value -> [g, ...]
  const order = [];

  const addKey = (k, u0, w, row, pad = false) => {
    const u1 = u0 + w;
    const v0 = row;
    const top = [map(u0 + 0.1, v0 + 0.05), map(u1 - 0.1, v0 + 0.05), map(u1 - 0.1, v0 + 0.68), map(u0 + 0.1, v0 + 0.68)];
    const side = [map(u0 + 0.1, v0 + 0.68), map(u1 - 0.1, v0 + 0.68), map(u1 - 0.04, v0 + 0.92), map(u0 + 0.04, v0 + 0.92)];
    const base = [map(u0 + 0.04, v0 + 0.1), map(u1 - 0.04, v0 + 0.1), map(u1 - 0.04, v0 + 0.92), map(u0 + 0.04, v0 + 0.92)];
    el('path', { d: quad(base), fill: '#000', transform: 'translate(4 7)' }, keyShadow);

    const special = k in LABEL;
    const g = el('g', {
      class: `key ${special ? 'k-light' : 'k-dark'}`, 'data-key': k, tabindex: 0, role: 'button',
      'aria-label': NAME[k] || k + (pad ? ' (keypad)' : ''),
    }, keyLayer);
    if (pad) g.dataset.pad = '1';
    el('path', { class: 'k-side', d: quad(side), fill: special ? C.shadow : C.black,
      style: `transform-origin: 50% ${side[2][1].toFixed(1)}px` }, g);
    const cap = el('g', { class: 'k-cap' }, g);
    el('path', { class: 'k-top', d: quad(top), fill: special ? C.cream : C.dark }, cap);
    el('path', { class: 'k-press', d: quad(top), fill: special ? C.dark : C.black }, cap);
    const cx = (top[0][0] + top[1][0] + top[2][0] + top[3][0]) / 4;
    const cy = (top[0][1] + top[3][1]) / 2;
    const s = sOf(cy);
    const label = special ? LABEL[k] : k.toUpperCase();
    if (label) {
      const t = el('text', {
        x: cx.toFixed(1), y: (cy + (special ? 4 : 6) * s).toFixed(1), 'text-anchor': 'middle',
        fill: special ? C.dark : C.cream, class: 'k-label',
        style: `font-size:${((special ? 11 : 17) * s).toFixed(1)}px`,
      }, cap);
      t.textContent = label;
    }
    el('path', { class: 'k-focus', d: quad(top), fill: 'none' }, cap);
    if (!keys.has(k)) keys.set(k, []);
    keys.get(k).push(g);
    order.push(g);
  };

  ROWS.forEach((row, r) => {
    let u = row.off;
    for (const item of row.keys) {
      const [k, w] = Array.isArray(item) ? item : [item, 1];
      addKey(k, u, w, r);
      u += w;
    }
  });
  if (!compact) {
    PAD.forEach((row, r) => {
      let u = 13.25;
      for (const item of row) {
        const [k, w] = Array.isArray(item) ? item : [item, 1];
        addKey(k, u, w, r, true);
        u += w;
      }
    });
  }

  return { keys, order, revealK, glass: svg.querySelector('#glass'), root };
}

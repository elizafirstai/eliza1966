// ELIZA — a faithful port of the algorithm Joseph Weizenbaum described in
// "ELIZA — A Computer Program For the Study of Natural Language Communication
// Between Man and Machine", Communications of the ACM 9(1), January 1966.
//
// It reads the DOCTOR script exactly as published in that paper (tape.200 in
// rupertl/eliza-ctss) and implements the features the paper describes:
// keyword stack with precedence, word substitution, DLIST tags, decomposition
// and reassembly rules cycled in order, =links, PRE, NEWKEY, and the MEMORY
// mechanism driven by the original SLIP HASH function and the LIMIT counter.
//
// Output is printed the way the IBM 7094 printed it: every token separated by
// a single space, so punctuation stands alone ("HOW DO YOU DO . PLEASE ...").
//
// No randomness. No language model. Same input, same conversation.

// ---------------------------------------------------------------- tokenizer

function tokenizeScript(text) {
  const out = [];
  let word = '';
  const flush = () => { if (word) { out.push(word); word = ''; } };
  for (const ch of text) {
    if (ch === '(' || ch === ')') { flush(); out.push(ch); }
    else if (ch === ',' || ch === '.') { flush(); out.push(ch); }
    else if (/\s/.test(ch)) flush();
    else word += ch;
  }
  flush();
  return out;
}

function readLists(tokens) {
  let i = 0;
  const readList = () => {
    const list = [];
    i++; // skip '('
    while (i < tokens.length && tokens[i] !== ')') {
      if (tokens[i] === '(') list.push(readList());
      else list.push(tokens[i++]);
    }
    i++; // skip ')'
    return list;
  };
  const top = [];
  while (i < tokens.length) {
    if (tokens[i] === '(') top.push(readList());
    else top.push(tokens[i++]);
  }
  return top;
}

const isNum = (t) => typeof t === 'string' && /^\d+$/.test(t);
const isList = Array.isArray;
const show = (x) => (isList(x) ? '(' + x.map(show).join(' ') + ')' : String(x));

// A link written as (=DIT) or (= EVERYONE)
function linkTarget(list) {
  if (!isList(list) || list.length === 0 || isList(list[0])) return null;
  if (list[0] === '=' && list.length === 2) return list[1];
  if (list[0].startsWith('=') && list[0].length > 1 && list.length === 1) return list[0].slice(1);
  return null;
}

function parsePattern(list) {
  return list.map((el) => {
    if (isList(el)) {
      const flat = el.join(' ');
      if (flat.startsWith('*')) {
        return { alt: new Set(flat.slice(1).split(/\s+/).filter(Boolean)), src: el };
      }
      if (flat.startsWith('/')) {
        return { tags: flat.slice(1).split(/\s+/).filter(Boolean), src: el };
      }
      return { alt: new Set(el), src: el };
    }
    if (isNum(el)) return { n: parseInt(el, 10) };
    return { word: el };
  });
}

function parseReassembly(list) {
  const link = linkTarget(list);
  if (link) return { kind: 'link', target: link, src: list };
  if (list.length === 1 && list[0] === 'NEWKEY') return { kind: 'newkey', src: list };
  if (list[0] === 'PRE' && isList(list[1])) {
    return { kind: 'pre', words: list[1], target: linkTarget(list[2]), src: list };
  }
  return { kind: 'text', words: list, src: list };
}

// ------------------------------------------------------------------ script

export function parseScript(text) {
  const top = readLists(tokenizeScript(text));
  const greeting = top[0];
  const rules = new Map();
  const tags = new Map();
  let memory = null;

  for (const item of top.slice(1)) {
    if (!isList(item) || item.length === 0) continue; // START, ()
    const keyword = item[0];

    if (keyword === 'MEMORY') {
      memory = { keyword: item[1], transforms: [] };
      for (const t of item.slice(2)) {
        const eq = t.indexOf('=');
        memory.transforms.push({
          decomp: t.slice(0, eq), reasm: t.slice(eq + 1),
          pattern: parsePattern(t.slice(0, eq)),
        });
      }
      continue;
    }

    const rule = { keyword, sub: null, precedence: 0, tags: [], link: null, transforms: [] };
    for (let i = 1; i < item.length; i++) {
      const el = item[i];
      if (el === '=' && !isList(item[i + 1])) { rule.sub = item[++i]; continue; }
      if (el === 'DLIST' && isList(item[i + 1])) {
        rule.tags = item[++i].join(' ').replace(/\//g, ' ').split(/\s+/).filter(Boolean);
        continue;
      }
      if (isNum(el)) { rule.precedence = parseInt(el, 10); continue; }
      if (isList(el)) {
        const lt = linkTarget(el);
        if (lt) { rule.link = lt; continue; }
        if (isList(el[0])) {
          rule.transforms.push({
            decomp: el[0],
            pattern: parsePattern(el[0]),
            reasm: el.slice(1).map(parseReassembly),
            next: 0,
          });
        }
      }
    }
    rules.set(keyword, rule);
    if (rule.tags.length) {
      tags.set(keyword, rule.tags);
      if (rule.sub) tags.set(rule.sub, rule.tags);
    }
  }
  return { greeting, rules, tags, memory };
}

// ----------------------------------------------------- SLIP HASH, 7094 BCD

const BCD = (() => {
  const t = {};
  '0123456789'.split('').forEach((c, i) => (t[c] = i));
  'ABCDEFGHI'.split('').forEach((c, i) => (t[c] = 0o21 + i));
  'JKLMNOPQR'.split('').forEach((c, i) => (t[c] = 0o41 + i));
  'STUVWXYZ'.split('').forEach((c, i) => (t[c] = 0o62 + i));
  Object.assign(t, { ' ': 0o60, '=': 0o13, "'": 0o14, '+': 0o20, '.': 0o33, ')': 0o34,
    '-': 0o40, '$': 0o53, '*': 0o54, '/': 0o61, ',': 0o73, '(': 0o74 });
  return t;
})();

// The last 36-bit machine word of a word: its final chunk of up to 6 BCD
// characters, left justified and padded with blanks.
function lastChunkBCD(s) {
  let r = 0n;
  let count = 0;
  if (s.length) {
    for (let i = Math.floor((s.length - 1) / 6) * 6; i < s.length; i++, count++) {
      r = (r << 6n) | BigInt(BCD[s[i]] ?? 0o60);
    }
  }
  while (count++ < 6) r = (r << 6n) | 0o60n;
  return r;
}

// HASH.(D,N): square the magnitude of D and take N bits from the middle.
export function slipHash(word, n) {
  let d = lastChunkBCD(word) & 0x7ffffffffn;
  d = d * d;
  d >>= BigInt(35 - Math.floor(n / 2));
  return Number(d & ((1n << BigInt(n)) - 1n));
}

// ------------------------------------------------------------------ engine

export function splitInput(text) {
  const s = text.toUpperCase()
    .replace(/[?!;:]/g, ' . ')
    .replace(/,/g, ' , ')
    .replace(/\./g, ' . ')
    .replace(/[^A-Z0-9'.,\- ]/g, ' ');
  return s.split(/\s+/).filter(Boolean);
}

export class Eliza {
  constructor(scriptText) {
    this.script = parseScript(scriptText);
    this.greeting = this.script.greeting.join(' ');
    this.memoryQueue = [];
    this.limit = 1;
  }

  match(pattern, words, tags) {
    const comps = [];
    const rec = (pi, wi) => {
      if (pi === pattern.length) return wi === words.length;
      const el = pattern[pi];
      if (el.n === 0) {
        for (let k = wi; k <= words.length; k++) {
          comps[pi] = words.slice(wi, k);
          if (rec(pi + 1, k)) return true;
        }
        return false;
      }
      if (el.n > 0) {
        if (wi + el.n > words.length) return false;
        comps[pi] = words.slice(wi, wi + el.n);
        return rec(pi + 1, wi + el.n);
      }
      if (wi >= words.length) return false;
      const w = words[wi];
      let ok = false;
      if (el.word !== undefined) ok = el.word === w;
      else if (el.alt) ok = el.alt.has(w);
      else if (el.tags) ok = (tags.get(w) || []).some((t) => el.tags.includes(t));
      if (!ok) return false;
      comps[pi] = [w];
      return rec(pi + 1, wi + 1);
    };
    return rec(0, 0) ? comps : null;
  }

  assemble(reasm, comps) {
    const out = [];
    for (const el of reasm) {
      if (isNum(el)) {
        const c = comps[parseInt(el, 10) - 1];
        if (c) out.push(...c);
      } else if (isList(el)) out.push(...el);
      else out.push(el);
    }
    return out;
  }

  respond(text) {
    const { rules, tags, memory } = this.script;
    const trace = [];
    const step = (label, value) => trace.push({ label, value });

    this.limit = this.limit + 1;
    if (this.limit === 5) this.limit = 1;

    // Scan left to right, collect keywords, apply substitutions, cut at
    // delimiters (period, comma, BUT) exactly as the paper describes.
    let words = splitInput(text);
    let keystack = [];
    let topRank = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === '.' || w === ',' || w === 'BUT') {
        if (keystack.length === 0) {
          words = words.slice(i + 1);
          i = -1;
          continue;
        }
        words = words.slice(0, i);
        break;
      }
      const rule = rules.get(w);
      if (rule) {
        if (rule.transforms.length || rule.link) {
          if (rule.precedence > topRank) { keystack.unshift(w); topRank = rule.precedence; }
          else keystack.push(w);
        }
        if (rule.sub) words[i] = rule.sub;
      }
    }

    step('you said', '"' + text + '"');
    step('keywords', keystack.length
      ? keystack.map((k) => `${k} (rank ${rules.get(k).precedence})`).join(' · ')
      : 'none');

    // MEMORY: when MY is the top keyword, stash a transformed copy of the
    // sentence, choosing which of the four forms with HASH of the last word.
    if (memory && keystack[0] === memory.keyword && words.length) {
      const h = slipHash(words[words.length - 1], 2);
      const t = memory.transforms[h];
      const comps = this.match(t.pattern, words, tags);
      if (comps) {
        this.memoryQueue.push({
          text: this.assemble(t.reasm, comps).join(' '),
          from: text, decomp: t.decomp, reasm: t.reasm,
        });
      }
    }

    let reply = null;

    const useNone = () => {
      if (this.limit === 4 && this.memoryQueue.length) {
        const m = this.memoryQueue.shift();
        reply = m.text;
        step('keyword', 'none · LIMIT is 4, so ELIZA recalls MEMORY');
        step('memory of', '"' + m.from + '"');
        step('decomposition', show(m.decomp));
        step('reassembly', show(m.reasm));
        return;
      }
      const none = rules.get('NONE');
      step('keyword', 'none · use NONE');
      applyRule(none, words, 0);
    };

    const applyRule = (rule, ws, depth) => {
      if (depth > 12 || !rule) { useNone(); return; }
      for (const t of rule.transforms) {
        const comps = this.match(t.pattern, ws, tags);
        if (!comps) continue;
        step('decomposition', show(t.decomp));
        const r = t.reasm[t.next];
        t.next = (t.next + 1) % t.reasm.length;
        if (r.kind === 'text') {
          step('reassembly', show(r.words));
          reply = this.assemble(r.words, comps).join(' ');
          return;
        }
        if (r.kind === 'link') {
          step('reassembly', `(=${r.target}) · link to ${r.target}`);
          applyRule(rules.get(r.target), ws, depth + 1);
          return;
        }
        if (r.kind === 'pre') {
          const pre = this.assemble(r.words, comps);
          step('reassembly', `PRE ${show(r.words)} → ${pre.join(' ')}, then ${r.target}`);
          applyRule(rules.get(r.target), pre, depth + 1);
          return;
        }
        if (r.kind === 'newkey') {
          step('reassembly', '(NEWKEY) · try the next keyword');
          nextKey(ws, depth + 1);
          return;
        }
      }
      if (rule.link) {
        step('link', `=${rule.link}`);
        applyRule(rules.get(rule.link), ws, depth + 1);
        return;
      }
      nextKey(ws, depth + 1);
    };

    const nextKey = (ws, depth) => {
      if (keystack.length === 0) { useNone(); return; }
      const k = keystack.shift();
      step('keyword', k);
      applyRule(rules.get(k), ws, depth);
    };

    if (keystack.length === 0) useNone();
    else nextKey(words, 0);

    if (reply === null) reply = 'PLEASE GO ON';
    step('reply', reply);
    return { reply, trace };
  }
}

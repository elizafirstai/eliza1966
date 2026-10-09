// Typing with the mouse (and, if you insist, with your own keyboard).

const ALLOWED = /^[a-zA-Z0-9 '.,?!]$/;

export class Keyboard {
  constructor({ svg, sound, onChar, onBack, onReturn, isActive }) {
    Object.assign(this, { svg, sound, onChar, onBack, onReturn, isActive });
    this.keys = new Map();
    this.shift = false;
    this.bind();
  }

  setKeys(keys) {
    this.keys = keys;
    this.renderShift();
  }

  // Animate one key. `pad` picks the numeric keypad copy of a digit or period.
  animate(k, pad = false) {
    const list = this.keys.get(k);
    if (!list) return;
    const g = list.find((e) => !!e.dataset.pad === pad) || list[0];
    g.classList.remove('down');
    void g.getBoundingClientRect();
    g.classList.add('down');
    clearTimeout(g._t);
    g._t = setTimeout(() => g.classList.remove('down'), 95);
    this.sound.key(k === 'space' || k === 'return');
  }

  renderShift() {
    (this.keys.get('shift') || []).forEach((g) => g.classList.toggle('latched', this.shift));
  }

  // A virtual key was pressed (mouse, touch, or Enter/Space on a focused key).
  activate(k, pad = false) {
    this.animate(k, pad);
    if (k === 'shift') { this.shift = !this.shift; this.renderShift(); return; }
    if (k === 'back') { this.onBack(); return; }
    if (k === 'return') { this.onReturn(); return; }
    let ch = k === 'space' ? ' ' : k;
    if (this.shift) {
      if (/^[a-z]$/.test(ch)) ch = ch.toUpperCase();
      this.shift = false;
      this.renderShift();
    }
    this.onChar(ch);
  }

  keyFor(ch) {
    if (ch === ' ') return 'space';
    return ch.toLowerCase();
  }

  // A character arrived from a real keyboard or the phone's keyboard.
  physicalChar(ch, code = '') {
    if (!ALLOWED.test(ch)) return false;
    const k = this.keyFor(ch);
    const pad = code.startsWith('Numpad');
    if (/[A-Z]/.test(ch)) {
      (this.keys.get('shift') || []).forEach((g) => { g.classList.add('down'); setTimeout(() => g.classList.remove('down'), 110); });
    }
    this.animate(k, pad);
    this.onChar(ch);
    return true;
  }

  bind() {
    const keyOf = (target) => target.closest?.('.key');

    this.svg.addEventListener('pointerdown', (e) => {
      const g = keyOf(e.target);
      if (!g) return;
      e.preventDefault(); // keep focus where it is, no text selection
      this.activate(g.dataset.key, !!g.dataset.pad);
    });
    this.svg.addEventListener('keydown', (e) => {
      const g = keyOf(e.target);
      if (!g || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      this.activate(g.dataset.key, !!g.dataset.pad);
    });

    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && t.closest && (t.closest('.key') || t.closest('dialog'))) return;
      if (t && t.id !== 'mobile-input' && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (t && t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
      if (!this.isActive()) return;
      if (e.key === 'Shift') { (this.keys.get('shift') || []).forEach((g) => g.classList.add('down')); return; }
      if (e.key === 'Enter') { e.preventDefault(); this.animate('return'); this.onReturn(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); this.animate('back'); this.onBack(); return; }
      if (e.key.length === 1 && this.physicalChar(e.key, e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') (this.keys.get('shift') || []).forEach((g) => { if (!this.shift) g.classList.remove('down'); });
    });
  }

  // Phones: tapping the screen focuses a hidden input to bring up the native
  // keyboard. Its value holds a single sentinel space so backspace is visible.
  bindMobile(input, screen) {
    const reset = () => { input.value = ' '; try { input.setSelectionRange(1, 1); } catch {} };
    screen.addEventListener('click', () => { reset(); input.focus({ preventScroll: true }); });
    input.addEventListener('input', () => {
      const v = input.value;
      if (v.length === 0) { this.animate('back'); this.onBack(); }
      else for (const ch of v.slice(1)) this.physicalChar(ch);
      reset();
    });
  }
}

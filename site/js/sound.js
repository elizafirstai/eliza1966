// Sound, off by default. Uses Howler.js when it loaded; silent otherwise.
// The clicks are synthesized stand-ins (audio/*.wav); drop in recordings with
// the same file names to replace them.

const FILES = {
  key1: 'audio/key1.wav', key2: 'audio/key2.wav', key3: 'audio/key3.wav', key4: 'audio/key4.wav',
  heavy: 'audio/key-heavy.wav', teletype: 'audio/teletype.wav', fan: 'audio/fan.wav',
};

class Sound {
  constructor() {
    this.on = false;
    this.h = null;
    this.listeners = new Set();
    this.printing = false;
  }

  load() {
    if (this.h || !window.Howl) return;
    const mk = (src, o = {}) => new window.Howl({ src: [src], preload: true, ...o });
    this.h = {
      keys: ['key1', 'key2', 'key3', 'key4'].map((k) => mk(FILES[k], { volume: 0.55 })),
      heavy: mk(FILES.heavy, { volume: 0.7 }),
      teletype: mk(FILES.teletype, { loop: true, volume: 0 }),
      fan: mk(FILES.fan, { loop: true, volume: 0 }),
    };
  }

  set(on) {
    this.on = on;
    if (on) {
      this.load();
      if (this.h) {
        if (!this.h.fan.playing()) this.h.fan.play();
        this.h.fan.fade(this.h.fan.volume(), 0.1, 900);
        if (this.printing) this.chatter(true);
      }
    } else if (this.h) {
      this.h.fan.fade(this.h.fan.volume(), 0, 300);
      this.h.teletype.fade(this.h.teletype.volume(), 0, 150);
    }
    this.listeners.forEach((fn) => fn(on));
  }

  toggle() { this.set(!this.on); }
  subscribe(fn) { this.listeners.add(fn); fn(this.on); }

  key(heavy = false) {
    if (!this.on || !this.h) return;
    const s = heavy ? this.h.heavy : this.h.keys[Math.floor(Math.random() * 4)];
    const id = s.play();
    s.rate(0.95 + Math.random() * 0.1, id);
  }

  chatter(start) {
    this.printing = start;
    if (!this.on || !this.h) return;
    const t = this.h.teletype;
    if (start) {
      if (!t.playing()) t.play();
      t.fade(t.volume(), 0.32, 60);
    } else {
      t.fade(t.volume(), 0, 140);
    }
  }
}

export const sound = new Sound();

/* Banc d'essai : charge app.js dans Node avec un DOM minimal et un faux Supabase,
   pour vérifier la file d'enregistrement sans navigateur ni réseau. */
const fs = require('fs');
const vm = require('vm');

function makeEl(tag) {
  const el = {
    tagName: tag || 'div', style: {}, dataset: {}, classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, on) { on === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (on ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); }
    },
    children: [], options: [], _text: '', title: '',
    childNodes: [{ textContent: '' }, { textContent: '' }],
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    get innerHTML() { return this._html || ''; }, set innerHTML(v) { this._html = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); },
    remove() { }, setAttribute() { }, getAttribute() { return null; }, removeAttribute() { },
    addEventListener() { }, removeEventListener() { }, focus() { },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    closest() { return null; }, getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    cloneNode() { return makeEl(); }, scrollWidth: 100, scrollHeight: 100, offsetHeight: 0
  };
  return el;
}

function buildSandbox(supabaseStub) {
  const store = {};
  const doc = {
    documentElement: { style: { setProperty() { }, getPropertyValue() { return '240px'; } } },
    body: { classList: { add() { }, remove() { } }, appendChild() { }, style: {} },
    createElement: makeEl,
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    getElementById() { return makeEl(); },
    addEventListener() { }, removeEventListener() { },
    visibilityState: 'visible'
  };
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, JSON, Math, Date, String, Number,
    Array, Object, Set, Map, RegExp, Error, Uint8Array, Uint32Array, parseInt, parseFloat, isNaN, TextEncoder,
    document: doc,
    navigator: { userAgent: 'node' },
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 10) },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    supabase: supabaseStub,
    getSelection: () => ({ removeAllRanges() { }, addRange() { } }),
    alert() { }, confirm: () => true, prompt: () => null,
    URL: { createObjectURL: () => '', revokeObjectURL() { } },
    Blob: function () { }, FileReader: function () { },
    __store: store
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = () => { };
  sandbox.removeEventListener = () => { };
  sandbox.SB_URL = 'https://example.supabase.co';
  sandbox.SB_KEY = 'anon';
  return sandbox;   // window.SEED est posé par seed.js, exécuté dans ce même contexte
}

module.exports = { buildSandbox, makeEl, vm };

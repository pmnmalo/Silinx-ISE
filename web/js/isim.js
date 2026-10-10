// Silinx - ISim-style simulation / waveform window (plain DOM + canvas, no framework).
//
//   import { mountISim } from './isim.js';
//   const isim = mountISim(container, { design, sim, title, onOpenSource({ file, line }) {} });
//   isim.runFor(1e6); await isim.runAll(); isim.restart(); isim.addSignals([sig]);
//   const s = isim.getState(); isim.setState(s); isim.refresh(); isim.destroy();
//
// Extra options: initialRun (ps, run once after mounting), runAllCap (ps, default 1 ms),
//                defaultRunTime { value, unit } (default 1 us).
// Styles: web/css/isim.css (scoped under .isim, themed by theme.css --wave-* variables).
// Time is in picoseconds everywhere.

import * as V from '/core/values.js';
import { toVCD } from '/core/simulator.js';
import { onPrefsChange } from './modern.js';

// ------------------------------------------------------------------------------- constants
const ROW_H = 20;
const RULER_H = 30;
const UNITS = { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6, ms: 1e9 };
const RADIXES = [
  ['default', 'Default'], ['bin', 'Binary'], ['hex', 'Hexadecimal'], ['oct', 'Octal'],
  ['udec', 'Unsigned Decimal'], ['sdec', 'Signed Decimal'], ['ascii', 'ASCII'],
];
const DEFAULT_CAP = 1e9; // 1 ms

const S = (b) => `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">${b}</svg>`;
const ICON = {
  restart: S('<path d="M2.5 2.5v11" stroke="#1d4f91" stroke-width="2"/><path d="M14 3L5 8l9 5z" fill="#3a86d8" stroke="#1d4f91"/>'),
  runAll: S('<path d="M1.5 3l6 5-6 5z" fill="#2db12d" stroke="#0d6b0d"/><path d="M8 3l6 5-6 5z" fill="#2db12d" stroke="#0d6b0d"/>'),
  runFor: S('<path d="M1.5 2l9 6-9 6z" fill="#2db12d" stroke="#0d6b0d"/><circle cx="11.5" cy="11" r="3.8" fill="#fff" stroke="#444"/><path d="M11.5 8.8V11h1.8" fill="none" stroke="#444"/>'),
  step: S('<path d="M3 13V7.5a3.2 3.2 0 016.4 0V10" fill="none" stroke="#1d4f91" stroke-width="1.7"/><path d="M6.6 9.5l2.8 4 2.8-4z" fill="#1d4f91"/><path d="M1 15h14" stroke="#666"/>'),
  brk: S('<rect x="3" y="2.5" width="3.6" height="11" fill="#e04040" stroke="#900"/><rect x="9.4" y="2.5" width="3.6" height="11" fill="#e04040" stroke="#900"/>'),
  zoomIn: S('<circle cx="6.5" cy="6.5" r="4.6" fill="#eef6ff" stroke="#2b5797" stroke-width="1.5"/><path d="M10 10l4.5 4.5" stroke="#2b5797" stroke-width="2.4"/><path d="M4 6.5h5M6.5 4v5" stroke="#1a1a1a" stroke-width="1.4"/>'),
  zoomOut: S('<circle cx="6.5" cy="6.5" r="4.6" fill="#eef6ff" stroke="#2b5797" stroke-width="1.5"/><path d="M10 10l4.5 4.5" stroke="#2b5797" stroke-width="2.4"/><path d="M4 6.5h5" stroke="#1a1a1a" stroke-width="1.4"/>'),
  zoomFit: S('<rect x="1.5" y="3.5" width="13" height="9" fill="#eef6ff" stroke="#2b5797"/><path d="M3 8h10M3 8l2-2M3 8l2 2M13 8l-2-2M13 8l-2 2" fill="none" stroke="#1a1a1a" stroke-width="1.2"/>'),
  toStart: S('<path d="M2.5 3v10" stroke="#1d4f91" stroke-width="1.8"/><path d="M13.5 3L4.5 8l9 5z" fill="#ffd400" stroke="#8a7300"/>'),
  toEnd: S('<path d="M13.5 3v10" stroke="#1d4f91" stroke-width="1.8"/><path d="M2.5 3l9 5-9 5z" fill="#ffd400" stroke="#8a7300"/>'),
  prevEdge: S('<path d="M1 12h5V4h9" fill="none" stroke="#108010" stroke-width="1.5"/><path d="M10 8.5L4.5 11.5 10 14.5z" fill="#1d4f91"/>'),
  nextEdge: S('<path d="M1 4h9v8h5" fill="none" stroke="#108010" stroke-width="1.5"/><path d="M6 8.5l5.5 3L6 14.5z" fill="#1d4f91"/>'),
  marker: S('<path d="M8 1v14" stroke="#0090c0" stroke-width="1.6"/><path d="M8 1.5h6l-2 2.2 2 2.3H8z" fill="#00b4f0" stroke="#006a90"/>'),
  vcd: S('<rect x="2" y="2" width="12" height="12" rx="1" fill="#4a72b8" stroke="#24467e"/><rect x="4.5" y="2.5" width="7" height="4.5" fill="#fff"/><rect x="4" y="9" width="8" height="5" fill="#d9e4f5"/>'),
  radix: S('<rect x="1" y="3" width="14" height="10" rx="1.5" fill="#fff" stroke="#666"/><text x="8" y="11" font-size="7" text-anchor="middle" font-family="Arial" font-weight="bold" fill="#1d4f91">0x</text>'),
  inst: S('<rect x="3" y="3" width="10" height="10" fill="#e8f0ff" stroke="#000080"/><path d="M1 6h2M1 10h2M13 8h2" stroke="#000080"/>'),
  top: S('<rect x="3" y="3" width="10" height="10" fill="#cfe8cf" stroke="#006000"/><path d="M1 6h2M1 10h2M13 8h2" stroke="#006000"/><rect x="5.5" y="5.5" width="5" height="5" fill="#2a2"/>'),
  proc: S('<circle cx="8" cy="8" r="5.5" fill="#fff4d6" stroke="#9a6a00"/><text x="8" y="11" font-size="8" text-anchor="middle" font-family="Arial" font-weight="bold" fill="#9a6a00">P</text>'),
  sigIn: S('<path d="M1 8h8" stroke="#1d7a1d" stroke-width="1.6"/><path d="M8 4.5l4 3.5-4 3.5z" fill="#1d7a1d"/><rect x="12.5" y="3" width="2" height="10" fill="#555"/>'),
  sigOut: S('<rect x="1.5" y="3" width="2" height="10" fill="#555"/><path d="M4 8h7" stroke="#b03000" stroke-width="1.6"/><path d="M10.5 4.5l4 3.5-4 3.5z" fill="#b03000"/>'),
  sigIo: S('<path d="M3 8h10" stroke="#6a1b9a" stroke-width="1.6"/><path d="M5 4.5L1 8l4 3.5zM11 4.5l4 3.5-4 3.5z" fill="#6a1b9a"/>'),
  sigBit: S('<path d="M1 12h4V4h5v8h5" fill="none" stroke="#108010" stroke-width="1.5"/>'),
  sigBus: S('<path d="M1 8l2.5-4h9L15 8l-2.5 4h-9z" fill="#e9f7e9" stroke="#108010" stroke-width="1.2"/>'),
  sigArr: S('<rect x="2" y="2" width="12" height="12" fill="#fff" stroke="#666"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12" stroke="#999"/>'),
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ------------------------------------------------------------------------------- time helpers
export function fmtTime(ps, maxDec = 3) {
  if (!isFinite(ps)) return '-';
  const a = Math.abs(ps);
  let u = 'ps', d = 1;
  if (a >= 1e9) { u = 'ms'; d = 1e9; } else if (a >= 1e6) { u = 'us'; d = 1e6; } else if (a >= 1e3) { u = 'ns'; d = 1e3; }
  if (a === 0) { u = 'ns'; d = 1e3; }
  const n = ps / d;
  return `${trimNum(n, maxDec)} ${u}`;
}
function trimNum(n, dec) {
  let s = n.toFixed(dec);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
export function parseTime(str, defUnit = 'ns') {
  const m = /^\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*(fs|ps|ns|us|ms|s)?\s*$/i.exec(String(str));
  if (!m) return NaN;
  const u = (m[2] || defUnit).toLowerCase();
  const mul = u === 's' ? 1e12 : UNITS[u];
  return Math.round(parseFloat(m[1]) * mul);
}

// lower bound: first index with a[i] >= x (from lo)
function lowerBound(a, x, lo = 0) {
  let hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
// last index with a[i] <= x (or 0)
function idxAt(a, x) {
  let lo = 0, hi = a.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= x) lo = m; else hi = m - 1; }
  return lo;
}

// ------------------------------------------------------------------------------- value helpers
function hexFull(v, bitsPerDigit = 4) {
  const digits = Math.ceil(v.w / bitsPerDigit);
  let s = '';
  for (let d = digits - 1; d >= 0; d--) {
    const sh = BigInt(d * bitsPerDigit), nb = Math.min(bitsPerDigit, v.w - d * bitsPerDigit), m = V.mask(nb);
    const xv = (v.x >> sh) & m, vv = (v.v >> sh) & m;
    if (xv === m) s += vv === m ? 'Z' : 'X';
    else if (xv) s += 'X';
    else s += vv.toString(16).toUpperCase();
  }
  return s;
}
const BIT_VALS = [V.ZERO, V.ONE, V.X1, V.mk(1, 1n, 1n)];
const bitKey = (b) => Number(b.v & 1n) | (Number(b.x & 1n) << 1);
function isScalarType(t) { return (t.kind === 'logic' && t.w === 1); }
function isBitsType(t) { return t.kind === 'logic' || t.kind === 'int'; }

export function formatValue(v, t, radix = 'default') {
  if (v == null) return '';
  if (Array.isArray(v)) return '(array)';
  if (v.str !== undefined) return `"${v.str}"`;
  const k = t?.kind;
  if (radix === 'default') {
    if (k === 'enum') return v.x ? 'X' : (t.names?.[Number(v.v)] ?? String(v.v));
    if (k === 'bool') return v.x ? 'X' : (v.v ? 'TRUE' : 'FALSE');
    if (k === 'int') return V.toDec(v, true);
    if (k === 'time') return v.x ? 'X' : fmtTime(Number(BigInt.asIntN(64, v.v)));
    if (k === 'real') return V.toDec(v, true);
    if (v.w === 1) return V.toBin(v);
    radix = 'hex';
  }
  switch (radix) {
    case 'bin': return V.toBin(v).toUpperCase();
    case 'hex': return hexFull(v, 4);
    case 'oct': return hexFull(v, 3);
    case 'udec': return V.toDec(v, false);
    case 'sdec': return V.toDec(v, true);
    case 'ascii': {
      if (v.x) return 'X';
      let s = '';
      for (let b = Math.ceil(v.w / 8) - 1; b >= 0; b--) {
        const c = Number((v.v >> BigInt(b * 8)) & 0xffn);
        s += c >= 32 && c < 127 ? String.fromCharCode(c) : '.';
      }
      return s;
    }
  }
  return V.toBin(v);
}

// Parse a user-entered value for a signal. radix: bin|hex|oct|dec|udec|sdec|ascii|default
export function parseValue(text, t, radix = 'default') {
  let s = String(text).trim();
  if (!s) throw new Error('empty value');
  const w = t.w || 1;
  if (t.kind === 'enum') {
    const i = t.names.findIndex(n => n.toLowerCase() === s.toLowerCase());
    if (i >= 0) return V.fromInt(i, w, false);
  }
  if (t.kind === 'bool') {
    if (/^true$/i.test(s)) return V.ONE;
    if (/^false$/i.test(s)) return V.ZERO;
  }
  // Verilog literal  8'hFF / 'b1010
  let m = /^(\d*)'([sS]?)([bBhHdDoO])([0-9a-fA-FxXzZ_?]+)$/.exec(s);
  if (m) { radix = { b: 'bin', h: 'hex', d: 'dec', o: 'oct' }[m[3].toLowerCase()]; s = m[4]; }
  // VHDL literal x"0F" / "0101" / '1'
  m = /^([xXoObB]?)["']([0-9a-fA-FxXzZuUwWlLhH_-]+)["']$/.exec(s);
  if (m) { radix = { x: 'hex', o: 'oct', b: 'bin', '': 'bin' }[m[1].toLowerCase()]; s = m[2]; }
  m = /^0x([0-9a-fA-F_]+)$/.exec(s);
  if (m) { radix = 'hex'; s = m[1]; }
  s = s.replace(/_/g, '');
  if (radix === 'default') radix = (t.kind === 'int' || t.kind === 'enum') ? 'dec' : 'bin';
  if (radix === 'udec' || radix === 'sdec') radix = 'dec';
  let val;
  if (radix === 'bin' || radix === 'hex' || radix === 'oct') {
    const per = radix === 'bin' ? 1 : radix === 'hex' ? 4 : 3;
    let bits = '';
    for (const c0 of s) {
      const c = c0.toLowerCase();
      if (c === 'x' || c === 'u' || c === 'w' || c === '-') bits += 'x'.repeat(per);
      else if (c === 'z') bits += 'z'.repeat(per);
      else if (c === 'l') bits += '0';
      else if (c === 'h' && per === 1) bits += '1';
      else {
        const d = parseInt(c, radix === 'bin' ? 2 : radix === 'hex' ? 16 : 8);
        if (isNaN(d)) throw new Error(`invalid ${radix} digit '${c0}'`);
        bits += d.toString(2).padStart(per, '0');
      }
    }
    val = V.fromBits(bits);
    // single x/z digit extends to full width
    if (s.length === 1 && /[xzuw-]/i.test(s)) val = V.fromBits(s[0].toLowerCase() === 'z' ? 'z'.repeat(w) : 'x'.repeat(w));
  } else if (radix === 'dec') {
    if (!/^-?\d+$/.test(s)) throw new Error(`invalid decimal value '${s}'`);
    const n = BigInt(s);
    val = V.mk(w, BigInt.asUintN(w, n), 0n, t.s);
  } else if (radix === 'ascii') {
    let n = 0n;
    for (const c of s) n = (n << 8n) | BigInt(c.charCodeAt(0) & 255);
    val = V.mk(Math.max(8, s.length * 8), n);
  } else throw new Error(`unknown radix '${radix}'`);
  return V.withSign(V.resize({ ...val, s: false }, w, false), !!t.s);
}

function typeName(sig) {
  const t = sig.t, vhdl = sig.inst?.lang === 'vhdl';
  const rng = (t) => (t.left !== undefined ? `[${t.left}:${t.right}]` : `[${t.w - 1}:0]`);
  switch (t.kind) {
    case 'enum': return t.name || 'enum';
    case 'int': return 'integer';
    case 'bool': return 'boolean';
    case 'time': return 'time';
    case 'real': return 'real';
    case 'str': return 'string';
    case 'array': return vhdl ? `array${t.left !== undefined ? ` [${t.left}${t.desc ? ' downto ' : ' to '}${t.right}]` : ''}` : `Array${t.left !== undefined ? ` [${t.left}:${t.right}]` : ''}`;
    case 'logic':
      if (vhdl) return t.w === 1 && t.scalar ? 'std_logic' : `${t.s ? 'signed' : 'std_logic_vector'}${rng(t)}`;
      return t.w === 1 ? 'Logic' : `Array${rng(t)}`;
  }
  return t.kind;
}

function bitIndices(t) {
  // returns [{index, pos}] in display order (left .. right)
  const out = [];
  const left = t.left ?? t.w - 1, right = t.right ?? 0;
  const desc = t.left === undefined ? true : left >= right;
  const step = desc ? -1 : 1;
  for (let i = left; desc ? i >= right : i <= right; i += step) out.push({ index: i, pos: desc ? i - right : right - i });
  return out.slice(0, t.w);
}

const pathOf = (x) => '/' + String(x.path || x.name).replace(/\./g, '/');

// ------------------------------------------------------------------------------- mount


export function mountISim(container, opts = {}) {
  const { design, sim } = opts;
  const onOpenSource = opts.onOpenSource || null;
  const runAllCap = opts.runAllCap ?? DEFAULT_CAP;

  const cleanups = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); cleanups.push(() => el.removeEventListener(ev, fn, o)); };

  // ---------------------------------------------------------------- state
  const st = {
    rows: [], rowSeq: 1, sel: new Set(), anchor: null,
    cursor: 0, markers: [], activeMarker: null, markerSeq: 1,
    t0: 0, scale: 1000, fit: true,
    nameW: 180, valW: 120, scrollY: 0,
    curInst: design.top, selObj: new Set(),
    forces: [], forceSeq: 1,
    running: false, breakReq: false, runTarget: 0, runStart: 0,
    lastLogLen: 0, history: [], histPos: 0,
  };
  const bitCache = new Map();
  let flat = [];
  let colors = {};

  // ---------------------------------------------------------------- DOM skeleton
  const root = h('div', 'isim');
  root.tabIndex = -1;
  root.innerHTML = `
    <div class="isim-title"><span class="isim-title-ico">${ICON.runFor}</span><span class="isim-title-text"></span></div>
    <div class="isim-toolbar"></div>
    <div class="isim-main">
      <div class="isim-left">
        <div class="ise-panel isim-inst-panel"><div class="caption">Instances and Processes</div><div class="body"><ul class="tree isim-tree"></ul></div></div>
        <div class="isim-split-h isim-split-left"></div>
        <div class="ise-panel isim-obj-panel"><div class="caption">Objects<span class="spacer"></span><span class="isim-obj-scope"></span></div>
          <div class="body"><table class="isim-objs"><thead><tr><th class="c-chk"></th><th>Object Name</th><th>Value</th><th>Data Type</th></tr></thead><tbody></tbody></table></div></div>
      </div>
      <div class="isim-split-v isim-split-main"></div>
      <div class="isim-wavewin ise-panel">
        <div class="caption"><span class="isim-wcfg">Default.wcfg</span><span class="spacer"></span><span class="isim-cursor-info"></span></div>
        <div class="isim-wavebody">
          <canvas class="isim-names" tabindex="0"></canvas>
          <div class="isim-split-v isim-split-names"></div>
          <div class="isim-wavearea">
            <canvas class="isim-waves" tabindex="0"></canvas>
            <div class="isim-vscroll"><div></div></div>
          </div>
          <div class="isim-hscroll-pad"></div><div class="isim-hscroll-pad2"></div>
          <div class="isim-hscroll"><div></div></div>
        </div>
      </div>
    </div>
    <div class="isim-split-h isim-split-bottom"></div>
    <div class="ise-panel isim-bottom">
      <div class="isim-tabs"><span class="isim-tab sel">Console</span><span class="isim-tab-sp"></span><button class="isim-clear" title="Clear console">Clear</button></div>
      <div class="isim-console" tabindex="0"></div>
      <div class="isim-cmdline"><span>ISim&gt;</span><input type="text" spellcheck="false" autocomplete="off" placeholder="Type a command (help)"></div>
    </div>
    <div class="isim-status"><span class="isim-st-msg">Ready</span><span class="isim-progress"><span></span></span><span class="isim-st-delta"></span><span class="isim-st-time"></span></div>
  `;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  $('.isim-title-text').textContent = opts.title || `ISim - [${design.top?.name ?? 'design'}]`;
  const treeEl = $('.isim-tree'), objBody = $('.isim-objs tbody'), cons = $('.isim-console'), cmdInput = $('.isim-cmdline input');
  const cn = $('.isim-names'), cw = $('.isim-waves'), vsc = $('.isim-vscroll'), hsc = $('.isim-hscroll');
  const waveArea = $('.isim-wavearea');
  const leftEl = $('.isim-left'), bottomEl = $('.isim-bottom');

  // ---------------------------------------------------------------- toolbar
  const tb = $('.isim-toolbar');
  const btns = {};
  const addBtn = (key, title, fn) => {
    const b = h('button', 'tb-btn', ICON[key]); b.title = title; b.type = 'button';
    b.addEventListener('click', () => { fn(); });
    tb.appendChild(b); btns[key] = b; return b;
  };
  const sep = () => tb.appendChild(h('span', 'tb-sep'));
  addBtn('restart', 'Restart', () => api.restart());
  addBtn('runAll', 'Run All', () => { echo('run all'); api.runAll(); });
  addBtn('runFor', 'Run for the specified time', () => runForUi());
  const rfVal = h('input', 'isim-rf-val'); rfVal.value = String(opts.defaultRunTime?.value ?? 1); rfVal.title = 'Simulation run time';
  const rfUnit = h('select', 'isim-rf-unit', Object.keys(UNITS).map(u => `<option>${u}</option>`).join(''));
  rfUnit.value = opts.defaultRunTime?.unit ?? 'us'; rfUnit.title = 'Time unit';
  tb.appendChild(rfVal); tb.appendChild(rfUnit);
  rfVal.addEventListener('keydown', e => { if (e.key === 'Enter') runForUi(); });
  addBtn('step', 'Step (advance to the next scheduled event)', () => api.step());
  addBtn('brk', 'Break', () => { st.breakReq = true; });
  sep();
  addBtn('zoomIn', 'Zoom In', () => zoomAt(0.5));
  addBtn('zoomOut', 'Zoom Out', () => zoomAt(2));
  addBtn('zoomFit', 'Zoom to Full View', () => zoomFit());
  sep();
  addBtn('toStart', 'Go to Time 0', () => { setCursor(0); ensureVisible(0); });
  addBtn('toEnd', 'Go to Latest Time', () => { setCursor(sim.now); ensureVisible(sim.now); });
  addBtn('prevEdge', 'Previous Transition (selected signal)', () => jumpEdge(-1));
  addBtn('nextEdge', 'Next Transition (selected signal)', () => jumpEdge(1));
  sep();
  addBtn('marker', 'Add Marker at cursor', () => addMarker(st.cursor));
  const radixBtn = addBtn('radix', 'Radix of selected signals', () => {
    const r = radixBtn.getBoundingClientRect();
    showMenu(r.left, r.bottom, radixItems());
  });
  sep();
  addBtn('vcd', 'Export waveform as VCD', () => exportVCD());
  btns.brk.disabled = true;

  function runForUi() {
    const ps = parseTime(rfVal.value, rfUnit.value);
    if (!(ps > 0)) { logLine(`ERROR: invalid run time '${rfVal.value} ${rfUnit.value}'`, 'error'); return; }
    echo(`run ${rfVal.value} ${rfUnit.value}`);
    api.runFor(Math.max(1, ps));
  }

  // ---------------------------------------------------------------- theme colours
  function readColors() {
    const cs = getComputedStyle(root);
    const g = (n, d) => (cs.getPropertyValue(n).trim() || d);
    colors = {
      bg: g('--wave-bg', '#000'), grid: g('--wave-grid', '#303030'), fg: g('--wave-fg', '#00ff00'),
      x: g('--wave-x', '#ff0000'), z: g('--wave-z', '#4080ff'), text: g('--wave-text', '#fff'),
      cursor: g('--wave-cursor', '#ffff00'), marker: g('--wave-marker', '#00c0ff'), names: g('--wave-names-bg', '#fff'),
      accent: g('--accent', '#316ac5'), accentFg: g('--accent-fg', '#fff'), border: g('--border', '#a0a0a0'),
      borderLight: g('--border-light', '#d4d0c8'), fgText: g('--fg', '#000'), muted: g('--muted', '#6d6d6d'),
      header: g('--bg', '#f0f0f0'),
      // the header of the names and the time ruler (themes: web/css/modern.css)
      head1: g('--wave-head-1', '#fbfbfb'), head2: g('--wave-head-2', '#e3e3e3'), rulerFg: g('--wave-ruler-fg', '#000'), rulerTick: g('--wave-ruler-tick', '#555'),
      font: g('--font', 'Tahoma, Arial, sans-serif'), mono: g('--mono', 'Consolas, monospace'),
    };
  }

  // ---------------------------------------------------------------- canvas sizing (HiDPI)
  let dpr = window.devicePixelRatio || 1;
  let NW = 0, NH = 0, WW = 0, WH = 0;
  function sizeCanvas(c, w, hgt) {
    dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(hgt * dpr));
    c.style.width = w + 'px'; c.style.height = hgt + 'px';
  }
  function measure() {
    const body = $('.isim-wavebody');
    body.style.setProperty('--names-w', (st.nameW + st.valW) + 'px');
    const nr = cn.parentElement.getBoundingClientRect();
    const hscH = hsc.offsetHeight || 16;
    NW = st.nameW + st.valW; NH = Math.max(1, Math.floor(nr.height - hscH));
    const wr = waveArea.getBoundingClientRect();
    WW = Math.max(1, Math.floor(wr.width - (vsc.offsetWidth || 16))); WH = Math.max(1, Math.floor(wr.height));
  }
  function layout() {
    measure();
    sizeCanvas(cn, NW, NH);
    sizeCanvas(cw, WW, WH);
    if (st.fit) applyFit();
    invalidate();
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(root); ro.observe(waveArea);
  cleanups.push(() => ro.disconnect());

  // ---------------------------------------------------------------- rows model
  function newRow(sig, extra = {}) { return { id: st.rowSeq++, kind: 'sig', sig, name: sig.name, radix: 'default', expanded: false, ...extra }; }
  function rebuildFlat() {
    flat = [];
    for (const r of st.rows) {
      flat.push({ row: r, bit: null, key: String(r.id), depth: 0 });
      if (r.kind === 'sig' && r.expanded && r.sig.wave && isBitsType(r.sig.t) && r.sig.t.w > 1) {
        for (const b of bitIndices(r.sig.t)) flat.push({ row: r, bit: b, key: `${r.id}:${b.index}`, depth: 1 });
      }
    }
    for (const k of [...st.sel]) if (!flat.some(f => f.key === k)) st.sel.delete(k);
  }
  function addSignals(sigs, at = st.rows.length) {
    const rows = [];
    for (const s of sigs) if (s) rows.push(newRow(s));
    st.rows.splice(at, 0, ...rows);
    rebuildFlat(); updateVScroll(); invalidate(); renderObjects();
    return rows;
  }
  function instSignals(inst) {
    const seen = new Set(), out = [];
    for (const p of inst.ports || []) if (!seen.has(p.sig)) { seen.add(p.sig); out.push({ sig: p.sig, port: p }); }
    for (const s of inst.signals || []) if (!seen.has(s)) { seen.add(s); out.push({ sig: s, port: null }); }
    return out;
  }
  function itemWave(it) {
    const sig = it.row.sig;
    if (!sig?.wave) return null;
    if (!it.bit) return sig.wave;
    return bitWave(sig, it.bit.pos);
  }
  function bitWave(sig, pos) {
    const w = sig.wave, key = `${sig.id}:${pos}`;
    let c = bitCache.get(key);
    if (!c || c.src !== w || c.len > w.t.length) { c = { src: w, len: 0, t: [], v: [] }; bitCache.set(key, c); }
    if (c.len === w.t.length) return c;
    let i = 0;
    if (c.len > 0) {
      i = c.len - 1;
      const lastT = w.t[i];
      while (c.t.length && c.t[c.t.length - 1] >= lastT) { c.t.pop(); c.v.pop(); }
    }
    const P = BigInt(pos);
    let last = c.t.length ? bitKey(c.v[c.t.length - 1]) : -1;
    for (; i < w.t.length; i++) {
      const v = w.v[i];
      const k = Number((v.v >> P) & 1n) | (Number((v.x >> P) & 1n) << 1);
      if (k !== last) { c.t.push(w.t[i]); c.v.push(BIT_VALS[k]); last = k; }
    }
    c.len = w.t.length;
    return c;
  }
  function valueOf(it, t) {
    const sig = it.row.sig;
    if (!sig) return null;
    const v = sim.valueAt(sig, t);
    if (!it.bit || !v || Array.isArray(v)) return v;
    return V.getBits(v, it.bit.pos, 1);
  }
  function itemType(it) { return it.bit ? { kind: 'logic', w: 1, s: false } : it.row.sig.t; }
  function itemRadix(it) { return it.bit ? 'bin' : it.row.radix; }

  // ---------------------------------------------------------------- view math
  const xOf = (t) => (t - st.t0) / st.scale;
  const tOf = (x) => st.t0 + x * st.scale;
  function endTime() { return Math.max(sim.now, 1); }
  function applyFit() {
    if (WW <= 1) measure();
    const span = sim.now > 0 ? Math.max(sim.now, 1000) : 1e6;
    st.t0 = 0; st.scale = span / Math.max(50, WW - 10);
  }
  function zoomFit() { st.fit = true; applyFit(); invalidate(); }
  function zoomAt(f, x = null) {
    const px = x ?? (st.cursor >= st.t0 && st.cursor <= tOf(WW) ? xOf(st.cursor) : WW / 2);
    const tc = tOf(px);
    const maxScale = Math.max(endTime(), 1000) * 4 / Math.max(WW, 1);
    st.scale = clamp(st.scale * f, 0.002, maxScale);
    st.t0 = tc - px * st.scale;
    st.fit = false;
    clampView(); invalidate();
  }
  function clampView() {
    const span = WW * st.scale;
    const maxT0 = Math.max(0, Math.max(endTime(), span) - span * 0.5);
    st.t0 = clamp(st.t0, 0, Math.max(maxT0, 0));
  }
  function ensureVisible(t) {
    const span = WW * st.scale;
    if (t < st.t0 || t > st.t0 + span) { st.t0 = Math.max(0, t - span / 2); st.fit = false; clampView(); }
    invalidate();
  }

  // ---------------------------------------------------------------- scrollbars
  let progScroll = 0;
  function totalRowsH() { return flat.length * ROW_H + RULER_H + ROW_H; }
  function updateVScroll() {
    const inner = vsc.firstElementChild;
    inner.style.height = totalRowsH() + 'px';
    st.scrollY = clamp(st.scrollY, 0, Math.max(0, totalRowsH() - WH));
    if (Math.abs(vsc.scrollTop - st.scrollY) > 0.5) { progScroll++; vsc.scrollTop = st.scrollY; }
  }
  let hTotal = 1, hSpacer = 1;
  function updateHScroll() {
    const span = WW * st.scale;
    hTotal = Math.max(endTime(), st.t0 + span);
    const cw2 = hsc.clientWidth || WW;
    hSpacer = Math.min(4e6, Math.max(cw2, cw2 * hTotal / span));
    hsc.firstElementChild.style.width = hSpacer + 'px';
    const sl = (st.t0 / hTotal) * hSpacer;
    if (Math.abs(hsc.scrollLeft - sl) > 1) { progScroll++; hsc.scrollLeft = sl; }
  }
  on(vsc, 'scroll', () => {
    if (progScroll) { progScroll = Math.max(0, progScroll - 1); }
    st.scrollY = vsc.scrollTop; invalidate(false);
  });
  on(hsc, 'scroll', () => {
    if (progScroll) { progScroll = Math.max(0, progScroll - 1); return; }
    st.t0 = (hsc.scrollLeft / hSpacer) * hTotal; st.fit = false; invalidate(false);
  });

  // ---------------------------------------------------------------- rendering
  let rafId = 0, needScroll = true, objDirty = false;
  function invalidate(scroll = true) {
    if (scroll) needScroll = true;
    if (!rafId) rafId = requestAnimationFrame(draw);
  }
  function draw() {
    rafId = 0;
    if (!NW || !WW) return;
    if ((window.devicePixelRatio || 1) !== dpr) { layout(); return; } // moved to a screen with another DPI
    if (needScroll) { updateVScroll(); updateHScroll(); needScroll = false; }
    drawNames();
    drawWaves();
    updateStatus();
    if (objDirty) { objDirty = false; updateObjectValues(); }
  }

  function setFont(ctx, size = 12, bold = false) { ctx.font = `${bold ? 'bold ' : ''}${size}px ${colors.font}`; }
  function fitText(ctx, s, maxW) {
    if (maxW <= 4) return '';
    if (ctx.measureText(s).width <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, m) + '…').width <= maxW) lo = m; else hi = m - 1; }
    return lo ? s.slice(0, lo) + '…' : '';
  }

  let dragRow = null; // { insertAt }
  function drawNames() {
    const ctx = cn.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.names; ctx.fillRect(0, 0, NW, NH);
    // header
    const hg = ctx.createLinearGradient(0, 0, 0, RULER_H);
    hg.addColorStop(0, colors.head1); hg.addColorStop(1, colors.head2);
    ctx.fillStyle = hg; ctx.fillRect(0, 0, NW, RULER_H);
    ctx.strokeStyle = colors.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, RULER_H - 0.5); ctx.lineTo(NW, RULER_H - 0.5);
    ctx.moveTo(st.nameW - 0.5, 0); ctx.lineTo(st.nameW - 0.5, NH); ctx.stroke();
    setFont(ctx, 12, false); ctx.fillStyle = colors.fgText; ctx.textBaseline = 'middle';
    ctx.fillText('Name', 8, RULER_H / 2);
    ctx.fillText('Value', st.nameW + 6, RULER_H / 2);
    // rows
    ctx.save();
    ctx.beginPath(); ctx.rect(0, RULER_H, NW, NH - RULER_H); ctx.clip();
    const first = Math.max(0, Math.floor(st.scrollY / ROW_H)), last = Math.min(flat.length - 1, Math.ceil((st.scrollY + NH) / ROW_H));
    for (let i = first; i <= last; i++) {
      const it = flat[i];
      const y = RULER_H + i * ROW_H - st.scrollY;
      const sel = st.sel.has(it.key);
      if (sel) { ctx.fillStyle = colors.accent; ctx.fillRect(0, y, NW, ROW_H); }
      else if (i % 2 === 1) { ctx.fillStyle = 'rgba(0,0,0,0.025)'; ctx.fillRect(0, y, NW, ROW_H); }
      ctx.strokeStyle = sel ? colors.accent : '#ececec';
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H - 0.5); ctx.lineTo(NW, y + ROW_H - 0.5); ctx.stroke();
      const fg = sel ? colors.accentFg : colors.fgText;
      const cy = y + ROW_H / 2;
      if (it.row.kind === 'div') {
        setFont(ctx, 12, true); ctx.fillStyle = sel ? colors.accentFg : '#15428b';
        ctx.textAlign = 'center'; ctx.fillText(fitText(ctx, it.row.name, NW - 10), NW / 2, cy); ctx.textAlign = 'left';
        continue;
      }
      const sig = it.row.sig;
      let x = 4 + it.depth * 16;
      const expandable = !it.bit && sig.wave && isBitsType(sig.t) && sig.t.w > 1;
      if (expandable) {
        ctx.fillStyle = sel ? colors.accentFg : '#555';
        ctx.beginPath();
        if (it.row.expanded) { ctx.moveTo(x, cy - 2); ctx.lineTo(x + 8, cy - 2); ctx.lineTo(x + 4, cy + 3); }
        else { ctx.moveTo(x + 2, cy - 4); ctx.lineTo(x + 7, cy); ctx.lineTo(x + 2, cy + 4); }
        ctx.fill();
      }
      x += 11;
      drawSigIcon(ctx, x, cy, it, sel);
      x += 18;
      setFont(ctx, 12); ctx.fillStyle = fg;
      const forced = !it.bit && isForced(sig);
      const label = it.bit ? `[${it.bit.index}]` : it.row.name + (sig.t.kind === 'logic' && sig.t.w > 1 ? `[${sig.t.left ?? sig.t.w - 1}:${sig.t.right ?? 0}]` : '');
      ctx.fillText(fitText(ctx, label, st.nameW - x - (forced ? 16 : 4)), x, cy);
      if (forced) { ctx.fillStyle = sel ? colors.accentFg : '#c06000'; setFont(ctx, 10, true); ctx.fillText('F', st.nameW - 12, cy); }
      // value at cursor
      setFont(ctx, 12); ctx.fillStyle = fg;
      let vt;
      if (!sig.wave) vt = Array.isArray(sig.val) ? '(array)' : formatValue(sig.val, sig.t);
      else vt = formatValue(valueOf(it, st.cursor), itemType(it), itemRadix(it));
      ctx.fillText(fitText(ctx, vt, st.valW - 10), st.nameW + 6, cy);
    }
    if (dragRow) {
      const y = RULER_H + dragRow.y - st.scrollY;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(NW, y); ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.restore();
    ctx.strokeStyle = colors.border;
    ctx.beginPath(); ctx.moveTo(NW - 0.5, 0); ctx.lineTo(NW - 0.5, NH); ctx.stroke();
  }

  function drawSigIcon(ctx, x, cy, it, sel) {
    const sig = it.row.sig;
    ctx.save(); ctx.lineWidth = 1.3;
    const c = sel ? '#fff' : '#108010';
    ctx.strokeStyle = c;
    if (!sig.wave) {
      ctx.strokeStyle = sel ? '#fff' : '#666';
      ctx.strokeRect(x + 0.5, cy - 5.5, 12, 11);
      ctx.beginPath(); ctx.moveTo(x + 0.5, cy - 0.5); ctx.lineTo(x + 12.5, cy - 0.5); ctx.moveTo(x + 6.5, cy - 5.5); ctx.lineTo(x + 6.5, cy + 5.5); ctx.stroke();
    } else if (it.bit || (sig.t.w === 1 && sig.t.kind === 'logic')) {
      ctx.beginPath(); ctx.moveTo(x, cy + 4); ctx.lineTo(x + 4, cy + 4); ctx.lineTo(x + 4, cy - 4); ctx.lineTo(x + 9, cy - 4); ctx.lineTo(x + 9, cy + 4); ctx.lineTo(x + 13, cy + 4); ctx.stroke();
    } else {
      ctx.fillStyle = sel ? 'rgba(255,255,255,.25)' : '#e3f5e3';
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + 3, cy - 4.5); ctx.lineTo(x + 11, cy - 4.5); ctx.lineTo(x + 14, cy); ctx.lineTo(x + 11, cy + 4.5); ctx.lineTo(x + 3, cy + 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const k = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return { step: Math.max(1, k * p), mant: k };
  }

  function drawWaves() {
    const ctx = cw.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, WW, WH);
    const tA = st.t0, tB = tOf(WW);
    // ---- ruler
    const { step, mant } = niceStep(st.scale * 110);
    const unit = step * 10 >= 1e9 ? 1e9 : step * 10 >= 1e6 ? 1e6 : step * 10 >= 1e3 ? 1e3 : 1;
    const uname = { 1: 'ps', 1e3: 'ns', 1e6: 'us', 1e9: 'ms' }[unit];
    const minor = step / (mant === 2 ? 4 : 5);
    const rg = ctx.createLinearGradient(0, 0, 0, RULER_H);
    rg.addColorStop(0, colors.head1); rg.addColorStop(1, colors.head2);
    ctx.fillStyle = rg; ctx.fillRect(0, 0, WW, RULER_H);
    ctx.strokeStyle = colors.border; ctx.beginPath(); ctx.moveTo(0, RULER_H - 0.5); ctx.lineTo(WW, RULER_H - 0.5); ctx.stroke();
    ctx.strokeStyle = colors.rulerTick; ctx.fillStyle = colors.rulerFg; setFont(ctx, 11); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    ctx.beginPath();
    const decs = Math.max(0, Math.ceil(-Math.log10(step / unit) - 1e-9));
    if (minor * 1 / st.scale >= 4) {
      for (let t = Math.ceil(tA / minor) * minor; t <= tB; t += minor) {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.moveTo(x, RULER_H - 4); ctx.lineTo(x, RULER_H - 1);
      }
    }
    const majors = [];
    // keep ruler labels clear of the cursor time box
    setFont(ctx, 11, true);
    const cx0 = xOf(st.cursor), cbw = ctx.measureText(fmtTime(st.cursor)).width + 8;
    const busy = [[clamp(cx0 - cbw / 2, 1, WW - cbw - 1) - 4, 0]];
    busy[0][1] = busy[0][0] + cbw + 8;
    setFont(ctx, 11);
    for (const m of st.markers) {
      const mw = ctx.measureText(fmtTime(m.t)).width + 8, mx = xOf(m.t);
      const l = clamp(mx - mw / 2, 1, WW - mw - 1) - 4;
      busy.push([l, l + mw + 8]);
    }
    for (let t = Math.ceil(tA / step) * step; t <= tB + step; t += step) {
      const x = Math.round(xOf(t)) + 0.5;
      ctx.moveTo(x, RULER_H - 9); ctx.lineTo(x, RULER_H - 1);
      majors.push(x);
      const lab = `${trimNum(t / unit, Math.min(decs, 6))} ${uname}`;
      const lw = ctx.measureText(lab).width / 2 + 2;
      const lx = clamp(x, lw, Math.max(lw, WW - lw));
      if (busy.every(([l, r]) => lx + lw < l || lx - lw > r)) ctx.fillText(lab, lx, RULER_H - 11);
    }
    ctx.stroke();
    ctx.textAlign = 'left';
    // ---- clip rows region
    ctx.save();
    ctx.beginPath(); ctx.rect(0, RULER_H, WW, WH - RULER_H); ctx.clip();
    // grid
    ctx.strokeStyle = colors.grid; ctx.setLineDash([1, 3]); ctx.beginPath();
    for (const x of majors) { ctx.moveTo(x, RULER_H); ctx.lineTo(x, WH); }
    ctx.stroke(); ctx.setLineDash([]);
    // end-of-sim shading
    const xe = xOf(sim.now);
    if (xe < WW) { ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(Math.max(0, xe), RULER_H, WW, WH); }
    // rows
    const first = Math.max(0, Math.floor(st.scrollY / ROW_H)), last = Math.min(flat.length - 1, Math.ceil((st.scrollY + WH) / ROW_H));
    setFont(ctx, 11);
    ctx.textBaseline = 'middle';
    for (let i = first; i <= last; i++) {
      const it = flat[i], y = RULER_H + i * ROW_H - st.scrollY;
      if (st.sel.has(it.key)) { ctx.fillStyle = 'rgba(80,120,255,0.18)'; ctx.fillRect(0, y, WW, ROW_H); }
      if (it.row.kind === 'div') {
        ctx.strokeStyle = '#3a3a3a'; ctx.beginPath(); ctx.moveTo(0, y + ROW_H / 2 + 0.5); ctx.lineTo(WW, y + ROW_H / 2 + 0.5); ctx.stroke();
        continue;
      }
      drawItem(ctx, it, y, tA, Math.min(tB, sim.now));
    }
    ctx.restore();
    // ---- markers, cursor
    for (const m of st.markers) drawVLine(ctx, m.t, colors.marker, m === st.activeMarker ? [] : [4, 3], fmtTime(m.t), false);
    drawVLine(ctx, st.cursor, colors.cursor, [], fmtTime(st.cursor), true);
    if (st.activeMarker) drawDelta(ctx, st.activeMarker.t, st.cursor);
  }

  function drawVLine(ctx, t, color, dash, label, isCursor) {
    const x = Math.round(xOf(t)) + 0.5;
    if (x < -40 || x > WW + 40) return;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x, RULER_H); ctx.lineTo(x, WH); ctx.stroke(); ctx.setLineDash([]);
    setFont(ctx, 11, isCursor); ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 8, bh = 14;
    let bx = x - tw / 2; bx = clamp(bx, 1, WW - tw - 1);
    const by = isCursor ? 1 : RULER_H - bh - 1;
    if (!isCursor) {
      // small flag in ruler
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 4, RULER_H - 6); ctx.lineTo(x + 4, RULER_H - 6); ctx.lineTo(x, RULER_H); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(bx, by - 2, tw, bh - 1);
      ctx.fillStyle = '#000'; ctx.fillText(label, bx + 4, by + bh / 2 - 2.5);
      return;
    }
    ctx.fillStyle = color; ctx.fillRect(bx, by, tw, bh);
    ctx.strokeStyle = '#8a8a00'; ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, bh - 1);
    ctx.fillStyle = '#000'; ctx.fillText(label, bx + 4, by + bh / 2 + 0.5);
  }
  function drawDelta(ctx, ta, tb) {
    if (ta === tb) return;
    const x1 = xOf(Math.min(ta, tb)), x2 = xOf(Math.max(ta, tb));
    const y = WH - 12;
    if (x2 < 0 || x1 > WW) return;
    ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x1, y + 0.5); ctx.lineTo(x2, y + 0.5); ctx.stroke();
    const arrow = (x, d) => { ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + 5 * d, y - 3); ctx.lineTo(x + 5 * d, y + 4); ctx.closePath(); ctx.fill(); };
    if (x2 - x1 > 12) { arrow(x1, 1); arrow(x2, -1); }
    const label = `Δ ${fmtTime(Math.abs(tb - ta))}`;
    setFont(ctx, 11, true);
    const tw = ctx.measureText(label).width + 8;
    const cx = clamp((Math.max(x1, 0) + Math.min(x2, WW)) / 2, tw / 2 + 2, WW - tw / 2 - 2);
    ctx.fillStyle = '#202020'; ctx.fillRect(cx - tw / 2, y - 16, tw, 13);
    ctx.strokeStyle = '#ffffff'; ctx.strokeRect(cx - tw / 2 + 0.5, y - 15.5, tw - 1, 12);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(label, cx - tw / 2 + 4, y - 9);
  }

  // Iterate the visible part of a wave, coalescing sub-pixel transitions.
  // cb(x0, x1, value, dense, startEdge, endEdge)
  function scanWave(w, tA, tEnd, cb) {
    const T = w.t, n = T.length;
    if (!n || tEnd < tA) return;
    let i = idxAt(T, tA);
    if (i < 0) return;
    let curX = xOf(Math.max(T[i], tA)), curV = w.v[i], curEdge = T[i] >= tA && T[i] > 0;
    let k = i + 1;
    while (k < n && T[k] <= tEnd) {
      const xk = xOf(T[k]);
      const px = Math.floor(xk);
      const m = lowerBound(T, tOf(px + 1), k + 1);
      // dense: several transitions in this pixel, or the next one already in the adjacent pixel
      if (m - k >= 2 || (m === k + 1 && m < n && T[m] <= tEnd && xOf(T[m]) < px + 2)) {
        let endPx = px + 1, mm = m;
        while (mm < n && T[mm] <= tEnd) {
          const p2 = Math.floor(xOf(T[mm]));
          if (p2 > endPx + 1) break; // tolerate a single quiet pixel inside a dense run
          endPx = p2 + 1; mm = lowerBound(T, tOf(p2 + 1), mm + 1);
        }
        if (xk > curX) cb(curX, xk, curV, false, curEdge, true);
        cb(Math.min(px, xk), endPx, w.v[mm - 1], true, true, true);
        curX = endPx; curV = w.v[mm - 1]; curEdge = false; k = mm;
      } else {
        cb(curX, xk, curV, false, curEdge, true);
        curX = xk; curV = w.v[k]; curEdge = true; k++;
      }
    }
    const xEnd = xOf(tEnd);
    if (xEnd > curX) cb(curX, xEnd, curV, false, curEdge, false);
  }

  function valColor(v) {
    if (!v || Array.isArray(v) || v.str !== undefined || !v.x) return colors.fg;
    return (v.x === V.mask(v.w) && v.v === v.x) ? colors.z : colors.x;
  }

  function drawItem(ctx, it, y, tA, tEnd) {
    const sig = it.row.sig;
    const w = itemWave(it);
    const yT = y + 4, yB = y + ROW_H - 4, yM = y + ROW_H / 2;
    if (!w) {
      ctx.fillStyle = '#9a9a9a'; setFont(ctx, 11);
      ctx.fillText(Array.isArray(sig.val) ? '(array - not plotted)' : formatValue(sig.val, sig.t), 6, yM);
      return;
    }
    const t = itemType(it), radix = itemRadix(it);
    const scalar = it.bit || isScalarType(t);
    if (scalar) {
      let prevY = null;
      ctx.lineWidth = 1;
      scanWave(w, tA, tEnd, (x0, x1, v, dense, se) => {
        const X0 = Math.round(x0) + 0.5, X1 = Math.round(x1) + 0.5;
        if (dense) {
          ctx.fillStyle = colors.fg; ctx.fillRect(Math.round(x0), yT, Math.max(1, Math.round(x1) - Math.round(x0)), yB - yT + 1);
          prevY = null; return;
        }
        let ly, col = colors.fg;
        if (v.x) {
          if (v.v) { col = colors.z; ly = yM; } else { col = colors.x; ly = null; }
        } else ly = v.v ? yT : yB;
        if (ly === null) {
          // X: red box
          ctx.fillStyle = 'rgba(255,0,0,0.28)'; ctx.fillRect(X0, yT, X1 - X0, yB - yT);
          ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(X0, yT + 0.5); ctx.lineTo(X1, yT + 0.5); ctx.moveTo(X0, yB + 0.5); ctx.lineTo(X1, yB + 0.5);
          if (se) { ctx.moveTo(X0, yT); ctx.lineTo(X0, yB + 1); }
          ctx.stroke(); prevY = null; return;
        }
        ctx.strokeStyle = col; ctx.beginPath();
        const Ly = Math.round(ly) + 0.5;
        if (se && prevY !== null && prevY !== Ly) { ctx.moveTo(X0, prevY); ctx.lineTo(X0, Ly); }
        else if (se && prevY === null && v.x === 0n) { ctx.moveTo(X0, yT + 0.5); ctx.lineTo(X0, yB + 0.5); }
        ctx.moveTo(X0, Ly); ctx.lineTo(X1, Ly); ctx.stroke();
        prevY = Ly;
      });
      return;
    }
    // bus
    scanWave(w, tA, tEnd, (x0, x1, v, dense, se, ee) => {
      if (dense) {
        ctx.fillStyle = colors.fg; ctx.fillRect(Math.round(x0), yT, Math.max(1, Math.round(x1) - Math.round(x0)), yB - yT + 1);
        return;
      }
      const col = valColor(v);
      const width = x1 - x0;
      const d = Math.min(3, width / 2);
      const L = Math.round(x0) + 0.5, R = Math.round(x1) + 0.5;
      const a = se ? d : 0, b = ee ? d : 0;
      const tY = yT + 0.5, bY = yB + 0.5;
      if (v.x && col === colors.x) {
        ctx.fillStyle = 'rgba(255,0,0,0.22)';
        ctx.beginPath(); ctx.moveTo(L, yM + 0.5); ctx.lineTo(L + a, tY); ctx.lineTo(R - b, tY); ctx.lineTo(R, yM + 0.5); ctx.lineTo(R - b, bY); ctx.lineTo(L + a, bY); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath();
      if (col === colors.z) { ctx.moveTo(L, Math.round(yM) + 0.5); ctx.lineTo(R, Math.round(yM) + 0.5); }
      else {
        ctx.moveTo(L, yM + 0.5); ctx.lineTo(L + a, tY); ctx.lineTo(R - b, tY); ctx.lineTo(R, yM + 0.5);
        ctx.moveTo(L, yM + 0.5); ctx.lineTo(L + a, bY); ctx.lineTo(R - b, bY); ctx.lineTo(R, yM + 0.5);
      }
      ctx.stroke();
      // label centred in the visible part of the segment
      const vis0 = Math.max(x0 + a, 0), vis1 = Math.min(x1 - b, WW);
      const avail = vis1 - vis0 - 6;
      if (avail > 8) {
        const s = fitText(ctx, formatValue(v, t, radix), avail);
        if (s) {
          ctx.fillStyle = col === colors.fg ? colors.text : col;
          const tw = ctx.measureText(s).width;
          ctx.fillText(s, Math.round((vis0 + vis1 - tw) / 2), yM + 0.5);
        }
      }
    });
  }

  // ---------------------------------------------------------------- status
  const stMsg = $('.isim-st-msg'), stTime = $('.isim-st-time'), stDelta = $('.isim-st-delta'), prog = $('.isim-progress');
  function updateStatus() {
    stTime.textContent = `Sim Time: ${sim.now.toLocaleString('en-US')} ps`;
    $('.isim-cursor-info').textContent = `Cursor: ${fmtTime(st.cursor)}`;
    stDelta.textContent = st.activeMarker ? `Marker: ${fmtTime(st.activeMarker.t)}   Δ = ${fmtTime(Math.abs(st.cursor - st.activeMarker.t))}` : '';
    btns.brk.disabled = !st.running;
    for (const k of ['restart', 'runAll', 'runFor', 'step']) btns[k].disabled = st.running;
    prog.style.display = st.running ? '' : 'none';
    if (st.running) {
      const f = clamp((sim.now - st.runStart) / Math.max(1, st.runTarget - st.runStart), 0, 1);
      prog.firstElementChild.style.width = (f * 100).toFixed(1) + '%';
    }
  }
  function setMsg(s) { stMsg.textContent = s; }

  // ---------------------------------------------------------------- cursor / markers / edges
  function setCursor(t) {
    st.cursor = Math.max(0, Math.round(t));
    objDirty = true; invalidate(false);
  }
  function addMarker(t) {
    const m = { id: st.markerSeq++, t: Math.round(t) };
    st.markers.push(m); st.activeMarker = m; invalidate(false);
    return m;
  }
  function removeMarker(m) {
    st.markers = st.markers.filter(x => x !== m);
    if (st.activeMarker === m) st.activeMarker = st.markers[st.markers.length - 1] || null;
    invalidate(false);
  }
  function selectedItems() { return flat.filter(f => st.sel.has(f.key)); }
  function jumpEdge(dir) {
    const its = selectedItems().filter(f => f.row.kind === 'sig' && f.row.sig.wave);
    if (!its.length) { setMsg('Select a signal in the wave window first'); return; }
    let best = null;
    for (const it of its) {
      const w = itemWave(it);
      let t;
      if (dir > 0) { const i = lowerBound(w.t, st.cursor + 1); t = i < w.t.length ? w.t[i] : null; }
      else { const i = lowerBound(w.t, st.cursor) - 1; t = i >= 0 && w.t[i] > 0 ? w.t[i] : (i >= 0 && w.t[i] === 0 && st.cursor > 0 ? 0 : null); }
      if (t != null && t <= sim.now && (best === null || (dir > 0 ? t < best : t > best))) best = t;
    }
    if (best === null) { setMsg('No more transitions'); return; }
    setCursor(best); ensureVisible(best);
  }

  // ---------------------------------------------------------------- names canvas interaction
  function rowAtY(yCss) {
    const i = Math.floor((yCss - RULER_H + st.scrollY) / ROW_H);
    return i >= 0 && i < flat.length ? i : -1;
  }
  function selectRow(i, e) {
    const it = flat[i];
    if (!it) { if (!e?.ctrlKey && !e?.metaKey) st.sel.clear(); invalidate(false); return; }
    if (e && (e.ctrlKey || e.metaKey)) { if (st.sel.has(it.key)) st.sel.delete(it.key); else st.sel.add(it.key); st.anchor = i; }
    else if (e && e.shiftKey && st.anchor != null) {
      st.sel.clear();
      const [a, b] = [Math.min(st.anchor, i), Math.max(st.anchor, i)];
      for (let k = a; k <= b; k++) st.sel.add(flat[k].key);
    } else if (!st.sel.has(it.key) || e?.button !== 0) { st.sel.clear(); st.sel.add(it.key); st.anchor = i; }
    else st.anchor = i;
    invalidate(false);
  }
  function localXY(e, el) { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  on(cn, 'mousedown', (e) => {
    cn.focus();
    const [x, y] = localXY(e, cn);
    if (y < RULER_H) {
      if (Math.abs(x - st.nameW) < 5) startColResize(e);
      return;
    }
    const i = rowAtY(y);
    if (e.button === 2) { if (i >= 0 && !st.sel.has(flat[i].key)) selectRow(i, null); return; }
    if (i < 0) { selectRow(-1, e); return; }
    const it = flat[i];
    // twisty
    const tx = 4 + it.depth * 16;
    if (!it.bit && it.row.kind === 'sig' && x >= tx - 2 && x <= tx + 10 && it.row.sig.wave && isBitsType(it.row.sig.t) && it.row.sig.t.w > 1) {
      it.row.expanded = !it.row.expanded; rebuildFlat(); updateVScroll(); invalidate(); return;
    }
    const wasSelected = st.sel.has(it.key);
    selectRow(i, e);
    // drag to reorder
    const y0 = e.clientY;
    let dragging = false;
    const mm = (ev) => {
      if (!dragging && Math.abs(ev.clientY - y0) > 4) dragging = true;
      if (!dragging) return;
      const [, yy] = localXY(ev, cn);
      // auto-scroll
      if (yy < RULER_H + 5) { vsc.scrollTop -= ROW_H / 2; }
      else if (yy > NH - 5) { vsc.scrollTop += ROW_H / 2; }
      const yr = clamp(yy - RULER_H + st.scrollY, 0, flat.length * ROW_H);
      // snap to top-level row boundaries
      let idx = Math.round(yr / ROW_H);
      while (idx < flat.length && flat[idx]?.depth > 0) idx++;
      dragRow = { y: idx * ROW_H, flatIdx: idx };
      cn.style.cursor = 'grabbing';
      invalidate(false);
    };
    const mu = (ev) => {
      window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu);
      cn.style.cursor = '';
      if (dragging && dragRow) {
        const target = flat[dragRow.flatIdx]?.row ?? null;
        const moving = st.rows.filter(r => st.sel.has(String(r.id)) || flat.some(f => f.row === r && st.sel.has(f.key)));
        if (moving.length && !moving.includes(target)) {
          const rest = st.rows.filter(r => !moving.includes(r));
          const at = target ? rest.indexOf(target) : rest.length;
          rest.splice(at, 0, ...moving);
          st.rows = rest; rebuildFlat();
        }
      } else if (!dragging && wasSelected && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        st.sel.clear(); st.sel.add(it.key);
      }
      dragRow = null; invalidate();
    };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });
  on(cn, 'mousemove', (e) => {
    const [x, y] = localXY(e, cn);
    if (!e.buttons) cn.style.cursor = (y < RULER_H && Math.abs(x - st.nameW) < 5) ? 'col-resize' : '';
  });
  function startColResize(e) {
    const x0 = e.clientX, w0 = st.nameW;
    const mm = (ev) => { st.nameW = clamp(w0 + ev.clientX - x0, 60, 600); layout(); };
    const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  }
  on(cn, 'dblclick', (e) => {
    const [, y] = localXY(e, cn);
    const i = rowAtY(y);
    if (i < 0) return;
    const it = flat[i];
    if (it.row.kind === 'div') { renameDivider(it.row); return; }
    if (!it.bit && it.row.sig.wave && isBitsType(it.row.sig.t) && it.row.sig.t.w > 1) { it.row.expanded = !it.row.expanded; rebuildFlat(); invalidate(); return; }
    openSource(it.row.sig);
  });
  on(cn, 'contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, waveRowMenu()); });
  on(cn, 'wheel', (e) => { e.preventDefault(); vsc.scrollTop += e.deltaY; }, { passive: false });

  // names-column splitter (DOM)
  const splitNames = $('.isim-split-names');
  on(splitNames, 'mousedown', (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = st.valW;
    const mm = (ev) => { st.valW = clamp(w0 + ev.clientX - x0, 40, 800); layout(); };
    const mu = () => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });

  // ---------------------------------------------------------------- wave canvas interaction
  function snapTime(t, y) {
    const i = rowAtY(y);
    const tol = 5 * st.scale;
    if (i < 0) return t;
    const it = flat[i];
    if (it.row.kind !== 'sig') return t;
    const w = itemWave(it);
    if (!w) return t;
    const k = lowerBound(w.t, t);
    let best = t, bd = tol + 1;
    for (const j of [k - 1, k]) if (j >= 0 && j < w.t.length && Math.abs(w.t[j] - t) < bd) { bd = Math.abs(w.t[j] - t); best = w.t[j]; }
    return bd <= tol ? best : t;
  }
  function markerNear(x) {
    let best = null, bd = 5;
    for (const m of st.markers) { const d = Math.abs(xOf(m.t) - x); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  on(cw, 'mousedown', (e) => {
    cw.focus();
    if (e.button !== 0) return;
    const [x, y] = localXY(e, cw);
    const m = y < RULER_H ? markerNear(x) : null;
    if (y >= RULER_H) { const i = rowAtY(y); if (i >= 0) selectRow(i, e); }
    const move = (ev, final) => {
      const [xx, yy] = localXY(ev, cw);
      let t = clamp(tOf(xx), 0, Math.max(sim.now, tOf(WW)));
      if (m) { m.t = Math.round(snapTime(t, yy)); st.activeMarker = m; invalidate(false); }
      else setCursor(ev.shiftKey ? t : snapTime(t, yy));
      if (!final) {
        if (xx > WW - 4) { st.t0 += 10 * st.scale; st.fit = false; clampView(); invalidate(); }
        else if (xx < 4 && st.t0 > 0) { st.t0 = Math.max(0, st.t0 - 10 * st.scale); st.fit = false; invalidate(); }
      }
    };
    move(e);
    const mm = (ev) => move(ev);
    const mu = (ev) => { window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); move(ev, true); };
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
  });
  on(cw, 'mousemove', (e) => {
    if (e.buttons) return;
    const [x, y] = localXY(e, cw);
    cw.style.cursor = y < RULER_H && markerNear(x) ? 'ew-resize' : 'crosshair';
  });
  on(cw, 'wheel', (e) => {
    e.preventDefault();
    const [x] = localXY(e, cw);
    if (e.ctrlKey || e.metaKey) { zoomAt(Math.pow(1.0018, e.deltaY), x); return; }
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      st.t0 = Math.max(0, st.t0 + d * st.scale); st.fit = false; clampView(); invalidate(); return;
    }
    vsc.scrollTop += e.deltaY;
  }, { passive: false });
  on(cw, 'contextmenu', (e) => {
    e.preventDefault();
    const [x, y] = localXY(e, cw);
    const m = markerNear(x);
    const t = tOf(x);
    if (y >= RULER_H) { const i = rowAtY(y); if (i >= 0 && !st.sel.has(flat[i].key)) selectRow(i, null); }
    const items = [
      { label: 'Add Marker Here', action: () => addMarker(snapTime(t, y)) },
      { label: 'Add Marker at Cursor', action: () => addMarker(st.cursor) },
      { label: 'Delete Marker', disabled: !m, action: () => removeMarker(m) },
      { label: 'Delete All Markers', disabled: !st.markers.length, action: () => { st.markers = []; st.activeMarker = null; invalidate(false); } },
      { sep: true },
      { label: 'Zoom In', action: () => zoomAt(0.5, x) }, { label: 'Zoom Out', action: () => zoomAt(2, x) }, { label: 'Zoom to Full View', action: zoomFit },
    ];
    if (y >= RULER_H && selectedItems().length) items.push({ sep: true }, ...waveRowMenu());
    showMenu(e.clientX, e.clientY, items);
  });

  // keyboard (wave window)
  const onKey = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { removeSelectedRows(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { st.sel = new Set(flat.map(f => f.key)); invalidate(false); e.preventDefault(); }
    else if (e.key === 'ArrowRight' && !e.ctrlKey) { jumpEdge(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && !e.ctrlKey) { jumpEdge(-1); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const cur = flat.findIndex(f => st.sel.has(f.key));
      const i = clamp((cur < 0 ? -1 : cur) + (e.key === 'ArrowDown' ? 1 : -1), 0, flat.length - 1);
      if (flat[i]) { selectRow(i, { shiftKey: e.shiftKey, button: 0 }); const y = i * ROW_H; if (y < st.scrollY) vsc.scrollTop = y; else if (y + ROW_H > st.scrollY + WH - RULER_H) vsc.scrollTop = y + ROW_H - (WH - RULER_H); }
      e.preventDefault();
    }
    else if (e.key === '+' || e.key === '=') zoomAt(0.5);
    else if (e.key === '-') zoomAt(2);
    else if (e.key === 'f' || e.key === 'F') zoomFit();
    else if (e.key === 'm' || e.key === 'M') addMarker(st.cursor);
  };
  on(cn, 'keydown', onKey); on(cw, 'keydown', onKey);

  function removeSelectedRows() {
    const keys = st.sel;
    if (!keys.size) return;
    st.rows = st.rows.filter(r => !keys.has(String(r.id)));
    st.sel.clear(); rebuildFlat(); updateVScroll(); invalidate(); renderObjects();
  }
  function renameDivider(row) {
    const n = prompt('Divider name:', row.name);
    if (n != null) { row.name = n; invalidate(false); }
  }
  function addDivider() {
    const sel = flat.findIndex(f => st.sel.has(f.key));
    const at = sel >= 0 ? st.rows.indexOf(flat[sel].row) : st.rows.length;
    const row = { id: st.rowSeq++, kind: 'div', name: 'New Divider' };
    st.rows.splice(at, 0, row); rebuildFlat(); invalidate();
    renameDivider(row);
  }
  function radixItems() {
    const its = selectedItems().filter(f => f.row.kind === 'sig' && !f.bit);
    const cur = its.length ? its[0].row.radix : null;
    return RADIXES.map(([k, label]) => ({
      label, checked: cur === k, disabled: !its.length,
      action: () => { for (const f of its) f.row.radix = k; invalidate(false); },
    }));
  }
  function waveRowMenu() {
    const its = selectedItems();
    const sigs = its.filter(f => f.row.kind === 'sig' && !f.bit);
    const one = sigs.length === 1 ? sigs[0].row.sig : null;
    const expandable = sigs.filter(f => f.row.sig.wave && isBitsType(f.row.sig.t) && f.row.sig.t.w > 1);
    return [
      { label: 'Radix', sub: radixItems(), disabled: !sigs.length },
      { label: expandable.some(f => f.row.expanded) ? 'Collapse Bus' : 'Expand Bus', disabled: !expandable.length, action: () => { const v = !expandable.some(f => f.row.expanded); for (const f of expandable) f.row.expanded = v; rebuildFlat(); invalidate(); } },
      { sep: true },
      { label: 'Force Constant...', disabled: !one || !one.wave, action: () => forceDialog(one, 'const') },
      { label: 'Force Clock...', disabled: !one || !one.wave, action: () => forceDialog(one, 'clock') },
      { label: 'Remove Force', disabled: !sigs.some(f => isForced(f.row.sig)), action: () => { for (const f of sigs) removeForces(f.row.sig); } },
      { sep: true },
      { label: 'New Divider', action: addDivider },
      { label: 'Rename Divider...', disabled: !(its.length === 1 && its[0].row.kind === 'div'), action: () => renameDivider(its[0].row) },
      { label: 'Go To Source Code', disabled: !one || !onOpenSource, action: () => openSource(one) },
      { sep: true },
      { label: 'Delete', disabled: !its.some(f => !f.bit), action: removeSelectedRows },
    ];
  }
  function openSource(x) {
    if (!onOpenSource || !x) return;
    const file = x.file || x.inst?.file, line = x.loc?.line || 1;
    if (file) onOpenSource({ file, line, object: x });
  }

  // ---------------------------------------------------------------- context menu
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function buildMenu(items, x, y) {
    const m = h('div', 'isim-menu');
    for (const it of items) {
      if (it.sep) { m.appendChild(h('div', 'isim-menu-sep')); continue; }
      const r = h('div', 'isim-menu-item' + (it.disabled ? ' dis' : ''), `<span class="chk">${it.checked ? '✓' : ''}</span><span class="lbl">${esc(it.label)}</span><span class="arr">${it.sub ? '▸' : ''}</span>`);
      if (it.sub && !it.disabled) {
        let subEl = null;
        r.addEventListener('mouseenter', () => {
          m.querySelectorAll(':scope > .isim-menu').forEach(s => s.remove());
          const rr = r.getBoundingClientRect(), mr = m.getBoundingClientRect();
          subEl = buildMenu(it.sub, rr.right - mr.left - 2, rr.top - mr.top - 3);
          m.appendChild(subEl);
        });
      } else {
        r.addEventListener('mouseenter', () => m.querySelectorAll(':scope > .isim-menu').forEach(s => s.remove()));
      }
      if (!it.disabled && it.action) r.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); it.action(); });
      m.appendChild(r);
    }
    m.style.left = x + 'px'; m.style.top = y + 'px';
    return m;
  }
  function showMenu(x, y, items) {
    closeMenu();
    menuEl = buildMenu(items, 0, 0);
    menuEl.classList.add('isim-menu-root');
    document.body.appendChild(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = clamp(x, 0, window.innerWidth - r.width - 4) + 'px';
    menuEl.style.top = clamp(y, 0, window.innerHeight - r.height - 4) + 'px';
  }
  const docDown = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  const docKey = (e) => { if (e.key === 'Escape') { closeMenu(); closeDialog(); } };
  document.addEventListener('mousedown', docDown, true);
  document.addEventListener('keydown', docKey);
  cleanups.push(() => { document.removeEventListener('mousedown', docDown, true); document.removeEventListener('keydown', docKey); closeMenu(); });

  // ---------------------------------------------------------------- instance tree
  function renderTree() {
    treeEl.innerHTML = '';
    const mk = (inst, isTop) => {
      const li = h('li');
      const procs = (inst.procs || []).filter(p => p.kind !== 'glue');
      const hasKids = inst.children.length || procs.length;
      const row = h('div', 'row' + (inst === st.curInst ? ' sel' : ''),
        `<span class="twisty">${hasKids ? (inst._isimOpen === false ? '▸' : '▾') : ''}</span><span class="ico">${isTop ? ICON.top : ICON.inst}</span><span class="lbl">${esc(inst.name)}</span><span class="isim-mod">(${esc(inst.module ?? '')})</span>`);
      row.title = pathOf(inst);
      row.draggable = true;
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-isim', JSON.stringify({ inst: inst.path })); e.dataTransfer.effectAllowed = 'copy'; });
      row.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('twisty') && hasKids) { inst._isimOpen = inst._isimOpen === false; renderTree(); return; }
        st.curInst = inst; renderTree(); renderObjects();
      });
      row.addEventListener('dblclick', () => openSource(inst));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault(); st.curInst = inst; renderTree(); renderObjects();
        showMenu(e.clientX, e.clientY, [
          { label: 'Add to Wave Window', action: () => addInstance(inst, false) },
          { label: 'Add to Wave Window (Recursive)', action: () => addInstance(inst, true) },
          { sep: true },
          { label: 'Go To Source Code', disabled: !onOpenSource, action: () => openSource(inst) },
        ]);
      });
      li.appendChild(row);
      if (hasKids && inst._isimOpen !== false) {
        const ul = h('ul');
        for (const c of inst.children) ul.appendChild(mk(c, false));
        for (const p of procs) {
          const pl = h('li');
          const pr = h('div', 'row', `<span class="twisty"></span><span class="ico">${ICON.proc}</span><span class="lbl">${esc(p.name)}</span>`);
          pr.title = `${p.kind}${p.loc?.line ? ` (line ${p.loc.line})` : ''}`;
          pr.addEventListener('dblclick', () => openSource(p));
          pr.addEventListener('mousedown', () => { st.curInst = inst; renderTree(); renderObjects(); });
          pl.appendChild(pr); ul.appendChild(pl);
        }
        li.appendChild(ul);
      }
      return li;
    };
    if (design.top) treeEl.appendChild(mk(design.top, true));
  }
  function addInstance(inst, recursive, at) {
    const sigs = [];
    const walk = (i) => {
      if (recursive) sigs.push({ divider: pathOf(i) });
      for (const o of instSignals(i)) sigs.push(o.sig);
      if (recursive) for (const c of i.children) walk(c);
    };
    walk(inst);
    const rows = [];
    for (const s of sigs) rows.push(s.divider ? { id: st.rowSeq++, kind: 'div', name: s.divider } : newRow(s));
    st.rows.splice(at ?? st.rows.length, 0, ...rows);
    rebuildFlat(); updateVScroll(); invalidate(); renderObjects();
  }

  // ---------------------------------------------------------------- objects list
  let objRows = [];
  function renderObjects() {
    const inst = st.curInst;
    $('.isim-obj-scope').textContent = inst ? pathOf(inst) : '';
    objBody.innerHTML = '';
    objRows = [];
    if (!inst) return;
    const inWave = new Set(st.rows.filter(r => r.kind === 'sig').map(r => r.sig));
    for (const o of instSignals(inst)) {
      const sig = o.sig;
      const tr = h('tr');
      const dir = o.port?.dir;
      const ico = !sig.wave ? ICON.sigArr : dir === 'in' ? ICON.sigIn : dir === 'out' ? ICON.sigOut : dir === 'inout' ? ICON.sigIo : (sig.t.w === 1 && sig.t.kind === 'logic' ? ICON.sigBit : ICON.sigBus);
      tr.innerHTML = `<td class="c-chk"><input type="checkbox" ${inWave.has(sig) ? 'checked' : ''} title="Show in wave window"></td><td class="c-name"><span class="ico">${ico}</span>${esc(o.port ? o.port.name : sig.name)}</td><td class="c-val"></td><td class="c-type">${esc(typeName(sig))}</td>`;
      tr.draggable = true;
      if (st.selObj.has(sig)) tr.classList.add('sel');
      tr.addEventListener('dragstart', (e) => {
        if (!st.selObj.has(sig)) { st.selObj = new Set([sig]); }
        e.dataTransfer.setData('text/x-isim', JSON.stringify({ sigs: [...st.selObj].map(s => s.path) }));
        e.dataTransfer.effectAllowed = 'copy';
      });
      tr.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.ctrlKey || e.metaKey) { if (st.selObj.has(sig)) st.selObj.delete(sig); else st.selObj.add(sig); }
        else if (e.shiftKey && objRows.length) {
          const idx = objRows.findIndex(r => r.sig === sig);
          const a = objRows.findIndex(r => st.selObj.has(r.sig));
          if (a >= 0) { const [lo, hi] = [Math.min(a, idx), Math.max(a, idx)]; st.selObj = new Set(objRows.slice(lo, hi + 1).map(r => r.sig)); }
        } else if (!(e.button === 2 && st.selObj.has(sig))) st.selObj = new Set([sig]);
        for (const r of objRows) r.tr.classList.toggle('sel', st.selObj.has(r.sig));
      });
      tr.addEventListener('dblclick', () => { if (!inWave.has(sig)) addSignals([sig]); });
      tr.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) addSignals([sig]);
        else { st.rows = st.rows.filter(r => r.sig !== sig); rebuildFlat(); updateVScroll(); invalidate(); renderObjects(); }
      });
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const sel = [...st.selObj];
        const one = sel.length === 1 ? sel[0] : null;
        showMenu(e.clientX, e.clientY, [
          { label: 'Add to Wave Window', action: () => addSignals(sel.filter(s => true)) },
          { sep: true },
          { label: 'Force Constant...', disabled: !one || !one.wave, action: () => forceDialog(one, 'const') },
          { label: 'Force Clock...', disabled: !one || !one.wave, action: () => forceDialog(one, 'clock') },
          { label: 'Remove Force', disabled: !sel.some(s => isForced(s)), action: () => sel.forEach(removeForces) },
          { sep: true },
          { label: 'Go To Source Code', disabled: !one || !onOpenSource, action: () => openSource(one) },
          { label: 'Copy Path', disabled: !one, action: () => navigator.clipboard?.writeText(pathOf(one)) },
        ]);
      });
      objBody.appendChild(tr);
      objRows.push({ sig, tr, val: tr.querySelector('.c-val') });
    }
    updateObjectValues();
  }
  function updateObjectValues() {
    for (const r of objRows) {
      const sig = r.sig;
      const v = sig.wave ? sim.valueAt(sig, st.cursor) : sig.val;
      const s = Array.isArray(v) ? '(array)' : formatValue(v, sig.t, sig.t.kind === 'logic' && sig.t.w > 1 ? 'bin' : 'default');
      if (r.val.textContent !== s) r.val.textContent = s;
      r.val.classList.toggle('x', !!(v && !Array.isArray(v) && v.x));
    }
  }

  // drag & drop into the wave window
  const wavebody = $('.isim-wavebody');
  on(wavebody, 'dragover', (e) => { if ([...e.dataTransfer.types].includes('text/x-isim')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  on(wavebody, 'drop', (e) => {
    const d = e.dataTransfer.getData('text/x-isim');
    if (!d) return;
    e.preventDefault();
    const { sigs, inst } = JSON.parse(d);
    const [, y] = localXY(e, cn);
    let at = st.rows.length;
    const i = rowAtY(y);
    if (i >= 0) at = st.rows.indexOf(flat[i].row);
    if (inst) { const I = findInst(inst); if (I) addInstance(I, false, at); }
    else addSignals(sigs.map(p => design.signals.find(s => s.path === p)).filter(Boolean), at);
  });

  // ---------------------------------------------------------------- path resolution
  function normPath(p) { return String(p).trim().replace(/^\/+/, '').replace(/\//g, '.').toLowerCase(); }
  function findSignal(p) {
    const n = normPath(p);
    const cands = [n];
    if (st.curInst) cands.push(normPath(st.curInst.path) + '.' + n);
    if (design.top) cands.push(normPath(design.top.path) + '.' + n);
    for (const c of cands) {
      const s = design.signals.find(s => s.path.toLowerCase() === c);
      if (s) return s;
      // port aliases: inst.port names map to parent signals
      const dot = c.lastIndexOf('.');
      const inst = findInst(c.slice(0, dot));
      const port = inst?.ports.find(pp => pp.name.toLowerCase() === c.slice(dot + 1));
      if (port) return port.sig;
    }
    return null;
  }
  function findInst(p) {
    const n = normPath(p);
    let res = null;
    const walk = (i) => { if (res) return; if (i.path.toLowerCase() === n) res = i; else i.children.forEach(walk); };
    if (design.top) walk(design.top);
    if (!res && st.curInst && n) {
      const m = normPath(st.curInst.path) + '.' + n;
      const w2 = (i) => { if (res) return; if (i.path.toLowerCase() === m) res = i; else i.children.forEach(w2); };
      w2(design.top);
    }
    return res;
  }

  // ---------------------------------------------------------------- forces (injected stimulus processes)
  // A force is a pattern of {off, val} applied from `start` (absolute ps), optionally repeating every `repeat`
  // ps, until `end` (absolute ps; the signal is released there when `endRelease`). It runs inside the
  // simulator as a pseudo-process woken through the event heap, so forced values land at exact times and
  // override drivers. Forces form a history: a new force on the same signal truncates the previous one, and
  // Restart replays the whole history from time 0.
  function injectForce(f) {
    const sigRef = f.sig;
    const from = sim.now;
    const gen = (function* () {
      let base = f.start;
      // (re)injected mid-flight: skip the cycles that are already in the past
      if (f.repeat && from > f.start) base += Math.floor((from - f.start) / f.repeat) * f.repeat;
      for (;;) {
        for (const ev of f.pattern) {
          const tk = base + ev.off;
          if (tk < from && (f.repeat || ev !== f.pattern[f.pattern.length - 1])) continue;
          if (f.end != null && tk >= f.end) {
            if (f.endRelease) { if (f.end > sim.now) yield { delay: f.end - sim.now }; sim.release(sigRef); }
            return;
          }
          if (tk > sim.now) yield { delay: tk - sim.now };
          sim.force(sigRef, ev.val);
        }
        if (!f.repeat) break;
        base += f.repeat;
      }
      if (f.end != null && f.endRelease) {
        if (f.end > sim.now) yield { delay: f.end - sim.now };
        sim.release(sigRef);
      }
    })();
    const rt = { p: { name: `isim_force_${sigRef.name}`, kind: 'force', inst: design.top, file: null, loc: null }, gen, done: false, rec: null, ctx: null };
    f.rt = rt;
    sim.heap.push(Math.max(f.start, sim.now), { wake: rt });
  }
  const forceActive = (f, t = sim.now) => f.start <= t ? (f.end == null || f.end > t) : true;
  function isForced(sig) { return st.forces.some(f => f.sig === sig && forceActive(f)); }
  // stop the forces of `sig` at time `t` (dropping those that have not started yet)
  function truncateForces(sig, t, release) {
    const keep = [];
    for (const f of st.forces) {
      if (f.sig !== sig) { keep.push(f); continue; }
      if (f.start >= t) { if (f.rt) f.rt.done = true; continue; }
      if (f.end == null || f.end > t) {
        f.end = t; f.endRelease = release;
        if (f.rt) f.rt.done = true;
        if (!sim.finished && t > sim.now) injectForceTail(f);
      }
      keep.push(f);
    }
    st.forces = keep;
  }
  // re-create the generator of a running force so it observes a new end time
  function injectForceTail(f) { injectForce(f); }
  function addForce(sig, { pattern, start = sim.now, repeat = 0, cancel = null, desc }) {
    start = Math.round(start);
    truncateForces(sig, start, false);
    const f = { id: st.forceSeq++, sig, pattern, start, repeat: Math.round(repeat), end: cancel == null ? null : Math.round(cancel), endRelease: true, desc };
    st.forces.push(f);
    if (sim.finished) { logLine('WARNING: simulation has finished; the force takes effect after restart', 'warning'); }
    else {
      injectForce(f);
      // apply immediately when starting now, so the change is visible without running
      if (f.start <= sim.now && pattern[0]?.off === 0) {
        if (!sim.started) sim.start();
        sim.force(sig, pattern[0].val);
        sim.run(sim.now);
      }
    }
    invalidate(false); objDirty = true;
    return f;
  }
  function removeForces(sig, silent) {
    if (!st.forces.some(f => f.sig === sig)) return;
    truncateForces(sig, sim.now, true);
    sim.release(sig);
    if (!silent) { logLine(`Force removed from ${pathOf(sig)}`, 'info'); invalidate(false); }
  }

  // ---------------------------------------------------------------- dialogs
  let dlgEl = null;
  function closeDialog() { if (dlgEl) { dlgEl.remove(); dlgEl = null; } }
  function forceDialog(sig, kind) {
    closeDialog();
    const t = sig.t;
    const isEnum = t.kind === 'enum';
    const defRadix = t.kind === 'int' ? 'dec' : 'bin';
    const ov = h('div', 'isim-dlg-overlay');
    const clock = kind === 'clock';
    const one = t.kind === 'enum' ? t.names[1] ?? t.names[0] : t.kind === 'bool' ? 'TRUE' : '1';
    const zero = t.kind === 'enum' ? t.names[0] : t.kind === 'bool' ? 'FALSE' : '0';
    ov.innerHTML = `
      <div class="isim-dlg" role="dialog">
        <div class="isim-dlg-title">${clock ? 'Define Clock' : 'Force Selected Signal'}<button class="isim-dlg-x" title="Close">✕</button></div>
        <div class="isim-dlg-body">
          <div class="isim-dlg-hint">${clock ? 'Specify the properties of the clock to be applied to the selected signal.' : 'Specify the value to force the selected signal to.'}</div>
          <div class="isim-dlg-grid">
            <label>Signal Name:</label><input name="sig" value="${esc(pathOf(sig))}" readonly>
            <label>Value Radix:</label><select name="radix" ${isEnum ? 'disabled' : ''}>
              <option value="bin">Binary</option><option value="hex">Hexadecimal</option><option value="dec">Decimal</option><option value="oct">Octal</option><option value="ascii">ASCII</option>
            </select>
            ${clock ? `
            <label>Leading Edge Value:</label><input name="lead" value="${esc(zero)}">
            <label>Trailing Edge Value:</label><input name="trail" value="${esc(one)}">
            <label>Starting at Time Offset:</label><input name="start" value="0">
            <label>Cancel after Time Offset:</label><input name="cancel" value="" placeholder="(never)">
            <label>Period:</label><input name="period" value="10 ns">
            <label>Duty Cycle (%):</label><input name="duty" value="50">` : `
            <label>Force to Value:</label><input name="value" value="${esc(formatValue(sim.valueAt(sig, sim.now), t, isEnum || t.kind === 'bool' ? 'default' : defRadix === 'dec' ? 'sdec' : 'bin'))}">
            <label>Starting at Time Offset:</label><input name="start" value="0">
            <label>Cancel after Time Offset:</label><input name="cancel" value="" placeholder="(never)">`}
          </div>
          <div class="isim-dlg-note">Time offsets are relative to the current simulation time (${esc(fmtTime(sim.now))}); default unit is ns.</div>
          <div class="isim-dlg-err"></div>
        </div>
        <div class="isim-dlg-btns"><button class="btn primary" data-a="ok">OK</button><button class="btn" data-a="cancel">Cancel</button><button class="btn" data-a="apply">Apply</button></div>
      </div>`;
    root.appendChild(ov); dlgEl = ov;
    const q = (n) => ov.querySelector(`[name="${n}"]`);
    q('radix').value = defRadix;
    const err = ov.querySelector('.isim-dlg-err');
    const apply = () => {
      try {
        const radix = isEnum ? 'default' : q('radix').value;
        const start = sim.now + (q('start').value.trim() ? parseTime(q('start').value, 'ns') : 0);
        const cancelOff = q('cancel').value.trim() ? parseTime(q('cancel').value, 'ns') : null;
        if (isNaN(start) || (cancelOff !== null && isNaN(cancelOff))) throw new Error('invalid time offset');
        const cancel = cancelOff == null ? null : sim.now + cancelOff;
        if (clock) {
          const lead = parseValue(q('lead').value, t, radix), trail = parseValue(q('trail').value, t, radix);
          const period = parseTime(q('period').value, 'ns');
          const duty = parseFloat(q('duty').value);
          if (!(period >= 2)) throw new Error('period must be at least 2 ps');
          if (!(duty > 0 && duty < 100)) throw new Error('duty cycle must be between 0 and 100');
          const hi = Math.max(1, Math.min(period - 1, Math.round(period * duty / 100)));
          addForce(sig, { pattern: [{ off: 0, val: lead }, { off: hi, val: trail }], start, repeat: period, cancel, desc: `clock ${q('lead').value}/${q('trail').value} period ${fmtTime(period)} duty ${duty}%` });
          echo(`isim force add ${pathOf(sig)} ${q('lead').value} -radix ${radix === 'default' ? 'bin' : radix}${start > sim.now ? ` -time ${fmtTime(start - sim.now)}` : ''} -value ${q('trail').value} -time ${fmtTime(hi + start - sim.now)} -repeat ${fmtTime(period)}${cancelOff != null ? ` -cancel ${fmtTime(cancelOff)}` : ''}`);
        } else {
          const val = parseValue(q('value').value, t, radix);
          addForce(sig, { pattern: [{ off: 0, val }], start, cancel, desc: `constant ${q('value').value}` });
          echo(`isim force add ${pathOf(sig)} ${q('value').value} -radix ${radix === 'default' ? 'bin' : radix}${start > sim.now ? ` -time ${fmtTime(start - sim.now)}` : ''}${cancelOff != null ? ` -cancel ${fmtTime(cancelOff)}` : ''}`);
        }
        err.textContent = '';
        return true;
      } catch (e) { err.textContent = e.message; return false; }
    };
    ov.querySelector('.isim-dlg-x').onclick = closeDialog;
    ov.querySelector('[data-a=cancel]').onclick = closeDialog;
    ov.querySelector('[data-a=apply]').onclick = apply;
    ov.querySelector('[data-a=ok]').onclick = () => { if (apply()) closeDialog(); };
    ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (apply()) closeDialog(); } });
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeDialog(); });
    const first = ov.querySelector(clock ? '[name=lead]' : '[name=value]');
    first.focus(); first.select();
  }

  // ---------------------------------------------------------------- console
  const KIND_LABEL = { note: 'Note', warning: 'Warning', error: 'Error', failure: 'Failure' };
  let consoleLines = 0;
  function appendConsole(text, cls, src) {
    const atBottom = cons.scrollHeight - cons.scrollTop - cons.clientHeight < 30;
    const d = h('div', 'isim-ln ' + (cls || ''));
    d.textContent = text;
    if (src && src.file && onOpenSource) {
      d.classList.add('link'); d.title = `${src.file}:${src.line ?? ''}`;
      d.addEventListener('dblclick', () => onOpenSource({ file: src.file, line: src.line || 1 }));
    }
    cons.appendChild(d);
    if (++consoleLines > 5000) { cons.firstChild.remove(); consoleLines--; }
    if (atBottom) cons.scrollTop = cons.scrollHeight;
  }
  function logLine(text, kind = 'info') { appendConsole(text, 'k-' + kind); }
  function echo(cmd) { appendConsole(`ISim> ${cmd}`, 'k-cmd'); }
  function formatLog(e) {
    if (e.kind === 'print') return e.text;
    const lbl = KIND_LABEL[e.kind] || e.kind;
    if (!e.proc) return e.kind === 'note' ? e.text : `${lbl.toUpperCase()}: ${e.text}`;
    const scope = e.proc ? ` (${e.file ? e.file.split('/').pop() : ''}${e.line ? `:${e.line}` : ''})` : '';
    return `at ${fmtTime(e.time)}: ${lbl}: ${e.text}${scope}`;
  }
  const prevOnLog = sim.onLog;
  sim.onLog = (e) => { prevOnLog?.(e); appendConsole(formatLog(e), 'k-' + e.kind, e); };
  cleanups.push(() => { sim.onLog = prevOnLog; });
  $('.isim-clear').addEventListener('click', () => { cons.innerHTML = ''; consoleLines = 0; });

  const HELP = [
    'Available commands:',
    '  run [<time> [<unit>]] | run all       advance the simulation (default run time from the toolbar)',
    '  restart                               restart the simulation from time 0 (forces are kept)',
    '  isim force add <path> <value> [-radix bin|hex|dec|oct|ascii] [-time <t>] [-value <v> -time <t>]... [-repeat <period>] [-cancel <t>]',
    '  isim force remove <path>              release a forced signal',
    '  wave add <path>                       add a signal (or every signal of an instance) to the wave window',
    '  show value <path> [-radix <r>]        print the current value of a signal',
    '  show time                             print the current simulation time',
    '  zoom fit | zoom in | zoom out         change the wave window zoom',
    '  marker add [<time>]                   add a marker',
    '  help                                  this text',
    'Paths may use / or . separators and may be relative to the selected instance; times default to ns.',
  ];
  function tokenize(s) { return (s.match(/"[^"]*"|'[^']*'|\S+/g) || []); }
  async function execCommand(line) {
    const s = line.trim();
    if (!s) return;
    echo(s);
    st.history.push(s); st.histPos = st.history.length;
    const tk = tokenize(s);
    const c0 = tk[0].toLowerCase();
    try {
      if (c0 === 'help' || c0 === '?') { HELP.forEach(l => logLine(l)); return; }
      if (c0 === 'run') {
        if (!tk[1]) { const ps = parseTime(rfVal.value, rfUnit.value); await api.runFor(ps); return; }
        if (tk[1].toLowerCase() === 'all') { await api.runAll(); return; }
        const ps = parseTime(tk.slice(1).join(''), 'ns');
        if (!(ps > 0)) throw new Error(`invalid time '${tk.slice(1).join(' ')}'`);
        await api.runFor(ps); return;
      }
      if (c0 === 'restart') { api.restart(true); return; }
      if (c0 === 'show' && tk[1] === 'time') { logLine(`Simulation time: ${fmtTime(sim.now)}`); return; }
      if (c0 === 'show' && tk[1] === 'value') {
        const sig = findSignal(tk[2] || '');
        if (!sig) throw new Error(`signal '${tk[2] || ''}' not found`);
        const ri = tk.indexOf('-radix');
        const radix = ri > 0 ? ({ dec: 'sdec', unsigned: 'udec' }[tk[ri + 1]] || tk[ri + 1]) : 'default';
        logLine(Array.isArray(sig.val) ? '(array)' : formatValue(sig.val, sig.t, radix));
        return;
      }
      if (c0 === 'wave' && tk[1] === 'add') {
        if (!tk[2]) throw new Error('usage: wave add <path>');
        for (const p of tk.slice(2)) {
          const sig = findSignal(p);
          if (sig) { addSignals([sig]); continue; }
          const inst = findInst(p) || (p === '/' ? design.top : null);
          if (inst) { addInstance(inst, false); continue; }
          throw new Error(`object '${p}' not found`);
        }
        return;
      }
      if (c0 === 'zoom') { const a = tk[1]; if (a === 'fit' || a === 'full') zoomFit(); else if (a === 'in') zoomAt(0.5); else if (a === 'out') zoomAt(2); return; }
      if (c0 === 'marker' && tk[1] === 'add') { addMarker(tk[2] ? parseTime(tk.slice(2).join(''), 'ns') : st.cursor); return; }
      if (c0 === 'isim' && tk[1] === 'force') {
        const sub = tk[2];
        const sig = findSignal(tk[3] || '');
        if (!sig) throw new Error(`signal '${tk[3] || ''}' not found`);
        if (sub === 'remove') { removeForces(sig); return; }
        if (sub !== 'add') throw new Error('usage: isim force add|remove <path> ...');
        if (!sig.wave) throw new Error('arrays/memories cannot be forced');
        let radix = 'default';
        const ri = tk.indexOf('-radix');
        if (ri > 0) radix = ({ unsigned: 'dec', signed: 'dec', binary: 'bin', hexadecimal: 'hex' }[tk[ri + 1]] || tk[ri + 1]);
        const pattern = [];
        let pending = tk[4];
        let repeat = 0, cancel = null;
        let curOff = 0;
        const rawVals = [];
        if (pending === undefined || pending.startsWith('-')) throw new Error('missing value');
        rawVals.push({ v: pending, off: 0 });
        for (let i = 5; i < tk.length; i++) {
          const a = tk[i];
          const takeTime = () => { let t = tk[++i]; if (tk[i + 1] && /^(fs|ps|ns|us|ms|s)$/i.test(tk[i + 1])) t += tk[++i]; const ps = parseTime(t, 'ns'); if (isNaN(ps)) throw new Error(`invalid time '${t}'`); return ps; };
          if (a === '-radix') { i++; continue; }
          if (a === '-value') { rawVals.push({ v: tk[++i], off: null }); continue; }
          if (a === '-time') { curOff = takeTime(); rawVals[rawVals.length - 1].off = curOff; continue; }
          if (a === '-repeat') { repeat = takeTime(); continue; }
          if (a === '-cancel') { cancel = takeTime(); continue; }
          throw new Error(`unknown option '${a}'`);
        }
        let lastOff = 0;
        for (const r of rawVals) {
          const off = r.off ?? lastOff;
          pattern.push({ off, val: parseValue(r.v.replace(/^["']|["']$/g, (m) => m), sig.t, radix) });
          lastOff = off;
        }
        pattern.sort((a, b) => a.off - b.off);
        const base = pattern[0].off;
        for (const p of pattern) p.off -= base;
        if (repeat && pattern[pattern.length - 1].off >= repeat) throw new Error('-repeat period must exceed the last -time offset');
        addForce(sig, { pattern, start: sim.now + base, repeat, cancel: cancel == null ? null : sim.now + cancel, desc: s });
        if (!rows().some(r => r.sig === sig)) addSignals([sig]);
        return;
      }
      throw new Error(`unknown command '${tk[0]}' (type help)`);
    } catch (e) {
      logLine(`ERROR: ${e.message}`, 'error');
    }
  }
  const rows = () => st.rows.filter(r => r.kind === 'sig');
  cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const v = cmdInput.value; cmdInput.value = ''; execCommand(v); }
    else if (e.key === 'ArrowUp') { if (st.histPos > 0) { st.histPos--; cmdInput.value = st.history[st.histPos]; } e.preventDefault(); }
    else if (e.key === 'ArrowDown') { if (st.histPos < st.history.length) { st.histPos++; cmdInput.value = st.history[st.histPos] ?? ''; } e.preventDefault(); }
  });

  // ---------------------------------------------------------------- splitters
  function hookSplit(el, dirV, get, set) {
    on(el, 'mousedown', (e) => {
      e.preventDefault();
      const p0 = dirV ? e.clientX : e.clientY, v0 = get();
      root.classList.add(dirV ? 'isim-resizing-v' : 'isim-resizing-h');
      const mm = (ev) => { set(v0 + ((dirV ? ev.clientX : ev.clientY) - p0)); };
      const mu = () => { root.classList.remove('isim-resizing-v', 'isim-resizing-h'); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); };
      window.addEventListener('mousemove', mm); window.addEventListener('mouseup', mu);
    });
  }
  let leftW = 290, consoleH = 170, instH = null;
  const applySizes = () => {
    leftEl.style.width = leftW + 'px'; bottomEl.style.height = consoleH + 'px';
    if (instH != null) $('.isim-inst-panel').style.flex = `0 0 ${instH}px`;
  };
  hookSplit($('.isim-split-main'), true, () => leftW, (v) => { leftW = clamp(v, 140, 700); applySizes(); });
  // bottom splitter: dragging down shrinks the console
  hookSplit($('.isim-split-bottom'), false, () => -consoleH, (v) => { consoleH = clamp(-v, 60, 700); applySizes(); });
  hookSplit($('.isim-split-left'), false, () => instH ?? $('.isim-inst-panel').getBoundingClientRect().height, (v) => { instH = clamp(v, 60, 900); applySizes(); });
  applySizes();

  // ---------------------------------------------------------------- simulation control
  const yieldUI = () => new Promise(r => setTimeout(r, 0));
  async function runTo(target, label) {
    if (st.running) return;
    if (sim.finished) { logLine(`Simulation has already finished (${sim.finished}); use Restart to run again.`, 'warning'); return; }
    st.running = true; st.breakReq = false; st.runStart = sim.now; st.runTarget = target;
    const follow = st.fit || (sim.now >= st.t0 && sim.now <= tOf(WW) + 1);
    setMsg(label || 'Running...');
    invalidate(false);
    let lastYield = performance.now();
    let chunk = 10_000; // ps
    let stalled = false;
    try {
      while (!sim.finished && sim.now < target && !st.breakReq) {
        if (label === 'Run All' && sim.started && !sim.heap.size && !sim.active.length && !sim.nbaQ.length) { stalled = true; break; }
        const tgt = Math.min(target, sim.now + chunk);
        const a = performance.now();
        const r = sim.run(tgt);
        const dt = performance.now() - a;
        if (dt < 8) chunk = Math.min(chunk * 2, 1e12); else if (dt > 25) chunk = Math.max(1, Math.floor(chunk / 3));
        if (!r.pending && !sim.finished) {
          // nothing left to simulate: Run All stops here, Run for just advances time
          if (label === 'Run All') stalled = true; else sim.run(target);
          break;
        }
        if (performance.now() - lastYield > 30 || st.breakReq) {
          lastYield = performance.now();
          setMsg(`${label || 'Running'}... ${fmtTime(sim.now)}`);
          if (follow) followEnd();
          setCursor(sim.now);
          invalidate();
          await yieldUI();
        }
      }
    } catch (e) {
      logLine(`ERROR: internal simulator error: ${e.message}`, 'error');
      console.error(e);
    }
    st.running = false;
    if (st.breakReq) logLine(`Simulation interrupted (Break) at ${fmtTime(sim.now)}`, 'warning');
    else if (stalled) logLine(`Simulation stopped: no more events scheduled (time ${fmtTime(sim.now)})`, 'info');
    else if (!sim.finished && target !== Infinity && sim.now >= st.runStart + (runAllCap) && label === 'Run All') logLine(`Run All stopped at the ${fmtTime(runAllCap)} limit (time ${fmtTime(sim.now)})`, 'warning');
    if (sim.waveTruncated) setMsg('Waveform recording limit reached');
    else setMsg(sim.finished ? `Simulation ${sim.finished === 'error' ? 'stopped with an error' : 'finished'} at ${fmtTime(sim.now)}` : `Ready`);
    if (follow) followEnd();
    setCursor(sim.now);
    objDirty = true;
    invalidate();
  }
  function followEnd() {
    if (st.fit) { applyFit(); return; }
    const span = WW * st.scale;
    if (sim.now > st.t0 + span) st.t0 = sim.now - span * 0.9;
  }

  // ---------------------------------------------------------------- public API
  const api = {
    refresh() { readColors(); renderTree(); renderObjects(); rebuildFlat(); layout(); },
    runFor(ps) { return runTo(sim.now + Math.max(1, Math.round(ps)), 'Run'); },
    runAll() { return runTo(sim.now + runAllCap, 'Run All'); },
    step() {
      if (st.running) return;
      if (sim.finished) { logLine('Simulation has finished; use Restart.', 'warning'); return; }
      if (!sim.started) sim.run(sim.now); // time-0 initialisation
      const top = sim.heap.peek();
      if (!top) { sim.run(sim.now); logLine('No more events scheduled', 'info'); }
      else { sim.run(top.t); logLine(`Stepped to ${fmtTime(sim.now)}`, 'info'); }
      followEnd(); setCursor(sim.now); invalidate();
    },
    restart(silentEcho) {
      if (st.running) { st.breakReq = true; }
      if (!silentEcho) echo('restart');
      sim.reset();
      bitCache.clear();
      for (const f of st.forces) injectForce(f);
      st.cursor = 0; st.t0 = 0;
      if (st.fit) applyFit();
      logLine('Simulator is doing circuit initialization process.');
      logLine('Finished circuit initialization process.');
      if (st.forces.length) logLine(`${st.forces.length} force(s) re-applied.`);
      setMsg('Ready'); objDirty = true; invalidate();
    },
    addSignals(sigs) { addSignals(sigs); },
    destroy() {
      st.breakReq = true;
      if (rafId) cancelAnimationFrame(rafId);
      closeDialog();
      for (const c of cleanups.splice(0)) c();
      root.remove();
    },
    getState() {
      return {
        rows: st.rows.map(r => r.kind === 'div' ? { kind: 'div', name: r.name } : { kind: 'sig', path: r.sig.path, radix: r.radix, expanded: r.expanded }),
        cursor: st.cursor, markers: st.markers.map(m => m.t), t0: st.t0, scale: st.scale, fit: st.fit,
        nameW: st.nameW, valW: st.valW, leftW, consoleH,
        runTime: { value: rfVal.value, unit: rfUnit.value },
        curInst: st.curInst?.path ?? null,
        forces: st.forces.map(f => ({ path: f.sig.path, start: f.start, repeat: f.repeat, end: f.end, endRelease: f.endRelease, desc: f.desc, pattern: f.pattern.map(p => ({ off: p.off, bits: V.toBin(p.val) })) })),
      };
    },
    setState(s) {
      if (!s) return;
      if (Array.isArray(s.rows)) {
        st.rows = [];
        for (const r of s.rows) {
          if (r.kind === 'div') st.rows.push({ id: st.rowSeq++, kind: 'div', name: r.name });
          else { const sig = design.signals.find(x => x.path === r.path); if (sig) st.rows.push(newRow(sig, { radix: r.radix || 'default', expanded: !!r.expanded })); }
        }
        st.sel.clear();
      }
      if (s.cursor != null) st.cursor = s.cursor;
      if (Array.isArray(s.markers)) { st.markers = s.markers.map(t => ({ id: st.markerSeq++, t })); st.activeMarker = st.markers[st.markers.length - 1] || null; }
      if (s.scale) { st.scale = s.scale; st.t0 = s.t0 || 0; st.fit = !!s.fit; }
      if (s.nameW) st.nameW = s.nameW; if (s.valW) st.valW = s.valW;
      if (s.leftW) leftW = s.leftW; if (s.consoleH) consoleH = s.consoleH;
      if (s.runTime) { rfVal.value = s.runTime.value; rfUnit.value = s.runTime.unit; }
      if (s.curInst) { const i = findInst(s.curInst); if (i) st.curInst = i; }
      if (Array.isArray(s.forces)) {
        for (const f of s.forces) {
          const sig = design.signals.find(x => x.path === f.path);
          if (!sig || !sig.wave) continue;
          const pattern = f.pattern.map(p => ({ off: p.off, val: V.withSign(V.resize(V.fromBits(p.bits), sig.t.w, false), !!sig.t.s) }));
          const ff = { id: st.forceSeq++, sig, pattern, start: f.start, repeat: f.repeat, end: f.end ?? null, endRelease: f.endRelease !== false, desc: f.desc };
          st.forces.push(ff);
          if (!sim.finished && (ff.end == null || ff.end > sim.now)) injectForce(ff);
        }
      }
      applySizes(); renderTree(); renderObjects(); rebuildFlat(); layout();
    },
    // extras
    redraw() { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } needScroll = true; draw(); },
    exec: (cmd) => execCommand(cmd),
    exportVCD: () => exportVCD(),
    get state() { return st; },
  };

  function exportVCD() {
    try {
      const text = toVCD(design, sim);
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${design.top?.name || 'waveform'}.vcd`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      logLine(`Waveform exported to ${a.download} (${(text.length / 1024).toFixed(1)} KB)`);
    } catch (e) { logLine(`ERROR: VCD export failed: ${e.message}`, 'error'); }
  }

  // ---------------------------------------------------------------- init
  readColors();
  cleanups.push(onPrefsChange(() => requestAnimationFrame(() => { readColors(); layout(); })));   // light / dark theme
  renderTree();
  if (design.top) {
    const sigs = instSignals(design.top).map(o => o.sig);
    st.rows = sigs.map(s => newRow(s));
  }
  rebuildFlat();
  renderObjects();
  logLine('ISim (Silinx behavioural simulator)');
  logLine('Time resolution is 1 ps');
  logLine('Simulator is doing circuit initialization process.');
  logLine('Finished circuit initialization process.');
  requestAnimationFrame(() => layout());
  if (opts.initialRun > 0) {
    // run after first layout so the view can follow
    setTimeout(() => { echo(`run ${fmtTime(opts.initialRun)}`); api.runFor(opts.initialRun); }, 0);
  }
  return api;
}

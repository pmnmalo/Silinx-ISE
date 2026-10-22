// Silinx - ISim-style simulation / waveform window (plain DOM + canvas, no framework).
//
//   import { mountISim } from './isim.js';
//   const isim = mountISim(container, { design, sim, title, onOpenSource({ file, line }) {} });
//   isim.runFor(1e6); await isim.runAll(); isim.restart(); isim.addSignals([sig]);
//   const s = isim.getState(); isim.setState(s); isim.refresh(); isim.destroy();
//
// Extra options: initialRun (ps, run once after mounting), runAllCap (ps, default 1 ms),
//                wcfg { save(text) → name, load() → { name, text } }: the wave configuration as a file (#1019),
//                defaultRunTime { value, unit } (default 1 us),
//                stimuli { model, ports: [{ name, dir, width }], inst, onChange(model), onSaveTestbench(model) }: the
//                inputs of the simulated module drawn on its waveforms (#336, core/stimuli.js), run at once; `inst`:
//                the instance whose ports they are (a test bench's unit under test, its signals forced), else the top.
// Styles: web/css/isim.css (scoped under .isim, themed by theme.css --wave-* variables).
// Time is in picoseconds everywhere.

import * as V from '/core/values.js';
import { onPrefsChange } from './modern.js';
import { normalizeStimuli } from '/core/stimuli.js';
import { h } from './dom.js';
import { mountConsole } from './isim-console.js';
import { mountForces } from './isim-forces.js';
import { mountDialogs } from './isim-dialogs.js';
import { mountStimuli } from './isim-stimuli.js';
import { mountObjects } from './isim-objects.js';
import { mountRun } from './isim-run.js';
import { mountDraw } from './isim-draw.js';
import { mountInput } from './isim-input.js';
import { mountRows } from './isim-rows.js';
import { mountMenu } from './isim-menu.js';
import { mountTree } from './isim-tree.js';
import { mountApi } from './isim-api.js';
import { mountToolbar } from './isim-toolbar.js';
import { mountView } from './isim-view.js';
import { mountStatus } from './isim-status.js';
import { mountColors } from './isim-colors.js';

// ------------------------------------------------------------------------------- constants
export const ROW_H = 20;
export const RULER_H = 30;
export const UNITS = { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6, ms: 1e9 };
const DEFAULT_CAP = 1e9; // 1 ms

const S = (b) => `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">${b}</svg>`;
export const ICON = {
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
  stim: S('<path d="M1 12h3V4h4v8h3V7h4" fill="none" stroke="#2f8f3a" stroke-width="1.6"/><path d="M10.5 1.5l3 3-6.5 6.5H4v-3z" fill="#f2c94c" stroke="#8a6d1d"/>'),
  wcfgSave: S('<path d="M2 2h10l2 2v10H2z" fill="#4a72b8" stroke="#24467e"/><rect x="4.5" y="2.5" width="6" height="4" fill="#fff"/><rect x="4" y="9" width="8" height="5" fill="#d9e4f5"/><path d="M5 10.5h6M5 12.5h6" stroke="#108010"/>'),
  wcfgLoad: S('<path d="M1.5 4V13.5h11l2.5-6.5H4L1.5 13.5" fill="#ffd862" stroke="#9a7400"/><path d="M1.5 4h4l1 1.5h6V7" fill="none" stroke="#9a7400"/><path d="M6 10.5h2l1-2 1 3 1-1h2" fill="none" stroke="#108010" stroke-width="1.2"/>'),
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

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

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
export function trimNum(n, dec) {
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
export function lowerBound(a, x, lo = 0) {
  let hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
// last index with a[i] <= x (or 0)
export function idxAt(a, x) {
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
export function isScalarType(t) { return (t.kind === 'logic' && t.w === 1); }
export function isBitsType(t) { return t.kind === 'logic' || t.kind === 'int'; }

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

export function typeName(sig) {
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

export const pathOf = (x) => '/' + String(x.path || x.name).replace(/\./g, '/');

// ------------------------------------------------------------------------------- mount


export function mountISim(container, opts = {}) {
  const { design, sim } = opts;
  const onOpenSource = opts.onOpenSource || null;
  const runAllCap = opts.runAllCap ?? DEFAULT_CAP;

  const cleanups = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); cleanups.push(() => el.removeEventListener(ev, fn, o)); };
  // A drag from the pointerdown `e` on `el` (mouse, pen or finger, #264): mm(ev) on every move of that
  // pointer, mu(ev) when it is released, or cancelled (then ev.type is 'pointercancel'). Returns stop(): the
  // drag dropped, with no mu.
  const track = (el, e, mm, mu) => {
    try { el.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const move = (ev) => { if (ev.pointerId === e.pointerId) mm(ev); };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      stop();
      mu(ev);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return stop;
  };

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
    // drawn stimuli (#336): editing on, the model, its mismatches
    stim: { on: false, m: null, bad: [] },
  };
  const stimOpt = opts.stimuli && design.top && opts.stimuli.ports?.some(p => p.dir === 'in') ? opts.stimuli : null;
  const stimInst = stimOpt?.inst || design.top;
  const topSig = new Map((stimInst?.ports || []).map(p => [p.name, p.sig]));
  const stimPortOf = new Map((stimOpt?.ports || []).filter(p => topSig.has(p.name)).map(p => [topSig.get(p.name), p]));
  if (stimOpt?.model) st.stim.m = normalizeStimuli(stimOpt.model, stimOpt.ports);
  let colors = {};

  // ---------------------------------------------------------------- DOM skeleton
  const root = h('div', { class: 'isim' });
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
      <div class="isim-cmdline"><span>SSim&gt;</span><input type="text" spellcheck="false" autocomplete="off" placeholder="Type a command (help)"></div>
    </div>
    <div class="isim-status"><span class="isim-st-msg">Ready</span><span class="isim-progress"><span></span></span><span class="isim-st-delta"></span><span class="isim-st-time"></span></div>
  `;
  container.appendChild(root);
  const $ = (s) => root.querySelector(s);
  $('.isim-title-text').textContent = opts.title || `SSim - [${design.top?.name ?? 'design'}]`;
  const treeEl = $('.isim-tree'), objBody = $('.isim-objs tbody'), cons = $('.isim-console'), cmdInput = $('.isim-cmdline input');
  const cn = $('.isim-names'), cw = $('.isim-waves'), vsc = $('.isim-vscroll'), hsc = $('.isim-hscroll');
  const waveArea = $('.isim-wavearea');
  const leftEl = $('.isim-left'), bottomEl = $('.isim-bottom');

  // ---------------------------------------------------------------- toolbar (isim-toolbar.js)
  const { btns, rfUnit, rfVal, stimBar } = mountToolbar({
    opts, $, addMarker: (...a) => addMarker(...a), api: () => api, breakCommands: (...a) => breakCommands(...a),
    echo: (...a) => echo(...a), enqueue: (...a) => enqueue(...a), ensureVisible: (...a) => ensureVisible(...a),
    fillStim: (...a) => fillStim(...a), jumpEdge: (...a) => jumpEdge(...a),
    logLine: (...a) => logLine(...a), radixItems: (...a) => radixItems(...a), setCursor: (...a) => setCursor(...a),
    showMenu: (...a) => showMenu(...a), sim, st,
    stimOpt, timingDialog: (...a) => timingDialog(...a), toggleStim: (...a) => toggleStim(...a),
    zoomAt: (...a) => zoomAt(...a), zoomFit: (...a) => zoomFit(...a)
  });

  // ---------------------------------------------------------------- theme colours (isim-colors.js)
  const { readColors } = mountColors({
    root, setColors: (v) => { colors = v; }
  });

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

  // ---------------------------------------------------------------- rows model and commands (isim-rows.js)
  // (made here, in mount order; the Objects panel and the forces, made below, are used when the rows change or from their menu)
  const { flat, rebuildFlat, clearBits, newRow, addSignals, instSignals, itemWave, valueOf, itemType, itemRadix, selectedItems, removeSelectedRows,
    renameDivider, radixItems, waveRowMenu } = mountRows({ st, sim, onOpenSource, updateVScroll: (...a) => updateVScroll(...a), invalidate,
    renderObjects: () => renderObjects(),
    forceDialog: (...a) => forceDialog(...a), isForced: (...a) => isForced(...a), removeForces: (...a) => removeForces(...a), openSource });

  // ---------------------------------------------------------------- view math (isim-view.js)
  const { applyFit, clampView, ensureVisible, tOf, updateHScroll, updateVScroll, xOf, zoomAt, zoomFit } = mountView({
    WH: () => WH, WW: () => WW, flat, hsc, invalidate: (...a) => invalidate(...a), measure, on, sim, st, vsc
  });

  // ---------------------------------------------------------------- rendering (isim-draw.js)
  // (the drawing made here, in mount order; the forces and the drawn stimuli, made below, are used when a frame is drawn)
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

  const { drawNames, drawWaves, setFont } = mountDraw({ st, sim, cn, cw, sizes: () => ({ dpr, NW, NH, WW, WH }), colors: () => colors,
    flat, dragRow: () => dragRow(), xOf, tOf, itemWave, valueOf, itemType, itemRadix, isForced: (...a) => isForced(...a),
    drawStim: (...a) => drawStim(...a) });

  // ---------------------------------------------------------------- status (isim-status.js)
  const { addMarker, jumpEdge, removeMarker, setCursor, setMsg, updateStatus } = mountStatus({
    $, btns, ensureVisible, invalidate, itemWave, objDirty: () => objDirty, selectedItems, sim, st,
    setObjDirty: (v) => { objDirty = v; }
  });

  // ---------------------------------------------------------------- the wave window's pointer and keys (isim-input.js)
  // (made here, in mount order; the drawn stimuli, made below, are clicked when editing is on)
  const { rowAtY, selectRow, localXY, dragRow } = mountInput({ st, sim, $, on, track, cn, cw, vsc, treeEl, objBody, flat,
    sizes: () => ({ NH, WH, WW }), layout, invalidate, rebuildFlat, updateVScroll, objectsChanged: () => { objDirty = true; }, xOf, tOf, clampView,
    zoomAt, zoomFit, itemWave, setCursor, addMarker, removeMarker, jumpEdge, selectedItems, removeSelectedRows, renameDivider, openSource,
    showMenu: (...a) => showMenu(...a), waveRowMenu, stimClick: (...a) => stimClick(...a) });

  function openSource(x) {
    if (!onOpenSource || !x) return;
    const file = x.file || x.inst?.file, line = x.loc?.line || 1;
    if (file) onOpenSource({ file, line, object: x });
  }

  // ---------------------------------------------------------------- context menu (isim-menu.js)
  // (made here, in mount order; the dialogs, made below, are closed by Escape)
  const { showMenu } = mountMenu({ cleanups, closeDialog: () => closeDialog() });

  // ---------------------------------------------------------------- instance tree (isim-tree.js)
  // (made here, in mount order; the Objects panel, made below, is drawn again when an instance is selected or added)
  const { renderTree, addInstance } = mountTree({ st, design, treeEl, onOpenSource, openSource, showMenu, renderObjects: () => renderObjects(),
    instSignals, newRow, rebuildFlat, updateVScroll, invalidate });

  // ---------------------------------------------------------------- objects list (isim-objects.js)
  // (made here, in mount order; the dialogs and the forces, made below, are used from its menu)
  const { renderObjects, updateObjectValues } = mountObjects({ st, sim, $, objBody, instSignals, addSignals, rebuildFlat, updateVScroll, invalidate,
    showMenu, forceDialog: (...a) => forceDialog(...a), isForced: (...a) => isForced(...a), removeForces: (...a) => removeForces(...a), onOpenSource, openSource });

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
    if (i >= 0) at = st.rows.indexOf(flat()[i].row);
    if (inst) { const I = findInst(inst); if (I) addInstance(I, false, at); }
    else addSignals(sigs.map(p => design.signals.find(s => s.path === p)).filter(Boolean), at);
  });

  // ---------------------------------------------------------------- path resolution, forces (isim-forces.js)
  // (made here, in mount order; logLine, made below, is called when a force is added or removed)
  const { findSignal, findInst, injectForce, isForced, addForce, removeForces } = mountForces({ st, sim, design, invalidate,
    logLine: (...a) => logLine(...a), objectsChanged: () => { objDirty = true; } });

  // ---------------------------------------------------------------- drawn stimuli (isim-stimuli.js, #336)
  // (made here, in mount order; what is made below, the dialogs, the console, the runs and api, is called when it is used)
  const { toggleStim, timingDialog, fillStim, stimClick, drawStim, runStim } = mountStimuli({ st, sim, design, stimOpt, stimInst, topSig, stimPortOf,
    stimBar, btns, layout, invalidate, rowAtY, tOf, xOf, selectRow, setFont, flat, width: () => WW, colors: () => colors,
    api: () => api, echo: (...a) => echo(...a), enqueue: (...a) => enqueue(...a), runTo: (...a) => runTo(...a), logLine: (...a) => logLine(...a),
    showDialog: (ov) => showDialog(ov), closeDialog: () => closeDialog() });

  // ---------------------------------------------------------------- dialogs (isim-dialogs.js)
  // (made here, in mount order; echo, made below, is called when a force is applied)
  const { show: showDialog, closeDialog, forceDialog } = mountDialogs({ root, sim, addForce, echo: (...a) => echo(...a) });

  // ---------------------------------------------------------------- console (isim-console.js)
  // (made here, in mount order: nothing logs before; api, made below, is read when a command runs)
  const { logLine, echo, execCommand } = mountConsole({ st, sim, design, cons, cmdInput, $, cleanups, onOpenSource, rfVal, rfUnit,
    api: () => api, enqueue: (...a) => enqueue(...a), findSignal, findInst, addSignals, addInstance, addForce, removeForces, addMarker, zoomFit, zoomAt });

  // ---------------------------------------------------------------- splitters
  function hookSplit(el, dirV, get, set) {
    on(el, 'mousedown', (e) => e.preventDefault());   // no text selection, the focus stays
    on(el, 'pointerdown', (e) => {
      if (!e.isPrimary) return;
      const p0 = dirV ? e.clientX : e.clientY, v0 = get();
      root.classList.add(dirV ? 'isim-resizing-v' : 'isim-resizing-h');
      track(el, e, (ev) => { set(v0 + ((dirV ? ev.clientX : ev.clientY) - p0)); }, () => root.classList.remove('isim-resizing-v', 'isim-resizing-h'));
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

  // ---------------------------------------------------------------- simulation control (isim-run.js)
  const { enqueue, runTo, followEnd, step: stepEvent, breakCommands, destroy: stopRuns, isDestroyed } = mountRun({ st, sim, runAllCap,
    logLine, setMsg, invalidate, setCursor, tOf, width: () => WW, applyFit, objectsChanged: () => { objDirty = true; } });

  // ---------------------------------------------------------------- public API (isim-api.js)
  const { api } = mountApi({
    opts, addSignals, applyFit, applySizes, cleanups, clearBits, closeDialog, consoleH: () => consoleH, design, draw, echo,
    execCommand, findInst, injectForce, invalidate, layout, leftW: () => leftW, logLine, needScroll: () => needScroll,
    newRow, objDirty: () => objDirty, rafId: () => rafId, readColors, rebuildFlat, renderObjects, renderTree, rfUnit,
    rfVal, root, runAllCap, runTo, setMsg, sim, st, stepEvent, stopRuns, topSig, setObjDirty: (v) => { objDirty = v; },
    setLeftW: (v) => { leftW = v; }, setConsoleH: (v) => { consoleH = v; }, setRafId: (v) => { rafId = v; },
    setNeedScroll: (v) => { needScroll = v; }
  });

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
  logLine('SSim (Silinx behavioural simulator)');
  logLine('Time resolution is 1 ps');
  logLine('Simulator is doing circuit initialization process.');
  logLine('Finished circuit initialization process.');
  requestAnimationFrame(() => layout());
  // (saved stimuli: run at once, after the first layout; runStim queues its run itself)
  if (st.stim.m) setTimeout(() => { if (!isDestroyed()) runStim(); }, 0);
  else if (opts.initialRun > 0) {
    // run after first layout so the view can follow (a command given before it waits for it, #215)
    const s = `run ${fmtTime(opts.initialRun)}`;
    echo(s);
    enqueue(s, () => new Promise((r) => setTimeout(r, 0)).then(() => api.runFor(opts.initialRun)));
  }
  return api;
}

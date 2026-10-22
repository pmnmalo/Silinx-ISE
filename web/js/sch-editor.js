// Silinx schematic editor (ISE 14.x "Schematic Editor" look). SVG, no framework.
//
//   import { mountSchEditor } from './sch-editor.js';
//   const ed = mountSchEditor(container, {
//     doc,                       // a .sch.json document (core/schdoc.js format); a new one if omitted
//     modules,                   // { name: { name, ports: [{ name, dir, width, type? }], generics: [{ name, default }] } }
//     onChange(doc) {},          // debounced, after every edit
//     onOpenModule(moduleName) {},
//   });
//   readOnly: true             // view only: pan/zoom/select/inspect, no edits (RTL schematic viewer)
//   simulate: true             // with readOnly: Simulate kept, the drawing not editable (a truth table's schematic, #946)
//   device                     // the project's part (a record of S.devices.parts): its family's Device Primitives in the
//                              // palette, their count in Symbol Info (#791); ed.setDevice(part) when it changes
//   ed.getDoc(); ed.setDoc(doc); ed.setLink(file); ed.setModules(modules); ed.fit(); ed.destroy();
//   ed.copy(); ed.cut(); ed.paste(); ed.deleteSelection(); ed.canCopy(); ed.canPaste();   // Edit menu (#677)
//
// Styles: web/css/sch-editor.css (scoped under .sch-editor, themed by the ISE variables of theme.css).

import {
  SYMBOLS, SYMBOL_CATEGORIES, GRID, defaultParams, normalizeDoc, newDoc, symbolDef, symbolPins, symbolBox, rotSize,
  portBox, portSide, turnSide, oppositeSide, netlist, generateHdl, splitWiresAt, netShort,
} from '/core/schdoc.js';
import { svgSnapshot, printDiagram } from './print.js';
import { symbolSummary, presetOf } from '/core/symdocs.js';
import { getLanguage, onLanguageChange } from './i18n.js';
import { popupMenu, undoButton, linkModel, linkSnapshot, longPressMenu, twoFingerView, dialog } from './ui.js';
import { panelToggle, PROPS_KEY, SYMBOLS_KEY } from './narrow.js';
import { rerouteAfterMove, connectivity, placementClashes, connectionsKept } from '/core/schroute.js';
import { untangleNew } from '/core/schpath.js';
import { esc, h } from './dom.js';
import { highlightHdl } from './highlight.js';
import { copySchematic, pasteSchematic, clipEmpty } from '/core/schclip.js';
import { writeClip, readClip, pasteFromKey, hasClip } from './clipboard.js';
import { mountProps } from './sch-props.js';
import { SVGNS, r1, bodySvg, symbolDrawingSvg } from './sch-svg.js';
import { mountRender } from './sch-render.js';
import { mountMove } from './sch-move.js';
import { mountTools } from './sch-tools.js';
import { primitiveResource, devicePrimitives } from '/core/primitives.js';

export const clone = o => JSON.parse(JSON.stringify(o));
export const snap = v => Math.round(v / GRID) * GRID;
export const KEYS = { sym: 'symbols', wire: 'wires', port: 'ports', label: 'labels' };


// ------------------------------------------------------------------ icons (16x16)
const I = (body) => `<svg viewBox="0 0 16 16">${body}</svg>`;
const ICON = {
  select: I('<path d="M3 1.5v12l3.2-3 2.3 5 1.8-.8-2.3-5H12z" fill="#fff" stroke="#24476f" stroke-width="1.1" stroke-linejoin="round"/>'),
  wire: I('<path d="M1.5 12.5h5v-9h8" fill="none" stroke="#0000a0" stroke-width="1.6"/><circle cx="1.5" cy="12.5" r="1.4" fill="#0000a0"/><circle cx="14.5" cy="3.5" r="1.4" fill="#0000a0"/>'),
  net: I('<path d="M1 12.5h14" stroke="#0000a0" stroke-width="1.4"/><text x="1.5" y="9.5" font-size="8" font-family="Arial" font-weight="bold" fill="#800000">abc</text>'),
  io: I('<path d="M1.5 4.5h8l4 3.5-4 3.5h-8z" fill="#fffff0" stroke="#000080" stroke-width="1.2"/>'),
  rotate: I('<path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" fill="none" stroke="#24476f" stroke-width="1.5"/><path d="M13.6 1.8v3.8H9.8z" fill="#24476f"/>'),
  mirror: I('<path d="M8 1v14" stroke="#888" stroke-dasharray="2 1.5"/><path d="M6.5 3.5v9L1.5 12.5z" fill="#9cc3ea" stroke="#24476f"/><path d="M9.5 3.5v9l5 0z" fill="#fff" stroke="#24476f"/>'),
  del: I('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#c00000" stroke-width="2.2" stroke-linecap="round"/>'),
  zin: I('<circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5M6.5 4v5" stroke="#24476f" stroke-width="1.4"/>'),
  zout: I('<circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5" stroke="#24476f" stroke-width="1.4"/>'),
  fit: I('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="#24476f" stroke-width="1.5"/><rect x="5" y="5" width="6" height="6" fill="#9cc3ea" stroke="#24476f"/>'),
  check: I('<rect x="1.5" y="1.5" width="13" height="13" rx="1" fill="#fff" stroke="#24476f"/><path d="M4 8.2l2.6 2.6L12 5" fill="none" stroke="#008000" stroke-width="2"/>'),
  sim: I('<rect x="1" y="4" width="7" height="8" rx="1.5" fill="#1f6b1f" stroke="#0d3d0d"/><rect x="4.5" y="5.5" width="2.5" height="5" rx=".6" fill="#fff"/><path d="M9 8h2.5" stroke="#00b000" stroke-width="1.6"/><circle cx="13" cy="8" r="2.4" fill="#33e033" stroke="#0d6d0d"/>'),
  info: I('<circle cx="8" cy="8" r="6.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.2"/><circle cx="8" cy="4.6" r="1.1" fill="#24476f"/><path d="M8 7v5" stroke="#24476f" stroke-width="2"/>'),
  view: I('<path d="M3 1.5h7l3 3v10H3z" fill="#fff" stroke="#24476f"/><path d="M10 1.5v3h3" fill="none" stroke="#24476f"/><text x="4.2" y="12" font-size="6.5" font-family="Consolas,monospace" font-weight="bold" fill="#000080">&lt;/&gt;</text>'),
};

export function onSeg(p, a, b, tol = 0) {
  if (a.x === b.x) return Math.abs(p.x - a.x) <= tol && p.y >= Math.min(a.y, b.y) - tol && p.y <= Math.max(a.y, b.y) + tol;
  if (a.y === b.y) return Math.abs(p.y - a.y) <= tol && p.x >= Math.min(a.x, b.x) - tol && p.x <= Math.max(a.x, b.x) + tol;
  return false;
}
export function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export function cleanPts(pts) {
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l.x !== p.x || l.y !== p.y) out.push({ x: p.x, y: p.y }); }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1], b = out[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}
const rectsTouch = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

let editorCount = 0;

// ================================================================== the editor
export function mountSchEditor(container, opts = {}) {
  const uidE = ++editorCount;
  let modules = normMods(opts.modules);
  let device = opts.device || null;     // the project's part (#791)
  let doc = normalizeDoc(opts.doc || newDoc('schematic', 'vhdl'), { modules });
  let nl = null;                      // cached netlist of the current doc
  let view = { s: 1, tx: 40, ty: 40 };
  let tool = 'select';                // select | wire | net | io | place
  let placing = null;                 // { type, params, rot, mirror }
  let sel = new Set();                // 'sym:S1' ...
  let drag = null;                    // current mouse interaction
  let wireDraw = null;                // { pts: [], first: 'h'|'v' }
  let cursor = { x: 0, y: 0 };
  let hoverPin = null;
  const undoStack = [], redoStack = [];
  let changeTimer = null;
  let destroyed = false;
  let lastDiags = null;
  let genLang = doc.lang;
  const readOnly = !!opts.readOnly;
  const canSim = !readOnly || !!opts.simulate;   // read-only blocks editing the drawing, not simulating it (#946)
  let live = null;                    // live simulation controller (web/js/sch-live.js) while simulating
  let liveStarting = false;

  container.classList.add('sch-editor');
  container.classList.toggle('read-only', readOnly);
  container.classList.toggle('ro-sim', readOnly && canSim);
  if (!container.hasAttribute('tabindex')) container.tabIndex = 0;
  container.innerHTML = '';

  // ---------------- DOM skeleton
  const tb = h('div', { class: 'se-toolbar' });
  const left = h('div', { class: 'se-left' });
  const canvas = h('div', { class: 'se-canvas' });
  const right = h('div', { class: 'se-right' });
  const status = h('div', { class: 'se-status' });
  const diagPanel = h('div', { class: 'se-diags', hidden: true });
  const simBar = h('div', { class: 'se-simbar', hidden: true });
  const main = h('div', { class: 'se-main' }, left, h('div', { class: 'se-center' }, simBar, canvas, diagPanel), right);
  container.append(tb, main, status);

  canvas.innerHTML = `<svg class="se-svg" xmlns="${SVGNS}">
    <defs>
      <pattern id="se-grid-${uidE}" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.7" class="griddot"/></pattern>
      <pattern id="se-grid2-${uidE}" width="${GRID * 5}" height="${GRID * 5}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.1" class="griddot"/></pattern>
    </defs>
    <g class="se-vp"><g class="se-sheet"></g><g class="se-content"></g><g class="se-simlayer"></g><g class="se-overlay"></g></g></svg>
    <div class="se-hint" hidden></div>`;
  const svg = canvas.querySelector('svg');
  const vp = svg.querySelector('.se-vp');
  const sheetG = svg.querySelector('.se-sheet');
  const contentG = svg.querySelector('.se-content');
  const overlayG = svg.querySelector('.se-overlay');
  const simG = svg.querySelector('.se-simlayer');
  const hint = canvas.querySelector('.se-hint');

  // ---------------- toolbar
  // moving components keeps their wires connected (re-routed), or detaches them
  let keepConn = true;
  try { keepConn = localStorage.getItem('xl.sch.keepConn') !== '0'; } catch { /* default */ }
  const keepBox = h('input', { type: 'checkbox', checked: keepConn });
  keepBox.addEventListener('change', () => { keepConn = keepBox.checked; try { localStorage.setItem('xl.sch.keepConn', keepConn ? '1' : '0'); } catch { /* ignore */ } });
  const btn = (act, icon, title) => h('button', { type: 'button', class: 'se-btn', 'data-act': act, title, html: ICON[icon] });
  const sep = () => h('span', { class: 'se-sep' });
  // Names: the name of every instance and every net drawn, the automatic ones too
  let showNames = false;
  try { showNames = localStorage.getItem('xl.sch.names') === '1'; } catch { /* default */ }
  const namesBox = h('input', { type: 'checkbox', checked: showNames });
  namesBox.addEventListener('change', () => { showNames = namesBox.checked; try { localStorage.setItem('xl.sch.names', showNames ? '1' : '0'); } catch { /* ignore */ } render(); });
  // Hop-overs (#692): a small arc where two wires cross without connecting (a view only: the nets, the HDL
  // the same)
  // hop-overs on by default (#756), off only when the user turned them off (remembered)
  let showHops = true;
  try { showHops = localStorage.getItem('xl.sch.hops') !== '0'; } catch { /* default */ }
  const hopsBox = h('input', { type: 'checkbox', checked: showHops });
  hopsBox.addEventListener('change', () => { showHops = hopsBox.checked; try { localStorage.setItem('xl.sch.hops', showHops ? '1' : '0'); } catch { /* ignore */ } render(); });
  const optBox = h('span', { class: 'se-opts' });
  tb.append(
    btn('select', 'select', 'Select (Esc)'), btn('wire', 'wire', 'Add Wire (W)'), btn('net', 'net', 'Add Net Name (N)'), btn('io', 'io', 'Add I/O Marker (O)'),
    sep(), btn('rotate', 'rotate', 'Rotate (Ctrl+R)'), btn('mirror', 'mirror', 'Mirror (Ctrl+M)'), btn('delete', 'del', 'Delete (Del)'),
    sep(), h('label', { class: 'se-keep', title: 'Moving components: keep the wires connected (re-routed around other parts) or detach them' },
      keepBox, h('span', { text: 'Keep connections' })),
    sep(), undoButton('undo', undefined, { 'data-act': 'undo' }), undoButton('redo', undefined, { 'data-act': 'redo' }),
    sep(), btn('zin', 'zin', 'Zoom In (+)'), btn('zout', 'zout', 'Zoom Out (−)'), btn('fit', 'fit', 'Zoom to Full View (F)'),
    sep(), btn('info', 'info', 'Symbol Info (F1)'),
    sep(), h('label', { class: 'se-hops', title: 'Draw a small arc where two wires cross without connecting' }, hopsBox, h('span', { text: 'Hop-overs' })),
    h('label', { class: 'se-names', title: 'Show the name of every instance and every net (the automatic ones too)' }, namesBox, h('span', { text: 'Names' })),
    h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'check', title: 'Check Schematic', html: `${ICON.check}<span>Check</span>` }),
    sep(), h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'sim', title: 'Try it: click the inputs and watch the circuit work (Esc to stop)', html: `${ICON.sim}<span>Try it</span>` }),   // (not "Simulate": the design flow's, the waves, #992)
    sep(), optBox,
    // a narrow screen (#266): the symbols and the properties over the canvas, shown by these
    h('span', { class: 'se-panels' },
      panelToggle(container, h('button', { type: 'button', class: 'se-btn wide', 'data-panel': 'symbols', title: 'Show / hide the symbols panel' }, '☰ Symbols'), { cls: 'pal-open', key: SYMBOLS_KEY }),
      panelToggle(container, h('button', { type: 'button', class: 'se-btn wide', 'data-panel': 'props', title: 'Show / hide the properties panel' }, '☰ Properties'), { key: PROPS_KEY })),
  );
  // read-only (RTL view): the editing tools are hidden, so drop the separators they leave doubled
  if (readOnly) {
    let prevSep = true;                                   // a separator at the start is not needed
    let lastSep = null;
    for (const el of tb.children) {
      if (el.classList.contains('se-keep') || el.classList.contains('se-opts') || ['wire', 'net', 'io', 'rotate', 'mirror', 'delete', 'undo', 'redo'].includes(el.dataset.act) || (el.dataset.act === 'sim' && !canSim)) continue;   // hidden by .read-only CSS
      if (el.classList.contains('se-sep')) { if (prevSep) el.style.display = 'none'; else { prevSep = true; lastSep = el; } }
      else { prevSep = false; lastSep = null; }
    }
    if (lastSep) lastSep.style.display = 'none';          // nor at the end
  }
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'sim') { if (live) leaveSim(); else enterSim(); container.focus({ preventScroll: true }); return; }
    if (a === 'info') { const t0 = infoTarget(); if (t0) openInfo(t0); return; }
    if (live && !['zin', 'zout', 'fit', 'check'].includes(a)) return;
    if (a === 'select' || a === 'wire' || a === 'net' || a === 'io') setTool(a);
    else if (a === 'rotate') rotateSel(); else if (a === 'mirror') mirrorSel(); else if (a === 'delete') deleteSel();
    else if (a === 'undo') undo(); else if (a === 'redo') redo();
    else if (a === 'zin') zoomAt(1.25); else if (a === 'zout') zoomAt(0.8); else if (a === 'fit') fit();
    else if (a === 'check') runCheck(true);
    container.focus({ preventScroll: true });
  });

  // ---------------- left: symbols palette
  const search = h('input', { type: 'search', class: 'se-search', placeholder: 'Search symbols…' });
  const catSel = h('select', { class: 'se-cat' });
  const symList = h('div', { class: 'se-symlist' });
  const symInfo = h('div', { class: 'se-syminfo' });
  left.append(h('div', { class: 'se-cap', text: 'Symbols' }), h('div', { class: 'se-lefttools' }, h('label', { text: 'Categories' }), catSel, search), symList, symInfo);
  const collapsed = new Set();
  function paletteItems() {
    const items = [];
    for (const [type, S] of Object.entries(SYMBOLS)) {
      if (type === 'module' || S.hidden) continue;
      // (a device primitive: of the project's family only, #791)
      if (S.families && !S.families.includes(device?.family)) continue;
      // parameterised symbols listed under their Xilinx-style names (D2_4E, DEMUX1_4...), then the generic one
      for (const pr of S.presets || []) items.push({ type, cat: S.category, title: pr.title, desc: pr.description || S.description, params: { ...pr.params }, preset: pr.title });
      // (the decoders and encoders by their presets only: the generic DECODER / ENCODER are the same symbols, #301)
      if (!S.presetsOnly) items.push({ type, cat: S.category, title: S.paletteTitle || S.title, desc: S.paletteDescription || S.description, params: {} });
    }
    // (the device primitives in their family's order, #791)
    const order = devicePrimitives(device?.family).map(p => p.type);
    const prims = items.filter(it => SYMBOLS[it.type].prim).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    items.forEach((it, k) => { if (SYMBOLS[it.type].prim) items[k] = prims.shift(); });
    // (not a test bench, #332: a Simulation-only source, or a module without ports, which a schematic cannot connect)
    for (const m of Object.values(modules).filter(x => !x.block && !x.testbench && x.ports?.length).sort((a, b) => a.name.localeCompare(b.name))) {
      if (m.name === doc.name) continue;
      items.push({ type: 'module', cat: 'Project modules', title: m.name, desc: `${m.ports?.length || 0} ports${m.lang ? ` · ${m.lang.toUpperCase()}` : ''}${m.file ? ` · ${m.file}` : ''}`, params: { module: m.name, generics: {} } });
    }
    return items;
  }
  function previewSvg(it) {
    const sym = { id: 'pv', type: it.type, x: 0, y: 0, rot: 0, mirror: false, name: '', params: { ...defaultParams(it.type), ...it.params } };
    const def = symbolDef(sym, modules);
    const pad = 4, W = 54, H = 34;
    const sc = Math.min(1, (W - 2 * pad) / def.w, (H - 2 * pad) / def.h);
    const ox = (W - def.w * sc) / 2, oy = (H - def.h * sc) / 2;
    return `<svg class="se-pv" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><g transform="translate(${r1(ox)},${r1(oy)}) scale(${r1(sc * 100) / 100})">${bodySvg(sym, def)}</g></svg>`;
  }
  function renderPalette() {
    const q = search.value.trim().toLowerCase();
    const cat = catSel.value;
    const items = paletteItems().filter(it => (cat === '<all>' || it.cat === cat) && (!q || `${it.title} ${it.type} ${it.desc}`.toLowerCase().includes(q)));
    symList.innerHTML = '';
    const cats = [...SYMBOL_CATEGORIES];
    for (const c of cats) {
      const its = items.filter(i => i.cat === c);
      if (!its.length && !((c === 'Project modules' || c === 'Device Primitives') && cat === c)) continue;
      const open = !collapsed.has(c) || q;
      const head = h('div', { class: `se-cathead${open ? ' open' : ''}`, text: `${c} (${its.length})`, onclick: () => { if (collapsed.has(c)) collapsed.delete(c); else collapsed.add(c); renderPalette(); } });
      symList.append(head);
      if (!open) continue;
      if (!its.length) symList.append(h('div', { class: 'se-empty', text: c === 'Device Primitives' ? 'No device primitives for this device\'s family' : 'No other modules in the project' }));
      for (const it of its) {
        const row = h('div', {
          class: `se-symrow${placing && placing.type === it.type && (placing.preset || null) === (it.preset || null) && (it.type !== 'module' || placing.params.module === it.params.module) ? ' active' : ''}`,
          draggable: 'true', title: it.desc,
          html: `${previewSvg(it)}<span class="nm" data-no-i18n>${esc(it.title)}</span>`,
        });
        row.addEventListener('click', () => { infoItem = it; startPlace(it); showSymInfo(it); });
        row.addEventListener('contextmenu', e => {
          e.preventDefault();
          infoItem = it; showSymInfo(it);
          popupMenu([{ label: 'Symbol Info…', shortcut: 'F1', action: () => openInfo(itemTarget(it)) }, ...(readOnly ? [] : [{ label: 'Place Symbol', action: () => startPlace(it) }])], e.clientX, e.clientY);
        });
        row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/x-silinx-symbol', JSON.stringify(it)); e.dataTransfer.effectAllowed = 'copy'; });
        longPressMenu(row);
        symList.append(row);
      }
    }
  }
  // the small info box under the palette: first sentence of the datasheet + More… (Symbol Info)
  let infoItem = null;
  function itemTarget(it) { return { type: it.type, params: { ...defaultParams(it.type), ...clone(it.params || {}) }, preset: it.preset || null }; }
  function showSymInfo(it) {
    symInfo.innerHTML = '';
    if (!it) return;
    const lang = getLanguage();
    const sum = it.type === 'module' ? it.desc : symbolSummary(it.type, { ...defaultParams(it.type), ...it.params }, lang, it.preset || undefined);
    const more = h('a', { href: '#', class: 'se-more', text: 'More…', title: 'Datasheet of the symbol: pins, parameters, truth table, equivalent HDL' });
    more.addEventListener('click', e => { e.preventDefault(); openInfo(itemTarget(it)); });
    symInfo.append(h('b', { 'data-no-i18n': '', text: it.title }), ': ', h('span', { class: 'se-sum', 'data-no-i18n': '', text: sum }), ' ', more);
  }
  function renderCats() {
    const cur = catSel.value || '<all>';
    catSel.innerHTML = '';
    catSel.append(h('option', { value: '<all>', text: '<--All Symbols-->' }));
    for (const c of SYMBOL_CATEGORIES) catSel.append(h('option', { value: c, text: c }));
    catSel.value = cur;
  }
  catSel.addEventListener('change', renderPalette);
  search.addEventListener('input', renderPalette);
  renderCats();

  // ---------------- right: properties
  const propBody = h('div', { class: 'se-props' });
  right.append(h('div', { class: 'se-cap', text: 'Properties' }), propBody);

  // ---------------- view transform
  function applyView() {
    vp.setAttribute('transform', `translate(${r1(view.tx)},${r1(view.ty)}) scale(${view.s})`);
    canvas.classList.toggle('se-lod', view.s < 0.45);
    updateStatus();
  }
  const toSheet = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.tx) / view.s, y: (cy - r.top - view.ty) / view.s }; };
  function zoomAt(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const ns = Math.max(0.08, Math.min(6, view.s * f));
    const k = ns / view.s;
    const px = cx - r.left, py = cy - r.top;
    view.tx = px - (px - view.tx) * k; view.ty = py - (py - view.ty) * k; view.s = ns;
    applyView();
  }
  function contentBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = b => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + (b.w || 0)); y1 = Math.max(y1, b.y + (b.h || 0)); };
    for (const s of doc.symbols) { const b = symbolBox(s, modules); add({ ...b, y: b.y - 14, h: b.h + 14 }); }
    for (const p of doc.ports) add(portBox(p));
    for (const w of doc.wires) for (const p of w.points) add(p);
    for (const l of doc.labels) add({ x: l.x, y: l.y - 12, w: 8 * l.net.length, h: 12 });
    if (!Number.isFinite(x0)) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /** Print dialog for the whole schematic (selection and editing overlays left out). */
  function print(title = 'Schematic') {
    const b = contentBounds();
    if (!b) return;
    const saved = sel;
    sel = new Set();
    render();
    let snap;
    try { snap = svgSnapshot(svg, vp, { l: b.x - 30, t: b.y - 30, r: b.x + b.w + 30, b: b.y + b.h + 30 }, ['.se-sheet', '.se-overlay > *', 'defs pattern']); } finally { sel = saved; render(); }
    printDiagram({ title, snapshot: snap, filename: title.replace(/[^\w.-]+/g, '_') });
  }
  function fit() {
    const r = svg.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    const b = contentBounds() || { x: 0, y: 0, w: doc.sheet.w, h: doc.sheet.h };
    const pad = 40;
    const s = Math.max(0.08, Math.min(2, (r.width - 2 * pad) / Math.max(1, b.w), (r.height - 2 * pad) / Math.max(1, b.h)));
    view.s = s;
    view.tx = (r.width - b.w * s) / 2 - b.x * s;
    view.ty = (r.height - b.h * s) / 2 - b.y * s;
    applyView();
  }
  function centerOn(x, y) {
    const r = svg.getBoundingClientRect();
    if (view.s < 0.8) view.s = 1;
    view.tx = r.width / 2 - x * view.s; view.ty = r.height / 2 - y * view.s;
    applyView();
  }

  // ---------------- rendering (sch-render.js)
  function refreshNetlist() { try { nl = netlist(doc, { modules }); } catch (e) { console.error(e); nl = null; } }
  const { renderSheet, render, renderOverlay, updateToolbar, updateStatus } = mountRender({
    state: () => ({ doc, nl, sel, tool, placing, drag, wireDraw, cursor, hoverPin, lastDiags, live, modules, view, destroyed, showHops, showNames }),
    refreshNetlist, uidE, readOnly, sheetG, contentG, overlayG, tb, status, undoStack, redoStack,
    routeTo: (...a) => routeTo(...a), snapPoint: (...a) => snapPoint(...a), bandRect, infoTarget });

  // ---------------- properties panel (sch-props.js)
  const { renderProps, openSelected, renamed, joinByName } = mountProps({ opts, container, propBody, readOnly, doc: () => doc, sel: () => sel, nl: () => nl,
    live: () => live, modules: () => modules, setGenLang: (v) => { genLang = v; }, edit, flash, rotateSel, mirrorSel, deleteSel, nextId, openInfo,
    infoTarget });

  // ---------------- edits, undo, change notification
  const snapshot = () => JSON.stringify(doc);
  function edit(fn, { keepProps = false } = {}) {
    if (readOnly || live) return;
    const before = snapshot();
    fn();
    doc = normalizeDoc(doc);
    if (snapshot() !== before) { pushUndo(before); changed(); }
    render();
    if (!keepProps) renderProps();
  }
  function pushUndo(before) { undoStack.push(before); if (undoStack.length > 300) undoStack.shift(); redoStack.length = 0; }
  function changed() {
    lastDiags = null;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => { if (!destroyed) opts.onChange?.(clone(doc)); }, 300);
  }
  function undo() {
    if (!undoStack.length || live) return;
    redoStack.push(snapshot());
    doc = normalizeDoc(JSON.parse(undoStack.pop()));
    pruneSel(); changed(); render(); renderProps();
  }
  function redo() {
    if (!redoStack.length || live) return;
    undoStack.push(snapshot());
    doc = normalizeDoc(JSON.parse(redoStack.pop()));
    pruneSel(); changed(); render(); renderProps();
  }
  function pruneSel() { for (const k of [...sel]) { const [kind, id] = k.split(/:(.*)/s); if (!doc[KEYS[kind]]?.some(o => o.id === id)) sel.delete(k); } }
  function nextId(prefix, arr) { let n = 0; for (const o of arr) { const m = new RegExp(`^${prefix}(\\d+)$`).exec(o.id); if (m) n = Math.max(n, +m[1]); } return `${prefix}${n + 1}`; }
  function nextInstName() {
    const used = new Set(doc.symbols.map(s => s.name));
    // (inst_n, #311; after the inst_n and the XLXI_n of a schematic drawn or imported before)
    let n = 0; for (const s of doc.symbols) { const m = /^(?:inst|XLXI)_(\d+)$/.exec(s.name); if (m) n = Math.max(n, +m[1]); }
    let nm; do nm = `inst_${++n}`; while (used.has(nm)); return nm;
  }

  // ---------------- tools (sch-tools.js)
  const { setTool, renderOpts, startPlace, placeAt, connPoints, pinNear, snapPoint, routeTo, finishWire, wireClick, netClick, ioClick } = mountTools({
    doc: () => doc, nl: () => nl, sel: () => sel, modules: () => modules, view: () => view, hoverPin: () => hoverPin, destroyed: () => destroyed,
    tool: () => tool, placing: () => placing, wireDraw: () => wireDraw,
    set: (o) => { if ('tool' in o) tool = o.tool; if ('placing' in o) placing = o.placing; if ('wireDraw' in o) wireDraw = o.wireDraw; },
    readOnly, canvas, optBox, container, edit, flash, shortNote, nextId, nextInstName, promptBox, renderPalette, render, renderOverlay, renderProps,
    updateToolbar, updateStatus, joinByName, renamed });
  // a short of two named nets refused (#754, #806): the status line says why
  function shortNote(what, [a, b]) {
    flash(`${what} would short net '${a}' and net '${b}': two named nets cannot be joined. Rename one of them first (the same name connects them).`, 6000);
  }
  // a move or a paste that shorted two named nets (#806): the document as it was before, nothing to undo
  function refusedShort(before, what) {
    const short = netShort(JSON.parse(before), doc, { modules });
    if (!short) return false;
    doc = normalizeDoc(JSON.parse(before));
    pruneSel(); render(); renderProps();
    shortNote(what, short);
    return true;
  }

  // ---------------- selection operations
  function selected(kind) { return [...sel].filter(k => k.startsWith(kind + ':')).map(k => k.slice(kind.length + 1)); }
  // (the I/O markers selected: turned around their connection point, or to the opposite side, #296)
  const turnPorts = (ids, f) => { for (const id of ids) { const p = doc.ports.find(x => x.id === id); p.side = f(portSide(p)); if (p.side === portSide({ dir: p.dir })) delete p.side; } };
  function rotateSel() {
    if (tool === 'place' && placing) { placing.rot = (placing.rot + 90) % 360; renderOverlay(); return; }
    const ids = selected('sym'), pids = selected('port');
    if (!ids.length && !pids.length) return;
    edit(() => {
      turnPorts(pids, turnSide);
      for (const id of ids) {
        const s = doc.symbols.find(x => x.id === id);
        const def = symbolDef(s, modules);
        const a = rotSize(s, def);
        const cx = s.x + a.w / 2, cy = s.y + a.h / 2;
        s.rot = (s.rot + 90) % 360;
        const b = rotSize(s, def);
        s.x = snap(cx - b.w / 2); s.y = snap(cy - b.h / 2);
      }
    });
  }
  function mirrorSel() {
    if (tool === 'place' && placing) { placing.mirror = !placing.mirror; renderOverlay(); return; }
    const ids = selected('sym'), pids = selected('port');
    if (!ids.length && !pids.length) return;
    edit(() => { turnPorts(pids, oppositeSide); for (const id of ids) { const s = doc.symbols.find(x => x.id === id); s.mirror = !s.mirror; } });
  }
  function deleteSel() {
    if (!sel.size) return;
    edit(() => {
      for (const [kind, arr] of Object.entries(KEYS)) { const ids = new Set(selected(kind)); doc[arr] = doc[arr].filter(o => !ids.has(o.id)); }
      sel.clear();
    });
  }
  // Cut / Copy / Paste (#677, core/schclip.js): the selection with the wires joining it, through the app's
  // clipboard (web/js/clipboard.js), pasted offset, selected, with fresh names
  let pasteN = 0, pasteText = null;
  function copySel(cut = false) {
    if (!sel.size || readOnly || live) return;
    const clip = copySchematic(doc, { symbols: selected('sym'), wires: selected('wire'), ports: selected('port'), labels: selected('label') }, modules);
    writeClip('schematic', clip);
    pasteText = JSON.stringify(clip); pasteN = 0;   // (pasted here: next to the original)
    if (cut) deleteSel();
  }
  async function paste(clip) {
    if (readOnly || live) return;
    clip ??= await readClip('schematic');
    if (clipEmpty(clip) || destroyed) return;
    // the same clipboard pasted again: one step further; another schematic's copy: where it was there
    const t = JSON.stringify(clip);
    if (t !== pasteText) { pasteText = t; pasteN = clip.from === doc.name ? 0 : -1; }
    const d = 40 * ++pasteN;
    if (tool !== 'select') setTool('select');
    const before = snapshot();
    edit(() => {
      const { ids } = pasteSchematic(doc, clip, { dx: d, dy: d });
      // (its wires routed clear of what was there, #948)
      try { untangleNew(JSON.parse(before), doc, { modules, prefer: ids.wires }); } catch (e) { console.error(e); }
      sel = new Set([...ids.symbols.map(id => `sym:${id}`), ...ids.wires.map(id => `wire:${id}`), ...ids.ports.map(id => `port:${id}`), ...ids.labels.map(id => `label:${id}`)]);
    });
    if (refusedShort(before, 'Pasting')) { undoStack.pop(); changed(); }
    container.focus({ preventScroll: true });
  }
  function selectAll() { sel = new Set([...doc.symbols.map(s => `sym:${s.id}`), ...doc.wires.map(w => `wire:${w.id}`), ...doc.ports.map(p => `port:${p.id}`), ...doc.labels.map(l => `label:${l.id}`)]); render(); renderProps(); }

  // ---------------- moving with rubber-banding wires, dragging one segment of a wire (#688): sch-move.js
  const { beginMove, applyMove, beginSegMove, applySegMove, finishSegMove } = mountMove({ doc: () => doc, setDoc: (d) => { doc = d; },
    modules: () => modules, keepConn: () => keepConn, selected, connPoints, snapshot, pushUndo, changed, render, renderProps, flash, nextId,
    refusedShort });
  // the selection band
  function bandRect(d = drag) { const a = d.start, b = d.cur || a; return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
  function bandSelect(add, d = drag) {
    const r = bandRect(d);
    if (!add) sel.clear();
    for (const s of doc.symbols) { const b = symbolBox(s, modules); if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) sel.add(`sym:${s.id}`); }
    for (const p of doc.ports) { const b = portBox(p); if (rectsTouch(b, r) && inside(p, r)) sel.add(`port:${p.id}`); }
    for (const w of doc.wires) if (w.points.every(p => inside(p, r))) sel.add(`wire:${w.id}`);
    for (const l of doc.labels) if (inside(l, r)) sel.add(`label:${l.id}`);
  }

  // ---------------- mouse
  const itemAt = target => { const g = target.closest?.('[data-kind]'); return g ? { kind: g.dataset.kind, id: g.dataset.id } : null; };
  let spaceDown = false;
  function onDown(e) {
    if (e.button === 2) { e.preventDefault(); if (wireDraw) finishWire(); else if (tool !== 'select') setTool('select'); return; }
    container.focus({ preventScroll: true });
    const pt = toSheet(e.clientX, e.clientY);
    cursor = pt;
    if (e.button === 1 || spaceDown) { e.preventDefault(); drag = { kind: 'pan', cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty }; canvas.classList.add('panning'); return; }
    if (e.button !== 0) return;
    // live simulation: the inputs are controls, the rest of the sheet pans
    if (live) { if (!live.pointerDown(e, itemAt(e.target))) drag = { kind: 'pan', cx: e.clientX, cy: e.clientY, tx: view.tx, ty: view.ty }; return; }
    if (tool === 'place') { placeAt(pt); return; }
    if (tool === 'wire') { wireClick(pt, e.detail >= 2); return; }
    if (tool === 'net') { netClick(pt); return; }
    if (tool === 'io') { ioClick(pt); return; }
    const it = itemAt(e.target);
    if (it) {
      // the item is drawn again below (render): without this, Safari (WebKit) sends the mousedown to
      // the removed element and moves the keyboard focus to the page, so F1, Delete, Ctrl+C… did
      // nothing after a click on a symbol (the focus stays on the editor, given above)
      e.preventDefault();
      const k = `${it.kind}:${it.id}`;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (sel.has(k)) sel.delete(k); else sel.add(k); render(); renderProps(); return; }
      const sel0 = sel;
      if (!sel.has(k)) { sel = new Set([k]); render(); renderProps(); }
      if (e.detail >= 2) return;            // handled by the dblclick listener
      // one wire, Keep connections: the segment under the pointer is dragged, the rest stays (#688)
      if (!readOnly && it.kind === 'wire' && keepConn && sel.size === 1) { const sd = beginSegMove(it.id, pt); if (sd) { drag = { ...sd, sel0 }; return; } }
      if (!readOnly) drag = { ...beginMove({ x: snap(pt.x), y: snap(pt.y) }), sel0 };
      return;
    }
    drag = { kind: 'band', start: pt, cur: pt, add: e.shiftKey || e.ctrlKey || e.metaKey };
  }
  function onMove(e) {
    if (destroyed) return;
    const pt = toSheet(e.clientX, e.clientY);
    cursor = pt;
    if (drag?.kind === 'pan') { view.tx = drag.tx + e.clientX - drag.cx; view.ty = drag.ty + e.clientY - drag.cy; applyView(); return; }
    if (drag?.kind === 'move') { applyMove(drag, snap(pt.x) - drag.start.x, snap(pt.y) - drag.start.y); return; }
    if (drag?.kind === 'seg') { applySegMove(drag, drag.hz ? snap(pt.y) - drag.start.y : snap(pt.x) - drag.start.x); return; }
    if (drag?.kind === 'band') { drag.cur = pt; renderOverlay(); return; }
    if (!svg.contains(e.target) && e.target !== svg) { live?.hideTip(); return; }
    if (live) { live.hover(e, pt, view.s); updateStatus(); return; }
    if (tool === 'wire' || tool === 'io' || tool === 'net') hoverPin = pinNear(pt); else hoverPin = null;
    if (tool !== 'select') renderOverlay();
    updateStatus();
  }
  // after a move: re-route the stretched wires so every connection is kept and none is added
  function finishMove(m) {
    // dropped with a pin on another net: nudge to the nearest clear position (up to 5 grid steps)
    if (keepConn && (m.symIds.size || m.portIds.size)) {
      const attachedIds = new Set(m.attach.map(a => a.id));
      const clash = () => placementClashes(doc, { moved: { symIds: m.symIds, portIds: m.portIds }, attachedIds, modules, guard: m.guard });
      if (clash()) {
        const bx = m.dx, by = m.dy;
        let found = false;
        for (let r = 1; r <= 5 && !found; r++) {
          for (let i = -r; i <= r && !found; i++) for (const [ox, oy] of [[i, -r], [i, r], [-r, i], [r, i]]) {
            applyMove(m, bx + ox * GRID, by + oy * GRID);
            if (!clash()) { found = true; break; }
          }
        }
        if (!found) applyMove(m, bx, by);
      }
    }
    if (keepConn && m.attach.length) {
      try { rerouteAfterMove(doc, { orig: m.orig, attached: m.attach, dx: m.dx, dy: m.dy, modules }); } catch (e) { console.error(e); }
    }
    // a free pin or marker dropped onto a wire connects there (#170): the wire split at it (#678)
    const free = [];
    for (const s of doc.symbols) if (m.symIds.has(s.id)) for (const p of symbolPins(s, modules)) if (!m.guard?.has(`${s.id}/${p.name}`)) free.push(p);
    for (const p of doc.ports) if (m.portIds.has(p.id) && !m.guard?.has(`port:${p.id}`)) free.push(p);
    const stretched = new Set([...m.wireIds, ...m.attach.map(a => a.id)]);
    splitWiresAt(doc, free, new Set(doc.wires.map(w => w.id).filter(id => !stretched.has(id))));
    // a wire the move left on another wire, over a pin or through a body routed around them (#948)
    try { untangleNew(JSON.parse(m.before), doc, { modules, prefer: [...stretched] }); } catch (e) { console.error(e); }
    doc = normalizeDoc(doc);
    if (refusedShort(m.before, 'The move')) return;
    if (keepConn && m.conn0) {
      let now = null;
      try { now = connectivity(doc, modules); } catch { /* ignore */ }
      if (now && !connectionsKept(m.conn0, now)) flash('Connections changed by this move (a pin now touches another net, or a wire could not be routed). Undo with Ctrl+Z if not intended.');
    }
    pushUndo(m.before); changed(); render(); renderProps();
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'pan') { canvas.classList.remove('panning'); return; }
    if (d.kind === 'seg') { if (d.d) finishSegMove(d); return; }
    if (d.kind === 'move') {
      if (d.dx || d.dy) finishMove(d);
      else if (d.synth?.length) { doc.wires = doc.wires.filter(w => !d.synth.includes(w.id)); render(); }   // just a click
      return;
    }
    if (d.kind === 'band') {
      const r = bandRect(d);
      if (r.w < 3 && r.h < 3) { if (!d.add) sel.clear(); }
      else bandSelect(d.add, d);
      render(); renderProps();
    }
  }
  // a second finger (#674): what the first one started undone, the selection as it was
  function cancelDrag() {
    const d = drag; drag = null;
    if (d?.kind === 'pan') canvas.classList.remove('panning');
    else if (d?.kind === 'move') {
      Object.assign(doc, d.orig, { wires: d.orig.wires.filter(w => !d.synth?.includes(w.id)) });
      if (d.sel0) sel = d.sel0;
      render(); renderProps();
    } else if (d?.kind === 'seg') {
      const w = doc.wires.find(x => x.id === d.id);
      if (w) w.points = clone(d.pts0);
      doc.labels = clone(d.labels0);
      if (d.sel0) sel = d.sel0;
      render(); renderProps();
    } else if (d?.kind === 'band') renderOverlay();
  }
  function onDouble(it) {
    if (it.kind === 'sym') {
      const s = doc.symbols.find(x => x.id === it.id);
      if (s?.type === 'module' && opts.onOpenModule) opts.onOpenModule(s.params.module, { instance: s.name, symbol: clone(s) });
      else if (s?.type === 'hdlblock') setTimeout(() => propBody.querySelector('textarea.code')?.focus(), 0);
      else setTimeout(() => propBody.querySelector('input')?.focus(), 0);
    } else setTimeout(() => propBody.querySelector('input')?.focus(), 0);
  }
  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 1 && e.deltaMode !== 0) || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)) {
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    } else {
      view.tx -= e.shiftKey ? e.deltaY : e.deltaX; view.ty -= e.shiftKey ? 0 : e.deltaY; applyView();
    }
  }
  twoFingerView(svg, { cancel: cancelDrag, pan: (dx, dy) => { view.tx += dx; view.ty += dy; applyView(); }, zoom: zoomAt });
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  svg.addEventListener('dblclick', e => {
    if (live) { e.preventDefault(); return; }
    if (tool === 'wire') { e.preventDefault(); finishWire(); return; }
    if (tool === 'select') { const it = itemAt(e.target); if (it) { e.preventDefault(); onDouble(it); } }
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('pointerleave', () => { live?.hideTip(); hoverPin = null; if (tool !== 'select') renderOverlay(); });
  // drag & drop from the palette
  canvas.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-silinx-symbol')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  canvas.addEventListener('drop', e => {
    const raw = e.dataTransfer.getData('text/x-silinx-symbol');
    if (!raw || readOnly || live) return;
    e.preventDefault();
    const it = JSON.parse(raw);
    const src = { type: it.type, params: { ...defaultParams(it.type), ...(it.params || {}) }, rot: 0, mirror: false };
    if (it.type === 'module' && modules[it.params.module]) src.params.ports = modules[it.params.module].ports.map(p => ({ name: p.name, dir: p.dir, width: p.width }));
    const prevTool = tool;
    if (tool === 'place') setTool('select');
    placeAt(toSheet(e.clientX, e.clientY), src);
    if (prevTool !== 'place') renderProps();
  });

  // ---------------- keyboard
  function onKey(e) {
    if (destroyed) return;
    if (live) {
      if (!container.contains(document.activeElement) && document.activeElement !== container && !(e.key === 'Escape' && document.activeElement === document.body && container.offsetParent)) return;
      const t0 = e.target;
      if (t0 && (t0.tagName === 'INPUT' || t0.tagName === 'TEXTAREA' || t0.tagName === 'SELECT')) return;
      const k0 = e.key.toLowerCase();
      if (k0 === 'escape') { e.preventDefault(); if (live.editing) live.closeEditor(); else leaveSim(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k0 === ' ' && !spaceDown) { spaceDown = true; canvas.classList.add('pan-ready'); e.preventDefault(); }
      else if (k0 === 'f') fit();
      else if (k0 === '+' || k0 === '=') zoomAt(1.25);
      else if (k0 === '-' || k0 === '_') zoomAt(0.8);
      return;
    }
    // Esc stops placing a symbol / drawing a wire wherever the keyboard focus is (palette, search
    // box, page), as long as this editor is on screen
    if (e.key === 'Escape' && (tool !== 'select' || wireDraw) && container.isConnected && container.offsetParent) {
      e.preventDefault();
      if (wireDraw) { if (wireDraw.pts.length > 1) finishWire(); else { wireDraw = null; renderOverlay(); } }
      else setTool('select');
      container.focus({ preventScroll: true });
      return;
    }
    if (!container.contains(document.activeElement) && document.activeElement !== container) return;
    if (e.key === 'F1') { e.preventDefault(); const t1 = infoTarget(); if (t1) openInfo(t1); return; }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (k === ' ' && !spaceDown) { spaceDown = true; canvas.classList.add('pan-ready'); e.preventDefault(); return; }
    // read-only (RTL view): Backspace = up to the parent module, Enter = push into the selected instance
    if (readOnly && k === 'backspace' && !mod) { e.preventDefault(); opts.onUp?.(); return; }
    if (readOnly && k === 'enter' && !mod) { if (openSelected()) e.preventDefault(); return; }
    if (readOnly && !(['escape', 'f', '+', '=', '-', '_'].includes(k) || (mod && (k === 'a' || k === 'c')))) return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((mod && k === 'y') || (mod && k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
    if (mod && k === 'r') { e.preventDefault(); rotateSel(); return; }
    if (mod && k === 'm') { e.preventDefault(); mirrorSel(); return; }
    if (mod && k === 'c') { e.preventDefault(); if (!readOnly) copySel(); return; }
    if (mod && k === 'x') { e.preventDefault(); copySel(true); return; }
    // (Ctrl+V: the browser's paste event below, which reads the system clipboard with no permission asked;
    // the app's own clipboard if the browser sends none)
    if (mod && k === 'v') { if (!readOnly) pasteFromKey('schematic', paste); return; }
    if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
    if (mod) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); return; }
    if (k === 'escape') {
      if (wireDraw) { if (wireDraw.pts.length > 1) finishWire(); else { wireDraw = null; renderOverlay(); } return; }
      if (tool !== 'select') { setTool('select'); return; }
      sel.clear(); render(); renderProps(); return;
    }
    if (k === 'w') setTool('wire');
    else if (k === 'n') setTool('net');
    else if (k === 'o') setTool('io');
    else if (k === 's' && tool !== 'select') setTool('select');
    else if (k === 'f') fit();
    else if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-' || k === '_') zoomAt(0.8);
    else if (k.startsWith('arrow') && sel.size) {
      e.preventDefault();
      const d = (e.shiftKey ? 5 : 1) * GRID;
      const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
      const m = beginMove({ x: 0, y: 0 });
      applyMove(m, dx, dy);
      finishMove(m);
    }
  }
  function onKeyUp(e) { if (e.key === ' ') { spaceDown = false; canvas.classList.remove('pan-ready'); } }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  // ---------------- check / generate / view
  function runCheck(show) {
    refreshNetlist();
    const extra = [];
    try {
      const g = generateHdl(doc, { lang: genLang, modules });
      for (const d of g.diagnostics) if (!nl.diagnostics.some(x => x.message === d.message)) extra.push(d);
    } catch (err) { extra.push({ severity: 'error', message: `HDL generation failed: ${err.message}` }); }
    lastDiags = [...nl.diagnostics, ...extra];
    if (show) showDiags();
    updateStatus();
    return lastDiags;
  }

  // ---------------- live simulation (Logisim style): web/js/sch-live.js on core/schlive.js
  const toCanvas = pt => ({ x: pt.x * view.s + view.tx, y: pt.y * view.s + view.ty });
  async function enterSim() {
    if (live || liveStarting || !canSim || destroyed) return;
    if (wireDraw) finishWire();
    if (tool !== 'select') setTool('select');
    liveStarting = true;
    flash('Building the circuit\'s model…');
    try {
      const [{ startLiveSim }, sources] = await Promise.all([import('./sch-live.js'), Promise.resolve(opts.simSources ? opts.simSources() : [])]);
      if (destroyed || live) return;
      const res = startLiveSim({
        doc: clone(doc), modules, sources: sources || [], lang: opts.simLang || genLang, h,
        layer: simG, content: contentG, bar: simBar, canvas, toCanvas, onExit: leaveSim,
      });
      if (!res.ok) {
        lastDiags = res.diagnostics?.length ? res.diagnostics : res.errors.map(message => ({ severity: 'error', message }));
        showDiags('Cannot try it out');
        flash(`Cannot try it out: ${res.errors[0]}`);
        updateStatus();
        return;
      }
      live = res.ctl;
      sel.clear();
      diagPanel.hidden = true;
      hint.hidden = true;
      container.classList.add('sim-mode');
      render(); renderProps();
      opts.onSimulate?.(true);
    } catch (err) {
      console.error(err);
      flash(`Cannot try it out: ${err.message}`);
    } finally { liveStarting = false; }
  }
  function leaveSim() {
    if (!live) return;
    live.destroy();
    live = null;
    container.classList.remove('sim-mode');
    render(); renderProps();
    opts.onSimulate?.(false);
    container.focus({ preventScroll: true });
  }
  function showDiags(what = 'Check Schematic') {
    if (!container.dispatchEvent(new CustomEvent('silinx-diagnostics', { bubbles: true, cancelable: true, detail: { what, name: doc.name, diags: lastDiags, focus: focusDiag } }))) { diagPanel.hidden = true; return; }   // (in the console below: the Tasks interface's, web/js/tasks-check.js, #993)
    diagPanel.hidden = false; diagPanel.innerHTML = '';
    const errs = lastDiags.filter(d => d.severity === 'error').length, warns = lastDiags.filter(d => d.severity === 'warning').length;
    const head = h('div', { class: 'se-cap' }, h('span', { text: `${what}: ${errs} error(s), ${warns} warning(s)` }), h('span', { class: 'sp' }), h('button', { type: 'button', class: 'se-x', title: 'Close', text: '×', onclick: () => { diagPanel.hidden = true; } }));
    const list = h('div', { class: 'se-dlist' });
    if (!lastDiags.length) list.append(h('div', { class: 'se-drow ok', text: 'No errors or warnings found.' }));
    for (const d of lastDiags) {
      const row = h('div', { class: `se-drow ${d.severity}` }, h('span', { class: 'sev', text: d.severity === 'error' ? 'ERROR' : d.severity === 'warning' ? 'WARNING' : 'INFO' }), h('span', { text: d.message }));
      row.addEventListener('click', () => focusDiag(d));
      list.append(row);
    }
    diagPanel.append(head, list);
  }
  function focusDiag(d) {
    const r = d.ref || {};
    const k = r.kind === 'symbol' ? 'sym' : r.kind;
    if (k && KEYS[k] && r.id && doc[KEYS[k]].some(o => o.id === r.id)) sel = new Set([`${k}:${r.id}`]);
    let x = d.x, y = d.y;
    if (x == null && r.kind === 'symbol') { const s = doc.symbols.find(o => o.id === r.id); if (s) { const b = symbolBox(s, modules); x = b.x + b.w / 2; y = b.y + b.h / 2; } }
    if (x == null && r.kind === 'port') { const p = doc.ports.find(o => o.id === r.id); if (p) { x = p.x; y = p.y; } }
    if (x == null && d.net && nl) { const n = nl.nets.find(q => q.name === d.net); const w = n && doc.wires.find(q => q.id === n.wires[0]); if (w) { x = w.points[0].x; y = w.points[0].y; } }
    if (x != null) centerOn(x, y);
    render(); renderProps();
  }
  // ---------------- Symbol Info (datasheet of the selected / palette symbol): web/js/symbol-info.js
  let infoDlg = null;
  // the symbol the Symbol Info action is about: the selected symbol, else the one being placed / last picked in the palette
  function infoTarget() {
    const ids = selected('sym');
    if (ids.length === 1 && sel.size === 1) {
      const s = doc.symbols.find(x => x.id === ids[0]);
      if (s) return { type: s.type, params: clone(s.params), hdl: s.hdl, preset: presetOf(s.type, s.params) };
    }
    if (tool === 'place' && placing) return { type: placing.type, params: clone(placing.params), preset: placing.preset };
    return infoItem ? itemTarget(infoItem) : null;
  }
  async function openInfo(target) {
    if (!target || destroyed) return null;
    const { openSymbolInfo } = await import('./symbol-info.js');
    if (destroyed) return null;
    infoDlg?.close();
    infoDlg = openSymbolInfo({
      container, ...target, modules, lang: genLang, highlight: highlightHdl, ...primUse(target),
      draw: (sym, def) => symbolDrawingSvg(sym, def),
      onClose: () => { infoDlg = null; if (container.isConnected) container.focus({ preventScroll: true }); },
    });
    return infoDlg;
  }
  // a device primitive's Symbol Info (#791): the project's part, and how many of the schematic's symbols take the
  // same resource
  function primUse(target) {
    if (!SYMBOLS[target?.type]?.prim || !device) return {};
    const id = primitiveResource(target.type, device.family, target.params);
    return { part: device, used: id ? doc.symbols.filter(s => SYMBOLS[s.type]?.prim && primitiveResource(s.type, device.family, s.params) === id).length : null };
  }
  const offLang = onLanguageChange(() => { if (infoItem) showSymInfo(infoItem); if (!live) renderProps(); });


  // ---------------- small UI helpers
  let flashTimer = null;
  function flash(msg, ms = 1800) {
    hint.textContent = msg; hint.hidden = false;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => { hint.hidden = true; }, ms);
  }
  function promptBox(pt, label, value) {
    return new Promise(resolve => {
      const r = svg.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const x = Math.min(cr.width - 220, Math.max(4, pt.x * view.s + view.tx + (r.left - cr.left) + 8));
      const y = Math.min(cr.height - 60, Math.max(4, pt.y * view.s + view.ty + (r.top - cr.top) + 8));
      const input = h('input', { type: 'text', value: value || '' });
      const box = h('div', { class: 'se-prompt', style: `left:${x}px;top:${y}px` }, h('label', { text: label }), input);
      let done = false;
      const end = v => { if (done) return; done = true; box.remove(); container.focus({ preventScroll: true }); resolve(v); };
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') end(input.value.trim() || null); else if (e.key === 'Escape') end(null); });
      input.addEventListener('blur', () => setTimeout(() => end(input.value.trim() || null), 0));
      canvas.append(box);
      setTimeout(() => { input.focus(); input.select(); }, 0);
    });
  }

  // ---------------- resize
  let ro = null;
  let fitted = false;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { if (!fitted) { const r = svg.getBoundingClientRect(); if (r.width > 20 && r.height > 20) { fitted = true; fit(); } } });
    ro.observe(canvas);
  }

  // ---------------- init
  renderSheet();
  renderPalette();
  renderOpts();
  render();
  renderProps();
  setTimeout(() => { if (!fitted) { fitted = true; fit(); } }, 0);

  function normMods(m) {
    const out = {};
    if (!m) return out;
    for (const x of Array.isArray(m) ? m : Object.values(m)) if (x && x.name) out[x.name] = x;
    return out;
  }

  return {
    getDoc: () => clone(normalizeDoc(doc)),
    undo: () => undo(), redo: () => redo(),
    canUndo: () => undoStack.length > 0 && !live, canRedo: () => redoStack.length > 0 && !live,
    // Edit ▸ Cut / Copy / Paste / Delete (#677)
    copy: () => copySel(), cut: () => copySel(true), paste: () => paste(), deleteSelection: () => { if (!live) deleteSel(); },
    canCopy: () => !readOnly && !live && sel.size > 0, canPaste: () => !readOnly && !live && hasClip('schematic'),
    setDoc(d) { leaveSim(); infoDlg?.close(); doc = normalizeDoc(d || newDoc(), { modules }); undoStack.length = 0; redoStack.length = 0; sel.clear(); lastDiags = null; genLang = doc.lang; diagPanel.hidden = true; renderSheet(); renderPalette(); render(); renderProps(); fit(); },
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) {
      linkModel(doc, file);
      for (const st of [undoStack, redoStack]) st.forEach((s, i) => { st[i] = linkSnapshot(s, file); });
    },
    // (called after every compile of the project: the same modules again change nothing, so that the palette and
    // the properties are not made anew between the press and the release of a click on them, #339)
    /** The project's part changed (Design Properties): the palette's Device Primitives follow its family (#791). */
    setDevice(part) {
      if ((part?.part || null) === (device?.part || null)) return;
      device = part || null;
      renderPalette();
    },
    setModules(m) {
      const next = normMods(m);
      if (!live && JSON.stringify(next) === JSON.stringify(modules)) return;
      leaveSim(); modules = next;
      // (a document of version 2 with module symbols, converted once their pins are known, #678)
      if (+doc.version < 3) doc = normalizeDoc(doc, { modules });
      renderPalette(); render(); renderProps();
    },
    check: () => runCheck(true),
    openSelected,
    fit,
    print,
    simulate: enterSim,
    stopSimulation: leaveSim,
    get simulating() { return !!live; },
    get liveSim() { return live?.live || null; },
    /** Open the Symbol Info datasheet ({ type, params, preset } or the current target); resolves to the dialog. */
    symbolInfo: target => openInfo(target || infoTarget()),
    get symbolInfoDialog() { return infoDlg; },
    destroy() {
      infoDlg?.close(); offLang();
      live?.destroy(); live = null;
      destroyed = true;
      clearTimeout(changeTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      ro?.disconnect();
      container.innerHTML = '';
      container.classList.remove('sch-editor');
    },
  };
}

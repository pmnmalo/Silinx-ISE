// Silinx - View Implemented Design (FPGA): the design as ISE placed and routed it inside the chip.
//
// The device is drawn as its grid of tiles (logic blocks, I/O pads around the edge, block RAMs,
// multipliers, clock buffers, DCMs); the used sites are coloured by the module of the design they
// implement. Click a site to see its logic (LUT equations with the names of their input signals,
// flip-flops, carry logic, I/O standard…) and its connections; pick a net to see what it links and
// the tiles its routing goes through; the clock network on its own. Selecting a module here selects
// it in the Design hierarchy, and the other way round.
//
//   const v = mountFpgaView(el, { model, top, entities, onSelectModule });   // model: core/xdl.js fpgaModel
//   v.highlightModule('Inst_data' | null); v.select(instIndex); v.showNet(netIndex); v.destroy();
// Styles: web/css/fpgaview.css.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };
const TW = 28, TH = 28;   // a tile
// distinct colours for the modules (hues spread around the wheel, then lighter / darker)
const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#86bcb6',
  '#d37295', '#a0cbe8', '#8cd17d', '#ffbe7d', '#f1ce63', '#499894', '#bab0ac', '#d4a6c8', '#fabfd2', '#79706e'];
const TOP_COLOR = '#8a94a6';
const isSlice = t => /^SLICE/.test(t);
const isIo = t => /^(IOB|IBUF|DIFF[MS]I?|IOBM|IOBS)$/.test(t);
const siteXY = name => { const m = /_X(\d+)Y(\d+)$/.exec(name); return m ? [+m[1], +m[2]] : null; };

/** Geometry of every site of the device: { name -> { x, y, w, h, type, bonded, tile } }. */
export function layoutSites(device) {
  const out = new Map();
  for (const [r, c, tname, ttype, sites] of device.tiles) {
    const x0 = c * TW, y0 = r * TH;
    const slices = sites.filter(s => isSlice(s[1]));
    if (slices.length === 4 || slices.length === 2) {
      // a CLB: its slices by the parity of their X / Y (Y up), 2 x 2
      const sz = (TW - 6) / 2;
      for (const [name, type, bonded] of slices) {
        const [sx, sy] = siteXY(name) || [0, 0];
        const col = sx % 2, row = slices.length === 4 ? 1 - (sy % 2) : 0;
        out.set(name, { x: x0 + 2 + col * (sz + 2), y: y0 + 2 + row * (sz + 2) + (slices.length === 2 ? sz / 2 : 0), w: sz, h: sz, type, bonded: !!bonded, tile: tname });
      }
    }
    const rest = sites.filter(s => !slices.includes(s) || !(slices.length === 4 || slices.length === 2));
    if (!rest.length) continue;
    const vertical = c === 0 || c === device.cols - 1 || c <= 1 || c >= device.cols - 2;
    const n = rest.length;
    rest.forEach(([name, type, bonded], k) => {
      let g;
      if (/^RAMB/.test(type)) g = { x: x0 + 2, y: y0 + 2, w: TW - 4, h: (TH - 6) * 0.6 };
      else if (/^(MULT|DSP)/.test(type)) g = { x: x0 + 2, y: y0 + 4 + (TH - 6) * 0.6, w: TW - 4, h: (TH - 6) * 0.4 };
      else if (vertical) { const hh = (TH - 4) / n; g = { x: x0 + 6, y: y0 + 2 + k * hh, w: TW - 12, h: Math.max(2, hh - 1.5) }; }
      else { const ww = (TW - 4) / n; g = { x: x0 + 2 + k * ww, y: y0 + 6, w: Math.max(2, ww - 1.5), h: TH - 12 }; }
      out.set(name, { ...g, type, bonded: !!bonded, tile: tname });
    });
  }
  return out;
}

/** The module key of a hierarchy path at a level (1 = the top's instances): 'Inst_data/u1' at 1 -> 'Inst_data'. */
export const moduleAt = (path, level) => (path ? path.split('/').slice(0, level).join('/') : '');

export function mountFpgaView(el, { model, top = '', entities = new Map(), onSelectModule = () => {}, stale = false } = {}) {
  const geo = layoutSites(model.device);
  const tilePos = new Map(model.device.tiles.map(([r, c, name]) => [name, [c * TW + TW / 2, r * TH + TH / 2]]));
  const W = model.device.cols * TW, H = model.device.rows * TH;
  const maxLevel = Math.max(1, ...model.insts.map(i => (i.module ? i.module.split('/').length : 0)));
  let level = 1, selInst = -1, selNet = -1, hlModule = null, showClocks = false;

  // ------------------------------------------------------------------ DOM
  const root = h('div', { class: 'fv' });
  el.append(root);
  const levelSel = h('select', { title: 'Colour the sites by the modules of this hierarchy level', onchange: e => { level = +e.target.value; paint(); legend(); } },
    ...Array.from({ length: maxLevel }, (_, k) => h('option', { value: k + 1 }, k === 0 ? 'Top-level modules' : `Hierarchy level ${k + 1}`)));
  const clockBtn = h('button', { class: 'btn', title: 'Show the global clock nets: the clock buffers and every flip-flop they drive', onclick: () => { showClocks = !showClocks; clockBtn.classList.toggle('on', showClocks); overlay(); } }, 'Clock network');
  const netSearch = h('input', { type: 'search', class: 'fv-search', placeholder: 'Find a net or a site…', oninput: () => netList() });
  const info = h('span', { class: 'fv-info' });
  root.append(h('div', { class: 'doc-toolbar fv-bar' },
    h('button', { class: 'btn', title: 'Zoom to the whole chip', onclick: () => fit() }, 'Fit'),
    h('button', { class: 'btn', title: 'Zoom in', onclick: () => zoom(1.4) }, '+'),
    h('button', { class: 'btn', title: 'Zoom out', onclick: () => zoom(1 / 1.4) }, '−'),
    h('span', { class: 'fv-sep' }), 'Colour by:', levelSel, clockBtn, h('span', { class: 'fv-sep' }), info));
  if (stale) root.append(h('div', { class: 'fv-stale' }, 'The sources changed since this implementation: run Implement Design again to see the new one.'));
  const svg = S('svg', { class: 'fv-svg', 'aria-label': 'FPGA', role: 'img' });
  const canvas = h('div', { class: 'fv-canvas' }, svg);
  const tip = h('div', { class: 'fv-tip', hidden: true, 'data-no-i18n': '' });
  canvas.append(tip);
  const side = h('div', { class: 'fv-side' });
  root.append(h('div', { class: 'fv-main' }, canvas, side));

  // ------------------------------------------------------------------ chip
  const gTiles = S('g', { class: 'fv-tiles' }), gFree = S('g', { class: 'fv-free' }), gUsed = S('g', { class: 'fv-used' }), gOver = S('g', { class: 'fv-over' });
  svg.append(S('rect', { x: -TW, y: -TH, width: W + 2 * TW, height: H + 2 * TH, class: 'fv-die' }), gTiles, gFree, gUsed, gOver);
  // tiles: one path per kind (logic, I/O, memory / DSP, clock) - thousands of rectangles in a few elements
  const tilePath = { clb: '', io: '', mem: '', clk: '' };
  for (const [r, c, , , sites] of model.device.tiles) {
    const k = sites.some(s => isSlice(s[1])) ? 'clb' : sites.some(s => isIo(s[1])) ? 'io' : sites.some(s => /^(RAMB|MULT|DSP)/.test(s[1])) ? 'mem' : 'clk';
    tilePath[k] += `M${c * TW + 0.5} ${r * TH + 0.5}h${TW - 1}v${TH - 1}h${-(TW - 1)}z`;
  }
  for (const [k, d] of Object.entries(tilePath)) if (d) gTiles.append(S('path', { d, class: `fv-tile fv-tile-${k}` }));
  // free sites (one path) and used sites (one rectangle each)
  const usedSites = new Set(model.insts.filter(i => i.placed).map(i => i.site));
  let free = '';
  for (const [name, g] of geo) if (!usedSites.has(name) && (g.bonded || !isIo(g.type))) free += `M${g.x} ${g.y}h${g.w}v${g.h}h${-g.w}z`;
  gFree.append(S('path', { d: free, class: 'fv-site-free' }));
  const rects = [];
  model.insts.forEach((inst, i) => {
    const g = inst.placed && geo.get(inst.site);
    if (!g) return;
    const r = S('rect', { x: g.x, y: g.y, width: g.w, height: g.h, class: `fv-site ${isIo(inst.type) ? 'fv-io' : ''}`, 'data-i': i });
    rects[i] = r;
    gUsed.append(r);
  });
  const centre = i => { const g = geo.get(model.insts[i]?.site); return g ? [g.x + g.w / 2, g.y + g.h / 2] : null; };

  // ------------------------------------------------------------------ colours, legend
  const colorOf = new Map();
  function modulesAtLevel() {
    const count = new Map();
    model.insts.forEach((inst, i) => { if (rects[i]) { const k = moduleAt(inst.module, level); count.set(k, (count.get(k) || 0) + 1); } });
    return [...count.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : b[1] - a[1] || a[0].localeCompare(b[0])));
  }
  function paint() {
    colorOf.clear();
    modulesAtLevel().forEach(([k], n) => colorOf.set(k, k === '' ? TOP_COLOR : PALETTE[n % PALETTE.length]));
    model.insts.forEach((inst, i) => { if (rects[i]) rects[i].style.fill = colorOf.get(moduleAt(inst.module, level)); });
    highlight();
  }
  const entityOf = path => entities.get(String(path).toLowerCase()) || null;
  const moduleLabel = k => (k === '' ? `${top || 'top'} (top level)` : `${k}${entityOf(k) ? ` — ${entityOf(k)}` : ''}`);
  const sec = (title, ...kids) => h('div', { class: 'fv-sec' }, h('h4', {}, title), ...kids);
  const legendBox = h('div', { class: 'fv-legend' });
  function legend() {
    legendBox.innerHTML = '';
    for (const [k, n] of modulesAtLevel()) {
      const row = h('div', { class: `fv-mod${hlModule !== null && moduleAt(hlModule, level) === k ? ' sel' : ''}`, title: 'Show this module on the chip and in the Design hierarchy', tabindex: '0', role: 'button' },
        h('span', { class: 'fv-swatch', style: { background: colorOf.get(k) } }), h('span', { class: 'fv-mod-name', 'data-no-i18n': '' }, moduleLabel(k)), h('span', { class: 'fv-mod-n' }, String(n)));
      const pick = () => { const same = hlModule === k; highlightModule(same ? null : k); onSelectModule(same ? null : k); };
      row.addEventListener('click', pick);
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      legendBox.append(row);
    }
  }
  // dim everything outside the highlighted module (and its submodules)
  function highlight() {
    svg.classList.toggle('fv-dim', hlModule !== null);
    model.insts.forEach((inst, i) => {
      if (!rects[i]) return;
      const inMod = hlModule !== null && (hlModule === '' ? !inst.module : inst.module === hlModule || inst.module.startsWith(`${hlModule}/`));
      rects[i].classList.toggle('hl', inMod);
      rects[i].classList.toggle('sel', i === selInst);
    });
    legendBox.querySelectorAll('.fv-mod').forEach((r, n) => r.classList.toggle('sel', hlModule !== null && modulesAtLevel()[n]?.[0] === moduleAt(hlModule, level)));
  }
  function highlightModule(path) {
    hlModule = path === null || path === undefined ? null : String(path);
    // a hierarchy path from the Design panel may differ in case from XST's names
    if (hlModule) {
      const known = [...new Set(model.insts.map(i => i.module))].find(m => m.toLowerCase() === hlModule.toLowerCase() || m.toLowerCase().startsWith(`${hlModule.toLowerCase()}/`));
      if (known) hlModule = known.slice(0, hlModule.length);
    }
    highlight();
    status();
  }

  // ------------------------------------------------------------------ utilisation, selection, nets (side panel)
  const util = h('table', { class: 'fv-util' }, ...Object.entries(model.util).filter(([, u]) => u.total).map(([k, u]) => h('tr', {},
    h('td', {}, k), h('td', { class: 'num' }, `${u.used} / ${u.total}`),
    h('td', {}, h('div', { class: 'fv-bar-u' }, h('div', { style: { width: `${Math.min(100, (100 * u.used) / u.total)}%` } }))))));
  const selBox = h('div', { class: 'fv-detail' }, h('div', { class: 'fv-hint' }, 'Click a site on the chip to see its logic and connections.'));
  const netsBox = h('div', { class: 'fv-nets' });
  side.append(
    sec('Device', h('div', { class: 'fv-dev', 'data-no-i18n': '' }, `${model.device.part || model.design.part} · ${model.design.name || top}`), util),
    sec('Modules', legendBox),
    sec('Selection', selBox),
    sec('Nets', netSearch, netsBox),
  );
  const netLink = (ni, label) => {
    const n = model.nets[ni];
    if (!n) return h('span', {}, '—');
    return h('a', { class: `fv-net fv-k-${n.kind}`, href: '#', 'data-no-i18n': '', onclick: e => { e.preventDefault(); showNet(ni); } }, label || n.name);
  };
  const instLink = (i, label) => h('a', { href: '#', 'data-no-i18n': '', onclick: e => { e.preventDefault(); select(i, { center: true }); } }, label || model.insts[i].site || model.insts[i].name);
  // names inside the selected site's module without its path: 'Inst_data/s_acc1' -> 's_acc1'
  const short = t => { const m = model.insts[selInst]?.module; return m ? String(t).split(`${m}/`).join('') : t; };
  const kv = (k, v) => h('tr', {}, h('th', {}, k), h('td', {}, v));
  const mono = t => h('span', { class: 'fv-mono', 'data-no-i18n': '' }, t);
  function details() {
    selBox.innerHTML = '';
    if (selInst < 0) { selBox.append(h('div', { class: 'fv-hint' }, 'Click a site on the chip to see its logic and connections.')); return; }
    const inst = model.insts[selInst];
    const tbl = h('table', { class: 'fv-kv' },
      kv('Site', mono(`${inst.site} (${inst.type})`)),
      kv('Tile', mono(inst.tile || '—')),
      kv('Module', inst.module || !isIo(inst.type)
        ? h('a', { href: '#', 'data-no-i18n': '', onclick: e => { e.preventDefault(); highlightModule(inst.module); onSelectModule(inst.module); } }, moduleLabel(inst.module))
        : h('span', { 'data-no-i18n': '' }, moduleLabel(''))));
    selBox.append(tbl);
    if (inst.io) {
      selBox.append(h('table', { class: 'fv-kv' },
        kv('Port', mono(inst.name)), kv('Package pin', mono(inst.io.pad)), kv('Direction', inst.io.dir === 'in' ? 'input' : inst.io.dir === 'out' ? 'output' : 'bidirectional'),
        inst.io.standard ? kv('I/O standard', mono(inst.io.standard)) : null, inst.io.drive ? kv('Drive', mono(`${inst.io.drive} mA`)) : null,
        inst.io.slew ? kv('Slew rate', mono(inst.io.slew)) : null, inst.io.pull ? kv('Pull', mono(inst.io.pull)) : null));
    }
    const luts = inst.cells.filter(c => c.kind === 'lut' || c.kind === 'ram' || c.kind === 'rom');
    if (luts.length) {
      selBox.append(h('h5', {}, 'Look-up tables (LUTs)'));
      for (const c of luts) selBox.append(h('div', { class: 'fv-cell' },
        h('div', { class: 'fv-cell-h' }, h('b', {}, `${c.bel} `), mono(c.name)),
        c.kind === 'lut' ? h('div', { class: 'fv-eq', 'data-no-i18n': '', title: 'Signal names without the module path' }, `= ${short(c.text || c.eq)}`) : h('div', { class: 'fv-hint' }, c.kind === 'ram' ? 'used as distributed RAM' : 'used as ROM'),
        c.inputs && Object.keys(c.inputs).length ? h('div', { class: 'fv-ins' }, ...Object.entries(c.inputs).map(([a, n]) => h('span', {}, mono(`${a}: `), netLink(inst.pins[`${c.bel.length === 1 ? c.bel : c.bel[0]}${a.slice(1)}`] ?? model.nets.findIndex(x => x.name === n), n)))) : null));
    }
    const ffs = inst.cells.filter(c => c.kind === 'ff' || c.kind === 'latch');
    if (ffs.length) {
      selBox.append(h('h5', {}, 'Flip-flops'));
      const o = inst.opt;
      for (const c of ffs) {
        const init = o[`${c.bel}_INIT_ATTR`];
        const sr = o[`${c.bel}_SR_ATTR`];
        selBox.append(h('div', { class: 'fv-cell' },
          h('div', { class: 'fv-cell-h' }, h('b', {}, `${c.bel} `), mono(c.name), c.kind === 'latch' ? ' (latch)' : ''),
          h('div', { class: 'fv-ins' },
            inst.pins.CLK !== undefined ? h('span', {}, 'clock ', netLink(inst.pins.CLK)) : null,
            inst.pins.CE !== undefined ? h('span', {}, 'enable ', netLink(inst.pins.CE)) : null,
            inst.pins.SR !== undefined ? h('span', {}, `${o.SYNC_ATTR === 'SYNC' ? 'synchronous' : 'asynchronous'} ${sr === 'SRHIGH' ? 'set' : 'reset'} `, netLink(inst.pins.SR)) : null,
            init ? h('span', {}, `initial value ${init === 'INIT1' ? '1' : '0'}`) : null)));
      }
    }
    const other = inst.cells.filter(c => !['lut', 'ram', 'rom', 'ff', 'latch'].includes(c.kind));
    if (other.length) {
      selBox.append(h('h5', {}, 'Other elements'));
      const what = { carry: 'carry chain', mux: 'multiplexer', inbuf: 'input buffer', outbuf: 'output buffer', bufg: 'global clock buffer', ramb: 'block RAM', mult: 'multiplier', dsp: 'DSP block', iff: 'input flip-flop', off: 'output flip-flop', tff: '3-state flip-flop', dcm: 'clock manager (DCM)', gclkmux: 'global clock multiplexer' };
      for (const c of other) selBox.append(h('div', { class: 'fv-cell-h' }, h('b', {}, `${c.bel} `), mono(c.name), h('span', { class: 'fv-hint' }, ` ${what[c.kind] || c.kind}`)));
    }
    const pins = Object.entries(inst.pins).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
    if (pins.length) {
      selBox.append(h('h5', {}, 'Connections'));
      selBox.append(h('table', { class: 'fv-kv fv-pins' }, ...pins.map(([p, ni]) => kv(mono(p), netLink(ni)))));
    }
  }
  function netList() {
    const q = netSearch.value.trim().toLowerCase();
    netsBox.innerHTML = '';
    const order = { clock: 0, signal: 1, power: 2 };
    const list = model.nets.map((n, i) => [n, i]).filter(([n]) => n.kind !== 'power' || q).filter(([n]) => !q || n.name.toLowerCase().includes(q))
      .sort((a, b) => order[a[0].kind] - order[b[0].kind] || a[0].name.localeCompare(b[0].name, undefined, { numeric: true }));
    for (const [n, i] of list.slice(0, 300)) netsBox.append(h('div', { class: `fv-netrow${i === selNet ? ' sel' : ''}` }, netLink(i), h('span', { class: 'fv-hint' }, n.kind === 'clock' ? ` clock · ${n.loads.length}` : ` ${n.loads.length}`)));
    if (list.length > 300) netsBox.append(h('div', { class: 'fv-hint' }, `… ${list.length - 300} more: type part of the name`));
    // sites by name too
    if (q) for (const [inst, i] of model.insts.map((x, k) => [x, k]).filter(([x]) => x.placed && (x.site.toLowerCase() === q || x.name.toLowerCase() === q)).slice(0, 5))
      netsBox.prepend(h('div', { class: 'fv-netrow' }, instLink(i, `${inst.site} — ${inst.name}`)));
    if (!netsBox.childElementCount) netsBox.append(h('div', { class: 'fv-hint' }, 'No net matches.'));
  }

  // ------------------------------------------------------------------ connections drawn on the chip
  function drawNet(ni, cls) {
    const n = model.nets[ni];
    if (!n) return;
    const g = S('g', { class: `fv-netg ${cls}` });
    // the tiles the routing goes through (its switches)
    for (const t of n.tiles) { const p = tilePos.get(t); if (p) g.append(S('rect', { x: p[0] - TW / 2 + 1, y: p[1] - TH / 2 + 1, width: TW - 2, height: TH - 2, class: 'fv-route' })); }
    const a = n.driver && centre(n.driver[0]);
    for (const [k] of n.loads) {
      const b = centre(k);
      if (a && b) g.append(S('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'fv-wire' }));
      if (b) g.append(S('circle', { cx: b[0], cy: b[1], r: 2.2, class: 'fv-load' }));
    }
    if (a) g.append(S('circle', { cx: a[0], cy: a[1], r: 3.2, class: 'fv-drv' }));
    gOver.append(g);
  }
  function overlay() {
    gOver.innerHTML = '';
    if (showClocks) model.nets.forEach((n, i) => { if (n.kind === 'clock') drawNet(i, 'fv-clock'); });
    if (selInst >= 0 && selNet < 0) for (const ni of new Set(Object.values(model.insts[selInst].pins))) if (model.nets[ni]?.kind !== 'power' && (!showClocks || model.nets[ni].kind !== 'clock')) drawNet(ni, 'fv-conn');
    if (selNet >= 0) drawNet(selNet, model.nets[selNet].kind === 'clock' ? 'fv-clock fv-picked' : 'fv-picked');
    status();
  }
  function status() {
    const parts = [];
    if (selNet >= 0) { const n = model.nets[selNet]; parts.push(`Net ${n.name}: ${n.loads.length} load(s), ${n.pips} routing switch(es) in ${n.tiles.length} tile(s)`); }
    else if (selInst >= 0) parts.push(`${model.insts[selInst].site}: ${Object.keys(model.insts[selInst].pins).length} connection(s)`);
    else if (hlModule !== null) parts.push(`${moduleLabel(hlModule)}: ${rects.filter(r => r?.classList.contains('hl')).length} site(s)`);
    info.textContent = parts.join(' · ');
    info.toggleAttribute('data-no-i18n', parts.length > 0);
  }
  function select(i, { center = false } = {}) {
    selInst = i; selNet = -1;
    details(); highlight(); overlay(); netList();
    if (center && i >= 0) { const c = centre(i); if (c) { vb.x = c[0] - vb.w / 2; vb.y = c[1] - vb.h / 2; apply(); } }
  }
  function showNet(ni) {
    selNet = ni;
    overlay(); netList();
    const n = model.nets[ni];
    // zoom to what it connects
    const pts = [n.driver, ...n.loads].filter(Boolean).map(([k]) => centre(k)).filter(Boolean);
    if (pts.length) {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      fitBox(Math.min(...xs) - 2 * TW, Math.min(...ys) - 2 * TH, Math.max(...xs) - Math.min(...xs) + 4 * TW, Math.max(...ys) - Math.min(...ys) + 4 * TH);
    }
  }

  // ------------------------------------------------------------------ zoom / pan
  const vb = { x: 0, y: 0, w: W, h: H };
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  function fitBox(x, y, w, hh) {
    const r = canvas.getBoundingClientRect();
    const aspect = r.width > 0 && r.height > 0 ? r.width / r.height : W / H;
    if (w / hh > aspect) { const nh = w / aspect; y -= (nh - hh) / 2; hh = nh; } else { const nw = hh * aspect; x -= (nw - w) / 2; w = nw; }
    Object.assign(vb, { x, y, w, h: hh });
    apply();
  }
  const fit = () => fitBox(-TW / 2, -TH / 2, W + TW, H + TH);
  function zoom(k, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) {
    const nw = Math.max(TW * 3, Math.min(W * 3, vb.w / k)), f = nw / vb.w;
    vb.x = cx - (cx - vb.x) * f; vb.y = cy - (cy - vb.y) * f; vb.w = nw; vb.h *= f;
    apply();
  }
  const toChip = e => { const r = svg.getBoundingClientRect(); return [vb.x + ((e.clientX - r.left) / r.width) * vb.w, vb.y + ((e.clientY - r.top) / r.height) * vb.h]; };
  svg.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = toChip(e); zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y); }, { passive: false });
  let drag = null;
  // the site under the press (with the pointer captured, the release is reported on the svg)
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, moved: false, i: e.target.dataset?.i }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => {
    if (drag) {
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) { vb.x = drag.vx - (dx / r.width) * vb.w; vb.y = drag.vy - (dy / r.height) * vb.h; apply(); canvas.classList.add('panning'); }
      return;
    }
    const i = e.target.dataset?.i;
    if (i === undefined) { tip.hidden = true; return; }
    const inst = model.insts[+i];
    tip.textContent = `${inst.site} · ${inst.type}\n${inst.io ? `${inst.name} (pin ${inst.io.pad})` : moduleLabel(inst.module)}`;
    const r = canvas.getBoundingClientRect();
    tip.style.left = `${e.clientX - r.left + 14}px`; tip.style.top = `${e.clientY - r.top + 14}px`;
    tip.hidden = false;
  });
  svg.addEventListener('pointerup', e => {
    const d = drag; drag = null; canvas.classList.remove('panning');
    if (!d || d.moved) return;
    const i = d.i;
    if (i !== undefined) {
      select(+i);
      const m = model.insts[+i].module;
      if (m) onSelectModule(m, { fromChip: true });
    } else if (selInst >= 0 || selNet >= 0) select(-1);
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  const ro = new ResizeObserver(() => { if (!vb.fitted) { const r = canvas.getBoundingClientRect(); if (r.width > 20) { vb.fitted = true; fit(); } } });
  ro.observe(canvas);

  paint(); legend(); details(); netList(); apply();
  requestAnimationFrame(() => fit());
  return {
    highlightModule: p => { highlightModule(p); legend(); highlight(); },
    select: i => select(i, { center: true }),
    showNet,
    get state() { return { level, selInst, selNet, hlModule, showClocks, viewBox: { ...vb } }; },
    destroy() { ro.disconnect(); root.remove(); },
  };
}

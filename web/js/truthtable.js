// Boolean Algebra / Karnaugh Map editor (#2017: it was Truth Table; documents <name>.bool.json, <name>.tt.json before #2065). The inputs (1–6) and outputs (any
// number: the table scrolls, one output at a time in the tabs) are named in the toolbar; the truth table is edited by clicking its output cells (0 → 1 → X) or by
// typing an expression per output. For the selected output: Karnaugh map with the groups of the
// minimal SOP (1s) or POS (0s) (the minimal solution used chosen there when it has several, #2950), canonical SOP and POS
// with their lists Σm / ΠM, minimal SOP and POS with their literal and
// gate counts, the XOR form when it is cheaper (#435), the NAND-only and NOR-only forms (#694), each one's gates and delay
// as a circuit, and the forms of the fewest gates and of the least delay (#1427).
// The expressions are written in the notation chosen, by default with / as NOT and . as AND (/a.b + c, #434, #1496); one may be written
// by hand (#1056), and the whole table drawn by hand (#1066), both from the Development menu (#1098). Tables read from a
// module may have up to 8 inputs (no Karnaugh map then). Logic: core/logic.js. The table always has its HDL module,
// in its language (the project's preferred one), generated from it by the host (app.js), which keeps both in sync,
// and its schematic (#694, a view of its module in the Design pane), each output in the form ticked among its results
// (#2951: its HDL logic; least gates by default); its language is the project's (#696).
//
//   const ed = mountTtEditor(host, { model, onChange(model), onFromModule(), linkInfo() -> { file, why } | null,
//                                    onOpenFile(path), readOnly, banner });
//   (readOnly: a table to read, a shared project followed, #3181: tt-readonly.js; its notice, `banner`)
//   ed.getModel(), ed.setModel(m), ed.setLink(file), ed.destroy()
// Styles: web/css/truthtable.css.
import { h, linkModel, linkSnapshot } from './ui.js';
import { ICON } from './editor-icons.js';
import { toolbarMenu } from './toolbar-menu.js';
import {
  normalizeTable, validateTable, reshapeTable, analyzeOutput, parseExpr, exprColumn, formatExpr,
  kmapLayout, kmapRects, MAX_EDIT_INPUTS, setOutputLogic,
} from '/core/logic.js';
import { reservedError } from '/core/reserved.js';
import { cellText, placeKmap } from './tt-kmap3d.js';
import { domSnapshot } from './print-view.js';
import { t as tr } from './i18n.js';
import { statusLine } from './status-line.js';
import { renderTtResults } from './tt-results.js';
import { ttReadOnlyChrome, lockTt } from './tt-readonly.js';

const NEXT = { 0: '1', 1: 'X', X: '0' };
const COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#e377c2', '#8c564b', '#bcbd22', '#7f7f7f'];
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of kids) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
const names = s => String(s || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);

// the minimal solutions of the SOP or POS on the Karnaugh map (#2928; there, #2950): how many, the one used ("Solution 2
// of 5", the one of its HDL and results), previous / next (round: `go(±1)`)
function solutionPicker(r, go) {
  return h('div', { class: 'tt-sol' },
    h('button', { type: 'button', class: 'tt-sol-btn tt-sol-prev', title: 'Previous solution', onclick: () => go(-1) }, '◀'),
    // (how many: its tip, #3077)
    h('span', { class: 'tt-sol-n', title: r.solutions >= 64 ? 'Many minimal solutions exist; the first 64 can be browsed.' : `${r.solutions} minimal solutions exist.` }, `Solution ${r.pick + 1} of ${r.alternatives.length}`),
    h('button', { type: 'button', class: 'tt-sol-btn tt-sol-next', title: 'Next solution', onclick: () => go(1) }, '▶'));
}

// A truth table's print view (#1510): the table, the Karnaugh map of the output in front (flat or 3D, as shown, its
// tab) and the results; the commands, the expression's field, the hints and the options left out (the notes when it
// has some).
function ttPrintView(root, notes, name) {
  const drop = ['.tt-toolbar', '.doc-status', '.tt-cap-expr', '.tt-row', '.hint', '.tt-expr-err', '.tt-groups', '.tt-tab:not(.active)', '.tt-k3d-reset', '.tt-notation', '.tt-sol-btn'];
  if (!notes.value.trim()) drop.push('.tt-cap-notes', '.tt-notes');
  return { title: `${tr('Truth table')} ${name}`, app: true, body: domSnapshot(root, { drop }) };
}

// what the status line says of a table (#2763): its inputs, outputs and rows
const shapeText = (m) => { const ni = m.inputs.length, no = m.outputs.length; return `${ni} input${ni === 1 ? '' : 's'} · ${no} output${no === 1 ? '' : 's'} · ${2 ** ni} rows`; };

// a menu item as the schematic editor's: an icon and a label (#2505)
const menuItem = (icon, label, title, onclick, cls = '') => h('button', { type: 'button', class: `tt-menu-item tb-menu-item ${cls}`, title, html: `${ICON[icon]}<span>${label}</span>`, onclick });

// the Karnaugh map's order of the variables (#2924), saved with the table: MSB → LSB by columns then rows (the default),
// or by rows then columns
function kmapOrderSelect(order, set) {
  const osel = h('select', { class: 'tt-kmap-order', title: 'Order of the variables on the map, from the most significant to the least', onchange: () => set(osel.value) },
    ...[['cols', 'MSB → LSB by columns, then rows'], ['rows', 'MSB → LSB by rows, then columns']].map(([v, l]) => h('option', { value: v, selected: (order || 'cols') === v }, l)));
  return h('label', { class: 'tt-check' }, 'Order:', ' ', osel);
}

export function mountTtEditor(container, opts = {}) {
  let M = normalizeTable(opts.model);
  let out = M.outputs[0];
  let groups = 'sop';            // groups drawn on the K-map: 'sop' (1s) or 'pos' (0s)
  let notation = 'slash';         // of the expressions shown (#434)
  let destroyed = false;
  const readOnly = !!opts.readOnly;
  // Undo / Redo: snapshots of the table (the notes typed are one step per pause)
  const hist = [JSON.stringify(M)];
  let hi = 0;
  const snap = () => {
    const s = JSON.stringify(M);
    if (s === hist[hi]) return;
    hist.length = hi + 1; hist.push(s);
    if (hist.length > 200) hist.shift();
    hi = hist.length - 1;
  };
  const restore = i => {
    hi = i;
    M = normalizeTable(JSON.parse(hist[hi]));
    if (!M.outputs.includes(out)) out = M.outputs[0];
    render(); opts.onChange?.(M);
  };
  const undo = () => { if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };

  container.innerHTML = '';
  const root = h('div', { class: 'tt-editor' });
  container.append(root);

  // ------------------------------------------------------------------ toolbar
  const inIn = h('input', { type: 'text', class: 'tt-inputs', title: 'Input names (1 to 6), separated by commas or spaces; the first is the most significant bit of a row', spellcheck: 'false' });
  const outIn = h('input', { type: 'text', class: 'tt-outputs', title: 'Output names (1 or more), separated by commas or spaces', spellcheck: 'false' });
  const shapeErr = h('span', { class: 'tt-err' });
  const applyShape = () => {
    const ins = names(inIn.value), outs = names(outIn.value);
    shapeErr.textContent = '';
    if (ins.length < 1 || ins.length > MAX_EDIT_INPUTS) { shapeErr.textContent = `1 to ${MAX_EDIT_INPUTS} inputs`; return; }
    if (outs.length < 1) { shapeErr.textContent = 'At least 1 output'; return; }
    // a new name: not a reserved word of VHDL or Verilog, in any letter case (#679)
    const bad = [...ins, ...outs].filter(n => !M.inputs.includes(n) && !M.outputs.includes(n)).map(reservedError).find(Boolean);
    if (bad) { shapeErr.textContent = `${bad}: choose another name.`; return; }
    const next = normalizeTable(reshapeTable(M, ins, outs));
    const errs = validateTable(next).filter(x => x.severity === 'error');
    if (errs.length) { shapeErr.textContent = errs[0].message; return; }
    if (JSON.stringify(next) === JSON.stringify(M)) return;
    M = next;
    if (!M.outputs.includes(out)) out = M.outputs[0];
    changed();
  };
  for (const el of [inIn, outIn]) {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyShape(); } });
    el.addEventListener('change', applyShape);
  }
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `btn tt-btn ${cls}`, title, onclick }, label);
  const link = h('span', { class: 'tt-link' });
  const more = toolbarMenu([
    menuItem('module', 'Algebra from Module…', 'Fill the table with the truth table of a combinational module of the project (exhaustive simulation)', () => opts.onFromModule?.()),
    menuItem('pen', 'Handwritten Algebra…', 'Write the expressions by hand, one a line, with any names: they become the table\'s inputs, outputs and expressions', () => handwritten(), 'tt-ink'),
  ], { title: 'Fill the table' });
  const toolbar = h('div', { class: 'tt-toolbar' },
    h('label', {}, 'Inputs:'), inIn, h('label', {}, 'Outputs:'), outIn, shapeErr,
    h('span', { class: 'tt-sep' }),
    more.el,
    link);

  // ------------------------------------------------------------------ body
  const tableHost = h('div', { class: 'tt-table-host' });
  const notes = h('textarea', { class: 'tt-notes', placeholder: 'Notes (saved with the table)', rows: 3 });
  let notesT = null;
  notes.addEventListener('input', () => { M.notes = notes.value; opts.onChange?.(M); clearTimeout(notesT); notesT = setTimeout(snap, 600); });
  const left = h('div', { class: 'tt-left' }, h('div', { class: 'tt-caption' }, 'Truth table'), h('div', { class: 'hint' }, 'Click an output cell to change it: 0 → 1 → X (don\'t care).'), tableHost, h('div', { class: 'tt-caption tt-cap-notes' }, 'Notes'), notes);
  const tabs = h('div', { class: 'tt-tabs' });
  const exprIn = h('input', { type: 'text', class: 'tt-expr-in', spellcheck: 'false', placeholder: 'e.g. /a.b + c' });
  const exprErr = h('div', { class: 'tt-err tt-expr-err' });
  const applyExpr = () => {
    const text = exprIn.value.trim();
    exprErr.textContent = '';
    if (!text) return;
    try {
      const col = exprColumn(parseExpr(text, { vars: M.inputs }), M.inputs);
      M.table[out] = col; M.exprs[out] = text; delete M.solutions?.[out];   // (a new column: its first minimal solutions, #2950)
      changed();
    } catch (e) { exprErr.textContent = e.message; }
  };
  exprIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyExpr(); } });
  const exprLbl = h('span', { class: 'tt-expr-lbl' });
  // written by hand in the toolbar (#2010), drawn by hand from the Development menu while a preview (#1098): web/js/tt-ink.js
  const ink = {
    model: () => M, output: () => out, alive: () => !destroyed,
    replace: m => { M = m; if (!M.outputs.includes(out)) out = M.outputs[0]; changed(true); },
  };
  const handwritten = () => import('./tt-ink.js').then(m => m.handwrittenExpressions(ink));
  const handwrittenTable = () => import('./tt-ink.js').then(m => m.handwrittenWholeTable(ink));
  const exprRow = h('div', { class: 'tt-row' }, exprLbl, exprIn, btn('Fill Table', 'Fill the column of this output from the expression', applyExpr));
  const OPS = "Operators: / ' ~ (NOT), . · * (AND), ⊕ ^ or xor (XOR), xnor, + (OR)";
  exprIn.title = OPS;
  const kmapHost = h('div', { class: 'tt-kmap-host' });
  const d3 = { on: false };   // (the map's 3D box: this table's, unticked when opened, #3074)
  const grpSel = h('div', { class: 'tt-groups' });
  const results = h('div', { class: 'tt-results' });
  const right = h('div', { class: 'tt-right' },
    tabs,
    h('div', { class: 'tt-caption tt-cap-expr' }, 'Expression'), exprRow, h('div', { class: 'hint tt-ops' }, OPS), exprErr,
    h('div', { class: 'tt-caption' }, 'Karnaugh map'), grpSel, kmapHost,
    h('div', { class: 'tt-caption' }, 'Results'), results);
  const status = statusLine();   // (its inputs, outputs and rows, #2763)
  root.append(toolbar, h('div', { class: 'tt-body' }, left, right), status.el);
  if (readOnly) ttReadOnlyChrome({ root, toolbar, fields: [inIn, outIn, notes, exprIn], hide: [more.el, exprRow.querySelector('.tt-btn'), left.querySelector(':scope > .hint')], banner: opts.banner });
  root.tabIndex = -1;
  root.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;   // (their own undo)
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); e.stopPropagation(); redo(); }
  });

  // ------------------------------------------------------------------ rendering
  let A = null;   // analysis of the selected output
  const changed = (user) => { if (readOnly) { M = normalizeTable(JSON.parse(hist[hi])); render(); return; }   // (read only: nothing changes)
    snap(); render(); opts.onChange?.(M, user ? { user: true } : undefined); };   // (user: in a dialog, the main toolbar's Undo's, #2505)
  const cycle = (o, r) => {
    const c = M.table[o][r];
    M.table[o] = M.table[o].slice(0, r) + NEXT[c] + M.table[o].slice(r + 1);
    delete M.exprs[o]; delete M.solutions?.[o];   // the column no longer comes from the typed expression; its first minimal solutions (#2950)
    changed();
  };

  function renderTable() {
    const n = M.inputs.length;
    const t = h('table', { class: 'tt-table', 'data-no-i18n': '' });
    t.append(h('tr', {}, h('th', { class: 'tt-idx' }, '#'), ...M.inputs.map(v => h('th', { class: 'tt-in' }, v)),
      ...M.outputs.map(o => h('th', { class: `tt-out${o === out ? ' sel' : ''}`, title: 'Select this output', onclick: () => { out = o; render(); } }, o))));
    for (let r = 0; r < 1 << n; r++) {
      const bits = r.toString(2).padStart(n, '0');
      t.append(h('tr', {}, h('td', { class: 'tt-idx' }, String(r)), ...[...bits].map(b => h('td', { class: 'tt-in' }, b)),
        ...M.outputs.map(o => {
          const c = M.table[o][r];
          return h('td', { class: `tt-cell v${c}${o === out ? ' sel' : ''}`, 'data-out': o, 'data-row': String(r), onclick: () => cycle(o, r) }, c);
        })));
    }
    tableHost.innerHTML = '';
    tableHost.append(t);
  }

  function renderTabs() {
    tabs.innerHTML = '';
    for (const o of M.outputs) tabs.append(h('button', { type: 'button', class: `tt-tab${o === out ? ' active' : ''}`, 'data-out': o, onclick: () => { out = o; render(); } }, o));
  }

  function renderKmap() {
    kmapHost.innerHTML = '';
    grpSel.innerHTML = '';
    const n = M.inputs.length;
    if (n > MAX_EDIT_INPUTS) { kmapHost.append(h('div', { class: 'hint' }, `No Karnaugh map for more than ${MAX_EDIT_INPUTS} inputs.`)); return; }
    for (const [g, label] of [['sop', 'SOP groups (1s)'], ['pos', 'POS groups (0s)']]) {
      const r = h('input', { type: 'radio', name: `tt-grp-${uid}`, value: g, checked: groups === g, onchange: () => { groups = g; renderKmap(); } });
      grpSel.append(h('label', { class: 'tt-check' }, r, ` ${label}`));
    }
    if (n >= 2) grpSel.append(h('div', { class: 'tt-groups-br' }));   // (Order and 3D on the line below, #3063)
    if (n >= 2) grpSel.append(kmapOrderSelect(M.kmapOrder, o => { if (o === 'rows') M.kmapOrder = 'rows'; else delete M.kmapOrder; changed(); }));
    const L = kmapLayout(n, M.kmapOrder || 'cols');
    const res = groups === 'pos' ? A.pos : A.sop, k = res.alternatives.length;
    const picker = res.several && solutionPicker(res, d => { M = setOutputLogic(M, out, { solution: { [groups]: (res.pick + d + k) % k } }); changed(); });   // (beside the map, above its groups, #3077)
    const C = 40, rowsN = L.rowCodes.length, colsN = L.colCodes.length;
    const gw = colsN * C, gh = rowsN * C;
    const left0 = 18 + 12 * Math.max(1, L.rowVars.length), top0 = 46;
    const mapW = left0 + gw + 24, mapH = top0 + gh + 18;
    const perRow = L.maps.length > 1 ? 2 : 1;
    const W = mapW * perRow, H = mapH * Math.ceil(L.maps.length / perRow);
    const svg = sv('svg', { class: 'tt-kmap', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const vn = vs => vs.map(v => M.inputs[v]).join('');
    const bits = (code, k) => (k ? code.toString(2).padStart(k, '0') : '');
    L.maps.forEach((m, mi) => {
      // maps placed by their code (6 inputs: 00 01 / 10 11): neighbouring maps differ in one variable
      const ox = (m.code % perRow) * mapW + left0, oy = Math.floor(m.code / perRow) * mapH + top0;
      if (L.mapVars.length) svg.append(sv('text', { x: ox + gw / 2, y: oy - 34, class: 'tt-k-title', 'text-anchor': 'middle' }, `${vn(L.mapVars)} = ${bits(m.code, L.mapVars.length)}`));
      // corner: row variables \ column variables
      svg.append(sv('line', { x1: ox - left0 + 4, y1: oy - 26, x2: ox, y2: oy, class: 'tt-k-diag' }));
      svg.append(sv('text', { x: ox - 4, y: oy - 18, class: 'tt-k-var', 'text-anchor': 'end' }, vn(L.colVars)));
      if (L.rowVars.length) svg.append(sv('text', { x: ox - left0 + 4, y: oy - 2, class: 'tt-k-var' }, vn(L.rowVars)));
      L.colCodes.forEach((c, j) => svg.append(sv('text', { x: ox + j * C + C / 2, y: oy - 6, class: 'tt-k-code', 'text-anchor': 'middle' }, bits(c, L.colVars.length))));
      L.rowCodes.forEach((c, i) => svg.append(sv('text', { x: ox - 6, y: oy + i * C + C / 2 + 4, class: 'tt-k-code', 'text-anchor': 'end' }, bits(c, L.rowVars.length))));
      for (let i = 0; i < rowsN; i++) for (let j = 0; j < colsN; j++) {
        const mt = L.minterm(mi, i, j), v = M.table[out][mt];
        const g = sv('g', { class: `tt-kcell v${v}`, 'data-row': mt });
        g.append(sv('rect', { x: ox + j * C, y: oy + i * C, width: C, height: C }));
        g.append(sv('text', { x: ox + j * C + 3, y: oy + i * C + 10, class: 'tt-k-m' }, mt));
        g.append(sv('text', { x: ox + j * C + C / 2, y: oy + i * C + C / 2 + 6, class: 'tt-k-v', 'text-anchor': 'middle' }, cellText(v, groups)));
        g.addEventListener('click', () => cycle(out, mt));
        svg.append(g);
      }
      const clipId = `tt-clip-${uid}-${mi}`;
      svg.append(sv('clipPath', { id: clipId }, sv('rect', { x: ox, y: oy, width: gw, height: gh })));
      const gl = sv('g', { 'clip-path': `url(#${clipId})`, class: 'tt-k-groups' });
      res.terms.forEach((t, ti) => {
        const col = COLORS[ti % COLORS.length], ins = 3 + (ti % 4) * 3;
        for (const rc of kmapRects(L, t)) {
          if (rc.map !== mi) continue;
          let x = ox + rc.c0 * C + ins, y = oy + rc.r0 * C + ins, w = (rc.c1 - rc.c0 + 1) * C - 2 * ins, hh = (rc.r1 - rc.r0 + 1) * C - 2 * ins;
          if (rc.open.left) { x -= C; w += C; }
          if (rc.open.right) w += C;
          if (rc.open.top) { y -= C; hh += C; }
          if (rc.open.bottom) hh += C;
          gl.append(sv('rect', { x, y, width: w, height: hh, rx: 12, ry: 12, class: 'tt-group', 'data-term': ti, stroke: col, fill: col, 'fill-opacity': 0.12, 'stroke-width': 2.5 }));
        }
      });
      svg.append(gl);
      svg.append(sv('rect', { x: ox, y: oy, width: gw, height: gh, class: 'tt-k-frame' }));
    });
    placeKmap({ host: kmapHost, options: grpSel, svg, changed: () => renderKmap(), d3, layout: L, col: M.table[out], terms: res.terms, groups, colors: COLORS, onCell: mt => cycle(out, mt), title: c => `${vn(L.mapVars)} = ${bits(c, L.mapVars.length)}` });   // (3D: #1407)
    // legend: one line per group
    const leg = h('div', { class: 'tt-legend' }, picker || null);
    res.terms.forEach((t, ti) => {
      const one = { ...res, terms: [t] };
      const text = formatExpr(groups === 'pos' ? clauseAst(one) : termAst(one), notation);
      leg.append(h('div', { class: 'tt-leg' }, h('span', { class: 'tt-swatch', style: { borderColor: COLORS[ti % COLORS.length], background: `${COLORS[ti % COLORS.length]}22` } }), h('code', { 'data-no-i18n': '' }, text),
        h('span', { class: 'tt-leg-cells' }, ` ${groups === 'pos' ? 'M' : 'm'}(${t.minterms.join(', ')})`)));   // (no "essential" mark, #3080)
    });
    if (!res.terms.length) leg.append(h('div', { class: 'hint' }, groups === 'pos' ? 'No 0s: no groups (the output is always 1).' : 'No 1s: no groups (the output is always 0).'));
    kmapHost.append(leg);
    lockTt(readOnly, root);
  }
  const termAst = r => { const lit = l => (l.neg ? { t: 'not', a: { t: 'var', name: M.inputs[l.v] } } : { t: 'var', name: M.inputs[l.v] }); const ls = r.terms[0].literals; return ls.length === 0 ? { t: 'const', v: 1 } : ls.length === 1 ? lit(ls[0]) : { t: 'and', args: ls.map(lit) }; };
  const clauseAst = r => { const lit = l => (l.neg ? { t: 'var', name: M.inputs[l.v] } : { t: 'not', a: { t: 'var', name: M.inputs[l.v] } }); const ls = r.terms[0].literals; return ls.length === 0 ? { t: 'const', v: 0 } : ls.length === 1 ? lit(ls[0]) : { t: 'or', args: ls.map(lit) }; };

  const renderResults = () => { renderTtResults({ results, M: () => M, out: () => out, A: () => A, notation: () => notation, setNotation: v => { notation = v; },
    setM: m => { M = m; }, changed, renderKmap, renderResults }); lockTt(readOnly, results); };

  function renderLink() {
    link.innerHTML = '';
    const info = opts.linkInfo?.();
    // (only when its HDL is not in sync: the file in sync unsaid, its name in data-hdl, #2047)
    link.dataset.hdl = info?.file && !info.why ? info.file.split('/').pop() : '';
    if (!info?.why) return;
    link.append(h('span', { class: 'gen-banner out-of-sync' }, 'Not in sync with ',
      h('a', { onclick: () => opts.onOpenFile?.(info.file) }, info.file.split('/').pop()), ` — ${info.why}`));
  }

  function render() {
    if (destroyed) return;
    if (!M.outputs.includes(out)) out = M.outputs[0];
    if (document.activeElement !== inIn) inIn.value = M.inputs.join(', ');
    if (document.activeElement !== outIn) outIn.value = M.outputs.join(', ');
    if (document.activeElement !== notes) notes.value = M.notes;
    A = analyzeOutput(M, out, M.inputs.length > MAX_EDIT_INPUTS ? { maxNodes: 50000 } : {});   // module tables of 7–8 inputs: keep it quick
    exprLbl.textContent = `${out} =`;
    if (document.activeElement !== exprIn || !exprIn.value) exprIn.value = M.exprs[out] || '';
    exprErr.textContent = '';
    renderTabs(); renderTable(); renderKmap(); renderResults(); renderLink(); status.set([shapeText(M)]);
  }
  const uid = Math.random().toString(36).slice(2, 8);
  render();

  return {
    getModel: () => normalizeTable(M),   // (a copy; empty choices left out, #2950)
    setModel(m) { M = normalizeTable(m); hist.length = 0; hist.push(JSON.stringify(M)); hi = 0; render(); },
    undo, redo,
    canUndo: () => hi > 0,
    canRedo: () => hi < hist.length - 1,
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { linkModel(M, file); hist.forEach((s, i) => { hist[i] = linkSnapshot(s, file); }); renderLink(); },
    refreshLink: () => renderLink(),
    select(o) { if (M.outputs.includes(o)) { out = o; render(); } },
    handwritten, handwrittenTable, printView: () => ttPrintView(root, notes, M.name),   // (#1510)
    destroy() { destroyed = true; more.close(); container.innerHTML = ''; },
  };
}

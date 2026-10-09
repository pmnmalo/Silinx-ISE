// Truth Table / Karnaugh Map editor (documents <name>.tt.json). The inputs (1–6) and outputs (1–4)
// are named in the toolbar; the truth table is edited by clicking its output cells (0 → 1 → X) or by
// typing an expression per output. For the selected output: Karnaugh map with the groups of the
// minimal SOP (1s) or POS (0s), canonical forms Σm / ΠM, minimal SOP and POS with their literal and
// gate counts, and a check of the student's own expression. Tables read from a module may have up
// to 8 inputs (no Karnaugh map then). Logic: core/logic.js. The host (app.js) links the generated
// HDL module to the table and keeps both in sync.
//
//   const ed = mountTtEditor(host, { model, onChange, onGenerate({ lang }), onSchematic({ form, nand }),
//                                    onFromModule(), linkInfo() -> { file, why } | null, onOpenFile(path) });
//   ed.getModel(), ed.setModel(m), ed.destroy()
// Styles: web/css/truthtable.css.
import { h } from './ui.js';
import {
  normalizeTable, validateTable, reshapeTable, analyzeOutput, parseExpr, exprColumn, formatExpr, compareExpr,
  kmapLayout, kmapRects, MAX_EDIT_INPUTS, MAX_OUTPUTS,
} from '/core/logic.js';

const NEXT = { 0: '1', 1: 'X', X: '0' };
const COLORS = ['#d62728', '#1f77b4', '#2ca02c', '#9467bd', '#ff7f0e', '#17becf', '#e377c2', '#8c564b', '#bcbd22', '#7f7f7f'];
const NOTATIONS = [['textbook', 'a·b\' + c'], ['compact', 'ab\' + c'], ['vhdl', 'VHDL'], ['verilog', 'Verilog']];
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of kids) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
const names = s => String(s || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);

export function mountTtEditor(container, opts = {}) {
  let M = normalizeTable(opts.model);
  let out = M.outputs[0];
  let groups = 'sop';            // groups drawn on the K-map: 'sop' (1s) or 'pos' (0s)
  let notation = 'textbook';
  let mine = '';                 // the student's expression for the selected output
  let nand = false;
  let destroyed = false;

  container.innerHTML = '';
  const root = h('div', { class: 'tt-editor' });
  container.append(root);

  // ------------------------------------------------------------------ toolbar
  const inIn = h('input', { type: 'text', class: 'tt-inputs', title: 'Input names (1 to 6), separated by commas or spaces; the first is the most significant bit of a row', spellcheck: 'false' });
  const outIn = h('input', { type: 'text', class: 'tt-outputs', title: 'Output names (1 to 4), separated by commas or spaces', spellcheck: 'false' });
  const shapeErr = h('span', { class: 'tt-err' });
  const applyShape = () => {
    const ins = names(inIn.value), outs = names(outIn.value);
    shapeErr.textContent = '';
    if (ins.length < 1 || ins.length > MAX_EDIT_INPUTS) { shapeErr.textContent = `1 to ${MAX_EDIT_INPUTS} inputs`; return; }
    if (outs.length < 1 || outs.length > MAX_OUTPUTS) { shapeErr.textContent = `1 to ${MAX_OUTPUTS} outputs`; return; }
    const next = normalizeTable(reshapeTable(M, ins, outs));
    const errs = validateTable(next);
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
  const formSel = h('select', { class: 'tt-form', title: 'Form of the logic in the generated HDL module', onchange: () => { M.form = formSel.value; changed(); } },
    h('option', { value: 'sop' }, 'Minimal SOP'), h('option', { value: 'pos' }, 'Minimal POS'));
  const nandBox = h('input', { type: 'checkbox', class: 'tt-nand', onchange: () => { nand = nandBox.checked; } });
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `btn tt-btn ${cls}`, title, onclick }, label);
  const link = h('span', { class: 'tt-link' });
  const toolbar = h('div', { class: 'tt-toolbar' },
    h('label', {}, 'Inputs:'), inIn, h('label', {}, 'Outputs:'), outIn, btn('Apply', 'Apply the input and output names', applyShape), shapeErr,
    h('span', { class: 'tt-sep' }),
    h('label', { title: 'Form of the logic in the generated HDL module' }, 'HDL logic:'), formSel,
    btn('Generate VHDL module', 'Generate a VHDL module from the table and add it to the project (kept in sync with the table)', () => opts.onGenerate?.({ lang: 'vhdl' })),
    btn('Generate Verilog module', 'Generate a Verilog module from the table and add it to the project (kept in sync with the table)', () => opts.onGenerate?.({ lang: 'verilog' })),
    h('span', { class: 'tt-sep' }),
    btn('Generate Schematic', 'Draw the minimal circuit of each output as a schematic (gates, inputs and outputs) and add it to the project', () => opts.onSchematic?.({ form: groups, nand })),
    h('label', { class: 'tt-check', title: 'Use only NAND gates in the generated schematic' }, nandBox, ' NAND gates only'),
    h('span', { class: 'tt-sep' }),
    btn('Truth Table from Module…', 'Fill the table with the truth table of a combinational module of the project (exhaustive simulation)', () => opts.onFromModule?.()),
    link);

  // ------------------------------------------------------------------ body
  const tableHost = h('div', { class: 'tt-table-host' });
  const notes = h('textarea', { class: 'tt-notes', placeholder: 'Notes (saved with the table)', rows: 3 });
  notes.addEventListener('input', () => { M.notes = notes.value; opts.onChange?.(M); });
  const left = h('div', { class: 'tt-left' }, h('div', { class: 'tt-caption' }, 'Truth table'), h('div', { class: 'hint' }, 'Click an output cell to change it: 0 → 1 → X (don\'t care).'), tableHost, h('div', { class: 'tt-caption' }, 'Notes'), notes);
  const tabs = h('div', { class: 'tt-tabs' });
  const exprIn = h('input', { type: 'text', class: 'tt-expr-in', spellcheck: 'false', placeholder: "e.g. a'b + c" });
  const exprErr = h('div', { class: 'tt-err tt-expr-err' });
  const applyExpr = () => {
    const text = exprIn.value.trim();
    exprErr.textContent = '';
    if (!text) return;
    try {
      const col = exprColumn(parseExpr(text, { vars: M.inputs }), M.inputs);
      M.table[out] = col; M.exprs[out] = text;
      changed();
    } catch (e) { exprErr.textContent = e.message; }
  };
  exprIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyExpr(); } });
  const exprLbl = h('span', { class: 'tt-expr-lbl' });
  const exprRow = h('div', { class: 'tt-row' }, exprLbl, exprIn, btn('Fill Table', 'Fill the column of this output from the expression', applyExpr));
  const kmapHost = h('div', { class: 'tt-kmap-host' });
  const grpSel = h('div', { class: 'tt-groups' });
  const results = h('div', { class: 'tt-results' });
  const mineIn = h('input', { type: 'text', class: 'tt-mine-in', spellcheck: 'false', placeholder: 'type your answer, e.g. a\'c + b' });
  const mineOut = h('div', { class: 'tt-mine-out' });
  let mineT = null;
  mineIn.addEventListener('input', () => { mine = mineIn.value; clearTimeout(mineT); mineT = setTimeout(() => { renderTable(); renderMine(); }, 250); });
  const right = h('div', { class: 'tt-right' },
    tabs,
    h('div', { class: 'tt-caption' }, 'Expression'), exprRow, exprErr,
    h('div', { class: 'tt-caption' }, 'Karnaugh map'), grpSel, kmapHost,
    h('div', { class: 'tt-caption' }, 'Results'), results,
    h('div', { class: 'tt-caption' }, 'Check my answer'),
    h('div', { class: 'tt-row' }, h('span', { class: 'tt-expr-lbl' }, 'My expression:'), mineIn), mineOut);
  root.append(toolbar, h('div', { class: 'tt-body' }, left, right));

  // ------------------------------------------------------------------ rendering
  let A = null;   // analysis of the selected output
  const changed = () => { render(); opts.onChange?.(M); };
  const cycle = (o, r) => {
    const c = M.table[o][r];
    M.table[o] = M.table[o].slice(0, r) + NEXT[c] + M.table[o].slice(r + 1);
    delete M.exprs[o];   // the column no longer comes from the typed expression
    changed();
  };
  const mineCheck = () => {
    if (!mine.trim()) return null;
    try { return compareExpr(mine, M.inputs, M.table[out]); } catch (e) { return { error: e.message }; }
  };

  function renderTable() {
    const n = M.inputs.length;
    const chk = mineCheck();
    const diff = new Set(chk?.diffs?.map(d => d.row) || []);
    const t = h('table', { class: 'tt-table', 'data-no-i18n': '' });
    t.append(h('tr', {}, h('th', { class: 'tt-idx' }, '#'), ...M.inputs.map(v => h('th', { class: 'tt-in' }, v)),
      ...M.outputs.map(o => h('th', { class: `tt-out${o === out ? ' sel' : ''}`, title: 'Select this output', onclick: () => { out = o; render(); } }, o))));
    for (let r = 0; r < 1 << n; r++) {
      const bits = r.toString(2).padStart(n, '0');
      t.append(h('tr', { class: diff.has(r) ? 'tt-diff' : '' }, h('td', { class: 'tt-idx' }, String(r)), ...[...bits].map(b => h('td', { class: 'tt-in' }, b)),
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
    for (const o of M.outputs) tabs.append(h('button', { type: 'button', class: `tt-tab${o === out ? ' active' : ''}`, 'data-out': o, onclick: () => { out = o; mine = ''; mineIn.value = ''; render(); } }, o));
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
    const L = kmapLayout(n);
    const res = groups === 'pos' ? A.pos : A.sop;
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
        g.append(sv('text', { x: ox + j * C + C / 2, y: oy + i * C + C / 2 + 6, class: 'tt-k-v', 'text-anchor': 'middle' }, v));
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
    kmapHost.append(svg);
    // legend: one line per group
    const leg = h('div', { class: 'tt-legend' });
    res.terms.forEach((t, ti) => {
      const one = { ...res, terms: [t] };
      const text = formatExpr(groups === 'pos' ? clauseAst(one) : termAst(one), notation === 'vhdl' || notation === 'verilog' ? notation : 'textbook');
      leg.append(h('div', { class: 'tt-leg' }, h('span', { class: 'tt-swatch', style: { borderColor: COLORS[ti % COLORS.length], background: `${COLORS[ti % COLORS.length]}22` } }), h('code', { 'data-no-i18n': '' }, text),
        h('span', { class: 'tt-leg-cells' }, ` ${groups === 'pos' ? 'M' : 'm'}(${t.minterms.join(', ')})`), t.essential ? h('span', { class: 'tt-ess' }, ' essential') : null));
    });
    if (!res.terms.length) leg.append(h('div', { class: 'hint' }, groups === 'pos' ? 'No 0s: no groups (the output is always 1).' : 'No 1s: no groups (the output is always 0).'));
    kmapHost.append(leg);
  }
  const termAst = r => { const lit = l => (l.neg ? { t: 'not', a: { t: 'var', name: M.inputs[l.v] } } : { t: 'var', name: M.inputs[l.v] }); const ls = r.terms[0].literals; return ls.length === 0 ? { t: 'const', v: 1 } : ls.length === 1 ? lit(ls[0]) : { t: 'and', args: ls.map(lit) }; };
  const clauseAst = r => { const lit = l => (l.neg ? { t: 'var', name: M.inputs[l.v] } : { t: 'not', a: { t: 'var', name: M.inputs[l.v] } }); const ls = r.terms[0].literals; return ls.length === 0 ? { t: 'const', v: 0 } : ls.length === 1 ? lit(ls[0]) : { t: 'or', args: ls.map(lit) }; };

  function renderResults() {
    results.innerHTML = '';
    const nsel = h('select', { class: 'tt-notation', title: 'Notation of the expressions', onchange: () => { notation = nsel.value; renderResults(); renderKmap(); } },
      ...NOTATIONS.map(([v, l]) => h('option', { value: v, selected: v === notation }, l)));
    const form = (label, r, cls) => {
      const g = r.gates;
      const note = [];
      if (r.several) note.push(h('span', { class: 'tt-note' }, `${r.solutions >= 64 ? 'many' : r.solutions} minimal solutions exist; one is shown.`));
      if (!r.exact) note.push(h('span', { class: 'tt-note' }, 'The exact search was cut short: this solution may not be minimal.'));
      return h('div', { class: `tt-res ${cls}` },
        h('div', {}, h('b', {}, label), ': ', h('code', { class: 'tt-expr', 'data-no-i18n': '' }, `${out} = ${formatExpr(r.ast, notation)}`)),
        h('div', { class: 'tt-cost' }, `${r.terms.length} term(s), ${r.literals} literal(s); gates: ${g.and} AND, ${g.or} OR, ${g.not} NOT (${g.inputs} gate inputs)`),
        ...note);
    };
    const ess = A.sop.essential;
    results.append(
      h('div', { class: 'tt-row' }, h('label', {}, 'Notation:'), nsel),
      h('div', { class: 'tt-res tt-canon' }, h('b', {}, 'Canonical forms'), ': ', h('code', { 'data-no-i18n': '' }, `${out} = ${A.sigma}`), h('br'), h('code', { 'data-no-i18n': '', style: { marginLeft: '0' } }, `${out} = ${A.pi}`)),
      form('Minimal SOP', A.sop, 'tt-sop'),
      form('Minimal POS', A.pos, 'tt-pos'),
      h('div', { class: 'tt-res tt-ess-list' }, h('b', {}, 'Essential prime implicants (SOP)'), ': ',
        h('code', { 'data-no-i18n': '' }, ess.length ? ess.map(t => formatExpr(termAst({ terms: [t] }), notation === 'vhdl' || notation === 'verilog' ? notation : 'textbook')).join(', ') : '—'),
        h('span', { class: 'tt-cost' }, ` (${A.sop.primes.length} prime implicant(s))`)));
  }

  function renderMine() {
    mineOut.innerHTML = '';
    const chk = mineCheck();
    if (!chk) return;
    if (chk.error) { mineOut.append(h('div', { class: 'tt-err' }, chk.error)); return; }
    if (chk.equal) { mineOut.append(h('div', { class: 'tt-ok' }, `✔ Equal to the table (output ${out}).`)); return; }
    mineOut.append(h('div', { class: 'tt-bad' }, `✘ Different from the table in ${chk.diffs.length} row(s):`));
    const t = h('table', { class: 'tt-table tt-difftab', 'data-no-i18n': '' },
      h('tr', {}, h('th', {}, '#'), ...M.inputs.map(v => h('th', {}, v)), h('th', {}, `${out} (table)`), h('th', {}, `${out} (yours)`)));
    for (const d of chk.diffs.slice(0, 64)) t.append(h('tr', {}, h('td', {}, String(d.row)), ...[...d.row.toString(2).padStart(M.inputs.length, '0')].map(b => h('td', {}, b)), h('td', {}, d.expected), h('td', {}, d.got)));
    mineOut.append(t);
  }

  function renderLink() {
    link.innerHTML = '';
    const info = opts.linkInfo?.();
    if (!info?.file) return;
    link.append(h('span', { class: `gen-banner${info.why ? ' out-of-sync' : ''}` }, info.why ? 'Not in sync with ' : 'Synchronized with ',
      h('a', { onclick: () => opts.onOpenFile?.(info.file) }, info.file.split('/').pop()), info.why ? ` — ${info.why}` : ' — editing the table updates it'));
  }

  function render() {
    if (destroyed) return;
    if (!M.outputs.includes(out)) out = M.outputs[0];
    if (document.activeElement !== inIn) inIn.value = M.inputs.join(', ');
    if (document.activeElement !== outIn) outIn.value = M.outputs.join(', ');
    formSel.value = M.form;
    if (document.activeElement !== notes) notes.value = M.notes;
    A = analyzeOutput(M, out, M.inputs.length > MAX_EDIT_INPUTS ? { maxNodes: 50000 } : {});   // module tables of 7–8 inputs: keep it quick
    exprLbl.textContent = `${out} =`;
    if (document.activeElement !== exprIn || !exprIn.value) exprIn.value = M.exprs[out] || '';
    exprErr.textContent = '';
    renderTabs(); renderTable(); renderKmap(); renderResults(); renderMine(); renderLink();
  }
  const uid = Math.random().toString(36).slice(2, 8);
  render();

  return {
    getModel: () => JSON.parse(JSON.stringify(M)),
    setModel(m) { M = normalizeTable(m); render(); },
    refreshLink: () => renderLink(),
    select(o) { if (M.outputs.includes(o)) { out = o; render(); } },
    destroy() { destroyed = true; clearTimeout(mineT); container.innerHTML = ''; },
  };
}

// Symbol Info dialog of the schematic editor: the datasheet of a library symbol (description, symbol
// drawing, pins, parameters, truth / mode table, equivalent VHDL and Verilog), like the Symbol Info
// pages of Xilinx ISE. Texts come from core/symdocs.js in the current UI language (the dialog is
// marked data-no-i18n: it is not translated again by the DOM translator); truth tables are computed
// by core/symtables.js (simulation of the HDL of the symbol alone).
//
//   import { openSymbolInfo } from './symbol-info.js';
//   openSymbolInfo({ container, type, params, preset, hdl, modules, lang: 'vhdl', draw(sym, def) -> svg, highlight(code, lang) -> html, onClose });
//   -> { close(), setParams(p), get params(), el }
import { SYMBOLS, defaultParams } from '/core/schdoc.js';
import { symbolDoc, presetOf, modeQText, T } from '/core/symdocs.js';
import { truthTable } from '/core/symtables.js';
import { getLanguage, onLanguageChange } from './i18n.js';

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function openSymbolInfo(opts) {
  const { container } = opts;
  const type = opts.type;
  let params = { ...defaultParams(type), ...JSON.parse(JSON.stringify(opts.params || {})) };
  let preset = opts.preset || presetOf(type, params);
  const projLang = opts.lang === 'verilog' ? 'verilog' : 'vhdl';
  let hdlLang = projLang;
  let showFull = false;
  let tableTimer = null;
  let closed = false;

  const modal = h('div', { class: 'se-modal se-symdoc-modal' });
  const box = h('div', { class: 'se-dialog se-symdoc', 'data-no-i18n': '', role: 'dialog', tabindex: '-1' });
  modal.append(box);
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(tableTimer);
    offLang();
    modal.remove();
    opts.onClose?.();
  };
  modal.addEventListener('pointerdown', e => { if (e.target === modal) close(); });
  // keys typed in the dialog stay in it (the editor shortcuts listen on the window)
  modal.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'F1') e.preventDefault();
  });
  const offLang = onLanguageChange(() => render());

  function paramInput(p, L) {
    const v = params[p.name];
    const set = x => { params[p.name] = x; preset = presetOf(type, params); render(); };
    if (p.kind === 'bool') {
      const el = h('input', { type: 'checkbox', checked: !!v, 'data-param': p.name });
      el.addEventListener('change', () => set(el.checked));
      return el;
    }
    if (p.kind === 'select') {
      const el = h('select', { 'data-param': p.name }, ...p.options.map(o => h('option', { value: o, text: o })));
      el.value = String(v);
      el.addEventListener('change', () => set(el.value));
      return el;
    }
    const el = h('input', { type: p.kind === 'int' ? 'number' : 'text', value: v ?? '', 'data-param': p.name, min: p.min, max: Math.min(p.max ?? 64, p.name === 'width' ? 64 : 1e6) });
    el.addEventListener('change', () => {
      if (p.kind === 'int') set(Math.max(p.min ?? 0, Math.min(p.name === 'width' ? 64 : (p.max ?? 1e6), Math.round(+el.value || p.default))));
      else set(String(el.value).trim());
    });
    return el;
  }

  function drawing(d) {
    const svg = opts.draw ? opts.draw(d.sym, d.def) : '';
    return h('div', { class: 'sd-draw', html: svg });
  }

  function tableEl(rows, head, cls = '') {
    const t = h('table', { class: `sd-table ${cls}` });
    if (head) t.append(h('thead', {}, head));
    t.append(h('tbody', {}, ...rows));
    return t;
  }

  function truthEl(tt, lang) {
    const wrap = h('div', { class: 'sd-tt' });
    if (tt.kind === 'error') { wrap.append(h('div', { class: 'sd-note err', text: `${T('The table cannot be computed:', lang)} ${tt.error}` })); return wrap; }
    if (tt.kind === 'none') { wrap.append(h('div', { class: 'sd-note', text: T('No table: the behaviour is defined by the HDL of the module / block.', lang) })); return wrap; }
    if (tt.kind === 'exhaustive') {
      const compactBetter = tt.compact.length < tt.rows.length;
      const full = tt.full && (showFull || !compactBetter);
      const rows = full ? tt.rows : tt.compact;
      const head = h('tr', {},
        ...tt.inCols.map((c, i) => h('th', { class: i === tt.inCols.length - 1 ? 'sep' : '', text: c.label })),
        ...tt.outCols.map(c => h('th', { class: 'out', text: c.label })));
      const grp = h('tr', { class: 'grp' }, h('th', { colspan: Math.max(1, tt.inCols.length), class: 'sep', text: T('Inputs', lang) }), h('th', { colspan: tt.outCols.length, class: 'out', text: T('Outputs', lang) }));
      const body = rows.map(r => h('tr', {},
        ...(tt.inCols.length ? [...r.in].map((b, i) => h('td', { class: `${i === tt.inCols.length - 1 ? 'sep' : ''}${b === 'X' ? ' x' : ''}`, text: b })) : [h('td', { class: 'sep', text: '—' })]),
        ...[...r.out].map(b => h('td', { class: `out v${b}`, text: b }))));
      if (!tt.inCols.length) grp.firstChild.textContent = T('Inputs', lang);
      const t = tableEl(body, [grp, tt.inCols.length ? head : h('tr', {}, h('th', { class: 'sep', text: '' }), ...tt.outCols.map(c => h('th', { class: 'out', text: c.label })))], 'sd-truth');
      t.dataset.kind = full ? 'full' : 'compact';
      const notes = [T('Computed by simulating the HDL of the symbol for every input combination.', lang)];
      if (tt.perBit) notes.unshift(T('The function is bitwise: the table is the same for every bit i of the buses (shown with Width = 1).', lang));
      if (tt.full && compactBetter) {
        const sw = h('div', { class: 'sd-switch' });
        for (const [val, label] of [[false, T('Compact table (X = any value)', lang)], [true, `${T('Full table', lang)} (${tt.rows.length})`]]) {
          const b = h('button', { type: 'button', class: `btn${showFull === val ? ' on' : ''}`, 'data-view': val ? 'full' : 'compact', text: label });
          b.addEventListener('click', () => { showFull = val; render(); });
          sw.append(b);
        }
        wrap.append(sw);
      } else if (!full) wrap.append(h('div', { class: 'sd-note', text: T('Compact table (X = any value)', lang) }));
      wrap.append(t, ...notes.map(n => h('div', { class: 'sd-note', text: n })));
      return wrap;
    }
    // representative rows
    const head = h('tr', {}, ...tt.inCols.map((c, i) => h('th', { class: i === tt.inCols.length - 1 ? 'sep' : '', text: c.label })), ...tt.outCols.map(c => h('th', { class: 'out', text: c.label })));
    const body = tt.rows.map(r => h('tr', {}, ...r.in.map((x, i) => h('td', { class: i === r.in.length - 1 ? 'sep' : '', text: x })), ...r.out.map(x => h('td', { class: 'out', text: x }))));
    const t = tableEl(body, head, 'sd-truth sd-samples');
    t.dataset.kind = 'samples';
    wrap.append(h('div', { class: 'sd-note', text: T('Too many inputs for a complete table: representative rows computed by simulating the HDL of the symbol.', lang) }), t);
    if (tt.perBit) wrap.append(h('div', { class: 'sd-note', text: T('The function is bitwise: the table is the same for every bit i of the buses (shown with Width = 1).', lang) }));
    return wrap;
  }

  function modeEl(d, lang) {
    const m = d.mode;
    const head = h('tr', {}, ...m.cols.map((c, i) => h('th', { class: i === m.cols.length - 1 ? 'sep' : '', text: c })), h('th', { class: 'out', text: m.out }));
    const grp = h('tr', { class: 'grp' }, h('th', { colspan: m.cols.length, class: 'sep', text: T('Inputs', lang) }), h('th', { class: 'out', text: T('Outputs', lang) }));
    const body = m.rows.map(r => h('tr', {}, ...m.cols.map((c, i) => h('td', { class: `${i === m.cols.length - 1 ? 'sep' : ''}${r.in[c] === 'X' ? ' x' : ''}`, text: r.in[c] })), h('td', { class: `out q-${r.q}`, text: modeQText(r.q, type, params, lang) })));
    const t = tableEl(body, [grp, head], 'sd-truth sd-mode');
    return h('div', { class: 'sd-tt' }, t, ...m.notes.map(n => h('div', { class: 'sd-note', text: n })));
  }

  function hdlEl(d, lang) {
    if (!d.hdl) return null;
    const pre = h('pre', { class: 'se-code sd-code' });
    const tabs = h('div', { class: 'sd-tabs' });
    const order = projLang === 'verilog' ? ['verilog', 'vhdl'] : ['vhdl', 'verilog'];
    const show = () => {
      pre.innerHTML = opts.highlight ? opts.highlight(d.hdl[hdlLang], hdlLang) : esc(d.hdl[hdlLang]);
      tabs.querySelectorAll('[data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === hdlLang));
    };
    for (const l of order) {
      const b = h('button', { type: 'button', class: 'btn', 'data-lang': l, text: l === 'vhdl' ? 'VHDL' : 'Verilog' });
      b.addEventListener('click', () => { hdlLang = l; show(); });
      tabs.append(b);
    }
    tabs.append(h('span', { class: 'sp' }), h('button', { type: 'button', class: 'btn', 'data-act': 'copy-hdl', text: T('Copy', lang), onclick: () => navigator.clipboard?.writeText(d.hdl[hdlLang]).catch(() => {}) }));
    show();
    return h('div', { class: 'sd-hdl' }, tabs, pre);
  }

  function render() {
    if (closed) return;
    const lang = getLanguage() === 'pt' ? 'pt' : 'en';
    const scroll = box.querySelector('.sd-body')?.scrollTop || 0;
    const focusParam = document.activeElement?.dataset?.param;
    const d = symbolDoc(type, params, { lang, modules: opts.modules, preset, hdl: opts.hdl });
    box.innerHTML = '';
    box.dataset.type = type;
    box.dataset.lang = lang;
    const titleText = d.preset && d.preset !== SYMBOLS[type]?.title ? `${d.title} (${SYMBOLS[type].title})` : d.title;
    box.append(h('div', { class: 'se-dhead' },
      h('b', { text: `${T('Symbol Info', lang)}: ${titleText}` }), h('span', { class: 'se-dinfo', text: `${T('Category', lang)}: ${lang === 'pt' ? catPt(d.category) : d.category}` }),
      h('span', { class: 'sp' }), h('button', { class: 'btn', type: 'button', 'data-act': 'close', text: T('Close', lang), onclick: close })));
    const side = h('div', { class: 'sd-side' }, drawing(d));
    if (d.params.length) {
      const pt = h('div', { class: 'sd-params' });
      for (const p of d.params) pt.append(h('label', { class: 'sd-param' }, h('span', { text: p.label }), paramInput(p, lang)));
      side.append(pt, h('div', { class: 'sd-note', text: T('Change the parameters to see the tables and the HDL update (the placed symbol is not changed).', lang) }));
    }
    if (d.xilinx.length) side.append(h('div', { class: 'sd-xil' }, h('div', { class: 'sd-h4', text: T('Xilinx library equivalents', lang) }), h('div', { class: 'sd-xnames', text: d.xilinx.join(', ') })));
    const main = h('div', { class: 'sd-main' });
    main.append(h('h3', { text: T('Description', lang) }), ...d.text.map(t => h('p', { text: t })));
    if (d.formula) main.append(h('div', { class: 'sd-formula' }, h('span', { text: `${T('Formula', lang)}: ` }), h('code', { text: d.formula })));
    // pins
    const dirText = dir => T(dir === 'in' ? 'input' : dir === 'out' ? 'output' : 'bidirectional', lang);
    main.append(h('h3', { text: T('Pins', lang) }), tableEl(d.pins.map(p => h('tr', { 'data-pin': p.name }, h('td', { class: 'mono', text: p.name }), h('td', { text: dirText(p.dir) }), h('td', { class: 'num', text: p.widthText }), h('td', { text: p.func }))),
      h('tr', {}, h('th', { text: T('Pin', lang) }), h('th', { text: T('Direction', lang) }), h('th', { text: T('Width', lang) }), h('th', { text: T('Function', lang) })), 'sd-pins'));
    if (d.params.length) {
      const val = p => (p.kind === 'bool' ? T(p.value ? 'yes' : 'no', lang) : String(p.value ?? ''));
      const dft = p => (p.kind === 'bool' ? T(p.default ? 'yes' : 'no', lang) : String(p.default ?? ''));
      main.append(h('h3', { text: T('Parameters and attributes', lang) }), tableEl(d.params.map(p => h('tr', { 'data-param-row': p.name }, h('td', { text: p.label }), h('td', { class: 'mono', text: val(p) }), h('td', { class: 'mono', text: dft(p) }), h('td', { text: p.meaning }))),
        h('tr', {}, h('th', { text: T('Parameter', lang) }), h('th', { text: T('Value', lang) }), h('th', { text: T('Default', lang) }), h('th', { text: T('Meaning', lang) })), 'sd-params-t'));
    }
    // function table
    const ttBox = h('div', { class: 'sd-ttbox' });
    if (d.mode) { main.append(h('h3', { text: T('Mode table', lang) }), ttBox); ttBox.append(modeEl(d, lang)); }
    else if (type !== 'module' && type !== 'hdlblock') {
      main.append(h('h3', { text: T('Truth table', lang) }), ttBox);
      ttBox.append(h('div', { class: 'sd-note', text: T('Computing…', lang) }));
      clearTimeout(tableTimer);
      tableTimer = setTimeout(() => {
        if (closed) return;
        let tt;
        try { tt = truthTable(type, params, { modules: opts.modules }); } catch (e) { tt = { kind: 'error', error: e.message }; }
        ttBox.innerHTML = '';
        ttBox.append(truthEl(tt, lang));
        box.dataset.table = tt.kind;
      }, 0);
    } else ttBox.remove();
    const hd = hdlEl(d, lang);
    if (hd) main.append(h('h3', { text: T('Equivalent HDL', lang) }), hd);
    const body = h('div', { class: 'sd-body' }, side, main);
    box.append(body);
    body.scrollTop = scroll;
    if (focusParam) { const f = box.querySelector(`[data-param="${focusParam}"]`); if (f) f.focus(); }
  }
  const CAT_PT = { 'Logic': 'Lógica', 'Arithmetic': 'Aritmética', 'Flip-Flops': 'Flip-Flops', 'Mux': 'Multiplexadores', 'Decoders/Encoders': 'Descodificadores/Codificadores', 'Bus': 'Barramento', 'I/O': 'E/S', 'Project modules': 'Módulos do projeto' };
  function catPt(c) { return CAT_PT[c] || c; }

  container.append(modal);
  render();
  box.focus();
  return {
    el: box,
    close,
    get params() { return { ...params }; },
    setParams(p) { params = { ...params, ...p }; preset = presetOf(type, params); render(); },
  };
}

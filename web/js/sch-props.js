// The schematic editor's Properties panel (#405: out of mountSchEditor): the sheet's (its language), a symbol's (its
// name, its parameters, a gate's inputs, a flip-flop's pins, a LUT's function, a module's ports and nets), a port's, a
// net label's and a wire's (its net, renamed with the whole net), several objects' commands and the properties they
// have in common (#1471). mountProps(ctx) is called by mountSchEditor where this code was.
import {
  SYMBOLS, symbolDef, symbolParams, symbolPins, parseNetName, FF_INPUTS, ffVariant, gateVariant, MUX_INPUTS, netByName, renameNet,
} from '/core/schdoc.js';
import { staleSection } from './sch-modsym.js';
import { symbolSummary } from '/core/symdocs.js';
import { lutFunction } from '/core/fpga/techview.js';
import { getLanguage } from './i18n.js';
import { dialog } from './ui.js';
import { h } from './dom.js';
import { reservedError } from '/core/reserved.js';
import { clone, snap, KEYS } from './sch-editor.js';
import { mountMultiProps } from './sch-multi.js';
import { mountCompareTicks } from './sch-compare.js';

/** { renderProps, openSelected, renamed, joinByName, renameLabel } of a schematic editor (doc(), sel(), nl(), live(), modules(): its current ones). */
export function mountProps(ctx) {
  const { opts, container, propBody, readOnly, doc, sel, nl, live, modules, setGenLang, edit, flash, rotateSel, mirrorSel, deleteSel, nextId,
    openInfo, infoTarget } = ctx;

  const multiProps = mountMultiProps({ propBody, doc, edit, field: (...a) => field(...a), keepFocus: (...a) => keepFocus(...a) });   // (#1471)
  const compareTicks = mountCompareTicks({ container, doc, nl, modules, edit, flash });   // (#1555)
  function field(label, input, note) { return h('div', { class: 'se-field' }, h('label', { text: label }), input, note ? h('div', { class: 'se-note', text: note }) : null); }
  // the single selected module instance (RTL view: "push into"), or null
  function selectedModuleSym() {
    const ids = [...sel()].filter(k => k.startsWith('sym:'));
    if (ids.length !== 1 || sel().size !== 1) return null;
    const s = doc().symbols.find(x => x.id === ids[0].slice(4));
    return s && s.type === 'module' ? s : null;
  }
  function openSelected() {
    const s = selectedModuleSym();
    if (s && opts.onOpenModule) opts.onOpenModule(s.params.module, { instance: s.name, symbol: clone(s) });
    return !!s;
  }
  function renderProps() {
    if (live()) { live().renderProps(propBody); return; }
    renderPropsInner();
    opts.onSelect?.(selectedModuleSym());
    if (readOnly) propBody.querySelectorAll('input, textarea, select, button').forEach(el => { if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) el.readOnly = true; else if (!el.classList.contains('ro-ok')) el.disabled = true; });
  }
  function renderPropsInner() {
    propBody.innerHTML = '';
    const items = [...sel()];
    if (items.length === 0) return sheetProps();
    if (items.length > 1) {
      propBody.append(h('div', { class: 'se-ptitle', text: `${items.length} objects selected` }));
      multiProps(items);   // (sch-multi.js)
      propBody.append(h('div', { class: 'se-pbtns' }, h('button', { class: 'btn', type: 'button', text: 'Rotate', onclick: rotateSel }), h('button', { class: 'btn', type: 'button', text: 'Mirror', onclick: mirrorSel }), h('button', { class: 'btn', type: 'button', text: 'Delete', onclick: deleteSel })));
      return;
    }
    const [kind, id] = items[0].split(/:(.*)/s);
    const obj = doc()[KEYS[kind]].find(o => o.id === id);
    if (!obj) return;
    if (kind === 'sym') symProps(obj);
    else if (kind === 'port') portProps(obj);
    else if (kind === 'label') labelProps(obj);
    else if (kind === 'wire') wireProps(obj);
  }
  // text input bound to a setter (commits on change)
  // a property applied with Enter keeps the keyboard in the (redrawn) field
  function keepFocus(el, apply) {
    const fields = () => [...propBody.querySelectorAll('input, textarea, select')];
    const kept = document.activeElement === el, idx = fields().indexOf(el);
    apply();
    if (kept && idx >= 0) setTimeout(() => { const f = fields()[idx]; if (f) { f.focus(); f.select?.(); } }, 0);
  }
  // (set may be async: it then returns false, the value given up, or the function that applies it)
  function inp(value, set, attrs = {}) {
    const el = h('input', { type: 'text', value: value ?? '', ...attrs });
    el.addEventListener('change', async () => {
      const v = el.type === 'number' ? Number(el.value) : el.value;
      if (set.constructor.name !== 'AsyncFunction') { keepFocus(el, () => edit(() => set(v))); return; }
      const apply = await set(v);
      if (!apply) { el.value = value ?? ''; return; }
      keepFocus(el, () => edit(apply));
    });
    return el;
  }
  // a net name another net already has (#689): the two become one net, connected by name (no wire drawn
  // between them, as in ISE), only when the user says so; never merged silently
  // a net connected by name renamed as a whole (#734): what else took the name, said in the status line
  function renamed(r, name) {
    const others = r.labels.length - 1, base = parseNetName(name).base;
    const parts = [others > 0 ? `${others} other net name${others > 1 ? 's' : ''}` : null, ...r.ports.map(p => `the I/O marker '${p.name}' (a port of the module)`)].filter(Boolean);
    if (parts.length) setTimeout(() => flash(`Renamed to '${base}' with the net: ${parts.join(' and ')}`), 0);
  }
  async function joinByName(name, net) {
    if (!name || !nl()) return true;
    const other = netByName(doc(), nl(), name, net);
    if (!other) return true;
    const base = parseNetName(name).base;
    const ok = await dialog({
      title: 'Net name already used', width: 460,
      body: h('div', { class: 'se-join' }, h('div', { text: `Another net is already named '${base}'.` }),
        h('div', { text: 'Connect this net to it by name? They become one net, without a wire drawn between them.' })),
      buttons: [{ label: 'Connect by name', value: true, primary: true }, { label: 'Cancel', value: null }],
    });
    container.focus({ preventScroll: true });
    return !!ok;
  }
  function chk(value, set) { const el = h('input', { type: 'checkbox', checked: !!value }); el.addEventListener('change', () => edit(() => set(el.checked))); return el; }
  function selBox(value, options, set) {
    const el = h('select', {}, ...options.map(o => h('option', { value: Array.isArray(o) ? o[0] : o, text: Array.isArray(o) ? o[1] : o })));
    el.value = value; el.addEventListener('change', () => edit(() => set(el.value))); return el;
  }
  function sheetProps() {
    propBody.append(h('div', { class: 'se-ptitle', text: 'Schematic sheet' }));
    propBody.append(field('Module name', inp(doc().name, v => { doc().name = String(v).trim() || 'schematic'; })));
    propBody.append(field('Language', selBox(doc().lang, [['vhdl', 'VHDL'], ['verilog', 'Verilog']], v => { doc().lang = v; setGenLang(v); })));
    propBody.append(field('Description', ta(doc().description || '', v => { if (String(v).trim()) doc().description = v; else delete doc().description; }, 2), 'shown on the sheet and as a comment in the HDL'));
    propBody.append(field('Sheet size', h('div', { class: 'se-row' },
      inp(doc().sheet.w, v => { doc().sheet.w = Math.max(400, +v || 1700); }, { type: 'number', step: 100 }),
      h('span', { text: '×' }), inp(doc().sheet.h, v => { doc().sheet.h = Math.max(300, +v || 1100); }, { type: 'number', step: 100 }))));
    const hd = doc().hdl || {};
    const sec = h('details', { class: 'se-sec', open: !!(hd.decls || hd.generics?.length) });
    sec.append(h('summary', { text: `HDL kept with the schematic${hd.lang ? ` (${hd.lang.toUpperCase()})` : ''}` }));
    const ensure = () => { doc().hdl ||= { lang: doc().lang, context: '', generics: [], decls: '', arch: '' }; return doc().hdl; };
    sec.append(field(hd.lang === 'verilog' ? 'Compiler directives' : 'Context clause', ta(hd.context || '', v => { ensure().context = v; }, 3)));
    sec.append(field(hd.lang === 'verilog' ? 'Parameters' : 'Generics', ta((hd.generics || []).map(g => `${g.name}${g.type ? ` : ${g.type}` : ''}${g.default ? ` := ${g.default}` : ''}`).join('\n'), v => {
      ensure().generics = v.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = /^([A-Za-z_]\w*)\s*(?::\s*([^:=]+?))?\s*(?::?=\s*(.+))?$/.exec(l); return m ? { name: m[1], type: (m[2] || '').trim(), default: (m[3] || '').trim() } : null; }).filter(Boolean);
    }, 2), 'one per line: NAME : type := default'));
    sec.append(field('Declarations', ta(hd.decls || '', v => { ensure().decls = v; }, 6), 'signals, types, constants, functions emitted verbatim'));
    if (doc().lang === 'vhdl') sec.append(field('Architecture name', inp(hd.arch || '', v => { ensure().arch = String(v).trim(); }, { placeholder: 'schematic', 'data-no-i18n': '' })));
    propBody.append(sec);
    propBody.append(h('div', { class: 'se-note', text: 'Tip: drag symbols from the Symbols panel; double-click a module symbol to open its source.' }));
  }
  // the function of a LUT: its equation and truth table (a collapsed section, opened on demand)
  function lutSection(fn) {
    const sec = h('details', { class: 'se-sec se-lutfn' });
    sec.append(h('summary', { text: 'LUT function (INIT)' }), h('div', { class: 'se-lut-eq', 'data-no-i18n': '', text: fn.equation }));
    const tbl = h('table', { class: 'se-lut-tt' });
    tbl.append(h('tr', {}, ...[...fn.inputs, 'O'].map(x => h('th', { 'data-no-i18n': '', text: x }))));
    for (const r of fn.rows) tbl.append(h('tr', { class: r.out ? 'one' : '' }, ...[...r.in, r.out].map(v => h('td', { text: String(v) }))));
    sec.append(tbl);
    return sec;
  }
  function ta(value, set, rows = 4) {
    const el = h('textarea', { rows, spellcheck: 'false' });
    el.value = value;
    el.addEventListener('change', () => keepFocus(el, () => edit(() => set(el.value))));
    return el;
  }
  function symProps(s) {
    const S = SYMBOLS[s.type];
    const sd = symbolDef(s, modules());
    const title = s.type === 'module' ? `Module ${s.params.module}` : (sd.shape === 'lib' || sd.shape === 'demux' || sd.shape === 'tbuf') ? `${sd.title} (${S.title})` : `${S?.title || s.type}`;
    const sum = s.type === 'module' ? (S?.description || '') : symbolSummary(s.type, s.params, getLanguage());
    propBody.append(h('div', { class: 'se-ptitle', text: title }), h('div', { class: 'se-note se-sum', 'data-no-i18n': '', text: sum }),
      h('div', { class: 'se-pbtns' }, h('button', { class: 'btn ro-ok se-infobtn', type: 'button', text: 'Symbol Info…', title: 'Symbol Info (F1)', onclick: () => openInfo(infoTarget()) })));
    propBody.append(field('Instance name', inp(s.name, v => { s.name = newName(v, s.name); })));
    for (const p of symbolParams(s)) {
      const v = s.params[p.name];
      let el;
      if (p.kind === 'multi') el = compareTicks(s);   // (a COMP's comparisons, #1555)
      else if (p.kind === 'bool') el = chk(v, x => { s.params[p.name] = x; });
      else if (p.kind === 'select') el = selBox(String(v), p.options, x => { s.params[p.name] = x; });
      else if (s.type === 'slice' && (p.name === 'msb' || p.name === 'lsb')) el = tapIndex(s, p, inp, flash);
      else if (p.kind === 'int') el = inp(v, x => { s.params[p.name] = Math.max(p.min ?? 0, Math.min(p.max ?? 1e6, Math.round(+x || p.default))); }, { type: 'number', min: p.min, max: p.max });
      else el = inp(v, x => { s.params[p.name] = String(x).trim(); });
      el.dataset.param = p.name;
      // (Pins per bit only for a symbol wider than a bit, #2076: off and greyed at Width 1)
      if (p.name === 'bits' && !(+s.params.width > 1)) { el.checked = false; el.disabled = true; }
      // (a device primitive's attribute: its range, #791; a VCC / GND saved with no Width, its net's, #953)
      const legacy = p.name === 'width' && v == null && (s.type === 'vcc' || s.type === 'gnd');
      propBody.append(field(p.label, el, legacy ? 'empty: the width of its net' : el.disabled && p.name === 'bits' ? 'for a Width of 2 or more' : p.note));
    }
    // a multiplexer's select bits (#334): 1 … 4 make it M2_1, M4_1, M8_1, M16_1 (its width, enable and select bus kept)
    if (MUX_INPUTS[s.type]) {
      const el = selBox(String(Math.log2(MUX_INPUTS[s.type])), ['1', '2', '3', '4'], x => { s.type = `mux${1 << +x}`; });
      el.dataset.param = 'muxSel';
      propBody.append(field('Select bits', el));
    }
    // a gate's inputs (#330): 2, 3 or 4 make it AND2, AND3, AND4 (its inverted ones kept while it has them)
    if (S?.gate && S.inputs > 1) {
      const k = S.invIn || 0;
      const to = n => gateVariant(s.type, k, n) || gateVariant(s.type, Math.min(k, n), n) || gateVariant(s.type, 0, n);
      const ns = ['2', '3', '4', ...(S.inputs > 4 ? [String(S.inputs)] : [])].filter(n => to(+n));
      const el = selBox(String(S.inputs), ns, x => { const t = to(+x); if (t) s.type = t; });
      el.dataset.param = 'inputs';
      propBody.append(field('Inputs', el));
    }
    // a gate's inverted inputs (#328): I0..I(k-1) inverted make it the variant that has them (AND3 + 2 = AND3B2)
    if (S?.gate && gateVariant(s.type, 1)) {
      const ks = Array.from({ length: S.inputs + 1 }, (_, k) => String(k)).filter(k => gateVariant(s.type, +k));
      const el = selBox(String(S.invIn || 0), ks, x => { const t = gateVariant(s.type, +x); if (t) s.type = t; });
      el.dataset.param = 'invIn';
      propBody.append(field('Inverted inputs', el));
    }
    // a flip-flop's inputs (#315): each one makes it the Xilinx variant that has it (FD + CE + CLR = FDCE);
    // one the library does not have with the others chosen, unavailable
    if (S?.ff) {
      for (const [q, label] of FF_INPUTS) {
        const t = ffVariant(s.type, { ...S.ff, [q]: !S.ff[q] });
        const el = chk(!!S.ff[q], () => { if (t) s.type = t; });
        el.dataset.ff = q;
        if (!t) el.disabled = true;
        propBody.append(field(label, el, t ? null : 'not with the other inputs chosen (no such Xilinx flip-flop)'));
      }
    }
    if (s.type === 'module') {
      const names = Object.keys(modules()).sort();
      const modOpts = names.includes(s.params.module) ? names : [s.params.module, ...names];
      const modSel = selBox(s.params.module, modOpts, x => { s.params.module = x; s.params.generics = {}; delete s.params.ports; });
      modSel.setAttribute('data-no-i18n', '');   // module names (a module may be called sync, up...)
      propBody.append(field('Module', modSel));
      const m = modules()[s.params.module];
      const gens = m?.generics || Object.keys(s.params.generics || {}).map(k => ({ name: k, default: '' }));
      if (gens.length) {
        const box = h('div', { class: 'se-gens' });
        for (const g of gens) box.append(h('div', { class: 'se-row' }, h('span', { class: 'gn', 'data-no-i18n': '', text: g.name }), inp(s.params.generics?.[g.name] ?? '', x => { s.params.generics ||= {}; if (String(x).trim()) s.params.generics[g.name] = String(x).trim(); else delete s.params.generics[g.name]; }, { placeholder: g.default || '', 'data-no-i18n': '' })));
        propBody.append(field(m?.lang === 'verilog' || doc().lang === 'verilog' ? 'Parameters' : 'Generics', box, 'empty = module default'));
      }
      // a LUT of a technology schematic: its function from its INIT, on demand
      const lut = /^LUT([1-6])(_[LD])?$/i.exec(s.params.module || '');
      const init = lut && Object.entries(s.params.generics || {}).find(([k]) => k.toUpperCase() === 'INIT')?.[1];
      const fn = init ? lutFunction(init, +lut[1]) : null;
      if (fn) propBody.append(lutSection(fn));
      // its symbol out of date (#1183): what changed, Update Symbol (sch-modsym.js)
      propBody.append(...staleSection(s, { readOnly, doc, modules, edit, flash }));
      if (opts.onOpenModule) propBody.append(h('div', { class: 'se-pbtns' }, h('button', { class: 'btn ro-ok', type: 'button', text: readOnly ? 'Open this instance' : 'Open module source', onclick: () => opts.onOpenModule(s.params.module, { instance: s.name, symbol: clone(s) }) })));
    }
    if (s.type === 'hdlblock') {
      propBody.append(field('Title', inp(s.params.title || '', x => { s.params.title = String(x); })));
      const pinsTa = (list, out) => ta((list || []).map(q => `${q.name}${q.width > 1 ? `[${q.width}]` : ''}${q.clock ? ' clock' : ''}${q.reg ? ' reg' : ''}`).join('\n'), v => {
        s.params[out ? 'outputs' : 'inputs'] = v.split(/[\n,]/).map(l => l.trim()).filter(Boolean).map(l => {
          const m = /^([A-Za-z_][\w$]*)\s*(?:\[\s*(\d+)\s*\])?\s*(.*)$/.exec(l);
          if (!m) return null;
          const q = { name: m[1], width: Math.max(1, +(m[2] || 1)) };
          if (/\bclock\b/.test(m[3])) q.clock = true;
          if (/\breg\b/.test(m[3])) q.reg = true;
          return q;
        }).filter(Boolean);
      }, 3);
      propBody.append(field('Input pins', pinsTa(s.params.inputs, false), 'one per line: name[width] (add "clock" for a clock pin)'));
      propBody.append(field('Output pins', pinsTa(s.params.outputs, true), doc().lang === 'verilog' ? 'name[width], add "reg" if assigned in always/initial' : 'name[width]'));
      const code = ta(s.hdl || '', v => { s.hdl = v; }, 12);
      code.classList.add('code');
      propBody.append(field(`${(doc().hdl?.lang || doc().lang).toUpperCase()} statements (emitted verbatim)`, code));
      code.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const p = code.selectionStart; code.setRangeText('  ', p, code.selectionEnd, 'end'); } });
    }
    const nets = symbolPins(s, modules()).map(p => `${p.name} → ${nl()?.pinNet.get(`${s.id}/${p.name}`)?.name ?? '(unconnected)'}`);
    if (nets.length) propBody.append(h('details', { class: 'se-sec' }, h('summary', { text: `Pins (${nets.length})` }), h('pre', { class: 'se-pins', text: nets.join('\n') })));
  }
  // a name typed in the properties (an I/O marker, a net): the old one kept when it is empty or a reserved
  // word of VHDL or Verilog, in any letter case (#679), said
  function refused(v) {
    const r = reservedError(parseNetName(String(v).trim()).base);
    if (r) flash(`${r}: choose another name.`);
    return !!r;
  }
  function newName(v, old) {
    const name = String(v).trim();
    return !name || refused(name) ? old : name;
  }
  function portProps(p) {
    propBody.append(h('div', { class: 'se-ptitle', text: 'I/O Marker' }));
    propBody.append(field('Name', inp(p.name, v => { p.name = newName(v, p.name); })));
    propBody.append(field('Direction', selBox(p.dir, [['in', 'Input'], ['out', 'Output'], ['inout', 'Bidirectional']], v => { p.dir = v; })));
    propBody.append(field('Width', inp(p.width, v => { p.width = Math.max(1, Math.round(+v || 1)); if (p.type && !/\(|\[/.test(p.type) && p.width > 1) delete p.type; }, { type: 'number', min: 1 })));
    propBody.append(field('HDL type', inp(p.type || '', v => { if (String(v).trim()) p.type = String(v).trim(); else delete p.type; }, { placeholder: doc().lang === 'vhdl' ? (p.width > 1 ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic') : (p.width > 1 ? `[${p.width - 1}:0]` : ''), 'data-no-i18n': '' }), 'optional, overrides the type derived from the width'));
    // (no Rotate / Mirror / Delete buttons: the toolbar and Ctrl+R / Ctrl+M / Del do it, #949)
  }
  function labelProps(l) {
    propBody.append(h('div', { class: 'se-ptitle', text: 'Net Name' }));
    propBody.append(field('Name', inp(l.net, async v => {
      if (refused(v)) return false;
      if (!await joinByName(String(v).trim(), nl()?.labelNet.get(l.id))) return false;
      return () => renameLabel(l, v);
    }), 'ISE style bus names are accepted: data(7:0)'));
    netInfo(nl()?.labelNet.get(l.id));
  }
  // (in an edit; Rename…, #1546, too) the whole net connected by name (#734): its other net names and I/O marker of
  // the old name too
  function renameLabel(l, v) {
    const name = String(v).trim(); if (!name) return;
    const n = nl()?.labelNet.get(l.id);
    if (n) renamed(renameNet(doc(), nl(), n, name, l.id), name); else l.net = name;
  }
  function wireProps(w) {
    const n = nl()?.wireNet.get(w.id);
    propBody.append(h('div', { class: 'se-ptitle', text: `Wire${n ? ` · net ${n.name}` : ''}` }));
    // (its own curve, #1144: dropped, the curve derived from its path again)
    if (Array.isArray(w.curve) && doc().wireStyle === 'curved') {
      propBody.append(h('div', { class: 'se-pbtns' }, h('button', { class: 'btn', type: 'button', text: 'Reset curve', title: 'Drop this wire\'s own curve: drawn again from its rectilinear path', onclick: () => edit(() => { delete doc().wires.find(x => x.id === w.id)?.curve; }) })));
    }
    if (n) propBody.append(field('Rename net', inp(n.auto ? '' : n.name, async v => {
      if (refused(v)) return false;
      if (!await joinByName(String(v).trim(), n)) return false;
      return () => {
        const name = String(v).trim(); if (!name) return;
        const p0 = w.points[0], p1 = w.points[1];
        const mid = { x: snap((p0.x + p1.x) / 2), y: snap((p0.y + p1.y) / 2) };
        const ex = doc().labels.find(l => nl().labelNet.get(l.id) === n);
        // (#734) the net's names and I/O marker of its old name renamed with it; a net without a name of its own
        // gets one here
        const r = n.auto ? { labels: [], ports: [] } : renameNet(doc(), nl(), n, name, ex?.id);
        if (!ex && !r.ports.length) doc().labels.push({ id: nextId('L', doc().labels), x: p0.x === p1.x ? p0.x : mid.x, y: p0.y === p1.y ? p0.y : mid.y, net: name });
        if (ex || r.ports.length) renamed(ex ? r : { ...r, labels: [null, ...r.labels] }, name);
      };
    }, { placeholder: n.name, 'data-no-i18n': '' })));
    netInfo(n);
  }
  function netInfo(n) {
    if (!n) return;
    const eps = n.endpoints.map(e => (e.kind === 'pin' ? `${doc().symbols.find(s => s.id === e.sym)?.name}.${e.pin} (${e.dir})` : `I/O ${doc().ports.find(p => p.id === e.port)?.name}`));
    propBody.append(h('div', { class: 'se-note', text: `Net '${n.name}', ${n.width} bit${n.width > 1 ? 's' : ''}` }), h('pre', { class: 'se-pins', text: eps.join('\n') || '(no connections)' }));
  }

  return { renderProps, openSelected, renamed, joinByName, renameLabel };
}

// a bus tap's MSB / LSB index (#1815): it takes the bits MSB downto LSB, so an MSB below its LSB (or an LSB above its
// MSB) is refused, the reason said, the field back to its value
function tapIndex(s, p, inp, flash) {
  const other = () => Math.max(0, Math.round(+s.params[p.name === 'msb' ? 'lsb' : 'msb'] || 0));
  const el = inp(s.params[p.name], x => {
    const n = Math.max(0, Math.round(+x || 0)), o = other();
    if (p.name === 'msb' ? n < o : n > o) {
      flash(p.name === 'msb' ? `A bus tap takes the bits MSB downto LSB: its MSB (${n}) cannot be below its LSB (${o})`
        : `A bus tap takes the bits MSB downto LSB: its LSB (${n}) cannot be above its MSB (${o})`, 4000);
      el.value = s.params[p.name];
      return;
    }
    s.params[p.name] = n;
  }, { type: 'number', ...(p.name === 'msb' ? { min: other() } : { min: 0, max: other() }) });
  return el;
}

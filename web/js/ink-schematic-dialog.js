// The Handwritten Schematic dialog (#1067): the user draws a combinational circuit on the pad (ink-pad.js) — gates
// larger than the names, inputs on the left, a small circle for an inversion, flip-flops as boxes with their pins'
// labels (#1083), square wires, a name at each input's and output's wire end — and Silinx's own recognizer (core/ink/schematic.js, offline) reads it after each stroke.
// The circuit read is listed, each gate's type and each name to correct, then made into the schematic
// (core/ink/schematic-doc.js: Silinx's symbols where they were drawn, the wires routed).
//
//   await handwrittenSchematic({ name, lang, replaces }) -> { doc, circuit } | null
//     replaces: the schematic has a drawing already (the dialog says it is replaced, Undo bringing it back)
// Styles: web/css/ink.css.
import { h, dialog } from './ui.js';
import { mountInkPad, padButtons } from './ink-pad.js';
import { drawingButtons } from './ink-drawing.js';
import { circuitText } from '/core/ink/corpus.js';
import { inkTemplates } from './ink-dialog.js';
import { readSchematic, circuitErrors, gateName } from '/core/ink/schematic.js';
import { schematicFromCircuit } from '/core/ink/schematic-doc.js';
import { InkError } from '/core/ink/segment.js';
import { SYMBOLS } from '/core/schdoc.js';

const KINDS = [['and', 'AND'], ['or', 'OR'], ['xor', 'XOR'], ['nand', 'NAND'], ['nor', 'NOR'], ['xnor', 'XNOR']];
// the types a gate of n inputs can be: the symbols that exist
const typesFor = n => (n === 1 ? [['buf', 'BUF'], ['inv', 'NOT']] : KINDS.map(([k, l]) => [`${k}${n}`, l])).filter(([t]) => SYMBOLS[t]);

export function handwrittenSchematic({ name = 'schematic', lang = 'vhdl', replaces = false, title = 'Handwritten Schematic' } = {}) {
  const templates = inkTemplates();
  let timer = null, circuit = null;
  const msg = h('div', { class: 'ink-msg' });
  const list = h('div', { class: 'ink-circuit' });
  const showMsg = (lines, kind = 'warn') => { msg.className = `ink-msg ink-${kind}`; msg.replaceChildren(...lines.map(l => h('div', {}, l))); };
  const check = () => { const e = circuit ? circuitErrors(circuit) : ['Nothing drawn: draw the circuit on the pad.']; showMsg([...e, ...(circuit?.warnings || [])], e.length || circuit?.warnings.length ? 'warn' : 'ok'); return !e.length; };
  const padHost = h('div', { class: 'ink-pad ink-pad-full' });
  const pad = mountInkPad(padHost, { onStroke: () => { clearTimeout(timer); timer = setTimeout(recognize, 400); } });
  const flush = () => { if (timer) { clearTimeout(timer); recognize(); } };
  // (a correction typed by hand: the reading still pending would write over it, #2389; the next stroke reads again)
  const edited = () => { clearTimeout(timer); timer = null; };
  // the circuit read: a row a gate (its type to choose), a row a name (to correct)
  function renderList() {
    list.replaceChildren();
    if (!circuit) return;
    const netLabel = id => { const n = circuit.nets.find(x => x.id === id); return n?.name || id || '?'; };
    for (const g of circuit.gates) {
      // (a flip-flop, #1083: its symbol, its pins by their names, its outputs)
      if (g.kind === 'ff') {
        const pins = Object.entries(g.pins).map(([p, n]) => `${p}: ${netLabel(n)}`).join(', ');
        const outs = Object.entries(g.outputs).map(([p, n]) => `${p === 'QN' ? 'Q̄' : p}: ${netLabel(n)}`).join(', ');
        list.append(h('div', { class: 'ink-row ink-gate ink-ff' }, h('b', {}, g.id), h('span', { class: 'ink-ff-type', 'data-no-i18n': '' }, gateName(g)), h('code', { 'data-no-i18n': '' }, `(${pins}) → ${outs || '?'}`)));
        continue;
      }
      const sel = h('select', { class: 'ink-gate-type', onchange: () => { edited(); g.type = sel.value; } },
        ...typesFor(g.inputs.length).map(([t, l]) => h('option', { value: t, selected: t === g.type }, `${l}${g.inputs.length > 1 ? ` (${g.inputs.length})` : ''}`)));
      list.append(h('div', { class: 'ink-row ink-gate' }, h('b', {}, g.id), sel, h('code', { 'data-no-i18n': '' }, `(${g.inputs.map(netLabel).join(', ')}) → ${netLabel(g.output)}`)));
    }
    for (const n of circuit.nets.filter(x => x.name)) {
      const inp = h('input', { type: 'text', class: 'ink-net-name', value: n.name, spellcheck: 'false' });
      inp.addEventListener('input', () => { edited(); n.name = inp.value.trim(); check(); });
      list.append(h('div', { class: 'ink-row ink-net' }, h('span', {}, n.dir === 'in' ? 'Input:' : 'Output:'), inp));
    }
  }
  function recognize() {
    timer = null;
    const strokes = pad.strokes();
    circuit = null;
    if (!strokes.length) { pad.setLabels([]); renderList(); showMsg([]); return; }
    try {
      circuit = readSchematic(strokes, { templates });
      pad.setLabels(circuit.gates.map(g => ({ ch: `${g.id} ${gateName(g)}`, box: g.box })));
      renderList();
      check();
    } catch (e) {
      if (!(e instanceof InkError)) throw e;
      pad.setLabels([]); renderList(); showMsg([e.message]);
    }
  }
  // Undo, Redo, Clear; Copy Drawing and Paste Drawing (#1749)
  const padRow = padButtons(pad);
  padRow.append(...drawingButtons(pad, { kind: 'schematic', read: () => (circuit ? circuitText(circuit) : '') }));
  // the whole page (#1088): the pad, its hints over it; beside it its buttons, the circuit read, the messages
  const body = h('div', { class: 'ink-dialog ink-full-body' },
    h('div', { class: 'ink-main' },
      h('div', { class: 'hint' }, "Draw the circuit with a pen, a finger or the mouse: the gates (AND, OR, XOR, a triangle for a buffer, a small circle at the output for NOT) larger than the names, their inputs on the left, square wires, and the name of each input and output at its wire's end."),
      h('div', { class: 'hint' }, 'A flip-flop: a box with its pins written inside it, on the left D, T, or J and K, the clock (C, CLK or a wedge), CE, CLR, PRE; on the right Q, and Q with a bar.'),
      ...(replaces ? [h('div', { class: 'hint ink-replaces' }, 'The schematic drawn replaces the one in the editor (Undo brings it back).')] : []),
      padHost),
    h('div', { class: 'ink-side' },
      padRow,
      h('label', {}, 'Recognized:'), list, msg));
  return dialog({
    title, width: '100vw', body, className: 'ink-dlg ink-full',
    onOpen: () => setTimeout(() => { if (body.contains(document.activeElement)) document.activeElement.blur(); }, 0),
    buttons: [
      { label: 'Create Schematic', primary: true, validate: () => { flush(); return check(); }, value: () => ({ ...schematicFromCircuit(circuit, { name, lang }), circuit }) },
      { label: 'Cancel', value: null },
    ],
  }).finally(() => { clearTimeout(timer); pad.destroy(); });
}

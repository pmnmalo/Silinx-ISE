// The Petri net editor's side panel (#405: out of mountPetriEditor in petri-editor.js): the selection's fields (a
// place's name, tokens, capacity and outputs; a transition's name, guard, pulses and priority; an arc's weight and
// inhibitor), the net's (its name, inputs, outputs, clock, reset, description), its problems, and the link to its HDL.
import { formatOutputs, parseOutputs } from '/core/fsm.js';
import { h } from './ui.js';
import { validatePetri } from '/core/petri.js';

const ioText = list => list.map(p => (p.width > 1 ? `${p.name}[${p.width}]` : p.name)).join(', ');
const parseIo = text => String(text || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).map(s => {
  const m = /^([A-Za-z][A-Za-z0-9_]*)(?:\[(\d+)\])?$/.exec(s);
  return m ? { name: m[1], width: Math.max(1, Math.min(32, +(m[2] || 1))) } : null;
}).filter(Boolean);

/** { refreshLink, renderSide } of mountPetriEditor (M(), sel(): its current values). */
export function mountPetriSide(ctx) {
  const {
    opts, M, btn, commit, linkHost, netBody, nodeOf, placeOf, probCount, probList, render, sel, selSection, status,
    transOf, setSel
  } = ctx;

  // ---------------------------------------------------------------- side panel
  const field = (label, input, hintText) => h('label', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), input, hintText ? h('span', { class: 'asm-fhint' }, hintText) : null);
  const text = (value, onChange, cls = '') => { const i = h('input', { type: 'text', class: `asm-input ${cls}`, value: value ?? '', spellcheck: 'false' }); i.addEventListener('change', () => onChange(i.value)); return i; };
  const number = (value, min, max, onChange) => { const i = h('input', { type: 'number', class: 'asm-input', value: String(value), min: String(min), max: String(max) }); i.addEventListener('change', () => onChange(Math.max(min, Math.min(max, Math.round(+i.value || min))))); return i; };
  function renderSide() {
    selSection.replaceChildren();
    if (!sel()) selSection.append(h('p', { class: 'asm-muted' }, 'Nothing selected: click a place, a transition or an arc'));
    else if (sel().kind === 'place') {
      const p = placeOf(sel().id);
      if (p) selSection.append(h('h3', {}, `Place ${p.name}`),
        field('Name', text(p.name, v => { p.name = v.trim() || p.name; commit(); }, 'mono')),
        field('Initial tokens', number(p.tokens, 0, 255, v => { p.tokens = v; p.capacity = Math.max(p.capacity, v); commit(); })),
        field('Capacity', number(p.capacity, 1, 255, v => { p.capacity = v; p.tokens = Math.min(p.tokens, v); commit(); }), '1: a safe place (one flip-flop); more: a counter'),
        field('Outputs while marked', text(formatOutputs(p.outputs), v => { const o = parseOutputs(v); if (o.error) status(o.error, true); else { p.outputs = o.outputs; commit(); } }, 'mono'), 'e.g. busy=1, st=2'));
    } else if (sel().kind === 'transition') {
      const t = transOf(sel().id);
      const pos = M().transitions.indexOf(t);
      const move = d => { const k = pos + d; if (k < 0 || k >= M().transitions.length) return; M().transitions.splice(pos, 1); M().transitions.splice(k, 0, t); commit(); };
      if (t) selSection.append(h('h3', {}, `Transition ${t.name}`),
        field('Name', text(t.name, v => { t.name = v.trim() || t.name; commit(); }, 'mono')),
        field('Guard', text(t.guard, v => { t.guard = v.trim(); commit(); }, 'mono'), 'a condition on the inputs, e.g. go & !stop (empty: always)'),
        field('Pulses when it fires', text(formatOutputs(t.outputs), v => { const o = parseOutputs(v); if (o.error) status(o.error, true); else { t.outputs = o.outputs; commit(); } }, 'mono'), '1 during the clock cycle after it fired'),
        h('div', { class: 'asm-label' }, `Priority ${pos + 1} of ${M().transitions.length} (in a conflict, the first takes the tokens)`),
        h('div', { class: 'asm-row' }, btn('▲ Higher', 'Fire before the others', () => move(-1), 'asm-small'), btn('▼ Lower', 'Fire after the others', () => move(1), 'asm-small')));
    } else {
      const a = M().arcs.find(x => x.id === sel().id);
      if (a) selSection.append(h('h3', {}, `Arc ${nodeOf(a.from)?.name ?? '?'} → ${nodeOf(a.to)?.name ?? '?'}`),
        field('Weight', number(a.weight, 1, 255, v => { a.weight = v; commit(); }), a.inhibitor ? 'the transition fires while the place holds fewer tokens than this' : placeOf(a.from) ? 'the tokens it takes' : 'the tokens it puts'),
        ...(placeOf(a.from) ? [h('label', { class: 'asm-check' }, (() => { const c = h('input', { type: 'checkbox', checked: !!a.inhibitor }); c.addEventListener('change', () => { if (c.checked) a.inhibitor = true; else delete a.inhibitor; commit(); }); return c; })(), ' Inhibitor arc')] : []));
    }
    // the net
    netBody.replaceChildren(
      field('Module name', text(M().name, v => { M().name = v.trim() || M().name; commit(); }, 'mono')),
      field('Inputs', text(ioText(M().inputs), v => { M().inputs = parseIo(v); commit(); }, 'mono'), 'names, a width in brackets: go, sel[2]'),
      field('Outputs', text(ioText(M().outputs), v => { M().outputs = parseIo(v); commit(); }, 'mono'), 'e.g. busy, st[2]'),
      field('Clock', text(M().clock, v => { M().clock = v.trim() || 'clk'; commit(); }, 'mono')),
      field('Reset (synchronous, to the initial marking)', text(M().reset.name, v => { M().reset.name = v.trim() || 'rst'; commit(); }, 'mono')),
      field('Description', (() => { const ta = h('textarea', { class: 'asm-input', rows: 2 }, M().description || ''); ta.addEventListener('change', () => { M().description = ta.value; commit(); }); return ta; })()));
    // the problems
    const diags = validatePetri(M());
    probList.replaceChildren(...diags.map(d => {
      const li = h('li', { class: `asm-prob ${d.severity}` }, d.message);
      if (d.ref?.id) li.addEventListener('click', () => { setSel({ kind: d.ref.kind, id: d.ref.id }); render(); });
      return li;
    }));
    probCount.textContent = diags.length ? `(${diags.length})` : '';
  }
  function refreshLink() {
    const li = opts.linkInfo?.();
    // (the file in sync unsaid, as the other drawings', its name in data-hdl, #2505)
    linkHost.dataset.hdl = li?.file ? li.file.split('/').pop() : '';
  }

  return { refreshLink, renderSide };
}

// The parts of a drawing's Simulate panel shared by the state diagram's (fsm-bottom.js) and the ASM chart's (asm-sim.js,
// #2880): the inputs' controls (a button per bit, a click toggling it; a number field per vector) and the trace of the
// last cycles.
import { h } from './dom.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The inputs' controls, made once per set of inputs and kept (#240: drawn again at every clock edge of Run, a click
 * whose press and release fell on each side of an edge went to an element no longer there): inputs() [{ name, width }],
 * values() { name: value } (changed in place), changed() after a change. Returns controls() → the element, showing
 * values().
 */
export function simInputControls({ inputs, values, changed }) {
  let made = null;   // { key: the inputs (names, widths), el: their controls, set(): the controls show values() }
  return () => {
    const list = inputs();
    const key = JSON.stringify(list.map((i) => [i.name, i.width]));
    if (made?.key !== key) {
      const sets = [];
      const el = h('div', { class: 'fsm-sim-inputs' }, ...list.map((i) => {
        if (i.width === 1) {
          const b = h('button', { type: 'button', class: 'asm-btn fsm-bit', 'data-input': i.name, title: i.title || 'Click to toggle the input' });
          b.addEventListener('click', () => { values()[i.name] = Number(values()[i.name]) ? 0 : 1; changed(); });
          sets.push(() => {
            const t = `${i.name} = ${Number(values()[i.name])}`;
            if (b.textContent !== t) b.textContent = t;
            b.classList.toggle('on', !!Number(values()[i.name]));
          });
          return b;
        }
        const max = 2 ** i.width - 1;
        const e = h('input', { type: 'number', class: 'asm-input fsm-bus', min: 0, max, 'data-input': i.name });
        e.addEventListener('change', () => { values()[i.name] = clamp(parseInt(e.value, 10) || 0, 0, max); changed(); });
        sets.push(() => { if (document.activeElement !== e) e.value = String(values()[i.name]); });
        return h('label', { class: 'fsm-busl' }, `${i.name} = `, e);
      }));
      made = { key, el, set: () => sets.forEach((f) => f()) };
    }
    made.set();
    return made.el;
  };
}

/** The last `n` cycles of a trace ([{ cycle, state, inputs: {}, outputs: {}, next }]), the latest first; none: nothing. */
export function simTraceTable(trace, n = 12) {
  if (!trace.length) return [];
  const pairs = (o) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(' ');
  return [h('table', { class: 'fsm-table fsm-trace' },
    h('tr', {}, h('th', {}, 'Cycle'), h('th', {}, 'State'), h('th', {}, 'Inputs'), h('th', {}, 'Outputs'), h('th', {}, 'Next state')),
    ...trace.slice(-n).reverse().map((x) => h('tr', {}, h('td', {}, String(x.cycle)), h('td', {}, x.state), h('td', { class: 'mono' }, pairs(x.inputs)),
      h('td', { class: 'mono' }, pairs(x.outputs)), h('td', {}, x.next))))];
}

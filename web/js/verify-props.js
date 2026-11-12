// Verify Property (#3177): a state diagram's or an ASM chart's property (a state never reached, a state reached, 1-bit
// outputs never 1 together), from the drawing's ⋮ menu: the property and the depth asked, proved by Yosys's SAT solver
// in the page's worker (core/verify-props.js, as the MCP server's verify), its messages in the console; a counterexample
// (or a reached state's way there): its test bench written into the project (the drawing's HDL with the property, and
// the bench: sim/verify_<module>) and simulated, the property's assertion reported by the simulation.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { verifyProperty, propertyMessages, propertyBench, propertyError, PROPERTY_PROCESS } from '/core/verify-props.js';
import { VERIFY_DEPTH, MAX_DEPTH } from '/core/verify.js';
import { log } from './console.js';
import { saveAll } from './processes.js';
import { runSimulation } from './viewers.js';
import { writeBench, verifySources, timeLimitField, fieldError, depthOk } from './verify.js';

const last = {};
const KINDS = [['never', 'Never reaches a state'], ['reach', 'Reaches a state'], ['exclusive', 'Outputs never 1 together']];

// the drawing's states and 1-bit outputs
function namesOf(m) {
  const states = (Array.isArray(m.states) ? m.states : (m.nodes || []).filter(n => n.type === 'state')).map(s => s.name);
  return { states, bits: (m.outputs || []).filter(o => (o.width ?? 1) === 1).map(o => o.name) };
}

/** The property, the depth and the time limit asked: { property, depth, timeLimit }, or null (cancelled). */
async function askProperty(m) {
  const { states, bits } = namesOf(m);
  const prev = last[m.name] || {};
  const kind = h('select', { style: { width: '100%' } }, ...KINDS.map(([v, l]) => h('option', { value: v, selected: v === (prev.kind || 'never') }, l)));
  const state = h('select', { style: { width: '100%' } }, ...states.map(n => h('option', { value: n, 'data-no-i18n': true, selected: n === prev.state }, n)));
  const boxes = bits.map(n => h('input', { type: 'checkbox', value: n, checked: (prev.outputs || []).includes(n) }));
  const outs = h('div', { class: 'verify-outs' }, ...bits.map((n, i) => h('label', { 'data-no-i18n': true }, boxes[i], ` ${n}`)));
  const depth = h('input', { type: 'number', min: 1, max: MAX_DEPTH, value: last.depth || VERIFY_DEPTH, style: { width: '6em' } });
  const stateRow = h('div', {}, h('label', { style: { display: 'block', marginTop: '8px' } }, 'State:'), state);
  const outsRow = h('div', {}, h('label', { style: { display: 'block', marginTop: '8px' } }, 'Outputs (1 bit):'), outs);
  const show = () => { stateRow.hidden = kind.value === 'exclusive'; outsRow.hidden = kind.value !== 'exclusive'; };
  kind.addEventListener('change', show);
  show();
  const err = fieldError(), limit = timeLimitField(err);
  const property = () => (kind.value === 'exclusive' ? { kind: 'exclusive', outputs: boxes.filter(b => b.checked).map(b => b.value) } : { kind: kind.value, state: state.value });
  const r = await dialog({
    title: PROPERTY_PROCESS, width: 460,
    body: h('div', { class: 'verify-dlg' },
      h('p', {}, 'Proves a property of the state machine for every input sequence, or shows the first clock cycle where it fails.'),
      h('label', {}, 'Property:'), kind, stateRow, outsRow,
      h('label', { style: { display: 'block', marginTop: '8px' } }, 'Depth (clock cycles):'), depth, limit.row, err.el),
    buttons: [{ label: 'Verify', primary: true, value: true, validate: () => {
      if (!depthOk(depth, err)) return false;
      const why = propertyError(m, property());
      if (why) return err.say(why);
      return limit.ok();
    } }, { label: 'Cancel', value: null }],
  });
  if (!r) return null;
  last[m.name] = property();
  last.depth = +depth.value;
  return { property: property(), depth: +depth.value, timeLimit: +limit.input.value };
}

/** Verify Property of a drawing (its model m, of file `path`): the property asked, proved, a counterexample simulated. */
export async function propertyProcess(m, { property, depth, timeLimit } = {}) {
  if (!property) {
    const a = await askProperty(m);
    if (!a) return null;
    ({ property, depth, timeLimit } = a);
  }
  try {
    await saveAll();
    const run = await (await import('./emulator.js')).emulatorYosys(api.standalone);
    const r = await verifyProperty(verifySources(), { drawing: m, property, depth: depth ?? VERIFY_DEPTH, timeLimit, run });
    const b = r.status === 'failed' ? propertyBench(r) : null;
    const bench = b ? await writeBench(b.name, b.path, () => b.text) : null;
    for (const x of propertyMessages(r, { bench })) log(x.text, x.kind === 'info' ? undefined : x.kind);
    if (bench) await runSimulation(b.name);
    return r;
  } catch (e) { log(`ERROR:Verify - ${e.message}`, 'err'); return null; }
}

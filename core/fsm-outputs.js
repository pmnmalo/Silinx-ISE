// A state's or a transition's outputs as a table of the machine's outputs (#3814): one row per output, its name and
// width as the machine declares them, its value in this state or transition (empty: not set, the output's default,
// or on a transition the state's value). The model is the one the Outputs text box wrote ({ name: valueText }, an
// output not set left out), so files and the generated HDL stay as they were. The FSM editor's Properties
// (web/js/fsm-side.js) and the MCP's set_fsm_outputs (server/mcp-fsm.js) set the values through these, with the same
// checks: an output the machine has, a constant that fits in its width.
import { constValue, outputProblems, stateById } from './fsm.js';

/** The rows of `outs` ({ name: valueText }) for the machine `m`: [{ name, width, default, value, placeholder }], one per
 *  output of the machine in its order; `base` ({ name: valueText }, a transition's state's outputs): what an empty
 *  value stands for when it has one, else the output's default. */
export function outputRows(m, outs, base = null) {
  return (m.outputs || []).map((o) => ({ name: o.name, width: o.width, default: o.default,
    value: outs?.[o.name] ?? '', placeholder: base?.[o.name] ?? o.default }));
}

/** Why `value` (text) cannot be the value of `output` ({ name, width }), or null: empty (its default), or a constant
 *  that fits in its width; the constant's message is Check's (outputProblems), the width's Check's warning. */
export function outputValueProblem(value, output) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const bad = outputProblems({ [output.name]: v }, [output]);
  if (bad.length) return bad[0];
  if (constValue(v) >= 1n << BigInt(output.width)) return `the value ${v} of ${output.name} does not fit in ${output.width} bit(s)`;
  return null;
}

/** `outs` with `name`'s value set to `value` (empty: left out, the default): { outputs } (a new object, the others in
 *  their order, a new one last), or { error } (an output the machine does not have, a value refused). */
export function setOutputValue(outs, name, value, outputs) {
  const o = (outputs || []).find((p) => p.name === name);
  if (!o) return { error: `'${name}' is not an output` };
  const error = outputValueProblem(value, o);
  if (error) return { error };
  const v = String(value ?? '').trim(), r = { ...(outs || {}) };
  if (v) r[name] = v; else delete r[name];
  return { outputs: r };
}

/** `outs` with several values set ({ name: valueText }, an empty one cleared): { outputs } or { error } (the first). */
export function setOutputValues(outs, values, outputs) {
  let r = { ...(outs || {}) };
  for (const [name, value] of Object.entries(values || {})) {
    const s = setOutputValue(r, name, value, outputs);
    if (s.error) return s;
    r = s.outputs;
  }
  return { outputs: r };
}

/** The values of output `from` given to `to` in every state and transition of `m` (an output renamed), in place; not
 *  when `to` is empty or the name of another output. The number of states and transitions changed. */
export function renameOutputValues(m, from, to) {
  if (!to || from === to || (m.outputs || []).filter((o) => o.name === to).length > 1) return 0;
  let n = 0;
  for (const x of [...m.states, ...m.transitions]) {
    if (!x.outputs || !(from in x.outputs) || to in x.outputs) continue;
    x.outputs = Object.fromEntries(Object.entries(x.outputs).map(([k, v]) => [k === from ? to : k, v]));
    n++;
  }
  return n;
}

/** The values of output `name` left out of every state and transition of `m` (an output removed), in place. */
export function dropOutputValues(m, name) {
  let n = 0;
  for (const x of [...m.states, ...m.transitions]) if (x.outputs && name in x.outputs) { delete x.outputs[name]; n++; }
  return n;
}

/** "State S1" or "Transition S1 → S2", as Check names them (validateFsm). */
export function outputsWhere(m, sel) {
  if (sel.type === 'state') return `State ${stateById(m, sel.id)?.name || '?'}`;
  const t = m.transitions.find((x) => x.id === sel.id);
  return `Transition ${stateById(m, t?.from)?.name || '?'} → ${stateById(m, t?.to)?.name || '?'}`;
}

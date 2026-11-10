// Silinx - formal verification of a drawing's properties (#3177): a state diagram's (core/fsm.js) or an ASM chart's
// (core/asm.js) property, proved as core/verify-assert.js proves a module's assertions. The property is an assertion
// of a copy of the drawing's HDL, `<module>_props` (the HDL its generator writes, with its state register state_reg
// and its states' constants S_<state>; the project's own file is not changed):
//   never:     the machine never reaches state S          (assert state_reg /= S_S)
//   reach:     the machine reaches state S                (the same assertion: its counterexample is the way there)
//   exclusive: two 1-bit outputs or more are never 1 together (assert no two of them are 1)
// A counterexample's test bench holds the copy and the bench (sim/verify_<module>): the simulation reports the
// property's assertion at the clock cycle the proof found.
//
//   const r = await verifyProperty(sources, { drawing, property: { kind, state | outputs }, depth, run })
//   r: verifyAssertions' result, and module, property, holds (the property holds: never and exclusive proved, reach
//      failed, i.e. reached), copy ({ path, text, name, lang })
import { generateFsm } from './fsm-hdl.js';
import { normalizeFsm } from './fsm.js';
import { generate as generateAsm } from './asm-gen.js';
import { normalizeModel as normalizeAsm } from './asm.js';
import { verifyAssertions } from './verify-assert.js';
import { VERIFY_DEPTH } from './verify.js';
import { counterexampleBench, benchName } from './verify-bench.js';

export const PROPERTY_PROCESS = 'Verify Property';
export const PROPERTY_KINDS = ['never', 'reach', 'exclusive'];

// the drawing normalized, its states' and 1-bit outputs' names
function drawingOf(drawing) {
  const fsm = drawing?.kind === 'fsm' || (Array.isArray(drawing?.states) && !Array.isArray(drawing?.nodes));
  const m = fsm ? normalizeFsm(drawing) : normalizeAsm(drawing);
  const states = fsm ? m.states.map(s => s.name) : m.nodes.filter(n => n.type === 'state').map(n => n.name);
  return { m, fsm, states, bits: m.outputs.filter(o => (o.width ?? 1) === 1).map(o => o.name) };
}

/** A property's words, as the console says them: "never reaches state S", "reaches state S", "never has a and b both 1". */
export function propertyText(p) {
  if (p.kind === 'never') return `never reaches state ${p.state}`;
  if (p.kind === 'reach') return `reaches state ${p.state}`;
  return `never has ${p.outputs.slice(0, -1).join(', ')} and ${p.outputs[p.outputs.length - 1]} both 1`;
}

/** The property's problem with this drawing (a message), or null. */
export function propertyError(drawing, p) {
  const d = drawingOf(drawing);
  if (!p || !PROPERTY_KINDS.includes(p.kind)) return `a property is one of ${PROPERTY_KINDS.join(', ')}`;
  if (p.kind !== 'exclusive') {
    if (!p.state) return `the property '${p.kind}' needs a state`;
    if (!d.states.includes(p.state)) return `'${p.state}' is not a state of '${d.m.name}' (its states: ${d.states.join(', ')})`;
    return null;
  }
  const outs = p.outputs || [];
  if (outs.length < 2) return 'the property \'exclusive\' needs two 1-bit outputs or more';
  const bad = outs.find(o => !d.bits.includes(o));
  if (bad) return `'${bad}' is not a 1-bit output of '${d.m.name}' (its 1-bit outputs: ${d.bits.join(', ') || 'none'})`;
  if (new Set(outs).size !== outs.length) return 'the property \'exclusive\' names an output twice';
  return null;
}

/** The copy of the drawing's HDL with the property's assertion (withCheck false: without it): { name, path, lang, text, check (its line) }. */
export function propertyCopy(drawing, p, lang, { withCheck = true } = {}) {
  const d = drawingOf(drawing);
  const g = d.fsm ? generateFsm(d.m, lang || d.m.lang) : generateAsm(d.m, lang || d.m.lang);
  const name = `${d.m.name}_props`, V = g.lang === 'vhdl';
  const word = new RegExp(`\\b(entity|architecture rtl of|end entity|module) ${d.m.name}\\b`, 'g');
  let text = g.code.replace(word, `$1 ${name}`);
  const msg = p.kind === 'exclusive' ? `${d.m.name} has two of ${p.outputs.join(', ')} 1 together` : `${d.m.name} reaches state ${p.state}`;
  let check;
  if (p.kind === 'exclusive') {
    // (no two of them both 1)
    const pairs = p.outputs.flatMap((a, i) => p.outputs.slice(i + 1).map(b => [a, b]));
    check = V ? `not (${pairs.map(([a, b]) => `(${a} = '1' and ${b} = '1')`).join(' or ')})` : `!(${pairs.map(([a, b]) => `(${a} && ${b})`).join(' || ')})`;
  } else check = V ? `state_reg /= S_${p.state}` : `state_reg != S_${p.state}`;
  const line = V ? `    verify_property : assert ${check} report "${msg}" severity error;` : `    always @* verify_property: assert (${check}) else $error("${msg}");`;
  const comment = `${V ? '--' : '//'} the property Verify proves (#3177): '${d.m.name}' ${propertyText(p)}`;
  if (!withCheck) return { name, path: `sim/${name}.${V ? 'vhd' : 'v'}`, lang: g.lang, text, check: line };
  text = V ? text.replace(/\nend architecture rtl;/, `\n    ${comment}\n${line}\n\nend architecture rtl;`)
    : text.replace(/\nendmodule\s*$/, `\n    ${comment}\n${line}\n\nendmodule\n`);
  return { name, path: `sim/${name}.${V ? 'vhd' : 'v'}`, lang: g.lang, text, check: line };
}

/**
 * Prove property p of the drawing (its model: a state diagram's or an ASM chart's) on the sources (the project's: the
 * drawing's HDL among them, any module it instantiates), at most `depth` clock cycles. run: Yosys's.
 */
export async function verifyProperty(sources, { drawing, property: p, depth = VERIFY_DEPTH, lang, run, onLine } = {}) {
  const error = (...errors) => ({ status: 'error', errors, warnings: [], depth, property: p });
  if (!drawing) return error('no state diagram or ASM chart to verify');
  const why = propertyError(drawing, p);
  if (why) return error(why);
  let copy;
  try { copy = propertyCopy(drawing, p, lang); } catch (e) { return error(`the drawing's HDL cannot be generated: ${e.message.split('\n')[0]}`); }
  const r = await verifyAssertions([...sources.filter(s => s.path !== copy.path), { ...copy, role: 'simulation' }], { top: copy.name, depth, run, onLine });
  const module = drawingOf(drawing).m.name;
  const holds = p.kind === 'reach' ? r.status === 'failed' : r.status === 'proved';
  return { ...r, module, property: p, holds, copy, drawing };
}

// what a failed property's counterexample shows
const failsText = r => (r.property.kind === 'never' ? `reaches state ${r.property.state}`
  : `has ${r.property.outputs.filter(o => r.cycles[r.cycle - 1]?.uut[o] === '1').join(' and ') || r.property.outputs.join(', ')} both 1`);

/**
 * A property's counterexample (or a reached state's way there) as a test bench: the copy, then the bench of it. The
 * outputs' property is the bench's own check, on its signals (VHDL reads no output port of the copy, as XST).
 */
export function propertyBench(r, drawing = null) {
  const p = r.property, name = benchName(r.module);
  const about = p.kind === 'reach' ? `'${r.module}' reaches state ${p.state} at clock cycle ${r.cycle}` : `'${r.module}' ${failsText(r)} at clock cycle ${r.cycle}`;
  let prelude = r.copy.text, checks = [];
  if (p.kind === 'exclusive') {
    const c = propertyCopy(drawing || r.drawing, p, r.copy.lang, { withCheck: false });
    prelude = c.text;
    checks = [c.check.trim()];
  }
  return { name, path: `sim/${name}.${r.copy.lang === 'vhdl' ? 'vhd' : 'v'}`, text: counterexampleBench(r, { name, lang: r.copy.lang, about, prelude, checks }) };
}

/** The console's messages of a property's proof (the interface's and the MCP tool's alike), as verifyMessages'. */
export function propertyMessages(r, { bench = null } = {}) {
  const M = [{ text: `\nStarted : "${PROPERTY_PROCESS}".\n`, kind: 'hdr' }];
  const end = (ok, warn) => M.push(ok ? { text: `\nProcess "${PROPERTY_PROCESS}" completed successfully${warn ? ` with ${warn} warning(s)` : ''}`, kind: 'ok' }
    : { text: `\nProcess "${PROPERTY_PROCESS}" failed`, kind: 'err' });
  if (r.status === 'error') {
    for (const e of r.errors) M.push({ text: `ERROR:Verify - ${e}`, kind: 'err' });
    end(false);
    return M;
  }
  const p = r.property, what = propertyText(p);
  M.push({ text: `Proving that '${r.module}' ${what}: Yosys's SAT solver, at most ${r.depth} clock cycle(s), then a proof by induction.`, kind: 'info' });
  const warns = r.warnings.map(w => ({ text: `WARNING:Verify - ${w}`, kind: 'warn' }));
  M.push(...warns);
  if (p.kind === 'reach') {
    if (r.status === 'failed') {
      M.push({ text: `'${r.module}' reaches state ${p.state} at clock cycle ${r.cycle}.`, kind: 'ok' });
      if (bench) M.push({ text: `The way there as a test bench: ${bench} (it replays the ${r.cycle} clock cycle(s) in the simulator).`, kind: 'info' });
      end(true, warns.length);
    } else if (r.status === 'proved') {
      M.push({ text: `ERROR:Verify - '${r.module}' never reaches state ${p.state}, for any input sequence (proved by induction over ${r.induction} clock cycle(s)).`, kind: 'err' });
      end(false);
    } else {
      M.push({ text: `WARNING:Verify - '${r.module}' does not reach state ${p.state} in the first ${r.depth} clock cycle(s): a larger depth checks more cycles.`, kind: 'warn' });
      end(true, warns.length + 1);
    }
    return M;
  }
  if (r.status === 'proved') {
    M.push({ text: `Proved: '${r.module}' ${what}, for every input sequence (by induction over ${r.induction} clock cycle(s)).`, kind: 'ok' });
    end(true, warns.length);
  } else if (r.status === 'bounded') {
    M.push({ text: `WARNING:Verify - '${r.module}' ${what} in the first ${r.depth} clock cycle(s), but it is not proved beyond them (the induction did not succeed): a larger depth checks more cycles.`, kind: 'warn' });
    end(true, warns.length + 1);
  } else {
    M.push({ text: `ERROR:Verify - '${r.module}' ${failsText(r)} at clock cycle ${r.cycle}.`, kind: 'err' });
    if (bench) M.push({ text: `The counterexample's test bench: ${bench} (it replays the ${r.cycle} clock cycle(s) in the simulator).`, kind: 'info' });
    end(false);
  }
  return M;
}

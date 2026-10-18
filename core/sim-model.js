// The Post-Synthesis Simulation Model of the Silinx toolchain (#120), as ISE's netgen -sim writes it
// from XST's netlist: the open synthesis's netlist (Yosys's JSON) as a structural VHDL model of the
// UNISIM primitives (core/fpga/techview.js technologyNetlist: LUT1-4 with their INIT, FD* flip-flops,
// MUXF5-8, MUXCY / XORCY, RAMB16, MULT18X18, SRL16, I/O buffers…), the entity with the top's ports, so
// that the user's test bench simulates it in place of the RTL; and the same netlist in Verilog (Yosys's
// write_verilog). Silinx's simulator has the UNISIM models (core/unisim.js).
//
// The generics. A netlist has its constants built in, so a test bench that gives the design other
// generics (a clock divider of 2 instead of 50 000 000, to simulate quickly) would test another
// design. As ISE's model, this one has no generics; it is synthesized with the generics the test bench
// gives its instance of the top (dutGenerics), and says so in its header.
import { technologyNetlist } from './fpga/techview.js';
import { UNISIM_SOURCE } from './unisim.js';
import * as V from './values.js';

/** The UNISIM primitives Silinx simulates (upper case). */
export const SIM_PRIMITIVES = new Set([...UNISIM_SOURCE.text.matchAll(/^\s*entity\s+(\w+)\s+is/gim)].map(m => m[1].toUpperCase()));

/**
 * The generics a test bench gives its instance of the top: { generics: { NAME: integer }, skipped:
 * [names not integers], instance: its path } or null when the test bench has no instance of the top.
 * simDesign: the elaborated test bench.
 */
export function dutGenerics(simDesign, top) {
  const want = String(top).toLowerCase();
  const find = n => {
    for (const c of n?.children || []) {
      if (String(c.module || '').toLowerCase() === want) return c;
      const d = find(c);
      if (d) return d;
    }
    return null;
  };
  const inst = find(simDesign?.top);
  if (!inst) return null;
  const generics = {}, skipped = [];
  for (const p of inst.params || []) {
    if (!p.given) continue;
    if (p.t?.kind === 'int' && p.value && !Array.isArray(p.value) && p.value.x === 0n) {
      const n = Number(V.toNum(p.value));
      if (Number.isSafeInteger(n)) { generics[p.name] = n; continue; }
    }
    skipped.push(p.name);
  }
  return { generics, skipped, instance: inst.path || inst.name };
}

/**
 * The models from the synthesis's result (core/synth-open.js synthesizeOpen: its files):
 * { vhdl, verilog, cells, unknown: [cell types with no simulation model] }.
 * o: { top, part, generics: { NAME: value } given to the synthesis, testbench: its name }
 */
export function postSynthesisModels(synth, { top, part = '', generics = {}, testbench = null } = {}) {
  const json = JSON.parse(synth.files[`${synth.top}.json`]);
  const tn = technologyNetlist(json, { top });
  // (the top module's cells: the netlist also holds the library cells Yosys read, a primitive's model with its
  // $specify2 timing arcs first, #493)
  const mod = json.modules[synth.top] || Object.values(json.modules).find(m => m.attributes?.top) || Object.values(json.modules)[0];
  const types = new Set(Object.values(mod?.cells || {}).map(c => String(c.type).toUpperCase()));
  const unknown = [...types].filter(t => !SIM_PRIMITIVES.has(t)).sort();
  const gens = Object.entries(generics);
  const head = (c) => [
    `${c} Post-Synthesis Simulation Model of '${top}'${part ? ` (${part})` : ''}: the open synthesis's netlist (Silinx toolchain, Yosys),`,
    `${c} the UNISIM primitives it is made of; written by Silinx. Simulate it with the test bench in place of the`,
    `${c} design's own HDL (its entity has the top's ports).`,
    ...(gens.length ? [`${c} Synthesized with the generics ${testbench ? `the test bench '${testbench}' gives` : 'given'}: ${gens.map(([k, v]) => `${k} = ${v}`).join(', ')}.`] : []),
  ].join('\n');
  // the generics it was synthesized with, declared (they change nothing: the test bench's generic map is
  // accepted as it is)
  let body = tn.flat.replace(/^-- Technology netlist of [^\n]*\n/, '');
  // (a parameter's undefined bits, a memory with no initial contents: INIT_00(256'hxxxx…), are 0, as the
  // FPGA has them and as the VHDL model writes them)
  let vlog = synth.files[`${synth.top}_yosys.v`].replace(/^(\s*\.\w+\(\d+'[bh])([0-9a-fA-FxXzZ_]+)\)/gm, (m, a, digits) => `${a}${digits.replace(/[xXzZ]/g, '0')})`);
  if (gens.length) {
    // (the top's entity: the last one, after the stubs of cells Silinx has no model of)
    const at = body.lastIndexOf('\nentity '), eol = body.indexOf('\n', at + 1) + 1;
    body = `${body.slice(0, eol)}  generic (\n${gens.map(([k, v]) => `    ${k} : integer := ${v}`).join(';\n')}\n  );\n${body.slice(eol)}`;
    vlog = vlog.replace(/^(module [^;]*;\n)/m, `$1${gens.map(([k, v]) => `  parameter ${k} = ${v};\n`).join('')}`);
  }
  const vhdl = `${head('--')}\n${body}`;
  const verilog = `${head('//')}\n${vlog}`;
  return { vhdl, verilog, cells: tn.cells, unknown };
}

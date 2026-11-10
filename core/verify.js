// Silinx - formal verification (#3177): the equivalence of a module with a reference module, proved by Yosys's own SAT
// solver, in the browser (Yosys WASM) as on the server. Silinx's front end writes each of the two modules as the open
// synthesis's flat SystemVerilog (core/synth-verilog.js: VHDL and Verilog alike); Yosys joins them in a miter (the same
// inputs to both, an assertion that their outputs are equal) and `sat -tempinduct` checks it cycle by cycle from the
// initial state (a bounded model check, the shortest difference first), trying at each depth a proof by induction (then
// the modules are equivalent for every input sequence). A difference is a counterexample: the inputs of each clock cycle
// and both modules' outputs, which core/verify-bench.js makes a test bench of (the simulator replays it, the waveform
// viewer shows it).
//
//   const r = await verifyEquivalence(sources, { top, reference, depth, run, onLine })
//   r: { status: 'proved' | 'bounded' | 'failed' | 'error', errors, warnings, depth, induction (the proof's length),
//        cycles: [{ in: { port: bits }, uut: { port: bits }, ref: { port: bits } }] (the counterexample), cycle (its
//        difference's, from 1), differs: [port], ports: [{ name, dir, width, uut, ref }] (core/testbench.js tbPorts'),
//        clocks: [port], log }
//
// The model: every register takes its next value once per clock cycle (one clock: the designs of a course; their
// asynchronous resets as Yosys's async2sync makes them, the reset's value seen at once); a register with no initial
// value starts at 0, as the FPGA's do after configuration.
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { toVerilog, signedInt } from './synth-verilog.js';
import { tbPorts } from './testbench.js';
import { clocksOf } from './schematic.js';

export const VERIFY_DEPTH = 20;
export const MAX_DEPTH = 1000;
// the modules' names in Yosys (the miter's gold, the reference, and gate, the module verified)
const REF = 'silinx_ref', UUT = 'silinx_uut', MITER = 'silinx_miter';

/** The Yosys script of the equivalence check, at most `depth` clock cycles. */
export function verifyScript(depth = VERIFY_DEPTH) {
  return [
    `read_verilog -sv ${REF}.sv ${UUT}.sv`,
    // (memories as registers and logic: the SAT solver has no model of a memory; the asynchronous resets and the
    // latches as the solver sees them, cycle by cycle)
    'proc', 'memory', 'opt_clean', 'async2sync',
    `miter -equiv -flatten -make_outputs -make_assert ${REF} ${UUT} ${MITER}`,
    `hierarchy -top ${MITER}`, 'opt_clean',
    `sat -tempinduct -prove-asserts -set-init-zero -maxsteps ${depth} -show-inputs -show-outputs ${MITER}`,
  ].join('; ');
}

/** The Yosys script of the proof of module `top`'s assertions (read with -formal), at most `depth` clock cycles. */
export function assertScript(depth = VERIFY_DEPTH) {
  return [
    `read_verilog -sv -formal ${UUT}.sv`,
    // (a clocked assertion: its condition sampled at the edge, a register's worth later, as chformal lowers it)
    'proc', 'memory', 'opt_clean', 'async2sync', 'chformal -lower', `hierarchy -top ${UUT}`, 'opt_clean',
    `sat -tempinduct -prove-asserts -set-assumes -set-init-zero -maxsteps ${depth} -show-inputs -show-outputs ${UUT}`,
  ].join('; ');
}

// the elaborated module `name` of library `lib`, its ports as the test bench sees them, its clock ports
export function moduleOf(lib, name, what) {
  const unit = [...lib.modules.values()].find(m => m.kind !== 'package' && m.name.toLowerCase() === String(name).toLowerCase());
  if (!unit) return { error: `${what} '${name}' is not a module of the project` };
  const design = elaborate(lib, unit.name);
  const errs = design.diags.filter(d => d.severity === 'error');
  if (!design.top || errs.length) return { error: `${what} '${unit.name}' cannot be elaborated: ${errs.slice(0, 3).map(d => `${d.file}:${d.line} ${d.message}`).join('; ') || 'no top'}` };
  const ports = tbPorts(design);
  design.top.ports.forEach((p, i) => {
    const t = p.sig.t;
    // (a VHDL vector's type: std_logic_vector, or a subtype of it, has its mark; numeric_std's unsigned and signed none)
    if (unit.lang === 'vhdl' && ports[i].kind === 'slv' && !t.mark) ports[i].kind = t.s ? 'signed' : 'unsigned';
    // (an integer port of a negative range: its bits as a signed number's)
    ports[i].signedInt = signedInt(t);
  });
  const clockSigs = new Set();
  const visit = inst => { for (const pr of inst.procs || []) { try { for (const c of clocksOf(pr).clocks) clockSigs.add(c); } catch { /* not a clocked process */ } } (inst.children || []).forEach(visit); };
  visit(design.top);
  for (const pr of design.procs || []) { try { for (const c of clocksOf(pr).clocks) clockSigs.add(c); } catch { /* not a clocked process */ } }
  const clocks = design.top.ports.filter(p => clockSigs.has(p.sig)).map(p => p.name);
  return { unit, design, ports, clocks };
}

/** The differences between the ports of the module verified and of its reference (messages), [] when they match. */
export function portDifferences(uut, ref) {
  const out = [];
  const byName = new Map(ref.ports.map(p => [p.name.toLowerCase(), p]));
  for (const p of uut.ports) {
    const q = byName.get(p.name.toLowerCase());
    if (!q) out.push(`port ${p.name} of '${uut.unit.name}' is not a port of '${ref.unit.name}'`);
    else if (q.name !== p.name) out.push(`port ${p.name} of '${uut.unit.name}' is ${q.name} in '${ref.unit.name}' (the names must be written alike)`);
    else if (q.dir !== p.dir) out.push(`port ${p.name} is an ${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} of '${uut.unit.name}' and an ${q.dir === 'in' ? 'input' : q.dir === 'out' ? 'output' : 'inout'} of '${ref.unit.name}'`);
    else if (q.width !== p.width) out.push(`port ${p.name} has ${p.width} bit(s) in '${uut.unit.name}' and ${q.width} in '${ref.unit.name}'`);
  }
  const mine = new Set(uut.ports.map(p => p.name.toLowerCase()));
  for (const q of ref.ports) if (!mine.has(q.name.toLowerCase())) out.push(`port ${q.name} of '${ref.unit.name}' is not a port of '${uut.unit.name}'`);
  for (const m of [uut, ref]) for (const p of m.ports) {
    if (p.dir === 'inout') out.push(`port ${p.name} of '${m.unit.name}' is bidirectional: Verify compares inputs and outputs only`);
    else if (p.kind === 'other') out.push(`port ${p.name} of '${m.unit.name}' is of a type Verify cannot drive (bits, vectors and integers only)`);
  }
  return out;
}

/**
 * Yosys's log of the check read: { status, induction, cycles, cycle, differs, warnings }. The counterexample is the
 * table printed after "model found for base case" (the induction steps' tables before it are of states not reached).
 */
export function readVerifyLog(lines, outputs = [], { inputs = null } = {}) {
  const warnings = lines.filter(l => /^Warning: /.test(l)).map(l => l.replace(/^Warning: /, ''));
  const proved = lines.findIndex(l => /^Induction step proven: SUCCESS!/.test(l));
  const failed = lines.findIndex(l => /model found for base case: FAIL!/.test(l));
  if (proved >= 0 && failed < 0) {
    // (the length of the induction: its last "Trying induction with length N")
    const tries = lines.slice(0, proved).map(l => /^\*\* Trying induction with length (\d+) \*\*/.exec(l)).filter(Boolean);
    return { status: 'proved', induction: tries.length ? +tries[tries.length - 1][1] : 1, warnings };
  }
  if (failed < 0) return { status: lines.some(l => /^Reached maximum number of time steps/.test(l)) ? 'bounded' : 'error', warnings };
  const cycles = [];
  for (const l of lines.slice(failed + 1)) {
    const m = /^\s+(\d+)\s+\\(\S+)\s+\S+\s+\S+\s+([01xz]+)\s*$/i.exec(l);
    if (!m) { if (cycles.length && !/^\s+-+/.test(l) && !/^\s+Time\s/.test(l)) break; continue; }
    const k = +m[1] - 1, [, , sig, bits] = m;
    const c = cycles[k] || (cycles[k] = { in: {}, uut: {}, ref: {}, trigger: false });
    const at = /^(in|gold|gate)_(.*)$/.exec(sig);
    // (a module's own assertions, inputs: its ports, inputs and outputs, by their names)
    if (inputs) c[inputs.includes(sig) ? 'in' : 'uut'][sig] = bits.toLowerCase();
    else if (sig === 'trigger') c.trigger = bits === '1';
    else if (at) c[{ in: 'in', gold: 'ref', gate: 'uut' }[at[1]]][at[2]] = bits.toLowerCase();
  }
  for (let k = 0; k < cycles.length; k++) cycles[k] ||= { in: {}, uut: {}, ref: {}, trigger: false };
  if (inputs) return { status: 'failed', cycles: cycles.map(({ trigger, ...c }) => c), cycle: cycles.length, differs: [], warnings };
  const at = cycles.findIndex(c => c.trigger);
  const cycle = at >= 0 ? at + 1 : cycles.length;
  const last = cycles[cycle - 1] || { uut: {}, ref: {} };
  const differs = (outputs.length ? outputs : Object.keys(last.uut)).filter(n => last.uut[n] !== last.ref[n]);
  return { status: 'failed', cycles: cycles.slice(0, cycle).map(({ trigger, ...c }) => c), cycle, differs, warnings };
}

/**
 * Verify that module `top` of the sources ([{ path, text, lang }]: the design's and the simulation's) gives the outputs
 * of module `reference` for every input sequence: proved (by induction), bounded (no difference in the first `depth`
 * clock cycles) or failed (the counterexample). run(args, files, onLine): Yosys's (packages/silinx-fpga/src/
 * synth-open-node.js yosysNode, web/js/yosys-client.js yosysBrowser).
 */
export async function verifyEquivalence(sources, { top, reference, depth = VERIFY_DEPTH, run, onLine = () => {} } = {}) {
  const error = (...errors) => ({ status: 'error', errors, warnings: [], depth });
  if (!top) return error('no module to verify');
  if (!reference) return error(`no reference module for '${top}'`);
  if (!(Number.isInteger(depth) && depth >= 1 && depth <= MAX_DEPTH)) return error(`the depth must be a number of clock cycles from 1 to ${MAX_DEPTH}`);
  const lib = compile([...primitiveSources(sources), ...sources]);
  const libErrs = lib.errors.filter(e => e.severity === 'error');
  if (libErrs.length) return error(...libErrs.slice(0, 5).map(e => `${e.file}:${e.line} ${e.message}`));
  const uut = moduleOf(lib, top, 'the module');
  const ref = moduleOf(lib, reference, 'the reference');
  if (uut.error || ref.error) return error(...[uut.error, ref.error].filter(Boolean));
  if (uut.unit === ref.unit) return error(`'${uut.unit.name}' cannot be its own reference`);
  const diffs = portDifferences(uut, ref);
  if (diffs.length) return error(`'${uut.unit.name}' and its reference '${ref.unit.name}' must have the same ports: ${diffs.join('; ')}`);
  const files = {};
  const warnings = [];
  for (const [m, name] of [[ref, REF], [uut, UUT]]) {
    try {
      const v = toVerilog(m.design, { name });
      files[`${name}.sv`] = v.text;
      warnings.push(...v.warnings.map(w => `${m.unit.name}: ${w.message ?? w}`));
    } catch (e) { return error(`'${m.unit.name}' cannot be verified: ${e.message}`); }
  }
  const lines = [];
  try { await run(['-p', verifyScript(depth)], files, l => { lines.push(l); onLine(l); }); }
  catch (e) { return { ...error(e.message), log: lines }; }
  const refBy = new Map(ref.ports.map(p => [p.name, p]));
  const ports = uut.ports.map(p => ({ name: p.name, dir: p.dir, width: p.width, uut: p, ref: refBy.get(p.name) }));
  const outputs = ports.filter(p => p.dir === 'out').map(p => p.name);
  const r = readVerifyLog(lines, outputs);
  if (r.status === 'error') return { ...error('Yosys gave no result (its log has neither a proof nor a counterexample)'), log: lines };
  const clocks = [...new Set([...uut.clocks, ...ref.clocks])];
  return { ...r, errors: [], warnings: [...warnings, ...r.warnings], depth, top: uut.unit.name, reference: ref.unit.name,
    lang: uut.unit.lang, ports, clocks, log: lines };
}

export const VERIFY_PROCESS = 'Verify Equivalence';

/**
 * The console's messages of a check (the interface's and the MCP tool's alike): [{ text, kind: 'hdr' | 'info' | 'ok' |
 * 'warn' | 'err' }], the process's start and end lines among them. bench: the counterexample's test bench's path, when
 * one was written.
 */
export function verifyMessages(r, { top = r.top, reference = r.reference, bench = null } = {}) {
  const M = [{ text: `\nStarted : "${VERIFY_PROCESS}".\n`, kind: 'hdr' }];
  const end = (ok, warn) => M.push(ok ? { text: `\nProcess "${VERIFY_PROCESS}" completed successfully${warn ? ` with ${warn} warning(s)` : ''}`, kind: 'ok' }
    : { text: `\nProcess "${VERIFY_PROCESS}" failed`, kind: 'err' });
  if (r.status === 'error') {
    for (const e of r.errors) M.push({ text: `ERROR:Verify - ${e}`, kind: 'err' });
    end(false);
    return M;
  }
  M.push({ text: `Verifying '${top}' against its reference '${reference}': Yosys's SAT solver, at most ${r.depth} clock cycle(s), then a proof by induction.`, kind: 'info' });
  const warns = r.warnings.map(w => ({ text: `WARNING:Verify - ${w}`, kind: 'warn' }));
  M.push(...warns);
  if (r.status === 'proved') {
    M.push({ text: `Proved: '${top}' gives the outputs of '${reference}' for every input sequence (by induction over ${r.induction} clock cycle(s)).`, kind: 'ok' });
    end(true, warns.length);
  } else if (r.status === 'bounded') {
    M.push({ text: `WARNING:Verify - no difference in the first ${r.depth} clock cycle(s), but not proved beyond them (the induction did not succeed): a larger depth checks more cycles.`, kind: 'warn' });
    end(true, warns.length + 1);
  } else {
    const last = r.cycles[r.cycle - 1];
    const what = r.differs.map(n => `${n} = ${last.uut[n]}, the reference's ${n} = ${last.ref[n]}`).join('; ');
    M.push({ text: `ERROR:Verify - '${top}' differs from its reference '${reference}' at clock cycle ${r.cycle}: ${what}.`, kind: 'err' });
    if (bench) M.push({ text: `The counterexample's test bench: ${bench} (it replays the ${r.cycle} clock cycle(s) in the simulator, both modules side by side).`, kind: 'info' });
    end(false);
  }
  return M;
}

/** Whether a file's text is a counterexample's test bench of Verify (written again by the next check). */
export const isVerifyBench = text => /^(--|\/\/) Counterexample of Verify \(Silinx\)/.test(String(text || ''));

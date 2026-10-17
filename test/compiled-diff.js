// Test helper (not a test file): the compiled cycle simulator (core/compiled-sim.js) against the
// event-driven simulator (core/simulator.js), cycle by cycle, on the same design and inputs.
//
//   await diffCycles(sources, top, { cycles, inputs: k => ({ port: value }), clock, generics })
//     -> { cycles, bits: output bits compared, mismatches: [{ cycle, port, event, compiled }], sim }
//
// The event-driven simulator drives the clock (period P, rising at P/2 + kP) and starts every register
// with no initial value at 0, as the Board Emulator does (and the FPGA); the inputs of cycle k are applied
// at kP + 1 (those of cycle 0 from the start), before its rising edge, and the outputs compared at
// (k + 1)P + 1, after its falling edge. An
// output bit the event-driven simulator has as X or Z is not compared (the compiled simulator has none).
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { primitiveSources } from '../core/unisim.js';
import * as V from '../core/values.js';
import { compileDesign, compileNetlist, CompiledSim } from '../core/compiled-sim.js';
import { yosysNode } from '../core/synth-open-node.js';

const P = 20000;

const allX = v => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
const zeroOf = v => V.withSign(V.fromInt(0, v.w, false), v.s);
// (as web/js/emulator.js powerUpZero)
function powerUpZero(design) {
  for (const s of design.signals) {
    if (Array.isArray(s.val)) { if (s.val.some(allX)) s.val = s.val.map(e => (allX(e) ? zeroOf(e) : e)); } else if (allX(s.val)) s.val = zeroOf(s.val);
  }
}

/** A deterministic pseudo-random generator: () -> [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The elaborated design of sources' top (generics given), with Silinx's primitives. */
export function designOf(sources, top, { generics } = {}) {
  const lib = compile([...primitiveSources(sources), ...sources]);
  const errs = lib.errors.filter(e => e.severity === 'error');
  if (errs.length) throw new Error(errs.map(e => `${e.file}:${e.line} ${e.message}`).join('; '));
  const d = elaborate(lib, top, generics ? { generics } : undefined);
  const de = d.diags.filter(e => e.severity === 'error');
  if (de.length) throw new Error(de.map(e => e.message).join('; '));
  return d;
}

/**
 * The compiled simulator of sources' top: through Silinx's synthesis Verilog (compileDesign); direct: the
 * Verilog sources read by Yosys themselves, with the Yosys commands `extra` between prep and memory -nomap
 * (as prepCommands otherwise), for cells that Silinx's Verilog and prepCommands do not make ($shiftx, $dffe,
 * $sdff…, a memory read port with a reset).
 */
export async function compiledOf(sources, top, { generics, clock = null, wide = false, direct = false, extra = '' } = {}) {
  if (!direct) return compileDesign(designOf(sources, top, { generics }), { run: yosysNode, clock, wide });
  const files = Object.fromEntries(sources.map(s => [s.path, s.text]));
  const out = await yosysNode(['-q', '-p', `read_verilog -sv ${sources.map(s => s.path).join(' ')}; prep -flatten -top ${top}; ${extra ? `${extra}; ` : ''}memory -nomap; opt_clean -purge; write_json ${top}_d.json`], files);
  return new CompiledSim(compileNetlist(JSON.parse(out[`${top}_d.json`]), { top, clock, wide }));
}

export async function diffCycles(sources, top, { cycles = 200, inputs = () => ({}), clock = null, generics, wide = false, stopAt = 10, nets = false, mutate = null, direct = false, extra = '' } = {}) {
  let sim = await compiledOf(sources, top, { generics, clock, wide, direct, extra });
  // mutate(code): a wrong compiled model, to see that the comparison finds it
  if (mutate) sim = new CompiledSim({ ...sim.model, code: mutate(sim.model.code) });
  const des = designOf(sources, top, { generics });
  const ev = new Simulator(des, {});
  powerUpZero(des);   // (after the simulator's start: it gives the signals their initial values)
  for (const s of des.signals) s.wave = null;
  const port = new Map(des.top.ports.map(p => [p.name, p]));
  const clk = sim.model.clock?.port;
  const outs = des.top.ports.filter(p => p.dir !== 'in').map(p => ({ name: p.name, sig: p.sig }));
  // nets: the internal signals too, by their names in the netlist (the path below the top)
  if (nets) {
    const pre = `${des.top.path || des.top.name}.`;
    for (const s of des.signals) {
      const n = String(s.path || '').startsWith(pre) ? s.path.slice(pre.length) : null;
      const bits = n && sim.model.nets.get(n);
      if (bits && !Array.isArray(s.val) && s.val?.w === bits.length && !outs.some(o => o.sig === s)) outs.push({ name: n, sig: s });
    }
  }
  const apply = vals => {
    for (const [name, v] of Object.entries(vals)) {
      if (name === clk) continue;
      const p = port.get(name);
      if (!p) throw new Error(`no input '${name}'`);
      ev.force(p.sig, V.fromInt(v, p.sig.t.w, false));
      sim.set(name, v);
    }
  };
  for (const p of des.top.ports) if (p.dir === 'in' && p.name !== clk) { ev.force(p.sig, V.fromInt(0, p.sig.t.w, false)); sim.set(p.name, 0); }
  if (clk) ev.addClock(port.get(clk).sig, { period: P });
  const mismatches = [];
  let bits = 0;
  const compare = (k) => {
    for (const p of outs) {
      const e = p.sig.val, c = sim.get(p.name);
      if (e == null || Array.isArray(e)) continue;
      const known = ((1n << BigInt(e.w)) - 1n) & ~e.x;
      for (let i = 0n; i < BigInt(e.w); i++) if ((known >> i) & 1n) bits++;
      if ((e.v & known) !== (c & known)) mismatches.push({ cycle: k, port: p.name, event: V.toBin(e), compiled: c.toString(2).padStart(e.w, '0') });
    }
  };
  // the first inputs from the start (the compiled design powered up with them); time 0 itself is not
  // compared: an edge at time 0 (an active-low asynchronous reset at 0) is a race of the event-driven
  // simulator, which the FPGA (and the compiled simulator) does not have
  apply(inputs(0));
  sim.reset();
  ev.run(0);
  for (let k = 0; k < cycles && mismatches.length < stopAt; k++) {
    if (k) apply(inputs(k));
    ev.run((k + 1) * P + 1);
    sim.cycle(1);
    compare(k);
  }
  return { cycles, bits, mismatches, sim, log: ev.log };
}

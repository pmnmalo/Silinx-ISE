// Does the netlist from open synthesis (GHDL + Yosys, synth_xilinx -family xc3se) behave like the
// design? Simulates both with Silinx's simulator (the netlist with Silinx's UNISIM cell models):
//   1. a test bench of the project (its assertions, and every output of the top over the whole run);
//   2. random stimulus for many clock cycles, outputs compared every cycle.
//
//   node compare-sim.mjs <rtl folder> <netlist.v> <top> <test bench file> <test bench top> [cycles]
import fs from 'node:fs';
import path from 'node:path';
import { compile, elaborate } from '../../core/compile.js';
import { Simulator } from '../../core/simulator.js';
import * as V from '../../core/values.js';
import { UNISIM_SOURCE } from '../../core/unisim.js';

const [rtlDir, netFile, top, tbFile, tbTop, cyclesArg] = process.argv.slice(2);
const CYCLES = +(cyclesArg || 20000);
const vhd = fs.readdirSync(rtlDir).filter(f => /\.vhd$/i.test(f)).map(f => ({ path: f, lang: 'vhdl', text: fs.readFileSync(path.join(rtlDir, f), 'utf8') }));
const net = { path: path.basename(netFile), lang: 'verilog', text: fs.readFileSync(netFile, 'utf8') };
const tb = { path: path.basename(tbFile), lang: 'vhdl', text: fs.readFileSync(tbFile, 'utf8') };

function build(sources, topName, what) {
  const lib = compile(sources);
  const design = elaborate(lib, topName);
  const problems = [...lib.errors, ...design.diags].filter(d => d.severity !== 'warning');
  if (problems.length || !design.top) throw new Error(`${what}: ${problems.slice(0, 8).map(d => `${d.file}:${d.line} ${d.message}`).join('\n') || 'no top'}`);
  return design;
}
// as the FPGA after configuration: registers without an initial value start at 0 (in VHDL they
// would stay 'U' / X; the netlist's flip-flops have INIT = 0). The board emulator does the same.
// Called once the simulator is created (it sets the initial values).
function powerUp(design) {
  const allX = v => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
  const zero = v => V.withSign(V.fromInt(0, v.w, false), v.s);
  for (const sig of design.signals) {
    if (Array.isArray(sig.val)) { if (sig.val.some(allX)) sig.val = sig.val.map(e => (allX(e) ? zero(e) : e)); }
    else if (allX(sig.val)) sig.val = zero(sig.val);
  }
}
const rtlSources = vhd;
const netSources = [UNISIM_SOURCE, net];

// ---- 1. the test bench: outputs of the top over time, assertion messages
function runTb(sources, what) {
  const d = build([...sources, tb], tbTop, what);
  const s = new Simulator(d, { maxWaveEvents: 0 });
  powerUp(d);
  // the test bench's own signals (connected to the top's ports); it ends with a "finished" report
  const tbSigs = d.top.signals.filter(x => !Array.isArray(x.init));
  const trace = [];
  let last = '';
  const snap = () => tbSigs.map(x => `${x.name}=${x.val == null || Array.isArray(x.val) ? '?' : V.toBin(x.val)}`).join(' ');
  for (let t = 0; t <= 1_000_000_000 && !s.finished; t += 1000) {   // 1 ns steps, up to 1 ms
    s.run(t);
    const now = snap();
    if (now !== last) { trace.push(`${t}: ${now}`); last = now; }
    if (s.log.some(e => /finished/i.test(e.text))) break;
  }
  return { trace, log: s.log.filter(e => e.kind !== 'print').map(e => `${e.time} ${e.kind}: ${e.text}`), signals: tbSigs.map(x => x.name), end: s.now };
}

// ---- 2. random stimulus
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function runRandom(sources, what, seed) {
  const d = build(sources, top, what);
  const s = new Simulator(d, { maxWaveEvents: 0 });
  powerUp(d);
  const port = new Map(d.top.ports.map(p => [p.name.toLowerCase(), p]));
  const P = 20000;   // 20 ns clock (ps)
  s.addClock(port.get('clk').sig, { period: P });
  const ins = d.top.ports.filter(p => p.dir === 'in' && p.name.toLowerCase() !== 'clk');
  const outs = d.top.ports.filter(p => p.dir !== 'in').sort((a, b) => (a.name < b.name ? -1 : 1));
  const r = rng(seed);
  const set = (name, v) => { const sig = port.get(name).sig; s.force(sig, V.mk(sig.t.w, BigInt(v))); };
  for (const p of ins) set(p.name.toLowerCase(), 0);
  const res = [];
  for (let k = 0; k < CYCLES; k++) {
    const R = P / 2 + k * P;
    s.run(R + P / 4);
    // reset at the start and now and then; slow buttons (held for several cycles); bit_ready pulses
    set('rst', k < 3 || r() < 0.002 ? 1 : 0);
    if (r() < 0.05) set('exec', r() < 0.5 ? 1 : 0);
    if (r() < 0.02) set('display_sel', r() < 0.5 ? 1 : 0);
    if (r() < 0.03) set('opcode', Math.floor(r() * 32));
    if (r() < 0.05) set('input_data', Math.floor(r() * 8));
    // bit_ready is the clock of access_module: changed half a period after the data (a button is
    // never pressed at the same instant a switch moves; with zero delays the two orders would race)
    s.run(R + (3 * P) / 4);
    if (r() < 0.05) set('bit_ready', r() < 0.5 ? 1 : 0);
    s.run(R + P - 1000);
    res.push(outs.map(p => `${p.name}=${V.toBin(p.sig.val)}`).join(' '));
  }
  return res;
}

const firstDiff = (a, b) => { for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) return k; return a.length === b.length ? -1 : Math.min(a.length, b.length); };

const A = runTb(rtlSources, 'RTL + test bench'), B = runTb(netSources, 'netlist + test bench');
console.log(`test bench ${tbTop}: RTL ${A.trace.length} changes, ${A.log.length} messages, ended at ${A.end / 1000} ns; netlist ${B.trace.length} changes, ${B.log.length} messages, ended at ${B.end / 1000} ns`);
console.log('RTL messages:', A.log.length ? A.log.join(' | ') : 'none');
console.log('netlist messages:', B.log.length ? B.log.join(' | ') : 'none');
const k = firstDiff(A.trace, B.trace);
console.log(k < 0 ? 'test bench: the signals of the test bench are identical over the whole run' : `test bench: first difference at change ${k}:\n  RTL     ${A.trace[k]}\n  netlist ${B.trace[k]}`);

for (const seed of [1, 2, 3]) {
  const a = runRandom(rtlSources, 'RTL', seed), b = runRandom(netSources, 'netlist', seed);
  const d = firstDiff(a, b);
  const changes = new Set(a).size;
  console.log(d < 0 ? `random stimulus (seed ${seed}): ${CYCLES} cycles, outputs identical every cycle (${changes} distinct output states)` : `random stimulus (seed ${seed}): first difference at cycle ${d}:\n  RTL     ${a[d]}\n  netlist ${b[d]}`);
}

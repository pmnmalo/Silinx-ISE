// The Post-Translate and Post-Map Simulation Models' tests (#121): a model simulated with a test bench, and
// every example's test bench on both models of the example; and on its Post-Synthesis Simulation Model (#120,
// test/sim-model.test.js, vga's in test/sim-model-synth-vga.test.js, #575). The examples' tests are in two files of their
// own (test/sim-model-examples.test.js, test/sim-model-vga.test.js): the tests of one file run one after
// another, and the examples' gate-level simulations are most of the models' tests' time (#566).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { runOpenFlow } from '../core/flow-ide.js';
import { orderOpenSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';
import { Simulator } from '../core/simulator.js';
import { loadDevice } from '../packages/silinx-fpga/src/fpga/device.js';
import { shippedDevicePath } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { example } from './examples-lib.mjs';
import { diffCycles, designOf, rng } from './compiled-diff.js';
import { compileDesign } from '../core/compiled-sim.js';
import { netlistSim } from '../packages/silinx-fpga/test/fpga-sim.js';

// the device description Map's report needs (loaded once)
let DEVICE = null;
export const device = () => (DEVICE ||= loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(shippedDevicePath('xc3s250ecp132-4'))).toString('utf8'))));

// a model compiled with the test bench (its entity replaces the RTL one), elaborated, simulated
export function simulate(sources, file, text, top, until, { stop = /Simulation finished OK|ERROR/ } = {}) {
  const lang = file.endsWith('.v') ? 'verilog' : 'vhdl';
  const all = [...sources, { path: file, lang, text: lang === 'vhdl' ? scalarizeNetlist(text) : text }];
  const lib = compile([...primitiveSources(all), ...all]);
  lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));
  const d = elaborate(lib, top);
  const diags = [...lib.errors, ...d.diags].filter(x => x.file === file || x.severity === 'error');
  if (diags.length) return { diags: diags.map(x => `${x.severity} ${x.file}:${x.line} ${x.message}`), log: [] };
  const s = new Simulator(d);
  for (const sig of d.signals) sig.wave = null;
  const step = until / 100;
  for (let t = step; t <= until; t += step) { const st = s.run(t); if (st.finished || s.log.some(e => stop.test(e.text))) break; }
  return { diags: [], log: s.log.map(e => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`) };
}

// an example's flow with both steps (its generics the test bench's): the synthesis and Translate once for
// both models
const flows = new Map();
function exampleFlow(name) {
  if (!flows.has(name)) flows.set(name, (async () => {
    const ex = example(name);
    const design = ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), sim = ex.sim.map(f => ({ path: f.path, lang: f.lang, text: f.text }));
    const written = {}, lines = [];
    const r = await runOpenFlow({ top: ex.project.top, part: 'xc3s250ecp132-4', family: 'spartan3e', steps: orderOpenSteps(['posttrans', 'postmap']), simTop: ex.project.simTop },
      { log: l => lines.push(l), sources: () => design, simSources: () => sim, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {}, device });
    return { ex, design, sim, r, lines, written };
  })());
  return flows.get(name);
}

// every example's test bench, on both models of the example, VHDL and Verilog, with no warnings (the
// examples' test benches report "Simulation finished OK" when every check passed)
export function exampleModelTests(names) {
  for (const name of names) {
    for (const dir of ['translate', 'map']) {
      test(`example ${name}: its test bench passes on the ${dir === 'map' ? 'post-map' : 'post-translate'} model, VHDL and Verilog (#121)`, { timeout: 900000 }, async () => {
        const { ex, design, sim, r, lines, written } = await exampleFlow(name);
        assert.equal(r.ok, true, lines.join('\n'));
        assert.deepEqual(lines.filter(l => /^(WARNING|INFO|ERROR)/.test(l)), [], name);
        // (the model's files: the synthesis writes the netlist's too; the board's beside them when the test bench
        // gives generics, #622)
        const t = ex.project.top, board = Object.keys(r.report.simModels[dir === 'map' ? 'postmap' : 'posttrans'].generics || {}).length > 0;
        assert.deepEqual(Object.keys(written).filter(f => f.startsWith(`netgen/${dir}/`)).sort(),
          [`netgen/${dir}/${t}_${dir}.v`, `netgen/${dir}/${t}_${dir}.vhd`, ...(board ? [`netgen/${dir}/${t}_${dir}_board.v`, `netgen/${dir}/${t}_${dir}_board.vhd`] : [])]);
        for (const file of [`netgen/${dir}/${t}_${dir}.v`, `netgen/${dir}/${t}_${dir}.vhd`]) {
          const s = simulate([...design, ...sim], file, written[file], ex.project.simTop, name === 'vga' ? 3e10 : 1e11);
          assert.deepEqual(s.diags, [], `${name} ${file}`);
          assert.ok(s.log.some(l => /Simulation finished OK/.test(l)), `${name} ${file}: ${s.log.slice(-4).join(' | ')}`);
          assert.deepEqual(s.log.filter(l => /ERROR|WARNING/.test(l)), [], `${name} ${file}`);
          // the Board Emulator's compiled engine runs the model (#627: it had no SIMPRIM primitives) as the
          // event-driven simulator does, cycle by cycle (the VHDL scalarized, as the emulator reads it)
          const lang = file.endsWith('.v') ? 'verilog' : 'vhdl', top = ex.project.top;
          const model = [{ path: file, lang, role: 'design', text: lang === 'vhdl' ? scalarizeNetlist(written[file]) : written[file] }];
          const cs = await compileDesign(designOf(model, top), { run: yosysNode });
          assert.deepEqual(cs.warnings, [], `${name} ${file}`);
          const ins = designOf(model, top).top.ports.filter(x => x.dir === 'in'), rnd = rng(627), cur = {};
          const res = await diffCycles(model, top, { cycles: 1500, inputs: k => { for (const x of ins) if (k === 0 || rnd() < 0.02) cur[x.name] = BigInt(Math.floor(rnd() * 2 ** Math.min(x.sig.t.w, 30))); return cur; } });
          assert.deepEqual(res.mismatches, [], `${name} ${file}`);
          assert.ok(res.bits >= 1500, `${name} ${file}: ${res.bits} bits compared`);
        }
      });
    }
  }
}

// every example's test bench, on its Post-Synthesis Simulation Model (#120; its generics the test bench's), VHDL
// and Verilog; and the Board Emulator's compiled engine runs the model as the event-driven simulator does (#561).
// part / family: the device synthesized for (the Spartan-6's netlists of CARRY4, DSP48A1, RAMB8BWER…, #720)
export function examplePostSynthTests(names, { part = 'xc3s250ecp132-4', family = 'spartan3e' } = {}) {
  for (const name of names) {
    test(`example ${name}: its test bench passes on the post-synthesis model${family === 'spartan3e' ? '' : ` for the ${part}`}, VHDL and Verilog (#120${family === 'spartan6' ? ', #720' : ''}); the compiled engine runs it as the event-driven one (#561)`, { timeout: 600000 }, async () => {
      const ex = example(name);
      const read = f => ({ path: f.path, lang: f.lang, text: fs.readFileSync(path.join(ex.dir, f.path), 'utf8') });
      const design = ex.project.files.filter(f => (f.role || 'design') === 'design').map(read);
      const sim = ex.project.files.filter(f => f.role === 'sim').map(read);
      const written = {}, lines = [];
      const r = await runOpenFlow({ top: ex.project.top, part, family, steps: ['postsynth'], simTop: ex.project.simTop },
        { log: l => lines.push(l), sources: () => design, simSources: () => sim, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {} });
      assert.equal(r.ok, true, lines.join('\n'));
      assert.deepEqual(lines.filter(l => /^(WARNING|INFO|ERROR)/.test(l)), [], name);
      // (the board's model beside it when the test bench gives generics, #622: the design's own, which the test bench's
      // generic map does not fit; the test bench runs on the simulation's)
      const t = ex.project.top, board = Object.keys(r.report.simModels.postsynth.generics || {}).length > 0;
      assert.deepEqual(Object.keys(written).filter(f => /^netgen\//.test(f)).sort(), [`netgen/synthesis/${t}_synthesis.v`, `netgen/synthesis/${t}_synthesis.vhd`,
        ...(board ? [`netgen/synthesis/${t}_synthesis_board.v`, `netgen/synthesis/${t}_synthesis_board.vhd`] : [])], name);
      if (board) assert.doesNotMatch(written[`netgen/synthesis/${t}_synthesis_board.vhd`], /Synthesized with the generics/, name);
      for (const file of [`netgen/synthesis/${t}_synthesis.v`, `netgen/synthesis/${t}_synthesis.vhd`]) {
        const text = written[file];
        const lang = file.endsWith('.v') ? 'verilog' : 'vhdl';
        const all = [...design, ...sim, { path: file, lang, text: lang === 'vhdl' ? scalarizeNetlist(text) : text }];
        const lib = compile([...primitiveSources(all), ...all]);
        lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));   // (the model's entity replaces the RTL one)
        const d = elaborate(lib, ex.project.simTop);
        assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), [], `${name} ${lang}`);
        const s = new Simulator(d);
        for (const sig of d.signals) sig.wave = null;   // (no waveforms: vga's would take gigabytes, #566)
        for (let t = 1e9; t <= 1e11; t += 1e9) { const st = s.run(t); if (st.finished || s.log.some(e => /Simulation finished OK|ERROR/.test(e.text))) break; }
        const log = s.log.map(e => e.text);
        assert.ok(log.some(l => /Simulation finished OK/.test(l)) && !log.some(l => /ERROR/.test(l)), `${name} ${lang}: ${log.filter(l => /ERROR|expected/.test(l)).slice(0, 4).join(' | ')}`);
        // the Board Emulator's compiled engine runs the model (#561: it had no model of the LUTs, flip-flops…),
        // as the event-driven simulator does, cycle by cycle (the VHDL scalarized, as the emulator reads it)
        const model = [{ path: file, lang, role: 'design', text: lang === 'vhdl' ? scalarizeNetlist(text) : text }];
        const top = ex.project.top;
        const cs = await compileDesign(designOf(model, top), { run: yosysNode });
        assert.deepEqual(cs.warnings, [], `${name} ${lang}`);
        const ins = designOf(model, top).top.ports.filter(x => x.dir === 'in'), r = rng(561), cur = {};
        const res = await diffCycles(model, top, { cycles: 1500, inputs: k => { for (const x of ins) if (k === 0 || r() < 0.02) cur[x.name] = BigInt(Math.floor(r() * 2 ** Math.min(x.sig.t.w, 30))); return cur; } });
        assert.deepEqual(res.mismatches, [], `${name} ${lang}`);
        assert.ok(res.bits >= 1500, `${name} ${lang}: ${res.bits} bits compared`);
      }
    });
  }
}

// A VHDL test bench applying the same random inputs as netlistSim, half a clock period each (the inputs change
// with the clock low, then it rises), and the model's outputs read in the middle of each half. single: one
// input bit changes a cycle (a latch's gate and its data changing at the same instant race in a simulation
// without delays: the event-driven one and the cycle simulator settle them differently)
function bench(nl, m, clock, cycles, seed, single = false) {
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ports = [...m.vhdl.matchAll(/^ {4}(\w+) : (in|out|inout) (?:STD_LOGIC_VECTOR \( (\d+) downto (\d+) \)|STD_LOGIC)/gm)].map(x => ({ ident: x[1], dir: x[2], lsb: x[4] === undefined ? null : +x[4] }));
  const entity = /^entity (\w+) is/m.exec(m.vhdl)[1];
  ports.forEach((p, k) => { p.bits = nl.ports[k].bits.map(b => b.name); });
  const ins = ports.filter(p => p.dir === 'in' && p.bits[0] !== clock);
  const hasClock = ports.some(p => p.bits[0] === clock);
  const bits = ins.flatMap(p => p.bits);
  let cur = Object.fromEntries(bits.map(b => [b, 0]));
  const stim = Array.from({ length: cycles }, () => {
    if (single) cur = { ...cur, [bits[Math.floor(rnd() * bits.length)]]: rnd() < 0.5 ? 1 : 0 };
    else cur = Object.fromEntries(bits.map(b => [b, rnd() < 0.5 ? 1 : 0]));
    return cur;
  });
  const val = (p, v) => (p.lsb === null ? `'${v[p.bits[0]]}'` : `"${p.bits.map(b => v[b]).reverse().join('')}"`);
  const text = `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity tbx is end; architecture t of tbx is
${ports.map(p => `  signal ${p.ident}_s : ${p.lsb === null ? 'std_logic' : `std_logic_vector(${p.lsb + p.bits.length - 1} downto ${p.lsb})`};`).join('\n')}
begin
  u: entity work.${entity} port map (${ports.map(p => `${p.ident} => ${p.ident}_s`).join(', ')});
  process begin
${stim.map(v => `    ${ins.map(p => `${p.ident}_s <= ${val(p, v)}; `).join('')}${hasClock ? `${ports.find(p => p.bits[0] === clock).ident}_s <= '0'; ` : ''}wait for 10 ns;${hasClock ? ` ${ports.find(p => p.bits[0] === clock).ident}_s <= '1';` : ''} wait for 10 ns;`).join('\n')}
    wait;
  end process;
end;`;
  return { text, ports, stim, hasClock };
}
// (from the second cycle: netlistSim's clocks start at 0, so a falling-edge flip-flop sees an edge at its first step)
export function compareWithNetlist(nl, models, { clock = 'clk', cycles = 120, seed = 7, single = false } = {}) {
  const out = [];
  for (const [name, m] of Object.entries(models)) {
    for (const lang of ['vhdl', 'verilog']) {
      const b = bench(nl, m, clock, cycles, seed, single);
      const file = `model.${lang === 'vhdl' ? 'vhd' : 'v'}`;
      const all = [{ path: 'tbx.vhd', lang: 'vhdl', text: b.text }, { path: file, lang, text: m[lang] }];
      const lib = compile([...primitiveSources(all), ...all]);
      const d = elaborate(lib, 'tbx');
      const errs = [...lib.errors, ...d.diags].filter(x => x.severity === 'error');
      if (errs.length) { out.push(`${name} ${lang}: ${errs[0].message}`); continue; }
      const sim = new Simulator(d);
      const sig = new Map(d.signals.map(s => [s.name.toLowerCase(), s]));
      const ref = netlistSim(nl);
      const read = () => Object.fromEntries(b.ports.filter(p => p.dir === 'out').flatMap(p => p.bits.map((bn, k) => {
        const v = sig.get(`${p.ident}_s`.toLowerCase()).val, sh = BigInt(p.lsb === null ? 0 : k);
        return [bn, (v.x >> sh) & 1n ? 'x' : Number((v.v >> sh) & 1n)];
      })));
      let bad = null;
      for (let k = 0; k < b.stim.length && !bad; k++) {
        for (const clk of b.hasClock ? [0, 1] : [0]) {
          ref.step({ ...b.stim[k], ...(b.hasClock ? { [clock]: clk } : {}) });
          sim.run(20000 * k + (b.hasClock ? 10000 * clk : 0) + 5000);
          const got = read(), want = ref.out();
          const diff = Object.keys(want).filter(x => got[x] !== want[x]);
          if (diff.length && k > 0) { bad = `${name} ${lang}: cycle ${k} clk ${clk}: ${diff.map(x => `${x} ${got[x]} (netlist ${want[x]})`).join(', ')}`; break; }
        }
      }
      if (bad) out.push(bad);
    }
  }
  return out;
}

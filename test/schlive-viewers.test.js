// Try it on the read-only viewers (#1064): the RTL Schematic (the elaborated design drawn by core/schdoc.js) and
// the Technology Schematic (the Silinx toolchain's netlist, core/fpga/techview.js, its device primitives) simulated
// live as View RTL / Technology Schematic draws them (web/js/viewers.js): the outputs after clicking the inputs
// equal the RTL simulation's (the event-driven Simulator on the design itself), on the examples gates and blinky.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import { schematicFromHdl, modulesFromLibrary } from '../core/schdoc.js';
import { buildLiveSim, instanceGenerics, fmtValue, LIVE_STEP } from '../core/schlive.js';
import { primitiveSources } from '../core/unisim.js';
import { technologyNetlist } from '../core/fpga/techview.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { example } from './examples-lib.mjs';
import * as V from '../core/values.js';

// a drawing of a viewer and its Try it, as openSchematic makes them: the names as written, the instance's generics
async function viewerTry(srcs, inst) {
  const all = [...primitiveSources(srcs), ...srcs];
  const lib = compile(all);
  const files = Object.fromEntries(all.map(s => [s.path, s.text]));
  const modules = modulesFromLibrary(lib, { sources: files, asWritten: true });
  const doc = await schematicFromHdl(inst, { sources: files, modules, lang: inst.lang || 'vhdl' });
  const r = buildLiveSim(doc, { modules, sources: all, generics: instanceGenerics(inst) });
  assert.deepEqual(r.errors, [], r.code);
  assert.deepEqual(r.warnings, []);
  const live = r.live, id = n => doc.ports.find(p => p.name.toLowerCase() === n).id;
  return {
    live,
    inputs: live.inputs.map(i => `${i.name.toLowerCase()}${i.clock ? ':clock' : ''}`),
    set: (n, v) => live.set(id(n), BigInt(v)),
    cycle: n => live.cycle(id(n)),
    out: n => fmtValue(live.portValue(id(n)), 'bin'),
  };
}
// the RTL simulation of the design: its inputs forced (all 0 at first), each change settled as Try it settles it
function rtlSim(design) {
  const sim = new Simulator(design, { maxWaveEvents: 0 });
  const sig = n => design.top.ports.find(p => p.name.toLowerCase() === n).sig;
  const settle = () => sim.run(sim.now + LIVE_STEP);
  const set = (n, v) => { sim.force(sig(n), V.mk(sig(n).t.w, BigInt(v))); settle(); };
  for (const p of design.top.ports) if (p.dir === 'in') sim.force(p.sig, V.mk(p.sig.t.w, 0n));
  settle();
  return { set, cycle: n => { set(n, 1); set(n, 0); }, out: n => fmtValue(sig(n).val, 'bin') };
}
// the Technology Schematic's netlist of a design: synthesized by Yosys, regrouped by the design's instances
async function techNetlist(design) {
  const syn = await synthesizeOpen(design, { run: yosysNode });
  const r = technologyNetlist(syn.files[`${syn.top}.json`], { groups: design.top.children.map(c => c.name) });
  const net = { path: `build/open/${syn.top}_tech.vhd`, lang: 'vhdl', text: r.text, role: 'design', netlist: 'open' };
  const lib = compile([...primitiveSources([net]), net]);
  return { srcs: [net], top: elaborate(lib, r.name).top };
}

test('instanceGenerics: the integer generics of an elaborated instance', () => {
  const ex = example('blinky');
  const design = elaborate(compile(ex.design), 'top', { generics: { DIV: 2, DEBOUNCE: 2, REFRESH: 4 } });
  assert.deepEqual(instanceGenerics(design.top), { div: 2, debounce: 2, refresh: 4 });   // (VHDL: lower case)
  assert.deepEqual(instanceGenerics(design.top.children.find(c => c.name === 'u_pre')), { DIV: 2 });   // (Verilog)
  assert.deepEqual(instanceGenerics(design.top.children.find(c => c.name === 'u_knight')), {});
  assert.deepEqual(instanceGenerics(null), {});
});

test('gates: Try it on the RTL and the Technology Schematic, every input value, the outputs of the RTL simulation', { timeout: 300000 }, async () => {
  const ex = example('gates');
  const design = elaborate(compile(ex.design), ex.project.top);
  const ref = rtlSim(design);
  const rtl = await viewerTry(ex.design, design.top);
  const tn = await techNetlist(design);
  const tech = await viewerTry(tn.srcs, tn.top);
  assert.deepEqual(rtl.inputs, ['sw']);
  assert.deepEqual(tech.inputs, ['sw']);
  // the prime-number detector: 2, 3, 5, 7, 11, 13 light both LEDs
  const want = [];
  for (let v = 0; v < 16; v++) want.push([2, 3, 5, 7, 11, 13].includes(v) ? '11' : '00');
  for (const [name, x] of [['RTL simulation', ref], ['RTL Schematic', rtl], ['Technology Schematic', tech]]) {
    const got = [];
    for (let v = 0; v < 16; v++) { x.set('sw', v); got.push(x.out('led')); }
    assert.deepEqual(got, want, name);
  }
});

test('blinky: Try it on the RTL and the Technology Schematic, clock stepped, switches and buttons clicked: the outputs of the RTL simulation', { timeout: 300000 }, async () => {
  const ex = example('blinky');
  const generics = { DIV: 2, DEBOUNCE: 2, REFRESH: 4 };   // (the test bench's: the LEDs move within a few cycles)
  const design = elaborate(compile([...primitiveSources(ex.design), ...ex.design]), 'top', { generics });
  const ref = rtlSim(design);
  const rtl = await viewerTry(ex.design, design.top);
  const tn = await techNetlist(design);
  const tech = await viewerTry(tn.srcs, tn.top);
  // the clock: read on an edge by the RTL, wired through IBUFG / BUFG to the flip-flops' C in the netlist
  assert.deepEqual(rtl.inputs, ['clk:clock', 'sw', 'btn']);
  assert.deepEqual(tech.inputs, ['clk:clock', 'sw', 'btn']);
  const outs = ['led', 'seg', 'dp', 'an'];
  const all = [ref, rtl, tech];
  const check = what => { const w = outs.map(ref.out); for (const x of [rtl, tech]) assert.deepEqual(outs.map(x.out), w, `${x === rtl ? 'RTL' : 'Technology'}: ${what}`); };
  const script = [['sw', 0b0001], ['clk'], ['clk'], ['sw', 0]];
  for (let k = 0; k < 200; k++) script.push(['clk']);
  script.push(['sw', 0b0010]);                                // the binary counter mode
  for (let k = 0; k < 150; k++) script.push(['clk']);
  script.push(['btn', 0b10]);                                 // faster
  for (let k = 0; k < 12; k++) script.push(['clk']);
  script.push(['btn', 0], ['sw', 0b1000]);                     // sw(3) inverts the LEDs
  for (let k = 0; k < 100; k++) script.push(['clk']);
  const seen = new Set();
  for (const [i, [n, v]] of script.entries()) {
    for (const x of all) { if (n === 'clk') x.cycle('clk'); else x.set(n, v); }
    check(`step ${i} (${n}${v == null ? '' : ` = ${v}`})`);
    seen.add(ref.out('led'));
  }
  assert.ok(seen.size >= 8, `the LEDs moved: ${[...seen].join(' ')}`);
});

test('a module whose file defines its submodules too: Try it on its drawing keeps them (the schematic\'s model named apart)', async () => {
  const text = `library ieee; use ieee.std_logic_1164.all;
entity inv1 is port (a : in std_logic; y : out std_logic); end inv1;
architecture rtl of inv1 is begin y <= not a; end rtl;
library ieee; use ieee.std_logic_1164.all;
entity pair is port (a, b : in std_logic; y, z : out std_logic); end pair;
architecture rtl of pair is begin
  u1: entity work.inv1 port map (a => a, y => y);
  z <= a and b;
end rtl;`;
  const srcs = [{ path: 'src/pair.vhd', lang: 'vhdl', text, role: 'design' }];
  const design = elaborate(compile(srcs), 'pair');
  const x = await viewerTry(srcs, design.top);
  assert.deepEqual(x.inputs, ['a', 'b']);
  assert.match(x.live.design.top.name, /^pair_live$/i);
  assert.deepEqual([x.out('y'), x.out('z')], ['1', '0']);
  x.set('a', 1); x.set('b', 1);
  assert.deepEqual([x.out('y'), x.out('z')], ['0', '1']);
});

test('device primitives: a clock through IBUFG and BUFG to a flip-flop\'s C is a clock input; a data input is not', async () => {
  const text = `library ieee; use ieee.std_logic_1164.all; library unisim; use unisim.vcomponents.all;
entity t is port (clk, d : in std_logic; q : out std_logic); end t;
architecture a of t is signal c1, c2 : std_logic; begin
  b1: IBUFG port map (I => clk, O => c1);
  b2: BUFG port map (I => c1, O => c2);
  f: FDRE port map (C => c2, CE => '1', R => '0', D => d, Q => q);
end a;`;
  const srcs = [{ path: 'build/t.vhd', lang: 'vhdl', text, role: 'design' }];
  const design = elaborate(compile([...primitiveSources(srcs), ...srcs]), 't');
  const x = await viewerTry(srcs, design.top);
  assert.deepEqual(x.inputs, ['clk:clock', 'd']);
  x.set('d', 1);
  assert.equal(x.out('q'), '0');
  x.cycle('clk');
  assert.equal(x.out('q'), '1');
});

// The Post-Translate and Post-Map Simulation Models of the Silinx toolchain (core/sim-model.js, the flow's
// posttrans and postmap steps, #121): the models' VHDL and Verilog (SIMPRIM primitives, the top's ports, the
// generics they were synthesized with); both models simulated against an independent reference (the
// netlist's cycle simulator of test/fpga-sim.js) on the packer's fixtures and on small designs with shift
// registers, distributed and block RAMs, multipliers and latches; the flow's steps, their report and their
// exact log; and every example's test bench passes on both models, in VHDL and in Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { postTranslateModels, postMapModels, SIMPRIM_PRIMITIVES } from '../core/sim-model.js';
import { runOpenFlow } from '../core/open-flow-core.js';
import { orderOpenSteps } from '../core/open-steps.js';
import { readYosysJson, paramBits } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { scalarizeNetlist } from '../core/netlist-hier.js';
import { Simulator } from '../core/simulator.js';
import { netlistSim } from './fpga-sim.js';
import zlib from 'node:zlib';
import { loadDevice } from '../core/fpga/device.js';
import { shippedDevicePath } from '../core/fpga/device-node.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FPGA = path.join(HERE, 'fixtures', 'fpga'), DESIGNS = path.join(HERE, 'fixtures', 'designs');

const DUT = `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity cnt is generic ( N : integer := 1000; W : integer := 4 ); port ( clk : in std_logic; rst : in std_logic; q : out std_logic_vector(W - 1 downto 0) ); end;
architecture a of cnt is signal c : integer range 0 to N := 0; signal v : unsigned(W - 1 downto 0) := (others => '0');
begin process (clk) begin if rising_edge(clk) then if rst = '1' then v <= (others => '0'); c <= 0; elsif c = N - 1 then c <= 0; v <= v + 1; else c <= c + 1; end if; end if; end process; q <= std_logic_vector(v); end;`;
const TB = `library IEEE; use IEEE.STD_LOGIC_1164.ALL; use IEEE.NUMERIC_STD.ALL;
entity tb is end; architecture t of tb is signal clk, rst : std_logic := '0'; signal q : std_logic_vector(3 downto 0);
begin clk <= not clk after 5 ns; u: entity work.cnt generic map (N => 3) port map (clk => clk, rst => rst, q => q);
process begin wait for 95 ns; report "q = " & integer'image(to_integer(unsigned(q))); wait; end process; end;`;
// the device description Map's report needs (loaded once)
let DEVICE = null;
const device = () => (DEVICE ||= loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(shippedDevicePath('xc3s250ecp132-4'))).toString('utf8'))));
const src = [{ path: 'cnt.vhd', lang: 'vhdl', text: DUT }], tb = [{ path: 'tb.vhd', lang: 'vhdl', text: TB }];

// a model compiled with the test bench (its entity replaces the RTL one), elaborated, simulated
function simulate(sources, file, text, top, until, { stop = /Simulation finished OK|ERROR/ } = {}) {
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

test('postTranslateModels: the netlist as SIMPRIM primitives, the top\'s ports and generics, the header, both languages', async () => {
  const r = await synthesizeOpen(elaborate(compile(src), 'cnt', { generics: { N: 3 } }), { family: 'spartan3e', run: yosysNode });
  const nl = readYosysJson(r.files[`${r.top}.json`]);
  const m = postTranslateModels(nl, { top: 'cnt', part: 'xc3s250ecp132-4', generics: { N: 3 }, testbench: 'tb' });
  const head = [
    "-- Post-Translate Simulation Model of 'cnt' (xc3s250ecp132-4): the netlist of the open synthesis translated (Silinx toolchain),",
    '-- the SIMPRIM primitives it is made of (functional, no timing); written by Silinx. Simulate it with the test',
    "-- bench in place of the design's own HDL (its entity has the top's ports).",
    "-- Synthesized with the generics the test bench 'tb' gives: N = 3.",
  ];
  assert.deepEqual(m.vhdl.split('\n').slice(0, 4), head);
  assert.match(m.vhdl, /^library SIMPRIM;\nuse SIMPRIM\.VCOMPONENTS\.ALL;\nuse SIMPRIM\.VPACKAGE\.ALL;$/m);
  assert.match(m.vhdl, /^entity cnt is\n {2}generic \(\n {4}N : integer := 3\n {2}\);\n {2}port \(\n {4}clk : in STD_LOGIC;\n {4}rst : in STD_LOGIC;\n {4}q : out STD_LOGIC_VECTOR \( 3 downto 0 \)\n {2}\);$/m);
  assert.deepEqual(m.verilog.split('\n').slice(0, 4), head.map(l => l.replace(/^--/, '//')));
  assert.match(m.verilog, /^module cnt \(clk, rst, q\);\n {2}parameter N = 3;\n {2}input clk;\n {2}input rst;\n {2}output \[3:0\] q;$/m);
  // each cell as ngdbuild translates it: the flip-flops with their reset synchronous (X_SFF), the carry chain's
  // MUXCY / XORCY as X_MUX2 / X_XOR2, the clock buffer an X_CKBUF, the pads X_BUF / X_OBUF
  const types = new Set([...m.vhdl.matchAll(/^ {2}\w+ : (\w+)$/gm)].map(x => x[1]));
  assert.deepEqual([...types].filter(t => !SIMPRIM_PRIMITIVES.has(t)), []);
  for (const t of ['X_SFF', 'X_MUX2', 'X_XOR2', 'X_CKBUF', 'X_BUF', 'X_OBUF']) assert.ok(types.has(t), `${t}: ${[...types]}`);
  assert.ok([...types].some(t => /^X_LUT[1-4]$/.test(t)), [...types].join(' '));
  assert.equal(m.instances, [...m.vhdl.matchAll(/^ {2}\w+ : X_\w+$/gm)].length);
  // the Verilog model needs Silinx's SIMPRIM models (and UNISIM's: X_LUT4 is made of LUT4) as the VHDL one does
  assert.deepEqual(primitiveSources([{ path: 'm.v', lang: 'verilog', text: m.verilog }]).map(x => x.path), ['<silinx>/unisim.vhd', '<silinx>/simprim.vhd']);
  assert.deepEqual(primitiveSources([{ path: 'm.vhd', lang: 'vhdl', text: m.vhdl }]).map(x => x.path), ['<silinx>/unisim.vhd', '<silinx>/simprim.vhd']);
  assert.deepEqual(m.unknown, []);
  // an FDRE: its R the synchronous reset, no asynchronous one
  assert.match(m.vhdl, /: X_SFF\n {4}generic map \(\n {6}INIT => '0'\n {4}\)\n {4}port map \(\n {6}I => \w+,\n {6}CE => \S+,\n {6}CLK => \w+,\n {6}SET => '0',\n {6}RST => '0',\n {6}SSET => '0',\n {6}SRST => \w+,\n {6}O => \w+\n {4}\);/);
});

test('postMapModels: the packed slices as their elements (LUTs, carry, flip-flops), only the LUT inputs their equation reads (#121)', async () => {
  const r = await synthesizeOpen(elaborate(compile(src), 'cnt', { generics: { N: 3 } }), { family: 'spartan3e', run: yosysNode });
  const nl = readYosysJson(r.files[`${r.top}.json`]);
  const m = postMapModels(nl, pack(nl, { carryOut: 'xor' }), { top: 'cnt', part: 'xc3s250ecp132-4' });
  assert.deepEqual(m.vhdl.split('\n').slice(0, 3), [
    "-- Post-Map Simulation Model of 'cnt' (xc3s250ecp132-4): the packed design (Silinx toolchain),",
    '-- the SIMPRIM primitives it is made of (functional, no timing); written by Silinx. Simulate it with the test',
    "-- bench in place of the design's own HDL (its entity has the top's ports).",
  ]);
  assert.match(m.vhdl, /^entity cnt is\n {2}port \(/m);
  assert.match(m.verilog, /^module cnt \(clk, rst, q\);\n {2}input clk;/m);
  assert.deepEqual(m.unknown, []);
  const types = new Set([...m.vhdl.matchAll(/^ {2}\w+ : (\w+)$/gm)].map(x => x[1]));
  for (const t of ['X_LUT4', 'X_SFF', 'X_MUX2', 'X_XOR2', 'X_BUFGMUX', 'X_BUF', 'X_OBUF']) assert.ok(types.has(t), `${t}: ${[...types]}`);
  // every LUT: an input its INIT does not depend on is tied to 0 (the packer wires the carry's data input to
  // a pin the LUT may not read; connected, an unknown value there made the LUT unknown on a loop: vga's model
  // never left X)
  const luts = [...m.vhdl.matchAll(/: X_LUT4\n {4}generic map \(\n {6}INIT => X"([0-9A-F]{4})"\n {4}\)\n {4}port map \(\n((?: {6}ADR\d => \S+,\n){4})/g)];
  assert.ok(luts.length > 3, luts.length);
  for (const [, hex, pins] of luts) {
    const f = paramBits(BigInt(`0x${hex}`).toString(2).padStart(16, '0'));
    [...pins.matchAll(/ADR(\d) => (\S+),/g)].forEach(([, j, net]) => {
      const reads = f.some((b, a) => b !== f[a ^ (1 << +j)]);
      if (!reads) assert.equal(net, "'0'", `INIT ${hex}: ADR${j} => ${net}`);
    });
  }
});

// ------------------------------------------------------------------ against the netlist's cycle simulator
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
function compareWithNetlist(nl, models, { clock = 'clk', cycles = 120, seed = 7, single = false } = {}) {
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
const bothModels = nl => ({ translate: postTranslateModels(nl, { top: nl.name }), map: postMapModels(nl, pack(nl, { carryOut: 'xor' }), { top: nl.name }) });

for (const name of ['sw', 'counter', 'ffs', 'widemux', 'mux64', 'latches', 'srmux']) {
  test(`fixture ${name}: both models behave as the netlist, in VHDL and in Verilog (random stimulus)`, () => {
    const nl = readYosysJson(fs.readFileSync(path.join(FPGA, `${name}.json`), 'utf8'));
    const models = bothModels(nl);
    for (const m of Object.values(models)) assert.deepEqual(m.unknown, []);
    assert.deepEqual(compareWithNetlist(nl, models, { single: name === 'latches' }), []);
  });
}
// (the shift registers, distributed and block RAMs, multipliers, latches, a state machine: synthesized here)
for (const name of ['adder', 'bram_dp', 'bram_prim', 'bram_sp', 'dram', 'fsm', 'latch', 'mult', 'srl']) {
  test(`design ${name}: both models behave as the netlist, in VHDL and in Verilog (random stimulus)`, { timeout: 300000 }, async () => {
    const j = JSON.parse(fs.readFileSync(path.join(DESIGNS, name, 'design.json'), 'utf8'));
    const files = j.files.map(f => ({ path: f, lang: /\.vhdl?$/.test(f) ? 'vhdl' : 'verilog', text: fs.readFileSync(path.join(DESIGNS, name, f), 'utf8') }));
    const r = await synthesizeOpen(elaborate(compile([...primitiveSources(files), ...files]), j.top), { family: 'spartan3e', run: yosysNode });
    const nl = readYosysJson(r.files[`${r.top}.json`]);
    const models = bothModels(nl);
    for (const m of Object.values(models)) assert.deepEqual(m.unknown, []);
    assert.deepEqual(compareWithNetlist(nl, models, { clock: j.sim?.clock || 'clk', cycles: 150, single: name === 'latch' }), []);
  });
}

test('the flow\'s posttrans and postmap steps: the models synthesized with the test bench\'s generics, written, in the report, the exact log', { timeout: 300000 }, async () => {
  const written = {}, lines = [];
  const r = await runOpenFlow({ top: 'cnt', part: 'xc3s250ecp132-4', family: 'spartan3e', steps: orderOpenSteps(['postmap', 'posttrans']), simTop: 'tb' },
    { log: l => lines.push(l), sources: () => src, simSources: () => tb, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {}, device });
  assert.equal(r.ok, true, lines.join('\n'));
  assert.deepEqual(lines.filter(l => /^=== SILINX STEP/.test(l)), ['synth', 'translate', 'posttrans', 'map', 'postmap'].map(x => `=== SILINX STEP ${x} ===`));
  assert.deepEqual(Object.keys(written).filter(f => /^netgen/.test(f)).sort(), ['netgen/map/cnt_map.v', 'netgen/map/cnt_map.vhd', 'netgen/translate/cnt_translate.v', 'netgen/translate/cnt_translate.vhd']);
  assert.deepEqual(r.report.simModels, {
    posttrans: { path: 'build/netgen/translate/cnt_translate.vhd', verilog: 'build/netgen/translate/cnt_translate.v', testbench: 'tb', generics: { n: 3 } },
    postmap: { path: 'build/netgen/map/cnt_map.vhd', verilog: 'build/netgen/map/cnt_map.v', testbench: 'tb', generics: { n: 3 } },
  });
  // (the model's design synthesized once for both models)
  const count = re => re.exec(lines.join('\n'))[1];
  assert.deepEqual(lines.filter(l => /^(WARNING|INFO|ERROR|Synthesizing|Post-)/.test(l)), [
    "Synthesizing 'cnt' with the generics the test bench 'tb' gives: n = 3",
    `Post-Translate Simulation Model: build/netgen/translate/cnt_translate.vhd (VHDL, SIMPRIM primitives) and build/netgen/translate/cnt_translate.v (Verilog), ${count(/translate\.v \(Verilog\), (\d+) primitives/)} primitives`,
    `Post-Map Simulation Model: build/netgen/map/cnt_map.vhd (VHDL, SIMPRIM primitives) and build/netgen/map/cnt_map.v (Verilog), ${count(/map\.v \(Verilog\), (\d+) primitives/)} primitives`,
  ]);
  // the test bench on the models: q counts every 3 clocks (95 ns: 9 edges, q = 3), no warnings
  for (const [file, text] of Object.entries(written).filter(([f]) => /^netgen/.test(f))) {
    const s = simulate(tb, file, text, 'tb', 2e5, { stop: /^q = / });
    assert.deepEqual(s.diags, [], file);
    assert.deepEqual(s.log, ['q = 3'], file);
  }
  // without a test bench: the design's own generics, from this run's netlist and packed design (no synthesis again)
  const lines3 = [];
  const r3 = await runOpenFlow({ top: 'cnt', part: 'xc3s250ecp132-4', family: 'spartan3e', steps: orderOpenSteps(['postmap', 'posttrans']) },
    { log: l => lines3.push(l), sources: () => src, yosys: yosysNode, write: n => `build/${n}`, read: () => null, save: () => {}, device });
  assert.equal(r3.ok, true, lines3.join('\n'));
  assert.deepEqual(r3.report.simModels.postmap, { path: 'build/netgen/map/cnt_map.vhd', verilog: 'build/netgen/map/cnt_map.v' });
  assert.deepEqual(lines3.filter(l => /^(WARNING|INFO|ERROR|Synthesizing)/.test(l)), []);
});

// every example's test bench, on both models of the example (its generics the test bench's), VHDL and Verilog,
// with no warnings (the examples' test benches report "Simulation finished OK" when every check passed)
for (const name of EXAMPLES) {
  for (const [step, dir] of [['posttrans', 'translate'], ['postmap', 'map']]) {
    test(`example ${name}: its test bench passes on the ${dir === 'map' ? 'post-map' : 'post-translate'} model, VHDL and Verilog (#121)`, { timeout: 900000 }, async () => {
      const ex = example(name);
      const design = ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), sim = ex.sim.map(f => ({ path: f.path, lang: f.lang, text: f.text }));
      const written = {}, lines = [];
      const r = await runOpenFlow({ top: ex.project.top, part: 'xc3s250ecp132-4', family: 'spartan3e', steps: orderOpenSteps([step]), simTop: ex.project.simTop },
        { log: l => lines.push(l), sources: () => design, simSources: () => sim, yosys: yosysNode, write: (n, d) => { written[n] = d; return `build/${n}`; }, read: () => null, save: () => {}, device });
      assert.equal(r.ok, true, lines.join('\n'));
      assert.deepEqual(lines.filter(l => /^(WARNING|INFO|ERROR)/.test(l)), [], name);
      // (the model's files: the synthesis writes the netlist's too)
      for (const f of Object.keys(written)) if (!/^netgen\//.test(f)) delete written[f];
      assert.deepEqual(Object.keys(written).sort(), [`netgen/${dir}/${ex.project.top}_${dir}.v`, `netgen/${dir}/${ex.project.top}_${dir}.vhd`]);
      for (const [file, text] of Object.entries(written)) {
        const s = simulate([...design, ...sim], file, text, ex.project.simTop, name === 'vga' ? 3e10 : 1e11);
        assert.deepEqual(s.diags, [], `${name} ${file}`);
        assert.ok(s.log.some(l => /Simulation finished OK/.test(l)), `${name} ${file}: ${s.log.slice(-4).join(' | ')}`);
        assert.deepEqual(s.log.filter(l => /ERROR|WARNING/.test(l)), [], `${name} ${file}`);
      }
    });
  }
}

// The examples' post-synthesis netlists on the Gowin (#2299, the Tang Nano 9K's GW1NR-9C, #2303): each example synthesized by
// the Gowin's synthesis (Yosys's synth_gowin, open-flow-gowin.js GOWIN.synth) with the generics its test bench gives it, its
// Verilog netlist (LUT4, DFF*, ALU, MUX2_LUT*, RAM16SDP4, DPX9B, SPX9, MULT18X18 …) simulated with the Gowin primitives'
// models (packages/silinx-hdl/src/gowin-prims.js) in place of its RTL: the test bench passes on it as on the RTL, no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { flowFrontEnd } from '../core/synth-front.js';
import { dutGenerics } from '../core/sim-model.js';
import { Simulator } from '../core/simulator.js';
import { GOWIN } from '../packages/silinx-fpga/src/open-flow-gowin.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { EXAMPLES, example } from './examples-lib.mjs';

// a test bench's run: its log (warnings marked), until it says it finished or failed
function run(sources, top, until = 1e11) {
  const lib = compile([...primitiveSources(sources), ...sources]);
  const d = elaborate(lib, top);
  assert.deepEqual([...lib.errors, ...d.diags].map((x) => `${x.file}:${x.line} ${x.message}`), [], top);
  const s = new Simulator(d);
  for (const sig of d.signals) sig.wave = null;
  for (let t = until / 100; t <= until; t += until / 100) { const st = s.run(t); if (st.finished || s.log.some((e) => /Simulation finished OK|ERROR/.test(e.text))) break; }
  return s.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`);
}

const cellsSeen = new Set();
for (const name of EXAMPLES) {
  test(`example ${name}: its test bench passes on its Gowin post-synthesis netlist as on its RTL, no warning`, { timeout: 900000 }, async () => {
    const ex = example(name), top = ex.project.top;
    const design = ex.design.map(({ path, lang, text }) => ({ path, lang, text }));
    const sim = ex.sim.map(({ path, lang, text }) => ({ path, lang, text }));
    const rtl = run([...design, ...sim], ex.project.simTop);
    assert.ok(rtl.includes('Simulation finished OK'), `${name} RTL: ${rtl.slice(-3).join(' | ')}`);
    // (synthesized with the test bench's generics, declared in the netlist: the test bench's generic map fits it)
    const all = [...design, ...sim];
    const g = dutGenerics(elaborate(compile([...primitiveSources(all), ...all]), ex.project.simTop), top);
    const fe = flowFrontEnd(design, top, { generics: g.generics });
    assert.deepEqual(fe.errors, [], name);
    const r = await GOWIN.synth(fe.input(), { run: yosysNode });
    for (const c of Object.keys(r.cells)) cellsSeen.add(c);
    const gens = Object.entries(g.generics);
    const net = r.files[`${r.top}_yosys.v`].replace(/^(module [^;]*;\n)/m, `$1${gens.map(([k, v]) => `  parameter ${k} = ${v};\n`).join('')}`);
    const netlist = { path: `${top}_gowin.v`, lang: 'verilog', text: net };
    assert.deepEqual(primitiveSources([netlist]).map((s) => s.path), ['<silinx>/gowin.vhd'], name);
    const log = run([netlist, ...sim], ex.project.simTop);
    assert.ok(log.includes('Simulation finished OK'), `${name} netlist: ${log.slice(-3).join(' | ')}`);
    assert.deepEqual(log.filter((l) => /ERROR|WARNING/.test(l)), [], name);
  });
}

test('the examples\' netlists: the Gowin cells they are made of, each simulated above', () => {
  for (const c of ['LUT1', 'LUT2', 'LUT3', 'LUT4', 'MUX2_LUT5', 'MUX2_LUT6', 'MUX2_LUT7', 'MUX2_LUT8', 'ALU', 'DFF', 'DFFE', 'DFFR', 'DFFRE', 'DFFS', 'DFFSE',
    'IBUF', 'OBUF', 'VCC', 'GND', 'RAM16SDP4', 'DPX9B', 'SPX9', 'MULT18X18']) assert.ok(cellsSeen.has(c), c);
});

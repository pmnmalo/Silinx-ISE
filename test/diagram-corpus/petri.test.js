// The Petri nets of the diagram corpus (#205): P/T nets of the Model Checking Contest 2026
// (test/diagram-corpus/mcc.json, fetched by scripts/fetch-diagram-corpus.mjs, never committed), read
// from their PNML and analysed (core/petri-analysis.js): the size of the reachability graph, the most
// tokens in a place and in a marking, deadlock, liveness, 1-safe, against the contest's results; the
// small safe ones also as hardware (the generated VHDL / Verilog simulated against the clock step).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fromPnml, normalizePetri, generatePetri, initialMarking, clockStep, outputsOf } from '../../core/petri.js';
import { analyzePetri } from '../../core/petri-analysis.js';
import { simulate } from '../../core/compile.js';
import { fetchMcc, netFile, MCC_MANIFEST } from '../../scripts/fetch-diagram-corpus.mjs';

const manifest = JSON.parse(fs.readFileSync(MCC_MANIFEST, 'utf8'));
// the capacities: PNML has none (the nets are unbounded in principle); 255 is above every bound here
const read = net => { const n = fromPnml(fs.readFileSync(netFile(net), 'utf8')); return normalizePetri({ ...n, places: n.places.map(p => ({ ...p, capacity: 255 })) }); };

test.before(async () => { await fetchMcc({ log: () => {} }); });

for (const net of manifest.nets) {
  test(`MCC ${net.instance}: the analysis gives the contest's results`, { timeout: 120000 }, () => {
    const m = read(net);
    assert.deepEqual([m.places.length, m.transitions.length], [net.places, net.transitions], 'places, transitions');
    const a = analyzePetri(m, { maxStates: 50000 });
    assert.equal(a.truncated, false);
    const tokens = s => Object.values(s.marking).reduce((x, y) => x + y, 0);
    assert.deepEqual({
      states: a.states.length, edges: a.states.reduce((s, x) => s + x.succ.length, 0),
      maxTokensInPlace: Math.max(...Object.values(a.bounds)), maxTokensInMarking: Math.max(...a.states.map(tokens)),
      deadlock: a.deadlockCount > 0, live: a.live, safe: a.safe,
    }, net.expected);
  });
}

// the hardware: no inputs, every transition fires when it can (the clock step); the outputs: one per place (marked)
test('MCC nets as hardware: the VHDL and Verilog of the small safe nets simulate like the clock step', { timeout: 300000 }, () => {
  for (const net of manifest.nets.filter(n => n.expected.safe && n.places <= 40)) {
    const m0 = read(net);
    const outs = m0.places.map((p, i) => ({ name: `m${i}`, width: 1 }));
    const m = normalizePetri({ ...m0, name: 'net', inputs: [], outputs: outs, places: m0.places.map((p, i) => ({ ...p, capacity: 1, outputs: { [`m${i}`]: '1' } })) });
    let k = initialMarking(m);
    const want = [];
    for (let c = 0; c < 40; c++) { want.push(m.outputs.map(o => outputsOf(m, k)[o.name].toString(2)).join('')); k = clockStep(m, k, {}).marking; }
    for (const lang of ['vhdl', 'verilog']) {
      const tb = ['module tb;', '  reg clk = 0; reg rst = 1;', `  wire [${outs.length - 1}:0] o;`,
        `  net dut(.clk(clk), .rst(rst)${outs.map((o, i) => `, .${o.name}(o[${outs.length - 1 - i}])`).join('')});`,
        '  always #5 clk = ~clk;', '  integer c;', '  initial begin', '    #12 rst = 0;',
        '    for (c = 0; c < 40; c = c + 1) begin #2 $display("%b", o); @(posedge clk); #1; end', '    $finish;', '  end', 'endmodule'].join('\n');
      const r = simulate([{ path: lang === 'vhdl' ? 'net.vhd' : 'net.v', text: generatePetri(m, lang).code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e8 });
      assert.deepEqual(r.errors, [], `${net.instance} ${lang}`);
      assert.deepEqual(r.sim.log.map(e => String(e.text).trim()).filter(s => /^[01xz]+$/.test(s)), want, `${net.instance} ${lang}`);
    }
  }
});

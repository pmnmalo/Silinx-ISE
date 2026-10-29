// The state machines of the diagram corpus (#205, test/diagram-corpus/fsm/) synthesized by the open
// toolchain (Yosys): the netlist simulated against the HDL, its size recorded (sizes.json: a bigger
// netlist is a regression to look at). SILINX_UPDATE_CORPUS=1 records the sizes found.
// npm run test:diagrams (with test/diagram-corpus/petri.test.js); the rest: test/diagram-corpus.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromKiss2 } from '../../core/kiss2.js';
import { generateFsm } from '../../core/fsm.js';
import { compile, elaborate } from '../../core/compile.js';
import { synthesizeOpen } from '../../core/synth-front.js';
import { yosysNode } from '../../packages/silinx-fpga/src/synth-open-node.js';
import { compareNetlist } from '../diff-synth.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SIZES = path.join(DIR, 'sizes.json');
const UPDATE = process.env.SILINX_UPDATE_CORPUS === '1';
const sizes = JSON.parse(fs.readFileSync(SIZES, 'utf8'));
const found = {};
const machines = fs.readdirSync(path.join(DIR, 'fsm')).filter(f => f.endsWith('.kiss2')).sort();

for (const f of machines) {
  const name = f.replace(/\.kiss2$/, '');
  test(`FSM ${name}: synthesized by Yosys, the netlist simulates like the HDL, its size`, { timeout: 180000 }, async () => {
    const m = fromKiss2(fs.readFileSync(path.join(DIR, 'fsm', f), 'utf8'), { name });
    const design = elaborate(compile([{ path: `${name}.v`, lang: 'verilog', text: generateFsm(m, 'verilog').code }]), name);
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(r.warnings, []);
    const d = compareNetlist(design, r, { name, sim: { cycles: 300 } });
    assert.equal(d.status, 'pass', d.report || JSON.stringify(d));
    found[name] = Object.fromEntries(Object.entries(r.cells).sort(([a], [b]) => a.localeCompare(b)));
    if (!UPDATE) assert.deepEqual(found[name], sizes.fsm[name], `${name}: the cells of its netlist`);
  });
}

test.after(() => {
  if (UPDATE) fs.writeFileSync(SIZES, `${JSON.stringify({ ...sizes, fsm: Object.fromEntries(Object.keys(found).sort().map(k => [k, found[k]])) }, null, 2)}\n`);
});

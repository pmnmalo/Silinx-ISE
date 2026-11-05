// Silinx HLS's RTL blackbox through synthesis (#2341, #1903 checked it by co-simulation only): an HLS module whose C function
// calls a hand-written module of the project, in the other language (a VHDL machine calling a Verilog module, and a Verilog
// machine calling a VHDL one, test/fixtures/hls-blackbox), on a board: the C model left out of the design's modules, the
// Silinx toolchain's whole flow (Yosys, nextpnr, bitgen) on every device of the examples (TARGETS), no warning. ISE's XST
// builds them too, in test/ise/hls-blackbox.test.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TARGETS, targetName, silinxFlow } from './examples-lib.mjs';
import { DESIGNS, FIXTURES, blackboxSources, blackboxProject } from './hls-blackbox-lib.mjs';
import { blackboxModels, blackboxesIn } from '../core/c-blackbox.js';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';

for (const lang of DESIGNS) {
  test(`#2341 the ${lang} HLS module with a blackbox in the other language: the C model not a module; the C simulation and the co-simulation pass; no warnings`, async () => {
    const dir = path.join(FIXTURES, lang);
    const { views } = await blackboxSources(lang);
    // (the C model, adder_model.cpp, had been made a module of its own: 'adder' is the top function, refused, #2854)
    assert.deepEqual(views.map(v => [v.path, v.module, v.lang, v.errors]), [['src/mac.cpp', 'mac', lang, []]]);
    const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
    const files = ['src/adder.json', 'src/adder_model.cpp', lang === 'vhdl' ? 'src/adder.v' : 'src/adder.vhd', 'src/mac.cpp'];
    const hls = await blackboxesIn(files, read);
    assert.deepEqual([...blackboxModels(hls)], ['src/adder_model.cpp']);
    const opts = { file: 'src/mac.cpp', top: 'mac', ...hls };
    const sim = simulateC(read('src/mac.cpp'), opts);
    assert.equal(sim.exitCode, 0);
    assert.deepEqual(sim.diagnostics.filter(d => d.severity === 'warning'), []);
    const c = cosimulate(read('src/mac.cpp'), { ...opts, lang });
    assert.deepEqual(c.errors, []);
    assert.deepEqual(c.mismatches, []);
    assert.equal(c.pass, true);
    assert.equal(c.calls, 256);
    assert.deepEqual(c.gen.diagnostics.filter(d => d.severity === 'warning'), []);
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-hls-blackbox-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
describe('the HLS module with a blackbox on every board', { concurrency: 2 }, () => {
  for (const lang of DESIGNS) {
    for (const t of TARGETS) {
      test(`#2341 the ${lang} HLS module with a blackbox on the ${targetName(t)}: the Silinx toolchain builds the bitstream, no warning`, { timeout: 600000 }, async () => {
        const { dir, project } = await blackboxProject(lang, t, tmp);
        const job = await silinxFlow(dir, project);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        assert.match(log, /All signals are completely routed\./);
        assert.match(log, /All constraints were met\./);
        assert.match(log, /Bitstream: build\/bb_top\.bit \(\d+ bytes, every feature in the bit database\)/);
        assert.deepEqual(job.lines.filter(l => /warning/i.test(l)), []);
      });
    }
  }
});

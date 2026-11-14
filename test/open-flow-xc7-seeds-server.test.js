// The local server's 7-series back end with Process Properties' best of 3 seeds (#3825): blinky on the Basys 3 placed and
// routed by nextpnr (router2) with seeds 1, 2 and 3 (in worker threads, at once where the computer takes them), the best
// Fmax kept (a tie: the lowest seed), each seed's said in the log, the reports and the timing report; no warning; the .bit
// the kept run's FASM's (its frames fasm2frames' of build/open/routed.fasm).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { runOpenImplementation } from '../server/open-flow.js';
import { bitIndexXc7, readBitFramesXc7 } from '../packages/silinx-fpga/src/fpga/xc7/readback.js';
import { referenceFrames } from '../packages/silinx-fpga/src/fpga/xc7/roundtrip.js';
import { XC7_DB_DIR } from '../packages/silinx-fpga/src/fpga/xc7/bitdb-node.js';
import { exampleProject } from './examples-lib.mjs';

test('blinky on the Basys 3 with the best of 3 seeds: three runs, the best Fmax kept and said, no warning, the .bit from its FASM', { timeout: 600000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-seeds-'));
  try {
    const { dir, project } = exampleProject('blinky', { board: 'basys3' }, tmp);
    project.impl = { ...project.impl, xc7Seeds: 3 };
    const lines = [];
    const job = { log: l => lines.push(l), result: null, cancelled: false, procs: new Set() };
    const result = await runOpenImplementation(job, { project, projectDir: dir, steps: ['synth', 'translate', 'par', 'trce', 'bitgen'] });
    const log = lines.join('\n').split('\n');
    assert.deepEqual(log.filter(l => /WARNING|ERROR/.test(l)), []);
    const par = result.reports.par;
    assert.deepEqual(par.seeds.map(s => s.seed), [1, 2, 3]);
    assert.ok(par.seeds.every(s => s.fmaxMHz > 100 && !s.failed), JSON.stringify(par.seeds));
    // the kept: the best Fmax, the lowest seed of a tie
    const best = Math.max(...par.seeds.map(s => s.fmaxMHz)), kept = par.seeds.find(s => s.fmaxMHz === best);
    assert.deepEqual(par.seeds.filter(s => s.kept), [kept]);
    assert.equal(par.seed, kept.seed);
    assert.equal(result.reports.timing.maxFreqMHz, best);
    assert.ok(log.includes(`nextpnr-himbaechel (xilinx) places and routes <${project.top}> on the xc7a35tcpg236-1 (router2; seeds 1, 2, 3, the best kept).`), log.join('\n'));
    for (const s of par.seeds) assert.ok(log.includes(`Seed ${s.seed}: ${s.fmaxMHz} MHz (nextpnr's estimate)${s.kept ? ', kept' : ''}.`), log.join('\n'));
    const timing = fs.readFileSync(path.join(dir, 'build/open/timing.txt'), 'utf8');
    assert.ok(timing.includes(`Best of 3 seeds (nextpnr's estimate of the slowest clock): seed ${kept.seed} kept (${best} MHz); `), timing);
    // the .bit: the kept run's FASM's frames
    const index = bitIndexXc7(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(XC7_DB_DIR, 'xc7a35tcpg236-1.json.gz'))).toString('utf8')));
    const fasm = fs.readFileSync(path.join(dir, 'build/open/routed.fasm'), 'utf8');
    const ref = referenceFrames(index, fasm), back = readBitFramesXc7(new Uint8Array(fs.readFileSync(path.join(dir, `build/${project.top}.bit`))), index);
    let differ = 0;
    for (const [a, w] of back.frames) if (!(ref.get(a) ?? new Uint32Array(101)).every((x, i) => x === w[i])) differ++;
    assert.equal(differ, 0);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

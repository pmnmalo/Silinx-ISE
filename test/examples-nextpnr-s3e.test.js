// Examples on the Spartan-3E's devices by the nextpnr engine: routed on every seed, with no warning (#2811). Place & Route
// tries the seeds from the first on and skips one nextpnr cannot route without a word (open-flow-nextpnr.js), and the
// examples are set to one placement (Optimization Fast), so the test runs Place & Route on each seed itself: 1 to 4, the
// placements of the Normal effort (nextpnrTries). Each example on one of the four devices, in turn (all of them on each,
// seeds 1 to 8: #2811's sweep, every run routed with no warning on 0.19.0 and on 0.20.0; about 6 minutes here).
// - #2800's router fix (nextpnr-spartan's PR 11, in nextpnr-himbaechel-spartan3e 0.20.0): a net whose box fits in one of
//   nextpnr's router partitions but whose route leaves it. The single-threaded router (the WebAssembly build) retried it
//   only inside the partition and gave it up as unroutable; it now hands it to the whole-device pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, S3E_TARGETS, targetName, exampleProject } from './examples-lib.mjs';
import { createJob } from '../server/jobs.js';
import { runOpenImplementation } from '../server/open-flow.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-s3e-'));
// the shipped device descriptions, never ones built in the user's ~/.silinx/devices
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const SEEDS = [1, 2, 3, 4];

// the flow on a seed (the synthesis once, at the first): the job's status and lines
async function placeRoute(dir, project, seed) {
  const first = seed === SEEDS[0];
  const job = createJob('example', j => runOpenImplementation(j, {
    project, projectDir: dir, seed, steps: first ? ['synth', 'translate', 'map', 'par'] : ['par'], synthUpToDate: !first,
  }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 100));
  return { status: job.status, lines: job.lines.map(l => (typeof l === 'string' ? l : l.text)) };
}

for (const [i, example] of EXAMPLES.entries()) {
  const t = S3E_TARGETS[i % S3E_TARGETS.length];
  test(`#2811 example ${example} on ${targetName(t)} by nextpnr: every seed routes, no warning`, { timeout: 600000 }, async () => {
    const { dir, project } = exampleProject(example, t, tmp);
    try {
      for (const seed of SEEDS) {
        const { status, lines } = await placeRoute(dir, project, seed);
        assert.equal(status, 'ok', `seed ${seed}: ${lines.filter(l => /ERROR/.test(l)).join('\n')}`);
        assert.deepEqual(lines.filter(l => /WARNING/.test(l)), [], `seed ${seed}`);
        assert.ok(lines.some(l => /^Placed and routed by nextpnr in /.test(l)), `seed ${seed}`);
        assert.ok(lines.includes('All signals are completely routed.'), `seed ${seed}`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

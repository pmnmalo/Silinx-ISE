// The uart example on the Spartan-6's boards by the nextpnr engine (#2791): routed on every seed, with no warning. Its
// tx and rx share the Atlys's I/O tile, and tx leaves through the OLOGIC route-through to its pad: a switch of the
// path that #2539 measured, which a chip database built from an older bit database leaves out (nextpnr-spartan's
// spartan6-v0.1.1: no seed routed, "Failed to route arc 0.0 of net … to X83Y0/TIOB_O2_PINW").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S6_TARGETS, targetName, exampleProject, silinxFlow } from './examples-lib.mjs';

for (const t of S6_TARGETS) {
  test(`example uart on ${targetName(t)} by nextpnr: every seed routes, no warning`, { timeout: 600000 }, async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-uart-nextpnr-'));
    try {
      const { dir, project } = exampleProject('uart', t, tmp);
      project.impl = { ...project.impl, engine: 'nextpnr' };
      const job = await silinxFlow(dir, project, ['synth', 'translate', 'map', 'par']);
      const lines = job.lines.map(l => (typeof l === 'string' ? l : l.text));
      assert.equal(job.status, 'ok', lines.filter(l => /ERROR|nextpnr, seed/.test(l)).join('\n'));
      assert.deepEqual(lines.filter(l => /^nextpnr, seed/.test(l)).map(l => l.replace(/ [\d.]+ ns/, ' … ns')),
        ['nextpnr, seed 1: minimum period … ns.', 'nextpnr, seed 2: minimum period … ns.', 'nextpnr, seed 3: minimum period … ns.']);
      assert.deepEqual(lines.filter(l => /WARNING/.test(l)), []);
      assert.ok(lines.includes('All signals are completely routed.'));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
}

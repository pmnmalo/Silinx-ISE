// Examples on the Spartan-6's boards by the nextpnr engine: routed on every seed, with no warning.
// - uart (#2791): its tx and rx share the Atlys's I/O tile, and tx leaves through the OLOGIC route-through to its pad: a
//   switch of the path that #2539 measured, which a chip database built from an older bit database leaves out
//   (nextpnr-spartan's spartan6-v0.1.1: no seed routed, "Failed to route arc 0.0 of net … to X83Y0/TIOB_O2_PINW").
// - blinky and clock (#2800): a net from an input pad whose box fits in one of nextpnr's router partitions but whose
//   route leaves it. The single-threaded router (the WebAssembly build) gave it up as unroutable (spartan6-v0.1.2:
//   blinky on the Nexys3, seed 1, "Failed to route arc 0.0 of net 'u_knight.mode', from X27Y72/BIOB_IBUF0_PINW …";
//   clock on the Atlys, seeds 2 and 3, the net db2.btn).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { S6_TARGETS, targetName, exampleProject, silinxFlow } from './examples-lib.mjs';

for (const example of ['uart', 'blinky', 'clock']) {
  for (const t of S6_TARGETS) {
    test(`example ${example} on ${targetName(t)} by nextpnr: every seed routes, no warning`, { timeout: 600000 }, async () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `silinx-${example}-nextpnr-`));
      try {
        const { dir, project } = exampleProject(example, t, tmp);
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
}

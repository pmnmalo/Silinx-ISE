// Every example on the Spartan-6's boards (the Nexys3's XC6SLX16, the Atlys's XC6SLX45) with nextpnr's Map (#3138,
// Process Properties' Map (Spartan-6) nextpnr: impl.s6Map): nextpnr-himbaechel's spartan6 WebAssembly package packs Yosys's
// netlist into the sites of Silinx's Map (checked site by site at Place & Route: samePacking) and places them, its pads and
// clocks by its own rules; Silinx routes them with nextpnr, checks the routing and writes the bitstream. Each one routed
// on every seed, its PERIOD met, the routing check passed, every feature of the design in the bit database, with no
// warning; its size and period said (the parity of #3139 compares them with Silinx's Map's).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, S6_TARGETS, targetName, exampleProject, silinxFlow } from './examples-lib.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-s6-pack-'));
// the shipped device descriptions, never ones built in the user's ~/.silinx/devices
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

for (const example of EXAMPLES) {
  for (const t of S6_TARGETS) {
    test(`#3138 example ${example} on ${targetName(t)} with nextpnr's Map: packed as Silinx's Map, routed on every seed, its bitstream, no warning`, { timeout: 900000 }, async (ctx) => {
      const { dir, project } = exampleProject(example, t, tmp);
      try {
        project.impl = { ...project.impl, s6Map: 'nextpnr' };
        const job = await silinxFlow(dir, project, ['synth', 'translate', 'map', 'par', 'trce', 'bitgen']);
        const lines = job.lines.map(l => (typeof l === 'string' ? l : l.text));
        assert.equal(job.status, 'ok', lines.filter(l => /ERROR|nextpnr, seed|^ {2}/.test(l)).join('\n'));
        assert.deepEqual(lines.filter(l => /WARNING/.test(l)), []);
        const seeds = lines.filter(l => /^nextpnr, seed/.test(l));
        assert.deepEqual(seeds.map(l => l.replace(/ [\d.]+ ns/, ' … ns')), [1, 2, 3].map(s => `nextpnr, seed ${s}: ${example === 'gates' ? 'no clocked paths' : 'minimum period … ns'}.`));
        const sites = +/^Packed and placed (\d+) sites by nextpnr in /.exec(lines.find(l => /^Packed and placed /.test(l)) ?? '')?.[1];
        assert.ok(sites > 0, lines.join('\n'));
        assert.ok(lines.includes('All signals are completely routed.'));
        // (every PERIOD met: one not met is a warning)
        if (example !== 'gates') assert.ok(lines.some(l => /^constraint PERIOD [\d.]+ ns on \w+: met \(period \d+\.\d{3} ns, slack \d+\.\d{3} ns\)$/.test(l)), lines.filter(l => /PERIOD/.test(l)).join('\n'));
        assert.ok(lines.some(l => /^Bitstream: build\/\w+\.bit \(\d+ bytes, every feature in the bit database\)$/.test(l)), lines.slice(-20).join('\n'));
        const slices = /: (\d+) out of/.exec(lines.find(l => /Number of occupied Slices/.test(l)))[1];
        const periods = seeds.map(l => +(/([\d.]+) ns/.exec(l)?.[1] ?? 0));
        ctx.diagnostic(`${example} ${targetName(t)}: ${slices} slices, ${sites} sites, best period ${Math.min(...periods).toFixed(3)} ns (seeds ${periods.join(' / ')})`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

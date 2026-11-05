// #2820: on the Spartan-3E, nextpnr's own timing estimate ("Max frequency for clock '$iopadmap$clk': … (FAIL at …)") is
// not a warning of the flow: the timing step (fitted to ISE's trce) alone says whether a PERIOD is met, naming the
// clock by its port, as on the Spartan-6. blinky on the Basys2-250: a PERIOD it cannot meet, one warning (the timing
// step's); no PERIOD, no warning.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exampleProject, silinxFlow } from './examples-lib.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-fmax-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
const STEPS = ['synth', 'translate', 'map', 'par', 'trce'];

// blinky's project with its PERIOD line changed by edit (the UCF's text)
async function build(name, edit) {
  const { dir, project } = exampleProject('blinky', { board: 'basys2', variant: '250' }, path.join(tmp, name));
  const ucf = path.join(dir, project.constraints);
  fs.writeFileSync(ucf, edit(fs.readFileSync(ucf, 'utf8')));
  const job = await silinxFlow(dir, project, STEPS);
  assert.equal(job.status, 'ok', job.lines.join('\n').slice(-3000));
  return job.lines;
}

describe('nextpnr\'s Max frequency on the Spartan-3E (#2820)', { concurrency: 2 }, () => {
  test('a PERIOD not met: the timing step\'s warning alone, on the clock\'s port, not nextpnr\'s estimate', { timeout: 600000 }, async () => {
    const lines = await build('tight', t => t.replace(/PERIOD "clk" 20 ns/, 'PERIOD "clk" 4 ns'));
    const warnings = lines.filter(l => /warning/i.test(l));
    assert.equal(warnings.length, 1, warnings.join('\n'));
    assert.match(warnings[0], /^WARNING:Timing - constraint PERIOD 4 ns on clk not met: the clock needs \d+\.\d{3} ns$/);
    assert.match(lines.join('\n'), /1 constraint\(s\) not met\./);
    // (nextpnr's estimate stays in its summary line, not as a warning)
    assert.match(lines.join('\n'), /Placed and routed by nextpnr in .* \(its estimate: [0-9.]+ MHz\)\./);
  });

  test('no PERIOD: no warning', { timeout: 600000 }, async () => {
    const lines = await build('none', t => t.replace(/^TIMESPEC .*$/m, '').replace(/^.*TNM_NET.*$/m, ''));
    assert.deepEqual(lines.filter(l => /warning/i.test(l)), []);
    assert.match(lines.join('\n'), /No timing constraints \(PERIOD\) in the UCF\./);
  });
});

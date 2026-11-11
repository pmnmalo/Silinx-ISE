// The examples on the ECP5's board (#2302): each example's LPF made from the ULX3S's pins (its display on the GPIO header;
// vga on the ULX3S with its VGA on the header, ulx3s-vga), built by the Silinx toolchain to its .bit through nextpnr-ecp5 and
// ecppack, the board's 25 MHz met; the ports the board has no pin for (isqrt's and micro80's sw<4..7>) warned, by Silinx
// and by nextpnr, every other example with no warning.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, ECP5_TARGETS, exampleBoard, targetName, exampleProject, exampleUcf, silinxFlow } from './examples-lib.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-examples-ecp5-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const SW = ['sw[4]', 'sw[5]', 'sw[6]', 'sw[7]'];
const NO_PIN = { isqrt: SW, micro80: SW };
// the bitstream's size: the 85F's, a block RAM's initial values adding to it
const BIT_SIZE = { stopwatch: 1930043, micro80: 1932361 };

test('the examples\' ports on the ULX3S: every one with a pin but the 8 switches\' upper half', () => {
  for (const name of EXAMPLES) {
    const t = exampleBoard(name, ECP5_TARGETS[0]);
    assert.deepEqual(exampleUcf(name, t).unmatched, NO_PIN[name] ? ['sw[4..]'] : [], name);
  }
  assert.deepEqual(exampleBoard('vga', ECP5_TARGETS[0]), { board: 'ulx3s-vga' });
});

describe('the examples on the ECP5\'s board', { concurrency: 2 }, () => {
  for (const name of EXAMPLES) {
    for (const t of ECP5_TARGETS.map(x => exampleBoard(name, x))) {
      test(`example ${name} on the ${targetName(t)}: an LPF from the board, the Silinx toolchain builds the .bit, the ports with no pin warned`, { timeout: 600000 }, async () => {
        const { dir, project } = exampleProject(name, t, tmp);
        assert.match(project.constraints, /\.lpf$/);
        const job = await silinxFlow(dir, project, ['synth', 'translate', 'par', 'bitgen']);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        assert.match(log, /Device: lfe5u-85f-6cabga381: nextpnr-ecp5 and ecppack\./);
        assert.match(log, new RegExp(`Bitstream: build/${project.top}\\.bit \\(${BIT_SIZE[name] || 1927725} bytes, ecppack\\)`));
        // a clocked example: the board's 25 MHz met
        const clocked = /FREQUENCY PORT "clk" 25 MHZ;/.test(fs.readFileSync(path.join(dir, project.constraints), 'utf8'));
        assert.equal(clocked, name !== 'gates');
        if (clocked) assert.match(log, /Clock clk: [\d.]+ MHz \(met, 25 MHz asked\)/);
        const no = NO_PIN[name] || [];
        assert.deepEqual(job.lines.filter(l => /warning/i.test(l)).sort(), [
          ...no.map(p => `WARNING:Place - the port ${p} has no pin (LOCATE in the LPF): nextpnr places it anywhere.`),
          ...no.map(p => `WARNING:Place - IO '${p}' is unconstrained in LPF and will be automatically placed`)].sort());
      });
    }
  }
});

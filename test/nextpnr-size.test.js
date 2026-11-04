// The nextpnr engine's size against Silinx's engine on the examples (#2797, a condition of #2137): each example built for
// the Basys2-100 as the application builds it (its own settings), Silinx's engine to Map (its packer's slices) and the
// nextpnr engine to Place & Route on the same synthesis; nextpnr takes no more occupied slices than Silinx's packer, with
// no warning. (The slices are the same on the four Spartan-3E devices, #2797; test/examples.test.js builds each of them.)
// Measured with nextpnr-himbaechel-spartan3e 0.18.0, nextpnr / Silinx: gates 1 / 1, traffic 66 / 66, blinky 116 / 116,
// pong 224 / 225, stopwatch 197 / 197, clock 195 / 196, vga 143 / 144, isqrt 63 / 63, uart 112 / 112, micro80 148 / 148.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, exampleProject, silinxFlow } from './examples-lib.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-size-'));
// the shipped device descriptions, never ones built in the user's ~/.silinx/devices
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');

const slicesOf = lines => {
  const m = lines.map(l => /Number of occupied Slices: (\d+) out of/.exec(l)).filter(Boolean).at(-1);
  return m ? +m[1] : null;
};

describe('the nextpnr engine\'s slices against Silinx\'s on the examples', { concurrency: 2 }, () => {
  for (const name of EXAMPLES) {
    test(`#2797 example ${name} on the Basys2-100: the nextpnr engine takes no more slices than Silinx's packer, no warning`, { timeout: 600000 }, async () => {
      const { dir, project } = exampleProject(name, { board: 'basys2', variant: '100' }, tmp);
      const build = async (engine, steps) => {
        const p = { ...project, impl: { ...project.impl, engine } };
        fs.writeFileSync(path.join(dir, 'silinx.json'), `${JSON.stringify(p, null, 2)}\n`);
        const job = await silinxFlow(dir, p, steps);
        assert.equal(job.status, 'ok', job.lines.join('\n').slice(-3000));
        assert.deepEqual(job.lines.filter(l => /warning/i.test(l)), [], `${engine}: ${job.lines.join('\n').slice(-3000)}`);
        return job.lines;
      };
      const silinx = slicesOf(await build('silinx', ['synth', 'translate', 'map']));
      const lines = await build('nextpnr', ['translate', 'map', 'par']);
      assert.ok(lines.includes('Map: nextpnr packs the design itself, at Place & Route (the nextpnr engine).'), lines.join('\n'));
      const nextpnr = slicesOf(lines);
      assert.ok(silinx > 0 && nextpnr > 0, `${silinx} / ${nextpnr}`);
      assert.ok(nextpnr <= silinx, `${name}: nextpnr ${nextpnr} slices, Silinx ${silinx}`);
    });
  }
});

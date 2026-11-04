// The nextpnr engine's size against Silinx's packer on the examples (#2797, a condition of #2137): each example built for
// the Basys2-100 as the application builds it (its own settings), by the nextpnr engine (the one engine since #2137), and
// its synthesis's netlist packed by Silinx's packer (fpga/pack.js, which the open synthesis still counts the slices with,
// #2529); nextpnr takes no more occupied slices than Silinx's packer, with no warning. (The slices are the same on the four Spartan-3E devices, #2797; test/examples.test.js builds each of them.)
// Measured with nextpnr-himbaechel-spartan3e 0.18.0, nextpnr / Silinx: gates 1 / 1, traffic 66 / 66, blinky 116 / 116,
// pong 224 / 225, stopwatch 197 / 197, clock 195 / 196, vga 143 / 144, isqrt 63 / 63, uart 112 / 112, micro80 148 / 148.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, exampleProject, silinxFlow } from './examples-lib.mjs';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../packages/silinx-fpga/src/fpga/pack.js';

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
      const job = await silinxFlow(dir, project, ['synth', 'translate', 'map', 'par']);
      const lines = job.lines;
      assert.equal(job.status, 'ok', lines.join('\n').slice(-3000));
      assert.deepEqual(lines.filter(l => /warning/i.test(l)), [], lines.join('\n').slice(-3000));
      // Silinx's packer on the same netlist, with the same constraints
      const netlist = readYosysJson(fs.readFileSync(path.join(dir, 'build', 'open', `${project.top}.json`), 'utf8'));
      const silinx = pack(netlist, { ucf: fs.readFileSync(path.join(dir, project.constraints), 'utf8'), part: 'xc3s100ecp132-4' }).stats.slices;
      assert.ok(lines.includes('Map: nextpnr packs the design itself, at Place & Route (the nextpnr engine).'), lines.join('\n'));
      const nextpnr = slicesOf(lines);
      assert.ok(silinx > 0 && nextpnr > 0, `${silinx} / ${nextpnr}`);
      assert.ok(nextpnr <= silinx, `${name}: nextpnr ${nextpnr} slices, Silinx ${silinx}`);
    });
  }
});

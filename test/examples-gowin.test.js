// The examples on the Gowin's board (#2303): each example's CST made from the Tang Nano 9K's pins (every port on one: its
// LEDs, switches, buttons and display on its headers; vga on the tangnano9k-vga), placed and routed by the Silinx toolchain
// through nextpnr-himbaechel-gowin, the board's 27 MHz met; no bitstream yet, said. Their warnings: nextpnr's nets routed
// through the general routing where its dedicated routing did not reach, as many as listed here, nothing else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, GOWIN_TARGETS, exampleBoard, targetName, exampleProject, exampleUcf, silinxFlow } from './examples-lib.mjs';
import { GOWIN_NO_BITSTREAM } from '../packages/silinx-fpga/src/index.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-examples-gowin-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// nextpnr's warnings of each example (seed 1): "Failed to route net … using dedicated routing."
const DEDICATED = { gates: 1, traffic: 1, blinky: 8, pong: 10, stopwatch: 0, clock: 10, vga: 0, isqrt: 1, uart: 0, micro80: 1 };
const FALLBACK = /^WARNING:Place - Failed to route net '[^']+' from \S+ to \S+ using dedicated routing\.$/;

test('the examples\' ports on the Tang Nano 9K: every one with a pin', () => {
  for (const name of EXAMPLES) assert.deepEqual(exampleUcf(name, exampleBoard(name, GOWIN_TARGETS[0])).unmatched, [], name);
  assert.deepEqual(exampleBoard('vga', GOWIN_TARGETS[0]), { board: 'tangnano9k-vga' });
});

describe('the examples on the Gowin\'s board', { concurrency: 2 }, () => {
  for (const name of EXAMPLES) {
    for (const t of GOWIN_TARGETS.map(x => exampleBoard(name, x))) {
      test(`example ${name} on the ${targetName(t)}: a CST from the board, the Silinx toolchain places and routes it, no bitstream (said)`, { timeout: 600000 }, async () => {
        const { dir, project } = exampleProject(name, t, tmp);
        assert.match(project.constraints, /\.cst$/);
        const job = await silinxFlow(dir, project, ['synth', 'translate', 'par']);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        assert.ok(job.lines.includes(`Device: gw1nr-9c-6qn88: nextpnr-himbaechel-gowin; ${GOWIN_NO_BITSTREAM}.`), log.slice(0, 2000));
        assert.match(log, /Placed and routed by nextpnr-himbaechel-gowin in /);
        assert.ok(fs.existsSync(path.join(dir, 'build', 'open', 'routed.json')));
        assert.equal(fs.readdirSync(path.join(dir, 'build')).filter(f => /\.(fs|bit|bin)$/.test(f)).length, 0);
        const clocked = /create_clock -name clk -period 37\.037 \[get_ports \{clk\}\]/.test(fs.readFileSync(path.join(dir, project.constraints), 'utf8'));
        assert.equal(clocked, name !== 'gates');
        if (clocked) assert.match(log, /Clock clk: [\d.]+ MHz \(met, 27 MHz asked\)/);
        const warnings = job.lines.filter(l => /warning/i.test(l));
        assert.deepEqual(warnings.filter(l => !FALLBACK.test(l)), []);
        assert.equal(warnings.length, DEDICATED[name], warnings.join('\n'));
      });
    }
  }
});

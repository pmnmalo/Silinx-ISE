// The examples on the Gowin's board (#2303): each example's CST made from the Tang Nano 9K's pins (every port on one: its
// LEDs, switches, buttons and display on its headers; vga on the tangnano9k-vga), built by the Silinx toolchain through
// nextpnr-himbaechel-gowin and gowin_pack (Silinx's port) to its .fs, the board's 27 MHz met; the .fs byte for byte Apicula 0.32's
// (test/fixtures/gowin-pack/apicula-0.32.json: its SHA-256, and the routed design's it was made from). Their warnings: nextpnr's nets routed
// through the general routing where its dedicated routing did not reach, as many as listed here, nothing else.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, GOWIN_TARGETS, exampleBoard, targetName, exampleProject, exampleUcf, silinxFlow } from './examples-lib.mjs';
import crypto from 'node:crypto';

const REF = JSON.parse(fs.readFileSync(new URL('./fixtures/gowin-pack/apicula-0.32.json', import.meta.url), 'utf8')).examples;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-examples-gowin-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// nextpnr's warnings of each example (seed 1): "Failed to route net … using dedicated routing."
const DEDICATED = { gates: 1, traffic: 1, blinky: 8, pong: 8, stopwatch: 0, clock: 12, vga: 0, isqrt: 1, uart: 0, micro80: 1 };
const FALLBACK = /^WARNING:Place - Failed to route net '[^']+' from \S+ to \S+ using dedicated routing\.$/;

test('the examples\' ports on the Tang Nano 9K: every one with a pin', () => {
  for (const name of EXAMPLES) assert.deepEqual(exampleUcf(name, exampleBoard(name, GOWIN_TARGETS[0])).unmatched, [], name);
  assert.deepEqual(exampleBoard('vga', GOWIN_TARGETS[0]), { board: 'tangnano9k-vga' });
});

describe('the examples on the Gowin\'s board', { concurrency: 2 }, () => {
  for (const name of EXAMPLES) {
    for (const t of GOWIN_TARGETS.map(x => exampleBoard(name, x))) {
      test(`example ${name} on the ${targetName(t)}: a CST from the board, the Silinx toolchain builds its .fs, Apicula\'s byte for byte`, { timeout: 600000 }, async () => {
        const { dir, project } = exampleProject(name, t, tmp);
        assert.match(project.constraints, /\.cst$/);
        const job = await silinxFlow(dir, project, ['synth', 'translate', 'par', 'bitgen']);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        assert.ok(job.lines.includes('Device: gw1nr-9c-6qn88: nextpnr-himbaechel-gowin and gowin_pack.'), log.slice(0, 2000));
        assert.match(log, /Placed and routed by nextpnr-himbaechel-gowin in /);
        assert.ok(fs.existsSync(path.join(dir, 'build', 'open', 'routed.json')));
        // (the routed design Apicula's .fs was made from: when nextpnr or Yosys changes it, the reference is to be made again)
        assert.equal(sha(fs.readFileSync(path.join(dir, 'build', 'open', 'routed.json'))), REF[name].routed, `${name}: the routed design is not the reference's`);
        assert.equal(sha(fs.readFileSync(path.join(dir, 'build', `${project.top}.fs`))), REF[name].fs, `${name}: the .fs is not Apicula's`);
        assert.match(log, new RegExp(`Bitstream: build/${project.top}\\.fs \\(${REF[name].fsBytes} bytes, gowin_pack in `));
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

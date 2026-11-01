// The example projects (examples/gates, traffic, blinky, pong, stopwatch, clock, vga, isqrt), which also test Silinx's workflows end to
// end on every device of the Silinx toolchain (Basys2-100 / 250, Nexys2-500 / 1200): each example's
// sources read with no error or warning and no design-check message, its self-checking testbench
// passes in Silinx's simulator with no warning, the UCF it ships is the one Silinx's board pin
// assignment writes, and the Silinx toolchain builds it for every device, with no warning, to a
// bitstream with every feature in the bit database. (Against ISE: test/ise/examples.test.js.)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { EXAMPLES, TARGETS, ICE40_TARGETS, exampleBoard, targetName, example, exampleUcf, exampleProject, runTestbench, silinxFlow } from './examples-lib.mjs';

// known failures, with their issue: the test still runs, as a todo
const KNOWN = {};

for (const name of EXAMPLES) {
  test(`example ${name}: no error, no warning, no design-check message`, () => {
    const ex = example(name);
    const lib = compile(ex.design);
    const design = elaborate(lib, ex.project.top);
    assert.deepEqual([...lib.errors, ...design.diags].map(d => `${d.severity}: ${d.message}`), []);
    assert.deepEqual(designChecks(lib, design).map(d => `${d.file}:${d.line} ${d.message}`), []);
  });

  test(`example ${name}: its testbench passes in Silinx's simulator, no warning`, { timeout: 120000 }, async () => {
    const r = await runTestbench(name);
    assert.ok(r.passed, r.log.join('\n'));
    assert.deepEqual(r.warnings, []);
  });

  test(`example ${name}: the UCF it ships is Silinx's board pin assignment for the Basys2-250, every port assigned`, () => {
    const ex = example(name);
    assert.equal(ex.project.board, 'basys2');
    for (const t of TARGETS) assert.deepEqual(exampleUcf(name, t).unmatched, [], `${name} on ${targetName(t)}`);
    // blinky's UCF was written before the board assignment left the I/O standard at its default
    if (name !== 'blinky') assert.equal(fs.readFileSync(path.join(ex.dir, ex.project.constraints), 'utf8'), exampleUcf(name, { board: 'basys2', variant: '250' }).text);
  });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-examples-'));
// the shipped device descriptions, never ones built in the user's ~/.silinx/devices
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'config');
// two builds at a time: each runs in its own process (server/open-flow-run.js), and one after another
// they took most of the unit tests' time
describe('the examples on every board', { concurrency: 2 }, () => {
  for (const name of EXAMPLES) {
    for (const t of TARGETS) {
      test(`example ${name} on the ${targetName(t)}: the Silinx toolchain builds the bitstream, no warning`, { timeout: 600000, todo: KNOWN[name] }, async () => {
        const { dir, project } = exampleProject(name, t, tmp);
        const job = await silinxFlow(dir, project);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        // (the Spartan-6's parts, #732: the steps the toolchain has for them, every one the test runs)
        assert.match(log, project.device.family === 'spartan6' ? new RegExp(`Device: ${project.device.part}${project.device.package}-3: the Spartan-6: synthesis, `)
          : new RegExp(`Device: ${project.device.part}${project.device.package}-4: device description \\(shipped with Silinx\\) and bit database\\.`));
        assert.match(log, /All signals are completely routed\./);
        assert.match(log, new RegExp(`Bitstream: build/${project.top}\\.bit \\(\\d+ bytes, every feature in the bit database\\)`));
        // a combinational example (gates) has no clock, so no PERIOD constraint to meet
        if (/PERIOD/.test(fs.readFileSync(path.join(dir, project.constraints), 'utf8'))) assert.match(log, /All constraints were met\./);
        else assert.match(log, /No timing constraints \(PERIOD\) in the UCF\./);
        assert.deepEqual(job.lines.filter(l => /warning/i.test(l)), []);
      });
    }
  }
});

// (#2517) the examples on the iCEBreaker: the display and the switches on its Pmods, vga on its PmodVGA; the ports the
// board has no pin for (5 LEDs, 3 buttons, the PmodSWT's 4 switches), each warned, by Silinx and by nextpnr
const LEDS = ['led[5]', 'led[6]', 'led[7]'];
const ICE40_NO_PIN = { gates: [], traffic: LEDS, blinky: LEDS, pong: ['btn[3]', ...LEDS], stopwatch: ['btn[3]', ...LEDS], clock: ['btn[3]', ...LEDS],
  vga: ['sw', 'btn[3]'], isqrt: ['sw[4]', 'sw[5]', 'sw[6]', 'sw[7]'] };
describe('the examples on the iCE40\'s board', { concurrency: 2 }, () => {
  for (const name of EXAMPLES) {
    for (const t of ICE40_TARGETS.map(x => exampleBoard(name, x))) {
      test(`example ${name} on the ${targetName(t)}: a PCF from the board, the Silinx toolchain builds the .bin, the ports with no pin warned`, { timeout: 600000 }, async () => {
        const { dir, project } = exampleProject(name, t, tmp);
        assert.match(project.constraints, /\.pcf$/);
        const job = await silinxFlow(dir, project, ['synth', 'translate', 'par', 'bitgen']);
        const log = job.lines.join('\n');
        assert.equal(job.status, 'ok', log.slice(-3000));
        assert.match(log, new RegExp(`Bitstream: build/${project.top}\\.bin \\(104090 bytes, icepack\\)`));
        // a clocked example: the board's 12 MHz met
        const clocked = /set_frequency clk 12/.test(fs.readFileSync(path.join(dir, project.constraints), 'utf8'));
        assert.equal(clocked, name !== 'gates');
        if (clocked) assert.match(log, /Clock clk\S*: [\d.]+ MHz \(met, 12 MHz asked\)/);
        const no = ICE40_NO_PIN[name];
        assert.deepEqual(job.lines.filter(l => /warning/i.test(l)).sort(), [
          ...no.map(p => `WARNING:Place - the port ${p} has no pin (set_io in the PCF): nextpnr places it anywhere.`),
          ...no.map(p => `WARNING:Place - IO '${p}' is unconstrained in PCF and will be automatically placed`)].sort());
      });
    }
  }
});

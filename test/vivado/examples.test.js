// The example projects (examples/gates … micro80) on the Basys 3 through AMD Vivado ML Standard 2025.2 (#1649), as
// test/ise/examples.test.js builds them with ISE (opt-in: it needs Vivado's Docker image, on the ISE machine):
//   - Vivado builds each example (synth_design, opt_design, place_design, route_design, the timing, write_bitstream)
//     with no error and the expected warnings (CRITICAL WARNING and WARNING alike: none, but traffic's and pong's
//     outputs driven by a constant, micro80's light8080 core's unread bits), through server/vivado.js as
//     the application runs it, the board's XDC as Silinx writes it (#3142);
//   - every net routed, the board clock's constraint met, DRC with no error and the expected findings (none, CFGBVS-1
//     neither: the XDC's CFGBVS and CONFIG_VOLTAGE; but stopwatch's DSP pipelining advice), and a .bit for the xc7a35t.
// Vivado runs alone on that machine (8 GB): one example after another.
//
//   SILINX_VIVADO_TESTS=1 SILINX_ISE_HOST=user@host node --test test/vivado/examples.test.js
//   SILINX_ISE_HOST=local: the image on this machine; SILINX_VIVADO_IMAGE (default xilinx/vitis-hls:2025.2)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, exampleProject } from '../examples-lib.mjs';
import { vivadoExamplesConfig, vivadoWarnings } from '../vivado-examples-config.mjs';

const IMAGE = process.env.SILINX_VIVADO_IMAGE || 'xilinx/vitis-hls:2025.2';
const enabled = process.env.SILINX_VIVADO_TESTS === '1';
// the host only from the environment (never written in a file)
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const HOST = LOCAL ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(process.env.SILINX_ISE_HOST || '');
const skip = !enabled ? 'set SILINX_VIVADO_TESTS=1 to run the Vivado tests' : !HOST && !LOCAL ? 'set SILINX_ISE_HOST=user@host (the machine with the Vivado Docker image), or local (the image here)' : false;
const TARGET = { board: 'basys3' };
// the warnings Vivado gives on each example: none, but synthesis's on an output the design drives with a constant (traffic's
// unused LEDs, pong's decimal point: as the designs mean them; ISE's XST says nothing of them)
const constant = (top, port, v) => `WARNING: [Synth 8-3917] design ${top} has port ${port} driven by constant ${v}`;
const VIVADO_WARNINGS = { ...Object.fromEntries(EXAMPLES.map(n => [n, []])),
  traffic: [constant('top', 'led[2]', 0), constant('top', 'led[3]', 0), constant('top', 'led[4]', 0)],
  pong: [constant('pong', 'dp', 1)],
  // the light8080 processor, as it is (#2544): its registers' bits it never reads
  micro80: ['WARNING: [Synth 8-3936] Found unconnected internal register \'IR_reg\' and it is trimmed from \'8\' to \'6\' bits. [/work/src/src/light8080.vhdl:297]',
    'WARNING: [Synth 8-3936] Found unconnected internal register \'daa_res9_reg\' and it is trimmed from \'9\' to \'8\' bits. [/work/src/src/light8080.vhdl:746]'] };
// the design rule check's findings on each example: none, but stopwatch's DSP48 multipliers (its division by constants)
// not pipelined, Vivado's performance advice
const VIVADO_DRC = { stopwatch: [['DPIP-1', 'Warning', 'Input pipelining', 3], ['DPOP-2', 'Warning', 'MREG Output pipelining', 3]] };

let tmp;
before(() => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-vivado-'));
  // the user's remoteDir, read before the test's own configuration replaces theirs (#1916)
  const config = vivadoExamplesConfig({ host: LOCAL ? null : { user: HOST[1], host: HOST[2] }, image: IMAGE });
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify(config));
});

for (const name of EXAMPLES) {
  test(`Vivado builds example ${name} for the Basys 3 with no warnings, routed, timed, DRC clean`, { skip, timeout: 60 * 60000 }, async () => {
    const { createJob } = await import('../../server/jobs.js');
    const { runVivado } = await import('../../server/vivado.js');
    const { resolveBoard } = await import('../../server/devices.js');
    const { dir, project } = exampleProject(name, TARGET, tmp);
    assert.match(project.constraints, /\.xdc$/);
    const board = resolveBoard(project.board).board;
    const job = createJob('example', j => runVivado(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], board }));
    while (job.status === 'running') await new Promise(r => setTimeout(r, 1000));
    assert.equal(job.status, 'ok', job.lines.filter(l => /ERROR/.test(l)).join('\n'));
    assert.deepEqual(vivadoWarnings(job.lines), VIVADO_WARNINGS[name]);
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'build', 'reports.json'), 'utf8'));
    assert.equal(r.source, 'vivado');
    assert.equal(r.par.routed, true, JSON.stringify(r.par));
    assert.deepEqual(r.drc.rules.map(x => [x.rule, x.severity, x.description, x.checks]), VIVADO_DRC[name] || []);
    assert.equal(r.drc.errors + r.drc.criticalWarnings, 0);
    // the board clock's 10 ns met (gates has no clock: no constraint to time)
    if (name === 'gates') assert.equal(r.timing.noConstraints, true);
    else {
      assert.equal(r.timing.met, true, JSON.stringify(r.timing));
      assert.ok(r.timing.maxFreqMHz > 100, `${r.timing.maxFreqMHz} MHz`);
    }
    assert.deepEqual(r.messages, { errors: 0, criticalWarnings: 0, warnings: VIVADO_WARNINGS[name].length });
    assert.ok(r.bit?.size > 2e6, 'a .bit for the xc7a35t');
    assert.equal(r.bit.header.part, '7a35tcpg236');
  });
}

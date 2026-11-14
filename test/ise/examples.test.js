// The example projects (examples/gates, traffic, blinky, pong, stopwatch, clock, vga, isqrt, uart, micro80) with Xilinx ISE 14.7, on every device of
// the Silinx toolchain (opt-in, as test/ise/ise-flow.test.js: it needs ISE's Docker image):
//   - ISE builds each example (XST, translate, map, place & route, timing, bitgen) with no error, and
//     the warnings of XST, map and par are the expected ones (below);
//   - the Silinx toolchain's routed design of each example passes ISE's design rule check with no
//     error and no warning, and Silinx's bitstream is byte-identical to ISE's bitgen of it
//     (scripts/check-open-flow.mjs); on the Spartan-6 boards (Nexys3, Atlys, #732) too, and ISE's own build of them
//     with no warning either (#2321).
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/examples.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
//   SILINX_S6_MAP=nextpnr: the Spartan-6's open flow with nextpnr's Map (#3139), e.g. its checks alone:
//     --test-name-pattern="for the (nexys3|atlys) with nextpnr's Map"
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXAMPLES, S6_EXAMPLES, S3E_TARGETS as TARGETS, S6_TARGETS, ROOT, targetName, exampleProject } from '../examples-lib.mjs';
import { iseExamplesConfig } from '../ise-examples-config.mjs';
import { micro80S3eWarnings, MICRO80_S6_WARNINGS } from '../ise-micro80-warnings.mjs';

const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const HOST = LOCAL ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(process.env.SILINX_ISE_HOST || '');
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !HOST && !LOCAL ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;
// known failures of the Silinx toolchain, with their issue
const KNOWN = {};
// the warnings ISE gives on each example (the same on every device, the Spartan-6's too, #2321): XST, map, par
const ISE_WARNINGS = {
  gates: [],
  traffic: [],
  blinky: [],
  pong: [],
  stopwatch: [],
  clock: [],
  vga: [],
  isqrt: [],
  uart: [],
  // the light8080 processor, as it is (#2544), shared with test/ise/xise-interop.test.js
  micro80: micro80S3eWarnings('/work/src/src'),
};
// on the Spartan-6, micro80's are fewer (XST's) and map's and par's on its register bank, as in ISE's project flow (#2679)
const ISE_S6_WARNINGS = { micro80: MICRO80_S6_WARNINGS };
// ISE's warnings on the clock on the Mimas V2 (#3709)
const MIMAS_V2_CLOCK_WARNINGS = [];
// ISE's warnings on the clock on the Elbert V2 (#3741, #3847)
const ELBERT_V2_CLOCK_WARNINGS = [];

let tmp;
before(() => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-examples-'));
  // the user's remoteDir, read before the test's own configuration replaces theirs (#1916)
  const config = iseExamplesConfig({ host: LOCAL ? null : { user: HOST[1], host: HOST[2] }, image: IMAGE });
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify(config));
});

// ISE's warnings, without the parts that change from run to run or device to device
const iseWarnings = lines => [...new Set(lines.filter(l => /^WARNING:(Xst|Pack|Map|Par|Place|Route|Timing|PhysDesignRules|LIT|NgdBuild|ConstraintSystem)/.test(l))
  .map(l => l.replace(/\s+/g, ' ').trim()))].sort();

// the Spartan-6's Map in the open flow's checks: Silinx's, or with SILINX_S6_MAP=nextpnr nextpnr's packer (#3139: its
// parity, checked by hand until it is the default, #3140)
const S6_MAP = process.env.SILINX_S6_MAP === 'nextpnr' ? 'nextpnr' : null;
const s6MapName = S6_MAP ? ' with nextpnr\'s Map' : '';

// the routed design's check against ISE, on every board (the Spartan-6's, #732, too)
const checkOpenFlow = (name, t) => {
  const { dir, project } = exampleProject(name, t, path.join(tmp, 'open'));
  if (S6_MAP && project.device.family === 'spartan6') fs.writeFileSync(path.join(dir, 'silinx.json'), `${JSON.stringify({ ...project, impl: { ...project.impl, s6Map: S6_MAP } }, null, 2)}\n`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), dir], { encoding: 'utf8', env: process.env });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \.bit vs ISE's bitgen: byte-identical \(CRC on and off\)/);
  assert.match(r.stdout, /open flow ok; 0 warning\(s\)/);
};

// ISE's build of an example for a board: no error, a bitstream, ISE's warnings the expected ones
const iseBuild = async (name, t, expected = null) => {
  const { createJob } = await import('../../server/jobs.js');
  const { runImplementation } = await import('../../server/ise.js');
  const { dir, project } = exampleProject(name, t, path.join(tmp, 'ise'));
  const job = createJob('example', j => runImplementation(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 1000));
  assert.equal(job.status, 'ok', job.lines.filter(l => /ERROR/.test(l)).join('\n'));
  assert.ok(fs.existsSync(path.join(dir, 'build', `${project.top}.bit`)));
  assert.deepEqual(iseWarnings(job.lines), expected ?? (project.device.family === 'spartan6' ? ISE_S6_WARNINGS[name] ?? ISE_WARNINGS[name] : ISE_WARNINGS[name]));
  return job;
};

for (const name of EXAMPLES) {
  for (const t of S6_EXAMPLES.includes(name) ? S6_TARGETS : []) {
    test(`example ${name} for the ${targetName(t)}${s6MapName}: Silinx's bitstream is byte-identical to ISE's, ISE's DRC clean`, { skip, timeout: 30 * 60000, todo: KNOWN[`${name}-${targetName(t)}`] }, () => checkOpenFlow(name, t));
  }
  for (const t of [...TARGETS, ...(S6_EXAMPLES.includes(name) ? S6_TARGETS : [])]) {
    test(`ISE builds example ${name} for the ${targetName(t)}, with the expected warnings`, { skip, timeout: 30 * 60000 }, () => iseBuild(name, t));
  }
  for (const t of TARGETS) {
    test(`example ${name} for the ${t.board}-${t.variant}: Silinx's bitstream is byte-identical to ISE's, ISE's DRC clean`, { skip, timeout: 30 * 60000, todo: KNOWN[name] }, () => checkOpenFlow(name, t));
  }
}

// (#3709) the clock example on the Numato Mimas V2, an XC6SLX9 the Silinx toolchain has no device description for: ISE
// builds it from the board's UCF (its display's seg a..g, dp and an on Numato's pins; an<3>, 3 digits, on a header pin)
test('ISE builds example clock for the mimas-v2, with the expected warnings', { skip, timeout: 30 * 60000 }, async () => {
  const job = await iseBuild('clock', { board: 'mimas-v2' }, MIMAS_V2_CLOCK_WARNINGS);
  // (Silinx's own: an<3> on a header pin, the board having no 4th digit)
  assert.deepEqual(job.lines.filter(l => /^WARNING: /.test(l)), ['WARNING: an<3>: the mimas-v2 has no pin for it; it is on the header pin io_p6<0> (the board\'s constraints)']);
  // (#3711) the PROM bitstream as a .bin too, for MimasV2Config, and the log's last line says so
  const bin = path.join(job.result.buildDir, 'digital_clock_prom.bin');
  assert.ok(fs.existsSync(bin) && fs.statSync(bin).size > 300000, 'build/digital_clock_prom.bin');
  assert.match(job.lines.at(-1), /^Programming file: Numato Mimas V2: program its flash over its USB with MimasV2Config \(Numato\) and build\/digital_clock_prom\.bin /);
});

// (#3741, #3847) the clock example on the Numato Elbert V2, an XC3S50A (a Spartan-3A, ISE only): its display's seg
// a..g, dp and an on Numato's pins, an<0> the rightmost digit (an<3>, 3 digits, on a header pin), its 12 MHz clock
test('ISE builds example clock for the elbert-v2, with the expected warnings', { skip, timeout: 30 * 60000 }, async () => {
  const job = await iseBuild('clock', { board: 'elbert-v2' }, ELBERT_V2_CLOCK_WARNINGS);
  assert.deepEqual(job.lines.filter(l => /^WARNING: /.test(l)), ['WARNING: an<3>: the elbert-v2 has no pin for it; it is on the header pin io_p1<0> (the board\'s constraints)']);
  const ucf = fs.readFileSync(path.join(job.result.buildDir, 'digital_clock.ucf'), 'utf8');
  for (const [net, loc] of [['seg<0>', 'P117'], ['seg<6>', 'P110'], ['dp', 'P114'], ['an<0>', 'P124'], ['an<2>', 'P120']]) assert.match(ucf, new RegExp(`^NET "${net}"\\s+LOC = "${loc}"`, 'm'), net);
});

// (#3869) the clock on the Spartan-3 Starter Board, an XC3S200 (a Spartan-3, ISE only): its bitgen takes the .ut's
// options (its ConfigRate from 3 MHz; the Elbert V2's, a Spartan-3A, has no DCMShutdown: the test above), no warning
test('ISE builds example clock for the s3-starter, with the expected warnings', { skip, timeout: 30 * 60000 }, async () => {
  const job = await iseBuild('clock', { board: 's3-starter' }, []);
  assert.deepEqual(job.lines.filter(l => /^WARNING: /.test(l)), []);
});

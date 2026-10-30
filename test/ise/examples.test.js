// The example projects (examples/gates, traffic, blinky, pong, stopwatch, clock, vga) with Xilinx ISE 14.7, on every device of
// the Silinx toolchain (opt-in, as test/ise/ise-flow.test.js: it needs ISE's Docker image):
//   - ISE builds each example (XST, translate, map, place & route, timing, bitgen) with no error, and
//     the warnings of XST, map and par are the expected ones (below);
//   - the Silinx toolchain's routed design of each example passes ISE's design rule check with no
//     error and no warning, and Silinx's bitstream is byte-identical to ISE's bitgen of it
//     (scripts/check-open-flow.mjs).
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/examples.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EXAMPLES, S3E_TARGETS as TARGETS, ROOT, exampleProject } from '../examples-lib.mjs';
import { iseExamplesConfig } from '../ise-examples-config.mjs';

const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const HOST = LOCAL ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(process.env.SILINX_ISE_HOST || '');
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !HOST && !LOCAL ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;
// known failures of the Silinx toolchain, with their issue
const KNOWN = {};
// the warnings ISE gives on each example (the same on every device): XST, map, par
const ISE_WARNINGS = {
  gates: [],
  traffic: [],
  blinky: [],
  pong: [],
  stopwatch: [],
  clock: [],
  vga: [],
};

let tmp;
before(() => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-examples-'));
  // the user's remoteDir, read before the test's own configuration replaces theirs (#1916)
  const config = iseExamplesConfig({ host: LOCAL ? null : { user: HOST[1], host: HOST[2] }, image: IMAGE });
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify(config));
});

// ISE's warnings, without the parts that change from run to run or device to device
const iseWarnings = lines => [...new Set(lines.filter(l => /^WARNING:(Xst|Pack|Map|Par|Place|Route|Timing|PhysDesignRules|LIT|NgdBuild|ConstraintSystem)/.test(l))
  .map(l => l.replace(/\s+/g, ' ').trim()))].sort();

for (const name of EXAMPLES) {
  for (const t of TARGETS) {
    test(`ISE builds example ${name} for the ${t.board}-${t.variant}, with the expected warnings`, { skip, timeout: 30 * 60000 }, async () => {
      const { createJob } = await import('../../server/jobs.js');
      const { runImplementation } = await import('../../server/ise.js');
      const { dir, project } = exampleProject(name, t, path.join(tmp, 'ise'));
      const job = createJob('example', j => runImplementation(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] }));
      while (job.status === 'running') await new Promise(r => setTimeout(r, 1000));
      assert.equal(job.status, 'ok', job.lines.filter(l => /ERROR/.test(l)).join('\n'));
      assert.ok(fs.existsSync(path.join(dir, 'build', `${project.top}.bit`)));
      assert.deepEqual(iseWarnings(job.lines), ISE_WARNINGS[name]);
    });

    test(`example ${name} for the ${t.board}-${t.variant}: Silinx's bitstream is byte-identical to ISE's, ISE's DRC clean`, { skip, timeout: 30 * 60000, todo: KNOWN[name] }, () => {
      const { dir } = exampleProject(name, t, path.join(tmp, 'open'));
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-open-flow.mjs'), dir], { encoding: 'utf8', env: process.env });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /DRC 0 errors, 0 warnings; xdl2ncd 0 warnings; \.bit vs ISE's bitgen: byte-identical \(CRC on and off\)/);
      assert.match(r.stdout, /open flow ok; 0 warning\(s\)/);
    });
  }
}

// Silinx HLS's RTL blackbox with Xilinx ISE 14.7 (#2341, opt-in, as test/ise/examples.test.js: it needs ISE's Docker image):
// the HLS module whose C function calls a hand-written module in the other language (a VHDL machine and a Verilog module,
// a Verilog machine and a VHDL module, test/fixtures/hls-blackbox), its HDL made by Silinx HLS, built by ISE (XST,
// translate, map, place & route, timing, bitgen) on every device of the Silinx toolchain, with no warning.
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/hls-blackbox.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TARGETS, targetName } from '../examples-lib.mjs';
import { DESIGNS, blackboxProject } from '../hls-blackbox-lib.mjs';
import { iseExamplesConfig } from '../ise-examples-config.mjs';

const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const HOST = LOCAL ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(process.env.SILINX_ISE_HOST || '');
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !HOST && !LOCAL ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;

let tmp;
before(() => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-hls-blackbox-'));
  const config = iseExamplesConfig({ host: LOCAL ? null : { user: HOST[1], host: HOST[2] }, image: IMAGE });
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify(config));
});

// ISE's warnings, every tool's
const iseWarnings = lines => [...new Set(lines.filter(l => /^WARNING:/.test(l)).map(l => l.replace(/\s+/g, ' ').trim()))].sort();

for (const lang of DESIGNS) {
  for (const t of TARGETS) {
    test(`#2341 ISE builds the ${lang} HLS module with a blackbox for the ${targetName(t)}, no warning`, { skip, timeout: 30 * 60000 }, async () => {
      const { createJob } = await import('../../server/jobs.js');
      const { runImplementation } = await import('../../server/ise.js');
      const { dir, project } = await blackboxProject(lang, t, tmp);
      const job = createJob('hls-blackbox', j => runImplementation(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] }));
      while (job.status === 'running') await new Promise(r => setTimeout(r, 1000));
      assert.equal(job.status, 'ok', job.lines.filter(l => /ERROR/.test(l)).join('\n'));
      assert.ok(fs.existsSync(path.join(dir, 'build', 'bb_top.bit')));
      // (the module the blackbox names, synthesized by XST from its own language's file)
      assert.match(job.lines.join('\n'), /adder_rtl/i);
      assert.deepEqual(iseWarnings(job.lines), []);
    });
  }
}

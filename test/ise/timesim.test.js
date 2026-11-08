// ISE's Post-Place & Route Simulation Model with its timing (#558), as Simulate runs it in an ISE mode (opt-in, as
// test/ise/examples.test.js: it needs ISE's Docker image): ISE builds the blinky example with the generics its test
// bench gives (XST's -generics, as the Silinx toolchain synthesizes its models), netgen writes the model and its SDF,
// the report names both, and the test bench passes on the model with the SDF's delays built in (core/sdf.js) with
// no timing violation and no warning.
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/timesim.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exampleProject, example } from '../examples-lib.mjs';
import { compile, elaborate } from '../../core/compile.js';
import { primitiveSources } from '../../core/unisim.js';
import { scalarizeNetlist } from '../../core/netlist-hier.js';
import { Simulator } from '../../core/simulator.js';
import { dutGenerics } from '../../core/sim-model.js';
import { parseSdf, annotateSdf } from '../../core/sdf.js';

const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const HOST = LOCAL ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(process.env.SILINX_ISE_HOST || '');
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !HOST && !LOCAL ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;

let tmp;
before(() => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-timesim-'));
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({
    ...(LOCAL ? { mode: 'docker', docker: { image: IMAGE, platform: 'linux/amd64', settings: '/opt/Xilinx/14.7/ISE_DS/settings64.sh' } }
      : { mode: 'ssh', ssh: { host: HOST[2], user: HOST[1] || '', remoteDir: 'silinx-timesim', image: IMAGE, settings: '/opt/Xilinx/14.7/ISE_DS/settings64.sh' } }) }));
});

test('ISE\'s post-place & route model of blinky with its SDF: the test bench passes, no timing violation, no warning', { skip, timeout: 30 * 60000 }, async () => {
  const { createJob } = await import('../../server/jobs.js');
  const { runImplementation } = await import('../../server/ise.js');
  // the generics the test bench gives the top (DIV = 2, DEBOUNCE = 2, REFRESH = 4), to XST
  const ex = example('blinky');
  const tbLib = compile([...primitiveSources(ex.sources), ...ex.sources]);
  const { generics } = dutGenerics(elaborate(tbLib, ex.project.simTop), ex.project.top);
  assert.deepEqual(generics, { div: 2, debounce: 2, refresh: 4 });
  const { dir, project } = exampleProject('blinky', { board: 'basys2', variant: '250' }, tmp);
  project.impl = { ...project.impl, xstOptions: { generics: `{${Object.entries(generics).map(([k, v]) => `${k}=${v}`).join(' ')}}` } };
  const job = createJob('timesim', j => runImplementation(j, { project, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'postpar'] }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 1000));
  assert.equal(job.status, 'ok', job.lines.filter(l => /ERROR/.test(l)).join('\n'));
  const m = job.result.reports.simModels.postpar;
  assert.deepEqual([m.path, m.sdf], ['build/netgen/par/top_timesim.vhd', 'build/netgen/par/top_timesim.sdf']);

  // as Simulate runs it (web/js/app.js netlistSources): the SDF built in, scalarized, compiled with the test bench;
  // the generics the model was built with declared on its entity (the test bench's generic map accepted as it is)
  const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
  const sdf = parseSdf(read(m.sdf));
  const a = annotateSdf(read(m.path), 'vhdl', sdf);
  assert.equal(a.annotated, sdf.cells.size);
  assert.deepEqual(a.missing, []);
  const at = a.text.search(/\nentity top is\n/i) + '\nentity top is\n'.length;
  const model = `${a.text.slice(0, at)}  generic (\n${Object.entries(generics).map(([k, v]) => `    ${k} : integer := ${v}`).join(';\n')}\n  );\n${a.text.slice(at)}`;
  const net = { path: m.path, lang: 'vhdl', text: scalarizeNetlist(model) };
  const all = [...ex.sim, net];
  const lib = compile([...primitiveSources(all), ...all]);
  const d = elaborate(lib, ex.project.simTop);
  assert.deepEqual([...lib.errors, ...d.diags].filter(x => !/redefined/.test(x.message)).map(x => `${x.severity} ${x.file}:${x.line} ${x.message}`), []);
  const s = new Simulator(d);
  for (const sig of d.signals) sig.wave = null;
  for (let t = 1e8; t <= 1e10 && !s.log.some(e => /Simulation finished OK/.test(e.text)); t += 1e8) if (s.run(t).finished) break;
  assert.deepEqual(s.log.map(e => `${e.kind}: ${e.text}`), ['note: Simulation finished OK']);
});

// The interoperability with ISE, measured against ISE 14.7 (#2308; opt-in, as test/ise/examples.test.js):
//   - Silinx to ISE: an example exported as File > Export Xilinx ISE Project does, opened in ISE's own project flow
//     (xtclsh: project open), implemented through to the bitstream, with the warnings asserted;
//   - ISE to Silinx: the folder ISE leaves (the .xise it saved, its outputs) imported back as a zip: the same project.
//
//   SILINX_ISE_TESTS=1 SILINX_ISE_HOST=user@host node --test test/ise/xise-interop.test.js
//   SILINX_ISE_HOST=local: the image on this machine (the self-hosted runner, .github/workflows/ise.yml)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLES, exampleProject, targetName } from '../examples-lib.mjs';
import { iseExamplesConfig } from '../ise-examples-config.mjs';
import { createZip, readZip } from '../../core/zip.js';

const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const HOST = LOCAL ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(process.env.SILINX_ISE_HOST || '');
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !HOST && !LOCAL ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;
// a device of each family the .xise names: its properties differ, the sources do not
const TARGETS = [{ board: 'basys2', variant: '250' }, { board: 'nexys3' }];
// known failures of the export, with their issue
const KNOWN = { isqrt: '#2320: the HDL of a C function is not exported' };
// the warnings of ISE's project flow: none, but on the Nexys3 those of XST and map, the same with no .xise (#2321)
const constant = (block, cause, ...ffs) => ffs.map(ff => `WARNING:Xst:${cause ? `1896 - Due to other FF/Latch trimming, FF/Latch` : '1293 - FF/Latch'} <${ff}> has a constant value of 0 in block <${block}>. This FF/Latch will be trimmed during the optimization process.`);
const counts = (...names) => names.flatMap(n => [20, 21, 22, 23].map(b => `${n}/count_${b}`));
const NEXYS3_WARNINGS = {
  blinky: constant('top', false, 'u_speed/ticks_7'),
  pong: [...constant('pong', false, 'dbR/count_20'), ...constant('pong', true, 'beatCount_23', 'period_23', ...counts('db1', 'db2', 'dbL'), 'dbR/count_21', 'dbR/count_22', 'dbR/count_23')],
  stopwatch: ['WARNING:PhysDesignRules:2410 - This design is using one or more 9K Block RAMs'],
  clock: [...constant('digital_clock', false, 'db0/count_22'), ...constant('digital_clock', true, 'db0/count_20', 'db0/count_21', 'db0/count_23', ...counts('db1', 'db2', 'db3'))],
};
const expectedWarnings = (example, t) => (t.board === 'nexys3' && NEXYS3_WARNINGS[example] || []).slice().sort();

const RUN_SH = '[ -n "$ISE_SETTINGS" ] && . "$ISE_SETTINGS" > /dev/null\nxtclsh interop.tcl\n';
const interopTcl = xise => `project open ${xise}
puts "INTEROP top [project get top]"
if {![process run "Generate Programming File"]} { puts "INTEROP failed"; exit 1 }
puts "INTEROP status [process get "Generate Programming File" status]"
project close
exit 0
`;

let tmp, cfg, srv, base, NODE_CODEC;
before(async () => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ise-interop-'));
  // the user's remoteDir, read before the test's own configuration replaces theirs (#1916)
  cfg = iseExamplesConfig({ host: LOCAL ? null : { user: HOST[1], host: HOST[2] }, image: IMAGE });
  process.env.SILINX_WORKSPACE = path.join(tmp, 'ws');
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  fs.mkdirSync(process.env.SILINX_WORKSPACE, { recursive: true });
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify(cfg));
  ({ NODE_CODEC } = await import('../../server/impl-routes.js'));
  const { createApp } = await import('../../server/server.js');
  const app = await createApp();
  await new Promise(r => { srv = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${srv.address().port}/api`;
});
after(async () => {
  if (skip) return;
  srv.closeAllConnections?.();
  await new Promise(r => srv.close(r));
  if (!process.env.SILINX_ISE_KEEP) fs.rmSync(tmp, { recursive: true, force: true });
});

// the zip the application's export gives, unpacked in a folder of its own: { dir, xise, warnings }
async function exportToFolder(name) {
  const r = await fetch(`${base}/projects/${name}/export.zip?kind=xilinx`);
  assert.equal(r.status, 200);
  const dir = path.join(tmp, 'exported', name);
  const entries = await readZip(new Uint8Array(await r.arrayBuffer()), NODE_CODEC);
  for (const e of entries) {
    fs.mkdirSync(path.dirname(path.join(dir, e.path)), { recursive: true });
    fs.writeFileSync(path.join(dir, e.path), e.data);
  }
  return { dir, xise: entries.find(e => /\.xise$/.test(e.path)).path, warnings: JSON.parse(decodeURIComponent(r.headers.get('x-silinx-warnings') || '%5B%5D')) };
}

// xtclsh in the image, on the folder: the job, ended
async function runInIse(name, dir, xise) {
  fs.writeFileSync(path.join(dir, 'run.sh'), RUN_SH);
  fs.writeFileSync(path.join(dir, 'interop.tcl'), interopTcl(xise));
  const { createJob } = await import('../../server/jobs.js');
  const { runDocker, runSsh } = await import('../../server/ise.js');
  const gen = { buildDir: dir };
  const job = createJob('interop', async j => {
    const code = LOCAL ? await runDocker(j, cfg, gen, [], () => {}) : await runSsh(j, cfg, null, { name: `interop-${name}` }, gen, [], () => {}, { cleanup: true });
    if (code !== 0) throw new Error(`xtclsh ended with ${code}`);
  });
  while (job.status === 'running') await new Promise(r => setTimeout(r, 1000));
  fs.rmSync(path.join(dir, 'run.sh'));
  fs.rmSync(path.join(dir, 'interop.tcl'));
  return job;
}

// every file of a folder, for its zip
const walk = (dir, rel = '') => fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(e => (e.isDirectory()
  ? walk(dir, path.posix.join(rel, e.name)) : [{ path: path.posix.join(rel, e.name), data: fs.readFileSync(path.join(dir, rel, e.name)) }]));

const iseWarnings = lines => [...new Set(lines.filter(l => /^WARNING:/.test(l)).map(l => l.replace(/\s+/g, ' ').trim()))].sort();
const fileList = p => (p.files || []).map(f => `${f.path} ${f.lang} ${f.role}`).sort();

for (const example of EXAMPLES) {
  for (const t of TARGETS) {
    test(`example ${example} for the ${targetName(t)}: its exported project built in ISE's project flow, what ISE leaves imported back`, { skip, timeout: 30 * 60000, todo: KNOWN[example] }, async () => {
      const name = `${example}-${targetName(t)}`;
      const { project } = exampleProject(example, t, process.env.SILINX_WORKSPACE);
      fs.writeFileSync(path.join(process.env.SILINX_WORKSPACE, name, 'silinx.json'), JSON.stringify({ ...project, name }, null, 2));
      const out = await exportToFolder(name);
      assert.deepEqual(out.warnings, []);

      const job = await runInIse(name, out.dir, out.xise);
      assert.equal(job.status, 'ok', job.lines.filter(l => /ERROR|INTEROP|invalid|couldn't/i.test(l)).slice(0, 30).join('\n'));
      // (a line of xtclsh's may start with a space left by the tool before it)
      const said = job.lines.map(l => l.trim()).filter(l => l.startsWith('INTEROP'));
      assert.deepEqual(said.slice(0, 1), [`INTEROP top /${project.top}`]);
      assert.match(said[1], /^INTEROP status (up_to_date|warnings)$/, said.join('\n'));
      assert.ok(fs.existsSync(path.join(out.dir, `${project.top}.bit`)), `no ${project.top}.bit`);
      assert.deepEqual(iseWarnings(job.lines), expectedWarnings(example, t));

      // the folder as ISE left it, as a user would zip it
      const zip = await createZip(walk(out.dir), NODE_CODEC);
      const r = await fetch(`${base}/projects/import-zip?name=${encodeURIComponent(`back-${name}`)}`, { method: 'POST', body: Buffer.from(zip) });
      const body = await r.json();
      assert.equal(r.status, 200, JSON.stringify(body));
      assert.deepEqual(body.warnings, []);
      assert.deepEqual(body.missing, []);
      const back = body.project;
      assert.equal(back.top, project.top);
      assert.equal(back.simTop, project.simTop);
      assert.equal(back.constraints, project.constraints);
      assert.deepEqual([back.device.part, back.device.package, back.device.speed], [project.device.part, project.device.package, project.device.speed].map(String));
      assert.deepEqual(fileList(back), fileList(project));
    });
  }
}

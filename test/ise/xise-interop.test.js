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
import { micro80S3eWarnings, MICRO80_S6_WARNINGS } from '../ise-micro80-warnings.mjs';
import { createZip, readZip } from '../../core/zip.js';

const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
const enabled = process.env.SILINX_ISE_TESTS === '1';
// the host only from the environment (never written in a file)
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const HOST = LOCAL ? null : /^(?:([\w.-]+)@)?([\w.:-]+)$/.exec(process.env.SILINX_ISE_HOST || '');
const skip = !enabled ? 'set SILINX_ISE_TESTS=1 to run the ISE tests' : !HOST && !LOCAL ? 'set SILINX_ISE_HOST=user@host (the machine with the ISE Docker image), or local (the image here)' : false;
// a device of each family the .xise names: its properties differ, the sources do not
const TARGETS = [{ board: 'basys2', variant: '250' }, { board: 'nexys3' }];
// the warnings of ISE's project flow, the same with no .xise: none (#2321: the examples' counters as wide as they need,
// the stopwatch's lap memory a whole block RAM), but micro80's (#2688: its processor's, as test/ise/examples.test.js
// expects them, its VHDL read from the project's folder; on the Nexys3 those of XST and map)
const WARNINGS = { basys2: { micro80: micro80S3eWarnings('/work/src') }, nexys3: { micro80: MICRO80_S6_WARNINGS } };
const expectedWarnings = (example, t) => (WARNINGS[t.board][example] || []).slice().sort();

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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-interop-'));
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
    test(`example ${example} for the ${targetName(t)}: its exported project built in ISE's project flow, what ISE leaves imported back`, { skip, timeout: 30 * 60000 }, async () => {
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
      // (a C function's module comes back as the HDL file it was exported as: #2320)
      const generated = example === 'isqrt' ? [{ path: 'src/isqrt.c.vhd', lang: 'vhdl', role: 'design' }] : [];
      assert.deepEqual(fileList(back), fileList({ files: [...project.files, ...generated] }));
    });
  }
}

// #3828: a schematic's arrayed instance (bits(3:0) of a 1-bit register) drawn with its module's symbol of its own (Q on
// the left, D on the top, the clock at the bottom), exported (its .sch, the module's .sym), built by ISE's project flow
// (its sch2hdl reads the array: 4 flip-flops in map's report; the base not a Verilog keyword, which sch2hdl refuses as a block name) to the bitstream with no warnings, and what ISE leaves imported back: the
// instance arrayed, drawn with the symbol, the module's .sym.json made from the .sym
test('#3828 an arrayed instance with its module\'s symbol of its own: exported, built in ISE\'s project flow, imported back', { skip, timeout: 30 * 60000 }, async () => {
  const { normalizeDoc, symbolPins, generateHdl } = await import('../../core/schdoc.js');
  const { instanceParams, symbolText } = await import('../../core/symbol-layout.js');
  const name = 'arrayed-basys2-250';
  const dir = path.join(process.env.SILINX_WORKSPACE, name);
  const REG = 'library ieee;\nuse ieee.std_logic_1164.all;\n\nentity reg1 is\n  port (d, ce, c : in std_logic; q : out std_logic);\nend entity reg1;\n\narchitecture rtl of reg1 is\nbegin\n  process (c) begin\n    if rising_edge(c) then\n      if ce = \'1\' then q <= d; end if;\n    end if;\n  end process;\nend architecture rtl;\n';
  const SYM = { version: 1, kind: 'symbol', module: 'reg1', pins: [{ name: 'q', side: 'W' }, { name: 'ce', side: 'W' }, { name: 'd', side: 'N' }, { name: 'c', side: 'S' }], spacing: 20, width: null, height: null, title: 'top' };
  const mods = { reg1: { name: 'reg1', lang: 'vhdl', ports: ['d', 'ce', 'c', 'q'].map(n => ({ name: n, dir: n === 'q' ? 'out' : 'in', width: 1 })), symbol: SYM } };
  const s = { id: 'U', type: 'module', x: 400, y: 300, rot: 0, mirror: false, name: 'bits(3:0)', params: { module: 'reg1', generics: {}, ...instanceParams(mods.reg1) } };
  const OUT = { W: [-80, 0], E: [80, 0], N: [0, -80], S: [0, 80] };
  const wires = [], ports = [];
  for (const p of symbolPins(s, mods)) {
    const b = { x: p.x + OUT[p.side][0], y: p.y + OUT[p.side][1] };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    ports.push({ id: `m_${p.name}`, name: p.name === 'c' ? 'clk' : p.name, dir: p.dir === 'out' ? 'out' : 'in', width: p.name === 'd' || p.name === 'q' ? 4 : 1, x: b.x, y: b.y });
  }
  const doc = normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', generatedFile: 'src/top.vhd', symbols: [s], wires, ports, labels: [] }, { modules: mods });
  const g = generateHdl(doc, { lang: 'vhdl', modules: mods });
  assert.deepEqual(g.diagnostics, []);
  const pins = { 'd<0>': 'P11', 'd<1>': 'L3', 'd<2>': 'K3', 'd<3>': 'B4', ce: 'G3', clk: 'B8', 'q<0>': 'M5', 'q<1>': 'M11', 'q<2>': 'P7', 'q<3>': 'P6' };
  const files = { 'src/reg1.vhd': REG, 'src/reg1.sym.json': symbolText(SYM), 'src/top.sch.json': JSON.stringify(doc, null, 1), 'src/top.vhd': g.code,
    'constraints/top.ucf': Object.entries(pins).map(([n, l]) => `NET "${n}" LOC = "${l}" ;\n`).join('') };
  for (const [p, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), t); }
  const project = { name, version: 1, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, board: 'basys2', boardVariant: '250', top: 'top', simTop: '',
    files: [{ path: 'src/reg1.vhd', lang: 'vhdl', role: 'design' }, { path: 'src/top.vhd', lang: 'vhdl', role: 'design' }], constraints: 'constraints/top.ucf' };
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(project, null, 2));

  const out = await exportToFolder(name);
  assert.deepEqual(out.warnings, ["src/top.sch: 'reg1': project module — ISE uses its HDL source and the reg1.sym symbol (or regenerate it with Create Schematic Symbol)"]);
  assert.match(fs.readFileSync(path.join(out.dir, 'src/top.sch'), 'utf8'), /<block symbolname="reg1" name="bits\(3:0\)">/);
  const job = await runInIse(name, out.dir, out.xise);
  assert.equal(job.status, 'ok', job.lines.filter(l => /ERROR|INTEROP|invalid|couldn't/i.test(l)).slice(0, 30).join('\n'));
  const said = job.lines.map(l => l.trim()).filter(l => l.startsWith('INTEROP'));
  assert.match(said[1] || '', /^INTEROP status (up_to_date|warnings)$/, said.join('\n'));
  assert.deepEqual(iseWarnings(job.lines), []);
  // (the array's 4 copies: 4 flip-flops in map's report, in the slices or packed into the IOBs)
  const mrp = fs.readdirSync(out.dir).find(f => /_map\.mrp$/i.test(f));
  assert.ok(mrp, 'map\'s report');
  const ffs = [...fs.readFileSync(path.join(out.dir, mrp), 'utf8').matchAll(/(?:Number of Slice Flip Flops|IOB Flip Flops):\s+(\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  assert.equal(ffs, 4);

  const zip = await createZip(walk(out.dir), NODE_CODEC);
  const r = await fetch(`${base}/projects/import-zip?name=${encodeURIComponent(`back-${name}`)}`, { method: 'POST', body: Buffer.from(zip) });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.deepEqual([body.warnings, body.missing], [[], []]);
  const ws = path.join(process.env.SILINX_WORKSPACE, `back-${name}`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ws, 'src/reg1.sym.json'), 'utf8')).pins, SYM.pins);
  const back = JSON.parse(fs.readFileSync(path.join(ws, 'src/top.sch.json'), 'utf8')).symbols.find(x => x.type === 'module');
  assert.deepEqual([back.name, back.params.ports.map(q => `${q.name}:${q.side}`)], ['bits(3:0)', ['q:W', 'ce:W', 'd:N', 'c:S']]);
});

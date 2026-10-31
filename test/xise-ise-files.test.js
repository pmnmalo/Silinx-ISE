// .xise files written by ISE 14.7 itself (#2308; test/fixtures/ise-xise, made in ISE's Docker image, with xtclsh): the
// import reads ISE's real format, its absolute paths and its hundreds of properties included. stopwatch: a project ISE
// created (project new); traffic and gates: projects exported by Silinx, opened and saved by ISE (traffic's Optimization
// Goal changed in ISE, gates with its schematic). The whole loop with ISE running: test/ise/xise-interop.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importXise, exportXise } from '../server/xise.js';

const fixture = n => fs.readFileSync(new URL(`./fixtures/ise-xise/${n}`, import.meta.url), 'utf8');
const example = n => new URL(`../examples/${n}/`, import.meta.url);

test('a project ISE created: device, top, roles, ISE\'s defaults, no warnings', () => {
  const p = importXise(fixture('stopwatch-created-by-ise.xise'));
  assert.deepEqual(p.device, { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });
  assert.equal(p.top, 'stopwatch');
  assert.equal(p.simTop, '');
  assert.equal(p.name, 'stopwatch');
  assert.deepEqual(p.files.map(f => [f.path, f.lang, f.role]), [
    ['/work/src/debounce.vhd', 'vhdl', 'design'], ['/work/src/to_decimal.vhd', 'vhdl', 'design'], ['/work/src/sevenseg.vhd', 'vhdl', 'design'],
    ['/work/src/stopwatch.vhd', 'vhdl', 'design'], ['/work/sim/tb_stopwatch.vhd', 'vhdl', 'sim'],
  ]);
  assert.equal(p.constraints, '/work/constraints/top.ucf');
  assert.deepEqual(p.impl, { optMode: 'Speed', optLevel: 1, startupClk: 'Cclk' });
  assert.deepEqual(p.warnings, []);
});

test('an exported project saved by ISE: mixed languages, a Spartan-6, the property changed in ISE, no warnings', () => {
  const p = importXise(fixture('traffic-saved-by-ise.xise'));
  assert.deepEqual(p.device, { family: 'spartan6', part: 'xc6slx16', package: 'csg324', speed: '-3' });
  assert.deepEqual([p.top, p.simTop, p.lang, p.topSourceType], ['top', 'tb_traffic', 'vhdl', 'hdl']);
  assert.deepEqual(p.files.map(f => f.lang), ['vhdl', 'vhdl', 'vhdl', 'verilog', 'vhdl', 'vhdl']);
  assert.equal(p.impl.optMode, 'Area');
  assert.deepEqual(p.warnings, []);
});

test('a schematic project saved by ISE: the schematic listed with both associations, no warnings', () => {
  const p = importXise(fixture('gates-saved-by-ise.xise'));
  assert.deepEqual(p.schematics, [{ path: '/work/src/gates.sch', role: 'design' }]);
  assert.deepEqual(p.files.map(f => [f.path, f.role]), [['/work/sim/tb_gates.vhd', 'sim']]);
  assert.equal(p.top, 'gates');
  assert.deepEqual(p.warnings, []);
});

test('what ISE saved, exported again, reads the same', () => {
  for (const f of ['stopwatch-created-by-ise.xise', 'traffic-saved-by-ise.xise']) {
    const p = importXise(fixture(f));
    const again = importXise(exportXise({ ...p, topSourceType: p.topSourceType }));
    for (const k of ['device', 'top', 'files', 'constraints', 'impl', 'warnings']) assert.deepEqual(again[k], p[k], `${f}: ${k}`);
  }
});

test('an unusable file: the error the import gives', () => {
  assert.throws(() => importXise(fixture('gates-saved-by-ise.xise').replace(/<project\b/g, '<other').replace(/<\/project>/, '')), /not an ISE \.xise project file/);
});

// through the route: the absolute paths in ISE's file mapped into the project, the sources found by their names
let tmp, srv, base;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xise-files-'));
  process.env.SILINX_WORKSPACE = path.join(tmp, 'ws');
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  const { createApp } = await import('../server/server.js');
  const app = await createApp();
  await new Promise(r => { srv = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${srv.address().port}/api`;
});
after(async () => {
  srv.closeAllConnections?.();
  await new Promise(r => srv.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const sourcesOf = (name, project) => Object.fromEntries([...project.files.map(f => f.path), project.constraints].map(p => [path.posix.basename(p), fs.readFileSync(new URL(p, example(name)), 'utf8')]));

for (const [name, file] of [['stopwatch', 'stopwatch-created-by-ise.xise'], ['traffic', 'traffic-saved-by-ise.xise']]) {
  test(`${name}: ISE's file imported as a project, the example's files where they were, nothing missing, no warnings`, async () => {
    const project = JSON.parse(fs.readFileSync(new URL('silinx.json', example(name)), 'utf8'));
    const r = await fetch(`${base}/projects/import-xise`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `from-ise-${name}`, xise: fixture(file), files: sourcesOf(name, project) }) });
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    assert.deepEqual(body.missing, []);
    assert.deepEqual(body.warnings, []);
    const list = p => p.files.map(f => `${f.path} ${f.lang} ${f.role}`).sort();
    assert.deepEqual(list(body.project), list(project));
    assert.equal(body.project.top, project.top);
    assert.equal(body.project.constraints, project.constraints);
  });
}

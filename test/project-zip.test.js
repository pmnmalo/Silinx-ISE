// A whole project as a zip, out and in (#2674, server/project-zip.js: out of server/xise-routes.js's export.zip and
// import-zip routes, which call it): the two kinds of export of the examples (a schematic as an ISE schematic, a C
// source as its HDL), an import of each, and an import's error through the caller's bad().
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-project-zip-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { exportProjectZip, importProjectEntries, sourcesOf } = await import('../server/project-zip.js');
const { gateEntries, gateZip } = await import('../core/import-gate.js');
const { readZip } = await import('../core/zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
const names = async zip => (await readZip(zip, NODE_CODEC)).map(e => e.path).sort();

test('exportProjectZip: a Xilinx ISE project (the schematic as an ISE schematic), a Silinx one as it is', async () => {
  await P.createProject({ name: 'gates', template: 'gates' });
  const x = await exportProjectZip(P, 'gates');
  assert.equal(x.file, 'gates.zip');
  assert.deepEqual(x.warnings, []);
  const xn = await names(x.zip);
  assert.ok(xn.includes('gates.xise') && xn.some(n => /\.sch$/.test(n)), xn.join());
  assert.ok(!xn.includes('silinx.json') && !xn.includes('src/gates.sch.json'));
  const s = await exportProjectZip(P, 'gates', 'silinx');
  assert.equal(s.file, 'gates-silinx.zip');
  assert.deepEqual(await names(s.zip), ['constraints/gates.ucf', 'silinx.json', 'sim/tb_gates.vhd', 'src/gates.sch.json', 'src/gates.vhd']);
  assert.deepEqual(Object.keys(await sourcesOf(P, 'gates', await P.readProject('gates'))).sort(), ['sim/tb_gates.vhd', 'src/gates.vhd']);
});

test('exportProjectZip: a C source goes out as its HDL', async () => {
  await P.createProject({ name: 'fir', template: 'fir' });
  const n = await names((await exportProjectZip(P, 'fir')).zip);
  assert.ok(n.includes('fir.xise') && n.some(f => /\.c\.vhd$/.test(f)) && !n.some(f => /\.c$/.test(f)), n.join());
});

test('importProjectEntries: the two exports back as projects; no project in the entries: bad()', async () => {
  const back = async (from, to, kind) => importProjectEntries(P, to, await gateZip((await exportProjectZip(P, from, kind)).zip, NODE_CODEC), m => new Error(m));
  const x = await back('gates', 'gates_x', 'xilinx');
  assert.deepEqual([x.project.top, x.project.simTop, x.missing, x.warnings], ['gates', 'tb_gates', [], []]);
  const s = await back('gates', 'gates_s', 'silinx');
  assert.deepEqual([s.project.top, s.project.board, s.missing, s.warnings], ['gates', 'basys2', [], []]);
  assert.ok(s.extra.includes('src/gates.sch.json'));
  await assert.rejects(importProjectEntries(P, 'none', gateEntries([{ path: 'a.txt', data: new Uint8Array(1) }]), m => Object.assign(new Error(m), { mine: true })),
    { mine: true, message: 'the zip contains no .xise (ISE project) and no silinx.json' });
  // entries that did not pass the import gate (#2830): refused
  await assert.rejects(importProjectEntries(P, 'none', [{ path: 'silinx.json', data: new Uint8Array(2) }], m => new Error(m)),
    { message: 'importProjectEntries: the entries must pass the import gate (core/import-gate.js)' });
});

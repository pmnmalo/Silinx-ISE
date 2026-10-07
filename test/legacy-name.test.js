// Projects and data from before the rename XAIlinx -> Silinx keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('a project with xailinx.json is listed, read and its descriptor renamed to silinx.json', async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-legacy-'));
  process.env.SILINX_WORKSPACE = ws;
  const P = await import('../server/projects.js');
  const dir = path.join(ws, 'oldproj');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'xailinx.json'), JSON.stringify({ name: 'oldproj', version: 1, device: { part: 'xc3s250e' }, top: 'top', files: [] }));
  const list = await P.listProjects();
  assert.deepEqual(list.map(p => p.name), ['oldproj']);
  const pj = await P.readProject('oldproj');
  assert.equal(pj.top, 'top');
  assert.ok(fs.existsSync(path.join(dir, 'silinx.json')) && !fs.existsSync(path.join(dir, 'xailinx.json')));
  assert.deepEqual(await P.fileTree('oldproj'), []);
  await P.writeProject('oldproj', { ...pj, top: 'top2' });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')).top, 'top2');
  fs.rmSync(ws, { recursive: true, force: true });
  delete process.env.SILINX_WORKSPACE;
});

test('ASM charts generated before the rename are still recognised from their HDL header', async () => {
  const A = await import('../core/asm.js');
  const L = await import('../core/asm-from-hdl.js');
  const m = A.normalizeModel(JSON.parse(fs.readFileSync(new URL('../examples/blinky/src/speed_ctrl.asm.json', import.meta.url), 'utf8')));
  const code = A.generate(m, 'vhdl').code;
  const old = code.replace('Generator   : Silinx ASM editor', 'Generator   : XAIlinx ASM editor');
  assert.notEqual(old, code);
  const r = L.asmFromHdl(old, { path: 'src/speed_ctrl.vhd' });
  assert.ok(L.sameAsmStructure(r.model, m));
});

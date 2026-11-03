// Renaming a module on the server (#2674, server/rename-module.js), as the interface's Rename does: the modules of the
// project's HDL files, the file following the name, the stimuli and the test bench renamed with it, and a rename
// refused before anything is moved (a drawing's new path taken).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-rename-module-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const R = await import('../server/rename-module.js');

test('projectModules: the modules of the HDL files, with their file', async () => {
  await P.createProject({ name: 'b', template: 'blinky' });
  const mods = await R.projectModules(P, 'b');
  assert.deepEqual(mods.map(m => `${m.name}:${m.file}`).sort(), ['bcd_counter:src/bcd_counter.vhd', 'knight:src/knight.vhd', 'prescaler:src/counter.v', 'sevenseg:src/sevenseg.v', 'speed_ctrl:src/speed_ctrl.vhd', 'tb_top:sim/tb_top.vhd', 'top:src/top.vhd']);
});

test('followingFile: the file named after the module follows it, another one stays', () => {
  assert.equal(R.followingFile('src/top.vhd', 'top', 'main'), 'src/main.vhd');
  assert.equal(R.followingFile('src/TOP.vhd', 'top', 'main'), 'src/main.vhd');
  assert.equal(R.followingFile('sim/tb_top.vhd', 'top', 'main'), null);
  assert.equal(R.followingFile('top.v', 'top', 'main'), 'main.v');
});

test('renameModule: the test bench and its stimuli renamed with it', async () => {
  await P.updateProject('b', p => ({ ...p, stimuli: { tb_top: { cycles: 4 } } }));
  const r = await R.renameModule(P, 'b', 'tb_top', 'tb_blinky');
  assert.equal(r.message, 'Rename: module \'tb_top\' renamed to \'tb_blinky\' (1 file(s) updated).');
  const pj = await P.readProject('b');
  assert.deepEqual([pj.simTop, pj.stimuli], ['tb_blinky', { tb_blinky: { cycles: 4 } }]);
});

test('renameModule: refused before anything moves when a drawing\'s new path is taken', async () => {
  await P.writeFile('b', 'src/pace.asm.json', '{}');
  const before = JSON.stringify(await P.readProject('b'));
  await assert.rejects(R.renameModule(P, 'b', 'speed_ctrl', 'pace', { to: 'src/pace.vhd' }), { rename: true, message: 'src/pace.asm.json already exists.' });
  assert.equal(JSON.stringify(await P.readProject('b')), before);
  assert.ok(fs.existsSync(path.join(P.projectDir('b'), 'src/speed_ctrl.vhd')) && fs.existsSync(path.join(P.projectDir('b'), 'src/speed_ctrl.asm.json')));
  assert.match(fs.readFileSync(path.join(P.projectDir('b'), 'src/top.vhd'), 'utf8'), /speed_ctrl/);
});

// A drawing's HDL file kept in sync with it on the server (#2674, server/drawing-sync.js). The reference: the HDL files
// of the repository's drawings, written by the interface's editors; made again on the server, each is the same, byte
// for byte (nothing written). Then a change, a drawing with errors (stale), the drawings in a language and back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratchEnv } from './server-helpers.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp;
before(async () => { tmp = await scratchEnv('silinx-drawing-sync-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const D = await import('../server/drawing-sync.js');
const read = (name, f) => fs.readFileSync(path.join(P.projectDir(name), f), 'utf8');

// the examples and test designs with a drawing linked to its HDL file
const linked = ['examples', 'test-designs'].flatMap(dir => fs.readdirSync(path.join(ROOT, dir)).filter(n => fs.existsSync(path.join(ROOT, dir, n, 'silinx.json'))))
  .filter(n => [P.EXAMPLES_DIR, P.TEST_DESIGNS_DIR].some(d => fs.existsSync(path.join(d, n)) && JSON.stringify(fs.readdirSync(path.join(d, n), { recursive: true })).match(/\.(sch|asm|fsm|tt|bool|pn)\.json"/)));

test('the repository\'s drawings: their HDL made again is the interface\'s, byte for byte', async () => {
  let checked = 0;
  for (const n of linked) {
    await P.createProject({ name: `c_${n}`, template: n });
    for (const f of (await P.fileTree(`c_${n}`)).filter(f => /\.(sch|asm|fsm|tt|bool|pn)\.json$/.test(f))) {
      const r = await D.syncDrawing(P, `c_${n}`, f);
      if (!r) continue;
      assert.deepEqual(r, { target: r.target, written: null, removed: null, stale: null, messages: [] }, `${n}/${f}`);
      checked++;
    }
    assert.deepEqual(await D.staleDrawings(P, `c_${n}`), [], n);
  }
  // (blinky's ASM chart, gates' schematic, traffic's state diagram and truth table at least)
  assert.ok(checked >= 4, `${checked} drawings`);
});

test('syncDrawing: a change written into the HDL file; a drawing with errors leaves it, stale; not a drawing', async () => {
  await P.createProject({ name: 'tr', template: 'traffic' });
  const tt = JSON.parse(read('tr', 'src/lamps.bool.json'));
  const before = read('tr', 'src/lamps.vhd');
  tt.table.car_g = `10${tt.table.car_g.slice(2)}`;
  await P.writeFile('tr', 'src/lamps.bool.json', JSON.stringify(tt, null, 2));
  assert.deepEqual(await D.syncDrawing(P, 'tr', 'src/lamps.bool.json'), { target: 'src/lamps.vhd', written: 'src/lamps.vhd', removed: null, stale: null, messages: ['src/lamps.vhd updated from src/lamps.bool.json'] });
  assert.notEqual(read('tr', 'src/lamps.vhd'), before);
  const fsm = JSON.parse(read('tr', 'src/traffic.fsm.json'));
  fsm.transitions[0].to = 's99';
  await P.writeFile('tr', 'src/traffic.fsm.json', JSON.stringify(fsm, null, 2));
  const hdl = read('tr', 'src/traffic.vhd');
  const why = 'A transition starts or ends at a state that does not exist';
  assert.deepEqual(await D.syncDrawing(P, 'tr', 'src/traffic.fsm.json'), { target: 'src/traffic.vhd', written: null, removed: null, stale: why, messages: [`WARNING: src/traffic.vhd not updated: src/traffic.fsm.json has errors: ${why}`] });
  assert.equal(read('tr', 'src/traffic.vhd'), hdl);
  assert.deepEqual(await D.staleDrawings(P, 'tr'), [{ target: 'src/traffic.vhd', from: 'src/traffic.fsm.json', why: `it has errors: ${why}` }]);
  assert.equal(await D.syncDrawing(P, 'tr', 'src/top.vhd'), null);
  assert.equal(await D.syncDrawing(P, 'tr', 'constraints/traffic.ucf'), null);
});

test('drawingsInLanguage / setSourceLanguage: the drawings in Verilog, their HDL files with them; one of its own kept', async () => {
  await P.createProject({ name: 'tl', template: 'traffic' });
  assert.equal(await D.drawingLanguage(P, 'tl', 'src/traffic.fsm.json'), 'vhdl');
  const own = await D.setSourceLanguage(P, 'tl', 'src/lamps.bool.json', 'vhdl');
  assert.deepEqual(own, { changed: false, language: 'vhdl', messages: [] });
  assert.deepEqual((await P.readProject('tl')).sourceLanguage, { 'src/lamps.bool.json': 'vhdl' });
  await P.updateProject('tl', p => ({ ...p, preferredLanguage: 'verilog' }));
  const r = await D.drawingsInLanguage(P, 'tl', 'verilog');
  assert.deepEqual(r, { changed: ['src/traffic.fsm.json'], messages: ['src/traffic.fsm.json: its HDL is now in Verilog, src/traffic.v (src/traffic.vhd removed)'] });
  assert.ok(!fs.existsSync(path.join(P.projectDir('tl'), 'src/traffic.vhd')));
  assert.equal(JSON.parse(read('tl', 'src/traffic.fsm.json')).generatedFile, 'src/traffic.v');
  assert.match(read('tl', 'src/traffic.v'), /^\s*module traffic/m);
  // its own back to the project's: Verilog now
  const back = await D.setSourceLanguage(P, 'tl', 'src/lamps.bool.json', '');
  assert.deepEqual(back, { changed: true, language: 'verilog', messages: ['src/lamps.bool.json: its HDL is now in Verilog, src/lamps.v (src/lamps.vhd removed)'] });
  assert.equal((await P.readProject('tl')).sourceLanguage, undefined);
});

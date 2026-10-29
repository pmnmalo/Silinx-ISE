// UI: a module's symbol double-clicked in a schematic opens the module's main source (#2046): its drawing when it is
// drawn (a schematic, a state diagram, a truth table), as its Design row's double-click, not the HDL generated from it;
// a module written in HDL opens its HDL. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupUi, uiTest, makeProject } from './harness.js';
import { normalizeDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shipped = (ex, f) => fs.readFile(path.join(ROOT, 'examples', ex, 'src', f), 'utf8');

uiTest('#2046 a module symbol double-clicked opens its drawing (schematic, state diagram, truth table), a module in VHDL its VHDL', E, async (page) => {
  const files = {};
  for (const f of ['gates.sch.json', 'gates.vhd']) files[`src/${f}`] = await shipped('gates', f);
  for (const f of ['traffic.fsm.json', 'traffic.vhd', 'lamps.tt.json', 'lamps.vhd', 'timer.vhd']) files[`src/${f}`] = await shipped('traffic', f);
  await makeProject(env, { name: 'OpenMod', files });
  await page.openProject('OpenMod');
  // the top: one instance of each, 300 px apart, their ports as the project's modules have them
  const mods = await page.eval(async () => { const all = await (await import('/js/drawings.js')).schModules();
    return Object.fromEntries(['gates', 'traffic', 'lamps', 'timer'].filter((m) => all[m]).map((m) => [m, all[m].ports.map((p) => ({ name: p.name, dir: p.dir, width: p.width }))])); });
  assert.deepEqual(Object.keys(mods).sort(), ['gates', 'lamps', 'timer', 'traffic']);
  const symbols = ['gates', 'traffic', 'lamps', 'timer'].map((m, i) => ({ id: `S${i + 1}`, type: 'module', x: 100 + 300 * i, y: 200, rot: 0, mirror: false, name: `U${i + 1}`, params: { module: m, ports: mods[m] } }));
  const top = normalizeDoc({ name: 'top', lang: 'vhdl', symbols, wires: [], ports: [], labels: [] });
  await env.server.api('PUT', `/api/projects/OpenMod/file?path=${encodeURIComponent('src/top.sch.json')}`, JSON.stringify(top));
  await page.eval(() => window.SilinxApp.reloadProject());
  const open = async (id, want) => {
    await page.eval(() => window.SilinxApp.openSch('src/top.sch.json'));
    await page.waitFor((ed, s) => document.querySelector(`${ed} svg .sym[data-id="${s}"]`), [ED, id], { what: 'drawn' });
    await page.dblclick(`${ED} svg .sym[data-id="${id}"] .hitbox`);
    await page.waitFor((w) => window.Silinx.active?.id === w, [want], { what: `${id}: ${want} opened` });
  };
  await open('S1', 'sch:src/gates.sch.json');
  await open('S2', 'fsm:src/traffic.fsm.json');
  await open('S3', 'tt:src/lamps.tt.json');
  await open('S4', 'file:src/timer.vhd');
});

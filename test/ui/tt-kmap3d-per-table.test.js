// UI: each Boolean algebra table its own Karnaugh map 3D box (#3074): a table's map put in 3D leaves every other open
// table's map flat, and a cell clicked on that flat map changes the cell, not the view (it turned 3D: one box shared
// by every table, read at the next redraw); for the maps of 3 or 4 inputs (the cylinder, the torus) and of 5 or 6 (the
// stack); a table opened afterwards is flat; its own box kept when it is shown again; the 3D map's turn each table's too.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newTable } from '../../core/logic.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const T = '.doc:not([hidden]) .tt-editor';

uiTest('#3074 Karnaugh map: the 3D box each table\'s own; a click on a flat map changes its cell, not its view', E, async (page) => {
  const tables = {
    a3: { ...newTable('a3', ['a', 'b', 'c'], ['f']), table: { f: '01101001' } },
    b3: { ...newTable('b3', ['a', 'b', 'c'], ['f']), table: { f: '00010111' } },
    c4: { ...newTable('c4', ['a', 'b', 'c', 'd'], ['f']), table: { f: '0001000100011111' } },
    d5: { ...newTable('d5', ['a', 'b', 'c', 'd', 'e'], ['f']), table: { f: '0'.repeat(31) + '1' } },
    e6: { ...newTable('e6', ['a', 'b', 'c', 'd', 'e', 'g'], ['f']), table: { f: '0'.repeat(63) + '1' } },
  };
  await makeProject(env, { name: 'Tt3dEach', files: Object.fromEntries(Object.entries(tables).map(([k, v]) => [`src/${k}.bool.json`, JSON.stringify(v)])) });
  await page.openProject('Tt3dEach');
  const open = async (k) => {
    await page.eval((p) => window.SilinxApp.openTt(p), `src/${k}.bool.json`);
    await page.waitFor((p) => window.Silinx.active?.id === `tt:${p}` && document.querySelector('.doc:not([hidden]) .tt-editor .tt-legend'), [`src/${k}.bool.json`], { what: k });
  };
  /** The shown map: 3D or flat, its box ticked or not. */
  const shown = () => page.eval((t) => ({ d3: !!document.querySelector(`${t} .tt-kmap-host > .tt-k3d`), flat: !!document.querySelector(`${t} .tt-kmap-host > svg.tt-kmap`), box: document.querySelector(`${t} .tt-k3d-on`).checked }), T);
  const flat = { d3: false, flat: true, box: false }, d3 = { d3: true, flat: false, box: true };
  const col = () => page.eval(() => window.Silinx.active.ttEditor.getModel().table.f);
  // every table opened, all flat
  for (const k of Object.keys(tables)) { await open(k); assert.deepEqual(await shown(), flat, `${k} opened flat`); }
  for (const [one, other] of [['a3', 'b3'], ['c4', 'b3'], ['e6', 'd5'], ['d5', 'a3']]) {
    // one table's map in 3D
    await open(one);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-kmap-host > .tt-k3d`), [T], { what: `${one} in 3D` });
    // the other still flat; a click on its map's cell 0: the cell changed (0 → 1), the map still flat
    await open(other);
    assert.deepEqual(await shown(), flat, `${other} flat after ${one} in 3D`);
    const before = await col();
    await page.click(`${T} svg.tt-kmap .tt-kcell[data-row="0"]`);
    await page.waitFor((t, c) => window.Silinx.active.ttEditor.getModel().table.f !== c, [T, before], { what: `${other}'s cell 0 changed` });
    assert.equal((await col())[0], before[0] === '0' ? '1' : before[0] === '1' ? 'X' : '0', `${other}'s cell 0 cycled`);
    assert.deepEqual(await shown(), flat, `${other} still flat after a click on its map`);
    await page.eval(() => window.Silinx.active.ttEditor.undo());
    // the first one still in 3D, its box ticked; unticked again
    await open(one);
    assert.deepEqual(await shown(), d3, `${one} still in 3D`);
    await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);
    await page.waitFor((t) => !!document.querySelector(`${t} .tt-kmap-host > svg.tt-kmap`), [T], { what: `${one} flat again` });
  }
  // the turn each table's too: one map turned, another's first shown as its Reset view leaves it, and kept after an edit
  // (the stack's transform; the surface's: a face's corners on the screen)
  const pose = (sel) => page.eval((t, s) => { const e = document.querySelector(`${t} ${s}`); return e.style.transform || e.getAttribute('points'); }, T, sel);
  for (const [one, other, sel] of [['e6', 'd5', '.tt-k3d-stack'], ['a3', 'b3', '.tt-ks-face[data-row="5"]']]) {
    const homes = {};
    for (const k of [other, one]) {
      await open(k);
      await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T);
      await page.waitFor((t) => !!document.querySelector(`${t} .tt-kmap-host > .tt-k3d`), [T], { what: `${k} in 3D` });
      homes[k] = await pose(sel);
    }
    const home = homes[one];
    await page.eval((t) => { const s = document.querySelector(`${t} .tt-k3d`); for (let i = 0; i < 8; i++) s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); }, T);
    const turned = await pose(sel);
    assert.notEqual(turned, home, `${one} turned`);
    await open(other);
    assert.equal(await pose(sel), homes[other], `${other} not turned by ${one}'s turn`);
    await page.click(`${T} .tt-k3d [data-row="0"]`);   // (an edit: the map drawn again)
    await page.waitFor((t) => window.Silinx.active.ttEditor.getModel().table.f[0] !== '0', [T], { what: `${other}'s cell 0 changed` });
    assert.equal(await pose(sel), homes[other], `${other} still not turned after an edit`);
    await page.eval(() => window.Silinx.active.ttEditor.undo());
    await open(one);
    assert.equal(await pose(sel), turned, `${one} still turned`);
    for (const k of [one, other]) { await open(k); await page.eval((t) => document.querySelector(`${t} .tt-k3d-on`).click(), T); }
  }
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

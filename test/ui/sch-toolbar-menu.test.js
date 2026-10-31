// UI (#2208, #2209): the schematic toolbar's menu (Rearrange Wires, Rearrange Schematic, Curved wires, Hop-overs), its
// button always at the right of the first line, whatever wraps; no Symbol Info button; Mirror Vertical, the symbols and
// the I/O markers flipped as seen on the sheet, whatever their turn.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { symbolDef, xform } from '../../core/schdoc-symbols.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const MORE = `${ED} .se-btn[data-act=more]`;

function design() {
  const doc = newDoc('flip', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'and2', x: 200, y: 100, rot: 0, mirror: false, name: 'U1', params: {} },
    { id: 'S2', type: 'and2', x: 500, y: 100, rot: 90, mirror: false, name: 'U2', params: {} });
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 400, side: 'N' }, { id: 'P2', name: 'b', dir: 'in', width: 1, x: 300, y: 400 });
  return doc;
}
async function open(page, name) {
  await makeProject(env, { name, files: { 'src/flip.sch.json': JSON.stringify(design()) } });
  await page.openProject(name);
  await page.eval(() => window.SilinxApp.openSch('src/flip.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
}
const menuOpen = (page) => page.eval((ed) => !document.querySelector(`${ed} .se-more-menu`).hidden && !!document.querySelector(`${ed} .se-more-menu`).getClientRects().length, ED);
const getDoc = (page) => page.eval(() => window.Silinx.active.schEditor.getDoc());

uiTest('#2208 schematic toolbar: the menu at the right of the first line holds the four operations; no Symbol Info button; in Portuguese', E, async (page) => {
  await open(page, 'MenuPj');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-toolbar [data-act=info]`), ED), null);
  assert.deepEqual(await page.eval((ed) => [...document.querySelector(`${ed} .se-more-menu`).querySelectorAll('button, label')].map((e) => e.textContent.trim()), ED),
    ['Rearrange Wires', 'Rearrange Schematic', 'Curved wires', 'Hop-overs']);
  // first line, right edge: also with the toolbar so narrow that it wraps
  const place = () => page.eval((ed) => {
    const tb = document.querySelector(`${ed} .se-toolbar`), r = tb.getBoundingClientRect(), b = document.querySelector(`${ed} .se-btn[data-act=more]`).getBoundingClientRect();
    const first = document.querySelector(`${ed} .se-btn[data-act=select]`).getBoundingClientRect();
    const others = [...tb.children].filter((e) => !e.classList.contains('se-more') && e.getClientRects().length).map((e) => e.getBoundingClientRect());
    return { firstLine: Math.abs(b.top - first.top) <= 3, atRight: r.right - b.right <= 10, wraps: first.top + first.height < Math.max(...others.map((o) => o.top)), clear: others.every((o) => o.right <= b.left || o.top >= b.bottom) };
  }, ED);
  assert.deepEqual(await place(), { firstLine: true, atRight: true, wraps: (await place()).wraps, clear: true });
  await page.eval((ed) => { document.querySelector(`${ed} .se-toolbar`).style.width = '300px'; }, ED);
  const narrow = await place();
  assert.equal(narrow.wraps, true, 'wrapped');
  assert.equal(narrow.firstLine && narrow.atRight && narrow.clear, true, JSON.stringify(narrow));
  await page.eval((ed) => { document.querySelector(`${ed} .se-toolbar`).style.width = ''; }, ED);
  // closed at first; a tick box leaves it open; the button, a click elsewhere and Esc close it
  assert.equal(await menuOpen(page), false);
  await page.click(MORE);
  assert.equal(await menuOpen(page), true);
  await page.click(`${ED} .se-hops input`);
  assert.equal(await menuOpen(page), true, 'still open');
  await page.click(`${ED} .se-hops input`);
  await page.click(MORE);
  assert.equal(await menuOpen(page), false);
  await page.click(MORE);
  await page.click(`${ED} .se-svg`);
  assert.equal(await menuOpen(page), false, 'a click elsewhere');
  await page.click(MORE);
  await page.key('Escape');
  assert.equal(await menuOpen(page), false, 'Esc');
  // a command closes it
  await page.click(MORE);
  await page.click(`${ED} [data-act=rewire]`);
  assert.equal(await menuOpen(page), false, 'Rearrange Wires');
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((b) => document.querySelector(b)?.title === 'Fios e disposição', [MORE], { what: 'Portuguese' });
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-act=mirrorv]`).title, ED), 'Espelhar na vertical');
    assert.equal(await page.eval((ed) => document.querySelector(`${ed} [data-act=mirror]`).title, ED), 'Espelhar na horizontal (Ctrl+M)');
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});

// a symbol's pins on the sheet, as core draws them
const pins = (s) => { const def = symbolDef(s); return def.pins.map((p) => xform(s, def, p.x, p.y)); };
const reflect = (s, pts, axis) => { const def = symbolDef(s), turned = s.rot % 180 !== 0, w = turned ? def.h : def.w, h = turned ? def.w : def.h;
  return pts.map((p) => (axis === 'y' ? { x: p.x, y: 2 * s.y + h - p.y } : { x: 2 * s.x + w - p.x, y: p.y })); };

uiTest('#2209 schematic: Mirror Vertical and Mirror Horizontal flip a symbol as seen on the sheet, turned or not; the markers above and below change sides', E, async (page) => {
  await open(page, 'FlipPj');
  const btn = (a) => `${ED} .se-btn[data-act=${a}]`;
  assert.equal(await page.eval((b) => document.querySelector(b).disabled, btn('mirrorv')), true, 'nothing selected');
  for (const id of ['S1', 'S2']) {
    await page.click(`${ED} svg .sym[data-id="${id}"] .hitbox`);
    await page.waitFor((b) => !document.querySelector(b).disabled, [btn('mirrorv')], { what: 'enabled' });
    for (const [act, axis] of [['mirrorv', 'y'], ['mirror', 'x']]) {
      const s0 = (await getDoc(page)).symbols.find((s) => s.id === id);
      await page.click(btn(act));
      await page.waitFor((i, m) => window.Silinx.active.schEditor.getDoc().symbols.find((s) => s.id === i).mirror === m, [id, !s0.mirror], { what: 'flipped' });
      const s1 = (await getDoc(page)).symbols.find((s) => s.id === id);
      assert.deepEqual([s1.x, s1.y], [s0.x, s0.y], 'in its place');
      assert.deepEqual(pins(s1), reflect(s0, pins(s0), axis), `${id} ${act}`);
    }
  }
  // the markers: N <-> S with Mirror Vertical, W stays
  await page.click(`${ED} g.port[data-id="P1"] .iomark`);
  await page.waitFor((b) => !document.querySelector(b).disabled, [btn('mirrorv')], { what: 'marker selected' });
  await page.click(btn('mirrorv'));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().ports[0].side === 'S', [], { what: 'S' });
  await page.click(`${ED} g.port[data-id="P2"] .iomark`);
  const before2 = (await getDoc(page)).ports[1].side;
  await page.click(btn('mirrorv'));
  assert.equal((await getDoc(page)).ports[1].side, before2, 'W stays');
});

uiTest('#2208 #2209 a read-only schematic: Curved wires and Hop-overs in the menu, no Rearrange, no Mirror Vertical', E, async (page) => {
  await makeProject(env, { name: 'RoMenu', files: { 'src/flip.sch.json': JSON.stringify(design()) } });
  await page.openProject('RoMenu');
  const shown = await page.eval(async () => {
    const { mountSchEditor } = await import('/js/sch-editor.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:500px';
    document.body.append(host);
    const ed = mountSchEditor(host, { readOnly: true });
    host.querySelector('.se-btn[data-act=more]').click();
    const vis = (s) => !!host.querySelector(s).getClientRects().length;
    const r = ['.se-btn[data-act=more]', '.se-curved', '.se-hops', '[data-act=rewire]', '[data-act=relayout]', '[data-act=mirrorv]'].map(vis);
    host.querySelector('.se-btn[data-act=more]').click();
    ed.destroy(); host.remove();
    return r;
  });
  assert.deepEqual(shown, [true, true, true, false, false, false]);
});

uiTest('#2228 schematic: Select whole branch selects the whole network of wires of the signal; its properties, Delete and a segment drag', E, async (page) => {
  const doc = newDoc('network', 'vhdl');
  doc.wires.push({ id: 'W1', points: [{ x: 100, y: 100 }, { x: 300, y: 100 }] }, { id: 'W2', points: [{ x: 300, y: 100 }, { x: 500, y: 100 }] },
    { id: 'W3', points: [{ x: 300, y: 100 }, { x: 300, y: 300 }, { x: 500, y: 300 }] }, { id: 'W4', points: [{ x: 100, y: 500 }, { x: 300, y: 500 }] });
  await makeProject(env, { name: 'NetworkPj', files: { 'src/n.sch.json': JSON.stringify(doc) } });
  await page.openProject('NetworkPj');
  await page.eval(() => window.SilinxApp.openSch('src/n.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg g.wire[data-id="W1"]`), [ED], { what: 'drawn' });
  await page.eval(() => localStorage.removeItem('xl.sch.branch'));
  await page.click(`${ED} .se-btn[data-act=fit]`);
  const selected = () => page.eval((ed) => [...document.querySelectorAll(`${ed} svg g.wire.sel`)].map((g) => g.dataset.id).sort(), ED);
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg g.wire`); const q = l.ownerSVGElement.createSVGPoint(); q.x = px; q.y = py; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, x, y);
  const clickAt = async (x, y) => { const p = await at(x, y); await page.mouse('mouseMoved', p.x, p.y); await page.mouse('mousePressed', p.x, p.y); await page.mouse('mouseReleased', p.x, p.y); };
  // a click: the three wires of the junction, the other signal not; the properties, the wire's
  await clickAt(200, 100);
  assert.deepEqual(await selected(), ['W1', 'W2', 'W3']);
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .se-ptitle`).textContent, ED), /^Wire · net /);
  await clickAt(200, 500);
  assert.deepEqual(await selected(), ['W4']);
  // a drag: the segment under the pointer, the network still selected
  await clickAt(400, 200 + 100);
  assert.deepEqual(await selected(), ['W1', 'W2', 'W3']);
  const a = await at(400, 300), b = await at(400, 340);
  await page.mouse('mouseMoved', a.x, a.y); await page.mouse('mousePressed', a.x, a.y); await page.mouse('mouseMoved', b.x, b.y); await page.mouse('mouseReleased', b.x, b.y);
  const after = await getDoc(page);
  assert.deepEqual(after.wires.find((w) => w.id === 'W1').points, [{ x: 100, y: 100 }, { x: 300, y: 100 }]);
  assert.ok(after.wires.find((w) => w.id === 'W3').points.some((p) => p.x === 500 && p.y === 340), 'the segment moved');
  assert.deepEqual(await selected(), ['W1', 'W2', 'W3']);
  await page.click(`${ED} [data-act=undo]`);
  // Delete: the network; the other signal stays
  await clickAt(200, 100);
  await page.key('Delete');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 1, [], { what: 'deleted' });
  assert.equal((await getDoc(page)).wires[0].id, 'W4');
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 4, [], { what: 'undone' });
  // not ticked: the one wire
  await page.click(`${ED} .se-branch input`);
  await clickAt(200, 100);
  assert.equal((await page.eval((ed) => document.querySelectorAll(`${ed} svg g.wire .segsel`).length, ED)), 1);
  await page.click(`${ED} .se-branch input`);
});

uiTest('#2211 schematic: Select whole branch beside Keep connections: ticked, the whole wire; not ticked, the segment clicked, moved and deleted alone; remembered; in Portuguese', E, async (page) => {
  const doc = newDoc('branch', 'vhdl');
  doc.wires.push({ id: 'W1', points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 500, y: 300 }] });
  await makeProject(env, { name: 'BranchPj', files: { 'src/b.sch.json': JSON.stringify(doc) } });
  await page.openProject('BranchPj');
  await page.eval(() => window.SilinxApp.openSch('src/b.sch.json'));
  await page.waitFor((ed) => document.querySelector(`${ed} svg g.wire[data-id="W1"]`), [ED], { what: 'drawn' });
  await page.eval(() => localStorage.removeItem('xl.sch.branch'));
  const BOX = `${ED} .se-branch input`;
  const look = () => page.eval((ed) => { const g = document.querySelector(`${ed} svg g.wire[data-id="W1"]`); return { sel: g.classList.contains('sel'), seg: g.querySelector('.segsel')?.getAttribute('points') ?? null }; }, ED);
  // a sheet point on the screen
  const at = (x, y) => page.eval((ed, px, py) => { const l = document.querySelector(`${ed} svg g.wire`); const q = l.ownerSVGElement.createSVGPoint(); q.x = px; q.y = py; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, x, y);
  const clickAt = async (x, y) => { const p = await at(x, y); await page.mouse('mouseMoved', p.x, p.y); await page.mouse('mousePressed', p.x, p.y); await page.mouse('mouseReleased', p.x, p.y); };
  // beside Keep connections, ticked by default: the whole wire
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-keep`).nextElementSibling.textContent.trim(), ED), 'Select whole branch');
  assert.equal(await page.eval((b) => document.querySelector(b).checked, BOX), true);
  await page.click(`${ED} .se-btn[data-act=fit]`);
  await clickAt(200, 100);
  assert.deepEqual(await look(), { sel: true, seg: null });
  await page.click(`${ED} .se-svg`);
  // not ticked: the segment clicked; another of the same wire
  await page.click(BOX);
  assert.equal(await page.eval(() => localStorage.getItem('xl.sch.branch')), '0');
  await clickAt(200, 100);
  assert.deepEqual(await look(), { sel: false, seg: '100,100 300,100' });
  await clickAt(300, 200);
  assert.deepEqual(await look(), { sel: false, seg: '300,100 300,300' });
  // deleted: that segment only, the sides kept; undone
  await page.key('Delete');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 2, [], { what: 'split' });
  assert.deepEqual((await getDoc(page)).wires.map((w) => w.points), [[{ x: 100, y: 100 }, { x: 300, y: 100 }], [{ x: 300, y: 300 }, { x: 500, y: 300 }]]);
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 1, [], { what: 'undone' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await page.waitFor((ed) => document.querySelector(`${ed} .se-branch`)?.textContent.trim() === 'Selecionar todo o ramo', [ED], { what: 'Portuguese' });
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  // ticked again: the whole wire
  await page.click(BOX);
  await clickAt(200, 100);
  assert.deepEqual(await look(), { sel: true, seg: null });
});

// UI (#1052): with Add Wire, a wire drawn as a freehand stroke. Traced along a curve from U1's output to U2's input
// (by the mouse, a finger and a pen) it becomes a wire between the two pins routed square by the wire router
// (core/schpath.js routePath: the reference), the stroke's shape dropped; shown as an ink trail while drawn. A stroke
// lifted on empty space does nothing; a click still starts a wire drawn corner by corner. In the Tasks interface too,
// its hint in Portuguese. The netlist's warnings and the console's asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';
import { newDoc, netlist } from '../../core/schdoc.js';
import { routePath, wireGrid, wireClashes } from '../../core/schpath.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };   // (the Tasks interface: a development build's only, #838)

const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const P = (x, y) => ({ x, y });
const nets = nl => nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')).filter(s => s.includes(' ')).sort();
const messages = nl => nl.diagnostics.map(d => `${d.severity}: ${d.message}`);
const warnings = page => page.console.filter(m => /^warn/.test(m.type)).map(m => m.text);

// U1 at (100, 90): I (100, 100), O (160, 100); U2 at (300, 190): I (300, 200), O (360, 200); a -> U1, U2 -> y
function design() {
  const doc = newDoc('stroke', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 100, 90), inv('S2', 'U2', 300, 190));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 420, y: 200 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(100, 100)] }, { id: 'W2', points: [P(360, 200), P(420, 200)] });
  return doc;
}
// a curve from a to b (sheet points): a wave across the straight line, n steps
const curve = (a, b, n = 16) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, s = Math.sin(t * Math.PI * 2) * 40;
  return P(a.x + (b.x - a.x) * t - s * 0.3, a.y + (b.y - a.y) * t + s);
});

async function open(page, name) {
  await makeProject(env, { name, files: { 'src/stroke.sch.json': JSON.stringify(design()) } });
  await page.openProject(name);
  await page.eval(() => window.SilinxApp.openSch('src/stroke.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  await page.click(`${ED} .se-btn[data-act=wire]`);
}
// the screen point of a sheet point
const at = (page, p) => page.eval((ed, x, y) => { const l = document.querySelector(`${ed} svg .sym`); const q = l.ownerSVGElement.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, p.x, p.y);
const getDoc = page => page.eval(() => window.Silinx.active.schEditor.getDoc());
const ink = page => page.eval((ed) => !!document.querySelector(`${ed} svg .wire-ink`), ED);
const preview = page => page.eval((ed) => !!document.querySelector(`${ed} svg .wire-preview`), ED);

// a stroke through the sheet points `pts`: by 'mouse', 'pen' (CDP mouse events of pointerType pen) or 'touch' (CDP
// touch events); midway (after `mid` points) `during` is called, the pointer still down
async function stroke(page, how, pts, { mid = 0, during } = {}) {
  const s = [];
  for (const p of pts) s.push(await at(page, p));
  const pen = (type, q, extra = {}) => page.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: 'left', clickCount: 1, pointerType: 'pen', ...extra });
  const touch = (type, q) => page.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q.x, y: q.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] : [] });
  const down = { mouse: (q) => page.mouse('mousePressed', q.x, q.y), pen: (q) => pen('mousePressed', q, { buttons: 1 }), touch: (q) => touch('touchStart', q) }[how];
  const move = { mouse: (q) => page.mouse('mouseMoved', q.x, q.y, { buttons: 1, button: 'left' }), pen: (q) => pen('mouseMoved', q, { buttons: 1 }), touch: (q) => touch('touchMove', q) }[how];
  const up = { mouse: (q) => page.mouse('mouseReleased', q.x, q.y), pen: (q) => pen('mouseReleased', q, { buttons: 0 }), touch: () => touch('touchEnd') }[how];
  if (how === 'mouse') await page.mouse('mouseMoved', s[0].x, s[0].y);
  if (how === 'pen') await pen('mouseMoved', s[0], { button: 'none', buttons: 0 });
  await down(s[0]);
  for (let i = 1; i < s.length; i++) { await move(s[i]); if (i === mid && during) await during(); }
  await up(s.at(-1));
}

// the stroke from U1.O to U2.I, the wire it makes checked against the router's; undone, the design as it was
async function strokeBetweenPins(page, how) {
  const d0 = await getDoc(page);
  const want = routePath(wireGrid(d0), P(160, 100), P(300, 200));
  assert.ok(want && want.length >= 3, `the router's path: ${JSON.stringify(want)}`);
  await stroke(page, how, curve(P(160, 100), P(300, 200)), {
    mid: 8, during: async () => {
      assert.equal(await ink(page), true, `${how}: the ink trail shown while drawing`);
      assert.equal(await preview(page), false, `${how}: no corner-by-corner preview`);
    },
  });
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 3, [], { what: `${how}: the wire made` });
  const d = await getDoc(page);
  assert.deepEqual(d.wires.at(-1).points, want, `${how}: routed square between the pins, the stroke dropped`);
  assert.ok(d.wires.at(-1).points.every((p, i, a) => !i || p.x === a[i - 1].x || p.y === a[i - 1].y), 'orthogonal');
  assert.deepEqual(wireClashes(d), []);
  const nl = netlist(d);
  assert.deepEqual(nets(nl), ['S1.I port:P1', 'S1.O S2.I', 'S2.O port:P2']);
  assert.deepEqual(messages(nl), [], 'no warnings');
  assert.equal(await ink(page), false, `${how}: the ink trail gone`);
  assert.equal(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .sch-editor svg .wire-preview')), false, `${how}: no wire left being drawn`);
  // one undo: the design as it was
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 2, [], { what: `${how}: undone` });
}

uiTest('#1052 schematic: a curved stroke by the mouse between two pins becomes a routed wire; lifted on empty space it does nothing; a click still draws corner by corner', E, async (page) => {
  await open(page, 'StrokeMouse');
  await strokeBetweenPins(page, 'mouse');

  // lifted on empty space (no pin, marker or wire): nothing drawn, no wire left being drawn
  const d0 = await getDoc(page);
  await stroke(page, 'mouse', curve(P(160, 100), P(240, 300)));
  assert.equal(await ink(page), false);
  assert.equal(await preview(page), false, 'no wire being drawn');
  assert.deepEqual(await getDoc(page), d0, 'the drawing unchanged');
  // a stroke back to where it started: nothing either
  await stroke(page, 'mouse', [...curve(P(160, 100), P(220, 160), 8), ...curve(P(220, 160), P(160, 100), 8).slice(1)]);
  assert.deepEqual(await getDoc(page), d0, 'the drawing unchanged');

  // clicks: from U1.O, a bend at (230, 100), ended on U2.I: the wire drawn corner by corner, as before
  for (const p of [P(160, 100), P(230, 100)]) await page.click(await at(page, p));
  assert.equal(await preview(page), true, 'a wire being drawn by clicks');
  await page.click(await at(page, P(300, 200)));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 3, [], { what: 'the wire clicked' });
  const d = await getDoc(page);
  assert.deepEqual(d.wires.at(-1).points, [P(160, 100), P(230, 100), P(230, 200), P(300, 200)]);
  assert.deepEqual(messages(netlist(d)), []);
  assert.deepEqual(warnings(page), []);
});

uiTest('#1052 schematic: a curved stroke by a finger and by a pen between two pins becomes a routed wire; a second finger drops it', E, async (page) => {
  await open(page, 'StrokeTouch');
  await page.eval((ed) => { window.__types = new Set(); document.querySelector(`${ed} svg .sym`).ownerSVGElement.addEventListener('pointerdown', (e) => window.__types.add(e.pointerType)); }, ED);
  await strokeBetweenPins(page, 'touch');
  await strokeBetweenPins(page, 'pen');
  assert.deepEqual(await page.eval(() => [...window.__types].sort()), ['pen', 'touch'], 'a finger\'s and a pen\'s pointer events on the sheet');
  // a second finger midway: pan and zoom (#674), the stroke dropped
  const d0 = await getDoc(page);
  const a = await at(page, P(160, 100)), b = await at(page, P(300, 200));
  await page.touchGesture([[a, b], [{ x: a.x + 120, y: a.y - 60 }, { x: b.x + 140, y: b.y - 40 }]]);
  await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.deepEqual((await getDoc(page)).wires, d0.wires, 'nothing drawn');
  assert.equal(await ink(page), false);
  assert.equal(await preview(page), false);
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

uiTest('#1052 Tasks ▸ Design: a stroke by a finger between two pins becomes a routed wire; the Add Wire hint in Portuguese', E, async (page) => {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await open(page, 'StrokeTasks');
  await page.hover(await at(page, P(230, 300)));
  await page.waitFor((ed) => document.querySelector(`${ed} .hint`)?.textContent.startsWith('Adicionar Fio: clique para começar'), [ED], { what: 'the hint in Portuguese' });
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .hint`).textContent, ED), /ou desenhe um traço de um pino\/fio até outro\. Esc termina o fio\.$/);
  await strokeBetweenPins(page, 'touch');
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });

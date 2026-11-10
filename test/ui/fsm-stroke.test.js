// UI (#3286): in the state diagram editor a transition drawn as a stroke takes its shape. Started on a state's rim, by
// the mouse, a pen (pointerType pen) and a finger: a bow from A to B gives the arc its bend (the stroke along the
// editor's arc of bend 60: 60 again), a straight stroke a straight arc (no bend: the default), a stroke out of B and
// back into it a self-loop at the stroke's farthest point (up: −90°), shown as the drawn path while drawn; a press on
// the rim lifted without leaving the state makes nothing; a second finger midway (#674) drops the stroke. One undo
// takes a transition away. No console warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';
import { normalizeFsm } from '../../core/fsm.js';
import { arcPoints } from '../../core/fsm-stroke.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .fsm-editor';
const warnings = (page) => page.console.filter((m) => /^warn/.test(m.type)).map((m) => m.text);

const STATES = { a: { x: 100, y: 100 }, b: { x: 340, y: 160 }, c: { x: 100, y: 330 } };
async function open(page, name) {
  const m = normalizeFsm({
    name: 'strk', type: 'moore', inputs: [{ name: 'x', width: 1 }], outputs: [],
    states: Object.entries(STATES).map(([id, p]) => ({ id, name: id.toUpperCase(), ...p })), transitions: [], initial: 'a',
  });
  await makeProject(env, { name, files: { 'src/strk.fsm.json': JSON.stringify(m, null, 2) } });
  await page.openProject(name);
  await page.eval(() => window.SilinxApp.openFsm('src/strk.fsm.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} [data-state]`).length === 3, [ED], { what: 'FSM editor' });
  await new Promise((r) => setTimeout(r, 300));   // (the fit when it opened)
}
const model = (page) => page.eval(() => window.Silinx.active.fsmEditor.getModel());
const radius = (page) => page.eval((ed) => Number(document.querySelector(`${ed} [data-state=a] .fsm-circle`).getAttribute('r')), ED);
// the screen points of diagram points
const screen = (page, pts) => page.eval((ed, ps) => {
  const m = document.querySelector(`${ed} .fsm-states`).getScreenCTM();
  return ps.map((p) => ({ x: p.x * m.a + m.e, y: p.y * m.d + m.f }));
}, ED, pts);
const preview = (page) => page.eval((ed) => document.querySelector(`${ed} .fsm-overlay .asm-edge-temp`)?.getAttribute('d') ?? null, ED);

// a stroke through the diagram points `pts`: by 'mouse', 'pen' (CDP mouse events of pointerType pen) or 'touch'; midway
// (after `mid` points) `during` is called, the pointer still down
async function stroke(page, how, pts, { mid = 0, during } = {}) {
  const s = await screen(page, pts);
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
// a point at distance d from a state's centre, at this angle (degrees)
const polar = (s, d, deg) => ({ x: s.x + d * Math.cos(deg * Math.PI / 180), y: s.y + d * Math.sin(deg * Math.PI / 180) });
// the stroke along the editor's arc of this bend from p to q, started just inside p's rim and ended inside q
const bow = (r, p, q, bend) => arcPoints(p, q, bend, { ra: r - 3, rb: r - 10, n: 24 });
// a stroke out of s and back into it: from its rim at deg − 25, out to 2.2 r at deg, back to its rim at deg + 25
function loopStroke(r, s, deg) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(polar(s, r - 3 + (2.2 * r - (r - 3)) * Math.sin(t * Math.PI), deg - 25 + 50 * t));
  }
  return pts;
}
const added = async (page, n, what) => {
  await page.waitFor((k) => window.Silinx.active.fsmEditor.getModel().transitions.length === k, [n], { what });
  await page.key('Escape');   // (the condition's inline editor, opened on the new transition)
  return (await model(page)).transitions.at(-1);
};

// a curved transition A → B, a straight one A → C, a self-loop on B, drawn by `how`; then undone
async function drawAll(page, how) {
  const r = await radius(page);
  const n0 = (await model(page)).transitions.length;
  const { a, b, c } = STATES;
  await stroke(page, how, bow(r, a, b, 60), {
    mid: 12, during: async () => {
      const d = await preview(page);
      assert.ok(d && d.split('L').length > 8, `${how}: the preview is the drawn path: ${d}`);
    },
  });
  const t1 = await added(page, n0 + 1, `${how}: the curved transition`);
  assert.deepEqual([t1.from, t1.to], ['a', 'b']);
  assert.ok(Math.abs(t1.bend - 60) <= 2, `${how}: the bend of the stroke: ${t1.bend}`);
  assert.equal(t1.angle, undefined);
  assert.equal(await preview(page), null, `${how}: no preview left`);

  await stroke(page, how, bow(r, a, c, 0));
  const t2 = await added(page, n0 + 2, `${how}: the straight transition`);
  assert.deepEqual([t2.from, t2.to, t2.bend, t2.angle], ['a', 'c', undefined, undefined], `${how}: a straight arc`);

  await stroke(page, how, loopStroke(r, b, -90));
  const t3 = await added(page, n0 + 3, `${how}: the self-loop`);
  assert.deepEqual([t3.from, t3.to, t3.bend], ['b', 'b', undefined]);
  assert.ok(Math.abs(t3.angle + 90) <= 5, `${how}: the self-loop's angle: ${t3.angle}`);
  // the self-loop drawn where the stroke went: its arc's apex above B
  const top = await page.eval((ed, id) => { const e = document.querySelector(`${ed} [data-trans="${id}"] .fsm-edge-line`).getBBox(); return { x: e.x + e.width / 2, y: e.y }; }, ED, t3.id);
  assert.ok(Math.abs(top.x - b.x) < 6 && top.y < b.y - 1.5 * r, `${how}: the loop above B: ${JSON.stringify(top)}`);

  // a press on B's rim lifted inside B, never out of it: nothing
  await stroke(page, how, [polar(b, r - 3, 0), polar(b, r - 1, 30), polar(b, r - 6, 60)]);
  await new Promise((res) => setTimeout(res, 150));
  assert.equal((await model(page)).transitions.length, n0 + 3, `${how}: no transition from a stroke that stayed in its state`);

  // one undo per transition
  for (let k = 3; k >= 1; k--) {
    await page.click('#toolbar [data-cmd=undo]');
    await page.waitFor((n) => window.Silinx.active.fsmEditor.getModel().transitions.length === n, [n0 + k - 1], { what: `${how}: undone` });
  }
}

uiTest('#3286 FSM editor: a transition drawn by the mouse takes the stroke\'s shape (a bend, a straight arc, a self-loop)', E, async (page) => {
  await open(page, 'FsmStrokeMouse');
  await drawAll(page, 'mouse');
  assert.deepEqual(warnings(page), []);
});

uiTest('#3286 FSM editor: a transition drawn by a pen and by a finger takes the stroke\'s shape; a second finger drops it', E, async (page) => {
  await open(page, 'FsmStrokePen');
  await page.eval((ed) => { window.__types = new Set(); document.querySelector(`${ed} .fsm-states`).ownerSVGElement.addEventListener('pointerdown', (e) => window.__types.add(e.pointerType)); }, ED);
  await drawAll(page, 'pen');
  await drawAll(page, 'touch');
  assert.deepEqual(await page.eval(() => [...window.__types].sort()), ['pen', 'touch'], 'a pen\'s and a finger\'s pointer events on the diagram');
  // a second finger midway (#674): the view panned and zoomed, the stroke dropped
  const r = await radius(page);
  const [p, q] = await screen(page, [polar(STATES.a, r - 3, 15), STATES.b]);
  await page.touchGesture([[p, q], [{ x: p.x + 120, y: p.y + 160 }, { x: q.x + 140, y: q.y + 200 }]]);
  await page.eval(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  assert.deepEqual((await model(page)).transitions, [], 'nothing drawn');
  assert.equal(await preview(page), null);
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

// UI (#1144): Curved wires (hopping where they cross, #1163). The toolbar's checkbox draws the schematic's wires as smooth curves (core/schcurve.js
// curveD: the reference), saved with it and undone by Undo; the selected wire's handles dragged (the mouse, a finger),
// its curve grabbed and pulled, a handle removed by a double click, Reset curve; a wire drawn by clicks through the
// points clicked, by a stroke of any shape keeping it, its rectilinear path routed between its ends (core/schpath.js
// routePath: the reference); the connections, the netlist (no warnings) and the HDL the same either way; unticked:
// the technical drawing again, the curves kept; printed as drawn; the label, its tooltip and the hints in Portuguese;
// in the Tasks interface too. The console's warnings asserted.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly, waitDownload } from './harness.js';
import { newDoc, netlist, generateHdl } from '../../core/schdoc.js';
import { routePath, wireGrid } from '../../core/schpath.js';
import { curveD, curveAbs, curveKnots, curvePointAt, sampleCurve, curveCrossings, curveHopD } from '../../core/schcurve.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
// the toolbar's menu opened (#2208), if it is not
const openMenu = (page) => page.eval((ed) => { const b = document.querySelector(`${ed} .se-btn[data-act=more]`); if (b.getAttribute('aria-expanded') !== 'true') b.click(); }, ED);
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };   // (the Tasks interface: a development build's only, #838)

const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const P = (x, y) => ({ x, y });
const nets = nl => nl.nets.map(n => n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')).filter(s => s.includes(' ')).sort();
const messages = nl => nl.diagnostics.map(d => `${d.severity}: ${d.message}`);
const warnings = page => page.console.filter(m => /^warn/.test(m.type)).map(m => m.text);

// U1 at (80, 90): I (80, 100), O (160, 100); U2 at (280, 190): I (280, 200), O (360, 200); U3 at (280, 390): I (280,
// 400), O (360, 400). a -> U1 -> (W3, square) -> U2 -> y; b and z free, U3 free
function design() {
  const doc = newDoc('curved', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 80, 90), inv('S2', 'U2', 280, 190), inv('S3', 'U3', 280, 390));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 420, y: 200 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 60, y: 300 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 480, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(360, 200), P(420, 200)] },
    { id: 'W3', points: [P(160, 100), P(230, 100), P(230, 200), P(280, 200)] });
  return doc;
}
const NETS0 = ['S1.I port:P1', 'S1.O S2.I', 'S2.O port:P2'];

async function open(page, name) {
  await makeProject(env, { name, files: { 'src/curved.sch.json': JSON.stringify(design()) } });
  await page.openProject(name);
  await page.eval(() => window.SilinxApp.openSch('src/curved.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'drawn' });
}
// the screen point of a sheet point
const at = (page, p) => page.eval((ed, x, y) => { const l = document.querySelector(`${ed} svg .sym`); const q = l.ownerSVGElement.createSVGPoint(); q.x = x; q.y = y; const r = q.matrixTransform(l.getScreenCTM()); return { x: r.x, y: r.y }; }, ED, p.x, p.y);
const getDoc = page => page.eval(() => window.Silinx.active.schEditor.getDoc());
// the wires as drawn: [id, 'poly' | the path's d]
const drawn = page => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .wire`)].map((g) => { const l = g.querySelector('.wline'); return [g.dataset.id, l.tagName === 'polyline' ? 'poly' : l.getAttribute('d')]; }), ED);
const handles = page => page.eval((ed) => [...document.querySelectorAll(`${ed} svg .chandle .cdot`)].map((c) => ({ x: +c.getAttribute("cx"), y: +c.getAttribute("cy") })), ED);
const box = page => page.eval((ed) => document.querySelector(`${ed} .se-curved input`).checked, ED);
const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
const near = (a, b, tol = 1.5) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

// a stroke through the sheet points `pts` by the mouse or a finger (CDP)
async function stroke(page, how, pts) {
  const s = [];
  for (const p of pts) s.push(await at(page, p));
  const touch = (type, q) => page.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q.x, y: q.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] : [] });
  if (how === 'mouse') {
    await page.mouse('mouseMoved', s[0].x, s[0].y);
    await page.mouse('mousePressed', s[0].x, s[0].y);
    for (const q of s.slice(1)) await page.mouse('mouseMoved', q.x, q.y, { buttons: 1, button: 'left' });
    await page.mouse('mouseReleased', s.at(-1).x, s.at(-1).y);
  } else {
    await touch('touchStart', s[0]);
    for (const q of s.slice(1)) await touch('touchMove', q);
    await touch('touchEnd');
  }
}
// a finger dragging from a to b (screen points) as one places a thing: moved, stopped on b a moment, lifted (a finger
// lifted while moving makes a fling, and Chrome drops the click of a tap that comes while it runs, the tap taken for
// stopping it)
async function fingerDrag(page, a, b, steps = 8) {
  const touch = (type, q) => page.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q.x, y: q.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] : [] });
  await touch('touchStart', a);
  for (let i = 1; i <= steps; i++) await touch('touchMove', { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps });
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));
  await touch('touchMove', { x: b.x + 0.5, y: b.y });
  await touch('touchEnd');
}
// a wave from a to b (sheet points), n steps
const wave = (a, b, n = 16, amp = 40) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, s = Math.sin(t * Math.PI * 2) * amp;
  return P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + s);
});

// Curved wires ticked (by a click or a tap): the schematic's style, every wire a curve as core/schcurve.js draws it
async function tick(page, how = 'click') {
  await openMenu(page);
  await page[how](`${ED} .se-curved input`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wireStyle === 'curved', [], { what: 'curved' });
  const d = await getDoc(page);
  assert.deepEqual(await drawn(page), d.wires.map(w => [w.id, curveD(w)]), 'every wire drawn as its curve');
  assert.equal(await box(page), true);
}
// a wire drawn by a stroke between two points: its rectilinear path the router's, its curve through the stroke
async function strokeWire(page, how, from, to) {
  const d0 = await getDoc(page);
  const want = routePath(wireGrid(d0), from, to);
  const ink = wave(from, to);
  // (both ends on the canvas, not under a panel)
  for (const p of [from, to]) {
    const q = await at(page, p);
    assert.equal(await page.eval((ed, x, y) => !!document.elementFromPoint(x, y)?.closest(`${ed} svg`), ED, q.x, q.y), true, `${how}: ${JSON.stringify(p)} on the canvas`);
  }
  await stroke(page, how, ink);
  try {
    await page.waitFor((n) => window.Silinx.active.schEditor.getDoc().wires.length === n, [d0.wires.length + 1], { what: `${how}: the wire made` });
  } catch (e) {
    // (what the editor saw: its tool, what is under the stroke's start, its wires)
    const q = await at(page, from);
    const seen = await page.eval((ed, x, y) => ({ tool: document.querySelector(`${ed} .se-canvas, ${ed} [data-tool]`)?.dataset.tool, at: document.elementFromPoint(x, y)?.outerHTML.slice(0, 120), wires: window.Silinx.active.schEditor.getDoc().wires.map((w) => JSON.stringify(w.points)) }), ED, q.x, q.y);
    throw new Error(`${e.message}: ${JSON.stringify(seen)}`);
  }
  const w = (await getDoc(page)).wires.at(-1);
  assert.deepEqual(w.points, want, `${how}: its path routed square between its ends`);
  const K = curveAbs(w);
  assert.ok(K.length >= 2, `${how}: its own curve, the stroke's shape: ${JSON.stringify(K)}`);
  // (each knot on the stroke drawn)
  for (const k of K) assert.ok(ink.some((q, i) => i && Math.hypot(k.x - q.x, k.y - q.y) < 12), `${how}: knot ${JSON.stringify(k)} on the stroke`);
  return w;
}

uiTest('#1144 schematic: Curved wires by the mouse: ticked, handles dragged, a curve grabbed, a knot removed, wires drawn by clicks and by a stroke; the nets and HDL the same; unticked, saved, printed, in Portuguese', E, async (page) => {
  await open(page, 'CurvedMouse');
  const label = () => page.eval((ed) => { const l = document.querySelector(`${ed} .se-curved`); return [l.textContent.trim(), l.title]; }, ED);
  assert.deepEqual(await label(), ['Curved wires', 'Draw the wires as smooth curves of any shape instead of the technical drawing\'s square corners (the connections, the nets and the HDL the same)']);
  assert.equal(await box(page), false, 'the technical drawing by default');
  assert.deepEqual((await drawn(page)).map(x => x[1]), ['poly', 'poly', 'poly']);
  // ticked: W3 a curve rounding its two bends; Undo: square again; Redo: curved
  await tick(page);
  assert.match((await drawn(page))[2][1], /^M160,100 C\S+ \S+ \S+ C\S+ \S+ \S+ C\S+ \S+ 280,200$/, 'W3: three Béziers, from U1.O to U2.I');
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => !window.Silinx.active.schEditor.getDoc().wireStyle, [], { what: 'undone' });
  assert.deepEqual((await drawn(page)).map(x => x[1]), ['poly', 'poly', 'poly']);
  assert.equal(await box(page), false, 'the box follows Undo');
  await page.click(`${ED} [data-act=redo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wireStyle === 'curved', [], { what: 'redone' });
  assert.equal(await box(page), true);

  // W3 selected by a click on its curve: its two handles (the derived knots); one dragged to (200, 40)
  const w3 = (await getDoc(page)).wires.find(w => w.id === 'W3');
  await page.click(await at(page, curvePointAt(w3, 0.5)));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .chandle`).length === 2, [ED], { what: 'the handles' });
  assert.deepEqual(await handles(page), curveKnots(w3).slice(1, -1));
  await page.drag(await at(page, (await handles(page))[0]), await at(page, P(200, 40)));
  let w = (await getDoc(page)).wires.find(x => x.id === 'W3');
  assert.ok(near(curveAbs(w)[0], P(200, 40)), `the handle where it was dropped: ${JSON.stringify(curveAbs(w))}`);
  assert.deepEqual(w.points, w3.points, 'its rectilinear path the same');
  assert.equal((await drawn(page)).find(x => x[0] === 'W3')[1], curveD(w));
  // the curve grabbed between its handles and pulled to (330, 140): a third knot there
  const grab = [0.3, 0.4, 0.6, 0.7, 0.8].map(f => curvePointAt(w, f)).find(q => [...curveKnots(w)].every(k => Math.hypot(k.x - q.x, k.y - q.y) > 20));
  await page.drag(await at(page, grab), await at(page, P(330, 140)));
  w = (await getDoc(page)).wires.find(x => x.id === 'W3');
  assert.equal(curveAbs(w).length, 3);
  assert.ok(curveAbs(w).some(k => near(k, P(330, 140))), JSON.stringify(curveAbs(w)));
  assert.equal((await handles(page)).length, 3);
  // a handle double-clicked: removed
  await page.dblclick(await at(page, curveAbs(w)[0]));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find(x => x.id === 'W3').curve.length === 2, [], { what: 'a knot removed' });
  // one Undo per change: the knot back
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.find(x => x.id === 'W3').curve.length === 3, [], { what: 'undone' });
  assert.deepEqual(nets(netlist(await getDoc(page))), NETS0, 'the connections the same');
  // U2 moved down 40 (its wires kept connected): W3's curve follows its end, its knots where they were relative to it
  const wBefore = (await getDoc(page)).wires.find(x => x.id === 'W3');
  await page.drag(await at(page, P(320, 200)), await at(page, P(320, 240)));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.find(x => x.id === 'S2').y === 230, [], { what: 'U2 moved' });
  const wMoved = (await getDoc(page)).wires.find(x => x.id === 'W3');
  assert.deepEqual([wMoved.points[0], wMoved.points.at(-1)], [P(160, 100), P(280, 240)], 'W3 still from U1.O to U2.I');
  assert.deepEqual(wMoved.curve, wBefore.curve, 'its curve relative to its ends the same');
  assert.equal((await drawn(page)).find(x => x[0] === 'W3')[1], curveD(wMoved));
  assert.deepEqual(nets(netlist(await getDoc(page))), NETS0);
  await page.click(`${ED} [data-act=undo]`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.find(x => x.id === 'S2').y === 190, [], { what: 'the move undone' });

  // a wire by clicks: from b (60, 300) through (150, 360) and (250, 330) to U3.I (280, 400)
  await page.click(`${ED} .se-btn[data-act=wire]`);
  await page.hover(await at(page, P(200, 450)));
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .hint`).textContent, ED), /^Add Wire \(curved\): click to start, click to add points the curve passes through/);
  const before = await getDoc(page);
  for (const p of [P(60, 300), P(150, 360), P(250, 330)]) await page.click(await at(page, p));
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} svg path.wire-preview`)?.getAttribute('d').startsWith('M60,300 C'), ED), true, 'its curve previewed');
  await page.click(await at(page, P(280, 400)));
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wires.length === 4, [], { what: 'the wire clicked' });
  w = (await getDoc(page)).wires.at(-1);
  assert.deepEqual(curveAbs(w), [P(150, 360), P(250, 330)], 'through the points clicked');
  assert.deepEqual(w.points, routePath(wireGrid(before), P(60, 300), P(280, 400)), 'its path routed square between its ends');
  // a stroke of any shape from U3.O (360, 400) to z (480, 300)
  await strokeWire(page, 'mouse', P(360, 400), P(480, 300));
  const d = await getDoc(page);
  assert.deepEqual(nets(netlist(d)), [...NETS0, 'S3.I port:P3', 'S3.O port:P4'].sort());
  assert.deepEqual(messages(netlist(d)), [], 'no warnings');

  // the HDL of the schematic drawn with curves: as the same one in the technical drawing
  const square = { ...d, wireStyle: undefined, wires: d.wires.map(x => ({ id: x.id, points: x.points })) };
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(generateHdl(d, { lang }), generateHdl(square, { lang }), lang);

  // Reset curve (Properties): the wire's own curve dropped
  await page.click(`${ED} .se-btn[data-act=select]`);
  await page.click(await at(page, curvePointAt(d.wires.find(x => x.id === 'W3'), 0.3)));
  await page.click(`${ED} .se-props .btn`, { text: 'Reset curve' });
  await page.waitFor(() => !('curve' in window.Silinx.active.schEditor.getDoc().wires.find(x => x.id === 'W3')), [], { what: 'reset' });

  // printed as drawn: the curves in the SVG saved
  await page.menu('File', 'Print…');
  await page.waitDialog('Print — Schematic');
  await page.dialogButton('Save SVG');
  const fs = await import('node:fs/promises');
  const svg = await fs.readFile(await waitDownload(page, 'Schematic_src_curved.sch.json.svg'), 'utf8');
  const dNow = await getDoc(page);
  for (const x of dNow.wires) assert.ok(svg.includes(`d="${curveD(x)}"`), `${x.id} printed as its curve`);
  // (the page holds all of every curve, beyond its rectilinear path too)
  const [vx, vy, vw, vh] = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg).slice(1).map(Number);
  for (const x of dNow.wires) for (const p of sampleCurve(x)) assert.ok(p.x >= vx && p.y >= vy && p.x <= vx + vw && p.y <= vy + vh, `${x.id} ${JSON.stringify(p)} on the page`);
  await page.key('Escape');
  await page.waitNoDialog();

  // unticked: the technical drawing, the curves kept in the document; saved: opened again as it was left
  await openMenu(page);
  await page.click(`${ED} .se-curved input`);
  await page.waitFor(() => !window.Silinx.active.schEditor.getDoc().wireStyle, [], { what: 'rectilinear' });
  assert.deepEqual((await drawn(page)).map(x => x[1]), dNow.wires.map(() => 'poly'));
  assert.deepEqual((await getDoc(page)).wires.map(x => x.curve), dNow.wires.map(x => x.curve), 'the curves kept');
  await openMenu(page);
  await page.click(`${ED} .se-curved input`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wireStyle === 'curved', [], { what: 'curved' });
  await page.eval(() => new Promise((r) => setTimeout(r, 800)));   // (saved: the editor's change, a moment later)
  await page.eval(() => { const x = window.SilinxApp.findDoc('sch:src/curved.sch.json'); if (x) window.SilinxApp.closeDoc(x); });
  await page.waitFor((ed) => !document.querySelector(ed), [ED], { what: 'closed' });
  await page.eval(() => window.SilinxApp.openSch('src/curved.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 3, [ED], { what: 'opened again' });
  assert.deepEqual(await getDoc(page), dNow, 'saved with its style and its curves');
  assert.equal(await box(page), true);
  assert.deepEqual(await drawn(page), dNow.wires.map(x => [x.id, curveD(x)]));

  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor((ed) => document.querySelector(`${ed} .se-curved`)?.textContent.trim() === 'Fios curvos', [ED], { what: 'Portuguese' });
  assert.deepEqual(await label(), ['Fios curvos', 'Desenhar os fios como curvas suaves de qualquer forma em vez dos cantos retos do desenho técnico (as ligações, as redes e o HDL iguais)']);
  await page.hover(await at(page, P(200, 450)));
  assert.match(await page.eval((ed) => document.querySelector(`${ed} .hint`).textContent, ED), /^Fios curvos: clique num fio e arraste o fio ou as suas pegas/);
  await page.click(await at(page, curvePointAt(dNow.wires.find(x => x.id === 'W3'), 0.3)));
  await page.waitFor((ed) => document.querySelector(`${ed} .se-ptitle`)?.textContent.startsWith('Fio'), [ED], { what: 'its properties' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
});

uiTest('#1144 schematic on a tablet: Curved wires ticked by a tap, a handle dragged by a finger, a wire drawn by a finger\'s stroke', E, async (page) => {
  await open(page, 'CurvedTouch');
  await tick(page, 'tap');
  const w3 = (await getDoc(page)).wires.find(w => w.id === 'W3');
  await page.tap(await at(page, curvePointAt(w3, 0.5)));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .chandle`).length === 2, [ED], { what: 'the handles' });
  // (a finger's target: wider than the mouse's)
  assert.equal(await page.eval((ed) => +document.querySelector(`${ed} svg .chandle .chit`).getAttribute('r'), ED), 14);
  // (the events from here on, reported if a tap below is lost)
  await page.eval(() => {
    window.__ev = [];
    for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'click', 'contextmenu', 'touchstart', 'touchend', 'touchcancel']) {
      addEventListener(t, (e) => window.__ev.push(`${t}:${e.pointerType || ''}:${e.target?.tagName || e.target}:${e.target?.isConnected}:${e.defaultPrevented}:${Math.round(e.timeStamp)}`), true);
    }
  });
  await fingerDrag(page, await at(page, (await handles(page))[1]), await at(page, P(280, 260)));
  await page.waitFor(() => Array.isArray(window.Silinx.active.schEditor.getDoc().wires.find(x => x.id === 'W3').curve), [], { what: 'reshaped' });
  const w = (await getDoc(page)).wires.find(x => x.id === 'W3');
  assert.ok(near(curveAbs(w)[1], P(280, 260), 2), JSON.stringify(curveAbs(w)));
  assert.deepEqual(w.points, w3.points);
  // the handle kept under the finger while dragged (redrawn in place): its touch ended on it, not on a removed element
  const drag = (await page.eval(() => window.__ev)).map((x) => x.split(':').slice(0, 4).join(':'));
  assert.deepEqual(drag.filter((x) => /^(pointerdown|pointerup|touchstart|touchend|lostpointercapture)/.test(x)),
    ['pointerdown:touch:circle:true', 'touchstart::circle:true', 'pointerup:touch:circle:true', 'lostpointercapture:touch:circle:true', 'touchend::circle:true'], 'the drag\'s touch from its handle to its end');
  const tapped = await page.tap(`${ED} .se-btn[data-act=wire]`);
  try {
    await page.waitFor((ed) => document.querySelector(`${ed} .se-btn[data-act=wire]`).classList.contains('on'), [ED], { what: 'Add Wire by a tap' });
  } catch (e) {
    const seen = await page.eval((ed, x, y) => { const b = document.querySelector(`${ed} .se-btn[data-act=wire]`), r = b.getBoundingClientRect(); return { rect: [r.left, r.top, r.width, r.height], at: document.elementFromPoint(x, y)?.outerHTML.slice(0, 160), tool: b.closest('.sch-editor').querySelector('[data-tool]')?.dataset.tool, tb: b.parentElement.scrollWidth + '/' + b.parentElement.clientWidth, ev: window.__ev.slice(-30) }; }, ED, tapped.x, tapped.y);
    throw new Error(`${e.message}: tapped ${JSON.stringify(tapped)} ${JSON.stringify(seen)}`);
  }
  await strokeWire(page, 'touch', P(360, 400), P(480, 300));
  const d = await getDoc(page);
  assert.deepEqual(nets(netlist(d)), [...NETS0, 'S3.O port:P4'].sort());
  assert.deepEqual(messages(netlist(d)), ['warning: input pin I of U3 (inv) is not connected', "warning: I/O marker 'b' is not connected"], 'b and U3.I not wired yet: their warnings only');
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, tablet: 'landscape' });

uiTest('#1144 Tasks ▸ Design: Curved wires in Portuguese, a stroke by a finger keeps its shape', E, async (page) => {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await open(page, 'CurvedTasks');
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} .se-curved`).textContent.trim(), ED), 'Fios curvos');
  await tick(page);
  await page.click(`${ED} .se-btn[data-act=wire]`);
  await page.hover(await at(page, P(200, 450)));
  await page.waitFor((ed) => document.querySelector(`${ed} .hint`)?.textContent.startsWith('Adicionar Fio (curvo): clique para começar'), [ED], { what: 'the hint in Portuguese' });
  const sw = await strokeWire(page, 'touch', P(360, 400), P(480, 300));
  assert.deepEqual(nets(netlist(await getDoc(page))), [...NETS0, 'S3.O port:P4'].sort());
  assert.deepEqual(messages(netlist(await getDoc(page))), ['warning: input pin I of U3 (inv) is not connected', "warning: I/O marker 'b' is not connected"], 'b and U3.I not wired yet: their warnings only');
  // Try it: the curves coloured by their values; a curve hovered (where it is far from its path) shows its net's value
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((ed) => /\blv-/.test(document.querySelector(`${ed} g.wire[data-id="W3"]`)?.getAttribute('class') || ''), [ED], { what: 'W3 coloured' });
  const far = [0.2, 0.25, 0.3, 0.7, 0.75].map(f => curvePointAt(sw, f)).find(q => sw.points.every((p, i) => !i || segDist(q, sw.points[i - 1], p) > 15));
  await page.hover(await at(page, far));
  const name = netlist(await getDoc(page)).wireNet.get(sw.id).name;
  await page.waitFor((ed, n) => (document.querySelector(`${ed} .lv-tip`)?.textContent || '').startsWith(`${n} = `), [ED, name], { what: 'the hover tip on the curve' });
  await page.key('Escape');
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly, build: DEV });

uiTest('#1163 schematic: Curved wires hop where they cross (Hop-overs ticked); off, plain curves; printed as drawn; the document the same', E, async (page) => {
  // a -> y bowed up through (250, 180), crossed by b -> z straight down x = 250
  const doc = newDoc('hops', 'vhdl');
  doc.wireStyle = 'curved';
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 100, y: 200 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 200 },
    { id: 'P3', name: 'b', dir: 'in', width: 1, x: 250, y: 100 }, { id: 'P4', name: 'z', dir: 'out', width: 1, x: 250, y: 300 });
  doc.wires.push({ id: 'W1', points: [P(100, 200), P(400, 200)], curve: [{ u: 0.5, v: -20 }] }, { id: 'W2', points: [P(250, 100), P(250, 300)] });
  await makeProject(env, { name: 'CurvedHops', files: { 'src/hops.sch.json': JSON.stringify(doc) } });
  await page.openProject('CurvedHops');
  await page.eval(() => { try { localStorage.removeItem('xl.sch.hops'); } catch { /* none */ } });
  await page.eval(() => window.SilinxApp.openSch('src/hops.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .port`).length === 4, [ED], { what: 'drawn' });
  const d0 = await getDoc(page);
  const x = curveCrossings(d0);
  assert.equal(x.length, 1);
  assert.equal(x[0].wire, 'W1', 'the flatter one hops');
  const HOP = [['W1', curveHopD(d0.wires[0], [x[0].s])], ['W2', curveD(d0.wires[1])]];
  assert.match(HOP[0][1], / A5,5 0 0 1 /);
  // on by default: W1 hops over W2 (its hit area the plain curve)
  assert.deepEqual(await drawn(page), HOP);
  assert.equal(await page.eval((ed) => document.querySelector(`${ed} g.wire[data-id="W1"] .whit`).getAttribute('d'), ED), curveD(d0.wires[0]));
  // printed as drawn
  await page.menu('File', 'Print…');
  await page.waitDialog('Print — Schematic');
  await page.dialogButton('Save SVG');
  const fs = await import('node:fs/promises');
  const svg = await fs.readFile(await waitDownload(page, 'Schematic_src_hops.sch.json.svg'), 'utf8');
  assert.ok(svg.includes(`d="${HOP[0][1]}"`), 'the hop printed');
  await page.key('Escape');
  await page.waitNoDialog();
  // Hop-overs off: plain curves; on again: the hop
  await openMenu(page);
  await page.click(`${ED} .se-hops input`);
  await page.waitFor((ed) => !/ A5,5/.test(document.querySelector(`${ed} g.wire[data-id="W1"] .wline`).getAttribute('d')), [ED], { what: 'no hop' });
  assert.deepEqual(await drawn(page), d0.wires.map(w => [w.id, curveD(w)]));
  await openMenu(page);
  await page.click(`${ED} .se-hops input`);
  await page.waitFor((ed) => / A5,5/.test(document.querySelector(`${ed} g.wire[data-id="W1"] .wline`).getAttribute('d')), [ED], { what: 'the hop' });
  assert.deepEqual(await drawn(page), HOP);
  assert.deepEqual(await getDoc(page), d0, 'the document the same');
  assert.deepEqual(messages(netlist(d0)), [], 'no warnings');
  await page.eval(() => { try { localStorage.removeItem('xl.sch.hops'); } catch { /* none */ } });
  assert.deepEqual(warnings(page), []);
});

// #1175: the toolbar's Curved wires before Hop-overs; in Try it, Curved wires (how the wires are drawn) and Symbol Info
// (a symbol that is not an input selected by a click) stay enabled, the circuit still running
uiTest('#1175 Curved wires before Hop-overs; in Try it, Curved wires and Symbol Info enabled', E, async (page) => {
  await open(page, 'CurvedTry');
  const order = await page.eval((ed) => [...document.querySelector(`${ed} .se-more-menu`).children].map((e) => e.className.match(/se-(curved|hops)/)?.[1] || e.dataset.act).filter(Boolean), ED);
  assert.deepEqual(order, ['rewire', 'relayout', 'curved', 'hops']);
  await page.click(`${ED} .se-btn[data-act=sim]`);
  await page.waitFor((ed) => document.querySelector(ed).classList.contains('sim-mode') && window.Silinx.active.schEditor.isLive?.() !== false, [ED], { what: 'Try it' });
  // (not greyed out by Try it: it takes clicks)
  const usable = (sel) => page.eval((ed, s) => getComputedStyle(document.querySelector(`${ed} ${s}`)).pointerEvents !== 'none', ED, sel);
  assert.deepEqual([await usable('.se-curved'), await usable('.se-btn[data-act=more]'), await usable('.se-btn[data-act=rotate]')], [true, true, false]);
  // Curved wires ticked in Try it: the wires drawn as curves, the schematic says so, Try it still on
  await openMenu(page);
  await page.click(`${ED} .se-curved input`);
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().wireStyle === 'curved', [], { what: 'curved' });
  assert.ok((await drawn(page)).some(([, d]) => d !== 'poly'), 'a curve drawn');
  assert.ok(await page.eval((ed) => document.querySelector(ed).classList.contains('sim-mode'), ED));
  // a gate clicked: selected, Symbol Info shows it
  await page.click(`${ED} svg .sym[data-id="S2"] .hitbox`);
  await page.key('F1');
  await page.waitFor(() => !!window.Silinx.active.schEditor.symbolInfoDialog, [], { what: 'Symbol Info open' });
  await page.eval(() => window.Silinx.active.schEditor.symbolInfoDialog.close());
  assert.ok(await page.eval((ed) => document.querySelector(ed).classList.contains('sim-mode'), ED), 'still trying it');
});

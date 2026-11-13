// UI (#3797): the Try it panel of the state diagram (FSM), the ASM chart and the Petri net editors (web/js/dock-panel.js),
// in both interfaces: its edge dragged (its size, the drawing area following, the FSM fitted again), its title bar dragged
// to the right of the drawing (docked there, the drop place shown while it moves) and its dock button (below again), the
// arrow keys on its edge; its place and size kept when it is closed and opened again and after a reload, per editor;
// below on a narrow screen, its dock button hidden; its tips in Portuguese. The moves add no message to the console.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newFsm } from '../../core/fsm.js';
import { newModel } from '../../core/asm.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const EDITORS = [
  { kind: 'fsm', file: 'src/m.fsm.json', model: newFsm('m'), panel: '.fsm-panel', size: 0.44 },
  { kind: 'asm', file: 'src/c.asm.json', model: newModel('c'), panel: '.asm-simpanel', size: 0.42 },
  { kind: 'petri', file: 'src/n.pn.json', model: newPetri('n'), panel: '.pn-panel', size: 0.42 },
];
const DOC = '.doc:not([hidden])';
const messages = (page) => page.eval(() => ['#console-errors', '#console-warnings'].map((s) => [...document.querySelectorAll(`${s} .diag`)].map((r) => r.textContent)));

/** The panel's place and sizes: its dock (the main column's class), its part of the drawing area, the canvas's size. */
const geometry = (page, ed) => page.eval((doc, p) => {
  const panel = document.querySelector(`${doc} ${p}`), main = panel.closest('.asm-main'), wrap = main.querySelector('.asm-canvas-wrap');
  const pr = panel.getBoundingClientRect(), mr = main.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const right = main.classList.contains('dock-right');
  return {
    open: !panel.hidden, right, part: right ? pr.width / mr.width : pr.height / mr.height,
    beside: right ? pr.left >= wr.right - 1 : pr.top >= wr.bottom - 1, canvas: { w: wr.width, h: wr.height },
    btn: !panel.querySelector('.dock-btn').hidden, btnTitle: panel.querySelector('.dock-btn').title, gripTitle: panel.querySelector('.dock-grip').title,
  };
}, DOC, ed.panel);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.03, `${what}: ${a.toFixed(3)}, not ${b}`);

async function openTry(page, ed) {
  await page.eval((f) => window.SilinxApp.openFile(f), ed.file);
  await page.waitFor((doc) => document.querySelector(`${doc} .asm-toolbar`), [DOC], { what: `the ${ed.kind} editor` });
  await page.click(`${DOC} .asm-toolbar .asm-btn`, { text: 'Try it' });
  await page.waitFor((doc, p) => { const x = document.querySelector(`${doc} ${p}`); return x && !x.hidden && x.getBoundingClientRect().height > 40; }, [DOC, ed.panel], { what: `the ${ed.kind} Try it panel` });
  await new Promise((r) => setTimeout(r, 150));   // (the drawing fitted)
}
const closeTry = (page, ed) => page.click(`${DOC} ${ed.panel} .asm-codebar > .asm-btn`, { text: '✕' });

uiTest('#3797 the Try it panel of the FSM, ASM and Petri net editors: resized by its edge, moved by its title, kept per editor', E, async (page) => {
  await page.setViewport(1600, 900);
  await makeProject(env, { name: 'DockPanel', top: '', files: Object.fromEntries(EDITORS.map((e) => [e.file, JSON.stringify(e.model, null, 2)])) });
  await page.eval((ks) => { for (const k of ks) try { localStorage.removeItem(`silinx.${k}.trypanel`); } catch { /* none */ } }, EDITORS.map((e) => e.kind));
  await page.openProject('DockPanel');
  for (const ed of EDITORS) {
    await openTry(page, ed);
    const msgs = await messages(page);
    // ---- below the drawing at first, its own size
    let g = await geometry(page, ed);
    assert.ok(g.open && !g.right && g.beside && g.btn, JSON.stringify(g));
    near(g.part, ed.size, `${ed.kind} first size`);
    assert.equal(g.btnTitle, 'Move the panel to the right of the drawing');
    assert.equal(g.gripTitle, 'Drag to resize the panel (↑ ↓ with the keyboard)');
    // ---- its edge dragged up: 60% of the drawing area, the canvas smaller
    const grip = await page.point(`${DOC} ${ed.panel} > .dock-grip`);
    const main = await page.eval((doc, p) => { const r = document.querySelector(`${doc} ${p}`).closest('.asm-main').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }, DOC, ed.panel);
    await page.drag(grip, { x: grip.x, y: main.top + main.height * 0.4 });
    const g2 = await geometry(page, ed);
    near(g2.part, 0.6, `${ed.kind} dragged size`);
    assert.ok(g2.canvas.h < g.canvas.h - main.height * 0.1, `${ed.kind} canvas ${g2.canvas.h} after ${g.canvas.h}`);
    if (ed.kind === 'fsm') {   // the drawing fitted again into the smaller canvas
      await new Promise((r) => setTimeout(r, 150));
      const inside = await page.eval((doc) => {
        const w = document.querySelector(`${doc} .fsm-editor .asm-canvas-wrap`).getBoundingClientRect();
        return [...document.querySelectorAll(`${doc} .fsm-editor [data-state] .fsm-circle`)].every((c) => { const b = c.getBoundingClientRect(); return b.top >= w.top - 1 && b.bottom <= w.bottom + 1 && b.left >= w.left - 1 && b.right <= w.right + 1; });
      }, DOC);
      assert.ok(inside, 'the FSM\'s states in the smaller canvas');
    }
    // (past the limits: no smaller than 15%, no larger than 85%)
    await page.drag(await page.point(`${DOC} ${ed.panel} > .dock-grip`), { x: grip.x, y: main.top + 2 });
    near((await geometry(page, ed)).part, 0.85, `${ed.kind} largest`);
    await page.drag(await page.point(`${DOC} ${ed.panel} > .dock-grip`), { x: grip.x, y: main.top + main.height * 0.4 });
    // ---- the arrow keys on the focused edge: 5% more, 5% less
    await page.eval((doc, p) => document.querySelector(`${doc} ${p} > .dock-grip`).focus(), DOC, ed.panel);
    await page.key('ArrowUp');
    near((await geometry(page, ed)).part, 0.65, `${ed.kind} ↑`);
    await page.key('ArrowDown');
    near((await geometry(page, ed)).part, 0.6, `${ed.kind} ↓`);
    // ---- its title bar dragged to the right of the drawing: shown while it moves, docked there, its size kept
    const title = await page.point(`${DOC} ${ed.panel} .asm-code-title`);
    const to = { x: main.left + main.width - 30, y: main.top + main.height * 0.3 };
    await page.mouse('mouseMoved', title.x, title.y);
    await page.mouse('mousePressed', title.x, title.y);
    for (let i = 1; i <= 8; i++) await page.mouse('mouseMoved', title.x + (to.x - title.x) * i / 8, title.y + (to.y - title.y) * i / 8, { buttons: 1 });
    assert.equal(await page.eval((doc, p) => { const v = document.querySelector(`${doc} ${p}`).closest('.asm-main').querySelector('.dock-preview'); return v.hidden ? 'hidden' : v.className; }, DOC, ed.panel), 'dock-preview to-right');
    await page.mouse('mouseReleased', to.x, to.y);
    g = await geometry(page, ed);
    assert.ok(g.right && g.beside, JSON.stringify(g));
    near(g.part, 0.6, `${ed.kind} on the right`);
    assert.equal(g.btnTitle, 'Move the panel below the drawing');
    assert.equal(g.gripTitle, 'Drag to resize the panel (← → with the keyboard)');
    assert.equal(await page.eval((doc, p) => document.querySelector(`${doc} ${p}`).closest('.asm-main').querySelector('.dock-preview').hidden, DOC, ed.panel), true);
    // its edge dragged on the right: 35%
    const grip2 = await page.point(`${DOC} ${ed.panel} > .dock-grip`);
    await page.drag(grip2, { x: main.left + main.width * 0.65, y: grip2.y });
    near((await geometry(page, ed)).part, 0.35, `${ed.kind} on the right, dragged`);
    // ---- closed and opened again: on the right, its size kept
    await closeTry(page, ed);
    assert.equal((await geometry(page, ed)).open, false);
    await page.click(`${DOC} .asm-toolbar .asm-btn`, { text: 'Try it' });
    g = await geometry(page, ed);
    assert.ok(g.open && g.right, JSON.stringify(g));
    near(g.part, 0.35, `${ed.kind} opened again`);
    assert.deepEqual(await messages(page), msgs, `${ed.kind}: no message`);
    await closeTry(page, ed);
  }
  // ---- per editor: the ASM chart's moved below by its button; after a reload, each as it was left
  await openTry(page, EDITORS[1]);
  await page.click(`${DOC} .asm-simpanel .dock-btn`);
  assert.equal((await geometry(page, EDITORS[1])).right, false);
  await page.reload();
  await page.waitFor(() => window.SilinxApp?.openFile, [], { what: 'app boot' });
  await page.openProject('DockPanel');
  for (const ed of EDITORS) {
    await openTry(page, ed);
    const g = await geometry(page, ed);
    assert.equal(g.right, ed.kind !== 'asm', `${ed.kind} after the reload`);
    near(g.part, 0.35, `${ed.kind} after the reload`);
  }
  // ---- in Portuguese: its tips
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('pt');
  let g = await geometry(page, EDITORS[2]);
  assert.deepEqual([g.btnTitle, g.gripTitle], ['Mover o painel para baixo do desenho', 'Arraste para redimensionar o painel (← → com o teclado)']);
  assert.equal(await page.eval((doc) => document.querySelector(`${doc} .pn-panel .asm-codebar`).title, DOC), 'Arraste a barra de título para mover o painel para baixo ou para a direita do desenho');
  await setLang('en');
  // ---- on a narrow screen: below the drawing (its place kept for a wider one), its dock button hidden, still resized
  await page.setViewport(900, 800);
  await page.waitFor((doc) => !document.querySelector(`${doc} .pn-panel`).closest('.asm-main').classList.contains('dock-right'), [DOC], { what: 'below on a narrow screen' });
  g = await geometry(page, EDITORS[2]);
  assert.ok(!g.right && !g.btn, JSON.stringify(g));
  near(g.part, 0.35, 'narrow size');
  await page.setViewport(1600, 900);
  await page.waitFor((doc) => document.querySelector(`${doc} .pn-panel`).closest('.asm-main').classList.contains('dock-right'), [DOC], { what: 'on the right again' });
  await page.eval((ks) => { for (const k of ks) try { localStorage.removeItem(`silinx.${k}.trypanel`); } catch { /* none */ } }, EDITORS.map((e) => e.kind));
});

// UI: the keyboard focus after a click in the diagram editors stays in the editor, so that its keys
// (Delete, F1, Ctrl+C…) act on what was clicked. Run in every browser (SILINX_UI_BROWSER): in
// Safari's WebKit a click on a schematic symbol, which the editor draws again on the press, moved
// the focus to the page and Delete did nothing. And the view of a diagram editor is not fitted again
// when its tab is activated again (#233): the drawing moved under the pointer, the click missed.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { newFsm } from '../../core/fsm.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

/** Centre of `sel` once it stands still (the editors fit the view to the drawing when they open). */
async function still(page, sel) {
  let p = null;
  for (let i = 0; i < 50; i++) {
    const q = await page.point(sel);
    if (p && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) return q;
    p = q;
    await new Promise((r) => setTimeout(r, 100));
  }
  return p;
}

uiTest('schematic editor: a click on a symbol selects it and keeps the keyboard focus, Delete removes it', E, async (page) => {
  const doc = newDoc('focus', 'vhdl');
  doc.symbols.push({ id: 'S1', type: 'fdce', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: { init: '0' } });
  await makeProject(env, { name: 'FocusSch', files: { 'src/focus.sch.json': JSON.stringify(doc) } });
  await page.openProject('FocusSch');
  await page.eval(() => window.SilinxApp.openSch('src/focus.sch.json'));
  const ED = '.doc:not([hidden]) .sch-editor';
  await page.waitFor((sel) => document.querySelector(`${sel} g.sym[data-id="S1"]`), [ED], { what: 'the symbol' });
  // (the element under the pointer is replaced on the press)
  await page.click(await still(page, `${ED} g.sym[data-id="S1"] .hitbox`));
  await page.waitFor((sel) => document.querySelector(`${sel} g.sym.sel[data-id="S1"]`), [ED], { what: 'symbol selected' });
  assert.equal(await page.eval((sel) => document.querySelector(sel).contains(document.activeElement), ED), true, 'the focus is in the editor');
  await page.key('Delete');
  await page.waitFor(() => window.Silinx.active.schEditor.getDoc().symbols.length === 0, [], { what: 'symbol deleted with Delete' });
});

uiTest('ASM chart editor: a click on a block selects it and keeps the keyboard focus, Delete removes it', E, async (page) => {
  await makeProject(env, { name: 'FocusAsm', template: 'blinky' });
  await page.openProject('FocusAsm');
  await page.eval(() => window.SilinxApp.openAsm('src/speed_ctrl.asm.json'));
  await page.waitFor(() => window.Silinx.active?.asmEditor && document.querySelector('.doc:not([hidden]) [data-node]'), [], { what: 'ASM chart' });
  const before = await page.eval(() => window.Silinx.active.asmEditor.getModel().nodes.length);
  const id = await page.eval(() => window.Silinx.active.asmEditor.getModel().nodes.find((n) => n.type !== 'start' && n.kind !== 'start')?.id ?? window.Silinx.active.asmEditor.getModel().nodes[1].id);
  await page.click(await still(page, `.doc:not([hidden]) [data-node="${id}"]`));
  await page.waitFor((i) => document.querySelector(`.doc:not([hidden]) [data-node="${i}"]`)?.classList.contains('sel'), [id], { what: 'block selected' });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .asm-editor').contains(document.activeElement)), true, 'the focus is in the editor');
  await page.key('Delete');
  await page.waitFor((n) => window.Silinx.active.asmEditor.getModel().nodes.length < n, [before], { what: 'block deleted with Delete' });
});

uiTest('state diagram (FSM) editor: a click on a state selects it and keeps the keyboard focus, Delete removes it', E, async (page) => {
  await makeProject(env, { name: 'FocusFsm', files: { 'src/m.fsm.json': JSON.stringify(newFsm('m')) } });
  await page.openProject('FocusFsm');
  await page.eval(() => window.SilinxApp.openFsm('src/m.fsm.json'));
  const ED = '.doc:not([hidden]) .fsm-editor';
  await page.waitFor((ed) => window.Silinx.active?.fsmEditor && document.querySelector(`${ed} [data-state="s2"]`), [ED], { what: 'state diagram' });
  await page.click(await still(page, `${ED} [data-state="s2"] .fsm-circle`));
  await page.waitFor((ed) => document.querySelector(`${ed} [data-state="s2"].sel`), [ED], { what: 'state selected' });
  assert.equal(await page.eval((ed) => document.querySelector(ed).contains(document.activeElement), ED), true, 'the focus is in the editor');
  await page.key('Delete');
  await page.waitFor(() => window.Silinx.active.fsmEditor.getModel().states.length === 2, [], { what: 'state deleted with Delete' });
});

uiTest('the diagram editors (schematic, ASM, FSM, Petri net) keep their view (zoom, pan) when their tab is activated again (#233)', E, async (page) => {
  const sch = newDoc('vw', 'vhdl');
  sch.symbols.push({ id: 'S1', type: 'fdce', x: 300, y: 200, rot: 0, mirror: false, name: 'U1', params: { init: '0' } });
  await makeProject(env, { name: 'ViewKept', template: 'blinky', files: { 'src/vw.sch.json': JSON.stringify(sch), 'src/m.fsm.json': JSON.stringify(newFsm('m')), 'src/ctl.pn.json': JSON.stringify(newPetri('ctl')) } });
  await page.openProject('ViewKept');
  const editors = [
    { open: 'openSch', file: 'src/vw.sch.json', vp: '.se-vp', title: 'vw.sch.json' },
    { open: 'openAsm', file: 'src/speed_ctrl.asm.json', vp: '.asm-vp', title: 'speed_ctrl.asm.json' },
    { open: 'openFsm', file: 'src/m.fsm.json', vp: '.fsm-vp', title: 'm.fsm.json' },
    { open: 'openPetri', file: 'src/ctl.pn.json', vp: '.pn-world', title: 'ctl.pn.json' },
  ];
  const view = (vp) => page.eval((v) => document.querySelector(`.doc:not([hidden]) ${v}`)?.getAttribute('transform') ?? null, vp);
  const tab = (title) => page.click('#doc-tabs .tab', { text: title });
  for (const e of editors) {
    await page.eval((o, f) => window.SilinxApp[o](f), e.open, e.file);
    await page.waitFor((v) => document.querySelector(`.doc:not([hidden]) ${v}`)?.childElementCount, [e.vp], { what: `${e.file} open` });
  }
  await new Promise((r) => setTimeout(r, 500));   // (each fitted when it opened)
  const moved = [];
  for (const e of editors) {
    await tab(e.title);
    await page.waitFor((v) => document.querySelector(`.doc:not([hidden]) ${v}`), [e.vp], { what: `${e.file} in front` });
    await new Promise((r) => setTimeout(r, 300));
    // the user zooms in at the middle of the drawing
    const fitted = await view(e.vp);
    await page.eval((v) => {
      const svg = document.querySelector(`.doc:not([hidden]) ${v}`).closest('svg'), b = svg.getBoundingClientRect();
      svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, bubbles: true, cancelable: true }));
    }, e.vp);
    const mine = await view(e.vp);
    assert.notEqual(mine, fitted, `${e.file}: zoomed`);
    // another document in front, then this one again: the view as the user left it
    await tab(editors.find((x) => x !== e).title);
    await tab(e.title);
    await new Promise((r) => setTimeout(r, 300));
    const now = await view(e.vp);
    if (now !== mine) moved.push(`${e.file}: ${mine} -> ${now}`);
  }
  assert.deepEqual(moved, [], 'the views kept');
});

// #339 regression: the FSM and ASM editors fit the view once, when their canvas first has a size; that first fit
// came after the user's press when the canvas got its size late (a slow machine): the drawing moved under the
// pointer while it dragged (CI: a state dragged by 60 px ended 21 px to the left). Now the view is the user's
// from the first press: each editor opened while the workspace is hidden (no size to fit to), the workspace
// shown and a state / block pressed at once, the frames (its ResizeObserver, its first fit) passed with the
// press held, moved, released: the view as it was, the item moved with the pointer.
uiTest('#339 the FSM and ASM editors: a first fit coming after the press (the canvas sized late) does not move the drawing under a drag', E, async (page) => {
  await makeProject(env, { name: 'LateFit', template: 'blinky', files: { 'src/m.fsm.json': JSON.stringify(newFsm('m')) } });
  await page.openProject('LateFit');
  const editors = [
    { what: 'FSM', open: 'openFsm', file: 'src/m.fsm.json', ed: 'fsmEditor', item: '[data-state="s1"] .fsm-circle', vp: '.fsm-vp' },
    { what: 'ASM', open: 'openAsm', file: 'src/speed_ctrl.asm.json', ed: 'asmEditor', item: '[data-node]', vp: '.asm-vp' },
  ];
  for (const e of editors) {
    await page.eval(() => { document.getElementById('workspace').style.display = 'none'; });
    await page.eval((o, f) => window.SilinxApp[o](f), e.open, e.file);
    await page.waitFor((x) => window.Silinx.active?.[x] && document.querySelector('.doc:not([hidden]) svg'), [e.ed], { what: `${e.file} open (hidden)` });
    const r = await page.eval(async (o) => {
      const frames = (n) => new Promise((res) => { const f = () => (--n ? requestAnimationFrame(f) : res()); requestAnimationFrame(f); });
      await frames(3);   // hidden: nothing to fit to yet
      document.getElementById('workspace').style.display = '';
      const D = '.doc:not([hidden])', vp = document.querySelector(`${D} ${o.vp}`), svg = vp.closest('svg');
      svg.setPointerCapture = () => {};   // (synthetic pointer events)
      const el = document.querySelector(`${D} ${o.item}`), id = el.closest('[data-state],[data-node]').outerHTML.match(/data-(?:state|node)="[^"]*"/)[0];
      const at = () => { const b = document.querySelector(`${D} [${id}]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
      const b0 = el.getBoundingClientRect(), p = { x: b0.left + b0.width / 2, y: b0.top + b0.height / 2 }, a0 = at(), view0 = vp.getAttribute('transform');
      const ev = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true }));
      ev('pointerdown', p.x, p.y, el);
      await frames(3);   // the canvas has a size now: its ResizeObserver and the first frame pass, the press held
      for (let i = 1; i <= 6; i++) ev('pointermove', p.x + 10 * i, p.y + 5 * i, svg);
      ev('pointerup', p.x + 60, p.y + 30, svg);
      await frames(2);
      const a1 = at();
      return { dx: a1.x - a0.x, dy: a1.y - a0.y, view0, view1: vp.getAttribute('transform') };
    }, e);
    assert.equal(r.view1, r.view0, `${e.what}: the view kept from the press on`);
    assert.ok(Math.abs(r.dx - 60) <= 12 && Math.abs(r.dy - 30) <= 12, `${e.what}: the item dragged by (60, 30): ${JSON.stringify(r)}`);
  }
  assert.deepEqual(page.console.filter((c) => /^warn/.test(c.type) || c.type === 'error').map((c) => c.text), []);
});

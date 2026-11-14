// UI (#3804): the room of the documents changed by the user zooms every drawing on display to Full View once the room
// settled (web/js/layout-fit.js), as #1203 does for the schematic (sch-layout-fit.test.js): the state diagram, the ASM
// chart and the Petri net editors, after the side panel or the messages shown or hidden or the document maximized or
// restored (the Tasks interface's buttons; the ISE style interface has none: the signal itself), and the editor split
// or unsplit (both interfaces: the Split button or View ▸ Split Editor, web/js/split-view.js); split, each view fitted;
// a drawing behind another tab fitted when shown if its room changed meanwhile, left as the user's if not; a text
// editor's scroll unchanged. The symbol editor and the waveform mounted alone: Full View on the signal, none once
// destroyed. The reference: the editor's own Zoom to Full View at the new size (a fit again changes nothing), the zoom
// by hand undone. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupUi, uiTest, makeProject, toggleSplitEditor } from './harness.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const warnings = page => page.console.filter(m => /^warn|^error/.test(m.type)).map(m => m.text);

const FSM = 'fsm:src/traffic.fsm.json', ASM = 'asm:src/speed_ctrl.asm.json', PN = 'pn:src/ctl.pn.json';
const asm = JSON.parse(fs.readFileSync(new URL('../../examples/blinky/src/speed_ctrl.asm.json', import.meta.url), 'utf8'));
delete asm.generatedFile;
const files = { 'src/speed_ctrl.asm.json': JSON.stringify(asm, null, 2), 'src/ctl.pn.json': JSON.stringify(newPetri('ctl', 'vhdl'), null, 2) };

// a drawing's view (its transform), and whether it is the Full View at the current size (its own fit changes nothing)
const VP = '.fsm-vp, .asm-vp, .pn-world';
const view = (page, id) => page.eval((i, vp) => window.Silinx.docs.find(d => d.id === i).el.querySelector(vp).getAttribute('transform'), id, VP);
const fitted = (page, id) => page.eval((i, vp) => {
  const d = window.Silinx.docs.find(x => x.id === i), g = d.el.querySelector(vp), t = g.getAttribute('transform');
  (d.fsmEditor || d.asmEditor || d.petriEditor).fit();
  return g.getAttribute('transform') === t;
}, id, VP);
const shown = (page, id) => page.eval(i => !window.Silinx.docs.find(d => d.id === i).el.hidden, id);
// zoomed in by hand (its Zoom In button): no longer the Full View
async function zoomIn(page, id) {
  const click = () => page.eval(i => window.Silinx.docs.find(d => d.id === i).el.querySelector('[data-act="zin"]').click(), id);
  await click(); await click();
  assert.equal(await fitted(page, id), false, `${id}: zoomed in by hand`);
  await click();   // (the check put it back to Full View: zoomed again)
  return view(page, id);
}
const settle = () => new Promise(r => setTimeout(r, 700));
// after a toggle, once the room settled: the drawing at Full View for its new room
async function expectFitted(page, id, what, before) {
  await page.waitFor((i, vp, b) => window.Silinx.docs.find(d => d.id === i).el.querySelector(vp).getAttribute('transform') !== b, [id, VP, before], { what: `${what}: ${id} zoom changed` });
  await settle();
  assert.ok(await fitted(page, id), `${what}: ${id} at Full View`);
}
const tasks = page => page.eval(() => document.documentElement.dataset.layout === 'tasks');
const signal = page => page.eval(async () => (await import('/js/layout-fit.js')).layoutToggled());
async function open(page, id) {
  await page.eval(i => window.SilinxApp.openFile(i.replace(/^\w+:/, '')), id);
  await page.waitFor((i, vp) => window.Silinx.active?.id === i && window.Silinx.active.el.querySelector(vp)?.getAttribute('transform'), [id, VP], { what: id });
  await settle();
}

uiTest('#3804 State diagram, ASM chart, Petri net: Full View when the side panel, the messages or the document maximized are toggled', E, async (page) => {
  await makeProject(env, { name: 'FitAll', template: 'traffic', files });
  await page.setViewport(1366, 768);
  await page.openProject('FitAll');
  for (const id of [FSM, ASM, PN]) {
    await open(page, id);
    if (await tasks(page)) {
      for (const [what, act] of [['side panel hidden', 'side'], ['side panel shown', 'side'], ['messages toggled', 'console'],
        ['messages toggled back', 'console'], ['maximized', 'max'], ['restored', 'max']]) {
        const t = await zoomIn(page, id);
        await page.click(`#task-view [data-act="${act}"]`);
        await expectFitted(page, id, what, t);
      }
    } else {
      // the ISE style interface: no such buttons; the signal fits the drawing in front
      assert.equal(await page.eval(() => document.querySelector('#task-bar')), null);
      const t = await zoomIn(page, id);
      await signal(page);
      await expectFitted(page, id, 'the signal', t);
    }
  }
  // a drawing behind another tab: the room back as it was (or unchanged) when it is shown, the user's zoom kept
  const kept = await zoomIn(page, FSM);
  await open(page, ASM);
  if (await tasks(page)) { await page.click('#task-view [data-act="side"]'); await settle(); await page.click('#task-view [data-act="side"]'); } else await signal(page);
  await settle();
  assert.equal(await shown(page, FSM), false);
  assert.equal(await view(page, FSM), kept, 'hidden: left as it is');
  await open(page, FSM);
  assert.equal(await view(page, FSM), kept, 'shown in the same room: the user\'s zoom kept');
  // its room changed while hidden: fitted when shown
  if (await tasks(page)) {
    await open(page, ASM);
    await page.click('#task-view [data-act="max"]');
    await settle();
    assert.equal(await view(page, FSM), kept, 'hidden: left as it is');
    await open(page, FSM);
    await settle();
    assert.ok(await fitted(page, FSM), 'shown in a new room: Full View');
    await page.click('#task-view [data-act="max"]');
    await settle();
  }
  assert.deepEqual(warnings(page), []);
});

uiTest('#3804 Split editor: the drawing fitted when split and unsplit, each view fitted, the one behind fitted when shown; a text editor\'s scroll kept', E, async (page) => {
  await makeProject(env, { name: 'FitSplit', template: 'traffic', files });
  await page.setViewport(1366, 768);
  await page.openProject('FitSplit');
  await open(page, FSM);
  // split: the state diagram on the left, half its room
  let t = await zoomIn(page, FSM);
  await toggleSplitEditor(page);
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split' });
  await expectFitted(page, FSM, 'split', t);
  // the ASM chart opened on the right (the side worked in): both shown
  await open(page, ASM);
  assert.ok(await shown(page, FSM) && await shown(page, ASM), 'side by side');
  assert.ok(await page.eval(() => window.Silinx.docs.find(d => d.id === 'asm:src/speed_ctrl.asm.json').el.classList.contains('pane-b')));
  // the room changed (the side panel, or the signal): each view fitted
  const ta = await zoomIn(page, FSM), tb = await zoomIn(page, ASM);
  if (await tasks(page)) await page.click('#task-view [data-act="side"]'); else await signal(page);
  await expectFitted(page, FSM, 'split, the room changed', ta);
  await expectFitted(page, ASM, 'split, the room changed', tb);
  if (await tasks(page)) { await page.click('#task-view [data-act="side"]'); await settle(); }
  // unsplit: the ASM chart in front fitted to its whole room; the state diagram behind it fitted once shown
  t = await zoomIn(page, ASM);
  const behind = await zoomIn(page, FSM);
  await page.eval(() => window.SilinxApp.activateDoc(window.Silinx.docs.find(d => d.id === 'asm:src/speed_ctrl.asm.json')));
  await toggleSplitEditor(page);
  await page.waitFor(() => !document.getElementById('workspace').classList.contains('split'), [], { what: 'unsplit' });
  await expectFitted(page, ASM, 'unsplit', t);
  assert.equal(await shown(page, FSM), false);
  assert.equal(await view(page, FSM), behind, 'hidden: left as it is');
  await page.eval(() => window.SilinxApp.activateDoc(window.Silinx.docs.find(d => d.id === 'fsm:src/traffic.fsm.json')));
  await expectFitted(page, FSM, 'shown in its new room', behind);

  // a text editor: its scroll as it was
  await page.eval(() => window.SilinxApp.openFile('src/traffic.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/traffic.vhd' && window.Silinx.active.el.querySelector('.cm-scroller'), [], { what: 'the VHDL' });
  const top = await page.eval(() => { const s = window.Silinx.active.el.querySelector('.cm-scroller'); s.scrollTop = 120; return s.scrollTop; });
  assert.ok(top > 0, 'scrolled');
  if (await tasks(page)) await page.click('#task-view [data-act="console"]'); else await signal(page);
  await settle();
  assert.equal(await page.eval(() => window.Silinx.active.el.querySelector('.cm-scroller').scrollTop), top);
  if (await tasks(page)) { await page.click('#task-view [data-act="console"]'); await settle(); }
  assert.deepEqual(warnings(page), []);
});

uiTest('#3804 Symbol editor and waveform mounted alone: Full View on the signal, their room changed; none once destroyed', E, async (page) => {
  const r = await page.eval(async () => {
    const { mountSymbolEditor } = await import('/js/symbol-editor.js');
    const { layoutToggled } = await import('/js/layout-fit.js');
    const settle = () => new Promise(res => setTimeout(res, 700));
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 700px; height: 450px; z-index: 9999; background: white; display: flex';
    document.body.append(host);
    const module = { name: 'm', ports: [{ name: 'a', dir: 'in', width: 1 }, { name: 'b', dir: 'in', width: 1 }, { name: 'y', dir: 'out', width: 1 }] };
    const ed = mountSymbolEditor(host, { module, readOnly: true });
    await settle();
    const zoom = () => host.querySelector('.asm-zoom').textContent;
    const isFit = () => { const a = zoom(); ed.fit(); return zoom() === a; };
    const out = {};
    host.querySelector('[data-act="zout"]').click();
    out.zoomed = !isFit();
    host.querySelector('[data-act="zout"]').click();
    host.style.height = '300px';
    layoutToggled();
    await settle();
    out.fitted = isFit();
    ed.destroy();
    layoutToggled();
    await settle();
    host.remove();
    return out;
  });
  assert.deepEqual(r, { zoomed: true, fitted: true });

  // the waveform: Full View (the whole run in its width) on the signal
  const w = await page.eval(async () => {
    const { compile, elaborate } = await import('/core/compile.js');
    const { mountISim } = await import('/js/isim.js');
    const { layoutToggled } = await import('/js/layout-fit.js');
    const { Simulator } = await import('/core/simulator.js');
    const settle = () => new Promise(res => setTimeout(res, 700));
    const text = 'library ieee; use ieee.std_logic_1164.all;\nentity tb is end tb;\narchitecture sim of tb is signal clk : std_logic := \'0\'; begin clk <= not clk after 5 ns; end sim;\n';
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 900px; height: 500px; z-index: 9999; background: white';
    document.body.append(host);
    const design = elaborate(compile([{ path: 'tb.vhd', lang: 'vhdl', text }]), 'tb');
    const isim = mountISim(host, { design, sim: new Simulator(design), title: 'tb' });
    await isim.runFor(1e6);
    await settle();
    const out = {};
    const zin = [...host.querySelectorAll('.isim-toolbar .tb-btn')].find(b => b.title === 'Zoom In');
    zin.click(); zin.click();
    out.zoomed = isim.getState().fit === false;
    host.style.width = '700px';
    layoutToggled();
    await settle();
    out.fitted = isim.getState().fit === true;
    isim.destroy();
    layoutToggled();
    await settle();
    host.remove();
    return out;
  });
  assert.deepEqual(w, { zoomed: true, fitted: true });
  assert.deepEqual(warnings(page), []);
});

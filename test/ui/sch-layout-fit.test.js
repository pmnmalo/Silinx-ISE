// UI (#1203): the room of the documents changed by the user (the side panel or the messages shown or hidden, the
// document maximized or restored: the Tasks bar's buttons, a tab's double click, Ctrl/Cmd+Shift+Enter) zooms the
// schematic in front to Full View: the editor (web/js/sch-editor.js), and the RTL / Technology viewer
// (web/js/schematic-view.js) mounted alone. The reference: the drawing's own Zoom to Full View at the new size (a fit
// again changes nothing), the zoom by hand undone. The ISE style interface has no such buttons: the signal itself
// (web/js/layout-fit.js layoutToggled) does it there. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const ED = '.doc:not([hidden]) .sch-editor';
const warnings = page => page.console.filter(m => /^warn|^error/.test(m.type)).map(m => m.text);

const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
function design() {
  const doc = newDoc('fitted', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 100, 90), inv('S2', 'U2', 300, 90));
  doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 420, y: 100 });
  doc.wires.push({ id: 'W1', points: [{ x: 60, y: 100 }, { x: 100, y: 100 }] }, { id: 'W2', points: [{ x: 160, y: 100 }, { x: 300, y: 100 }] },
    { id: 'W3', points: [{ x: 360, y: 100 }, { x: 420, y: 100 }] });
  return doc;
}

const transform = page => page.eval((ed) => document.querySelector(`${ed} .se-vp`).getAttribute('transform'), ED);
// the Full View at the current size: the editor's own fit, which leaves a fitted drawing as it is
const fitted = page => page.eval((ed) => { const t = document.querySelector(`${ed} .se-vp`).getAttribute('transform'); window.Silinx.active.schEditor.fit(); return document.querySelector(`${ed} .se-vp`).getAttribute('transform') === t; }, ED);
async function zoomIn(page) {
  const t = await transform(page);
  await page.click(`${ED} [data-act="zin"]`);
  await page.click(`${ED} [data-act="zin"]`);
  assert.notEqual(await transform(page), t, 'zoomed in by hand');
  assert.equal(await fitted(page), false);
  // (the check put it back to Full View: zoomed again)
  await page.click(`${ED} [data-act="zin"]`);
}
// after a toggle: the drawing at Full View for its new room, once the room settled
async function waitFitted(page, what, before) {
  await page.waitFor((ed, b) => document.querySelector(`${ed} .se-vp`).getAttribute('transform') !== b, [ED, before], { what: `${what}: zoom changed` });
  await new Promise(r => setTimeout(r, 600));
  assert.ok(await fitted(page), `${what}: Full View`);
}

uiTest('#1203 Schematic editor: Full View when the side panel, the messages or the document maximized are toggled', E, async (page) => {
  await makeProject(env, { name: 'LayoutFit', files: { 'src/fitted.sch.json': JSON.stringify(design()) } });
  await page.setViewport(1366, 768);
  await page.openProject('LayoutFit');
  await page.eval(() => window.SilinxApp.openSch('src/fitted.sch.json'));
  await page.waitFor((ed) => document.querySelectorAll(`${ed} svg .sym`).length === 2, [ED], { what: 'drawn' });
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) {
    const scale = async () => +(await transform(page)).match(/scale\(([\d.]+)\)/)[1];
    for (const [what, act] of [['side panel hidden', '#task-view [data-act="side"]'], ['side panel shown', '#task-view [data-act="side"]'],
      ['messages toggled', '#task-view [data-act="console"]'], ['messages toggled back', '#task-view [data-act="console"]'],
      ['maximized', '#task-view [data-act="max"]'], ['restored', '#task-view [data-act="max"]']]) {
      await zoomIn(page);
      const t = await transform(page);
      await page.click(act);
      await waitFitted(page, what, t);
    }
    // a tab's double click and Ctrl/Cmd+Shift+Enter: maximized, restored
    const s0 = await scale();
    await zoomIn(page);
    let t = await transform(page);
    await page.eval(() => document.querySelector('#doc-tabs > .tab.active').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    await waitFitted(page, 'maximized by the tab', t);
    assert.equal(await page.eval(() => document.documentElement.dataset.max), 'on');
    assert.ok(await scale() >= s0, 'more room: as large or larger');
    await zoomIn(page);
    t = await transform(page);
    await page.eval(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true })));
    await waitFitted(page, 'restored by the keys', t);
    assert.notEqual(await page.eval(() => document.documentElement.dataset.max), 'on');
  } else {
    // the ISE style interface: no such buttons; the signal fits the drawing in front
    assert.equal(await page.eval(() => document.querySelector('#task-bar')), null);
    await zoomIn(page);
    const t = await transform(page);
    await page.eval(async () => (await import('/js/layout-fit.js')).layoutToggled());
    await waitFitted(page, 'the signal', t);
  }
  // the editor closed: it listens no more (no error on the next toggle)
  await page.eval(() => window.SilinxApp.closeDoc(window.Silinx.active));
  await page.eval(async () => (await import('/js/layout-fit.js')).layoutToggled());
  await new Promise(r => setTimeout(r, 600));
  assert.deepEqual(warnings(page), []);
});

uiTest('#1203 RTL / Technology schematic viewer: Full View on the signal, its room changed; not while hidden; none once destroyed', E, async (page) => {
  const r = await page.eval(async () => {
    const { compile, elaborate } = await import('/core/compile.js');
    const { buildSchematic } = await import('/core/schematic.js');
    const { mountSchematic } = await import('/js/schematic-view.js');
    const { layoutToggled } = await import('/js/layout-fit.js');
    const text = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (a, b : in std_logic; y : out std_logic); end top;\narchitecture rtl of top is begin y <= a and b; end rtl;\n';
    const host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 700px; height: 450px; z-index: 9999; background: white';
    document.body.append(host);
    const view = mountSchematic(host, {});
    await view.show(buildSchematic(elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text }]), 'top').top), { title: 'top' });
    const vp = host.querySelector('.sch-vp');
    const t = () => vp.getAttribute('transform');
    const isFit = () => { const a = t(); view.fit(); return t() === a; };
    const settle = () => new Promise(res => setTimeout(res, 600));
    const out = {};
    view.zoomIn(); view.zoomIn();
    out.zoomed = !isFit();
    view.zoomIn();
    // the room changed by a toggle: Full View for the new size
    host.style.width = '900px';
    layoutToggled();
    await settle();
    out.fitted = isFit();
    // hidden (another document in front): left as it is
    view.zoomIn();
    host.style.display = 'none';
    const hidden = t();
    layoutToggled();
    await settle();
    out.hiddenKept = t() === hidden;
    host.style.display = '';
    // destroyed: nothing more
    view.destroy();
    layoutToggled();
    await settle();
    out.destroyed = host.innerHTML === '';
    host.remove();
    return out;
  });
  assert.deepEqual(r, { zoomed: true, fitted: true, hiddenKept: true, destroyed: true });
  assert.deepEqual(warnings(page), []);
});

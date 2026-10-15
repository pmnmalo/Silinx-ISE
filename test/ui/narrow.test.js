// UI: narrow screens (#266, web/js/narrow.js): at 1024 px wide or less (an iPad in portrait, 820 × 1180
// or 768 × 1024) the left side is a drawer over the workspace (the header's button, the activity bar
// of the modern interface, the scrim beside it; it gives way to a document opened; remembered), the
// diagram editors' side panels go over the canvas (their toolbar's Symbols / Properties buttons), the
// canvas keeps most of the width, the link banner is one line with its whole text in its tip, the
// page never scrolls sideways; at 1180 × 820 (an iPad in landscape) and 1400 × 900 the layout is the
// desktop's, whatever was left open or closed on a narrow screen. In both interfaces (SILINX_UI_INTERFACE).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DOC = '.doc:not([hidden])';

// shown on the page (displayed, with a size)
const shown = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; }, sel);
const width = (page, sel) => page.eval((s) => Math.round(document.querySelector(s).getBoundingClientRect().width), sel);
const rect = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), height: Math.round(r.height) }; }, sel);
const drawer = (page) => page.eval(() => [document.documentElement.dataset.drawer, localStorage.getItem('silinx.drawer'), document.getElementById('drawer-btn').getAttribute('aria-expanded')]);
// the page does not scroll sideways, nor does any toolbar overflow
const noSideScroll = (page) => page.eval(() => {
  const over = [...document.querySelectorAll('#topbar, #toolbar, .doc:not([hidden]) :is(.se-toolbar, .asm-toolbar)')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id || e.className);
  return { page: document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth, over };
});
// the warnings of the page's console (console.warn) and of the Warnings tab: none
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '');
}

for (const [w, h] of [[820, 1180], [768, 1024]]) {
  uiTest(`narrow screen ${w}×${h}: the drawer, the schematic's panels over its canvas, no sideways scroll`, E, async (page) => {
    const pj = `Narrow_${w}`;
    await makeProject(env, { name: pj, template: 'gates' });
    await page.setViewport(w, h);
    await page.openProject(pj);
    const modern = await page.eval(() => document.documentElement.dataset.ui === 'modern');
    // the first time the drawer is open (nothing kept yet), over the workspace: the Design pane
    assert.deepEqual(await drawer(page), ['open', null, 'true']);
    assert.ok(await shown(page, '#drawer-btn'));
    assert.ok(await shown(page, '#hier'));
    assert.ok(!(await shown(page, '#v-split')));
    // the gates schematic opened from it (double-click): the drawer gives way, remembered
    await page.treeRow('#hier', 'gates', { dbl: true, exact: true });
    await page.waitFor((d) => document.querySelector(`${d} .sch-editor .se-canvas`), [DOC], { what: 'the schematic editor' });
    await page.waitFor(() => document.documentElement.dataset.drawer === 'closed', [], { what: 'the drawer closed' });
    assert.deepEqual(await drawer(page), ['closed', 'closed', 'false']);
    assert.ok(!(await shown(page, '#hier')));
    // the canvas has most of the width; the symbols and the properties are not beside it
    const canvas = await width(page, `${DOC} .se-canvas`);
    assert.ok(canvas >= 0.6 * w, `canvas ${canvas} px of ${w}`);
    assert.ok(canvas >= w - (modern ? 70 : 12), `canvas ${canvas} px of ${w}`);   // the activity bar (modern), the borders
    assert.ok(!(await shown(page, `${DOC} .se-left`)) && !(await shown(page, `${DOC} .se-right`)));
    assert.deepEqual(await noSideScroll(page), { page: true, over: [] });
    // Properties: the panel over the canvas (the canvas keeps its width), at its right; again: hidden
    await page.click(`${DOC} [data-panel=props]`);
    assert.ok(await shown(page, `${DOC} .se-right`));
    assert.equal(await width(page, `${DOC} .se-canvas`), canvas);
    const c = await rect(page, `${DOC} .se-canvas`), r = await rect(page, `${DOC} .se-right`);
    assert.equal(r.right, c.right);
    assert.ok(r.left > c.left + 0.3 * canvas, JSON.stringify({ c, r }));
    assert.equal(await page.eval(() => localStorage.getItem('silinx.narrow.props')), 'open');
    // Symbols: the palette over the canvas, at its left
    await page.click(`${DOC} [data-panel=symbols]`);
    const l = await rect(page, `${DOC} .se-left`);
    assert.equal(l.left, c.left);
    assert.equal(await width(page, `${DOC} .se-canvas`), canvas);
    assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} [data-panel]`)].map((b) => [b.dataset.panel, b.getAttribute('aria-pressed'), b.classList.contains('on')]), DOC),
      [['symbols', 'true', true], ['props', 'true', true]]);
    await page.click(`${DOC} [data-panel=symbols]`);
    await page.click(`${DOC} [data-panel=props]`);
    assert.ok(!(await shown(page, `${DOC} .se-left`)) && !(await shown(page, `${DOC} .se-right`)));
    assert.deepEqual(await page.eval(() => [localStorage.getItem('silinx.narrow.symbols'), localStorage.getItem('silinx.narrow.props')]), ['closed', 'closed']);
    // the header's button opens the drawer (over the canvas: its width is kept), a tap beside it closes it
    await page.click('#drawer-btn');
    assert.deepEqual(await drawer(page), ['open', 'open', 'true']);
    assert.ok(await shown(page, '#hier') && await shown(page, '#drawer-scrim'));
    assert.equal(await width(page, `${DOC} .se-canvas`), canvas);
    const scrim = await rect(page, '#drawer-scrim');
    const pane = await rect(page, modern ? '#left-pages' : '#left');
    await page.click({ x: Math.round((pane.right + w) / 2), y: scrim.top + 200 });
    assert.deepEqual(await drawer(page), ['closed', 'closed', 'false']);
    assert.ok(!(await shown(page, '#hier')) && !(await shown(page, '#drawer-scrim')));
    // the button again; the state is kept over a reload
    await page.click('#drawer-btn');
    await page.reload();
    await page.waitFor(() => document.querySelector('#hier .row'), [], { what: 'the project reopened' });
    await page.waitFor((d) => document.querySelector(`${d} .sch-editor [data-panel=props]`), [DOC], { what: 'the schematic reopened' });
    assert.equal(await page.eval(() => document.documentElement.dataset.drawer), 'open');
    assert.ok(await shown(page, '#hier'));
    if (modern) {
      // the activity bar: the shown page's button closes the drawer, a page's button opens it
      await page.click('#left-tabs .tab[data-page=design]');
      assert.equal((await drawer(page))[0], 'closed');
      await page.click('#left-tabs .tab[data-page=files]');
      assert.equal((await drawer(page))[0], 'open');
      assert.ok(await shown(page, '#files-page'));
      await page.click('#left-tabs .tab[data-page=design]');
      assert.equal((await drawer(page))[0], 'open');
      assert.ok(await shown(page, '#hier'));
    }
    await page.click('#drawer-btn');
    assert.equal((await drawer(page))[0], 'closed');
    assert.deepEqual(await noSideScroll(page), { page: true, over: [] });
    // in Portuguese
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
    assert.deepEqual(await page.eval((d) => [document.getElementById('drawer-btn').title, ...[...document.querySelectorAll(`${d} [data-panel]`)].map((b) => `${b.textContent} | ${b.title}`)], DOC), [
      'Mostrar / esconder o painel lateral (Projeto, Ficheiros, Processos)',
      '☰ Símbolos | Mostrar / esconder o painel dos símbolos', '☰ Propriedades | Mostrar / esconder o painel das propriedades']);
    await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
    await noWarnings(page);
  });
}

uiTest('narrow screen 820×1180: the FSM and Petri net editors, their properties over the canvas, the link banner on one line', E, async (page) => {
  await makeProject(env, { name: 'Narrow_fsm', template: 'traffic' });
  await page.setViewport(820, 1180);
  await page.openProject('Narrow_fsm');
  await page.eval(() => window.SilinxApp.openFsm('src/traffic.fsm.json'));
  await page.waitFor((d) => document.querySelector(`${d} .fsm-editor .fsm-link .gen-banner`), [DOC], { what: 'the FSM editor' });
  assert.equal((await drawer(page))[0], 'closed');
  const check = async (ed, tip) => {
    const canvas = await width(page, `${DOC} ${ed} .asm-canvas-wrap`);
    assert.ok(canvas >= 0.6 * 820, `${ed}: canvas ${canvas} px`);
    assert.ok(!(await shown(page, `${DOC} ${ed} .asm-side`)));
    // the banner: one line, its whole text in its tip
    const b = await page.eval((s) => { const e = document.querySelector(s); return { h: e.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(e).lineHeight) || 16, title: e.title, wrap: getComputedStyle(e).whiteSpace }; }, `${DOC} ${ed} .gen-banner`);
    assert.equal(b.title, tip);
    assert.equal(b.wrap, 'nowrap');
    assert.ok(b.h < 2 * b.lh, JSON.stringify(b));
    // the toolbar: a few rows at most
    const tb = await rect(page, `${DOC} ${ed} .asm-toolbar`);
    assert.ok(tb.height <= 120, `${ed}: toolbar ${tb.height} px high`);
    // Properties: the side panel over the canvas, at its right; again: hidden
    await page.click(`${DOC} ${ed} .asm-toolbar .narrow-only`);
    assert.ok(await shown(page, `${DOC} ${ed} .asm-side`));
    assert.equal(await width(page, `${DOC} ${ed} .asm-canvas-wrap`), canvas);
    const c = await rect(page, `${DOC} ${ed} .asm-canvas-wrap`), s = await rect(page, `${DOC} ${ed} .asm-side`);
    assert.ok(s.right === c.right && s.left > c.left + 0.3 * canvas, JSON.stringify({ c, s }));
    await page.click(`${DOC} ${ed} .asm-toolbar .narrow-only`);
    assert.ok(!(await shown(page, `${DOC} ${ed} .asm-side`)));
    assert.deepEqual(await noSideScroll(page), { page: true, over: [] });
  };
  await check('.fsm-editor', 'HDL: traffic.vhd — generated from the diagram');
  // a new Petri net (Tools ▸ Petri Net Editor…)
  await page.menu('Tools', 'Petri Net Editor…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  await page.waitFor((d) => document.querySelector(`${d} .petri-editor .pn-link .gen-banner`), [DOC], { what: 'the Petri net editor' });
  await check('.petri-editor', 'HDL: ctl.vhd — generated from the net');
  // the tips in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.deepEqual(await page.eval((d) => [document.querySelector(`${d} .pn-link .gen-banner`).title, document.querySelector(`${d} .petri-editor .narrow-only`).textContent], DOC),
    ['HDL: ctl.vhd — gerado a partir da rede', '☰ Propriedades']);
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await noWarnings(page);
});

for (const [w, h] of [[1180, 820], [1400, 900]]) {
  uiTest(`wide screen ${w}×${h}: the desktop layout, whatever was closed on a narrow screen`, E, async (page) => {
    const pj = `Wide_${w}`;
    await makeProject(env, { name: pj, template: 'gates' });
    // everything closed on a narrow screen before
    await page.eval(() => { for (const k of ['silinx.drawer', 'silinx.narrow.props', 'silinx.narrow.symbols']) localStorage.setItem(k, 'closed'); });
    await page.reload();
    await page.setViewport(w, h);
    await page.openProject(pj);
    const modern = await page.eval(() => document.documentElement.dataset.ui === 'modern');
    assert.equal(await page.eval(() => document.documentElement.dataset.drawer), 'closed');
    assert.ok(!(await shown(page, '#drawer-btn')) && !(await shown(page, '#drawer-scrim')));
    assert.ok(await shown(page, '#hier') && await shown(page, '#v-split'));
    assert.equal(await width(page, '#left'), modern ? 344 : 300);
    await page.treeRow('#hier', 'gates', { dbl: true, exact: true });
    await page.waitFor((d) => document.querySelector(`${d} .sch-editor .se-canvas`), [DOC], { what: 'the schematic editor' });
    // the drawer is not involved: the Design pane stays
    assert.ok(await shown(page, '#hier'));
    // the symbols, the canvas and the properties side by side; no Symbols / Properties buttons
    const l = await rect(page, `${DOC} .se-left`), c = await rect(page, `${DOC} .se-canvas`), r = await rect(page, `${DOC} .se-right`);
    assert.ok(l.right <= c.left && c.right <= r.left, JSON.stringify({ l, c, r }));
    assert.deepEqual([await width(page, `${DOC} .se-left`), await width(page, `${DOC} .se-right`)], [190, 250]);
    assert.equal(await page.eval((d) => [...document.querySelectorAll(`${d} .narrow-only`)].filter((b) => b.getClientRects().length).length, DOC), 0);
    assert.deepEqual(await noSideScroll(page), { page: true, over: [] });
    // the FSM editor: its side panel beside the canvas
    await makeProject(env, { name: `${pj}_t`, template: 'traffic' });
    await page.openProject(`${pj}_t`);
    await page.eval(() => window.SilinxApp.openFsm('src/traffic.fsm.json'));
    await page.waitFor((d) => document.querySelector(`${d} .fsm-editor .asm-side`)?.getClientRects().length, [DOC], { what: 'the FSM editor' });
    const fc = await rect(page, `${DOC} .fsm-editor .asm-canvas-wrap`), fs = await rect(page, `${DOC} .fsm-editor .asm-side`);
    assert.ok(fc.right <= fs.left, JSON.stringify({ fc, fs }));
    assert.equal(await width(page, `${DOC} .fsm-editor .asm-side`), 320);
    assert.ok(!(await shown(page, `${DOC} .fsm-editor .narrow-only`)));
    assert.ok(await shown(page, '#hier'));
    await noWarnings(page);
  });
}

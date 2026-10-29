// UI: the Development menu of a development build (#707): after Help, the changes since the last release by
// type (Features, Bug fixes, Other), each a window with its text and its issue; all of them in one window; the
// build's commit. The build's data is given to the page (harness: build), as the single file's build defines
// it; a page without it (a release, the local server) has no such menu. The text comes from changes/*.md: shown
// as text, its **bold** and `code` as elements, never as HTML.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, chromeOnly } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BUILD = { commit: 'abc1234', date: '2026-10-20 12:00', since: '15.11.3', changes: [
  { issue: 30, type: 'feature', title: 'A menu', short: ['**A menu:** with `code` and <img src=x onerror="window.__xss = 1">'], detail: ['**A menu (#30):** the detail.'] },
  { issue: 12, type: 'bugfix', title: 'The router: a net routed at every seed', short: [], detail: ['**The router (#12):** fixed.'] },
] };
const menuTitles = (page) => page.eval(() => [...document.querySelectorAll('#menubar .item')].map((e) => e.textContent.trim()));
const rows = (page, sel) => page.eval((s) => [...document.querySelectorAll(`${s} > .mi`)].map((r) => ({ label: r.querySelector('.lbl').textContent, disabled: r.classList.contains('disabled') })), sel);

uiTest('Development menu (#707): after Help, the changes by type, each with its text and issue; all of them; in Portuguese', E, async (page) => {
  assert.deepEqual((await menuTitles(page)).slice(-2), ['Help', 'Development']);
  await page.openMenu('Development');
  assert.deepEqual(await rows(page, 'body > .menu-popup:not(.sub)'), [
    { label: 'Features (1)', disabled: false }, { label: 'Bug fixes (1)', disabled: false }, { label: 'Other (0)', disabled: true },
    { label: 'All Changes since 15.11.3…', disabled: false }, { label: 'This Build on GitHub (commit abc1234)', disabled: false },
    { label: 'Pen and Touch Test…', disabled: false },
    // (the handwritten input, a preview, #1098: on an open truth table or schematic, none here)
    { label: 'Handwritten Boolean Algebra…', disabled: true }, { label: 'Handwritten Schematic…', disabled: true }]);
  // Features ▸ the change: its window, its text as text (no element from it but its bold and code)
  await page.hover(await page.point('body > .menu-popup > .mi', { index: 0 }));
  await page.waitForSelector('.menu-popup.sub .mi');
  assert.deepEqual(await rows(page, '.menu-popup.sub'), [{ label: '#30 A menu', disabled: false }]);
  await page.click('.menu-popup.sub .mi', { index: 0 });
  await page.waitDialog('#30 A menu');
  const shown = await page.eval(() => {
    const b = document.querySelector('.dlg-overlay .dev-change');
    return { text: b.textContent, bold: [...b.querySelectorAll('b')].map((x) => x.textContent), code: [...b.querySelectorAll('code')].map((x) => x.textContent), img: b.querySelectorAll('img').length, xss: window.__xss ?? null };
  });
  assert.deepEqual(shown, { text: 'A menu: with code and <img src=x onerror="window.__xss = 1">A menu (#30): the detail.', bold: ['A menu:', 'A menu (#30):'], code: ['code'], img: 0, xss: null });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Open Issue #30 on GitHub', 'Close']);
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // All Changes since 15.11.3…: by type, each with its issue's link
  await page.openMenu('Development');
  await page.click('body > .menu-popup > .mi', { text: 'All Changes since 15.11.3…' });
  await page.waitDialog('Changes since 15.11.3');
  assert.deepEqual(await page.eval(() => {
    const b = document.querySelector('.dlg-overlay .dev-changes');
    return { heads: [...b.querySelectorAll('h4')].map((x) => x.textContent), links: [...b.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]) };
  }), { heads: ['Features', 'Bug fixes'], links: [['#30', 'https://github.com/pmnmalo/Silinx-ISE/issues/30'], ['#12', 'https://github.com/pmnmalo/Silinx-ISE/issues/12']] });
  await page.dialogButton('Close');
  await page.waitNoDialog();
  // in Portuguese: the menu's labels, the changes' titles as they are
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.equal((await menuTitles(page)).at(-1), 'Desenvolvimento');
  await page.openMenu('Desenvolvimento');
  assert.deepEqual((await rows(page, 'body > .menu-popup:not(.sub)')).map((r) => r.label), ['Funcionalidades (1)', 'Correções (1)', 'Outras (0)', 'Todas as Alterações desde a 15.11.3…', 'Esta Versão no GitHub (commit abc1234)', 'Teste de Caneta e Toque…',
    'Álgebra Booleana Manuscrita…', 'Esquemático Manuscrito…']);
  await page.hover(await page.point('body > .menu-popup > .mi', { index: 1 }));
  await page.waitForSelector('.menu-popup.sub .mi');
  assert.deepEqual((await rows(page, '.menu-popup.sub')).map((r) => r.label), ['#12 The router: a net routed at every seed']);
  await page.closeMenus();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
}, { build: BUILD });

uiTest('no Development menu without a development build (a release, the local server) (#707)', E, async (page) => {
  assert.equal((await menuTitles(page)).at(-1), 'Help');
  assert.ok(!(await menuTitles(page)).includes('Development'));
});

// #767: the last menu of the bar, its long change titles, a 1024 px window (an iPad's): the submenu opens on the
// menu's left, inside the window; a title cut with an ellipsis, whole in its tooltip
const LONG = { ...BUILD, changes: [{ issue: 30, type: 'feature', title: `A change whose title is long ${'and longer '.repeat(12)}than any window`, short: [], detail: ['**A long one (#30):** x.'] }] };
uiTest('#767 a submenu stays inside the window: the Development menu at 1024 px, a long title cut, whole in its tooltip', E, async (page) => {
  await page.setViewport(1024, 700);
  try {
    // (the modern interface lays itself out again after a resize, narrow mode #266: settled before the menu opens)
    await page.waitFor(() => innerWidth === 1024);
    await page.eval(() => new Promise((r) => setTimeout(r, 500)));
    await page.openMenu('Development');
    await page.hover(await page.point('body > .menu-popup > .mi', { index: 0 }));
    await page.waitForSelector('.menu-popup.sub .mi');
    const box = await page.eval(() => {
      const sub = document.querySelector('.menu-popup.sub'), r = sub.getBoundingClientRect(), lbl = sub.querySelector('.mi .lbl');
      const top = document.querySelector('body > .menu-popup:not(.sub)').getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, W: innerWidth, H: innerHeight, cut: lbl.scrollWidth > lbl.clientWidth, tip: sub.querySelector('.mi').title, menu: [top.left, top.right] };
    });
    assert.ok(box.left >= 0 && box.right <= box.W && box.top >= 0 && box.bottom <= box.H, JSON.stringify(box));
    assert.ok(box.menu[0] >= 0 && box.menu[1] <= box.W, `the menu itself inside the window: ${JSON.stringify(box)}`);
    assert.equal(box.cut, true, 'the long title cut');
    assert.equal(box.tip, `#30 ${LONG.changes[0].title}`);
    await page.closeMenus();
  } finally { await page.setViewport(1400, 900); }
}, { build: LONG });

// #1054: Development ▸ Pen and Touch Test…: what a screen reports of its pointers (a board's pen as 'pen' or as
// 'touch') and what Silinx would do with each; the screen's facts; Copy Report. The mouse and the fingers through
// the browser's own input (CDP), the pen as the pointer events a pen fires (CDP has no pen with tilt everywhere).
const PAD = '.dlg-overlay .ptr-pad';
const pointerRows = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .ptr-pointers tbody tr')].map((r) => [...r.cells].slice(1).map((c) => c.textContent)));
const padInk = (page) => page.eval((s) => { const c = document.querySelector(s); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.filter((v, i) => i % 4 === 3 && v).length; }, PAD);
const padAt = async (page, fx, fy) => page.eval((s, x, y) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width * x, y: r.top + r.height * y }; }, PAD, fx, fy);
const countText = (page) => page.eval(() => document.querySelector('.dlg-overlay .ptr-count').textContent);
const clearPad = async (page) => { await page.click('.dlg-overlay .ptr-clear'); assert.deepEqual(await pointerRows(page), []); };
const HELD = 'Edits; held still: the context menu';

uiTest('#1054 Development ▸ Pen and Touch Test: the mouse, a finger, a long press, two fingers and a pen, their readings and trails; the screen; Copy Report; in Portuguese', E, async (page) => {
  await page.openMenu('Development');
  assert.deepEqual((await rows(page, 'body > .menu-popup:not(.sub)')).at(-3), { label: 'Pen and Touch Test…', disabled: false });
  await page.click('body > .menu-popup > .mi', { text: 'Pen and Touch Test…' });
  await page.waitDialog('Pen and Touch Test');
  await page.waitFor((s) => document.querySelector(s).width > 0, [PAD]);
  // (its area in the theme's colours, #1077: the page's own panel and border)
  assert.ok(await page.eval((s) => { const c = getComputedStyle(document.querySelector(s)), probe = document.createElement('div');
    probe.style.cssText = 'background: var(--panel); border: 1px solid var(--border)'; document.body.append(probe);
    const p = getComputedStyle(probe), same = c.backgroundColor === p.backgroundColor && c.borderTopColor === p.borderTopColor; probe.remove(); return same; }, PAD));
  assert.equal(await countText(page), 'Pointers down at once: 0 (most: 0)');
  assert.deepEqual(await pointerRows(page), []);
  // the screen's facts, against the page's own
  const facts = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .ptr-screen tr')].map((r) => [r.cells[0].textContent, r.cells[1].textContent]));
  const own = await page.eval(() => { const q = (m) => (matchMedia(m).matches ? 'yes' : 'no'); return [['navigator.maxTouchPoints', String(navigator.maxTouchPoints)], ['(pointer: coarse)', q('(pointer: coarse)')],
    ['(any-pointer: fine)', q('(any-pointer: fine)')], ['(hover: none)', q('(hover: none)')], ['devicePixelRatio', String(devicePixelRatio)], ['viewport', `${innerWidth} × ${innerHeight}`]]; });
  assert.deepEqual(facts, own);
  assert.equal(await padInk(page), 0);

  // the mouse: one pointer, primary, edits; its trail drawn; Clear empties it all
  await page.drag(await padAt(page, 0.1, 0.2), await padAt(page, 0.4, 0.6));
  // (a mouse's pressure while pressed: 0.5 by the standard, 0 from CDP's mouse events)
  const m = await pointerRows(page);
  assert.match(m[0]?.[3] ?? '', /^(0|0\.5)$/);
  assert.deepEqual(m.map((x) => x.toSpliced(3, 1)), [['mouse', '1', 'yes', '1 × 1', '0 / 0', '1', 'Lifted', 'Edits, as the mouse']]);
  assert.equal(await countText(page), 'Pointers down at once: 0 (most: 1)');
  assert.ok(await padInk(page) > 50, 'the trail drawn');
  await clearPad(page);
  assert.equal(await padInk(page), 0);
  assert.equal(await countText(page), 'Pointers down at once: 0 (most: 0)');

  // a finger: a touch, primary, edits (held still: the context menu); then a finger held still: the long press
  await page.touchDrag(await padAt(page, 0.2, 0.5), await padAt(page, 0.6, 0.5));
  let r = await pointerRows(page);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0][0], r[0][2], r[0][6], r[0][7], r[0][8]], ['touch', 'yes', '1', 'Lifted', HELD]);
  assert.ok(await padInk(page) > 50);
  await clearPad(page);
  const p = await padAt(page, 0.5, 0.5);
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
  assert.equal(await countText(page), 'Pointers down at once: 1 (most: 1)');
  assert.deepEqual((await pointerRows(page)).map((x) => [x[0], x[7], x[8]]), [['touch', 'Pressed', HELD]]);
  await page.waitFor(() => document.querySelector('.dlg-overlay .ptr-pointers tbody tr td:last-child')?.textContent === 'Long press: the context menu', [], { timeout: 3000 });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual((await pointerRows(page)).map((x) => [x[0], x[7], x[8]]), [['touch', 'Lifted', 'Long press: the context menu']]);
  await clearPad(page);

  // two fingers: the second one is the two-finger pan and zoom
  await page.touchGesture([[await padAt(page, 0.2, 0.3), await padAt(page, 0.3, 0.3)], [await padAt(page, 0.7, 0.7), await padAt(page, 0.8, 0.7)]]);
  r = await pointerRows(page);
  assert.deepEqual(r.map((x) => [x[0], x[2], x[7], x[8]]), [['touch', 'yes', 'Lifted', HELD], ['touch', 'no', 'Lifted', 'Two-finger pan and zoom']]);
  assert.notEqual(r[0][1], r[1][1], 'two pointer ids');
  assert.equal(await countText(page), 'Pointers down at once: 0 (most: 2)');
  await clearPad(page);

  // a pen: hovering, then pressed with its pressure, contact and tilt; a pen is never the two-finger gesture
  await page.eval((s) => {
    const c = document.querySelector(s), b = c.getBoundingClientRect();
    const pen = (type, i, buttons, pressure) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, view: window, pointerId: 7, pointerType: 'pen', isPrimary: true,
      clientX: b.left + 20 + 10 * i, clientY: b.top + 30 + 5 * i, button: type === 'pointermove' ? -1 : 0, buttons, pressure, width: 1, height: 1, tiltX: 20, tiltY: -10 }));
    pen('pointermove', 0, 0, 0);
    window.__hover = document.querySelector('.dlg-overlay .ptr-pointers tbody tr').cells[8].textContent;
    pen('pointerdown', 1, 1, 0.7);
    for (let i = 2; i < 8; i++) pen('pointermove', i, 1, 0.7);
    pen('pointerup', 8, 0, 0);
  }, PAD);
  assert.equal(await page.eval(() => window.__hover), 'Hovering');
  assert.deepEqual(await pointerRows(page), [['pen', '7', 'yes', '0.7', '1 × 1', '20 / -10', '1', 'Lifted', HELD]]);
  assert.ok(await padInk(page) > 20);

  // Copy Report: on the clipboard and shown, in English
  await page.click('.dlg-overlay .ptr-copy');
  const report = await page.eval(() => document.querySelector('.dlg-overlay .ptr-report').textContent);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .ptr-copied').textContent), 'Report copied to the clipboard');
  const ua = await page.eval(() => navigator.userAgent), screen = own.map(([k, v]) => `${k} ${v}`).join(' · ');
  const version = await page.eval(async () => (await import('/core/version.js')).VERSION);
  assert.equal(report, ['Silinx ISE: pen and touch test', `Silinx ISE ${version} (commit abc1234)`, `Browser: ${ua}`, `Screen: ${screen}`, 'Pointers down at once (most): 1', 'Pointers (1):',
    `  pen #7 primary · pressure 0.7 · contact 1 × 1 · tilt 20 / -10 · buttons 1 · 9 events · Lifted · Silinx: ${HELD}`, ''].join('\n'));
  assert.equal(await page.eval(async () => (await import('/js/clipboard.js')).readClip('text')), report);

  // in Portuguese: the labels, the states and Silinx's actions; the readings and the report as they are
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span').textContent === 'Teste de Caneta e Toque');
  assert.equal(await countText(page), 'Ponteiros premidos ao mesmo tempo: 0 (máximo: 1)');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .ptr-pointers th')].map((t) => t.textContent)), ['', 'Tipo', 'ID', 'Primário', 'Pressão', 'Contacto', 'Inclinação', 'Botões', 'Estado', 'Silinx']);
  assert.deepEqual(await pointerRows(page), [['pen', '7', 'yes', '0.7', '1 × 1', '20 / -10', '1', 'Levantado', 'Edita; parado: o menu de contexto']]);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .ptr-test button')].map((b) => b.textContent)), ['Limpar', 'Copiar Relatório']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .ptr-report').textContent), report);
  await page.dialogButton('Fechar');
  await page.waitNoDialog();
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
}, { build: BUILD, skip: chromeOnly });

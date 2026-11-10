// UI (#2887): the editors' tabs reordered by dragging, as in a browser. A tab dragged between two others lands there (the
// row and the documents' order), a slot marking the place while it is dragged; a click still selects a tab and the close
// button still closes it; Escape, or a drop outside the rows, leaves it where it was; Alt+Shift+← / → moves a focused
// tab (named in its tooltip and the Keyboard Shortcuts); a finger drags it too (pointer events of pointerType touch); the
// order kept through Simulate and back and a reload of the project. In a split: reordered within a side, moved to a
// chosen place of the other side's row or to its pane's row end, kept by a reload. Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ent = (n) => `library ieee;\nuse ieee.std_logic_1164.all;\nentity ${n} is\n  port (x : in std_logic; y : out std_logic);\nend ${n};\narchitecture rtl of ${n} is\nbegin\n  y <= x;\nend rtl;\n`;
const TB = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity tb_a is\nend tb_a;\narchitecture sim of tb_a is\n  signal x, y : std_logic := \'0\';\nbegin\n  uut: entity work.a port map (x => x, y => y);\nend sim;\n';
const FILES = { 'src/a.vhd': ent('a'), 'src/b.vhd': ent('b'), 'src/c.vhd': ent('c'), 'sim/tb_a.vhd': TB };
const HINT = 'Drag to move it, or Alt+Shift+← / →';

// the rows of tabs shown (the sources' only; * in front): { one } or { a, b } in a split
const rows = (page) => page.eval(() => {
  const lbl = (t) => `${t.querySelector('.tlabel').textContent}${t.classList.contains('active') ? '*' : ''}`;
  const of = (el) => [...el.querySelectorAll(':scope > .tab:not(.tab-slot)')].filter((t) => t.getClientRects().length && /\.vhd$/.test(t.querySelector('.tlabel').textContent)).map(lbl);
  const g = [...document.querySelectorAll('#doc-tabs > .tab-group')];
  return g.length ? Object.fromEntries(g.map((x) => [x.dataset.side, of(x)])) : { one: of(document.getElementById('doc-tabs')) };
});
// the sources' order in the documents (S.docs)
const order = (page) => page.eval(() => window.Silinx.docs.filter((d) => /^file:src\//.test(d.id)).map((d) => d.title));
// a point on a tab: its left (l) or right (r) quarter, or its middle
const at = (page, title, where = 'm') => page.eval((t, w) => {
  const r = [...document.querySelectorAll('#doc-tabs .tab')].find((x) => x.querySelector('.tlabel')?.textContent === t && x.getClientRects().length).getBoundingClientRect();
  return { x: r.left + r.width * (w === 'l' ? 0.25 : w === 'r' ? 0.75 : 0.5), y: r.top + r.height / 2 };
}, title, where);
const front = (page, title) => page.waitFor((t) => window.Silinx.active?.title === t, [title], { what: `${title} in front` });
const open = async (page, p, opts) => { await page.eval((f, o) => window.SilinxApp.openFile(f, undefined, undefined, o), p, opts || {}); await front(page, p.split('/').pop()); };
const noWarnings = async (page) => {
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
};

uiTest('#2887 a tab dragged between two others, clicked, closed, cancelled, moved by the keyboard and by a finger; kept through Simulate and a reload', E, async (page) => {
  await makeProject(env, { name: 'TabOrder', top: 'a', files: FILES });
  await page.openProject('TabOrder');
  for (const f of ['src/a.vhd', 'src/b.vhd', 'src/c.vhd']) await open(page, f);
  assert.deepEqual(await rows(page), { one: ['a.vhd', 'b.vhd', 'c.vhd*'] });
  // the tooltip: the path and how to move the tab; focusable
  assert.deepEqual(await page.eval(() => [window.Silinx.active.tab.title, window.Silinx.active.tab.tabIndex]), [`src/c.vhd\n${HINT}`, 0]);

  // c dragged onto b's left half: between a and b, a slot of its width where it lands while it is dragged
  const from = await at(page, 'c.vhd'), to = await at(page, 'b.vhd', 'l');
  await page.mouse('mouseMoved', from.x, from.y);
  await page.mouse('mousePressed', from.x, from.y);
  for (let i = 1; i <= 10; i++) await page.mouse('mouseMoved', from.x + (to.x - from.x) * i / 10, to.y, { buttons: 1 });
  const mid = await page.eval(() => {
    const slot = document.querySelector('#doc-tabs .tab-slot'), src = document.querySelector('#doc-tabs .tab-drag-src');
    return { slot: !!slot?.getClientRects().length, before: slot?.nextElementSibling?.querySelector('.tlabel')?.textContent, src: src?.querySelector('.tlabel').textContent,
      ghost: !!document.querySelector('body > .tab-ghost'), cursor: document.body.classList.contains('dragging-tab') };
  });
  assert.deepEqual(mid, { slot: true, before: 'b.vhd', src: 'c.vhd', ghost: true, cursor: true });
  await page.mouse('mouseReleased', to.x, to.y);
  await page.waitFor(() => window.Silinx.docs.filter((d) => /^file:src\//.test(d.id)).map((d) => d.title).join() === 'a.vhd,c.vhd,b.vhd', [], { what: 'c between a and b' });
  assert.deepEqual(await rows(page), { one: ['a.vhd', 'c.vhd*', 'b.vhd'] });
  assert.equal(await page.eval(() => !!document.querySelector('.tab-slot, .tab-ghost, .tab-drag-src, body.dragging-tab')), false);

  // a click selects (no move)
  await page.click(await at(page, 'a.vhd'));
  await front(page, 'a.vhd');
  assert.deepEqual(await rows(page), { one: ['a.vhd*', 'c.vhd', 'b.vhd'] });

  // Escape while dragging: where it was
  const a = await at(page, 'a.vhd'), past = await at(page, 'b.vhd', 'r');
  await page.mouse('mousePressed', a.x, a.y);
  for (let i = 1; i <= 8; i++) await page.mouse('mouseMoved', a.x + (past.x - a.x) * i / 8, a.y, { buttons: 1 });
  assert.equal(await page.eval(() => document.querySelector('#doc-tabs .tab-slot')?.previousElementSibling?.querySelector('.tlabel')?.textContent), 'b.vhd');
  await page.key('Escape');
  await page.mouse('mouseReleased', past.x, past.y);
  assert.equal(await page.eval(() => !!document.querySelector('.tab-slot, .tab-ghost, .tab-drag-src')), false);
  assert.deepEqual(await order(page), ['a.vhd', 'c.vhd', 'b.vhd']);
  // dropped outside the row (the editor below): where it was
  const pane = await page.eval(() => { const r = window.Silinx.active.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.drag(await at(page, 'a.vhd'), pane, { steps: 10 });
  assert.deepEqual(await order(page), ['a.vhd', 'c.vhd', 'b.vhd']);
  assert.deepEqual(await rows(page), { one: ['a.vhd*', 'c.vhd', 'b.vhd'] });

  // the keyboard: the focused tab b one place left, right to the row's end and past it (nothing), left
  await page.eval(() => window.Silinx.docs.find((d) => d.title === 'b.vhd').tab.focus());
  await page.key('ArrowLeft', { modifiers: 1 | 8 });   // Alt+Shift
  await page.waitFor(() => window.Silinx.active?.title === 'b.vhd', [], { what: 'b moved and in front' });
  assert.deepEqual(await order(page), ['a.vhd', 'b.vhd', 'c.vhd']);
  assert.equal(await page.eval(() => document.activeElement?.querySelector?.('.tlabel')?.textContent), 'b.vhd', 'the tab keeps the focus');
  await page.key('ArrowRight', { modifiers: 1 | 8 });
  await page.key('ArrowRight', { modifiers: 1 | 8 });
  assert.deepEqual(await order(page), ['a.vhd', 'c.vhd', 'b.vhd']);
  await page.key('ArrowRight', { modifiers: 1 | 8 });   // (the row's end: nothing)
  assert.deepEqual(await order(page), ['a.vhd', 'c.vhd', 'b.vhd']);
  await page.key('ArrowLeft', { modifiers: 1 | 8 });
  assert.deepEqual(await order(page), ['a.vhd', 'b.vhd', 'c.vhd']);

  // a finger: a dragged onto c's right half, the row's end
  await page.touchGesture([[await at(page, 'a.vhd'), await at(page, 'c.vhd', 'r')]], { steps: 10 });
  await page.waitFor(() => window.Silinx.docs.filter((d) => /^file:src\//.test(d.id)).map((d) => d.title).join() === 'b.vhd,c.vhd,a.vhd', [], { what: 'a moved by a finger' });
  assert.deepEqual(await rows(page), { one: ['b.vhd', 'c.vhd', 'a.vhd*'] });

  // the close button closes (no drag)
  await page.click('#doc-tabs .tab.active .tclose');
  await page.waitFor(() => !window.Silinx.docs.some((d) => d.title === 'a.vhd'), [], { what: 'a closed' });
  await open(page, 'src/a.vhd');
  assert.deepEqual(await rows(page), { one: ['b.vhd', 'c.vhd', 'a.vhd*'] });
  await page.eval(() => window.SilinxApp.activateDoc(window.Silinx.docs.find((d) => d.title === 'c.vhd')));
  await page.drag(await at(page, 'c.vhd'), await at(page, 'b.vhd', 'l'), { steps: 10 });
  await page.waitFor(() => window.Silinx.docs.filter((d) => /^file:src\//.test(d.id)).map((d) => d.title).join() === 'c.vhd,b.vhd,a.vhd', [], { what: 'c first' });

  // Simulate and back: Design's order as it was
  const tasks = await page.eval(() => document.documentElement.dataset.layout === 'tasks');
  await open(page, 'sim/tb_a.vhd', { task: 'sim' });
  if (tasks) {
    await page.waitFor(() => document.documentElement.dataset.task === 'sim', [], { what: 'Simulate' });
    assert.deepEqual(await rows(page), { one: ['tb_a.vhd*'] });
    await page.click('#task-switch .task-btn[data-task="edit"]');
    await page.waitFor(() => document.documentElement.dataset.task === 'edit', [], { what: 'Design' });
  } else { await page.setView('sim'); await page.setView('impl'); }
  assert.deepEqual((await rows(page)).one.map((t) => t.replace(/\*$/, '')).filter((t) => t !== 'tb_a.vhd'), ['c.vhd', 'b.vhd', 'a.vhd']);
  await page.eval(() => window.SilinxApp.activateDoc(window.Silinx.docs.find((d) => d.title === 'b.vhd')));

  // kept with the project: a reload opens them in that order
  await page.reload();
  await page.waitFor(() => ['a.vhd', 'b.vhd', 'c.vhd'].every((t) => window.Silinx.docs.some((d) => d.title === t)) && window.Silinx.active?.title === 'b.vhd', [], { what: 'the documents again', timeout: 20000 });
  assert.deepEqual(await order(page), ['c.vhd', 'b.vhd', 'a.vhd']);
  assert.deepEqual((await rows(page)).one.filter((t) => t !== 'tb_a.vhd'), ['c.vhd', 'b.vhd*', 'a.vhd']);   // (the test bench reopened in Design)

  // the shortcut in Keyboard Shortcuts; Portuguese
  await page.menu('Help', 'Keyboard Shortcuts');
  await page.waitDialog('Keyboard Shortcuts');
  assert.ok((await page.eval(() => [...document.querySelectorAll('.dlg-overlay tr')].map((r) => [...r.cells].map((c) => c.textContent)))).some(([k, v]) => k === 'Alt+Shift+← / →' && v === 'Move the focused document tab left / right (or drag it)'));
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.equal(await page.eval(() => window.Silinx.active.tab.title), 'src/b.vhd\nArraste para o mover, ou Alt+Shift+← / →');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await noWarnings(page);
});

uiTest('#2887 in a split: reordered within a side, moved to a chosen place of the other side, to its pane; kept by a reload', E, async (page) => {
  await makeProject(env, { name: 'TabOrderSplit', top: 'a', files: FILES });
  await page.openProject('TabOrderSplit');
  for (const f of ['src/a.vhd', 'src/b.vhd', 'src/c.vhd']) await open(page, f);
  await page.click('#split-btn');
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split'), [], { what: 'split' });
  assert.deepEqual(await rows(page), { a: ['a.vhd', 'b.vhd', 'c.vhd*'], b: [] });

  // a dragged to the right side's empty pane: there, in front
  const pane = await page.eval(() => { const r = document.getElementById('split-empty').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.drag(await at(page, 'a.vhd'), pane, { steps: 12 });
  await page.waitFor(() => window.Silinx.active?.title === 'a.vhd' && window.Silinx.active.side === 'b', [], { what: 'a on the right' });
  assert.deepEqual(await rows(page), { a: ['b.vhd', 'c.vhd'], b: ['a.vhd*'] });
  // c to the right side's row, before a (a's left half)
  await page.drag(await at(page, 'c.vhd'), await at(page, 'a.vhd', 'l'), { steps: 12 });
  await page.waitFor(() => window.Silinx.active?.title === 'c.vhd' && window.Silinx.active.side === 'b', [], { what: 'c on the right' });
  assert.deepEqual(await rows(page), { a: ['b.vhd'], b: ['c.vhd*', 'a.vhd'] });
  // within the right side: c after a
  await page.drag(await at(page, 'c.vhd'), await at(page, 'a.vhd', 'r'), { steps: 12 });
  await page.waitFor(() => window.Silinx.docs.filter((d) => /^file:src\//.test(d.id)).map((d) => d.title).join() === 'b.vhd,a.vhd,c.vhd', [], { what: 'c after a' });
  assert.deepEqual(await rows(page), { a: ['b.vhd'], b: ['a.vhd', 'c.vhd*'] });
  // the keyboard, in a side: c back before a
  await page.eval(() => window.Silinx.docs.find((d) => d.title === 'c.vhd').tab.focus());
  await page.key('ArrowLeft', { modifiers: 1 | 8 });
  await page.waitFor(() => window.Silinx.docs.filter((d) => /^file:src\//.test(d.id)).map((d) => d.title).join() === 'b.vhd,c.vhd,a.vhd', [], { what: 'c before a' });
  assert.deepEqual(await rows(page), { a: ['b.vhd'], b: ['c.vhd*', 'a.vhd'] });
  // the menu's Move to the Other Side: at the row's end there
  await page.rightClick(await at(page, 'a.vhd'));
  await page.click('body > .menu-popup .mi', { text: 'Move to the Other Side' });
  await page.waitFor(() => window.Silinx.active?.title === 'a.vhd' && window.Silinx.active.side === 'a', [], { what: 'a moved back' });
  assert.deepEqual(await rows(page), { a: ['b.vhd', 'a.vhd*'], b: ['c.vhd'] });

  // kept: a reload comes back split, each side in its order
  await page.reload();
  await page.waitFor(() => document.getElementById('workspace').classList.contains('split') && ['a.vhd', 'b.vhd', 'c.vhd'].every((t) => window.Silinx.docs.some((d) => d.title === t)), [], { what: 'split again', timeout: 20000 });
  assert.deepEqual((await rows(page)), { a: ['b.vhd', 'a.vhd*'], b: ['c.vhd'] });
  await noWarnings(page);
});

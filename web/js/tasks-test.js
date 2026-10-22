// The Tasks interface's Edit: its Test page (#1016, #782), a tab right after Design: the project's test benches (the
// sources of association Simulation), so that the Design page shows the design alone. Its tree is drawn with the
// Design pane's (web/js/design.js renderHierarchy, into #test-tree): a test bench opens, is checked and leaves the
// project as from Design; the page's button (and its context menu) adds one with the Test Bench Wizard, or a copy
// of a source. Built while the Tasks interface is the interface (web/js/tasks.js build / unbuild).

import { h, popupMenu } from './ui.js';
import { icons } from './icons.js';
import { leftTabClicked } from './narrow.js';

/** The Test tab (after Design's) and its page (after Design's); `newBench`: the Test Bench Wizard, the new one Simulate's. */
export function buildTestPage(app, newBench) {
  const $ = id => document.getElementById(id);
  if ($('test-page')) return;
  const add = () => newBench(app);
  const menu = e => {
    if (e.target.closest('.row')) return;   // (a test bench's own menu: the Design pane's)
    e.preventDefault();
    popupMenu([
      { label: 'New Test Bench (Wizard)…', action: add, disabled: !app.S.project },
      { label: 'Add Copy of Source…', action: async () => (await import('./wizards.js')).addSourceDialog(), disabled: !app.S.project },
    ], e.clientX, e.clientY);
  };
  const tab = h('div', { class: 'tab', 'data-page': 'test', role: 'tab', tabindex: '0' },
    h('span', { class: 'ico-inline tab-ico', html: icons.mTest }), h('span', { class: 'tab-lbl' }, 'Test'));
  tab.addEventListener('click', () => {
    leftTabClicked('test', document.querySelector('#left-tabs .tab.active')?.dataset.page);
    app.showLeftPage('test');
  });
  tab.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tab.click(); } });
  document.querySelector('#left-tabs .tab[data-page="design"]').after(tab);
  document.querySelector('.left-page[data-page="design"]').after(h('div', { class: 'left-page', 'data-page': 'test', hidden: true },
    h('div', { class: 'ise-panel fill' }, h('div', { class: 'caption' }, 'Test Benches'),
      h('div', { class: 'body', id: 'test-page', oncontextmenu: menu },
        h('div', { id: 'test-tree' }),
        h('p', { class: 'test-none', hidden: true }, 'The project has no test bench yet.'),
        h('button', { class: 'btn test-new', type: 'button', onclick: add }, 'New Test Bench (Wizard)…')))));
}

/** The test benches' tree drawn (`tree`: null with no project): the page says when there is none. */
export function showTestTree(tree, count) {
  const host = document.getElementById('test-tree');
  if (!host) return;
  host.replaceChildren(...(tree ? [tree] : []));
  const page = document.getElementById('test-page');
  page.querySelector('.test-none').hidden = !tree || count > 0;
  page.querySelector('.test-new').disabled = !tree;
}

/** The Tasks interface left: its tab and page leave, Design in front if the Test page was. */
export function unbuildTestPage(app) {
  const shown = document.querySelector('#left-tabs .tab.active')?.dataset.page === 'test';
  document.querySelector('#left-tabs .tab[data-page="test"]')?.remove();
  document.querySelector('.left-page[data-page="test"]')?.remove();
  if (shown) app.showLeftPage('design');
}

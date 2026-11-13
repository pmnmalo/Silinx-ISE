// Simulate's Files page (#1395): a tab beside Simulation, as Design's pages, listing the test benches' files (the
// simulation sources), each opened in Simulate by a double-click, its menu Open, Rename…, Check Syntax, Remove from
// Project and Source Properties…. Simulate's side panel (web/js/tasks-sim-panel.js) and SSim's tree (web/js/viewers.js)
// have it, the page in front the same in every one.

import { h, popupMenu } from './ui.js';
import { icon, icons } from './icons.js';
import { designKind } from './project-kind-flag.js';

let page = 'tree';   // ('tree': Simulation; 'files')
const panels = new Set();

/** A panel's pages: `tabs` its .task-sim-tabs (Simulation's tab in it), `tree` the Simulation page's elements (the Files
 *  page after them). */
export function mountSimPages(app, tabs, tree) {
  const files = h('ul', { class: 'tree task-sim-files' });
  // (each tab its icon, as Design's: the one in front its name too, the others theirs as their tooltip, #1404)
  const sim = tabs.querySelector('.tab');
  Object.assign(sim.dataset, { page: 'tree' });
  sim.title = 'Simulation';
  sim.prepend(h('span', { class: 'ico-inline tab-ico', html: icons.mWave }));
  tabs.append(h('span', { class: 'tab', role: 'tab', 'data-page': 'files', title: 'Files' }, h('span', { class: 'ico-inline tab-ico', html: icons.mFiles }), h('span', { class: 'tab-lbl' }, 'Files')));
  tree.at(-1).after(files);
  const p = { tabs, files, render: () => renderFiles(app, files) };
  panels.add(p);
  tabs.addEventListener('click', e => { const t = e.target.closest('.tab[data-page]'); if (t) show(t.dataset.page); });
  apply(p);
  return { refresh: () => page === 'files' && p.render(), destroy: () => panels.delete(p) };
}
function show(to) {
  page = to;
  for (const p of panels) apply(p);
}
// (the page shown by the panel's data-sim-page: the Tasks interface's only, web/css/tasks.css)
function apply(p) {
  // (a design and simulation project, #3780: its test benches' HDL files not shown, no Files page)
  const design = designKind();
  if (design && page === 'files') page = 'tree';
  const ft = p.tabs.querySelector('.tab[data-page="files"]');
  if (ft) ft.hidden = design;
  for (const t of p.tabs.querySelectorAll('.tab[data-page]')) t.classList.toggle('active', t.dataset.page === page);
  p.tabs.parentElement.dataset.simPage = page;
  if (page === 'files') p.render();
}

function renderFiles(app, ul) {
  const paths = (app.S.project?.files || []).filter(f => f.role === 'sim').map(f => f.path).sort((a, b) => a.localeCompare(b));
  if (ul.dataset.key === paths.join()) return;
  ul.dataset.key = paths.join();
  ul.replaceChildren(...paths.map(path => {
    const row = h('div', { class: 'row', 'data-file': path }, h('span', { class: 'twisty' }), icon(/\.v$/i.test(path) ? 'verilog' : 'vhdl'),
      h('span', { class: 'lbl', 'data-no-i18n': '' }, path.split('/').pop()), h('span', { class: 'meta', 'data-no-i18n': '' }, `(${path})`));
    row.addEventListener('click', () => { for (const r of ul.querySelectorAll('.row.sel')) r.classList.remove('sel'); row.classList.add('sel'); });
    row.addEventListener('dblclick', () => open(app, path));
    row.addEventListener('contextmenu', e => { e.preventDefault(); row.click(); popupMenu(fileItems(app, path), e.clientX, e.clientY); });
    return h('li', {}, row);
  }));
}
const open = (app, path) => app.openFile(path, undefined, undefined, { task: 'sim' });
/** A test bench file's menu. */
function fileItems(app, path) {
  return [
    { label: 'Open', action: () => open(app, path) },
    { label: 'Rename…', action: () => import('./rename.js').then(r => r.renameDialog(path)) },
    { label: 'Check Syntax', action: () => import('./processes.js').then(p => p.checkFileSyntax(path)) },
    { label: 'Remove from Project', action: () => import('./design.js').then(d => d.removeFile(path)) },
    '-',
    { label: 'Source Properties…', action: () => import('./wizards.js').then(w => w.sourceProperties(path)) },
  ];
}

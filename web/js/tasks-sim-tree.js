// The Simulation hierarchy's commands in the Tasks interface (#1385), as Design's: New Test Bench… and Import Test
// Bench… (#1501) above it (nothing under it); a test bench's right-click menu, and the hierarchy's empty space's. Simulate's side
// panel (web/js/tasks-sim-panel.js) and SSim's tree (web/js/viewers.js) have them.

import { h } from './ui.js';
import { newBench } from './tasks-sim.js';

const wizards = () => import('./wizards.js');
/** Import Test Bench…: Import Source…, its association Simulation only (#1501). */
const addCopy = () => wizards().then(w => w.addSourceDialog({ role: 'sim', title: 'Import Test Bench' }));
const check = mod => mod && import('./processes.js').then(p => p.checkSyntax(mod, true));

/** A test bench's menu: { label, action } and '-'. */
export function benchItems(app, name) {
  const info = () => app.S.modules.find(m => m.name === name);
  const file = () => info()?.file;
  return [
    { label: 'Open', action: () => { const i = info(); if (i) app.openFile(i.file, i.line, undefined, { task: 'sim' }); } },
    { label: 'Rename…', action: () => import('./rename.js').then(r => r.renameDialog(file(), name)) },
    { label: 'Check Syntax', action: () => check(name) },
    // (its link, the simulation of this test bench, #2883)
    { label: 'Share Module…', action: () => import('./share-how.js').then(m => m.shareDialog({ module: name })) },   // (a copy: a test bench's, #3698)
    '-',
    { label: 'New Test Bench…', action: () => newBench(app) },
    { label: 'Import Test Bench…', action: addCopy },
    { label: 'Remove from Project', action: () => import('./design.js').then(d => d.removeModule(file())) },
    '-',
    { label: 'Source Properties…', action: () => wizards().then(w => w.sourceProperties(file())) },
  ];
}
/** The hierarchy's empty space's menu. */
export function treeItems(app) {
  return [
    { label: 'New Test Bench…', action: () => newBench(app) },
    { label: 'Import Test Bench…', action: addCopy },
  ];
}
/** The bar above a hierarchy: New Test Bench… and Import Test Bench…. */
export function treeBar(app) {
  const b = (label, act, run) => h('button', { class: 'btn', type: 'button', 'data-act': act, onclick: run }, label);
  return h('div', { class: 'task-sim-src-bar' }, b('New Test Bench…', 'new-bench', () => newBench(app)), b('Import Test Bench…', 'add-bench', addCopy));
}
/** The app's menu items in SSim's (its separators { sep: true }). */
export const asSsim = items => items.map(x => (x === '-' ? { sep: true } : x));

// Where the user was (#160, #163; out of web/js/app.js, #2886, moved as it was): the open documents of a project, the
// one in front, the left pane and the Design view, kept in this browser (per project). app.js keeps exporting what moved.
import { api } from './api.js';
import { openCHdl } from './c-source.js';
import { openAsm, openFsm, openPetri, openSch, openTt, openTtSchematic } from './drawings.js';
import { openEmulator, openSchematic, runSimulation } from './viewers.js';
import { prefKey } from './prefs.js';
import { restoreSplit, splitKeys } from './split-view.js';
import { S, activateDoc, closeDoc, moduleInfo, openFile, openImpact, openPinPlanner, openSummary, setView, showLeftPage } from './app.js';

// ---- where the user was (#160, #163): the open documents of a project, the one in front, the left pane
// and the Design view, kept in this browser (per project) so that a reload of the page, or opening
// the project again, comes back to them instead of the Design Summary. The documents that open as
// they were: the sources and their editors, the RTL schematic, the summary, the pin planner, iMPACT,
// and the simulation (SSim) and the board emulator, run again for the same module and model (a
// netlist model only while it exists); not a report or a technology schematic (a run's output).
const VIEW_KEY = name => prefKey(`silinx.view.${name}`);
const inProject = p => S.fileTree?.includes(p);
const REOPEN = [
  [/^file:(.+)$/, p => inProject(p) && openFile(p)], [/^sch:(.+)$/, p => inProject(p) && openSch(p)],
  [/^asm:(.+)$/, p => inProject(p) && openAsm(p)], [/^tt:(.+)$/, p => inProject(p) && openTt(p)], [/^ttsch:(.+)$/, p => inProject(p) && openTtSchematic(p)],
  [/^fsm:(.+)$/, p => inProject(p) && openFsm(p)], [/^pn:(.+)$/, p => inProject(p) && openPetri(p)], [/^rtl:(.+)$/, m => moduleInfo(m) && openSchematic(m, { task: null })],
  [/^isim:([^@]+)(?:@(\w+))?$/, async (mod, model) => await reopenable(mod, model) && runSimulation(mod, model || undefined)],
  [/^emulator:([^@]+)(?:@(\w+))?$/, async (mod, model) => await reopenable(mod, model) && openEmulator(mod, { model: model || null })],
  [/^chdl:(.+)$/, p => inProject(p) && openCHdl(p)],   // (a C source's HDL, beside it: #1619)
  [/^summary$/, () => openSummary()], [/^pins$/, () => S.project.top && openPinPlanner()], [/^impact$/, () => openImpact()],
];
// a module of the project, and its netlist model when one is asked for (no message when it is gone)
async function reopenable(mod, model) {
  if (!moduleInfo(mod)) return false;
  if (!model) return true;
  const rep = await api.reports(S.project.name).catch(() => null);
  return !!(rep?.simModels?.[model] && rep.top === S.project.top);
}
const reopenKey = d => d.reopen || d.id;
let keepView = false;   // while documents are closed or reopened together (a project closed, restored)
// whether the view state is kept as it is now (documents closed or reopened together): read by the document opening
export const viewKept = () => keepView;
// every document closed, the view state kept as it was (a project closed or another opened): false when one stays open
export async function closeAllDocs() {
  keepView = true;
  try { for (const d of [...S.docs]) if (!await closeDoc(d)) return false; } finally { keepView = false; }
  return true;
}
export function saveViewState() {
  if (keepView || !S.project) return;
  const open = S.docs.filter(d => d.project === S.project.name && REOPEN.some(([re]) => re.test(reopenKey(d)))).map(reopenKey);
  const active = S.active && reopenKey(S.active);
  const state = { open, active: open.includes(active) ? active : null, page: S.leftPage || null, view: S.view, split: splitKeys(reopenKey, open) };
  try { localStorage.setItem(VIEW_KEY(S.project.name), JSON.stringify(state)); } catch { /* storage unavailable */ }
}
function savedViewState(name) {
  try { const v = JSON.parse(localStorage.getItem(VIEW_KEY(name)) || 'null'); return v && Array.isArray(v.open) ? v : null; } catch { return null; }
}
/** Reopens the project's documents as they were; false when nothing was kept (a first opening). */
export async function restoreViewState(name) {
  const v = savedViewState(name);
  if (!v) return false;
  keepView = true;
  try {
    if (v.view === 'sim' || v.view === 'impl') { if (v.view !== S.view) setView(v.view); }
    if (['design', 'files', 'libs'].includes(v.page)) showLeftPage(v.page);
    for (const id of v.open) {
      const [re, open] = REOPEN.find(([r]) => r.test(id)) || [];
      if (!re) continue;
      try { await open(...re.exec(id).slice(1)); } catch { /* a document that cannot open any more */ }
    }
    restoreSplit(v.split, k => S.docs.find(d => reopenKey(d) === k), v.open);   // (in the kept order, #2887)
    const active = v.active && S.docs.find(d => reopenKey(d) === v.active);
    if (active) activateDoc(active);
  } finally { keepView = false; }
  saveViewState();
  return true;
}

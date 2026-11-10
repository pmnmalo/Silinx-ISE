// Copy Link… (#2826): the link that opens the project in Silinx (for lecture slides), the whole project inside it
// (core/design-link.js encodeDesign), and what it opens: the project only, Try it (a schematic's), the simulation (the
// test bench), the board emulator; the module; a guided lab opened beside it (#3179). The link is shown as it is made, its length with it; one too large
// for a link (a zip hosted elsewhere then) or a view the design does not have is said in the dialog, and the copy in
// the console. Anyone with the link has the whole project, its comments too: the dialog says so (#2829).
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app } from './app.js';
import { writeClip } from './clipboard.js';
import { LINK_LIMITS, encodeDesign, encodeUi, makeLink, viewProblem } from '/core/design-link.js';
import { currentViewState } from './view-state.js';
import { layoutNow } from './tasks.js';
import { browserCodec, textOf } from '/core/zip.js';
import { gateZip } from '/core/import-gate.js';

const VIEWS = [['', 'Open the project only'], ['try', 'Try it (a drawing\'s simulation)'], ['simulate', 'Simulation'], ['emulate', 'Board Emulator']];
/** The address of this app, the base of its links (its hash, a token or a link, left out). */
export const linkBase = () => location.origin + location.pathname;

/** The Copy Link… dialog of the open project: module and view chosen first (a module's context menu). Resolves to
 *  the link copied, or null. */
export async function copyLinkDialog({ module = null, view = null } = {}) {
  if (!S.project) return null;
  const name = S.project.name;
  let entries;
  try { entries = (await gateZip(new Uint8Array(await (await api.exportZip(name, 'silinx')).blob.arrayBuffer()), browserCodec())).files; } catch (e) { app.log(`ERROR: Copy Link: ${e.message}`, 'err'); return null; }
  const files = Object.fromEntries(entries.filter(e => e.path !== 'silinx.json').map(e => [e.path, textOf(e)]));
  let design = null, encodeError = null;
  try { design = (await encodeDesign(entries)).design; } catch (e) { encodeError = e.message; }
  // the Module list follows Open in (#2878): the simulation's, the test benches (the project's first); the others', the
  // design's modules (its top first), no test bench
  const pj = S.project, byName = (a, b) => a.localeCompare(b);
  const benches = [...new Set([pj.simTop, ...(S.modules || []).filter(m => m.role === 'sim').map(m => m.name).sort(byName)].filter(Boolean))];
  const designMods = [...new Set([pj.top, ...(S.modules || []).filter(m => m.role !== 'sim').map(m => m.name)].filter(Boolean))];
  const viewSel = h('select', { 'data-field': 'view' }, ...VIEWS.map(([v, l]) => h('option', { value: v, selected: v === (view || '') }, l)));
  const modSel = h('select', { 'data-field': 'module' });
  // (a test bench given, from the Simulation hierarchy's menu: the simulation, that test bench chosen, #2883)
  const givenBench = module && benches.includes(module) ? module : null;
  if (givenBench && !view) viewSel.value = 'simulate';
  let chosen = { design: givenBench ? pj.top : module || pj.top, bench: givenBench || pj.simTop };
  const isSim = () => viewSel.value === 'simulate';
  // (the board emulator emulates the top module, its pins the constraints': the list disabled on it, #2884)
  const isEmu = () => viewSel.value === 'emulate';
  const fillModules = () => {
    const [list, sel, mark, tag] = isSim() ? [benches, chosen.bench, pj.simTop, 'the project\'s'] : [isEmu() ? designMods.slice(0, 1) : designMods, isEmu() ? pj.top : chosen.design, pj.top, 'top'];
    modSel.replaceChildren(...list.map(m => h('option', { value: m, selected: m === sel }, m === mark ? `${m} (${tag})` : m)));
    modSel.disabled = isEmu() || (!viewSel.value && !module);
  };
  fillModules();
  const out = h('textarea', { class: 'link-out', readonly: true, rows: 4, spellcheck: false, style: { width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: '11px' } });
  const info = h('div', { class: 'hint link-info' });
  const err = h('div', { class: 'wiz-error link-error' });
  // Silinx as it is now (#2886): the open tabs, the one in front, the split, the panels, the task
  const ui = encodeUi(currentViewState(), layoutNow());
  const withView = h('input', { type: 'checkbox', 'data-field': 'ui', checked: true });
  // the guided labs of the project (core/labs.js): the one in front chosen
  const { projectLabs } = await import('./lab-view.js');
  const { localize } = await import('/core/labs.js');
  const { getLanguage } = await import('./i18n.js');
  const labs = (await projectLabs(name).catch(() => ({ labs: [] }))).labs;
  const front = /^lab:(.+)$/.exec(S.active?.id || '')?.[1];
  const labSel = h('select', { 'data-field': 'lab' }, h('option', { value: '' }, 'No lab'),
    ...labs.map(l => h('option', { value: l.id, selected: l.id === front, 'data-no-i18n': '' }, localize(l.lab.title, getLanguage() === 'pt' ? 'pt' : 'en'))));
  let link = null;
  const update = () => {
    link = null;
    out.value = ''; info.textContent = ''; err.textContent = '';
    if (encodeError) { err.textContent = encodeError; return; }
    // (the module: in the link when it is not the project's top, or when the link is a module's: Copy Link to This
    // Module…, the project then opened on it, #2871; a test bench when it is not the project's, #2878)
    // (Open the project only, from the project's Copy Link…: no module, the project opened with no source in front,
    // #3230; a module's Copy Link to This Module… keeps its module, #2871)
    const top = !modSel.value || isEmu() || (!viewSel.value && !module) ? null : isSim() ? (givenBench || modSel.value !== pj.simTop ? modSel.value : null) : ((module && !givenBench) || modSel.value !== pj.top ? modSel.value : null);
    const problem = viewProblem(S.project, files, { view: viewSel.value || null, top });
    if (problem) { err.textContent = `${problem[0].toUpperCase()}${problem.slice(1)}.`; return; }
    link = makeLink(linkBase(), { design, view: viewSel.value || null, top, ui: withView.checked ? ui : null, lab: labSel.value || null });
    out.value = link;
    info.textContent = link.length > LINK_LIMITS.slides
      ? `${link.length} characters: some slide tools cut a link longer than ${LINK_LIMITS.slides} (export the project as a .zip, host it, and link to it with #open=).`
      : `${link.length} characters.`;
  };
  viewSel.addEventListener('change', () => { fillModules(); update(); });
  withView.addEventListener('change', update);
  labSel.addEventListener('change', update);
  modSel.addEventListener('change', () => { if (!isEmu()) chosen = { ...chosen, [isSim() ? 'bench' : 'design']: modSel.value }; update(); });
  update();
  const r = await dialog({
    title: 'Copy Link', width: 560,
    body: h('div', {},
      h('div', { class: 'hint' }, `A link that opens '${name}' in Silinx, for slides or a message: the whole project is inside the link (no file to host). Anyone with the link has every file of the project, its comments too.`),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        h('label', {}, 'Open in:'), viewSel,
        h('label', {}, 'Module:'), modSel,
        h('label', {}, 'Board:'), h('span', { class: 'link-board' }, S.project.board || 'none'),
        h('label', {}, 'Lab:'), labSel,
        h('span'), h('label', { class: 'link-ui' }, withView, h('span', {}, 'Include the current view: the open tabs, the split, the panels'))),
      out, info, err),
    buttons: [{ label: 'Copy Link', primary: true, value: true, validate: () => !!link }, { label: 'Cancel', value: null }],
  });
  if (!r || !link) return null;
  writeClip('text', link);
  app.log(`Copy Link: the link of '${name}'${viewSel.value ? ` (${VIEWS.find(([v]) => v === viewSel.value)[1]}, ${modSel.value})` : ''}${labSel.value ? `, opening the lab '${labSel.value}'` : ''} copied, ${link.length} characters.`, 'ok');
  if (link.length > LINK_LIMITS.slides) app.log(`WARNING: Copy Link: the link is ${link.length} characters long: some slide tools cut a link longer than ${LINK_LIMITS.slides}.`, 'warn');
  return link;
}

// Share Project… and Share Module…'s copy (#2826, #3628, #3698: web/js/share-how.js): the link that opens the project
// in Silinx (for lecture slides), the whole project inside it
// (core/design-link.js encodeDesign), and what it opens: the project only, Try it (a schematic's), the simulation (the
// test bench), the board emulator; the module; a guided lab opened beside it (#3179). The link is shown as it is made, its length with it; one too large
// for a link (a zip hosted elsewhere then) or a view the design does not have is said in the dialog, and the copy in
// the console. Anyone with the link has the whole project, its comments too: the dialog says so (#2829). The link is
// the full one (the project inside it) or a short one (#3223, core/gist-link.js): the project encrypted here and saved
// as a secret gist of the user's GitHub account, made when it is copied, its key in the link; with no GitHub sign-in
// (the browser edition's) or token (a server's GH_TOKEN), the dialog offers the sign-in, or the full link.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app } from './app.js';
import { writeClip } from './clipboard.js';
import { LINK_LIMITS, encodeDesign, encodeUi, makeLink, viewProblem } from '/core/design-link.js';
import { currentViewState } from './view-state.js';
import { layoutNow } from './tasks.js';
import { browserCodec, textOf } from '/core/zip.js';
import { gateZip } from '/core/import-gate.js';
import { naturalCompare } from '/core/hier-order.js';
import { EXPIRY_DAYS } from '/core/gist-link.js';
import { rememberLink, shortLinksDialog } from './short-links.js';
import { qrBox } from './link-qr.js';
import { QR_MAX_BYTES } from '/core/qr.js';
import { howRow, shareTitle } from './share-how.js';

const VIEWS = [['', 'Open the project only'], ['try', 'Try it (a drawing\'s simulation)'], ['simulate', 'Simulation'], ['emulate', 'Board Emulator']];
/** The address of this app, the base of its links (its hash, a token or a link, left out). */
const linkBase = () => location.origin + location.pathname;

/** Share Project…'s window, a copy of the open project (Share Module…: module and view chosen first, a module's
 *  context menu). Resolves to the link copied, or null (or the live window's, the way switched). */
export async function copyLinkDialog({ module = null, view = null } = {}) {
  if (!S.project) return null;
  const name = S.project.name;
  const action = shareTitle(module);   // (the window's title, its messages' name, #3698)
  let entries;
  try { entries = (await gateZip(new Uint8Array(await (await api.exportZip(name, 'silinx')).blob.arrayBuffer()), browserCodec())).files; } catch (e) { app.log(`ERROR: ${action}: ${e.message}`, 'err'); return null; }
  const files = Object.fromEntries(entries.filter(e => e.path !== 'silinx.json').map(e => [e.path, textOf(e)]));
  let design = null, encodeError = null;
  try { design = (await encodeDesign(entries)).design; } catch (e) { encodeError = e.message; }
  // the Module list follows Open in (#2878): the simulation's, the test benches (the project's first); the others', the
  // design's modules (its top first), no test bench
  const pj = S.project;
  const benches = [...new Set([pj.simTop, ...(S.modules || []).filter(m => m.role === 'sim').map(m => m.name).sort(naturalCompare)].filter(Boolean))];
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
  // the link's form: full, or short (a gist, made on the Copy Link button)
  const short = h('input', { type: 'radio', name: 'link-form', value: 'short', 'data-field': 'short' });
  const full = h('input', { type: 'radio', name: 'link-form', value: 'full', checked: true, 'data-field': 'full' });
  const signIn = h('a', { href: '#', class: 'link-signin', style: { display: 'none' }, onclick: async e => { e.preventDefault(); if (await (await import('./git-signin.js')).signInDialog()) update(); } }, 'Sign in with GitHub…');
  // (a short link's expiry, #3629: core/gist-link.js EXPIRY_DAYS; the full link's never)
  const EXPIRY = { 0: 'Never', 7: 'In a week', 30: 'In a month', 182: 'In six months', 365: 'In a year' };
  const expiry = h('select', { 'data-field': 'expires', disabled: true }, ...EXPIRY_DAYS.map(d => h('option', { value: String(d) }, EXPIRY[d])));
  // (its QR code, #3637: the link shown; a short link's once made, by Show QR Code or Copy Link, for its expiry)
  const qr = qrBox();
  let link = null, opts = null, made = null, madeFor = null, saidLong = false, manage = false, closeIt = null;
  const shortLink = () => makeLink(linkBase(), { gist: `${made.id}.${made.key}`, ...opts });
  // the short link's gist, made now (with the browser's sign-in, or the server's token); false: why not, said
  const makeShort = async () => {
    if (made && madeFor === expiry.value) return true;
    if (!await api.gistAvailable()) {
      err.textContent = api.standalone ? 'A short link needs your GitHub sign-in: sign in, or choose the full link.' : 'A short link needs a GitHub token on the Silinx server (GH_TOKEN): choose the full link, or start the server with one.';
      if (api.standalone) signIn.style.display = '';
      return false;
    }
    try {
      made = await api.gistSave(design, Number(expiry.value));
      madeFor = expiry.value;
      rememberLink({ id: made.id, link: shortLink(), project: name, expires: made.expires || null });   // (Short Links…, #3635)
      return true;
    } catch (e) { err.textContent = e.hint ? `${e.message}: ${e.hint}` : e.message; return false; }
  };
  const update = () => {
    expiry.disabled = !short.checked;
    link = null;
    out.value = ''; info.textContent = ''; err.textContent = '';
    qr.clear();
    if (encodeError) { err.textContent = encodeError; return; }
    // (the module: in the link when it is not the project's top, or when the link is a module's: Share Module
    // Copy…, the project then opened on it, #2871; a test bench when it is not the project's, #2878)
    // (Open the project only, from the project's Share Project…: no module, the project opened with no source in
    // front, #3230; a module's Share Module… keeps its module, #2871)
    const top = !modSel.value || isEmu() || (!viewSel.value && !module) ? null : isSim() ? (givenBench || modSel.value !== pj.simTop ? modSel.value : null) : ((module && !givenBench) || modSel.value !== pj.top ? modSel.value : null);
    const problem = viewProblem(S.project, files, { view: viewSel.value || null, top });
    if (problem) { err.textContent = `${problem[0].toUpperCase()}${problem.slice(1)}.`; return; }
    opts = { view: viewSel.value || null, top, ui: withView.checked ? ui : null, lab: labSel.value || null };
    link = makeLink(linkBase(), { design, ...opts });
    signIn.style.display = 'none';
    if (short.checked) {
      out.value = '';
      info.textContent = 'A short link, about 140 characters: the project encrypted in this browser and saved as a secret gist of your GitHub account when you copy it; only the link opens it. Your links are your gists, which you list and delete on GitHub.';
      if (made && madeFor === expiry.value) { out.value = shortLink(); qr.show(out.value); } else qr.action({ label: 'Show QR Code', run: async () => { if (await makeShort()) { update(); qr.enlarge(); } } });
      return;
    }
    out.value = link;
    if (!qr.show(link) && !saidLong) {
      saidLong = true;
      app.log(`${action}: the link of '${name}' is ${link.length} characters, too long for a QR code (at most ${QR_MAX_BYTES}): the short link has one.`, 'info');
    }
    info.textContent = link.length > LINK_LIMITS.slides
      ? `${link.length} characters: some slide tools cut a link longer than ${LINK_LIMITS.slides} (export the project as a .zip, host it, and link to it with #open=).`
      : `${link.length} characters.`;
  };
  viewSel.addEventListener('change', () => { fillModules(); update(); });
  short.addEventListener('change', update);
  expiry.addEventListener('change', update);
  full.addEventListener('change', update);
  withView.addEventListener('change', update);
  labSel.addEventListener('change', update);
  modSel.addEventListener('change', () => { if (!isEmu()) chosen = { ...chosen, [isSim() ? 'bench' : 'design']: modSel.value }; update(); });
  update();
  // (a copy, or live: the window's first row, #3698)
  const how = howRow('copy', { module, view, close: () => closeIt?.() });
  const r = await dialog({
    title: action, width: 560,
    onOpen: ({ close }) => { closeIt = () => close(null); },
    body: h('div', {}, how.el,
      h('div', { class: 'hint' }, `A link that opens '${name}' in Silinx, for slides or a message: the whole project is inside the link (no file to host). Anyone with the link has every file of the project, its comments too.`),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        h('label', {}, 'Open in:'), viewSel,
        h('label', {}, 'Module:'), modSel,
        h('label', {}, 'Board:'), h('span', { class: 'link-board' }, S.project.board || 'none'),
        h('label', {}, 'Lab:'), labSel,
        h('span'), h('label', { class: 'link-ui' }, withView, h('span', {}, 'Include the current view: the open tabs, the split, the panels')),
        h('label', {}, 'Link:'), h('div', { class: 'link-forms' },
          h('label', { class: 'link-full' }, full, h('span', {}, 'The full link: the project inside it (needs nothing, but long)')), h('br'),
          h('label', { class: 'link-short' }, short, h('span', {}, 'A short link: the project encrypted in a secret gist of your GitHub account'))),
        h('label', {}, 'Expires:'), expiry),
      h('div', { class: 'link-out-row' }, out, qr.el), info, err, signIn,
      h('div', { class: 'link-manage' }, h('a', { href: '#', onclick: e => { e.preventDefault(); manage = true; closeIt?.(); } }, 'Manage short links…'))),
    buttons: [{ label: 'Copy Link', primary: true, value: true, validate: async () => {
      if (!link) return false;
      if (!short.checked) return true;
      if (!await makeShort()) return false;
      link = out.value = shortLink();
      rememberLink({ id: made.id, link, project: name, expires: made.expires || null });   // (the link as copied: its view, its lab)
      return true;
    } }, { label: 'Cancel', value: null }],
  });
  if (how.wanted) return how.switched();
  if (manage) { shortLinksDialog(); return null; }
  if (!r || !link) return null;
  writeClip('text', link);
  if (short.checked) {
    app.log(`${action}: the short link of '${name}'${labSel.value ? `, opening the lab '${labSel.value}'` : ''} copied, ${link.length} characters (the project in a secret gist of your GitHub account${made?.expires ? `, until ${made.expires.slice(0, 10)}` : ''}).`, 'ok');
    if (made?.deleted) app.log(`${action}: ${made.deleted} expired short link${made.deleted > 1 ? 's' : ''} deleted from your gists.`, 'info');
    return link;
  }
  app.log(`${action}: the link of '${name}'${viewSel.value ? ` (${VIEWS.find(([v]) => v === viewSel.value)[1]}, ${modSel.value})` : ''}${labSel.value ? `, opening the lab '${labSel.value}'` : ''} copied, ${link.length} characters.`, 'ok');
  if (link.length > LINK_LIMITS.slides) app.log(`WARNING: ${action}: the link is ${link.length} characters long: some slide tools cut a link longer than ${LINK_LIMITS.slides}.`, 'warn');
  return link;
}

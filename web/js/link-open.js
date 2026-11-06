// A design opened from a link at start-up (#2826): the address's hash (core/design-link.js parseLink) names the design
// (inside the link, an example, a zip at an https address) and what it opens: Try it (a schematic's), the test bench's
// simulation, the board emulator. A link comes from anywhere (#2829): a zip at an address is fetched only once the
// user agrees (its address shown), with no credentials nor referrer, its size capped; the design is imported as a
// Silinx zip (the import's checks); the student's work is kept: a project of that name with the same files is opened
// as it is, one that differs is replaced only when the user says so. Every message in the console.
import { api } from './api.js';
import { confirmDlg, dialog, h } from './ui.js';
import { S, app } from './app.js';
import { applyViewState } from './view-state.js';
import { applyLayout } from './tasks.js';
import { TRY_DRAWING, decodeDesign, decodeUi, designZip, freeName, parseLink, privateHost, sameFiles, tryDrawing, viewProblem } from '/core/design-link.js';
import { browserCodec, textOf } from '/core/zip.js';
import { gateMessages, gateZip } from '/core/import-gate.js';

/** The most a zip at an address may be (bytes). */
export const LINK_ZIP_MAX = 16 << 20;
const VIEWS = { try: 'Try it', simulate: 'the simulation', emulate: 'the board emulator' };
const fail = msg => Object.assign(new Error(msg), { linkError: true });
const texts = entries => Object.fromEntries(entries.map(e => [e.path, typeof e.data === 'string' ? e.data : textOf(e)]));

/** The link's options in the address (null: none); a broken link said in the console. The hash is cleared (a reload
 *  does not open it again). */
export function linkOptions(hash = location.hash) {
  let opts = null;
  try { opts = parseLink(hash); } catch (e) { app.log(`ERROR: Open from a link: ${e.message}.`, 'err'); return null; }
  if (opts || /(?:^#|&)(?:design|open|view|top|board)=/.test(hash)) history.replaceState(null, '', location.pathname + location.search);
  return opts;
}

// a zip at an https address, once the user agrees: { bytes, entries: [{ path, data }] } (null: not agreed)
async function fetchZip(url) {
  const ok = await confirmDlg('Open from a Link', `This link opens a project from another site:\n\n${url}\n\nOpen it? Its files are copied into a new project of your workspace; nothing runs until you run it.`, { yes: 'Open', no: 'Cancel' });
  if (!ok) return null;
  let r;
  try { r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }); } catch (e) { throw fail(`cannot fetch ${url} (${e.message}; the site must allow it)`); }
  if (!r.ok) throw fail(`cannot fetch ${url} (${r.status} ${r.statusText})`);
  // a redirection checked as the link's own address is (#2962): https, not this computer's nor a local network's
  let to = null;
  try { to = new URL(r.url || url); } catch { /* checked below */ }
  if (!to || to.protocol !== 'https:' || privateHost(to.hostname)) {
    r.body?.cancel().catch(() => {});
    throw fail(`${url} leads to an address of this computer or of a local network, or not an https one ('${String(r.url).slice(0, 120)}')`);
  }
  // (read with a running total: no more than the limit, whatever the site says it sends)
  const reader = r.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((n += value.length) > LINK_ZIP_MAX) { reader.cancel().catch(() => {}); throw fail(`the zip at ${url} is larger than ${LINK_ZIP_MAX >> 20} MB`); }
    parts.push(value);
  }
  const bytes = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  // (through the import gate, #2830: what it refuses is left out, said in the console; the import gates it again)
  let g;
  try { g = await gateZip(bytes, browserCodec(), { limits: { maxArchive: LINK_ZIP_MAX } }); } catch (e) { throw fail(`the file at ${url}: ${e.message}`); }
  for (const m of gateMessages(g)) app.log(`WARNING: Open from a link: ${m}`, 'warn');
  return { bytes, entries: g.files };
}

// the link's design: { name, project (null: not known before its import), files ({ path: text }: null, not known),
// make(as): its import or creation, as the project `as` (default its name) } (null: the user did not agree)
async function designOf(source) {
  if (source.kind === 'example') {
    const { name } = source;
    if (!(await api.templates()).includes(name)) throw fail(`no example '${name}'`);
    const ex = await api.exampleFiles(name);
    return { name, project: ex.project, files: ex.files, make: (as = name) => api.createProject({ name: as, template: name }) };
  }
  if (source.kind === 'design') {
    const { entries, name, project, warnings } = await decodeDesign(source.design);
    for (const w of warnings) app.log(`WARNING: Open from a link: ${w}`, 'warn');
    const zip = await designZip(entries);
    return { name, project, files: texts(entries.filter(e => e.path !== 'silinx.json')), make: (as = name) => api.importZip(as, new Blob([zip], { type: 'application/zip' })) };
  }
  const z = await fetchZip(source.url);
  if (!z) return null;
  // named by its silinx.json (a Silinx export), else by the zip's file name
  let pj = null;
  try { pj = JSON.parse(textOf(z.entries.find(e => /(^|\/)silinx\.json$/i.test(e.path)))); } catch { /* an ISE project */ }
  const file = decodeURIComponent(new URL(source.url).pathname.split('/').pop() || '').replace(/\.zip$/i, '').replace(/-silinx$/i, '');
  const name = String(pj?.name || file).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'linked';
  return { name, project: null, files: null, make: (as = name) => api.importZip(as, new Blob([z.bytes], { type: 'application/zip' })) };
}

/** Open the link's design (linkOptions) and its view; errors in the console, the workspace left as it was. */
export async function openFromLink(opts) {
  const { source, view, top, board } = opts;
  try {
    const d = await designOf(source);
    if (!d) { app.log('Open from a link: cancelled.', 'info'); return false; }
    if (d.project) {   // (a zip's: its view checked once it is open)
      const problem = viewProblem(d.project, d.files || {}, { view, top });
      if (problem) throw fail(problem);
      if (board && board !== d.project.board) app.log(`WARNING: Open from a link: the link's board ${board} is not the design's (${d.project.board || 'none'}): the design's is kept.`, 'warn');
    }
    const names = (await api.projects()).map(p => p.name);
    let exists = names.includes(d.name), kept = null;
    if (exists && !(d.files && sameFiles(texts((await gateZip(new Uint8Array(await (await api.exportZip(d.name, 'silinx')).blob.arrayBuffer()), browserCodec())).files), d.files))) {
      // the student's work: replaced only when they say so (#2829); or the link's design in a project of its own (#2875)
      const other = freeName(d.name, names);
      const answer = await askReplace(d.name, other);
      if (!answer) { app.log(`Open from a link: the project '${d.name}' was kept as it is; the link's design was not opened.`, 'info'); return false; }
      if (answer === 'other') { kept = d.name; d.name = other; exists = false; await d.make(other); }
      else { const { replaceProjectWith } = await import('./wizards.js'); await replaceProjectWith(d.name, () => d.make()); }
    } else if (!exists) await d.make();
    await app.openProject(d.name);
    app.showLeftPage('design');
    if (!d.project) {   // (a zip's: its drawings and HDL read now, for its view)
      d.files = Object.fromEntries(await Promise.all((S.fileTree || []).filter(p => TRY_DRAWING.test(p) || /\.(vhdl?|s?v)$/i.test(p)).map(async p => [p, await api.readFile(d.name, p)])));
      const problem = viewProblem(S.project, d.files, { view, top });
      if (problem) throw fail(problem);
    }
    app.log(`Opened '${d.name}' from a link${exists ? '' : kept ? ` (a new project; '${kept}' kept as it is)` : ' (a new project)'}${view ? `: ${VIEWS[view]}` : ''}.`, 'ok');
    // Silinx as the link was copied (#2886): its tabs, split and panels, before the link's own view, its module
    if (opts.ui) await openLinkView(opts.ui);
    // the link's module selected in the Design pane, its source open when no view opens (#2871)
    if ((top || view) && view !== 'simulate') await showModule(top || S.project.top, !view);   // (after the link's view: the module's source in front, #2871)
    if (view) await openView(view, top || S.project.top, d.files);
    return true;
  } catch (e) {
    app.log(`ERROR: Open from a link: ${e.message}.`, 'err');
    return false;
  }
}

// the link's view of the project now open: Try it (a schematic opened, its live simulation started; a state diagram or
// a Petri net opened, its Simulate panel shown, #2869), the test bench's simulation, the board emulator
async function openView(view, module, files) {
  if (view === 'simulate') return app.runSimulation(module === S.project.top ? S.project.simTop : module);   // (the link's test bench, else the project's, #2878)
  if (view === 'emulate') { const { openEmulator } = await import('./viewers.js'); return openEmulator(S.project.top); }   // (the top's, #2884)
  const path = tryDrawing(files || {}, module);
  if (!path) throw fail(`Try it: '${module}' is not a schematic, a state diagram, a Petri net or an ASM chart`);
  if (/\.fsm\.json$/i.test(path)) { await app.openFsm(path); return app.findDoc(`fsm:${path}`)?.fsmEditor?.showPanel('sim'); }
  if (/\.pn\.json$/i.test(path)) { await app.openPetri(path); return app.findDoc(`pn:${path}`)?.petriEditor?.showPanel('sim'); }
  // an ASM chart's simulation (#2881): its editor's, once it has one; until then the chart, said
  if (/\.asm\.json$/i.test(path)) {
    await app.openAsm(path);
    const ed = app.findDoc(`asm:${path}`)?.asmEditor;
    if (typeof ed?.showPanel === 'function') return ed.showPanel('sim');
    return app.log(`Open from a link: ${path} opened; the ASM chart's simulation is not in this version yet.`, 'info');
  }
  await app.openSch(path);
  await app.findDoc(`sch:${path}`)?.schEditor?.simulate();
}

// the link's module in the Design pane (#2871): its row selected, its parents expanded, scrolled to; opened as a
// double-click does (its drawing, else its HDL) when `open`
async function showModule(name, open) {
  await new Promise(r => setTimeout(r, 0));   // (the tree drawn for the project just opened)
  const row = [...document.querySelectorAll('#hier .row[data-module]')].find(r => r.dataset.module.toLowerCase() === String(name).toLowerCase());
  if (!row) return;
  for (let ul = row.closest('ul'); ul && ul.closest('#hier'); ul = ul.parentElement?.closest('ul')) {
    if (!ul.hidden) continue;
    ul.hidden = false;
    const tw = ul.previousElementSibling?.querySelector('.twisty');
    if (tw) tw.textContent = '▾';
  }
  row.click();
  row.scrollIntoView({ block: 'nearest' });
  if (open) row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}

// a project of the link's name the student changed: Open as <other> / Replace / Keep Mine ('other', 'replace' or null)
function askReplace(name, other) {
  return dialog({
    title: 'Open from a Link', width: 460,
    body: h('div', { class: 'msg msg-question' }, h('div', { class: 'msg-icon' }, '?'), h('div', { class: 'msg-text' },
      `A project named '${name}' already exists, with changes of its own.\n\nReplace it with the link's design? ${api.standalone && !api.keepsTrash ? 'The existing project will be deleted from this browser.' : 'The existing project is moved to the workspace .trash folder.'} Or open the link's design as a new project, '${other}', yours kept as it is.`)),
    // (the one that loses nothing first, Enter's)
    buttons: [{ label: `Open as ${other}`, value: 'other', primary: true }, { label: 'Replace', value: 'replace' }, { label: 'Keep Mine', value: null }],
  });
}

// a link's view (#2886): its documents reopened (those that open in this project), the one in front, the split, then the
// layout for this page only; what it leaves out said in the console
async function openLinkView(text) {
  let u;
  try { u = decodeUi(text); } catch (e) { app.log(`WARNING: Open from a link: ${e.message}; the view not restored.`, 'warn'); return; }
  if (u.dropped.length) app.log(`WARNING: Open from a link: the link's view left out ${u.dropped.join(', ')}.`, 'warn');
  await applyViewState(u.view);
  if (u.layout) applyLayout(u.layout);
}

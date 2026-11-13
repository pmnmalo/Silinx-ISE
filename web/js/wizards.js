// Wizards and dialogs modelled on ISE (New Project Wizard, New Source, properties...).
import { boardOptions, devicePicker, noFlowWarning } from './device-picker.js';
import { constraintsForDevice } from './constraints-format.js';
import { api } from './api.js';
import { PRODUCT, PRODUCT_FULL, VERSION, VERSION_LABEL, BUILD, REPOSITORY, compareVersions, versionLabel } from '/core/version.js';
import { icons } from './icons.js';
import { h, dialog, alertDlg, confirmDlg, toast } from './ui.js';
import { S, app } from './app.js';
import { THIRD_PARTY } from '/core/third-party.js';
import { drawnHdlPath, isView } from '/core/view-hdl.js';
import { IMPORT_SOURCE_ACCEPT, IMPORT_SOURCE_ROLES, assignImported, importSourceFile } from '/core/import-source.js';
import { reservedNameDiags } from './processes.js';
import { countEvent, siteCounts } from './analytics.js';
import { confirmDeviceChange } from './device-change.js';
import { boardTop } from './board-top.js';
import { KIND_OPTIONS, kindBoardOptions, kindFields, makeDesignProject } from './project-kind-ui.js';
import { DESIGN_KIND, DESIGN_ONLY_LABEL, asFpgaProject, isDesignOnly } from '/core/project-kind.js';
import { designOnly, refusedHere } from './design-only.js';
import { byLastUsed } from './project-store.js';
import { currentProject, opened } from './project.js';
import { prefKey } from './prefs.js';
import { safeReleaseUrl } from './release-url.js';
import { NAME_RE } from '/core/ident.js';
import { projectNameError, projectNameFrom, sameProject } from '/core/project-name.js';

// Device used when no evaluation board is selected.
const DEFAULT_DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };

export function field(label, input) { return [h('label', {}, label), input]; }
export function select(options, value) {
  const s = h('select');
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    s.append(h('option', { value: v, selected: v === value }, l));
  }
  return s;
}

// Multi-page wizard driver. pages: [{ title, render() -> Node, validate?() -> string|null, noNext?() -> true: Next > disabled }],
// or a function returning the pages now (they may change with a choice on a page: New Source's type). The steps on
// the side and the buttons follow the pages now on every render; bind(refresh) hands the page that changes them a
// way to show the change at once.
// extra: a button before < Back on the pages it is shown on, closing the wizard with its value
// ({ label, value, shown(page), disabled?(), validate?() -> string|null }; New Source's Wizard, #958)
// back: < Back on the first page closes the wizard and calls it (a wizard opened by New Source goes back to it,
// #2082); start: the page shown first
export function wizard(title, pages, { width = 720, finishLabel = 'Finish', extra = null, bind = null, back = null, start = 0 } = {}) {
  const now = typeof pages === 'function' ? pages : () => pages;
  return new Promise(resolve => {
    let idx = start;
    const side = h('div', { class: 'wiz-side' });
    const main = h('div', { class: 'wiz-main' });
    const err = h('div', { style: { color: 'var(--danger)', minHeight: '16px', marginTop: '6px' } });
    const body = h('div', {}, h('div', { class: 'wiz' }, side, h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } }, main, err)));
    let ctl;
    // the steps and the buttons of the pages now
    const refresh = () => {
      const ps = now(), p = ps[idx];
      side.replaceChildren(h('div', { class: 'logo' }, 'Silinx'), ...ps.map((q, i) => h('div', { class: `step${i === idx ? ' cur' : ''}` }, q.title)));
      if (!ctl) return;
      const k = extra ? 1 : 0;
      if (extra) { const b = ctl.buttons[0].el; b.style.display = extra.shown(p) ? '' : 'none'; b.disabled = !!extra.disabled?.(); }
      ctl.buttons[k].el.disabled = idx === 0 && !back;
      ctl.buttons[k + 1].el.textContent = idx === ps.length - 1 ? finishLabel : 'Next >';
      ctl.buttons[k + 1].el.disabled = !!p.noNext?.();
    };
    const render = () => {
      const p = now()[idx];
      main.innerHTML = '';
      main.append(h('h3', {}, p.title), p.node ||= p.render());
      p.onShow?.();
      refresh();
      err.textContent = '';
    };
    bind?.(refresh);
    const next = async () => {
      const msg = await now()[idx].validate?.();
      if (msg) { err.textContent = msg; return false; }
      if (idx === now().length - 1) return true;
      idx++; render();
      return false;
    };
    dialog({
      title, width, body,
      buttons: [
        ...(extra ? [{ label: extra.label, value: extra.value, validate: async () => { const msg = await extra.validate?.(); err.textContent = msg || ''; return !msg; } }] : []),
        { label: '< Back', value: 'back', validate: () => { if (idx > 0) { idx--; render(); return false; } return !!back; } },
        { label: 'Next >', primary: true, value: true, validate: next },
        { label: 'Cancel', value: false },
      ],
      onOpen: c => { ctl = c; render(); },
    }).then(v => (v === 'back' ? Promise.resolve(back()).then(() => resolve(false)) : resolve(v)));
  });
}

// ------------------------------------------------------------------ New Project
// A project with this name already exists: ask whether to replace it. With the server the old
// project is moved to <workspace>/.trash (recoverable); in the standalone edition it is deleted,
// unless the projects are kept in a workspace folder on the disk (it has a .trash folder too).
const deletesProjects = () => api.standalone && !api.keepsTrash;
// (a project of the name in another case too: the same folder on a case-insensitive file system, #3538)
export async function askReplaceProject(name) {
  const pname = sameProject(await api.projects(), name)?.name;
  if (!pname) return true;
  return confirmDlg('Replace Project',
    `A project named '${pname}' already exists.\n\nReplace it? ${deletesProjects() ? 'The existing project will be deleted from this browser.' : 'The existing project is moved to the workspace .trash folder.'}`);
}
// Replace an existing project by running `fn` (an import): the old project is removed first; if
// the import then fails, it comes back from a snapshot taken before (a Silinx zip of the whole project)
// and is opened again if it was open. Should the restore fail
// too, the server still has the old project in the workspace .trash folder.
export async function replaceProjectWith(pname, fn) {
  const old = sameProject(await api.projects(), pname)?.name, exists = !!old;
  const wasOpen = !!old && S.project?.name === old;
  let backup = null;
  if (exists) {
    try { backup = { zip: (await api.exportZip(old, 'silinx')).blob }; } catch { /* no snapshot: the server keeps the old project in .trash */ }
  }
  await removeExistingProject(pname);
  try { return await fn(); }
  catch (e) {
    try { await api.deleteProject(pname); } catch { /* nothing was created */ }
    let restored = false;
    try {
      if (backup?.zip) { await api.importZip(old, backup.zip); restored = true; }
    } catch { /* keep the import error */ }
    if (restored) {
      app.log(`The previous project '${old}' was restored.`, 'info');
      if (wasOpen) { try { await app.openProject(old); app.showLeftPage('design'); } catch { /* it is in the project list */ } }
    } else if (exists && !deletesProjects()) app.log(`The previous project '${old}' is in the workspace .trash folder.`, 'info');
    throw e;
  }
}

async function removeExistingProject(name) {
  const pname = sameProject(await api.projects(), name)?.name;
  if (!pname) return;
  if (S.project?.name === pname) await app.closeProject();
  await api.deleteProject(pname);
  app.log(`Project '${pname}' replaced${deletesProjects() ? '' : ' (the old one is in the workspace .trash folder)'}.`, 'info');
}

// the synthesis tools of a project (Silinx: the Silinx toolchain's whole flow, no ISE; XST: Xilinx ISE)
const SYNTH_TOOLS = [['silinx', 'Silinx (VHDL/Verilog; no ISE needed)'], ['xst', 'XST (VHDL/Verilog; Xilinx ISE)']];

export async function newProjectWizard({ template = 'empty' } = {}) {
  const db = S.devices || await api.devices();
  const templates = await api.templates().catch(() => []);
  // the test designs (#1746): the designs Silinx is tested with, listed after the examples
  const tests = await api.testDesigns().catch(() => []);
  const st = {
    name: template !== 'empty' ? template : '', template, board: '',
    device: { ...DEFAULT_DEVICE }, lang: 'vhdl',
  };
  // where the project goes: the server's workspace folder; in the browser edition, the browser's
  // storage or the workspace folder picked on the disk (#107, #125)
  const kept = api.standalone ? api.storage() : null;
  const where = !kept ? { location: '<workspace>/', hint: 'Projects are stored in the Silinx workspace folder (default ~/Silinx-projects).' }
    : kept.kind === 'folder' ? { location: `${kept.folder}/`, hint: `Projects are kept in the folder ${kept.folder} on the disk (File ▸ Open Workspace Folder… to change it).` }
      : { location: 'this browser: ', hint: kept.supported ? "Projects are kept in this browser's storage (File ▸ Open Workspace Folder… keeps them in a folder on the disk)." : "Projects are kept in this browser's storage (a folder on the disk needs Chrome or Edge)." };
  const name = h('input', { type: 'text', value: st.name, placeholder: 'project name' });
  const tplSel = select([['empty', 'Empty project'], ...templates.map(t => [t, `Example: ${t}`]), ...tests.map(t => [t, `Test design: ${t}`])], template);
  // the project's kind (#3780): an FPGA project, or a design and simulation one (no board, no device, no HDL); an example's
  // an FPGA project
  const kindSel = select(KIND_OPTIONS, 'fpga');
  const syncKindSel = () => { kindSel.disabled = tplSel.value !== 'empty'; if (kindSel.disabled) kindSel.value = 'fpga'; };
  tplSel.addEventListener('change', syncKindSel);
  syncKindSel();
  const p1 = {
    title: 'Create New Project',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Enter a name and location for the project.'),
      h('div', { class: 'form-grid' },
        ...field('Name:', name),
        ...field('Location:', h('input', { type: 'text', value: where.location + (st.name || '…'), disabled: true })),
        ...field('Start from:', tplSel),
        ...field('Project Kind:', kindSel)),
      h('div', { class: 'hint', style: { marginTop: '14px' } }, where.hint)),
    validate: async () => {
      const bad = projectNameError(name.value.trim());   // (the server's rule and message, core/project-name.js, #3538)
      if (bad) return bad;
      st.replace = false;
      const other = sameProject(await api.projects(), name.value.trim())?.name;
      if (other) {
        if (!await askReplaceProject(other)) return `A project named '${other}' already exists: choose another name.`;
        st.replace = true;
      }
      return null;
    },
  };
  const boardSel = select(boardOptions(db), '');
  const dp = devicePicker(db, st.device);
  boardSel.addEventListener('change', () => {
    const b = db.boards.find(x => x.id === boardSel.value);
    st.device = b ? { ...b.device } : { ...DEFAULT_DEVICE };
    dp.set(st.device);
    dp.disable(!!b);
  });
  // the synthesis tool: Silinx (its own flow, no ISE) or XST (Xilinx ISE, as set in Toolchain Settings)
  const synthSel = select(SYNTH_TOOLS, 'silinx');
  dp.lockSynth(synthSel, null);   // (the device's first: Silinx, or on the Artix-7 AMD Vivado, #3146)
  const langSel = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], 'vhdl');
  // the type of the top-level source: HDL, or a diagram / table whose HDL module is kept in sync
  const topType = select(TOP_TYPES.map(t => [t.id, t.label]), 'hdl');
  const topNote = h('div', { class: 'hint', style: { gridColumn: '1 / -1', marginTop: '-4px' } });
  const syncTop = () => {
    const ex = tplSel.value !== 'empty';
    topType.disabled = ex;
    if (ex) topType.value = 'hdl';
    const t = TOP_TYPES.find(x => x.id === topType.value);
    topNote.textContent = !ex ? (t.id === 'hdl' ? '' : `The project starts with ${t.file} (the top module 'top') and its HDL module, generated from it.`)
      : tests.includes(tplSel.value) ? 'The test design has its own sources and its test: a test bench (Simulate), or the C program\'s main() (C Simulation).' : 'The example has its own sources.';
    topNote.style.display = topNote.textContent ? '' : 'none';
  };
  topType.addEventListener('change', syncTop);
  const catSel = select(['All'], 'All'), simSel = select(['SSim (VHDL/Verilog; Silinx Simulator)'], ''), stdSel = select(['VHDL-93', 'VHDL-2008'], 'VHDL-93');
  const isDesign = () => kindSel.value === DESIGN_KIND && tplSel.value === 'empty';
  const syncKind = kindFields(isDesign, [boardSel, catSel, dp.famSel, dp.partSel, dp.pkgSel, dp.spdSel, synthSel, simSel, langSel, stdSel], topType);
  kindSel.addEventListener('change', syncKind);
  const p2 = {
    title: 'Project Settings',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Select the device and design flow for the project.'),
      h('div', { class: 'form-grid' },
        ...field('Evaluation Development Board:', boardSel),
        ...field('Product Category:', catSel),
        ...field('Family:', dp.famSel),
        ...field('Device:', dp.partSel),
        ...field('Package:', dp.pkgSel),
        ...field('Speed:', dp.spdSel),
        ...field('Top-Level Source Type:', topType), topNote,
        ...field('Synthesis Tool:', synthSel),
        ...field('Simulator:', simSel),
        ...field('Preferred Language:', langSel),
        ...field('VHDL Source Analysis Standard:', stdSel),
      )),
    onShow: () => { syncTop(); syncKind(); },
  };
  const summary = h('div');
  const p3 = {
    title: 'Project Summary',
    render: () => summary,
    onShow: () => {
      summary.innerHTML = '';
      const b = db.boards.find(x => x.id === boardSel.value);
      if (isDesign()) {
        summary.append(h('pre', { class: 'code-box' }, `Project Navigator will create a new project with the following specifications.\n\n` +
          `Project:\n  Project Name: ${name.value.trim()}\n  Template:     ${tplSel.value}\n  Kind:         ${DESIGN_ONLY_LABEL}\n\n` +
          `Flow:\n  Top-Level Source Type: ${TOP_TYPES.find(t => t.id === topType.value).label}\n  Simulator:          SSim (Silinx behavioural simulator)`));
        return;
      }
      summary.append(h('pre', { class: 'code-box' },
        `Project Navigator will create a new project with the following specifications.\n\n` +
        `Project:\n  Project Name: ${name.value.trim()}\n  Template:     ${tplSel.value}\n\n` +
        `Device:\n  Board:        ${b ? b.name : 'None Specified'}\n  Family:       ${dp.familyName()}\n  Device:       ${dp.value().part.toUpperCase()}\n  Package:      ${dp.value().package.toUpperCase()}\n  Speed:        ${dp.value().speed}\n\n` +
        `Flow:\n  Top-Level Source Type: ${TOP_TYPES.find(t => t.id === topType.value).label}\n  Synthesis Tool:     ${synthSel.selectedOptions[0]?.textContent || synthSel.value}\n  Simulator:          SSim (Silinx behavioural simulator)\n  Preferred Language: ${langSel.value.toUpperCase()}`));
    },
  };
  const ok = await wizard('New Project Wizard', [p1, p2, p3]);
  if (!ok) return;
  try {
    if (st.replace) await removeExistingProject(name.value.trim());
    const design = isDesign();
    const pj = await api.createProject(design ? { name: name.value.trim(), template: 'empty', kind: DESIGN_KIND } : {
      name: name.value.trim(), template: tplSel.value,
      device: dp.value(),
      board: boardSel.value || (tplSel.value !== 'empty' ? undefined : null),
    });
    countEvent('new-project');
    pj.preferredLanguage = design ? 'vhdl' : langSel.value;
    pj.topSourceType = topType.value;
    if (!design) pj.synthTool = synthSel.value;
    await api.saveProject(pj.name, pj);
    // a diagram / table top: its document and its synchronized HDL module 'top'
    const top = topType.value !== 'hdl' && tplSel.value === 'empty' ? await createTopSource(pj.name, topType.value, langSel.value) : null;
    await app.openProject(pj.name);
    if (noFlowWarning(pj.device)) app.log(noFlowWarning(pj.device), 'warn');
    if (api.standalone && tplSel.value !== 'empty') await app.boardUcf();   // (the chosen board's pins, as the server's, #2430)
    app.showLeftPage('design');
    if (top) {
      const fresh = await api.project(pj.name);
      fresh.top = 'top';
      delete fresh.fileTree;
      await api.saveProject(pj.name, fresh);
      await app.openProject(pj.name);
      ({ sch: app.openSch, fsm: app.openFsm, asm: app.openAsm, tt: app.openTt })[topType.value](top);
    }
    toast(`Project ${pj.name} created`, 'ok');
  } catch (e) { alertDlg('New Project', e.message, 'error'); }
}

// Top-Level Source Type: what the top of a new (empty) project is
const TOP_TYPES = [
  { id: 'hdl', label: 'HDL' },
  { id: 'sch', label: 'Schematic', file: 'src/top.sch.json' },
  { id: 'fsm', label: 'Finite State Machine (FSM)', file: 'src/top.fsm.json' },
  { id: 'asm', label: 'Algorithmic State Machine (ASM)', file: 'src/top.asm.json' },
  { id: 'tt', label: 'Boolean Algebra', file: 'src/top.bool.json' },
];

/** The top document of a new project (type sch / fsm / asm / tt) and its synchronized HDL module 'top'. */
export async function createTopSource(pname, type, lang) {
  const t = TOP_TYPES.find(x => x.id === type);
  const hdlPath = `src/top.${lang === 'verilog' ? 'v' : 'vhd'}`;
  let doc, code;
  if (type === 'sch') {
    const { newDoc, generateHdl } = await import('/core/schdoc.js');
    doc = newDoc('top', lang); code = generateHdl(doc, { lang }).code;
  } else if (type === 'fsm') {
    const { newFsm, generateFsm } = await import('/core/fsm.js');
    doc = newFsm('top', lang); code = generateFsm(doc, lang).code;
  } else if (type === 'asm') {
    const { newModel, generate } = await import('/core/asm.js');
    doc = newModel('top', lang); code = generate(doc, lang).code;
  } else if (type === 'tt') {
    const { newTable, generateTableHdl } = await import('/core/logic.js');
    doc = { ...newTable('top', ['a', 'b', 'c'], ['f']), lang }; code = generateTableHdl(doc, lang).code;
  } else return null;
  doc.generatedFile = hdlPath;
  await api.writeFile(pname, t.file, JSON.stringify(doc, null, type === 'sch' ? 1 : 2));
  await api.writeFile(pname, hdlPath, code);   // registers the module in the project
  return t.file;
}

// a date as the lists show it: 2026-10-24 15:07, local time
const dateText = ms => { const d = new Date(ms), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };

export async function openProjectDialog() {
  // the projects by when they were last changed or opened, the newest first, that date last (#1156)
  const list = byLastUsed(await api.projects(), opened());
  let chosen = null;
  const tbl = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Project'), h('th', {}, 'Device'), h('th', {}, 'Top'), h('th', {}, 'Board'), h('th', {}, 'Last Used')));
  for (const p of list) {
    const tr = h('tr', {}, h('td', {}, p.name), h('td', {}, p.device ? `${p.device.part}${p.device.speed}-${p.device.package}` : ''), h('td', {}, p.top || ''), h('td', {}, p.board || ''),
      h('td', { class: 'pj-used', 'data-no-i18n': '' }, p.used ? dateText(p.used) : ''));
    tr.addEventListener('click', () => { tbl.querySelectorAll('tr').forEach(r => r.classList.remove('sel')); tr.classList.add('sel'); chosen = p.name; });
    tr.addEventListener('dblclick', () => { chosen = p.name; document.querySelector('.dlg .btn.primary')?.click(); });
    tbl.append(tr);
  }
  const r = await dialog({
    title: 'Open Project', width: 680,
    body: h('div', {}, list.length ? h('div', { style: { maxHeight: '320px', overflow: 'auto', border: '1px solid var(--frame)' } }, tbl) : h('div', {}, 'No projects found in the workspace.')),
    buttons: [{ label: 'Open', primary: true, value: () => chosen }, { label: 'Cancel', value: null }],
  });
  if (r) { await app.openProject(r); app.showLeftPage('design'); }
}

// ISE outputs that never need importing (regenerated by the flow), and a size cap per file.
const ISE_OUTPUT_DIRS = /(^|\/)(xst|_ngo|_xmsgs|iseconfig|isim|xlnx_auto_0_xdb|planAhead_run_\d+|ipcore_dir\/tmp|build|\.Xil)\//i;
const ISE_OUTPUT_FILES = /\.(ngc|ngd|ncd|ngr|ngm|pcf|bld|map|mrp|par|pad|twr|twx|xpi|unroutes|bgn|drc|bit|bin|mcs|prm|syr|lso|xrpt|xwbt|ptwx|cmd_log|stx|gise|wdb|exe|log|html|xml)$/i;

// Zip the files picked from a folder (<input webkitdirectory>), relative to that folder.
export async function zipFolderSelection(fileList) { // exported for tests
  const { createZip, browserCodec } = await import('/core/zip.js');
  const files = [...fileList];
  const rootName = (files[0]?.webkitRelativePath || '').split('/')[0];
  const entries = [];
  let skipped = 0;
  for (const f of files) {
    const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
    if (ISE_OUTPUT_DIRS.test(rel) || ISE_OUTPUT_FILES.test(rel) || f.size > 20 * 1024 * 1024 || /(^|\/)\./.test(rel)) { skipped++; continue; }
    entries.push({ path: rel, data: new Uint8Array(await f.arrayBuffer()) });
  }
  if (!entries.some(e => /\.xise$/i.test(e.path))) throw new Error(`no .xise project file in the folder '${rootName}'`);
  const zip = await createZip(entries, browserCodec());
  return { blob: new Blob([zip], { type: 'application/zip' }), rootName, count: entries.length, skipped };
}

// ------------------------------------------------------------------ replacing an existing file
// A wizard that would create a file which already exists asks once whether to replace it: Replace / Cancel (#1467)
// (returns null = go on, or the message that keeps the wizard on its page).
export function replaceGuard(title) {
  const ok = new Set();
  return async (path) => {
    if (!(S.diskTree || S.fileTree).includes(path) || ok.has(path)) return null;   // on disk (also a file removed from the project)
    if (await confirmDlg(title, `${path} already exists.\n\nReplace it? Its current contents will be lost.`, { yes: 'Replace', no: 'Cancel' })) { ok.add(path); return null; }
    return `${path} already exists: choose another name.`;
  };
}
// close the editors of a file about to be replaced (its new contents are opened afterwards); a drawing's HDL file,
// generated from it (generatedFile), goes with it: made again from the new drawing when the project is reloaded
// (#1467: else it was in the new drawing's way, a clash)
export async function closeBeforeReplace(path) {
  let owned = null;
  if (isView(path)) { try { owned = JSON.parse(S.viewTexts?.[path] ?? '').generatedFile || null; } catch { /* not read */ } }
  for (const p of [path, owned].filter(Boolean)) {
    for (const d of [...S.docs]) {
      if (d.path === p || String(d.id || '').endsWith(`:${p}`)) { d.dirty = false; clearTimeout(d._autosave); await app.closeDoc(d); }
    }
  }
  if (owned && (S.diskTree || S.fileTree || []).includes(owned)) await api.deleteFile(S.project.name, owned);
}
// a module of that name defined in another file than `path` (the file being replaced may define it)
export const moduleElsewhere = (name, path) => S.modules.find(m => m.name.toLowerCase() === String(name).toLowerCase() && m.file !== path
  && S.hdlToSch?.[m.file] !== path);   // (the synchronized HDL of a schematic / chart being replaced)

// the HDL file a new drawing (`path`, its module `name`) gets (drawnHdlPath, #207) is taken by a file
// that is not its own (#230): the message that keeps the wizard on its page, or null
export function drawnHdlTaken(path, name, lang) {
  if (!isView(path)) return null;
  const hdl = drawnHdlPath(path, name, lang);
  if (!(S.diskTree || S.fileTree || []).includes(hdl) || S.hdlToSch?.[hdl] === path) return null;
  return `${hdl} already exists: the HDL generated from the new source would be written there. Choose another name.`;
}

// ------------------------------------------------------------------ New Source (web/js/new-source.js, #405)
export { newSourceWizard } from './new-source.js';

/** Add Copy of Source's name: Import Source in the Silinx interface (the Tasks layout, #1501), ISE's in the ISE style one. */
export const addSourceTitle = () => (document.documentElement.dataset.layout === 'tasks' ? 'Import Source' : 'Add Copy of Source');
/** Add Copy of Source… (`role`: the association first chosen; `title`: Import Test Bench, Simulation only, #1385, #1501). */
export async function addSourceDialog({ role: first = 'design', title = addSourceTitle() } = {}) {
  const inp = h('input', { type: 'file', multiple: true, accept: IMPORT_SOURCE_ACCEPT });
  const role = select(IMPORT_SOURCE_ROLES, typeof first === 'string' ? first : 'design');
  // (the Silinx interface asks no association: Import Source's All, Import Test Bench's Simulation only, #1501)
  const ask = document.documentElement.dataset.layout !== 'tasks';
  const r = await dialog({
    title, width: 480,
    body: h('div', { class: 'form-grid' }, ...field('Files:', inp), ...(ask ? field('Association:', role) : [])),
    buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  const written = [];
  const tree = [...S.fileTree];
  for (const f of inp.files) {
    // through the import gate (#2830): a file it refuses is not added, said in the console; a drawing named with a
    // reserved word refused (#679) (core/import-source.js)
    const c = importSourceFile(f.name, new Uint8Array(await f.arrayBuffer()), role.value);
    if (c.refused === 'gate') { app.log(`WARNING: ${c.message}`, 'warn'); continue; }
    if (c.refused) { await alertDlg(title, c.message, 'error'); continue; }
    if (refusedHere(c.path)) continue;   // (an HDL file in a design and simulation project, #3780: the console says why)
    if (c.warning) app.log(`WARNING: ${c.warning}`, 'warn');
    if ((S.diskTree || S.fileTree).includes(c.path) && !await confirmDlg(title, `${c.path} already exists in the project. Replace it with the copy of ${f.name}?`)) continue;
    await api.writeFile(S.project.name, c.path, c.text);
    written.push(c.path);
  }
  if (!written.length) return;
  // the association (role) of exactly the files written, and the constraints file
  const pj = assignImported(await api.project(S.project.name), written, role.value, tree);
  delete pj.fileTree;
  await api.saveProject(pj.name, pj);
  await app.reloadProject();
  app.log(`Added ${written.length} source file(s).`, 'ok');
  for (const d of reservedNameDiags().filter(d => written.includes(d.file))) app.log(`WARNING:${d.tool} - "${d.file}" Line ${d.line}: ${d.message}`, 'warn');
}

export async function sourceProperties(path) {
  const f = S.project.files.find(x => x.path === path);
  const { setSourceLanguage, sourceLanguageChoice } = await import('./drawings-lang.js');
  const own = await sourceLanguageChoice(path);
  if (!f && !own) return;
  // (a design and simulation project: no language, its HDL hidden, #3780)
  const lang = own && !designOnly() && select([['', 'Project Preferred Language'], ['vhdl', 'VHDL'], ['verilog', 'Verilog']], own.choice);
  const r = await dialog({
    title: `Source Properties - ${path}`, width: 440,
    body: h('div', { class: 'form-grid' }, ...field('File:', h('span', {}, path)), ...(designOnly() ? [] : field('Language:', lang || h('span', {}, f.lang)))),
  });
  if (!r || !lang || lang.value === own.choice) return;
  await setSourceLanguage(own.drawing, lang.value);
  await app.reloadProject();
}

export async function projectProperties() {
  const db = S.devices || (S.devices = await api.devices().catch(() => null));
  if (!db) return alertDlg("Design Properties", "The device database could not be loaded (is the Silinx server running?).", "error");
  const pj0 = S.project;
  let pj = pj0;
  // (the board list's first choice: a design and simulation project, both ways, #3780)
  const boardSel = select(kindBoardOptions(boardOptions(db)), isDesignOnly(pj) ? DESIGN_KIND : pj.board || '');
  const dp = devicePicker(db, pj.device);
  dp.disable(!!pj.board);
  const lang = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], pj.preferredLanguage || 'vhdl');
  // a project from before the setting follows Toolchain Settings
  const synth = select(SYNTH_TOOLS, pj.synthTool || (S.toolchain?.config?.mode === 'silinx' ? 'silinx' : 'xst'));
  dp.lockSynth(synth, pj.synthTool);
  const syncKind = kindFields(() => boardSel.value === DESIGN_KIND, [dp.famSel, dp.partSel, dp.pkgSel, dp.spdSel, synth, lang]);
  boardSel.addEventListener('change', () => {
    const b = db.boards.find(x => x.id === boardSel.value);
    if (b) dp.set(b.device);
    dp.disable(!!b);
    syncKind();
  });
  const r = await dialog({
    title: 'Design Properties', width: 520,
    body: h('div', { class: 'form-grid' },
      ...field('Name:', h('span', {}, pj.name)),
      ...field('Evaluation Development Board:', boardSel),
      ...field('Family:', dp.famSel),
      ...field('Device:', dp.partSel), ...field('Package:', dp.pkgSel), ...field('Speed:', dp.spdSel),
      ...field('Top Module (implementation):', h('span', {}, pj.top || '(none)')),
      ...field('Top-Level Source Type:', h('span', {}, TOP_TYPES.find(t => t.id === (pj.topSourceType || 'hdl'))?.label || 'HDL')),
      ...field('Synthesis Tool:', synth),
      ...field('Preferred Language:', lang)),
    onOpen: () => syncKind(),
  });
  if (!r) return;
  // (the choices applied to the project as it is now: a reload while the dialog was open replaced it, #2281)
  pj = await currentProject();
  if (pj?.name !== pj0.name) return;
  // a design and simulation project made (#3780), or one given a board or a device: an FPGA project then
  if (boardSel.value === DESIGN_KIND) return isDesignOnly(pj) || makeDesignProject(pj);
  const fromDesign = isDesignOnly(pj);
  // a new device: the design checked against it first, the user told (#796)
  const next = dp.value();
  if ((next.part !== pj.device.part || next.package !== pj.device.package) && !await confirmDeviceChange(pj, next, db)) return;
  const oldBoard = pj.board, oldDev = `${pj.device.part}-${pj.device.package}`, oldLang = pj.preferredLanguage || 'vhdl';
  if (fromDesign) {   // (its kind dropped, its constraints file named: the device's format below)
    pj.constraints = asFpgaProject(pj, { device: dp.value() }).constraints;
    delete pj.kind;
    app.log(`${pj.name}: an FPGA project now: its HDL and its implementation shown.`, 'info');
  }
  pj.board = boardSel.value || null;
  pj.device = dp.value();
  pj.preferredLanguage = lang.value;
  pj.synthTool = synth.value;
  constraintsForDevice(pj, S.fileTree, app.log);
  await app.saveProjectJson();
  // every drawing in the new language, its HDL file made again in it (#1477)
  if (lang.value !== oldLang) {
    const n = (await (await import('./drawings-lang.js')).drawingsInLanguage(lang.value)).length;
    app.log(`Preferred Language: ${lang.value === 'verilog' ? 'Verilog' : 'VHDL'}${n ? ` (${n} drawing(s) now in it, their HDL made again in it)` : ''}.`, 'info');
  }
  await app.reloadProject();
  app.log(`Device set to ${pj.device.part}${pj.device.speed}-${pj.device.package}${pj.board ? ` (board ${pj.board})` : ''}.`, 'info');
  if (noFlowWarning(pj.device)) app.log(noFlowWarning(pj.device), 'warn');
  const changed = pj.board !== oldBoard || `${pj.device.part}-${pj.device.package}` !== oldDev;
  const board = app.projectBoard();
  // another board: its clock and its inputs' levels as the defaults of the top's generics (#3710)
  if (pj.board !== oldBoard && board && await boardTop(pj, board, app.log)) await app.reloadProject();
  if (changed && board && pj.top && await confirmDlg('Update Constraints',
    `The target changed to the ${board.name}.\nPin locations (LOC) in the constraints file are board specific.\n\nRegenerate ${pj.constraints || 'the UCF'} from the ${board.name} pin table? (ports are matched by name: clk, led, sw, btn, seg, an…)`)) {
    await app.regenerateUcf(board);
  } else if (changed && !board && S.fileTree.includes(pj.constraints)) {
    app.log(`WARNING: check the pin locations in ${pj.constraints} — they must exist on the ${pj.device.package.toUpperCase()} package.`, 'warn');
  }
}

export async function implProperties() {
  const pj0 = S.project;
  let pj = pj0;
  pj.impl ||= {};
  // the Optimization (#2470): Fast, Area or Speed, kept as ISE's Optimization Goal and Effort (GOAL_IMPL)
  const { synthGoal, GOAL_IMPL } = await import('/packages/silinx-fpga/src/index.js');
  const opt = select([['fast', 'Fast'], ['area', 'Area'], ['speed', 'Speed']], synthGoal(pj.impl));
  const clk = select([['JtagClk', 'JTAG Clock'], ['CCLK', 'CCLK'], ['UserClk', 'User Clock']], pj.impl.startupClk || 'JtagClk');
  // a Spartan-6's Map (#3138): nextpnr's packer, the default since its parity (#3139, #3140), or Silinx's
  const { deviceFamily, s6MapOf } = await import('/packages/silinx-fpga/src/parts.js');
  const { familyProfile } = await import('/core/family-profile.js');
  const map = familyProfile(deviceFamily(pj.device)).mapChoice ? select([['nextpnr', 'nextpnr'], ['silinx', 'Silinx']], s6MapOf(pj.impl)) : null;
  const r = await dialog({
    title: 'Process Properties - Synthesis / Implementation / Bitstream', width: 520,
    body: h('div', { class: 'form-grid' },
      ...field('Optimization:', opt),
      ...field('FPGA Start-Up Clock:', clk),
      ...(map ? field('Map (Spartan-6):', map) : []),
      // what each Optimization does (#282, #2470)
      h('div', { class: 'effort-hint', style: { gridColumn: '1 / 3', color: 'var(--grey-3)' } },
        'Fast: one mapping and one placement, the quickest build. Area: the smallest circuit, the mappings for speed tried too. Speed: the fastest circuit, every mapping for speed and several placements tried. ISE gets Speed / Normal, Area / High and Speed / High.'),
      h('div', { style: { gridColumn: '1 / 3', color: 'var(--grey-3)' } }, 'Use JTAG Clock when programming over JTAG (iMPACT, xc3sprog, djtgcfg); CCLK when booting from the PROM/flash.')),
  });
  if (!r) return;
  pj = await currentProject();   // (#2281)
  if (pj?.name !== pj0.name) return;
  // (a place and route engine saved by an earlier version, #2136: nextpnr, the one engine since #2137)
  const { engine, s6Map, ...impl } = pj.impl;
  pj.impl = { ...impl, ...GOAL_IMPL[opt.value], startupClk: clk.value, ...((map ? map.value : s6Map) === 'silinx' ? { s6Map: 'silinx' } : {}) };
  await app.saveProjectJson();
}

// ------------------------------------------------------------------ toolchain
export async function toolchainDialog() {
  // the dialog at once, filled in when the detection answers (it runs the programmers for their versions:
  // seconds on a slow machine, and the dialog opened after it came over whatever was done meanwhile, the
  // menu bar's next menu: #495); Save once it is filled in
  const body = h('div', { class: 'tc-detecting' }, h('p', {}, 'Detecting the toolchain (Xilinx ISE, the device programmers)…'));
  const save = { label: 'Save', primary: true, value: true, disabled: true };
  const answer = dialog({ title: 'Toolchain Settings', width: 640, body, buttons: [save, { label: 'Cancel', value: null }] });
  let tc;
  const pjName = S.project?.name || null;
  try { tc = await api.toolchain(pjName); } catch (e) {
    body.replaceChildren(h('div', { class: 'msg msg-error' }, h('div', { class: 'msg-icon' }, '✖'), h('div', { class: 'msg-text' }, e.message)));
    body.classList.remove('tc-detecting');
    return answer;
  }
  const cfg = JSON.parse(JSON.stringify(tc.config));
  const ISE_OPTS = [['local', 'Local (Xilinx ISE installed locally)'], ['docker', 'Docker image with Xilinx ISE'], ['ssh', 'Remote host with Xilinx ISE via SSH']];
  const mode = select([['silinx', 'Silinx toolchain (no ISE)'], ...ISE_OPTS], cfg.mode);   // (the Silinx toolchain first, #1347)
  const inputs = {
    'local.settings': h('input', { type: 'text', value: cfg.local.settings || '', placeholder: 'auto-detect (…/14.7/ISE_DS/settings64.sh)' }),
    'docker.image': h('input', { type: 'text', value: cfg.docker.image || '', placeholder: 'e.g. my-ise:14.7' }),
    'docker.settings': h('input', { type: 'text', value: cfg.docker.settings || '' }),
    'ssh.host': h('input', { type: 'text', value: cfg.ssh.host || '' }),
    'ssh.user': h('input', { type: 'text', value: cfg.ssh.user || '' }),
    'ssh.port': h('input', { type: 'text', value: String(cfg.ssh.port || 22) }),
    'ssh.remoteDir': h('input', { type: 'text', value: cfg.ssh.remoteDir || '' }),
    'ssh.settings': h('input', { type: 'text', value: cfg.ssh.settings || '' }),
    'ssh.image': h('input', { type: 'text', value: cfg.ssh.image || '', placeholder: 'none: ISE installed on the host' }),
    'programmer.tool': select([['', 'Board default'], 'impact', 'djtgcfg', 'adepttool', 'xc3sprog', 'openFPGALoader'], cfg.programmer.tool || ''),
    'programmer.cable': h('input', { type: 'text', value: cfg.programmer.cable || '', placeholder: 'board default' }),
  };
  const groups = {
    local: ['local.settings'], docker: ['docker.image', 'docker.settings'], ssh: ['ssh.host', 'ssh.user', 'ssh.port', 'ssh.remoteDir', 'ssh.image', 'ssh.settings'],
  };
  const labels = {
    'local.settings': 'ISE settings64.sh:', 'docker.image': 'Docker image:', 'docker.settings': 'settings64.sh in image:',
    'ssh.host': 'Host:', 'ssh.user': 'User:', 'ssh.port': 'Port:', 'ssh.remoteDir': 'Remote build dir:', 'ssh.image': 'Docker image on the remote host:', 'ssh.settings': 'Remote settings64.sh:',
    'programmer.tool': 'Programmer tool:', 'programmer.cable': 'Cable:',
  };
  const modeBox = h('div', { class: 'form-grid' });
  // the Silinx toolchain and the project's device: available, or why not
  const os = tc.open;
  const openBox = h('div', { class: `msg open-status ${os?.available ? '' : 'msg-warn'}`, style: { marginBottom: '10px' } }, h('div', { class: 'msg-icon' }, os?.available ? '✓' : '!'),
    h('div', { class: 'msg-text' }, h('b', {}, os ? `Silinx toolchain for ${os.part || S.project?.device?.part || 'this device'}: ${os.available ? 'available' : 'not available'}` : 'Silinx toolchain: open a project to see whether its device is supported'),
      os ? h('div', {}, os.reason) : null,
      h('div', { style: { color: 'var(--grey-3)', marginTop: '4px' } }, 'Supported now: the Spartan-3E XC3S100E, XC3S250E (Basys2), XC3S500E and XC3S1200E (Nexys2).')));
  const renderMode = () => {
    modeBox.innerHTML = '';
    const open = mode.value === 'silinx';
    // open mode: no ISE (the supported devices' descriptions ship with Silinx); the ISE modes' settings are kept
    for (const k of open ? [] : groups[mode.value]) modeBox.append(h('label', {}, labels[k]), inputs[k]);
    openBox.style.display = open ? '' : 'none';
  };
  mode.addEventListener('change', renderMode);
  renderMode();
  const st = tc.ise;
  const progRows = Object.entries(tc.programmers).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { html: v.found ? icons.ok : icons.err }), h('td', {}, v.found ? `${v.path}${v.version ? ` (${v.version})` : ''}` : 'not found')));
  body.replaceChildren(
    h('div', { class: `msg ${st.available ? '' : 'msg-warn'}`, style: { marginBottom: '10px' } }, h('div', { class: 'msg-icon' }, st.available ? '✓' : '!'),
      h('div', { class: 'msg-text' }, h('b', {}, st.mode === 'silinx' ? 'Silinx toolchain (no ISE): selected' : `Xilinx ISE 14.7: ${st.available ? 'available' : 'not available'}`), `\n${st.reason}\n\n`, h('span', { style: { color: 'var(--grey-3)' } }, st.help),
        st.available ? null : h('div', { style: { marginTop: '8px' } }, h('b', {}, 'Easiest setup on any OS: '), 'build the private Docker image with the Silinx kit (docker/ise/README.md): ',
          h('code', {}, 'docker/ise/build-ise-image.sh --installer <Xilinx_ISE_DS_Lin_14.7_1015_1.tar> --license <Xilinx.lic>'), ' (Windows: build-ise-image.ps1). It configures Silinx automatically.'))),
    h('div', { class: 'form-grid' }, h('label', {}, 'Execution mode:'), mode),
    h('div', { style: { margin: '6px 0 10px' } }, modeBox),
    openBox,
    h('div', { style: { fontWeight: 'bold', margin: '8px 0 4px' } }, 'Device programmers'),
    h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Tool'), h('th', {}, ''), h('th', {}, 'Location')), ...progRows),
    h('div', { class: 'form-grid', style: { marginTop: '8px' } }, h('label', {}, labels['programmer.tool']), inputs['programmer.tool'], h('label', {}, labels['programmer.cable']), inputs['programmer.cable']),
    h('div', { style: { color: 'var(--grey-5)', marginTop: '8px' } }, `Settings file: ${tc.configPath}`));
  body.classList.remove('tc-detecting');
  save.el.disabled = false;
  if (!await answer) return;
  const out = { mode: mode.value, local: {}, docker: {}, ssh: {}, programmer: {}, open: { iseMode: cfg.open?.iseMode || 'docker' } };
  for (const [k, el] of Object.entries(inputs)) {
    const [g, f] = k.split('.');
    out[g][f] = f === 'port' ? (+el.value || 22) : el.value.trim();
  }
  try {
    S.toolchain = await api.saveToolchain(out);
    app.log(`Toolchain settings saved (${S.toolchain.ise.mode}: ${S.toolchain.ise.reason}).`, S.toolchain.ise.available ? 'ok' : 'warn');
    app.renderProcesses();
  } catch (e) { alertDlg('Toolchain Settings', e.message, 'error'); }
}

const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);
// a link from GitHub's release object (#1444: an answer of api.github.com, kept in localStorage): only to GitHub's own
// origins (web/js/release-url.js), any other URL shown as its text
const releaseLink = (href, text) => (safeReleaseUrl(href) ? link(href, text) : h('span', {}, text));

// the open-source components shipped with Silinx (core/third-party.js, generated), collapsible;
// the standalone edition embeds only some of them
function componentsNode() {
  const list = THIRD_PARTY.filter(c => !api.standalone || c.standalone);
  const tbl = h('table', { class: 'grid about-components', style: { fontSize: '11px' } },
    h('tr', {}, h('th', {}, 'Component'), h('th', {}, 'Version'), h('th', {}, 'Licence')),
    ...list.map(c => h('tr', { 'data-no-i18n': '' }, h('td', {}, link(c.url, c.name)), h('td', {}, c.version), h('td', {}, c.license))));   // names: not translated
  return h('details', { class: 'about-oss', style: { margin: '6px 0' } },
    h('summary', {}, `Open-source components (${list.length})`),
    h('div', { class: 'hint', style: { margin: '4px 0' } }, 'Each keeps its own licence; the full texts are in ', h('span', { 'data-no-i18n': '' }, link(`https://github.com/${REPOSITORY}/blob/main/THIRD-PARTY-NOTICES.md`, 'THIRD-PARTY-NOTICES.md')), '. elkjs (EPL-2.0) source code: ', link('https://github.com/kieler/elkjs', 'github.com/kieler/elkjs'), '.'),
    h('div', { style: { maxHeight: '160px', overflow: 'auto' } }, tbl));
}

export function aboutDialog() {
  return dialog({
    title: `About ${PRODUCT}`, width: 520,
    body: h('div', { style: { display: 'flex', gap: '16px' } },
      h('div', { style: { width: '64px', height: '64px', background: '#c4161c', color: '#fff', font: 'bold 40px Arial', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' } }, 'S'),
      h('div', {}, h('div', { style: { fontSize: '16px', fontWeight: 'bold' } }, PRODUCT_FULL), h('div', {}, `Version ${VERSION}`),
        h('p', {}, 'Digital design platform for Xilinx FPGAs (Spartan-3/3A/3E/6, Virtex-4/5/6, 7-series with ISE 14.7) and the Lattice iCE40 and ECP5, made for teaching: mixed VHDL/Verilog projects; schematics with live simulation; FSM and ASM state machine editors; Boolean algebra: truth tables, expressions and Karnaugh maps; module and test bench wizards; behavioural and netlist simulation with waveforms; a board emulator; synthesis, place & route and bitstreams with the Silinx toolchain (the Basys2, Nexys2, Nexys3, Atlys, iCEBreaker and ULX3S boards) or with ISE 14.7; programming of the FPGA and its Platform Flash, also from the browser over USB.'),
        h('p', { style: { fontStyle: 'italic' } }, 'Silinx was developed for educational purposes, specifically to support the teaching of Digital Systems, because AMD/Xilinx discontinued support for Xilinx ISE a long time ago.'),
        h('table', { class: 'about-info', style: { borderSpacing: '0 3px', margin: '6px 0 10px' } },
          h('tr', {}, h('td', { style: { paddingRight: '10px', verticalAlign: 'top', fontWeight: 'bold' } }, 'Project:'),
            h('td', {}, link(`https://github.com/${REPOSITORY}`, `github.com/${REPOSITORY}`))),
          h('tr', {}, h('td', { style: { paddingRight: '10px', verticalAlign: 'top', fontWeight: 'bold' } }, 'Developers:'),
            h('td', {}, h('div', {}, 'Pedro Maló — ', link('https://github.com/pmnmalo', 'github.com/pmnmalo')),
              h('div', { style: { color: 'var(--grey-4)' } }, 'developed with Claude (Anthropic)'))),
          // whether this copy counts its use (only the published site does, with GoatCounter)
          h('tr', { class: 'about-counts' }, h('td', { style: { paddingRight: '10px', verticalAlign: 'top', fontWeight: 'bold' } }, 'Usage counts:'),
            h('td', {}, ...(siteCounts()
              ? ['This page counts its visits and what is used (a new project, a simulation, a bitstream…) with ', gcLink(), ': no cookies, no personal data, never the content of a project.']
              : ['None: this copy sends nothing.', ' Only the site (pmnmalo.github.io/Silinx) counts its visits, with ', gcLink(), ' (no cookies, no personal data).']))),
          // what the start-up check for updates reaches (#488), and where it is turned off
          h('tr', { class: 'about-updates' }, h('td', { style: { paddingRight: '10px', verticalAlign: 'top', fontWeight: 'bold' } }, 'Update check:'),
            h('td', {}, updateCheckEnabled()
              ? 'At start-up, the latest release is asked of GitHub (api.github.com and raw.githubusercontent.com, at most once an hour): the version only, nothing about you or your projects; the published site asks only itself. Help > Check for Updates at Start-up turns it off.'
              : 'Off: nothing is asked at start-up. Help > Check for Updates… checks by hand; Help > Check for Updates at Start-up turns it on again.'))),
        h('p', {}, `Copyright 2026 Pedro Maló. Free software under the GNU Affero General Public License v3.0 (`, link(`https://github.com/${REPOSITORY}/blob/main/LICENSE`, 'LICENSE'), ', with an additional permission for elkjs: ', link(`https://github.com/${REPOSITORY}/blob/main/NOTICE`, 'NOTICE'), ').'),
        h('p', { class: 'hint' }, 'This program comes with ABSOLUTELY NO WARRANTY. Source code: ', link(`https://github.com/${REPOSITORY}`, `github.com/${REPOSITORY}`), '.'),
        h('p', { class: 'hint' }, 'Using Silinx in a course? ', link(WHO_URL, 'Tell us who you are'), '.'),
        componentsNode(),
        h('p', { style: { color: 'var(--grey-4)' } }, 'Synthesis, place & route and bitstream generation use the Silinx toolchain (Yosys, nextpnr, and the bitstream writer of Silinx, icepack for the iCE40 or ecppack for the ECP5) for the Basys2, Nexys2, Nexys3, Atlys, iCEBreaker and ULX3S boards, or the Xilinx ISE 14.7 command-line tools. Xilinx, ISE, ISim, iMPACT and Spartan are trademarks of AMD/Xilinx; Silinx is an independent project, not affiliated with or endorsed by AMD/Xilinx.'))),
    buttons: [{ label: 'OK', primary: true, value: true }],
  });
}

// the usage counter of the published site (About: Usage counts)
export const GOATCOUNTER_URL = 'https://www.goatcounter.com';
const gcLink = () => { const a = link(GOATCOUNTER_URL, 'GoatCounter'); a.dataset.noI18n = ''; return a; };   // a name: never translated

// ------------------------------------------------------------------ Tell us who you are
// the users who want to say so (school, course, role): a GitHub Discussions thread, nothing collected
export const WHO_URL = `https://github.com/${REPOSITORY}/discussions/151`;   // "Who is using Silinx?"
export function whoAreYou() {
  return dialog({
    title: 'Tell Us Who You Are', width: 480,
    body: h('div', {},
      h('p', {}, 'Silinx is free and asks for nothing. If you use it, in a course, a school or on your own, we would like to know: it helps to decide what to improve.'),
      h('p', {}, 'Say hello on GitHub Discussions (a GitHub account is needed): your school or course, your role (teacher, student…), the boards you use. Only what you write there is seen.'),
      h('p', {}, link(WHO_URL, 'Who is using Silinx? (GitHub Discussions)'))),
    buttons: [{ label: 'OK', primary: true, value: true }],
  });
}

// ------------------------------------------------------------------ Check for updates
const REPO = REPOSITORY;

/** Help ▸ Check for Updates…: the running version vs the latest release on GitHub. */
// What changed between the running version and `latest`: the CHANGELOG.md of that release (newest
// first); without it, the "What's new" part of the release text. Never fails (null).
async function whatsNew(latest, rel) {
  const { changesSince, parseChangelog } = await import('/core/changelog.js');
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 4000);   // never hold the dialog long
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/v${latest}/CHANGELOG.md`, { cache: 'no-store', signal: ctl.signal }).finally(() => clearTimeout(timer));
    if (r.ok) { const secs = changesSince(await r.text(), VERSION, latest); if (secs.length) return secs; }
  } catch { /* offline / no changelog in that release */ }
  const m = /## What's new in (\S+)\s*\n([\s\S]*?)(?=\n## |\n\*\*Silinx\b|$)/.exec(rel?.body || '');
  return m ? parseChangelog(`## ${m[1]}\n${m[2]}`) : null;
}

// a changelog section as DOM (bullets, **bold**, *italic*, `code`; text only, never HTML)
function changesNode(sections) {
  const inline = (text) => {
    const out = [];
    const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
    let at = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > at) out.push(text.slice(at, m.index));
      out.push(m[1] != null ? h('b', {}, m[1]) : m[2] != null ? h('i', {}, m[2]) : h('code', {}, m[3]));
      at = re.lastIndex;
    }
    if (at < text.length) out.push(text.slice(at));
    return out;
  };
  const box = h('div', { class: 'whats-new', style: { maxHeight: '260px', overflow: 'auto', border: '1px solid var(--frame-light)', padding: '4px 10px', margin: '6px 0' } });
  for (const s of sections) {
    box.append(h('div', { style: { fontWeight: 'bold', marginTop: '6px' } }, `${PRODUCT} ${s.version}`));
    const items = [];
    for (const line of s.body.split('\n')) {
      if (/^\s*-\s+/.test(line)) items.push(line.replace(/^\s*-\s+/, ''));
      else if (line.trim() && items.length) items[items.length - 1] += ` ${line.trim()}`;
    }
    box.append(h('ul', { style: { margin: '2px 0 4px 18px', padding: 0 } }, ...items.map(it => h('li', {}, ...inline(it)))));
  }
  return box;
}

// The published site (the stable edition and dev/) serves what its last build made, described by
// version.json next to the page (scripts/build-standalone.mjs --site). There the question is whether
// the site serves another page than the one open (a reload gets it), not GitHub's latest release: a
// release is published minutes before the site is rebuilt from it, and dev/ is built from main (#198).
// null: not on such a site (the application, a downloaded Silinx.html): GitHub's releases.
async function siteVersion() {
  if (!/^https?:$/.test(globalThis.location?.protocol || '')) return null;
  try {
    const r = await fetch(new URL('version.json', location.href), { cache: 'no-store' });
    if (!r.ok) return null;
    const v = await r.json();
    return typeof v?.version === 'string' ? v : null;
  } catch { return null; }
}
const servedLabel = v => versionLabel(v.build, v.version);
const sameBuild = v => servedLabel(v) === VERSION_LABEL;

async function latestRelease() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub rate limit reached, try again later' : `GitHub answered ${r.status}`);
  return r.json();
}

// the start-up check's last answer (GitHub allows 60 unauthenticated requests an hour per address:
// a page reloaded many times would use them up), kept an hour, a failure ten minutes
const UPDATE_CACHE = prefKey('silinx.updateCheck');
const cachedRelease = () => {
  try {
    const c = JSON.parse(localStorage.getItem(UPDATE_CACHE) || 'null');
    if (c && Date.now() - c.at < (c.rel ? 3600e3 : 600e3) && c.at <= Date.now()) return c;
  } catch { /* no storage */ }
  return null;
};
const cacheRelease = rel => { try { localStorage.setItem(UPDATE_CACHE, JSON.stringify({ at: Date.now(), rel })); } catch { /* no storage */ } };

// the setting Help ▸ Check for Updates at Start-up (#488): on unless turned off, kept in localStorage;
// Help ▸ Check for Updates… always works by hand
const UPDATE_ON_START = prefKey('silinx.updateCheckOnStart');
/** Whether the start-up check for updates is on (the default). */
export function updateCheckEnabled() {
  try { return localStorage.getItem(UPDATE_ON_START) !== 'off'; } catch { return true; }
}
export function setUpdateCheckEnabled(on) {
  try { localStorage.setItem(UPDATE_ON_START, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
}

/**
 * At start-up: check the latest release on GitHub (at most once an hour); a newer version opens the
 * update dialog, otherwise one line in the console (no network / GitHub error: nothing shown). With the
 * setting off, nothing leaves: one line in the console says so.
 */
export async function checkUpdatesOnStart() {
  if (!updateCheckEnabled()) { app.log('Check for updates at start-up is off (Help menu); Help > Check for Updates… checks now.', 'info'); return null; }
  // on the site: the page open against the one it serves now
  const served = await siteVersion();
  if (served) {
    if (!sameBuild(served)) return checkUpdatesDialog({ served });
    app.log(`${PRODUCT} ${VERSION_LABEL} is the version this site serves.`, 'info');
    return null;
  }
  let rel;
  const cached = cachedRelease();
  if (cached) {
    if (!cached.rel) return null;
    rel = cached.rel;
  } else {
    try { rel = await latestRelease(); } catch { cacheRelease(null); return null; }
    cacheRelease({ tag_name: rel.tag_name, name: rel.name, html_url: rel.html_url, published_at: rel.published_at,
      assets: (rel.assets || []).map(({ name, browser_download_url, size }) => ({ name, browser_download_url, size })) });
  }
  const latest = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
  if (!latest) return null;
  if (compareVersions(latest, VERSION) > 0) return checkUpdatesDialog({ rel });
  app.log(`${PRODUCT} ${VERSION} is up to date (latest release on GitHub: ${latest}).`, 'info');
  return null;
}

export async function checkUpdatesDialog({ rel: known = null, served = undefined } = {}) {
  const body = h('div', {}, h('p', {}, `Running ${PRODUCT} ${VERSION_LABEL}. Checking for a newer version…`));
  // the dialog at once, filled in when the answer comes (opened after it, the site's version.json or
  // GitHub's release, it came over whatever was done meanwhile: #441); on the site, Reload is added
  // when it serves another page
  let ui = null;
  // (Refresh: checked again, the dialog opened anew with the answer of now, #2013)
  const done = dialog({ title: 'Check for Updates', width: 520, body, buttons: [{ label: 'Refresh', value: 'refresh' }, { label: 'OK', primary: true, value: true }], onOpen: x => { ui = x; } })
    .then(v => { if (v === 'reload') location.reload(); if (v === 'refresh') return checkUpdatesDialog(); return v; });
  // on the site: a newer page served (reload), or this one is the site's
  if (served === undefined && !known) served = await siteVersion();
  if (served) {
    const fresh = sameBuild(served);
    body.replaceChildren(...[
      fresh ? h('p', {}, h('b', {}, `${PRODUCT} ${VERSION_LABEL} is up to date.`)) : h('p', {}, h('b', {}, `This site now serves ${PRODUCT} ${servedLabel(served)}.`)),
      fresh ? h('p', {}, 'It is the version this site serves.') : h('p', {}, `This page is ${VERSION_LABEL}: reload the page to get the new version (your projects are kept).`),
      BUILD ? h('p', { class: 'hint' }, 'This is the development edition, built from the latest code (main): it is updated after every change, before the releases.') : null,
      h('p', {}, 'Releases: ', link(`https://github.com/${REPO}/releases`, `github.com/${REPO}/releases`))].filter(Boolean));
    if (!fresh) ui.dlg.querySelector('.dlg-buttons').prepend(h('button', { class: 'btn', onclick: () => ui.close('reload') }, 'Reload'));
    return done;
  }
  let rel = known;
  try {
    rel ||= await latestRelease();
  } catch (e) {
    body.replaceChildren(h('p', {}, `Running ${PRODUCT} ${VERSION}.`),
      h('p', { style: { color: 'var(--error-fg-2)' } }, `Could not check for updates: ${e.message || e}.`),
      h('p', {}, 'Releases: ', link(`https://github.com/${REPO}/releases`, `github.com/${REPO}/releases`)));
    return done;
  }
  const latest = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
  const cmp = compareVersions(latest, VERSION);
  const when = rel.published_at ? new Date(rel.published_at).toLocaleDateString() : '';
  const assets = (rel.assets || []).map((a) => h('li', {}, releaseLink(a.browser_download_url, a.name), ` (${Math.max(1, Math.round(a.size / 1024))} KB)`));
  if (cmp > 0) {
    const news = await whatsNew(latest, rel);
    body.replaceChildren(...[
      h('p', {}, h('b', {}, `A new version is available: ${PRODUCT} ${latest}`), when ? ` (released ${when})` : ''),
      h('p', {}, `You are running ${VERSION}.`),
      news?.length ? h('div', {}, h('b', {}, "What's new:"), changesNode(news)) : null,
      h('p', {}, 'Release notes and downloads: ', releaseLink(rel.html_url, rel.name || `v${latest}`)),
      assets.length ? h('ul', { style: { margin: '4px 0 8px 18px', padding: 0 } }, ...assets) : null,
      h('p', { class: 'hint' }, 'To update: download silinx-<version>.zip and replace your Silinx folder (your projects in the workspace are kept), or download the new Silinx.html for the standalone edition.')].filter(Boolean));
  } else {
    body.replaceChildren(...[
      h('p', {}, h('b', {}, `${PRODUCT} ${VERSION} is up to date.`)),
      h('p', {}, `Latest release on GitHub: ${latest}${when ? ` (${when})` : ''} — `, releaseLink(rel.html_url, 'release notes')),
      cmp < 0 ? h('p', { class: 'hint' }, 'You are running a development version newer than the latest release.') : null].filter(Boolean));
  }
  return done;
}

export function shortcutsDialog() {
  const rows = [['Ctrl/Cmd+K', 'Command palette: search commands and files'], ['Ctrl+Space', 'Auto-complete'], ['Ctrl/Cmd+/', 'Toggle comment'], ['Ctrl+F / Ctrl+H', 'Find / Replace'], ['Ctrl+G', 'Go to line'], ['F12 or Ctrl/Cmd+Click', 'Go to definition'], ['F2', 'Rename symbol'], ['Ctrl/Cmd+.', 'Quick fix of an error'], ['Ctrl+Q', 'Fold block'], ['Alt+Shift+← / →', 'Move the focused document tab left / right (or drag it)'], ['Double-click process', 'Run process'], ['Double-click instance (schematic)', 'Push into instance']];
  return dialog({
    title: 'Keyboard Shortcuts', width: 440,
    body: h('table', { class: 'grid' }, ...rows.map(([k, v]) => h('tr', {}, h('td', { style: { fontFamily: 'var(--mono)' } }, k), h('td', {}, v)))),
    buttons: [{ label: 'OK', primary: true, value: true }],
  });
}

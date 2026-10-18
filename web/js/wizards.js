// Wizards and dialogs modelled on ISE (New Project Wizard, New Source Wizard, properties...).
import { api } from './api.js';
import { PRODUCT, PRODUCT_FULL, VERSION, VERSION_LABEL, BUILD, REPOSITORY, compareVersions, versionLabel } from '/core/version.js';
import { icons, icon } from './icons.js';
import { h, dialog, alertDlg, confirmDlg, toast } from './ui.js';
import * as T from './templates.js';
import { typeText } from './editor.js';
import { S, app } from './app.js';
import { THIRD_PARTY } from '/core/third-party.js';
import { drawnHdlPath, isView } from '/core/view-hdl.js';
import { countEvent, siteCounts } from './analytics.js';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
// Device used when no evaluation board is selected.
const DEFAULT_DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };
const FILE_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function field(label, input) { return [h('label', {}, label), input]; }
export function select(options, value) {
  const s = h('select');
  for (const o of options) {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    s.append(h('option', { value: v, selected: v === value }, l));
  }
  return s;
}

// Cascading Family -> Device -> Package -> Speed selectors over the device database.
function devicePicker(db, device) {
  const families = (db.families || []).filter(f => (f.parts || []).length);
  const famOf = part => db.parts.find(p => p.part === part)?.family || 'spartan3e';
  const famSel = h('select'), partSel = h('select'), pkgSel = h('select'), spdSel = h('select');
  let cur = { ...device };
  const fillFam = () => {
    famSel.innerHTML = '';
    for (const f of families) famSel.append(h('option', { value: f.id, selected: f.id === famOf(cur.part) }, f.displayName || f.name));
  };
  const fillParts = () => {
    partSel.innerHTML = '';
    const parts = db.parts.filter(p => p.family === famSel.value);
    if (!parts.some(p => p.part === cur.part)) cur.part = parts[0]?.part;
    for (const p of parts) partSel.append(h('option', { value: p.part, selected: p.part === cur.part }, p.part.toUpperCase()));
    fillPkgs();
  };
  const fillPkgs = () => {
    const part = db.parts.find(p => p.part === partSel.value);
    pkgSel.innerHTML = ''; spdSel.innerHTML = '';
    if (!part) return;
    const pkgs = Object.keys(part.packages);
    if (!pkgs.includes(cur.package)) cur.package = pkgs[0];
    for (const k of pkgs) pkgSel.append(h('option', { value: k, selected: k === cur.package }, `${k.toUpperCase()}  (${part.packages[k].userIo ?? '?'} I/O)`));
    if (!part.speeds.includes(cur.speed)) cur.speed = part.speeds.find(x => !/L|N$/i.test(x)) || part.speeds[0]; // a standard grade, not low-power
    for (const sp of part.speeds) spdSel.append(h('option', { value: sp, selected: sp === cur.speed }, sp));
  };
  famSel.addEventListener('change', () => fillParts());
  partSel.addEventListener('change', () => { cur.part = partSel.value; fillPkgs(); });
  pkgSel.addEventListener('change', () => { cur.package = pkgSel.value; });
  spdSel.addEventListener('change', () => { cur.speed = spdSel.value; });
  const set = d => { cur = { ...d }; fillFam(); fillParts(); };
  set(device);
  return {
    famSel, partSel, pkgSel, spdSel, set,
    disable(on) { [famSel, partSel, pkgSel, spdSel].forEach(e => { e.disabled = on; }); },
    value: () => ({ family: famSel.value, part: partSel.value, package: pkgSel.value, speed: spdSel.value }),
    familyName: () => famSel.selectedOptions[0]?.textContent || famSel.value,
  };
}

// Multi-page wizard driver. pages: [{ title, render() -> Node, validate?() -> string|null }]
export function wizard(title, pages, { width = 720, finishLabel = 'Finish' } = {}) {
  return new Promise(resolve => {
    let idx = 0;
    const side = h('div', { class: 'wiz-side' }, h('div', { class: 'logo' }, 'Silinx'), ...pages.map(p => h('div', { class: 'step' }, p.title)));
    const main = h('div', { class: 'wiz-main' });
    const err = h('div', { style: { color: 'var(--danger)', minHeight: '16px', marginTop: '6px' } });
    const body = h('div', {}, h('div', { class: 'wiz' }, side, h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column' } }, main, err)));
    let ctl;
    const render = () => {
      main.innerHTML = '';
      main.append(h('h3', {}, pages[idx].title), pages[idx].node ||= pages[idx].render());
      pages[idx].onShow?.();
      side.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('cur', i === idx));
      if (ctl) {
        ctl.buttons[0].el.disabled = idx === 0;
        ctl.buttons[1].el.textContent = idx === pages.length - 1 ? finishLabel : 'Next >';
      }
      err.textContent = '';
    };
    const next = async () => {
      const msg = await pages[idx].validate?.();
      if (msg) { err.textContent = msg; return false; }
      if (idx === pages.length - 1) return true;
      idx++; render();
      return false;
    };
    dialog({
      title, width, body,
      buttons: [
        { label: '< Back', validate: () => { if (idx > 0) { idx--; render(); } return false; } },
        { label: 'Next >', primary: true, value: true, validate: next },
        { label: 'Cancel', value: false },
      ],
      onOpen: c => { ctl = c; render(); },
    }).then(resolve);
  });
}

// ------------------------------------------------------------------ New Project
// A project with this name already exists: ask whether to replace it. With the server the old
// project is moved to <workspace>/.trash (recoverable); in the standalone edition it is deleted,
// unless the projects are kept in a workspace folder on the disk (it has a .trash folder too).
const deletesProjects = () => api.standalone && !api.keepsTrash;
async function askReplaceProject(pname) {
  const list = await api.projects();
  if (!list.some(p => p.name === pname)) return true;
  return confirmDlg('Replace Project',
    `A project named '${pname}' already exists.\n\nReplace it? ${deletesProjects() ? 'The existing project will be deleted from this browser.' : 'The existing project is moved to the workspace .trash folder.'}`);
}
// Replace an existing project by running `fn` (an import): the old project is removed first; if
// the import then fails, it comes back from a snapshot taken before (standalone: a bundle; server:
// a Silinx zip of the whole project) and is opened again if it was open. Should the restore fail
// too, the server still has the old project in the workspace .trash folder.
async function replaceProjectWith(pname, fn) {
  const exists = (await api.projects()).some(p => p.name === pname);
  const wasOpen = S.project?.name === pname;
  let backup = null;
  if (exists) {
    try {
      if (api.standalone && api.exportBundle) backup = { bundle: await api.exportBundle(pname) };
      else backup = { zip: (await api.exportZip(pname, 'silinx')).blob };
    } catch { /* no snapshot: the server keeps the old project in .trash */ }
  }
  await removeExistingProject(pname);
  try { return await fn(); }
  catch (e) {
    try { await api.deleteProject(pname); } catch { /* nothing was created */ }
    let restored = false;
    try {
      if (backup?.bundle) { await api.importBundle(backup.bundle); restored = true; }
      else if (backup?.zip) { await api.importZip(pname, backup.zip); restored = true; }
    } catch { /* keep the import error */ }
    if (restored) {
      app.log(`The previous project '${pname}' was restored.`, 'info');
      if (wasOpen) { try { await app.openProject(pname); app.showLeftPage('design'); } catch { /* it is in the project list */ } }
    } else if (exists && !deletesProjects()) app.log(`The previous project '${pname}' is in the workspace .trash folder.`, 'info');
    throw e;
  }
}

async function removeExistingProject(pname) {
  const list = await api.projects();
  if (!list.some(p => p.name === pname)) return;
  if (S.project?.name === pname) await app.closeProject();
  await api.deleteProject(pname);
  app.log(`Project '${pname}' replaced${deletesProjects() ? '' : ' (the old one is in the workspace .trash folder)'}.`, 'info');
}

// the synthesis tools of a project (Silinx: the Silinx toolchain's whole flow, no ISE; XST: Xilinx ISE)
const SYNTH_TOOLS = [['silinx', 'Silinx (VHDL/Verilog; no ISE needed)'], ['xst', 'XST (VHDL/Verilog; Xilinx ISE)']];

export async function newProjectWizard({ template = 'empty' } = {}) {
  const db = S.devices || await api.devices();
  const templates = await api.templates().catch(() => []);
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
  const tplSel = select([['empty', 'Empty project'], ...templates.map(t => [t, `Example: ${t}`])], template);
  const p1 = {
    title: 'Create New Project',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Enter a name and location for the project.'),
      h('div', { class: 'form-grid' },
        ...field('Name:', name),
        ...field('Location:', h('input', { type: 'text', value: where.location + (st.name || '…'), disabled: true })),
        ...field('Start from:', tplSel)),
      h('div', { class: 'hint', style: { marginTop: '14px' } }, where.hint)),
    validate: async () => {
      if (!NAME_RE.test(name.value.trim())) return 'Project name must start with a letter and contain only letters, digits and _.';
      st.replace = false;
      const list = await api.projects();
      if (list.some(p => p.name === name.value.trim())) {
        if (!await askReplaceProject(name.value.trim())) return `A project named '${name.value.trim()}' already exists: choose another name.`;
        st.replace = true;
      }
      return null;
    },
  };
  const boardSel = select([['', 'None Specified'], ...db.boards.map(b => [b.id, b.name])], '');
  const dp = devicePicker(db, st.device);
  boardSel.addEventListener('change', () => {
    const b = db.boards.find(x => x.id === boardSel.value);
    st.device = b ? { ...b.device } : { ...DEFAULT_DEVICE };
    dp.set(st.device);
    dp.disable(!!b);
  });
  // the synthesis tool: Silinx (its own flow, no ISE) or XST (Xilinx ISE, as set in Toolchain Settings)
  const synthSel = select(SYNTH_TOOLS, 'silinx');
  const langSel = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], 'vhdl');
  // the type of the top-level source: HDL, or a diagram / table whose HDL module is kept in sync
  const topType = select(TOP_TYPES.map(t => [t.id, t.label]), 'hdl');
  const topNote = h('div', { class: 'hint', style: { gridColumn: '1 / -1', marginTop: '-4px' } });
  const syncTop = () => {
    const ex = tplSel.value !== 'empty';
    topType.disabled = ex;
    if (ex) topType.value = 'hdl';
    const t = TOP_TYPES.find(x => x.id === topType.value);
    topNote.textContent = ex ? 'The example has its own sources.' : t.id === 'hdl' ? '' : `The project starts with ${t.file} (the top module 'top') and its HDL module, generated from it.`;
    topNote.style.display = topNote.textContent ? '' : 'none';
  };
  topType.addEventListener('change', syncTop);
  const p2 = {
    title: 'Project Settings',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Select the device and design flow for the project.'),
      h('div', { class: 'form-grid' },
        ...field('Evaluation Development Board:', boardSel),
        ...field('Product Category:', select(['All'], 'All')),
        ...field('Family:', dp.famSel),
        ...field('Device:', dp.partSel),
        ...field('Package:', dp.pkgSel),
        ...field('Speed:', dp.spdSel),
        ...field('Top-Level Source Type:', topType), topNote,
        ...field('Synthesis Tool:', synthSel),
        ...field('Simulator:', select(['Silinx ISim-compatible (VHDL/Verilog)'], '')),
        ...field('Preferred Language:', langSel),
        ...field('VHDL Source Analysis Standard:', select(['VHDL-93', 'VHDL-2008'], 'VHDL-93')),
      )),
    onShow: () => syncTop(),
  };
  const summary = h('div');
  const p3 = {
    title: 'Project Summary',
    render: () => summary,
    onShow: () => {
      summary.innerHTML = '';
      const b = db.boards.find(x => x.id === boardSel.value);
      summary.append(h('pre', { class: 'code-box' },
        `Project Navigator will create a new project with the following specifications.\n\n` +
        `Project:\n  Project Name: ${name.value.trim()}\n  Template:     ${tplSel.value}\n\n` +
        `Device:\n  Board:        ${b ? b.name : 'None Specified'}\n  Family:       ${dp.familyName()}\n  Device:       ${dp.value().part.toUpperCase()}\n  Package:      ${dp.value().package.toUpperCase()}\n  Speed:        ${dp.value().speed}\n\n` +
        `Flow:\n  Top-Level Source Type: ${TOP_TYPES.find(t => t.id === topType.value).label}\n  Synthesis Tool:     ${SYNTH_TOOLS.find(t => t[0] === synthSel.value)[1]}\n  Simulator:          Silinx behavioural simulator\n  Preferred Language: ${langSel.value.toUpperCase()}`));
    },
  };
  const ok = await wizard('New Project Wizard', [p1, p2, p3]);
  if (!ok) return;
  try {
    if (st.replace) await removeExistingProject(name.value.trim());
    const pj = await api.createProject({
      name: name.value.trim(), template: tplSel.value,
      device: dp.value(),
      board: boardSel.value || (tplSel.value !== 'empty' ? undefined : null),
    });
    countEvent('new-project');
    pj.preferredLanguage = langSel.value;
    pj.topSourceType = topType.value;
    pj.synthTool = synthSel.value;
    await api.saveProject(pj.name, pj);
    // a diagram / table top: its document and its synchronized HDL module 'top'
    const top = topType.value !== 'hdl' && tplSel.value === 'empty' ? await createTopSource(pj.name, topType.value, langSel.value) : null;
    await app.openProject(pj.name);
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
  { id: 'fsm', label: 'State Machine (FSM)', file: 'src/top.fsm.json' },
  { id: 'asm', label: 'State Machine (ASM)', file: 'src/top.asm.json' },
  { id: 'tt', label: 'Truth Table', file: 'src/top.tt.json' },
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

export async function openProjectDialog() {
  const list = await api.projects();
  let chosen = null;
  const tbl = h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Project'), h('th', {}, 'Device'), h('th', {}, 'Top'), h('th', {}, 'Board')));
  for (const p of list) {
    const tr = h('tr', {}, h('td', {}, p.name), h('td', {}, p.device ? `${p.device.part}${p.device.speed}-${p.device.package}` : ''), h('td', {}, p.top || ''), h('td', {}, p.board || ''));
    tr.addEventListener('click', () => { tbl.querySelectorAll('tr').forEach(r => r.classList.remove('sel')); tr.classList.add('sel'); chosen = p.name; });
    tr.addEventListener('dblclick', () => { chosen = p.name; document.querySelector('.dlg .btn.primary')?.click(); });
    tbl.append(tr);
  }
  const r = await dialog({
    title: 'Open Project', width: 560,
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

export async function importXiseDialog() {
  const fileInp = h('input', { type: 'file', multiple: true, accept: '.zip,.xise,.v,.vhd,.vhdl,.ucf' });
  const dirInp = h('input', { type: 'file', webkitdirectory: true, multiple: true });
  const name = h('input', { type: 'text', placeholder: 'new project name' });
  const info = h('div', { class: 'hint', style: { minHeight: '16px' } });
  const suggest = n => { if (!name.value && n) name.value = n.replace(/\.(zip|xise)$/i, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z]+/, 'p_'); };
  fileInp.addEventListener('change', () => {
    dirInp.value = '';
    const f = [...fileInp.files].find(x => /\.(zip|xise)$/i.test(x.name));
    if (f) suggest(f.name);
    info.textContent = fileInp.files.length ? `${fileInp.files.length} file(s) selected` : '';
  });
  dirInp.addEventListener('change', () => {
    fileInp.value = '';
    const files = [...dirInp.files];
    const xise = files.find(x => /\.xise$/i.test(x.name));
    suggest(xise ? xise.name : (files[0]?.webkitRelativePath || '').split('/')[0]);
    info.textContent = files.length ? `Folder '${(files[0].webkitRelativePath || '').split('/')[0]}': ${files.length} file(s)${xise ? `, project ${xise.name}` : ' — no .xise found!'}` : '';
  });
  const r = await dialog({
    title: 'Import Xilinx ISE Project', width: 600,
    body: h('div', {},
      h('div', { class: 'hint' }, 'Import an ISE project from its folder (the folder with the .xise file), or from a .zip of that folder (e.g. one exported with File ▸ Export Xilinx ISE Project). ',
        'ISE output files in the folder (xst, _ngo, netlists, bitstreams, logs) are not imported.'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('Project folder:', dirInp),
        ...field('or .zip / .xise file(s):', fileInp),
        ...field('Project name:', name)),
      info),
    buttons: [{ label: 'Import', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  const files = [...fileInp.files];
  const zf = files.find(f => /\.zip$/i.test(f.name));
  const xf = files.find(f => /\.xise$/i.test(f.name));
  if (!dirInp.files.length && !zf && !xf) return alertDlg('Import Xilinx ISE Project', 'Select the project folder, a .zip, or a .xise with its sources.', 'error');
  const folder = (dirInp.files[0]?.webkitRelativePath || '').split('/')[0];
  const pname = (name.value.trim() || (zf || xf)?.name.replace(/\.(zip|xise)$/i, '') || folder || 'imported').replace(/[^A-Za-z0-9_]/g, '_');
  if (!await askReplaceProject(pname)) return;
  try {
    const res = await replaceProjectWith(pname, async () => {
      if (dirInp.files.length) {
        const z = await zipFolderSelection(dirInp.files);
        app.log(`Importing folder '${z.rootName}': ${z.count} file(s)${z.skipped ? `, ${z.skipped} ISE output/hidden file(s) skipped` : ''}.`, 'info');
        return api.importZip(pname, z.blob);
      }
      if (zf) return api.importZip(pname, zf);
      const others = {};
      for (const f of files.filter(f => f !== xf)) others[f.name] = await f.text();
      return api.importXise({ name: pname, xise: await xf.text(), files: others });
    });
    await app.openProject(pname);
    app.showLeftPage('design');
    const n = res?.project?.files?.length ?? 0;
    app.log(`Imported Xilinx ISE project '${pname}' (${n} source file(s)${res?.extra?.length ? `, ${res.extra.length} other file(s)` : ''}).`, 'ok');
    if (res?.missing?.length) app.log(`WARNING: files referenced by the .xise but not found: ${res.missing.join(', ')}`, 'warn');
    for (const w of res?.warnings || []) app.log(`WARNING: ${w}`, 'warn');
  } catch (e) { alertDlg('Import Xilinx ISE Project', e.message, 'error'); }
}

// ------------------------------------------------------------------ Import Silinx ISE Project
// A .zip made with File ▸ Export Silinx ISE Project (silinx.json + every project file).
export async function importSilinxDialog() {
  const fileInp = h('input', { type: 'file', accept: '.zip' });
  const name = h('input', { type: 'text', placeholder: 'project name' });
  fileInp.addEventListener('change', () => {
    const f = fileInp.files[0];
    if (f && !name.value) name.value = f.name.replace(/\.zip$/i, '').replace(/-silinx$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
  });
  const r = await dialog({
    title: 'Import Silinx ISE Project', width: 520,
    body: h('div', {},
      h('div', { class: 'hint' }, 'Import a whole Silinx project from a .zip made with File ▸ Export Silinx ISE Project (silinx.json and every project file: sources, ASM charts, schematics, constraints, simulation files).'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('.zip file:', fileInp),
        ...field('Project name:', name))),
    buttons: [{ label: 'Import', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  const zf = fileInp.files[0];
  if (!zf) return alertDlg('Import Silinx ISE Project', 'Select the .zip of the Silinx project.', 'error');
  const pname = name.value.trim() || zf.name.replace(/\.zip$/i, '').replace(/-silinx$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!await askReplaceProject(pname)) return;
  try {
    const res = await replaceProjectWith(pname, () => api.importZip(pname, zf));
    await app.openProject(pname);
    app.showLeftPage('design');
    app.log(`Imported Silinx project '${pname}' (${res?.project?.files?.length ?? 0} source file(s)${res?.extra?.length ? `, ${res.extra.length} other file(s)` : ''}).`, 'ok');
    if (res?.missing?.length) app.log(`WARNING: files listed in silinx.json but not in the zip: ${res.missing.join(', ')}`, 'warn');
  } catch (e) { alertDlg('Import Silinx ISE Project', e.message, 'error'); }
}

// ------------------------------------------------------------------ replacing an existing file
// A wizard that would create a file which already exists asks once whether to replace it
// (returns null = go on, or the message that keeps the wizard on its page).
export function replaceGuard(title) {
  const ok = new Set();
  return async (path) => {
    if (!(S.diskTree || S.fileTree).includes(path) || ok.has(path)) return null;   // on disk (also a file removed from the project)
    if (await confirmDlg(title, `${path} already exists.\n\nReplace it? Its current contents will be lost.`)) { ok.add(path); return null; }
    return `${path} already exists: choose another name.`;
  };
}
// close the editors of a file about to be replaced (its new contents are opened afterwards)
export async function closeBeforeReplace(path) {
  for (const d of [...S.docs]) {
    if (d.path === path || String(d.id || '').endsWith(`:${path}`)) { d.dirty = false; clearTimeout(d._autosave); await app.closeDoc(d); }
  }
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

// ------------------------------------------------------------------ New Source
const SOURCE_TYPES = [
  // hdl / tb / tbwiz / modwiz / schwiz: VHDL or Verilog, chosen in the wizard (the extension follows the language)
  { id: 'tt', label: 'Truth Table', ico: 'truthtable', ext: '.tt.json', dir: 'src' },
  { id: 'hdl', label: 'Module (HDL)', ico: 'vhdl', ext: null, dir: 'src' },
  { id: 'modwiz', label: 'Module (Wizard)', ico: 'template', ext: null, dir: 'src' },
  { id: 'sch', label: 'Schematic (Diagram)', ico: 'schematic', ext: '.sch.json', dir: 'src' },
  { id: 'schwiz', label: 'Schematic (Wizard)', ico: 'schematic', ext: '.sch.json', dir: 'src' },
  { id: 'fsm', label: 'State Machine (FSM)', ico: 'fsm', ext: '.fsm.json', dir: 'src' },
  { id: 'asm', label: 'State Machine (ASM)', ico: 'asm', ext: '.asm.json', dir: 'src' },
  { id: 'petri', label: 'Petri Net (Diagram)', ico: 'petri', ext: '.pn.json', dir: 'src' },
  { id: 'pnwiz', label: 'Petri Net (Wizard)', ico: 'petri', ext: '.pn.json', dir: 'src' },
  { id: 'tb', label: 'Test Bench (HDL)', ico: 'vhdl', ext: null, dir: 'sim' },
  { id: 'tbwiz', label: 'Test Bench (Wizard)', ico: 'template', ext: null, dir: 'sim' },
  { id: 'ucf', label: 'Implementation Constraints File', ico: 'ucf', ext: '.ucf', dir: 'constraints' },
  { id: 'mem', label: 'Memory Initialization File (.mem)', ico: 'file', ext: '.mem', dir: 'src' },
  // not in the list any more; newSourceWizard({ type: 'vhdl-pkg' }) still creates one
  { id: 'vhdl-pkg', label: 'VHDL Package', ico: 'vhdl', ext: '.vhd', dir: 'src', hidden: true },
];
// the wizards opened by Finish on page 1 (New Source asks only the file name and location)
const WIZARD_TYPES = new Set(['tbwiz', 'modwiz', 'schwiz', 'pnwiz']);

export async function newSourceWizard({ type } = {}) {
  if (!S.project) return;
  // old type ids (vhdl, verilog, vhdl-tb, verilog-tb) still accepted: they preset the language
  const LEGACY = { vhdl: ['hdl', 'vhdl'], verilog: ['hdl', 'verilog'], 'vhdl-tb': ['tb', 'vhdl'], 'verilog-tb': ['tb', 'verilog'] };
  let st = SOURCE_TYPES.find(t => t.id === (LEGACY[type]?.[0] || type)) || SOURCE_TYPES.find(t => t.id === 'hdl');   // default: Module (HDL)
  const shown = () => SOURCE_TYPES.filter(t => !t.hidden || t === st);
  // language of HDL modules and test benches (Define Module / Associate Source pages)
  const langSel = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], LEGACY[type]?.[1] || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl'));
  const extOf = t => t.ext ?? (langSel.value === 'verilog' ? '.v' : '.vhd');
  const guard = replaceGuard('New Source Wizard');
  const fname = h('input', { type: 'text', placeholder: 'file name' });
  const loc = h('input', { type: 'text', value: st.dir });
  const list = h('div', { class: 'src-types' });
  const renderList = () => {
    list.innerHTML = '';
    for (const t of shown()) {
      const row = h('div', { class: `st${t === st ? ' sel' : ''}` }, icon(t.ico), t.label);
      row.addEventListener('click', () => {
        st = t; loc.value = t.dir; renderList();
        // the number of pages depends on the type: Finish right here for the wizards
        const btn = [...(list.closest('.dlg')?.querySelectorAll('.dlg-buttons .btn') || [])].find(b => b.classList.contains('primary'));
        if (btn) btn.textContent = pages().length === 1 ? 'Finish' : 'Next >';
      });
      row.addEventListener('dblclick', () => { st = t; document.querySelector('.dlg .btn.primary')?.click(); });
      list.append(row);
    }
  };
  renderList();
  const p1 = {
    title: 'Select Source Type',
    render: () => h('div', {}, h('div', { class: 'hint' }, 'Select the type of the new source; its name and location come next.'), list),
    validate: () => null,
  };
  // the file name and the location (the wizards that write the file themselves ask on their own pages)
  const pFile = {
    title: 'File Name and Location',
    render: () => h('div', {},
      h('div', { class: 'form-grid' }, ...field('Source type:', h('span', {}, st.label)), ...field('File name:', fname), ...field('Location:', loc)),
      h('label', { style: { display: 'block', marginTop: '12px' } }, h('input', { type: 'checkbox', checked: true, disabled: true }), ' Add to project')),
    onShow: () => setTimeout(() => fname.focus(), 0),
    validate: async () => {
      const n = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|mem|asm\.json|tt\.json|sch\.json|fsm\.json|pn\.json)$/i, '');
      if (!FILE_RE.test(n)) return 'Enter a valid file name (letters, digits, _ and -).';
      if (!/^[A-Za-z0-9_/-]+$/.test(loc.value.trim())) return 'Invalid location.';
      const p = `${loc.value.trim().replace(/\/+$/, '')}/${n}${extOf(st)}`;
      // a drawing: its module (named as the file) and its HDL file must be free (#230)
      if (isView(p)) {
        const mod = n.split('/').pop().replace(/[^A-Za-z0-9_]/g, '_');
        if (moduleElsewhere(mod, p)) return `A module named '${mod}' already exists.`;
        const taken = drawnHdlTaken(p, mod, S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
        if (taken) return taken;
      }
      return guard(p);
    },
  };
  // ports page (modules)
  const ports = [{ name: 'clk', dir: 'in', bus: false, msb: '', lsb: '' }, { name: 'rst', dir: 'in', bus: false, msb: '', lsb: '' }];
  const archName = h('input', { type: 'text', value: 'Behavioral' });
  const entName = h('input', { type: 'text' });
  const portTbl = h('table', { class: 'grid' });
  const renderPorts = () => {
    portTbl.innerHTML = '';
    portTbl.append(h('tr', {}, h('th', {}, 'Port Name'), h('th', {}, 'Direction'), h('th', {}, 'Bus'), h('th', {}, 'MSB'), h('th', {}, 'LSB'), h('th', {}, '')));
    const rows = [...ports, { name: '', dir: 'in', bus: false, msb: '', lsb: '', blank: true }];
    rows.forEach((p, i) => {
      const nm = h('input', { type: 'text', value: p.name });
      const dir = select([['in', 'in'], ['out', 'out'], ['inout', 'inout']], p.dir);
      const bus = h('input', { type: 'checkbox', checked: p.bus });
      const msb = h('input', { type: 'text', value: p.msb, style: { width: '50px' } });
      const lsb = h('input', { type: 'text', value: p.lsb, style: { width: '50px' } });
      const del = h('button', { class: 'tb-btn', html: icons.remove, title: 'Remove' });
      const sync = () => {
        if (p.blank && nm.value.trim()) { delete p.blank; ports.push(p); p.name = nm.value.trim(); renderPorts(); portTbl.querySelectorAll('input[type=text]')[i * 3]?.focus(); return; }
        p.name = nm.value.trim(); p.dir = dir.value; p.bus = bus.checked; p.msb = msb.value; p.lsb = lsb.value;
        if (p.bus && p.msb === '') { p.msb = msb.value = '7'; p.lsb = lsb.value = '0'; }
      };
      [nm, dir, bus, msb, lsb].forEach(e => e.addEventListener('change', sync));
      nm.addEventListener('input', () => { if (p.blank && nm.value.trim()) sync(); });
      del.addEventListener('click', () => { const k = ports.indexOf(p); if (k >= 0) ports.splice(k, 1); renderPorts(); });
      portTbl.append(h('tr', {}, h('td', {}, nm), h('td', {}, dir), h('td', { style: { textAlign: 'center' } }, bus), h('td', {}, msb), h('td', {}, lsb), h('td', {}, p.blank ? '' : del)));
    });
  };
  const archLbl = h('label', {}, 'Architecture name:');
  const syncArch = () => { const v = langSel.value === 'vhdl'; archLbl.style.display = archName.style.display = v ? '' : 'none'; };
  langSel.addEventListener('change', syncArch);
  const p2LangSlot = h('span');   // langSel lives here or on the test bench page (moved on show)
  const p2 = {
    title: 'Define Module',
    render: () => {
      renderPorts();
      return h('div', {},
        h('div', { class: 'form-grid' }, ...field('Language:', p2LangSlot), ...field('Entity / Module name:', entName), archLbl, archName),
        h('div', { style: { marginTop: '10px', maxHeight: '250px', overflow: 'auto', border: '1px solid var(--frame)' } }, portTbl));
    },
    onShow: () => { p2LangSlot.replaceChildren(langSel); if (!entName.value) entName.value = fname.value.trim().replace(/\..*$/, ''); syncArch(); },
    validate: () => {
      if (!NAME_RE.test(entName.value.trim())) return 'Invalid module name.';
      for (const p of ports) {
        if (!NAME_RE.test(p.name)) return `Invalid port name '${p.name}'.`;
        if (p.bus && (isNaN(+p.msb) || isNaN(+p.lsb))) return `Port '${p.name}': MSB/LSB must be numbers.`;
      }
      if (new Set(ports.map(p => p.name.toLowerCase())).size !== ports.length) return 'Duplicate port names.';
      return null;
    },
  };
  // UUT association page (test benches)
  let uutName = S.project.top || S.modules.find(m => m.role === 'design')?.name || '';
  const uutList = h('div', { class: 'src-types' });
  const renderUut = () => {
    uutList.innerHTML = '';
    for (const m of S.modules.filter(m => m.role === 'design')) {
      const row = h('div', { class: `st${m.name === uutName ? ' sel' : ''}` }, icon(m.lang === 'vhdl' ? 'vhdl' : 'verilog'), `${m.name} (${m.file})`);
      row.addEventListener('click', () => { uutName = m.name; renderUut(); });
      uutList.append(row);
    }
    if (!uutList.childElementCount) uutList.append(h('div', { class: 'st' }, 'No design modules in the project.'));
  };
  const tbLangHost = h('div', { class: 'form-grid', style: { marginBottom: '8px' } });
  const p2tb = {
    title: 'Associate Source',
    render: () => { renderUut(); return h('div', {}, tbLangHost, h('div', { class: 'hint' }, 'Select the source (Unit Under Test) to associate with the new test bench.'), uutList); },
    onShow: () => { tbLangHost.replaceChildren(...field('Language:', langSel)); },
    validate: () => (S.modules.some(m => m.name === uutName) ? null : 'Select a module.'),
  };
  const summary = h('pre', { class: 'code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const n = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|mem|asm\.json|tt\.json|sch\.json)$/i, '');
      const lg = langSel.value === 'verilog' ? 'Verilog' : 'VHDL';
      summary.textContent = `Project Navigator will create a new skeleton source with the following specifications.\n\nAdd to Project: Yes\nSource Directory: ${loc.value}\nSource Type: ${st.label}${st.ext ? '' : ` (${lg})`}\nSource Name: ${n}${extOf(st)}\n` +
        (st.id === 'hdl' ? `\nEntity name: ${entName.value}\n${langSel.value === 'vhdl' ? `Architecture name: ${archName.value}\n` : ''}\nPort Definitions:\n${ports.map(p => `    ${p.name.padEnd(12)} ${p.bus ? `Bus[${p.msb}:${p.lsb}]` : 'Pin'.padEnd(8)}  ${p.dir}`).join('\n')}` : '') +
        (st.id === 'tb' ? `\nAssociated Source: ${uutName}` : '');
    },
  };
  const pages = () => {
    if (st.id === 'hdl') return [p1, pFile, p2, pSum];
    if (st.id === 'tb') return [p1, pFile, p2tb, pSum];
    if (WIZARD_TYPES.has(st.id)) return [p1];   // Finish opens the Test Bench / Module / Schematic / Petri Net Wizard (name and location there)
    return [p1, pFile, pSum];
  };
  // The wizard driver takes a fixed page list; rebuild when the type changes on page 1.
  const dyn = [p1, pFile, { title: 'Options', render: () => h('div') }, pSum];
  const proxy = new Proxy(dyn, { get: (t, k) => (k === 'length' ? pages().length : (typeof k === 'string' && /^\d+$/.test(k) ? pages()[+k] : t[k])) });
  pSum.validate = () => {   // the language (extension) may have changed after page 1
    const nn = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|mem|asm\.json|tt\.json|sch\.json)$/i, '');
    return guard(`${loc.value.trim().replace(/\/+$/, '')}/${nn}${extOf(st)}`);
  };
  const ok = await wizard('New Source Wizard', proxy, { width: 760 });
  if (!ok) return;
  const n = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|mem|asm\.json|tt\.json|sch\.json)$/i, '');
  if (st.id === 'tbwiz') {
    const { testBenchWizard } = await import('./tbwizard.js');
    return testBenchWizard({ module: S.sel?.module, name: n || null, location: loc.value.trim().replace(/\/+$/, ''), lang: langSel.value });
  }
  if (st.id === 'modwiz' || st.id === 'schwiz') {
    const mw = await import('./modwizard.js');
    // a file name that is not an identifier (e.g. with -) becomes the suggested module name
    const ident = n.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/_$/, '');
    return (st.id === 'modwiz' ? mw.moduleWizard : mw.schematicWizard)({ name: ident, location: loc.value.trim().replace(/\/+$/, ''), lang: langSel.value });
  }
  if (st.id === 'pnwiz') {
    const { petriWizard } = await import('./petri-wizard.js');
    return petriWizard({ location: loc.value.trim().replace(/\/+$/, ''), lang: langSel.value });
  }
  const path = `${loc.value.trim().replace(/\/+$/, '')}/${n}${extOf(st)}`;
  let text;
  const pj = S.project;
  switch (st.id) {
    case 'hdl': text = langSel.value === 'vhdl' ? T.vhdlModule(entName.value.trim(), archName.value.trim(), ports, pj) : T.vlogModule(entName.value.trim(), ports, pj); break;
    case 'vhdl-pkg': text = T.vhdlPackage(n, pj); break;
    case 'tb': {
      const m = S.modules.find(x => x.name === uutName);
      const uut = uutInfo(m);
      text = langSel.value === 'vhdl' ? T.vhdlTestbench(n, uut, pj) : T.vlogTestbench(n, uut, pj);
      break;
    }
    case 'ucf': text = T.ucfTemplate(pj); break;
    case 'mem': text = '// memory initialization file ($readmemh format)\n00\n01\n02\n03\n'; break;
    case 'sch': {
      const { newDoc } = await import('/core/schdoc.js');
      text = JSON.stringify(newDoc(n.replace(/[^A-Za-z0-9_]/g, '_'), pj.preferredLanguage || 'vhdl'), null, 1);
      break;
    }
    case 'asm': {
      const { newModel } = await import('/core/asm.js');
      const m = newModel(n.replace(/[^A-Za-z0-9_]/g, '_'), pj.preferredLanguage || 'vhdl');
      text = JSON.stringify(m, null, 2);
      break;
    }
    case 'fsm': {
      const { newFsm } = await import('/core/fsm.js');
      text = JSON.stringify(newFsm(n.replace(/[^A-Za-z0-9_]/g, '_'), pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl'), null, 2);
      break;
    }
    case 'petri': {
      const { newPetri } = await import('/core/petri.js');
      text = JSON.stringify(newPetri(n.replace(/[^A-Za-z0-9_]/g, '_'), pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl'), null, 2);
      break;
    }
    case 'tt': {
      const { newTable } = await import('/core/logic.js');
      text = JSON.stringify({ ...newTable(n.replace(/[^A-Za-z0-9_]/g, '_'), ['a', 'b', 'c'], ['f']), lang: pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl' }, null, 2);
      break;
    }
  }
  const noUcf = !S.fileTree.includes(pj.constraints);
  await closeBeforeReplace(path);
  await api.writeFile(pj.name, path, text);   // registers the new file in silinx.json
  // reload first: saving the project settings from the old copy would drop that registration
  await app.reloadProject();
  if (st.id === 'ucf' && noUcf) { S.project.constraints = path; await app.saveProjectJson(); await app.reloadProject(); }
  if (st.id === 'tb') app.showInSim(n);   // selected in the Simulation view, ready to simulate
  app.log(`Created ${st.label}${st.ext ? '' : ` (${langSel.value === 'verilog' ? 'Verilog' : 'VHDL'})`} '${path}'.`, 'ok');
  if (st.id === 'fsm') { app.openFsm(path); return; }
  if (st.id === 'petri') { app.openPetri(path); return; }
  if (st.id === 'asm') app.openAsm(path); else if (st.id === 'tt') app.openTt(path); else if (st.id === 'sch') app.openSch(path); else app.openFile(path);
}

function uutInfo(m) {
  const mod = m.mod;
  const ports = mod.ports.map(p => {
    let width = 1, msb = 0, lsb = 0;
    const r = p.type.range;
    if (r && r.left?.op === 'int' && r.right?.op === 'int') { msb = +r.left.value; lsb = +r.right.value; width = Math.abs(msb - lsb) + 1; }
    else if (r) { width = 8; msb = 7; lsb = 0; }
    const vt = mod.lang === 'vhdl' ? (typeText(p.type, 'vhdl')) : (width > 1 ? `std_logic_vector(${msb} downto ${lsb})` : 'std_logic');
    return { name: p.name, dir: p.dir, width, msb, lsb, vhdlType: vt.replace(/^std_logic_vector\((.*)\)$/i, 'std_logic_vector($1)') };
  });
  const params = mod.params.filter(p => !p.local).map(p => ({ name: p.name, default: p.default?.op === 'int' ? p.default.value : (p.default?.value ?? '0') }));
  return { name: m.name, lang: m.lang, ports, params };
}

export async function addSourceDialog() {
  const inp = h('input', { type: 'file', multiple: true, accept: '.v,.vhd,.vhdl,.ucf,.mem,.hex,.asm.json,.json' });
  const role = select([['design', 'All (Implementation + Simulation)'], ['impl', 'Implementation only'], ['sim', 'Simulation only']], 'design');
  const r = await dialog({
    title: 'Add Copy of Source', width: 480,
    body: h('div', { class: 'form-grid' }, ...field('Files:', inp), ...field('Association:', role)),
    buttons: [{ label: 'OK', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  const written = [];
  for (const f of inp.files) {
    const ext = f.name.split('.').pop().toLowerCase();
    const dir = ext === 'ucf' ? 'constraints' : role.value === 'sim' ? 'sim' : 'src';
    const path = `${dir}/${f.name}`;
    if ((S.diskTree || S.fileTree).includes(path) && !await confirmDlg('Add Copy of Source', `${path} already exists in the project. Replace it with the copy of ${f.name}?`)) continue;
    await api.writeFile(S.project.name, path, await f.text());
    written.push(path);
    if (ext === 'ucf' && !S.fileTree.includes(S.project.constraints)) { S.project.constraints = path; await app.saveProjectJson(); }
  }
  if (!written.length) return;
  // the association (role) of exactly the files written
  const pj = await api.project(S.project.name);
  for (const path of written) {
    const e = pj.files.find(x => x.path === path);
    if (e) e.role = role.value;
  }
  delete pj.fileTree;
  await api.saveProject(pj.name, pj);
  await app.reloadProject();
  app.log(`Added ${written.length} source file(s).`, 'ok');
}

export async function sourceProperties(path) {
  const f = S.project.files.find(x => x.path === path);
  if (!f) return;
  const role = select([['design', 'All'], ['impl', 'Implementation'], ['sim', 'Simulation']], f.role || 'design');
  const r = await dialog({
    title: `Source Properties - ${path}`, width: 440,
    body: h('div', { class: 'form-grid' }, ...field('File:', h('span', {}, path)), ...field('Language:', h('span', {}, f.lang)), ...field('View Association:', role)),
  });
  if (!r) return;
  f.role = role.value;
  await app.saveProjectJson();
  await app.reloadProject();
}

export async function projectProperties() {
  const db = S.devices || (S.devices = await api.devices().catch(() => null));
  if (!db) return alertDlg("Design Properties", "The device database could not be loaded (is the Silinx server running?).", "error");
  const pj = S.project;
  const boardSel = select([['', 'None Specified'], ...db.boards.map(b => [b.id, b.name])], pj.board || '');
  const dp = devicePicker(db, pj.device);
  dp.disable(!!pj.board);
  boardSel.addEventListener('change', () => {
    const b = db.boards.find(x => x.id === boardSel.value);
    if (b) dp.set(b.device);
    dp.disable(!!b);
  });
  const lang = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], pj.preferredLanguage || 'vhdl');
  // a project from before the setting follows Toolchain Settings
  const synth = select(SYNTH_TOOLS, pj.synthTool || (S.toolchain?.config?.mode === 'silinx' ? 'silinx' : 'xst'));
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
  });
  if (!r) return;
  const oldBoard = pj.board, oldDev = `${pj.device.part}-${pj.device.package}`;
  pj.board = boardSel.value || null;
  pj.device = dp.value();
  pj.preferredLanguage = lang.value;
  pj.synthTool = synth.value;
  await app.saveProjectJson();
  await app.reloadProject();
  app.log(`Device set to ${pj.device.part}${pj.device.speed}-${pj.device.package}${pj.board ? ` (board ${pj.board})` : ''}.`, 'info');
  const changed = pj.board !== oldBoard || `${pj.device.part}-${pj.device.package}` !== oldDev;
  const board = app.projectBoard();
  if (changed && board && pj.top && await confirmDlg('Update Constraints',
    `The target changed to the ${board.name}.\nPin locations (LOC) in the constraints file are board specific.\n\nRegenerate ${pj.constraints || 'the UCF'} from the ${board.name} pin table? (ports are matched by name: clk, led, sw, btn, seg, an…)`)) {
    await app.regenerateUcf(board);
  } else if (changed && !board && S.fileTree.includes(pj.constraints)) {
    app.log(`WARNING: check the pin locations in ${pj.constraints} — they must exist on the ${pj.device.package.toUpperCase()} package.`, 'warn');
  }
}

export async function implProperties() {
  const pj = S.project;
  pj.impl ||= {};
  const opt = select(['Speed', 'Area'], pj.impl.optMode || 'Speed');
  const lvl = select([['1', 'Normal'], ['2', 'High']], String(pj.impl.optLevel || 1));
  const clk = select([['JtagClk', 'JTAG Clock'], ['CCLK', 'CCLK'], ['UserClk', 'User Clock']], pj.impl.startupClk || 'JtagClk');
  const r = await dialog({
    title: 'Process Properties - Synthesis / Implementation / Bitstream', width: 520,
    body: h('div', { class: 'form-grid' },
      ...field('Optimization Goal:', opt), ...field('Optimization Effort:', lvl),
      ...field('FPGA Start-Up Clock:', clk),
      // the Silinx toolchain's synthesis: what its effort does (#282)
      app.openMode() ? h('div', { class: 'effort-hint', style: { gridColumn: '1 / 3', color: 'var(--grey-3)' } },
        'Silinx toolchain: Optimization Effort Normal synthesizes once, fast; High also tries the mappings for speed (a slower synthesis, a circuit about 5-10 % faster).') : null,
      h('div', { style: { gridColumn: '1 / 3', color: 'var(--grey-3)' } }, 'Use JTAG Clock when programming over JTAG (iMPACT, xc3sprog, djtgcfg); CCLK when booting from the PROM/flash.')),
  });
  if (!r) return;
  pj.impl = { ...pj.impl, optMode: opt.value, optLevel: +lvl.value, startupClk: clk.value };
  await app.saveProjectJson();
}

// ------------------------------------------------------------------ toolchain
export async function toolchainDialog() {
  let tc;
  const pjName = S.project?.name || null;
  try { tc = await api.toolchain(pjName); } catch (e) { return alertDlg('Toolchain', e.message, 'error'); }
  const cfg = JSON.parse(JSON.stringify(tc.config));
  const ISE_OPTS = [['local', 'Local (Xilinx ISE installed locally)'], ['docker', 'Docker image with Xilinx ISE'], ['ssh', 'Remote host with Xilinx ISE via SSH']];
  const mode = select([...ISE_OPTS, ['silinx', 'Silinx toolchain (experimental, no ISE)']], cfg.mode);
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
      h('div', { style: { color: 'var(--grey-3)', marginTop: '4px' } }, 'Supported now: the Spartan-3E XC3S100E, XC3S250E (Basys2), XC3S500E and XC3S1200E (Nexys2). Experimental: check the design on the board.')));
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
  const r = await dialog({
    title: 'Toolchain Settings', width: 640,
    body: h('div', {},
      h('div', { class: `msg ${st.available ? '' : 'msg-warn'}`, style: { marginBottom: '10px' } }, h('div', { class: 'msg-icon' }, st.available ? '✓' : '!'),
        h('div', { class: 'msg-text' }, h('b', {}, st.mode === 'silinx' ? 'Silinx toolchain (experimental, no ISE): selected' : `Xilinx ISE 14.7: ${st.available ? 'available' : 'not available'}`), `\n${st.reason}\n\n`, h('span', { style: { color: 'var(--grey-3)' } }, st.help),
          st.available ? null : h('div', { style: { marginTop: '8px' } }, h('b', {}, 'Easiest setup on any OS: '), 'build the private Docker image with the Silinx kit (docker/ise/README.md): ',
            h('code', {}, 'docker/ise/build-ise-image.sh --installer <Xilinx_ISE_DS_Lin_14.7_1015_1.tar> --license <Xilinx.lic>'), ' (Windows: build-ise-image.ps1). It configures Silinx automatically.'))),
      h('div', { class: 'form-grid' }, h('label', {}, 'Execution mode:'), mode),
      h('div', { style: { margin: '6px 0 10px' } }, modeBox),
      openBox,
      h('div', { style: { fontWeight: 'bold', margin: '8px 0 4px' } }, 'Device programmers'),
      h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Tool'), h('th', {}, ''), h('th', {}, 'Location')), ...progRows),
      h('div', { class: 'form-grid', style: { marginTop: '8px' } }, h('label', {}, labels['programmer.tool']), inputs['programmer.tool'], h('label', {}, labels['programmer.cable']), inputs['programmer.cable']),
      h('div', { style: { color: 'var(--grey-5)', marginTop: '8px' } }, `Settings file: ${tc.configPath}`)),
    buttons: [{ label: 'Save', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
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
        h('p', {}, 'Digital design platform for Xilinx FPGAs (Spartan-3/3A/3E/6, Virtex-4/5/6, 7-series with ISE 14.7), made for teaching: mixed VHDL/Verilog projects; schematics with live simulation; FSM and ASM state machine editors; truth tables and Karnaugh maps; module and test bench wizards; behavioural and netlist simulation with waveforms; a board emulator; synthesis, place & route and bitstreams with the Silinx toolchain (the Basys2 and Nexys2 boards) or with ISE 14.7; programming of the FPGA and its Platform Flash, also from the browser over USB.'),
        h('p', { style: { fontStyle: 'italic' } }, 'Silinx ISE was developed for educational purposes, specifically to support the teaching of Digital Systems, because AMD/Xilinx discontinued support for Xilinx ISE a long time ago.'),
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
              : ['None: this copy sends nothing.', ' Only the site (pmnmalo.github.io/Silinx-ISE) counts its visits, with ', gcLink(), ' (no cookies, no personal data).'])))),
        h('p', {}, `Copyright 2026 Pedro Maló. Free software under the GNU Affero General Public License v3.0 (`, link(`https://github.com/${REPOSITORY}/blob/main/LICENSE`, 'LICENSE'), ', with an additional permission for elkjs: ', link(`https://github.com/${REPOSITORY}/blob/main/NOTICE`, 'NOTICE'), ').'),
        h('p', { class: 'hint' }, 'This program comes with ABSOLUTELY NO WARRANTY. Source code: ', link(`https://github.com/${REPOSITORY}`, `github.com/${REPOSITORY}`), '.'),
        h('p', { class: 'hint' }, 'Using Silinx in a course? ', link(WHO_URL, 'Tell us who you are'), '.'),
        componentsNode(),
        h('p', { style: { color: 'var(--grey-4)' } }, 'Synthesis, place & route and bitstream generation use the Silinx toolchain (Yosys, and the place & route and bitstream writer of Silinx) for the Spartan-3E boards, or the Xilinx ISE 14.7 command-line tools. Xilinx, ISE, ISim, iMPACT and Spartan are trademarks of AMD/Xilinx; Silinx ISE is an independent project, not affiliated with or endorsed by AMD/Xilinx.'))),
    buttons: [{ label: 'OK', primary: true, value: true }],
  });
}

// the usage counter of the published site (About: Usage counts)
export const GOATCOUNTER_URL = 'https://www.goatcounter.com';
const gcLink = () => { const a = link(GOATCOUNTER_URL, 'GoatCounter'); a.dataset.noI18n = ''; return a; };   // a name: never translated

// ------------------------------------------------------------------ Tell us who you are
// the users who want to say so (school, course, role): a GitHub Discussions thread, nothing collected
export const WHO_URL = `https://github.com/${REPOSITORY}/discussions/151`;   // "Who is using Silinx ISE?"
export function whoAreYou() {
  return dialog({
    title: 'Tell Us Who You Are', width: 480,
    body: h('div', {},
      h('p', {}, 'Silinx ISE is free and asks for nothing. If you use it, in a course, a school or on your own, we would like to know: it helps to decide what to improve.'),
      h('p', {}, 'Say hello on GitHub Discussions (a GitHub account is needed): your school or course, your role (teacher, student…), the boards you use. Only what you write there is seen.'),
      h('p', {}, link(WHO_URL, 'Who is using Silinx ISE? (GitHub Discussions)'))),
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
  const m = /## What's new in (\S+)\s*\n([\s\S]*?)(?=\n## |\n\*\*Silinx ISE|$)/.exec(rel?.body || '');
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
// null: not on such a site (the application, a downloaded Silinx-ISE.html): GitHub's releases.
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
const UPDATE_CACHE = 'silinx.updateCheck';
const cachedRelease = () => {
  try {
    const c = JSON.parse(localStorage.getItem(UPDATE_CACHE) || 'null');
    if (c && Date.now() - c.at < (c.rel ? 3600e3 : 600e3) && c.at <= Date.now()) return c;
  } catch { /* no storage */ }
  return null;
};
const cacheRelease = rel => { try { localStorage.setItem(UPDATE_CACHE, JSON.stringify({ at: Date.now(), rel })); } catch { /* no storage */ } };

/**
 * At start-up: check the latest release on GitHub (at most once an hour); a newer version opens the
 * update dialog, otherwise one line in the console (no network / GitHub error: nothing shown).
 */
export async function checkUpdatesOnStart() {
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
  const done = dialog({ title: 'Check for Updates', width: 520, body, buttons: [{ label: 'OK', primary: true, value: true }], onOpen: x => { ui = x; } })
    .then(v => { if (v === 'reload') location.reload(); return v; });
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
  const assets = (rel.assets || []).map((a) => h('li', {}, link(a.browser_download_url, a.name), ` (${Math.max(1, Math.round(a.size / 1024))} KB)`));
  if (cmp > 0) {
    const news = await whatsNew(latest, rel);
    body.replaceChildren(...[
      h('p', {}, h('b', {}, `A new version is available: ${PRODUCT} ${latest}`), when ? ` (released ${when})` : ''),
      h('p', {}, `You are running ${VERSION}.`),
      news?.length ? h('div', {}, h('b', {}, "What's new:"), changesNode(news)) : null,
      h('p', {}, 'Release notes and downloads: ', link(rel.html_url, rel.name || `v${latest}`)),
      assets.length ? h('ul', { style: { margin: '4px 0 8px 18px', padding: 0 } }, ...assets) : null,
      h('p', { class: 'hint' }, 'To update: download silinx-ise-<version>.zip and replace your Silinx folder (your projects in the workspace are kept), or download the new Silinx-ISE.html for the standalone edition.')].filter(Boolean));
  } else {
    body.replaceChildren(...[
      h('p', {}, h('b', {}, `${PRODUCT} ${VERSION} is up to date.`)),
      h('p', {}, `Latest release on GitHub: ${latest}${when ? ` (${when})` : ''} — `, link(rel.html_url, 'release notes')),
      cmp < 0 ? h('p', { class: 'hint' }, 'You are running a development version newer than the latest release.') : null].filter(Boolean));
  }
  return done;
}

export function shortcutsDialog() {
  const rows = [['Ctrl/Cmd+K', 'Command palette: search commands and files'], ['Ctrl+Space', 'Auto-complete'], ['Ctrl/Cmd+/', 'Toggle comment'], ['Ctrl+F / Ctrl+H', 'Find / Replace'], ['Ctrl+G', 'Go to line'], ['F12 or Ctrl/Cmd+Click', 'Go to definition'], ['F2', 'Rename symbol'], ['Ctrl/Cmd+.', 'Quick fix of an error'], ['Ctrl+Q', 'Fold block'], ['Double-click process', 'Run process'], ['Double-click instance (schematic)', 'Push into instance']];
  return dialog({
    title: 'Keyboard Shortcuts', width: 440,
    body: h('table', { class: 'grid' }, ...rows.map(([k, v]) => h('tr', {}, h('td', { style: { fontFamily: 'var(--mono)' } }, k), h('td', {}, v)))),
    buttons: [{ label: 'OK', primary: true, value: true }],
  });
}

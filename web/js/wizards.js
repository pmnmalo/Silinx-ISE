// Wizards and dialogs modelled on ISE (New Project Wizard, New Source Wizard, properties...).
import { api } from './api.js';
import { PRODUCT, PRODUCT_FULL, VERSION, REPOSITORY, compareVersions } from '/core/version.js';
import { icons, icon } from './icons.js';
import { h, dialog, alertDlg, confirmDlg, toast } from './ui.js';
import * as T from './templates.js';
import { typeText } from './editor.js';
import { S, app } from './app.js';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
// Device used when no evaluation board is selected.
const DEFAULT_DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };
const FILE_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

function field(label, input) { return [h('label', {}, label), input]; }
function select(options, value) {
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
function wizard(title, pages, { width = 720, finishLabel = 'Finish' } = {}) {
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
// project is moved to <workspace>/.trash (recoverable); in the standalone edition it is deleted.
async function askReplaceProject(pname) {
  const list = await api.projects();
  if (!list.some(p => p.name === pname)) return true;
  return confirmDlg('Replace Project',
    `A project named '${pname}' already exists.\n\nReplace it? ${api.standalone ? 'The existing project will be deleted from this browser.' : 'The existing project is moved to the workspace .trash folder.'}`);
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
      if (api.standalone && api.exportBundle) backup = { bundle: api.exportBundle(pname) };
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
    } else if (exists && !api.standalone) app.log(`The previous project '${pname}' is in the workspace .trash folder.`, 'info');
    throw e;
  }
}

async function removeExistingProject(pname) {
  const list = await api.projects();
  if (!list.some(p => p.name === pname)) return;
  if (S.project?.name === pname) await app.closeProject();
  await api.deleteProject(pname);
  app.log(`Project '${pname}' replaced${api.standalone ? '' : ' (the old one is in the workspace .trash folder)'}.`, 'info');
}

export async function newProjectWizard({ template = 'empty' } = {}) {
  const db = S.devices || await api.devices();
  const templates = await api.templates().catch(() => []);
  const st = {
    name: template === 'blinky' ? 'blinky' : '', template, board: '',
    device: { ...DEFAULT_DEVICE }, lang: 'vhdl',
  };
  const name = h('input', { type: 'text', value: st.name, placeholder: 'project name' });
  const tplSel = select([['empty', 'Empty project'], ...templates.map(t => [t, `Example: ${t}`])], template);
  const p1 = {
    title: 'Create New Project',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'Enter a name and location for the project.'),
      h('div', { class: 'form-grid' },
        ...field('Name:', name),
        ...field('Location:', h('input', { type: 'text', value: '<workspace>/' + (st.name || '…'), disabled: true })),
        ...field('Top-level source type:', select([['hdl', 'HDL']], 'hdl')),
        ...field('Start from:', tplSel)),
      h('div', { class: 'hint', style: { marginTop: '14px' } }, 'Projects are stored in the Silinx workspace folder (default ~/Silinx-projects).')),
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
  const langSel = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], 'vhdl');
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
        ...field('Top-Level Source Type:', select(['HDL'], 'HDL')),
        ...field('Synthesis Tool:', select(['XST (VHDL/Verilog)'], 'XST (VHDL/Verilog)')),
        ...field('Simulator:', select(['Silinx ISim-compatible (VHDL/Verilog)'], '')),
        ...field('Preferred Language:', langSel),
        ...field('VHDL Source Analysis Standard:', select(['VHDL-93', 'VHDL-2008'], 'VHDL-93')),
      )),
  };
  const summary = h('div');
  const p3 = {
    title: 'Project Summary',
    render: () => summary,
    onShow: () => {
      summary.innerHTML = '';
      const b = db.boards.find(x => x.id === boardSel.value);
      summary.append(h('pre', { style: { background: '#fff', border: '1px solid #ccc', padding: '10px', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' } },
        `Project Navigator will create a new project with the following specifications.\n\n` +
        `Project:\n  Project Name: ${name.value.trim()}\n  Template:     ${tplSel.value}\n\n` +
        `Device:\n  Board:        ${b ? b.name : 'None Specified'}\n  Family:       ${dp.familyName()}\n  Device:       ${dp.value().part.toUpperCase()}\n  Package:      ${dp.value().package.toUpperCase()}\n  Speed:        ${dp.value().speed}\n\n` +
        `Flow:\n  Synthesis Tool:     XST (VHDL/Verilog)\n  Simulator:          Silinx behavioural simulator\n  Preferred Language: ${langSel.value.toUpperCase()}`));
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
    pj.preferredLanguage = langSel.value;
    await api.saveProject(pj.name, pj);
    await app.openProject(pj.name);
    app.showLeftPage('design');
    toast(`Project ${pj.name} created`, 'ok');
  } catch (e) { alertDlg('New Project', e.message, 'error'); }
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
    body: h('div', {}, list.length ? h('div', { style: { maxHeight: '320px', overflow: 'auto', border: '1px solid #ccc' } }, tbl) : h('div', {}, 'No projects found in the workspace.')),
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

// ------------------------------------------------------------------ New Source
const SOURCE_TYPES = [
  { id: 'vhdl', label: 'VHDL Module', ico: 'vhdl', ext: '.vhd', dir: 'src' },
  { id: 'verilog', label: 'Verilog Module', ico: 'verilog', ext: '.v', dir: 'src' },
  { id: 'vhdl-tb', label: 'VHDL Test Bench', ico: 'vhdl', ext: '.vhd', dir: 'sim' },
  { id: 'verilog-tb', label: 'Verilog Test Fixture', ico: 'verilog', ext: '.v', dir: 'sim' },
  { id: 'vhdl-pkg', label: 'VHDL Package', ico: 'vhdl', ext: '.vhd', dir: 'src' },
  { id: 'sch', label: 'Schematic', ico: 'schematic', ext: '.sch.json', dir: 'src' },
  { id: 'asm', label: 'ASM State Diagram (State Machine)', ico: 'asm', ext: '.asm.json', dir: 'src' },
  { id: 'ucf', label: 'Implementation Constraints File', ico: 'ucf', ext: '.ucf', dir: 'constraints' },
  { id: 'mem', label: 'Memory Initialization File (.mem)', ico: 'file', ext: '.mem', dir: 'src' },
];

export async function newSourceWizard({ type } = {}) {
  if (!S.project) return;
  let st = SOURCE_TYPES.find(t => t.id === type) || SOURCE_TYPES.find(t => t.id === (S.project.preferredLanguage || 'vhdl'));
  const fname = h('input', { type: 'text', placeholder: 'file name' });
  const loc = h('input', { type: 'text', value: st.dir });
  const list = h('div', { class: 'src-types' });
  const renderList = () => {
    list.innerHTML = '';
    for (const t of SOURCE_TYPES) {
      const row = h('div', { class: `st${t === st ? ' sel' : ''}` }, icon(t.ico), t.label);
      row.addEventListener('click', () => { st = t; loc.value = t.dir; renderList(); });
      row.addEventListener('dblclick', () => { st = t; document.querySelector('.dlg .btn.primary')?.click(); });
      list.append(row);
    }
  };
  renderList();
  const p1 = {
    title: 'Select Source Type',
    render: () => h('div', { style: { display: 'flex', gap: '12px' } },
      h('div', { style: { width: '270px' } }, list),
      h('div', { style: { flex: 1 } }, h('label', {}, 'File name:'), fname, h('label', {}, 'Location:'), loc,
        h('label', { style: { marginTop: '12px' } }, h('input', { type: 'checkbox', checked: true, disabled: true }), ' Add to project'))),
    validate: () => {
      const n = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|mem|asm\.json)$/i, '');
      if (!FILE_RE.test(n)) return 'Enter a valid file name (letters, digits, _ and -).';
      if (!/^[A-Za-z0-9_/-]+$/.test(loc.value.trim())) return 'Invalid location.';
      const path = `${loc.value.trim().replace(/\/+$/, '')}/${n}${st.ext}`;
      if (S.fileTree.includes(path)) return `${path} already exists.`;
      return null;
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
  const p2 = {
    title: 'Define Module',
    render: () => {
      renderPorts();
      return h('div', {},
        h('div', { class: 'form-grid' }, ...field('Entity / Module name:', entName), ...(st.id === 'vhdl' ? field('Architecture name:', archName) : [])),
        h('div', { style: { marginTop: '10px', maxHeight: '250px', overflow: 'auto', border: '1px solid #ccc' } }, portTbl));
    },
    onShow: () => { if (!entName.value) entName.value = fname.value.trim().replace(/\..*$/, ''); },
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
  const p2tb = {
    title: 'Associate Source',
    render: () => { renderUut(); return h('div', {}, h('div', { class: 'hint' }, 'Select the source (Unit Under Test) to associate with the new test bench.'), uutList); },
    validate: () => (S.modules.some(m => m.name === uutName) ? null : 'Select a module.'),
  };
  const summary = h('pre', { style: { background: '#fff', border: '1px solid #ccc', padding: '10px', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' } });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const n = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|mem|asm\.json)$/i, '');
      summary.textContent = `Project Navigator will create a new skeleton source with the following specifications.\n\nAdd to Project: Yes\nSource Directory: ${loc.value}\nSource Type: ${st.label}\nSource Name: ${n}${st.ext}\n` +
        (st.id === 'vhdl' || st.id === 'verilog' ? `\nEntity name: ${entName.value}\n${st.id === 'vhdl' ? `Architecture name: ${archName.value}\n` : ''}\nPort Definitions:\n${ports.map(p => `    ${p.name.padEnd(12)} ${p.bus ? `Bus[${p.msb}:${p.lsb}]` : 'Pin'.padEnd(8)}  ${p.dir}`).join('\n')}` : '') +
        (st.id.endsWith('-tb') ? `\nAssociated Source: ${uutName}` : '');
    },
  };
  const pages = () => {
    if (st.id === 'vhdl' || st.id === 'verilog') return [p1, p2, pSum];
    if (st.id.endsWith('-tb')) return [p1, p2tb, pSum];
    return [p1, pSum];
  };
  // The wizard driver takes a fixed page list; rebuild when the type changes on page 1.
  const dyn = [p1, { title: 'Options', render: () => h('div') }, pSum];
  const proxy = new Proxy(dyn, { get: (t, k) => (k === 'length' ? pages().length : (typeof k === 'string' && /^\d+$/.test(k) ? pages()[+k] : t[k])) });
  const ok = await wizard('New Source Wizard', proxy, { width: 760 });
  if (!ok) return;
  const n = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|mem|asm\.json)$/i, '');
  const path = `${loc.value.trim().replace(/\/+$/, '')}/${n}${st.ext}`;
  let text;
  const pj = S.project;
  switch (st.id) {
    case 'vhdl': text = T.vhdlModule(entName.value.trim(), archName.value.trim(), ports, pj); break;
    case 'verilog': text = T.vlogModule(entName.value.trim(), ports, pj); break;
    case 'vhdl-pkg': text = T.vhdlPackage(n, pj); break;
    case 'vhdl-tb': case 'verilog-tb': {
      const m = S.modules.find(x => x.name === uutName);
      const uut = uutInfo(m);
      text = st.id === 'vhdl-tb' ? T.vhdlTestbench(n, uut, pj) : T.vlogTestbench(n, uut, pj);
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
  }
  await api.writeFile(pj.name, path, text);
  if (st.id === 'ucf' && !S.fileTree.includes(pj.constraints)) { pj.constraints = path; await app.saveProjectJson(); }
  if (st.id.endsWith('-tb')) { pj.simTop = n; await app.saveProjectJson(); }
  await app.reloadProject();
  app.log(`Created ${st.label} '${path}'.`, 'ok');
  if (st.id === 'asm') app.openAsm(path); else if (st.id === 'sch') app.openSch(path); else app.openFile(path);
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
  const role = select([['design', 'All (Implementation + Simulation)'], ['sim', 'Simulation only']], 'design');
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
    if (S.fileTree.includes(path) && !await confirmDlg('Add Copy of Source', `${path} already exists in the project. Replace it with the copy of ${f.name}?`)) continue;
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
  const role = select([['design', 'All'], ['sim', 'Simulation']], f.role);
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
  const r = await dialog({
    title: 'Design Properties', width: 520,
    body: h('div', { class: 'form-grid' },
      ...field('Name:', h('span', {}, pj.name)),
      ...field('Evaluation Development Board:', boardSel),
      ...field('Family:', dp.famSel),
      ...field('Device:', dp.partSel), ...field('Package:', dp.pkgSel), ...field('Speed:', dp.spdSel),
      ...field('Top Module (implementation):', h('span', {}, pj.top || '(none)')),
      ...field('Top Module (simulation):', h('span', {}, pj.simTop || '(none)')),
      ...field('Preferred Language:', lang)),
  });
  if (!r) return;
  const oldBoard = pj.board, oldDev = `${pj.device.part}-${pj.device.package}`;
  pj.board = boardSel.value || null;
  pj.device = dp.value();
  pj.preferredLanguage = lang.value;
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
      h('div', { style: { gridColumn: '1 / 3', color: '#555' } }, 'Use JTAG Clock when programming over JTAG (iMPACT, xc3sprog, djtgcfg); CCLK when booting from the PROM/flash.')),
  });
  if (!r) return;
  pj.impl = { ...pj.impl, optMode: opt.value, optLevel: +lvl.value, startupClk: clk.value };
  await app.saveProjectJson();
}

// ------------------------------------------------------------------ toolchain
export async function toolchainDialog() {
  let tc;
  try { tc = await api.toolchain(); } catch (e) { return alertDlg('Toolchain', e.message, 'error'); }
  const cfg = JSON.parse(JSON.stringify(tc.config));
  const mode = select([['local', 'Local (ISE installed on this machine)'], ['docker', 'Docker image with ISE 14.7'], ['ssh', 'Remote Linux host via SSH']], cfg.mode);
  const inputs = {
    'local.settings': h('input', { type: 'text', value: cfg.local.settings || '', placeholder: 'auto-detect (…/14.7/ISE_DS/settings64.sh)' }),
    'docker.image': h('input', { type: 'text', value: cfg.docker.image || '', placeholder: 'e.g. my-ise:14.7' }),
    'docker.settings': h('input', { type: 'text', value: cfg.docker.settings || '' }),
    'ssh.host': h('input', { type: 'text', value: cfg.ssh.host || '' }),
    'ssh.user': h('input', { type: 'text', value: cfg.ssh.user || '' }),
    'ssh.port': h('input', { type: 'text', value: String(cfg.ssh.port || 22) }),
    'ssh.remoteDir': h('input', { type: 'text', value: cfg.ssh.remoteDir || '' }),
    'ssh.settings': h('input', { type: 'text', value: cfg.ssh.settings || '' }),
    'programmer.tool': select([['', 'Board default'], 'impact', 'djtgcfg', 'adepttool', 'xc3sprog', 'openFPGALoader'], cfg.programmer.tool || ''),
    'programmer.cable': h('input', { type: 'text', value: cfg.programmer.cable || '', placeholder: 'board default' }),
  };
  const groups = {
    local: ['local.settings'], docker: ['docker.image', 'docker.settings'], ssh: ['ssh.host', 'ssh.user', 'ssh.port', 'ssh.remoteDir', 'ssh.settings'],
  };
  const labels = {
    'local.settings': 'ISE settings64.sh:', 'docker.image': 'Docker image:', 'docker.settings': 'settings64.sh in image:',
    'ssh.host': 'Host:', 'ssh.user': 'User:', 'ssh.port': 'Port:', 'ssh.remoteDir': 'Remote build dir:', 'ssh.settings': 'Remote settings64.sh:',
    'programmer.tool': 'Programmer tool:', 'programmer.cable': 'Cable:',
  };
  const modeBox = h('div', { class: 'form-grid' });
  const renderMode = () => {
    modeBox.innerHTML = '';
    for (const k of groups[mode.value]) modeBox.append(h('label', {}, labels[k]), inputs[k]);
  };
  mode.addEventListener('change', renderMode);
  renderMode();
  const st = tc.ise;
  const progRows = Object.entries(tc.programmers).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', { html: v.found ? icons.ok : icons.err }), h('td', {}, v.found ? `${v.path}${v.version ? ` (${v.version})` : ''}` : 'not found')));
  const r = await dialog({
    title: 'Toolchain Settings', width: 640,
    body: h('div', {},
      h('div', { class: `msg ${st.available ? '' : 'msg-warn'}`, style: { marginBottom: '10px' } }, h('div', { class: 'msg-icon' }, st.available ? '✓' : '!'),
        h('div', { class: 'msg-text' }, h('b', {}, `Xilinx ISE 14.7: ${st.available ? 'available' : 'not available'}`), `\n${st.reason}\n\n`, h('span', { style: { color: '#555' } }, st.help),
          st.available ? null : h('div', { style: { marginTop: '8px' } }, h('b', {}, 'Easiest setup on any OS: '), 'build the private Docker image with the Silinx kit (docker/ise/README.md): ',
            h('code', {}, 'docker/ise/build-ise-image.sh --installer <Xilinx_ISE_DS_Lin_14.7_1015_1.tar> --license <Xilinx.lic>'), ' (Windows: build-ise-image.ps1). It configures Silinx automatically.'))),
      h('div', { class: 'form-grid' }, h('label', {}, 'Execution mode:'), mode),
      h('div', { style: { margin: '6px 0 10px' } }, modeBox),
      h('div', { style: { fontWeight: 'bold', margin: '8px 0 4px' } }, 'Device programmers'),
      h('table', { class: 'grid' }, h('tr', {}, h('th', {}, 'Tool'), h('th', {}, ''), h('th', {}, 'Location')), ...progRows),
      h('div', { class: 'form-grid', style: { marginTop: '8px' } }, h('label', {}, labels['programmer.tool']), inputs['programmer.tool'], h('label', {}, labels['programmer.cable']), inputs['programmer.cable']),
      h('div', { style: { color: '#777', marginTop: '8px' } }, `Settings file: ${tc.configPath}`)),
    buttons: [{ label: 'Save', primary: true, value: true }, { label: 'Cancel', value: null }],
  });
  if (!r) return;
  const out = { mode: mode.value, local: {}, docker: {}, ssh: {}, programmer: {} };
  for (const [k, el] of Object.entries(inputs)) {
    const [g, f] = k.split('.');
    out[g][f] = f === 'port' ? (+el.value || 22) : el.value.trim();
  }
  try {
    S.toolchain = await api.saveToolchain(out);
    app.log(`Toolchain settings saved (${S.toolchain.ise.mode}: ${S.toolchain.ise.reason}).`, S.toolchain.ise.available ? 'ok' : 'warn');
  } catch (e) { alertDlg('Toolchain Settings', e.message, 'error'); }
}

const link = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

export function aboutDialog() {
  return dialog({
    title: `About ${PRODUCT}`, width: 520,
    body: h('div', { style: { display: 'flex', gap: '16px' } },
      h('div', { style: { width: '64px', height: '64px', background: '#c4161c', color: '#fff', font: 'bold 40px Arial', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' } }, 'S'),
      h('div', {}, h('div', { style: { fontSize: '16px', fontWeight: 'bold' } }, PRODUCT_FULL), h('div', {}, `Version ${VERSION}`),
        h('p', {}, 'HDL design platform for Xilinx FPGAs (Spartan-3/3A/3E/6, Virtex-4/5/6, 7-series with ISE 14.7): mixed VHDL/Verilog projects, RTL schematics, ASM state machine editor, behavioural simulation and device programming.'),
        h('table', { class: 'about-info', style: { borderSpacing: '0 3px', margin: '6px 0 10px' } },
          h('tr', {}, h('td', { style: { paddingRight: '10px', verticalAlign: 'top', fontWeight: 'bold' } }, 'Project:'),
            h('td', {}, link(`https://github.com/${REPOSITORY}`, `github.com/${REPOSITORY}`))),
          h('tr', {}, h('td', { style: { paddingRight: '10px', verticalAlign: 'top', fontWeight: 'bold' } }, 'Developers:'),
            h('td', {}, h('div', {}, 'Pedro Maló — ', link('https://github.com/pmnmalo', 'github.com/pmnmalo')),
              h('div', { style: { color: '#666' } }, 'developed with Claude (Anthropic)')))),
        h('p', { style: { color: '#666' } }, 'Synthesis, place & route and bitstream generation use the Xilinx ISE 14.7 command-line tools. Xilinx, ISE, ISim, iMPACT and Spartan are trademarks of AMD/Xilinx; Silinx ISE is an independent project, not affiliated with or endorsed by AMD/Xilinx.'))),
    buttons: [{ label: 'OK', primary: true, value: true }],
  });
}

// ------------------------------------------------------------------ Check for updates
const REPO = REPOSITORY;

/** Help ▸ Check for Updates…: the running version vs the latest release on GitHub. */
export async function checkUpdatesDialog() {
  const body = h('div', {}, h('p', {}, `Running ${PRODUCT} ${VERSION}. Checking the latest release on GitHub…`));
  const done = dialog({ title: 'Check for Updates', width: 520, body, buttons: [{ label: 'OK', primary: true, value: true }] });
  let rel;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 403 ? 'GitHub rate limit reached, try again later' : `GitHub answered ${r.status}`);
    rel = await r.json();
  } catch (e) {
    body.replaceChildren(h('p', {}, `Running ${PRODUCT} ${VERSION}.`),
      h('p', { style: { color: '#c00000' } }, `Could not check for updates: ${e.message || e}.`),
      h('p', {}, 'Releases: ', link(`https://github.com/${REPO}/releases`, `github.com/${REPO}/releases`)));
    return done;
  }
  const latest = String(rel.tag_name || rel.name || '').replace(/^v/i, '');
  const cmp = compareVersions(latest, VERSION);
  const when = rel.published_at ? new Date(rel.published_at).toLocaleDateString() : '';
  const assets = (rel.assets || []).map((a) => h('li', {}, link(a.browser_download_url, a.name), ` (${Math.max(1, Math.round(a.size / 1024))} KB)`));
  if (cmp > 0) {
    body.replaceChildren(...[
      h('p', {}, h('b', {}, `A new version is available: ${PRODUCT} ${latest}`), when ? ` (released ${when})` : ''),
      h('p', {}, `You are running ${VERSION}.`),
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
  const rows = [['Ctrl+Space', 'Auto-complete'], ['Ctrl/Cmd+/', 'Toggle comment'], ['Ctrl+F / Ctrl+H', 'Find / Replace'], ['Ctrl+G', 'Go to line'], ['F12 or Ctrl/Cmd+Click', 'Go to definition'], ['Ctrl+Q', 'Fold block'], ['Double-click process', 'Run process'], ['Double-click instance (schematic)', 'Push into instance']];
  return dialog({
    title: 'Keyboard Shortcuts', width: 440,
    body: h('table', { class: 'grid' }, ...rows.map(([k, v]) => h('tr', {}, h('td', { style: { fontFamily: 'var(--mono)' } }, k), h('td', {}, v)))),
    buttons: [{ label: 'OK', primary: true, value: true }],
  });
}

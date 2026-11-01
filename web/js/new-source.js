// The New Source wizard (moved from wizards.js, #405): the source type, its file name and location, then the
// type's pages; Finish writes the skeleton source. The Wizard > button of the File Name and Location page opens the
// type's wizard instead (#958), at its own pages: the name, the location and the language are this page's (#2082).
import { openOnlyDevice } from '/packages/silinx-fpga/src/parts.js';
import { api } from './api.js';
import { icons, icon } from './icons.js';
import { h } from './ui.js';
import * as T from './templates.js';
import { typeText } from './editor.js';
import { S, app } from './app.js';
import { isView } from '/core/view-hdl.js';
import { reservedError } from '/core/reserved.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace, moduleElsewhere, drawnHdlTaken, NAME_RE, FILE_RE } from './wizards.js';
import { cTemplate, cppTemplate } from './c-templates.js';
export { cTemplate, cppTemplate } from './c-templates.js';

const SOURCE_TYPES = [
  // ext null: VHDL or Verilog, the language of the File Name and Location page (the extension follows it)
  // wiz: the wizard the Wizard > button opens (#958); only: no plain source, Next > disabled
  { id: 'tt', label: 'Boolean Algebra', ico: 'algebra', ext: '.bool.json', dir: 'src', wiz: 'boolean' },
  { id: 'hdl', label: 'Module (HDL)', ico: 'vhdl', ext: null, dir: 'src', wiz: 'module' },
  { id: 'sch', label: 'Schematic', ico: 'schematic', ext: '.sch.json', dir: 'src', wiz: 'schematic', drawn: true },
  { id: 'fsm', label: 'Finite State Machine (FSM)', ico: 'fsm', ext: '.fsm.json', dir: 'src', wiz: 'fsm', drawn: true },
  { id: 'asm', label: 'Algorithmic State Machine (ASM)', ico: 'asm', ext: '.asm.json', dir: 'src', wiz: 'asm', drawn: true },
  { id: 'petri', label: 'Petri Net', ico: 'petri', ext: '.pn.json', dir: 'src', wiz: 'petri', drawn: true },
  { id: 'clkwiz', label: 'Clock Manager (DCM / PLL)', ico: 'template', ext: null, dir: 'src', wiz: 'clock', only: true },
  { id: 'bramwiz', label: 'Block Memory', ico: 'template', ext: null, dir: 'src', wiz: 'memory', only: true },
  { id: 'tb', label: 'Test Bench', ico: 'vhdl', ext: null, dir: 'sim', wiz: 'testbench' },
  { id: 'ucf', label: 'Implementation Constraints File', ico: 'ucf', ext: '.ucf', dir: 'constraints', wiz: 'ucf' },
  { id: 'pcf', label: 'Implementation Constraints File', ico: 'ucf', ext: '.pcf', dir: 'constraints', hidden: true },   // (the iCE40's: its device shows it for UCF's, #2296)
  { id: 'mem', label: 'Memory Initialization File (.mem)', ico: 'file', ext: '.mem', dir: 'src' },
  { id: 'c', label: 'C Function (HLS)', ico: 'file', ext: '.c', dir: 'src' },   // (Silinx HLS, compatible with Vitis HLS: #1531)
  { id: 'cpp', label: 'C++ Function (HLS)', ico: 'file', ext: '.cpp', dir: 'src' },   // (#1590)
  // not in the list any more; newSourceWizard({ type: 'vhdl-pkg' }) still creates one
  { id: 'vhdl-pkg', label: 'VHDL Package', ico: 'vhdl', ext: '.vhd', dir: 'src', hidden: true },
];

// name, location, lang, atFile: a wizard's < Back (#2082): New Source again at the File Name and Location page, as left
export async function newSourceWizard({ type, name = '', location = null, lang = null, atFile = false } = {}) {
  if (!S.project) return;
  // old type ids (vhdl, verilog, vhdl-tb, verilog-tb) still accepted: they preset the language; the old wizard types
  // (modwiz, schwiz, pnwiz, tbwiz) select the type whose Wizard button opens that wizard (#958)
  const LEGACY = { vhdl: ['hdl', 'vhdl'], verilog: ['hdl', 'verilog'], 'vhdl-tb': ['tb', 'vhdl'], 'verilog-tb': ['tb', 'verilog'],
    modwiz: ['hdl'], schwiz: ['sch'], pnwiz: ['petri'], tbwiz: ['tb'] };
  const pcf = openOnlyDevice(S.project.device), consType = id => (pcf && id === 'ucf' ? 'pcf' : id);
  let st = SOURCE_TYPES.find(t => t.id === consType(LEGACY[type]?.[0] || type)) || SOURCE_TYPES.find(t => t.id === 'hdl');   // default: Module (HDL)
  const shown = () => SOURCE_TYPES.filter(t => (t.id === 'ucf' ? !pcf : t.id === 'pcf' ? pcf : !t.hidden || t === st));
  // language of HDL modules and test benches (Define Module / Associate Source pages)
  const langSel = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], lang || LEGACY[type]?.[1] || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl'));
  const extOf = t => t.ext ?? (langSel.value === 'verilog' ? '.v' : '.vhd');
  const guard = replaceGuard('New Source');
  const fname = h('input', { type: 'text', placeholder: 'file name', value: name });
  const loc = h('input', { type: 'text', value: location ?? st.dir });
  const list = h('div', { class: 'src-types' });
  let refresh = () => {};   // the wizard's steps and buttons for the type now (bound by the wizard)
  const renderList = () => {
    list.innerHTML = '';
    for (const t of shown()) {
      const row = h('div', { class: `st${t === st ? ' sel' : ''}` }, icon(t.ico), t.label);
      // the pages, the steps and the buttons follow the type (their number depends on it)
      row.addEventListener('click', () => { st = t; loc.value = t.dir; renderList(); refresh(); });
      row.addEventListener('dblclick', () => { st = t; refresh(); list.closest('.dlg')?.querySelector('.dlg-buttons .btn.primary')?.click(); });
      list.append(row);
    }
  };
  renderList();
  const p1 = {
    title: 'Select Source Type',
    render: () => h('div', {}, h('div', { class: 'hint' }, 'Select the type of the new source; its name and location come next.'), list),
    validate: () => null,
  };
  // the file name and the location; Wizard (#958) opens the type's wizard with them (it asks the rest on its pages)
  const nameOf = () => fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|pcf|mem|asm\.json|tt\.json|bool\.json|sch\.json|fsm\.json|pn\.json)$/i, '');
  const fileError = () => {
    if (!FILE_RE.test(nameOf())) return 'Enter a valid file name (letters, digits, _ and -).';
    if (!/^[A-Za-z0-9_/-]+$/.test(loc.value.trim())) return 'Invalid location.';
    return null;
  };
  const typeShown = h('span');   // (the page is drawn once: the type set on show)
  // the same page for every type (#2140): its type, the file name, the location and the language (an HDL file's, the
  // extension follows it, or a drawing's HDL; the project's preferred language by default); the rest on the next
  // pages or in the type's wizard
  const fileGrid = h('div', { class: 'form-grid' }, ...field('Source type:', typeShown), ...field('File name:', fname), ...field('Location:', loc), ...field('Language:', langSel));
  const typeShownAt = () => { typeShown.textContent = st.label; };
  const pFile = {
    title: 'File Name and Location',
    render: () => h('div', {},
      fileGrid,
      h('label', { style: { display: 'block', marginTop: '12px' } }, h('input', { type: 'checkbox', checked: true, disabled: true }), ' Add to project')),
    onShow: () => { typeShownAt(); setTimeout(() => fname.focus(), 0); },
    noNext: () => !!st.only,   // a wizard-only type: Wizard
    validate: async () => {
      const n = nameOf();
      const e = fileError();
      if (e) return e;
      const p = `${loc.value.trim().replace(/\/+$/, '')}/${n}${extOf(st)}`;
      // the module named as the file (a drawing, a test bench, a package): not a reserved word of VHDL or
      // Verilog, in any letter case (#679; a module's own name is asked on the next page)
      if (!['hdl', 'ucf', 'pcf', 'mem'].includes(st.id)) {
        const r = reservedError(n.split('/').pop().replace(/[^A-Za-z0-9_]/g, '_'));
        if (r) return `${r}: choose another name.`;
      }
      // a drawing: its module (named as the file) and its HDL file must be free (#230)
      if (isView(p)) {
        const mod = n.split('/').pop().replace(/[^A-Za-z0-9_]/g, '_');
        if (moduleElsewhere(mod, p)) return `A module named '${mod}' already exists.`;
        const taken = drawnHdlTaken(p, mod, langSel.value);
        if (taken) return taken;
      }
      const r = await guard(p);
      if (r) setTimeout(() => { fname.focus(); fname.select(); }, 0);   // Cancel: the name kept, to edit (#1467)
      return r;
    },
  };
  // Wizard > (#2082): the wizard has no page of the name any more, so the name is checked here as the module the wizard
  // names after it (a test bench's is asked on its wizard's first page; a UCF names no module)
  const wizardError = () => {
    const e = fileError();
    if (e || ['tb', 'ucf', 'pcf'].includes(st.id)) return e;
    const mod = identOf(nameOf().split('/').pop());
    const r = reservedError(mod);
    if (r) return `${r}: choose another name.`;
    const p = `${loc.value.trim().replace(/\/+$/, '')}/${nameOf()}${extOf(st)}`;
    if (moduleElsewhere(mod, p)) return `A module named '${mod}' already exists.`;
    return isView(p) ? drawnHdlTaken(p, mod, langSel.value) : null;
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
  const p2 = {
    title: 'Define Module',
    render: () => {
      renderPorts();
      return h('div', {},
        h('div', { class: 'form-grid' }, ...field('Entity / Module name:', entName), archLbl, archName),   // (its language: the previous page's, #2140)
        h('div', { style: { marginTop: '10px', maxHeight: '250px', overflow: 'auto', border: '1px solid var(--frame)' } }, portTbl));
    },
    onShow: () => { if (!entName.value) entName.value = fname.value.trim().replace(/\..*$/, ''); syncArch(); },
    validate: () => {
      if (!NAME_RE.test(entName.value.trim())) return 'Invalid module name.';
      const r = reservedError(entName.value.trim()) || ports.map(p => reservedError(p.name)).find(Boolean);
      if (r) return `${r}: choose another name.`;
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
  const summary = h('pre', { class: 'code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const n = fname.value.trim().replace(/\.(vhd|vhdl|v|ucf|pcf|mem|asm\.json|tt\.json|bool\.json|sch\.json)$/i, '');
      const lg = langSel.value === 'verilog' ? 'Verilog' : 'VHDL';
      summary.textContent = `Project Navigator will create a new skeleton source with the following specifications.\n\nAdd to Project: Yes\nSource Directory: ${loc.value}\nSource Type: ${st.label}${st.ext ? '' : ` (${lg})`}\nSource Name: ${n}${extOf(st)}\n` +
        (st.id === 'hdl' ? `\nEntity name: ${entName.value}\n${langSel.value === 'vhdl' ? `Architecture name: ${archName.value}\n` : ''}\nPort Definitions:\n${ports.map(p => `    ${p.name.padEnd(12)} ${p.bus ? `Bus[${p.msb}:${p.lsb}]` : 'Pin'.padEnd(8)}  ${p.dir}`).join('\n')}` : '') +
        (st.id === 'tb' ? `\nAssociated Source: ${uutName}` : '');
    },
  };
  const pages = () => {
    if (st.id === 'hdl') return [p1, pFile, p2, pSum];
    if (st.id === 'tb') return [p1, pFile, p2tb, pSum];
    if (st.only) return [p1, pFile];   // the wizard only: Wizard on the File Name page
    return [p1, pFile, pSum];
  };
  // the language (extension) may have changed after page 1; the name as on the File Name page (#1467: x.fsm.json was
  // checked there as src/x.fsm.json and written as src/x.fsm.json.fsm.json)
  pSum.validate = () => guard(`${loc.value.trim().replace(/\/+$/, '')}/${nameOf()}${extOf(st)}`);
  const ok = await wizard('New Source', pages, {
    width: 760, bind: r => { refresh = r; }, start: atFile ? 1 : 0,
    extra: { label: 'Wizard >', value: 'wizard', shown: p => p === pFile, disabled: () => !st.wiz, validate: wizardError },
  });
  if (!ok) return;
  if (ok === 'wizard') return openWizard(st.wiz, { name: nameOf(), location: loc.value.trim().replace(/\/+$/, ''), lang: langSel.value, ext: st.ext,
    back: () => newSourceWizard({ type: st.id, name: fname.value.trim(), location: loc.value.trim(), lang: langSel.value, atFile: true }) });
  const n = nameOf();
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
    case 'pcf': text = T.pcfTemplate(pj); break;
    case 'mem': text = '// memory initialization file ($readmemh format)\n00\n01\n02\n03\n'; break;
    case 'c': text = cTemplate(n.replace(/[^A-Za-z0-9_]/g, '_')); break;
    case 'cpp': text = cppTemplate(n.replace(/[^A-Za-z0-9_]/g, '_')); break;
    case 'sch': {
      const { newDoc } = await import('/core/schdoc.js');
      text = JSON.stringify(newDoc(n.replace(/[^A-Za-z0-9_]/g, '_'), langSel.value), null, 1);
      break;
    }
    case 'asm': {
      const { normalizeModel } = await import('/core/asm.js');
      text = JSON.stringify(normalizeModel({ name: n.replace(/[^A-Za-z0-9_]/g, '_'), lang: langSel.value }), null, 2);   // empty (#2176)
      break;
    }
    case 'fsm': {
      const { normalizeFsm } = await import('/core/fsm.js');
      text = JSON.stringify(normalizeFsm({ name: n.replace(/[^A-Za-z0-9_]/g, '_'), lang: langSel.value }), null, 2);   // empty (#2176)
      break;
    }
    case 'petri': {
      const { normalizePetri } = await import('/core/petri.js');
      text = JSON.stringify(normalizePetri({ name: n.replace(/[^A-Za-z0-9_]/g, '_'), lang: langSel.value }), null, 2);   // empty (#2176)
      break;
    }
    case 'tt': {
      const { newTable } = await import('/core/logic.js');
      text = JSON.stringify({ ...newTable(n.replace(/[^A-Za-z0-9_]/g, '_'), ['a', 'b', 'c'], ['f']), lang: langSel.value }, null, 2);
      break;
    }
  }
  const noUcf = !S.fileTree.includes(pj.constraints);
  await closeBeforeReplace(path);
  await api.writeFile(pj.name, path, text);   // registers the new file in silinx.json
  // reload first: saving the project settings from the old copy would drop that registration
  await app.reloadProject();
  if ((st.id === 'ucf' || st.id === 'pcf') && noUcf) { S.project.constraints = path; await app.saveProjectJson(); await app.reloadProject(); }
  if (st.id === 'tb') app.showInSim(n);   // selected in the Simulation view, ready to simulate
  app.log(`Created ${st.label}${st.ext ? '' : ` (${langSel.value === 'verilog' ? 'Verilog' : 'VHDL'})`} '${path}'.`, 'ok');
  if (st.id === 'fsm') { app.openFsm(path); return; }
  if (st.id === 'petri') { app.openPetri(path); return; }
  if (st.id === 'asm') app.openAsm(path); else if (st.id === 'tt') app.openTt(path); else if (st.id === 'sch') app.openSch(path); else app.openFile(path);
}

// a file name that is not an identifier (e.g. with -) as the module's name
const identOf = name => name.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/_$/, '');

// the wizard of a source type (New Source ▸ Wizard >, #958) with the file name, the location and the language typed:
// it opens at its own pages, without its page of the name (named, #2082)
// (< Back on its first page: New Source again, `back`)
async function openWizard(wiz, { name, location, lang, ext, back }) {
  const o = { name: identOf(name), location, lang, named: true, back };
  switch (wiz) {
    case 'module': return (await import('./modwizard.js')).moduleWizard(o);
    case 'schematic': return (await import('./modwizard.js')).schematicWizard(o);
    case 'petri': return (await import('./petri-wizard.js')).petriWizard(o);
    case 'fsm': return (await import('./chart-wizards.js')).fsmWizard(o);
    case 'asm': return (await import('./chart-wizards.js')).asmWizard(o);
    case 'ucf': return (await import('./ucf-wizard.js')).ucfWizard({ path: `${location}/${name}${ext}`, back });
    case 'boolean': return (await import('./tt-wizard.js')).booleanWizard({ path: `${location}/${name}${ext}`, name: o.name, lang, back });
    case 'testbench': return (await import('./tbwizard.js')).testBenchWizard({ module: S.sel?.module, name: name || null, location, lang, back });
    case 'clock': return (await import('./clock-wizard.js')).clockWizard(o);
    case 'memory': return (await import('./bram-wizard.js')).blockMemoryWizard(o);
  }
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

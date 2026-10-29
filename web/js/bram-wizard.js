// The Block Memory wizard (#794), New Source ▸ 'Block Memory' ▸ Wizard (#958): a RAM or a ROM of the target device's block RAMs
// (core/blockram.js). The pages: the name, language and location -> the memory (RAM or ROM, one port or two, width x
// depth, the write mode, block RAM primitives or inferable HDL, its initial contents from a .mem / .coe file of the
// project), with the block RAMs it takes against the device's (one that does not fit is refused) -> summary. It
// writes the module, its settings in its header: opening it from the Design pane reopens the wizard with them
// (web/js/wizard-modules.js), and writes it again from the file's contents of then.
import { api } from './api.js';
import { h, alertDlg, toast } from './ui.js';
import { memoryModule, planMemory, readInitFile, MEMORY_FAMILIES } from '/core/blockram.js';
import { resourceCount } from '/packages/silinx-fpga/src/parts.js';
import { identError } from '/core/modgen.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace, moduleElsewhere } from './wizards.js';
import { S, app } from './app.js';
import { cleanLoc, namedPages } from './wizard-util.js';

const LANGS = [['vhdl', 'VHDL'], ['verilog', 'Verilog']];
const INIT_RE = /\.(mem|coe)$/i;

// the block RAMs of the project's device, in the plan's unit: RAMB16s (Spartan-3E), 9 Kbit halves (Spartan-6)
function deviceBlocks(family) {
  const part = S.devices?.parts?.find(p => p.part === S.project.device.part);
  if (!part) return null;
  return family === 'spartan6' ? resourceCount(part, 'ramb8bwer') : resourceCount(part, 'ramb16');
}
const usageText = (plan, have) => {
  const s6 = plan.family === 'spartan6';
  const n = s6 ? `${plan.blocks} ${plan.prim}` : `${plan.blocks} RAMB16`;
  const of = have === null ? '' : s6 ? ` (${plan.halves} of the ${have} halves of 9 Kbit on this device)` : ` of the ${have} on this device`;
  return `Block RAMs: ${n}${of}; ${plan.primName} of ${plan.shape.depth} x ${plan.shape.width}, ${plan.cols} side by side${plan.rows > 1 ? `, ${plan.rows} deep` : ''}.`;
};

/** The initial contents of a spec: { words, errors } (none: zeros). */
async function contentsOf(spec) {
  if (!spec.init) return { words: [], errors: [] };
  let text;
  try { text = await api.readFile(S.project.name, spec.init); } catch { return { words: [], errors: [`${spec.init} cannot be read.`] }; }
  return readInitFile(text, spec.init, +spec.width, +spec.depth);
}

/**
 * The wizard: a new module (location, lang), or the module of `path` again (spec: its settings, from its header).
 * Returns the path written, or undefined when cancelled.
 */
export async function blockMemoryWizard({ name = '', location = 'src', lang = null, path: editPath = null, spec: old = null, named = false } = {}) {
  if (!S.project) return;
  const pj = S.project;
  const family = old?.family || pj.device.family;
  if (!MEMORY_FAMILIES.includes(family)) return alertDlg('Block Memory', 'The Block Memory wizard makes block RAMs of the Spartan-3E and the Spartan-6: choose one of them as the target device (Design Properties).', 'error');
  if (old && old.family !== pj.device.family) {
    return alertDlg('Block Memory', `${editPath} was made for another family of devices than the project's: create a new one with New Source ▸ Block Memory ▸ Wizard.`, 'error');
  }
  const have = deviceBlocks(family);
  const L = lang || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const spec = structuredClone(old || { wizard: 'memory', version: 1, name: 'bram', lang: L, family, kind: 'ram', ports: 'single', width: 8, depth: 1024, writeMode: 'READ_FIRST', style: 'primitive', init: '' });
  if (!old && name) spec.name = name;   // the file name typed in New Source (#958)
  const guard = replaceGuard('Block Memory');
  // a module changed by hand since the wizard wrote it (from the file's contents of then): said
  const edited = editPath && await (async () => (S.sources || []).find(s => s.path === editPath)?.text !== memoryModule(old, (await contentsOf(old)).words).code)();
  // ------------------------------------------------------------ page 1: name, language, location
  const nameIn = h('input', { type: 'text', class: 'bw-name', value: spec.name });
  const langSel = select(LANGS, spec.lang);
  const locIn = h('input', { type: 'text', class: 'bw-loc', value: editPath ? editPath.replace(/\/[^/]*$/, '') : cleanLoc(location) });
  const fileHint = h('span', { class: 'bw-file', 'data-no-i18n': '' });
  const path = () => editPath || `${cleanLoc(locIn.value)}/${nameIn.value.trim()}${langSel.value === 'verilog' ? '.v' : '.vhd'}`;
  const syncFile = () => { fileHint.textContent = path(); };
  [nameIn, locIn].forEach(e => e.addEventListener('input', syncFile));
  langSel.addEventListener('change', syncFile);
  if (editPath) [nameIn, langSel, locIn].forEach(e => { e.disabled = true; });
  const countNote = () => (have === null ? '' : h('div', { class: 'hint bw-count', style: { marginTop: '10px' } }, family === 'spartan6' ? `Block RAMs on this device: ${have / 2} of 18 Kbit (${have} halves of 9 Kbit)` : `Block RAMs on this device: ${have} RAMB16 of 18 Kbit`));
  const p1 = {
    title: 'Name and Language',
    render: () => h('div', {},
      h('div', { class: 'hint' }, family === 'spartan6'
        ? 'The wizard writes a module with a RAM or a ROM of the Spartan-6\'s block RAMs (RAMB8BWER, RAMB16BWER), or the HDL synthesis maps to them.'
        : 'The wizard writes a module with a RAM or a ROM of the Spartan-3E\'s block RAMs (RAMB16), or the HDL synthesis maps to them.'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('Module name:', nameIn), ...field('Language:', langSel), ...field('Location:', locIn), ...field('File:', fileHint)),
      countNote(),
      edited ? h('div', { class: 'hint bw-edited', style: { marginTop: '10px', color: 'var(--danger)' } }, 'This module was changed by hand since the wizard wrote it: Finish writes it again from the wizard\'s settings, and those changes are lost.') : ''),
    onShow: syncFile,
    validate: async () => {
      if (have === 0) return 'This device has no block RAM.';
      const n = nameIn.value.trim();
      const e = identError(n, langSel.value);
      if (e) return `Name: ${e}.`;
      if (!/^[A-Za-z0-9_/-]+$/.test(locIn.value.trim())) return 'Invalid location.';
      if (moduleElsewhere(n, path())) return `A module named '${n}' already exists.`;
      return editPath ? null : guard(path());
    },
  };
  // ------------------------------------------------------------ page 2: the memory
  const kindSel = select([['ram', 'RAM (read and write)'], ['rom', 'ROM (read only)']], spec.kind);
  const portsSel = select([['single', 'One port (A)'], ['dual', 'Two ports (A and B, each its own clock)']], spec.ports);
  const widthIn = h('input', { type: 'number', class: 'bw-width', value: String(spec.width), min: '1', step: '1', style: { width: '90px' } });
  const depthIn = h('input', { type: 'number', class: 'bw-depth', value: String(spec.depth), min: '2', step: '1', style: { width: '90px' } });
  const modeSel = select([['READ_FIRST', 'Read first (the old word is read)'], ['WRITE_FIRST', 'Write first (the new word is read)']], spec.writeMode);
  const styleSel = select([['primitive', 'Block RAM primitives'], ['inferred', 'Inferable HDL (an array)']], spec.style);
  const files = (S.fileTree || []).filter(f => INIT_RE.test(f));
  const initSel = select([['', '(none: zeros)'], ...files.map(f => [f, f])], files.includes(spec.init) ? spec.init : '');
  [...initSel.options].slice(1).forEach(o => { o.dataset.noI18n = ''; });   // (file names)
  [kindSel, portsSel, modeSel, styleSel, initSel].forEach((e, i) => e.classList.add(['bw-kind', 'bw-ports', 'bw-mode', 'bw-style', 'bw-init'][i]));
  const usage = h('div', { class: 'hint bw-usage', style: { marginTop: '10px' } });
  const errBox = h('div', { class: 'bw-errors', style: { color: 'var(--danger)', minHeight: '16px', marginTop: '6px' } });
  const modeRow = h('span', {}, modeSel);
  // the plan and its errors, with the device's count: [plan, message | null]
  const check = () => {
    Object.assign(spec, { kind: kindSel.value, ports: portsSel.value, width: +widthIn.value, depth: +depthIn.value, writeMode: modeSel.value, style: styleSel.value, init: initSel.value });
    modeSel.disabled = spec.kind === 'rom';
    const plan = planMemory(spec);
    let err = plan.errors[0] || null;
    if (!err && have !== null && plan.halves > have) {
      err = family === 'spartan6' ? `It takes ${plan.halves} halves of 9 Kbit and the device has ${have}: make it smaller.` : `It takes ${plan.blocks} block RAMs and the device has ${have}: make it smaller.`;
    }
    usage.textContent = plan.errors.length ? '' : usageText(plan, have);
    errBox.textContent = err || '';
    return [plan, err];
  };
  [widthIn, depthIn].forEach(e => e.addEventListener('input', check));
  [kindSel, portsSel, modeSel, styleSel, initSel].forEach(e => e.addEventListener('change', check));
  const p2 = {
    title: 'Memory',
    render: () => h('div', {},
      h('div', { class: 'form-grid' },
        ...field('Memory type:', kindSel), ...field('Ports:', portsSel), ...field('Width (bits):', widthIn), ...field('Depth (words):', depthIn),
        ...field('Write mode:', modeRow), ...field('Written as:', styleSel), ...field('Initial contents:', initSel)),
      h('div', { class: 'hint', style: { marginTop: '8px' } }, files.length ? 'The initial contents: a .mem file (hexadecimal words, @address) or a .coe file of the project; the words it does not give are 0.'
        : 'The initial contents come from a .mem or .coe file of the project (New Source ▸ Memory Initialization File); there is none yet.'),
      usage, errBox),
    onShow: check,
    validate: async () => {
      const [, err] = check();
      if (err) return err;
      const c = await contentsOf(spec);
      return c.errors[0] || null;
    },
  };
  // ------------------------------------------------------------ page 3: summary
  const summary = h('pre', { class: 'bw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      spec.name = nameIn.value.trim(); spec.lang = langSel.value;
      const plan = planMemory(spec);
      summary.textContent = [
        `The wizard will ${editPath ? 'write again' : 'create'} ${path()} (${spec.lang === 'vhdl' ? 'VHDL' : 'Verilog'}): the module ${spec.name}.`,
        '',
        `${spec.kind === 'rom' ? 'ROM' : 'RAM'}: ${spec.depth} words of ${spec.width} bits, ${spec.ports === 'dual' ? 'two ports' : 'one port'}${spec.kind === 'rom' ? '' : `, ${spec.writeMode}`}`,
        `Written as: ${spec.style === 'inferred' ? 'inferable HDL' : `${plan.blocks} ${plan.primName}`}`,
        usageText(plan, have),
        `Initial contents: ${spec.init || 'zeros'}`,
      ].join('\n');
    },
    validate: () => (editPath ? null : guard(path())),
  };
  // (from New Source: the count under the memory, #2082)
  const ok = await wizard('Block Memory', namedPages(p1, [p1, p2, pSum], named, countNote), { width: 820 });
  if (!ok) return;
  spec.name = nameIn.value.trim(); spec.lang = langSel.value;
  const c = await contentsOf(spec);
  const { code, plan } = memoryModule(spec, c.words);
  if (!code || c.errors.length) return alertDlg('Block Memory', [...plan.errors, ...c.errors].join('\n'), 'error');
  const p = path();
  await closeBeforeReplace(p);
  await api.writeFile(pj.name, p, code);
  await app.reloadProject();
  app.log(`Block Memory: ${editPath ? 'wrote again' : 'created'} ${p}, the module ${spec.name}: ${spec.depth} x ${spec.width}, ${spec.style === 'inferred' ? 'inferable HDL' : `${plan.blocks} ${plan.primName}`}.`, 'ok');
  toast(`Memory module ${spec.name} ${editPath ? 'updated' : 'created'}`, 'ok');
  return p;
}

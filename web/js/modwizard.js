// Beginner wizards of the New Source dialog (types 'Module (Wizard)' and 'Schematic (Wizard)'):
// the New Source page 1 asks the file name and location, Finish there opens one of these.
//
//   moduleWizard:    name, language and description -> inputs and outputs (friendly table with
//                    quick-add buttons) -> kind of logic (combinational / sequential with clock,
//                    reset and enable; generics) -> summary with a preview of the code.
//   schematicWizard: name, language and description -> inputs and outputs (same table, optional
//                    clock input) -> summary; it creates a .sch.json with the I/O markers placed.
// Generators: core/modgen.js.
import { api } from './api.js';
import { icons } from './icons.js';
import { h, alertDlg, toast } from './ui.js';
import { generateModule, schematicFromPorts, checkPorts, identError, guessClockReset, QUICK_PORTS, MAX_WIDTH } from '/core/modgen.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace, moduleElsewhere } from './wizards.js';
import { S, app } from './app.js';

const LANGS = [['vhdl', 'VHDL'], ['verilog', 'Verilog']];
const PRE = { background: '#fff', border: '1px solid #ccc', padding: '10px', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' };
const cleanLoc = loc => String(loc || 'src').trim().replace(/\/+$/, '') || 'src';
const extOf = (lang, sch) => (sch ? '.sch.json' : lang === 'verilog' ? '.v' : '.vhd');
const portText = p => `${p.name}${+p.width > 1 ? ` [${p.width - 1}:0]` : ''}`;

// ---------------------------------------------------------------- page 1: name, language, description
function namePage({ title, name, lang, loc, sch, withArch, guard }) {
  const nameIn = h('input', { type: 'text', class: 'mw-name', value: name || '' });
  const langSel = select(LANGS, lang);
  const archIn = h('input', { type: 'text', class: 'mw-arch', value: 'rtl' });
  const archLbl = h('label', {}, 'Architecture name:');
  const desc = h('textarea', { class: 'mw-desc', rows: 3, style: { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }, placeholder: 'What the module does (it goes into the header comment)' });
  const fileHint = h('span', { class: 'mw-file', 'data-no-i18n': '' });
  const path = () => `${cleanLoc(loc)}/${nameIn.value.trim()}${extOf(langSel.value, sch)}`;
  const sync = () => {
    fileHint.textContent = path();
    if (withArch) archLbl.style.display = archIn.style.display = langSel.value === 'vhdl' ? '' : 'none';
  };
  nameIn.addEventListener('input', sync);
  langSel.addEventListener('change', sync);
  const page = {
    title,
    render: () => h('div', {},
      h('div', { class: 'hint' }, sch
        ? 'The wizard creates a schematic with an I/O marker for each input and output, ready for you to place the symbols and wire them.'
        : 'The wizard writes a commented skeleton of the module: its inputs and outputs, and a template of the logic (combinational or sequential).'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field(sch ? 'Schematic (module) name:' : 'Module name:', nameIn), ...field('Language:', langSel),
        ...(withArch ? [archLbl, archIn] : []),
        ...field('File:', fileHint)),
      h('label', { style: { display: 'block', marginTop: '10px' } }, 'Description (optional):'), desc),
    onShow: sync,
    validate: () => {
      const n = nameIn.value.trim();
      const e = identError(n, langSel.value);
      if (e) return `Name: ${e}.`;
      if (withArch && langSel.value === 'vhdl') { const a = identError(archIn.value.trim(), 'vhdl'); if (a) return `Architecture name: ${a}.`; }
      const other = moduleElsewhere(n, path());
      if (other) return `A module named '${n}' already exists.`;
      return guard(path());
    },
  };
  return { page, nameIn, langSel, archIn, desc, path, lang: () => langSel.value, name: () => nameIn.value.trim() };
}

// ---------------------------------------------------------------- the friendly port table
function portEditor(ports, { lang, onChange = () => {} }) {
  const tbl = h('table', { class: 'grid mw-ports' });
  const quick = h('div', { class: 'mw-quick', style: { display: 'flex', flexDirection: 'column', gap: '4px', margin: '6px 0' } });
  const has = n => ports.some(p => p.name.toLowerCase() === n.toLowerCase());
  const add = p => { ports.push({ name: p.name, dir: p.dir, width: p.width, desc: p.desc || '' }); render(); onChange(); };
  const renderQuick = () => {
    quick.innerHTML = '';
    for (const dir of ['in', 'out']) {
      const row = h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
        h('span', { style: { width: '120px' } }, dir === 'in' ? 'Quick add (inputs):' : 'Quick add (outputs):'));
      const btns = h('span', { 'data-no-i18n': '', style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } });
      for (const q of QUICK_PORTS.filter(x => x.dir === dir)) {
        btns.append(h('button', { class: 'btn mw-qa', 'data-port': q.name, disabled: has(q.name), onclick: () => { if (!has(q.name)) add(q); } }, portText(q)));
      }
      row.append(btns);
      quick.append(row);
    }
  };
  const render = () => {
    tbl.innerHTML = '';
    tbl.append(h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Direction'), h('th', { title: '1 = a single bit; N = a bus of N bits (N-1 downto 0)' }, 'Width (bits)'), h('th', {}, 'Description'), h('th', {}, '')));
    ports.forEach((p, k) => {
      const nm = h('input', { type: 'text', class: 'mw-pname', value: p.name, style: { width: '110px' } });
      const dir = select([['in', 'input'], ['out', 'output']], p.dir);
      dir.classList.add('mw-pdir');
      dir.style.minWidth = '90px';   // room for 'output' / 'saída'
      const w = h('input', { type: 'number', class: 'mw-pwidth', min: 1, max: MAX_WIDTH, value: p.width, style: { width: '60px' } });
      const ds = h('input', { type: 'text', class: 'mw-pdesc', value: p.desc || '', placeholder: 'optional', style: { width: '100%', boxSizing: 'border-box' } });
      const bits = h('span', { class: 'hint mw-pbits', 'data-no-i18n': '', style: { marginLeft: '4px' } });
      const syncBits = () => { const n = +w.value; bits.textContent = Number.isInteger(n) && n > 1 ? `(${n - 1} downto 0)` : ''; };
      syncBits();
      nm.addEventListener('input', () => { p.name = nm.value.trim(); renderQuick(); onChange(); });
      dir.addEventListener('change', () => { p.dir = dir.value; onChange(); });
      w.addEventListener('input', () => { p.width = w.value === '' ? '' : +w.value; syncBits(); onChange(); });
      ds.addEventListener('input', () => { p.desc = ds.value; });
      const del = h('button', { class: 'tb-btn mw-pdel', html: icons.remove, title: 'Remove', onclick: () => { ports.splice(k, 1); render(); onChange(); } });
      tbl.append(h('tr', {}, h('td', {}, nm), h('td', {}, dir), h('td', { style: { whiteSpace: 'nowrap' } }, w, bits), h('td', { style: { width: '100%' } }, ds), h('td', {}, del)));
    });
    if (!ports.length) tbl.append(h('tr', {}, h('td', { colspan: 5, class: 'hint', style: { padding: '8px' } }, 'No ports yet: use the quick-add buttons or Add Port.')));
    renderQuick();
  };
  const addBtn = h('button', { class: 'btn mw-add', onclick: () => {
    let k = ports.length + 1;
    while (has(`p${k}`)) k++;
    add({ name: `p${k}`, dir: 'in', width: 1 });
    tbl.querySelectorAll('.mw-pname')[ports.length - 1]?.select();
  } }, 'Add Port');
  render();
  const node = h('div', {},
    h('div', { class: 'hint' }, 'One row per input or output. Width 1 is a single bit (std_logic / wire); a width N makes a bus of N bits, numbered N-1 downto 0.'),
    quick,
    h('div', { style: { maxHeight: '230px', overflow: 'auto', border: '1px solid #ccc' } }, tbl),
    h('div', { style: { marginTop: '6px' } }, addBtn));
  const check = name => {
    const bad = ports.find(p => p.width === '' || !Number.isInteger(+p.width));
    if (bad) return `Port '${bad.name}': the width must be a whole number from 1 to ${MAX_WIDTH}.`;
    return checkPorts(ports.map(p => ({ ...p, width: +p.width })), { lang: lang(), name });
  };
  return { node, render, check };
}

// ---------------------------------------------------------------- Module (Wizard)
export async function moduleWizard({ name = '', location = 'src', lang = null } = {}) {
  const guard = replaceGuard('Module Wizard');
  if (!S.project) return;
  const L = lang || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const p1 = namePage({ title: 'Name and Language', name, lang: L, loc: location, withArch: true, guard });
  const ports = [];
  const pe = portEditor(ports, { lang: p1.lang });
  const p2 = {
    title: 'Inputs and Outputs',
    render: () => pe.node,
    validate: () => (ports.length ? pe.check(p1.name()) : 'Add at least one input or output.'),
  };

  // ---- page 3: kind of logic
  const st = { kind: 'comb', combStyle: 'assign', clock: '', rmode: 'none', reset: '', active: '1', enable: '' };
  const generics = [];
  const kindComb = h('input', { type: 'radio', name: 'mw-kind', value: 'comb', checked: true });
  const kindSeq = h('input', { type: 'radio', name: 'mw-kind', value: 'seq' });
  const styleSel = select([['assign', 'One assignment per output (concurrent)'], ['process', 'One process / always block that reads every input']], 'assign');
  const clkSel = h('select', { class: 'mw-clk' }), rstSel = h('select', { class: 'mw-rst' }), enSel = h('select', { class: 'mw-en' });
  const rmodeSel = select([['none', 'No reset'], ['sync', 'Synchronous (at the clock edge)'], ['async', 'Asynchronous (at once)']], 'none');
  rmodeSel.classList.add('mw-rmode');
  const activeSel = select([['1', "Active high ('1')"], ['0', "Active low ('0')"]], '1');
  activeSel.classList.add('mw-active');
  const combBox = h('div', { class: 'form-grid' }, ...field('Style:', styleSel));
  const seqBox = h('div', { class: 'form-grid' },
    ...field('Clock:', clkSel), ...field('Reset:', rmodeSel), ...field('Reset input:', rstSel), ...field('Reset level:', activeSel), ...field('Enable input:', enSel));
  const kindNote = h('div', { class: 'hint', style: { marginTop: '6px' } });
  const fillBits = (sel, value, none) => {
    sel.innerHTML = '';
    if (none) sel.append(h('option', { value: '' }, '(none)'));
    for (const p of ports.filter(x => x.dir === 'in' && +x.width === 1)) sel.append(h('option', { value: p.name, selected: p.name === value }, p.name));
    sel.value = [...sel.options].some(o => o.value === value) ? value : (sel.options[0]?.value ?? '');
  };
  const syncKind = () => {
    st.kind = kindSeq.checked ? 'seq' : 'comb';
    combBox.style.display = st.kind === 'comb' ? '' : 'none';
    seqBox.style.display = st.kind === 'seq' ? '' : 'none';
    rstSel.disabled = activeSel.disabled = rmodeSel.value === 'none';
    kindNote.textContent = st.kind === 'comb'
      ? 'Combinational: the outputs depend only on the present inputs (gates, multiplexers, adders, decoders…). Every output gets a default value, so no latch is made.'
      : 'Sequential: the outputs are registers that change at the rising edge of the clock (counters, shift registers, state machines…). The reset sets them to 0.';
  };
  [kindComb, kindSeq, rmodeSel].forEach(e => e.addEventListener('change', syncKind));
  // generics (VHDL generic / Verilog parameter), type integer
  const genTbl = h('table', { class: 'grid mw-generics' });
  const renderGen = () => {
    genTbl.innerHTML = '';
    genTbl.append(h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Type'), h('th', {}, 'Default value'), h('th', {}, 'Description'), h('th', {}, '')));
    generics.forEach((g, k) => {
      const nm = h('input', { type: 'text', class: 'mw-gname', value: g.name, style: { width: '100px' } });
      const dv = h('input', { type: 'text', class: 'mw-gdef', value: g.default, style: { width: '70px' } });
      const ds = h('input', { type: 'text', class: 'mw-gdesc', value: g.desc || '', placeholder: 'optional', style: { width: '100%', boxSizing: 'border-box' } });
      nm.addEventListener('input', () => { g.name = nm.value.trim(); });
      dv.addEventListener('input', () => { g.default = dv.value.trim(); });
      ds.addEventListener('input', () => { g.desc = ds.value; });
      genTbl.append(h('tr', {}, h('td', {}, nm), h('td', { 'data-no-i18n': '' }, 'integer'), h('td', {}, dv), h('td', { style: { width: '100%' } }, ds),
        h('td', {}, h('button', { class: 'tb-btn', html: icons.remove, title: 'Remove', onclick: () => { generics.splice(k, 1); renderGen(); } }))));
    });
  };
  renderGen();
  const p3 = {
    title: 'Kind of Logic',
    render: () => h('div', {},
      h('div', { style: { display: 'flex', gap: '18px' } },
        h('label', {}, kindComb, ' Combinational'), h('label', {}, kindSeq, ' Sequential (clocked)')),
      kindNote,
      h('div', { style: { marginTop: '8px' } }, combBox, seqBox),
      h('details', { class: 'mw-gen', style: { marginTop: '10px' }, open: generics.length > 0 },
        h('summary', {}, 'Generics (optional)'),
        h('div', { class: 'hint' }, 'Constants given when the module is used, e.g. a width (VHDL generic, Verilog parameter).'),
        genTbl,
        h('button', { class: 'btn', style: { marginTop: '4px' }, onclick: () => { generics.push({ name: generics.length ? `G${generics.length + 1}` : 'N', default: '8', desc: '' }); renderGen(); } }, 'Add Generic'))),
    onShow: () => {
      const g = guessClockReset(ports.map(p => ({ ...p, width: +p.width })));
      if (!st.touched) {
        st.touched = true;
        if (g.clock) { kindSeq.checked = true; kindComb.checked = false; }
        st.clock = g.clock; st.reset = g.reset; activeSel.value = g.active;
        rmodeSel.value = g.reset ? 'async' : 'none';
        st.enable = ports.find(p => p.dir === 'in' && +p.width === 1 && /^(en|enable|ce)$/i.test(p.name))?.name || '';
      }
      fillBits(clkSel, clkSel.value || st.clock, false);
      fillBits(rstSel, rstSel.value || st.reset, false);
      fillBits(enSel, enSel.value || st.enable, true);
      syncKind();
    },
    validate: () => {
      const err = pe.check(p1.name());
      if (err) return err;
      if (st.kind === 'seq') {
        if (!clkSel.value) return 'A sequential module needs a clock: add a 1-bit input (e.g. clk) on the previous page.';
        if (rmodeSel.value !== 'none' && !rstSel.value) return 'Choose the reset input, or No reset.';
        if (rmodeSel.value !== 'none' && rstSel.value === clkSel.value) return 'The clock and the reset must be different inputs.';
        if (enSel.value && (enSel.value === clkSel.value || (rmodeSel.value !== 'none' && enSel.value === rstSel.value))) return 'The enable must be an input other than the clock and the reset.';
      }
      const g = checkPorts([], { lang: p1.lang(), generics: generics.map(x => ({ ...x })) });
      if (g) return g;
      const clash = generics.find(x => ports.some(p => p.name.toLowerCase() === x.name.toLowerCase()) || x.name.toLowerCase() === p1.name().toLowerCase());
      if (clash) return `The generic '${clash.name}' has the name of a port or of the module.`;
      try { text(); } catch (e) { return e.message; }
      return null;
    },
  };
  const opts = () => ({
    name: p1.name(), lang: p1.lang(), arch: p1.archIn.value.trim() || 'rtl', description: p1.desc.value, project: S.project,
    ports: ports.map(p => ({ ...p, width: +p.width })), generics: generics.map(g => ({ ...g })),
    kind: st.kind, combStyle: styleSel.value,
    clock: clkSel.value, reset: { port: rstSel.value, mode: rmodeSel.value, active: activeSel.value }, enable: enSel.value,
  });
  const text = () => generateModule(opts());

  // ---- page 4: summary and preview
  const summary = h('pre', { class: 'mw-summary', style: PRE });
  const preview = h('pre', { class: 'mw-preview', style: { ...PRE, maxHeight: '240px', overflow: 'auto', whiteSpace: 'pre', marginTop: '6px' } });
  const pSum = {
    title: 'Summary',
    render: () => h('div', {}, summary, h('div', { style: { fontWeight: 'bold', marginTop: '8px' } }, 'Preview of the code:'), preview),
    onShow: () => {
      const o = opts();
      const ins = o.ports.filter(p => p.dir === 'in'), outs = o.ports.filter(p => p.dir === 'out');
      summary.textContent = [
        `The wizard will create ${p1.path()} (${o.lang === 'vhdl' ? 'VHDL' : 'Verilog'}) and open it.`,
        '',
        `Module: ${o.name}${o.lang === 'vhdl' ? ` (architecture ${o.arch})` : ''}`,
        `Inputs: ${ins.map(portText).join(', ') || 'none'}`,
        `Outputs: ${outs.map(portText).join(', ') || 'none'}`,
        o.kind === 'comb' ? `Logic: combinational (${o.combStyle === 'process' ? 'one process' : 'one assignment per output'})`
          : `Logic: sequential, clock ${o.clock}; ${o.reset.mode === 'none' ? 'no reset' : `${o.reset.mode === 'async' ? 'asynchronous' : 'synchronous'} reset ${o.reset.port} active ${o.reset.active === '1' ? 'high' : 'low'}`}${o.enable ? `; enable ${o.enable}` : ''}`,
        `Generics: ${o.generics.map(g => `${g.name} = ${g.default}`).join(', ') || 'none'}`,
      ].join('\n');
      try { preview.textContent = text(); } catch (e) { preview.textContent = e.message; }
    },
    validate: async () => {
      const g = await guard(p1.path());
      if (g) return g;
      try { text(); } catch (e) { return e.message; }
      return null;
    },
  };

  const ok = await wizard('Module Wizard', [p1.page, p2, p3, pSum], { width: 820 });
  if (!ok) return;
  let code;
  try { code = text(); } catch (e) { return alertDlg('Module Wizard', e.message, 'error'); }
  const path = p1.path();
  await closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, code);   // registers the new file in silinx.json
  await app.reloadProject();
  app.log(`Module Wizard: created ${path} (${p1.lang() === 'vhdl' ? 'VHDL' : 'Verilog'}, ${st.kind === 'seq' ? 'sequential' : 'combinational'}). Fill in the TODO comments with the logic.`, 'ok');
  toast(`Module ${p1.name()} created`, 'ok');
  app.openFile(path);
}

// ---------------------------------------------------------------- Schematic (Wizard)
export async function schematicWizard({ name = '', location = 'src', lang = null } = {}) {
  const guard = replaceGuard('Schematic Wizard');
  if (!S.project) return;
  const L = lang || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const p1 = namePage({ title: 'Name and Language', name, lang: L, loc: location, sch: true, guard });
  const ports = [];
  const clkChk = h('input', { type: 'checkbox', class: 'mw-clkchk' });
  const clkName = h('input', { type: 'text', class: 'mw-clkname', value: 'clk', style: { width: '100px' } });
  const syncClk = () => { clkName.disabled = !clkChk.checked; };
  clkChk.addEventListener('change', syncClk);
  syncClk();
  const pe = portEditor(ports, { lang: p1.lang });
  const clockOf = () => (clkChk.checked ? clkName.value.trim() : null);
  const doc = () => schematicFromPorts({ name: p1.name(), lang: p1.lang(), description: p1.desc.value, ports: ports.map(p => ({ ...p, width: +p.width })), clock: clockOf() });
  const p2 = {
    title: 'Inputs and Outputs',
    render: () => h('div', {}, pe.node,
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        h('label', {}, clkChk, ' Clock input:'), clkName)),
    validate: () => {
      if (!ports.length && !clockOf()) return 'Add at least one input or output.';
      const err = pe.check(p1.name());
      if (err) return err;
      try { doc(); } catch (e) { return e.message; }
      return null;
    },
  };
  const summary = h('pre', { class: 'mw-summary', style: PRE });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const d = doc();
      const ins = d.ports.filter(p => p.dir === 'in'), outs = d.ports.filter(p => p.dir === 'out');
      summary.textContent = [
        `The wizard will create the schematic ${p1.path()} and open it in the schematic editor.`,
        '',
        `Module: ${d.name} (synchronized HDL: ${d.lang === 'vhdl' ? 'VHDL' : 'Verilog'})`,
        `Input markers (left edge): ${ins.map(portText).join(', ') || 'none'}`,
        `Output markers (right edge): ${outs.map(portText).join(', ') || 'none'}`,
        `Clock input: ${clockOf() || 'none'}`,
        '',
        'Then place the symbols in the middle of the sheet and wire them to the markers.',
      ].join('\n');
    },
    validate: () => guard(p1.path()),
  };
  const ok = await wizard('Schematic Wizard', [p1.page, p2, pSum], { width: 820 });
  if (!ok) return;
  let d;
  try { d = doc(); } catch (e) { return alertDlg('Schematic Wizard', e.message, 'error'); }
  const path = p1.path();
  await closeBeforeReplace(path);
  await api.writeFile(S.project.name, path, JSON.stringify(d, null, 1));
  await app.reloadProject();
  app.log(`Schematic Wizard: created ${path} with ${d.ports.length} I/O marker(s).`, 'ok');
  toast(`Schematic ${d.name} created`, 'ok');
  app.openSch(path);
}

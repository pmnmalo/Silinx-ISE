// Beginner wizards of the New Source dialog (the Wizard > button of the types 'Module (HDL)' and 'Schematic', #958):
// they ask the name and the location on their first page, left out when New Source opens them (its name, #2082).
//
//   moduleWizard:    name, language and description -> inputs, outputs and bidirectional (inout,
//                    tri-state) ports (a friendly table, only the user's own ports, #2145) -> kind of logic
//                    (combinational / sequential with clock,
//                    reset and enable; generics) -> summary with a preview of the code.
//   schematicWizard: name, language and description -> inputs and outputs (the same table, empty,
//                    #950) -> summary; it creates a
//                    .sch.json with the I/O markers placed.
// Generators: core/modgen.js.
import { api } from './api.js';
import { icons } from './icons.js';
import { h, alertDlg, toast } from './ui.js';
import { generateModule, schematicFromPorts, checkPorts, identError, guessClockReset, MAX_WIDTH } from '/core/modgen.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace, moduleElsewhere, drawnHdlTaken } from './wizards.js';
import { S, app } from './app.js';
import { cleanLoc, portText, namedPages } from './wizard-util.js';

const LANGS = [['vhdl', 'VHDL'], ['verilog', 'Verilog']];
const extOf = (lang, sch) => (sch ? '.sch.json' : lang === 'verilog' ? '.v' : '.vhd');

// ---------------------------------------------------------------- page 1: name, language, description
/** The first page: the name, the language, the location (the file), a description. Also the Petri Net Wizard's (web/js/petri-wizard.js: ext, hint, nameLabel). */
export function namePage({ title, name, lang, loc, sch, withArch, guard, ext = null, hint = null, nameLabel = null }) {
  const nameIn = h('input', { type: 'text', class: 'mw-name', value: name || '' });
  const langSel = select(LANGS, lang);
  const archIn = h('input', { type: 'text', class: 'mw-arch', value: 'rtl' });
  const archLbl = h('label', {}, 'Architecture name:');
  const desc = h('textarea', { class: 'mw-desc', rows: 3, style: { width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }, placeholder: 'What the module does (it goes into the header comment)' });
  const fileHint = h('span', { class: 'mw-file', 'data-no-i18n': '' });
  const locIn = h('input', { type: 'text', class: 'mw-loc', value: cleanLoc(loc) });
  const path = () => `${cleanLoc(locIn.value)}/${nameIn.value.trim()}${ext ?? extOf(langSel.value, sch)}`;
  const sync = () => {
    fileHint.textContent = path();
    if (withArch) archLbl.style.display = archIn.style.display = langSel.value === 'vhdl' ? '' : 'none';
  };
  nameIn.addEventListener('input', sync);
  locIn.addEventListener('input', sync);
  langSel.addEventListener('change', sync);
  const page = {
    title,
    render: () => h('div', {},
      h('div', { class: 'hint' }, hint || (sch
        ? 'The wizard creates a schematic with an I/O marker for each input and output, ready for you to place the symbols and wire them.'
        : 'The wizard writes a commented skeleton of the module: its inputs and outputs, and a template of the logic (combinational or sequential).')),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field(nameLabel || (sch ? 'Schematic (module) name:' : 'Module name:'), nameIn), ...field('Language:', langSel),
        ...(withArch ? [archLbl, archIn] : []),
        ...field('Location:', locIn), ...field('File:', fileHint)),
      h('label', { style: { display: 'block', marginTop: '10px' } }, 'Description (optional):'), desc),
    onShow: sync,
    validate: () => {
      const n = nameIn.value.trim();
      const e = identError(n, langSel.value);
      if (e) return `Name: ${e}.`;
      if (!/^[A-Za-z0-9_/-]+$/.test(locIn.value.trim())) return 'Invalid location.';
      if (withArch && langSel.value === 'vhdl') { const a = identError(archIn.value.trim(), 'vhdl'); if (a) return `Architecture name: ${a}.`; }
      const other = moduleElsewhere(n, path());
      if (other) return `A module named '${n}' already exists.`;
      const taken = drawnHdlTaken(path(), n, langSel.value);   // (a drawing: its HDL file free, #230)
      if (taken) return taken;
      return guard(path());
    },
  };
  sync();
  // opened by New Source (#2082): the architecture's name and the description at the end of the first page left
  const tail = () => h('div', { style: { marginTop: '10px' } },
    withArch ? h('div', { class: 'form-grid' }, archLbl, archIn) : '',
    h('label', { style: { display: 'block', marginTop: '10px' } }, 'Description (optional):'), desc);
  return { page, tail, nameIn, langSel, archIn, desc, path, lang: () => langSel.value, name: () => nameIn.value.trim() };
}

// ---------------------------------------------------------------- the friendly port table
/** The table of the ports, only the user's own (no quick-add buttons, #950, #2082, #2145; dirs: the directions offered, the Petri Net, FSM and ASM wizards: in and out only). */
export function portEditor(ports, { lang, onChange = () => {}, dirs = ['in', 'out', 'inout'] }) {
  const tbl = h('table', { class: 'grid mw-ports' });
  const has = n => ports.some(p => p.name.toLowerCase() === n.toLowerCase());
  const add = p => { ports.push({ name: p.name, dir: p.dir, width: p.width, desc: p.desc || '' }); render(); onChange(); };
  const render = () => {
    tbl.innerHTML = '';
    tbl.append(h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Direction'), h('th', { title: '1 = a single bit; N = a bus of N bits (N-1 downto 0)' }, 'Width (bits)'), h('th', {}, 'Description'), h('th', {}, '')));
    ports.forEach((p, k) => {
      const nm = h('input', { type: 'text', class: 'mw-pname', value: p.name, style: { width: '110px' } });
      const dir = select([['in', 'input'], ['out', 'output'], ['inout', 'bidirectional']].filter(([d]) => dirs.includes(d)), p.dir);
      dir.classList.add('mw-pdir');
      dir.style.minWidth = '115px';   // room for 'bidirectional' / 'bidirecional'
      dir.title = 'bidirectional = inout: a tri-state port the module can drive or release (Z), and read';
      const w = h('input', { type: 'number', class: 'mw-pwidth', min: 1, max: MAX_WIDTH, value: p.width, style: { width: '60px' } });
      const ds = h('input', { type: 'text', class: 'mw-pdesc', value: p.desc || '', placeholder: 'optional', style: { width: '100%', boxSizing: 'border-box' } });
      const bits = h('span', { class: 'hint mw-pbits', 'data-no-i18n': '', style: { marginLeft: '4px' } });
      const syncBits = () => { const n = +w.value; bits.textContent = Number.isInteger(n) && n > 1 ? `(${n - 1}:0)` : ''; };   // (as the symbols show it, #1995)
      syncBits();
      nm.addEventListener('input', () => { p.name = nm.value.trim(); onChange(); });
      dir.addEventListener('change', () => { p.dir = dir.value; onChange(); });
      w.addEventListener('input', () => { p.width = w.value === '' ? '' : +w.value; syncBits(); onChange(); });
      ds.addEventListener('input', () => { p.desc = ds.value; });
      const del = h('button', { class: 'tb-btn mw-pdel', html: icons.remove, title: 'Remove', onclick: () => { ports.splice(k, 1); render(); onChange(); } });
      tbl.append(h('tr', {}, h('td', {}, nm), h('td', {}, dir), h('td', { style: { whiteSpace: 'nowrap' } }, w, bits), h('td', { style: { width: '100%' } }, ds), h('td', {}, del)));
    });
    if (!ports.length) tbl.append(h('tr', {}, h('td', { colspan: 5, class: 'hint', style: { padding: '8px' } }, 'No ports yet: use Add Port.')));
  };
  const addBtn = h('button', { class: 'btn mw-add', onclick: () => {
    let k = ports.length + 1;
    while (has(`p${k}`)) k++;
    add({ name: `p${k}`, dir: 'in', width: 1 });
    tbl.querySelectorAll('.mw-pname')[ports.length - 1]?.select();
  } }, 'Add Port');
  render();
  const node = h('div', {},
    h('div', { class: 'hint' }, dirs.includes('inout')
      ? 'One row per input, output or bidirectional (inout) port. Width 1 is a single bit (std_logic / wire); a width N makes a bus of N bits, numbered N-1 downto 0.'
      : 'One row per input or output port. Width 1 is a single bit (std_logic / wire); a width N makes a bus of N bits, numbered N-1 downto 0.'),
    h('div', { style: { marginTop: '6px', maxHeight: '230px', overflow: 'auto', border: '1px solid var(--frame)' } }, tbl),
    h('div', { style: { marginTop: '6px' } }, addBtn));
  const check = name => {
    const bad = ports.find(p => p.width === '' || !Number.isInteger(+p.width));
    if (bad) return `Port '${bad.name}': the width must be a whole number from 1 to ${MAX_WIDTH}.`;
    return checkPorts(ports.map(p => ({ ...p, width: +p.width })), { lang: lang(), name });
  };
  return { node, render, check };
}

// ---------------------------------------------------------------- Module Wizard
export async function moduleWizard({ name = '', location = 'src', lang = null, named = false, back = null } = {}) {
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
  const summary = h('pre', { class: 'mw-summary code-box' });
  const preview = h('pre', { class: 'mw-preview code-box', style: { maxHeight: '240px', overflow: 'auto', whiteSpace: 'pre', marginTop: '6px' } });
  const pSum = {
    title: 'Summary',
    render: () => h('div', {}, summary, h('div', { style: { fontWeight: 'bold', marginTop: '8px' } }, 'Preview of the code:'), preview),
    onShow: () => {
      const o = opts();
      const ins = o.ports.filter(p => p.dir === 'in'), outs = o.ports.filter(p => p.dir === 'out'), ios = o.ports.filter(p => p.dir === 'inout');
      summary.textContent = [
        `The wizard will create ${p1.path()} (${o.lang === 'vhdl' ? 'VHDL' : 'Verilog'}) and open it.`,
        '',
        `Module: ${o.name}${o.lang === 'vhdl' ? ` (architecture ${o.arch})` : ''}`,
        `Inputs: ${ins.map(portText).join(', ') || 'none'}`,
        `Outputs: ${outs.map(portText).join(', ') || 'none'}`,
        ...(ios.length ? [`Bidirectional (inout, tri-state): ${ios.map(portText).join(', ')}; each one gets an output enable ${ios.map(p => `${p.name}_oe`).join(', ')}`] : []),
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

  const ok = await wizard('Module Wizard', namedPages(p1.page, [p1.page, p2, p3, pSum], named, p1.tail), { width: 820, back });
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

// ---------------------------------------------------------------- Schematic Wizard
export async function schematicWizard({ name = '', location = 'src', lang = null, named = false, back = null } = {}) {
  const guard = replaceGuard('Schematic Wizard');
  if (!S.project) return;
  const L = lang || (S.project.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const p1 = namePage({ title: 'Name and Language', name, lang: L, loc: location, sch: true, guard });
  // the table starts empty, no suggested ports (#950); no ports at all is a schematic with no markers yet
  const ports = [];
  const pe = portEditor(ports, { lang: p1.lang });
  const doc = () => schematicFromPorts({ name: p1.name(), lang: p1.lang(), description: p1.desc.value, ports: ports.map(p => ({ ...p, width: +p.width })) });
  const p2 = {
    title: 'Inputs and Outputs',
    render: () => pe.node,
    validate: () => {
      const err = pe.check(p1.name());
      if (err) return err;
      try { doc(); } catch (e) { return e.message; }
      return null;
    },
  };
  const summary = h('pre', { class: 'mw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const d = doc();
      const ins = d.ports.filter(p => p.dir === 'in'), outs = d.ports.filter(p => p.dir === 'out'), ios = d.ports.filter(p => p.dir === 'inout');
      summary.textContent = [
        `The wizard will create the schematic ${p1.path()} and open it in the schematic editor.`,
        '',
        `Module: ${d.name} (its HDL: ${d.lang === 'vhdl' ? 'VHDL' : 'Verilog'})`,
        `Input markers (left edge): ${ins.map(portText).join(', ') || 'none'}`,
        `Output markers (right edge): ${outs.map(portText).join(', ') || 'none'}`,
        ...(ios.length ? [`Bidirectional markers (right edge, below the outputs): ${ios.map(portText).join(', ')}`] : []),
        '',
        'Then place the symbols in the middle of the sheet and wire them to the markers.',
      ].join('\n');
    },
    validate: () => guard(p1.path()),
  };
  const ok = await wizard('Schematic Wizard', namedPages(p1.page, [p1.page, p2, pSum], named, p1.tail), { width: 820, back });
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

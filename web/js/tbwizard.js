// Test Bench Wizard: a self-checking test bench for a module of the project. The user chooses the
// unit under test, its clock / reset, how the input vectors are made (every combination, random,
// counting, walking ones/zeros or typed in), and the expected outputs of each vector: typed in,
// or filled in from a simulation of the current design (a regression test). Bidirectional (inout)
// ports have two columns: what the bench drives on the bus (a value, or Z / empty = released so
// that the design drives it) and the value expected on the bus. Generator: core/testbench.js.
import { api } from './api.js';
import { h, alertDlg, toast } from './ui.js';
import { compile, elaborate, simulate } from '/core/compile.js';
import { clocksOf } from '/core/schematic.js';
import { tbPorts, guessClockReset, makeVectors, parseValue, parseDrive, showValue, generateTestbench, expectedFromTrace, MAX_VECTORS } from '/core/testbench.js';
import { wizard, field, select } from './wizards.js';
import { S, app } from './app.js';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const SHOWN_ROWS = 512;   // rows of the vector table shown at once (the rest is kept, not displayed)

const designSources = () => S.sources.filter(s => s.role === 'design' && (s.lang === 'vhdl' || s.lang === 'verilog'));

export async function testBenchWizard({ module, name = null, location = null, lang: langPick = null } = {}) {
  if (!S.project) return;
  await app.saveAll?.();
  const mods = S.modules.filter(m => m.role === 'design' && m.kind !== 'package');
  if (!mods.length) return alertDlg('Test Bench Wizard', 'The project has no design modules to test.', 'error');
  let uut = mods.find(m => m.name === module) || mods.find(m => m.name === S.project.top) || mods[0];

  // ---------------------------------------------------------------- state
  let ports = [], ins = [], outs = [], ios = [], clockSigs = new Set();
  let rows = [];          // [{ in: { port: text }, drv: { port: text }, exp: { port: text } }] as typed in the table
  const st = { clock: '', period: 20, reset: '', active: '1', cycles: 2, settle: 10, mode: 'exhaustive', count: 32, seed: 1 };

  const analyse = () => {
    const lib = compile(designSources());
    const design = elaborate(lib, uut.name);
    if (!design.top) throw new Error(`'${uut.name}' cannot be elaborated: ${[...lib.errors, ...design.diags].filter(d => d.severity === 'error').slice(0, 3).map(d => d.message).join('; ')}`);
    const types = Object.fromEntries((uut.portList || []).map(p => [p.name, p.type]));
    ports = tbPorts(design, types);
    clockSigs = new Set();
    const visit = inst => { for (const pr of inst.procs || []) for (const c of clocksOf(pr).clocks) clockSigs.add(c); (inst.children || []).forEach(visit); };
    visit(design.top);
    const clkNames = new Set(design.top.ports.filter(p => clockSigs.has(p.sig)).map(p => p.name));
    const g = guessClockReset(ports, clkNames);
    st.clock = g.clock || ''; st.reset = g.reset || ''; st.active = g.resetActive;
    // a design with no clocked logic is tested as combinational
    if (!clockSigs.size && !clkNames.size) st.clock = '';
  };
  const splitPorts = () => {
    const special = new Set([st.clock, st.reset].filter(Boolean));
    ins = ports.filter(p => p.dir === 'in' && !special.has(p.name));
    outs = ports.filter(p => p.dir === 'out');
    ios = ports.filter(p => p.dir === 'inout');
  };
  // bits of the generated stimulus: the inputs and the bidirectional ports (driven like inputs)
  const totalBits = () => [...ins, ...ios].reduce((n, p) => n + p.width, 0);
  // vectors of the exhaustive test: each combination, followed by a read vector when there are inout ports
  const exhaustiveCount = () => 2 ** totalBits() * (ios.length ? 2 : 1);
  const chk = () => [...outs, ...ios];   // what is checked: the outputs and the bidirectional buses

  // ---------------------------------------------------------------- page 1: unit under test
  const modSel = select(mods.map(m => [m.name, `${m.name} (${m.file})`]), uut.name);
  const tbName = h('input', { type: 'text', value: name || `tb_${uut.name}` });
  const lang = select([['vhdl', 'VHDL'], ['verilog', 'Verilog']], langPick || S.project.preferredLanguage || uut.lang || 'vhdl');
  const loc = h('input', { type: 'text', value: location || 'sim' });
  modSel.addEventListener('change', () => {
    const was = `tb_${uut.name}`;
    uut = mods.find(m => m.name === modSel.value);
    if (tbName.value === was) tbName.value = `tb_${uut.name}`;
    rows = [];
  });
  const p1 = {
    title: 'Unit Under Test',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'The wizard writes a self-checking test bench: it applies input vectors to the module and compares its outputs with the expected values, reporting each mismatch and TEST PASSED / TEST FAILED at the end.'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('Module to test:', modSel), ...field('Test bench name:', tbName), ...field('Language:', lang), ...field('Location:', loc))),
    validate: () => {
      if (!NAME_RE.test(tbName.value.trim())) return 'Enter a valid test bench name (a letter, then letters, digits and _).';
      if (S.modules.some(m => m.name.toLowerCase() === tbName.value.trim().toLowerCase())) return `A module named '${tbName.value.trim()}' already exists.`;
      if (!/^[A-Za-z0-9_/-]+$/.test(loc.value.trim())) return 'Invalid location.';
      const path = `${loc.value.trim().replace(/\/+$/, '')}/${tbName.value.trim()}.${lang.value === 'vhdl' ? 'vhd' : 'v'}`;
      if (S.fileTree.includes(path)) return `${path} already exists.`;
      try { analyse(); } catch (e) { return e.message; }
      const bad = ports.filter(p => p.kind === 'other' || (p.dir === 'inout' && p.kind === 'int'));
      if (bad.length) return `The wizard cannot drive these ports: ${bad.map(p => `${p.name} (type)`).join(', ')}.`;
      return null;
    },
  };

  // ---------------------------------------------------------------- page 2: clock and reset
  const clkSel = h('select'), rstSel = h('select');
  const period = h('input', { type: 'number', min: 2, value: st.period, style: { width: '90px' } });
  const active = select([['1', "active high ('1')"], ['0', "active low ('0')"]], st.active);
  const cycles = h('input', { type: 'number', min: 1, max: 100, value: st.cycles, style: { width: '90px' } });
  const settle = h('input', { type: 'number', min: 1, value: st.settle, style: { width: '90px' } });
  const kindNote = h('div', { class: 'hint', style: { marginTop: '10px' } });
  const fillPortSelect = (sel, value) => {
    sel.innerHTML = '';
    sel.append(h('option', { value: '' }, '(none)'));
    for (const p of ports.filter(x => x.dir === 'in' && x.kind === 'sl')) sel.append(h('option', { value: p.name, selected: p.name === value }, p.name));
  };
  const syncKind = () => {
    kindNote.textContent = clkSel.value
      ? `Sequential test: inputs change at the falling edge of ${clkSel.value}, the design reacts at the rising edge, and the outputs are checked at the next falling edge (one vector per clock cycle).`
      : 'Combinational test: each vector is applied, and the outputs are checked after the settling time.';
    period.disabled = !clkSel.value;
    settle.disabled = !!clkSel.value;
    active.disabled = cycles.disabled = !rstSel.value;
  };
  [clkSel, rstSel].forEach(e => e.addEventListener('change', () => { syncKind(); rows = []; }));
  const p2 = {
    title: 'Clock and Reset',
    render: () => h('div', {},
      h('div', { class: 'form-grid' },
        ...field('Clock port:', clkSel), ...field('Clock period (ns):', period),
        ...field('Reset port:', rstSel), ...field('Reset level:', active), ...field('Reset for (clock cycles):', cycles),
        ...field('Settling time (ns):', settle)),
      kindNote),
    onShow: () => { fillPortSelect(clkSel, st.clock); fillPortSelect(rstSel, st.reset); active.value = st.active; syncKind(); },
    validate: () => {
      if (clkSel.value && clkSel.value === rstSel.value) return 'The clock and the reset must be different ports.';
      if (clkSel.value && !(+period.value >= 2)) return 'The clock period must be at least 2 ns.';
      if (!clkSel.value && !(+settle.value >= 1)) return 'The settling time must be at least 1 ns.';
      Object.assign(st, { clock: clkSel.value, reset: rstSel.value, period: +period.value, active: active.value, cycles: Math.max(1, +cycles.value || 1), settle: +settle.value });
      splitPorts();
      return null;
    },
  };

  // ---------------------------------------------------------------- page 3: stimulus
  const modeBox = h('div', { class: 'tbw-modes' });
  const count = h('input', { type: 'number', min: 1, max: MAX_VECTORS, value: st.count, style: { width: '90px' } });
  const seed = h('input', { type: 'number', value: st.seed, style: { width: '90px' } });
  const stimNote = h('div', { class: 'hint', style: { marginTop: '8px' } });
  const MODES = [
    ['exhaustive', 'Every combination of the inputs (exhaustive test)'],
    ['random', 'Random vectors'],
    ['count', 'Counting (all inputs as one number: 0, 1, 2, …)'],
    ['walking', 'Walking ones and zeros (all 0, all 1, then one bit at a time)'],
    ['manual', 'I will type the vectors in (starts with one empty vector)'],
  ];
  const renderModes = () => {
    modeBox.innerHTML = '';
    const n = totalBits();
    const nv = exhaustiveCount();
    for (const [id, label] of MODES) {
      const dis = id === 'exhaustive' && nv > MAX_VECTORS;
      const r = h('input', { type: 'radio', name: 'tbw-mode', value: id, checked: st.mode === id, disabled: dis });
      r.addEventListener('change', () => { st.mode = id; rows = []; syncStim(); });
      modeBox.append(h('label', { class: 'tbw-mode', style: { display: 'block', margin: '4px 0', color: dis ? '#999' : '' } }, r, ` ${label}`,
        id === 'exhaustive' ? h('span', { class: 'hint' }, ` — ${n} input bit(s): ${nv > MAX_VECTORS ? `${nv} vectors, more than ${MAX_VECTORS}` : `${nv} vector(s)`}`) : null));
    }
  };
  const syncStim = () => {
    count.disabled = !['random', 'count'].includes(st.mode);
    seed.disabled = st.mode !== 'random';
    stimNote.textContent = `Inputs (${ins.length ? ins.map(p => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ') : 'none'})${st.clock ? `; ${st.clock} is the clock` : ''}${st.reset ? `; ${st.reset} is the reset (applied first)` : ''}. Outputs checked: ${outs.map(p => p.name).join(', ') || 'none'}.`;
    ioNote.textContent = ios.length ? `Bidirectional ports (${ios.map(p => `${p.name}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ')}): the generated vectors come in pairs: the bench first drives the port like an input, then releases it (Z) with the same inputs, so that the design can drive the bus; the value on the bus is checked in both. You can change any row on the next page.` : '';
    ioNote.style.display = ios.length ? '' : 'none';
  };
  const ioNote = h('div', { class: 'hint tbw-ionote', style: { marginTop: '6px' } });
  [count, seed].forEach(e => e.addEventListener('change', () => { rows = []; }));
  const p3 = {
    title: 'Input Vectors',
    render: () => h('div', {}, modeBox,
      h('div', { class: 'form-grid', style: { marginTop: '8px' } }, ...field('Number of vectors:', count), ...field('Random seed:', seed)), stimNote, ioNote),
    onShow: () => {
      if (st.mode === 'exhaustive' && exhaustiveCount() > MAX_VECTORS) st.mode = 'random';
      renderModes(); syncStim();
    },
    validate: () => {
      st.count = Math.max(1, Math.min(MAX_VECTORS, +count.value || 1)); st.seed = +seed.value || 1;
      if (!rows.length) {
        try {
          rows = st.mode === 'manual' ? [{ in: {}, drv: {}, exp: {} }] : makeVectors([...ins, ...ios], { mode: st.mode, count: st.count, seed: st.seed })
            .map(v => ({ in: { ...v.in }, drv: Object.fromEntries(ios.map(p => [p.name, /Z/.test(v.drv?.[p.name] || 'Z') ? 'Z' : showValue(v.drv[p.name], p.width)])), exp: {} }));
        } catch (e) { return e.message; }
      }
      return null;
    },
  };

  // ---------------------------------------------------------------- page 4: vectors and expected values
  const tblHost = h('div', { class: 'tbw-table', style: { maxHeight: '330px', overflow: 'auto', border: '1px solid #ccc', marginTop: '6px' } });
  const vecNote = h('div', { class: 'hint' });
  const busy = h('span', { class: 'hint', style: { marginLeft: '8px' } });
  const isZ = t => !String(t ?? '').trim() || /^z+$/i.test(String(t).trim());
  const cell = (row, side, p) => {
    row[side] ||= {};
    const inp = h('input', { type: 'text', class: `tbw-cell tbw-${side}`, 'data-port': p.name, value: row[side][p.name] ?? '', placeholder: side === 'exp' ? '–' : side === 'drv' ? 'Z' : '0'.repeat(Math.min(p.width, 8)), style: { width: `${Math.max(3, Math.min(p.width, 16)) + 2}ch`, fontFamily: 'var(--mono, monospace)' } });
    // a released bidirectional port (Z / empty): the design drives the bus in this vector
    const tint = () => { if (side === 'drv') inp.style.background = isZ(inp.value) ? '#e8f0ff' : '#fff6dd'; };
    tint();
    inp.addEventListener('input', () => { row[side][p.name] = inp.value; inp.classList.remove('bad'); tint(); });
    return inp;
  };
  const renderTable = () => {
    tblHost.innerHTML = '';
    const t = h('table', { class: 'grid' });
    t.append(h('tr', {}, h('th', {}, '#'), ...ins.map(p => h('th', { title: 'input' }, p.name)),
      ...ios.map(p => h('th', { title: 'bidirectional: the value the bench drives on the bus; Z or empty = released (the design drives it)', style: { background: '#fff6dd' } }, `${p.name} (drive)`)),
      ...outs.map(p => h('th', { title: 'expected output', style: { background: '#eef4ff' } }, `${p.name} (expected)`)),
      ...ios.map(p => h('th', { title: 'bidirectional: the value expected on the bus', style: { background: '#eef4ff' } }, `${p.name} (expected)`)), h('th', {}, '')));
    rows.slice(0, SHOWN_ROWS).forEach((row, k) => {
      const del = h('button', { class: 'tb-btn', title: 'Delete this vector', onclick: () => { rows.splice(k, 1); renderTable(); } }, '×');
      t.append(h('tr', {}, h('td', {}, String(k)), ...ins.map(p => h('td', {}, cell(row, 'in', p))), ...ios.map(p => h('td', {}, cell(row, 'drv', p))),
        ...chk().map(p => h('td', {}, cell(row, 'exp', p))), h('td', {}, del)));
    });
    tblHost.append(t);
    const nexp = rows.filter(r => chk().some(p => String(r.exp[p.name] ?? '').trim())).length;
    vecNote.textContent = `${rows.length} vector(s)${rows.length > SHOWN_ROWS ? ` (the first ${SHOWN_ROWS} shown)` : ''}, ${nexp} with expected values. Values: binary 0101, hex 0x1F, decimal d12 (or 12: only 0s and 1s read as binary); - or x = bit not checked; an empty expected value is not checked.`;
    ioHint.textContent = ios.length ? 'Bidirectional ports: the drive column is the value the bench puts on the bus (it drives it like an input); Z or empty releases the bus, so that the design can drive it. The expected column is the value read on the bus, checked like an output.' : '';
    ioHint.style.display = ios.length ? '' : 'none';
  };
  const ioHint = h('div', { class: 'hint tbw-iohint' });
  // the vectors as bits; throws with the first bad cell
  const vectorsBits = ({ withExp = true } = {}) => rows.map((r, k) => {
    const v = { in: {}, exp: {} };
    for (const p of ins) {
      let b;
      try { b = parseValue(r.in[p.name], p.width); } catch (e) { throw new Error(`vector ${k}, input ${p.name}: ${e.message}`); }
      if (b != null && /-/.test(b)) throw new Error(`vector ${k}, input ${p.name}: an input cannot be '-'`);
      v.in[p.name] = b ?? '0'.repeat(p.width);
    }
    v.drv = {};
    for (const p of ios) {
      try { v.drv[p.name] = parseDrive(r.drv?.[p.name], p.width); } catch (e) { throw new Error(`vector ${k}, ${p.name} (drive): ${e.message}`); }
    }
    if (withExp) {
      for (const p of chk()) {
        try { v.exp[p.name] = parseValue(r.exp[p.name], p.width); } catch (e) { throw new Error(`vector ${k}, expected ${p.name}: ${e.message}`); }
      }
    }
    return v;
  });
  const tbOpts = (vectors, extra = {}) => ({
    name: tbName.value.trim(), lang: lang.value, uut: { name: uut.name, params: [] }, ports, vectors,
    clock: st.clock ? { port: st.clock, periodNs: st.period } : null,
    reset: st.reset ? { port: st.reset, active: st.active, cycles: st.cycles } : null,
    settleNs: st.settle, ...extra,
  });
  // expected values = what the current design does (a regression test)
  const fillFromDesign = async () => {
    let vectors;
    try { vectors = vectorsBits({ withExp: false }); } catch (e) { return alertDlg('Test Bench Wizard', e.message, 'error'); }
    busy.textContent = 'Simulating the current design…';
    await new Promise(r => setTimeout(r, 20));
    try {
      const name = `${tbName.value.trim()}_trace`;
      const text = generateTestbench(tbOpts(vectors, { name, trace: true }));
      const tb = { path: `${name}.${lang.value === 'vhdl' ? 'vhd' : 'v'}`, lang: lang.value, text };
      const r = simulate([...designSources(), tb], name, { until: 1e15 });
      if (r.errors.length) throw new Error(r.errors.slice(0, 3).map(e => `${e.file}:${e.line} ${e.message}`).join('\n'));
      const exp = expectedFromTrace(r.sim.log.map(l => l.text), chk(), rows.length);
      if (exp.some(e => !e)) throw new Error('the simulation did not reach every vector');
      rows.forEach((row, k) => { for (const p of chk()) row.exp[p.name] = showValue(exp[k][p.name], p.width); });
      busy.textContent = 'Expected values filled in from the current design: check them!';
      renderTable();
    } catch (e) {
      busy.textContent = '';
      alertDlg('Test Bench Wizard', `Cannot simulate the design: ${e.message}`, 'error');
    }
  };
  const p4 = {
    title: 'Vectors and Expected Outputs',
    render: () => h('div', {},
      h('div', { class: 'hint' }, 'One row per test vector: the inputs to apply and the outputs expected. Fill the expected values in by hand (what the design should do), or take them from a simulation of the current design (it then becomes a regression test: check them).'),
      h('div', { style: { marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { class: 'btn', onclick: () => fillFromDesign() }, 'Fill Expected from Current Design'),
        h('button', { class: 'btn', onclick: () => { rows.forEach(r => { r.exp = {}; }); busy.textContent = ''; renderTable(); } }, 'Clear Expected'),
        h('button', { class: 'btn', onclick: () => { if (rows.length < MAX_VECTORS) { rows.push({ in: {}, drv: {}, exp: {} }); renderTable(); tblHost.scrollTop = tblHost.scrollHeight; } } }, 'Add Vector'),
        busy),
      tblHost, vecNote, ioHint),
    onShow: () => renderTable(),
    validate: () => {
      if (!rows.length) return 'Add at least one vector.';
      try { vectorsBits(); } catch (e) { return e.message; }
      return null;
    },
  };

  // ---------------------------------------------------------------- page 5: summary
  const summary = h('pre', { style: { background: '#fff', border: '1px solid #ccc', padding: '10px', fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap' } });
  const path = () => `${loc.value.trim().replace(/\/+$/, '')}/${tbName.value.trim()}.${lang.value === 'vhdl' ? 'vhd' : 'v'}`;
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      const v = vectorsBits();
      const nexp = v.filter(x => chk().some(p => x.exp[p.name] && /[01]/.test(x.exp[p.name]))).length;
      const nrel = v.filter(x => ios.some(p => /Z/.test(x.drv[p.name]))).length;
      summary.textContent = [
        `The wizard will create the test bench ${path()} (${lang.value === 'vhdl' ? 'VHDL' : 'Verilog'}) and make it the simulation top.`,
        '',
        `Unit under test: ${uut.name}`,
        st.clock ? `Clock: ${st.clock}, ${st.period} ns (sequential test, one vector per clock cycle)` : `Combinational test, settling time ${st.settle} ns`,
        st.reset ? `Reset: ${st.reset}, active '${st.active}' for ${st.cycles} ${st.clock ? 'clock cycle(s)' : 'x 10 ns'}` : 'Reset: none',
        `Vectors: ${v.length} (${MODES.find(m => m[0] === st.mode)?.[1] || st.mode})`,
        `Expected values: ${nexp ? `${nexp} vector(s) checked` : 'none (the outputs are only reported)'}`,
        ...(ios.length ? [`Bidirectional ports: ${ios.map(p => p.name).join(', ')} (driven by the bench in ${v.length - nrel} vector(s), released in ${nrel})`] : []),
        '',
        'Run it with Simulate Behavioral Model: the console shows each mismatch and TEST PASSED / TEST FAILED.',
      ].join('\n');
    },
  };

  const ok = await wizard('Test Bench Wizard', [p1, p2, p3, p4, pSum], { width: 820 });
  if (!ok) return;
  let text;
  try { text = generateTestbench(tbOpts(vectorsBits())); } catch (e) { return alertDlg('Test Bench Wizard', e.message, 'error'); }
  const pj = S.project;
  await api.writeFile(pj.name, path(), text);   // registers the file (role: simulation)
  await app.reloadProject();
  await app.setTop(tbName.value.trim(), true);
  app.log(`Test Bench Wizard: created ${path()} (${rows.length} vector(s)) for '${uut.name}', now the simulation top. Run Simulate Behavioral Model to check the design.`, 'ok');
  toast(`Test bench ${path()} created`, 'ok');
  app.openFile(path());
}


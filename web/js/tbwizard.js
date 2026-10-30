// Test Bench Wizard: a self-checking test bench for a module of the project. The user chooses the
// unit under test, its clock / reset, how the input vectors are made (every combination, random,
// counting, walking ones/zeros or typed in), and the expected outputs of each vector: typed in,
// or filled in from a simulation of the current design (a regression test). Bidirectional (inout)
// ports have two columns: what the bench drives on the bus (a value, or Z / empty = released so
// that the design drives it) and the value expected on the bus. Generator: core/testbench.js.
import { api } from './api.js';
import { h, alertDlg, toast } from './ui.js';
import { compile, elaborate } from '/core/compile.js';
import { clocksOf } from '/core/schematic.js';
import { reservedError } from '/core/reserved.js';
import { tbPorts, guessClockReset, makeVectors, showValue, generateTestbench, generateSkeleton, MAX_VECTORS } from '/core/testbench.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace, moduleElsewhere } from './wizards.js';
import { S, app } from './app.js';
import { mountVectorsPage } from './tbwizard-vectors.js';

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

export const designSources = () => S.sources.filter(s => s.role === 'design' && (s.lang === 'vhdl' || s.lang === 'verilog'));

export async function testBenchWizard({ module, name = null, location = null, lang: langPick = null, task = null, back = null } = {}) {
  if (!S.project) return;
  await app.saveAll?.();
  const guard = replaceGuard('Test Bench Wizard');
  const mods = S.modules.filter(m => m.role === 'design' && m.kind !== 'package');
  if (!mods.length) return alertDlg('Test Bench Wizard', 'The project has no design modules to test.', 'error');
  let uut = mods.find(m => m.name === module) || mods.find(m => m.name === S.project.top) || mods[0];

  // ---------------------------------------------------------------- state
  let ports = [], ins = [], outs = [], ios = [], clockSigs = new Set();
  let rows = [];          // [{ in: { port: text }, drv: { port: text }, exp: { port: text } }] as typed in the table
  let p4skip = false;   // no vectors (skeleton): the vectors page is left out
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
    validate: async () => {
      if (!NAME_RE.test(tbName.value.trim())) return 'Enter a valid test bench name (a letter, then letters, digits and _).';
      const r = reservedError(tbName.value.trim());
      if (r) return `${r}: choose another name.`;
      if (!/^[A-Za-z0-9_/-]+$/.test(loc.value.trim())) return 'Invalid location.';
      const path = `${loc.value.trim().replace(/\/+$/, '')}/${tbName.value.trim()}.${lang.value === 'vhdl' ? 'vhd' : 'v'}`;
      // a module of that name in another file: refused; the file itself may be replaced
      if (moduleElsewhere(tbName.value.trim(), path)) return `A module named '${tbName.value.trim()}' already exists.`;
      const g = await guard(path);
      if (g) return g;
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
    ['none', 'No vectors: a test bench skeleton (clock, reset and the module); I will write the stimulus'],
  ];
  const renderModes = () => {
    modeBox.innerHTML = '';
    const n = totalBits();
    const nv = exhaustiveCount();
    for (const [id, label] of MODES) {
      const dis = id === 'exhaustive' && nv > MAX_VECTORS;
      const r = h('input', { type: 'radio', name: 'tbw-mode', value: id, checked: st.mode === id, disabled: dis });
      r.addEventListener('change', () => { st.mode = id; rows = []; syncStim(); });
      modeBox.append(h('label', { class: 'tbw-mode', style: { display: 'block', margin: '4px 0', color: dis ? 'var(--grey-7)' : '' } }, r, ` ${label}`,
        id === 'exhaustive' ? h('span', { class: 'hint' }, ` — ${n} input bit(s): ${nv > MAX_VECTORS ? `${nv} vectors, more than ${MAX_VECTORS}` : `${nv} vector(s)`}`) : null));
    }
  };
  const syncStim = () => {
    count.disabled = !['random', 'count'].includes(st.mode);
    p4skip = st.mode === 'none';
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
      if (st.mode === 'none') { rows = []; return null; }   // no vectors page, no vector table
      if (!rows.length) {
        try {
          rows = st.mode === 'manual' ? [{ in: {}, drv: {}, exp: {} }] : makeVectors([...ins, ...ios], { mode: st.mode, count: st.count, seed: st.seed })
            .map(v => ({ in: { ...v.in }, drv: Object.fromEntries(ios.map(p => [p.name, /Z/.test(v.drv?.[p.name] || 'Z') ? 'Z' : showValue(v.drv[p.name], p.width)])), exp: {} }));
        } catch (e) { return e.message; }
      }
      return null;
    },
  };

  // ---------------------------------------------------------------- page 4: vectors and expected values (tbwizard-vectors.js)
  const { p4, tbOpts, vectorsBits } = mountVectorsPage({
    chk, ins: () => ins, ios: () => ios, lang, outs: () => outs, ports: () => ports, rows: () => rows, st, tbName,
    uut: () => uut
  });

  // ---------------------------------------------------------------- page 5: summary
  const summary = h('pre', { class: 'code-box' });
  const path = () => `${loc.value.trim().replace(/\/+$/, '')}/${tbName.value.trim()}.${lang.value === 'vhdl' ? 'vhd' : 'v'}`;
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      if (st.mode === 'none') {
        summary.textContent = [
          `The wizard will create the test bench ${path()} (${lang.value === 'vhdl' ? 'VHDL' : 'Verilog'}) and select it in the Simulation view.`,
          '',
          `Unit under test: ${uut.name}`,
          st.clock ? `Clock: ${st.clock}, ${st.period} ns` : 'No clock',
          st.reset ? `Reset: ${st.reset}, active '${st.active}' for ${st.cycles} ${st.clock ? 'clock cycle(s)' : 'x 10 ns'}` : 'Reset: none',
          'Vectors: none — a skeleton: write the stimulus (set the inputs, wait, check the outputs) where the comments show.',
        ].join('\n');
        return;
      }
      const v = vectorsBits();
      const nexp = v.filter(x => chk().some(p => x.exp[p.name] && /[01]/.test(x.exp[p.name]))).length;
      const nrel = v.filter(x => ios.some(p => /Z/.test(x.drv[p.name]))).length;
      summary.textContent = [
        `The wizard will create the test bench ${path()} (${lang.value === 'vhdl' ? 'VHDL' : 'Verilog'}) and select it in the Simulation view.`,
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

  // the vectors page is left out when the user chose no vectors (a skeleton)
  const all = [p1, p2, p3, p4, pSum];
  const list = () => (p4skip ? [p1, p2, p3, pSum] : all);
  const proxy = new Proxy(all, { get: (t, k) => (k === 'length' ? list().length : (typeof k === 'string' && /^\d+$/.test(k) ? list()[+k] : t[k])) });
  const ok = await wizard('Test Bench Wizard', proxy, { width: 820, back });
  if (!ok) return;
  let text;
  try { text = st.mode === 'none' ? generateSkeleton(tbOpts([])) : generateTestbench(tbOpts(vectorsBits())); } catch (e) { return alertDlg('Test Bench Wizard', e.message, 'error'); }
  const pj = S.project;
  await closeBeforeReplace(path());
  await api.writeFile(pj.name, path(), text);   // registers the file (role: simulation)
  await app.reloadProject();
  app.showInSim(tbName.value.trim());
  app.log(st.mode === 'none' ? `Test Bench Wizard: created the test bench skeleton ${path()} for '${uut.name}' (selected in the Simulation view): write the stimulus, then Simulate Behavioral Model.`
    : `Test Bench Wizard: created ${path()} (${rows.length} vector(s)) for '${uut.name}' (selected in the Simulation view). Run Simulate Behavioral Model to check the design.`, 'ok');
  toast(`Test bench ${path()} created`, 'ok');
  app.openFile(path(), undefined, undefined, task ? { task } : undefined);   // (`task`: opened there, Simulate's, #1392)
}


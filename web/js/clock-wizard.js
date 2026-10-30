// The Clocking Wizard (#793), New Source ▸ 'Clock Manager (DCM / PLL)' ▸ Wizard (#958): a module with the target device's clock manager for
// the frequencies asked, a DCM_SP on Spartan-3E, a PLL_BASE on Spartan-6 (core/clocking.js). The pages: the name,
// language and location -> the input clock (the board's oscillator by default; the input from a pin, the reset,
// LOCKED, on Spartan-3E the input divided by 2 and a fixed phase shift) -> the outputs (each with the frequency it
// gets, the nearest the primitive can make, and the ones near it it can) -> summary. It writes the module, its
// settings in its header: opening it from the Design pane reopens the wizard with them (web/js/wizard-modules.js).
import { api } from './api.js';
import { h, alertDlg, toast } from './ui.js';
import { clockModule, planClock, fxChoices, dvChoices, DCM_PINS, PLL_OUTPUTS } from '/core/clocking.js';
import { resourceCount, periodNs } from '/packages/silinx-fpga/src/parts.js';
import { identError } from '/core/modgen.js';
import { wizard, field, select, replaceGuard, closeBeforeReplace, moduleElsewhere } from './wizards.js';
import { S, app } from './app.js';
import { cleanLoc, namedPages } from './wizard-util.js';

const LANGS = [['vhdl', 'VHDL'], ['verilog', 'Verilog']];
const mhzText = x => `${(+x).toFixed(3).replace(/\.?0+$/, '')} MHz`;
const FAMILY_PRIM = { spartan3e: 'DCM_SP', spartan6: 'PLL_BASE' };

// the board's oscillator (its Clock resource with a period), else 50 MHz
function boardMHz() {
  const b = S.devices?.boards?.find(x => x.id === S.project?.board);
  const r = b?.resources?.find(x => x.group === 'Clock' && x.extra?.period);
  const ns = r ? periodNs(r.extra.period) : null;
  return { mhz: ns ? Math.round(1e6 / ns) / 1000 : 50, board: r ? b.name : null };
}

// a new spec for the project's device, or the one of the module being edited
function defaultSpec(family, fin, lang) {
  const base = { wizard: 'clock', version: 1, name: 'clkgen', lang, family, speed: S.project.device.speed, inMHz: fin, input: 'clk_in', ibufg: true, reset: 'rst', locked: 'locked' };
  if (family === 'spartan6') return { ...base, outputs: [{ port: 'clk_out0', mhz: fin, phase: 0 }] };
  return { ...base, div2: false, phaseShift: 0, outputs: [{ pin: 'CLK0', port: 'clk0' }] };
}

/**
 * The wizard: a new module (location, lang), or the module of `path` again (spec: its settings, from its header).
 * Returns the path written, or undefined when cancelled.
 */
export async function clockWizard({ name = '', location = 'src', lang = null, path: editPath = null, spec: old = null, named = false, back = null } = {}) {
  if (!S.project) return;
  const pj = S.project;
  const family = old?.family || pj.device.family;
  if (!FAMILY_PRIM[family]) return alertDlg('Clocking Wizard', 'The Clocking Wizard makes a DCM for the Spartan-3E and a PLL for the Spartan-6: choose one of them as the target device (Design Properties).', 'error');
  if (old && old.family !== pj.device.family) {
    return alertDlg('Clocking Wizard', `${editPath} was made for another family of devices than the project's: create a new one with New Source ▸ Clock Manager (DCM / PLL) ▸ Wizard.`, 'error');
  }
  const part = S.devices?.parts?.find(p => p.part === pj.device.part) || null;
  const res = family === 'spartan6' ? 'pll' : 'dcm';
  const count = part ? resourceCount(part, res) : null;
  const { mhz: oscMHz, board } = boardMHz();
  const L = lang || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
  const spec = structuredClone(old || defaultSpec(family, oscMHz, L));
  if (!old && name) spec.name = name;   // the file name typed in New Source (#958)
  spec.speed = pj.device.speed;
  const guard = replaceGuard('Clocking Wizard');
  // ------------------------------------------------------------ page 1: name, language, location
  const nameIn = h('input', { type: 'text', class: 'cw-name', value: spec.name });
  const langSel = select(LANGS, spec.lang);
  const locIn = h('input', { type: 'text', class: 'cw-loc', value: editPath ? editPath.replace(/\/[^/]*$/, '') : cleanLoc(location) });
  const fileHint = h('span', { class: 'cw-file', 'data-no-i18n': '' });
  const path = () => editPath || `${cleanLoc(locIn.value)}/${nameIn.value.trim()}${langSel.value === 'verilog' ? '.v' : '.vhd'}`;
  const syncFile = () => { fileHint.textContent = path(); };
  [nameIn, locIn].forEach(e => e.addEventListener('input', syncFile));
  langSel.addEventListener('change', syncFile);
  if (editPath) [nameIn, langSel, locIn].forEach(e => { e.disabled = true; });
  // a module changed by hand since the wizard wrote it: said, Finish writes it again from the settings
  const edited = editPath && (S.sources || []).find(s => s.path === editPath)?.text !== clockModule(old).code;
  const countNote = () => (count === null ? '' : h('div', { class: 'hint cw-count', style: { marginTop: '10px' } }, family === 'spartan6' ? `PLLs on this device: ${count}` : `DCMs on this device: ${count}`));
  const p1 = {
    title: 'Name and Language',
    render: () => h('div', {},
      h('div', { class: 'hint' }, family === 'spartan6'
        ? 'The wizard writes a module with a PLL of the Spartan-6 (PLL_BASE) for the frequencies you ask, its outputs on global clock buffers (BUFG).'
        : 'The wizard writes a module with a DCM of the Spartan-3E (DCM_SP) for the frequencies you ask, its outputs on global clock buffers (BUFG).'),
      h('div', { class: 'form-grid', style: { marginTop: '10px' } },
        ...field('Module name:', nameIn), ...field('Language:', langSel), ...field('Location:', locIn), ...field('File:', fileHint)),
      countNote(),
      edited ? h('div', { class: 'hint cw-edited', style: { marginTop: '10px', color: 'var(--danger)' } }, 'This module was changed by hand since the wizard wrote it: Finish writes it again from the wizard\'s settings, and those changes are lost.') : ''),
    onShow: syncFile,
    validate: async () => {
      if (count === 0) return family === 'spartan6' ? 'This device has no PLL.' : 'This device has no DCM.';
      const n = nameIn.value.trim();
      const e = identError(n, langSel.value);
      if (e) return `Name: ${e}.`;
      if (!/^[A-Za-z0-9_/-]+$/.test(locIn.value.trim())) return 'Invalid location.';
      if (moduleElsewhere(n, path())) return `A module named '${n}' already exists.`;
      return editPath ? null : guard(path());
    },
  };
  // ------------------------------------------------------------ page 2: the input clock
  const num = (cls, value, attrs = {}) => h('input', { type: 'number', class: cls, value: String(value), step: 'any', style: { width: '110px' }, ...attrs });
  const finIn = num('cw-fin', spec.inMHz, { min: '0' });
  const inputIn = h('input', { type: 'text', class: 'cw-input', value: spec.input, style: { width: '110px' } });
  const ibufgChk = h('input', { type: 'checkbox', class: 'cw-ibufg', checked: spec.ibufg });
  const rstChk = h('input', { type: 'checkbox', class: 'cw-rst-on', checked: !!spec.reset });
  const rstIn = h('input', { type: 'text', class: 'cw-rst', value: spec.reset || 'rst', style: { width: '110px' } });
  const lkChk = h('input', { type: 'checkbox', class: 'cw-lk-on', checked: !!spec.locked });
  const lkIn = h('input', { type: 'text', class: 'cw-lk', value: spec.locked || 'locked', style: { width: '110px' } });
  const div2Chk = h('input', { type: 'checkbox', class: 'cw-div2', checked: !!spec.div2 });
  const phaseIn = num('cw-phase', spec.phaseShift || 0, { min: '-255', max: '255', step: '1' });
  const phaseNote = h('span', { class: 'cw-phase-note', 'data-no-i18n': '' });
  const inNote = h('div', { class: 'hint cw-in-note' }, board ? `The ${board}'s oscillator: ${mhzText(oscMHz)}.` : '');
  const syncIn = () => {
    spec.inMHz = +finIn.value;
    spec.input = inputIn.value.trim();
    spec.ibufg = ibufgChk.checked;
    spec.reset = rstChk.checked ? rstIn.value.trim() : '';
    spec.locked = lkChk.checked ? lkIn.value.trim() : '';
    rstIn.disabled = !rstChk.checked; lkIn.disabled = !lkChk.checked;
    if (family === 'spartan3e') {
      spec.div2 = div2Chk.checked;
      spec.phaseShift = Math.trunc(+phaseIn.value || 0);
      const f = spec.inMHz / (spec.div2 ? 2 : 1);
      phaseNote.textContent = spec.phaseShift && f > 0 ? `${(spec.phaseShift * 360 / 256).toFixed(1)}°, ${(spec.phaseShift / 256 * 1000 / f).toFixed(3)} ns` : '';
    }
  };
  [finIn, inputIn, rstIn, lkIn, phaseIn].forEach(e => e.addEventListener('input', syncIn));
  [ibufgChk, rstChk, lkChk, div2Chk].forEach(e => e.addEventListener('change', syncIn));
  const portErr = (label, n) => { const e = identError(n, langSel.value); return e ? `${label}: ${e}.` : null; };
  const p2 = {
    title: 'Input Clock',
    render: () => h('div', {},
      h('div', { class: 'form-grid' },
        ...field('Input frequency (MHz):', finIn), ...field('Input port:', inputIn),
        ...field('From a pin (IBUFG):', ibufgChk),
        ...(family === 'spartan3e' ? [...field('Divide the input by 2 (CLKIN_DIVIDE_BY_2):', div2Chk), ...field('Phase shift (PHASE_SHIFT, 256ths of the period):', h('span', {}, phaseIn, ' ', phaseNote))] : []),
        ...field('Reset input (RST):', h('span', {}, rstChk, ' ', rstIn)), ...field('LOCKED output:', h('span', {}, lkChk, ' ', lkIn))),
      inNote,
      h('div', { class: 'hint', style: { marginTop: '8px' } }, 'Give the input its PERIOD constraint in the UCF: the timing derives each output\'s from it.')),
    onShow: syncIn,
    validate: () => {
      syncIn();
      if (!(spec.inMHz > 0)) return 'Enter the input clock frequency.';
      const e = portErr('Input port', spec.input) || (spec.reset && portErr('Reset input', spec.reset)) || (spec.locked && portErr('LOCKED output', spec.locked));
      if (e) return e;
      // the input's own errors (the outputs come next)
      return planClock({ ...spec, outputs: family === 'spartan6' ? [{ port: 'x', mhz: spec.inMHz }] : [{ pin: 'CLK0', port: 'x' }] }).errors.find(x => !/^CLK0 /.test(x)) || null;
    },
  };
  // ------------------------------------------------------------ page 3: the outputs
  const outTbl = h('table', { class: 'grid cw-outputs' });
  const vcoNote = h('div', { class: 'hint cw-vco', 'data-no-i18n': '' });
  const errBox = h('div', { class: 'cw-errors', style: { color: 'var(--danger)', minHeight: '16px', marginTop: '6px' } });
  // the rows: Spartan-3E, one per DCM output (CLKFX180 at CLKFX's frequency); Spartan-6, the PLL's six
  const rows = family === 'spartan6'
    ? Array.from({ length: PLL_OUTPUTS }, (_, i) => {
      const o = spec.outputs[i];
      return { pin: `CLKOUT${i}`, on: !!o, port: o?.port || `clk_out${i}`, mhz: o?.mhz ?? spec.inMHz / (i + 1), phase: o?.phase ?? 0 };
    })
    : DCM_PINS.map(pin => {
      const o = spec.outputs.find(x => x.pin === pin);
      const fx = spec.outputs.find(x => /^CLKFX/.test(x.pin) && x.mhz !== undefined);
      return { pin, on: !!o, port: o?.port || pin.toLowerCase(), mhz: pin === 'CLKDV' ? (o?.mhz ?? spec.inMHz / 2) : pin === 'CLKFX' ? (fx?.mhz ?? spec.inMHz * 2) : undefined };
    });
  const outputsOf = () => (family === 'spartan6'
    ? rows.filter(r => r.on).map(r => ({ port: r.port, mhz: +r.mhz, phase: +r.phase || 0 }))
    : rows.filter(r => r.on).map(r => ({ pin: r.pin, port: r.port, ...(/^CLKFX/.test(r.pin) ? { mhz: +rows.find(x => x.pin === 'CLKFX').mhz } : r.pin === 'CLKDV' ? { mhz: +r.mhz } : {}) })));
  let cells = [];
  const refresh = () => {
    spec.outputs = outputsOf();
    const plan = planClock(spec);
    const got = new Map(plan.outputs.map(o => [o.pin, o]));
    const f = spec.inMHz / (spec.div2 ? 2 : 1);
    for (const c of cells) {
      const o = got.get(c.row.pin);
      c.actual.textContent = o ? `${mhzText(o.mhz)} (${o.period} ns)` : '';
      c.note.textContent = o ? o.note : '';
      // the frequencies near the one asked that the primitive can make: a click asks for one of them
      c.near.replaceChildren();
      if (!c.row.on || !(f > 0)) continue;
      const near = c.row.pin === 'CLKFX' ? fxChoices(f, +c.row.mhz, { speed: spec.speed, div2: spec.div2 }).map(x => x.mhz)
        : c.row.pin === 'CLKDV' ? dvChoices(f, { speed: spec.speed, div2: spec.div2 }).sort((a, b) => Math.abs(a.mhz - c.row.mhz) - Math.abs(b.mhz - c.row.mhz)).slice(0, 5).map(x => x.mhz)
        : family === 'spartan6' && plan.vco ? [...new Set([-2, -1, 0, 1, 2].map(k => Math.round(plan.vco / Math.max(1, Math.round(plan.vco / +c.row.mhz) + k) * 1e6) / 1e6))] : [];
      for (const x of near) c.near.append(h('button', { class: 'btn cw-near-btn', 'data-no-i18n': '', title: 'Ask for this frequency', onclick: () => { c.row.mhz = x; c.mhz.value = String(x); refresh(); } }, mhzText(x)));
    }
    vcoNote.textContent = plan.notes.join(' ');
    errBox.textContent = plan.errors.join(' ');
    return plan;
  };
  const renderRows = () => {
    outTbl.replaceChildren(h('tr', {}, h('th', {}, ''), h('th', {}, 'Output'), h('th', {}, 'Port'), h('th', {}, 'Asked (MHz)'),
      ...(family === 'spartan6' ? [h('th', {}, 'Phase (°)')] : []), h('th', {}, 'Frequency'), h('th', {}, 'Made as'), h('th', {}, 'Reachable near it')));
    cells = rows.map(row => {
      const on = h('input', { type: 'checkbox', class: 'cw-on', 'data-pin': row.pin, checked: row.on });
      const port = h('input', { type: 'text', class: 'cw-port', 'data-pin': row.pin, value: row.port, style: { width: '90px' } });
      const asks = row.mhz !== undefined;
      const mhz = asks ? num('cw-mhz', row.mhz, { 'data-pin': row.pin, style: { width: '80px' } }) : h('span', { class: 'cw-fixed', 'data-no-i18n': '' }, row.pin === 'CLKFX180' ? '= CLKFX' : '');
      const phase = family === 'spartan6' ? num('cw-ph', row.phase, { 'data-pin': row.pin, style: { width: '60px' } }) : null;
      const actual = h('span', { class: 'cw-actual', 'data-pin': row.pin, 'data-no-i18n': '' });
      const note = h('span', { class: 'cw-note', 'data-pin': row.pin, 'data-no-i18n': '' });
      const near = h('span', { class: 'cw-near', 'data-pin': row.pin, style: { display: 'flex', gap: '3px', flexWrap: 'wrap' } });
      on.addEventListener('change', () => { row.on = on.checked; refresh(); });
      port.addEventListener('input', () => { row.port = port.value.trim(); });
      if (asks) mhz.addEventListener('input', () => { row.mhz = mhz.value; refresh(); });
      phase?.addEventListener('input', () => { row.phase = phase.value; refresh(); });
      outTbl.append(h('tr', {}, h('td', {}, on), h('td', { 'data-no-i18n': '' }, row.pin), h('td', {}, port), h('td', {}, mhz), ...(phase ? [h('td', {}, phase)] : []),
        h('td', {}, actual), h('td', {}, note), h('td', {}, near)));
      return { row, actual, note, near, mhz };
    });
  };
  const p3 = {
    title: 'Output Clocks',
    render: () => {
      renderRows();
      return h('div', {},
        h('div', { class: 'hint' }, family === 'spartan6'
          ? 'Choose the outputs and the frequency of each: the PLL makes them all from one VCO frequency, the nearest it can to the ones asked.'
          : 'Choose the outputs: CLK0, CLK90, CLK180 and CLK270 run at the input frequency, CLK2X at twice it; CLKDV divides it, CLKFX multiplies and divides it: the nearest it can to the one asked.'),
        h('div', { style: { marginTop: '8px', maxHeight: '330px', overflow: 'auto', border: '1px solid var(--frame)' } }, outTbl), vcoNote, errBox);
    },
    onShow: refresh,
    validate: () => {
      const plan = refresh();
      if (plan.errors.length) return plan.errors[0];
      const names = [spec.input, spec.reset, spec.locked, ...spec.outputs.map(o => o.port)].filter(Boolean);
      for (const o of spec.outputs) { const e = portErr(`Output ${o.pin || o.port}`, o.port); if (e) return e; }
      if (new Set(names.map(n => n.toLowerCase())).size !== names.length) return 'Two ports have the same name.';
      return null;
    },
  };
  // ------------------------------------------------------------ page 4: summary
  const summary = h('pre', { class: 'cw-summary code-box' });
  const pSum = {
    title: 'Summary',
    render: () => summary,
    onShow: () => {
      spec.name = nameIn.value.trim(); spec.lang = langSel.value;
      const plan = planClock(spec);
      summary.textContent = [
        `The wizard will ${editPath ? 'write again' : 'create'} ${path()} (${spec.lang === 'vhdl' ? 'VHDL' : 'Verilog'}): the module ${spec.name}, a ${plan.primitive} and ${plan.outputs.length} global buffer(s).`,
        '',
        `Input: ${spec.input}, ${mhzText(spec.inMHz)}${spec.ibufg ? ', from a pin (IBUFG)' : ''}${spec.div2 ? ', divided by 2' : ''}`,
        ...plan.outputs.map(o => `Output ${o.port}: ${mhzText(o.mhz)} (${o.pin}: ${o.note})${o.asked !== null && Math.abs(o.asked - o.mhz) > 1e-6 ? `, asked ${mhzText(o.asked)}` : ''}`),
        ...(spec.reset ? [`Reset: ${spec.reset}`] : []), ...(spec.locked ? [`LOCKED: ${spec.locked}`] : []),
        ...plan.notes,
      ].join('\n');
    },
    validate: () => (editPath ? null : guard(path())),
  };
  // (from New Source: the count under the input clock, #2082)
  const ok = await wizard('Clocking Wizard', namedPages(p1, [p1, p2, p3, pSum], named, countNote), { width: 900, back });
  if (!ok) return;
  spec.name = nameIn.value.trim(); spec.lang = langSel.value;
  const { code, plan } = clockModule(spec);
  if (!code) return alertDlg('Clocking Wizard', plan.errors.join('\n'), 'error');
  const p = path();
  await closeBeforeReplace(p);
  await api.writeFile(pj.name, p, code);
  await app.reloadProject();
  app.log(`Clocking Wizard: ${editPath ? 'wrote again' : 'created'} ${p}, the module ${spec.name}: ${plan.outputs.map(o => `${o.port} ${mhzText(o.mhz)}`).join(', ')}.`, 'ok');
  toast(`Clock module ${spec.name} ${editPath ? 'updated' : 'created'}`, 'ok');
  return p;
}

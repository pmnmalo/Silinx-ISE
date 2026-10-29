// Silinx - the Clocking Wizard's clock modules (#793, part of #787): a DCM_SP on Spartan-3E, a PLL_BASE on
// Spartan-6, for the frequencies asked. The wizard (web/js/clock-wizard.js) keeps its settings, a spec, in
// a line of the module's header (`-- silinx-wizard: {...}`, as ISE's CORE Generator keeps a core's in its
// .xco): the module is generated from it, and editing the module reopens the wizard with them.
//
// Spartan-3E (DS312 v4.2 Tables 104-107, the parts' Stepping 1; UG331 "Digital Clock Managers"): the
// DCM_SP's DLL outputs (CLK0, CLK90, CLK180, CLK270, CLK2X, CLK2X180, CLKDV) and its DFS outputs (CLKFX,
// CLKFX180, at CLKIN x CLKFX_MULTIPLY / CLKFX_DIVIDE), CLK0 through a BUFG fed back to CLKFB (CLK_FEEDBACK
// 1X), every output used on a BUFG of its own; CLKIN_DIVIDE_BY_2, a fixed phase shift (PHASE_SHIFT / 256 of
// the period), RST and LOCKED. With CLKIN_DIVIDE_BY_2, trce 14.7 halves every switching limit of the DCM
// (packages/silinx-fpga/src/fpga/timing.js, #661): the lowest frequency of each output is doubled here so that trce passes.
// Spartan-6 (DS162 v3.1.1 Table 52, UG382 "Phase-Locked Loops"): a PLL_BASE with up to six outputs
// (CLKOUT0-5 = VCO / CLKOUTn_DIVIDE, VCO = CLKIN x CLKFBOUT_MULT / DIVCLK_DIVIDE), its feedback internal
// (CLKFBOUT to CLKFBIN, COMPENSATION "INTERNAL"), each output on a BUFG, a phase in steps of 45 / divide
// degrees (an eighth of the VCO period).
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   dcmLimits(speed)              the DCM_SP's frequency ranges (MHz) on a Spartan-3E speed grade
//   pllLimits(speed)              the PLL's (MHz) on a Spartan-6 speed grade
//   fxChoices(f, want, opts)      the CLKFX frequencies nearest `want` from an input `f`: [{ m, d, mhz }]
//   dvChoices(f, opts)            every CLKDV frequency from `f`: [{ divide, mhz }]
//   planClock(spec)               the primitive's parameters and every output's frequency, or the errors
//   clockModule(spec)             { code, plan } (code: '' when the plan has errors)
//   readWizardSpec(text)          the spec in a module's header (null: not made by a wizard)
//   wizardLine(spec, lang)        that header line

export const DCM_PINS = ['CLK0', 'CLK90', 'CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLKDV', 'CLKFX', 'CLKFX180'];
// DS312 Table 3x (CLKDV_DIVIDE): 1.5 to 7.5 in halves, then the integers to 16
export const CLKDV_DIVIDES = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 9, 10, 11, 12, 13, 14, 15, 16];
export const PLL_OUTPUTS = 6;
const WIZ = 'silinx-wizard:';

/** The DCM_SP's ranges (MHz, [min, max]) on a Spartan-3E speed grade: DS312 Tables 104-107, Stepping 1. */
export function dcmLimits(speed = '-4') {
  const fast = String(speed) === '-5';
  return {
    dllIn: [5, fast ? 275 : 240], dfsIn: [0.2, 333],
    clk0: [5, fast ? 275 : 240], clk90: [5, 200], clk2x: [10, fast ? 333 : 311], clkdv: [0.3125, fast ? 183 : 160], clkfx: [5, fast ? 333 : 311],
  };
}

/** The PLL's ranges (MHz) on a Spartan-6 speed grade: DS162 Table 52 (its input from a global buffer, its
 *  outputs on BUFGs) and the attributes' ranges of UG382 (CLKFBOUT_MULT 1-64, DIVCLK_DIVIDE 1-52, CLKOUTn_DIVIDE 1-128). */
export function pllLimits(speed = '-3') {
  const t = { '-3': [400, 1080, 500, 400], '-3N': [400, 1050, 500, 400], '-2': [375, 1000, 400, 375], '-1L': [250, 1000, 300, 250] }[String(speed)] || [375, 1000, 400, 375];
  return { in: [19, t[0]], vco: [400, t[1]], pfd: [19, t[2]], out: [3.125, t[3]], mult: [1, 64], div: [1, 52], odiv: [1, 128] };
}

const round = (x, n = 6) => Math.round(x * 10 ** n) / 10 ** n;
const inRange = (x, [lo, hi]) => x >= lo - 1e-9 && x <= hi + 1e-9;
const fmt = (x, n = 3) => (Number.isFinite(x) ? x.toFixed(n) : String(x));
// the lowest frequency of a DCM output doubled with CLKIN_DIVIDE_BY_2 (trce's limits, #661)
const lim = (l, div2) => (div2 ? [l[0] * 2, l[1]] : l);

/** The CLKFX frequencies reachable from the DCM's input `f` (MHz, after CLKIN_DIVIDE_BY_2), nearest `want`
 *  first: [{ m, d, mhz }], each frequency once (its smallest M and D, which lock fastest, DS312). n: how many. */
export function fxChoices(f, want, { speed = '-4', div2 = false, n = 5 } = {}) {
  const range = lim(dcmLimits(speed).clkfx, div2);
  const seen = new Map();
  for (let d = 1; d <= 32; d++) {
    for (let m = 2; m <= 32; m++) {
      const mhz = round(f * m / d);
      if (!inRange(mhz, range)) continue;
      const k = mhz.toFixed(6), o = seen.get(k);
      if (!o || m + d < o.m + o.d) seen.set(k, { m, d, mhz });
    }
  }
  return [...seen.values()].sort((a, b) => Math.abs(a.mhz - want) - Math.abs(b.mhz - want) || a.m + a.d - (b.m + b.d)).slice(0, n);
}

/** The CLKDV frequencies from the DCM's input `f` (MHz, after CLKIN_DIVIDE_BY_2): [{ divide, mhz }] in range. */
export function dvChoices(f, { speed = '-4', div2 = false } = {}) {
  const range = lim(dcmLimits(speed).clkdv, div2);
  return CLKDV_DIVIDES.map(divide => ({ divide, mhz: round(f / divide) })).filter(c => inRange(c.mhz, range));
}

/**
 * The parameters of the spec's primitive and its outputs' frequencies. spec:
 *   { family: 'spartan3e' | 'spartan6', speed, inMHz, input: port, ibufg: true (the input from a pin, through
 *     an IBUFG), reset: port | '' (none), locked: port | '',
 *     Spartan-3E: div2, phaseShift (-255..255), outputs: [{ pin: 'CLK0'…, port, mhz (CLKDV / CLKFX: asked) }]
 *     Spartan-6: outputs: [{ port, mhz, phase (degrees) }] }
 * -> { family, primitive, generics: [[name, value text]], outputs: [{ pin, port, mhz, asked, period, note }],
 *      errors: [message], notes: [line] }
 */
export function planClock(spec) {
  return spec?.family === 'spartan6' ? planPll(spec) : planDcm(spec);
}

function planDcm(spec) {
  const errors = [], notes = [];
  const fin = +spec.inMHz, div2 = !!spec.div2, L = dcmLimits(spec.speed);
  const f = fin / (div2 ? 2 : 1);
  const plan = { family: 'spartan3e', primitive: 'DCM_SP', generics: [], outputs: [], errors, notes };
  if (!(fin > 0)) { errors.push('Enter the input clock frequency.'); return plan; }
  // CLK0 is always used, fed back to CLKFB: the DLL is always in use (DS312 Table 104)
  if (!inRange(f, L.dllIn)) errors.push(`The DCM's input (${fmt(f)} MHz${div2 ? ', the input divided by 2' : ''}) is out of the DLL's range, ${L.dllIn[0]} to ${L.dllIn[1]} MHz${!div2 && f > L.dllIn[1] && f / 2 >= L.dllIn[0] ? ': divide the input by 2' : ''}.`);
  if (div2 && fin < 2 * L.dllIn[0]) errors.push(`With the input divided by 2, the input must be at least ${2 * L.dllIn[0]} MHz.`);
  const outs = (spec.outputs || []).filter(o => DCM_PINS.includes(o.pin));
  if (!outs.length) errors.push('Choose at least one output.');
  const fxAsk = outs.find(o => /^CLKFX/.test(o.pin));
  const dvAsk = outs.find(o => o.pin === 'CLKDV');
  let fx = null, dv = null;
  if (fxAsk) {
    const want = +fxAsk.mhz;
    if (!(want > 0)) errors.push('Enter the frequency of CLKFX.');
    else {
      fx = fxChoices(f, want, { speed: spec.speed, div2 })[0] || null;
      if (!fx) errors.push(`CLKFX cannot be made from ${fmt(f)} MHz.`);
    }
  }
  if (dvAsk) {
    const want = +dvAsk.mhz;
    if (!(want > 0)) errors.push('Enter the frequency of CLKDV.');
    else {
      const all = dvChoices(f, { speed: spec.speed, div2 });
      dv = all.sort((a, b) => Math.abs(a.mhz - want) - Math.abs(b.mhz - want))[0] || null;
      if (!dv) errors.push(`CLKDV cannot be made from ${fmt(f)} MHz.`);
    }
  }
  const ps = Math.trunc(+spec.phaseShift || 0);
  if (ps < -255 || ps > 255) errors.push('The phase shift is from -255 to 255 (256ths of the period).');
  const ranges = { CLK0: L.clk0, CLK180: L.clk0, CLK90: L.clk90, CLK270: L.clk90, CLK2X: L.clk2x, CLK2X180: L.clk2x, CLKDV: L.clkdv, CLKFX: L.clkfx, CLKFX180: L.clkfx };
  for (const o of outs) {
    const mhz = /^CLK2X/.test(o.pin) ? 2 * f : o.pin === 'CLKDV' ? dv?.mhz : /^CLKFX/.test(o.pin) ? fx?.mhz : f;
    if (mhz === undefined) continue;
    const r = lim(ranges[o.pin], div2);
    if (!inRange(mhz, r)) errors.push(`${o.pin} (${fmt(mhz)} MHz) is out of its range, ${r[0]} to ${r[1]} MHz.`);
    const note = o.pin === 'CLKDV' ? `CLKIN / ${dv.divide}` : /^CLKFX/.test(o.pin) ? `CLKIN x ${fx.m} / ${fx.d}` : /^CLK2X/.test(o.pin) ? 'CLKIN x 2' : 'CLKIN';
    const deg = { CLK90: 90, CLK180: 180, CLK270: 270, CLK2X180: 180, CLKFX180: 180 }[o.pin];
    plan.outputs.push({ pin: o.pin, port: o.port, mhz: round(mhz), asked: o.mhz === undefined || o.mhz === '' ? null : +o.mhz, period: round(1000 / mhz, 3),
      note: `${note}${div2 ? ' (CLKIN divided by 2)' : ''}${deg ? `, ${deg}°` : ''}` });
  }
  const g = plan.generics;
  g.push(['CLKDV_DIVIDE', (dv?.divide ?? 2).toFixed(1)], ['CLKFX_MULTIPLY', String(fx?.m ?? 4)], ['CLKFX_DIVIDE', String(fx?.d ?? 1)],
    ['CLKIN_DIVIDE_BY_2', div2 ? 'TRUE' : 'FALSE'], ['CLKIN_PERIOD', (1000 / fin).toFixed(3)], ['CLKOUT_PHASE_SHIFT', ps ? '"FIXED"' : '"NONE"'],
    ['CLK_FEEDBACK', '"1X"'], ['DESKEW_ADJUST', '"SYSTEM_SYNCHRONOUS"'], ['DFS_FREQUENCY_MODE', '"LOW"'], ['DLL_FREQUENCY_MODE', '"LOW"'],
    ['DUTY_CYCLE_CORRECTION', 'TRUE'], ['PHASE_SHIFT', String(ps)], ['STARTUP_WAIT', 'FALSE']);
  if (ps) notes.push(`Phase shift: ${ps} / 256 of the CLKIN period (${fmt(ps * 360 / 256, 1)}°, ${fmt(ps / 256 * 1000 / f, 3)} ns), on every output.`);
  return plan;
}

function planPll(spec) {
  const errors = [], notes = [];
  const fin = +spec.inMHz, L = pllLimits(spec.speed);
  const plan = { family: 'spartan6', primitive: 'PLL_BASE', generics: [], outputs: [], errors, notes, vco: null, mult: null, div: null };
  if (!(fin > 0)) { errors.push('Enter the input clock frequency.'); return plan; }
  if (!inRange(fin, L.in)) errors.push(`The PLL's input (${fmt(fin)} MHz) is out of its range, ${L.in[0]} to ${L.in[1]} MHz.`);
  const outs = (spec.outputs || []).slice(0, PLL_OUTPUTS);
  if (!outs.length) errors.push('Choose at least one output.');
  if ((spec.outputs || []).length > PLL_OUTPUTS) errors.push(`A PLL has ${PLL_OUTPUTS} outputs.`);
  for (const o of outs) {
    if (!(+o.mhz > 0)) errors.push(`Enter the frequency of ${o.port || 'each output'}.`);
    else if (!inRange(+o.mhz, L.out)) errors.push(`${o.port} (${fmt(+o.mhz)} MHz) is out of the PLL's output range, ${L.out[0]} to ${L.out[1]} MHz.`);
  }
  if (errors.length) return plan;
  // the VCO with the smallest error over every output (the largest relative error, then their sum), then the
  // fastest VCO (the least jitter, UG382), then the smallest DIVCLK_DIVIDE
  let best = null;
  for (let d = L.div[0]; d <= L.div[1]; d++) {
    const pfd = fin / d;
    if (!inRange(pfd, L.pfd)) continue;
    for (let m = L.mult[0]; m <= L.mult[1]; m++) {
      const vco = pfd * m;
      if (!inRange(vco, L.vco)) continue;
      let worst = 0, sum = 0;
      const divs = [];
      for (const o of outs) {
        let k = Math.min(L.odiv[1], Math.max(L.odiv[0], Math.round(vco / +o.mhz)));
        // (the output itself in range)
        while (vco / k > L.out[1] + 1e-9 && k < L.odiv[1]) k++;
        while (vco / k < L.out[0] - 1e-9 && k > L.odiv[0]) k--;
        const e = Math.abs(vco / k - +o.mhz) / +o.mhz;
        worst = Math.max(worst, e); sum += e; divs.push(k);
      }
      const key = [round(worst, 9), round(sum, 9), -round(vco, 9), d];
      const i = best ? key.findIndex((x, j) => x !== best.key[j]) : -1;
      if (!best || (i >= 0 && key[i] < best.key[i])) best = { key, m, d, vco, divs };
    }
  }
  if (!best) { errors.push(`No VCO frequency (${L.vco[0]} to ${L.vco[1]} MHz) can be made from ${fmt(fin)} MHz.`); return plan; }
  Object.assign(plan, { vco: round(best.vco), mult: best.m, div: best.d });
  const g = plan.generics;
  g.push(['BANDWIDTH', '"OPTIMIZED"'], ['CLKFBOUT_MULT', String(best.m)], ['CLKFBOUT_PHASE', '0.0'], ['CLKIN_PERIOD', (1000 / fin).toFixed(3)]);
  for (let i = 0; i < PLL_OUTPUTS; i++) {
    const o = outs[i];
    const k = o ? best.divs[i] : 1;
    // the phase in steps of an eighth of the VCO period: 45 / divide degrees
    const step = 45 / k, ph = o ? (Math.round((((+o.phase || 0) % 360) + 360) % 360 / step) * step) % 360 : 0;
    g.push([`CLKOUT${i}_DIVIDE`, String(k)], [`CLKOUT${i}_DUTY_CYCLE`, '0.5'], [`CLKOUT${i}_PHASE`, ph.toFixed(3)]);
    if (!o) continue;
    const mhz = round(best.vco / k);
    plan.outputs.push({ pin: `CLKOUT${i}`, port: o.port, mhz, asked: +o.mhz, period: round(1000 / mhz, 3), phase: round(ph, 3),
      note: `VCO / ${k}${ph ? `, ${fmt(ph, 1)}°` : ''}` });
  }
  g.push(['CLK_FEEDBACK', '"CLKFBOUT"'], ['COMPENSATION', '"INTERNAL"'], ['DIVCLK_DIVIDE', String(best.d)], ['REF_JITTER', '0.100'], ['RESET_ON_LOSS_OF_LOCK', 'FALSE']);
  notes.push(`VCO: ${fmt(fin)} MHz x ${best.m} / ${best.d} = ${fmt(best.vco)} MHz (its range ${L.vco[0]} to ${L.vco[1]} MHz).`);
  return plan;
}

// ------------------------------------------------------------------ the module
/** The wizard's header line of a module: its spec as JSON in a comment. */
export function wizardLine(spec, lang) {
  return `${lang === 'verilog' ? '//' : '--'} ${WIZ} ${JSON.stringify(spec)}`;
}

/** The spec a wizard wrote in a module's header (`-- silinx-wizard: {...}`), or null. */
export function readWizardSpec(text) {
  const m = /^\s*(?:--|\/\/)\s*silinx-wizard:\s*(\{.*\})\s*$/m.exec(String(text ?? ''));
  if (!m) return null;
  try { const s = JSON.parse(m[1]); return s && typeof s === 'object' && typeof s.wizard === 'string' ? s : null; } catch { return null; }
}

/** The module of a clock spec (with its `name` and `lang`): { code, plan }; code '' when the plan has errors. */
export function clockModule(spec) {
  const plan = planClock(spec);
  if (plan.errors.length) return { code: '', plan };
  return { code: spec.lang === 'verilog' ? verilogOf(spec, plan) : vhdlOf(spec, plan), plan };
}

// the comment block of the module: what it makes, each output's frequency and how
function describe(spec, plan, c) {
  const fin = +spec.inMHz;
  const rows = plan.outputs.map(o => `${c}   ${o.port.padEnd(12)} ${fmt(o.mhz).padStart(9)} MHz (${fmt(o.period)} ns)  ${o.pin}: ${o.note}${o.asked !== null && Math.abs(o.asked - o.mhz) > 1e-6 ? `; asked ${fmt(o.asked)} MHz` : ''}`);
  return [
    `${c} Clocking Wizard (Silinx): ${plan.primitive === 'DCM_SP' ? 'a DCM_SP of the Spartan-3E' : 'a PLL_BASE of the Spartan-6'}, its outputs on global buffers (BUFG).`,
    `${c} Do not edit: the module is generated from the line above; open it from the Design pane to change it.`,
    `${c}`,
    `${c}   ${spec.input.padEnd(12)} ${fmt(fin).padStart(9)} MHz (${fmt(1000 / fin)} ns)  the input${spec.ibufg ? ', from a pin (IBUFG)' : ''}`,
    ...rows,
    ...(spec.locked ? [`${c}   ${spec.locked.padEnd(12)} 1 when the outputs are stable (LOCKED)`] : []),
    ...(spec.reset ? [`${c}   ${spec.reset.padEnd(12)} 1 resets the ${plan.primitive === 'DCM_SP' ? 'DCM' : 'PLL'} (RST; hold it for at least ${plan.primitive === 'DCM_SP' ? 'three CLKIN periods' : '5 ns'})`] : []),
    ...plan.notes.map(n => `${c} ${n}`),
    `${c} The input's PERIOD constraint (UCF) gives each output its own (derived) for the timing.`,
  ];
}

// the primitive's ports: [pin, signal | null (open) | constant]
function pinsOf(spec, plan, sig) {
  const used = new Map(plan.outputs.map(o => [o.pin, sig(o.pin)]));
  if (plan.primitive === 'DCM_SP') {
    return [['CLKIN', 'clkin_b'], ['CLKFB', 'clkfb_b'], ['RST', spec.reset || "'0'"], ['DSSEN', "'0'"], ['PSCLK', "'0'"], ['PSEN', "'0'"], ['PSINCDEC', "'0'"],
      ...DCM_PINS.map(p => [p, p === 'CLK0' ? 'clk0_u' : used.get(p) || null]), ['LOCKED', spec.locked ? 'locked_i' : null], ['PSDONE', null], ['STATUS', null]];
  }
  return [['CLKIN', 'clkin_b'], ['CLKFBIN', 'clkfb_u'], ['RST', spec.reset || "'0'"], ['CLKFBOUT', 'clkfb_u'],
    ...Array.from({ length: PLL_OUTPUTS }, (_, i) => [`CLKOUT${i}`, used.get(`CLKOUT${i}`) || null]), ['LOCKED', spec.locked ? 'locked_i' : null]];
}

const unbuf = pin => `${pin.toLowerCase()}_u`;

function vhdlOf(spec, plan) {
  const ports = [`${spec.input} : in  std_logic`, ...(spec.reset ? [`${spec.reset} : in  std_logic`] : []),
    ...plan.outputs.map(o => `${o.port} : out std_logic`), ...(spec.locked ? [`${spec.locked} : out std_logic`] : [])];
  const w = Math.max(...ports.map(p => p.indexOf(':')));
  const portText = ports.map(p => { const [n, t] = p.split(/ : /); return `${n.padEnd(w)} : ${t}`; });
  const dcm = plan.primitive === 'DCM_SP';
  const sigs = ['clkin_b', ...(dcm ? ['clk0_u', 'clkfb_b'] : ['clkfb_u']), ...plan.outputs.filter(o => !(dcm && o.pin === 'CLK0')).map(o => unbuf(o.pin)), ...(spec.locked ? ['locked_i'] : [])];
  const gw = Math.max(...plan.generics.map(([n]) => n.length));
  const pins = pinsOf(spec, plan, unbuf);
  const pw = Math.max(...pins.map(([n]) => n.length));
  const L = [
    wizardLine(spec, 'vhdl'),
    ...describe(spec, plan, '--'),
    'library IEEE;',
    'use IEEE.STD_LOGIC_1164.ALL;',
    'library UNISIM;',
    'use UNISIM.VCOMPONENTS.ALL;',
    '',
    `entity ${spec.name} is`,
    `  port (${portText.join(';\n        ')});`,
    `end ${spec.name};`,
    '',
    `architecture xilinx of ${spec.name} is`,
    `  signal ${sigs.join(', ')} : std_logic;`,
    'begin',
    spec.ibufg ? `  u_ibufg : IBUFG port map (I => ${spec.input}, O => clkin_b);` : `  clkin_b <= ${spec.input};`,
    '',
    `  u_${dcm ? 'dcm' : 'pll'} : ${plan.primitive}`,
    '    generic map (',
    plan.generics.map(([n, v]) => `      ${n.padEnd(gw)} => ${v}`).join(',\n'),
    '    )',
    '    port map (',
    pins.map(([n, v]) => `      ${n.padEnd(pw)} => ${v ?? 'open'}`).join(',\n'),
    '    );',
    '',
    ...(dcm ? ['  -- CLK0 on a global buffer, fed back to CLKFB (CLK_FEEDBACK 1X)', '  u_bufg_clk0 : BUFG port map (I => clk0_u, O => clkfb_b);'] : []),
    ...plan.outputs.filter(o => !(dcm && o.pin === 'CLK0')).map(o => `  u_bufg_${o.pin.toLowerCase()} : BUFG port map (I => ${unbuf(o.pin)}, O => ${o.port});`),
    ...plan.outputs.filter(o => dcm && o.pin === 'CLK0').map(o => `  ${o.port} <= clkfb_b;`),
    ...(spec.locked ? [`  ${spec.locked} <= locked_i;`] : []),
    'end xilinx;',
    '',
  ];
  return L.join('\n');
}

function verilogOf(spec, plan) {
  const dcm = plan.primitive === 'DCM_SP';
  const ports = [`input  wire ${spec.input}`, ...(spec.reset ? [`input  wire ${spec.reset}`] : []),
    ...plan.outputs.map(o => `output wire ${o.port}`), ...(spec.locked ? [`output wire ${spec.locked}`] : [])];
  const sigs = ['clkin_b', ...(dcm ? ['clk0_u', 'clkfb_b'] : ['clkfb_u']), ...plan.outputs.filter(o => !(dcm && o.pin === 'CLK0')).map(o => unbuf(o.pin)), ...(spec.locked ? ['locked_i'] : [])];
  const vval = v => (v === 'TRUE' || v === 'FALSE' ? `"${v}"` : v);
  const gw = Math.max(...plan.generics.map(([n]) => n.length));
  const pins = pinsOf(spec, plan, unbuf).map(([n, v]) => [n, v === "'0'" ? "1'b0" : v]);
  const pw = Math.max(...pins.map(([n]) => n.length));
  const L = [
    wizardLine(spec, 'verilog'),
    ...describe(spec, plan, '//'),
    '`timescale 1ns / 1ps',
    '',
    `module ${spec.name} (`,
    `  ${ports.join(',\n  ')}`,
    ');',
    '',
    `  wire ${sigs.join(', ')};`,
    '',
    spec.ibufg ? `  IBUFG u_ibufg (.I(${spec.input}), .O(clkin_b));` : `  assign clkin_b = ${spec.input};`,
    '',
    `  ${plan.primitive} #(`,
    plan.generics.map(([n, v]) => `    .${n.padEnd(gw)} (${vval(v)})`).join(',\n'),
    `  ) u_${dcm ? 'dcm' : 'pll'} (`,
    pins.map(([n, v]) => `    .${n.padEnd(pw)} (${v ?? ''})`).join(',\n'),
    '  );',
    '',
    ...(dcm ? ['  // CLK0 on a global buffer, fed back to CLKFB (CLK_FEEDBACK 1X)', '  BUFG u_bufg_clk0 (.I(clk0_u), .O(clkfb_b));'] : []),
    ...plan.outputs.filter(o => !(dcm && o.pin === 'CLK0')).map(o => `  BUFG u_bufg_${o.pin.toLowerCase()} (.I(${unbuf(o.pin)}), .O(${o.port}));`),
    ...plan.outputs.filter(o => dcm && o.pin === 'CLK0').map(o => `  assign ${o.port} = clkfb_b;`),
    ...(spec.locked ? [`  assign ${spec.locked} = locked_i;`] : []),
    '',
    'endmodule',
    '',
  ];
  return L.join('\n');
}

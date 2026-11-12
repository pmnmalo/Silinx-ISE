// Stimuli drawn in the simulator's wave window (#336), as in the HDL Bencher (Test Bench Waveform) of the old
// Xilinx ISE: the inputs of the simulated module are a grid of cycles, a click on a cycle of an input changes
// its value there and up to its next change (0 → 1 → Z → X), and the outputs may hold expected values, checked
// against the simulation and in the test bench made from them (core/testbench.js).
//
// The model (saved in the project, per module):
//   { version: 1, clock: 'clk' | null, periodNs, stepNs, cycles,
//     inputs: { port: [bits per cycle] },     bits: the port's bits MSB first, each 0 1 Z X
//     expected: { port: [bits per cycle] } }  bits of 0 1, '-' = not checked
// Timing, the same as the test bench's (generateTestbench with startAtZero): with a clock, it is 0 at time 0,
// rises in the middle of each cycle and falls at its end; the inputs of cycle k change at its start (k · period,
// a falling edge) and the outputs are checked at its end, just before the inputs change again. Without a clock
// (combinational), cycle k is the step k: inputs at k · step, outputs checked at (k + 1) · step.
// A bus is edited whole (its value) or one bit at a time (#919: a bit of it expanded in the waves): either way its
// cells keep all its bits, so the test bench drives the whole bus as its bits were edited.

import * as V from './values.js';

export const MAX_CYCLES = 1024;
const STIM_BITS = ['0', '1', 'Z', 'X'];

const clampInt = (v, lo, hi, dft) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dft; };

/** The ports a stimulus model has: the 'in' ones are driven, the 'out' ones checked (inout ones are neither). */
const stimPorts = ports => ({ ins: ports.filter(p => p.dir === 'in'), outs: ports.filter(p => p.dir === 'out') });

/** A new model for the module of `ports` ([{ name, dir, width }]): every input 0, nothing expected. */
export function newStimuli(ports, { clock = null, periodNs = 20, stepNs = 10, cycles = 16 } = {}) {
  const m = { version: 1, clock: null, periodNs: 20, stepNs: 10, cycles: 16, inputs: {}, expected: {} };
  return normalizeStimuli({ ...m, clock, periodNs, stepNs, cycles }, ports);
}

/** The cycles of a combinational model (#1478): one per combination of the input bits, 1 with none, at most MAX_CYCLES. */
export const combinationCycles = ports => Math.min(MAX_CYCLES, 2 ** stimPorts(ports).ins.reduce((n, p) => n + p.width, 0));

/**
 * A saved model made right for the module's current ports: the timing in range, a clock that is a 1-bit input,
 * every input and output with one cell a cycle of its width (new ports 0 / not checked, removed ones dropped).
 */
export function normalizeStimuli(m, ports) {
  const { ins, outs } = stimPorts(ports);
  const cycles = clampInt(m?.cycles, 1, MAX_CYCLES, 16);
  const clock = ins.find(p => p.width === 1 && p.name === m?.clock)?.name || null;
  const out = {
    version: 1, clock, periodNs: clampInt(m?.periodNs, 2, 1e9, 20), stepNs: clampInt(m?.stepNs, 1, 1e9, 10), cycles,
    inputs: {}, expected: {},
  };
  const cells = (list, w, ok, dft) => {
    const src = Array.isArray(list) ? list : [];
    const r = [];
    for (let k = 0; k < cycles; k++) {
      const v = String(src[k] ?? (k ? r[k - 1] : dft)).toUpperCase();
      r.push(v.length === w && ok.test(v) ? v : (k ? r[k - 1] : dft));
    }
    return r;
  };
  for (const p of ins) if (p.name !== clock) out.inputs[p.name] = cells(m?.inputs?.[p.name], p.width, /^[01ZX]+$/, '0'.repeat(p.width));
  for (const p of outs) out.expected[p.name] = cells(m?.expected?.[p.name], p.width, /^[01-]+$/, '-'.repeat(p.width));
  return out;
}

/** The length of a cycle in ps. */
export const cyclePs = m => (m.clock ? m.periodNs : m.stepNs) * 1000;

/** The next value of a 1-bit input cell, as a click makes it: 0 → 1 → Z → X → 0. */
export const nextBit = v => STIM_BITS[(STIM_BITS.indexOf(String(v).toUpperCase()) + 1) % STIM_BITS.length] || '0';
/** The next expected value of a 1-bit output cell: - → 0 → 1 → -. */
export const nextExpected = v => ({ '-': '0', 0: '1', 1: '-' })[v] ?? '-';

/**
 * Set cell k of a list to `value` as the HDL Bencher does: from cycle k up to the next change (the cells after k
 * that held the old value of cell k take the new one). Returns the list (changed in place).
 */
export function paintCells(list, k, value) {
  if (k < 0 || k >= list.length) return list;
  const old = list[k];
  for (let j = k; j < list.length && list[j] === old; j++) list[j] = value;
  return list;
}

/** A click on cycle k of an input (1 bit: its next value; a bus: `value`, its bits). Returns true if it changed. */
export function editInput(m, port, k, value = null) {
  const list = m.inputs[port];
  if (!list || k < 0 || k >= list.length) return false;
  const v = value == null ? nextBit(list[k]) : String(value).toUpperCase();
  if (v.length !== list[k].length || !/^[01ZX]+$/.test(v) || v === list[k]) return false;
  paintCells(list, k, v);
  return true;
}
/** A click on cycle k of an output's expected values (1 bit: its next one; a bus: `value`, bits or all -). */
export function editExpected(m, port, k, value = null) {
  const list = m.expected[port];
  if (!list || k < 0 || k >= list.length) return false;
  const v = value == null ? nextExpected(list[k]) : String(value).toUpperCase();
  if (v.length !== list[k].length || !/^[01-]+$/.test(v) || v === list[k]) return false;
  paintCells(list, k, v);
  return true;
}

/**
 * Set bit i (0 = the leftmost, MSB first) of cell k of a bus's list to `bit`, from cycle k up to the bit's next change
 * (the cells after k whose bit i held the old one take the new one; their other bits stay). Returns the list.
 */
export function paintBit(list, k, i, bit) {
  if (k < 0 || k >= list.length || i < 0 || i >= list[k].length) return list;
  const old = list[k][i];
  for (let j = k; j < list.length && list[j][i] === old; j++) list[j] = list[j].slice(0, i) + bit + list[j].slice(i + 1);
  return list;
}

/**
 * A click on cycle k of bit i of a bus input (#919: i counts from the left, MSB first, as the cells' bits): its next
 * value (0 → 1 → Z → X) or `value`, as a 1-bit input's; the bus's value follows. Returns true if it changed.
 */
export function editInputBit(m, port, i, k, value = null) {
  const list = m.inputs[port];
  if (!list || k < 0 || k >= list.length || !Number.isInteger(i) || i < 0 || i >= list[k].length) return false;
  const v = value == null ? nextBit(list[k][i]) : String(value).toUpperCase();
  if (!STIM_BITS.includes(v) || v === list[k][i]) return false;
  paintBit(list, k, i, v);
  return true;
}
/** A click on cycle k of bit i of a bus output's expected values (#919): its next one (- → 0 → 1) or `value`. */
export function editExpectedBit(m, port, i, k, value = null) {
  const list = m.expected[port];
  if (!list || k < 0 || k >= list.length || !Number.isInteger(i) || i < 0 || i >= list[k].length) return false;
  const v = value == null ? nextExpected(list[k][i]) : String(value).toUpperCase();
  if (!['0', '1', '-'].includes(v) || v === list[k][i]) return false;
  paintBit(list, k, i, v);
  return true;
}

/**
 * When things happen, in ps: the end of the run, the clock (null without one), each input's changes
 * [{ t, bits }] (the first at 0) and the check time of each cycle (just before its end).
 */
export function stimulusPlan(m) {
  const P = cyclePs(m);
  const changes = {};
  for (const [port, list] of Object.entries(m.inputs)) {
    changes[port] = [];
    list.forEach((bits, k) => { if (!k || bits !== list[k - 1]) changes[port].push({ t: k * P, bits }); });
  }
  return {
    endPs: m.cycles * P,
    clock: m.clock ? { port: m.clock, periodPs: P } : null,
    changes,
    checks: Array.from({ length: m.cycles }, (_, k) => (k + 1) * P - 1),
  };
}

/**
 * The expected outputs compared with a simulation: `valueAt(port, tPs)` gives the bits of a port (MSB first,
 * 0 1 x z) at a time. Returns the mismatches [{ port, k, expected, got }] (a '-' bit is not checked).
 */
export function checkExpected(m, valueAt) {
  const { checks } = stimulusPlan(m);
  const bad = [];
  for (const [port, list] of Object.entries(m.expected)) {
    list.forEach((exp, k) => {
      if (!/[01]/.test(exp)) return;
      const got = String(valueAt(port, checks[k]) ?? '').toUpperCase();
      if ([...exp].some((e, i) => e !== '-' && e !== got[i])) bad.push({ port, k, expected: exp, got });
    });
  }
  return bad;
}

/** The expected outputs taken from a simulation (bits other than 0 / 1 become '-', not checked). */
export function fillExpected(m, valueAt) {
  const { checks } = stimulusPlan(m);
  for (const port of Object.keys(m.expected)) {
    const w = m.expected[port][0]?.length || 1;
    m.expected[port] = checks.map(t => {
      const got = String(valueAt(port, t) ?? '').toUpperCase().padStart(w, 'X').slice(-w);
      return got.replace(/[^01]/g, '-');
    });
  }
  return m;
}

/** The test bench's options (core/testbench.js generateTestbench) for the model and the module's ports. */
export function testbenchOptions(m, { name, lang, uut, ports }) {
  const vectors = Array.from({ length: m.cycles }, (_, k) => ({
    in: Object.fromEntries(Object.entries(m.inputs).map(([p, l]) => [p, l[k]])),
    exp: Object.fromEntries(Object.entries(m.expected).map(([p, l]) => [p, l[k]])),
  }));
  return {
    name, lang, uut, ports, vectors, startAtZero: true,
    clock: m.clock ? { port: m.clock, periodNs: m.periodNs } : null,
    settleNs: m.stepNs,
  };
}

/**
 * Schedule the model's stimuli on a simulator just reset (core/simulator.js): the clock and every input forced
 * at their times. `sigOf(port)` gives the signal of a port of the simulated module (null: left alone).
 */
export function applyStimuli(sim, sigOf, m) {
  const plan = stimulusPlan(m);
  if (plan.clock) {
    const sig = sigOf(plan.clock.port), P = plan.clock.periodPs;
    if (sig) for (let k = 0; k < m.cycles; k++) {
      sim.at(k * P, s => s.force(sig, V.ZERO));
      sim.at(k * P + Math.floor(P / 2), s => s.force(sig, V.ONE));
    }
    if (sig) sim.at(plan.endPs, s => s.force(sig, V.ZERO));
  }
  for (const [port, list] of Object.entries(plan.changes)) {
    const sig = sigOf(port);
    if (sig) for (const c of list) sim.at(c.t, s => s.force(sig, V.fromBits(c.bits)));
  }
  return plan;
}

/**
 * The bits of a value typed in for a cell of a bus `width` bits wide: bits MSB first (0 1 Z X, an expected value
 * 0 1 -; fewer: padded with 0), h… hexadecimal, d… or a number with other digits decimal; - alone: not checked. Throws on
 * a value that is not one of those or does not fit.
 */
export function parseCellValue(text, width, { expected = false } = {}) {
  const t = String(text).trim().replace(/_/g, '');
  if (expected && t === '-') return '-'.repeat(width);
  // (digits 0 / 1 only are bits, as the HDL Bencher reads them: d10 is ten)
  let bits;
  if (expected ? /^[01-]+$/.test(t) : /^[01zx]+$/i.test(t)) bits = t.toUpperCase();
  else if (/^(0x|h)[0-9a-f]+$/i.test(t)) bits = BigInt(`0x${t.replace(/^(0x|h)/i, '')}`).toString(2);
  else if (/^d?\d+$/i.test(t)) bits = BigInt(t.replace(/^d/i, '')).toString(2);
  else throw new Error(`'${text}' is not a value (bits${expected ? ', -' : ' 0 1 Z X'}, h… hexadecimal or d… decimal)`);
  if (bits.length > width) {
    if (/^0+$/.test(bits.slice(0, bits.length - width))) bits = bits.slice(-width);
    else throw new Error(`'${text}' does not fit in ${width} bit(s)`);
  }
  return bits.padStart(width, '0');
}

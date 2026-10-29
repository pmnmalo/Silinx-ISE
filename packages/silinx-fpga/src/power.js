// The Silinx toolchain's estimated power report (#123): the "Generate Text Power Report" process
// without ISE. Xilinx XPower uses Xilinx's power models, which Silinx does not have: this is an
// estimate, said as such in the report, from
//   - the static (quiescent) power of the device: the supplies' quiescent currents XPower 14.7 gives
//     for each device of the Silinx toolchain (Spartan-3E, Commercial, Typical process, 25 °C ambient);
//   - the dynamic power of what the routed design uses: its clocks (their buffers and global nets),
//     its logic (LUTs, flip-flops, carry), its signals (each net by its fanout) and its I/Os, each
//     by its switching rate. The rates are propagated through the design as XPower does without a
//     simulation ("vectorless"): every flip-flop toggles at 12.5 % of its clock (XPower's default), the
//     inputs at 12.5 % of the fastest clock, and each LUT's output at the rate its inputs' rates give
//     it through the LUT's function (transition density, Najm 1993);
//   - coefficients fitted to XPower's reports of the examples on every device of the Silinx
//     toolchain (scripts/measure-power.mjs; the comparison in test/power.test.js).
// The clocks' frequencies are the PERIOD constraints of the UCF.
import { evalLut } from './xdl.js';
import { clockPort } from './fpga/timing.js';

/** XPower's default activity rates, which the estimate uses too. */
export const DEFAULT_RATES = { ffToggle: 0.125, ioToggle: 0.125, outputLoadPf: 5, ffPasses: 3 };
/** The estimate against XPower on the examples (scripts/measure-power.mjs --compare, test/power.test.js):
 *  its total within ESTIMATE_ERROR_PERCENT %, its dynamic part within DYNAMIC_RANGE times XPower's. */
export const ESTIMATE_ERROR_PERCENT = 10;
export const DYNAMIC_RANGE = [0.35, 2.2];
/** The frequency of a clock with no PERIOD constraint (the Basys2's and Nexys2's oscillator). */
export const DEFAULT_CLOCK_MHZ = 50;

// ------------------------------------------------------------------ the clocks
/**
 * The clocks of a routed design (core/xdl.js parseXdl): [{ net (the global clock net), port (its pad,
 * or null), mhz, constrained, buffers (the BUFGMUX instances), loads (clock pins), slices }] from
 * the BUFGMUX outputs, their frequencies from the UCF's PERIOD constraints (core/ucf.js
 * parseUcf().clocks: [{ net: the port, period }]).
 */
export function designClocks(design, periods = []) {
  const insts = new Map(design.insts.map(i => [i.name, i]));
  const byPort = new Map(periods.filter(p => p.period > 0).map(p => [String(p.net).toLowerCase(), 1000 / p.period]));
  const out = [];
  for (const n of design.nets) {
    const drv = n.outpins?.[0];
    if (!drv || !/^BUFG/.test(insts.get(drv.inst)?.type || '')) continue;
    const port = clockPort(design, n.name);
    const mhz = port ? byPort.get(port.toLowerCase()) : undefined;
    const loads = (n.inpins || []).filter(p => /^CLK/.test(p.pin));
    out.push({ net: n.name, port, mhz: mhz ?? DEFAULT_CLOCK_MHZ, constrained: mhz !== undefined, buffers: [drv.inst],
      loads: n.inpins.length, slices: new Set(loads.filter(p => /^SLICE/.test(insts.get(p.inst)?.type || '')).map(p => p.inst)).size });
  }
  return out;
}

// ------------------------------------------------------------------ the switching activity
// An activity: { p: the probability the signal is high, d: its transition density, in transitions
// per microsecond (millions of transitions per second, XPower's "Signal Rate") }.
const ZERO = { p: 0, d: 0 }, ONE = { p: 1, d: 0 };
const cfgOf = inst => new Map(inst.cfg.map(c => [c.attr, c]));

/** The activity of a LUT's output (its equation over A1..A4) from its inputs' (Najm's transition density). */
export function lutActivity(eq, ins) {
  const used = [...new Set(String(eq).match(/A[1-6]/g) || [])].sort();
  if (!used.length) { const v = evalLut(eq, {}); return v ? ONE : ZERO; }
  const n = used.length, act = used.map(a => ins[a] || ZERO);
  const f = new Uint8Array(1 << n);
  for (let x = 0; x < 1 << n; x++) { const v = {}; used.forEach((a, k) => { v[a] = (x >> k) & 1; }); f[x] = evalLut(eq, v); }
  // the probability of the inputs' values x, input `skip` left out
  const prob = (x, skip = -1) => { let q = 1; for (let k = 0; k < n; k++) if (k !== skip) q *= (x >> k) & 1 ? act[k].p : 1 - act[k].p; return q; };
  let p = 0, d = 0;
  for (let x = 0; x < 1 << n; x++) if (f[x]) p += prob(x);
  // the Boolean difference of each input: the probability that its change changes the output
  for (let k = 0; k < n; k++) {
    if (!act[k].d) continue;
    let sens = 0;
    for (let x = 0; x < 1 << n; x++) if (!((x >> k) & 1) && f[x] !== f[x | (1 << k)]) sens += prob(x, k);
    d += sens * act[k].d;
  }
  return { p: Math.min(1, Math.max(0, p)), d };
}

// a 2-to-1 multiplexer's output (o = s ? a : b), its inputs independent
function muxActivity(s, a, b) {
  const p = s.p * a.p + (1 - s.p) * b.p;
  const differ = a.p * (1 - b.p) + b.p * (1 - a.p);
  return { p, d: s.p * a.d + (1 - s.p) * b.d + differ * s.d };
}
const xorActivity = (a, b) => ({ p: a.p * (1 - b.p) + b.p * (1 - a.p), d: a.d + b.d });

/**
 * The switching activity of every net of a routed design: Map(net name -> { p, d }), d in
 * transitions per microsecond. clocks: designClocks(); rates: DEFAULT_RATES. Iterated until it
 * settles (the flip-flops' feedback): each flip-flop toggles at most once per cycle of its clock, and
 * at rates.ffToggle of it when its input is not known.
 */
export function designActivity(design, clocks, rates = DEFAULT_RATES) {
  const insts = new Map(design.insts.map(i => [i.name, i]));
  const cfgs = new Map(design.insts.map(i => [i.name, cfgOf(i)]));
  const pinNet = new Map();   // "inst\tpin" -> net name (an input pin's net)
  const driver = new Map();   // net name -> { inst, pin }
  const pinOut = new Map();   // "inst\tpin" -> net name (an output pin's net)
  const insByInst = new Map();   // inst -> [[pin, net]] of its inputs
  for (const n of design.nets) {
    for (const p of n.inpins || []) {
      pinNet.set(`${p.inst}\t${p.pin}`, n.name);
      if (!insByInst.has(p.inst)) insByInst.set(p.inst, []);
      insByInst.get(p.inst).push([p.pin, n.name]);
    }
    if (n.outpins?.[0]) { driver.set(n.name, n.outpins[0]); pinOut.set(`${n.outpins[0].inst}\t${n.outpins[0].pin}`, n.name); }
  }
  let ffUpdate = false;   // (the flip-flops' outputs: held while the logic settles, then updated)
  const clockMhz = new Map(clocks.map(c => [c.net, c.mhz]));
  const portMhz = new Map(clocks.filter(c => c.port).map(c => [c.port, c.mhz]));
  // (no clock: the inputs do not toggle, as in XPower)
  const fmax = clocks.reduce((m, c) => Math.max(m, c.mhz), 0);
  const nets = new Map(design.nets.map(n => [n.name, n.type === 'vcc' ? ONE : n.type === 'gnd' ? ZERO : ZERO]));
  // a net's activity; while a flip-flop's input is computed with its output forced (override), the
  // logic between them is computed again, `depth` levels of it
  const override = new Map();
  let depth = 0;
  const netAct = n => {
    if (override.has(n)) return override.get(n);
    const drv = depth > 0 && driver.get(n);
    if (drv && /^SLICE/.test(insts.get(drv.inst)?.type || '') && !/^[XY]Q$/.test(drv.pin)) {
      depth--;
      try { return outPin(drv); } finally { depth++; }
    }
    return nets.get(n) || ZERO;
  };
  const at = (inst, pin) => { const n = pinNet.get(`${inst}\t${pin}`); return n === undefined ? null : netAct(n); };
  const free = mhz => ({ p: 0.5, d: rates.ffToggle * mhz });
  const ffClock = inst => clockMhz.get(pinNet.get(`${inst}\tCLK`)) ?? fmax;

  function slicePin(inst, pin) {
    const c = cfgs.get(inst.name);
    const v = attr => c.get(attr)?.value || '';
    const lut = (which) => {
      const def = v(which);
      const m = /#LUT:D=(.*)$/.exec(def);
      if (!m) return /#(RAM|ROM|SHIFT)/.test(def) ? free(ffClock(inst.name)) : ZERO;
      const ins = {};
      for (let k = 1; k <= 4; k++) ins[`A${k}`] = at(inst.name, `${which}${k}`) || ZERO;
      return lutActivity(`D=${m[1]}`, ins);
    };
    const bx = () => at(inst.name, 'BX') || ZERO, by = () => at(inst.name, 'BY') || ZERO;
    const cin = () => at(inst.name, 'CIN') || ZERO;
    const f5 = () => muxActivity(bx(), lut('F'), lut('G'));
    const fx = () => muxActivity(by(), at(inst.name, 'FXINA') || ZERO, at(inst.name, 'FXINB') || ZERO);
    const carryF = () => muxActivity(lut('F'), v('CYINIT') === 'BX' ? bx() : cin(), v('CY0F') === '1' ? ONE : ZERO);
    const x = () => { const s = v('FXMUX'); return s === 'F5' ? f5() : s === 'FXOR' ? xorActivity(lut('F'), v('CYINIT') === 'BX' ? bx() : cin()) : lut('F'); };
    const y = () => { const s = v('GYMUX'); return s === 'FX' ? fx() : s === 'GXOR' ? xorActivity(lut('G'), carryF()) : lut('G'); };
    // a flip-flop: at first at the default rate of its clock (XPower's), then (rates.ffPasses times) as
    // its input makes it change, times its clock enable's probability. An input that does not depend
    // on Q (a register of data) passes its rate on; one that does (a counter's bit, an enable made with
    // a LUT: D = en ? x : Q) changes at most at the rate of its other inputs and at most when D differs
    // from Q at an edge: P(D ≠ Q) from its input with Q forced to 1 and to 0
    const ff = (dmux, path, b, q) => {
      const own = nets.get(q) || free(ffClock(inst.name));
      if (!ffUpdate) return own;
      const mhz = ffClock(inst.name);
      const input = forced => { override.set(q, forced); depth = 3; try { return v(dmux) === '0' ? b() : path(); } finally { depth = 0; override.delete(q); } };
      const d1 = input(ONE), d0 = input(ZERO), held = input({ p: own.p, d: 0 });
      let ce = at(inst.name, 'CE');
      ce = ce ? (v('CEINV') === 'CE_B' ? { p: 1 - ce.p, d: ce.d } : ce) : ONE;
      if (Math.abs(d1.p - d0.p) < 1e-12 && held.d === 0 && (held.p === 0 || held.p === 1)) return { p: held.p, d: 0 };
      if (Math.abs(d1.p - d0.p) < 1e-12) return { p: held.p, d: Math.min(mhz, ce.p * held.d) };
      const change = own.p * (1 - d1.p) + (1 - own.p) * d0.p;
      // (its probability of being high: the fixed point of p = p·P(D | Q = 1) + (1 - p)·P(D | Q = 0))
      const den = 1 - d1.p + d0.p;
      // (nothing but Q in its input, a toggle: its rate as it was)
      return { p: den > 1e-12 ? d0.p / den : own.p, d: Math.min(mhz, held.d ? ce.p * held.d : own.d, mhz * change * ce.p) };
    };
    const qNet = q => pinOut.get(`${inst.name}\t${q}`);
    switch (pin) {
      case 'X': return x();
      case 'Y': return y();
      case 'XQ': return ff('DXMUX', x, bx, qNet('XQ'));
      case 'YQ': return ff('DYMUX', y, by, qNet('YQ'));
      case 'F5': return f5();
      case 'FX': return fx();
      case 'XB': return carryF();
      case 'YB': case 'COUT': return muxActivity(lut('G'), carryF(), v('CY0G') === '1' ? ONE : ZERO);
      default: return free(ffClock(inst.name));
    }
  }

  function outPin(drv) {
    const inst = insts.get(drv.inst);
    if (!inst) return ZERO;
    const t = inst.type;
    if (t === 'VCC') return ONE;
    if (t === 'GND') return ZERO;
    if (/^(IOB|IBUF|IBUFG|IOBS|IOBM|DIFFM|DIFFS)$/.test(t)) {
      const mhz = portMhz.get(inst.name);
      return mhz ? { p: 0.5, d: 2 * mhz } : { p: 0.5, d: rates.ioToggle * fmax };
    }
    if (/^BUFG/.test(t)) return { p: 0.5, d: 2 * (clockMhz.get([...driver].find(([, v]) => v.inst === inst.name)?.[0]) ?? fmax) };
    if (/^SLICE/.test(t)) return slicePin(inst, drv.pin);
    // a multiplier, a block RAM…: its outputs at the mean rate of its inputs (but its clock's)
    const ins = (insByInst.get(inst.name) || []).filter(([pin]) => !/^CLK/.test(pin)).map(([, n]) => netAct(n));
    return ins.length ? { p: 0.5, d: ins.reduce((t, x) => t + x.d, 0) / ins.length } : free(fmax);
  }

  // the flip-flops at the default rate; the logic settles; the flip-flops follow their inputs, the
  // logic settles again (rates.ffPasses times)
  for (const [name, drv] of driver) if (/Q$/.test(drv.pin)) nets.set(name, free(ffClock(drv.inst)));
  const isFf = drv => /^SLICE/.test(insts.get(drv.inst)?.type || '') && /^[XY]Q$/.test(drv.pin);
  const settle = () => {
    for (let pass = 0; pass < 30; pass++) {
      let change = 0;
      for (const [name, drv] of driver) {
        if (isFf(drv)) continue;
        const a = outPin(drv), old = nets.get(name) || ZERO;
        change = Math.max(change, Math.abs(a.d - old.d), Math.abs(a.p - old.p));
        nets.set(name, a);
      }
      if (change < 1e-6) break;
    }
  };
  settle();
  for (let k = 0; k < (rates.ffPasses ?? 1); k++) {
    ffUpdate = true;
    const next = [...driver].filter(([, drv]) => isFf(drv)).map(([name, drv]) => [name, outPin(drv)]);
    ffUpdate = false;
    for (const [name, a] of next) nets.set(name, a);
    settle();
  }
  for (const n of design.nets) if (n.type === 'vcc') nets.set(n.name, ONE); else if (n.type === 'gnd') nets.set(n.name, ZERO);
  return nets;
}

// ------------------------------------------------------------------ the model
// Fitted to XPower 14.7's reports of the examples (scripts/measure-power.mjs --fit; test/power.test.js
// checks they are the fit of test/fixtures/power/xpower-examples.json): mW per unit.
export const COEFFICIENTS = {
  bufgPerMhz: 0.012,           // a global clock buffer (BUFGMUX), per MHz of its clock
  lutPerRate: 2.531e-4,        // a LUT (or F5 / FX multiplexer), per Mtr/s of its output
  ffPerRate: 3.125e-4,         // a flip-flop, per Mtr/s of its output
  netPerRate: 7.236e-6,        // a net, per Mtr/s
  netFanoutPerRate: 1.036e-4,  // a net, per Mtr/s and per load
  outputPerRate25: 0.08287,    // an output of 2.5 V (LVCMOS25, 12 mA, 5 pF), per Mtr/s; ∝ Vcco²
  inputPerRate: 1.047e-3,      // an input, per Mtr/s
  outputVcco: 0.92,            // the share of an output's power on its Vcco (the rest on Vccint)
};
// The devices of the Silinx toolchain: a global clock net (mW per MHz, and per MHz and slice it
// reaches); the supplies' quiescent currents (mA) at 25 °C junction and how Vccint's grows with the
// temperature (mA per °C); the package's junction-to-ambient resistance (°C/W, still air): XPower
// 14.7, Commercial, Typical process.
export const DEVICES = {
  xc3s100e: { clockNetPerMhz: 8.639e-3, clockSlicePerMhz: 1.319e-4, vccint: 7.983, vccintPerC: 0.132, vccaux: 8, vcco: 1.5, thetaJa: 62.1 },
  xc3s250e: { clockNetPerMhz: 5.701e-3, clockSlicePerMhz: 1.595e-4, vccint: 15.08, vccintPerC: 0.2009, vccaux: 12, vcco: 1.5, thetaJa: 48.5 },
  xc3s500e: { clockNetPerMhz: 6.942e-3, clockSlicePerMhz: 1.961e-4, vccint: 24.95, vccintPerC: 0.41, vccaux: 18, vcco: 2, thetaJa: 26.1 },
  xc3s1200e: { clockNetPerMhz: 6.870e-3, clockSlicePerMhz: 2.317e-4, vccint: 50.59, vccintPerC: 0.6292, vccaux: 35, vcco: 3, thetaJa: 23 },
};
const VCCINT = 1.2, VCCAUX = 2.5;
const STD_VOLTS = [[/^(LVCMOS33|LVTTL|PCI33_3)/, 3.3], [/^LVCMOS25/, 2.5], [/^LVCMOS18/, 1.8], [/^LVCMOS15/, 1.5], [/^LVCMOS12/, 1.2], [/^(SSTL2|HSTL_.*_25|LVDS_25|RSDS_25|BLVDS_25|MINI_LVDS_25|LVPECL_25|DIFF_SSTL2)/, 2.5], [/^(SSTL18|HSTL.*18|DIFF_HSTL.*18|DIFF_SSTL18)/, 1.8]];
const stdVolts = std => (STD_VOLTS.find(([re]) => re.test(std)) || [null, 2.5])[1];

/**
 * The estimate for a routed design (core/xdl.js parseXdl): { part, clocks, logic, signals, ios,
 * clocksMw, logicMw, signalsMw, iosMw, dynamicMw, staticMw, totalMw, supplies, junctionC, warnings }.
 * periods: the UCF's PERIOD constraints (core/ucf.js parseUcf().clocks); device: 'xc3s250e'…
 */
export function estimatePower(design, { device, periods = [], rates = DEFAULT_RATES, ambientC = 25 } = {}) {
  const K = COEFFICIENTS;
  const dev = DEVICES[device];
  const warnings = [];
  if (!dev) warnings.push(`no static power model of ${device}: the static power is not included`);
  const clocks = designClocks(design, periods);
  for (const c of clocks.filter(c => !c.constrained)) warnings.push(`no PERIOD constraint on the clock ${c.port || c.net}: ${DEFAULT_CLOCK_MHZ} MHz assumed`);
  const act = designActivity(design, clocks, rates);
  const insts = new Map(design.insts.map(i => [i.name, i]));
  const rate = net => act.get(net)?.d || 0;
  const r2 = x => Math.round(x * 100) / 100;

  // clocks: their buffers and global nets (an unknown device: the largest's net)
  const net = dev || DEVICES.xc3s1200e;
  for (const c of clocks) c.mw = c.mhz * (K.bufgPerMhz + net.clockNetPerMhz + net.clockSlicePerMhz * c.slices);
  // (the clocks' nets: the global nets and the ones into their buffers, as XPower counts them)
  const clockNets = new Set(clocks.map(c => c.net));
  for (const n of design.nets) if (n.inpins?.some(p => /^BUFG/.test(insts.get(p.inst)?.type || '') && /^I0?$/.test(p.pin))) clockNets.add(n.name);
  // logic: the LUTs and flip-flops of the slices, each by the rate of its output
  let luts = 0, ffs = 0, logicMw = 0;
  const netOfPin = new Map();
  for (const n of design.nets) for (const p of n.outpins || []) netOfPin.set(`${p.inst}\t${p.pin}`, n.name);
  for (const i of design.insts) {
    if (!/^SLICE/.test(i.type)) continue;
    const cfg = cfgOf(i);
    const lutOut = { F: ['X', 'XB', 'F5'], G: ['Y', 'YB', 'COUT', 'FX'] };
    for (const which of ['F', 'G']) {
      if (!/#(LUT|RAM|ROM)/.test(cfg.get(which)?.value || '')) continue;
      luts++;
      logicMw += K.lutPerRate * Math.max(0, ...lutOut[which].map(p => rate(netOfPin.get(`${i.name}\t${p}`))));
    }
    for (const [ff, q] of [['FFX', 'XQ'], ['FFY', 'YQ']]) {
      if (!cfg.has(ff)) continue;
      ffs++;
      logicMw += K.ffPerRate * rate(netOfPin.get(`${i.name}\t${q}`));
    }
  }
  // signals: every net but the clocks' and the constants', by its rate and its loads
  let nets = 0, signalsMw = 0;
  for (const n of design.nets) {
    if (clockNets.has(n.name) || n.type === 'vcc' || n.type === 'gnd' || !n.outpins?.length || !n.inpins?.length) continue;
    nets++;
    signalsMw += rate(n.name) * (K.netPerRate + K.netFanoutPerRate * n.inpins.length);
  }
  // I/Os: an output by its rate and its Vcco, an input by its rate
  const ios = [];
  for (const i of design.insts) {
    if (!/^(IOB|IBUF|IOBS|IOBM)$/.test(i.type)) continue;
    const cfg = cfgOf(i);
    const std = cfg.get('IOATTRBOX')?.value || 'LVCMOS25';
    const isOut = cfg.has('OUTBUF') || cfg.has('OMUX');
    const net = isOut ? [...design.nets].find(n => n.inpins?.some(p => p.inst === i.name && /^O1$/.test(p.pin)))?.name : netOfPin.get(`${i.name}\tI`);
    const r = rate(net);
    const v = stdVolts(std);
    const mw = isOut ? K.outputPerRate25 * (v / 2.5) ** 2 * r : K.inputPerRate * r;
    ios.push({ name: i.name, dir: isOut ? 'out' : 'in', std: isOut ? `${std}_${cfg.get('DRIVEATTRBOX')?.value || 12}_${cfg.get('SLEW')?.value || 'SLOW'}` : std, vcco: v, rate: r, mw });
  }
  const clocksMw = clocks.reduce((s, c) => s + c.mw, 0), iosMw = ios.reduce((s, i) => s + i.mw, 0);
  const dynamicMw = clocksMw + logicMw + signalsMw + iosMw;
  // static: the quiescent currents at the junction temperature the total power gives (twice: it settles)
  const vccos = [...new Set(ios.map(i => i.vcco))].sort((a, b) => b - a);
  if (!vccos.length) vccos.push(2.5);
  let tj = ambientC, q = null;
  for (let k = 0; k < 3; k++) {
    q = dev ? { vccint: dev.vccint + dev.vccintPerC * (tj - 25), vccaux: dev.vccaux, vcco: dev.vcco } : { vccint: 0, vccaux: 0, vcco: 0 };
    const staticMw = q.vccint * VCCINT + q.vccaux * VCCAUX + q.vcco * vccos[0];
    tj = ambientC + (dev ? dev.thetaJa : 0) * (staticMw + dynamicMw) / 1000;
  }
  const staticMw = q.vccint * VCCINT + q.vccaux * VCCAUX + q.vcco * vccos[0];
  // the supplies: the core on Vccint, the outputs mostly on their Vcco, the inputs on Vccaux
  const outMw = ios.filter(i => i.dir === 'out').reduce((s, i) => s + i.mw, 0), inMw = iosMw - outMw;
  const supplies = [
    { name: 'Vccint', volts: VCCINT, dynamicMa: (clocksMw + logicMw + signalsMw + outMw * (1 - K.outputVcco)) / VCCINT, quiescentMa: q.vccint },
    { name: 'Vccaux', volts: VCCAUX, dynamicMa: inMw / VCCAUX, quiescentMa: q.vccaux },
    ...vccos.map((v, k) => ({ name: `Vcco${Math.round(v * 10)}`, volts: v, dynamicMa: ios.filter(i => i.dir === 'out' && i.vcco === v).reduce((s, i) => s + i.mw, 0) * K.outputVcco / v, quiescentMa: k ? 0 : q.vcco })),
  ].map(s => ({ ...s, totalMa: s.dynamicMa + s.quiescentMa }));
  return {
    device, clocks, logic: { luts, ffs }, signals: { nets }, ios, activity: act,
    clocksMw: r2(clocksMw), logicMw: r2(logicMw), signalsMw: r2(signalsMw), iosMw: r2(iosMw),
    dynamicMw: r2(dynamicMw), staticMw: r2(staticMw), totalMw: r2(dynamicMw + staticMw), junctionC: Math.round(tj * 10) / 10,
    supplies, warnings,
  };
}

// ------------------------------------------------------------------ the report
// a table as XPower draws them: | a | b | between lines of dashes
function table(title, head, rows) {
  const cols = head.length;
  const w = head.map((h, k) => Math.max(String(h).length, ...rows.map(r => String(r[k] ?? '').length)));
  const line = cells => `| ${cells.map((c, k) => (k ? String(c ?? '').padStart(w[k]) : String(c ?? '').padEnd(w[k]))).join(' | ')} |`;
  const width = line(head).length;
  const dash = '-'.repeat(width);
  const out = [dash];
  if (title) out.push(`|${title.padStart(Math.floor((width - 2 + title.length) / 2)).padEnd(width - 2)}|`, dash);
  out.push(line(head), dash, ...rows.map(line), dash);
  return out;
}
const f2 = x => (x == null ? '' : x.toFixed(2));

/**
 * The text of the estimate (build/<top>.pwr), laid out as XPower's text report: its summary's "Supply
 * Power (mW)" line is the one the Design Summary reads (server/ise.js parsePwr).
 * est: estimatePower(); { top, part (xc3s250ecp132-4), errorPercent: the estimate's error on the examples }.
 */
export function powerReport(est, { top, part, errorPercent = null, rates = DEFAULT_RATES } = {}) {
  const used = { clocks: est.clocks.length, ios: est.ios.length };
  const out = [
    'Silinx toolchain - estimated power (not Xilinx XPower)',
    '',
    `An ESTIMATE of the power of '${top}' on ${part}: the static power of the device and the dynamic`,
    'power of the routed design (its clocks, logic, signals and I/Os) at the switching rates of',
    'XPower\'s vectorless estimate (no simulation), with coefficients fitted to XPower 14.7 on the examples.',
    ...(errorPercent != null ? [`On the examples its total is within ${errorPercent} % of XPower's, its dynamic power alone within`,
      `${DYNAMIC_RANGE[0]} to ${DYNAMIC_RANGE[1]} times XPower's.`] : []),
    'For a figure to rely on, run XPower in an ISE mode (Toolchain Settings).',
    '',
    '1.  Settings',
    ...table('Device', ['Part', part], [['Process', 'Typical'], ['Temp Grade', 'Commercial']]),
    '',
    ...table('Default Activity Rates', ['Rate', '%'], [['FF Toggle Rate (%)', (rates.ffToggle * 100).toFixed(1)], ['I/O Toggle Rate (%)', (rates.ioToggle * 100).toFixed(1)], ['Output Load (pF)', rates.outputLoadPf.toFixed(1)]]),
    '',
    '2.  Summary',
    ...table('On-Chip Power Summary', ['On-Chip', 'Power (mW)', 'Used'], [
      ['Clocks', f2(est.clocksMw), used.clocks], ['Logic', f2(est.logicMw), est.logic.luts + est.logic.ffs], ['Signals', f2(est.signalsMw), est.signals.nets],
      ['IOs', f2(est.iosMw), used.ios], ['Static Power', f2(est.staticMw), ''], ['Total', f2(est.totalMw), '']]),
    '',
    ...table('Thermal Summary', ['Junction Temp (C)', est.junctionC.toFixed(1)], [['Ambient Temp (C)', '25.0']]),
    '',
    ...table('Power Supply Summary', ['', 'Total', 'Dynamic', 'Static Power'], [['Supply Power (mW)', f2(est.totalMw), f2(est.dynamicMw), f2(est.staticMw)]]),
    '',
    ...table('Power Supply Currents', ['Supply Source', 'Supply Voltage', 'Total Current (mA)', 'Dynamic Current (mA)', 'Quiescent Current (mA)'],
      est.supplies.map(s => [s.name, s.volts.toFixed(3), f2(s.totalMa), f2(s.dynamicMa), f2(s.quiescentMa)])),
    '',
    '3.  Details',
    ...table('By Clock Domain', ['Clock', 'Port', 'Freq (MHz)', 'Constraint', 'Loads', 'Power (mW)'],
      est.clocks.map(c => [c.net, c.port || '', c.mhz.toFixed(2), c.constrained ? 'PERIOD' : 'none (assumed)', c.loads, f2(c.mw)])),
    '',
    ...table('IO', ['IO', 'Power (mW)', 'I/O Standard', 'Signal Rate', 'Direction'],
      [...est.ios].sort((a, b) => b.mw - a.mw || a.name.localeCompare(b.name)).map(i => [i.name, f2(i.mw), i.std, f2(i.rate), i.dir])),
    '',
    '4.  Warnings',
    ...(est.warnings.length ? est.warnings.map(w => `WARNING:Power - ${w}`) : ['(none)']),
  ];
  return `${out.join('\n')}\n`;
}

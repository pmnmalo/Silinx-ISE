// The Spartan-3E through nextpnr-himbaechel (#1954): what Silinx gives the chip database (the PIPs to leave out, the
// delay model) and what it makes of nextpnr's result (XDL, its check against the netlist, its size). The scripts of
// this folder are the command lines of these functions; README.md tells the whole flow.
import { evalLut } from '../../src/xdl.js';
import { knownRouting } from '../../src/fpga/bitgen.js';
import { SPEED_4, WIRE_NAMES, nodeClasses, lutPinIndex } from '../../src/fpga/timing.js';

const topModule = json => Object.entries(json.modules).find(([, m]) => m.attributes?.top) || Object.entries(json.modules)[0];
const esc = x => String(x).replace(/:/g, '_');
const bitsOf = v => (typeof v === 'string' ? v : (v >>> 0).toString(2));
const portNet = (c, p) => c.connections?.[p]?.[0];
// (the converter to XDL and the size: in the toolchain, src/fpga/nextpnr-xdl.js, #2136)
export { lutPins, nextpnrToXdl, nextpnrToXdlText, xdlSize } from '../../src/fpga/nextpnr-xdl.js';

const mostFrequent = m => [...m].sort((a, b) => b[1] - a[1])[0][0];

// ---------------------------------------------------------------- for the chip database
/**
 * The PIPs nextpnr must not use: those whose bits Silinx's bit database does not know, as Silinx's own router is kept
 * off them (knownRouting's allowPip). Per tile name: the indices of its template's PIPs (the device graph's order,
 * which the generator s3e_gen.py reads). Route-through PIPs are not counted (the generator leaves them all out).
 * Returns { pips: { tile: [index] }, total, unknown }.
 */
export function unknownPips(device, db) {
  const { allowPip } = knownRouting(db);
  const pips = {};
  let total = 0, unknown = 0;
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]], bad = [];
    for (let i = 0; i < tp.from.length; i++) {
      const p = device.pip(k, i);
      if (p.routethru) continue;
      total++;
      if (!allowPip(p.tile, p.from, p.to)) bad.push(i);
    }
    if (bad.length) pips[device.tileName(k)] = bad;
    unknown += bad.length;
  }
  return { pips, total, unknown };
}

/**
 * Silinx's delay model (SPEED_4, fitted to ISE's trce) for the chip database: nextpnr counts a PIP's delay, not a
 * wire's, so each PIP takes the class of the node it drives (pipClass: per template, class x 5 + the LUT input it
 * reaches, the most frequent where the template's tiles disagree), and the model's delays (wire per class, the LUT
 * pins' offsets, the connection's fixed part, the distance estimate, SLICEL's slice delays).
 * Returns { timing, disagree } (disagree: template PIPs whose tiles disagree on the class).
 */
export function timingExport(device) {
  const cls = nodeClasses(device), lut = lutPinIndex(device);
  const votes = new Map();   // template -> Array of Map(class -> count)
  for (let k = 0; k < device.tileCount; k++) {
    const t = device.tileTemplate[k], tp = device.templates[t];
    if (!votes.has(t)) votes.set(t, Array.from({ length: tp.from.length }, () => new Map()));
    const v = votes.get(t);
    for (let i = 0; i < tp.from.length; i++) {
      const n = device.pipNodes(k, i)[1], c = cls[n] * 5 + lut[n];
      v[i].set(c, (v[i].get(c) || 0) + 1);
    }
  }
  const pipClass = {};
  let disagree = 0;
  for (const [t, v] of votes) pipClass[t] = v.map(m => { if (m.size > 1) disagree++; return mostFrequent(m); });
  const slice = Object.fromEntries(Object.entries(SPEED_4.slice).map(([k, [l]]) => [k, l]));
  const timing = { wireNames: WIRE_NAMES, wire: SPEED_4.wire, lutPin: SPEED_4.lutPin, base: SPEED_4.base, dist: SPEED_4.dist, slice, pipClass };
  return { timing, disagree };
}

// ---------------------------------------------------------------- checking the result
/** The netlist's simulation: its LUT4s by INIT, its flip-flops. */
function netlistSim(mod, inputs) {
  const S = { val: new Map(), luts: [], ffs: [] };
  for (const [name, p] of Object.entries(mod.ports)) if (p.direction === 'input') S.val.set(p.bits[0], inputs[name] || 0);
  for (const [name, c] of Object.entries(mod.cells)) {
    const con = p => portNet(c, p);
    if (c.type === 'LUT4') S.luts.push({ init: bitsOf(c.parameters.INIT).padStart(16, '0'), ins: [0, 1, 2, 3].map(i => con(`I${i}`)), out: con('O') });
    else if (c.type === 'FF') S.ffs.push({ name: esc(name), d: con('D'), q: con('Q'), ce: con('CE'), sr: con('SR'), set: /_SET *$/.test(c.parameters.SRMODE), hasSr: !/^NONE *$/.test(c.parameters.SRMODE), init: parseInt(bitsOf(c.parameters.INIT ?? '0'), 2) & 1 });
    else if (c.type === 'IOB' && con('I') !== undefined) S.val.set(con('I'), S.val.get(con('PAD')) || 0);
    // the carry: a MUXCY passes CI when S, else DI (or its constant, CY0); an XORCY gives CI xor LI
    else if (c.type === 'MUXCY') S.luts.push({ out: con('O'), fn: () => (S.get(con('S')) ? S.get(con('CI')) : con('DI') !== undefined ? S.get(con('DI')) : +String(c.parameters.CY0 ?? 0).trim()) });
    else if (c.type === 'XORCY') S.luts.push({ out: con('O'), fn: () => S.get(con('CI')) ^ S.get(con('LI')) });
    // the wide multiplexers: S ? I1 : I0
    else if (c.type === 'MUXF5' || c.type === 'MUXF6') S.luts.push({ out: con('O'), fn: () => S.get(con(S.get(con('S')) ? 'I1' : 'I0')) });
  }
  S.get = b => (b === undefined || b === '0' ? 0 : b === '1' ? 1 : S.val.get(b) || 0);
  S.lut = l => (l.fn ? l.fn() : +l.init[15 - l.ins.reduce((a, b, i) => a | (S.get(b) << i), 0)]);
  return S;
}

/** The XDL's simulation: its slices' LUT equations on their site pins, the carry (CYINIT, CY0F / CY0G, CYMUXF / CYMUXG,
 *  XORF / XORG, COUT), the F5 / F6 multiplexers (F5: BX ? F : G; F6: BY ? FXINA : FXINB), FXMUX / DXMUX, the flip-flops'
 *  set / reset. */
function xdlSim(design, inputs) {
  const S = { val: new Map(), luts: [], ffs: [] };
  const netOfPin = new Map();
  for (const n of design.nets) for (const p of [...n.outpins, ...n.inpins]) netOfPin.set(`${p.inst} ${p.pin}`, n.name);
  for (const inst of design.insts) {
    const cfg = Object.fromEntries(inst.cfg.map(c => [c.attr, c])), pin = p => netOfPin.get(`${inst.name} ${p}`);
    if (/^SLICE[LM]$/.test(inst.type)) {
      // the carry: its carry in (CYINIT), each side's MUXCY (S: the LUT; DI: CY0) and XORCY
      const at = w => `${inst.name}/${w}`;
      const cy0 = side => { const v = cfg[`CY0${side}`]?.value; return v === '0' || v === '1' ? +v : pin(v); };
      if (cfg.CYINIT) S.luts.push({ out: at('CI'), fn: () => S.get(pin(cfg.CYINIT.value)) });
      for (const [side, ci, co] of [['F', at('CI'), at('CYF')], ['G', at('CYF'), cfg.COUTUSED ? pin('COUT') : at('CYG')]]) {
        const d = cy0(side);
        if (cfg[`CYMUX${side}`]) S.luts.push({ out: co, fn: () => (S.get(at(side)) ? S.get(ci) : typeof d === 'number' ? d : S.get(d)) });
        if (cfg[`XOR${side}`]) S.luts.push({ out: at(`XOR${side}`), fn: () => S.get(ci) ^ S.get(at(side)) });
      }
      if (cfg.F5MUX) S.luts.push({ out: cfg.F5USED ? pin('F5') : at('F5'), fn: () => S.get(at(S.get(pin('BX')) ? 'F' : 'G')) });
      if (cfg.F6MUX) S.luts.push({ out: cfg.FXUSED ? pin('FX') : at('FX'), fn: () => S.get(pin(S.get(pin('BY')) ? 'FXINA' : 'FXINB')) });
      for (const [side, X] of [['F', 'X'], ['G', 'Y']]) {
        const out = `${inst.name}/${side}`, ff = `FF${X}`;   // the LUT's output, inside the slice
        const mux = cfg[`${side === 'F' ? 'FX' : 'GY'}MUX`];
        // FXMUX / GYMUX: the LUT, the sum or the wide multiplexer
        const wide = cfg[side === 'F' ? 'F5USED' : 'FXUSED'] ? pin(side === 'F' ? 'F5' : 'FX') : at(side === 'F' ? 'F5' : 'FX');
        const fx = mux && /XOR$/.test(mux.value) ? at(`XOR${side}`) : mux && /^F[5X]$/.test(mux.value) ? wide : out;
        if (cfg[side]) S.luts.push({ eq: cfg[side].value.replace(/^#LUT:/, ''), ins: [1, 2, 3, 4].map(k => pin(`${side}${k}`)), out });
        if (mux && pin(X)) S.luts.push({ copy: fx, out: pin(X) });
        if (cfg[ff]) {
          S.ffs.push({
            name: cfg[ff].name, d: cfg[`D${X}MUX`]?.value === '1' ? fx : pin(`B${X}`), q: pin(`${X}Q`),
            ce: cfg.CEINV ? pin('CE') : undefined, sr: cfg.SRINV ? pin('SR') : undefined,
            set: cfg[`${ff}_SR_ATTR`]?.value === 'SRHIGH', init: cfg[`${ff}_INIT_ATTR`]?.value === 'INIT1' ? 1 : 0,
          });
          S.ffs.at(-1).hasSr = S.ffs.at(-1).sr !== undefined;
        }
      }
    } else if ((inst.type === 'IOB' || inst.type === 'IBUF') && pin('I')) {
      S.val.set(pin('I'), inputs[(inst.cfg.find(c => c.attr === 'PAD')?.name || '').replace(/<(\d+)>$/, '[$1]')] || 0);
    }
  }
  S.get = n => (n === undefined ? 0 : S.val.get(n) || 0);
  S.lut = l => +(l.fn ? l.fn() : l.copy ? S.get(l.copy) : evalLut(l.eq, Object.fromEntries(l.ins.map((n, k) => [`A${k + 1}`, S.get(n)]))));
  return S;
}

/** The combinational logic settled (its LUTs evaluated until nothing changes). */
function settle(S, what) {
  for (let pass = 0; pass < 64; pass++) {
    let changed = false;
    for (const l of S.luts) { const v = S.lut(l); if (S.val.get(l.out) !== v) { S.val.set(l.out, v); changed = true; } }
    if (!changed) return;
  }
  throw new Error(`${what}: no stable state`);
}

/** A rising clock edge on every flip-flop (set / reset synchronous, the spike's). */
function clock(S) {
  const next = S.ffs.map(f => {
    if (f.hasSr && S.get(f.sr)) return f.set ? 1 : 0;
    return f.ce === undefined || S.get(f.ce) ? S.get(f.d) : S.get(f.q);
  });
  S.ffs.forEach((f, i) => S.val.set(f.q, next[i]));
}

/**
 * Does an XDL design (parseXdl's) implement nextpnr's netlist? Both simulated cycle by cycle from the flip-flops'
 * initial values (`cycles`), then `starts` runs of 64 cycles from random states (the same in both, each flip-flop
 * 1 with probability 0.9, so that long carries come at once: a counter's top bits are reached without 2^n cycles),
 * every flip-flop compared after each rising edge. inputs: top ports' values (0 unless given).
 * Returns { ok, flipFlops, message } (message: the first difference).
 */
export function simCheck(json, design, { cycles = 1000, starts = 0, inputs = {} } = {}) {
  const A = netlistSim(topModule(json)[1], inputs), B = xdlSim(design, inputs);
  const byName = new Map(B.ffs.map(f => [f.name, f]));
  for (const f of A.ffs) if (!byName.has(f.name)) return { ok: false, flipFlops: A.ffs.length, message: `flip-flop ${f.name} not in the XDL` };
  const run = (n, from) => {
    for (let t = 0; t < n; t++) {
      settle(A, 'netlist'); settle(B, 'XDL');
      clock(A); clock(B);
      for (const f of A.ffs) {
        const a = A.get(f.q), b = B.get(byName.get(f.name).q);
        if (a !== b) return `${from}cycle ${t + 1}: ${f.name} is ${a} in the netlist, ${b} in the XDL`;
      }
    }
    return null;
  };
  for (const f of A.ffs) { A.val.set(f.q, f.init); B.val.set(byName.get(f.name).q, byName.get(f.name).init); }
  let message = run(cycles, '');
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < starts && !message; k++) {
    for (const f of A.ffs) { const v = rand() < 0.9 ? 1 : 0; A.val.set(f.q, v); B.val.set(byName.get(f.name).q, v); }
    message = run(64, `start ${k + 1}, `);
  }
  return { ok: !message, flipFlops: A.ffs.length, message };
}

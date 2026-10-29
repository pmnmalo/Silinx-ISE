// Silinx toolchain - the timing of the logic (#405: out of core/fpga/timing.js): each instance's arcs (a slice's
// LUTs, multiplexers, carry chain and flip-flops, an IOB's, a block RAM's, a multiplier's), their delays in the model.
import { SPEED_4 } from './timing.js';

// ------------------------------------------------------------------ logic
const F_PINS = ['F1', 'F2', 'F3', 'F4'], G_PINS = ['G1', 'G2', 'G3', 'G4'];

/**
 * The timing arcs of a placed instance (parseXdl's inst) from its type and configuration:
 * { comb: [[input pin, output pin, ns]], setup: [[input pin, ns]] (into a flip-flop or latch, before
 * the clock edge), clkToOut: [[output pin, ns]], clock: true if it has a flip-flop }. Pads: an input
 * pad's I pin starts paths (`input`), an output pad's O1 pin ends them (`output`, its delay to the pad).
 */
export function instArcs(inst, model = SPEED_4) {
  const comb = [], setup = [], clkToOut = [];
  const out = { comb, setup, clkToOut, input: [], output: [], clock: false };
  if (/^(IOB|IBUF|DIFF[MS]I?)$/.test(inst.type)) {
    out.input.push(['I', model.pad.Tiopi]);
    const has = a => inst.cfg.some(c => c.attr === a && c.value === '#FF');
    // an output pad's path from O1 (not through its output register, whose O1 / O2 is the register's data)
    if (!has('OFF1') && !has('OFF2')) out.output.push(['O1', model.pad.Tioop]);
    // its registers (#96): the input register's output IQ1 after the clock, the output and output-enable
    // registers' data O1 / T1 before it; on the second flip-flops IQ2, O2, T2 (#749)
    for (const k of [1, 2]) {
      if (has(`IFF${k}`)) clkToOut.push([`IQ${k}`, model.pad.Tiockiq]);
      if (has(`OFF${k}`)) setup.push([`O${k}`, model.pad.Tioock]);
      if (has(`TFF${k}`)) setup.push([`T${k}`, model.pad.Tiotck]);
    }
    out.clock = clkToOut.length + setup.length > 0;
    return out;
  }
  if (inst.type === 'RAMB16') return bramArcs(inst, model, out);
  if (inst.type === 'MULT18X18SIO') return multArcs(inst, model, out);
  if (!/^SLICE[LM]$/.test(inst.type)) return out;
  const m = new Map(inst.cfg.map(c => [c.attr, c.value]));
  // SLICEM or SLICEL by the site (a slice may be written SLICEL on a SLICEM site): the left column of a CLB
  const sx = /^SLICE_X(\d+)Y/.exec(inst.site || '');
  const k = sx ? (+sx[1] % 2 === 0 ? 1 : 0) : inst.type === 'SLICEM' ? 1 : 0;
  const T = name => model.slice[name][k];
  const arc = (ins, o, d) => { for (const i of ins) comb.push([i, o, d]); };
  const cin = m.get('CYINIT') === 'BX' ? 'BX' : 'CIN';
  // the pins each LUT reads: an input its equation does not use is not on a path through it (the
  // packer wires the carry's data input CY0F / CY0G to a LUT pin the LUT itself may not read; an
  // arc through the LUT from it would make false loops, and the analysis leaves the pins after a
  // loop out)
  const reads = (l, pins) => {
    const e = /^#LUT:D=(.*)$/.exec(m.get(l) || '');
    return e ? pins.filter((p, j) => new RegExp(`A${j + 1}(?!\\d)`).test(e[1])) : pins;
  };
  const fIn = reads('F', F_PINS), gIn = reads('G', G_PINS);
  // into X / Y (kept to add the flip-flop's setup)
  const toX = [], toY = [];
  const fx = m.get('FXMUX'), gy = m.get('GYMUX');
  if (fx === 'F' || fx === undefined) for (const p of fIn) toX.push([p, T('Tilo')]);
  if (fx === 'F5') { for (const p of [...fIn, ...gIn]) toX.push([p, T('Tif5x')]); toX.push(['BX', T('Tbxx')]); }
  if (fx === 'FXOR') { for (const p of fIn) toX.push([p, T('Topx')]); toX.push([cin, cin === 'BX' ? T('Tbxxor') : T('Tcinx')]); }
  if (gy === 'G' || gy === undefined) for (const p of gIn) toY.push([p, T('Tilo')]);
  if (gy === 'FX') toY.push(['FXINA', T('Tif6y')], ['FXINB', T('Tif6y')], ['BY', T('Tbyy')]);
  if (gy === 'GXOR') {
    for (const p of gIn) toY.push([p, T('Togy')]);
    // the F stage's carry (its LUT, or its data input) into the G XOR
    for (const p of F_PINS) if (fIn.includes(p) || m.get('CY0F') === p) toY.push([p, T('Topy')]);
    toY.push([cin, cin === 'BX' ? T('Tbxxor') : T('Tciny')]);
    // BX as the F stage's carry data input reaches the G XOR through the F stage's carry
    if (m.get('CY0F') === 'BX' && cin !== 'BX') toY.push(['BX', T('Tbxy')]);
  }
  for (const [p, d] of toX) comb.push([p, 'X', d]);
  for (const [p, d] of toY) comb.push([p, 'Y', d]);
  arc([...fIn, ...gIn], 'F5', T('Tif5')); comb.push(['BX', 'F5', T('Tbxf5')]);
  arc(['FXINA', 'FXINB'], 'FX', T('Tinafx')); comb.push(['BY', 'FX', T('Tbyfx')]);
  // the carry chain: the LUT selects (S), CY0F / CY0G the data input (DI: a LUT pin, BX / BY or a constant)
  const cy = cin === 'BX' ? T('Tbxcy') : T('Tbyp');
  const cyF = F_PINS.filter(p => fIn.includes(p) || m.get('CY0F') === p).map(p => [p, m.get('CY0F') === p ? T('TopcyfDI') : T('Topcyf')]);
  if (m.get('CY0F') === 'BX') cyF.push(['BX', T('Tbxcy')]);
  const cyG = G_PINS.filter(p => gIn.includes(p) || m.get('CY0G') === p).map(p => [p, m.get('CY0G') === p ? T('TopcygDI') : T('Topcyg')]);
  if (m.get('CY0G') === 'BY') cyG.push(['BY', T('Tbycy')]);
  for (const [p, d] of [...cyF, ...cyG]) comb.push([p, 'COUT', d], [p, 'YB', d]);
  // XB: the F stage's carry, half of CIN -> COUT short of COUT (as the post-place & route model splits the chain,
  // core/sim-model.js sliceModel; #591: the open flows' carry out, trce's value of it still to be read)
  const half = T('Tbyp') / 2;
  for (const [p, d] of cyF) comb.push([p, 'XB', d - half]);
  comb.push([cin, 'COUT', cy], [cin, 'XB', cy - half], [cin, 'YB', cy]);
  // the flip-flops (or latches): D from X / Y (DXMUX / DYMUX = 1) or from BX / BY
  const ff = (name, D, toD, byp, q, tco) => {
    if (!m.has(name)) return;
    out.clock = true;
    if (m.get(D) === '0') setup.push([byp, T(byp === 'BY' ? 'Tdyck' : 'Tdick')]);
    else for (const [p, d] of toD) setup.push([p, d + T('Tdxck')]);
    clkToOut.push([q, T(tco)]);
  };
  ff('FFX', 'DXMUX', toX, 'BX', 'XQ', 'TckoX');
  ff('FFY', 'DYMUX', toY, 'BY', 'YQ', 'TckoY');
  // RAMs and shift registers (SLICEM, LUT #RAM): written on CLK (data BX / BY, enable SR, write
  // address on the LUT pins); a shift register's output changes after the clock edge
  const M = model.mem;
  const memSides = ['F', 'G'].filter(l => /^#RAM/.test(m.get(l) || ''));
  if (memSides.length) {
    out.clock = true;
    setup.push(['SR', M.Tws]);
    // the data in: BY into G (DIG_MUX), and into F too with ALTDIF; BX into F; BX as a RAM32X1S's A4
    if (m.get('DIF_MUX') === 'ALTDIF') setup.push(['BY', M.TdsAlt]);
    else if (m.has('DIG_MUX')) setup.push(['BY', M.TdsY]);
    if (m.has('SLICEWE0USED')) setup.push(['BX', M.Tbxs]);
    else if (m.get('DIF_MUX') === 'BX') setup.push(['BX', M.TdsX]);
    for (const l of memSides) {
      const o = l === 'F' ? 'X' : 'Y', shift = m.get(`${l}_ATTR`) === 'SHIFT_REG';
      // (a RAM's output changes after a write too: the word written, when it is the one read)
      if (shift) clkToOut.push([o, M.Treg]);
      else {
        for (const p of l === 'F' ? F_PINS : G_PINS) setup.push([p, M.Tas]);
        clkToOut.push([o, o === 'X' && m.get('FXMUX') === 'F5' ? M.Tshckof5 : M.Tshcko]);
      }
    }
  }
  if (out.clock && !memSides.length) setup.push(['CE', T('Tceck')], ['SR', T('Tsrck')]);
  else if (m.has('FFX') || m.has('FFY')) setup.push(['CE', T('Tceck')]);
  return out;
}

/** A block RAM: synchronous, the output latches change after the clock edge (CLKA / CLKB). */
function bramArcs(inst, model, out) {
  const B = model.bram;
  const ports = ['A', 'B'].filter(x => inst.cfg.some(c => c.attr === `PORT${x}_ATTR`));
  out.clock = ports.length > 0;
  for (const x of ports) {
    for (let k = 0; k < 32; k++) out.clkToOut.push([`DO${x}${k}`, B.Tbcko]);
    for (let k = 0; k < 4; k++) out.clkToOut.push([`DOP${x}${k}`, B.Tbcko]);
    for (let k = 0; k < 14; k++) out.setup.push([`ADDR${x}${k}`, B.Tback]);
    for (let k = 0; k < 32; k++) out.setup.push([`DI${x}${k}`, B.Tbdck]);
    for (let k = 0; k < 4; k++) out.setup.push([`DIP${x}${k}`, B.Tbdck]);
    out.setup.push([`EN${x}`, B.Tbeck], [`WE${x}`, B.Tbwck], [`SSR${x}`, B.Tbrck]);
  }
  return out;
}

/** A multiplier: combinational A, B -> P, or through its registers (AREG, BREG, PREG). */
function multArcs(inst, model, out) {
  const M = model.mult, m = new Map(inst.cfg.map(c => [c.attr, c.value]));
  const areg = m.get('AREG') === '1', breg = m.get('BREG') === '1', preg = m.get('PREG') === '1';
  const ins = [...(areg ? [] : Array.from({ length: 18 }, (_, k) => `A${k}`)), ...(breg ? [] : Array.from({ length: 18 }, (_, k) => `B${k}`))];
  out.clock = areg || breg || preg;
  for (let j = 0; j < 36; j++) {
    const p = `P${j}`;
    if (preg) out.clkToOut.push([p, M.TmsckpP]);
    else {
      for (const i of ins) out.comb.push([i, p, M.Tmult[j]]);
      if (areg || breg) out.clkToOut.push([p, M.Tmsckp[j]]);
    }
  }
  // the inputs into their registers, or (not registered) through the multiplier into the product register
  for (const [reg, x, t] of [[areg, 'A', M.TmsdckA], [breg, 'B', M.TmsdckB]]) {
    if (reg || preg) for (let k = 0; k < 18; k++) out.setup.push([`${x}${k}`, reg ? t : M.TmsdckP]);
  }
  if (out.clock) for (const x of ['A', 'B', 'P']) out.setup.push([`CE${x}`, M.Tmscck], [`RST${x}`, M.Tmsrck]);
  return out;
}

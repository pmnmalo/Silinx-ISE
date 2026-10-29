// Silinx toolchain - the packer's IOB settings (#405: out of packWith in core/fpga/pack.js): the settings of an IOB's
// registers and DDR registers as ISE's map writes them (#96), their pins; and a site of its own whose pins are the
// cell's.
import { paramInt } from './netlist.js';
import { escCfg } from './pack.js';

/** { hardSite, iobDdrSinks, iobInputDdr, iobInputReg, iobOutputDdr, iobOutputRegs, iobRegSinks } of packWith. */
export function mountIobSettings(ctx) {
  const {
    part, cells, ci, extra, insts, nets, setSink, strParam, where
  } = ctx;

  // The settings of an IOB's registers (#96), as ISE's map writes them (research/s3e-bitstream stage G, #44):
  // the register, its initial value, its set / reset (SR: SRHIGH sets, SRLOW resets; SYNC or ASYNC) and its
  // clock, enable and set / reset inverters; the parts not used are left out (the bit database has their
  // bits: iobRegPseudo). An input register's input delay: the one ISE's map chooses by itself (AUTO:
  // DLY2 on the XC3S100E, DLY3 on the others; the others are not in the database, #97).
  function iobRegCfg(f, g, ff, clk) {
    const t = f.ctrl, cfg = [[ff, escCfg(f.name), '#FF'], [`${ff}_INIT_ATTR`, '', f.init ? 'INIT1' : 'INIT0']];
    if (t.sr !== null) cfg.push([`${ff}_SR_ATTR`, '', f.kind.high ? 'SRHIGH' : 'SRLOW'], [`${g}FFATTRBOX`, '', t.sync ? 'SYNC' : 'ASYNC'], [`${g}SR_USED`, '', '0'], ['SRINV', '', t.srInv ? 'SR_B' : 'SR']);
    if (t.ce !== null) cfg.push([`${g}CEINV`, '', t.ceInv ? `${g}CE_B` : `${g}CE`]);
    if (clk) cfg.push([`${clk}INV`, '', t.clkInv ? `${clk}_B` : clk]);
    return cfg;
  }
  function iobInputReg(f, pad) {
    const dly = /^xc3s100e/i.test(part) ? 'DLY2' : 'DLY3';
    return [...iobRegCfg(f, 'I', 'IFF1', 'ICLK1'), ['IDDRIN_MUX', '', '2'], ['IFD_DELAY_VALUE', '', dly], ['IFFDELMUX', '', '0'], ['IFFDMUX', '', '1'],
      ['PRE_DELAY_MUX', '', '0'], ['IFD_DELAY', `${pad}.IFD_DELAY`, '']];
  }
  function iobOutputRegs(r) {
    const cfg = [];
    // (as ISE's map writes an output register: its data through O1_DDRMUX, and the enable's PCICE_MUX; xdl refuses
    // the register without O1_DDRMUX on some pads, P6 / P7 of the XC3S250E-CP132)
    if (r.O) cfg.push(...iobRegCfg(r.O, 'O', 'OFF1', 'OTCLK1'), ['O1_DDRMUX', '', '1'], ...(r.O.ctrl.ce !== null ? [['PCICE_MUX', '', 'OCE']] : []));
    if (r.T) cfg.push(...iobRegCfg(r.T, 'T', 'TFF1', r.O ? null : 'OTCLK1'));
    // (SRINV once: the IOB's set / reset is shared)
    return cfg.filter(([a], k) => a !== 'SRINV' || cfg.findIndex(([b]) => b === 'SRINV') === k);
  }
  // the pins of an IOB register: its clock, enable and set / reset on the site's (one clock and one set /
  // reset for the output and output-enable registers), D on O1 / T1 (an input register's: the pad, inside)
  function iobRegSinks(s, f, role) {
    const t = f.ctrl, pin = (p, v) => setSink(f.cell, p, v === null ? 'int' : { inst: s.idx, pin: v, kind: 'gen' });
    where.set(f.cell, { inst: s.idx, bel: `${role}FF1` });
    pin(f.clkPin, role === 'I' ? 'ICLK1' : 'OTCLK1');
    if (f.cePin in cells[f.cell].pins) pin(f.cePin, t.ce !== null ? `${role}CE` : null);
    if (f.srPin) pin(f.srPin, t.sr !== null ? 'SR' : null);
    pin('D', role === 'I' ? null : role === 'O' ? 'O1' : 'T1');
  }
  // The DDR registers' settings (#96), as ISE's map writes them (its routed IDDR2 / ODDR2 on every pad, gen-iobreg.mjs
  // rd / rd2): the two flip-flops (<instance>/FF0 on C0, FF1 on C1), their initial values, their set / reset kind
  // (SYNC / ASYNC) and the clock inverters (C1 = not C0: ICLK2INV::ICLK2_B on C0's net). An IDDR2's set / reset parts
  // are always written (SRLOW: R on SR, S on REV), with the input delay of an input register; an ODDR2's
  // set / reset is the one of R / S used (SRHIGH for S), on SR.
  function ddrInit(c, k) { return paramInt(c.params?.[k] ?? 0) ? 'INIT1' : 'INIT0'; }
  function ddrClkInv(c, k, pin) { return paramInt(c.params?.[`IS_C${k}_INVERTED`] ?? 0) ? `${pin}_B` : pin; }
  function iobInputDdr(c, pad) {
    const dly = /^xc3s100e/i.test(part) ? 'DLY2' : 'DLY3';
    return [['IFF1', `${escCfg(c.name)}/FF0`, '#FF'], ['IFF1_INIT_ATTR', '', ddrInit(c, 'INIT_Q0')], ['IFF1_SR_ATTR', '', 'SRLOW'],
      ['IFF2', `${escCfg(c.name)}/FF1`, '#FF'], ['IFF2_INIT_ATTR', '', ddrInit(c, 'INIT_Q1')], ['IFF2_SR_ATTR', '', 'SRLOW'],
      ['IFFATTRBOX', '', strParam(c, 'SRTYPE', 'SYNC')], ['ISR_USED', '', '0'], ['IREV_USED', '', '0'], ['SRINV', '', 'SR'], ['REVINV', '', 'REV'], ['ICEINV', '', 'ICE'],
      ['ICLK1INV', '', ddrClkInv(c, 0, 'ICLK1')], ['ICLK2INV', '', ddrClkInv(c, 1, 'ICLK2')],
      ['IDDRIN_MUX', '', '2'], ['IFD_DELAY_VALUE', '', dly], ['IFFDELMUX', '', '0'], ['IFFDMUX', '', '1'], ['PRE_DELAY_MUX', '', '0'], ['IFD_DELAY', `${pad}.IFD_DELAY`, '']];
  }
  function iobOutputDdr(c) {
    const sr = c.pins.S !== undefined && nets[c.pins.S].const !== 0 ? 'SRHIGH' : 'SRLOW';
    return [['OFF1', `${escCfg(c.name)}/FF0`, '#FF'], ['OFF1_INIT_ATTR', '', ddrInit(c, 'INIT')], ['OFF1_SR_ATTR', '', sr],
      ['OFF2', `${escCfg(c.name)}/FF1`, '#FF'], ['OFF2_INIT_ATTR', '', ddrInit(c, 'INIT')], ['OFF2_SR_ATTR', '', sr],
      ['OFFATTRBOX', '', strParam(c, 'SRTYPE', 'SYNC')], ['OSR_USED', '', '0'], ['SRINV', '', 'SR'], ['OCEINV', '', 'OCE'], ['PCICE_MUX', '', 'OCE'],
      ['O1_DDRMUX', '', '1'], ['O2_DDRMUX', '', '1'], ['O2INV', '', 'O2'], ['OTCLK1INV', '', ddrClkInv(c, 0, 'OTCLK1')], ['OTCLK2INV', '', ddrClkInv(c, 1, 'OTCLK2')],
      ['OFFDDRBLACKBOX', escCfg(c.name), '']];
  }
  // a DDR register's pins: its clocks on the site's two clock pins, its enable and set / reset on the site's (tied to a
  // constant: connected to it, as ISE's map does), its outputs IQ1 / IQ2 or its data O1 / O2 (D, Q: the pad's, inside)
  function iobDdrSinks(s, c) {
    const pin = (p, v) => { if (c.pins[p] !== undefined) setSink(ci(c), p, v === null ? 'int' : { inst: s.idx, pin: v, kind: 'gen' }); };
    const used = p => c.pins[p] !== undefined && nets[c.pins[p]].const !== 0;
    if (c.type === 'IDDR2') {
      where.set(ci(c), { inst: s.idx, bel: 'SITE', outs: { Q0: 'IQ1', Q1: 'IQ2' } });
      pin('D', null); pin('C0', 'ICLK1'); pin('C1', 'ICLK2'); pin('CE', 'ICE'); pin('R', 'SR'); pin('S', 'REV');
    } else {
      where.set(ci(c), { inst: s.idx, bel: 'SITE', outs: {} });
      pin('D0', 'O1'); pin('D1', 'O2'); pin('C0', 'OTCLK1'); pin('C1', 'OTCLK2'); pin('CE', 'OCE');
      const sr = used('S') ? 'S' : 'R';
      pin(sr, 'SR'); pin(sr === 'S' ? 'R' : 'S', null);
    }
    // (an unconnected enable or set / reset: the constant ISE's map ties it to)
    for (const [p, v, k] of c.type === 'IDDR2' ? [['CE', 'ICE', 1], ['R', 'SR', 0], ['S', 'REV', 0]] : [['CE', 'OCE', 1], ...(used('S') ? [] : [['R', 'SR', 0]])]) {
      if (c.pins[p] === undefined) extra.push({ net: k, inst: s.idx, pin: v, kind: 'gen' });
    }
  }
  // a site of its own whose pins are the cell's: pin map cell pin -> site pin (inputs; or several
  // site pins on one net), outputs by name
  function hardSite(c, kind, type, pinMap) {
    const s = { kind, type, name: c.name, loc: null, fixedCfg: null, idx: insts.length, cell: ci(c), params: c.params, conn: new Set() };
    insts.push(s);
    const outs = {};
    for (const [p, n] of Object.entries(c.pins)) {
      const [sp, ...more] = [].concat(pinMap(p) ?? []);
      if (c.dirs[p.replace(/<\d+>$/, '')] === 'output') { if (sp) outs[p] = sp; continue; }
      // inputs the site does not have (a cascade input tied to 0…) are left out, and so are a
      // block RAM's data inputs Yosys leaves undriven (ISE's DRC calls the output bit of a data
      // input tied to a constant a dangling pin); parity inputs stay connected (DRC: all or none).
      // A port that is never written (its WE tied to 0) whose data and parity inputs are all
      // constants (a ROM): they are left out too, as ISE's map trims them (#836; a never-written port
      // with a signal on a data input keeps them all, as ISE does). A DCM's DSSEN tied to a constant is left open, as ISE's map does (DSSENINV #OFF)
      const skip = !sp || (kind === 'bram' && /^DI[AB]?\d+$/.test(sp) && c.undriven?.includes(p))
        || (kind === 'bram' && /^DIP?[AB]\d+$/.test(sp) && nets[n].const !== undefined && c.unwritten?.has(sp.replace(/^DIP?([AB]).*$/, '$1')))
        || (kind === 'dcm' && sp === 'DSSEN' && nets[n].const !== undefined);
      if (skip) { setSink(ci(c), p, 'int'); continue; }
      // the other control pins tied to a constant are connected to it, not inverted, as ISE's map
      // does (block RAM EN / WE / SSR, multiplier CE / RST / CLK: 1 from the VCC site of the
      // block-RAM interconnect tile, 0 from a slice, #50; a DCM's RST / PSCLK / PSEN / PSINCDEC: 1
      // from the VCC site of the DCM's tile, #190)
      setSink(ci(c), p, { inst: s.idx, pin: sp, kind: 'gen' });
      s.conn.add(sp);
      for (const x of more) { extra.push({ net: n, inst: s.idx, pin: x, kind: 'gen' }); s.conn.add(x); }
    }
    where.set(ci(c), { inst: s.idx, bel: 'SITE', outs });
    return s;
  }

  return { hardSite, iobDdrSinks, iobInputDdr, iobInputReg, iobOutputDdr, iobOutputRegs, iobRegSinks };
}

// Silinx toolchain - the IOB's settings of nextpnr's routed design (#2135), as ISE's map writes them and as Silinx's
// packer does (fpga/pack-pads.js, pack-iobcfg.js): the pad buffer, its registers (IFF1, OFF1, TFF1) and DDR registers
// (IFF1 / IFF2, OFF1 / OFF2: an IDDR2's or ODDR2's two flip-flops, cells <instance>/FF0 and FF1).
const esc = x => String(x).replace(/:/g, '_');
const bitsOf = v => (typeof v === 'string' ? v : (v >>> 0).toString(2));
const portNet = (c, p) => c.connections?.[p]?.[0];
const strParam = (c, p) => (typeof c.parameters?.[p] === 'string' ? c.parameters[p].replace(/ $/, '') : c.parameters?.[p]);
const bitParam = (c, p) => parseInt(bitsOf(c.parameters?.[p] ?? '0'), 2) & 1;
const initOf = c => (bitParam(c, 'INIT') ? 'INIT1' : 'INIT0');
const srAttr = c => (/_SET$/.test(strParam(c, 'SRMODE') ?? '') ? 'SRHIGH' : 'SRLOW');
const syncOf = c => (/ASYNC/.test(strParam(c, 'SRMODE') ?? '') ? 'ASYNC' : 'SYNC');
const clkInv = (c, pin) => (bitParam(c, 'CLKINV') ? `${pin}_B` : pin);

/** The settings of a register alone (Silinx's iobRegCfg): its clock's only with `clk`; the parts not used left out. */
function regCfg(f, g, ff, clk) {
  const cfg = [[ff, esc(f.name), '#FF'], [`${ff}_INIT_ATTR`, '', initOf(f)]];
  if (portNet(f, 'SR') !== undefined) cfg.push([`${ff}_SR_ATTR`, '', srAttr(f)], [`${g}FFATTRBOX`, '', syncOf(f)], [`${g}SR_USED`, '', '0'], ['SRINV', '', 'SR']);
  if (portNet(f, 'CE') !== undefined) cfg.push([`${g}CEINV`, '', `${g}CE`]);
  if (clk) cfg.push([`${clk}INV`, '', clkInv(f, clk)]);
  return cfg;
}

/** An input register's input delay: the one ISE's map chooses by itself (AUTO), and its path to the flip-flop. */
function inputDelay(pad, part) {
  const dly = /^xc3s100e/i.test(part) ? 'DLY2' : 'DLY3';
  return [['IDDRIN_MUX', '', '2'], ['IFD_DELAY_VALUE', '', dly], ['IFFDELMUX', '', '0'], ['IFFDMUX', '', '1'], ['PRE_DELAY_MUX', '', '0'], ['IFD_DELAY', `${pad}.IFD_DELAY`, '']];
}

function inputRegs(c, pad, part) {
  if (!c.IFF1) return [];
  if (!c.IFF2) return [...regCfg(c.IFF1, 'I', 'IFF1', 'ICLK1'), ...inputDelay(pad, part)];
  return [['IFF1', esc(c.IFF1.name), '#FF'], ['IFF1_INIT_ATTR', '', initOf(c.IFF1)], ['IFF1_SR_ATTR', '', 'SRLOW'],
    ['IFF2', esc(c.IFF2.name), '#FF'], ['IFF2_INIT_ATTR', '', initOf(c.IFF2)], ['IFF2_SR_ATTR', '', 'SRLOW'],
    ['IFFATTRBOX', '', syncOf(c.IFF1)], ['ISR_USED', '', '0'], ['IREV_USED', '', '0'], ['SRINV', '', 'SR'], ['REVINV', '', 'REV'], ['ICEINV', '', 'ICE'],
    ['ICLK1INV', '', clkInv(c.IFF1, 'ICLK1')], ['ICLK2INV', '', clkInv(c.IFF2, 'ICLK2')], ...inputDelay(pad, part)];
}

function outputRegs(c) {
  if (c.OFF2) {
    return [['OFF1', esc(c.OFF1.name), '#FF'], ['OFF1_INIT_ATTR', '', initOf(c.OFF1)], ['OFF1_SR_ATTR', '', srAttr(c.OFF1)],
      ['OFF2', esc(c.OFF2.name), '#FF'], ['OFF2_INIT_ATTR', '', initOf(c.OFF2)], ['OFF2_SR_ATTR', '', srAttr(c.OFF2)],
      ['OFFATTRBOX', '', syncOf(c.OFF1)], ['OSR_USED', '', '0'], ['SRINV', '', 'SR'], ['OCEINV', '', 'OCE'], ['PCICE_MUX', '', 'OCE'],
      ['O1_DDRMUX', '', '1'], ['O2_DDRMUX', '', '1'], ['O2INV', '', 'O2'], ['OTCLK1INV', '', clkInv(c.OFF1, 'OTCLK1')], ['OTCLK2INV', '', clkInv(c.OFF2, 'OTCLK2')],
      ['OFFDDRBLACKBOX', esc(c.OFF1.name).replace(/\/FF0$/, ''), '']];
  }
  const cfg = [];
  // (as ISE's map writes an output register: its data through O1_DDRMUX, and the enable's PCICE_MUX)
  if (c.OFF1) cfg.push(...regCfg(c.OFF1, 'O', 'OFF1', 'OTCLK1'), ['O1_DDRMUX', '', '1'], ...(portNet(c.OFF1, 'CE') !== undefined ? [['PCICE_MUX', '', 'OCE']] : []));
  if (c.TFF1) cfg.push(...regCfg(c.TFF1, 'T', 'TFF1', c.OFF1 ? null : 'OTCLK1'));
  // (SRINV once: the IOB's set / reset is shared)
  return cfg.filter(([a], k) => a !== 'SRINV' || cfg.findIndex(([b]) => b === 'SRINV') === k);
}

/** Does anything but the input registers read net `bit`? (the input straight to the fabric: IMUX) */
function readByFabric(mod, bit) {
  return bit !== undefined && Object.values(mod.cells).some(x => x.type !== 'IFF'
    && Object.entries(x.connections || {}).some(([p, b]) => x.port_directions?.[p] === 'input' && b[0] === bit));
}

/** An IOB instance's XDL type and settings: [attr, name, value] in the order Silinx's packer writes them. */
export function iobSettings(c, name, mod, part) {
  const i = portNet(c.IOB, 'I'), read = readByFabric(mod, i);
  const out = portNet(c.IOB, 'O') !== undefined;
  const buf = name;
  if (!out) {
    return { type: 'IBUF', cfg: [...(read || !c.IFF1 ? [['IDELMUX', '', '1'], ['IMUX', '', '1']] : []), ['IOATTRBOX', '', 'LVCMOS25'],
      ...inputRegs(c, buf, part), ['INBUF', `${buf}_IBUF`, ''], ['PAD', name, '']] };
  }
  const tri = c.TFF1 || portNet(c.IOB, 'T') !== undefined;
  return { type: 'IOB', cfg: [['DRIVEATTRBOX', '', '12'], ['IOATTRBOX', '', 'LVCMOS25'], ['O1INV', '', 'O1'], ['OMUX', '', c.OFF2 ? 'OFFDDR' : c.OFF1 ? 'OFF1' : 'O1'], ['SLEW', '', 'SLOW'],
    ...(tri ? [['T1INV', '', 'T1'], ['TMUX', '', c.TFF1 ? 'TFF1' : 'T1']] : []), ...outputRegs(c),
    ...(read ? [['IDELMUX', '', '1'], ['IMUX', '', '1'], ['INBUF', `${buf}_IBUF`, '']] : []), ['OUTBUF', `${buf}_OBUF`, ''], ['PAD', name, '']] };
}

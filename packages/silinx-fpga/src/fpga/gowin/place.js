// Silinx toolchain - gowin_pack's place (#2303), ported from Apicula's gowin_pack.py (YosysHQ/apicula, MIT) for the GW1N: each
// bel's fuses (LUTs, ALUs, flip-flops, the slices' shared attributes, distributed RAM, I/O buffers and their banks, block SRAMs,
// the MULT9X9 / MULT18X18 DSPs, the rPLLs and oscillators: pll-osc.js), then the banks' I/O standards, then the configuration pins'
// defaults (db.io_cfg). The primitives Silinx's flow does not make yet (other PLLs, IOLOGIC, LVDS, MIPI…) are refused by name.
import { ATTRIDS } from './attrids.js';
import { addAttrVal, setBits, shortvalFuses, longvalFuses, bankFuses, bankIoFuses, locBank } from './chipdb.js';
import { bsramAttrs, storeBsramInit, dspAttrs } from './bsram-dsp.js';
import { pllAttrs, oscAttrs, oscPowerSave } from './pll-osc.js';

const DEFAULT_IOSTD = { IBUF: 'LVCMOS18', OBUF: 'LVCMOS18', TBUF: 'LVCMOS18', IOBUF: 'LVCMOS18' };
const VCC_IOS = { LVCMOS10: '1.0', LVCMOS12: '1.2', LVCMOS15: '1.5', LVCMOS18: '1.8', LVCMOS25: '2.5', LVCMOS33: '3.3', LVDS25: '2.5', LVCMOS33D: '3.3',
  LVCMOS_D: '3.3', MIPI: '1.2', SSTL15: '1.5', SSTL18_I: '1.8', SSTL18_II: '1.8', SSTL25_I: '2.5', SSTL25_II: '2.5', SSTL33_I: '3.3', SSTL33_II: '3.3',
  SSTL15D: '1.5', SSTL18D_I: '1.8', SSTL18D_II: '1.8', SSTL25D_I: '2.5', SSTL25D_II: '2.5', SSTL33D_I: '3.3', SSTL33D_II: '3.3' };
const INIT_IO_ATTRS = {
  IBUF: { PADDI: 'PADDI', HYSTERESIS: 'NONE', PULLMODE: 'UP', SLEWRATE: 'SLOW', DRIVE: '0', CLAMP: 'OFF', OPENDRAIN: 'OFF', DIFFRESISTOR: 'OFF', VREF: 'OFF', LVDS_OUT: 'OFF' },
  OBUF: { ODMUX_1: '1', PULLMODE: 'UP', SLEWRATE: 'FAST', DRIVE: '8', HYSTERESIS: 'NONE', CLAMP: 'OFF', SINGLERESISTOR: 'OFF', BANK_VCCIO: '1.8', LVDS_OUT: 'OFF',
    DDR_DYNTERM: 'NA', TO: 'INV', OPENDRAIN: 'OFF' },
  TBUF: { ODMUX_1: 'UNKNOWN', PULLMODE: 'UP', SLEWRATE: 'FAST', DRIVE: '8', HYSTERESIS: 'NONE', CLAMP: 'OFF', SINGLERESISTOR: 'OFF', BANK_VCCIO: '1.8', LVDS_OUT: 'OFF',
    DDR_DYNTERM: 'NA', TO: 'INV', PERSISTENT: 'OFF', ODMUX: 'TRIMUX', OPENDRAIN: 'OFF' },
  IOBUF: { ODMUX_1: 'UNKNOWN', PULLMODE: 'UP', SLEWRATE: 'FAST', DRIVE: '8', HYSTERESIS: 'NONE', CLAMP: 'OFF', DIFFRESISTOR: 'OFF', SINGLERESISTOR: 'OFF', BANK_VCCIO: '1.8',
    LVDS_OUT: 'OFF', DDR_DYNTERM: 'NA', TO: 'INV', PERSISTENT: 'OFF', ODMUX: 'TRIMUX', PADDI: 'PADDI', OPENDRAIN: 'OFF' },
};
const IOSTD_ALIAS = [[['BLVDS25E'], 'BLVDS_E'], [['LVTTL33'], 'LVCMOS33'], [['LVCMOS12D', 'LVCMOS15D', 'LVCMOS18D', 'LVCMOS25D', 'LVCMOS33D'], 'LVCMOS_D'],
  [['HSTL15', 'HSTL18_I', 'HSTL18_II'], 'HSTL'], [['SSTL15', 'SSTL18_I', 'SSTL18_II', 'SSTL25_I', 'SSTL25_II', 'SSTL33_I', 'SSTL33_II'], 'SSTL'], [['MLVDS25E'], 'MLVDS_E'],
  [['SSTL15D', 'SSTL18D_I', 'SSTL18D_II', 'SSTL25D_I', 'SSTL25D_II', 'SSTL33D_I', 'SSTL33D_II'], 'SSTL_D'], [['HSTL15D', 'HSTL18D_I', 'HSTL18D_II'], 'HSTL_D'],
  [['RSDS'], 'RSDS25'], [['RSDS25E'], 'RSDS_E']];
const iostdAlias = s => IOSTD_ALIAS.find(([k]) => k.includes(s))?.[1] ?? s;
const REFINE = { SLEW_RATE: 'SLEWRATE', PULL_MODE: 'PULLMODE', OPEN_DRAIN: 'OPENDRAIN' };
const BSRAM_TYPES = new Set(['DP', 'SDP', 'SP', 'ROM']);
const DSP_TYPES = new Set(['MULTADDALU18X18', 'MULTALU36X18', 'MULTALU18X18', 'MULT36X36', 'MULT18X18', 'MULT9X9', 'PADD18', 'PADD9', 'ALU54D', 'MULT12X12', 'MULTALU27X18', 'MULTADDALU12X12']);
const UNSUPPORTED = /^(IOLOGIC|ODDR|OSER|OVIDEO|IDDR|IDES|IVIDEO|BANDGAP|PINCFG|FLASH|EMCU|MIPI|BUFS|BUFG|OSC|ADC|PLL|CLKDIV|DCS|DQCE|DHCEN|DLLDLY|USERFLASH)/;
const OSC_TYPES = new Set(['OSC', 'OSCZ', 'OSCF', 'OSCH', 'OSCW', 'OSCO']);
const bin = v => parseInt(v, 2);

function placeLut(ctx, t, tile, parms, num, row, col) {
  const lutmap = t.get('bels').get(`LUT${num}`).get('flags');
  let init = String(parms.INIT);
  init = init.length > 16 ? init.slice(-16) : init.repeat(Math.floor(16 / init.length));
  [...init].reverse().forEach((bit, i) => { if (bit === '0') setBits(tile, lutmap.get(i)); });
  slice(ctx, row, col, num >> 1);
}

function placeAlu(ctx, t, tile, parms, num, row, col) {
  const lutmap = t.get('bels').get(`LUT${num}`).get('flags'), alu = t.get('bels').get(`ALU${num}`);
  for (const bits of lutmap.values()) setBits(tile, bits, 0);
  if (parms.ALU_MODE === '0 ') parms.RAW_ALU_LUT = '0011000011001100';
  let bits;
  if ('RAW_ALU_LUT' in parms) {
    let init = parms.RAW_ALU_LUT;
    init = init.length > 16 ? init.slice(-16) : init.repeat(Math.floor(16 / init.length));
    bits = [];
    [...init].reverse().forEach((bit, i) => { if (bit === '0') bits.push(...lutmap.get(i)); });
  } else {
    const mode = String(parms.ALU_MODE), modes = alu.get('modes');
    bits = modes.has(mode) ? modes.get(mode) : modes.get(String(parseInt(mode, 2)));
  }
  setBits(tile, bits);
  const a = slice(ctx, row, col, num >> 1);
  a.MODE = 'ALU';
  a[`MODE_5A_${num % 2}`] = 'ALU';
  if ('CIN_NETTYPE' in parms) a.ALU_CIN_MUX = { VCC: 'ALU_5A_CIN_VCC', GND: 'ALU_5A_CIN_GND' }[parms.CIN_NETTYPE] || 'ALU_5A_CIN_COUT';
  else if (!('ALU_CIN_MUX' in a)) a.ALU_CIN_MUX = 'ALU_5A_CIN_COUT';
}

function placeDff(ctx, num, mode, row, col, isLatch) {
  const a = slice(ctx, row, col, num >> 1);
  a.REGMODE = isLatch ? 'LATCH' : 'FF';
  a.CEMUX_1 = 'UNKNOWN'; a.CEMUX_CE = 'SIG';
  a[`REG${num % 2}_REGSET`] = ['DFFR', 'DFFC', 'DFFNR', 'DFFNC', 'DFF', 'DFFN'].includes(mode) ? 'RESET' : 'SET';
  if (mode !== 'DFF' && mode !== 'DFFN') a.LSRONMUX = 'LSRMUX';
  a.CLKMUX_CLK = ['DFFN', 'DFFNR', 'DFFNC', 'DFFNP', 'DFFNS'].includes(mode) ? 'INV' : 'SIG';
  if (['DFFNC', 'DFFNP', 'DFFC', 'DFFP'].includes(mode)) a.SRMODE = 'ASYNC';
}

// slice_attrvals: the attributes a slice's LUTs, ALUs, flip-flops and RAM share, set once they are all known
function slice(ctx, row, col, idx) {
  const k = `${row},${col},${idx}`;
  if (!ctx.slices.has(k)) ctx.slices.set(k, {});
  return ctx.slices.get(k);
}

/** set_slice_fuses: each slice's shared attributes' fuses. */
export function sliceFuses(ctx) {
  const { db } = ctx;
  for (const [k, a] of ctx.slices) {
    const [row, col, num] = k.split(',').map(Number);
    if (a.MODE === 'SSRAM') { a.REG0_REGSET = 'UNKNOWN'; a.REG1_REGSET = 'UNKNOWN'; }
    else if (!('REGMODE' in a)) { a.LSRONMUX = '0'; a.CLKMUX_1 = '1'; }
    if (!('REG0_REGSET' in a)) a.REG0_REGSET = 'RESET';
    if (!('REG1_REGSET' in a)) a.REG1_REGSET = 'RESET';
    if (num === 0 && !('ALU_CIN_MUX' in a)) a.ALU_CIN_MUX = 'ALU_5A_CIN_COUT';
    const av = new Set();
    for (const [attr, v] of Object.entries(a)) addAttrVal(db, 'SLICE', av, ATTRIDS.cls.ids[attr], ATTRIDS.cls.vals[v]);
    const ttyp = db.grid[row - 1][col - 1];
    if (db.shortval.get(ttyp)?.has(`CLS${num}`)) setBits(ctx.tilemap.get(`${row - 1},${col - 1}`), shortvalFuses(db, ttyp, av, `CLS${num}`));
  }
}

// an I/O buffer: its bank, its mode and attributes, set after every bel is placed (ctx.ioBels)
function placeIob(ctx, t, parms, attrs, num, row, col, cell) {
  const { db } = ctx;
  let edge = 'T', idx = col;
  if (row === db.rows) edge = 'B';
  else if (col === 1) { edge = 'L'; idx = row; } else if (col === db.cols) { edge = 'R'; idx = row; }
  const belName = `IO${edge}${idx}${num}`;
  if ('MIPI_IBUF' in parms || 'DIFF' in parms || 'I3C_IOBUF' in parms) throw new Error(`gowin_pack: ${belName}: differential, MIPI and I3C I/O are not supported yet`);
  let mode;
  if (bin(parms.ENABLE_USED)) mode = bin(parms.INPUT_USED) ? 'IOBUF' : 'TBUF';
  else if (bin(parms.INPUT_USED)) mode = 'IBUF';
  else if (bin(parms.OUTPUT_USED)) mode = 'OBUF';
  else throw new Error('gowin_pack: IOB has no in or output');
  ctx.lastMode = mode;
  let bank;
  try { bank = locBank(db, row - 1, col - 1); } catch (e) {
    if (e.pinless) throw new Error(`gowin_pack: IO${edge}${idx}${num} is not allowed for a given package`);
    throw e;
  }
  if (!ctx.banks.has(bank)) ctx.banks.set(bank, { iostd: null });
  const flags = { mode, ...Object.fromEntries(Object.entries(parms).filter(([p]) => p.startsWith('NET_'))) };
  if (bin(parms.IOLOGIC_IOB || '0')) flags.USED_BY_IOLOGIC = true;
  const desc = { pos: [row - 1, col - 1, num], attrs: {}, flags };
  if (!ctx.ioBels.has(bank)) ctx.ioBels.set(bank, new Map());
  ctx.ioBels.get(bank).set(belName, desc);
  let iostd = DEFAULT_IOSTD[mode];
  for (const flag of Object.keys(attrs)) {
    const nv = flag.split('=');
    if (nv.length < 2 || flag[0] !== '&') continue;
    // (gowin_pack.py's _iostd_alias.get(name, name): its keys are sets, so the name itself)
    if (nv[0] === '&IO_TYPE') iostd = nv[1];
    else desc.attrs[nv[0].slice(1)] = nv[1];
  }
  desc.attrs.IO_TYPE = iostd;
  void t; void cell;
}

/** The I/O banks' standards and the I/O buffers' fuses; then the configuration pins' (place's last part). */
function ioBanks(ctx) {
  const { db } = ctx;
  const IN_MODES = new Set(['IBUF', 'IOBUF']), OUT_MODES = new Set(['OBUF', 'IOBUF']);
  let inBank = {};
  for (const [bank, ios] of ctx.ioBels) {
    inBank = {};
    let vccio = null, iostd = null;
    for (const [name, iob] of ios) {
      if (IN_MODES.has(iob.flags.mode)) {
        iob.attrs.IO_TYPE = iostdAlias(iob.attrs.IO_TYPE);
        if ((iob.attrs.SINGLERESISTOR ?? 'OFF') !== 'OFF') iob.attrs.DDR_DYNTERM = 'ON';
      }
      if (OUT_MODES.has(iob.flags.mode)) {
        if ('BANK_VCCIO' in iob.attrs && iob.attrs.BANK_VCCIO !== VCC_IOS[iob.attrs.IO_TYPE]) throw new Error(`gowin_pack: Conflict bank VCC at ${name}.`);
        if (!vccio) {
          if (!iob.attrs.IO_TYPE.startsWith('LVDS')) { iostd = iob.attrs.IO_TYPE; vccio = VCC_IOS[iostd]; }
        } else if (vccio !== VCC_IOS[iob.attrs.IO_TYPE] && !iob.attrs.IO_TYPE.startsWith('LVDS')) {
          const fst = [...ios].find(([, x]) => x.attrs.IO_TYPE === iostd)[0];
          throw new Error(`gowin_pack: Different IO standard for bank ${bank}: ${fst} sets ${iostd}, ${name} sets ${iob.attrs.IO_TYPE}.`);
        }
      }
    }
    if (!vccio) iostd = 'LVCMOS12';
    if (!('BANK_VCCIO' in inBank)) inBank.BANK_VCCIO = VCC_IOS[iostd];
    ctx.banks.get(bank).iostd = iostd;
    for (const [, iob] of ios) {
      const [row, col, idx] = iob.pos;
      const t = db.tileAt(row, col), mode = iob.flags.mode;
      const io = { ...INIT_IO_ATTRS[mode] };
      if (mode !== 'IBUF') {
        if (`NET_OEN` in iob.flags) {
          if (iob.flags.NET_OEN === 'GND') io.TRIMUX_PADDT = 'SIG';
          else if (iob.flags.NET_OEN === 'VCC') io.ODMUX_1 = '0';
          else { io.TRIMUX_PADDT = 'SIG'; io.TO = 'SIG'; }
        } else io.ODMUX_1 = '1';
      }
      for (const [k, v] of Object.entries(iob.attrs)) io[REFINE[k] || k] = v;
      io.BANK_VCCIO = inBank.BANK_VCCIO;
      if (ctx.lastMode.slice(1).startsWith('LVDS') && io.DRIVE !== '0') io.DRIVE = 'UNKNOWN';
      const ioAttrs = new Set();
      for (const [k, v] of Object.entries(io)) {
        if (!(k in ATTRIDS.iob.ids)) continue;   // (gowin_pack prints "XXX IO: add … key handle")
        addAttrVal(db, 'IOB', ioAttrs, ATTRIDS.iob.ids[k], need(ATTRIDS.iob.vals, v, k));
        if (k === 'LVDS_OUT' && v !== 'ENABLE' && v !== 'ON') continue;
        if (k === 'IO_TYPE' && k in inBank && inBank[k].startsWith('LVDS')) continue;
        inBank[k] = v;
      }
      setBits(ctx.tilemap.get(`${row},${col}`), longvalFuses(db, t.get('ttyp'), ioAttrs, `IOB${idx}`));
    }
    const [brow, bcol] = db.bankTiles.get(bank);
    const bankAttrs = new Set();
    for (const [k, v] of Object.entries(inBank)) {
      if (k in ATTRIDS.iob.ids && ['BANK_VCCIO', 'IO_TYPE', 'LVDS_OUT', 'DRIVE', 'OPENDRAIN', 'PULL_STRENGTH'].includes(k)) addAttrVal(db, 'IOB', bankAttrs, ATTRIDS.iob.ids[k], need(ATTRIDS.iob.vals, v, k));
    }
    const ttyp = db.tileAt(brow, bcol).get('ttyp');
    setBits(ctx.tilemap.get(`${brow},${bcol}`), [...bankFuses(db, ttyp, bankAttrs, 'BANK', bank), ...bankIoFuses(db, ttyp, bankAttrs)]);
  }
  // the pins of the configuration (db.io_cfg): their bank's standard; a bank no I/O uses at 1.8 V
  for (const [bel, cfg] of db.io_cfg) {
    const bank = db.pin_bank.get(bel);
    if (bank === undefined) {
      if (cfg.length) throw new Error(`gowin_pack: Pin ${bel} with alt configurstions ${cfg} has no bank.`);
      continue;
    }
    if (!ctx.banks.has(bank)) {
      const ioStd = 'LVCMOS18';
      ctx.banks.set(bank, { iostd: ioStd });
      const [brow, bcol] = db.bankTiles.get(bank);
      const bankAttrs = new Set();
      // (gowin_pack.py adds the bank's VCCIO once for each attribute of the last bank's: none when it had none)
      for (const k of Object.keys(inBank)) if (k in ATTRIDS.iob.ids) addAttrVal(db, 'IOB', bankAttrs, ATTRIDS.iob.ids.BANK_VCCIO, ATTRIDS.iob.vals[VCC_IOS[ioStd]]);
      const ttyp = db.tileAt(brow, bcol).get('ttyp');
      setBits(ctx.tilemap.get(`${brow},${bcol}`), [...bankFuses(db, ttyp, bankAttrs, 'BANK', bank), ...bankIoFuses(db, ttyp, bankAttrs)]);
    }
    const ioStd = ctx.banks.get(bank).iostd;
    const attrs = { IO_TYPE: ioStd, BANK_VCCIO: VCC_IOS[ioStd] };
    const side = bel[2], num = Number(bel.slice(3, -1)), iobIdx = bel.at(-1);
    const [row, col] = { T: [0, num - 1], B: [db.rows - 1, num - 1], L: [num - 1, 0], R: [num - 1, db.cols - 1] }[side];
    const t = db.tileAt(row, col);
    if (!t.get('bels').has(`IOB${iobIdx}`)) continue;
    const ioAttrs = new Set();
    for (const [k, v] of Object.entries(attrs)) addAttrVal(db, 'IOB', ioAttrs, ATTRIDS.iob.ids[k], need(ATTRIDS.iob.vals, v, k));
    setBits(ctx.tilemap.get(`${row},${col}`), longvalFuses(db, t.get('ttyp'), ioAttrs, `IOB${iobIdx}`));
  }
}
const need = (o, k, what) => { if (!(k in o)) throw new Error(`gowin_pack: no code for ${what}=${k}`); return o[k]; };

/** place: every bel's fuses, then the slices', the banks' and the configuration pins'. bels: get_bels' tuples. */
export function place(ctx, bels) {
  const { db } = ctx;
  for (const b of bels) {
    let { typ, num } = b;
    const { row, col, parms, attrs, cell } = b;
    const t = db.tileAt(row - 1, col - 1), tile = ctx.tilemap.get(`${row - 1},${col - 1}`);
    if (['IBUF', 'OBUF', 'TBUF', 'IOBUF'].includes(typ)) {
      const [o, i, e] = { IBUF: '010', TBUF: '101', IOBUF: '111', OBUF: '100' }[typ];
      parms.OUTPUT_USED = o; parms.INPUT_USED = i; parms.ENABLE_USED = e;
      typ = 'IOB';
    }
    if (typ === 'GSR' || typ.startsWith('MUX2_')) continue;
    if (typ.startsWith('RPLL')) {
      // (an rPLL's own cell and its RPLLB's: the PLL table of those that have one)
      if (db.shortval.get(t.get('ttyp'))?.has('PLL')) setBits(tile, shortvalFuses(db, t.get('ttyp'), pllAttrs(db, ctx.device, parms), 'PLL'));
      continue;
    }
    if (OSC_TYPES.has(typ)) {
      if (ctx.device === 'GW1NZ-1') throw new Error(`gowin_pack: the oscillator of the GW1NZ-1 is not supported yet (${b.name})`);
      setBits(tile, shortvalFuses(db, t.get('ttyp'), oscPowerSave(db), 'OSC'), 0);   // (its power save's fuses cleared)
      setBits(tile, shortvalFuses(db, t.get('ttyp'), oscAttrs(db, typ, parms), 'OSC'));
      continue;
    }
    if (UNSUPPORTED.test(typ)) throw new Error(`gowin_pack: the primitive ${typ} (${b.name}) is not supported yet`);
    if (typ.startsWith('DFF')) {
      ctx.lastMode = typ.replace(/^E+|E+$/g, '');   // (place's `mode`, which the banks' loop reads after, #2303)
      placeDff(ctx, Number(num), ctx.lastMode, row, col, attrs.LATCH === '00000000000000000000000000000001');
    }
    else if (typ.startsWith('LUT')) placeLut(ctx, t, tile, parms, Number(num), row, col);
    else if (typ.slice(0, 3) === 'IOB') placeIob(ctx, t, parms, attrs, num, row, col, cell);
    else if (typ.startsWith('RAM16SDP') || typ === 'RAMW') {
      for (let i = 0; i < 4; i++) slice(ctx, row, col, i).MODE = 'SSRAM';
      Object.assign(slice(ctx, row, col, 2), { LSRONMUX: 'LSRMUX', LSR_MUX_LSR: 'INV', CLKMUX_1: 'UNKNOWN', CLKMUX_CLK: 'SIG' });
    } else if (BSRAM_TYPES.has(typ) || typ === 'BSRAM_AUX') {
      if (typ === 'BSRAM_AUX') typ = cell.type;
      else storeBsramInit(ctx, row - 1, col - 1, typ, parms, attrs);
      setBits(tile, shortvalFuses(db, t.get('ttyp'), bsramAttrs(ctx, cell, typ, parms), `BSRAM_${typ}`));
    } else if (DSP_TYPES.has(typ) || typ === 'DSP_AUX') {
      if (typ === 'DSP_AUX') typ = cell.type;
      const a = dspAttrs(ctx, typ, parms, num, attrs);
      if (db.shortval.get(t.get('ttyp'))?.has(`DSP${num.at(-2)}`)) setBits(tile, shortvalFuses(db, t.get('ttyp'), a, `DSP${num.at(-2)}`));
    } else if (typ.startsWith('ALU')) placeAlu(ctx, t, tile, parms, Number(num), row, col);
    else throw new Error(`gowin_pack: unknown type ${typ} (${b.name})`);
  }
  ioBanks(ctx);
}

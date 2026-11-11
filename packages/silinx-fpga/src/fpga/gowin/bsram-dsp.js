// Silinx toolchain - the Gowin's block SRAMs and DSPs in gowin_pack (#2303), ported from Apicula's gowin_pack.py (YosysHQ/apicula,
// MIT): set_bsram_attrs and its byte enables, store_bsram_init_val (the initial values' map, below the main grid),
// set_dsp_attrs for the MULT9X9 and MULT18X18 (set_mult9x9_attrs). The other DSP primitives are refused.
import { ATTRIDS } from './attrids.js';
import { addAttrVal, setBits } from './chipdb.js';

const BIT_WIDTHS = { 1: '1', 2: '2', 4: '4', 8: '9', 9: '9', 16: '16', 18: '16', 32: 'X36', 36: 'X36' };
const bin = v => parseInt(v, 2);
/** attrs_upper: a cell's string values upper case, in place. */
export const attrsUpper = o => { for (const [k, v] of Object.entries(o)) if (typeof v === 'string') o[k] = v.toUpperCase(); };

function byteEnables(ctx, typ, cell, a, ports, both) {
  const allConst = ports.every(p => ctx.isConst(cell.connections[p][0]));
  const v = allConst ? 'ENABLE' : 'DISABLE';
  return v;
}
const be = (a, typ, side, v) => { a[`${typ}${side}_BEHB`] = v; a[`${typ}${side}_BELB`] = v; };

/** set_bsram_attrs: the block SRAM's attribute codes. */
export function bsramAttrs(ctx, cell, typ, params) {
  const a = { MODE: 'ENABLE', GSR: 'DISABLE' };
  attrsUpper(params);
  if (typ === 'ROM') { a.CEMUX_CEA = 'INV'; be(a, typ, 'A', 'DISABLE'); be(a, typ, 'B', 'DISABLE'); }
  const fail = m => { throw new Error(`gowin_pack: ${m}`); };
  for (const [parm, raw] of Object.entries(params)) {
    let val = raw;
    if (parm === 'BIT_WIDTH') {
      val = bin(val);
      if (!(val in BIT_WIDTHS)) fail(`BSRAM width of ${val} isn't supported for now`);
      if (typ !== 'ROM') {
        if (val === 16 || val === 18) { be(a, typ, 'A', byteEnables(ctx, typ, cell, a, ['AD0', 'AD1'])); be(a, typ, 'B', 'DISABLE'); }
        else if (val === 32 || val === 36) { const v = byteEnables(ctx, typ, cell, a, ['AD0', 'AD1', 'AD2', 'AD3']); be(a, typ, 'A', v); be(a, typ, 'B', v); }
        else { be(a, typ, 'A', 'DISABLE'); be(a, typ, 'B', 'DISABLE'); }
      }
      if (val !== 32 && val !== 36) { a[`${typ}A_DATA_WIDTH`] = BIT_WIDTHS[val]; a[`${typ}B_DATA_WIDTH`] = BIT_WIDTHS[val]; }
      else if (typ !== 'SP') { a.DBLWA = BIT_WIDTHS[val]; a.DBLWB = BIT_WIDTHS[val]; }
    } else if (parm === 'BIT_WIDTH_0') {
      val = bin(val);
      if (!(val in BIT_WIDTHS)) fail(`BSRAM width of ${val} isn't supported for now`);
      if (val !== 32 && val !== 36) a[`${typ}A_DATA_WIDTH`] = BIT_WIDTHS[val];
      else {
        a.DBLWA = BIT_WIDTHS[val];
        // (gowin_pack.py's branches as they are: under 32 and 36 only)
        if (typ === 'SDP') { const v = byteEnables(ctx, typ, cell, a, ['ADA0', 'ADA1', 'ADA2', 'ADA3']); be(a, typ, 'A', v); be(a, typ, 'B', v); }
        else fail(`BIT_WIDTH_0=${val} for BSRAM type ${typ} isn't supported`);
      }
    } else if (parm === 'BIT_WIDTH_1') {
      val = bin(val);
      if (!(val in BIT_WIDTHS)) fail(`BSRAM width of ${val} isn't supported for now`);
      if (val !== 32 && val !== 36) a[`${typ}B_DATA_WIDTH`] = BIT_WIDTHS[val];
      else {
        a.DBLWB = BIT_WIDTHS[val];
        if (typ !== 'SDP') fail(`BIT_WIDTH_1=${val} for BSRAM type ${typ} isn't supported`);
      }
    } else if (parm === 'BLK_SEL' || parm === 'BLK_SEL_0' || parm === 'BLK_SEL_1') {
      for (let i = 0; i < 3; i++) {
        if (val.at(-1 - i) !== '0') continue;
        if (parm !== 'BLK_SEL_1') a[`CSA_${i}`] = 'SET';
        if (parm !== 'BLK_SEL_0') a[`CSB_${i}`] = 'SET';
      }
    } else if (parm === 'READ_MODE0') { if (bin(val) === 1) a[`${typ}A_REGMODE`] = 'OUTREG'; }
    else if (parm === 'READ_MODE1') { if (bin(val) === 1) a[`${typ}B_REGMODE`] = 'OUTREG'; }
    else if (parm === 'READ_MODE') { if (bin(val) === 1) { a[`${typ}A_REGMODE`] = 'OUTREG'; a[`${typ}B_REGMODE`] = 'OUTREG'; } }
    else if (parm === 'RESET_MODE') { if (val === 'ASYNC') a.OUTREG_ASYNC = 'RESET'; }
    else if (parm === 'WRITE_MODE0' || parm === 'WRITE_MODE1' || parm === 'WRITE_MODE') {
      const m = { 1: 'WT', 2: 'RBW' }[bin(val)];
      if (m && parm !== 'WRITE_MODE1') a[`${typ}A_MODE`] = m;
      if (m && parm !== 'WRITE_MODE0') a[`${typ}B_MODE`] = m;
    }
  }
  const fin = new Set();
  for (const [attr, v] of Object.entries(a)) addAttrVal(ctx.db, 'BSRAM', fin, ATTRIDS.bsram.ids[attr], ATTRIDS.bsram.vals[v]);
  return fin;
}

/** store_bsram_init_val: a block SRAM's INIT_RAM_xx into the initial values' map (ctx.bsramInit, rows of Uint8Array). */
export function storeBsramInit(ctx, row, col, typ, parms, attrs) {
  const { db } = ctx;
  if (typ === 'BSRAM_AUX' || !('INIT_RAM_00' in parms)) return;
  attrsUpper(attrs);
  const subtype = attrs.BSRAM_SUBTYPE;
  if (!ctx.bsramInit) ctx.bsramInit = Array.from({ length: 256 * db.simplio_rows.length }, () => new Uint8Array(db.width));
  const loc = Array.from({ length: 256 }, () => new Uint8Array(180));
  let width;
  if (!subtype.trim()) width = 256;
  else if (subtype === 'X9') width = 288;
  else throw new Error(`gowin_pack: Init for ${subtype} is not supported`);
  const logic = db.revLogicinfo('BSRAM_INIT');
  let addr = -1;
  for (let r = 0; r < 0x40; r++) {
    const name = `INIT_RAM_${r.toString(16).toUpperCase().padStart(2, '0')}`;
    if (!(name in parms)) { addr += 0x100; continue; }
    const data = parms[name];
    // get_bits: the bits from the last, two of every 18 the parity's
    let bitNo = 0, ptr = -1;
    while (ptr >= -width) {
      let bit, inc;
      if (bitNo === 8 || bitNo === 17) {
        if (width === 288) { bit = data.at(ptr); ptr -= 1; } else bit = '0';
        inc = 0;
      } else { bit = data.at(ptr); ptr -= 1; inc = 1; }
      const no = bitNo;
      bitNo = (bitNo + 1) % 18;
      addr += inc;
      if (bit === '0') continue;
      const line = no * 4 + (addr >> 12);
      const b = logic.get(line)[0] - 1;
      const quad = { 0x30: 0xC0, 0x20: 0x40, 0x10: 0x80, 0x00: 0x00 }[addr & 0x30];
      loc[quad + ((addr >> 6) & 0x3F)][b] = 1;
    }
  }
  let y = 0;
  for (const brow of [...db.simplio_rows].sort((p, q) => p - q)) { if (row === brow) break; y += 256; }
  let x = 0;
  for (let j = 0; j < col; j++) x += db.tileAt(0, j).get('width');
  for (let i = 255; i >= 0; i--, y++) ctx.bsramInit[y].set(loc[i], x);   // (flipud)
}

// set_mult9x9_attrs: one 9x9 multiplier of a DSP macro (a MULT18X18 is two)
function mult9x9(params, attrs, a, pairIdx, idx, evenOdd) {
  attrsUpper(attrs);
  const pick = (k, pre) => (bin(attrs[k]) ? `${pre}${bin(attrs[k])}` : 'UNKNOWN');
  const ce = pick('CE', 'CEIN'), clk = pick('CLK', 'CLKIN'), rst = pick('RESET', 'RSTIN');
  const sync = params.MULT_RESET_MODE === 'SYNC';
  const p = pairIdx, HL = evenOdd ? 'H' : 'L';
  a[`IRASHFEN_${p}`] = '1'; a[`IRBSHFEN_${p}`] = '1';
  if (p) a.MATCH_SHFEN = 'ENABLE';
  a[`OR2CIB_EN${p}${HL}_${idx}`] = 'ENABLE';
  if (attrs.NET_ASEL === 'VCC') a[`AIRMUX1_${p}`] = 'ENABLE';
  else if (attrs.NET_ASEL && attrs.NET_ASEL !== 'GND') a[`AIRMUX1_SEL_${p}`] = 'ENABLE';
  if (attrs.NET_BSEL === 'VCC') a[`BIRMUX1_${p * 2}`] = 'ENABLE';
  else if (attrs.NET_BSEL && attrs.NET_BSEL !== 'GND') for (const k of [`BIRMUX0_${p * 2}`, `BIRMUX0_${p * 2 + 1}`, `BIRMUX1_${p * 2}`, `BIRMUX1_${p * 2 + 1}`]) a[k] = 'ENABLE';
  for (const n of ['AREG', 'BREG', 'OUT_REG', 'PIPE_REG', 'ASIGN_REG', 'BSIGN_REG', 'SOA_REG']) if (!(n in params)) params[n] = '0';
  const regs = (name, gen) => { a[`CE${HL}MUX_${name}`] = ce; a[`CLK${HL}MUX_${name}`] = clk; a[`RST${HL}MUX_${name}`] = rst; if (sync && gen) a[`RSTGEN${HL}MUX_${name}`] = 'SYNC'; };
  for (const [parm, val] of Object.entries(params)) {
    if (parm === 'AREG' || parm === 'BREG') {
      const ab = parm[0], n = p * 4 + (ab === 'A' ? 0 : 2) + (evenOdd ? 1 : 0);
      if (val === '0') { a[`IRBY_IREG${p}${ab}${HL}_${n}`] = 'ENABLE'; a[`IRNS_IREG${p}${ab}${HL}_${n}`] = 'ENABLE'; }
      else regs(`REGM${ab}${p}`, true);
    }
    if (parm === 'ASIGN_REG' || parm === 'BSIGN_REG') {
      const k = parm === 'ASIGN_REG' ? 0 : 1, s = parm.slice(0, 5);
      if (val === '0') { a[`CINNS_${p * 3 + k}`] = 'ENABLE'; a[`CINBY_${p * 3 + k}`] = 'ENABLE'; }
      else { a[`CEMUX_${s}${p}1`] = ce; a[`CLKMUX_${s}${p}1`] = clk; a[`RSTMUX_${s}${p}1`] = rst; if (sync) a[`RSTGENMUX_${s}${p}1`] = 'SYNC'; }
    }
    if (parm === 'PIPE_REG') {
      if (val === '0') {
        for (const k of [`CPRNS_${p * 3}`, `CPRBY_${p * 3}`, `CPRNS_${p * 3 + 1}`, `CPRBY_${p * 3 + 1}`]) a[k] = 'ENABLE';
        a[`PPREG${p}_NS${HL}_${idx}`] = 'ENABLE'; a[`PPREG${p}_BYP${HL}_${idx}`] = 'ENABLE';
      } else {
        for (const s of ['ASIGN', 'BSIGN']) { a[`CEMUX_${s}${p}2`] = ce; a[`CLKMUX_${s}${p}2`] = clk; a[`RSTMUX_${s}${p}2`] = rst; }
        regs(`REGP${p}`, false);
        if (sync) { a[`RSTGENMUX_ASIGN${p}2`] = 'SYNC'; a[`RSTGENMUX_BSIGN${p}2`] = 'SYNC'; a[`RSTGEN${HL}MUX_REGP${p}`] = 'SYNC'; }
      }
    }
    if (parm === 'OUT_REG') {
      if (val === '0') { a[`OREG${p}_BYP${HL}_${idx}`] = 'ENABLE'; a[`OREG${p}_NS${HL}_${idx}`] = 'ENABLE'; }
      else regs(`OREG${p}`, true);
    }
    if (parm === 'SOA_REG' && p) {
      if (val === '0') {
        if (evenOdd) { a.IRBY_IRMATCHH_9 = 'ENABLE'; a.IRNS_IRMATCHH_9 = 'ENABLE'; } else { a.IRBY_IRMATCHL_8 = 'ENABLE'; a.IRNS_IRMATCHL_8 = 'ENABLE'; }
      } else regs('REGSD', true);
    }
  }
}

/** set_dsp_attrs for the MULT9X9 and MULT18X18: the DSP's attribute codes. */
export function dspAttrs(ctx, typ, params, num, attrs) {
  const a = {};
  let idx = Number(num[1]);
  if (typ === 'MULT9X9') { a.M9MODE_EN = 'ENABLE'; mult9x9(params, attrs, a, idx >> 1, idx, idx & 1); }
  else if (typ === 'MULT18X18') {
    idx *= 2; mult9x9(params, attrs, a, idx >> 1, idx, idx & 1);
    idx += 1; mult9x9(params, attrs, a, idx >> 1, idx, idx & 1);
  } else throw new Error(`gowin_pack: the DSP primitive ${typ} is not supported yet (only MULT9X9 and MULT18X18)`);
  const fin = new Set();
  for (const [attr, v] of Object.entries(a)) addAttrVal(ctx.db, 'DSP', fin, ATTRIDS.dsp.ids[attr], typeof v === 'string' ? ATTRIDS.dsp.vals[v] : v);
  return fin;
}

export { setBits };

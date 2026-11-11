// Silinx toolchain - the Gowin's bitstream writer (#2303): Apicula's gowin_pack (YosysHQ/apicula, MIT, Copyright (c) 2019
// Pepijn de Vos) ported to JavaScript for the GW1N, byte for byte (test/gowin-pack.test.js: its .fs on the examples). From
// nextpnr-himbaechel-gowin's routed netlist and the device's chip database (chipdb.js): the routing's fuses, the
// isolated segments, the GSR and configuration, each bel's (place.js), the dual-mode pins', the constant ones, then the
// fuses' bitmap with its checksum, and the .fs text: header, the rows with their CRC, the block SRAMs' initial values,
// footer. Isomorphic: gowinPack(netlist, db) -> the .fs text.
import { ATTRIDS } from './attrids.js';
import { addAttrVal, setBits, shortvalFuses, tileMap, fuseBitmap } from './chipdb.js';
import { place, sliceFuses } from './place.js';

const BEL = /^X(\d+)Y(\d+)\/(?:GSR|LUT|DFF|IOB|MUX|ALU|ODDR|OSC[ZFHWOA]?|BUF[GS]|RAM16SDP4|RAM16SDP2|RAM16SDP1|PLL|IOLOGIC|CLKDIV2|CLKDIV|BSRAM|ALU|MULTALU18X18|MULTALU27X18|MULTALU36X18|MULTADDALU18X18|MULTADDALU12X12|MULT36X36|MULT18X18|MULT12X12|MULT9X9|PADD18|PADD9|BANDGAP|DQCE|DCS|USERFLASH|EMCU|DHCEN|MIPI_OBUF|MIPI_IBUF|DLLDLY|PINCFG|PLLA|ADC)(\w*)/;
const BSRAM_TYPES = new Set(['DP', 'SDP', 'SP', 'ROM']);
const DSP_TYPES = new Set(['ALU54D', 'MULT36X36', 'MULTALU36X18', 'MULTADDALU18X18', 'MULTALU18X18', 'MULT18X18', 'MULT9X9', 'PADD18', 'PADD9', 'MULT12X12', 'MULTALU27X18', 'MULTADDALU12X12']);

/** get_bels: the cells placed on bels, as { typ, row, col, num, parms, attrs, name, cell } (row, col from 1), with the aux bels
 *  of the block SRAMs and DSPs. */
function* bels(top) {
  for (const [name, cell] of Object.entries(top.cells)) {
    if (cell.type.startsWith('DUMMY_') || cell.type === 'OSER16' || cell.type === 'IDES16' || !('NEXTPNR_BEL' in cell.attributes)) continue;
    const bel = cell.attributes.NEXTPNR_BEL;
    if (bel === 'VCC' || bel === 'GND' || bel.endsWith('/GND') || bel.endsWith('/VCC')) continue;
    const m = BEL.exec(bel);
    if (!m) throw new Error(`gowin_pack: Unknown bel:${bel}`);
    const col = Number(m[1]) + 1, row = Number(m[2]) + 1, num = m[3];
    if ('DIFF' in cell.attributes) throw new Error(`gowin_pack: ${name}: differential I/O is not supported yet`);
    const one = (typ, c, n = num) => ({ typ, row, col: c, num: n, parms: cell.parameters, attrs: cell.attributes, name, cell });
    if (cell.type === 'rPLL') throw new Error(`gowin_pack: ${name}: the rPLL is not supported yet`);
    if (BSRAM_TYPES.has(cell.type)) for (const off of [1, 2]) yield one('BSRAM_AUX', col + off);
    if (DSP_TYPES.has(cell.type)) for (let off = 1; off < 9; off++) yield one('DSP_AUX', col + off);
    yield one(cell.type, col);
  }
}

// get_pips: the routing's pips (row, col from 1; src and dest as gowin_pack reads them); a pass-through LUT for a pip from XD
function pipsOf(top, passLuts) {
  const out = [];
  for (const net of Object.values(top.netnames)) {
    const routing = String(net.attributes?.ROUTING ?? '').split(';');
    for (let i = 1; i < routing.length; i += 3) {
      const pip = routing[i];
      const m = /^X(\d+)Y(\d+)\/(\w+)\/(\w+)$/.exec(pip);
      if (!m) continue;
      const [, x, y, a, b] = m;
      if (a.startsWith('XD')) {
        if (b.startsWith('F')) continue;
        const init = { A: '1010101010101010', B: '1100110011001100', C: '1111000011110000', D: '1111111100000000' }[b[0]];
        passLuts.push({ typ: 'LUT4', row: Number(y) + 1, col: Number(x) + 1, num: b[1], parms: { INIT: init }, attrs: {}, name: `$PACKER_PASS_LUT_${passLuts.length}`, cell: null });
        continue;
      }
      out.push({ row: Number(y) + 1, col: Number(x) + 1, src: b, dest: a });
    }
  }
  return out;
}

// do_hclk_banks: a bank's HCLK output enabled where it is routed
function hclkBanks(db, row, col, dest) {
  if (dest !== 'HCLK_BANK_OUT0' && dest !== 'HCLK_BANK_OUT1') return [];
  const a = new Set();
  addAttrVal(db, 'HCLK', a, ATTRIDS.hclk.ids[`BRGMUX${dest.at(-1)}_BRGOUT`], ATTRIDS.hclk.vals.ENABLE);
  const ttyp = db.grid[row][col];
  return db.shortval.get(ttyp)?.has('HCLK') ? shortvalFuses(db, ttyp, a, 'HCLK') : [];
}

// route: each pip's fuses (a clock pip's, an HCLK wire's, a general one's with its alone nodes')
function route(ctx, pips) {
  const { db, tilemap } = ctx;
  const hclkFuses = (src, dest) => {
    let set = false;
    for (const [k, dests] of db.hclk_pips) {
      const srcs = dests.get(dest);
      if (!srcs?.has(src)) continue;
      set = true;
      const [row, col] = k.split(',').map(Number), bits = srcs.get(src);
      bits.push(...hclkBanks(db, row, col, dest));   // (gowin_pack.py updates the database's set)
      setBits(tilemap.get(k), bits);
    }
    return set;
  };
  for (const { row, col, src, dest } of pips) {
    const t = db.tileAt(row - 1, col - 1), tile = tilemap.get(`${row - 1},${col - 1}`);
    let bits;
    const clock = t.get('clock_pips');
    if (clock.has(dest)) bits = clock.get(dest).get(src);
    else if (dest === 'FCLKA' || dest === 'FCLKB' || hclkFuses(src, dest)) continue;
    else {
      bits = t.get('pips').get(dest)?.get(src);
      const alone = t.get('alonenode').get(dest);
      if (bits && alone) for (const [srcs, fuses] of alone) if (!srcs.includes(src)) bits.push(...fuses);
    }
    if (!bits) throw new Error(`gowin_pack: ${src} ${dest} not found in tile ${row} ${col}`);
    setBits(tile, bits);
  }
}

// isolate_segments: the segment wires nextpnr asks to cut
function isolateSegments(ctx, top) {
  const { db, tilemap } = ctx;
  for (const net of Object.values(top.netnames)) {
    const val = net.attributes?.SEG_WIRES_TO_ISOLATE;
    if (val === undefined) continue;
    for (const w of String(val).split(';')) {
      const m = /^X(\d+)Y(\d+)\/(\w+)$/.exec(w);
      if (!m) continue;
      const col = Number(m[1]), row = Number(m[2]), wire = m[3];
      const alone = db.tileAt(row, col).get('alonenode_6').get(wire);
      if (!alone) throw new Error(`gowin_pack: Wire ${wire} is not in alonenode fuse table`);
      if (alone.length !== 1) throw new Error(`gowin_pack: Incorrect alonenode fuse table for ${wire}`);
      setBits(tilemap.get(`${row},${col}`), alone[0][1]);
    }
  }
}

// gsr and dualmode_pins: the configuration's (the GW1N's tile types 50, 83 and 51)
function configFuses(ctx) {
  const { db, tilemap } = ctx;
  const gsr = new Set(), cfg = new Set(), set = new Set(), clr = new Set();
  addAttrVal(db, 'GSR', gsr, ATTRIDS.gsr.ids.GSRMODE, ATTRIDS.gsr.vals.ACTIVE_LOW);
  for (const [k, v] of [['GSR', 'USED'], ['GOE', 'F0'], ['GSR', 'F0'], ['DONE', 'F0'], ['GWD', 'F0']]) addAttrVal(db, 'CFG', cfg, ATTRIDS.cfg.ids[k], ATTRIDS.cfg.vals[v]);
  for (const k of ['JTAG_AS_GPIO', 'SSPI_AS_GPIO', 'MSPI_AS_GPIO', 'DONE_AS_GPIO', 'RECONFIG_AS_GPIO', 'READY_AS_GPIO', 'CPU_AS_GPIO_25', 'CPU_AS_GPIO_0', 'CPU_AS_GPIO_1', 'I2C_AS_GPIO']) {
    if (!(k in ATTRIDS.cfg.ids)) continue;
    addAttrVal(db, 'CFG', set, ATTRIDS.cfg.ids[k], ATTRIDS.cfg.vals.UNKNOWN);
    addAttrVal(db, 'CFG', clr, ATTRIDS.cfg.ids[k], ATTRIDS.cfg.vals.YES);
  }
  const each = f => { for (let r = 0; r < db.rows; r++) for (let c = 0; c < db.cols; c++) f(r, c, db.grid[r][c], tilemap.get(`${r},${c}`)); };
  each((r, c, ttyp, tile) => {
    const bits = [];
    if (ttyp === 50 || ttyp === 83) bits.push(...shortvalFuses(db, ttyp, gsr, 'GSR'));
    if (ttyp === 50 || ttyp === 51) bits.push(...shortvalFuses(db, ttyp, cfg, 'CFG'));
    setBits(tile, bits);
  });
  return () => each((r, c, ttyp, tile) => {
    if (ttyp !== 50 && ttyp !== 51) return;
    const clrBits = shortvalFuses(db, ttyp, clr, 'CFG');
    if (!clrBits.length) return;
    setBits(tile, clrBits, 0);
    setBits(tile, shortvalFuses(db, ttyp, set, 'CFG'));
  });
}

// CRC-16/ARC (poly 0x8005 reflected, init 0)
const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xA001 : c >>> 1; t[i] = c; }
  return t;
})();
const crc16 = bytes => { let c = 0; for (const b of bytes) c = (c >>> 8) ^ CRC_TABLE[(c ^ b) & 0xFF]; return c; };
const B2B = Array.from({ length: 256 }, (_, i) => i.toString(2).padStart(8, '0'));
const bitsText = bytes => { let s = ''; for (const b of bytes) s += B2B[b]; return s; };

// a row of bits, reversed (fliplr), packed into bytes (np.packbits: the first bit the most significant), padded with ones on the left
function packRow(row, pad) {
  const n = row.length + pad, out = new Uint8Array(n / 8);
  for (let i = 0; i < n; i++) {
    const bit = i < pad ? 1 : row[row.length - 1 - (i - pad)];
    if (bit) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}

// header_footer: the checksum of the main grid (fliplr, packed as one bit string) in the footer's second command
function checksumFooter(rows, ftr) {
  let even = 0, odd = 0, acc = 0, nbits = 0, idx = 0;
  for (const row of rows) for (let i = row.length - 1; i >= 0; i--) {
    acc = (acc << 1) | row[i]; nbits++;
    if (nbits === 8) { if (idx % 2 === 0) even += acc; else odd += acc; idx++; acc = 0; nbits = 0; }
  }
  if (nbits) { acc <<= 8 - nbits; if (idx % 2 === 0) even += acc; else odd += acc; }
  const sum = (even * 256 + odd) & 0xFFFF;
  ftr[1] = Uint8Array.from([0x0A, 0, 0, 0, 0, 0, sum >> 8, sum & 0xFF]);
}

// write_bitstream: the .fs text
function fsText(rows, hdr, ftr) {
  const w = rows[0].length, pad = Math.ceil(w / 8) * 8 - w;
  hdr[hdr.length - 1] = Uint8Array.from([...hdr.at(-1).subarray(0, 2), rows.length >> 8, rows.length & 0xFF]);
  const out = [];
  let crcdat = [], preamble = 3;
  for (const ba of hdr) {
    if (!preamble && ba[0] !== 0xD2) crcdat.push(...ba);
    preamble = Math.max(0, preamble - 1);
    out.push(`${bitsText(ba)}\n`);
  }
  const ones = '1'.repeat(48);
  for (const row of rows) {
    const ba = packRow(row, pad);
    crcdat.push(...ba);
    const crc = crc16(crcdat);
    crcdat = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
    out.push(`${bitsText(ba)}${B2B[crc & 0xFF]}${B2B[crc >> 8]}${ones}\n`);
  }
  out.push(`${bitsText(ftr[0])}\n`);
  for (const ba of ftr.slice(1)) out.push(`${bitsText(ba)}\n`);
  return out.join('');
}

/** gowin_pack: the .fs text of a routed netlist (nextpnr-himbaechel-gowin's JSON, parsed) on a device's database (chipdb.js). */
export function gowinPack(netlist, db) {
  const top = netlist.modules?.top;
  if (top?.settings?.['packer.arch'] !== 'himbaechel/gowin') throw new Error('gowin_pack: only netlists made by nextpnr-himbaechel-gowin are supported');
  const nets = name => new Set(top.netnames[name]?.bits || []);
  const gnd = nets('$PACKER_GND'), vcc = nets('$PACKER_VCC');
  const ctx = { db, tilemap: tileMap(db), slices: new Map(), banks: new Map(), ioBels: new Map(), bsramInit: null, lastMode: '',
    isConst: w => gnd.has(w) || vcc.has(w) };
  const passLuts = [];
  route(ctx, pipsOf(top, passLuts));
  isolateSegments(ctx, top);
  const dualmode = configFuses(ctx);
  place(ctx, [...bels(top), ...passLuts]);
  sliceFuses(ctx);
  dualmode();
  for (let r = 0; r < db.rows; r++) for (let c = 0; c < db.cols; c++) {
    const own = db.const.get(db.grid[r][c]);
    if (own) setBits(ctx.tilemap.get(`${r},${c}`), own);
  }
  const main = fuseBitmap(db, ctx.tilemap);
  const hdr = db.cmd_hdr.map(b => Uint8Array.from(b)), ftr = db.cmd_ftr.map(b => Uint8Array.from(b));
  checksumFooter(main, ftr);
  return fsText(ctx.bsramInit ? [...main, ...ctx.bsramInit] : main, hdr, ftr);
}

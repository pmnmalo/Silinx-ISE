// Silinx toolchain - Apicula's chip database of a Gowin device (#2303), as gowin_pack reads it (apycula/chipdb.py Device):
// its .msgpack.xz (YosysHQ/apicula, MIT; the fuses Apicula found in Gowin's files, not shipped by Silinx: read from YoWASP's
// package, which the place and route downloads anyway, gowin-files.js) decoded, and the helpers gowin_pack uses: a tile's
// type at a position, the tile bitmaps, the fuse tables by attribute set (get_table_fuses and its short, long and bank forms),
// the logic info's codes and their reverse.
import { unxz } from './xz.js';
import { unpack } from './msgpack.js';

/** The Device of a chip database's .msgpack.xz bytes: its fields as Maps and arrays, and Device's properties. */
export function loadChipdb(xzBytes) {
  const d = unpack(unxz(xzBytes));
  const db = Object.fromEntries(d);
  db.rows = db.grid.length;
  db.cols = db.grid[0].length;
  db.tileAt = (row, col) => db.tiles.get(db.grid[row][col]);
  db.height = 0; for (let r = 0; r < db.rows; r++) db.height += db.tileAt(r, 0).get('height');
  db.width = 0; for (let c = 0; c < db.cols; c++) db.width += db.tileAt(0, c).get('width');
  // (Device.bank_tiles: the tile of each bank's BANK<n> bel, the last one found)
  db.bankTiles = new Map();
  for (let r = 0; r < db.rows; r++) for (let c = 0; c < db.cols; c++) {
    for (const bel of db.tileAt(r, c).get('bels').keys()) if (bel.startsWith('BANK')) db.bankTiles.set(parseInt(bel.slice(4), 10), [r, c]);
  }
  // logicinfo by "attr,val" (its keys already), and its reverse on demand (Device.rev_logicinfo)
  const rev = new Map();
  db.revLogicinfo = name => {
    if (!rev.has(name)) rev.set(name, new Map([...db.logicinfo.get(name)].map(([k, code]) => [code, k.split(',').map(Number)])));
    return rev.get(name);
  };
  return db;
}

/** add_attr_val: the logic info's code of (attr, val) added to the set, when it has one (0 is none). */
export function addAttrVal(db, table, attrs, attr, val) {
  if (attr === undefined || val === undefined) throw new Error(`gowin_pack: no attribute id or value for the ${table} table`);
  const code = db.logicinfo.get(table).get(`${attr},${val}`);
  if (code) attrs.add(code);
}

/** get_table_fuses: the fuses of every record whose features the attribute set has ([[row, col]]; a new array). */
export function tableFuses(attrs, table) {
  const bits = [];
  for (const [key, fuses] of table) {
    let full = true;
    for (const s of key.split(',')) {
      const a = Number(s);
      if (a === 0) break;
      if (a > 0 ? !attrs.has(a) : attrs.has(-a)) { full = false; break; }
    }
    if (full) bits.push(...fuses);
  }
  return bits;
}
export const shortvalFuses = (db, ttyp, attrs, name) => tableFuses(attrs, need(db.shortval.get(ttyp), name, ttyp));
export const longvalFuses = (db, ttyp, attrs, name) => tableFuses(attrs, need(db.longval.get(ttyp), name, ttyp));
/** get_bank_fuses: the bank's table, its keys' first number the bank. */
export function bankFuses(db, ttyp, attrs, name, bank) {
  const own = new Map();
  for (const [k, v] of need(db.longval.get(ttyp), name, ttyp)) {
    const i = k.indexOf(',');
    if (Number(k.slice(0, i)) === bank) own.set(k.slice(i + 1), v);
  }
  return tableFuses(attrs, own);
}
/** get_bank_io_fuses: the bank's I/O table, IOBA or IOBB, whichever the tile has. */
export function bankIoFuses(db, ttyp, attrs) {
  const lv = db.longval.get(ttyp);
  const name = lv?.has('IOBA') ? 'IOBA' : lv?.has('IOBB') ? 'IOBB' : null;
  return name ? tableFuses(attrs, lv.get(name)) : [];
}
function need(tables, name, ttyp) {
  const t = tables?.get(name);
  if (!t) throw new Error(`gowin_pack: no fuse table ${name} for the tile type ${ttyp}`);
  return t;
}

/** loc2bank: the bank of the I/O pins of a tile (its pin A's, else B's). */
export function locBank(db, row, col) {
  const name = pinName(db, row, col);
  const bank = db.pin_bank.get(`${name}A`) ?? db.pin_bank.get(`${name}B`);
  if (bank === undefined) throw Object.assign(new Error(`no bank for ${name}`), { pinless: true });
  return bank;
}
// rc2tbrl_0: IOT3, IOL12… of a tile on the edge
function pinName(db, row, col) {
  let edge = db.corner_tiles_io.get(`${row},${col}`);
  if (!edge) edge = row === 0 ? 'T' : row === db.rows - 1 ? 'B' : col === 0 ? 'L' : col === db.cols - 1 ? 'R' : undefined;
  const idx = 'TB'.includes(edge) ? col + 1 : row + 1;
  return `IO${edge}${idx}`;
}

/** The tiles' bitmaps (tile_bitmap with empty): `${row},${col}` -> { w, h, bits: Uint8Array(h * w) }. */
export function tileMap(db) {
  const m = new Map();
  for (let r = 0; r < db.rows; r++) for (let c = 0; c < db.cols; c++) {
    const t = db.tileAt(r, c), w = t.get('width'), h = t.get('height');
    m.set(`${r},${c}`, { w, h, bits: new Uint8Array(w * h) });
  }
  return m;
}
/** Sets (or clears) bits [[row, col]] of a tile's bitmap. */
export function setBits(tile, bits, v = 1) { for (const [r, c] of bits) tile.bits[r * tile.w + c] = v; }

/** fuse_bitmap: the tiles' bitmaps in one, height x width, rows of Uint8Array. */
export function fuseBitmap(db, tilemap) {
  const rows = Array.from({ length: db.height }, () => new Uint8Array(db.width));
  let y = 0;
  for (let r = 0; r < db.rows; r++) {
    let x = 0, h = 0;
    for (let c = 0; c < db.cols; c++) {
      const t = tilemap.get(`${r},${c}`);
      for (let i = 0; i < t.h; i++) rows[y + i].set(t.bits.subarray(i * t.w, (i + 1) * t.w), x);
      x += t.w; h = t.h;
    }
    y += h;
  }
  return rows;
}

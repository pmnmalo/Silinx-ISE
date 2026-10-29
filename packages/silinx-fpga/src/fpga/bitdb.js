// The bit database of a Spartan-3E device, the part that needs no file system (Node and the
// browser): its files merged into what fpga/bitgen.js reads. The files (packages/silinx-fpga/bitdb,
// read by research/s3e-bitstream/db.mjs in Node, fetched by web/js/open-flow-browser.js in the browser):
//   s3e-tiles.json             the tile types' features (PIPs, site settings), shared by the devices
//   <device>-tiles.json        (optional) features of one device that add to or replace the shared ones,
//                              and the PIPs of the shared types its tiles do not have (#74)
//   <device>-layout.json       where every tile is in the frame data, the bitstream format (IDCODE, frames)
//   <device>-lut.json          where every LUT is
//   <device>-bram.json         where every block-RAM memory bit is
//   <device>-<package>-pads.json   the pads' own features (absolute bits; the pads differ per package)
// The pads of the package (pin -> I/O tile) come from the device description (padsFromDevice).
import { makeDb, padsFromDevice } from './bitgen.js';

/** Device and package of a part: 'xc3s500efg320-4' -> { device: 'xc3s500e', pkg: 'fg320' }; a
 *  device name alone ('xc3s500e') has pkg null. */
export function splitPart(part) {
  const m = /^(xc3s\d+e)([a-z]+\d+)?(?:-\d+)?$/i.exec(String(part || '').trim());
  return m ? { device: m[1].toLowerCase(), pkg: m[2] ? m[2].toLowerCase() : null } : { device: String(part || '').toLowerCase(), pkg: null };
}

/** The file names of a device's database (pkg: its pads in that package too). */
export const dbFileNames = (device, pkg = null) => ({
  tiles: 's3e-tiles.json', ownTiles: `${device}-tiles.json`, layout: `${device}-layout.json`, lut: `${device}-lut.json`,
  bram: `${device}-bram.json`, ...(pkg ? { pads: `${device}-${pkg}-pads.json` } : {}),
});

/** The shared tile types with a device's own features over them (per type: the device's features
 *  win, the PIPs its tiles do not have add to the shared ones (absent, #74), its other settings
 *  replace the shared ones). */
export function mergeTiles(shared, own) {
  if (!own) return shared;
  const types = { ...shared.types };
  for (const [type, t] of Object.entries(own.types || {})) {
    const s = types[type] || { features: {} };
    types[type] = { ...s, ...t, features: { ...(s.features || {}), ...(t.features || {}) } };
    if (s.absent && t.absent) types[type].absent = [...new Set([...s.absent, ...t.absent])];
  }
  return { ...shared, ...own, types, padDriveDefault: { ...(shared.padDriveDefault || {}), ...(own.padDriveDefault || {}) } };
}

// The settings of the other DCMs from the top-left one's (research/s3e-bitstream/dcm-mirror.mjs, stage
// F): the DCMs are mirror images in the frame data. Relative to its tile, a bit (df, db) of the top-left
// DCM is (18 - df, db) in the top-right one (the column mirrored: 19 frames), (df, 63 - db) in the bottom
// ones (the row mirrored: 64 bits), both for the bottom right. Not mirrored: the pin inverters, and the
// bits in frame 37 (one place per pair of DCMs, shared by the two). The XC3S1200E's four side DCMs
// (DCM_H_…) are the same four images.
const PAIR = 37;   // the top-left DCM's frame of the pair's shared bits
const m = (flipF, flipB, pairF, pairB) => ([df, db]) => (df === PAIR ? [pairF, db + pairB] : [flipF ? 18 - df : df, flipB ? 63 - db : db]);
export const MIRRORS = {
  DCM_TR_CENTER: m(true, false, 18, 0),
  DCM_BL_CENTER: m(false, true, 37, -320),
  DCM_BR_CENTER: m(true, true, 18, -320),
  DCM_H_BR_CENTER: m(false, false, 0, 0),
  DCM_H_BL_CENTER: m(true, false, 18, -384),
  DCM_H_TR_CENTER: m(false, true, 0, 64),
  DCM_H_TL_CENTER: m(true, true, 18, -320),
};

/** The features of the top-left DCM's settings (not its PIPs) mirrored onto tile type `type`. */
export function mirrorFeatures(tl, type) {
  const f = MIRRORS[type];
  const out = {};
  for (const [k, bits] of Object.entries(tl)) {
    if (!k.startsWith('DCM:')) continue;
    if (/^DCM:\w+INV:/.test(k)) { out[k] = [...bits]; continue; }
    out[k] = bits.map(s => { const [df, db] = f(s.replace('!', '').split(',').map(Number)); return `${s[0] === '!' ? '!' : ''}${df},${db}`; }).sort();
  }
  return out;
}

/** A DCM whose CLKIN comes from a global clock buffer: ISE's bitgen clears one bit of DCM:USED (#47):
 *  DCM:CLKIN:GCLK; a DCM whose CLKFX / CLKFX180 drive nothing: three more (DCM:DFS:OFF). Added to
 *  every DCM tile type (research/s3e-bitstream/db.mjs has the measurements' account). */
export const DCM_ROUTED = { 'DCM:CLKIN:GCLK': ['!0,100'], 'DCM:DFS:OFF': ['!-39,7', '!-39,12', '!-39,43'] };
export function withDcmClkinGclk(tiles) {
  const types = { ...tiles.types };
  for (const type of ['DCM_TL_CENTER', ...Object.keys(MIRRORS)]) {
    if (!types[type]) continue;
    const add = Object.fromEntries(Object.entries(type === 'DCM_TL_CENTER' ? DCM_ROUTED : mirrorFeatures(DCM_ROUTED, type)).filter(([k]) => !types[type].features?.[k]));
    types[type] = { ...types[type], features: { ...(types[type].features || {}), ...add } };
  }
  return { ...tiles, types };
}

/** The database files read ({ name: parsed JSON | null }, by dbFileNames' names) merged into
 *  { layout, lut, tiles, bram, padFeatures }. */
export function dbFilesFrom(json, pkg) {
  return {
    layout: json.layout, lut: json.lut?.lutF || null,
    tiles: mergeTiles(json.tiles || { types: {} }, json.ownTiles),
    bram: json.bram, padFeatures: pkg && json.pads ? json.pads.padFeatures : null,
  };
}

/** The bit database ready for bitgen(), from the files (dbFilesFrom) and the device description
 *  (its package's pads), for part 'xc3s250ecp132-4'. */
export function makeBitDb(files, dev, part) {
  const { device, pkg } = splitPart(part);
  const db = makeDb({ ...files, tiles: withDcmClkinGclk(files.tiles), pads: dev ? padsFromDevice(dev) : {} });
  if (pkg) db.format.part = `${device.slice(2)}${pkg}`;
  // (the device description: the direction of a bidirectional PIP from its nodes, bitgen.js pipFeatures)
  if (dev && typeof dev.node === 'function') db.graph = dev;
  return db;
}

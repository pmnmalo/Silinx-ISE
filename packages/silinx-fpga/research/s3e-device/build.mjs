// Silinx - device measurements: the measured description in Silinx's packed format
// (packages/silinx-fpga/src/fpga/device.js), from Silinx's own measurements only (research/s3e-device/README.md).
//
// The measurements are given as:
//   { part, family, rows?, cols?,
//     tiles: [{ name, type, sites: [[siteName, bonded]], r?, c? }],  (bonded: 0 internal, 1 bonded, 2 unbonded)
//     types: { <key>: { name?, wires: [names], pips: [[from, to, flags]], sites: [{ type, pins: [[pin, 'i'|'o', wire]] }] } },
//                                       (name: the tile type, when several keys are variants of one type)
//     joins: [['TILE/WIRE', 'TILE/WIRE']] }
// and fed to the packer as the lines it reads (DeviceBuilder), so the result is the same format as
// the shipped graphs and loads with loadDevice(). Rows and columns: the device's grid when the measurements
// carry it (rows, cols, each tile's r, c: the device report's, as its tile names; the placer's distances and its halves
// of the chip are on it, #3), else tile Y counted from the top, tile X (tiles of one X / Y then share a place).
import { DeviceBuilder, PIP_BIDI } from '../../src/fpga/device.js';
import { tileXY } from './observe.mjs';

const splitKey = k => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; };

/** The lines DeviceBuilder reads for the measurements m (a generator: large devices are not held as one string). */
export function* measuredLines(m) {
  const grid = m.rows !== undefined && m.tiles.every(t => t.r !== undefined && t.c !== undefined);
  const pos = m.tiles.map(t => tileXY(t.name));
  const maxY = Math.max(...pos.map(p => p.y)), maxX = Math.max(...pos.map(p => p.x));
  yield `(xdl_resource_report v0.2 ${m.part} ${m.family || 'spartan3e'}`;
  yield grid ? `(tiles ${m.rows} ${m.cols}` : `(tiles ${maxY + 1} ${maxX + 1}`;
  const conns = new Map();   // 'TILE/WIRE' -> ['TILE WIRE', ...]
  for (const [a, b] of m.joins) {
    for (const [x, y] of [[a, b], [b, a]]) { if (!conns.has(x)) conns.set(x, []); conns.get(x).push(splitKey(y).join(' ')); }
  }
  for (let i = 0; i < m.tiles.length; i++) {
    const t = m.tiles[i], tp = m.types[t.type], p = pos[i];
    if (!tp) throw new Error(`no measured type ${t.type} for ${t.name}`);
    yield grid ? `(tile ${t.r} ${t.c} ${t.name} ${tp.name || t.type} ${t.sites.length}` : `(tile ${maxY - p.y} ${p.x} ${t.name} ${tp.name || t.type} ${t.sites.length}`;
    for (let k = 0; k < tp.sites.length; k++) {
      const s = tp.sites[k], [name, bonded] = t.sites[k];
      yield `(primitive_site ${name} ${s.type} ${bonded === 1 ? 'bonded' : bonded === 2 ? 'unbonded' : 'internal'} ${s.pins.length}`;
      for (const [pin, dir, wire] of s.pins) yield `(pinwire ${pin} ${dir === 'o' ? 'output' : 'input'} ${wire})`;
      yield ')';
    }
    for (const w of tp.wires) {
      const c = conns.get(`${t.name}/${w}`) || [];
      yield `(wire ${w} ${c.length}`;
      for (const x of c) yield `(conn ${x})`;
      yield ')';
    }
    for (const [from, to, flags = 0] of tp.pips) yield `(pip ${t.name} ${from} ${flags & PIP_BIDI ? '=-' : '->'} ${to})`;
    yield '(tile_summary)';
  }
  yield ')';
  yield '(primitive_defs 0';
}

/** The packed description (the object loadDevice() takes) of measurements m. */
export function packMeasured(m) {
  const b = new DeviceBuilder();
  for (const l of measuredLines(m)) b.line(l);
  return b.finish();
}

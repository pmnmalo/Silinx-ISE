// Stage S6-D (#726), the probe: does ISE program a routing switch (PIP) on a net that has no pins? One PIP in every
// INT tile next to a CLB (a different PIP in each, the INT switch box's PIPs in turn): if it does, one design measures
// a thousand PIPs, each in its own tile (ana-pipprobe6.mjs: the bits of the tile's frames and band).
//   <part>.pips1.xdl   all the PIPs on one net, no pins
//   <part>.pips2.xdl   each PIP a net of its own, no pins
//   <part>.pips3.xdl   each PIP on a net of its tile's TIEOFF (HARD1) to its CLB's slice (A1), not on its path
//   <part>.pips4.xdl   each PIP on a net of its tile's TIEOFF, no inpin
//   <part>.pips5.xdl   pips3's nets without the PIPs (the base of pips3 and pips4)
//   node research/s6/gen-pipprobe6.mjs <out dir> [part] [offset]   (default the XC6SLX16, offset 0: the PIPs' turn)
// <part>.pips.json: { tile: 'from dir to' } the PIP of each tile.
// It does, with an outpin (pips4: the 2026-10-29 probe, 1001 of 1083 PIPs set bits, pips3 the same, pips5 none):
// --int writes the INT switch box's round, a design per offset as pips4 (<part>.int<offset>.xdl / .json).
//   node research/s6/gen-pipprobe6.mjs --int <out dir> <offset,…> [part]
// --others: the switch box of the other INT tiles (no CLB of their X and Y: INT_BRK, INT_BRAM, IOI_INT, LIOI_INT,
// INT_GCLK, the INT tiles of the DSP and edge columns), on nets of their TIEOFF: <part>.oth0 a PIP the INT tiles
// share in each (their bits known: the columns' rule checked), <part>.oth1 and .oth2 each type's own PIPs in turn.
//   node research/s6/gen-pipprobe6.mjs --others <out dir> [part]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../../../test/s6-lib.mjs';

const INT_TYPES = /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)$/;

/** The INT-like tiles that intTiles leaves out (no CLB of the same X and Y). */
export function otherIntTiles(device) {
  const mine = new Set(intTiles(device)), out = [];
  for (let k = 0; k < device.tileNames.length; k++) if (INT_TYPES.test(device.tileType(k)) && !mine.has(k)) out.push(k);
  return out;
}

/** A tile's PIPs (XDL text) split into those the INT switch box has (shared) and its type's own. */
export function tilePips(device, k, intSet) {
  const n = device.templates[device.tileTemplate[k]].from.length, shared = [], own = [];
  for (let i = 0; i < n; i++) { const x = device.pip(k, i), t = `${x.from} ${x.dir} ${x.to}`; (intSet.has(t) ? shared : own).push({ from: x.from, dir: x.dir, to: x.to }); }
  return { shared, own };
}

/** The TIEOFF of each tile: { tile: { tieoff } }. */
export function tieoffs(device, tiles) {
  const out = {}, all = device.sites();
  for (const k of tiles) { const t = all.find(s => s.tile === k && s.type === 'TIEOFF'); if (t) out[device.tileNames[k]] = { tieoff: t.name }; }
  return out;
}

/** The INT tiles that have a CLB of the same X and Y (their frames and band known from its slices'). */
export function intTiles(device) {
  const cle = new Set();
  for (let k = 0; k < device.tileNames.length; k++) if (/^CLEX[LM]$/.test(device.tileType(k))) cle.add(device.tileNames[k].replace(/^CLEX[LM]_/, ''));
  const out = [];
  for (let k = 0; k < device.tileNames.length; k++) if (device.tileType(k) === 'INT' && cle.has(device.tileNames[k].slice(4))) out.push(k);
  return out;
}

/** One PIP per tile, the switch box's in turn from offset: { tile name: { from, dir, to } }. */
export function probePips(device, tiles, offset = 0) {
  const out = {};
  tiles.forEach((k, i) => {
    const n = device.templates[device.tileTemplate[k]].from.length, p = device.pip(k, (offset + i) % n);
    out[p.tile] = { from: p.from, dir: p.dir, to: p.to };
  });
  return out;
}

/**
 * The designs' XDL: one net with every PIP (oneNet) or a net per PIP; with pins ({ tile: { tieoff, slice } }) each
 * net from the tile's TIEOFF (HARD1) and, with inpin, to the slice's A1; pips false: the nets without their PIP.
 */
export function probeXdl(part, pips, { oneNet = true, pins = null, inpin = true, withPips = true } = {}) {
  const line = ([t, p]) => (withPips ? `  pip ${t} ${p.from} ${p.dir} ${p.to} ,\n` : ''), out = [`design "pips" ${part} v3.2 ,\n  cfg "";\n`];
  if (pins) {
    for (const t of Object.keys(pips)) {
      const q = pins[t];
      out.push(`inst "t_${t}" "TIEOFF",placed ${t} ${q.tieoff}  ,\n  cfg "" ;\n`);
      if (inpin && !q.slice) throw new Error(`${t}: no slice for an inpin`);
      if (inpin) out.push(`inst "s_${t}" "${q.type}",placed ${q.tile} ${q.slice}  ,\n  cfg "" ;\n`);
    }
    Object.entries(pips).forEach(([t, p], i) => out.push(`net "probe${i}" , \n  outpin "t_${t}" HARD1 ,\n${inpin ? `  inpin "s_${t}" A1 ,\n` : ''}${line([t, p])}  ;\n`));
  } else if (oneNet) out.push(`net "probe" , \n${Object.entries(pips).map(line).join('')}  ;\n`);
  else Object.entries(pips).forEach((e, i) => out.push(`net "probe${i}" , \n${line(e)}  ;\n`));
  return out.join('');
}

/** Each INT tile's TIEOFF site and a slice of its CLB: { tile: { tieoff, slice, type, tile (the CLB's) } }. */
export function probePins(device, tiles) {
  const out = {}, all = device.sites();
  for (const k of tiles) {
    const t = device.tileNames[k], xy = t.slice(4);
    const tie = all.find(s => s.tile === k && s.type === 'TIEOFF'), sl = all.find(s => device.tileNames[s.tile].replace(/^CLEX[LM]_/, '') === xy && /^SLICE/.test(s.type));
    if (tie && sl) out[t] = { tieoff: tie.name, slice: sl.name, type: sl.type, tile: device.tileNames[sl.tile] };
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--others') {
    const [, out, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
    const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), tiles = otherIntTiles(device), pins = tieoffs(device, tiles);
    const k0 = device.tile('INT_X17Y15'), intSet = new Set();
    for (let i = 0; i < device.templates[device.tileTemplate[k0]].from.length; i++) { const x = device.pip(k0, i); intSet.add(`${x.from} ${x.dir} ${x.to}`); }
    const by = {}, choose = (pick) => {
      const pips = {}, seen = {};
      for (const k of tiles) {
        const t = device.tileNames[k];
        if (!pins[t]) continue;
        const ps = tilePips(device, k, intSet), type = device.tileType(k), j = seen[type] = (seen[type] ?? -1) + 1, x = pick(ps, j);
        if (x) pips[t] = x;
      }
      return pips;
    };
    by.oth0 = choose((ps, j) => ps.shared[(j * 37) % ps.shared.length]);
    by.oth1 = choose((ps, j) => ps.own.length ? ps.own[j % ps.own.length] : null);
    by.oth2 = choose((ps, j) => ps.own.length ? ps.own[(j + Math.ceil(ps.own.length / 2)) % ps.own.length] : null);
    fs.mkdirSync(out, { recursive: true });
    for (const [name, pips] of Object.entries(by)) {
      const tp = Object.fromEntries(Object.keys(pips).map(t => [t, pins[t]]));
      fs.writeFileSync(path.join(out, `${p}.${name}.xdl`), probeXdl(part, pips, { pins: tp, inpin: false }));
      fs.writeFileSync(path.join(out, `${p}.${name}.json`), JSON.stringify(Object.fromEntries(Object.entries(pips).map(([t, x]) => [t, `${x.from} ${x.dir} ${x.to}`]))));
      console.log(`${name}: ${Object.keys(pips).length} PIPs`);
    }
    process.exit(0);
  }
  if (process.argv[2] === '--int') {
    const [, out, offsets, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
    const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), tiles = intTiles(device), pins = probePins(device, tiles);
    fs.mkdirSync(out, { recursive: true });
    for (const o of offsets.split(',').map(Number)) {
      const pips = probePips(device, tiles, o);
      fs.writeFileSync(path.join(out, `${p}.int${o}.xdl`), probeXdl(part, pips, { pins, inpin: false }));
      fs.writeFileSync(path.join(out, `${p}.int${o}.json`), JSON.stringify(Object.fromEntries(Object.entries(pips).map(([t, x]) => [t, `${x.from} ${x.dir} ${x.to}`]))));
    }
    console.log(`${part}: ${offsets.split(',').length} designs of ${tiles.length} PIPs`);
    process.exit(0);
  }
  const [out, part = 'xc6slx16csg324-3', offset = '0'] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-pipprobe6.mjs <out dir> [part] [offset]'); process.exit(1); }
  const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2');
  const pips = probePips(device, intTiles(device), +offset);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${p}.pips1.xdl`), probeXdl(part, pips));
  fs.writeFileSync(path.join(out, `${p}.pips2.xdl`), probeXdl(part, pips, { oneNet: false }));
  const pins = probePins(device, intTiles(device));
  fs.writeFileSync(path.join(out, `${p}.pips3.xdl`), probeXdl(part, pips, { pins }));
  fs.writeFileSync(path.join(out, `${p}.pips4.xdl`), probeXdl(part, pips, { pins, inpin: false }));
  fs.writeFileSync(path.join(out, `${p}.pips5.xdl`), probeXdl(part, pips, { pins, withPips: false }));
  fs.writeFileSync(path.join(out, `${p}.pips.json`), JSON.stringify(Object.fromEntries(Object.entries(pips).map(([t, x]) => [t, `${x.from} ${x.dir} ${x.to}`]))));
  console.log(`${part}: ${Object.keys(pips).length} PIPs, one per INT tile`);
}

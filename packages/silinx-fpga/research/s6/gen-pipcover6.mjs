// Stage S6-D (#726): the PIPs the isolated probe (gen-pipprobe6.mjs --int) could not measure, on routed paths. A PIP
// alone on a net sets no bits when its source wire is not driven (the continuations of a wire, xE -> xB, and a
// bidirectional PIP's other direction): here each is the end of a path from a driver (a TIEOFF's HARD1, HARD0 or KEEP1,
// or a slice output near its tile) found by a breadth-first search over the device's graph, its wires used by no other path,
// each in a tile of its own. ana-pipcover6.mjs takes the bits of the path's other PIPs in the tile (measured) away.
//   node research/s6/gen-pipcover6.mjs <out dir> <targets.json> [part] [design name]
// targets.json: ['from dir to' (the signal from 'from' to 'to'; a bidirectional PIP 'a =- b' as 'b -> a' for its
// other direction)]. Writes <part>.<name>.xdl and <part>.<name>.json ({ tile: { pip, path: [pips] } }).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device } from '../../../../test/s6-lib.mjs';
import { intTiles, probePins } from './gen-pipprobe6.mjs';

const OUTS = ['A', 'B', 'C', 'D', 'AMUX', 'BMUX', 'CMUX', 'DMUX', 'AQ', 'BQ', 'CQ', 'DQ'];

/** The PIP of a tile carrying the signal from -> to (a bidirectional one either way): { i, from, to, text (XDL) } or null. */
export function findTarget(device, k, from, to) {
  let i = device.findPip(k, from, to);
  if (i >= 0) { const x = device.pip(k, i); return { i, from, to, text: `${x.from} ${x.dir} ${x.to}` }; }
  i = device.findPip(k, to, from);
  if (i >= 0 && device.pipIsBidi(k, i)) return { i, from, to, text: `${to} =- ${from}` };
  return null;
}

/**
 * A path from one of the sources ([{ inst pin, node }]) to node `goal`, over PIPs of the tiles `near` accepts (INT and CLB
  * tiles around the target), no route-throughs, avoiding the nodes in `used`: [{ k, i }] (the PIPs in order) and the source, or null.
 */
export function findPath(device, sources, goal, { near, used, depth = 6 }) {
  const prev = new Map(), queue = [];
  for (const s of sources) if (!used.has(s.node)) { prev.set(s.node, { source: s }); queue.push([s.node, 0]); }
  for (let q = 0; q < queue.length; q++) {
    const [n, d] = queue[q];
    if (n === goal) {
      const pips = [];
      let x = n, p;
      while (!(p = prev.get(x)).source) { pips.unshift({ k: p.k, i: p.i }); x = p.from; }
      return { pips, source: p.source };
    }
    if (d >= depth) continue;
    device.forEachPip(n, (to, k, i, flags) => {
      if (flags & 2 || prev.has(to) || used.has(to) || !near(k)) return;
      prev.set(to, { from: n, k, i });
      queue.push([to, d + 1]);
    });
  }
  return null;
}

/** The design: each target in a tile of its own with a path to it; { xdl, key, missed: [targets without a path] }. */
export function coverDesign(device, part, targets, name = 'cover') {
  const tiles = intTiles(device), pins = probePins(device, tiles), used = new Set(), key = {}, missed = [];
  const xy = k => device.tileNames[k].match(/X(\d+)Y(\d+)$/).slice(1).map(Number), free = new Set(tiles);
  const insts = [], nets = [];
  targets.forEach((target, ti) => {
    const [from, , to] = target.split(' ');
    for (const k of [...free].slice(ti % 7)) {
      const t = findTarget(device, k, from, to), tname = device.tileNames[k];
      if (!t || !pins[tname]) continue;
      const fromNode = device.node(k, from), toNode = device.node(k, to);
      if (fromNode < 0 || toNode < 0 || used.has(toNode)) continue;
      const [x0, y0] = xy(k);
      const near = kk => /^(INT|CLEX[LM])$/.test(device.tileType(kk)) && Math.abs(xy(kk)[0] - x0) <= 4 && Math.abs(xy(kk)[1] - y0) <= 4;
      // the drivers: the TIEOFF and the slice of the target's tile and of its neighbours (one row or column away)
      const sources = [];
      for (const [dx, dy] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nt = `INT_X${x0 + dx}Y${y0 + dy}`, nq = pins[nt];
        if (!nq) continue;
        for (const pin of ['HARD1', 'HARD0', 'KEEP1']) sources.push({ inst: `t_${nt}`, pin, node: device.sitePinNode(nq.tieoff, pin), site: nq.tieoff, tile: nt, type: 'TIEOFF' });
        for (const pin of OUTS) sources.push({ inst: `s_${nt}`, pin, node: device.sitePinNode(nq.slice, pin), site: nq.slice, tile: nq.tile, type: nq.type });
      }
      for (let j = sources.length - 1; j >= 0; j--) if (sources[j].node < 0) sources.splice(j, 1);
      const p = findPath(device, sources, fromNode, { near, used: new Set([...used, toNode]) });
      if (!p) continue;
      const nodes = [p.source.node, ...p.pips.map(e => device.pipNodes(e.k, e.i)[1]), toNode];
      for (const n of nodes) used.add(n);
      free.delete(k);
      const s = p.source;
      insts.push(`inst "${s.inst}" "${s.type}",placed ${s.tile} ${s.site}  ,\n  cfg "" ;\n`);
      const line = (kk, i) => { const x = device.pip(kk, i); return `  pip ${x.tile} ${x.from} ${x.dir} ${x.to} ,\n`; };
      nets.push(`net "c${ti}" , \n  outpin "${s.inst}" ${s.pin} ,\n${p.pips.map(e => line(e.k, e.i)).join('')}${line(k, t.i)}  ;\n`);
      key[tname] = { pip: t.text, signal: `${from} -> ${to}`, path: p.pips.map(e => { const x = device.pip(e.k, e.i); return `${x.tile} ${x.from} ${x.dir} ${x.to}`; }) };
      return;
    }
    missed.push(target);
  });
  return { xdl: `design "${name}" ${part} v3.2 ,\n  cfg "";\n${[...new Set(insts)].join('')}${nets.join('')}`, key, missed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, targetsFile, part = 'xc6slx16csg324-3', name = 'cover'] = process.argv.slice(2);
  if (!targetsFile) { console.error('usage: node research/s6/gen-pipcover6.mjs <out dir> <targets.json> [part] [name]'); process.exit(1); }
  const { device } = s6Device(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2');
  const { xdl, key, missed } = coverDesign(device, part, JSON.parse(fs.readFileSync(targetsFile, 'utf8')), name);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${p}.${name}.xdl`), xdl);
  fs.writeFileSync(path.join(out, `${p}.${name}.json`), JSON.stringify(key));
  console.log(`${part}: ${Object.keys(key).length} targets on paths${missed.length ? `, ${missed.length} without: ${missed.join('; ')}` : ''}`);
}

// Silinx - the pads of a Spartan-6 whose I/O paths the bit database knows (#3152): an output pad's O pin reached from
// the general interconnect, an input pad's I pin reaching it, through PIPs whose bits Silinx knows (bitgen.js
// knownPipS6) and the I/O logic's route-throughs (route-nets.js FREE_ROUTETHRU). nextpnr's chip database leaves the
// other PIPs out (nextpnr-export.js unknownPipsS6), so a pad without such a path cannot be routed: on the XC6SLX16 the
// slave OLOGIC2's D1 -> OQ in the top bank's TIOI_INNER tiles (the master's known), 30 pads' outputs. The placer gives
// a port without a LOC a pad that has its path (place.js) (browser + Node).
//
//   padPathsS6(device, db, sites) -> Map pad name -> { in: bool, out: bool }
import { PIP_ROUTETHRU } from '../device.js';
import { knownPipS6 } from './bitgen.js';
import { routingResources, FREE_ROUTETHRU } from './route-nets.js';

const cache = new WeakMap();
// the longest path a pad's input takes to the interconnect (pad, ILOGIC2 or IODELAY2, the tile's output wires)
const IN_DEPTH = 12;

/** The pads' known paths, see above (built once a device). sites: s6Sites(device). */
export function padPathsS6(device, db, sites) {
  if (cache.has(device)) return cache.get(device);
  const { general, rtPins } = routingResources(device);
  const known = knownPipS6(device, db);
  // a PIP Silinx can write: its bits known, a route-through only through the I/O logic or a clock spine's BUFH
  const usable = (k, i, flags) => {
    if (!known(k, i)) return false;
    if (!(flags & PIP_ROUTETHRU)) return true;
    const rt = rtPins[device.templates[device.tileTemplate[k]].rt[i]];
    return !!rt && FREE_ROUTETHRU.has(rt.type);
  };
  // the outputs: every node off the interconnect that a known PIP from it reaches, then onward off it
  const reached = new Uint8Array(device.nodeCount);
  let q = [];
  for (let k = 0; k < device.tileCount; k++) {
    const tp = device.templates[device.tileTemplate[k]];
    for (let i = 0; i < tp.from.length; i++) {
      const [f, t] = device.pipNodes(k, i);
      if (!general[f] || general[t] || reached[t] || !usable(k, i, tp.flags[i])) continue;
      reached[t] = 1;
      q.push(t);
    }
  }
  while (q.length) {
    const next = [];
    for (const n of q) device.forEachPip(n, (t, k, i, flags) => { if (!general[t] && !reached[t] && usable(k, i, flags)) { reached[t] = 1; next.push(t); } });
    q = next;
  }
  // the inputs: from the pad's I pin to the interconnect
  const reachesGeneral = start => {
    const seen = new Set([start]);
    let front = [start], hit = false;
    for (let d = 0; d < IN_DEPTH && front.length && !hit; d++) {
      const next = [];
      for (const n of front) device.forEachPip(n, (t, k, i, flags) => {
        if (hit || seen.has(t) || !usable(k, i, flags)) return;
        if (general[t]) { hit = true; return; }
        seen.add(t);
        next.push(t);
      });
      front = next;
    }
    return hit;
  };
  const paths = new Map();
  for (const p of sites.pads.values()) {
    const o = device.sitePinNode(p.name, 'O'), i = device.sitePinNode(p.name, 'I');
    paths.set(p.name, { in: i >= 0 && reachesGeneral(i), out: o >= 0 && !!reached[o] });
  }
  cache.set(device, paths);
  return paths;
}

/** Does pad `name` take an IOB of direction dir ('in', 'out', 'inout')? (paths: padPathsS6's, or null: every pad.) */
export const padFits = (paths, name, dir) => {
  const p = paths?.get(name);
  return !p || ((dir === 'in' || p.out) && (dir === 'out' || p.in));
};

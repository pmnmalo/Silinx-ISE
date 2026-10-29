// Silinx - the Spartan-6's constant sources (#729, #730): the TIEOFF of the switch boxes (HARD1 onto VCC_WIRE, HARD0
// onto GND_WIRE), the one that ties a site pin to 1 or 0, as ISE ties them (a net "vcc" / "gnd" a TIEOFF, its
// source an XDL_DUMMY instance of the TIEOFF) (browser + Node).
//
//   tieoffFor(device, node, power) -> { site, tile (name), node (its HARD1 / HARD0), pin, hops } | null

const cache = new WeakMap();
// the TIEOFFs of a device by tile position
function tieoffsOf(device) {
  if (cache.has(device)) return cache.get(device);
  const at = new Map();
  for (const s of device.sites('TIEOFF')) {
    const k = s.tile, key = device.tileRow[k] * 4096 + device.tileCol[k];
    at.set(key, { site: s.name, tile: s.tileName, hard1: device.sitePinNode(s.name, 'HARD1'), hard0: device.sitePinNode(s.name, 'HARD0') });
  }
  cache.set(device, at);
  return at;
}

/**
 * The TIEOFF a site pin's node is tied from (power: 'vcc' or 'gnd'): of those near it (4 tiles), the one whose
 * constant reaches it in the fewest switches (6 at most: a slice's pin is 2 away, its switch box input and the
 * pin; an output pad's 5, through its OLOGIC2's route-through, as ISE ties it), the nearest first; null when none
 * does.
 */
export function tieoffFor(device, node, power, near = 4) {
  const at = tieoffsOf(device);
  const r = (device.nodeR0[node] + device.nodeR1[node]) >> 1, c = (device.nodeC0[node] + device.nodeC1[node]) >> 1;
  const cands = [];
  for (let dr = -near; dr <= near; dr++) {
    for (let dc = -near; dc <= near; dc++) {
      const t = at.get((r + dr) * 4096 + c + dc);
      if (t) cands.push({ t, d: Math.abs(dr) + Math.abs(dc) });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  let best = null;
  for (const { t, d } of cands) {
    const src = power === 'vcc' ? t.hard1 : t.hard0;
    if (src < 0) continue;
    // a breadth-first search of 6 switches from the constant's wire
    let front = [src], hops = 0;
    const seen = new Set(front);
    for (; hops < 6 && front.length && !seen.has(node); hops++) {
      const next = [];
      for (const n of front) device.forEachPip(n, to => { if (!seen.has(to)) { seen.add(to); next.push(to); } });
      front = next;
    }
    if (seen.has(node) && (!best || hops < best.hops || (hops === best.hops && d < best.d))) best = { site: t.site, tile: t.tile, node: src, pin: power === 'vcc' ? 'HARD1' : 'HARD0', hops, d };
  }
  return best;
}

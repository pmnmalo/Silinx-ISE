// Silinx - device measurements: what the XDL of designs routed by ISE shows about the device
// (research/s3e-device/README.md). No device report: only ISE's own routed designs.
//
// A design routed by ISE (par, then xdl -ncd2xdl) is legal (its DRC is clean), so every PIP in it
// exists, every site it places an instance on exists and has that instance's type, and every net
// is a tree of PIPs from its source pin to its sink pins. What it does not say is which wires of
// different tiles are joined by metal (one node): the XDL lists a net's PIPs sorted by tile, not
// as a path. That is inferred here, net by net: the from-wire of a PIP that no other PIP of the net
// drives in the same tile is joined to a to-wire of another tile of the net (or is the source
// pin's wire). The candidate is the one of the same wire family (wireFamily). When there are
// several, the joins already found decide (resolveAmbiguous: the same wires at the same offset
// elsewhere); what stays ambiguous goes to the hypothesis tests (hypotheses.mjs).

/** Tile name -> { prefix, x, y } (CLB_X10Y10 -> { prefix: 'CLB', x: 10, y: 10 }), or null. */
export function tileXY(name) {
  const m = /^(.*)_X(\d+)Y(\d+)$/.exec(name);
  return m ? { prefix: m[1], x: +m[2], y: +m[3] } : null;
}

/**
 * The family of a wire name: wires of one family may be one node across tiles. Doubles and hexes
 * (UG331: a direction and a length 2 or 6, taps BEG, A, B, MID, C, D, END, END_S / END_N variants,
 * a prefix of the tile type in some tiles: CLKV_E6MID2): 'seg:E2'; long lines: 'long:H' / 'long:V'
 * (their index rotates from tile to tile); output multiplexer lines (OMUX5, OMUX_N12, OMUX_NE12, and
 * the corner names NW_N / SE_S): 'omux'; the carry chain (COUT_N1 -> the CIN of the CLB above):
 * 'carry'; the global clock network (every wire with GCLK in its name): 'gclk'; the other names of
 * the block-RAM and multiplier tiles' pins (BRAM_DIA_B0_INT in the site's tile, BRAM_DIA_B0 in the
 * interconnect tile): 'pin:<name without _INT>'. Other wires (pins, local wires): null.
 */
export function wireFamily(name) {
  let m = /^(?:[A-Z0-9]+_)*?([NSEW])(2|6)(?:BEG|A|B|MID|C|D|END)(?:_[NSEW])?\d+$/.exec(name);
  if (m) return `seg:${m[1]}${m[2]}`;
  if ((m = /^(?:[A-Z0-9]+_)*?L([HV])\d+$/.exec(name))) return `long:${m[1]}`;
  if (/^OMUX(?:_[NSEW]{1,2})?\d+$/.test(name) || name === 'NW_N' || name === 'SE_S') return 'omux';
  if (/^(?:COUT_N|CIN)\d+$/.test(name)) return 'carry';
  // (a pin wire stays in its tile: CLKT_GCLK_PINWIREk, a BUFGMUX's O)
  if (/GCLK/.test(name) && !/PINWIRE/.test(name)) return 'gclk';
  if (/^BRAM_/.test(name)) return `pin:${name.replace(/_INT(\d*)$/, '$1')}`;
  return null;
}

const key = (tile, wire) => `${tile}/${wire}`;
const splitKey = k => { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; };

/**
 * What one routed design shows: { pips, sites, joins, pins, ambiguous, unexplained }.
 *   pips: [{ tile, from, dir, to }] (every PIP of the design)
 *   sites: [{ site, tile, type }] (instances placed by ISE: the site exists, is in that tile, takes that type)
 *   joins: [[ 'TILE/WIRE', 'TILE/WIRE' ]] (a to-wire and a from-wire of different tiles that are one node)
 *   pins: [{ site, pin, dir: 'o' | 'i', tile, wire }] (the tile wire a site pin is attached to)
 *   ambiguous: [{ from: 'TILE/WIRE', candidates: ['TILE/WIRE', ...] }]  unexplained: ['TILE/WIRE']
 */
export function observeDesign(design) {
  const instSite = new Map(design.insts.filter(i => i.placed).map(i => [i.name, i]));
  const out = { pips: [], sites: [], joins: [], pins: [], ambiguous: [], unexplained: [] };
  for (const i of instSite.values()) out.sites.push({ site: i.site, tile: i.tile, type: i.type });
  for (const net of design.nets) {
    if (!net.pips.length) continue;
    for (const p of net.pips) out.pips.push(p);
    const r = observeNet(net, instSite);
    for (const k of ['joins', 'pins', 'ambiguous', 'unexplained']) out[k].push(...r[k]);
  }
  return out;
}

/** The joins and pin wires one routed net shows (see observeDesign). instSite: inst name -> inst. */
export function observeNet(net, instSite) {
  const res = { joins: [], pins: [], ambiguous: [], unexplained: [] };
  // signal direction of each PIP: a bidirectional PIP ('=-') is named in one orientation whatever
  // the direction of the signal; it is turned round when that continues the net from a driven wire
  const pips = net.pips.map(p => ({ tile: p.tile, from: p.from, to: p.to }));
  const tos0 = new Set(pips.map(p => key(p.tile, p.to)));
  net.pips.forEach((p, i) => {
    const q = pips[i];
    if (p.dir === '=-' && !tos0.has(key(q.tile, q.from)) && tos0.has(key(q.tile, q.to))) [q.from, q.to] = [q.to, q.from];
  });
  const toSet = new Set(pips.map(p => key(p.tile, p.to)));
  const fromSet = new Set(pips.map(p => key(p.tile, p.from)));
  const srcInst = net.outpins.length === 1 ? instSite.get(net.outpins[0].inst) : null;
  const srcTile = srcInst?.tile;
  // the from-wires no PIP of the net drives in their own tile
  const dangling = [...new Map(pips.filter(p => !toSet.has(key(p.tile, p.from))).map(p => [key(p.tile, p.from), p])).values()];
  const candsOf = p => { const fam = wireFamily(p.from); return fam ? [...new Set(pips.filter(q => q.tile !== p.tile && wireFamily(q.to) === fam).map(q => key(q.tile, q.to)))] : []; };
  // (else a wire of a family with no candidate in the net: the clock tiles' pins, a BUFGMUX's O, #3's sites' pins)
  const plain = dangling.filter(p => p.tile === srcTile && !wireFamily(p.from));
  const srcWires = plain.length ? plain : dangling.filter(p => p.tile === srcTile && !candsOf(p).length);
  const candidates = new Set(dangling.flatMap(candsOf));
  for (const p of dangling) {
    const cands = candsOf(p);
    if (cands.length === 1) { res.joins.push([cands[0], key(p.tile, p.from)]); continue; }
    // (src: the net's source tile, where the wire may be the source pin's own, a side BUFGMUX's CLKL_GCLK_PWOk)
    if (cands.length > 1) { res.ambiguous.push({ from: key(p.tile, p.from), candidates: cands, ...(p.tile === srcTile ? { src: true } : {}) }); continue; }
    if (p.tile === srcTile && srcWires.length === 1 && srcWires[0] === p && srcInst.site) {
      res.pins.push({ site: srcInst.site, pin: net.outpins[0].pin, dir: 'o', tile: p.tile, wire: p.from });
      continue;
    }
    res.unexplained.push(key(p.tile, p.from));
  }
  // sink pins: the to-wire no PIP of the net continues, in the sink's tile (one sink in that tile); of a family only when
  // it is no join's candidate (no other tile's wire continues from it: a BUFGMUX's I0, a DCM's CLKIN)
  const ends = pips.filter(p => !fromSet.has(key(p.tile, p.to)) && (!wireFamily(p.to) || !candidates.has(key(p.tile, p.to))));
  const endsIn = tile => { const e = ends.filter(p => p.tile === tile), plain = e.filter(p => !wireFamily(p.to)); return [...new Set((plain.length ? plain : e).map(p => p.to))]; };
  const byTile = new Map();
  for (const ip of net.inpins) {
    const inst = instSite.get(ip.inst);
    if (!inst?.site) continue;
    if (!byTile.has(inst.tile)) byTile.set(inst.tile, []);
    byTile.get(inst.tile).push({ ...ip, site: inst.site });
  }
  for (const [tile, sinks] of byTile) {
    const e = endsIn(tile);
    if (sinks.length === 1 && e.length === 1) res.pins.push({ site: sinks[0].site, pin: sinks[0].pin, dir: 'i', tile, wire: e[0] });
  }
  return res;
}

/** A join as a relative rule: 'CLB/E2BEG0 1,0 CLB/E2MID0' (prefixes and wires, offset in tile X / Y). */
export function joinRule(a, b) {
  const [ta, wa] = splitKey(a), [tb, wb] = splitKey(b);
  const A = tileXY(ta), B = tileXY(tb);
  if (!A || !B) return null;
  return `${A.prefix}/${wa} ${B.x - A.x},${B.y - A.y} ${B.prefix}/${wb}`;
}

/**
 * Decides ambiguous joins by the rules of the joins already known: a candidate whose rule (same
 * wires, same offset) was observed elsewhere is taken when it is the only such candidate. Repeats
 * until nothing changes. Returns { joins (the new ones), ambiguous (what is left) }.
 */
export function resolveAmbiguous(ambiguous, joins) {
  const rules = new Set(joins.map(([a, b]) => joinRule(a, b)));
  let left = ambiguous, found = [];
  for (;;) {
    const next = [];
    let n = 0;
    for (const x of left) {
      const ok = x.candidates.filter(c => rules.has(joinRule(c, x.from)));
      if (ok.length === 1) { found.push([ok[0], x.from]); rules.add(joinRule(ok[0], x.from)); n++; } else next.push(x);
    }
    left = next;
    if (!n) break;
  }
  return { joins: found, ambiguous: left };
}

/** The ambiguous from-wires of many nets (#3, the clock network): a wire is driven by the same join in every net that
 *  leaves it undriven, so its driver is in the intersection of their candidates; the nets' source tiles left out (the wire
 *  may be the source pin's there). Returns { joins: [[candidate, from]] (one left), ambiguous: [{ from, candidates }]
 *  (the intersection, two or more left; src entries as they were) }. */
export function intersectAmbiguous(ambiguous) {
  const by = new Map(), src = [];
  for (const x of ambiguous) {
    if (x.src) { src.push(x); continue; }
    if (!by.has(x.from)) by.set(x.from, x.candidates.slice());
    else { const s = new Set(x.candidates); by.set(x.from, by.get(x.from).filter(c => s.has(c))); }
  }
  const joins = [], left = [];
  for (const [from, c] of by) {
    if (c.length === 1) joins.push([c[0], from]);
    else if (c.length > 1) left.push({ from, candidates: c });
  }
  return { joins, ambiguous: [...left, ...src] };
}

/** Where a block RAM's output enters its interconnect tile, in an ISE-routed design (#3, round 6): for each net from a
 *  RAMB16 output, the site tile's wire RAMB16_DO… drives (`RAMB16_DOA0 -> BRAM_DOA0_INT0`) joined to the interconnect
 *  tile's wire the net's first PIP there leaves (`BRAM_DOA0 -> OMUXk`, its from-wire driven by no PIP of the net in that
 *  tile). isInterconnect(tile): a block-RAM interconnect tile. Returns [['TILE/WIRE', 'TILE/WIRE']]. */
export function blockRamOutputJoins(design, isInterconnect) {
  const out = [];
  for (const net of design.nets) {
    const site = net.pips.find(p => /^RAMB16_DO/.test(p.from) && /_INT\d$/.test(p.to));
    if (!site) continue;
    const driven = new Set(net.pips.map(p => `${p.tile}/${p.to}`));
    const enter = net.pips.find(p => isInterconnect(p.tile) && /^BRAM_DO/.test(p.from) && !driven.has(`${p.tile}/${p.from}`));
    if (enter) out.push([`${site.tile}/${site.to}`, `${enter.tile}/${enter.from}`]);
  }
  return out;
}


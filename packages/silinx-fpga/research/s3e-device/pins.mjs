// #3, the sites' pins: the pin wires ISE's routes showed (prototype.mjs observe) against a reference description (the
// shipped graph: local scoring only, as prototype.mjs score), per site type: which facts agree, which of the reference's
// pins no design used.

/**
 * obs: an observation ({ pins: [{ site, pin, dir, tile, wire }] }); dev: a Device. Returns { right, wrong: [text],
 * types: { [siteType]: { seen, total, names, totalNames, missing: [pin names] } } }: seen / total count the (tile type,
 * site position, pin) of the reference that a fact shows, names / totalNames the pin names.
 */
export function pinCensus(obs, dev) {
  const key = (tt, i, pin) => `${tt}|${i}|${pin}`;
  const all = new Map(), seen = new Map();
  dev.templates.forEach(tp => tp.sites.forEach((s, i) => {
    if (!all.has(s.type)) all.set(s.type, new Set());
    for (const pin of s.pins.keys()) all.get(s.type).add(key(tp.type, i, pin));
  }));
  let right = 0;
  const wrong = [];
  for (const p of obs.pins) {
    const s = dev.site(p.site);
    const sp = s && dev.sitePin(p.site, p.pin);
    if (!sp || sp.wire !== p.wire || sp.tileName !== p.tile) { wrong.push(`${p.site}.${p.pin}: ${p.tile}/${p.wire}, the reference ${sp ? `${sp.tileName}/${sp.wire}` : 'has no such pin'}`); continue; }
    right++;
    const tp = dev.templates[dev.tileTemplate[s.tile]], i = dev.tileSites[s.tile].findIndex(([n]) => n === p.site);
    const ty = tp.sites[i].type;
    if (!seen.has(ty)) seen.set(ty, new Set());
    seen.get(ty).add(key(tp.type, i, p.pin));
  }
  const types = {};
  for (const [ty, ks] of [...all].sort()) {
    const o = seen.get(ty) || new Set(), names = new Set([...ks].map(k => k.split('|')[2])), on = new Set([...o].map(k => k.split('|')[2]));
    types[ty] = { seen: o.size, total: ks.size, names: on.size, totalNames: names.size, missing: [...names].filter(n => !on.has(n)).sort() };
  }
  return { right, wrong, types };
}

/**
 * An observation of another package of the same die (the FT256), its I/O sites renamed to dev's: a pad is the k-th I/O
 * site of its tile, k from its I pin's wire (Ik_PINWIRE, the rule every pin of dev's package follows); the other sites
 * (slices, block RAMs, the I/O tiles' VCC sites…) are named alike in every package. Returns { pins, dropped: [sites] } (the
 * pads with no I pin fact: their place is not known).
 */
export function renamePads(obs, dev) {
  const IO = /IOIS|IBUFS/;
  const name = new Map();
  for (const p of obs.pins) {
    const m = p.pin === 'I' && p.dir === 'o' && IO.test(p.tile) && /^I(\d)_PINWIRE$/.exec(p.wire);
    const k = m && dev.tileIndex.get(p.tile);
    if (k === undefined || !m) continue;
    const types = dev.templates[dev.tileTemplate[k]].sites;
    const s = dev.tileSites[k].filter(([n], i) => /^(IOB|IBUF|DIFF)/.test(types[i].type))[+m[1]];
    if (s) name.set(p.site, s[0]);
  }
  // (the observation's I/O instances: the pads; a VCC site of an I/O tile is named alike in every package)
  const pad = new Set((obs.sites || []).filter(x => /^(IOB|IBUF|DIFF)/.test(x.type)).map(x => x.site));
  const pins = [], dropped = new Set();
  for (const p of obs.pins) {
    if (!pad.has(p.site)) { pins.push(p); continue; }
    if (name.has(p.site)) pins.push({ ...p, site: name.get(p.site) });
    else dropped.add(p.site);
  }
  return { pins, dropped: [...dropped] };
}

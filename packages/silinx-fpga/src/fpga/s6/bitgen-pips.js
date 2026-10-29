// Silinx toolchain - a Spartan-6 switch box's PIP bits (#732; the INT databases measured in research/s6, #726): a PIP's
// bits by the signal's direction, and a net's bidirectional PIPs' directions. Browser + Node.

/** A PIP's bits by the signal's direction (from, to): the path round's, else the probe's ('a =- b': a to b). */
export function pipLookup(db, from, dir, to) {
  if (db.cover[`${from} -> ${to}`]) return db.cover[`${from} -> ${to}`];
  const key = dir === '->' ? `${from} -> ${to}` : `${from} =- ${to}`;
  if (db.pips[key]) return db.pips[key];
  if (db.own?.[key]?.length) return db.own[key];
  // an I/O tile's renamed wires (INT_IOI_LOGICIN_Bk, INT_IOI_GFANk): the INT switch box's
  const plain = w => w.replace(/^INT_IOI_/, '');
  if (plain(from) !== from || plain(to) !== to) return pipLookup({ ...db, own: null }, plain(from), dir, plain(to)) ?? db.own?.[key];
  return db.own?.[key];
}

/**
 * The direction of a net's bidirectional PIPs: a walk from its outpins over its PIPs (either way for a bidirectional
 * one); [from, to] per PIP index (null for one the walk does not reach).
 */
export function pipDirections(device, net, design) {
  const node = (t, w) => device.node(t, w), pinNode = p => { const i = design.insts.find(x => x.name === p.inst); return i ? device.sitePinNode(i.site, p.pin) : -1; };
  const seen = new Set(net.outpins.map(pinNode).filter(n => n >= 0)), dirs = net.pips.map(() => null);
  let moved = true;
  while (moved) {
    moved = false;
    net.pips.forEach((p, i) => {
      if (dirs[i]) return;
      const a = node(p.tile, p.from), b = node(p.tile, p.to);
      if (seen.has(a)) { dirs[i] = [p.from, p.to]; seen.add(b); moved = true; } else if (p.dir === '=-' && seen.has(b)) { dirs[i] = [p.to, p.from]; seen.add(a); moved = true; }
    });
  }
  return dirs;
}

// Silinx toolchain - the placer's slices (#405: out of place in core/fpga/place.js): the slice grid, the anchors a
// group of slices may take (its clocks' reach, SLICEM sites), the occupancy, and the initial placement (a warm
// start's targets first, then near the middle of the chip); every instance's position.
import { PlaceError } from './place.js';

/** { allowedAtG, anchorX, anchorY, fitsAt, gidx, gridSite, maxX, maxY, occ, posPairs, posX, posY, setAt } of place. */
export function mountSlices(ctx) {
  const {
    dev, packed, start, N, allowedOf, objs, random, sites
  } = ctx;

  // ---------------------------------------------------------------- slices: legal anchors, occupancy
  // the slice grid: index gx * GH + gy of slice (gx, gy); its site (null: no slice there), whether it
  // is a SLICEM, and the occupant (-1: free)
  const sliceList = [...dev.slices.values()];
  const maxX = Math.max(...sliceList.map(s => s.x)), maxY = Math.max(...sliceList.map(s => s.y));
  const GH = maxY + 1, GN = (maxX + 1) * GH;
  const gridSite = new Array(GN).fill(null);
  const gridM = new Uint8Array(GN);
  for (const s of sliceList) { gridSite[s.x * GH + s.y] = s; gridM[s.x * GH + s.y] = s.type === 'SLICEM' ? 1 : 0; }
  const gidx = (x, y) => (x < 0 || y < 0 || x > maxX || y > maxY ? -1 : x * GH + y);
  // allowedAt on the grid: a table of the slices an instance may take (null: any), one per clock
  // reach and SLICEM need (the slices the clock reaches, the SLICEM sites)
  const allowedTables = new Map();
  const allowedG = allowedOf.map((r, i) => {
    const m = packed.insts[i].type === 'SLICEM';
    if (!r && !m) return null;
    if (!allowedTables.has(r)) allowedTables.set(r, [null, null]);
    const t = allowedTables.get(r);
    if (!t[+m]) {
      const a = t[+m] = new Uint8Array(GN);
      for (let g = 0; g < GN; g++) if (gridSite[g] && (!r || r.has(gridSite[g].name)) && (!m || gridM[g] === 1)) a[g] = 1;
    }
    return t[+m];
  });
  const allowedAtG = (i, g) => { const a = allowedG[i]; return a === null || a[g] === 1; };
  const occ = new Int32Array(GN).fill(-1);   // grid index -> inst
  const fitsAt = (o, x, y) => {
    if (x % o.align[0] || y % o.align[1]) return false;
    for (const m of o.members) {
      const g = gidx(x + m.dx, y + m.dy);
      if (g < 0 || !gridSite[g] || !allowedAtG(m.inst, g)) return false;
    }
    return true;
  };
  const freeAt = (o, x, y) => o.members.every(m => occ[gidx(x + m.dx, y + m.dy)] < 0);
  const anchorX = new Int32Array(objs.length), anchorY = new Int32Array(objs.length);   // a group's slice (x, y) by object
  const setAt = (o, x, y) => {
    anchorX[o.id] = x; anchorY[o.id] = y;
    for (const m of o.members) {
      const g = gidx(x + m.dx, y + m.dy);
      occ[g] = m.inst;
      sites[m.inst] = gridSite[g];
    }
  };
  // initial placement: the largest groups first, each at a random free legal position near the
  // middle of the chip (then the annealing spreads and orders them)
  const slicesObjs = objs.filter(o => o.kind === 'macro').sort((a, b) => b.members.length - a.members.length);
  const total = slicesObjs.reduce((a, o) => a + o.members.length, 0);
  if (total > dev.slices.size) throw new PlaceError(`place: ${total} slices needed, the device has ${dev.slices.size}`);
  // a warm start: each group with a slice to start from on the free legal anchor nearest to it (the
  // exact ones first, the largest first), ring by ring around it; the others as without one
  const target = o => { const m = o.members.find(x => start.at[x.inst]?.x !== undefined); return m && { ...start.at[m.inst], x: start.at[m.inst].x - m.dx, y: start.at[m.inst].y - m.dy }; };
  const warm = start ? slicesObjs.filter(target).sort((a, b) => (target(b).exact - target(a).exact) || b.members.length - a.members.length) : [];
  for (const o of warm) {
    const t = target(o), cx = Math.round(t.x), cy = Math.round(t.y);
    let at = null;
    for (let r = 0; r <= maxX + maxY && !at; r++) {
      let bd = Infinity;
      for (let dx = -r; dx <= r; dx++) for (const dy of Math.abs(dx) === r ? [...Array(2 * r + 1).keys()].map(k => k - r) : [-r, r]) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x > maxX || y > maxY || !fitsAt(o, x, y) || !freeAt(o, x, y)) continue;
        const d = (x - t.x) ** 2 + (y - t.y) ** 2;
        if (d < bd) { bd = d; at = [x, y]; }
      }
    }
    if (at) setAt(o, at[0], at[1]);
  }
  const started = new Set(warm.filter(o => sites[o.members[0].inst]));
  for (const o of slicesObjs) {
    if (started.has(o)) continue;
    let done = false;
    for (let tries = 0; tries < 20000 && !done; tries++) {
      // a window around the centre that grows with the attempts
      const r = Math.min(1, 0.25 + tries / 4000);
      const x = Math.floor(maxX / 2 + (random() - 0.5) * (maxX + 1) * r), y = Math.floor(maxY / 2 + (random() - 0.5) * (maxY + 1) * r);
      if (x < 0 || y < 0 || !fitsAt(o, x, y)) continue;
      if (!freeAt(o, x, y)) continue;
      setAt(o, x, y);
      done = true;
    }
    if (!done) {
      // exhaustive search
      outer: for (let x = 0; x <= maxX; x++) for (let y = 0; y <= maxY; y++) {
        if (!fitsAt(o, x, y) || !freeAt(o, x, y)) continue;
        setAt(o, x, y);
        done = true;
        break outer;
      }
    }
    if (!done) throw new PlaceError(`place: no room for a group of ${o.members.length} slices (${o.macro || 'slice'})`);
  }
  // positions (tiles, y upward) of every instance
  const posX = new Float64Array(N), posY = new Float64Array(N);
  for (let i = 0; i < N; i++) { if (!sites[i]) throw new PlaceError(`place: ${packed.insts[i].name} not placed`); posX[i] = sites[i].px; posY[i] = sites[i].py; }
  const posPairs = () => Array.from({ length: N }, (_, i) => [posX[i], posY[i]]);

  return { allowedAtG, anchorX, anchorY, fitsAt, gidx, gridSite, maxX, maxY, occ, posPairs, posX, posY, setAt };
}

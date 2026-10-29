// Stage S6-E (#727): a DCM's or PLL's clock path and settings, shared by ana-cmt6.mjs (which measures them) and
// residual6.mjs (which predicts them).

/** The clock pad into a DCM / PLL instance and the BUFGMUXes its outputs drive: { pad, bufgs: [site] }. */
export function cmtPath(design, inst) {
  const by = new Map(design.insts.map(i => [i.name, i])), into = design.nets.find(n => n.inpins.some(p => p.inst === inst.name && /^CLKIN/.test(p.pin)));
  const walk = name => { const i = by.get(name); if (!i) return null; if (i.type === 'IOB') return i.site; const n = design.nets.find(x => x.inpins.some(p => p.inst === name)); return n ? walk(n.outpins[0]?.inst) : null; };
  const pad = into ? walk(into.outpins[0]?.inst) : null;
  const bufgs = design.nets.filter(n => n.outpins.some(p => p.inst === inst.name)).flatMap(n => n.inpins.map(p => by.get(p.inst))).filter(i => i?.type === 'BUFG').map(i => i.site).sort();
  return { pad, bufgs };
}

/** A DCM's or PLL's settings as ISE writes them (its cfg's attr::value, sorted, the names left out). */
export const cmtCfg = inst => inst.cfg.filter(c => !c.attr.startsWith('_') && c.value !== '#OFF').map(c => `${c.attr}::${c.value}`).sort().join(' ');

/**
 * A DCM's or PLL's bits by its clock path from the database (cmt-paths' kind): the base's, then the pad's and each
 * BUFGMUX's changes (a BUFG the base had: none); null when the pad or a BUFGMUX is not measured.
 */
export function predictCmt(kind, { pad, bufgs }) {
  const bits = new Set(kind.base), apply = d => { for (const x of d.clear) bits.delete(x); for (const x of d.set) bits.add(x); };
  if (pad !== kind.basePad) { const d = kind.pads[pad]; if (!d) return null; apply(d); }
  const extra = bufgs.filter(b => !kind.baseBufgs.includes(b));
  if (extra.length) { const d = kind.bufgs[extra[0]]; if (!d) return null; apply(d); }
  return bits;
}

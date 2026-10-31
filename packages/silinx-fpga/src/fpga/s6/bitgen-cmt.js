// Silinx toolchain - a Spartan-6 DCM's or PLL's bits (#732; measured in research/s6, #727 #1951): its clock path as
// measured whole, its settings at any site, its BUFGMUXes' REGC bits, its outputs', input BUFIO2's and spine's bits.
// Browser + Node.

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

/** The frame of a part's CMT settings in row 0 (#727: minor 30 of the CMT's column). */
export const CMT_FRAME = { xc6slx16: 357, xc6slx45: 565 };

/** A CMT's settings key: its kind (a DCM's by its Y's parity, the two DCMs of a tile differ) and its settings (#1951). */
export const cmtKind = inst => `${inst.type === 'DCM' ? `DCM${+inst.site.match(/Y(\d+)$/)[1] % 2 ? '1' : '0'}` : inst.type} ${cmtCfg(inst)}`;

/**
 * A DCM's or PLL's settings bits at its site (db/<device>-cmt-settings.json, ana-cmtsites6.mjs): its kind's pattern in
 * its tile's row (rowFirst: the row's first frame); null when that setting is not measured.
 */
export function predictCmtSettings(inst, settings, rowFirst) {
  const p = settings.patterns[cmtKind(inst)];
  return p ? p.bits.map(q => { const [f, b] = q.split(',').map(Number); return `${rowFirst + f},${b}`; }) : null;
}

/**
 * A BUFGMUX's REGC bit when a CMT drives it (#1951, measured on the XC6SLX16; the XC6SLX45's the same, #2025): one bit
 * per BUFGMUX of the REGC frame, from `bottom` for a CMT of the bottom half, from `top` for one of the top, the BUFGMUXes
 * in `order`.
 */
const REGC_S6 = { bottom: 1008, top: 1024, order: ['X3Y16', 'X3Y15', 'X3Y14', 'X2Y12', 'X3Y13', 'X2Y11', 'X2Y10', 'X2Y9', 'X3Y8', 'X3Y7', 'X3Y6', 'X2Y4', 'X3Y5', 'X2Y3', 'X2Y2', 'X2Y1'] };
export const CMT_REGC = { xc6slx16: REGC_S6, xc6slx45: REGC_S6 };

/** The REGC bits of the BUFGMUXes a CMT instance drives: ['frame,bit'] (null: the part not measured). */
export function cmtRegcBits(design, inst, part, regcFrame) {
  const r = CMT_REGC[part];
  if (!r) return null;
  const by = new Map(design.insts.map(i => [i.name, i])), top = /TOP/.test(inst.tile);
  return design.nets.filter(n => n.outpins.some(p => p.inst === inst.name)).flatMap(n => n.inpins.map(p => by.get(p.inst)))
    .filter(i => i?.type === 'BUFG' && i.placed).map(i => `${regcFrame},${(top ? r.top : r.bottom) + r.order.indexOf(i.site.replace(/^BUFGMUX_/, ''))}`);
}

/** An output's group: a DCM's CLKFX180 is its CLKFX's (the frequency synthesizer's bits, set by either). */
const outputGroup = pin => (pin === 'CLKFX180' ? 'CLKFX' : pin);

/** What a CMT instance uses: its outputs that drive a net (pin names by group, sorted) and the BUFIO2 site driving its CLKIN (null: none). */
export function cmtUses(design, inst) {
  const by = new Map(design.insts.map(i => [i.name, i]));
  const outputs = [...new Set(design.nets.filter(n => n.inpins.length).flatMap(n => n.outpins.filter(p => p.inst === inst.name).map(p => outputGroup(p.pin))))].sort();
  const into = design.nets.find(n => n.inpins.some(p => p.inst === inst.name && /^CLKIN/.test(p.pin))), src = into && by.get(into.outpins[0]?.inst);
  return { outputs, bufio2: src?.type === 'BUFIO2' && src.placed ? src.site : null };
}

/**
 * A CMT's bits outside its settings and its paths' PIPs (db/<device>-cmt-input.json, ana-cmtinput6.mjs): its site's,
 * each output's that drives a net, and its CLKIN's BUFIO2's; null for a site not measured.
 */
export function cmtInputBits(design, inst, input) {
  const s = input.sites[inst.site];
  if (!s) return null;
  const { outputs, bufio2 } = cmtUses(design, inst), bits = new Set(s.common);
  for (const o of outputs) for (const x of s.outputs[o] ?? []) bits.add(x);
  for (const x of (bufio2 && s.bufio2[bufio2]) ?? []) bits.add(x);
  return bits;
}

// Silinx toolchain - the Spartan-6's timing arcs (#731, #732): each placed instance's arcs from its type and settings,
// as fpga/timing-arcs.js gives the Spartan-3E's: a slice's LUTs (the inputs their equations read), output
// multiplexers, carry chain stage by stage, flip-flops, shift registers; a block RAM's and a DSP48A1's. Their delays by
// trce's arc types, per site class (the fitted model: fpga/s6/timing-model.js; measured in research/s6/sta6.mjs).

const LETTERS = ['A', 'B', 'C', 'D'];

/** The arcs' delays by trce's type (ns), and a setup through the carry's XOR apart from one through the LUT. */
export const ARC_DEFAULTS = { Tilo: 0.235, TiloMux: 0.261, Topab: 0.45, Topcyb: 0.375, Tbyp: 0.08, Tcinb: 0.27, Tas: 0.32, TasXor: 0.27,
  Tdick: 0.11, Tceck: 0.32, Tsrck: 0.43, Tcko: 0.41, Tcinck: 0.3, Tito: 0.75, Tds: 0.04, Tshcko: 1.2, Tiopi: 0.79, Tioop: 2.3 };

/** The median of a family of trce's arc types (names matching re), undefined when none. */
function familyMedian(types = {}, re) {
  const v = Object.entries(types).filter(([k]) => re.test(k)).map(([, x]) => x).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : undefined;
}

/** The inputs a LUT's equation reads (its pins A1 … A6 as the slice's L1 … L6), [] for a LUT not used. */
export function lutInputs(eq, L) {
  return eq && /^#LUT:/.test(eq) ? [...new Set(eq.replace(/^#LUT:O[56]=/, '').match(/A[1-6]/g) || [])].sort().map(a => `${L}${a[1]}`) : [];
}

/**
 * The timing arcs of a placed slice from its settings: { comb: [[in pin, out pin, ns]], setup: [[in pin, ns]] (into
 * a flip-flop before the clock), clkToOut: [[out pin, ns]] }. A LUT's inputs (those its equation reads) to its
 * output (O6) and to its output multiplexer (O5 / O6, F7 / F8, the carry's XOR or CY: the chain's inputs at and below
 * it, each stage's select O6 and data O5 or bypass, and CIN); a flip-flop's data by its input multiplexer, its CE and
 * SR (the second flip-flop L5FF's from O5); one set as a gate (#AND2L, #OR2L) passes its data and SR through to its output (Tito); the carry out.
 */
export function sliceArcs6(inst, T = ARC_DEFAULTS) {
  const comb = [], setup = [], clkToOut = [];
  if (!/^SLICE[LMX]$/.test(inst.type)) return { comb, setup, clkToOut };
  const m = new Map(inst.cfg.filter(c => c.value !== '#OFF').map(c => [c.attr, c.value]));
  const o6 = L => lutInputs(m.get(`${L}6LUT`), L), o5 = L => lutInputs(m.get(`${L}5LUT`), L);
  // the carry: stage j's select (its O6) and data (its O5 or bypass, CY0); an XOR at stage k reads the selects at and
  // below k and the data below it, a CY (stage k's carry out) and COUT the data at k too; each from CIN as well
  const di = L => (m.get(`${L}CY0`) === 'O5' ? o5(L).map(p => [p, 'op']) : m.get(`${L}CY0`) === `${L}X` ? [[`${L}X`, 'x']] : []);
  const chainIn = (k, own) => LETTERS.slice(0, k + 1).flatMap((L, j) => [...o6(L).map(p => [p, 'op', j]), ...(j < k || own ? di(L).map(([p, t]) => [p, t, j]) : [])]);
  const ty = (name, family, d) => T.types?.[name] ?? familyMedian(T.types, family) ?? d;
  const l = j => 'abcd'[j];
  // an arc of the chain from an input (kind 'op' a LUT pin, 'x' a bypass) of stage j to the output of stage k (or COUT)
  const chainDelay = (t, j, k) => (k === 'cout' ? (t === 'op' ? ty(`Topcy${l(j)}`, /^Topcy/, T.Topcyb) : ty(`T${l(j)}xcy`, /^T[a-d]xcy$/, T.Tbyp))
    : t === 'op' ? ty(`Top${l(j)}${l(k)}`, /^Top[a-d][a-d]$/, T.Topab) : ty(`T${l(j)}x${l(k)}`, /^T[a-d]x[a-d]$/, T.Tdick));
  const source = (v, L, k) => (v === 'O6' ? o6(L).map(p => [p, T.TiloMux]) : v === 'O5' ? o5(L).map(p => [p, T.TiloMux])
    : v === 'XOR' || v === 'CY' ? [...chainIn(k, v === 'CY').map(([p, t, j]) => [p, chainDelay(t, j, k)]), ['CIN', ty(`Tcin${l(k)}`, /^Tcin[a-d]$/, T.Tcinb)]]
    : /^F[78]$/.test(v ?? '') ? [...LETTERS.flatMap(o6), ...LETTERS.map(x => `${x}X`)].map(p => [p, T.TiloMux + T.Tilo]) : [[`${L}X`, T.Tdick]]);
  let clocked = false;
  LETTERS.forEach((L, k) => {
    for (const p of o6(L)) comb.push([p, L, T.Tilo]);
    const om = m.get(`${L}OUTMUX`);
    if (/5Q$/.test(om ?? '')) { clkToOut.push([`${L}MUX`, T.Tcko]); clocked = true; }
    else if (om) for (const [p, d] of source(om, L, k)) comb.push([p, `${L}MUX`, d]);
    // a shift register (L6RAMMODE SRL16 / SRL32): its data in (LI) before the clock, its output after it
    if (/^SRL/.test(m.get(`${L}6RAMMODE`) ?? '')) { clocked = true; setup.push([`${L}I`, T.Tds]); clkToOut.push([L, T.Tshcko]); if (om === 'O6') clkToOut.push([`${L}MUX`, T.Tshcko]); }
    // the second flip-flop (L5FF, out on LMUX): its data the LUT's O5, else the bypass
    if (m.has(`${L}5FF`)) { clocked = true; for (const p of o5(L).length ? o5(L) : [`${L}X`]) setup.push([p, /X$/.test(p) ? T.Tdick : T.Tas]); }
    const ff = m.get(`${L}FF`);
    if (!ff) return;
    const fm = m.get(`${L}FFMUX`), data = source(fm, L, k);
    if (/^#(AND2L|OR2L)$/.test(ff)) { for (const [p] of [...data, ...(m.has('SRUSED') ? [['SR']] : [])]) comb.push([p, `${L}Q`, T.Tito]); return; }
    clocked = true;
    clkToOut.push([`${L}Q`, T.Tcko]);
    // into the flip-flop: the setup (Tas, Tdick) after the chain's arc to the stage's output, less its output mux
    for (const [p, d] of data) setup.push([p, fm === 'XOR' || fm === 'CY' ? T.TasXor + Math.max(0, d - T.TiloMux) : fm === 'O6' || fm === 'O5' ? T.Tas : T.Tdick]);
  });
  if (m.has('COUTUSED')) { for (const [p, t, j] of chainIn(3, true)) comb.push([p, 'COUT', chainDelay(t, j, 'cout')]); comb.push(['CIN', 'COUT', T.Tbyp]); }
  if (clocked && m.has('CEUSED')) setup.push(['CE', T.Tceck]);
  if (clocked && m.has('SRUSED')) setup.push(['SR', T.Tsrck]);
  return { comb, setup, clkToOut };
}

/**
 * A block RAM's or DSP48A1's arcs on its pins in use (ins, outs: pin names): a block RAM's data out after its clock,
 * its inputs before it; a DSP48A1 with its multiplier register (MREG) its A, B and D inputs before the clock and its P
 * after, without registers its inputs to P through it. Delays from trce's types by prefix (T.types), else T's.
 */
export function hardArcs6(inst, ins, outs, T = ARC_DEFAULTS) {
  const comb = [], setup = [], clkToOut = [], ty = (re, d) => { const v = Object.entries(T.types ?? {}).filter(([k]) => re.test(k)).map(([, x]) => x); return v.length ? Math.max(...v) : d; };
  if (/^RAMB(8|16)BWER$/.test(inst.type)) {
    for (const o of outs) if (/^DO/.test(o)) clkToOut.push([o, ty(/^Trcko_DO/, 1.85)]);
    for (const i of ins) if (/^(ADDR|DI|WE|EN|RST|REGCE)/.test(i)) setup.push([i, ty(/^Trcck|^Trdck/, 0.3)]);
  } else if (inst.type === 'DSP48A1') {
    const reg = a => inst.cfg.some(c => c.attr === a && c.value === '1');
    if (reg('MREG')) { for (const i of ins) if (/^[ABD]\d/.test(i)) setup.push([i, ty(/^Tdspdck_[ABD]_MREG/, 3.1)]); for (const o of outs) if (/^P\d/.test(o)) clkToOut.push([o, ty(/^Tdspcko_P_MREG/, 1.6)]); }
    else if (!reg('PREG')) for (const i of ins) if (/^[ABDC]\d/.test(i)) for (const o of outs) if (/^P\d/.test(o)) comb.push([i, o, ty(/^Tdspdo_[AB]_P/, 4.0)]);
  }
  return { comb, setup, clkToOut };
}

/** A slice site's timing class: its tile's kind and its column's parity (an odd X a SLICEX; an even one a SLICEL or SLICEM by the tile). */
export const siteClass = inst => `${inst.tile.replace(/_X\d+Y\d+$/, '')} ${+(/^SLICE_X(\d+)/.exec(inst.site)?.[1] ?? 0) % 2 ? 'x' : 'lm'}`;


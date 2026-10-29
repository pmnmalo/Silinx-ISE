// Silinx toolchain - the packer's carry chains (#405: out of packWith in core/fpga/pack.js): the MUXCY / XORCY stages
// in chains, each a column of slices, its first stage's carry in and DI, the sums and the carry out (carryOut).
import { LUT_K } from './pack.js';

/** { macros } of packWith. */
export function mountCarry(ctx) {
  const {
    carryOut, absorbFf, cells, ci, driverCell, insts, isLut, liveCells, loadsOf, lutFor, nets, newSlice, otherLoads,
    placeLut, setBypass, setSink, stats, tapOf, where
  } = ctx;

  // ---------------------------------------------------------------- carry chains
  const macros = [];
  const muxcy = liveCells().filter(c => c.type === 'MUXCY');
  const xorcy = cells.filter(c => c.type === 'XORCY');
  const muxcyOn = new Map();   // CI net -> MUXCY cells reading it
  for (const m of muxcy) { const n = m.pins.CI; if (!muxcyOn.has(n)) muxcyOn.set(n, []); muxcyOn.get(n).push(m); }
  const xorOn = new Map();     // CI net -> XORCY
  for (const x of xorcy) { const n = x.pins.CI; if (!xorOn.has(n)) xorOn.set(n, []); xorOn.get(n).push(x); }
  const nextOf = new Map();    // MUXCY -> the MUXCY that continues its chain
  for (const m of muxcy) {
    const d = driverCell(m.pins.CI);
    if (d && d.type === 'MUXCY' && !nextOf.has(d)) nextOf.set(d, m);
  }
  const isNext = new Set(nextOf.values());
  const usedXor = new Set();
  const takeXor = (ciNet, sNet) => {
    const x = (xorOn.get(ciNet) || []).find(c => !usedXor.has(c) && (sNet === undefined || c.pins.LI === sNet));
    if (x) usedXor.add(x);
    return x || null;
  };
  const chains = [];
  for (const m of muxcy) {
    if (isNext.has(m)) continue;
    const stages = [];
    for (let c = m; c; c = nextOf.get(c)) stages.push({ mux: c, ci: c.pins.CI, s: c.pins.S, di: c.pins.DI, xor: takeXor(c.pins.CI, c.pins.S) });
    const last = stages.at(-1).mux;
    const x = takeXor(last.pins.O);
    if (x) stages.push({ mux: null, ci: last.pins.O, s: x.pins.LI, di: null, xor: x });
    else if (carryOut === 'xor' && loadsOf(last.pins.O).length) stages.push({ tap: last, ci: last.pins.O });
    chains.push(stages);
  }
  for (const x of xorcy) if (!usedXor.has(x)) { usedXor.add(x); chains.push([{ mux: null, ci: x.pins.CI, s: x.pins.LI, di: null, xor: x }]); }
  stats.carry = chains.length;

  // Does the first stage need BX for its DI (then BX cannot also bring the carry in)? DI can come
  // from pin 1 of the stage's LUT when the LUT reads it already or has a free input.
  const lutInputs = n => {
    const d = driverCell(n);
    if (d && isLut(d)) return Array.from({ length: LUT_K[d.type] }, (_, j) => d.pins[`I${j}`]);
    return nets[n].const !== undefined ? [] : [n];
  };
  const diNeedsB = st => st.mux && nets[st.di].const === undefined && !lutInputs(st.s).includes(st.di) && lutInputs(st.s).length >= 4;
  for (const stages of chains) if (diNeedsB(stages[0]) && stages[0].ci !== stages[0].di) {
    // a first stage of its own on the F side brings the carry in: LUT F = 0 so CYMUXF passes CY0F,
    // the constant or the carry-in net on F1 (the real first stage then takes the G side)
    stages.unshift({ dummy: true, ci: stages[0].ci });
  }

  for (const stages of chains) {
    const members = [];
    let s = null;
    stages.forEach((st, i) => {
      const side = i % 2 ? 'G' : 'F', X = side === 'F' ? 'X' : 'Y';
      if (side === 'F') { s = newSlice(); s.carry = { F: null, G: null, init: null, cout: false }; members.push({ inst: s.idx, dx: 0, dy: members.length }); }
      if (st.dummy) {
        const k = nets[st.ci].const;
        const name = `${stages[1].mux.name}_cin`;
        placeLut(s, 'F', k !== undefined ? { name, k: 0, init: '0', inputs: [], pins: [], cell: -1, out: null } : { name, k: 1, init: '00', inputs: [st.ci], pins: [1], cell: -1, out: null }, -1);
        stats.passthru++;
        s.carry.F = { mux: { name: `${name}_cy` }, xor: null, cy0: k !== undefined ? String(k) : 'F1' };
        return;
      }
      if (st.tap) {
        // the carry out read by logic: CI XOR 0 (a LUT giving 0) is the carry, out through X / Y
        const name = `${st.tap.name}_out`;
        placeLut(s, side, { name, k: 0, init: '0', inputs: [], pins: [], cell: -1, out: null }, -1);
        stats.passthru++;
        s.carry[side] = { mux: null, xor: { name: `${name}_xor` }, cy0: null };
        if (side === 'F') { s.carry.init = 'CIN'; insts[s.idx - 1].carry.cout = true; }
        tapOf.set(ci(st.tap), { inst: s.idx, bel: `XOR${side}` });
        return;
      }
      const users = [];
      if (st.mux) users.push([ci(st.mux), 'S']);
      if (st.xor) users.push([ci(st.xor), 'LI']);
      const sumUsed = st.xor && loadsOf(st.xor.pins.O).length > 0;
      const lut = lutFor(s, side, st.s, users, !sumUsed);
      const c = { mux: st.mux, xor: st.xor, cy0: null };
      s.carry[side] = c;
      if (st.mux) where.set(ci(st.mux), { inst: s.idx, bel: `CYMUX${side}` });
      if (st.xor) where.set(ci(st.xor), { inst: s.idx, bel: `XOR${side}` });
      // carry in: from the chain (internal / CIN), or at the start of the chain through BX
      const ciUsers = [st.mux && [ci(st.mux), 'CI'], st.xor && [ci(st.xor), 'CI']].filter(Boolean);
      if (i === 0) {
        s.carry.init = 'BX';
        setBypass(s, 'X', st.ci);
        for (const [cc, p] of ciUsers) setSink(cc, p, { inst: s.idx, pin: 'BX', kind: 'gen' });
      } else {
        if (side === 'F') { s.carry.init = 'CIN'; insts[s.idx - 1].carry.cout = true; }
        for (const [cc, p] of ciUsers) setSink(cc, p, 'int');
      }
      // DI: a constant, a LUT input on pin 1 / 2, or BX / BY
      if (st.mux) {
        const di = st.di, pin1 = side === 'F' ? 'F1' : 'G1';
        if (nets[di].const !== undefined) c.cy0 = String(nets[di].const);
        else {
          let j = lut.inputs.indexOf(di);
          if (j < 0 && lut.k < 4) {
            // add DI as an input the LUT's function does not depend on
            lut.init = lut.init + lut.init; lut.inputs.push(di); lut.pins.push(lut.k + 1); lut.k++; j = lut.k - 1;
          }
          if (j >= 0) {
            // move that input to pin 1 (swap pins with whatever input is there)
            const o = lut.pins.indexOf(1);
            if (o >= 0) [lut.pins[o], lut.pins[j]] = [lut.pins[j], lut.pins[o]]; else lut.pins[j] = 1;
            c.cy0 = pin1;
            setSink(ci(st.mux), 'DI', 'int');
          } else {
            c.cy0 = side === 'F' ? 'BX' : 'BY';
            setBypass(s, X, di);
            setSink(ci(st.mux), 'DI', { inst: s.idx, pin: `B${X}`, kind: 'gen' });
          }
        }
        if (c.cy0 === '0' || c.cy0 === '1') setSink(ci(st.mux), 'DI', 'int');
      }
      // the sum leaves through X / Y (FXMUX = FXOR) and may feed the flip-flop of its side
      if (sumUsed) { s.out[X] = side === 'F' ? 'FXOR' : 'GXOR'; absorbFf(s, X, st.xor.pins.O); }
      else if (lut.cell >= 0 && otherLoads(lut.out, users).length) s.out[X] = side;   // the LUT's own output
    });
    macros.push({ kind: 'carry', members });
  }

  return { macros };
}

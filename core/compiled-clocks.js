// Silinx - the compiled simulator's clocks (#405: out of compileNetlist in core/compiled-sim.js): the main clock, the
// other clocks' elements, whether the falling edge is a step; the DCMs' outputs as schedules of their edges (#465).
import { dcmSchedule } from './compiled-prims.js';
import { CompileError, lcm } from './compiled-helpers.js';

/** { asyncEls, clkBit, derived, groups, main, mainPort, needFall, negMain, onMain, posMain, sched, unread, usesMain } of compileNetlist. */
export function mountClocks(ctx) {
  const {
    clock, watch, async, cellName, comb, dcms, elems, inBits, inputs, pol, ports, vars
  } = ctx;

  // ---- clock domains: the main clock (an input port bit), the other clocks (edges found when settling)
  const clocked = elems.filter(e => e.type !== '$dlatch' && e.type !== '$adlatch');
  const clkBit = e => e.C.CLK[0];
  let main = null;
  // (a DCM: the input clocking it is the main clock)
  const dcmOf = new Map();   // a DCM output's bit -> [dcm, port]
  for (const d of dcms) for (const [port, v] of Object.entries(d.outs)) d.C[port].forEach(b => dcmOf.set(b, [d, port]));
  const roots = dcms.filter(d => !dcmOf.has(d.C.CLKIN?.[0]));
  if (dcms.length && !roots.length) throw new CompileError(`the ${dcms[0].kind} '${cellName(dcms[0].name)}' is in a loop of DCMs: not compiled`);
  for (const d of roots) {
    const b = d.C.CLKIN?.[0];
    if (typeof b !== 'number' || !inputs.some(i => i.bits.includes(b))) throw new CompileError(`the ${d.kind} '${cellName(d.name)}' is not clocked by an input port: not compiled`);
  }
  const dcmClock = roots[0]?.C.CLKIN[0];
  if (roots.some(d => d.C.CLKIN[0] !== dcmClock)) throw new CompileError('DCMs clocked by two input ports: not compiled');
  const portOfBit = b => inputs.find(i => i.bits.includes(b))?.name;
  if (dcms.length && (clock === false || (clock && portOfBit(dcmClock) !== clock))) {
    throw new CompileError(`the ${roots[0].kind} '${cellName(roots[0].name)}' is clocked by '${portOfBit(dcmClock)}', ${clock ? `not by the main clock '${clock}'` : 'with no main clock'}: not compiled`);
  }
  if (dcms.length) main = dcmClock;
  else if (clock === false) main = null;
  else if (clock) {
    const p = inputs.find(i => i.name === clock);
    if (!p) throw new CompileError(`the clock '${clock}' is not an input port`);
    main = p.bits[0];
  } else {
    // (the input that clocks the most register bits; of two, the one named clk…)
    const count = new Map();
    for (const e of clocked) {
      const b = clkBit(e);
      if (typeof b === 'number' && inputs.some(i => i.bits.includes(b))) count.set(b, (count.get(b) || 0) + (e.q != null ? vars[e.q].w : 1));
    }
    const named = b => (/^(clk|clock|mclk)/i.test(inputs.find(i => i.bits.includes(b)).name) ? 1 : 0);
    main = [...count].sort((x, y) => y[1] - x[1] || named(y[0]) - named(x[0]))[0]?.[0] ?? null;
  }
  const mainPort = main == null ? null : inputs.find(i => i.bits.includes(main));
  const onMain = clocked.filter(e => clkBit(e) === main);
  const posMain = onMain.filter(e => pol(e, 'CLK_POLARITY') === 1), negMain = onMain.filter(e => pol(e, 'CLK_POLARITY') !== 1);
  const derived = new Map();   // clock bit -> elements
  for (const e of clocked) {
    const b = clkBit(e);
    if (b === main || typeof b !== 'number') continue;   // a constant clock never ticks
    if (!derived.has(b)) derived.set(b, []);
    derived.get(b).push(e);
  }
  // the main clock read by logic (not only by clock pins): its value matters, both edges are steps
  const usesMain = comb.some(n => inBits(n).includes(main))
    || elems.some(e => Object.entries(e.C).some(([p, bits]) => p !== 'CLK' && bits.includes(main)) || (e.addr || []).includes(main) || (e.data || []).includes(main) || (e.en || []).includes(main));
  const needFall = main != null && (negMain.length > 0 || usesMain);

  // ---- the DCMs' outputs: the edges of each cycle (core/compiled-prims.js dcmSchedule), steps of the loop
  // after the main clock's edge at the same time; the outputs nothing reads are left out, and the falling edges
  // of a clock only rising-edge flip-flops read are not steps (its rising edge then is one from 0: rise-only, no
  // net of its own). A schedule for each DCM the main clock clocks, with the DCMs it clocks in turn (a group),
  // and its own count of cycles: a DCM whose RST the design drives starts its schedule again after a reset
  let sched = null;
  const groups = [], unread = new Set();   // (the bits of the outputs left out, or rise-only)
  if (dcms.length) {
    const asClock = new Set(clocked.map(clkBit));
    const other = new Set([...comb.flatMap(inBits), ...elems.flatMap(e => [...Object.entries(e.C).flatMap(([p, b]) => (p === 'CLK' && clocked.includes(e) ? [] : b)), ...(e.addr || []), ...(e.data || []), ...(e.en || [])]),
      ...ports.filter(p => p.dir !== 'input').flatMap(p => p.bits), ...dcms.flatMap(d => [d.C.CLKIN[0], ...(d.C.RST || [])]),
      ...(watch?.levels || []).map(w => w.bit), ...(watch?.pairs || []).flat().map(w => w.bit), ...(watch?.edges || []).flatMap(w => [w.bit, ...w.capture]),
      ...(watch?.vga ? [watch.vga.hs, watch.vga.vs, ...watch.vga.rgb] : []), ...(watch?.uart ? [watch.uart.tx] : [])]);
    const read = new Set([...other, ...asClock]);
    const waves = new Map(), level = new Map(), root = new Map();   // dcm -> its outputs' waveforms, its depth in a cascade, its group's DCM
    const driven = d => (d.C.RST || []).some(b => typeof b === 'number');
    const resolve = (d, seen = new Set()) => {
      if (waves.has(d)) return;
      if (seen.has(d)) throw new CompileError(`the ${d.kind} '${cellName(d.name)}' is in a loop of DCMs: not compiled`);
      seen.add(d);
      const rst = d.C.RST || [];
      const src = dcmOf.get(d.C.CLKIN[0]);
      if (src) resolve(src[0], seen);
      if (src && driven(d)) throw new CompileError(`the ${d.kind} '${cellName(d.name)}' has its RST driven by the design and is clocked by ${src[1]} of '${cellName(src[0].name)}': not compiled`);
      if (src && driven(src[0])) throw new CompileError(`the ${d.kind} '${cellName(d.name)}' is clocked by ${src[1]} of '${cellName(src[0].name)}', whose RST is driven by the design: not compiled`);
      const input = src ? waves.get(src[0])[src[1]] : { pre: [], s: [0, 1], q: [1, 1] };
      if (!input) throw new CompileError(`the ${d.kind} '${cellName(d.name)}' is clocked by ${src[1]} of '${cellName(src[0].name)}': not compiled`);
      level.set(d, src ? level.get(src[0]) + 1 : 0);
      root.set(d, src ? root.get(src[0]) : d);
      // (RST tied high: never locked, its outputs low)
      try { waves.set(d, rst.includes('1') ? {} : d.waves(d.P, input, cellName(d.name))); } catch (e) { throw new CompileError(`${e.message}: not compiled`); }
    };
    dcms.forEach(d => resolve(d));
    for (const r of roots) groups.push({ dcm: r, rst: driven(r) ? r.C.RST : null, chans: [] });
    for (const d of dcms) {
      const g = groups.find(x => x.dcm === root.get(d));
      for (const [port, v] of Object.entries(d.outs)) {
        const w = waves.get(d)[port], b = d.C[port][0];
        if (!w) continue;
        if (!read.has(b)) { unread.add(b); continue; }
        // (CLK90 / CLK270: CLK0 / CLK180 delayed, which a reset does not stop at once: not modelled)
        if (g.rst && (port === 'CLK90' || port === 'CLK270')) throw new CompileError(`the ${d.kind} '${cellName(d.name)}' has its RST driven by the design and its ${port} used: not compiled`);
        const riseOnly = !other.has(b) && clocked.every(e => clkBit(e) !== b || pol(e, 'CLK_POLARITY') === 1);
        if (riseOnly) unread.add(b);
        g.chans.push({ wave: w, v, bit: b, level: level.get(d), riseOnly });
      }
    }
    for (const g of groups) try { g.sched = dcmSchedule(g.chans); } catch (e) { throw new CompileError(`${e.message}: not compiled`); }
    // (the groups' steps in the same ticks: the least common multiple of their ticks per cycle)
    const T = groups.reduce((t, g) => lcm(t, g.sched.T), 2);
    if (T * 64 > 2 ** 31) throw new CompileError(`the DCMs' clocks have no common time step: not compiled`);
    sched = { T };
  }
  const asyncEls = elems.filter(e => async(e));

  return { asyncEls, clkBit, derived, groups, main, mainPort, needFall, negMain, onMain, posMain, sched, unread, usesMain };
}

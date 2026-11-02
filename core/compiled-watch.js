// Silinx - the compiled simulator's edges and counts (#405: out of compileNetlist in core/compiled-sim.js): the main
// clock's edges (their samples and commits), the settling of the other clocks and the asynchronous elements, what
// each cycle counts (watch: levels, pairs, edges, the VGA monitor, the serial port's TX).
import { VGA_CODE } from './compiled-vga.js';
import { fix32, lit } from './compiled-helpers.js';

/** { ckSet, count, counted, dlist, edgeCode, edges, fire, flush, flushFn, levels, pairs, settleCode, uartCode, vgaCode, watched } of compileNetlist. */
export function mountWatch(ctx) {
  const {
    watch, async, asyncEls, commit, derived, main, mainPort, pol, sample, sig, src
  } = ctx;

  // (the main clock's edges: their commits flag what changed, @@changes <edge>@@ and @@set m<memory>@@, as
  // generate writes them)
  const fire = (els, edge) => `${els.map(sample).join('\n')}\n@@changes ${edge}@@\n${els.map(e => commit(e, e.type === '$memwr')).join('\n')}`;
  const ckSet = (on) => {
    if (!mainPort) return '';
    const v = `v${mainPort.v}`, off = mainPort.bits.indexOf(main);
    if (mainPort.w === 1) return `${v} = ${lit(on, mainPort.kind)};`;
    return mainPort.kind === 'b' ? `${v} = ${on ? `${v} | ${1n << BigInt(off)}n` : `${v} & ~${1n << BigInt(off)}n`};` : `${v} = ${on ? fix32(`${v} | ${2 ** off}`, mainPort.w) : `${v} & ${~(2 ** off) >>> 0}`};`;
  };
  // settling: the other clocks' edges, then the asynchronous elements
  const dlist = [...derived].map(([b, els], k) => ({ b, k, els, pos: els.filter(e => pol(e, 'CLK_POLARITY') === 1), neg: els.filter(e => pol(e, 'CLK_POLARITY') !== 1) }));
  const settleCode = !dlist.length && !asyncEls.length ? '' : [
    ...dlist.map(d => `{ const k = ${sig([d.b], 'n')}; f${d.k} = p${d.k} !== -1 && k !== p${d.k} ? (k ? 1 : 2) : 0; p${d.k} = k; }`),
    ...(dlist.length ? [
      `if (${dlist.map(d => `f${d.k}`).join(' | ')}) {`,
      ...dlist.map(d => `${d.pos.length ? `if (f${d.k} === 1) { ${d.pos.map(sample).join(' ')} }` : ''} ${d.neg.length ? `if (f${d.k} === 2) { ${d.neg.map(sample).join(' ')} }` : ''}`),
      ...dlist.map(d => `${d.pos.length ? `if (f${d.k} === 1) { ${d.pos.map(commit).join(' ')} }` : ''} ${d.neg.length ? `if (f${d.k} === 2) { ${d.neg.map(commit).join(' ')} }` : ''}`),
      'ch = true; }'] : []),
    ...asyncEls.map(async),
  ].join('\n');

  // ---- what each cycle counts (watch)
  const levels = watch?.levels || [], pairs = watch?.pairs || [], edges = watch?.edges || [];
  const at = (w) => `${sig([w.bit], 'n')} === ${w.on}`;
  // (the time each value lasts, in cycles: half a cycle before the main clock's rising edge, half after it,
  // as the event-driven simulator's time; without the falling edge, the half after a rising edge is the half
  // before the next one, sampled once: the window's first half, its middle cycles whole, its last half)
  // (#464: counted in runs: the cycles the watched values stay the same (in l<var>) add up in R, added to the
  // counts whose values hold (FL) when one of them changes and at the end of run(), the same sums of halves;
  // FL has no branch and runs at the start of run(), so that V8 optimizes it with the types of all its sites)
  const counted = levels.length + pairs.length > 0;
  const watched = [...new Set([...levels, ...pairs.flat()].map(w => src.get(w.bit)?.[0]).filter(v => v != null))];
  const flushFn = `function FL(R${watched.map(v => `, v${v}`).join('')}) {\n${[
    ...levels.map((w, i) => `K[${i}] += ${at(w)} ? R : 0;`),
    ...pairs.map(([a, b], i) => `K[${levels.length + i}] += ${at(a)} && ${at(b)} ? R : 0;`),
  ].join('\n')}\n}`;
  const flush = `FL(R${watched.map(v => `, l${v}`).join('')});`;
  const count = W => `${watched.length ? `if (${watched.map(v => `v${v} !== l${v}`).join(' || ')}) { ${flush} R = 0; ${watched.map(v => `l${v} = v${v};`).join(' ')} }\n` : ''}R += ${W};`;
  const vgaCode = watch?.vga ? VGA_CODE(sig([watch.vga.hs], 'n'), sig([watch.vga.vs], 'n'), sig(watch.vga.rgb, 'n')) : '';
  const edgeCode = edges.map((w, i) => `{ const e = ${sig([w.bit], 'n')}; if (e${i} === 1 && e === 0) EV.push(cy, ${sig(w.capture, 'n')}); e${i} = e; }`).join('\n');

  // the serial port's TX (#2536): each change, its cycle from the start (UB: the cycles of the runs before) and its level
  const uartCode = watch?.uart ? `{ const t = ${sig([watch.uart.tx], 'n')}; if (t !== u_tx) { UT.push(UB + cy, t); u_tx = t; } }` : '';

  return { ckSet, count, counted, dlist, edgeCode, edges, fire, flush, flushFn, levels, pairs, settleCode, uartCode, vgaCode, watched };
}

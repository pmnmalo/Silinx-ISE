// Silinx - the compiled simulator's loop (#405: out of compileNetlist in core/compiled-sim.js): its steps (the main
// clock's edges, the DCMs' schedules) and the template of the code, run() and its state.
import { SETTLE_LIMIT, bigOf, lit, pbits } from './compiled-helpers.js';
import { VGA_H, VGA_STATE, VGA_W } from './compiled-vga.js';

/** { memChars, templateOf } of compileNetlist. */
export function mountSteps(ctx) {
  const {
    watch, ckSet, count, counted, dlist, edgeCode, edges, elems, fire, flush, flushFn, groups, inputs, levels, mems,
    needFall, negMain, pairs, posMain, sched, settleCode, sig, uartCode, vars, vgaCode, vk, watched
  } = ctx;

  // ---- the loop's steps: the main clock's rising edge (the cycle's samples before it), its falling edge; with
  // DCMs, the cycle's steps in time order, those of the groups at the same tick and depth together (DSj: tick x 64
  // + depth, number of changes, then variable / value pairs; DOj: each cycle's first step; DCj: the cycles since
  // the start or the reset, the schedule's S first ones then its steady H ones; Zj: in reset). A reset is seen
  // at the end of a time (tk: the tick of the last step), after the edges of the DCM at that time (in the
  // event-driven simulator they come a few deltas before those of RST); it sets the group's outputs to 0 and
  // drops its steps left; a cycle's rising edge with RST low starts the group's schedule again
  const endCount = counted && !needFall ? `if (n) { ${count('0.5')} }` : '';
  const riseCount = `${counted ? (needFall ? count('0.5') : count('(cy ? 1 : 0.5)')) : ''}\n${edgeCode}\n${vgaCode}\n${uartCode}`;
  let dcmStep = '', dcmTables = '', dcmLocals = '', dcmSave = '';
  if (sched) {
    const { T } = sched, gs = groups.filter(g => g.chans.length);
    gs.forEach((g, j) => { g.j = j; });
    dcmTables = gs.map(g => {
      const ds = [], dof = [], m = T / g.sched.T;
      for (const steps of g.sched.cycles) {
        dof.push(ds.length);
        for (const st of steps) ds.push(st.tick * m * 64 + st.level, st.sets.length, ...st.sets.flat());
      }
      dof.push(ds.length);
      return `const DS${g.j} = Int32Array.from([${ds.join(',')}]), DO${g.j} = Int32Array.from([${dof.join(',')}]);\nlet DC${g.j} = 0${g.rst ? `, Z${g.j} = 1` : ''};`;
    }).join('\n');
    dcmLocals = ` let fd = true, tk = -1${gs.map(g => `, dc${g.j} = DC${g.j}, si${g.j} = 0, se${g.j} = 0${g.rst ? `, z${g.j} = Z${g.j}` : ''}`).join('')};`;
    dcmSave = gs.map(g => ` DC${g.j} = dc${g.j};${g.rst ? ` Z${g.j} = z${g.j};` : ''}`).join('');
    const zero = c => `v${c.v} = ${lit(0, vars[c.v].kind)};`;
    const cases = g => g.chans.map(c => `case ${c.v}: ${c.riseOnly ? `p${dlist.find(d => d.b === c.bit).k} = 0; ` : ''}v${c.v} = ${vars[c.v].kind === 'b' ? 'BigInt(x)' : 'x'}; break;`).join(' ');
    const rst = g => `${sig(g.rst, 'n')} === 1`;
    const start = g => `{ const c = dc${g.j} < ${g.sched.S} ? dc${g.j} : ${g.sched.S} + (dc${g.j} - ${g.sched.S}) % ${g.sched.H}; si${g.j} = DO${g.j}[c]; se${g.j} = DO${g.j}[c + 1]; dc${g.j}++; }`;
    const resets = gs.filter(g => g.rst);
    dcmStep = `    st: for (;;) {
      let nk = ${T * 64};
      ${gs.map(g => `if (si${g.j} < se${g.j} && DS${g.j}[si${g.j}] < nk) nk = DS${g.j}[si${g.j}];`).join(' ')}
      const nt = ${needFall ? `Math.min(fd ? ${T} : ${T / 2}, nk >> 6)` : 'nk >> 6'};
      ${resets.length ? `if (nt > tk) {
        let r = false;
        ${resets.map(g => `if (!z${g.j} && ${rst(g)}) { z${g.j} = 1; dc${g.j} = 0; si${g.j} = se${g.j}; ${g.chans.map(zero).join(' ')} r = true; }`).join('\n        ')}
        if (r) break st;
        tk = nt;
      }` : ''}
      if (nt === ${T}) {
        if (cy === n) { ${endCount} break run; }
${riseCount}
        cy++;
        ${needFall ? ckSet(1) : ''} fd = ${!needFall}; tk = 0;
        ${gs.map(g => (g.rst ? `if (!${`(${rst(g)})`}) { z${g.j} = 0; ${start(g)} }` : start(g))).join('\n        ')}
${fire(posMain, 'r')}
        ${posMain.length || needFall ? 'break st;' : 'continue st;'}
      }
      if (!fd && nt === ${T / 2}) { fd = true; ${counted ? count('0.5') : ''} ${ckSet(0)}
${fire(negMain, 'f')}
        break st; }
      ${gs.map(g => `if (si${g.j} < se${g.j} && DS${g.j}[si${g.j}] === nk) { let k = DS${g.j}[si${g.j} + 1]; si${g.j} += 2; for (; k > 0; k--, si${g.j} += 2) { const x = DS${g.j}[si${g.j} + 1]; switch (DS${g.j}[si${g.j}]) { ${cases(g)} } } }`).join('\n      ')}
      break st;
    }`;
  }

  // ---- the code
  const V = vars.map((_, i) => i);
  const memInit = mems.map(m => {
    const bits = pbits(m.P.INIT ?? '');
    const words = [];
    for (let a = 0; a < m.size; a++) {
      const wbits = bits.slice(a * m.width, (a + 1) * m.width);
      words.push(wbits.some(Boolean) ? bigOf(wbits) : 0n);
    }
    const nz = words.some(x => x);
    if (m.kind === 'b') return `const M${m.k} = ${nz ? `[${words.map(x => `${x}n`).join(',')}]` : `new Array(${m.size}).fill(0n)`};`;
    return `const M${m.k} = ${nz ? `Uint32Array.from([${words.map(Number).join(',')}])` : `new Uint32Array(${m.size})`};`;
  });
  const memChars = memInit.reduce((n, l) => n + l.length, 0);
  const initOf = i => {
    const e = elems.find(x => x.q === i);
    return lit(e ? e.init : 0n, vars[i].kind);
  };
  const temps = elems.flatMap(e => (e.type === '$memwr' ? [`n${e.id} = ${lit(0, e.mem.kind)}`, `a${e.id} = 0`, `w${e.id} = ${lit(0, e.mem.kind)}`] : e.q != null ? [`n${e.id} = ${lit(0, vk(e))}`] : []));
  const templateOf = OUT => `"use strict";
${V.map(i => `let ${OUT ? 'v' : 'V'}${i} = ${initOf(i)};`).join('\n')}
${memInit.join('\n')}
${dlist.map(d => `let P${d.k} = -1;`).join('\n')}
const K = new Float64Array(${levels.length + pairs.length}), EV = [];
${watch?.vga ? `const VG = new Float64Array(${VGA_STATE.length}).fill(-1), FB = new Uint16Array(${VGA_W * VGA_H}); VG[${VGA_STATE.indexOf('ct')}] = 0; VG[${VGA_STATE.indexOf('frames')}] = 0; VG[${VGA_STATE.indexOf('L')}] = 0;` : ''}
${edges.map((_, i) => `let E${i} = -1;`).join(' ')}
${watch?.uart ? 'const UT = []; let U_TX = -1, UB = 0;' : ''}
${dcmTables}
${counted ? flushFn : ''}
function run(n) {
  ${V.length && !OUT ? `let ${V.map(i => `v${i} = V${i}`).join(', ')};` : ''}
  ${mems.map(m => `const m${m.k} = M${m.k};`).join(' ')}
  ${dlist.length ? `let ${dlist.map(d => `p${d.k} = P${d.k}, f${d.k} = 0`).join(', ')};` : ''}
  ${temps.length ? `let ${temps.join(', ')};` : ''}
  ${edges.length ? `let ${edges.map((_, i) => `e${i} = E${i}`).join(', ')};` : ''}
  ${watch?.vga ? `let ${VGA_STATE.map((k, i) => `g_${k} = VG[${i}]`).join(', ')};` : ''}
  ${watch?.uart ? 'let u_tx = U_TX;' : ''}
  let ph = 0, cy = 0, it = 0, ch = false@@decl@@;${dcmLocals}@@fns@@
  ${counted ? `let R = 0${watched.map(v => `, l${v} = v${v}`).join('')}; ${flush}` : ''}
  run: for (;;) {
@@comb@@
    ch = false;
${settleCode}
    if (ch) { if (++it > ${SETTLE_LIMIT}) throw new H.Error('the design does not settle (a loop through a latch or a clock?)'); @@all@@ continue; }
    it = 0;
${sched ? dcmStep : `    if (ph === 0) {
      if (cy === n) { ${endCount} break; }
${riseCount}
      cy++;
      ${needFall ? `${ckSet(1)} ph = 1;` : ''}
${fire(posMain, 'r')}
    } else {
${counted ? count('0.5') : ''}
      ${ckSet(0)} ph = 0;
${fire(negMain, 'f')}
    }`}
  }
  ${counted ? flush : ''}
  ${OUT ? '' : V.map(i => `V${i} = v${i};`).join(' ')}
  ${dlist.map(d => `P${d.k} = p${d.k};`).join(' ')}${dcmSave}
  ${edges.map((_, i) => `E${i} = e${i};`).join(' ')}
  ${watch?.vga ? VGA_STATE.map((k, i) => `VG[${i}] = g_${k};`).join(' ') : ''}
  ${watch?.uart ? 'U_TX = u_tx; UB += cy;' : ''}
}
// the counts and the edges since the last take (the counts back to 0)
function take() { const counts = Array.from(K); K.fill(0); return { counts, edges: EV.splice(0) }; }
function set(k, x) { switch (k) { ${inputs.map(p => `case ${p.v}: ${OUT ? 'v' : 'V'}${p.v} = x; break;`).join(' ')} } }
function vals() { return [${V.map(i => `${OUT ? 'v' : 'V'}${i}`).join(', ')}]; }
return { run, set, vals, take, mems: [${mems.map(m => `M${m.k}`).join(', ')}]${watch?.vga ? ', vga: { state: VG, fb: FB }' : ''}${watch?.uart ? ', uart: { take: () => UT.splice(0) }' : ''} };
`;

  return { memChars, templateOf };
}

// Silinx HLS (#1961): the pragmas of operations and of a function's cycles, as Vitis HLS makes them (UG1399). BIND_OP
// op=mul impl=fabric: the multiplications assigned to the variable made of LUTs, shifts and additions, no multiplier
// block (core/c-dataflow-expr.js). ALLOCATION of mul limit=N: a cycle takes no more than N multiplier blocks, the others
// wait (core/c-schedule.js's mults; a wide multiplication counts its 18 x 18 blocks). LATENCY of the top function: min=
// wait states at its start, so every path takes at least that; max= a warning if a path takes more. What Silinx cannot
// make keeps its warning, saying why. Isomorphic ES module: no DOM and no Node APIs.
//
//   checkOpPragma(pragma, loc, report, where, fname, top, funcs) -> whether it was one of these (its warnings said)
//   markFabric(checked)            sets `fabric` on the multiplications BIND_OP asks of the fabric; -> warnings [{ loc, message }]
//   mulLimit(checked) -> ALLOCATION's limit of mul, or null
//   latencyPragma(fn) -> { min, max, loc } of the function's own LATENCY, or null

const INT_OPS = new Set(['add', 'sub', 'mul', 'mult', 'addsub', 'udiv', 'sdiv', 'div', 'urem', 'srem', 'mod']);
const NUM = /^\d+$/;
const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  f(x);
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walk(v, f);
};
const isMul = (op) => op === 'mul' || op === 'mult';
const lower = (v) => String(v ?? '').toLowerCase();

export function checkOpPragma({ name, args }, loc, report, where, fname, top, funcs) {
  if (name === 'BIND_OP') {
    const op = lower(args.op), impl = lower(args.impl);
    if (!args.variable) report(loc, '#pragma HLS BIND_OP needs variable=<the variable its result is assigned to>: ignored', 'warning');
    else if (!INT_OPS.has(op)) report(loc, `#pragma HLS BIND_OP op=${args.op ?? ''}: not an integer operation Silinx makes: ignored`, 'warning');
    else if (impl && !['dsp', 'fabric', 'auto'].includes(impl)) report(loc, `#pragma HLS BIND_OP impl=${args.impl}: not one of dsp, fabric and auto: ignored`, 'warning');
    else if (impl === 'dsp' && !isMul(op)) report(loc, `#pragma HLS BIND_OP op=${op} impl=dsp: the Spartan-3E has no such block, only its multipliers: made of LUTs`, 'warning');
    else if (impl === 'fabric' && !isMul(op)) { /* (as Silinx makes it) */ }
    if (args.latency !== undefined && String(args.latency) !== '-1') report(loc, `#pragma HLS BIND_OP latency=${args.latency}: not made: the clock schedules the operation, its stages not chosen: ignored`, 'warning');
    return true;
  }
  if (name === 'ALLOCATION') {
    const what = args.function !== undefined || lower(args.type) === 'function' ? 'function' : 'operation';
    if (!args.instances || !NUM.test(String(args.limit)) || Number(args.limit) < 1) { report(loc, '#pragma HLS ALLOCATION needs instances=<what> limit=N, a whole number, 1 or more: ignored', 'warning'); return true; }
    if (what === 'function') {
      const f = funcs.get(args.instances);
      if (!f) report(loc, `#pragma HLS ALLOCATION of the function '${args.instances}': no such function: ignored`, 'warning');
      else if (!f.body?.items.some((s) => s.kind === 'pragma' && s.pragma.name === 'INLINE' && s.pragma.args.off)) report(loc, `#pragma HLS ALLOCATION of the function '${args.instances}': it is inlined, no instance to limit (INLINE off makes it a sub-module, one instance): ignored`, 'warning');
      else if (Number(args.limit) > 1) report(loc, `#pragma HLS ALLOCATION limit=${args.limit} of '${args.instances}': one instance made, its calls sharing it`, 'warning');
    } else if (!isMul(lower(args.instances))) report(loc, `#pragma HLS ALLOCATION of ${args.instances}: only multiplications are shared: ignored`, 'warning');
    return true;
  }
  if (name === 'LATENCY') {
    const bad = ['min', 'max'].find((k) => args[k] !== undefined && !NUM.test(String(args[k])));
    if (bad) report(loc, `#pragma HLS LATENCY ${bad}=${args[bad]}: a whole number: ignored`, 'warning');
    else if (args.min !== undefined && args.max !== undefined && Number(args.min) > Number(args.max)) report(loc, `#pragma HLS LATENCY min=${args.min} max=${args.max}: min above max: max taken as min`, 'warning');
    else if (where !== 'function') report(loc, `#pragma HLS LATENCY of a ${where === 'loop' ? 'loop' : 'region'}: not made: the clock schedules its operations; only a top function's is`, 'warning');
    else if (fname !== top && !funcs.get(fname)?.body?.items.some((s) => s.kind === 'pragma' && s.pragma.name === 'INLINE' && s.pragma.args.off)) report(loc, `#pragma HLS LATENCY of '${fname}', a function the top calls: inlined in the top, its pragma has no effect`, 'warning');
    return true;
  }
  return false;
}

export function markFabric(checked) {
  const out = [];
  for (const f of checked.funcs.values()) {
    if (!f.body) continue;
    const asked = [];
    walk(f.body, (n) => { if (n.kind === 'pragma' && n.pragma.name === 'BIND_OP' && isMul(lower(n.pragma.args.op)) && lower(n.pragma.args.impl) === 'fabric' && n.pragma.args.variable) asked.push(n); });
    for (const pg of asked) {
      const v = String(pg.pragma.args.variable);
      let hit = false;
      const mark = (e) => walk(e, (n) => { if (n.kind === 'binary' && n.op === '*') { n.fabric = true; hit = true; } });
      walk(f.body, (n) => {
        if (n.kind === 'var' && n.name === v && n.init) mark(n.init);
        if (n.kind === 'assign' && n.l?.kind === 'id' && n.l.name === v) { if (n.op === '*=') { n.fabric = true; hit = true; } mark(n.r); }
      });
      if (!hit) out.push({ loc: pg.loc, message: `#pragma HLS BIND_OP variable=${v} op=mul: no multiplication is assigned to it: ignored` });
    }
  }
  return out;
}

export function mulLimit(checked) {
  let limit = null;
  for (const f of checked.funcs.values()) {
    walk(f.body, (n) => {
      if (n.kind !== 'pragma' || n.pragma.name !== 'ALLOCATION') return;
      const a = n.pragma.args;
      if (isMul(lower(a.instances)) && NUM.test(String(a.limit)) && Number(a.limit) >= 1 && a.function === undefined && lower(a.type) !== 'function') limit = limit === null ? Number(a.limit) : Math.min(limit, Number(a.limit));
    });
  }
  return limit;
}

export function latencyPragma(fn) {
  const s = fn.body?.items.find((x) => x.kind === 'pragma' && x.pragma.name === 'LATENCY');
  if (!s) return null;
  const a = s.pragma.args, num = (k) => (a[k] !== undefined && NUM.test(String(a[k])) ? Number(a[k]) : null);
  const min = num('min');
  let max = num('max');
  if (min !== null && max !== null && min > max) max = min;
  return { min, max, loc: s.loc };
}

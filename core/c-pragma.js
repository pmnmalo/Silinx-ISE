// Silinx HLS (#1529): the HLS pragmas. Which Silinx makes, where each applies (a loop's in its body: PIPELINE, UNROLL,
// LOOP_TRIPCOUNT; a function's: INLINE, INTERFACE, ARRAY_PARTITION of its arrays), and the warnings of those it
// accepts and ignores (Vitis HLS's others). The loops' transformations a sequential module makes of them
// (core/c-fsmd.js): UNROLL factor=N, N copies of the body an iteration. Isomorphic ES module: no DOM and no Node APIs.
//
//   checkPragmas(ast, funcs, report)   report(loc, message, severity)
//   loopPragma(loop, name) -> its pragma's args, or null
//   readPragma(text after #pragma) -> { name, args, text } | null
//   unrollBy(loop, n) -> the loop with n copies of its body (a 'for'), each after the first if its condition holds

// what Silinx makes of the pragmas it knows
export const MADE = new Set(['TOP', 'INTERFACE', 'LOOP_TRIPCOUNT', 'INLINE', 'UNROLL', 'PIPELINE', 'ARRAY_PARTITION']);
// Vitis HLS's others: accepted, ignored with a warning
export const IGNORED = new Set(['DATAFLOW', 'STREAM', 'LATENCY', 'BIND_OP', 'BIND_STORAGE', 'RESOURCE', 'ALLOCATION', 'DEPENDENCE',
  'LOOP_FLATTEN', 'LOOP_MERGE', 'OCCURRENCE', 'PROTOCOL', 'EXPRESSION_BALANCE', 'FUNCTION_INSTANTIATE', 'AGGREGATE', 'DISAGGREGATE',
  'ARRAY_RESHAPE', 'STABLE', 'RESET', 'SHARED', 'ALIAS', 'CACHE', 'PERFORMANCE']);
// the interfaces of an argument Silinx makes (the others: ignored with a warning, its default made)
export const ARG_MODES = new Set(['ap_none', 'ap_vld', 'ap_ovld', 'ap_memory', 'bram']);
/** `#pragma HLS NAME key=value key` -> { name, args, text }; null if not an HLS pragma (core/c-lex.js's). */
export function readPragma(rest) {
  const m = /^\s*HLS\s+(\w+)\s*(.*)$/i.exec(rest);
  if (!m) return null;
  const args = {};
  for (const a of m[2].matchAll(/(\w+)\s*(?:=\s*("[^"]*"|[^\s,]+))?/g)) args[a[1].toLowerCase()] = a[2] === undefined ? true : a[2].replace(/^"|"$/g, '');
  return { name: m[1].toUpperCase(), args, text: rest.trim() };
}

const LOOP_ONLY = new Set(['PIPELINE', 'UNROLL', 'LOOP_TRIPCOUNT']);

const isLoop = (s) => s && (s.kind === 'for' || s.kind === 'while' || s.kind === 'do');
const posInt = (v) => /^\d+$/.test(String(v)) && Number(v) >= 1;

export function loopPragma(loop, name) {
  const items = loop.body?.kind === 'block' ? loop.body.items : [loop.body];
  return items.find((s) => s?.kind === 'pragma' && s.pragma.name === name)?.pragma.args ?? null;
}

export function checkPragmas(ast, funcs, report) {
  const one = (p, loc, where) => {
    const { name, args } = p;
    if (p.dup) return;   // (a stream of a struct's pragma made for each of its members' streams but the first: said once, #1662)
    if (IGNORED.has(name)) { report(loc, `#pragma HLS ${name} is accepted and ignored: Silinx does not make it`, 'warning'); return; }
    if (!MADE.has(name)) { report(loc, `#pragma HLS ${name} is not a pragma Silinx knows: ignored`, 'warning'); return; }
    if (LOOP_ONLY.has(name) && where !== 'loop') {
      if (name === 'PIPELINE' && where === 'function') report(loc, "a function's #pragma HLS PIPELINE is not made yet: ignored (a loop's is: put it in the loop's body)", 'warning');
      else report(loc, `#pragma HLS ${name} applies to the loop it is in (first in its body): ignored here`, 'warning');
      return;
    }
    if (name === 'UNROLL' && args.factor !== undefined && !posInt(args.factor)) report(loc, `#pragma HLS UNROLL factor=${args.factor}: the factor must be a whole number, 1 or more`);
    if (name === 'PIPELINE' && args.ii !== undefined && !posInt(args.ii)) report(loc, `#pragma HLS PIPELINE II=${args.ii}: II must be a whole number, 1 or more`);
    if (name === 'INLINE' && args.off) report(loc, '#pragma HLS INLINE off is ignored: Silinx inlines every function', 'warning');
    if (name === 'ARRAY_PARTITION') {
      if (!args.variable) { report(loc, '#pragma HLS ARRAY_PARTITION needs variable=<the array>'); return; }
      const type = String(args.type || (args.block ? 'block' : args.cyclic ? 'cyclic' : 'complete')).toLowerCase();
      if (type !== 'complete') report(loc, `#pragma HLS ARRAY_PARTITION type=${type} is not made yet: ignored (type=complete is: the array's elements registers)`, 'warning');
      if (args.dim !== undefined && String(args.dim) !== '1' && String(args.dim) !== '0') report(loc, `#pragma HLS ARRAY_PARTITION dim=${args.dim}: only one dimension (dim=1)`, 'warning');
    }
    if (name === 'INTERFACE' && args.port && args.port !== 'return') {
      const mode = String(args.mode || Object.keys(args).find((k) => /^(ap_|s_axi|m_axi|axis|bram)/.test(k)) || '').toLowerCase();
      if (mode && !ARG_MODES.has(mode)) report(loc, `#pragma HLS INTERFACE ${mode} port=${p.of ?? args.port} is not made yet: ignored (its default interface made)`, 'warning');
    }
  };
  for (const p of ast.pragmas) one(p, p.loc, 'file');
  const walk = (items, where) => {
    for (const s of items || []) {
      if (!s) continue;
      if (s.kind === 'pragma') { one(s.pragma, s.loc, where); continue; }
      if (isLoop(s)) { const b = s.body; walk(b?.kind === 'block' ? b.items : [b], 'loop'); continue; }
      if (s.kind === 'block') walk(s.items, 'block');
      else if (s.kind === 'if') walk([s.then, s.else], 'block');
      else if (s.kind === 'switch') walk([s.body], 'block');
      else if (s.kind === 'label') walk([s.stmt], 'block');
    }
  };
  for (const f of funcs.values()) if (f.body) walk(f.body.items, 'function');
}

/** `for (init; cond; step) body` with `n` copies of body (and step) an iteration: copy k + 1 runs if cond still holds. */
export function unrollBy(loop, n) {
  const items = (loop.body?.kind === 'block' ? loop.body.items : [loop.body]).filter((s) => !(s?.kind === 'pragma' && (s.pragma.name === 'UNROLL' || s.pragma.name === 'PIPELINE')));
  const step = loop.step ? [{ kind: 'expr', e: loop.step, loc: loop.loc }] : [];
  const copies = [];
  for (let k = 0; k < n; k++) {
    if (k) copies.push({ kind: 'if', cond: { kind: 'unary', op: '!', e: loop.cond, loc: loop.loc }, then: { kind: 'break', loc: loop.loc }, else: null, loc: loop.loc });
    copies.push({ kind: 'block', items: [...items], loc: loop.loc }, ...step);
  }
  return { ...loop, step: null, body: { kind: 'block', items: copies, loc: loop.loc }, unrolledBy: n };
}

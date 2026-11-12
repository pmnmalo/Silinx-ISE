// Silinx - a VHDL design unit (an entity and its architecture, as core/vhdl/parser.js reads it) written in Verilog
// (#2693), for the Design pane's read-only translation of a VHDL source in a Verilog project (core/translate.js).
// The synthesizable teaching subset: generics, ports, signals, constants, enumerated types (localparams), arrays
// (memories, a constant table filled by an initial block), processes (clocked, with an asynchronous reset,
// combinational, a test bench's with waits), if / case / for / while, concurrent assignments, instances, generates,
// functions with a result, the numeric_std conversions. What has no translation throws Untranslatable (records,
// packages' names, procedures, a wait in a process with a sensitivity list…). Isomorphic ES module.
import { at, atLine, cannot, intOf, intRangeBits, reservedInVerilog, walk, targetName, indent, ifGenerateBranches } from './translate-util.js';
import { walkItems } from './util.js';

// Verilog's operators: their precedence (higher binds tighter)
const PREC = { '**': 11, '*': 10, '/': 10, '%': 10, '+': 9, '-': 9, '<<': 8, '>>': 8, '<<<': 8, '>>>': 8, '<': 7, '<=': 7, '>': 7, '>=': 7,
  '==': 6, '!=': 6, '&': 5, '^': 4, '~^': 4, '|': 3, '&&': 2, '||': 1 };
const ATOM = 13, UNARY = 12;
const BUILTIN_TYPES = { natural: { k: 'int', bits: null }, positive: { k: 'int', bits: null }, integer: { k: 'int', bits: null },
  std_logic: { k: 'bit' }, std_ulogic: { k: 'bit' }, bit: { k: 'bit' }, boolean: { k: 'bool' }, real: { k: 'real' }, time: { k: 'time' },
  string: { k: 'str' } };
const stmtsOf = x => (!x ? [] : x.kind === 'block' ? x.stmts : [x]);

/** One VHDL module (a unit of kind 'module') in Verilog: { text, renamed: [[from, to]], timescale }. spell(name): the
 *  name as the source writes it (the IR has VHDL's names in lower case). */
export function moduleToVerilog(mod, { spell = n => n, packages = [] } = {}) {
  at.line = mod.loc?.line ?? null;
  const genvars = new Set();
  walk(mod.items, n => { if (n.kind === 'generate_for') genvars.add(n.var); });
  const cx = { mod, genvars, declared: new Set(), names: new Map(), types: new Map(), funcs: new Map(), spell, renamed: [], timescale: false, extraDecls: [], inits: [] };
  const pkg = packageDecls(cx, mod, packages);
  for (const g of mod.params || []) declare(cx, g.name, 'generic', resolveType(cx, g.type || { kind: 'integer' }));
  for (const p of mod.ports || []) { declare(cx, p.name, 'port', resolveType(cx, p.type), { dir: p.dir }); cx.declared.add(outName(cx, p.name)); }
  const regs = assignedInProcesses(mod);
  // (the functions after the other declarations: an unconstrained parameter's width is its arguments', any signal's)
  const decls = (mod.decls || []).map(d => (d.kind === 'function' ? (cx.funcs.set(d.name, { k: 'vec' }), null) : declV(cx, d, regs)));
  const body = (mod.decls || []).flatMap((d, i) => decls[i] || functionV(cx, d));
  const items = [];
  for (const it of mod.items || []) items.push(...(items.length ? [''] : []), ...itemV(cx, it, regs));
  const params = (mod.params || []).map(g => `parameter ${paramV(cx, g)}`);
  const ports = (mod.ports || []).map(p => portV(cx, p, regs));
  const head = [`module ${outName(cx, mod.name)}${params.length ? ` #(\n${indent(params.map((p, i) => p + (i < params.length - 1 ? ',' : ''))).join('\n')}\n)` : ''} (`,
    ...indent(ports.map((p, i) => p + (i < ports.length - 1 ? ',' : ''))), ');'];
  const inits = cx.inits.length ? ['initial begin', ...indent(cx.inits), 'end'] : [];
  const lines = [...head, ...indent([...pkg, ...body, ...cx.extraDecls, ...inits]), '', ...indent(items), 'endmodule'];
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), renamed: cx.renamed, timescale: cx.timescale };
}

// ------------------------------------------------------------------ names and types
function outName(cx, n) {
  const s = cx.spell(n);
  if (!reservedInVerilog(s)) return s;
  if (!cx.renamed.some(([a]) => a === s)) cx.renamed.push([s, `${s}_`]);
  return `${s}_`;
}
function declare(cx, name, kind, type, more = {}) { cx.names.set(name, { kind, type, ...more }); }

function resolveType(cx, t) {
  if (!t) return { k: 'bit' };
  switch (t.kind) {
    case 'logic': return t.range ? { k: 'vec', range: t.range, signed: !!t.signed, num: !t.mark || /^(un)?signed$/.test(t.mark) }
      : t.unconstrained ? { k: 'vec', range: null, signed: !!t.signed } : { k: 'bit' };
    case 'integer': return { k: 'int', bits: t.range ? intRangeBits(t.range) : null, range: t.range };
    case 'boolean': return { k: 'bool' };
    case 'real': return { k: 'real' };
    case 'time': return { k: 'time' };
    case 'string': return { k: 'str' };
    case 'enum': return enumType(t.values);
    case 'array': {
      const elem = resolveType(cx, t.elem);
      if (elem.k === 'array') cannot('an array of arrays', t);
      return { k: 'array', range: t.range, elem };
    }
    case 'named': {
      const n = String(t.name).toLowerCase();
      // (an unconstrained array given its range: cases_t(0 to 11))
      if (cx.types.has(n)) return t.range && cx.types.get(n).k === 'array' ? { ...cx.types.get(n), range: t.range } : cx.types.get(n);
      if (BUILTIN_TYPES[n]) return BUILTIN_TYPES[n];
      return cannot(`the type '${t.name}' (not declared in this unit)`, t);
    }
    case 'record': return cannot('a record type', t);
  }
  return cannot(`a type of kind '${t.kind}'`, t);
}
function enumType(values) {
  const w = Math.max(1, Math.ceil(Math.log2(values.length)));
  return { k: 'enum', values, w };
}
const rangeV = (cx, r) => `[${exprV(cx, r.left).c}:${exprV(cx, r.right).c}]`;
// a type's Verilog declaration: its keyword ('reg', 'wire', 'integer'…), what goes before the name ('signed [7:0]')
// and after it (a memory's ' [0:15]')
function typeDecl(cx, R, reg) {
  const kw = reg ? 'reg' : 'wire';
  switch (R.k) {
    case 'bit': case 'bool': return { kw, pre: '' };
    case 'vec': return R.range ? { kw, pre: `${R.signed ? 'signed ' : ''}${rangeV(cx, R.range)}` } : cannot('an unconstrained vector here');
    case 'int': return R.bits ? { kw, pre: `${R.bits.signed ? 'signed ' : ''}[${R.bits.w - 1}:0]` } : reg ? { kw: 'integer', pre: '' } : { kw, pre: 'signed [31:0]' };
    case 'enum': return { kw, pre: `[${R.w - 1}:0]` };
    case 'array': { const e = typeDecl(cx, R.elem, reg); return { ...e, post: ` ${rangeV(cx, R.range)}` }; }
    case 'real': return { kw: 'real', pre: '' };
    case 'time': return { kw: 'time', pre: '' };
  }
  return cannot(`a signal or a variable of type ${{ str: 'string' }[R.k] || R.k}`);
}
const declText = (d, name) => `${d.kw}${d.pre ? ` ${d.pre}` : ''} ${name}${d.post || ''}`;
/** A type's width as Verilog text ('8', 'N', '(A)-(B)+1') and as a number when constant (else null). */
function widthOf(cx, R) {
  if (!R) return null;
  if (R.k === 'bit' || R.k === 'bool') return { c: '1', n: 1 };
  if (R.k === 'enum') return { c: String(R.w), n: R.w };
  if (R.k === 'int') return R.bits ? { c: String(R.bits.w), n: R.bits.w } : { c: '32', n: 32 };
  if (R.k !== 'vec' || !R.range) return null;
  const { left, right } = R.range;
  const l = intOf(left), r = intOf(right);
  if (l != null && r != null) return { c: String(Math.abs(l - r) + 1), n: Math.abs(l - r) + 1 };
  const hi = R.range.dir === 'to' ? right : left, lo = R.range.dir === 'to' ? left : right;
  if (intOf(lo) === 0 && hi.op === 'binary' && hi.o === '-' && intOf(hi.b) === 1) return { c: exprV(cx, hi.a).c, n: null };
  return { c: `(${exprV(cx, hi).c})-(${exprV(cx, lo).c})+1`, n: null };
}
// the signals (and variables) a process assigns: Verilog's regs
function assignedInProcesses(mod) {
  const regs = new Set();
  // (the generates' items too, walked in a loop: an elsif chain thousands long, #3500)
  walkItems(mod.items, it => {
    if (it.kind === 'assign' && it.delay) regs.add(targetName(it.target));
    if (it.kind === 'process') walk(it.body, n => { if (n.kind === 'assign') { const t = targetName(n.target); if (t) regs.add(t); } });
  });
  return regs;
}

// ------------------------------------------------------------------ declarations
// the declarations of the packages the unit uses (use work.p.all): Verilog has none, the ones it names are copied in
function packageDecls(cx, mod, packages) {
  const used = new Set();
  walk(mod, n => { if (n.op === 'ref' || n.op === 'apply' || n.kind === 'named') used.add(String(n.name).toLowerCase()); });
  const out = [];
  for (const u of mod.uses || []) {
    const p = packages.find(q => q.name === String(u).toLowerCase());
    if (!p) continue;
    const keep = p.decls.filter(d => d.kind === 'type' || d.kind === 'subtype' || used.has(d.name));
    walk(keep, n => { if (n.op === 'ref' || n.op === 'apply') used.add(n.name); });
    const lines = p.decls.filter(d => d.kind === 'type' || d.kind === 'subtype' || used.has(d.name)).flatMap(d => {
      const l = declV(cx, d, new Set());
      return d.kind === 'type' && !(d.type.values || []).some(v => used.has(v)) && !used.has(d.name) ? [] : l;
    });
    if (lines.length) out.push(`// from the package ${cx.spell(p.name)}`, ...lines, '');
  }
  return out;
}
function paramV(cx, g) {
  const R = resolveType(cx, g.type || { kind: 'integer' });
  const pre = R.k === 'vec' && R.range ? `${rangeV(cx, R.range)} ` : '';
  return `${pre}${outName(cx, g.name)} = ${g.default ? exprV(cx, g.default, R).c : '0'}`;
}
function portV(cx, p, regs) {
  const R = cx.names.get(p.name).type;
  if (R.k === 'array') cannot(`the port '${cx.spell(p.name)}' of an array type`, p);
  const dir = p.dir === 'in' ? 'input' : p.dir === 'inout' ? 'inout' : 'output';
  const reg = dir === 'output' && regs.has(p.name);
  const d = typeDecl(cx, R, reg);
  return `${dir} ${d.kw === 'integer' ? 'reg signed [31:0]' : d.kw}${d.pre ? ` ${d.pre}` : ''} ${outName(cx, p.name)}`;
}
function declV(cx, d, regs) {
  atLine(d);
  switch (d.kind) {
    case 'type': case 'subtype': {
      const R = resolveType(cx, d.type);
      cx.types.set(d.name, R);
      if (R.k !== 'enum') return [];
      R.values.forEach((v, i) => declare(cx, v, 'enumlit', R, { value: i }));
      return [`localparam [${R.w - 1}:0] ${R.values.map((v, i) => `${outName(cx, v)} = ${R.w}'d${i}`).join(', ')};`];
    }
    case 'signal': {
      const R = resolveType(cx, d.type);
      declare(cx, d.name, d.net === 'variable' ? 'var' : 'signal', R);
      cx.declared.add(outName(cx, d.name));
      const reg = regs.has(d.name) || d.net === 'variable';
      if (R.k === 'array' && d.init) fillArray(cx, outName(cx, d.name), R, d.init, d);
      const init = reg && d.init && R.k !== 'array' ? ` = ${exprV(cx, d.init, R).c}` : '';
      return [`${declText(typeDecl(cx, R, reg), outName(cx, d.name))}${init};`];
    }
    case 'const': {
      const R = resolveType(cx, d.type);
      declare(cx, d.name, 'const', R);
      if (R.k === 'array') return tableV(cx, d, R);
      if (R.k === 'time') return [`localparam ${outName(cx, d.name)} = ${timeV(cx, d.value)};`];
      const pre = R.k === 'vec' && R.range ? `${R.signed ? 'signed ' : ''}${rangeV(cx, R.range)} ` : '';
      return [`localparam ${pre}${outName(cx, d.name)} = ${exprV(cx, d.value, R).c};`];
    }
    case 'function': return functionV(cx, d);
    case 'component': case 'attribute': case 'attrspec': case 'use': return [];
  }
  return cannot(`a declaration of kind '${d.kind}'`, d);
}
// a constant array (a ROM table): a memory, filled by an initial block
function tableV(cx, d, R) {
  const name = outName(cx, d.name);
  fillArray(cx, name, R, d.value, d);
  return [`${declText(typeDecl(cx, R, true), name)};`];
}
// an array's initial value (an aggregate, another array): the initial block's assignments
function fillArray(cx, name, R, v, d) {
  if (!R.range) cannot(`the initial value of '${name}' (an array of a range not given)`, d);
  const lo = intOf(R.range.left), hi = intOf(R.range.right);
  if (lo == null || hi == null) cannot(`the initial value of '${name}' (its index range is not constant)`, d);
  const loop = body => {
    if (!cx.names.has('i_init')) { declare(cx, 'i_init', 'loop', { k: 'int', bits: null }); cx.extraDecls.push('integer i_init;'); }
    cx.inits.push(`for (i_init = ${Math.min(lo, hi)}; i_init <= ${Math.max(lo, hi)}; i_init = i_init + 1)`, `    ${name}[i_init] = ${body};`);
  };
  if (v?.op === 'ref' && cx.names.get(v.name)?.type?.k === 'array') return loop(`${outName(cx, v.name)}[i_init]`);
  if (v?.op !== 'aggregate') cannot(`the initial value of '${name}' (an array not written as an aggregate)`, d);
  const step = R.range.dir === 'downto' ? -1 : 1;
  const others = v.items.find(it => it.choices?.[0] === 'others');
  if (others) loop(exprV(cx, others.value, R.elem).c);
  v.items.forEach((it, i) => {
    if (it === others) return;
    if (it.choices && !it.choices.every(c => intOf(c) != null)) cannot(`the initial value of '${name}' (an aggregate with choices that are not constant)`, d);
    for (const at of it.choices ? it.choices.map(intOf) : [lo + i * step]) cx.inits.push(`${name}[${at}] = ${exprV(cx, it.value, R.elem).c};`);
  });
}
function functionV(cx, f) {
  if (!f.returnType) cannot(`the procedure '${cx.spell(f.name)}'`, f);
  let R = resolveType(cx, f.returnType);
  if (!tailReturns(f.body)) cannot(`the function '${cx.spell(f.name)}' (a return before its end)`, f);
  const name = outName(cx, f.name);
  cx.funcs.set(f.name, R);
  const saved = new Map(cx.names);
  const args = (f.params || []).map(p => {
    let T = resolveType(cx, p.type);
    if (T.k === 'vec' && !T.range) T = { ...T, range: argRange(cx, f, p) };
    declare(cx, p.name, 'var', T);
    const d = typeDecl(cx, T, false);
    return `input ${d.kw === 'integer' || T.k === 'int' && !T.bits ? 'integer' : d.pre || ''} ${outName(cx, p.name)}`.replace(/ {2,}/g, ' ');
  });
  const decls = (f.decls || []).map(d => {
    if (d.kind !== 'signal' && d.kind !== 'const') cannot(`a declaration of kind '${d.kind}' in a function`, d);
    const T = resolveType(cx, d.type);
    declare(cx, d.name, 'var', T);
    return `${declText(typeDecl(cx, T, true), outName(cx, d.name))};`;
  });
  // (an unconstrained result: the width of what it returns)
  if (R.k === 'vec' && !R.range) {
    let w = null;
    walk(f.body, n => { if (n.kind === 'return' && w == null) w = widthOfExpr(cx, n.value); });
    if (w == null) cannot(`the function '${cx.spell(f.name)}' (it returns an unconstrained vector of a width not known)`, f);
    R = { ...R, range: { left: { op: 'int', value: String(w - 1) }, right: { op: 'int', value: '0' }, dir: 'downto' } };
    cx.funcs.set(f.name, R);
  }
  const body = stmtsV(cx, f.body, { mode: 'func', func: name, ret: R });
  cx.names = saved;
  const rd = R.k === 'int' && !R.bits ? 'integer' : typeDecl(cx, R, false).pre;
  return [`function ${rd ? `${rd} ` : ''}${name}(${args.join(', ')});`, ...indent([...decls, 'begin', ...indent(body), 'end']), 'endfunction'];
}
// an unconstrained parameter: the width of the widest argument the unit gives it
function argRange(cx, f, p) {
  const at = f.params.indexOf(p);
  let w = null;
  walk(cx.mod.items, n => {
    if (n.op !== 'apply' || n.name !== f.name || !n.args?.[at]) return;
    const a = widthOfExpr(cx, n.args[at]);
    w = a == null || w === -1 ? -1 : Math.max(w ?? 0, a);
  });
  if (w == null || w < 1) cannot(`the function '${cx.spell(f.name)}' (its parameter '${cx.spell(p.name)}' is unconstrained, of a width not known)`, f);
  return { left: { op: 'int', value: String(w - 1) }, right: { op: 'int', value: '0' }, dir: 'downto' };
}
// every return the last statement of its branch, and that branch the end of the function
function tailReturns(stmts) {
  return stmts.every((s, i) => {
    let has = false;
    walk(s, n => { if (n.kind === 'return') has = true; });
    if (!has) return true;
    if (i !== stmts.length - 1) return false;
    if (s.kind === 'return') return true;
    if (s.kind === 'if') return tailReturns(stmtsOf(s.then)) && (!s.else || tailReturns(stmtsOf(s.else)));
    if (s.kind === 'case') return s.items.every(it => tailReturns(stmtsOf(it.body))) && (!s.default || tailReturns(stmtsOf(s.default)));
    if (s.kind === 'block') return tailReturns(s.stmts);
    return false;
  });
}

// ------------------------------------------------------------------ concurrent statements
function itemV(cx, it, regs) {
  atLine(it);
  switch (it.kind) {
    case 'assign': {
      if (it.delay) return delayedV(cx, it);
      return [`assign ${exprV(cx, it.target).c} = ${exprV(cx, it.value, typeOfTarget(cx, it.target)).c};`];
    }
    case 'process': return processV(cx, it);
    case 'instance': return instanceV(cx, it);
    case 'generate_for': return generateForV(cx, it, regs);
    case 'generate_if': return generateIfV(cx, it, regs);
    case 'assert': return [];
  }
  return cannot(`a concurrent statement of kind '${it.kind}'`, it);
}
// a concurrent assignment with a delay (a test bench's clock): an always block on what it reads
function delayedV(cx, it) {
  const reads = new Set();
  walk([it.value, it.target.op === 'ref' ? null : it.target], n => { if (n.op === 'ref' && /^(signal|port)$/.test(cx.names.get(n.name)?.kind)) reads.add(outName(cx, n.name)); });
  if (it.target.op === 'ref') reads.add(outName(cx, it.target.name));
  return [`always @(${[...reads].join(' or ')})`, `    ${exprV(cx, it.target).c} <= #${timeV(cx, it.delay)} ${exprV(cx, it.value, typeOfTarget(cx, it.target)).c};`];
}
function instanceV(cx, it) {
  const params = (it.params || []).map(p => `.${p.name ? cx.spell(p.name) : cannot('a positional generic map', it)}(${exprV(cx, p.value).c})`);
  const conns = (it.conns || []).map(c => `.${c.port ? cx.spell(c.port) : cannot('a positional port map', it)}(${c.expr ? exprV(cx, c.expr).c : ''})`);
  return [`${cx.spell(it.module)} ${params.length ? `#(${params.join(', ')}) ` : ''}${outName(cx, it.name)} (`, ...indent(conns.map((c, i) => c + (i < conns.length - 1 ? ',' : ''))), ');'];
}
function generateForV(cx, g, regs) {
  const v = outName(cx, g.var);
  declare(cx, g.var, 'loop', { k: 'int', bits: null });
  const up = g.cond?.o === '<=';
  const end = exprV(cx, g.cond.b).c;
  const inner = generateRegion(cx, () => [...(g.decls || []).flatMap(d => declV(cx, d, regs)), ...(g.items || []).flatMap(i => itemV(cx, i, regs))]);
  cx.names.delete(g.var);
  return [`genvar ${v};`, ...region(cx, [`for (${v} = ${exprV(cx, g.init).c}; ${v} ${up ? '<=' : '>='} ${end}; ${v} = ${v} ${up ? '+' : '-'} 1) begin : ${outName(cx, g.label || `gen_${g.var}`)}`,
    ...indent(inner), 'end'])];
}
// a generate construct's contents, made inside a generate region; the region's keywords around the outermost construct
// only (generate regions do not nest, #3501)
function generateRegion(cx, f) {
  const saved = cx.inGenerate;
  cx.inGenerate = true;
  try { return f(); } finally { cx.inGenerate = saved; }
}
const region = (cx, lines) => (cx.inGenerate ? lines : [`generate ${lines[0]}`, ...lines.slice(1, -1), `${lines.at(-1)} endgenerate`]);
// an if generate, elsif and else branches included (#3501; a case generate is one too): an else if chain, each branch
// a named block (Verilog-2001 declares nothing in an unnamed one), the first one's label numbered for the others, as
// VHDL's alternatives share it
function generateIfV(cx, g, regs) {
  const base = g.label || 'gen_if';
  const out = ifGenerateBranches(g).flatMap((b, k) => {
    atLine(b);
    const label = outName(cx, !k ? base : b.cond ? `${base}_${k + 1}` : `${base}_else`);
    const head = `${k ? 'end else ' : ''}${b.cond ? `if (${exprV(cx, b.cond).c}) ` : ''}begin : ${label}`;
    return [head, ...indent(generateRegion(cx, () => [...b.decls.flatMap(d => declV(cx, d, regs)), ...b.items.flatMap(i => itemV(cx, i, regs))]))];
  });
  return region(cx, [...out, 'end']);
}

// a process: clocked (one clock edge), with an asynchronous reset, combinational, or a test bench's (with waits)
// (its variables regs of the module: one named as a signal, or as another process's variable, gets a name of its own)
function processV(cx, p) {
  const hidden = new Map();
  for (const d of p.decls || []) {
    atLine(d);
    if (d.kind === 'function') { cx.extraDecls.push(...functionV(cx, d)); continue; }
    if (d.kind !== 'signal' && d.kind !== 'const') cannot(`a declaration of kind '${d.kind}' in a process`, d);
    if (cx.names.has(d.name)) hidden.set(d.name, cx.names.get(d.name));
    let as = outName(cx, d.name);
    for (let i = 2; cx.declared.has(as); i++) as = `${outName(cx, d.name)}_${i}`;
    cx.declared.add(as);
    const R = resolveType(cx, d.type);
    declare(cx, d.name, 'var', R, { as });
    cx.extraDecls.push(`${declText(typeDecl(cx, R, true), as)}${d.init && R.k !== 'array' ? ` = ${exprV(cx, d.init, R).c}` : ''};`);
  }
  const out = processBody(cx, p);
  for (const [n, e] of hidden) cx.names.set(n, e);
  return out;
}
function processBody(cx, p) {
  let waits = false;
  walk(p.body, n => { if (n.kind === 'wait') waits = true; });
  if (waits) {
    if (p.sens) cannot('a wait in a process with a sensitivity list', p);
    const last = p.body[p.body.length - 1];
    const once = last?.kind === 'wait' && !last.on && !last.until && !last.for;
    return [`${once ? 'initial' : 'always'} begin`, ...indent(stmtsV(cx, once ? p.body.slice(0, -1) : p.body, { mode: 'tb' })), 'end'];
  }
  if (!p.sens) cannot('a process with neither a sensitivity list nor a wait', p);
  const [s] = p.body;
  if (p.body.length === 1 && s.kind === 'if') {
    const e = edgeOf(s.cond);
    if (e && !s.else) return [`always @(${e.edge}edge ${outName(cx, e.clk)}) begin`, ...indent(stmtsV(cx, stmtsOf(s.then), { mode: 'clocked' })), 'end'];
    const els = s.else?.kind === 'if' ? s.else : stmtsOf(s.else).length === 1 && stmtsOf(s.else)[0].kind === 'if' ? stmtsOf(s.else)[0] : null;
    const e2 = els && !els.else && edgeOf(els.cond);
    const rst = e2 && resetOf(s.cond);
    if (rst) {
      return [`always @(${e2.edge}edge ${outName(cx, e2.clk)} or ${rst.high ? 'pos' : 'neg'}edge ${outName(cx, rst.name)}) begin`,
        ...indent([`if (${rst.high ? '' : '!'}${outName(cx, rst.name)}) begin`, ...indent(stmtsV(cx, stmtsOf(s.then), { mode: 'clocked' })),
          'end else begin', ...indent(stmtsV(cx, stmtsOf(els.then), { mode: 'clocked' })), 'end']), 'end'];
    }
  }
  walk(p.body, n => { if (n.op === 'apply' && /^(rising|falling)_edge$/.test(n.name) || n.op === 'attr' && n.attr === 'event') cannot('a clock edge in a process of another form (one if rising_edge(clk), or an asynchronous reset first)', p); });
  return ['always @* begin', ...indent(stmtsV(cx, p.body, { mode: 'comb' })), 'end'];
}
// rising_edge(clk), falling_edge(clk), clk'event and clk = '1'
function edgeOf(c) {
  if (c?.op === 'apply' && /^(rising|falling)_edge$/.test(c.name) && c.args?.[0]?.op === 'ref') return { clk: c.args[0].name, edge: c.name === 'rising_edge' ? 'pos' : 'neg' };
  if (c?.op === 'binary' && c.o === '&') {
    const [ev, lv] = c.a.op === 'attr' ? [c.a, c.b] : [c.b, c.a];
    if (ev?.op === 'attr' && ev.attr === 'event' && ev.prefix?.op === 'ref' && lv?.op === 'binary' && lv.o === '==' && lv.a?.op === 'ref' && lv.a.name === ev.prefix.name && lv.b?.op === 'lit') {
      return { clk: ev.prefix.name, edge: lv.b.bits === '1' ? 'pos' : 'neg' };
    }
  }
  return null;
}
function resetOf(c) {
  if (c?.op === 'binary' && c.o === '==' && c.a?.op === 'ref' && c.b?.op === 'lit' && c.b.bits.length === 1) return { name: c.a.name, high: c.b.bits === '1' };
  return null;
}

// ------------------------------------------------------------------ sequential statements
function stmtsV(cx, list, o) {
  const out = [];
  for (const s of list) out.push(...stmtV(cx, s, o));
  return out;
}
const blockV = (cx, x, o) => {
  const l = stmtsV(cx, stmtsOf(x), o);
  // (a lone if keeps begin … end: an else after it is not its)
  return l.length === 1 && stmtsOf(x)[0]?.kind !== 'if' ? { open: '', lines: indent(l), close: [] } : { open: ' begin', lines: indent(l), close: ['end'] };
};
function stmtV(cx, s, o) {
  atLine(s);
  switch (s.kind) {
    case 'block': return stmtsV(cx, s.stmts, o);
    case 'null': return [';'];
    case 'assign': {
      if (s.delay && o.mode !== 'tb') cannot('an assignment with a delay (after)', s);
      const op = s.delay ? `<= #${timeV(cx, s.delay)}` : s.nonblocking && o.mode === 'clocked' ? '<=' : '=';
      return [`${exprV(cx, s.target).c} ${op} ${exprV(cx, s.value, typeOfTarget(cx, s.target)).c};`];
    }
    case 'if': return ifV(cx, s, o);
    case 'case': {
      if (s.variant && s.variant !== 'case') cannot(`a ${s.variant} statement`, s);
      const sel = typeOfExpr(cx, s.expr);
      const out = [`case (${exprV(cx, s.expr).c})`];
      for (const it of s.items) {
        const ch = it.choices.map(c => (c === 'others' ? 'default' : c.range ? cannot('a range of choices in a case', s) : exprV(cx, c, sel).c));
        const b = blockV(cx, it.body, o);
        out.push(...indent([`${ch.join(', ')}:${b.open}`, ...b.lines, ...b.close]));
      }
      if (s.default) { const b = blockV(cx, s.default, o); out.push(...indent([`default:${b.open}`, ...b.lines, ...b.close])); }
      return [...out, 'endcase'];
    }
    case 'forrange': {
      const r = s.range.of ? rangeOfExpr(cx, s.range.of, s) : s.range;
      const [from, to, up] = s.range.reverse ? [r.right, r.left, r.dir !== 'to'] : [r.left, r.right, r.dir === 'to'];
      // (its integer declared in the module, of another name than a generate's genvar)
      const v = cx.genvars.has(s.var) ? `${outName(cx, s.var)}_loop` : outName(cx, s.var);
      if (!cx.names.has(s.var)) { declare(cx, s.var, 'loop', { k: 'int', bits: null }, { as: v }); cx.extraDecls.push(`integer ${v};`); }
      const b = blockV(cx, s.body, o);
      return [`for (${v} = ${exprV(cx, from).c}; ${v} ${up ? '<=' : '>='} ${exprV(cx, to).c}; ${v} = ${v} ${up ? '+' : '-'} 1)${b.open}`, ...b.lines, ...b.close];
    }
    case 'while': { const b = blockV(cx, s.body, o); return [`while (${exprV(cx, s.cond).c})${b.open}`, ...b.lines, ...b.close]; }
    case 'return': return o.mode === 'func' && s.value ? [`${o.func} = ${exprV(cx, s.value, o.ret).c};`] : cannot('a return outside a function', s);
    case 'report': return reportV(cx, s.message, s.severity, s);
    case 'assert': return [`if (!(${exprV(cx, s.cond).c})) begin`, ...indent(reportV(cx, s.message || { op: 'str', value: 'Assertion violation.' }, s.severity || 'error', s)), 'end'];
    case 'wait': {
      if (o.mode !== 'tb') cannot('a wait statement', s);
      if (s.for && !s.until && !s.on) return [`#${timeV(cx, s.for)};`];
      const e = s.until && edgeOf(s.until);
      if (e && !s.for) return [`@(${e.edge}edge ${outName(cx, e.clk)});`];
      const u = s.until;
      const ce = u?.op === 'binary' && u.o === '&' && !s.for && !s.on && (edgeOf(u.a) ? [edgeOf(u.a), u.b] : edgeOf(u.b) ? [edgeOf(u.b), u.a] : null);
      if (ce) {
        const at = `@(${ce[0].edge}edge ${outName(cx, ce[0].clk)});`;
        return [`${at} while (!(${exprV(cx, ce[1]).c})) ${at}`];
      }
      if (u && !s.for && !s.on) return [`wait (${exprV(cx, u).c});`];
      if (s.on && !s.until && !s.for) return [`@(${s.on.map(x => exprV(cx, x).c).join(' or ')});`];
      return cannot('this wait statement', s);
    }
  }
  return cannot(`a statement of kind '${s.kind}'`, s);
}
function ifV(cx, s, o) {
  const out = [];
  for (let cur = s, kw = 'if'; ;) {
    const b = blockV(cx, cur.then, o);
    head(out, `${kw} (${exprV(cx, cur.cond).c})${b.open}`);
    out.push(...b.lines, ...b.close);
    if (!cur.else) return out;
    if (cur.else.kind === 'if') { cur = cur.else; kw = 'else if'; continue; }
    const e = blockV(cx, cur.else, o);
    head(out, `else${e.open}`);
    out.push(...e.lines, ...e.close);
    return out;
  }
}
// (an else after an end on its line: "end else …")
const head = (out, line) => { if (line.startsWith('else') && out[out.length - 1] === 'end') out[out.length - 1] = `end ${line}`; else out.push(line); };
function reportV(cx, msg, severity, s) {
  const fmt = [], args = [];
  const part = m => {
    if (m?.op === 'concat') return m.parts.forEach(part);
    if (m?.op === 'binary' && m.o === '&') { part(m.a); part(m.b); return; }
    if (m?.op === 'str') return fmt.push(m.value.replace(/["\\%]/g, c => (c === '%' ? '%%' : `\\${c}`)));
    if (m?.op === 'attr' && m.attr === 'image' && m.args?.length === 1) {
      fmt.push(/^std_u?logic$|^bit$/.test(String(m.prefix?.name).toLowerCase()) ? '%b' : '%0d');
      return args.push(exprV(cx, m.args[0]).c);
    }
    cannot('a report of a message other than strings and \'image', s);
  };
  part(msg);
  const sev = severity && severity !== 'note' ? `${severity[0].toUpperCase()}${severity.slice(1)}: ` : '';
  const out = [`$display("${sev}${fmt.join('')}"${args.map(a => `, ${a}`).join('')});`];
  if (severity === 'failure') out.push('$finish;');
  return out;
}
function timeV(cx, e) {
  cx.timescale = true;
  if (e.op === 'phys') {
    const f = { fs: 1e-6, ps: 1e-3, ns: 1, us: 1e3, ms: 1e6, sec: 1e9 }[String(e.unit).toLowerCase()];
    if (f == null) cannot(`a time in ${e.unit}`, e);
    return String(+(e.value * f).toFixed(6));
  }
  if (e.op === 'binary' && e.a.op === 'phys' && (e.o === '*' || e.o === '/')) return `(${timeV(cx, e.a)} ${e.o} ${exprV(cx, e.b).c})`;
  if (e.op === 'binary' && e.b.op === 'phys' && e.o === '*') return `(${exprV(cx, e.a).c} * ${timeV(cx, e.b)})`;
  const r = exprV(cx, e);
  return r.t === 'time' || r.t === 'int' ? (r.p === ATOM ? r.c : `(${r.c})`) : cannot('a time that is not a literal', e);
}

// ------------------------------------------------------------------ expressions
const typeOfTarget = typeOfExpr;
function typeOfExpr(cx, e) {
  if (!e) return null;
  if (e.op === 'ref') return cx.names.get(e.name)?.type || null;
  if (e.op === 'apply' || e.op === 'index') {
    const R = cx.names.get(e.op === 'apply' ? e.name : targetName(e.base))?.type;
    return R?.k === 'array' ? R.elem : R?.k === 'vec' ? { k: 'bit' } : cx.funcs.get(e.name) || null;
  }
  if (e.op === 'slice') { const R = typeOfExpr(cx, e.base); return { k: 'vec', range: { left: e.left, right: e.right, dir: e.dir }, signed: R?.signed, num: R?.num }; }
  return null;
}
/** An expression's width when it is constant (a literal, a slice, a concatenation, a resize…), else null. */
function widthOfExpr(cx, e) {
  switch (e?.op) {
    case 'lit': return e.scalar ? 1 : e.bits.length;
    case 'ref': case 'index': return widthOf(cx, typeOfExpr(cx, e))?.n ?? null;
    case 'apply': {
      if (/^(resize|to_unsigned|to_signed|conv_std_logic_vector)$/.test(e.name)) return intOf(e.args[1]);
      if (CONV_SAME.has(e.name) || e.name === 'signed') return widthOfExpr(cx, e.args[0]);
      return widthOf(cx, typeOfExpr(cx, e))?.n ?? null;
    }
    case 'slice': {
      const l = intOf(e.left), r = intOf(e.right);
      if (l != null && r != null) return Math.abs(l - r) + 1;
      // (x + k downto x)
      const [hi, lo] = e.dir === 'to' ? [e.right, e.left] : [e.left, e.right];
      return hi.op === 'binary' && hi.o === '+' && JSON.stringify(hi.a) === JSON.stringify(lo) && intOf(hi.b) != null ? intOf(hi.b) + 1 : null;
    }
    case 'concat': { const w = e.parts.map(x => widthOfExpr(cx, x)); return w.includes(null) ? null : w.reduce((a, b) => a + b, 0); }
    case 'binary': {
      const a = widthOfExpr(cx, e.a), b = widthOfExpr(cx, e.b);
      if (e.o === '*') return a != null && b != null ? a + b : null;
      return a != null && b != null ? Math.max(a, b) : a ?? b;
    }
    case 'cond': return widthOfExpr(cx, e.then);
  }
  return null;
}
function rangeOfExpr(cx, e, s) {
  const R = typeOfExpr(cx, e);
  if (R?.k === 'vec' && R.range) return R.range;
  if (R?.k === 'array') return R.range;
  return cannot("a 'range of something other than a vector or an array", s);
}
const wrap = (r, p) => (r.p < p ? `(${r.c})` : r.c);
const bitsLit = bits => {
  if (/^[01]+$/.test(bits) && bits.length >= 8 && bits.length % 4 === 0) return `${bits.length}'h${BigInt(`0b${bits}`).toString(16).toUpperCase().padStart(bits.length / 4, '0')}`;
  return `${bits.length}'b${bits}`;
};
const CONV_SAME = new Set(['std_logic_vector', 'unsigned', 'std_ulogic_vector', 'to_stdlogicvector', 'conv_unsigned', 'to_integer', 'conv_integer', 'std_logic', 'std_ulogic', 'to_stdulogic', 'to_bit', 'to_bitvector']);

/** An expression in Verilog: { c: its text, p: its precedence, t: its kind (bool, bit, vec, int, enum, time…) }.
 *  want: the type it is assigned to (an aggregate's width, a sized literal's). */
function exprV(cx, e, want = null) {
  switch (e?.op) {
    case 'int': return { c: e.value, p: ATOM, t: 'int' };
    case 'real': return { c: String(e.value), p: ATOM, t: 'real' };
    case 'str': return { c: JSON.stringify(e.value), p: ATOM, t: 'str' };
    case 'phys': return { c: timeV(cx, e), p: ATOM, t: 'time' };
    case 'lit': return e.scalar ? { c: `1'b${e.bits}`, p: ATOM, t: 'bit' } : { c: bitsLit(e.bits), p: ATOM, t: 'vec' };
    case 'ref': {
      const n = cx.names.get(e.name);
      if (!n) {
        if (e.name === 'true' || e.name === 'false') return { c: e.name === 'true' ? "1'b1" : "1'b0", p: ATOM, t: 'bool' };
        return cannot(`the name '${cx.spell(e.name)}' (not declared in this unit: a package's?)`, e);
      }
      return { c: n.as || outName(cx, e.name), p: ATOM, t: n.type?.k || 'int' };
    }
    case 'apply': return applyV(cx, e, want);
    case 'index': { const b = exprV(cx, e.base); return { c: `${wrap(b, ATOM)}[${exprV(cx, e.index).c}]`, p: ATOM, t: 'bit' }; }
    case 'slice': {
      const b = exprV(cx, e.base);
      // (bounds that move, of a constant width: an indexed part-select, x[lo +: w])
      const w = intOf(e.left) == null && intOf(e.right) == null ? widthOfExpr(cx, e) : null;
      if (w != null) return { c: `${wrap(b, ATOM)}[${exprV(cx, e.dir === 'to' ? e.left : e.right).c} +: ${w}]`, p: ATOM, t: 'vec' };
      return { c: `${wrap(b, ATOM)}[${exprV(cx, e.left).c}:${exprV(cx, e.right).c}]`, p: ATOM, t: 'vec' };
    }
    case 'concat': return { c: `{${e.parts.map(x => sized(cx, x)).join(', ')}}`, p: ATOM, t: 'vec' };
    case 'aggregate': return aggregateV(cx, e, want);
    case 'cond': {
      // (a chain x when c0 else y when c1 else …, each else another, as deep as it is long: in a loop, #3375)
      const chain = [];
      let x = e;
      for (; x.op === 'cond'; x = x.else) chain.push([exprV(cx, x.cond), exprV(cx, x.then, want)]);
      let b = exprV(cx, x, want);
      for (let i = chain.length - 1; i >= 0; i--) { const [c, a] = chain[i]; b = { c: `${wrap(c, 1)} ? ${wrap(a, 1)} : ${wrap(b, 0)}`, p: 0, t: a.t }; }
      return b;
    }
    case 'unary': return unaryV(cx, e);
    case 'binary': return binaryV(cx, e);
    case 'attr': return attrV(cx, e);
    case 'qualified': return exprV(cx, e.expr, want);
    case 'field': return cannot('a record field', e);
  }
  return cannot(`an expression of kind '${e?.op}'`, e);
}
// a part of a concatenation: an operation's result (32 bits with an integer in it) cast to its VHDL width
function sized(cx, x) {
  const r = exprV(cx, x);
  if (x.op !== 'binary' || !/^[-+*/]|mod|rem|sll|srl$/.test(x.o)) return r.c;
  const w = widthOfExpr(cx, x);
  return w == null ? cannot('an operation in a concatenation, of a width not known', x) : `${w}'(${r.c})`;
}
function applyV(cx, e, want) {
  const n = cx.names.get(e.name);
  const args = e.args || [];
  if (n && n.kind !== 'enumlit') {
    if (args.length !== 1) cannot(`'${cx.spell(e.name)}' with ${args.length} indices`, e);
    return { c: `${n.as || outName(cx, e.name)}[${exprV(cx, args[0].named !== undefined ? args[0].value : args[0]).c}]`, p: ATOM, t: n.type.k === 'array' ? n.type.elem.k : 'bit' };
  }
  if (cx.funcs.has(e.name)) return { c: `${outName(cx, e.name)}(${args.map(a => exprV(cx, a).c).join(', ')})`, p: ATOM, t: cx.funcs.get(e.name).k };
  const a = args.map(x => (x.named !== undefined ? x.value : x));
  switch (e.name) {
    case 'signed': return { c: `$signed(${exprV(cx, a[0]).c})`, p: ATOM, t: 'vec' };
    case 'to_unsigned': case 'to_signed': case 'conv_std_logic_vector': {
      const v = intOf(a[0]), w = intOf(a[1]);
      if (v != null && w != null) return { c: v < 0 ? `-${w}'sd${-v}` : `${w}'d${v}`, p: v < 0 ? UNARY : ATOM, t: 'vec' };
      // (its width: a size cast when it is known and not the value's own)
      const x = exprV(cx, a[0]);
      const c = w != null && widthOfExpr(cx, a[0]) !== w ? `${w}'(${x.c})` : null;
      if (e.name === 'to_signed') return { c: `$signed(${c || x.c})`, p: ATOM, t: 'vec' };
      return c ? { c, p: ATOM, t: 'vec' } : { ...x, t: 'vec' };
    }
    case 'resize': {
      const x = exprV(cx, a[0]), from = widthOfExpr(cx, a[0]), to = intOf(a[1]);
      if (from == null || to == null || to === from) return x;
      // narrower: its low bits (a name's slice, else a size cast); wider: zeros (a signed one's sign) on the left
      if (to < from) return a[0].op === 'ref' ? { c: `${x.c}[${to - 1}:0]`, p: ATOM, t: 'vec' } : { c: `${to}'(${x.c})`, p: ATOM, t: 'vec' };
      const fill = typeOfExpr(cx, a[0])?.signed ? (a[0].op === 'ref' ? `${x.c}[${from - 1}]` : cannot('a resize of a signed expression', e)) : "1'b0";
      return { c: `{${to - from === 1 ? fill : `{${to - from}{${fill}}}`}, ${x.c}}`, p: ATOM, t: 'vec' };
    }
    case 'shift_left': case 'shift_right': {
      const x = exprV(cx, a[0]), k = exprV(cx, a[1]);
      const o = e.name === 'shift_left' ? '<<' : typeOfExpr(cx, a[0])?.signed ? '>>>' : '>>';
      return { c: `${wrap(x, PREC[o])} ${o} ${wrap(k, PREC[o] + 1)}`, p: PREC[o], t: 'vec' };
    }
    case 'rising_edge': case 'falling_edge': return cannot(`${e.name}() in this place`, e);
  }
  if (CONV_SAME.has(e.name) && a.length === 1) return exprV(cx, a[0], want);
  return cannot(`the function '${cx.spell(e.name)}' (not declared in this unit)`, e);
}
function aggregateV(cx, e, want) {
  const [first] = e.items;
  const rc = first?.choices?.[0]?.range;
  const others = first?.choices && (first.choices[0] === 'others' || rc);
  if (e.items.length === 1 && others) {
    const R = rc?.of ? typeOfExpr(cx, rc.of) : rc ? { k: 'vec', range: rc } : want;
    const w = widthOf(cx, R);
    const v = exprV(cx, first.value);
    if (!w) return v.c === "1'b0" ? { c: '0', p: ATOM, t: 'vec' } : cannot('an aggregate (others => …) whose width is not known here', e);
    if (w.n != null && v.c === "1'b0") return { c: `${w.n}'d0`, p: ATOM, t: 'vec' };
    return { c: `{${w.c}{${v.c}}}`, p: ATOM, t: 'vec' };
  }
  if (e.items.every(i => !i.choices)) return { c: `{${e.items.map(i => exprV(cx, i.value).c).join(', ')}}`, p: ATOM, t: 'vec' };
  // named choices of single bits (and others): a literal of the target's width
  const w = widthOf(cx, want);
  if (w?.n == null || want.k !== 'vec') return cannot('an aggregate with named choices', e);
  const lo = Math.min(intOf(want.range.left), intOf(want.range.right));
  const bits = Array(w.n).fill(null);
  for (const it of e.items) {
    const v = it.value.op === 'lit' && it.value.scalar ? it.value.bits : cannot('an aggregate with named choices of values that are not literals', e);
    for (const c of it.choices) {
      if (c === 'others') { for (let i = 0; i < w.n; i++) if (bits[i] == null) bits[i] = v; continue; }
      const at = intOf(c);
      if (at == null) cannot('an aggregate with named choices that are not constant', e);
      bits[at - lo] = v;
    }
  }
  if (bits.includes(null)) cannot('an aggregate that does not give every bit', e);
  return { c: bitsLit(bits.reverse().join('')), p: ATOM, t: 'vec' };
}
function unaryV(cx, e) {
  const a = exprV(cx, e.a);
  switch (e.o) {
    case '~': return a.t === 'bool' ? { c: `!${wrap(a, UNARY)}`, p: UNARY, t: 'bool' } : { c: `~${wrap(a, UNARY)}`, p: UNARY, t: a.t };
    case '-': return { c: `-${wrap(a, UNARY)}`, p: UNARY, t: a.t };
    case '+': return a;
    case 'abs': return { c: `(${a.c} < 0 ? -${wrap(a, UNARY)} : ${a.c})`, p: ATOM, t: a.t };
    case '&': case '|': case '^': return { c: `${e.o}${wrap(a, UNARY)}`, p: UNARY, t: 'bit' };
  }
  return cannot(`the operator '${e.o}'`, e);
}
const VOPS = { mod: '%', rem: '%', sll: '<<', srl: '>>', sla: '<<<', sra: '>>>' };
// A chain of binary operators (a + b + c …, its left operands nesting as deep as it is long) in a loop (#3375): each
// operator translates its left operand first, so the deepest one's, then each operator up with the one below it
function binaryV(cx, e) {
  const chain = [e];
  while (chain[chain.length - 1].a?.op === 'binary') chain.push(chain[chain.length - 1].a);
  let a = exprV(cx, chain[chain.length - 1].a);
  for (let i = chain.length - 1; i >= 0; i--) a = binary1V(cx, chain[i], a);
  return a;
}
function binary1V(cx, e, a) {
  let b = exprV(cx, e.b);
  // x = '1' is x, x = '0' is !x (a std_logic in a condition)
  if ((e.o === '==' || e.o === '!=') && a.t === 'bit' && e.b.op === 'lit' && e.b.scalar && /^[01]$/.test(e.b.bits)) {
    return (e.b.bits === '1') === (e.o === '==') ? { ...a, t: 'bool' } : { c: `!${wrap(a, UNARY)}`, p: UNARY, t: 'bool' };
  }
  if (e.o === 'nand' || e.o === 'nor' || e.o === '~^' && a.t !== 'bool') {
    const o = { nand: '&', nor: '|', '~^': '^' }[e.o];
    return { c: `~(${wrap(a, PREC[o])} ${o} ${wrap(b, PREC[o] + 1)})`, p: UNARY, t: a.t };
  }
  if (e.o === 'rol' || e.o === 'ror') return cannot(`the operator ${e.o}`, e);
  const bool = a.t === 'bool' || b.t === 'bool';
  const o = bool && e.o === '&' ? '&&' : bool && e.o === '|' ? '||' : bool && e.o === '~^' ? '==' : VOPS[e.o] || e.o;
  const p = PREC[o];
  if (p == null) return cannot(`the operator '${e.o}'`, e);
  const t = ['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(o) ? 'bool' : a.t === 'int' ? b.t : a.t;
  return { c: `${wrap(a, p)} ${o} ${wrap(b, p + 1)}`, p, t };
}
function attrV(cx, e) {
  const R = e.prefix?.op === 'ref' ? typeOfExpr(cx, e.prefix) : null;
  const range = R?.k === 'vec' || R?.k === 'array' ? R.range : null;
  switch (e.attr) {
    case 'length': { const w = R?.k === 'array' ? widthOf(cx, { k: 'vec', range }) : widthOf(cx, R); if (w) return { c: w.c, p: ATOM, t: 'int' }; break; }
    case 'left': if (range) return exprV(cx, range.left); break;
    case 'right': if (range) return exprV(cx, range.right); break;
    case 'high': if (range) return exprV(cx, range.dir === 'to' ? range.right : range.left); break;
    case 'low': if (range) return exprV(cx, range.dir === 'to' ? range.left : range.right); break;
  }
  return cannot(`the attribute '${e.attr}`, e);
}

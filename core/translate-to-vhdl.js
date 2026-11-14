// Silinx - a Verilog module (as core/verilog/parser.js reads it) written in VHDL (#2693), for the Design pane's read-only
// translation of a Verilog source in a VHDL project (core/translate.js). Its vectors are std_logic_vector, its arithmetic
// numeric_std's (core/translate-vhdl-expr.js); its regs signals, but a reg assigned with = in one always block only and
// used nowhere else, which is that process's variable; an output it reads is an internal signal (VHDL-93 cannot read an
// out port). Always blocks: clocked (one edge), with an asynchronous reset, combinational (their sensitivity list the
// signals they read), a test bench's (delays, events). What has no translation throws Untranslatable (tasks, casez,
// fork, a blocking assignment read again in a clocked block, an expression in a port map…). Isomorphic ES module.
import { at, atLine, cannot, intOf, reservedInVhdl, walk, targetName, indent, ifGenerateBranches } from './translate-util.js';
import { bitLike, exprH, toBool, toInt, toSl, toType, PREC } from './translate-vhdl-expr.js';

/** The generics' defaults: a parameter's default that uses an earlier parameter has that one's default in its place, as
 *  VHDL-93 does not allow a generic's default to use another generic of its entity (LRM 4.3.2.1, #3744). */
function genericDefaults(params) {
  const defs = new Map();
  // (a node is copied only when it uses one)
  const uses = e => { let u = false; walk(e, n => { if (n.op === 'ref' && defs.has(n.name)) u = true; }); return u; };
  const sub = e => !e || typeof e !== 'object' || !uses(e) ? e : Array.isArray(e) ? e.map(sub)
    : e.op === 'ref' ? defs.get(e.name)
      : Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k === 'loc' ? v : sub(v)]));
  for (const p of params) if (p.default) defs.set(p.name, sub(p.default));
  return defs;
}

const stmtsOf = x => (!x ? [] : x.kind === 'block' ? x.stmts : [x]);

/** One Verilog module in VHDL: { text, renamed: [[from, to]] }. modules: the project's Verilog modules (an instance's
 *  ports, by position or direction); unit: the time unit of its delays ('ns' unless a `timescale says otherwise). */
export function moduleToVhdl(mod, { modules = [], unit = 'ns' } = {}) {
  at.line = mod.loc?.line ?? null;
  const cx = { mod, modules, unit, names: new Map(), funcs: new Map(), renamed: [], arrays: [], pvars: new Map(), inits: new Map(), clash: new Map(), extra: [] };
  cx.type = n => cx.names.get(n);
  cx.name = n => cx.names.get(n)?.vhdl ?? cx.funcs.get(n)?.vhdl ?? n;
  cx.func = n => cx.funcs.get(n);
  cx.vname = n => vhdlName(cx, n);
  checkNames(cx, mod);
  const loops = loopVars(mod);
  cx.loops = loops;
  // (a parameter's value is the instance's: a name, never its default folded; a localparam of a literal is its value)
  for (const p of mod.params || []) declare(cx, p.name, p.local ? 'const' : 'param', paramType(cx, p), p.local && p.default?.op === 'int' ? { v: intOf(p.default) } : {});
  for (const p of mod.ports || []) declare(cx, p.name, 'port', typeOf(cx, p.type), { dir: p.dir });
  for (const d of mod.decls || []) {
    if (d.kind === 'signal' && !loops.has(d.name)) declare(cx, d.name, 'signal', typeOf(cx, d.type));
    else if (d.kind === 'const') declare(cx, d.name, 'const', constType(cx, d), d.value?.op === 'int' ? { v: intOf(d.value) } : {});
    else if (d.kind === 'genvar' || d.kind === 'signal') continue;
    else if (d.kind === 'function') functionSig(cx, d);
    else cannot(`a declaration of kind '${d.kind}'`, d);
  }
  const vars = processVariables(cx, mod);
  const readOuts = outputsRead(cx, mod);
  for (const n of readOuts) cx.names.get(n).internal = uniqueName(cx, `${n}_i`);
  foldInitials(cx, mod);
  // the entity
  const defaults = genericDefaults((mod.params || []).filter(p => !p.local));
  const generics = (mod.params || []).filter(p => !p.local).map(p => `${cx.name(p.name)} : ${typeText(cx, cx.type(p.name))} := ${p.default ? toType(exprH(cx, defaults.get(p.name)), cx.type(p.name)).c : '0'}`);
  const ports = (mod.ports || []).map(p => `${cx.name(p.name)} : ${{ in: 'in', out: 'out', inout: 'inout' }[p.dir] || 'in'} ${typeText(cx, cx.type(p.name))}`);
  const name = cx.vname(mod.name);
  const entity = [`entity ${name} is`,
    ...(generics.length ? indent([`generic (`, ...indent(generics.map((g, i) => g + (i < generics.length - 1 ? ';' : ''))), ');']) : []),
    ...(ports.length ? indent([`port (`, ...indent(ports.map((g, i) => g + (i < ports.length - 1 ? ';' : ''))), ');']) : []), `end ${name};`];
  // the architecture: its declarations, then its statements
  for (const n of readOuts) { const T = cx.type(n); cx.names.set(n, { ...T, vhdl: T.internal, kind: 'signal' }); }
  const decls = [];
  for (const p of (mod.params || []).filter(q => q.local)) decls.push(`constant ${cx.name(p.name)} : ${typeText(cx, cx.type(p.name))} := ${toType(exprH(cx, p.default), cx.type(p.name)).c};`);
  for (const d of mod.decls || []) {
    if (d.kind === 'const') decls.push(`constant ${cx.name(d.name)} : ${typeText(cx, cx.type(d.name))} := ${toType(exprH(cx, d.value), cx.type(d.name)).c};`);
    else if (d.kind === 'signal' && cx.names.has(d.name) && !vars.has(d.name)) decls.push(signalDecl(cx, d.name, d.init));
    else if (d.kind === 'function') decls.push(...functionH(cx, d));
  }
  for (const n of readOuts) decls.push(signalDecl(cx, n, (mod.ports.find(p => p.name === n) || {}).default));
  const body = [...readOuts.map(n => `${vhdlName(cx, n)} <= ${cx.name(n)};`), ...(readOuts.length ? [''] : [])];
  for (const it of mod.items || []) {
    const l = itemH(cx, it, vars);
    if (l.length) body.push(...(body.length && body[body.length - 1] !== '' ? [''] : []), ...l);
  }
  const arch = [`architecture Behavioral of ${name} is`, ...indent([...cx.arrays, ...decls, ...cx.extra]), 'begin', ...indent(body), 'end Behavioral;'];
  return { text: ['library IEEE;', 'use IEEE.STD_LOGIC_1164.ALL;', 'use IEEE.NUMERIC_STD.ALL;', '', ...entity, '', ...arch].join('\n'), renamed: cx.renamed };
}

// ------------------------------------------------------------------ names and types
// VHDL tells no letter case apart: two names of a module that differ only in it have no translation
// (an internal name, a reg's, a wire's or an instance's, is renamed; two of the interface have no translation)
function checkNames(cx, mod) {
  const seen = new Map();
  const iface = [mod.name, ...(mod.params || []).map(p => p.name), ...(mod.ports || []).map(p => p.name)];
  const inner = [...(mod.decls || []).map(d => d.name), ...(mod.items || []).filter(i => i.kind === 'instance').map(i => i.name)].filter(Boolean);
  for (const n of [...iface, ...inner]) {
    if (!/^[A-Za-z](_?[A-Za-z0-9])*$/.test(n)) cannot(`the name '${n}' (not a VHDL name)`, mod);
    const l = n.toLowerCase();
    if (seen.has(l) && seen.get(l) !== n) {
      if (iface.includes(n)) cannot(`the names '${seen.get(l)}' and '${n}' (VHDL does not tell letter case apart)`, mod);
      let m = `${n}_2`;
      for (let i = 3; seen.has(m.toLowerCase()); i++) m = `${n}_${i}`;
      cx.clash.set(n, m);
      cx.renamed.push([n, m]);
      seen.set(m.toLowerCase(), m);
      continue;
    }
    seen.set(l, n);
  }
}
function vhdlName(cx, n) {
  if (cx.clash.has(n)) return cx.clash.get(n);
  if (!reservedInVhdl(n)) return n;
  if (!cx.renamed.some(([a]) => a === n)) cx.renamed.push([n, `${n}_v`]);
  return `${n}_v`;
}
function declare(cx, name, kind, T, more = {}) {
  cx.names.set(name, { ...T, kind, vhdl: vhdlName(cx, name), ...more });
}
function uniqueName(cx, n) {
  let m = n;
  for (let i = 2; [...cx.names.values()].some(e => e.vhdl.toLowerCase() === m.toLowerCase()); i++) m = `${n}${i}`;
  return m;
}
// a Verilog type: { t: sl | slv | sgn | int | real | array, w: its width when constant, range, asc, lsb, elem }
function typeOf(cx, t) {
  if (!t || t.kind === 'logic') {
    if (!t?.range) return { t: 'sl', w: 1 };
    const l = intOf(t.range.left), r = intOf(t.range.right);
    return { t: t.signed ? 'sgn' : 'slv', w: l != null && r != null ? Math.abs(l - r) + 1 : null, wc: widthText(cx, t.range), range: t.range, asc: l != null && r != null && l < r, lsb: l != null && r != null && l >= r ? r : null };
  }
  if (t.kind === 'integer') return { t: 'int' };
  if (t.kind === 'real') return { t: 'real' };
  if (t.kind === 'array') {
    const elem = typeOf(cx, t.elem);
    if (elem.t === 'array') cannot('a memory of more than one dimension', t);
    return { t: 'array', range: t.range, elem };
  }
  return cannot(`a type of kind '${t.kind}'`, t);
}
function paramType(cx, p) {
  if (p.type?.range) return typeOf(cx, p.type);
  if (p.default?.op === 'str') return { t: 'str' };
  if (p.default?.op === 'real') return { t: 'real' };
  return { t: 'int' };
}
// a localparam: of its range, else a vector of its sized literal's width, else an integer
function constType(cx, d) {
  if (d.type?.range) return typeOf(cx, d.type);
  if (d.value?.op === 'lit' && d.value.sized !== false && d.value.bits.length === 1) return { t: 'sl', w: 1 };
  if (d.value?.op === 'lit' && d.value.sized !== false) return { t: 'slv', w: d.value.bits.length, range: { left: { op: 'int', value: String(d.value.bits.length - 1) }, right: { op: 'int', value: '0' } }, lsb: 0 };
  return paramType(cx, { default: d.value });
}
const constH = (cx, e) => toInt(exprH(cx, e)).c;
function widthText(cx, range) {
  const l = intOf(range.left), r = intOf(range.right);
  if (l != null && r != null) return String(Math.abs(l - r) + 1);
  if (intOf(range.right) === 0 && range.left.op === 'binary' && range.left.o === '-' && intOf(range.left.b) === 1) return constH(cx, range.left.a);
  return `${constH(cx, range.left)} - ${constH(cx, range.right)} + 1`;
}
const rangeText = (cx, T) => `${constH(cx, T.range.left)} ${T.asc ? 'to' : 'downto'} ${constH(cx, T.range.right)}`;
function typeText(cx, T, name) {
  switch (T.t) {
    case 'sl': return 'std_logic';
    case 'slv': return `std_logic_vector(${rangeText(cx, T)})`;
    case 'sgn': return `signed(${rangeText(cx, T)})`;
    case 'int': return 'integer';
    case 'real': return 'real';
    case 'str': return 'string';
    case 'array': {
      const tn = `${name}_t`;
      const l = intOf(T.range.left), r = intOf(T.range.right);
      cx.arrays.push(`type ${tn} is array (${constH(cx, T.range.left)} ${l != null && r != null && l > r ? 'downto' : 'to'} ${constH(cx, T.range.right)}) of ${typeText(cx, T.elem)};`);
      return tn;
    }
  }
  return cannot(`a signal of type ${T.t}`);
}
function signalDecl(cx, n, init) {
  const T = cx.type(n);
  const v = cx.inits.get(n) ?? init;
  return `signal ${cx.name(n)} : ${typeText(cx, T, cx.name(n))}${v && T.t !== 'array' ? ` := ${toType(exprH(cx, v), T).c}` : ''};`;
}

// ------------------------------------------------------------------ analysis
// the integers of for loops (VHDL declares a loop's variable itself)
// (the others, of a loop of another form or used after it, stay declared: their loops are while loops)
function loopVars(mod) {
  const vars = new Set(), kept = new Set();
  walk([mod.items, (mod.decls || []).filter(d => d.kind === 'function')], n => {
    if (n.kind !== 'for' || n.init?.target?.op !== 'ref') return;
    (simpleFor(n) ? vars : kept).add(n.init.target.name);
  });
  for (const v of vars) walkOutside([mod.items, (mod.decls || []).filter(d => d.kind === 'function')], v, () => kept.add(v));
  for (const v of kept) vars.delete(v);
  return vars;
}
// for (i = a; i < b; i = i + 1), and its other comparisons and i = i - 1
function simpleFor(n) {
  const v = n.init.target.name;
  const c = n.cond, s = n.step?.kind === 'assign' && n.step.target.op === 'ref' && n.step.target.name === v ? n.step.value : null;
  return c?.op === 'binary' && ['<', '<=', '>', '>='].includes(c.o) && c.a.op === 'ref' && c.a.name === v && !refersTo(c.b, v)
    && s?.op === 'binary' && (s.o === '+' || s.o === '-') && s.a.op === 'ref' && s.a.name === v && intOf(s.b) === 1 && !refersTo(n.init.value, v);
}
function refersTo(e, v) { let r = false; walk(e, n => { if (n.op === 'ref' && n.name === v) r = true; }); return r; }
function walkOutside(node, v, found) {
  if (Array.isArray(node)) { node.forEach(n => walkOutside(n, v, found)); return; }
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'for' && node.init?.target?.name === v) return;
  if (node.op === 'ref' && node.name === v) found();
  for (const [k, x] of Object.entries(node)) if (k !== 'loc' && x && typeof x === 'object') walkOutside(x, v, found);
}
// a reg assigned with = in one always block only and named nowhere else: that process's variable
function processVariables(cx, mod) {
  const where = new Map(), nonblocking = new Set();
  const note = (n, i) => { if (!where.has(n)) where.set(n, new Set()); where.get(n).add(i); };
  (mod.items || []).forEach((it, i) => walk(it, n => {
    if (n.op === 'ref') note(n.name, i);
    if (n.kind === 'assign' && n.nonblocking) nonblocking.add(targetName(n.target));
  }));
  const vars = new Map();
  for (const [n, at] of where) {
    const T = cx.type(n);
    if (!T || T.kind !== 'signal' || nonblocking.has(n) || at.size !== 1) continue;
    const i = [...at][0];
    if (mod.items[i].kind !== 'process') continue;
    let assigned = false;
    walk(mod.items[i], x => { if (x.kind === 'assign' && targetName(x.target) === n) assigned = true; });
    if (!assigned) continue;
    vars.set(n, mod.items[i]);
    if (!cx.pvars.has(mod.items[i])) cx.pvars.set(mod.items[i], []);
    cx.pvars.get(mod.items[i]).push(n);
  }
  return vars;
}
// the output ports the module reads (VHDL-93 cannot read an out port: an internal signal, the port given its value)
function outputsRead(cx, mod) {
  const outs = new Set((mod.ports || []).filter(p => p.dir === 'out').map(p => p.name));
  const writes = new Set();
  walk(mod.items, n => {
    if (n.kind === 'assign') { let t = n.target; while (t && t.op !== 'ref') t = t.base; if (t) writes.add(t); }
    if (n.kind === 'instance') {
      const m = cx.modules.find(x => x.name === n.module);
      n.conns.forEach((c, i) => {
        const port = c.port ? m?.ports.find(p => p.name === c.port) : m?.ports[i];
        if (port?.dir === 'out' && c.expr?.op === 'ref') writes.add(c.expr);
      });
    }
  });
  const read = new Set();
  walk(mod.items, n => { if (n.op === 'ref' && outs.has(n.name) && !writes.has(n)) read.add(n.name); });
  return [...read];
}
// an initial block of constant assignments only: the regs' initial values
function foldInitials(cx, mod) {
  for (const it of mod.items || []) {
    if (it.kind !== 'process' || !it.initial) continue;
    const s = it.body.flatMap(stmtsOf);
    if (s.every(x => x.kind === 'assign' && x.target.op === 'ref' && (x.value.op === 'int' || x.value.op === 'lit'))) {
      for (const x of s) cx.inits.set(x.target.name, x.value);
      it.folded = true;
    }
  }
}

// ------------------------------------------------------------------ functions
function functionSig(cx, f) {
  if (!f.retVar) cannot(`the function ${f.name}`, f);
  const ret = f.returnType ? typeOf(cx, f.returnType) : { t: 'sl', w: 1 };
  cx.funcs.set(f.name, { ret, params: (f.params || []).map(p => typeOf(cx, p.type)), vhdl: vhdlName(cx, f.name) });
}
function functionH(cx, f) {
  const F = cx.funcs.get(f.name);
  const saved = new Map(cx.names);
  // (an input the body assigns: VHDL's parameters are constants, a variable of its name takes its value)
  const assigned = new Set();
  walk(f.body, n => { if (n.kind === 'assign') assigned.add(targetName(n.target)); });
  const copies = [];
  const params = (f.params || []).map((p, i) => {
    declare(cx, p.name, assigned.has(p.name) ? 'var' : 'param', F.params[i]);
    if (!assigned.has(p.name)) return `${cx.name(p.name)} : ${typeText(cx, F.params[i])}`;
    copies.push(`variable ${cx.name(p.name)} : ${typeText(cx, F.params[i])} := ${cx.name(p.name)}_in;`);
    return `${cx.name(p.name)}_in : ${typeText(cx, F.params[i])}`;
  });
  declare(cx, f.retVar, 'var', F.ret, { vhdl: 'result' });
  cx.names.get(f.retVar).vhdl = 'result';
  const locals = (f.decls || []).filter(d => !cx.loops.has(d.name)).map(d => {
    if (d.kind !== 'signal') cannot(`a declaration of kind '${d.kind}' in a function`, d);
    declare(cx, d.name, 'var', typeOf(cx, d.type));
    return `variable ${cx.name(d.name)} : ${typeText(cx, cx.type(d.name))};`;
  });
  const o = { mode: 'func', vars: new Set([f.retVar, ...(f.decls || []).map(d => d.name), ...[...assigned].filter(n => f.params.some(p => p.name === n))]) };
  const body = stmtsH(cx, f.body, o);
  cx.names = saved;
  // (its result a type mark: VHDL's return takes no constraint)
  const mark = { sl: 'std_logic', slv: 'std_logic_vector', sgn: 'signed', int: 'integer', real: 'real' }[F.ret.t] || cannot(`the function ${f.name} (its result's type)`, f);
  return [`function ${F.vhdl} (${params.join('; ')}) return ${mark} is`, ...indent([...copies, `variable result : ${typeText(cx, F.ret)};`, ...locals]),
    'begin', ...indent([...body, 'return result;']), 'end function;'];
}

// ------------------------------------------------------------------ concurrent statements
function itemH(cx, it, vars) {
  atLine(it);
  switch (it.kind) {
    case 'assign': return hoisting(cx, targetName(it.target) || 'expr', () => assignH(cx, it.target, it.value, { mode: 'concurrent', vars: new Set() }));
    case 'process': return it.folded ? [] : processH(cx, it, vars);
    case 'instance': return instanceH(cx, it);
    case 'generate_for': return generateForH(cx, it, vars);
    case 'generate_if': return generateIfH(cx, it, vars);
  }
  return cannot(`a module item of kind '${it.kind}'`, it);
}
// a concurrent statement whose expressions need signals of their own (a ?: inside an expression, an expression in a port
// map): those signals declared, their assignments before the statement
function hoisting(cx, base, f) {
  const before = [], done = new Map();
  const saved = cx.hoist;
  // (each ?: once: a port's expression is read twice, for its width and for its signal)
  cx.hoist = e => {
    if (done.has(e)) return exprH(cx, { op: 'ref', name: done.get(e) });
    const a = exprH(cx, e.then), b = exprH(cx, e.else);
    const w = bitLike(a) && bitLike(b) ? 1 : Math.max(a.t === 'int' ? 0 : a.w ?? 0, b.t === 'int' ? 0 : b.w ?? 0);
    if (!w) cannot('a ?: inside an expression, of a width not known', e);
    done.set(e, intermediate(cx, `${base}_sel`, w === 1 && bitLike(a) ? { t: 'sl', w: 1 } : vecType(w), e, before));
    return exprH(cx, { op: 'ref', name: done.get(e) });
  };
  try { const l = f(before); return [...before, ...l]; } finally { cx.hoist = saved; }
}
const vecType = w => ({ t: 'slv', w, range: { left: { op: 'int', value: String(w - 1) }, right: { op: 'int', value: '0' } }, lsb: 0 });
function intermediate(cx, base, T, value, before) {
  const name = uniqueName(cx, base);
  declare(cx, name, 'signal', T, { vhdl: name });
  cx.extra.push(`signal ${name} : ${typeText(cx, T)};`);
  before.push(...assignH(cx, { op: 'ref', name }, value, { mode: 'concurrent', vars: new Set() }));
  return name;
}
function instanceH(cx, it) {
  return hoisting(cx, it.name, before => instanceConns(cx, it, before));
}
function instanceConns(cx, it, before) {
  const m = cx.modules.find(x => x.name === it.module);
  const params = (it.params || []).map((p, i) => {
    const n = p.name ?? m?.params.filter(q => !q.local)[i]?.name ?? cannot(`the parameters of '${it.name}' given by position (the module '${it.module}' is not in the project)`, it);
    return `${n} => ${exprH(cx, p.value).c}`;
  });
  const conns = (it.conns || []).map((c, i) => {
    const n = c.port ?? m?.ports[i]?.name ?? cannot(`the ports of '${it.name}' connected by position (the module '${it.module}' is not in the project)`, it);
    if (!c.expr) return `${n} => open`;
    const port = m?.ports.find(p => p.name === n);
    let r = exprH(cx, c.expr);
    // (an expression given to an input: a signal of its own; VHDL-93 connects names only)
    if (!r.name && r.t !== 'lit' && r.t !== 'int') {
      if (port && port.dir !== 'in') cannot(`an expression connected to the output '${n}' of '${it.name}'`, it);
      const PT = port ? typeOf(cx, port.type) : null;
      const T = PT && (PT.t === 'sl' || PT.w != null) ? PT : r.t === 'sl' ? { t: 'sl', w: 1 } : r.w != null ? vecType(r.w) : cannot(`the expression connected to the port '${n}' of '${it.name}' (its width is not known)`, it);
      r = exprH(cx, { op: 'ref', name: intermediate(cx, `${it.name}_${n}`, T.t === 'sl' ? T : vecType(T.w), c.expr, before) });
    }
    return `${n} => ${r.t === 'lit' || r.t === 'int' ? toType(r, port ? typeOf(cx, port.type) : { t: r.w === 1 ? 'sl' : 'slv', w: r.w }).c : r.c}`;
  });
  return [`${cx.vname(it.name)}: entity work.${it.module}`, ...indent([
    ...(params.length ? [`generic map (${params.join(', ')})`] : []),
    `port map (`, ...indent(conns.map((c, i) => c + (i < conns.length - 1 ? ',' : ''))), ');'])];
}
function forRange(cx, init, cond, step, what) {
  const from = exprH(cx, init.value ?? init);
  const up = step?.op === 'binary' && step.o === '+' && intOf(step.b) === 1;
  const down = step?.op === 'binary' && step.o === '-' && intOf(step.b) === 1;
  if (!(up || down) || cond?.op !== 'binary') cannot(`a ${what} loop of another form than (i = a; i < b; i = i + 1)`, cond);
  const b = toInt(exprH(cx, cond.b));
  const off = { '<': -1, '<=': 0, '>': 1, '>=': 0 }[cond.o];
  if (off == null || (up && off > 0) || (down && off < 0)) cannot(`a ${what} loop of another form than (i = a; i < b; i = i + 1)`, cond);
  const to = !off ? b.c : b.v != null ? String(b.v + off) : `${b.c} ${off < 0 ? '-' : '+'} 1`;
  return `${toInt(from).c} ${up ? 'to' : 'downto'} ${to}`;
}
function generateForH(cx, g, vars) {
  declare(cx, g.var, 'loop', { t: 'int' });
  const r = forRange(cx, { value: g.init }, g.cond, g.step, 'generate');
  const decls = (g.decls || []).map(d => { declare(cx, d.name, 'signal', typeOf(cx, d.type)); return signalDecl(cx, d.name, d.init); });
  const items = (g.items || []).flatMap(i => itemH(cx, i, vars));
  return [`${cx.vname(g.label || `gen_${g.var}`)}: for ${cx.name(g.var)} in ${r} generate`, ...(decls.length ? [...indent(decls), 'begin'] : []), ...indent(items), 'end generate;'];
}
// an if generate, else if branches and else included (#3501): VHDL-93 has neither elsif nor else generates (XST
// takes VHDL-93), so each branch is an if generate of its own, on its condition and the earlier ones' negated; its
// label the branch's own (Verilog's), else the first one's numbered, `_else` for the else. A chain of more than
// LONG_CHAIN branches (#3500): the earlier ones' negation, which grows with each branch (the text quadratic in their
// number), is a constant of a block around them, each one's from the one before (<label>_none_<k>: no branch up to k)
const LONG_CHAIN = 16;
function generateIfH(cx, g, vars) {
  const base = cx.vname(g.label || 'gen_if'), used = new Set([base.toLowerCase()]), earlier = [];
  const branches = ifGenerateBranches(g), long = branches.length > LONG_CHAIN, consts = [];
  const none = k => `${base}_none_${k}`;
  const gens = branches.flatMap((b, k) => {
    atLine(b);
    const c = b.cond ? toBool(exprH(cx, b.cond)).c : null;
    let cond;
    if (long) {
      cond = k ? (c ? `${none(k - 1)} and (${c})` : none(k - 1)) : c ?? 'true';
      if (c) consts.push(`constant ${none(k)} : boolean := ${k ? `${none(k - 1)} and not (${c})` : `not (${c})`};`);
    } else {
      const terms = [...earlier.map(e => `not (${e})`), ...(c ? [earlier.length ? `(${c})` : c] : [])];
      if (c) earlier.push(c);
      cond = terms.length ? terms.join(' and ') : 'true';
    }
    let label = k && b.label ? cx.vname(b.label) : null;
    if (!k) label = base;
    else if (!label || used.has(label.toLowerCase())) label = c ? `${base}_${k + 1}` : `${base}_else`;
    used.add(label.toLowerCase());
    const decls = b.decls.map(d => { declare(cx, d.name, 'signal', typeOf(cx, d.type)); return signalDecl(cx, d.name, d.init); });
    const items = b.items.flatMap(i => itemH(cx, i, vars));
    return [`${label}: if ${cond} generate`, ...(decls.length ? [...indent(decls), 'begin'] : []), ...indent(items), 'end generate;'];
  });
  return long ? [`${base}_chain: block`, ...indent(consts), 'begin', ...indent(gens), `end block ${base}_chain;`] : gens;
}

// an always block: clocked (one edge), with an asynchronous reset (two), combinational, or a test bench's
function processH(cx, p) {
  const vars = new Set(cx.pvars.get(p) || []);
  const vdecls = [...vars].map(n => `variable ${cx.name(n)} : ${typeText(cx, cx.type(n))}${cx.inits.get(n) || initOf(cx, n) ? ` := ${toType(exprH(cx, cx.inits.get(n) || initOf(cx, n)), cx.type(n)).c}` : ''};`);
  const proc = (sens, body) => [`process${sens ? ` (${sens})` : ''}`, ...indent(vdecls), 'begin', ...indent(body), 'end process;'];
  const edges = Array.isArray(p.sens) ? p.sens.filter(s => s.edge === 'pos' || s.edge === 'neg') : [];
  if (p.initial || !p.sens) {
    const o = { mode: 'tb', vars };
    const body = stmtsH(cx, p.body, o);
    let timed = false;
    walk(p.body, n => { if (n.kind === 'delay' || n.kind === 'event' || n.kind === 'wait') timed = true; });
    if (!p.initial && !timed) cannot('an always block with neither a sensitivity list nor a delay', p);
    return proc(null, p.initial ? [...body, 'wait;'] : body);
  }
  if (!edges.length) {
    const o = { mode: 'comb', vars };
    return proc(readSet(cx, p.body, vars).join(', ') || null, [...stmtsH(cx, p.body, o), ...(readSet(cx, p.body, vars).length ? [] : ['wait;'])]);
  }
  if (edges.length !== p.sens.length) cannot('an always block on both edges and levels', p);
  const o = { mode: 'clocked', vars };
  blockingReadBack(cx, p, vars);
  const edge = s => `${s.edge === 'pos' ? 'rising' : 'falling'}_edge(${exprH(cx, s.expr).c})`;
  if (edges.length === 1) return proc(exprH(cx, edges[0].expr).c, [`if ${edge(edges[0])} then`, ...indent(stmtsH(cx, p.body, o)), 'end if;']);
  const [s] = p.body.flatMap(stmtsOf);
  const rst = p.body.flatMap(stmtsOf).length === 1 && s.kind === 'if' ? resetOf(s.cond) : null;
  const re = rst && edges.find(x => x.expr.op === 'ref' && x.expr.name === rst.name);
  const clk = re && edges.length === 2 && edges.find(x => x !== re);
  if (!clk || (re.edge === 'pos') !== rst.high) cannot('an always block on two edges that is not a clock with an asynchronous reset (if (rst) … else …)', p);
  return proc(`${exprH(cx, clk.expr).c}, ${exprH(cx, re.expr).c}`, [`if ${exprH(cx, re.expr).c} = '${rst.high ? 1 : 0}' then`, ...indent(stmtsH(cx, stmtsOf(s.then), o)),
    `elsif ${edge(clk)} then`, ...indent(stmtsH(cx, stmtsOf(s.else), o)), 'end if;']);
}
const initOf = (cx, n) => (cx.mod.decls || []).find(d => d.name === n)?.init;
function resetOf(c) {
  if (c?.op === 'ref') return { name: c.name, high: true };
  if (c?.op === 'unary' && (c.o === '!' || c.o === '~') && c.a.op === 'ref') return { name: c.a.name, high: false };
  if (c?.op === 'binary' && (c.o === '==' || c.o === '!=') && c.a.op === 'ref' && /^[01]$/.test(String(intOf(c.b)))) return { name: c.a.name, high: (intOf(c.b) === 1) === (c.o === '==') };
  return null;
}
// a signal assigned with = in a clocked block and read in it again: a value VHDL's signal would not have yet
function blockingReadBack(cx, p, vars) {
  const blocking = new Set();
  walk(p.body, n => { if (n.kind === 'assign' && !n.nonblocking) { const t = targetName(n.target); if (t && !vars.has(t) && !cx.loops.has(t)) blocking.add(t); } });
  if (!blocking.size) return;
  const targets = new Set();
  walk(p.body, n => { if (n.kind === 'assign' && n.target.op === 'ref') targets.add(n.target); });
  walk(p.body, n => { if (n.op === 'ref' && blocking.has(n.name) && !targets.has(n)) cannot(`'${n.name}' assigned with = and read again in its clocked always block`, p); });
}
// the signals a combinational block reads: its sensitivity list
function readSet(cx, body, vars) {
  const out = [], targets = new Set();
  walk(body, n => { if (n.kind === 'assign') { let t = n.target; while (t && t.op !== 'ref') t = t.base; if (t) targets.add(t); } });
  walk(body, n => {
    if (n.op !== 'ref' || targets.has(n) || vars.has(n.name)) return;
    const T = cx.type(n.name);
    if (T && (T.kind === 'signal' || T.kind === 'port') && !out.includes(cx.name(n.name))) out.push(cx.name(n.name));
  });
  return out;
}

// ------------------------------------------------------------------ sequential statements
function stmtsH(cx, list, o) { return list.flatMap(s => stmtH(cx, s, o)); }
function targetType(cx, t) {
  if (t.op === 'ref') return cx.type(t.name) || cannot(`the name '${t.name}' (not declared in this module)`, t);
  if (t.op === 'index') { const T = targetType(cx, t.base); return T.t === 'array' ? T.elem : { t: 'sl', w: 1 }; }
  if (t.op === 'slice' || t.op === 'pslice') {
    const w = t.op === 'pslice' ? intOf(t.width) : intOf(t.left) != null && intOf(t.right) != null ? Math.abs(intOf(t.left) - intOf(t.right)) + 1 : null;
    return { t: 'slv', w };
  }
  return cannot('an assignment to a concatenation', t);
}
/** An assignment, of a value VHDL writes as a statement when it is a condition (?:, a comparison given to a bit). */
function assignH(cx, target, value, o) {
  const T = targetType(cx, target);
  const tc = exprH(cx, target).c;
  const op = o.vars.has(targetName(target)) ? ':=' : '<=';
  const val = v => {
    const r = exprH(cx, v, T.w);
    if (r.t === 'bool') return T.t === 'sl' ? null : cannot('a condition given to a vector', v);
    return toType(r, T).c;
  };
  if (o.mode === 'concurrent') {
    const parts = [];
    let v = value;
    for (; v.op === 'cond'; v = v.else) {
      if (v.then.op === 'cond') cannot('a ?: in the true branch of another', v);
      const t = val(v.then);
      if (t == null) cannot('a condition in a ?: branch', v);
      parts.push(`${t} when ${toBool(exprH(cx, v.cond)).c} else`);
    }
    const last = val(v);
    if (last == null) return [`${tc} <= '1' when ${exprH(cx, v).c} else '0';`];
    return [`${tc} <= ${[...parts, last].join(' ')};`];
  }
  if (value.op === 'cond') {
    return [`if ${toBool(exprH(cx, value.cond)).c} then`, ...indent(assignH(cx, target, value.then, o)), 'else', ...indent(assignH(cx, target, value.else, o)), 'end if;'];
  }
  const v = val(value);
  if (v == null) return [`if ${exprH(cx, value).c} then`, `    ${tc} ${op} '1';`, 'else', `    ${tc} ${op} '0';`, 'end if;'];
  return [`${tc} ${op} ${v};`];
}
function stmtH(cx, s, o) {
  atLine(s);
  switch (s.kind) {
    case 'block': if (s.decls?.length) cannot('a named block with declarations', s); return stmtsH(cx, s.stmts, o);
    case 'null': return ['null;'];
    case 'assign':
      if (s.delay) cannot('an assignment with an intra-assignment delay', s);
      return assignH(cx, s.target, s.value, o);
    case 'if': {
      const out = [];
      for (let cur = s, kw = 'if'; cur; kw = 'elsif') {
        out.push(`${kw} ${toBool(exprH(cx, cur.cond)).c} then`, ...indent(stmtsH(cx, stmtsOf(cur.then), o)));
        if (cur.else?.kind === 'if') { cur = cur.else; continue; }
        if (cur.else) out.push('else', ...indent(stmtsH(cx, stmtsOf(cur.else), o)));
        break;
      }
      return [...out, 'end if;'];
    }
    case 'case': return caseH(cx, s, o);
    case 'for': {
      if (s.init?.kind !== 'assign' || s.init.target.op !== 'ref') cannot('a for loop of another form than (i = a; i < b; i = i + 1)', s);
      const v = s.init.target.name;
      if (!cx.loops.has(v)) {
        if (!o.vars.has(v)) cannot(`a loop over '${v}', a signal (not a variable of its always block)`, s);
        return [...stmtH(cx, s.init, o), `while ${toBool(exprH(cx, s.cond)).c} loop`, ...indent([...stmtsH(cx, stmtsOf(s.body), o), ...stmtH(cx, s.step, o)]), 'end loop;'];
      }
      declare(cx, v, 'loop', { t: 'int' });
      const step = s.step?.kind === 'assign' ? s.step.value : null;
      const r = forRange(cx, { op: 'ref', name: v, value: s.init.value }, s.cond, step, 'for');
      const body = stmtsH(cx, stmtsOf(s.body), o);
      return [`for ${cx.name(v)} in ${r} loop`, ...indent(body), 'end loop;'];
    }
    case 'while': return [`while ${toBool(exprH(cx, s.cond)).c} loop`, ...indent(stmtsH(cx, stmtsOf(s.body), o)), 'end loop;'];
    case 'repeat': return [`for rep_i in 1 to ${toInt(exprH(cx, s.count)).c} loop`, ...indent(stmtsH(cx, stmtsOf(s.body), o)), 'end loop;'];
    case 'forever': return ['loop', ...indent(stmtsH(cx, stmtsOf(s.body), o)), 'end loop;'];
    case 'delay': {
      if (o.mode !== 'tb') cannot('a delay in a synthesizable always block', s);
      const a = exprH(cx, s.amount);
      const t = a.t === 'int' && a.v != null ? `${a.v} ${cx.unit}` : a.t === 'real' ? `${a.c} ${cx.unit}` : `${a.p < PREC.mul ? `(${a.c})` : a.c} * 1 ${cx.unit}`;
      return [`wait for ${t};`, ...(s.stmt ? stmtH(cx, s.stmt, o) : [])];
    }
    case 'event': {
      if (o.mode !== 'tb') cannot('an event control inside an always block', s);
      const ev = s.events || [];
      const w = ev.length === 1 && ev[0].edge !== 'any' ? `wait until ${ev[0].edge === 'pos' ? 'rising' : 'falling'}_edge(${exprH(cx, ev[0].expr).c});`
        : ev.every(x => x.edge === 'any') && ev.length ? `wait on ${ev.map(x => exprH(cx, x.expr).c).join(', ')};` : cannot('this event control', s);
      return [w, ...(s.stmt ? stmtH(cx, s.stmt, o) : [])];
    }
    case 'wait': {
      const c = toBool(exprH(cx, s.cond)).c;
      return [`if not (${c}) then`, `    wait until ${c};`, 'end if;', ...(s.stmt ? stmtH(cx, s.stmt, o) : [])];
    }
    case 'call': return callStmtH(cx, s);
  }
  return cannot(`a statement of kind '${s.kind}'`, s);
}
function caseH(cx, s, o) {
  if (s.variant && s.variant !== 'case') {
    let wild = false;
    walk(s.items.map(i => i.choices), n => { if (n.op === 'lit' && /[xz?]/.test(n.bits)) wild = true; });
    if (wild) cannot(`a ${s.variant} with don't-care bits`, s);
  }
  const sel = exprH(cx, s.expr);
  // choices of integers (localparams of no width): the selector as an integer
  const byInt = sel.t === 'int' || s.items.some(i => i.choices.some(c => exprH(cx, c).t === 'int' && c.op !== 'int'));
  const T = byInt ? { t: 'int' } : sel.t === 'sl' ? { t: 'sl', w: 1 } : { t: 'slv', w: sel.w };
  const selC = byInt ? toInt(sel).c : sel.t === 'uns' || sel.t === 'sgn' ? `std_logic_vector(${sel.c})` : sel.concat ? `std_logic_vector'(${sel.c})` : sel.c;
  if (!byInt && T.t === 'slv' && T.w == null) cannot('a case on a vector of a width not known', s);
  const out = [`case ${selC} is`];
  for (const it of s.items) out.push(...indent([`when ${it.choices.map(c => toType(exprH(cx, c), T).c).join(' | ')} =>`, ...indent(stmtsH(cx, stmtsOf(it.body), o))]));
  out.push(...indent(['when others =>', ...indent(s.default ? stmtsH(cx, stmtsOf(s.default), o) : ['null;'])]));
  return [...out, 'end case;'];
}
function callStmtH(cx, s) {
  switch (s.name) {
    case '$finish': case '$stop': return ['std.env.finish;'];
    case '$display': case '$write': return [`report ${messageH(cx, s.args || [], s)};`];
  }
  return cannot(`the call of ${s.name}`, s);
}
// $display's format and arguments as a report's message: %d (integers), %b of a bit, %s, %t, %%
function messageH(cx, args, s) {
  if (!args.length) return '""';
  if (args[0].op !== 'str') cannot('a $display that does not start with a string', s);
  const parts = [];
  let rest = args.slice(1), lit = '';
  const fmt = args[0].value;
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] !== '%') { lit += fmt[i]; continue; }
    const m = /^%0?([dbst%])/i.exec(fmt.slice(i)) || cannot(`the format ${fmt.slice(i, i + 3)} of a $display`, s);
    i += m[0].length - 1;
    if (m[1] === '%') { lit += '%'; continue; }
    if (lit) parts.push(`"${lit.replace(/"/g, '""')}"`);
    lit = '';
    const [a, ...more] = rest;
    rest = more;
    if (!a && m[1] !== 't') cannot('a $display with fewer arguments than its format', s);
    const r = m[1] === 't' ? null : exprH(cx, a);
    if (m[1] === 'd') parts.push(`integer'image(${toInt(r).c})`);
    else if (m[1] === 'b') parts.push(r.t === 'sl' || r.t === 'lit' && r.w === 1 ? `std_logic'image(${toSl(r).c})` : cannot('%b of a vector in a $display', s));
    else if (m[1] === 's') parts.push(r.t === 'str' ? r.c : cannot('%s of something other than a string', s));
    else parts.push('time\'image(now)');
  }
  if (lit || !parts.length) parts.push(`"${lit.replace(/"/g, '""')}"`);
  return parts.join(' & ');
}

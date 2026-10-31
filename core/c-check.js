// Silinx HLS (docs/c-to-hdl.md, #1524): the checks of a parsed C source: names and calls, the top function, and
// what can be synthesized (UG1399's rules: the whole functionality in the top function and what it calls, no
// system calls, fixed or bounded sizes, unambiguous constructs, no visible undefined behaviour).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   checkC(source, file) -> { ast, top, funcs, consts, loops, diagnostics, ok }
//     top:         the top function's name (#pragma HLS TOP name=, else the file's last function other than main)
//     funcs:       Map name -> Func, the functions defined
//     consts:      Map name -> BigInt, the global constant integers
//     loops:       [{ loc, trip }]: each loop of the synthesized code, its trip count (a constant, or a
//                  LOOP_TRIPCOUNT max), null when it has none
//     diagnostics: [{ file, line, col, message, severity: 'error' | 'warning' }], in the order of the source
//     ok:          no error
// The synthesized code is the top function and the functions it calls; main() and what only it calls are the
// test bench, checked for names and calls only.
import { pointerArithmetic, pointerVariables } from './c-pointer.js';
import { pointerToPointer, pointerArgsMoved } from './c-pointer-args.js';
import { parse, parseExpression } from './c-parse.js';
import { checkPragmas, tripcountArgs } from './c-pragma.js';
import { MATH, BITCASTS } from './c-float.js';
import { Q_MODES, O_MODES } from './c-fixed.js';

// the library calls Silinx HLS refuses in synthesized code (UG1399: no system calls), and the ones it ignores there
const REFUSED = new Set(['malloc', 'calloc', 'realloc', 'free', 'exit', 'abort', 'rand', 'srand', 'time', 'clock', 'fopen', 'fclose',
  'fread', 'fwrite', 'fgets', 'fscanf', 'scanf', 'getchar', 'system', 'memcpy', 'memset', 'strlen', 'strcpy']);
const IGNORED = new Set(['printf', 'fprintf', 'puts', 'putchar']);
const STREAMS = new Set(['stdout', 'stderr', 'stdin']);
const TB_LIB = new Set(['abs', 'labs', 'llabs', 'feof', 'fputs', 'fputc', 'putc', 'fflush', 'ap_uniform_int', 'sprintf', 'snprintf']);   // (ap_uniform_int: <random>'s, core/cpp-lex.js, #1734; sprintf: a file's name, #1897)
// the member functions of ap_int / ap_uint Silinx HLS knows
// the member functions of hls::stream Silinx HLS knows (#1590)
const STREAM_MEMBERS = new Set(['read', 'write', 'empty', 'full', 'read_nb', 'write_nb', 'size']);
const AP_MEMBERS = new Set(['range', 'to_double', 'to_float', 'to_int', 'to_uint', 'to_long', 'to_ulong', 'to_int64', 'to_uint64', 'length', 'and_reduce', 'or_reduce', 'xor_reduce']);
export const MAX_AP_WIDTH = 1024;

/** The value of a constant expression (numbers, the constants known, C's operators), or null if it is not one. */
export function constValue(e, consts = new Map()) {
  if (!e) return null;
  switch (e.kind) {
    case 'num': case 'chr': return e.value;
    case 'id': return consts.has(e.name) ? consts.get(e.name) : null;
    case 'unary': {
      const v = constValue(e.e, consts);
      if (v === null) return null;
      return e.op === '-' ? -v : e.op === '+' ? v : e.op === '!' ? (v ? 0n : 1n) : e.op === '~' ? ~v : null;
    }
    case 'cast': return constValue(e.e, consts);
    case 'cond': { const c = constValue(e.c, consts); return c === null ? null : constValue(c ? e.a : e.b, consts); }
    case 'binary': {
      const a = constValue(e.l, consts), b = constValue(e.r, consts);
      if (a === null || b === null) return null;
      switch (e.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b ? a / b : null; case '%': return b ? a % b : null;
        case '<<': return b >= 0n && b < 4096n ? a << b : null; case '>>': return b >= 0n ? a >> b : null;
        case '&': return a & b; case '|': return a | b; case '^': return a ^ b;
        case '&&': return a && b ? 1n : 0n; case '||': return a || b ? 1n : 0n;
        case '==': return a === b ? 1n : 0n; case '!=': return a !== b ? 1n : 0n;
        case '<': return a < b ? 1n : 0n; case '>': return a > b ? 1n : 0n; case '<=': return a <= b ? 1n : 0n; case '>=': return a >= b ? 1n : 0n;
        default: return null;
      }
    }
    default: return null;
  }
}

// (opts: headers, the project's own (#1597); top, the top function when no pragma names it)
export function checkC(source, file = 'input.c', opts = {}) {
  const ast = parse(source, file, opts);
  const diags = [...ast.errors];
  const report = (loc, message, severity = 'error') => diags.push({ file, line: loc?.line || 1, col: loc?.col || 1, message, severity });
  const funcs = new Map();
  const globals = new Map();
  const consts = new Map();   // the global const integers: array sizes and widths may use them
  for (const it of ast.items) {
    if (it.kind === 'func') {
      const prev = funcs.get(it.name);
      if (prev?.body && it.body) report(it.loc, `the function '${it.name}' is defined twice (first at line ${prev.loc.line})`);
      if (!prev || it.body) funcs.set(it.name, it);
    } else if (it.kind === 'var') {
      // (a constant of a header two sources include, const int N = 10; in each: the same constant, as C++'s file-scope
      // constants are each source's own, #1700)
      const prev = globals.get(it.name);
      if (prev && prev.const && it.const && prev.init && it.init && constValue(prev.init, consts) !== null && constValue(prev.init, consts) === constValue(it.init, consts)) continue;
      if (prev) report(it.loc, `'${it.name}' is declared twice`);
      globals.set(it.name, it);
      if (it.const && it.type.kind === 'int' && it.init && it.init.kind !== 'init') { const v = constValue(it.init, consts); if (v !== null) consts.set(it.name, v); }
    }
  }
  // the widths of the ap_int / ap_uint types and the sizes of the arrays: constants
  // (vla: a test bench's array of a size known when it runs, #1734)
  const typeOk = (t, loc, vla = false) => {
    if (!t) return;
    if (t.kind === 'int' && t.ap && t.bits === null) {
      const w = constValue(t.widthExpr, consts);
      if (w === null) report(loc, `the width of ${t.name}<…> must be a constant`);
      else if (w < 1n || w > BigInt(MAX_AP_WIDTH)) report(loc, `the width of ${t.name}<${w}> must be from 1 to ${MAX_AP_WIDTH}`);
      else t.bits = Number(w);
      if (t.fixed) {
        // (ap_fixed: its integer bits, its modes, core/c-fixed.js)
        const i = constValue(t.intExpr, consts);
        if (i === null) report(loc, `the integer bits of ${t.name}<…> must be a constant`);
        else t.ibits = Number(i);
        if (!Q_MODES.includes(t.q)) report(loc, `${t.name}: '${t.q}' is not a quantization mode (${Q_MODES.join(', ')})`);
        if (!O_MODES.includes(t.o)) report(loc, `${t.name}: '${t.o}' is not an overflow mode (${O_MODES.join(', ')})`);
        const n = t.nExpr ? constValue(t.nExpr, consts) : 0n;
        if (t.o === 'AP_WRAP_SM' || n) report(loc, `${t.name}: ${n ? 'saturation bits (N)' : 'AP_WRAP_SM'} are not supported yet`);
      }
    }
    if (t.kind === 'stream') typeOk(t.of, loc);   // (#1590)
    if (t.kind === 'array') {
      typeOk(t.of, loc);
      if (t.size) {
        const n = constValue(t.size, consts);
        if (n === null) { if (!vla) report(loc, 'the size of an array must be a constant (Silinx HLS: fixed sizes)'); }
        else if (n < 1n) report(loc, 'the size of an array must be 1 or more');
        else t.length = Number(n);
      }
    }
    if (t.kind === 'ptr') typeOk(t.to, loc);
  };
  for (const it of ast.items) {
    if (it.kind === 'var') typeOk(it.type, it.loc);
    if (it.kind === 'func') { typeOk(it.ret, it.loc); for (const pa of it.params) typeOk(pa.type, pa.loc); }
  }

  // ---------------------------------------------------------------- the top function
  let top = null;
  const topPragma = ast.pragmas.find((pg) => pg.name === 'TOP');
  if (topPragma) top = topPragma.args.name || null;
  for (const f of funcs.values()) for (const st of f.body?.items || []) if (st.kind === 'pragma' && st.pragma.name === 'TOP') top = st.pragma.args.name || f.name;
  if (top && !funcs.get(top)?.body) { report(topPragma?.loc, `the top function '${top}' is not defined`); top = null; }
  if (!top && opts.top && funcs.get(opts.top)?.body) top = opts.top;
  if (!top) top = [...ast.items].reverse().find((it) => it.kind === 'func' && it.body && it.name !== 'main')?.name || null;
  if (!top && !diags.some((d) => d.severity === 'error')) report({ line: 1, col: 1 }, 'no function to synthesize: Silinx HLS makes the top function into a module (main() is the test bench)');

  // ---------------------------------------------------------------- the call graph: what is synthesized
  const calls = new Map();   // name -> Set of the functions it calls
  const walk = (n, fn) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) walk(x, fn); return; }
    fn(n);
    for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') walk(v, fn);
  };
  for (const f of funcs.values()) {
    const s = new Set();
    walk(f.body, (n) => { if (n.kind === 'call' && n.callee.kind === 'id' && funcs.has(n.callee.name)) s.add(n.callee.name); });
    calls.set(f.name, s);
  }
  const synth = new Set();
  const visit = (name) => { if (synth.has(name)) return; synth.add(name); for (const c of calls.get(name) || []) visit(c); };
  if (top) visit(top);
  // recursion: a call cycle among the synthesized functions
  const onStack = new Set(), done = new Set();
  const cycle = (name, path) => {
    if (onStack.has(name)) return [...path.slice(path.indexOf(name)), name];
    if (done.has(name)) return null;
    onStack.add(name);
    for (const c of calls.get(name) || []) { const r = cycle(c, [...path, name]); if (r) return r; }
    onStack.delete(name); done.add(name);
    return null;
  };
  if (top) {
    const c = cycle(top, []);
    if (c) report(funcs.get(c[0]).loc, `recursion is not possible in hardware (Silinx HLS, as Vitis HLS): ${c.join(' → ')}`);
  }

  // ---------------------------------------------------------------- each function: names, calls, constructs
  const loops = [];
  // (opts.depths: a DATAFLOW process's pointer arguments, its caller's arrays' sizes, core/c-processes.js, #1707)
  pointerToPointer(funcs, synth, top, report);   // (int **pp of a function the top calls: resolved at compile time, #1895)
  pointerArgsMoved(funcs, synth, report);   // (a pointer argument moved, p += n: an offset of its own, #1895)
  pointerArithmetic(funcs, globals, synth, report, ast.structArgs, top, opts.depths);   // (*(p + e) is p[e]; a pointer argument indexed an array, #1599)
  pointerVariables(funcs, globals, synth, report);   // (a local pointer: its target and offset)
  for (const f of funcs.values()) {
    if (!f.body) continue;
    const hw = synth.has(f.name);
    checkFunction(f, { hw, funcs, globals, consts, report, loops, typeOk, dataflow: hasDataflow(f) });   // (a region's streams: any function's, its C simulation; the hardware the top's, core/c-processes.js)
  }
  // (ap_float, hls::autorestart: the test bench's, core/cpp-hls-lib.js, #1891)
  const simulated = new Set();
  for (const a of ast.apFloats || []) {
    const at = { file: a.file, line: a.line, col: a.col };
    if (a.fn && synth.has(a.fn)) report(at, `${a.text}: only in a test bench in Silinx HLS (the C simulation), not in the synthesized code`);
    else if (a.text !== 'hls::autorestart' && !simulated.has(a.text)) { simulated.add(a.text); report(at, `${a.text} is simulated as a double (its rounding not modelled)`, 'warning'); }
  }
  // the HLS pragmas of the synthesized functions (#1529)
  checkPragmas(ast, new Map([...funcs].filter(([n]) => synth.has(n))), report, top);
  diags.sort((a, b) => a.line - b.line || a.col - b.col);
  return { ast, top, funcs, loops, consts, diagnostics: diags, ok: !diags.some((d) => d.severity === 'error'), dataflow: !!top && hasDataflow(funcs.get(top)) };
}

/** The checks of one function's body (hw: it is synthesized). */
/** Whether a function's body has #pragma HLS DATAFLOW (its processes, core/c-processes.js, #1707). */
export const hasDataflow = (f) => !!f?.body?.items.some((st) => st.kind === 'pragma' && (st.pragma.name === 'DATAFLOW' || st.pragma.name === 'TASK'));   // (an hls::task's region too, #1721)

function checkFunction(f, ctx) {
  const { funcs, globals, consts, report, loops, typeOk, dataflow } = ctx;
  let { hw } = ctx;
  const scopes = [new Map()];
  for (const pa of f.params) {
    if (!pa.name) { if (f.name !== 'main') report(pa.loc, `a parameter of '${f.name}' has no name`); continue; }   // (main(int, char **), C++)
    else scopes[0].set(pa.name, { kind: 'param', type: pa.type });
    if (hw && !pa.said) typeHw(pa.type, pa.loc, `the parameter '${pa.name}'`);   // (said: core/c-pointer-args.js)
  }
  if (hw) typeHw(f.ret, f.loc, `the result of '${f.name}'`);
  const lookup = (name) => { for (let k = scopes.length - 1; k >= 0; k--) if (scopes[k].has(name)) return scopes[k].get(name); return globals.has(name) ? { kind: 'global', type: globals.get(name).type } : null; };
  function typeHw(t, loc, what) {
    if (!t) return;
    // (float and double: their operations the soft-float library's, core/c-dataflow-float.js, #1768, #1773)
    if (t.kind === 'struct' && t.name === 'FILE') report(loc, `${what}: a FILE (stdio.h's files) is the test bench's, not possible in the synthesized code (Silinx HLS, as Vitis HLS; the C simulation's code only: #ifndef __SYNTHESIS__)`);
    else if (t.kind === 'struct') report(loc, `${what}: structures (${t.name}) are not supported in Silinx HLS yet`);
    else if (t.kind === 'array') typeHw(t.of, loc, what);
    else if (t.kind === 'ptr') {
      if (t.to.kind === 'ptr') report(loc, `${what}: a pointer to a pointer is not possible here (Vitis HLS: a pointer to a pointer only resolved at compile time, a parameter of a function the top calls)`);
      else typeHw(t.to, loc, what);
    }
  }
  const declare = (v) => {
    if (scopes.at(-1).has(v.name)) report(v.loc, `'${v.name}' is declared twice in the same block`);
    scopes.at(-1).set(v.name, { kind: v.static ? 'static' : 'local', type: v.type });
    typeOk(v.type, v.loc, !hw);
    if (hw) {
      typeHw(v.type, v.loc, `'${v.name}'`);
      // (a DATAFLOW region's: a FIFO between its processes, #1707)
      if (v.type.kind === 'stream' && !dataflow) report(v.loc, `'${v.name}': a stream inside the module (a FIFO between its parts, DATAFLOW) is not supported yet: a stream is an argument (ap_fifo)`);
      if (v.type.kind === 'ptr' && !v.said && v.type.to.name !== 'FILE') report(v.loc, `'${v.name}': a pointer variable is not possible in Silinx HLS (pointers only as arguments; use an array index)`);
      if (v.type.kind === 'array' && !v.type.length && !v.type.size && !v.init) report(v.loc, `'${v.name}': an array needs its size`);
    }
    if (v.init) expr(v.init);
    if (v.const && v.type.kind === 'int' && v.init && v.init.kind !== 'init') { const c = constValue(v.init, consts); if (c !== null) consts.set(v.name, c); }
  };
  const isStream = (e) => {
    if (e.kind !== 'id') return false;
    const t = lookup(e.name)?.type;
    return t?.kind === 'stream' || (t?.kind === 'ptr' && t.to.kind === 'stream');
  };
  const isPtr = (e) => {
    if (e.kind !== 'id') return false;
    const s = lookup(e.name);
    return !!s && (s.type.kind === 'ptr' || s.type.kind === 'array');
  };
  // ------------------------------------------------ expressions
  function expr(e, how = {}) {
    if (!e) return;
    switch (e.kind) {
      case 'num': case 'chr': return;
      // (in hardware a double constant is only an ap_fixed's value: said by the synthesis otherwise, #1643)
      case 'float': return;
      case 'str': if (hw && !how.printf) report(e.loc, 'a string is only possible in printf (ignored by synthesis)'); return;
      case 'init': for (const x of e.items) expr(x); return;
      case 'id':
        // (stdio's streams: the test bench's; in synthesized code only in fprintf, ignored)
        if (STREAMS.has(e.name) && !lookup(e.name)) return;
        if (!lookup(e.name) && !funcs.has(e.name)) report(e.loc, `'${e.name}' is not declared`);
        else if (hw && !how.call && funcs.has(e.name) && !lookup(e.name)) report(e.loc, `a function as a value is not possible (Silinx HLS, as Vitis HLS: no function pointers)`);
        return;
      case 'unary':
        if (e.op === '&') {
          if (hw && !how.arg) report(e.loc, "'&' only to pass a variable to a function's pointer parameter (Silinx HLS: no pointer variables)");
          if (e.e.kind !== 'id' && e.e.kind !== 'index') report(e.loc, "'&' takes a variable");
        }
        if (e.op === '*' && hw && !isPtr(e.e) && !(e.e.kind === 'binary' && (isPtr(e.e.l) || isPtr(e.e.r)))) report(e.loc, "'*' reads a pointer parameter (Silinx HLS: pointers only as arguments)");
        expr(e.e); return;
      case 'postfix': expr(e.e); return;
      case 'binary':
        if (hw && (e.op === '+' || e.op === '-') && (isPtr(e.l) || isPtr(e.r))) report(e.loc, 'pointer arithmetic is not possible in Silinx HLS: index the array instead');
        if (e.op === '/' || e.op === '%') { const d = constValue(e.r, consts); if (d === 0n) report(e.loc, 'division by zero'); }
        if ((e.op === '<<' || e.op === '>>') && !ctx.dead) { const s = constValue(e.r, consts); if (s !== null && s < 0n) report(e.loc, `a shift by a negative amount (${s}) is undefined in C`); }
        expr(e.l); expr(e.r); return;
      case 'assign': expr(e.l); expr(e.r); return;
      case 'cond': expr(e.c); expr(e.a); expr(e.b); return;
      case 'comma': expr(e.l); expr(e.r); return;
      case 'index': expr(e.e); expr(e.i); return;
      case 'cast':
        typeOk(e.type, e.loc);
        if (hw) {
          if ((e.type.kind === 'ptr' || isPtr(e.e)) && !e.said) report(e.loc, 'a cast of a pointer is possible only as a pointer variable\'s value, to a narrower integer type (Vitis HLS: native types, char *p = (char *)&a[i])');
          typeHw(e.type, e.loc, 'a cast');
        }
        expr(e.e); return;
      case 'sizeof': if (e.e) expr(e.e); return;
      case 'member':
        if (e.arrow) report(e.loc, `'->' : structures are not supported in Silinx HLS yet`);
        // (a test bench's std::vector, an array: its size and its data, #1734)
        else if (!hw && isPtr(e.e) && (e.name === 'size' || e.name === 'data')) { /* the C simulation's */ }
        else if (isStream(e.e)) { if (!STREAM_MEMBERS.has(e.name)) report(e.loc, `'.${e.name}' is not a member function of hls::stream Silinx HLS knows (${[...STREAM_MEMBERS].join(', ')})`); }
        else if (e.name !== 'range' && !AP_MEMBERS.has(e.name)) report(e.loc, `'.${e.name}' is not a member function Silinx HLS knows (ap_int / ap_uint: ${[...AP_MEMBERS].join(', ')})`);
        expr(e.e); return;
      case 'call': return call(e);
      default: return;
    }
  }
  function call(e) {
    if (e.callee.kind === 'member') {
      expr(e.callee);
      for (const a of e.args) expr(a);
      return;
    }
    if (e.callee.kind !== 'id') { report(e.loc, 'a call of a function by its name only (Silinx HLS: no function pointers)'); return; }
    const name = e.callee.name;
    const fn = funcs.get(name);
    if (fn) {
      if (fn.params.length !== e.args.length) report(e.loc, `'${name}' takes ${fn.params.length} argument(s), not ${e.args.length}`);
      e.args.forEach((a, k) => expr(a, { arg: fn.params[k]?.type?.kind === 'ptr' || fn.params[k]?.type?.kind === 'array' }));
      if (name === 'main' && hw) report(e.loc, 'main() is the test bench: the synthesized code cannot call it');
      return;
    }
    // (assert: checked by the C simulation, not made into hardware, as Vitis HLS's)
    if (name === 'assert' && !lookup(name)) {
      if (hw) report(e.loc, 'assert is ignored by synthesis (the C simulation checks it)', 'warning');
      for (const a of e.args) expr(a);
      return;
    }
    if (IGNORED.has(name)) {
      if (hw) report(e.loc, `${name} is ignored by synthesis (it only prints in C simulation)`, 'warning');
      for (const a of e.args) expr(a, { printf: true });
      return;
    }
    if (REFUSED.has(name)) {
      if (hw) report(e.loc, name === 'malloc' || name === 'calloc' || name === 'realloc' || name === 'free'
        ? `${name}: dynamic memory is not possible in hardware (Silinx HLS, as Vitis HLS: fixed sizes; use an array)`
        : `${name} is a system call: not possible in the synthesized code (Silinx HLS, as Vitis HLS)`);
      for (const a of e.args) expr(a, { printf: true });
      return;
    }
    // (the rest of the test bench's C library, core/c-interp-lib.js, #1598)
    if (TB_LIB.has(name) && !lookup(name)) {
      if (hw) report(e.loc, `${name}() runs in the C simulation only (the test bench), not in the synthesized code`);
      for (const a of e.args) expr(a, { printf: true });
      return;
    }
    // (math.h's: the test bench's, core/c-float.js; in hardware of constants only, a table computed at synthesis, said
    // by core/c-dataflow-float.js, #1779)
    if ((MATH[name] || BITCASTS[name]) && !lookup(name)) {
      for (const a of e.args) expr(a, { printf: true });
      return;
    }
    if (!lookup(name)) report(e.loc, `the function '${name}' is not declared`);
    for (const a of e.args) expr(a);
  }
  // ------------------------------------------------ loops: their trip count
  const assigns = (n, name) => {
    let hit = false;
    const w = (x) => {
      if (!x || typeof x !== 'object' || hit) return;
      if (Array.isArray(x)) { x.forEach(w); return; }
      if ((x.kind === 'assign' && x.l.kind === 'id' && x.l.name === name) || ((x.kind === 'postfix' || (x.kind === 'unary' && (x.op === '++' || x.op === '--'))) && x.e.kind === 'id' && x.e.name === name)
        || (x.kind === 'unary' && x.op === '&' && x.e.kind === 'id' && x.e.name === name)) { hit = true; return; }
      for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') w(v);
    };
    w(n);
    return hit;
  };
  /** The trip count of a canonical for loop (i from a constant, compared with a constant, stepped by a constant, not
   *  changed in its body), else null. */
  function tripCount(st) {
    let v = null, start = null;
    const init = st.init;
    if (init?.kind === 'decl' && init.vars.length === 1) { v = init.vars[0].name; start = constValue(init.vars[0].init, consts); }
    else if (init?.kind === 'expr' && init.e.kind === 'assign' && init.e.op === '=' && init.e.l.kind === 'id') { v = init.e.l.name; start = constValue(init.e.r, consts); }
    if (v === null || start === null || !st.cond || st.cond.kind !== 'binary' || st.cond.l.kind !== 'id' || st.cond.l.name !== v) return null;
    const end = constValue(st.cond.r, consts);
    if (end === null) return null;
    let step = null;
    const s = st.step;
    if (s && (s.kind === 'postfix' || s.kind === 'unary') && s.e?.kind === 'id' && s.e.name === v) step = s.op === '++' ? 1n : s.op === '--' ? -1n : null;
    else if (s?.kind === 'assign' && s.l.kind === 'id' && s.l.name === v) {
      const k = constValue(s.r, consts);
      if (k !== null && s.op === '+=') step = k;
      if (k !== null && s.op === '-=') step = -k;
    }
    if (!step || assigns(st.body, v)) return null;
    let n = 0n;
    const ok = (x) => ({ '<': x < end, '<=': x <= end, '>': x > end, '>=': x >= end, '!=': x !== end })[st.cond.op];
    if (ok(start) === undefined) return null;
    // the count by arithmetic: (end - start) / step, rounded as the comparison says
    const span = st.cond.op === '<=' || st.cond.op === '>=' ? end - start + (step > 0n ? 1n : -1n) : end - start;
    if ((span > 0n) !== (step > 0n)) return 0;
    if (st.cond.op === '!=' && span % step) return null;   // (never equal: an endless loop)
    n = (span + step - (step > 0n ? 1n : -1n)) / step;
    return n > 0n ? Number(n) : 0;
  }
  // (min=, max=, avg=: constant expressions of the constants known, `max=c_dim*c_dim`, as Vitis HLS's examples, #1921)
  const tripPragma = (body) => {
    const items = body?.kind === 'block' ? body.items : [body];
    const pg = items.find((s) => s?.kind === 'pragma' && s.pragma.name === 'LOOP_TRIPCOUNT');
    if (!pg) return null;
    let max = null;
    for (const [k, text] of Object.entries(tripcountArgs(pg.pragma.text))) {
      const e = parseExpression(text);
      const v = constValue(e, consts);
      if (v !== null && v >= 0n) { if (k === 'max') max = Number(v); continue; }
      const names = [];
      const ids = (x) => { if (x?.kind === 'id') { if (!consts.has(x.name) && !names.includes(x.name)) names.push(x.name); } else if (x && typeof x === 'object') for (const [f, y] of Object.entries(x)) if (f !== 'loc') ids(y); };
      ids(e);
      const why = names.length ? `${names.map((n) => `'${n}'`).join(', ')} ${names.length > 1 ? 'are not constants' : 'is not a constant'}` : 'not a constant whole number';
      report(pg.loc, `#pragma HLS LOOP_TRIPCOUNT ${k}=${text}: ${why}: ignored (a number, or an expression of const integers)`, 'warning');
    }
    return max;
  };
  // ------------------------------------------------ statements
  function stmt(s) {
    if (!s) return;
    // (a synthesized function's statement only the C simulation compiles (#ifndef __SYNTHESIS__): the test bench's, #1897)
    if (hw && s.loc?.sim) { hw = false; try { stmt(s); } finally { hw = true; } return; }
    switch (s.kind) {
      case 'block': scopes.push(new Map()); s.items.forEach(stmt); scopes.pop(); return;
      case 'decl': s.vars.forEach(declare); return;
      case 'expr': expr(s.e); return;
      case 'if': {
        // (a branch a constant condition never runs: its shifts by negative constants not said, as a template's
        // `if (SCALE >= 0) x << SCALE; else x >> -SCALE;`)
        expr(s.cond);
        const c = constValue(s.cond, consts);
        const was = ctx.dead;
        ctx.dead = was || c === 0n; stmt(s.then);
        ctx.dead = was || (c !== null && c !== 0n); stmt(s.else);
        ctx.dead = was;
        return;
      }
      case 'switch': expr(s.e); stmt(s.body); return;
      case 'case': if (constValue(s.value, consts) === null) report(s.loc, "a 'case' value must be a constant"); return;
      case 'return':
        if (s.e) { if (f.ret.kind === 'void') report(s.loc, `'${f.name}' returns nothing (void): 'return' with no value`); expr(s.e); }
        else if (f.ret.kind !== 'void' && f.name !== 'main') report(s.loc, `'${f.name}' returns a value: 'return' needs one`);
        return;
      case 'goto': if (hw) report(s.loc, "'goto' is not supported in Silinx HLS (use loops, 'break' and 'continue')"); return;
      // (a label names the statement after it, a loop's name as Vitis HLS reports it, #1601; goto is refused)
      case 'label': stmt(s.stmt); return;
      case 'for': case 'while': case 'do': {
        scopes.push(new Map());
        if (s.kind === 'for') { if (s.init) stmt(s.init); if (s.cond) expr(s.cond); if (s.step) expr(s.step); }
        else expr(s.cond);
        if (hw) {
          const trip = s.kind === 'for' ? tripCount(s) : null;
          const max = trip === null ? tripPragma(s.body) : trip;
          // (not known: a state machine runs it as is, its latency unknown, as Vitis HLS, #1699)
          if (max === null) report(s.loc, `the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)`, 'warning');
          loops.push({ loc: s.loc, trip, max, fn: f.name });
        }
        stmt(s.body);
        scopes.pop();
        return;
      }
      case 'pragma': return;
      default: return;
    }
  }
  scopes.push(new Map());
  for (const st of f.body.items) stmt(st);
}

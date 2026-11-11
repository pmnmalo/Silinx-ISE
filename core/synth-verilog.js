// Silinx - synthesis front end: an elaborated design (core/elaborate.js) written as one flat,
// synthesizable SystemVerilog module, for Yosys (read_verilog -sv; synth_xilinx).
//
// The elaborator has already resolved everything VHDL- or Verilog-specific: generics and
// parameters, generate blocks, types and widths, overloaded operators, the hierarchy (every signal
// of the design has a unique path). What is left is a set of processes over sized values, and each
// one becomes an always block that computes exactly what Silinx's simulator computes:
//   - every vector is declared [w-1:0] (bit 0 = the value's least significant bit), and VHDL
//     indices are turned into bit positions as the simulator does (interp.js bitpos);
//   - every expression is written at the width and with the sign extension the simulator uses
//     (size casts W'(…) and $signed), so no Verilog width rule can change a result;
//   - clocked processes (rising_edge / falling_edge, clk'event, Verilog @(posedge …)), with
//     asynchronous resets before the clock, become edge-triggered always blocks; the others are
//     combinational (always @*); VHDL signal assignments are non-blocking, variables blocking;
//   - integer signals get the width of their range; functions become automatic functions;
//   - initial blocks (and VHDL processes that end in a bare `wait;`) are run once, by the
//     simulator's interpreter, and what they leave in the signals becomes their initial values;
//   - the Xilinx primitives instantiated by name (RAMB16_*, BUFG, DCM_SP, MULT18X18SIO, SRL16E…)
//     stay instances of the primitive, with their generics and ports: Silinx's simulation models
//     of them (core/unisim.js) are not translated.
// What cannot be synthesized (waits with a time, file I/O, reals…) is reported, not guessed.
//
//   const { text, top, warnings, primitives } = toVerilog(design)   // design = elaborate(lib, top)
//   (primitives: the names of the Xilinx primitives the text instantiates, instances: each instance's
//   cell, name and given generics as Verilog literals ({ cell, name, params }); to simulate the text,
//   compile it with core/unisim.js's UNISIM_SOURCE; option tables: false writes every operator as
//   an operator, see tabulate; option simprim: the cell of a SIMPRIM primitive, for the compiled
//   simulator (core/compiled-prims.js simprimCell, #627), whose instances are then kept too; option formal: the
//   assertions written too, as SystemVerilog's immediate assert (…) / assume (…), for Yosys's read_verilog -formal and
//   its SAT solver (core/verify.js, #3177): VHDL's of severity warning, error or failure, Verilog's assert and assume)
import * as V from './values.js';
import { bitpos, psliceLo, exec, evalE, sameDeep } from './interp.js';
import { writeModule } from './synth-module.js';
import { mountStatements } from './synth-stmts.js';
import { mountTables } from './synth-tables.js';
import { mountOperators } from './synth-operators.js';
import { mountValues } from './synth-values.js';

export class SynthError extends Error {
  constructor(msg, loc, file) { super(msg); this.loc = loc; this.file = file; }
}

// ------------------------------------------------------------------ names, widths, constants
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const KEYWORDS = new Set('always and assign begin buf case casex casez cmos deassign default defparam disable edge else end endcase endfunction endmodule endprimitive endspecify endtable endtask event for force forever fork function highz0 highz1 if ifnone initial inout input integer join large macromodule medium module nand negedge nmos nor not notif0 notif1 or output parameter pmos posedge primitive pull0 pull1 pulldown pullup rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared small specify specparam strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg vectored wait wand weak0 weak1 while wire wor xnor xor logic bit byte int shortint longint unsigned signed return break continue type typedef struct enum always_comb always_ff always_latch final unique priority do foreach'.split(' '));
// the sign an operator evaluates with (Verilog: the context's, elaborate.js ctxSize)
export const esign = n => !!(n.es ?? n.t?.s);
// does x (the text after an opening parenthesis) close that parenthesis at its very end
export function balanced(x) {
  let d = 1;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === '(') d++;
    else if (x[i] === ')' && --d === 0) return i === x.length - 1;
  }
  return false;
}
export const esc = n => (IDENT.test(n) && !KEYWORDS.has(n) ? n : `\\${n} `);
// expressions written as tables of their values (toVerilog's tabulate): the kinds of node, the
// most input bits
export const TAB_ROOT = new Set(['bin', 'un', 'cond', 'conv']);
export const TAB_BITS = 6;

/** The width a signal or local gets: integers the width of their range, the rest their own. */
export function synthWidth(t) {
  if (t.kind === 'int' && t.rlo !== undefined && t.rhi !== undefined) {
    const lo = BigInt(t.rlo), hi = BigInt(t.rhi);
    if (lo >= 0n) return Math.max(1, hi.toString(2).length);
    const need = x => (x < 0n ? (-x - 1n).toString(2).length + 1 : x.toString(2).length + 1);
    return Math.max(need(lo), need(hi));
  }
  return t.w;
}
export const signedInt = t => t.kind === 'int' && (t.rlo === undefined || t.rlo < 0);
// is a declaration signed: integers by their range, the rest by their type
export const sgn = t => (t?.kind === 'int' ? signedInt(t) : !!t?.s);

/** A Verilog literal of a value (x / z bits kept). */
export function lit(v, w = v.w) {
  if (w <= 0) return "1'b0";
  const m = (1n << BigInt(w)) - 1n;
  const vv = BigInt.asUintN(w, v.v ?? 0n) & m, xx = BigInt.asUintN(w, v.x ?? 0n) & m;
  if (!xx) return `${w}'h${vv.toString(16)}`;
  let s = '';
  for (let i = w - 1; i >= 0; i--) {
    const b = 1n << BigInt(i);
    s += xx & b ? (vv & b ? 'z' : 'x') : (vv & b ? '1' : '0');
  }
  return `${w}'b${s}`;
}

// ------------------------------------------------------------------ the translator
// The flip-flops and latches of Yosys's Xilinx cell library; the simpler ones of the UNISIM library
// (FD, FDC, FDE, FDR, FDS, FDP, FDRS, FDCP, LD, LDC, LDE, LDP and the _1 flip-flops) are not in it,
// so they become the smallest one that has their pins, with the others tied inactive (CE / GE = 1,
// resets and sets = 0): the same behaviour, and INIT keeps its meaning.
const YOSYS_FFS = [['FDRE', 'CE R'], ['FDSE', 'CE S'], ['FDCE', 'CE CLR'], ['FDPE', 'CE PRE'], ['FDRSE', 'CE R S'], ['FDCPE', 'CE CLR PRE']];
const YOSYS_LATCHES = [['LDCE', 'CLR GE'], ['LDPE', 'PRE GE'], ['LDCPE', 'CLR PRE GE']];
/** The cell Yosys knows for a primitive with these ports: { name, tie: { pin: value } }. */
export function yosysCell(name, ports) {
  const m = /^(FD|LD)([A-Z]*)(_1)?$/.exec(name);
  if (!m) return { name, tie: {} };
  const latch = m[1] === 'LD', table = latch ? YOSYS_LATCHES : YOSYS_FFS;
  if (table.some(([n]) => n === `${m[1]}${m[2]}`) && (!m[3] || !latch)) return { name, tie: {} };
  if (m[3] && latch) return { name, tie: {} };   // no falling-gate latch in Yosys's library (it says so)
  const pins = ports.filter(p => !['C', 'G', 'D', 'Q'].includes(p));
  const full = table.map(([n, ps]) => [n, ps.split(' ')]).filter(([, ps]) => pins.every(p => ps.includes(p))).sort((a, b) => a[1].length - b[1].length)[0];
  if (!full) return { name, tie: {} };
  const tie = {};
  for (const p of full[1]) if (!pins.includes(p)) tie[p] = p === 'CE' || p === 'GE' ? "1'b1" : "1'b0";
  return { name: `${full[0]}${m[3] || ''}`, tie };
}

export function toVerilog(design, { name, tables = true, simprim = null, formal = false } = {}) {
  let shiftMems = Object.assign(new Set(), { srcs: new Set() });   // the arrays that are shift chains (findShiftMems), their tap wires
  const tapWires = new Map();
  const top = design.top;
  const warnings = [];
  const prefix = `${top.path}.`;
  const sigName = new Map();     // signal -> Verilog name
  const used = new Set();
  // (names compared as written: Verilog is case-sensitive, VHDL's plain names are lower case already,
  // and a / A or \\mixed\\ / \\Mixed\\ are names of their own, kept as XST keeps them: #83)
  const uniq = n => { let k = n, i = 1; while (used.has(k)) k = `${n}_${i++}`; used.add(k); return k; };
  const portOf = new Map(top.ports.map(p => [p.sig, p]));

  const decls = [], blocks = [], funcs = [];
  const funcName = new Map();    // fn -> Verilog function name
  const where = n => (n?.loc ? ` (line ${n.loc.line})` : '');
  const fail = (msg, n, file) => { throw new SynthError(msg + where(n), n?.loc, file); };

  // ---------------- primitives instantiated by name
  // An instance of a module of Silinx's own UNISIM library (core/unisim.js, file <silinx>/…) is a
  // Xilinx primitive: Yosys knows it as a cell, so it stays an instance, with the generics the
  // design gave it. Its simulation model (signals, processes, sub-instances) is left out; only
  // its port signals remain, with the processes that drive its inputs from their actuals.
  const prims = [], skipSig = new Set(), skipProc = new Set();
  const primDriven = new Set();  // signals driven by a primitive's output: no initial value of their own
  (function walk(inst) {
    for (const c of inst.children || []) {
      if (!String(c.file || '').startsWith('<silinx>/')) { walk(c); continue; }
      if (c.file !== '<silinx>/unisim.vhd' && !(simprim && c.file === '<silinx>/simprim.vhd')) fail(`${c.module} (${c.path}): the primitives of a post-implementation netlist (${c.file}) cannot be synthesized`, c, c.file);
      const portSigs = new Set(c.ports.map(pt => pt.sig));
      const inside = [];
      (function all(i) { inside.push(i); (i.children || []).forEach(all); })(c);
      const keep = [];
      for (const i of inside) {
        for (const sg of i.signals) if (!portSigs.has(sg)) skipSig.add(sg);
        for (const p of i.procs) {
          if (i === c && p.kind === 'glue' && [...(p.writes || [])].every(sg => portSigs.has(sg))) keep.push(p);
          else skipProc.add(p);
        }
      }
      for (const pt of c.ports) if (pt.dir !== 'in') primDriven.add(pt.sig);
      prims.push({ inst: c, driven: new Set(keep.flatMap(p => [...(p.writes || [])])) });
    }
  })(top);
  for (const p of top.ports) sigName.set(p.sig, esc(uniq(p.name)));
  // the variable of a for loop gets a plain name: Yosys 0.68 does not unroll a loop on an escaped
  // name holding a dot (`for (\u.j = 3; …)` in an instance's process: the loop and the logic it
  // drives vanish from the netlist; verilog-axis's FIFO inside another module)
  const loopVars = new Set();
  const findLoops = (x, depth = 0) => {
    if (!x || typeof x !== 'object' || depth > 200) return;
    if (Array.isArray(x)) { for (const y of x) findLoops(y, depth + 1); return; }
    if (x.k === 'for' && x.init?.target?.k === 'sig') loopVars.add(x.init.target.sig);
    for (const key of ['body', 'stmts', 'then', 'else', 'items', 'def', 'default', 'init', 'step']) if (x[key]) findLoops(x[key], depth + 1);
    if (Array.isArray(x.cases)) for (const c of x.cases) findLoops(c.body ?? c, depth + 1);
  };
  for (const p of design.procs) if (!skipProc.has(p)) findLoops(p.body);
  // the nonblocking assignments that no other assignment to their signal can precede in their process
  // (x[i] <= c ? v : x[i] there written if (c) x[i] <= v: readBack)
  const firstWrites = new WeakSet();
  for (const p of design.procs) if (!skipProc.has(p)) markFirstWrites(p.body, new Set(), firstWrites);
  for (const s of design.signals) {
    if (sigName.has(s) || skipSig.has(s)) continue;
    const path = s.path.startsWith(prefix) ? s.path.slice(prefix.length) : s.path;
    sigName.set(s, esc(uniq(loopVars.has(s) ? path.replace(/[^\w$]/g, '_') : path)));
  }

  // ---------------- constant signals: driven only by one concurrent assignment of a constant (VHDL
  // `w_cpol <= '1' when SPI_MODE = 2 else '0';`, folded): read as that constant, so that a reset
  // value or a condition that reads one is a constant for Yosys (#14: as an asynchronous reset value
  // it made the flip-flops load a signal, 2.5 times the logic)
  const constSig = new Map();
  {
    const drivers = new Map();
    for (const p of design.procs) if (!skipProc.has(p)) for (const sg of p.writes || []) drivers.set(sg, [...(drivers.get(sg) || []), p]);
    for (const [sg, ps] of drivers) {
      const p = ps[0], b = p.body;
      if (ps.length !== 1 || p.kind !== 'assign' || !b || b.k !== 'asg' || b.delay || b.target.k !== 'sig' || b.target.sig !== sg) continue;
      if (b.value.k !== 'c' || Array.isArray(b.value.val) || b.value.val.v === undefined || sg.t.kind === 'array' || sg.wired) continue;
      constSig.set(sg, b.value.val);
    }
  }

  // ---------------- wired nets (wand / wor, IEEE 1364-2005 4.6.4) with several drivers: each
  // driver (a continuous assignment, an instance's output) assigns a signal of its own, which starts
  // at the value that does not change the result (all ones for wand, zeros for wor, its bits no
  // driver sets), and the net is the and / or of them
  const wiredDrv = new Map();    // signal -> Map(process -> its driver signal's name)
  for (const s of design.signals) {
    if ((s.wired !== 'and' && s.wired !== 'or') || skipSig.has(s) || s.t.kind === 'array') continue;
    const ds = design.procs.filter(p => !skipProc.has(p) && p.mode !== 'initial' && p.mode !== 'loop' && p.writes?.has(s));
    if (ds.length < 2) continue;
    const base = s.path.startsWith(prefix) ? s.path.slice(prefix.length) : s.path;
    wiredDrv.set(s, new Map(ds.map((p, k) => [p, esc(uniq(`${base}__drv${k}`))])));
  }

  // ---------------- values: every expression as an unsigned, exactly-sized Verilog expression (synth-values.js)
  const { S, e, e0, fieldOff, fit, frameCtx, isMem, isRec, localName, nullVec, packVal, sized, wOf } = mountValues({
    name, asSign: (...a) => asSign(...a), bin: (...a) => bin(...a), call: (...a) => call(...a), constSig, decls, fail,
    lowBits: (...a) => lowBits(...a), narrowIndex: (...a) => narrowIndex(...a), place: (...a) => place(...a),
    placeText: (...a) => placeText(...a), posExpr: (...a) => posExpr(...a), romRef: (...a) => romRef(...a),
    shiftMems: () => shiftMems, sigName, tabulate: (...a) => tabulate(...a), tapWires, truth: (...a) => truth(...a),
    un: (...a) => un(...a), uniq, used, wiredDrv
  });

  // a VHDL / Verilog index as a bit position (the simulator's bitpos) (synth-operators.js)
  const { asSign, bin, lowBits, narrowIndex, posExpr, truth, un } = mountOperators({
    S, constSig, e, fail, fit, frameCtx, localName, sigName, sized, wOf
  });

  // ---------------- expressions of few input bits, as tables (synth-tables.js)
  const { call, romRef, tabulate } = mountTables({
    name, tables, e, e0, fail, fit, funcName, funcs, isMem, localName, packVal, sigName, stmt: (...a) => stmt(...a),
    uniq, wOf
  });

  // ---------------- elements of memories, fields of records (#69): where a chain of selects
  // (m(i).f(j)) lands: { base: the Verilog name or memory word, full: its width, t, mem: still a
  // memory to index, off / offX: the bit offset in the word (constant / an expression) }
  function place(n, ctx, lv) {
    if (n.k === 'sig') {
      const name = lv ? (wiredDrv.get(n.sig)?.get(ctx.proc) ?? sigName.get(n.sig)) : sigName.get(n.sig);
      return { base: name, full: wOf(n.sig.t), t: n.sig.t, mem: isMem(n.sig.t), off: 0, offX: null };
    }
    if (n.k === 'loc') {
      const fc = frameCtx(ctx, n);
      if (fc.subst?.has(n.i)) { const sb = fc.subst.get(n.i); const sub = lv ? sb.lv : sb.rv; return sub ? place(sub, sb.ctx, lv) : null; }
      return { base: localName(fc, n.i, n.t), full: wOf(n.t), t: n.t, mem: isMem(n.t), off: 0, offX: null };
    }
    if (n.k !== 'elem') return null;
    // a word of a constant array (a ROM function's result): read only, its fields by shifting
    if (!lv && n.base.k === 'c' && Array.isArray(n.base.val)) {
      const r = romRef(n, ctx);
      return { base: r.x, full: r.w, t: n.t, mem: false, off: 0, offX: null, expr: true };
    }
    const P = place(n.base, ctx, lv);
    if (!P) return null;
    const lo = P.t.lo ?? 0;
    const idx = () => { const iv = e(narrowIndex(n.index), ctx); return iv.s ? S(iv.x) : iv.x; };
    if (P.mem) {   // a word of the memory
      const ix = idx();
      return { base: `${P.base}[${lo ? `${ix} - ${lo}` : ix}]`, full: wOf(P.t.elem), t: P.t.elem, mem: false, off: 0, offX: null };
    }
    if (isRec(P.t)) {   // a field of a packed record
      if (n.index.k !== 'c') fail('a record field selected by a non-constant index', n);
      const k = V.toNum(n.index.val) - lo;
      return { ...P, t: P.t.fields[k].t, off: P.off + fieldOff(P.t, k) };
    }
    if (P.t.kind === 'array') {   // an element of an array inside a packed value
      const ew = wOf(P.t.elem);
      if (n.index.k === 'c') return { ...P, t: P.t.elem, off: P.off + (V.toNum(n.index.val) - lo) * ew };
      const ix = idx(), term = `(${lo ? `${ix} - ${lo}` : ix}) * ${ew}`;
      return { ...P, t: P.t.elem, offX: P.offX ? `${P.offX} + ${term}` : term };
    }
    return null;
  }
  function placeText(P) {
    const w = wOf(P.t);
    if (P.expr) return P.off === 0 && !P.offX && w === P.full ? P.base : `${w}'((${P.base}) >> ${P.offX ? `(${P.offX}${P.off ? ` + ${P.off}` : ''})` : P.off})`;
    if (P.offX) return `${P.base}[${P.offX}${P.off ? ` + ${P.off}` : ''} +: ${w}]`;
    return P.off === 0 && w === P.full ? P.base : `${P.base}[${P.off + w - 1}:${P.off}]`;
  }

  // ---------------- statements (synth-stmts.js)
  const { stmt } = mountStatements({
    name, S, e, fail, firstWrites, fit, formal, frameCtx, isMem, localName, nullVec, packVal, place, placeText, posExpr,
    sigName, truth, wOf, wiredDrv
  });

  // ---------------- processes (synth-module.js)
  return writeModule({
    design, name, simprim, blocks, decls, fail, funcs, isMem, isRec, nullVec, packVal, portOf, prefix, primDriven,
    prims, sigName, skipProc, skipSig, stmt, tapWires, top, uniq, wOf, warnings, where,
    wiredDrv, setShiftMems: (v) => { shiftMems = v; }
  });
}

// The assignments of a statement that no assignment to the same signal or variable can precede (in
// `firsts`), given the ones already assigned before it (`done`: their signals and variables, ANY for
// any); returns the ones assigned after it. A loop's body is walked twice (its writes precede its next turn).
const ANY = Symbol('any');
const NO_WRITE = new Set(['exit', 'next', 'ret', 'null', 'report', 'assert', 'textio', 'sys']);
function markFirstWrites(s, done, firsts) {
  if (!s || typeof s !== 'object') return done;
  const union = sets => new Set(sets.flatMap(x => [...x]));
  switch (s.k) {
    case 'blk': for (const x of s.stmts) done = markFirstWrites(x, done, firsts); return done;
    case 'asg': {
      let T = s.target;
      while (['bit', 'slice', 'dslice', 'pslice', 'elem'].includes(T?.k)) T = T.base;
      const key = T?.k === 'sig' ? T.sig : T?.k === 'loc' && T.up == null ? `loc${T.i}` : ANY;
      if (key !== ANY && !done.has(key) && !done.has(ANY)) firsts.add(s);
      return union([done, [key]]);
    }
    case 'if': {   // (an elsif / else if chain in a loop: thousands of branches, #2577)
      const after = [];
      for (; s?.k === 'if'; s = s.else) after.push(markFirstWrites(s.then, new Set(done), firsts));
      after.push(markFirstWrites(s, new Set(done), firsts));
      return union(after);
    }
    case 'case': return union([...s.items.map(it => markFirstWrites(it.body, new Set(done), firsts)), markFirstWrites(s.def, new Set(done), firsts)]);
    case 'forrange': case 'for': return markFirstWrites(s.body, markFirstWrites(s.body, done, firsts), firsts);
    default: return NO_WRITE.has(s.k) ? done : union([done, [ANY]]);
  }
}

// Two expressions that are the same and read the same bits: the same signals and variables, operators
// and constants, without calls (a function's side effects) or anything else
export function sameExpr(a, b) {
  if (!a || !b || a.k !== b.k) return false;
  if (a.t !== b.t && (a.t?.kind !== b.t?.kind || a.t?.w !== b.t?.w || !!a.t?.s !== !!b.t?.s)) return false;
  // (an operation's width and sign in its context: an lvalue's index has none, its own type's)
  if ((a.ew || a.t?.w) !== (b.ew || b.t?.w) || esign(a) !== esign(b)) return false;
  switch (a.k) {
    case 'c': return sameDeep(a.val, b.val);
    case 'sig': return a.sig === b.sig;
    case 'loc': return a.i === b.i && a.up == null && b.up == null;
    case 'bit': case 'elem': return sameExpr(a.base, b.base) && sameExpr(a.index, b.index);
    case 'slice': return a.lo === b.lo && sameExpr(a.base, b.base);
    case 'dslice': return sameExpr(a.base, b.base) && sameExpr(a.left, b.left) && sameExpr(a.right, b.right);
    case 'pslice': return a.dir === b.dir && sameExpr(a.base, b.base) && sameExpr(a.start, b.start);
    case 'un': return a.o === b.o && !a.fp && !b.fp && sameExpr(a.a, b.a);
    case 'bin': return a.o === b.o && !a.fp && !b.fp && !a.match && !b.match && a.cw === b.cw && sameExpr(a.a, b.a) && sameExpr(a.b, b.b);
    case 'cond': return sameExpr(a.c, b.c) && sameExpr(a.a, b.a) && sameExpr(a.b, b.b);
    case 'cat': return a.parts.length === b.parts.length && a.parts.every((p, i) => sameExpr(p, b.parts[i]));
    case 'conv': return a.ext === b.ext && !a.rtoi && !b.rtoi && sameExpr(a.a, b.a);
    default: return false;
  }
}

// The arrays that are shift chains (#5): every word written is either a word of the same array next to
// it (m[i] <= m[i - 1] or m[i + 1], i a loop's variable) or a word at a constant index (m[0] <= d);
// at most 64 words. Read at a variable tap, such an array is written bit by bit as shifts
// (toVerilog, 'elem'), which Yosys maps to SRL16Es; other arrays (a RAM written at an address) are not.
export function findShiftMems(design) {
  const writes = new Map(), bad = new Set(), vecWrites = new Map(), vecBad = new Set();
  const SKIP = new Set(['sig', 't', 'varT', 'val', 'retT', 'fn', 'loc']);
  const seen = new Set();
  const walk = root => {
    const stack = [root];   // (in order, with a stack of its own: an elsif chain of thousands of branches, #2577)
    while (stack.length) {
      const o = stack.pop();
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      if (Array.isArray(o)) { for (let i = o.length - 1; i >= 0; i--) stack.push(o[i]); continue; }
      if (o.k === 'asg' && o.target) {
        const T = o.target;
        if (T.k === 'elem' && T.base?.k === 'sig') { if (!writes.has(T.base.sig)) writes.set(T.base.sig, []); writes.get(T.base.sig).push(o); }
        else if (T.k === 'sig') { bad.add(T.sig); if (!vecWrites.has(T.sig)) vecWrites.set(T.sig, []); vecWrites.get(T.sig).push(o); }   // (an array: assigned whole)
        else if (T.base?.k === 'sig') vecBad.add(T.base.sig);   // (a part of a vector written)
      }
      const kids = Object.entries(o).filter(([k]) => !SKIP.has(k));
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i][1]);
    }
  };
  for (const p of design.procs) walk(p.body);
  // (the loop's variable: a local, or a module integer, for (i = 15; i > 0; i = i - 1))
  const same = (a, b) => (a?.k === 'loc' && b?.k === 'loc' && a.i === b.i) || (a?.k === 'sig' && b?.k === 'sig' && a.sig === b.sig);
  const out = Object.assign(new Set(), { srcs: new Set() });   // srcs: the reads of the shifts themselves (m[i - 1])
  for (const [sg, ws] of writes) {
    if (bad.has(sg) || sg.t?.kind !== 'array' || sg.t.fields || !(sg.t.len <= 64) || sg.t.elem?.kind === 'array') continue;
    const shift = w => w.value?.k === 'elem' && w.value.base?.k === 'sig' && w.value.base.sig === sg && w.value.index?.k === 'bin' && ['+', '-'].includes(w.value.index.o)
      && w.value.index.b?.k === 'c' && Number(w.value.index.b.val?.v) === 1 && same(w.value.index.a, w.target.index);
    if (ws.every(w => w.target.index?.k === 'c' || shift(w)) && ws.some(shift)) {
      out.add(sg);
      for (const w of ws) if (shift(w)) out.srcs.add(w.value);
    }
  }
  // the vectors that are shift chains: every write r <= {r[w-2:0], x} or {x, r[w-1:1]} (their variable
  // bits are written r[k], a $shiftx: an SRL16E; other vectors' as shifts, which map better)
  out.vecs = new Set();
  for (const [sg, ws] of vecWrites) {
    const w = sg.t?.w;
    if (vecBad.has(sg) || sg.t?.kind === 'array' || !(w > 2)) continue;
    const self = p => p?.k === 'slice' && p.base?.k === 'sig' && p.base.sig === sg && p.t?.w === w - 1;
    const shifts = ws.every(x => x.value?.k === 'cat' && x.value.parts?.length === 2
      && ((self(x.value.parts[0]) && x.value.parts[0].lo === 0) || (self(x.value.parts[1]) && x.value.parts[1].lo === 1)));
    if (shifts) out.vecs.add(sg);
  }
  return out;
}

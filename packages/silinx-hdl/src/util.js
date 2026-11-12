// Silinx - small helpers several core modules (and the page's editors) share, one copy of each (#1406).
// Isomorphic module (browser + Node), no imports.

/** A deep copy of a JSON value (a drawing, a model). */
export const clone = o => JSON.parse(JSON.stringify(o));
/** k as two upper-case hexadecimal digits (an INIT string's byte). */
export const hex2 = k => k.toString(16).toUpperCase().padStart(2, '0');
/** The offset where each line of text starts. */
export function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
  return out;
}
/** Is token t (a lexer's: { k, v }) a keyword of v…, an operator of v…? */
export const isKw = (t, ...v) => !!t && t.k === 'kw' && v.includes(t.v);
export const isOp = (t, ...v) => !!t && t.k === 'op' && v.includes(t.v);
/** A token's text as written in the source (its lexer's toks.src), or undefined. */
export function tokenText(toks, tok) {
  return tok?.at === undefined || toks?.src === undefined ? undefined : toks.src.slice(tok.at, tok.at + tok.end - tok.col);
}
/** v as a decimal integer, else d (a symbol's parameter). */
export const intOr = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

// The deepest an expression nests (#3395): parentheses, calls, indexes, concatenations, unary operators, a ?: in a
// then branch. The parsers refuse a deeper one: the passes after them (the binder, the simulator, the design checks,
// the synthesis input, the translations) recurse once per level. 256, the bracket depth of C compilers.
export const MAX_NESTING = 256;
export const NESTING_MESSAGE = `expression nested more than ${MAX_NESTING} levels deep (parentheses, calls, unary operators)`;
// The deepest statements nest (#3490): blocks, if, case, loops, a statement's body, generates (in Verilog a generate
// block, in VHDL any concurrent statement), one count from the outermost construct of the module or architecture to
// its innermost statement. The parsers refuse a deeper one, as they do expressions: the passes after them recurse once
// per level (the elaboration from about 600 levels).
export const STMT_NESTING_MESSAGE = `statement nested more than ${MAX_NESTING} levels deep (blocks, if, case, loops, generates)`;
// The deepest calls nest while a design is elaborated (#3508): a function calling another, that calls another…, each
// call's subprogram bound (and a constant one evaluated) inside its caller's binding. The JavaScript stack ran out
// (Node 24's default stack) past about 230 functions of one statement each, past about 100 whose call sits in an if, a
// for, a case and parentheses; 64, with a margin over both: 64 of those still bind with their outermost call 250 blocks
// deep (statements nest at most MAX_NESTING levels) and 30 parentheses around each call. A call past it is an error of
// the file at the call.
export const MAX_CALL_NESTING = 64;
export const CALL_NESTING_MESSAGE = `calls nested more than ${MAX_CALL_NESTING} levels deep (a function calling another, that calls another…)`;
// The largest object (#3555): a vector's width, an array's elements times their width (an array of arrays: every
// level's), a record's fields, a string's characters (8 bits each), an expression's result (a concatenation, a
// replication). The repository's widest is 40 960 bits (a memory of 4096 elements of 10 bits); the largest block RAM
// of the supported devices 4.9 Mbits. 16 Mbits (2**24), with a margin over both: a vector that wide is a number of
// 2 MB, an array that size at most MAX_ELEMENTS elements. Past it the elaboration ran for minutes and out of memory
// (an aggregate's others built bit by bit, a replication's bits joined one at a time), or threw (a number too large).
export const MAX_BITS = 2 ** 24;
// An array's elements, those of every level of an array of arrays (each a value of its own: 4M of them 2 s and
// 600 MB): the limit an array had alone, now of the whole (#3555: 22 levels of two elements, 8M in all, 1.6 GB).
export const MAX_ELEMENTS = 2 ** 22;
export const widthMessage = (what, n) => `${what} is ${n} bits wide, more than the limit of ${MAX_BITS} bits`;
// The loop iterations and calls of one evaluation (#3525): a constant's (a function run while the design is
// elaborated), a process's run until it waits (the simulation's limits, of time steps and of the clock, are looked at
// between two runs). Every iteration of a for, a while, a VHDL loop, a repeat, a forever that does not wait, and every
// call of a function, a procedure or a task counts, nested loops and recursion together (what one iteration runs
// besides is bounded by the source). Past it, one error at the loop or the call. The repository's largest evaluation
// is 1536 (a test bench's memory filled in a loop); the interpreter runs about 3 million a second: 2**22 (4M), with a
// margin of thousands over it, about 1.5 s. (Each while or loop stopped at 10 million on its own before, about half a
// minute; a for and a repeat never, and nested loops multiplied it.)
export const MAX_ITERATIONS = 2 ** 22;
export const ITERATIONS_MESSAGE = `loop iteration limit exceeded: more than ${MAX_ITERATIONS} iterations and calls in one evaluation (a constant, or a process until it waits)`;
// The branches of a generate if … else if chain, of a case generate (#3500): the node, then each else if / elsif / next
// alternative, the same construct in the same scope (elseChain: its else is that one generate_if), listed in a loop:
// a chain is not nesting, thousands of branches are read, elaborated and translated without recursing per branch.
export function genChain(it) {
  const out = [];
  for (let g = it; g; g = g.elseChain ? g.else[0] : null) out.push(g);
  return out;
}
/** f(x) for each module item of items and of the generate blocks in them (items, then, else), in source order, with a
 * stack of its own rather than recursing (#3500: an else if chain thousands of branches long). */
export function walkItems(items, f) {
  const stack = [[items || [], 0]];
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top[1] >= top[0].length) { stack.pop(); continue; }
    const x = top[0][top[1]++];
    if (!x || typeof x !== 'object') continue;
    f(x);
    for (const k of ['else', 'then', 'items']) if (Array.isArray(x[k]) && x[k].length) stack.push([x[k], 0]);
  }
}

// Silinx HLS: the limits of a C source (#3558), each refused with one error of the file where it is passed, as the HDL
// front end's (packages/silinx-hdl/src/util.js, #3395, #3508). Isomorphic ES module.
//
// The passes after the parser (the checks, the C simulation, the synthesis, the co-simulation) recurse once per level of
// the syntax tree: a tree too deep ran out of the JavaScript stack (a RangeError out of checkC, simulateC, cToHdl).

// The deepest the parser nests (parentheses, a call's arguments, an index, ?:, an assignment's right side, an initial
// value's braces; a statement's body: blocks, if and else if, loops, switch, labels): about 15 calls of the parser per
// parenthesis, so 600 overflowed it. 256, the bracket depth of C compilers and the HDL's MAX_NESTING.
export const MAX_NESTING = 256;
export const NESTING_MESSAGE = `expression nested more than ${MAX_NESTING} levels deep (parentheses, calls, indexes, ?:, assignments)`;
export const STMT_NESTING_MESSAGE = `statement nested more than ${MAX_NESTING} levels deep (blocks, if and else if, loops, switch)`;
// The deepest an expression's tree is, from its statement (a chain of a left-associative operator nests in its left
// operands, x + x + … one level per +; unary operators and ?: chains too): the simulation overflowed at about 3000
// levels, the synthesis at fewer inside nested statements and calls. 1024 (a chain of 1024 operators), with a margin
// when its statement is MAX_NESTING levels deep.
export const MAX_EXPR_DEPTH = 1024;
export const EXPR_DEPTH_MESSAGE = `expression more than ${MAX_EXPR_DEPTH} operators deep (a chain of ${MAX_EXPR_DEPTH} operators, x + x + …, is that deep): split it into several statements`;
// The elements of an array (all its dimensions): the C simulation makes an object per element, the synthesis a value per
// element of an initialized one (10 million: half a gigabyte and seconds; 100 million, minutes). 2^22, twice the bits
// of the largest device's block RAMs (the Spartan-6 LX45's 116 RAMB16: 2.1 Mbit), 140 times the HLS corpus' largest
// array (30 000 elements).
export const MAX_ARRAY_ELEMENTS = 1 << 22;
export const arrayMessage = (name, n) => `${name ? `'${name}': ` : ''}an array of ${n} elements: at most ${MAX_ARRAY_ELEMENTS} (Silinx HLS)`;
// An array in the hardware (its elements times their bits; a memory of the module's own, not an argument's, which is
// outside it; or its elements as values of the logic): a memory's contents are written out in the HDL word by word, an
// array of values is a value per element, again per store at an index not constant (a million ints: 2 GB, 4 million:
// out of memory). 2^23 bits, four times the largest device's block RAMs.
export const MAX_MEMORY_BITS = 1 << 23;
export const memoryMessage = (name, n, w) => `'${name}': ${n} elements of ${w} bits in the hardware: at most ${MAX_MEMORY_BITS} bits (four times the largest device's block RAMs)`;
// A macro's expansion (#define): each macro of a line expanded in its turn, a macro that doubles its argument 16 times
// is 131 071 tokens (and twice the time per level). 2^16 tokens per line, and macros nested at most MAX_NESTING deep.
export const MAX_MACRO_TOKENS = 1 << 16;
export const macroMessage = (name) => `the expansion of the macro '${name}' is longer than ${MAX_MACRO_TOKENS} tokens`;
export const macroNestingMessage = (name) => `the macro '${name}': macros nested more than ${MAX_NESTING} levels deep`;

const LEAF = new Set(['num', 'chr', 'str', 'float', 'id']);
const EXPR = new Set([...LEAF, 'unary', 'postfix', 'binary', 'assign', 'cond', 'call', 'index', 'member', 'cast', 'sizeof', 'comma', 'init']);
/** The syntax tree's operators past MAX_EXPR_DEPTH (from their statement; a name or a constant is not one) each replaced by 0, with one error
 *  (report(node, message)) per expression (its outermost) cut; walked with a stack of its own, not recursively. */
export function cutDeep(items, report) {
  const seen = new Set(), said = new Set();
  const stack = [{ node: { items }, depth: 0, root: null }];
  while (stack.length) {
    const { node, depth, root } = stack.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    for (const [k, v] of Object.entries(node)) {
      if (k === 'loc' || !v || typeof v !== 'object') continue;
      const list = Array.isArray(v) ? v : [v];
      list.forEach((x, i) => {
        if (!x || typeof x !== 'object' || Array.isArray(x)) return;
        const d = EXPR.has(x.kind) ? depth + 1 : 0;
        if (d > MAX_EXPR_DEPTH && !LEAF.has(x.kind)) {
          if (!said.has(root)) { said.add(root); report(x, EXPR_DEPTH_MESSAGE); }
          const zero = { kind: 'num', value: 0n, text: '0', loc: x.loc };
          if (Array.isArray(v)) v[i] = zero; else node[k] = zero;
          return;
        }
        stack.push({ node: x, depth: d, root: d === 1 ? x : root });
      });
    }
  }
}

// What no limit above catches (calls of functions inside long expressions inside nested statements: each limit kept, the
// stack ran out all the same; a test bench's recursion): the stack's overflow itself, one error of the source, not a
// RangeError out of checkC, simulateC or cToHdl.
export const DEEP_MESSAGE = 'the source nests too deep for Silinx HLS: its calls, statements and expressions together ran out of the stack (split its long expressions)';
export const isStackOverflow = (e) => e instanceof RangeError && /call stack/i.test(e.message);

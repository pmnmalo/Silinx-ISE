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

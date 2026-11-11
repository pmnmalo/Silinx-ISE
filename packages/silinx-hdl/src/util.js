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

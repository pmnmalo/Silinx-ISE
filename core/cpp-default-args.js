// Silinx HLS C++ (#2309): a function's default arguments, as tokens (after the templates): `= value` taken out of its
// parameters, each call that leaves them out given them. A function of the file's level; a method's stays refused by the
// parser. Isomorphic ES module.
//
//   cppDefaultArgs(tokens) -> tokens
import { closing, splitTop } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t) => t && t.t === 'id';
const NOT_TYPE = new Set(['return', 'else', 'case', 'goto', 'sizeof', 'throw', 'new', 'delete']);

/** A parameter's `=` at its own level, or -1. */
const defaultAt = (p) => {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    if (op(p[i], '<') || op(p[i], '(') || op(p[i], '[') || op(p[i], '{')) d++;
    else if (op(p[i], '>') || op(p[i], ')') || op(p[i], ']') || op(p[i], '}')) d--;
    else if (op(p[i], '>>')) d -= 2;
    else if (!d && op(p[i], '=')) return i;
  }
  return -1;
};

export function cppDefaultArgs(toks) {
  const funcs = new Map(), decls = new Set();
  let depth = 0;
  // (a function's declaration or definition at the file's level: `T name(…)` followed by ; or {)
  toks.forEach((t, k) => {
    if (op(t, '{')) depth++;
    if (op(t, '}')) depth--;
    if (depth || !isId(t) || !op(toks[k + 1], '(')) return;
    const prev = toks[k - 1];
    if (!(op(prev, '*') || op(prev, '&') || op(prev, '>') || (isId(prev) && !NOT_TYPE.has(prev.v)))) return;
    const c = closing(toks, k + 1);
    if (c < 0 || !(op(toks[c + 1], ';') || op(toks[c + 1], '{'))) return;
    decls.add(k);
    const params = splitTop(toks.slice(k + 2, c));
    const defs = params.map((p) => { const at = defaultAt(p); return at >= 2 ? p.slice(at + 1) : null; });
    if (defs.some(Boolean)) funcs.set(t.v, { n: params.length, defs: funcs.get(t.v)?.defs.map((d, i) => d || defs[i]) ?? defs });
  });
  if (!funcs.size) return toks;
  return calls(toks, 0, funcs, decls);
}

/** The calls of toks (from its index base in the whole: the declarations' places) given their missing arguments. */
function calls(toks, base, funcs, decls) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k], f = isId(t) && op(toks[k + 1], '(') && !op(toks[k - 1], '.') && !op(toks[k - 1], '->') ? funcs.get(t.v) : null;
    if (!f) { out.push(t); continue; }
    const c = closing(toks, k + 1), inner = toks.slice(k + 2, c), args = splitTop(inner).filter((a) => a.length);
    out.push(t, toks[k + 1]);
    if (decls.has(base + k)) {
      splitTop(inner).forEach((p, i) => { const at = defaultAt(p); if (i) out.push({ ...t, t: 'op', v: ',' }); out.push(...(at >= 2 ? p.slice(0, at) : p)); });
    } else {
      out.push(...calls(inner, base + k + 2, funcs, decls));
      for (let i = args.length; i < f.n; i++) if (f.defs[i]) { if (i) out.push({ ...t, t: 'op', v: ',' }); out.push(...f.defs[i].map((x) => ({ ...x, line: t.line, col: t.col, file: t.file }))); }
    }
    out.push(toks[c]);
    k = c;
  }
  return out;
}

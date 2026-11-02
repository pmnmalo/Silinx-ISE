// Silinx HLS (#2643): sizeof in the checker's constants (core/c-check.js's constValue): a loop bounded by an array's
// length, i < sizeof a / sizeof a[0], a count known as a literal bound's. Its bytes as synthesis makes them
// (core/c-flatten.js, core/c-dataflow-expr.js, #2641); a pointer's, an array parameter's, not a constant here: its 8
// bytes are seldom the length meant, and its loop's count is said unknown.
// Isomorphic ES module.
//
//   sizeofBytes(e, lookup, value) -> the bytes of a sizeof expression (BigInt), or null (lookup(name): { kind, type,
//   init }, the variable's; value(e): a constant expression's value, an array type's size)
import { sizeofType } from './c-flatten.js';
import { typeOf } from './c-types.js';

export function sizeofBytes(e, lookup, value) {
  let ty = e.type;
  if (!ty) {
    let b = e.e, depth = 0;
    while (b?.kind === 'index' || (b?.kind === 'unary' && b.op === '*')) { b = b.e; depth++; }
    const v = b?.kind === 'id' ? lookup(b.name) : null;
    if (!v?.type) return null;
    ty = sizeofType(v.type, depth, { param: v.kind === 'param', init: v.init }) ?? (depth ? null : v.type);
    if (!ty || ty.kind === 'ptr') return null;
  }
  let n = 1n;
  for (; ty?.kind === 'array'; ty = ty.of) {
    const k = ty.length ?? (ty.size ? value(ty.size) : null);
    if (k === null || k === undefined) return null;
    n *= BigInt(k);
  }
  if (ty?.kind === 'ptr' && !ty.ref) return 8n * n;
  const t = typeOf(ty);
  return t ? BigInt(Math.ceil(t.w / 8)) * n : null;
}

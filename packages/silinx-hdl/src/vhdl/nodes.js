// The VHDL parser's small helpers (#405), shared by parser.js and parse-expr.js: the expression nodes it builds, a
// bit string's value, the name an expression is of.
// --- small IR helpers --------------------------------------------------------

export const ref = (name) => ({ op: 'ref', name });
export const int = (v) => ({ op: 'int', value: String(v) });
export const bin = (o, a, b) => ({ op: 'binary', o, a, b });
/** Map a VHDL std_logic character string to IR bits (01xz). */
export function mapBits(s) {
  let out = '';
  for (const ch of s) {
    switch (ch.toUpperCase()) {
      case '0': case 'L': out += '0'; break;
      case '1': case 'H': out += '1'; break;
      case 'Z': out += 'z'; break;
      default: out += 'x';
    }
  }
  return out;
}
/** The name an expression is of (through its indices, slices and fields), or null. */
export function baseName(e) {
  while (e && (e.op === 'index' || e.op === 'slice' || e.op === 'field')) e = e.base;
  if (!e) return null;
  return e.op === 'apply' || e.op === 'ref' ? e.name : null;
}

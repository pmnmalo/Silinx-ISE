// Silinx HLS C++ (#2309): the size of a struct as g++ gives it on a 64-bit machine (its members in order, each at its
// natural alignment, the end at the largest's), for a test bench's sizeof(S), sizeof(array of S). Isomorphic ES module.
//
//   structBytes(S) -> { size, align }, or null when a member's size is not known here (S as core/c-struct.js has it)
import { constTokens } from './cpp-template.js';

const BYTES = { char: 1, bool: 1, short: 2, int: 4, long: 8, float: 4, double: 8, int8_t: 1, uint8_t: 1, int16_t: 2, uint16_t: 2, int32_t: 4, uint32_t: 4, int64_t: 8, uint64_t: 8, size_t: 8 };
const IGNORED = new Set(['const', 'volatile', 'static', 'signed', 'unsigned']);

function scalarBytes(type) {
  if (type.some((x) => x.t === 'op' && x.v === '*')) return 8;
  const words = type.map((x) => x.v).filter((v) => !IGNORED.has(v));
  if (!words.length) return 4;   // (unsigned alone)
  return words.every((w) => w in BYTES) ? BYTES[words[words.length - 1]] : null;
}

export function structBytes(S) {
  let size = 0, align = 1;
  for (const m of S.members) {
    const one = m.struct ? structBytes(m.struct) : (() => { const b = scalarBytes(m.type); return b === null ? null : { size: b, align: b }; })();
    if (!one) return null;
    let n = 1;
    for (const d of m.dims) { const v = constTokens(d); if (v === null) return null; n *= Number(v); }
    size = Math.ceil(size / one.align) * one.align + one.size * n;
    align = Math.max(align, one.align);
  }
  return { size: Math.ceil(size / align) * align, align };
}

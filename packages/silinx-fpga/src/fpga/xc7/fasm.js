// Silinx toolchain - FASM, the 7-series' "FPGA assembly" that nextpnr's xilinx micro-architecture writes (#3144): read
// as Project X-Ray's fasm library reads it (its grammar, fasm.tx), into the features a bitstream sets.
//
// A line: an optional feature, optional annotations ({ name = "value", … }), an optional comment (# …). A feature: its
// name (identifiers joined by dots), an optional address ([n] or [end:start]), an optional value (= 1, = 64'b0101…,
// = 'hFF, = 8'd10, = 'o17; underscores allowed). A value is no wider than the address: one bit without one.
// canonicalFeatures turns a feature into the single bits it sets, as the fasm library's canonical_features does: none
// for a value of 0, one per bit set of a range, the bit at address 0 named without its address.

const IDENT = '[a-zA-Z][0-9a-zA-Z_]*';
const VALUE = "(?:[0-9]+[ \\t]*)?'[ \\t]*[a-zA-Z]?[ \\t]*[0-9a-zA-Z_]*|[0-9_]+";
const LINE = new RegExp(`^[ \\t]*(?:(${IDENT}(?:\\.${IDENT})*)(?:\\[([0-9_]+)(?::([0-9_]+))?\\])?[ \\t]*(?:=[ \\t]*(${VALUE}))?)?` +
  '[ \\t]*(\\{[^}]*\\})?[ \\t]*(#.*)?$');
const ANNOTATION = /^[.a-zA-Z][0-9a-zA-Z_]*[ \t]*=[ \t]*"(?:[^"\\]|\\[\\"])*"$/;
const DIGITS = { h: /^[0-9a-fA-F_]+$/, b: /^[01_]+$/, d: /^[0-9_]+$/, o: /^[0-7_]+$/ };
const PREFIX = { h: '0x', b: '0b', d: '', o: '0o' };

/** A FASM error at a line (1-based) of the text. */
export class FasmError extends Error {
  constructor(message, line) { super(line ? `FASM line ${line}: ${message}` : message); this.name = 'FasmError'; this.line = line; }
}

const num = s => BigInt(s.replace(/_/g, ''));

// a value: a plain decimal, or Verilog's [width]'<base><digits>; { width, value } (BigInt)
function parseValue(text, line) {
  const m = /^(?:([0-9]+)[ \t]*)?'[ \t]*([hbdo])[ \t]*([0-9a-zA-Z_]+)$/.exec(text);
  const ok = m ? DIGITS[m[2]].test(m[3]) && /[^_]/.test(m[3]) : /^[0-9_]*[0-9][0-9_]*$/.test(text);
  if (!ok) throw new FasmError(`not a value: ${text}`, line);
  if (!m) return { width: null, value: num(text) };
  const value = BigInt(PREFIX[m[2]] + m[3].replace(/_/g, ''));
  const width = m[1] === undefined ? null : Number(m[1]);
  if (width !== null && value >= 1n << BigInt(width)) throw new FasmError(`the value ${text} is wider than ${width} bits`, line);
  return { width, value };
}

/**
 * The features of a FASM text, one per line that sets one: { feature, start, end, value (BigInt), line, text } (start
 * and end the address's bits, null without one; end null for a single address). Throws FasmError at a line that is
 * not FASM.
 */
export function parseFasm(text) {
  const out = [];
  const lines = String(text).split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const src = lines[i], line = i + 1;
    const m = LINE.exec(src);
    if (!m) throw new FasmError(`not FASM: ${src.trim()}`, line);
    const [, feature, a1, a2, valueText, annotations] = m;
    if (annotations && !annotations.slice(1, -1).trim().split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).every(a => ANNOTATION.test(a.trim()))) {
      throw new FasmError(`not an annotation: ${annotations}`, line);
    }
    if (!feature) continue;
    let start = null, end = null, width = 1;
    if (a1 !== undefined) {
      if (a2 !== undefined) { end = Number(num(a1)); start = Number(num(a2)); width = end - start + 1; } else start = Number(num(a1));
      if (width < 1) throw new FasmError(`the address [${a1}:${a2}] runs backwards`, line);
    }
    let value = 1n;
    if (valueText !== undefined) {
      const v = parseValue(valueText, line);
      if (v.width !== null && v.width > width) throw new FasmError(`the value ${valueText} is wider than the feature's ${width} bit${width > 1 ? 's' : ''}`, line);
      if (v.value >= 1n << BigInt(width)) throw new FasmError(`the value ${valueText} does not fit the feature's ${width} bit${width > 1 ? 's' : ''}`, line);
      value = v.value;
    }
    out.push({ feature, start, end, value, line, text: src.trim() });
  }
  return out;
}

/** The single bits a feature sets: [{ feature, address }] (address 0 for a feature without one, or its bit 0). */
export function canonicalFeatures(f) {
  if (f.value === 0n) return [];
  if (f.end === null) return [{ feature: f.feature, address: f.start ?? 0 }];
  const out = [];
  for (let a = f.start; a <= f.end; a++) if ((f.value >> BigInt(a - f.start)) & 1n) out.push({ feature: f.feature, address: a });
  return out;
}

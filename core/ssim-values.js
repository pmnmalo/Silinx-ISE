// SSim's times and values as the user types them (out of web/js/isim.js, #2674, so that the server reads them too):
// a time with its unit (10 ns, 1.5us), a value for a signal of a type in a radix (bin, hex, oct, dec, ascii; VHDL and
// Verilog literals; an enumeration's name, a boolean).
import * as V from './values.js';

export const UNITS = { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6, ms: 1e9 };

export function parseTime(str, defUnit = 'ns') {
  const m = /^\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*(fs|ps|ns|us|ms|s)?\s*$/i.exec(String(str));
  if (!m) return NaN;
  const u = (m[2] || defUnit).toLowerCase();
  const mul = u === 's' ? 1e12 : UNITS[u];
  return Math.round(parseFloat(m[1]) * mul);
}

// Parse a user-entered value for a signal. radix: bin|hex|oct|dec|udec|sdec|c1dec|ascii|default
export function parseValue(text, t, radix = 'default') {
  let s = String(text).trim();
  if (!s) throw new Error('empty value');
  const w = t.w || 1;
  if (t.kind === 'enum') {
    const i = t.names.findIndex(n => n.toLowerCase() === s.toLowerCase());
    if (i >= 0) return V.fromInt(i, w, false);
  }
  if (t.kind === 'bool') {
    if (/^true$/i.test(s)) return V.ONE;
    if (/^false$/i.test(s)) return V.ZERO;
  }
  // Verilog literal  8'hFF / 'b1010
  let m = /^(\d*)'([sS]?)([bBhHdDoO])([0-9a-fA-FxXzZ_?]+)$/.exec(s);
  if (m) { radix = { b: 'bin', h: 'hex', d: 'dec', o: 'oct' }[m[3].toLowerCase()]; s = m[4]; }
  // VHDL literal x"0F" / "0101" / '1'
  m = /^([xXoObB]?)["']([0-9a-fA-FxXzZuUwWlLhH_-]+)["']$/.exec(s);
  if (m) { radix = { x: 'hex', o: 'oct', b: 'bin', '': 'bin' }[m[1].toLowerCase()]; s = m[2]; }
  m = /^0x([0-9a-fA-F_]+)$/.exec(s);
  if (m) { radix = 'hex'; s = m[1]; }
  s = s.replace(/_/g, '');
  if (radix === 'default') radix = (t.kind === 'int' || t.kind === 'enum') ? 'dec' : 'bin';
  const ones = radix === 'c1dec';
  if (radix === 'udec' || radix === 'sdec' || ones) radix = 'dec';
  let val;
  if (radix === 'bin' || radix === 'hex' || radix === 'oct') {
    const per = radix === 'bin' ? 1 : radix === 'hex' ? 4 : 3;
    let bits = '';
    for (const c0 of s) {
      const c = c0.toLowerCase();
      if (c === 'x' || c === 'u' || c === 'w' || c === '-') bits += 'x'.repeat(per);
      else if (c === 'z') bits += 'z'.repeat(per);
      else if (c === 'l') bits += '0';
      else if (c === 'h' && per === 1) bits += '1';
      else {
        const d = parseInt(c, radix === 'bin' ? 2 : radix === 'hex' ? 16 : 8);
        if (isNaN(d)) throw new Error(`invalid ${radix} digit '${c0}'`);
        bits += d.toString(2).padStart(per, '0');
      }
    }
    val = V.fromBits(bits);
    // single x/z digit extends to full width
    if (s.length === 1 && /[xzuw-]/i.test(s)) val = V.fromBits(s[0].toLowerCase() === 'z' ? 'z'.repeat(w) : 'x'.repeat(w));
  } else if (radix === 'dec') {
    if (!/^-?\d+$/.test(s)) throw new Error(`invalid decimal value '${s}'`);
    const n = ones && s[0] === '-' ? ~BigInt(s.slice(1)) : BigInt(s);
    val = V.mk(w, BigInt.asUintN(w, n), 0n, t.s);
  } else if (radix === 'ascii') {
    let n = 0n;
    for (const c of s) n = (n << 8n) | BigInt(c.charCodeAt(0) & 255);
    val = V.mk(Math.max(8, s.length * 8), n);
  } else throw new Error(`unknown radix '${radix}'`);
  return V.withSign(V.resize({ ...val, s: false }, w, false), !!t.s);
}

// Silinx simulator - strings and formatting (#405: out of core/interp.js): a value as a string or an image, a
// time, $display's format, a string as a value.
import * as V from './values.js';
import {
  evalE, isStr
} from './interp.js';

// ---------------- strings / formatting ----------------
export function toStr(v, t) {
  if (isStr(v)) return v.str;
  if (t && t.char && !Array.isArray(v)) return v.x ? '?' : String.fromCharCode(Number(v.v));
  if (Array.isArray(v)) return '(' + v.map((e, k) => toStr(e, t?.fields ? t.fields[k].t : t?.elem)).join(', ') + ')';
  return imageOf(v, t);
}

export function imageOf(v, t) {
  if (isStr(v)) return v.str;
  if (!t) return V.toDec(v);
  switch (t.kind) {
    case 'enum':
      if (t.char) return v.x ? "'?'" : `'${String.fromCharCode(Number(v.v))}'`;
      return v.x ? 'U' : (t.names[Number(v.v)] ?? V.toDec(v));
    case 'bool': return v.x ? 'X' : (v.v ? 'true' : 'false');
    case 'int': return V.toDec(v, true);
    case 'time': return v.x ? 'X' : formatTime(Number(V.toBig(v)));
    case 'real': { const x = V.toReal(v); return Number.isInteger(x) ? x.toFixed(1) : String(x); }
    case 'logic': return t.w === 1 && t.scalar ? `'${V.toBin(v).toUpperCase()}'` : V.toBin(v).toUpperCase();
    default: return V.toDec(v);
  }
}

export function formatTime(ps) {
  if (ps % 1e6 === 0 && ps !== 0) return `${ps / 1e6} us`;
  if (ps % 1000 === 0) return `${ps / 1000} ns`;
  return `${ps} ps`;
}

// Verilog $display-style formatting.
export function formatDisplay(args, ctx, defaultRadix = 'd') {
  let out = '';
  let i = 0;
  const nextVal = () => {
    const a = args[i++];
    return a ? { v: evalE(a, ctx), t: a.t } : { v: { str: '' } };
  };
  while (i < args.length) {
    const a = args[i];
    if (a.k === 'str' || (a.k === 'c' && isStr(a.val))) {
      i++;
      const fmt = a.k === 'str' ? a.value : a.val.str;
      for (let k = 0; k < fmt.length; k++) {
        const ch = fmt[k];
        if (ch !== '%') { out += ch; continue; }
        let j = k + 1, width = '', prec = '';
        while (/[0-9]/.test(fmt[j] || '')) width += fmt[j++];
        if (fmt[j] === '.') { j++; while (/[0-9]/.test(fmt[j] || '')) prec += fmt[j++]; }
        const spec = (fmt[j] || '').toLowerCase();
        k = j;
        if (spec === '%') { out += '%'; continue; }
        if (spec === 'm') { out += ctx.scopeName || ''; continue; }
        const { v, t } = nextVal();
        out += fmtOne(v, t, spec, width, ctx, prec);
      }
    } else {
      const { v, t } = nextVal();
      out += fmtOne(v, t, defaultRadix, '', ctx);
    }
  }
  return out;
}

function fmtOne(v, t, spec, width, ctx, prec = '') {
  if (isStr(v)) return v.str;
  if (Array.isArray(v)) return toStr(v, t);
  let s;
  if ((spec === 'f' || spec === 'e' || spec === 'g') || (t && t.kind === 'real' && spec === 'd')) {
    const x = V.toReal(v), p = prec === '' ? 6 : +prec;
    // %e: C-style exponent with at least two digits (1.500000e+00)
    s = spec === 'e' ? x.toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2') : spec === 'g' ? String(x) : x.toFixed(spec === 'd' ? 0 : p);
    return width !== '' && width !== '0' ? s.padStart(+width, ' ') : s;
  }
  switch (spec) {
    case 'b': s = V.toBin(v); break;
    case 'h': case 'x': s = V.toHex(v).toLowerCase(); if (width === '') s = s.padStart(Math.ceil(v.w / 4), '0'); break;
    case 'o': s = v.x ? 'x' : v.v.toString(8); if (width === '') s = s.padStart(Math.ceil(v.w / 3), '0'); break;
    case 'c': s = v.x ? '?' : String.fromCharCode(Number(v.v & 255n)); break;
    case 's': { let b = v.v, str = ''; while (b > 0n) { str = String.fromCharCode(Number(b & 255n)) + str; b >>= 8n; } s = str; break; }
    case 't': s = V.toDec(v); break;
    case 'd': default:
      s = t && t.kind === 'enum' ? imageOf(v, t) : V.toDec(v, v.s);
      if (width === '' && t && t.kind !== 'enum') s = s.padStart(Math.ceil(v.w * Math.log10(2)) + (v.s ? 1 : 0), ' ');
  }
  // %5d pads with blanks, %05d (a leading zero) with zeros, as Icarus and the commercial simulators do
  if (width !== '' && width !== '0') s = s.padStart(+width, spec === 'd' && !/^0\d/.test(width) ? ' ' : '0');
  return s;
}

// Convert a Verilog string literal value to bits (8 bits per char) when used as a vector.
export function strToVal(str) {
  let v = 0n;
  for (const ch of str) v = (v << 8n) | BigInt(ch.charCodeAt(0) & 255);
  return V.mk(Math.max(8, str.length * 8), v);
}

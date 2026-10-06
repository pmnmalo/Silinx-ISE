// XAIlinx - VHDL lexer.
//
// Produces a flat token array. Each token: { type, value, line, col, ... }
//   type 'id'     identifier (value lower-cased, `raw` keeps the original spelling)
//   type 'kw'     reserved word (value lower-cased)
//   type 'int'    integer literal (value: decimal string; covers based literals 16#FF#)
//   type 'real'   real literal (value: number)
//   type 'char'   character literal '0' (value: the single character, case kept)
//   type 'str'    string literal (value: contents with "" un-escaped, case kept)
//   type 'bitstr' bit-string literal x"FF", 8x"FF", b"0101" (value: bits MSB first in 01xz-;
//                 non-binary characters such as X/Z/- are kept upper-cased in `value`
//                 and mapped later by the parser), `signed` true for sx"..".
//   type 'op'     delimiter / operator (value: the symbol)
//   type 'eof'
//
// Pure ES module, no Node-specific APIs (runs in the browser too).

export const KEYWORDS = new Set([
  'abs', 'access', 'after', 'alias', 'all', 'and', 'architecture', 'array', 'assert',
  'attribute', 'begin', 'block', 'body', 'buffer', 'bus', 'case', 'component',
  'configuration', 'constant', 'context', 'disconnect', 'downto', 'else', 'elsif', 'end',
  'entity', 'exit', 'file', 'for', 'function', 'generate', 'generic', 'group', 'guarded',
  'if', 'impure', 'in', 'inertial', 'inout', 'is', 'label', 'library', 'linkage',
  'literal', 'loop', 'map', 'mod', 'nand', 'new', 'next', 'nor', 'not', 'null', 'of',
  'on', 'open', 'or', 'others', 'out', 'package', 'port', 'postponed', 'procedure',
  'process', 'pure', 'range', 'record', 'register', 'reject', 'rem', 'report', 'return',
  'rol', 'ror', 'select', 'severity', 'signal', 'shared', 'sla', 'sll', 'sra', 'srl',
  'subtype', 'then', 'to', 'transport', 'type', 'unaffected', 'units', 'until', 'use',
  'variable', 'wait', 'when', 'while', 'with', 'xnor', 'xor', 'protected',
]);

// Multi-character delimiters, longest first.
const OPS3 = ['?/=', '?<=', '?>='];
const OPS2 = ['=>', '**', ':=', '/=', '>=', '<=', '<>', '??', '?=', '?<', '?>'];
const OPS1 = '&()*+,-./:;<=>|[]@?^';

const isDigit = (c) => c >= '0' && c <= '9';
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isIdChar = (c) => isLetter(c) || isDigit(c) || c === '_';

const BITSTR_PREFIX = new Set(['b', 'o', 'x', 'd', 'ub', 'uo', 'ux', 'sb', 'so', 'sx']);

/**
 * Expand the body of a bit-string literal into a bit string (MSB first).
 * Characters that are not digits of the base (e.g. X, Z, -) are replicated
 * to the digit width, as VHDL-2008 specifies.
 */
function expandBitString(base, body, size, signed, err) {
  const digits = body.replace(/_/g, '');
  let bits = '';
  if (base === 'd') {
    if (!/^[0-9]*$/.test(digits)) { err('invalid decimal bit-string literal'); return '0'; }
    bits = digits.length ? BigInt(digits).toString(2) : '';
  } else {
    const w = base === 'b' ? 1 : base === 'o' ? 3 : 4;
    const radix = base === 'b' ? 2 : base === 'o' ? 8 : 16;
    for (const ch of digits) {
      const v = parseInt(ch, radix);
      if (!Number.isNaN(v) && /[0-9a-fA-F]/.test(ch)) bits += v.toString(2).padStart(w, '0');
      else bits += ch.toUpperCase().repeat(w);
    }
  }
  if (size != null) {
    if (bits.length < size) {
      const fill = signed && bits.length ? bits[0] : '0';
      bits = fill.repeat(size - bits.length) + bits;
    } else if (bits.length > size) {
      bits = bits.slice(bits.length - size);
    }
  } else if (base === 'd' && bits === '') {
    bits = '';
  }
  return bits;
}

/** Convert a digit string in `base` (may contain a fraction) to a value. */
function basedValue(base, digits, exp) {
  const [ip, fp] = digits.split('.');
  if (fp === undefined) {
    let v = 0n;
    for (const ch of ip) v = v * BigInt(base) + BigInt(parseInt(ch, 36));
    if (exp > 0) v *= BigInt(base) ** BigInt(exp);
    return { int: true, value: v.toString() };
  }
  let v = 0;
  for (const ch of ip) v = v * base + parseInt(ch, 36);
  let scale = 1 / base;
  for (const ch of fp) { v += parseInt(ch, 36) * scale; scale /= base; }
  return { int: false, value: v * Math.pow(base, exp) };
}

/**
 * Tokenize VHDL source.
 * @returns {{ tokens: object[], errors: {line, col, message, severity}[] }}
 */
export function lex(src) {
  const tokens = [];
  const errors = [];
  let i = 0, line = 1, col = 1;
  const n = src.length;

  const err = (message, l = line, c = col) => errors.push({ line: l, col: c, message, severity: 'error' });
  const adv = (k = 1) => {
    for (let j = 0; j < k && i < n; j++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  };
  const push = (tok) => { tokens.push(tok); return tok; };
  const prev = () => tokens[tokens.length - 1];

  while (i < n) {
    const c = src[i];
    // whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\v' || c === ' ') { adv(); continue; }
    // comments
    if (c === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const l0 = line, c0 = col;
      adv(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) adv();
      if (i >= n) err('unterminated block comment', l0, c0); else adv(2);
      continue;
    }
    const l0 = line, c0 = col;

    // identifiers, keywords, prefixed bit-strings
    if (isLetter(c)) {
      let j = i;
      while (j < n && isIdChar(src[j])) j++;
      const raw = src.slice(i, j);
      const low = raw.toLowerCase();
      if (src[j] === '"' && BITSTR_PREFIX.has(low)) {
        adv(j - i);
        lexBitString(null, low, l0, c0);
        continue;
      }
      adv(j - i);
      if (raw.endsWith('_') || raw.includes('__')) err(`invalid identifier '${raw}'`, l0, c0);
      push({ type: KEYWORDS.has(low) ? 'kw' : 'id', value: low, raw, line: l0, col: c0 });
      continue;
    }
    // extended identifier \foo bar\
    if (c === '\\') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') { if (src[j + 1] === '\\') { s += '\\'; j += 2; continue; } break; }
        s += src[j]; j++;
      }
      if (src[j] !== '\\') { err('unterminated extended identifier'); adv(j - i); continue; }
      adv(j - i + 1);
      push({ type: 'id', value: s.toLowerCase(), raw: s, extended: true, line: l0, col: c0 });
      continue;
    }
    // numbers (decimal, real, based, sized bit-string)
    if (isDigit(c)) {
      let j = i;
      while (j < n && (isDigit(src[j]) || src[j] === '_')) j++;
      const intPart = src.slice(i, j).replace(/_/g, '');
      // sized bit-string 8x"FF", 12ub"..."
      const m = /^([a-zA-Z]{1,2})"/.exec(src.slice(j, j + 3));
      if (m && BITSTR_PREFIX.has(m[1].toLowerCase())) {
        adv(j - i + m[1].length);
        lexBitString(parseInt(intPart, 10), m[1].toLowerCase(), l0, c0);
        continue;
      }
      // based literal
      if (src[j] === '#') {
        const delim = src[j];
        const base = parseInt(intPart, 10);
        let k = j + 1;
        while (k < n && (/[0-9a-zA-Z_.]/.test(src[k]))) k++;
        if (src[k] !== delim || base < 2 || base > 16) {
          err('malformed based literal', l0, c0);
          adv(Math.max(1, k - i));
          push({ type: 'int', value: '0', line: l0, col: c0 });
          continue;
        }
        const digits = src.slice(j + 1, k).replace(/_/g, '');
        k++;
        let exp = 0;
        if (src[k] === 'e' || src[k] === 'E') {
          const em = /^[eE]([+-]?)(\d[\d_]*)/.exec(src.slice(k));
          if (em) { exp = parseInt(em[2].replace(/_/g, ''), 10) * (em[1] === '-' ? -1 : 1); k += em[0].length; }
        }
        const okDigits = [...digits].every((ch) => ch === '.' || (parseInt(ch, 36) < base));
        if (!okDigits) err(`invalid digit in base-${base} literal`, l0, c0);
        adv(k - i);
        const v = okDigits ? basedValue(base, digits, exp) : { int: true, value: '0' };
        if (v.int && exp >= 0) push({ type: 'int', value: v.value, line: l0, col: c0 });
        else push({ type: 'real', value: Number(v.value), line: l0, col: c0 });
        continue;
      }
      let isReal = false;
      let text = intPart;
      if (src[j] === '.' && isDigit(src[j + 1] || '')) {
        isReal = true;
        let k = j + 1;
        while (k < n && (isDigit(src[k]) || src[k] === '_')) k++;
        text += '.' + src.slice(j + 1, k).replace(/_/g, '');
        j = k;
      }
      let exp = 0, hasExp = false;
      if (src[j] === 'e' || src[j] === 'E') {
        const em = /^[eE]([+-]?)(\d[\d_]*)/.exec(src.slice(j));
        if (em) {
          hasExp = true;
          exp = parseInt(em[2].replace(/_/g, ''), 10) * (em[1] === '-' ? -1 : 1);
          j += em[0].length;
        }
      }
      adv(j - i);
      if (isReal) {
        push({ type: 'real', value: Number(text) * Math.pow(10, exp), line: l0, col: c0 });
      } else if (hasExp && exp < 0) {
        push({ type: 'real', value: Number(text) * Math.pow(10, exp), line: l0, col: c0 });
      } else {
        let v = BigInt(text || '0');
        if (hasExp) v *= 10n ** BigInt(exp);
        push({ type: 'int', value: v.toString(), line: l0, col: c0 });
      }
      continue;
    }
    // string literal
    if (c === '"') {
      const r = readString(i);
      adv(r.end - i);
      push({ type: 'str', value: r.value, line: l0, col: c0 });
      continue;
    }
    // character literal vs attribute tick
    if (c === "'") {
      const p = prev();
      const tickContext = p && (p.type === 'id' || (p.type === 'op' && (p.value === ')' || p.value === ']')));
      // `t'('a')` : after an identifier a tick followed by '(' is always a qualifier tick.
      if (!tickContext && src[i + 2] === "'" && i + 1 < n && src[i + 1] !== '\n') {
        push({ type: 'char', value: src[i + 1], line: l0, col: c0 });
        adv(3);
        continue;
      }
      push({ type: 'op', value: "'", line: l0, col: c0 });
      adv();
      continue;
    }
    // operators / delimiters
    const s3 = src.slice(i, i + 3), s2 = src.slice(i, i + 2);
    if (OPS3.includes(s3)) { push({ type: 'op', value: s3, line: l0, col: c0 }); adv(3); continue; }
    if (OPS2.includes(s2)) { push({ type: 'op', value: s2, line: l0, col: c0 }); adv(2); continue; }
    if (OPS1.includes(c)) { push({ type: 'op', value: c, line: l0, col: c0 }); adv(); continue; }
    // `#` outside a based literal, `$`, etc.
    err(`unexpected character '${c}'`);
    adv();
  }
  tokens.push({ type: 'eof', value: '', line, col });
  return { tokens, errors };

  // --- helpers that need the closure state ---------------------------------
  function readString(start) {
    let j = start + 1, value = '';
    for (;;) {
      if (j >= n || src[j] === '\n') { err('unterminated string literal'); return { value, end: j }; }
      if (src[j] === '"') {
        if (src[j + 1] === '"') { value += '"'; j += 2; continue; }
        return { value, end: j + 1 };
      }
      value += src[j]; j++;
    }
  }

  function lexBitString(size, prefix, l0, c0) {
    // i points at the opening quote
    const r = readString(i);
    adv(r.end - i);
    const signed = prefix[0] === 's';
    const base = prefix[prefix.length - 1];
    const bits = expandBitString(base, r.value, size, signed, (m) => err(m, l0, c0));
    push({ type: 'bitstr', value: bits, base, size, signed, line: l0, col: c0 });
  }
}

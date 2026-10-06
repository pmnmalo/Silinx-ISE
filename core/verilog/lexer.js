// Verilog-2001 lexer with a minimal preprocessor (`define, `ifdef/`ifndef/`else/`elsif/`endif,
// `timescale, `include ignored with a warning, `default_nettype ignored).

const KEYWORDS = new Set(`module endmodule macromodule input output inout wire reg logic integer genvar parameter localparam
assign always always_ff always_comb always_latch initial begin end if else case casez casex endcase default for while repeat forever
posedge negedge or and not generate endgenerate function endfunction task endtask signed unsigned
supply0 supply1 tri wait disable automatic real realtime time defparam`.split(/\s+/));

const OPS = ['<<<=', '>>>=', '++', '--', '+=', '-=', '|=', '&=', '^=', '===', '!==', '<<<', '>>>', '~&', '~|', '~^', '^~', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '**', '+:', '-:', '->',
  '+', '-', '*', '/', '%', '<', '>', '!', '~', '&', '|', '^', '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '=', '#', '@'];

const UNIT = { s: 1e12, ms: 1e9, us: 1e6, ns: 1e3, ps: 1, fs: 1e-3 };

export function tokenize(src, file, errors) {
  const toks = [];
  const defines = new Map();
  const cond = []; // stack of { active, taken }
  let timescale;
  const active = () => cond.every(c => c.active);
  let i = 0, line = 1, col = 1;
  const err = (msg, l = line, c = col, sev = 'error') => errors.push({ file, line: l, col: c, message: msg, severity: sev });

  function adv(n = 1) {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') { line++; col = 1; } else col++;
      i++;
    }
  }

  function restOfLine() {
    let s = '';
    while (i < src.length && src[i] !== '\n') {
      if (src[i] === '\\' && src[i + 1] === '\n') { adv(2); s += ' '; continue; }
      if (src[i] === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); break; }
      s += src[i]; adv();
    }
    return s;
  }

  while (i < src.length) {
    const c = src[i];
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r' || c === '\f') { adv(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      adv(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv();
      adv(2); continue;
    }
    const l0 = line, c0 = col;
    // Verilog-2001 attribute instances (* ... *) are ignored (but not @(*)).
    if (c === '(' && src[i + 1] === '*' && src[i + 2] !== ')' && !(toks.length && toks[toks.length - 1].v === '@')) {
      adv(2);
      while (i < src.length && !(src[i] === '*' && src[i + 1] === ')')) adv();
      adv(2); continue;
    }
    if (c === '`') {
      adv();
      let name = '';
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) { name += src[i]; adv(); }
      if (name === 'ifdef' || name === 'ifndef') {
        const m = restOfLine().trim().split(/\s+/)[0];
        const d = defines.has(m);
        const on = name === 'ifdef' ? d : !d;
        cond.push({ active: on, taken: on });
      } else if (name === 'elsif') {
        const m = restOfLine().trim().split(/\s+/)[0];
        const top = cond[cond.length - 1];
        if (!top) { err('`elsif without `ifdef'); continue; }
        top.active = !top.taken && defines.has(m);
        top.taken ||= top.active;
      } else if (name === 'else') {
        const top = cond[cond.length - 1];
        if (!top) { err('`else without `ifdef'); continue; }
        top.active = !top.taken; top.taken = true;
      } else if (name === 'endif') {
        if (!cond.pop()) err('`endif without `ifdef');
      } else if (!active()) {
        restOfLine();
      } else if (name === 'define') {
        const body = restOfLine().trim();
        const m = /^([A-Za-z_][A-Za-z0-9_]*)(\([^)]*\))?\s*(.*)$/.exec(body);
        if (!m) { err('bad `define'); continue; }
        if (m[2]) err(`macro with arguments '${m[1]}' not supported`, l0, c0, 'warning');
        defines.set(m[1], m[3] || '');
      } else if (name === 'undef') {
        defines.delete(restOfLine().trim());
      } else if (name === 'timescale') {
        const m = /^\s*(\d+)\s*(s|ms|us|ns|ps|fs)\s*\/\s*(\d+)\s*(s|ms|us|ns|ps|fs)/.exec(restOfLine());
        if (m) timescale = { unit: +m[1] * UNIT[m[2]], precision: +m[3] * UNIT[m[4]] };
        else err('bad `timescale');
      } else if (name === 'include') {
        err('`include is not supported (add the file to the project instead)', l0, c0, 'warning');
        restOfLine();
      } else if (['default_nettype', 'resetall', 'celldefine', 'endcelldefine', 'unconnected_drive', 'nounconnected_drive'].includes(name)) {
        restOfLine();
      } else if (defines.has(name)) {
        const sub = tokenize(defines.get(name), file, errors);
        for (const t of sub.tokens) { if (t.t !== 'eof') toks.push({ ...t, line: l0, col: c0 }); }
      } else {
        err(`undefined macro \`${name}`, l0, c0);
      }
      continue;
    }
    if (!active()) { adv(); continue; }

    // identifiers / keywords / system names
    if (/[A-Za-z_$]/.test(c)) {
      let s = '';
      while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) { s += src[i]; adv(); }
      if (s[0] === '$') toks.push({ t: 'sys', v: s, line: l0, col: c0 });
      else toks.push({ t: KEYWORDS.has(s) ? 'kw' : 'id', v: s, line: l0, col: c0 });
      continue;
    }
    if (c === '\\') { // escaped identifier
      adv(); let s = '';
      while (i < src.length && !/\s/.test(src[i])) { s += src[i]; adv(); }
      toks.push({ t: 'id', v: s, line: l0, col: c0 });
      continue;
    }
    // numbers: [size]'[s]base digits | decimal | real
    if (/[0-9']/.test(c)) {
      let size = '';
      if (c !== "'") {
        while (i < src.length && /[0-9_]/.test(src[i])) { size += src[i]; adv(); }
        // real?
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) {
          let s = size + '.'; adv();
          while (/[0-9_]/.test(src[i] || '')) { s += src[i]; adv(); }
          if (/[eE]/.test(src[i] || '')) { s += 'e'; adv(); if (/[+-]/.test(src[i])) { s += src[i]; adv(); } while (/[0-9]/.test(src[i] || '')) { s += src[i]; adv(); } }
          toks.push({ t: 'real', v: parseFloat(s.replace(/_/g, '')), line: l0, col: c0 });
          continue;
        }
        // allow whitespace between size and '
        let j = i; while (src[j] === ' ' || src[j] === '\t') j++;
        if (src[j] !== "'" || !/[sSbBoOdDhH]/.test(src[j + 1] || '')) {
          toks.push({ t: 'int', v: size.replace(/_/g, ''), line: l0, col: c0 });
          continue;
        }
        while (i < j) adv();
      }
      // at '
      adv();
      let signed = false;
      if (src[i] === 's' || src[i] === 'S') { signed = true; adv(); }
      const base = (src[i] || '').toLowerCase();
      if (!'bodh'.includes(base) || !base) {
        // unbased unsized '0 '1 'x 'z (SystemVerilog)
        if (/[01xzXZ]/.test(src[i] || '')) { const d = src[i].toLowerCase(); adv(); toks.push({ t: 'fill', v: d, line: l0, col: c0 }); continue; }
        err('bad number literal', l0, c0); continue;
      }
      adv();
      while (src[i] === ' ' || src[i] === '\t') adv();
      let digits = '';
      while (i < src.length && /[0-9a-fA-FxXzZ?_]/.test(src[i])) { digits += src[i]; adv(); }
      digits = digits.replace(/_/g, '').toLowerCase();
      toks.push({ t: 'based', size: size ? parseInt(size.replace(/_/g, ''), 10) : null, signed, base, digits, line: l0, col: c0 });
      continue;
    }
    if (c === '"') {
      adv(); let s = '';
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\') {
          adv(); const e = src[i];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e; adv(); continue;
        }
        if (src[i] === '\n') { err('unterminated string'); break; }
        s += src[i]; adv();
      }
      adv();
      toks.push({ t: 'str', v: s, line: l0, col: c0 });
      continue;
    }
    const op = OPS.find(o => src.startsWith(o, i));
    if (op) { adv(op.length); toks.push({ t: 'op', v: op === '^~' ? '~^' : op, line: l0, col: c0 }); continue; }
    err(`unexpected character '${c}'`); adv();
  }
  if (cond.length) err('missing `endif');
  toks.push({ t: 'eof', v: '', line, col });
  return { tokens: toks, timescale, defines };
}

// Convert a based literal token into IR bits (MSB first).
export function basedToBits(tok) {
  const { base, digits } = tok;
  let bits = '';
  if (base === 'd') {
    if (/[xz?]/.test(digits)) {
      bits = digits[0] === '?' ? 'z' : digits[0];
      const w = tok.size || 32;
      return { bits: bits.repeat(w), sized: !!tok.size };
    }
    bits = BigInt(digits || '0').toString(2);
  } else {
    const per = base === 'b' ? 1 : base === 'o' ? 3 : 4;
    for (const d of digits) {
      if (d === 'x' || d === 'z' || d === '?') bits += (d === '?' ? 'z' : d).repeat(per);
      else bits += parseInt(d, per === 1 ? 2 : per === 3 ? 8 : 16).toString(2).padStart(per, '0');
    }
  }
  if (!bits) bits = '0';
  let w = tok.size;
  const sized = !!w;
  if (!w) w = Math.max(32, bits.length);
  if (bits.length > w) bits = bits.slice(bits.length - w);
  else if (bits.length < w) {
    const pad = bits[0] === 'x' || bits[0] === 'z' ? bits[0] : '0';
    bits = pad.repeat(w - bits.length) + bits;
  }
  return { bits, sized };
}

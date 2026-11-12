// Verilog-2001 lexer with a minimal preprocessor (`define with or without arguments, `undef,
// `ifdef/`ifndef/`else/`elsif/`endif, `timescale, `include of project files, `default_nettype ignored).
// Each token: { t, v, line, col, ... }; a token on one line also has `end` (the column just after
// it) and `at` (its offset in the source: tokenText gives its text, for a message; only numbers are
// kept in the tokens, #189).

import { tokenText } from '../util.js';
export { tokenText };   // (core/util.js's: the source text of a token on one line, for a message, from its offset, #189)

export const KEYWORDS = new Set(`module endmodule macromodule input output inout wire reg logic integer genvar parameter localparam
assign always always_ff always_comb always_latch initial begin end if else case casez casex endcase default for while repeat forever
posedge negedge or and not generate endgenerate function endfunction task endtask signed unsigned
supply0 supply1 tri wait disable fork join automatic real realtime time defparam
nand nor xor xnor buf bufif0 bufif1 notif0 notif1 event wand wor triand trior tri0 tri1 specify endspecify`.split(/\s+/));

const KW_MAX = Math.max(...[...KEYWORDS].map(k => k.length));

const OPS = ['<<<=', '>>>=', '<<=', '>>=', '*=', '/=', '%=', '++', '--', '+=', '-=', '|=', '&=', '^=', '===', '!==', '<<<', '>>>', '~&', '~|', '~^', '^~', '==', '!=', '<=', '>=', '&&', '||', '<<', '>>', '**', '+:', '-:', '->', '::',
  '+', '-', '*', '/', '%', '<', '>', '!', '~', '&', '|', '^', '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}', '=', '#', '@'];

// the limits of the macros' expansions (#3556): nested expansions (a macro used in its own body), and
// the text the macros add, over a file and the files it includes
const MAX_DEPTH = 1000, MAX_TEXT = 1 << 23;

const UNIT = { s: 1e12, ms: 1e9, us: 1e6, ns: 1e3, ps: 1, fs: 1e-3 };

// opts.include(name): the text of an `include file (null: not found); opts.defines: the macro table
// (shared with included files and macro bodies).
export function tokenize(src, file, errors, opts = {}) {
  const toks = [];
  const defines = opts.defines || new Map();   // name -> { params: [names] | null, body }
  const cond = []; // stack of { active, taken }
  let timescale = opts.timescale;
  const active = () => cond.every(c => c.active);
  let i = 0, line = 1, col = 1, lastId = null, joinId = null;
  const err = (msg, l = line, c = col, sev = 'error') => errors.push({ file, line: l, col: c, message: msg, severity: sev });

  // The text is read through a window, src (#3556): a macro's use makes its body the window, the text
  // before the use goes to `done` and the text after it is set aside (`pending`, the innermost last),
  // brought back into the window as the reading needs it, so each character is copied a bounded number
  // of times (rebuilding the whole text at each use was quadratic). `base`: the window's offset in the
  // expanded text (the tokens' `at`).
  const done = [], pending = [];
  let base = 0;
  function more(k) {
    while (k >= src.length && pending.length) {
      const top = pending[pending.length - 1], n = Math.max(64, src.length, k + 1 - src.length);
      src += top.s.slice(top.p, top.p + n);
      top.p += n;
      if (top.p >= top.s.length) pending.pop();
    }
    return src[k];
  }
  const ch = k => (k < src.length ? src[k] : more(k));
  const has = k => ch(k) !== undefined;
  const SW = o => (ch(i + o.length - 1), src.startsWith(o, i));
  // the expansions under way: where each body ends in the expanded text (less `shift`, the length
  // the later expansions added before it), the innermost last; the macros' text, over all the files (halt: a limit reached)
  const open = [], budget = opts.budget || { text: 0, halt: false };
  let shift = 0;

  function adv(n = 1) {
    for (let k = 0; k < n; k++) {
      if (ch(i) === '\n') { line++; col = 1; } else col++;
      i++;
    }
  }

  function restOfLine() {
    let s = '';
    while (has(i) && ch(i) !== '\n') {
      if (ch(i) === '\\' && ch(i + 1) === '\n') { adv(2); s += ' '; continue; }
      if (ch(i) === '/' && ch(i + 1) === '/') { while (has(i) && ch(i) !== '\n') adv(); break; }
      s += ch(i); adv();
    }
    return s;
  }

  // the end column and source text of the token the last step read (when on one line)
  let seen = 0, start = 0;
  const mark = () => {
    if (toks.length === seen + 1 && toks[seen].line === line && toks[seen].end === undefined) Object.assign(toks[seen], { end: col, at: start });
    seen = toks.length;
  };

  while (has(i)) {
    mark();
    const c = ch(i);
    if (c === '\n' || c === ' ' || c === '\t' || c === '\r' || c === '\f') { adv(); continue; }
    if (c === '/' && ch(i + 1) === '/') { while (has(i) && ch(i) !== '\n') adv(); continue; }
    if (c === '/' && ch(i + 1) === '*') {
      adv(2);
      while (has(i) && !(ch(i) === '*' && ch(i + 1) === '/')) adv();
      adv(2); continue;
    }
    const l0 = line, c0 = col, b0 = i;
    start = base + i;
    // Verilog-2001 attribute instances (* ... *) are ignored (but not @(*)).
    if (c === '(' && ch(i + 1) === '*' && ch(i + 2) !== ')' && !(toks.length && toks[toks.length - 1].v === '@')) {
      adv(2);
      while (has(i) && !(ch(i) === '*' && ch(i + 1) === ')')) adv();
      adv(2); continue;
    }
    if (c === '`') {
      adv();
      let name = '';
      while (has(i) && /[A-Za-z0-9_]/.test(ch(i))) { name += ch(i); adv(); }
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
        // parameters: `name` or `name = default text` (SystemVerilog)
        const params = m[2] ? m[2].slice(1, -1).split(',').map(x => x.trim()).filter(Boolean)
          .map(x => { const k = x.indexOf('='); return k < 0 ? { name: x } : { name: x.slice(0, k).trim(), def: x.slice(k + 1).trim() }; }) : null;
        defines.set(m[1], { params, body: m[3] || '' });
      } else if (name === 'undef') {
        defines.delete(restOfLine().trim());
      } else if (name === 'timescale') {
        const m = /^\s*(\d+)\s*(s|ms|us|ns|ps|fs)\s*\/\s*(\d+)\s*(s|ms|us|ns|ps|fs)/.exec(restOfLine());
        if (m) timescale = { unit: +m[1] * UNIT[m[2]], precision: +m[3] * UNIT[m[4]] };
        else err('bad `timescale');
      } else if (name === 'include') {
        const m = /^\s*["<]([^">]+)[">]/.exec(restOfLine());
        const text = m && opts.include ? opts.include(m[1]) : null;
        if (!m) err('bad `include', l0, c0);
        else if (text == null) err(`\`include file '${m[1]}' not found in the project`, l0, c0);
        else if ((opts.depth || 0) > 16) err('`include nested too deeply', l0, c0);
        else {
          const sub = tokenize(text, file, errors, { ...opts, defines, timescale, budget, depth: (opts.depth || 0) + 1 });
          if (sub.timescale) timescale = sub.timescale;
          for (const t of sub.tokens) if (t.t !== 'eof') toks.push(t);
          if (budget.halt) break;   // (a limit of the expansions: its one error)
        }
      } else if (['default_nettype', 'resetall', 'celldefine', 'endcelldefine', 'unconnected_drive', 'nounconnected_drive'].includes(name)) {
        restOfLine();
      } else if (defines.has(name)) {
        // The macro's text replaces its use in the source (IEEE 1364-2005 19.3.1), so it joins the
        // text around it (`WIDTH'b0110, f4_`name). A body has no newlines (line continuations are
        // spaces); the newlines of the arguments are kept after it, so the next lines keep their
        // numbers.
        const mac = defines.get(name);
        let body = mac.body, nl = '', j = i;
        if (mac.params) {
          // actual arguments: comma-separated at parenthesis depth 0; each replaces its parameter
          // (an empty one: the parameter's default value, SystemVerilog `define F(a = text))
          while (ch(j) === ' ' || ch(j) === '\t') j++;
          const args = [];
          if (ch(j) === '(') {
            j++;
            let depth = 0, cur = '';
            while (has(j) && !(depth === 0 && ch(j) === ')')) {
              const c = ch(j);
              if (c === '(' || c === '[' || c === '{') depth++;
              if (c === ')' || c === ']' || c === '}') depth--;
              if (c === '\n') nl += '\n';
              if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; } else cur += c;
              j++;
            }
            j++;
            args.push(cur.trim());
          }
          if (!mac.params.length && args.length === 1 && args[0] === '') args.length = 0;
          const missing = mac.params.slice(args.length).some(p => p.def === undefined);
          if (args.length > mac.params.length || missing) err(`macro \`${name} expects ${mac.params.length} argument(s)`, l0, c0);
          const P = new Map(mac.params.map((p, k) => [p.name, args[k] || p.def || '']));
          // (not inside string literals; `" is a quote whose string the arguments do fill)
          body = body.replace(/`"/g, '\u0001').replace(/"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_$]*/g, w => (P.has(w) ? P.get(w) : w)).replace(/\u0001/g, '"');
        }
        body = body.replace(/``/g, '');   // `` joins the text on its two sides
        // the bodies this use ends in or goes past are read; the others hold it
        j = Math.min(j, src.length);
        const g = base + b0, gj = base + j;
        while (open.length && open[open.length - 1] + shift < gj) open.pop();
        if (open.length >= MAX_DEPTH) { err(`macro \`${name} expands too deeply (more than ${MAX_DEPTH} nested expansions)`, l0, c0); budget.halt = true; break; }
        if ((budget.text += body.length) > MAX_TEXT) { err(`macro \`${name}: the macros' expansions exceed ${MAX_TEXT} characters`, l0, c0); budget.halt = true; break; }
        shift += body.length + nl.length - (gj - g);
        open.push(g + body.length - shift);
        done.push(src.slice(0, b0));
        if (j < src.length) pending.push({ s: src, p: j });
        base = g; src = body + nl; i = 0; line = l0; col = c0;
        // an identifier just before the use joins the body's first word (f4_`name): its token is
        // read on with the body
        const last = toks[toks.length - 1];
        if (lastId && lastId.tok === last && lastId.end === g && /^[A-Za-z0-9_$]/.test(body)) joinId = toks.pop();
      } else {
        err(`undefined macro \`${name}`, l0, c0);
      }
      continue;
    }
    if (!active()) { adv(); continue; }

    // identifiers / keywords / system names
    // (an identifier a macro's body joins: read on from its start, f4_`name)
    if (joinId || /[A-Za-z_$]/.test(c)) {
      // (its first character and its length, not the name itself: a long name joined to many times
      // would be read whole at each)
      let s = '', s0 = c, l1 = l0, c1 = c0;
      if (joinId) ({ v: s, line: l1, col: c1, at: start } = joinId), s0 = joinId.t === 'sys' ? '$' : 'a', joinId = null;
      while (has(i) && /[A-Za-z0-9_$]/.test(ch(i))) { s += ch(i); adv(); }
      if (s0 === '$') toks.push({ t: 'sys', v: s, line: l1, col: c1 });
      else toks.push({ t: s.length <= KW_MAX && KEYWORDS.has(s) ? 'kw' : 'id', v: s, line: l1, col: c1 });
      lastId = { tok: toks[toks.length - 1], end: base + i };
      // SystemVerilog cast to a type: my_t'(expr), signed'(expr) -> the name and a cast mark
      if (ch(i) === "'" && ch(i + 1) === '(' && s0 !== '$') { adv(); toks.push({ t: 'cast', v: "'", line, col }); }
      continue;
    }
    if (c === '\\') { // escaped identifier
      adv(); let s = '';
      while (has(i) && !/\s/.test(ch(i))) { s += ch(i); adv(); }
      toks.push({ t: 'id', v: s, line: l0, col: c0 });
      continue;
    }
    // numbers: [size]'[s]base digits | decimal | real
    if (/[0-9']/.test(c)) {
      let size = '';
      if (c !== "'") {
        while (has(i) && /[0-9_]/.test(ch(i))) { size += ch(i); adv(); }
        // real?
        if (ch(i) === '.' && /[0-9]/.test(ch(i + 1) || '')) {
          let s = size + '.'; adv();
          while (/[0-9_]/.test(ch(i) || '')) { s += ch(i); adv(); }
          if (/[eE]/.test(ch(i) || '')) { s += 'e'; adv(); if (/[+-]/.test(ch(i))) { s += ch(i); adv(); } while (/[0-9]/.test(ch(i) || '')) { s += ch(i); adv(); } }
          toks.push({ t: 'real', v: parseFloat(s.replace(/_/g, '')), line: l0, col: c0 });
          continue;
        }
        // SystemVerilog size cast: 8'(expr) -> the width and a cast mark
        if (ch(i) === "'" && ch(i + 1) === '(') {
          toks.push({ t: 'int', v: size.replace(/_/g, ''), line: l0, col: c0 });
          adv();
          toks.push({ t: 'cast', v: "'", line, col });
          continue;
        }
        // allow whitespace between size and '
        let j = i; while (ch(j) === ' ' || ch(j) === '\t') j++;
        if (ch(j) !== "'" || !/[sSbBoOdDhH]/.test(ch(j + 1) || '')) {
          toks.push({ t: 'int', v: size.replace(/_/g, ''), line: l0, col: c0 });
          continue;
        }
        while (i < j) adv();
      }
      // at '
      adv();
      let signed = false;
      if (ch(i) === 's' || ch(i) === 'S') { signed = true; adv(); }
      const baseChar = ch(i) || '', base = baseChar.toLowerCase();
      if (!'bodh'.includes(base) || !base) {
        // unbased unsized '0 '1 'x 'z (SystemVerilog)
        if (/[01xzXZ]/.test(ch(i) || '')) { const d = ch(i).toLowerCase(); adv(); toks.push({ t: 'fill', v: d, line: l0, col: c0 }); continue; }
        err('bad number literal', l0, c0); continue;
      }
      adv();
      while (ch(i) === ' ' || ch(i) === '\t') adv();
      let digits = '';
      while (has(i) && /[0-9a-fA-FxXzZ?_]/.test(ch(i))) { digits += ch(i); adv(); }
      const written = digits;
      digits = digits.replace(/_/g, '').toLowerCase();
      // the digits of the base only (XST rejects the others); a decimal x / z / ? stands alone
      let bad = null;
      if (!digits) bad = 'no digits';
      else if (base === 'd') {
        if (!/^[0-9]+$|^[xz?]$/.test(digits)) bad = /[xz?]/.test(digits) ? 'x, z or ? in a decimal number must be its only digit' : `'${/[^0-9]/.exec(digits)[0]}' is not a decimal digit`;
      } else {
        const wrong = { b: /[^01xz?]/, o: /[^0-7xz?]/, h: /[^0-9a-fxz?]/ }[base].exec(digits);
        if (wrong) bad = `'${wrong[0]}' is not ${base === 'o' ? 'an octal' : base === 'b' ? 'a binary' : 'a hexadecimal'} digit`;
      }
      if (bad) { err(`bad number literal ${size || ''}'${signed ? 's' : ''}${baseChar}${written}: ${bad}`, l0, c0); digits = '0'; }
      toks.push({ t: 'based', size: size ? parseInt(size.replace(/_/g, ''), 10) : null, signed, base, digits, line: l0, col: c0 });
      continue;
    }
    if (c === '"') {
      adv(); let s = '';
      while (has(i) && ch(i) !== '"') {
        if (ch(i) === '\\') {
          adv(); const e = ch(i);
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e; adv(); continue;
        }
        if (ch(i) === '\n') { err('unterminated string', l0, c0); break; }
        s += ch(i); adv();
      }
      adv();
      toks.push({ t: 'str', v: s, line: l0, col: c0 });
      continue;
    }
    const op = OPS.find(o => SW(o));
    if (op) { adv(op.length); toks.push({ t: 'op', v: op === '^~' ? '~^' : op, line: l0, col: c0 }); continue; }
    err(`unexpected character '${c}'`); adv();
  }
  mark();
  if (cond.length && !budget.halt) err('missing `endif');
  toks.push({ t: 'eof', v: '', line, col });
  Object.defineProperty(toks, 'src', { value: done.join('') + src });   // (tokenText)
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

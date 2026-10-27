// Silinx HLS (docs/c-to-hdl.md, #1524): the preprocessor and the lexer of a C source.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   lex(source, file) -> { tokens, pragmas, includes, errors }
//     tokens:   [{ t: 'id' | 'num' | 'chr' | 'str' | 'op' | 'pragma' | 'eof', v, line, col }]
//               a number's v is its text (its value read by the parser); a char's v its code; a pragma's v
//               { name, args: { key: value | true }, text } (`#pragma HLS PIPELINE II=1` -> name 'PIPELINE',
//               args { II: '1' }); other pragmas (not HLS) are dropped with a warning
//     includes: [{ name, system, line }]: the headers named
//     errors:   [{ file, line, col, message, severity }]
// The preprocessor knows #include (the headers of Silinx HLS), #define (constants and macros of one
// expression), #undef, #if / #ifdef / #ifndef / #elif / #else / #endif (integer constant expressions with
// defined()), #pragma; its macros are expanded in the tokens.

// the headers Silinx HLS knows (docs/c-to-hdl.md); hls_stream.h and the others refused
import { cppTokens, CPP_HEADERS, isCpp } from './cpp-lex.js';
import { CPP_OWN_HEADERS } from './cpp-headers.js';
import { readPragma } from './c-pragma.js';
import { cppTemplates } from './cpp-template.js';
import { cppSugar } from './cpp-sugar.js';
import { cStructs } from './c-struct.js';

export const KNOWN_HEADERS = new Set(['ap_int.h', 'ap_fixed.h', 'stdint.h', 'stdbool.h', 'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'stddef.h', 'limits.h', 'assert.h']);
// the macros of the standard headers a test bench uses (#1598)
const HEADER_MACROS = { 'stdio.h': { EOF: '(-1)', NULL: '0' }, 'stdbool.h': { true: '1', false: '0' }, 'stdlib.h': { NULL: '0', EXIT_SUCCESS: '0', EXIT_FAILURE: '1', RAND_MAX: '2147483647' }, 'stddef.h': { NULL: '0' },
  'limits.h': { CHAR_BIT: '8', INT_MAX: '2147483647', INT_MIN: '(-2147483647 - 1)', UINT_MAX: '4294967295u', SHRT_MAX: '32767', UCHAR_MAX: '255' } };

const PUNCT = ['<<=', '>>=', '...', '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '::', '##'];
const SINGLE = '+-*/%<>=!~&|^?:;,.()[]{}#';
const ESC = { n: 10, t: 9, r: 13, 0: 0, '\\': 92, "'": 39, '"': 34, a: 7, b: 8, f: 12, v: 11, '?': 63 };

/** The tokens of one line of text (no preprocessing): [{ t, v, col }]; errors pushed to `bad`. */
function scan(text, line, bad) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }
    const col = i + 1;
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[\w]/.test(text[j])) j++;
      out.push({ t: 'id', v: text.slice(i, j), col }); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) {
      let j = i;
      if (/^0[xX]/.test(text.slice(i))) { j += 2; while (j < text.length && /[0-9a-fA-F']/.test(text[j])) j++; }
      else if (/^0[bB]/.test(text.slice(i))) { j += 2; while (j < text.length && /[01']/.test(text[j])) j++; }
      // (a decimal: its fraction and exponent, 1.5e-3)
      else while (j < text.length && (/[0-9.eE']/.test(text[j]) || (/[-+]/.test(text[j]) && /[eE]/.test(text[j - 1])))) j++;
      while (j < text.length && /[uUlLfF]/.test(text[j])) j++;
      out.push({ t: 'num', v: text.slice(i, j), col }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\' && j + 1 < text.length) {
          const e = text[j + 1];
          if (e in ESC) { s += String.fromCharCode(ESC[e]); j += 2; continue; }
          if (e === 'x') { const m = /^[0-9a-fA-F]+/.exec(text.slice(j + 2)); s += String.fromCharCode(parseInt(m?.[0] || '0', 16)); j += 2 + (m?.[0].length || 0); continue; }
          s += e; j += 2; continue;
        }
        s += text[j++];
      }
      if (j >= text.length) { bad.push({ line, col, message: `missing closing ${c}` }); i = text.length; continue; }
      if (c === "'") {
        if (s.length !== 1) bad.push({ line, col, message: 'a character constant has one character' });
        out.push({ t: 'chr', v: s.charCodeAt(0) || 0, col });
      } else out.push({ t: 'str', v: s, col });
      i = j + 1; continue;
    }
    const p = PUNCT.find((q) => text.startsWith(q, i));
    if (p) { out.push({ t: 'op', v: p, col }); i += p.length; continue; }
    if (SINGLE.includes(c)) { out.push({ t: 'op', v: c, col }); i++; continue; }
    bad.push({ line, col, message: `unexpected character '${c}'` });
    i++;
  }
  return out;
}

/** The lines of the source with the comments removed and the continued lines joined: [{ text, line, pos }], pos[i]
 *  the { line, col } in the source of text[i] (a comment is one space, at the comment's place; the tokens after a
 *  comment of several lines keep their own lines). An unterminated block comment is reported. */
function logicalLines(source, bad) {
  const src = String(source).replace(/\r\n?/g, '\n');
  let text = '', pos = [], i = 0, line = 1, col = 1, inStr = null;
  const lines = [];
  let start = 1;
  const add = (c, l, k) => { text += c; pos.push({ line: l, col: k }); };
  const push = () => { lines.push({ text, line: start, pos }); text = ''; pos = []; };
  const step = (n = 1) => { for (let k = 0; k < n; k++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      if (c === '\n') { inStr = null; step(); push(); start = line; continue; }
      add(c, line, col);
      if (c === '\\' && src[i + 1] !== '\n') { step(); add(src[i] ?? '', line, col); step(); continue; }
      if (c === inStr) inStr = null;
      step(); continue;
    }
    if (c === '"' || c === "'") { inStr = c; add(c, line, col); step(); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') step(); continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) bad.push({ line, col, message: 'a comment /* is not closed' });
      add(' ', line, col);
      step((end < 0 ? src.length : end + 2) - i);
      continue;
    }
    if (c === '\\' && src[i + 1] === '\n') { step(2); continue; }
    if (c === '\n') { step(); push(); start = line; continue; }
    add(c, line, col); step();
  }
  push();
  return lines;
}

// ---------------------------------------------------------------- #if expressions
/** The value of an #if expression (its tokens, the macros known), C's integer rules, defined() included. */
function ifValue(toks, macros, err) {
  const ts = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'id' && t.v === 'defined') {
      const par = toks[k + 1]?.v === '(';
      const name = toks[k + (par ? 2 : 1)];
      ts.push({ t: 'num', v: macros.has(name?.v) ? '1' : '0' });
      k += par ? 3 : 1; continue;
    }
    ts.push(t);
  }
  const exp = expand(ts, macros, err).map((t) => (t.t === 'id' ? { t: 'num', v: '0' } : t));   // (unknown names: 0, as C)
  let p = 0;
  const peek = () => exp[p]?.v;
  const prim = () => {
    const t = exp[p++];
    if (!t) { err('#if: an expression is missing'); return 0n; }
    if (t.v === '(') { const v = tern(); if (peek() === ')') p++; return v; }
    if (t.v === '!') return prim() ? 0n : 1n;
    if (t.v === '-') return -prim();
    if (t.v === '+') return prim();
    if (t.v === '~') return ~prim();
    if (t.t === 'num') return BigInt(numText(t.v));
    if (t.t === 'chr') return BigInt(t.v);
    err(`#if: unexpected '${t.v}'`); return 0n;
  };
  const LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
  const bin = (lv) => {
    if (lv === LEVELS.length) return prim();
    let a = bin(lv + 1);
    while (LEVELS[lv].includes(peek())) {
      const op = exp[p++].v, b = bin(lv + 1);
      a = binop(op, a, b, err);
    }
    return a;
  };
  const tern = () => {
    const c = bin(0);
    if (peek() !== '?') return c;
    p++; const a = tern(); if (peek() === ':') p++; const b = tern();
    return c ? a : b;
  };
  return tern();
}
function binop(op, a, b, err) {
  switch (op) {
    case '||': return a || b ? 1n : 0n; case '&&': return a && b ? 1n : 0n;
    case '|': return a | b; case '^': return a ^ b; case '&': return a & b;
    case '==': return a === b ? 1n : 0n; case '!=': return a !== b ? 1n : 0n;
    case '<': return a < b ? 1n : 0n; case '>': return a > b ? 1n : 0n; case '<=': return a <= b ? 1n : 0n; case '>=': return a >= b ? 1n : 0n;
    case '<<': return a << b; case '>>': return a >> b; case '+': return a + b; case '-': return a - b; case '*': return a * b;
    case '/': if (!b) { err('#if: division by zero'); return 0n; } return a / b;
    case '%': if (!b) { err('#if: division by zero'); return 0n; } return a % b;
    default: return 0n;
  }
}
/** A number's text without its suffixes and digit separators, as BigInt reads it (0x / 0b / octal / decimal). */
export function numText(v) {
  const s = String(v).replace(/'/g, '').replace(/[uUlL]+$/, '');
  if (/^0[0-7]+$/.test(s)) return `0o${s.slice(1)}`;
  return s;
}

// ---------------------------------------------------------------- macros
/** The tokens with the macros expanded (object-like and function-like; no recursion into the same macro). */
function expand(toks, macros, err, active = new Set()) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    const m = t.t === 'id' && !active.has(t.v) ? macros.get(t.v) : null;
    if (!m) { out.push(t); continue; }
    const at = (x) => ({ ...x, line: t.line, col: t.col });
    if (!m.params) { out.push(...expand(m.body, macros, err, new Set([...active, t.v])).map(at)); continue; }
    if (toks[k + 1]?.v !== '(') { out.push(t); continue; }
    // the arguments: split at the commas outside parentheses
    const args = [[]];
    let depth = 0, j = k + 2;
    for (; j < toks.length; j++) {
      const v = toks[j].v;
      if (toks[j].t === 'op' && v === '(') depth++;
      if (toks[j].t === 'op' && v === ')') { if (!depth) break; depth--; }
      if (toks[j].t === 'op' && v === ',' && !depth) { args.push([]); continue; }
      args[args.length - 1].push(toks[j]);
    }
    if (j >= toks.length) { err(`the macro '${t.v}' is not closed`); out.push(t); continue; }
    const given = args.length === 1 && !args[0].length ? [] : args;
    if (given.length !== m.params.length) err(`the macro '${t.v}' takes ${m.params.length} argument(s), not ${given.length}`);
    const body = [];
    for (const b of m.body) {
      const i = b.t === 'id' ? m.params.indexOf(b.v) : -1;
      body.push(...(i >= 0 ? [{ t: 'op', v: '(' }, ...(given[i] || []), { t: 'op', v: ')' }] : [b]));
    }
    out.push(...expand(body, macros, err, new Set([...active, t.v])).map(at));
    k = j;
  }
  return out;
}

// ---------------------------------------------------------------- the preprocessor
/** The header an #include names, as C finds it: beside the file including it, as named, else by its name alone. */
function headerKey(headers, from, name) {
  const norm = (p) => p.split('/').reduce((a, x) => (x === '..' ? a.slice(0, -1) : x === '.' || x === '' ? a : [...a, x]), []).join('/');
  const dir = from.includes('/') ? from.replace(/\/[^/]*$/, '/') : '';
  for (const k of [norm(dir + name), norm(name)]) if (k in headers) return k;
  const base = name.split('/').pop();
  return Object.keys(headers).find((k) => k.split('/').pop() === base) ?? null;
}
// (headers: the project's own, { 'name.h': text }, #include "name.h" reads them in place, #1597; their macros the
// source's; #pragma once and include guards as C's)
export function lex(source, file = 'input.c', { headers = null, cpp = isCpp(file) } = {}) {
  const errors = [];
  const tokens = [], pragmas = [], includes = [];
  const macros = new Map();
  // (C++, #1590: true and false its keywords)
  if (cpp) for (const [k, v] of [['true', '1'], ['false', '0']]) macros.set(k, { params: null, body: [{ t: 'num', v, line: 1, col: 1 }] });
  const once = new Set();
  const lines = run(source, file, 0);
  const last = lines.at(-1);
  tokens.push({ t: 'eof', v: '', line: last ? last.line + 1 : 1, col: 1 });
  const streams = new Map();
  const report = (t, m) => errors.push({ file: t.file || file, line: t.line, col: t.col, message: m, severity: 'error' });
  if (cpp) {
    const st = cStructs(cppSugar(cppTemplates(tokens, report), report), report, true);
    return { tokens: cppTokens(st.tokens, report, streams), pragmas, includes, errors, streams, structArgs: st.structArgs };
  }
  const st = cStructs(tokens, report, false);
  return { tokens: st.tokens, pragmas, includes, errors, structArgs: st.structArgs };

  function run(src, fname, depth) {
  const bad = [];
  const lines = logicalLines(src, bad);
  const cond = [];   // [{ on, done, line }]: the #if stack (on: this branch taken; done: one branch taken)
  const live = () => cond.every((c) => c.on);
  const err = (line, col, message, severity = 'error') => errors.push({ file: fname, line, col, message, severity });
  const own = (t) => (fname === file ? t : { ...t, file: fname });
  for (const { text, line, pos } of lines) {
    const scanned = [];
    const place = (t) => ({ ...t, line: pos[t.col - 1]?.line ?? line, col: pos[t.col - 1]?.col ?? t.col });
    const d = /^\s*#\s*(\w*)\s*(.*)$/.exec(text);
    if (d) {
      const [, dir, rest] = d;
      const col = text.indexOf('#') + 1;
      const e = (m, sev) => err(line, col, m, sev);
      const toks = () => scan(rest, line, bad).map((t) => ({ ...t, line }));
      if (dir === 'if' || dir === 'ifdef' || dir === 'ifndef') {
        const on = !live() ? false : dir === 'if' ? !!ifValue(toks(), macros, e) : (dir === 'ifdef') === macros.has(rest.trim().split(/\s/)[0]);
        cond.push({ on, done: on, line, outer: live() });
        continue;
      }
      if (dir === 'elif' || dir === 'else') {
        const c = cond.at(-1);
        if (!c) { e(`#${dir} with no #if`); continue; }
        const outer = cond.slice(0, -1).every((x) => x.on);
        c.on = outer && !c.done && (dir === 'else' || !!ifValue(toks(), macros, e));
        c.done = c.done || c.on;
        continue;
      }
      if (dir === 'endif') { if (!cond.pop()) e('#endif with no #if'); continue; }
      if (!live()) continue;
      if (dir === 'include') {
        const m0 = /^[<"]([^>"]+)[>"]/.exec(rest.trim());
        // (C++'s headers of C's: <cstdint> is <stdint.h>)
        const m = m0 && cpp && CPP_HEADERS[m0[1]] ? [m0[0], CPP_HEADERS[m0[1]]] : m0;
        if (!m) { e('#include names a header: #include "ap_int.h" or #include <stdint.h>'); continue; }
        includes.push({ name: m[1], system: rest.trim()[0] === '<', line });
        const key = headers && !KNOWN_HEADERS.has(m[1]) ? headerKey(headers, fname, m[1]) : null;
        if (key !== null) {
          if (depth > 16) e(`#include "${m[1]}": headers included too deep (a header including itself?)`);
          else if (!once.has(key)) run(headers[key], key, depth + 1);
          continue;
        }
        if (cpp && m[1] === 'hls_stream.h') continue;   // (hls::stream: C++'s, #1590)
        // (a header Silinx HLS writes itself: core/cpp-headers.js, #1662)
        if (cpp && CPP_OWN_HEADERS[m[1]]) { if (!once.has(`<${m[1]}>`)) run(CPP_OWN_HEADERS[m[1]], `<${m[1]}>`, depth + 1); continue; }
        if (!KNOWN_HEADERS.has(m[1])) e(m[1] === 'hls_stream.h' ? 'hls_stream.h: hls::stream is C++: write the source as a .cpp file'
          : `the header '${m[1]}' is not one of Silinx HLS's (${[...KNOWN_HEADERS].join(', ')})`);
        for (const [k, v] of Object.entries(HEADER_MACROS[m[1]] || {})) if (!macros.has(k)) macros.set(k, { params: null, body: scan(v, line, bad).map((t) => ({ ...t, line })) });
        continue;
      }
      if (dir === 'define') {
        const m = /^(\w+)(\(([^)]*)\))?\s*(.*)$/.exec(rest);
        if (!m) { e('#define names a macro'); continue; }
        const params = m[2] !== undefined ? m[3].split(',').map((s) => s.trim()).filter(Boolean) : null;
        const bodyCol = text.length - m[4].length + 1;
        macros.set(m[1], { params, body: scan(m[4], line, bad).map((t) => ({ ...t, line, col: t.col + bodyCol - 1 })) });
        continue;
      }
      if (dir === 'undef') { macros.delete(rest.trim()); continue; }
      if (dir === 'pragma') {
        if (rest.trim() === 'once') { once.add(fname); continue; }
        // (its macros expanded, as Vitis HLS's: factor=N, if (OPT == 1); C++'s true and false kept)
        const uses = (rest.match(/\b[A-Za-z_]\w*\b/g) || []).some((w) => macros.has(w) && w !== 'true' && w !== 'false');
        const p = readPragma(uses ? expand(scan(rest, line, []), new Map([...macros].filter(([k]) => k !== 'true' && k !== 'false')), () => {})
          .map((t) => (t.t === 'str' ? JSON.stringify(t.v) : t.t === 'chr' ? String(t.v) : t.v)).join(' ') : rest);
        if (!p) { e(`#pragma ${rest.trim()} is ignored (only #pragma HLS)`, 'warning'); continue; }
        pragmas.push({ ...p, line });
        tokens.push(own({ t: 'pragma', v: p, line, col }));
        continue;
      }
      if (dir === 'error') { e(`#error ${rest.trim()}`); continue; }
      if (dir === '') continue;
      e(`#${dir} is not supported`);
      continue;
    }
    if (!live()) continue;
    const lineBad = [];
    for (const t of scan(text, line, lineBad)) scanned.push(place(t));
    for (const b of lineBad) bad.push({ ...b, ...place({ col: b.col }) });
    tokens.push(...expand(scanned, macros, (m) => err(line, scanned[0]?.col || 1, m)).map(own));
  }
  for (const c of cond) err(c.line, 1, '#if with no #endif');
  for (const b of bad) err(b.line, b.col, b.message);
  return lines;
  }
}

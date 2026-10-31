// Silinx HLS C++ (#1891): the subset of Vitis HLS's library headers AMD's examples use, as tokens (before the templates):
//   hls::vector<T, N>                 ap_vector<T, N>, a struct of an array (core/cpp-headers.js; its v[i] core/c-struct.js's, its operators core/cpp-vector.js's)
//   hls::stream_of_blocks<B> s;       a stream of blocks, ap_vector<T, N> (B: typedef T B[N]), a block's values in a word
//   hls::write_lock<B> l(s);          ap_vector<T, N> l; … s.write(l); at the end of its scope (the C++ destructor's place)
//   hls::read_lock<B> l(s);           ap_vector<T, N> l = s.read();
//   std::complex<T>'s c.real(), c.real(x)   c.ap_re, c.ap_re = (x) (and imag)
//   hls::axis<T, U, TI, TD>           ap_axis_t<T, bytes of T, U, TI, TD> (keep and strb: a bit per byte of T)
//   ap_float<W, E>                    a double, in the test bench only (core/c-check.js: refused in the synthesized code)
//   hls::autorestart r(n, f, a…);     the test bench's n calls f(a…);
// Isomorphic ES module.
//
//   cppHlsLibs(tokens, includes, report) -> { tokens, apFloats: [{ fn, file, line, col, text }] }
import { closing, splitTop } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });
const SIZES = { char: 1, short: 2, int: 4, long: 8, float: 4, double: 8, bool: 1, int8_t: 1, uint8_t: 1, int16_t: 2, uint16_t: 2, int32_t: 4, uint32_t: 4, int64_t: 8, uint64_t: 8 };

/** The bytes of a type's tokens (a builtin, ap_int, ap_uint, complex of one), or null. */
function bytesOf(ty) {
  const a = ty.filter((x) => !isId(x, 'unsigned') && !isId(x, 'signed') && !isId(x, 'const') && !isId(x, 'std') && !op(x, '::'));
  if (isId(a[0], 'complex') && op(a[1], '<')) { const b = bytesOf(a.slice(2, closing(a, 1))); return b === null ? null : 2 * b; }
  if ((isId(a[0], 'ap_int') || isId(a[0], 'ap_uint')) && op(a[1], '<') && a[2]?.t === 'num') return Math.ceil(Number(a[2].v) / 8);
  if (!a.length) return ty.length ? 4 : null;   // (unsigned, signed)
  return a.every((x) => isId(x)) ? (SIZES[a[0].v] ?? null) : null;
}

/** typedef hls::stream<T[, D]> A;: its name its type where it is used (a stream of a struct is per member, core/c-struct-stream.js). */
function streamTypedefs(toks) {
  const aliases = new Map(), out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (isId(t, 'typedef') && isId(toks[k + 1], 'hls') && op(toks[k + 2], '::') && isId(toks[k + 3], 'stream') && op(toks[k + 4], '<')) {
      const e = closing(toks, k + 4);
      if (e > 0 && isId(toks[e + 1]) && op(toks[e + 2], ';')) { aliases.set(toks[e + 1].v, toks.slice(k + 1, e + 1)); k = e + 2; continue; }
    }
    if (isId(t) && aliases.has(t.v) && !op(toks[k - 1], '.') && !op(toks[k - 1], '->')) { out.push(...aliases.get(t.v).map((x) => ({ ...x, line: t.line, col: t.col, file: t.file }))); continue; }
    out.push(t);
  }
  return aliases.size ? out : toks;
}

/** extern "C" (and its braces) dropped: C++'s linkage, nothing in hardware or in the C simulation. */
function externC(toks) {
  const drop = new Set();
  for (let k = 0; k + 1 < toks.length; k++) {
    if (!isId(toks[k], 'extern') || toks[k + 1].t !== 'str') continue;
    drop.add(k).add(k + 1);
    if (op(toks[k + 2], '{')) drop.add(k + 2).add(closing(toks, k + 2));
  }
  return drop.size ? toks.filter((_, k) => !drop.has(k)) : toks;
}

export function cppHlsLibs(input, includes, report) {
  const toks = streamTypedefs(externC(input));
  const has = (h) => includes.some((i) => i.name === h);
  const apFloats = [], blocks = new Map(), floats = new Map();
  if (has('hls_streamofblocks.h')) {
    for (let k = 0; k < toks.length; k++) {
      if (!isId(toks[k], 'typedef')) continue;
      let e = k + 1;
      while (toks[e] && !op(toks[e], ';') && !op(toks[e], '[')) e++;
      if (!op(toks[e], '[') || !isId(toks[e - 1])) continue;
      const c = closing(toks, e);
      blocks.set(toks[e - 1].v, op(toks[c + 1], ';') ? { type: toks.slice(k + 1, e - 1), size: toks.slice(e + 1, c) } : null);
    }
  }
  /** B's ap_vector<T, N> tokens (t: where it is said), or null. */
  const blockType = (b, t) => {
    const d = isId(b[0]) && b.length === 1 ? blocks.get(b[0].v) : null;
    if (!d) { report(t, `hls::stream_of_blocks: its block '${b.map((x) => x.v).join(' ')}' a typedef of an array of one dimension (typedef T B[N];)`); return null; }
    return [L(t, 'ap_vector', 'id'), L(t, '<'), ...d.type.map((x) => ({ ...x })), L(t, ','), ...d.size.map((x) => ({ ...x })), L(t, '>')];
  };
  const out = [], pending = [[]];
  let depth = 0, fn = null;
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (op(t, '{')) {
      // (a function's body at the file's level: the name before its parameters)
      if (!depth && op(toks[k - 1], ')')) { let d = 0, p = k - 1; for (; p >= 0; p--) { if (op(toks[p], ')')) d++; else if (op(toks[p], '(') && --d === 0) break; } fn = isId(toks[p - 1]) ? toks[p - 1].v : null; }
      depth++; pending.push([]); out.push(t); continue;
    }
    if (op(t, '}')) {
      // (a scope's write locks released, the last taken first)
      for (const w of (pending.pop() || []).reverse()) out.push(...w);
      if (--depth === 0) fn = null;
      out.push(t);
      continue;
    }
    if (depth && pending.at(-1).length && (isId(t, 'return') || isId(t, 'break') || isId(t, 'continue') || isId(t, 'goto'))) report(t, `hls::write_lock: a ${t.v} within its scope is not supported (the block is written at the end of the scope)`);
    const hlsAt = isId(t, 'hls') && op(toks[k + 1], '::') && isId(toks[k + 2]) ? toks[k + 2].v : null;
    if (hlsAt === 'vector' && has('hls_vector.h')) { out.push(L(t, 'ap_vector', 'id')); k += 2; continue; }
    if (hlsAt === 'stream_of_blocks' && op(toks[k + 3], '<') && has('hls_streamofblocks.h')) {
      const e = closing(toks, k + 3), a = splitTop(toks.slice(k + 4, e));
      const v = blockType(a[0], t);
      out.push(t, toks[k + 1], L(t, 'stream', 'id'), L(t, '<'), ...(v || a[0]), ...(a[1] ? [L(t, ','), ...a[1]] : []), L(t, '>'));
      k = e;
      continue;
    }
    if ((hlsAt === 'write_lock' || hlsAt === 'read_lock') && op(toks[k + 3], '<') && has('hls_streamofblocks.h')) {
      const e = closing(toks, k + 3), v = blockType(toks.slice(k + 4, e), t);
      const name = toks[e + 1], c = op(toks[e + 2], '(') ? closing(toks, e + 2) : -1;
      if (!v || !isId(name) || c < 0 || !op(toks[c + 1], ';')) { if (v) report(t, `hls::${hlsAt}: declared with its stream (hls::${hlsAt}<B> l(s);)`); k = e; continue; }
      const s = toks.slice(e + 3, c);
      if (hlsAt === 'read_lock') out.push(...v, name, L(t, '='), ...s, L(t, '.'), L(t, 'read', 'id'), L(t, '('), L(t, ')'), L(t, ';'));
      else {
        out.push(...v, name, L(t, ';'));
        pending.at(-1).push([...s.map((x) => ({ ...x })), L(t, '.'), L(t, 'write', 'id'), L(t, '('), { ...name }, L(t, ')'), L(t, ';')]);
      }
      k = c + 1;
      continue;
    }
    if (hlsAt === 'axis' && op(toks[k + 3], '<') && has('ap_axi_sdata.h')) {
      const e = closing(toks, k + 3), a = splitTop(toks.slice(k + 4, e));
      const bytes = bytesOf(a[0]);
      if (bytes === null) report(t, `hls::axis: its data type '${a[0].map((x) => x.v).join(' ')}' (a builtin type, ap_int, ap_uint or std::complex of one here)`);
      const rest = [1, 2, 3].flatMap((i) => [L(t, ','), ...(a[i] || [L(t, '0', 'num')])]);
      out.push(L(t, 'ap_axis_t', 'id'), L(t, '<'), ...a[0], L(t, ','), L(t, String(bytes ?? 4), 'num'), ...rest, L(t, '>'));
      k = e;
      continue;
    }
    if (hlsAt === 'autorestart' && isId(toks[k + 3]) && op(toks[k + 4], '(')) {
      const c = closing(toks, k + 4), a = splitTop(toks.slice(k + 5, c));
      if (a.length < 2 || !op(toks[c + 1], ';')) { report(t, 'hls::autorestart: hls::autorestart r(n, f, arguments…);'); k = c; continue; }
      const i = L(t, 'ap_restart', 'id');
      out.push(L(t, 'for', 'id'), L(t, '('), L(t, 'int', 'id'), i, L(t, '='), L(t, '0', 'num'), L(t, ';'), { ...i }, L(t, '<'), L(t, '('), ...a[0], L(t, ')'), L(t, ';'), { ...i }, L(t, '++'), L(t, ')'),
        ...a[1], L(t, '('), ...a.slice(2).flatMap((x, n) => [...(n ? [L(t, ',')] : []), ...x]), L(t, ')'), L(t, ';'));
      apFloats.push({ fn, file: t.file, line: t.line, col: t.col, text: 'hls::autorestart' });
      k = c + 1;
      continue;
    }
    if (isId(t, 'ap_float') && op(toks[k + 1], '<') && has('ap_float.h')) {
      const e = closing(toks, k + 1);
      const text = `ap_float<${toks.slice(k + 2, e).map((x) => x.v).join('')}>`;
      // (using A = ap_float<…>; typedef ap_float<…> A;: its name's uses the same)
      if (isId(out.at(-1), 'typedef') && isId(toks[e + 1])) floats.set(toks[e + 1].v, text);
      if (op(out.at(-1), '=') && isId(out.at(-2)) && isId(out.at(-3), 'using')) floats.set(out.at(-2).v, text);
      apFloats.push({ fn, file: t.file, line: t.line, col: t.col, text });
      out.push(L(t, 'double', 'id'));
      k = e;
      continue;
    }
    if (isId(t) && floats.has(t.v) && !op(toks[k + 1], '=') && !isId(out.at(-1), 'double')) {
      apFloats.push({ fn, file: t.file, line: t.line, col: t.col, text: floats.get(t.v) });
      out.push(L(t, 'double', 'id'));
      continue;
    }
    out.push(t);
  }
  return { tokens: has('complex') ? complexMembers(out) : out, apFloats };
}

/** c.real(), c.real(x) (and imag): its member, x's own too. */
function complexMembers(toks) {
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if ((op(t, '.') || op(t, '->')) && (isId(toks[k + 1], 'real') || isId(toks[k + 1], 'imag')) && op(toks[k + 2], '(')) {
      const c = closing(toks, k + 2);
      out.push(t, L(t, toks[k + 1].v === 'real' ? 'ap_re' : 'ap_im', 'id'));
      if (c > k + 3) out.push(L(t, '='), L(t, '('), ...complexMembers(toks.slice(k + 3, c)), L(t, ')'));
      k = c;
      continue;
    }
    out.push(t);
  }
  return out;
}

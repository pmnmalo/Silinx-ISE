// Silinx HLS (#1590): the C++ of a .cpp source that Silinx HLS reads, as tokens: a namespace's braces and `using`
// dropped (its names the file's), a qualified name its last part (std::cout is cout, N::f is f), nullptr 0, constexpr
// const, static_cast<T>(e) / const_cast<T>(e) a cast (T)(e), static_assert(…) dropped, the C++ headers C's
// (<cstdint> is <stdint.h>). Then core/cpp-tree.js: references, std::cout. Isomorphic ES module.
//
//   cppTokens(tokens, report) -> tokens

export const CPP_HEADERS = { cstdint: 'stdint.h', cstdio: 'stdio.h', cstdlib: 'stdlib.h', cstring: 'string.h', cmath: 'math.h',
  climits: 'limits.h', cstddef: 'stddef.h', iostream: 'stdio.h', ostream: 'stdio.h', fstream: 'stdio.h', iomanip: 'stdio.h', sstream: 'stdio.h', string: 'string.h', 'assert.h': 'assert.h', cassert: 'assert.h' };
export const isCpp = (file) => /\.(cpp|cc|cxx|hpp|hh)$/i.test(String(file || ''));

const FUNC_CASTS = new Set(['char', 'short', 'int', 'long', 'unsigned', 'signed', 'bool', 'float', 'double']);
const STREAM_TYPES = { ofstream: 'w', ifstream: 'r', fstream: 'r' };

export function cppTokens(toks, report, streams = new Map()) {
  const out = [];
  const renamed = new Map();   // (a stream named as a type, FILE: named ap_s_FILE)
  const braces = [];   // for each open '{': whether it is a namespace's (dropped with its '}')
  const is = (k, v) => toks[k] && toks[k].v === v && (toks[k].t === 'op' || toks[k].t === 'id');
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (t.t === 'id' && t.v === 'namespace') {
      // namespace N { … } (its names the file's); namespace A = B;
      let j = k + 1;
      while (toks[j] && toks[j].t === 'id') j++;
      if (is(j, '{')) { braces.push(true); k = j; continue; }
      while (toks[j] && !is(j, ';')) j++;
      k = j;
      continue;
    }
    if (t.t === 'id' && t.v === 'using') {
      // using namespace std; using std::cout; (a using T = U; alias: a typedef)
      let j = k + 1;
      if (toks[j]?.t === 'id' && is(j + 1, '=')) {
        const name = toks[j];
        let e = j + 2;
        const ty = [];
        while (toks[e] && !is(e, ';')) ty.push(toks[e++]);
        out.push({ ...t, v: 'typedef' }, ...cppTokens(ty, report), name, toks[e]);
        k = e;
        continue;
      }
      while (toks[j] && !is(j, ';')) j++;
      k = j;
      continue;
    }
    if (t.t === 'op' && t.v === '{') { braces.push(false); out.push(t); continue; }
    if (t.t === 'op' && t.v === '}') { if (braces.pop()) continue; out.push(t); continue; }
    if (t.t === 'op' && t.v === '::') {
      // a qualified name: its last part (the qualifiers already out: drop them back to the last name)
      while (out.length && out.at(-1).t === 'id' && toks[k + 1]?.t === 'id' && !isKeywordish(out.at(-1).v)) { out.pop(); break; }
      continue;
    }
    // hls_thread_local: a static (it lives across calls); hls::task t(f, a…); a task of f (#1721): #pragma HLS TASK name=t
    // then the call f(a…), the C simulation's task (core/c-interp-task.js)
    if (t.t === 'id' && t.v === 'hls_thread_local') { out.push({ ...t, v: 'static' }); continue; }
    if (t.t === 'id' && t.v === 'task' && toks[k + 1]?.t === 'id' && is(k + 2, '(') && toks[k + 3]?.t === 'id') {
      while (out.length && out.at(-1).t === 'id' && out.at(-1).v === 'static') out.pop();
      const name = toks[k + 1].v;
      out.push({ ...t, t: 'pragma', v: { name: 'TASK', args: { name }, text: `HLS TASK name=${name}` } }, toks[k + 3], toks[k + 2]);
      k = is(k + 4, ',') ? k + 4 : k + 3;
      continue;
    }
    // a file stream (ofstream f; ifstream g("in.dat");): a FILE * (core/cpp-tree.js its <<, >>, open, close, #1590)
    if (t.t === 'id' && STREAM_TYPES[t.v] && toks[k + 1]?.t === 'id') {
      const nameTok = toks[k + 1];
      const nm = nameTok.v === 'FILE' ? 'ap_s_FILE' : nameTok.v;
      if (nm !== nameTok.v) renamed.set(nameTok.v, nm);
      streams.set(nm, STREAM_TYPES[t.v]);
      out.push({ ...t, v: 'FILE' }, { ...t, t: 'op', v: '*' }, { ...nameTok, v: nm });
      k++;
      if (is(k + 1, '(')) {
        // its constructor: = fopen(name, mode)
        let j = k + 2, depth = 1;
        const args = [];
        for (; toks[j] && depth; j++) { if (is(j, '(')) depth++; if (is(j, ')')) { depth--; if (!depth) break; } args.push(toks[j]); }
        out.push({ ...t, t: 'op', v: '=' }, { ...t, t: 'id', v: 'fopen' }, { ...t, t: 'op', v: '(' }, ...args.slice(0, args.findIndex((x) => x.v === ',') + 1 || args.length),
          ...(args.some((x) => x.v === ',') ? [] : [{ ...t, t: 'op', v: ',' }]), { ...t, t: 'str', v: STREAM_TYPES[t.v] }, { ...t, t: 'op', v: ')' });
        k = j;
      }
      continue;
    }
    if (t.t === 'id' && renamed.has(t.v)) { out.push({ ...t, v: renamed.get(t.v) }); continue; }
    // int(e): a cast, (int)(e)
    if (t.t === 'id' && FUNC_CASTS.has(t.v) && is(k + 1, '(') && out.length && (out.at(-1).t === 'op' ? out.at(-1).v !== ')' : out.at(-1).v === 'return')) {
      out.push({ ...t, t: 'op', v: '(' }, t, { ...t, t: 'op', v: ')' });
      continue;
    }
    if (t.t === 'id' && t.v === 'nullptr') { out.push({ ...t, t: 'num', v: '0' }); continue; }
    if (t.t === 'id' && t.v === 'constexpr') { out.push({ ...t, v: 'const' }); continue; }
    if (t.t === 'id' && (t.v === 'static_cast' || t.v === 'const_cast') && is(k + 1, '<')) {
      // static_cast<T>(e): (T)(e)
      let j = k + 2, depth = 1;
      const ty = [];
      for (; toks[j] && depth; j++) {
        if (is(j, '<')) depth++;
        if (is(j, '>')) { depth--; if (!depth) break; }
        if (is(j, '>>')) { depth -= 2; if (depth <= 0) break; }
        ty.push(toks[j]);
      }
      out.push({ ...t, t: 'op', v: '(' }, ...cppTokens(ty, report), { ...t, t: 'op', v: ')' });
      k = j;
      continue;
    }
    if (t.t === 'id' && (t.v === 'reinterpret_cast' || t.v === 'dynamic_cast')) report(t, `${t.v} is not possible in hardware (Vitis HLS: no casts between pointer types)`);
    if (t.t === 'id' && t.v === 'static_assert' && is(k + 1, '(')) {
      let j = k + 2, depth = 1;
      for (; toks[j] && depth; j++) { if (is(j, '(')) depth++; if (is(j, ')')) depth--; }
      k = is(j, ';') ? j : j - 1;
      continue;
    }
    out.push(t);
  }
  return out;
}
const isKeywordish = (v) => ['return', 'case', 'else', 'do'].includes(v);

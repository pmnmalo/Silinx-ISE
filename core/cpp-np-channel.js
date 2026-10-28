// Silinx HLS C++ (#1743): hls_np_channel.h's channels of a DATAFLOW region, as tokens: hls::split::round_robin<T, N>
// s; (s.in written, s.out[i] read) and hls::merge::round_robin<T, N> s; (s.in[i] written, s.out read) are streams
// (s_in, s_out, an array of N where the channel has N) and a task of their own, defined before the function, that moves
// each value: a split's to its outputs in turn, a merge's from its inputs in turn. load_balance (Vitis HLS's: a free
// output, an input with data, its order the schedule's) is made as round_robin, with a warning. Before
// core/cpp-task-array.js. N a constant expression, its names declared before (const int NP = 4;, #1898). Isomorphic
// ES module.
//
//   npChannels(tokens, report) -> tokens
import { closing, splitTop, constTokens, constDecl, named } from './cpp-template.js';
import { scan } from './c-lex.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);

export function npChannels(toks, report) {
  const out = [], chans = new Map(), consts = new Map();
  let depth = 0, start = 0;
  const lex = (text, at) => scan(text, at.line, []).map((x) => ({ ...x, line: at.line, col: at.col, file: at.file }));
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    if (op(t, '{')) depth++;
    if (op(t, '}')) depth--;
    constDecl(toks, k, consts);   // (N a named constant, #1898)
    // hls::split::round_robin<T, N, …> s;
    if (isId(t, 'hls') && op(toks[k + 1], '::') && (isId(toks[k + 2], 'split') || isId(toks[k + 2], 'merge')) && op(toks[k + 3], '::')
      && (isId(toks[k + 4], 'round_robin') || isId(toks[k + 4], 'load_balance')) && op(toks[k + 5], '<')) {
      const kind = toks[k + 2].v, mode = toks[k + 4].v;
      const e = closing(toks, k + 5);
      const args = splitTop(toks.slice(k + 6, e));
      const name = toks[e + 1];
      const n = args[1] ? constTokens(named(args[1], consts)) : null;
      if (!isId(name) || !op(toks[e + 2], ';') || n === null || n < 1n) { report(t, `hls::${kind}::${mode}: hls::${kind}::${mode}<T, N> name; (N a constant)`); out.push(t); continue; }
      if (mode === 'load_balance') report(name, `hls::${kind}::load_balance '${name.v}': made as round_robin (each ${kind === 'split' ? 'output' : 'input'} in turn)`, 'warning');
      const T = args[0].map((x) => x.v).join(' ').replace(/ ?([<>,]) ?/g, '$1').replace(/>>/g, '> >');
      const d = args[2] ? `, ${args[2].map((x) => x.v).join(' ')}` : '';
      const nm = name.v, fn = `ap_${kind}_${nm}`;
      chans.set(nm, kind);
      // (its task, before the function it is in)
      // (its names its own: an array of streams' names are the file's, core/c-stream-array.js)
      const [I, O, K, V] = [`${fn}_in`, `${fn}_out`, `${fn}_k`, `${fn}_v`];
      const body = kind === 'split'
        ? `static void ${fn}(hls::stream<${T}> &${I}, hls::stream<${T}${d}> (&${O})[${n}]) { static int ${K} = 0; ${T} ${V} = ${I}.read(); ${O}[${K}].write(${V}); ${K} = ${K} == ${n - 1n} ? 0 : ${K} + 1; }`
        : `static void ${fn}(hls::stream<${T}${d}> (&${I})[${n}], hls::stream<${T}> &${O}) { static int ${K} = 0; ${T} ${V} = ${I}[${K}].read(); ${O}.write(${V}); ${K} = ${K} == ${n - 1n} ? 0 : ${K} + 1; }`;
      out.splice(start, 0, ...lex(body, t));
      // (static before it: hls_thread_local, core/cpp-lex.js's static, kept for the streams)
      const decl = kind === 'split' ? `hls::stream<${T}> ${nm}_in; hls::stream<${T}${d}> ${nm}_out[${n}];` : `hls::stream<${T}${d}> ${nm}_in[${n}]; hls::stream<${T}> ${nm}_out;`;
      const lead = out.length && isId(out.at(-1), 'hls_thread_local') ? out.pop() : null;
      for (const s of decl.split(';').filter((x) => x.trim())) out.push(...(lead ? [{ ...lead }] : []), ...lex(`${s};`, t));
      out.push({ ...t, t: 'pragma', v: { name: 'TASK', args: { name: nm }, text: `HLS TASK name=${nm}` } }, ...lex(`${fn}(${nm}_in, ${nm}_out);`, t));
      k = e + 2;
      continue;
    }
    // s.in, s.out
    if (isId(t) && chans.has(t.v) && op(toks[k + 1], '.') && (isId(toks[k + 2], 'in') || isId(toks[k + 2], 'out'))) {
      out.push({ ...t, v: `${t.v}_${toks[k + 2].v}` });
      k += 2;
      continue;
    }
    out.push(t);
    if (depth === 0 && (op(t, ';') || op(t, '}'))) start = out.length;
  }
  return out;
}

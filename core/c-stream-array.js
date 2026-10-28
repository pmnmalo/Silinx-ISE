// Silinx HLS C++ (#1739): arrays of hls::stream, as tokens, as Vitis HLS makes them: each element a stream of its own
// (its own ap_fifo port; a FIFO of a DATAFLOW region), named by the array and its index (s[2] is s_2):
//   hls::stream<T> s[N];   hls::stream<T> s_0, s_1, …;   a parameter s[N] or (&s)[N]: hls::stream<T> &s_0, …
//   s[k] (a constant index)   s_k
//   s (an array passed whole, an argument)   s_0, s_1, …
//   a statement using s[e] (an index a variable)   the statement for each element, on the index (if (e == 0) …
//   else if …), a declaration's variable declared first; its pragmas (port=s) one per element, said once
// N and k constant expressions, their names the constants declared before (core/cpp-consts.js, #1898). Also a stream's
// name for the C simulation's messages, hls::stream<T> s("name"), dropped. Before core/cpp-template.js.
// Isomorphic ES module.
//
//   streamArrays(tokens, report, later) -> tokens (later: a size naming what is not known yet, a template's parameter, left
//     as it is for the pass after core/cpp-template.js, #1898)
import { closing } from './cpp-template.js';
import { constants } from './cpp-consts.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });
const STOP = (t) => !t || op(t, ';') || op(t, '{') || op(t, '}') || t.t === 'pragma';

/** At k, a stream type (hls::stream<…>, stream<…>): its end (the '>'), else -1. */
function streamType(toks, k) {
  let j = k;
  if (isId(toks[j], 'hls') && op(toks[j + 1], '::')) j += 2;
  if (!isId(toks[j], 'stream') || !op(toks[j + 1], '<')) return -1;
  const e = closing(toks, j + 1);
  return e > 0 ? e : -1;
}

export function streamArrays(input, report, later = false) {
  // the arrays: their declarations and parameters (name -> N)
  const arrays = new Map(), consts = constants();
  const toks = [];
  for (let k = 0; k < input.length; k++) {
    consts.at(input, k);   // (N a named constant, #1898)
    const e = streamType(input, k);
    if (e < 0 || op(input[k - 1], '::') || op(input[k - 1], '<')) { toks.push(input[k]); continue; }
    const ty = input.slice(k, e + 1);
    const param = op(input[k - 1], '(') || op(input[k - 1], ',') || isId(input[k - 1], 'const');
    // a list of declarators: name, name[N], (&name)[N], name("…")
    const out = [], mine = [];
    let j = e + 1, first = true, wait = false;
    for (;;) {
      let name = null, ref = false, n = null;
      if (op(input[j], '(') && op(input[j + 1], '&') && isId(input[j + 2]) && op(input[j + 3], ')') && op(input[j + 4], '[')) {
        name = input[j + 2]; ref = true; j += 4;
      } else if (op(input[j], '&') && isId(input[j + 1])) { name = input[j + 1]; ref = true; j += 2; }
      else if (isId(input[j])) { name = input[j]; j += 1; }
      if (!name) break;
      if (op(input[j], '[')) {
        const c = closing(input, j);
        const v = consts.value(input.slice(j + 1, c));
        if (v === null && later && input.slice(j + 1, c).some((x) => isId(x))) { wait = true; break; }
        if (v === null || v < 1n) report(name, `the array of streams '${name.v}': its size must be a constant`);
        n = v !== null && v >= 1n ? Number(v) : 1;   // (its first, said)
        j = c + 1;
      }
      // (a stream's name: the C simulation's, dropped)
      if (!param && op(input[j], '(') && input[j + 1]?.t === 'str' && op(input[j + 2], ')')) j += 3;
      // (a parameter: each element with its type, by reference; a declaration: a list of names)
      const one = (nm, lead) => (param ? [...(lead ? [] : ty.map((x) => ({ ...x }))), ...(ref || n !== null ? [L(name, '&')] : []), L(name, nm, 'id')] : [L(name, nm, 'id')]);
      if (n === null) out.push(...(first ? [] : [L(name, ',')]), ...one(name.v, first));
      else {
        arrays.set(name.v, n);
        mine.push(name.v);
        for (let i = 0; i < n; i++) out.push(...(first && i === 0 ? [] : [L(name, ',')]), ...one(`${name.v}_${i}`, first && i === 0));
      }
      first = false;
      if (!param && op(input[j], ',')) { j++; continue; }
      break;
    }
    if (wait) { mine.forEach((x) => arrays.delete(x)); toks.push(input[k]); continue; }
    toks.push(...ty, ...out);
    k = j - 1;
  }
  if (!arrays.size) return toks;
  return uses(toks, arrays, report);
}

/** The uses of the arrays: s[k], s whole, a statement with s[e]. */
function uses(toks, arrays, report) {
  const out = [], consts = constants();
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    consts.at(toks, k);
    // a pragma naming an array (port=, variable=): one per element, said once (core/c-pragma.js)
    if (t.t === 'pragma' && !t.v.of) {
      const key = ['port', 'variable'].find((x) => typeof t.v.args?.[x] === 'string' && arrays.has(t.v.args[x]));
      if (key) {
        const nm = t.v.args[key];
        for (let i = 0; i < arrays.get(nm); i++) out.push({ ...t, v: { ...t.v, args: { ...t.v.args, [key]: `${nm}_${i}` }, text: t.v.text.replace(new RegExp(`(${key}\\s*=\\s*)${nm}\\b`, 'i'), `$1${nm}_${i}`), of: nm, ...(i ? { dup: true } : {}) } });
        continue;
      }
    }
    if (!(isId(t) && arrays.has(t.v)) || op(toks[k - 1], '.') || op(toks[k - 1], '::')) { out.push(t); continue; }
    const n = arrays.get(t.v);
    if (op(toks[k + 1], '[')) {
      const c = closing(toks, k + 1);
      const v = consts.value(toks.slice(k + 2, c));
      if (v !== null) {
        const bad = v < 0n || v >= BigInt(n);
        if (bad) report(t, `'${t.v}[${v}]': outside the array of ${n} streams`);
        out.push(L(t, `${t.v}_${bad ? 0 : v}`, 'id'));   // (its first, said: no errors after it)
        k = c;
        continue;
      }
      // (a variable index: the statement for each element)
      let s = out.length;
      while (s > 0 && !STOP(out[s - 1]) && !headerEnd(out, s)) s--;
      // (its end: the ';' outside the parentheses its start opened, if (s[j].read() != x) return 1;)
      let e = k, d0 = 0;
      for (const x of out.slice(s)) { if (op(x, '(') || op(x, '[') || op(x, '{')) d0++; if (op(x, ')') || op(x, ']') || op(x, '}')) d0--; }
      for (let d = d0; e < toks.length; e++) {
        if (op(toks[e], '(') || op(toks[e], '[') || op(toks[e], '{')) d++;
        if (op(toks[e], ')') || op(toks[e], ']') || op(toks[e], '}')) d--;
        if (d === 0 && op(toks[e], ';')) break;
      }
      const before = out.splice(s), rest = toks.slice(k, e + 1);
      const idx = toks.slice(k + 2, c);
      if (idx.some((x) => op(x, '++') || op(x, '--') || (x.t === 'op' && /^([-+*/%&|^]|<<|>>)?=$/.test(x.v)))) report(t, `'${t.v}[…]': an index with a side effect (write it apart)`);
      const stmt = [...before, ...rest];
      // (a declaration T v = …: v declared first, the statement its assignment)
      const eq = stmt.findIndex((x) => op(x, '='));
      const decl = eq >= 2 && stmt.slice(0, eq).every((x) => x.t === 'id' || x.t === 'num' || op(x, '<') || op(x, '>') || op(x, ',') || op(x, '::')) && isId(stmt[eq - 1]) && isId(stmt[eq - 2]) || (eq >= 2 && op(stmt[eq - 2], '>') && isId(stmt[eq - 1]));
      const body = decl ? stmt.slice(eq - 1) : stmt;
      if (decl) out.push(...stmt.slice(0, eq), L(t, ';'));
      out.push(L(t, '{'));
      for (let i = 0; i < n; i++) {
        if (i) out.push(L(t, 'else', 'id'));
        if (i < n - 1) out.push(L(t, 'if', 'id'), L(t, '('), L(t, '('), ...idx.map((x) => ({ ...x })), L(t, ')'), L(t, '=='), L(t, String(i), 'num'), L(t, ')'));
        // (the element's statement: its own uses, the others still to rewrite)
        const one = body.map((x) => ({ ...x }));
        const at = body.indexOf(t);
        const cl = closing(one, at + 1);
        one.splice(at, cl - at + 1, L(t, `${t.v}_${i}`, 'id'));
        out.push(L(t, '{'), ...uses(one, arrays, report), L(t, '}'));
      }
      out.push(L(t, '}'));
      k = e;
      continue;
    }
    // (an array passed whole: its elements)
    if ((op(toks[k - 1], '(') || op(toks[k - 1], ',')) && (op(toks[k + 1], ')') || op(toks[k + 1], ','))) {
      for (let i = 0; i < n; i++) out.push(...(i ? [L(t, ',')] : []), L(t, `${t.v}_${i}`, 'id'));
      continue;
    }
    report(t, `the array of streams '${t.v}': index it (${t.v}[i]) or pass it whole to a function`);
    out.push(t);
  }
  return out;
}

/** Whether out[0..s) ends with a control's header (if (…), for (…), while (…), else, do): a statement starts at s. */
function headerEnd(out, s) {
  const t = out[s - 1];
  if (isId(t, 'else') || isId(t, 'do')) return true;
  if (!op(t, ')')) return false;
  let d = 0;
  for (let i = s - 1; i >= 0; i--) {
    if (op(out[i], ')')) d++;
    else if (op(out[i], '(') && !--d) return isId(out[i - 1], 'if') || isId(out[i - 1], 'for') || isId(out[i - 1], 'while');
  }
  return false;
}

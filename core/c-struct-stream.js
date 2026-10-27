// Silinx HLS C++ (#1662): a stream of a struct, hls::stream<S>, as one stream per member of S (the scalar replacement
// core/c-struct.js makes of S's variables): its declarations (a parameter, a local stream), its writes (write, <<),
// its reads (read() in a declaration, an assignment or a return; read(v), >>), empty / full, the stream passed to a
// function, the pragmas naming it. As tokens, after core/c-struct.js's definitions; its uses then rewritten by it.
// Isomorphic ES module.
//
//   structStreams(toks, structs, report, streamArgs) -> toks (streamArgs: function -> [{ name, members, loc, stream }])
import { closing } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const STMT_START = (t) => !t || op(t, ';') || op(t, '{') || op(t, '}') || t.t === 'pragma' || op(t, ':');
const L = (t, v, tt = 'op') => ({ ...t, t: tt, v });

/** S's members to their scalars: [{ suffix, path: [names], type }] (a member array: none, said). */
function leafPaths(S, report, at) {
  const out = [];
  for (const m of S.members) {
    if (m.dims.length) { report(at, `the stream of '${S.name}': its member '${m.name}' is an array (not possible in a stream yet)`); continue; }
    if (m.struct) for (const l of leafPaths(m.struct, report, at)) out.push({ suffix: `_${m.name}${l.suffix}`, path: [m.name, ...l.path], type: l.type });
    else out.push({ suffix: `_${m.name}`, path: [m.name], type: m.type });
  }
  return out;
}

export function structStreams(input, structs, report, streamArgs = new Map()) {
  const found = { any: false };
  const toks = declarations(input, structs, found, report, streamArgs);
  return found.any ? uses(toks, report) : toks;
}

/** hls::stream<S> at k (hls:: optional): { S, start, close } (close: its '>'), or null. */
function streamType(toks, k, structs) {
  const start = k;
  const s = isId(toks[k], 'hls') && op(toks[k + 1], '::') ? k + 2 : k;
  if (!isId(toks[s], 'stream') || !op(toks[s + 1], '<')) return null;
  if (isId(toks[k - 1], 'hls') || op(toks[k - 1], '::')) return null;   // (its 'stream' reached through hls::)
  const close = closing(toks, s + 1);
  if (close < 0) return null;
  let a = s + 2;
  if (isId(toks[a], 'struct') || isId(toks[a], 'class')) a++;
  if (!(isId(toks[a]) && structs.has(toks[a].v))) return null;
  // (hls::stream<S, depth>: its depth kept for each member's stream)
  const depth = op(toks[a + 1], ',') ? toks.slice(a + 1, close) : [];
  if (a + 1 !== close && !depth.length) return null;
  return { S: structs.get(toks[a].v), start, close, depth };
}

/** The type hls::stream<T> of a leaf, its depth as the struct's stream's. */
const leafStream = (t, leaf, depth) => [L(t, 'hls', 'id'), L(t, '::'), L(t, 'stream', 'id'), L(t, '<'), ...leaf.type.map((x) => ({ ...x })), ...depth.map((x) => ({ ...x })), L(t, '>')];

/** The streams of structs declared, as scopes (a function's parameters its body's); each use of one, a name or a
 *  pragma naming it, marked with it (sv: { S, leaves, name }) for uses(). */
function declarations(toks, structs, found, report, streamArgs) {
  const out = [];
  const scopes = [new Map()];
  let params = null;   // (the parameters of the function whose body comes next)
  const lookup = (n) => { for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(n)) return scopes[i].get(n); return null; };
  const declare = (scope, nm, S, leaves) => { scope.set(nm.v, { S, leaves, name: nm.v }); found.any = true; };
  for (let k = 0; k < toks.length; k++) {
    const st = streamType(toks, k, structs);
    if (!st) {
      const t = toks[k];
      if (op(t, '{')) { scopes.push(params || new Map()); params = null; }
      else if (op(t, '}')) { if (scopes.length > 1) scopes.pop(); }
      else if (op(t, ';')) params = null;
      const at = t.t === 'pragma' && typeof t.v === 'object' && t.v?.args ? ['port', 'variable'].find((x) => lookup(t.v.args[x])) : null;
      const sv = at ? lookup(t.v.args[at]) : isId(t) && !op(toks[k - 1], '.') && !op(toks[k - 1], '->') && !op(toks[k - 1], '::') ? lookup(t.v) : null;
      out.push(sv ? { ...t, sv, svKey: at } : t);
      continue;
    }
    const t = toks[k];
    let j = st.close + 1;
    const ref = op(toks[j], '&');
    if (ref) j++;
    const name = toks[j];
    if (!isId(name)) { out.push(toks[k]); continue; }   // (a template's argument, a cast: left as it is)
    const leaves = leafPaths(st.S, report, name);
    const param = op(out.at(-1), '(') || op(out.at(-1), ',');
    if (param) {
      declare(params ||= new Map(), name, st.S, leaves);
      // (its function's: the top's ports said, core/c-hdl.js)
      let p = out.length - 1, d = 0;
      for (; p >= 0; p--) { if (op(out[p], ')')) d++; else if (op(out[p], '(') && d-- === 0) break; }
      const fn = out[p - 1];
      if (isId(fn)) {
        const a = (streamArgs.get(fn.v) || []).filter((x) => x.name !== name.v);
        streamArgs.set(fn.v, [...a, { name: name.v, members: leaves.map((l) => `${name.v}${l.suffix}`), loc: name, stream: true }]);
      }
      // a parameter: one per member, hls::stream<T> &name_m
      leaves.forEach((l, i) => {
        if (i) out.push(L(t, ','));
        out.push(...leafStream(t, l, st.depth), ...(ref ? [L(t, '&')] : []), L(name, `${name.v}${l.suffix}`, 'id'));
      });
      k = j;
      continue;
    }
    // a local stream: hls::stream<S> s, t("name");: one per member of each
    let e = j;
    for (;;) {
      const nm = toks[e];
      if (!isId(nm)) { report(nm || name, `a stream of '${st.S.name}': a name expected`); break; }
      declare(scopes.at(-1), nm, st.S, leaves);
      e++;
      if (op(toks[e], '(')) e = closing(toks, e) + 1;
      if (op(toks[e], '[')) { report(toks[e], `'${nm.v}': an array of streams of a struct is not possible yet`); while (toks[e] && !op(toks[e], ',') && !op(toks[e], ';')) e++; }
      for (const l of leaves) out.push(...leafStream(t, l, st.depth), L(nm, `${nm.v}${l.suffix}`, 'id'), L(t, ';'));
      if (!op(toks[e], ',')) break;
      e++;
    }
    while (toks[e] && !op(toks[e], ';')) e++;
    k = e;
  }
  return out;
}

function uses(toks, report) {
  let n = 0;
  const out = [];
  const member = (base, l, t) => [...base.map((x) => ({ ...x })), ...l.path.flatMap((p) => [L(t, '.'), L(t, p, 'id')])];
  const call = (name, l, fn, args, t) => [L(name, `${name.v}${l.suffix}`, 'id'), L(t, '.'), L(t, fn, 'id'), L(t, '('), ...args, L(t, ')')];
  const reads = (name, v, leaves, t) => leaves.flatMap((l) => [...member(v, l, t), L(t, '='), ...call(name, l, 'read', [], t), L(t, ';')]);
  const writes = (name, e, leaves, t) => leaves.flatMap((l) => [...call(name, l, 'write', member(e, l, t), t), L(t, ';')]);
  for (let k = 0; k < toks.length; k++) {
    const { sv, svKey, ...t } = toks[k];   // (the stream a use names: declarations()'s mark)
    // a pragma naming the stream: one per member
    if (t.t === 'pragma' && sv) {
      sv.leaves.forEach((l, i) => {
        const nm = `${sv.name}${l.suffix}`;
        // (said once, of the stream's own name: core/c-pragma.js)
        const text = t.v.text.replace(new RegExp(`(${svKey}\\s*=\\s*)${sv.name}\\b`, 'i'), `$1${nm}`);
        out.push({ ...t, v: { ...t.v, args: { ...t.v.args, [svKey]: nm }, text, of: sv.name, ...(i ? { dup: true } : {}) } });
      });
      continue;
    }
    if (!sv) { out.push(t); continue; }
    const { leaves } = sv;
    // passed to a function: its members' streams
    if ((op(toks[k - 1], '(') || op(toks[k - 1], ',')) && (op(toks[k + 1], ')') || op(toks[k + 1], ','))) {
      leaves.forEach((l, i) => { if (i) out.push(L(t, ',')); out.push(L(t, `${t.v}${l.suffix}`, 'id')); });
      continue;
    }
    const fn = op(toks[k + 1], '.') && isId(toks[k + 2]) && op(toks[k + 3], '(') ? toks[k + 2].v : null;
    const shift = op(toks[k + 1], '<<') ? 'write' : op(toks[k + 1], '>>') ? 'read' : null;
    if (fn === 'empty' || fn === 'full' || fn === 'size') {
      out.push(...call(t, leaves[0], fn, [], t).slice(0, -1));
      k += 3;
      continue;
    }
    // s.write(e); s << e; s.read(v); s >> v;
    if (shift || ((fn === 'write' || fn === 'read') && toks[k + 4] && !op(toks[k + 4], ')'))) {
      const a0 = shift ? k + 2 : k + 4;
      let e = a0;
      if (shift) while (toks[e] && !op(toks[e], ';')) e++;
      else e = closing(toks, k + 3);
      const arg = toks.slice(a0, e);
      const end = shift ? e : e + 1;
      if (!op(toks[end], ';') || !(STMT_START(out.at(-1)) || op(out.at(-1), ')') || isId(out.at(-1), 'else') || isId(out.at(-1), 'do'))) {
        report(t, `'${t.v}' (a stream of a struct): its ${shift || fn} a statement of its own (${t.v}.${shift || fn}(…);)`);
        out.push(L(t, '0', 'num'));   // (said once: the call dropped)
        k = shift ? e - 1 : e;
        continue;
      }
      if ((shift || fn) === 'write') {
        const tmp = L(t, `ap_s${n++}`, 'id');
        out.push(L(t, '{'), L(t, sv.S.name, 'id'), tmp, L(t, '='), ...arg, L(t, ';'), ...writes(t, [tmp], leaves, t), L(t, '}'));
      } else out.push(L(t, '{'), ...reads(t, arg, leaves, t), L(t, '}'));
      k = end;
      continue;
    }
    // s.read(): in a declaration (S v = s.read();), an assignment (x = s.read();) or a return
    if (fn === 'read' && op(toks[k + 4], ')') && op(toks[k + 5], ';')) {
      let r = out.length;
      while (r > 0 && !STMT_START(out[r - 1])) r--;
      // (the statement after an if (…) / else / while (…) / for (…) with no braces)
      for (;;) {
        if ((isId(out[r], 'if') || isId(out[r], 'while') || isId(out[r], 'for') || isId(out[r], 'switch')) && op(out[r + 1], '(')) { r = closing(out, r + 1) + 1; continue; }
        if (isId(out[r], 'else') || isId(out[r], 'do')) { r++; continue; }
        break;
      }
      const head = out.splice(r);
      const eq = head.findIndex((x) => op(x, '='));
      const tmp = L(t, `ap_s${n++}`, 'id');
      if (eq === head.length - 1 && eq >= 2 && isId(head[eq - 1]) && head.slice(0, eq - 1).every((x) => isId(x))) {
        // S v = s.read(); (auto v, const S v)
        const v = head[eq - 1];
        const ty = head.slice(0, eq - 1).map((x) => (isId(x, 'auto') ? L(x, sv.S.name, 'id') : x)).filter((x) => !isId(x, 'const'));
        out.push(...ty, v, L(t, ';'), ...reads(t, [v], leaves, t));
      } else if (eq === head.length - 1 && eq >= 1) {
        out.push(L(t, '{'), ...reads(t, head.slice(0, eq), leaves, t), L(t, '}'));
      } else if (head.length === 1 && isId(head[0], 'return')) {
        out.push(L(t, '{'), L(t, sv.S.name, 'id'), tmp, L(t, ';'), ...reads(t, [tmp], leaves, t), head[0], tmp, L(t, ';'), L(t, '}'));
      } else {
        report(t, `'${t.v}.read()' (a stream of a struct): read it in a declaration (${sv.S.name} v = ${t.v}.read();), an assignment or a return`);
        out.push(...head, L(t, '0', 'num'));
        k += 4;
        continue;
      }
      k += 5;
      continue;
    }
    if (fn === 'read') {
      report(t, `'${t.v}.read()' (a stream of a struct): read it in a declaration (${sv.S.name} v = ${t.v}.read();), an assignment or a return`);
      out.push(L(t, '0', 'num'));
      k = closing(toks, k + 3);
      while (op(toks[k + 1], '.') && isId(toks[k + 2])) k += 2;   // (s.read().a: its member too)
      continue;
    }
    report(t, `'${t.v}' (a stream of a struct): only write, read, <<, >>, empty and full, or passed to a function`);
    out.push(t);
  }
  return out;
}

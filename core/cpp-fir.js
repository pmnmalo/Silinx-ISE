// Silinx HLS C++ (#1942): hls_fir.h's hls::FIR<config> in the source, as tokens (before core/cpp-stl.js): the config
// struct derived from hls::ip_fir::params_t read (its static members' values; coeff_vec defined in it or after it,
// const double config::coeff_vec[N] = { … };), checked (core/hls-fir.js) and left a struct of its integer parameters
// (config::num_coeffs); hls::ip_fir's constants numbers; a filter, static hls::FIR<config> f; (its state lives across
// calls), and its f.run(in, out[, config]) a call of the filter's C model, ap_fir_f, written before the function it is
// in (its arguments' types the declared ones: arrays or streams, the config a pointer, a value or a stream). In a
// DATAFLOW region the call is a process, its hardware core/hls-fir-hdl.js's. Isomorphic ES module.
//
//   cppFir(tokens, report) -> { tokens, firs: Map ap_fir_<f> -> { obj, config, p, args, loc } }
import { closing, splitTop, declType } from './cpp-template.js';
import { constants } from './cpp-consts.js';
import { scan } from './c-lex.js';
import { FIR_CONSTANTS, FIR_DEFAULTS, firParams, firCModel } from './hls-fir.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const qualified = (toks, k, ...names) => names.every((n, i) => isId(toks[k + 2 * i], n) && (i === names.length - 1 || op(toks[k + 2 * i + 1], '::')));

/** A double's constant expression (numbers, names of values, + - * / and parentheses), or null. */
function number(toks, names) {
  let k = 0;
  const unary = () => {
    const t = toks[k++];
    if (!t) return null;
    if (t.t === 'num') { const x = Number(String(t.v).replace(/'/g, '').replace(/[uUlLfF]+$/, '')); return Number.isFinite(x) ? x : null; }
    if (t.t === 'id' && names.has(t.v)) return Number(names.get(t.v));
    if (op(t, '(')) { const v = sum(); return op(toks[k++], ')') ? v : null; }
    if (op(t, '-')) { const v = unary(); return v === null ? null : -v; }
    if (op(t, '+')) return unary();
    return null;
  };
  const product = () => {
    let a = unary();
    while (a !== null && (op(toks[k], '*') || op(toks[k], '/'))) { const o = toks[k++].v, b = unary(); a = b === null ? null : o === '*' ? a * b : a / b; }
    return a;
  };
  const sum = () => {
    let a = product();
    while (a !== null && (op(toks[k], '+') || op(toks[k], '-'))) { const o = toks[k++].v, b = product(); a = b === null ? null : o === '+' ? a + b : a - b; }
    return a;
  };
  const v = sum();
  return k === toks.length ? v : null;
}

export function cppFir(toks, report) {
  const out = [], firs = new Map(), configs = new Map(), objs = new Map(), consts = constants();
  let depth = 0, start = 0, skip = -1;
  const lex = (text, at) => scan(text, at.line, []).map((x) => ({ ...x, line: at.line, col: at.col, file: at.file }));
  // (hls::ip_fir::x: its number)
  const ipFir = (t, name) => {
    if (name in FIR_CONSTANTS) return { ...t, t: 'num', v: String(FIR_CONSTANTS[name]) };
    report(t, `hls::ip_fir::${name} is not one of hls_fir.h's constants`);
    return { ...t, t: 'num', v: '0' };
  };
  const resolve = (list) => {
    const r = [];
    for (let j = 0; j < list.length; j++) {
      if (qualified(list, j, 'hls', 'ip_fir') && op(list[j + 3], '::') && isId(list[j + 4])) { r.push(ipFir(list[j], list[j + 4].v)); j += 4; continue; }
      r.push(list[j]);
    }
    return r;
  };
  /** A member's value: an integer field a BigInt, a double a number, an array its numbers; null when not constant. */
  const valueOf = (cfg, name, vt, isArray) => {
    // (a field named: its value, or params_t's default)
    const known = (f) => (cfg.fields.has(f) ? cfg.fields.get(f) : f === 'total_num_coeff' ? known('num_coeffs') * known('coeff_sets') : FIR_DEFAULTS[f]);
    const toks2 = resolve(vt).map((t) => (isId(t) && !op(vt[vt.indexOf(t) - 1], '::') && ['bigint', 'number'].includes(typeof known(t.v)) ? { ...t, t: 'num', v: String(known(t.v)) } : t));
    if (isArray) {
      if (!op(toks2[0], '{')) return null;
      const items = splitTop(toks2.slice(1, closing(toks2, 0)));
      const xs = items.map((x) => number(x, new Map()));
      return xs.some((x) => x === null) ? null : xs;
    }
    if (typeof FIR_DEFAULTS[name] === 'number') return number(toks2, new Map());
    return consts.value(toks2);
  };
  /** The members of a config struct's body (tokens between its braces): its fields set. */
  const members = (cfg, body) => {
    let j = 0;
    while (j < body.length) {
      let e = j;
      for (let d = 0; e < body.length && !(d === 0 && op(body[e], ';')); e++) d += op(body[e], '{') || op(body[e], '(') ? 1 : op(body[e], '}') || op(body[e], ')') ? -1 : 0;
      member(cfg, body.slice(j, e));
      j = e + 1;
    }
  };
  /** One member (or an out-of-class definition's tokens after config::): [quals type] name [[N]] = value | { … }. */
  const member = (cfg, m) => {
    const at = m.findIndex((t, i) => isId(t) && (op(m[i + 1], '=') || op(m[i + 1], '[') || (op(m[i + 1], '{') && i > 0)));
    if (at < 0) return;
    const name = m[at].v;
    let j = at + 1;
    const isArray = op(m[j], '[');
    if (isArray) j = closing(m, j) + 1;
    const vt = op(m[j], '=') ? m.slice(j + 1) : op(m[j], '{') && !isArray ? m.slice(j + 1, closing(m, j)) : op(m[j], '{') ? m.slice(j) : null;
    if (!vt) return;   // (declared here, defined after the struct)
    const v = valueOf(cfg, name, vt, isArray);
    if (v === null) { if (name in FIR_DEFAULTS || name === 'coeff_vec') report(m[at], `hls::FIR's ${cfg.name}::${name}: its value is not a constant`); return; }
    cfg.fields.set(name, v);
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    consts.at(toks, k);
    if (op(t, '{')) depth++;
    if (op(t, '}')) depth--;
    if (k <= skip) {
      // (a declaration replaced: what follows it at file scope after it)
      if (k === skip && depth === 0 && (op(t, ';') || op(t, '}'))) start = out.length;
      continue;
    }
    // struct config : [public] hls::ip_fir::params_t { … };
    if ((isId(t, 'struct') || isId(t, 'class')) && isId(toks[k + 1]) && op(toks[k + 2], ':')) {
      let j = k + 3;
      if (['public', 'private', 'protected'].includes(toks[j]?.v)) j++;
      if (qualified(toks, j, 'hls', 'ip_fir', 'params_t') && op(toks[j + 5], '{')) {
        const name = toks[k + 1].v, close = closing(toks, j + 5);
        const cfg = { name, fields: new Map(), loc: toks[k + 1] };
        configs.set(name, cfg);
        members(cfg, toks.slice(j + 6, close));
        // (left a struct of its integer parameters, config::num_coeffs)
        const ints = Object.keys(FIR_DEFAULTS).filter((f) => typeof FIR_DEFAULTS[f] === 'bigint');
        const all = [...ints.map((f) => [f, cfg.fields.get(f) ?? FIR_DEFAULTS[f]]), ['total_num_coeff', BigInt(cfg.fields.get('num_coeffs') ?? FIR_DEFAULTS.num_coeffs) * BigInt(cfg.fields.get('coeff_sets') ?? FIR_DEFAULTS.coeff_sets)]];
        const text = `struct ${name} { ${all.map(([f, v]) => `static const int ${f} = ${v};`).join(' ')} };`;
        out.push(...lex(text, toks[k + 1]));
        skip = op(toks[close + 1], ';') ? close + 1 : close;
        continue;
      }
    }
    // const double config::coeff_vec[N] = { … }; (a static member defined after its struct)
    if (isId(t) && configs.has(t.v) && op(toks[k + 1], '::') && isId(toks[k + 2]) && depth === 0 && !op(toks[k - 1], '::')) {
      let e = k + 3;
      while (toks[e] && !op(toks[e], ';')) e = op(toks[e], '{') || op(toks[e], '[') || op(toks[e], '(') ? closing(toks, e) + 1 : e + 1;
      if (op(toks[k + 3], '[') || op(toks[k + 3], '=')) {
        member(configs.get(t.v), toks.slice(k + 2, e));
        out.length = start;
        skip = e;
        continue;
      }
    }
    // hls::ip_fir::x
    if (qualified(toks, k, 'hls', 'ip_fir') && op(toks[k + 3], '::') && isId(toks[k + 4])) { out.push(ipFir(t, toks[k + 4].v)); skip = k + 4; continue; }
    // static hls::FIR<config> f;
    if (qualified(toks, k, 'hls', 'FIR') && op(toks[k + 3], '<')) {
      const e = closing(toks, k + 3);
      const cfgName = toks[k + 4]?.v, name = toks[e + 1];
      const stat = isId(out.at(-1), 'static');
      if (stat) out.pop();
      let j = e + 1;
      while (toks[j] && !op(toks[j], ';')) j++;
      skip = j;
      if (e !== k + 5 || !isId(name) || !op(toks[e + 2], ';')) { report(t, 'hls::FIR: static hls::FIR<config> name; (config a struct derived from hls::ip_fir::params_t)'); continue; }
      // (one said: its run() dropped)
      if (!configs.has(cfgName)) { report(toks[k + 4], `hls::FIR<${cfgName}>: '${cfgName}' is not a struct derived from hls::ip_fir::params_t`); objs.set(name.v, { p: null }); continue; }
      if (!stat && depth > 0) { report(name, `hls::FIR '${name.v}': declare it static (static hls::FIR<${cfgName}> ${name.v};): its delay line lives across calls, as the filter's`); objs.set(name.v, { p: null }); continue; }
      const { p, errors } = firParams(cfgName, configs.get(cfgName).fields);
      errors.forEach((m) => report(toks[k + 4], m));
      objs.set(name.v, { config: cfgName, p, used: false });
      continue;
    }
    // f.run(in, out[, config]);
    if (isId(t) && objs.has(t.v) && op(toks[k + 1], '.') && isId(toks[k + 2], 'run') && op(toks[k + 3], '(')) {
      const obj = objs.get(t.v), c = closing(toks, k + 3);
      const args = splitTop(toks.slice(k + 4, c));
      // (a run() said: dropped, with its ';')
      skip = op(toks[c + 1], ';') ? c + 1 : c;
      if (!obj.p) continue;
      if (obj.used) { report(t, `hls::FIR '${t.v}': its run() is called once (one filter, its hardware a process of its own)`); continue; }
      obj.used = true;
      if (args.length < 2 || args.length > 3) { report(t, `hls::FIR '${t.v}': run(in, out) or run(in, out, config)`); continue; }
      const kinds = [];
      for (const [i, a] of args.entries()) {
        // (the arguments' types: their declarations before the call)
        const ptr = op(a[0], '&') && a.length === 2;
        const id = ptr ? a[1] : a[0];
        const ty = (ptr || a.length === 1) && isId(id) ? declType(out, id.v) : null;
        if (!ty) { report(a[0] || t, `hls::FIR '${t.v}': run()'s ${['input', 'output', 'config'][i]} is an array, a stream${i === 2 ? ', a pointer or a value' : ''} declared in the function (its name)`); break; }
        const s = ty.findIndex((x) => isId(x, 'stream'));
        const stream = s >= 0 && op(ty[s + 1], '<');
        const elem = stream ? ty.slice(s + 2, closing(ty, s + 1)) : ty.filter((x) => !op(x, '*'));
        kinds.push({ type: elem.map((x) => x.v).join(' '), stream, ptr: ptr || ty.some((x) => op(x, '*')) });
      }
      if (kinds.length !== args.length) continue;
      const [ain, aout, acfg] = kinds;
      const fn = `ap_fir_${t.v}`, at = toks[k];
      out.push({ ...t, v: fn }, ...toks.slice(k + 3, skip + 1));
      out.splice(start, 0, ...lex(firCModel(fn, obj.p, { in: ain, out: aout, config: acfg || null }), at));
      firs.set(fn, { obj: t.v, config: obj.config, p: obj.p, args: { in: ain, out: aout, config: acfg || null }, loc: at });
      continue;
    }
    out.push(t);
    if (depth === 0 && (op(t, ';') || op(t, '}'))) start = out.length;
  }
  return { tokens: out, firs };
}

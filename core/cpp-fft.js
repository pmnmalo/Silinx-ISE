// Silinx HLS C++ (#1943): hls_fft.h's hls::fft<config>(…) in the source (the header Silinx's own, core/cpp-headers.js),
// as tokens (after core/cpp-hls-lib.js: std::complex its struct): the config struct derived from hls::ip_fft::params_t
// or ssr_params_t read (its static members' values), checked (core/hls-fft.js) and left a struct of its parameters
// (config::max_nfft); hls::ip_fft's constants numbers, its enum types (hls::ip_fft::arch …) and config_t<…> / status_t<…>
// unsigned; a call hls::fft<config>(xn, xk[, fwd_inv[, scale_sch[, cp_len[, ovflo]]]]); a call of the transform's C
// model, ap_fft_<n>, written before the function it is in (its arguments' types the declared ones: arrays or streams of
// complex values; the others' a name's, a number's int, &x's x's pointer). The top of such a call is the transform's
// own hardware (core/hls-fft-hdl.js). Isomorphic ES module.
//
//   cppFft(tokens, report) -> { tokens, ffts: Map ap_fft_<n> -> { config, p, args, loc } }
import { closing, splitTop, declType } from './cpp-template.js';
import { constants } from './cpp-consts.js';
import { scan } from './c-lex.js';
import { FFT_CONSTANTS, FFT_DEFAULTS, FFT_SSR_DEFAULTS, FFT_ALIASES, fftParams, fftCModel } from './hls-fft.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const qualified = (toks, k, ...names) => names.every((n, i) => isId(toks[k + 2 * i], n) && (i === names.length - 1 || op(toks[k + 2 * i + 1], '::')));
const ENUMS = new Set(['arch', 'ordering', 'scaling', 'rounding', 'mem', 'opt']);
const text = (ty) => ty.map((x) => x.v).join(' ').replace(/ :: /g, '::').replace(/ ([<>,]) ?/g, '$1 ').replace(/< /g, '<').trim();

export function cppFft(toks, report) {
  const out = [], ffts = new Map(), configs = new Map(), consts = constants();
  let depth = 0, start = 0, skip = -1;
  const lex = (src, at) => scan(src, at.line, []).map((x) => ({ ...x, line: at.line, col: at.col, file: at.file }));
  // (hls::ip_fft::x: its number)
  const ipFft = (t, name) => {
    if (name in FFT_CONSTANTS) return { ...t, t: 'num', v: String(FFT_CONSTANTS[name]) };
    report(t, `hls::ip_fft::${name} is not one of hls_fft.h's constants`);
    return { ...t, t: 'num', v: '0' };
  };
  const resolve = (list) => {
    const r = [];
    for (let j = 0; j < list.length; j++) {
      if (qualified(list, j, 'hls', 'ip_fft') && op(list[j + 3], '::') && isId(list[j + 4])) { r.push(ipFft(list[j], list[j + 4].v)); j += 4; continue; }
      r.push(isId(list[j], 'true') || isId(list[j], 'false') ? { ...list[j], t: 'num', v: list[j].v === 'true' ? '1' : '0' } : list[j]);
    }
    return r;
  };
  /** A config struct's members (the tokens between its braces): its fields set, by the header's names. */
  const members = (cfg, body) => {
    for (let j = 0; j < body.length;) {
      let e = j;
      while (e < body.length && !op(body[e], ';')) e++;
      const m = body.slice(j, e), at = m.findIndex((x, i) => isId(x) && op(m[i + 1], '='));
      j = e + 1;
      if (at < 0) continue;
      const name = FFT_ALIASES[m[at].v] || m[at].v, v = consts.value(resolve(m.slice(at + 2)));
      if (v === null) { if (name in FFT_DEFAULTS) report(m[at], `hls::fft's ${cfg.name}::${m[at].v}: its value is not a constant`); continue; }
      cfg.fields.set(name, v);
    }
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    // (Silinx's hls_fft.h, core/cpp-headers.js: its constants and defaults core/hls-fft.js's, its tokens taken out)
    if (t.file === '<hls_fft.h>') continue;
    consts.at(toks, k);
    if (op(t, '{')) depth++;
    if (op(t, '}')) depth--;
    if (k <= skip) {
      if (k === skip && depth === 0 && (op(t, ';') || op(t, '}'))) start = out.length;
      continue;
    }
    // struct config : [public] hls::ip_fft::params_t { … };
    if ((isId(t, 'struct') || isId(t, 'class')) && isId(toks[k + 1]) && op(toks[k + 2], ':')) {
      let j = k + 3;
      if (['public', 'private', 'protected'].includes(toks[j]?.v)) j++;
      const base = qualified(toks, j, 'hls', 'ip_fft', 'params_t') ? 'params_t' : qualified(toks, j, 'hls', 'ip_fft', 'ssr_params_t') ? 'ssr_params_t' : null;
      if (base && op(toks[j + 5], '{')) {
        const name = toks[k + 1].v, close = closing(toks, j + 5);
        const cfg = { name, base, fields: new Map(), loc: toks[k + 1] };
        configs.set(name, cfg);
        members(cfg, toks.slice(j + 6, close));
        const { p, errors } = fftParams(name, cfg.fields, base);
        cfg.p = p;
        cfg.errors = errors;
        // (left a struct of its integer parameters, config1::max_nfft)
        const defs = base === 'ssr_params_t' ? FFT_SSR_DEFAULTS : FFT_DEFAULTS;
        const all = Object.keys(defs).map((f) => [f, cfg.fields.get(f) ?? defs[f]]);
        out.push(...lex(`struct ${name} { ${all.map(([f, v]) => `static const int ${f} = ${v};`).join(' ')} };`, toks[k + 1]));
        skip = op(toks[close + 1], ';') ? close + 1 : close;
        continue;
      }
    }
    // hls::ip_fft::arch (an enum's type), hls::ip_fft::config_t<C>, status_t<C>: unsigned; hls::ip_fft::x: its number
    if (qualified(toks, k, 'hls', 'ip_fft') && op(toks[k + 3], '::') && isId(toks[k + 4])) {
      const nm = toks[k + 4].v;
      if (ENUMS.has(nm)) { out.push({ ...t, v: 'unsigned' }); skip = k + 4; continue; }
      if ((nm === 'config_t' || nm === 'status_t') && op(toks[k + 5], '<')) { out.push({ ...t, v: 'unsigned' }); skip = closing(toks, k + 5); continue; }
      out.push(ipFft(t, nm));
      skip = k + 4;
      continue;
    }
    // hls::fft<config>(xn, xk[, fwd_inv[, scale_sch[, cp_len[, ovflo]]]]);
    if (qualified(toks, k, 'hls', 'fft') && op(toks[k + 3], '<')) {
      const e = closing(toks, k + 3), cfgName = toks[k + 4]?.v;
      const c = op(toks[e + 1], '(') ? closing(toks, e + 1) : -1;
      skip = c >= 0 && op(toks[c + 1], ';') ? c + 1 : Math.max(c, e);
      if (e !== k + 5 || c < 0) { report(t, 'hls::fft: hls::fft<config>(xn, xk, …); (config a struct derived from hls::ip_fft::params_t)'); continue; }
      const cfg = configs.get(cfgName);
      if (!cfg) { report(toks[k + 4], `hls::fft<${cfgName}>: '${cfgName}' is not a struct derived from hls::ip_fft::params_t or ssr_params_t`); continue; }
      cfg.errors.forEach((m) => report(toks[k + 4], m));
      if (!cfg.p) continue;
      const args = splitTop(toks.slice(e + 2, c));
      if (args.length < 2 || args.length > 6) { report(t, `hls::fft<${cfgName}>: (xn, xk[, fwd_inv[, scale_sch[, cp_len[, ovflo]]]])`); continue; }
      const kinds = [];
      for (const [i, a] of args.slice(0, 2).entries()) {
        const ty = a.length === 1 && isId(a[0]) ? declType(out, a[0].v) : null;
        const s = ty ? ty.findIndex((x) => isId(x, 'stream')) : -1;
        const stream = s >= 0 && op(ty[s + 1], '<');
        const elem = !ty ? null : stream ? ty.slice(s + 2, closing(ty, s + 1)) : ty.filter((x) => !op(x, '*'));
        if (!elem) { report(a[0] || t, `hls::fft<${cfgName}>: its ${['input', 'output'][i]} is an array or a stream declared in the function (its name)`); break; }
        if (elem.some((x) => isId(x, 'vector'))) { report(a[0], `hls::fft<${cfgName}>: streams of hls::vector (super_sample_rate > 1) are not made by Silinx HLS yet: arrays of std::complex`); break; }
        kinds.push({ type: text(elem), stream });
      }
      if (kinds.length !== 2) continue;
      // (fwd_inv, scale_sch, cp_len, ovflo: their types, a name's declared one, a number's int, &x's x's pointer)
      const more = args.slice(2).map((a) => {
        const ptr = op(a[0], '&') && a.length === 2, id = ptr ? a[1] : a[0];
        const ty = (ptr || a.length === 1) && isId(id) ? declType(out, id.v) : null;
        if (ty) return `${text(ty.filter((x) => !isId(x, 'const')))}${ptr ? ' *' : ''}`;
        return 'long long';
      });
      const fn = `ap_fft_${ffts.size}`, at = toks[k];
      out.push({ ...t, v: fn }, ...toks.slice(e + 1, skip + 1));
      out.splice(start, 0, ...lex(fftCModel(fn, cfg.p, { xn: kinds[0], xk: kinds[1], more }), at));
      ffts.set(fn, { config: cfgName, p: cfg.p, args: { xn: kinds[0], xk: kinds[1], more }, loc: at, names: args.map((a) => a.map((x) => x.v).join('')) });
      continue;
    }
    out.push(t);
    if (depth === 0 && (op(t, ';') || op(t, '}'))) start = out.length;
  }
  return { tokens: out, ffts };
}

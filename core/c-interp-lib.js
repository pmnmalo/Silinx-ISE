// Silinx HLS (#1598): the C library of the C simulation's test bench (core/c-interp.js's Machine): printf and its kin, the
// files of stdio.h in memory (fopen / fprintf / fscanf / fgets / feof / fclose: the design's data files readable, those
// written kept), system("diff [--brief] [-w | -b] a b") comparing two of them as diff does, exit, abs, <random>'s
// uniform_int_distribution (#1734). What AMD's Vitis
// HLS examples' test benches use: they write their results to a file and compare it with a golden one. Isomorphic.
import { convert } from './c-interp-expr.js';
import { MATH, F64, F32, BITCASTS } from './c-float.js';
import { fftFixed, fftFloat } from './hls-fft.js';

const INT = { w: 32, s: true };
const num = (v) => ({ v: BigInt(v), t: INT });
export class Exit { constructor(code) { this.code = code; } }

/** The project's files a test bench may open (#1897): of paths (the project's, nothing outside it), those whose names
 *  the source's strings give with their extensions ("tb_data/in.dat", diff's in system("diff a.dat b.dat"); a printf
 *  format's conversions any text, "out_%03d.dat"), not the build's.
 *  The app reads them for the C simulation's in-memory files (web/js/c-source.js). */
export function testBenchFiles(source, paths) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = [...source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].flatMap((m) => m[1].split(/\s+/));   // (system("diff a b")'s names too)
  const names = new Set(words.map((w) => w.split('/').pop()).filter((n) => /[^%\s]\.[A-Za-z]\w*$/.test(n)));   // (a name with its extension)
  const pats = [...names].map((n) => new RegExp(`^${n.split(/%[-+ 0#]*\d*(?:\.\d+)?(?:hh|h|ll|l|z|j)?[diuxXoscfFeEgG]/).map(esc).join('.*')}$`));
  return paths.filter((p) => !/^build\//.test(p) && pats.some((re) => re.test(p.split('/').pop())));
}

/** A file of the test bench: { name, text, pos, w: written }. */
const handle = (fh) => ({ fh, v: fh ? 1n : 0n, t: INT });

export const libMethods = {
  /** A string's text: a literal's, or a char array's (a pointer into one) up to its '\0' (#1897); undefined otherwise. */
  cString(x) {
    if (x?.str !== undefined) return x.str;
    const arr = x?.arr || x?.ptr?.arr;
    if (!arr) return undefined;
    let s = '';
    for (let k = x.arr ? 0 : x.ptr.index; k < arr.length && arr[k].v; k++) s += String.fromCharCode(Number(BigInt.asUintN(8, BigInt(arr[k].v))));
    return s;
  },
  /** A string as a const char *'s value: a pointer to its chars (#2309). */
  strPtr(s) {
    const t = { w: 8, s: true, ap: false }, arr = [...s, '\0'].map((ch) => ({ v: BigInt(ch.charCodeAt(0)) }));
    return { ptr: this.elemRef(arr, 0, t), t };
  },
  /** A warning of the run, once per place of the source (#2309). */
  warnOnce(e, message) {
    const k = `${e.loc?.line}:${e.loc?.col}`;
    if (!this.warned.has(k)) this.warned.set(k, { file: e.loc?.file, line: e.loc?.line || 1, col: e.loc?.col || 1, message, severity: 'warning' });
  },
  /** A path a test bench names, refused when it leaves the project: absolute (/x, C:\x, \\host, ~/x) or through '..'
   *  (#1897). */
  inProject(name, e, what) {
    if (/^([\\/~]|[A-Za-z]:)/.test(name) || name.split(/[\\/]/).includes('..')) this.fail(e, `${what}: '${name}' is outside the project (a test bench opens only the project's files: a path inside it, without '..')`);
  },
  /** The file `name` names, as the test bench opens it: one written by the run, else one of the design's files
   *  (by its path, else the one whose path ends with it, as tb_data/in.dat a source's folder's, else by its name
   *  alone). Only these: a test bench never reaches a file outside them (#1897). */
  fileText(name) {
    if (this.fs.has(name)) return this.fs.get(name);
    const files = this.files || {};
    const rel = name.replace(/^(\.\/)+/, '');
    const k = name in files ? name : Object.keys(files).find((f) => f.endsWith(`/${rel}`)) ?? Object.keys(files).find((f) => f.split('/').pop() === name.split('/').pop());
    return k === undefined ? null : files[k];
  },
  library(name, e) {
    const A = () => e.args.map((a) => this.eval(a));
    switch (name) {
      case 'printf': case 'fprintf': {
        const args = A();
        const at = name === 'fprintf' ? 1 : 0;
        const fmt = this.cString(args[at]);
        if (fmt === undefined) this.fail(e, `${name}: its format must be a string`);
        const fh = name === 'fprintf' ? args[0].fh : { std: 'out' };
        if (!fh) this.fail(e, 'fprintf: its file is not open (NULL)');
        const s = this.format(fmt, args.slice(at + 1), e, fh);
        this.write(fh, s, e);
        return num(s.length);
      }
      // (sprintf, snprintf: into a char array, a file's name, #1897)
      case 'sprintf': case 'snprintf': {
        const args = A();
        const at = name === 'snprintf' ? 2 : 1;
        const fmt = this.cString(args[at]);
        if (fmt === undefined) this.fail(e, `${name}: its format must be a string`);
        const buf = args[0], arr = buf.arr || buf.ptr?.arr, k0 = buf.arr ? 0 : buf.ptr?.index;
        if (!arr) this.fail(e, `${name}: it writes into a char array`);
        const s = this.format(fmt, args.slice(at + 1), e);
        const max = name === 'snprintf' ? Number(this.intOf(args[1], e)) : Infinity;
        const put = max > 0 ? s.slice(0, max - 1) : null;
        if (put !== null && k0 + put.length >= arr.length) this.fail(e, `${name}: ${put.length + 1} chars written into an array of ${arr.length - k0} (outside the array)`);
        if (put !== null) [...put, '\0'].forEach((ch, j) => { arr[k0 + j].v = BigInt(ch.charCodeAt(0)); });
        return num(s.length);
      }
      case 'puts': { const a = this.eval(e.args[0]); this.out.push(`${this.cString(a) ?? ''}\n`); return num(0); }
      case 'fputs': { const [a, f] = A(); this.write(f.fh, this.cString(a) ?? '', e); return num(0); }
      case 'putchar': { const a = this.eval(e.args[0]); this.out.push(String.fromCharCode(Number(this.intOf(a, e) & 255n))); return a; }
      case 'fputc': case 'putc': { const [a, f] = A(); this.write(f.fh, String.fromCharCode(Number(this.intOf(a, e) & 255n)), e); return a; }
      case 'fopen': {
        const [path, mode] = A().map((x) => this.cString(x));
        if (path === undefined || mode === undefined) this.fail(e, 'fopen: its name and mode must be strings');
        this.inProject(path, e, 'fopen');
        if (/^[wa]/.test(mode)) {
          const fh = { name: path, text: mode[0] === 'a' ? (this.fileText(path) ?? '') : '', pos: 0, w: true };
          this.fs.set(path, fh.text);
          return handle(fh);
        }
        const text = this.fileText(path);
        return handle(text === null ? null : { name: path, text, pos: 0, w: false });
      }
      case 'fclose': { const [f] = A(); if (f.fh?.w) this.fs.set(f.fh.name, f.fh.text); if (f.fh) f.fh.closed = true; return num(0); }
      case 'feof': { const [f] = A(); return num(f.fh && f.fh.pos >= f.fh.text.length ? 1 : 0); }
      case 'fscanf': return this.scan(e);
      // (hls::fft's transform, its C model's (core/hls-fft.js, #1943): ap_fft_core(re, im, nfft, input_width, fwd, sch,
      // natural, float), in place, its overflow returned)
      case 'ap_fft_core': {
        const [re, im, ...ks] = A();
        const [nfft, inW, fwd, sch, natural, float] = ks.map((x) => Number(this.intOf(x, e)));
        const p = { N: 2 ** nfft, nfft, inW, natural: !!natural, inverse: !fwd };
        const xs = [re, im].map((x) => x.arr.map((c) => (float ? Number(c.v) : Number(c.v))));
        const over = float ? (fftFloat(xs[0], xs[1], p), 0) : fftFixed(xs[0], xs[1], p, fwd, BigInt.asUintN(32, BigInt(sch)));
        [re, im].forEach((x, i) => x.arr.forEach((c, j) => { c.v = float ? xs[i][j] : BigInt(xs[i][j]); }));
        return num(over);
      }
      // (fgetc, getc: a char of the file, EOF at its end; strcat: a string appended; memcpy of one value into another,
      // a test bench's float from its bits: the bits kept, #1943)
      case 'fgetc': case 'getc': { const [f] = A(); if (!f.fh) this.fail(e, `${name}: its file is not open (NULL)`); return num(f.fh.pos < f.fh.text.length ? f.fh.text.charCodeAt(f.fh.pos++) : -1); }
      case 'strcat': {
        const [d, a] = A();
        const arr = d.arr || d.ptr?.arr, k0 = d.arr ? 0 : d.ptr?.index, add = this.cString(a), was = this.cString(d);
        if (!arr || add === undefined) this.fail(e, 'strcat: a char array and a string');
        const s2 = was + add;
        if (k0 + s2.length >= arr.length) this.fail(e, `strcat: ${s2.length + 1} chars in an array of ${arr.length - k0} (outside the array)`);
        [...s2, '\0'].forEach((ch, j) => { arr[k0 + j].v = BigInt(ch.charCodeAt(0)); });
        return d;
      }
      case 'memcpy': {
        const [d, a, n] = A();
        if (!d.ptr || !a.ptr || d.arr || a.arr) this.fail(e, 'memcpy: of one value into another (&x, &y) in the C simulation');
        const to = d.ptr.get().t, from = a.ptr.get(), bytes = Number(this.intOf(n, e));
        const bits = (t) => (t.fl || t.w);
        if (bits(to) !== bits(from.t) || bytes * 8 !== bits(to)) this.fail(e, `memcpy: ${bytes} bytes between values of ${bits(from.t)} and ${bits(to)} bits`);
        const dv = new DataView(new ArrayBuffer(8)), w = bits(to);
        if (from.t.fl) { if (w === 32) dv.setFloat32(0, from.v); else dv.setFloat64(0, from.v); } else if (w === 32) dv.setUint32(0, Number(BigInt.asUintN(32, BigInt(from.v)))); else dv.setBigUint64(0, BigInt.asUintN(64, BigInt(from.v)));
        const v = to.fl ? (w === 32 ? dv.getFloat32(0) : dv.getFloat64(0)) : to.s ? (w === 32 ? BigInt(dv.getInt32(0)) : dv.getBigInt64(0)) : w === 32 ? BigInt(dv.getUint32(0)) : dv.getBigUint64(0);
        d.ptr.set({ v, t: to });
        return d;
      }
      case 'fgets': {
        const [buf, n, f] = A();
        if (!buf.arr || !f.fh) this.fail(e, 'fgets: a char array and an open file');
        const fh = f.fh;
        if (fh.pos >= fh.text.length) return handle(null);
        const max = Number(this.intOf(n, e)) - 1;
        let s = '';
        while (s.length < max && fh.pos < fh.text.length) { const ch = fh.text[fh.pos++]; s += ch; if (ch === '\n') break; }
        [...s, '\0'].forEach((ch, k) => { if (k < buf.arr.length) buf.arr[k].v = BigInt(ch.charCodeAt(0)); });
        return { ...buf, v: 1n };   // (not NULL: compared with it)
      }
      case 'system': {
        const [c] = A();
        return num(this.system(this.cString(c) ?? '', e));
      }
      // (malloc.h's, the test bench's data: its bytes made an array by the pointer it is given to, core/c-interp.js, #1891)
      case 'malloc': { const [n] = A(); return { heap: Number(this.intOf(n, e)), t: INT }; }
      case 'free': { A(); return num(0); }
      case 'exit': { const [c] = A(); throw new Exit(Number(this.as(c, INT, e))); }
      case 'ap_uniform_int': {
        // (<random>'s uniform_int_distribution<T> d(a, b); d(e), with e a default_random_engine (core/cpp-lex.js): as
        // libstdc++ makes them, the engine minstd_rand0 (x = x * 16807 % 2^31 - 1, from 1), the draws below a multiple
        // of the range kept, #1734)
        const [d, e2] = A();
        const lo = d.arr[0].v, hi = d.arr[1].v, st = e2.ptr;
        const next = () => { const x = (BigInt(st.get().v) || 1n) * 16807n % 2147483647n; st.set({ v: x, t: { w: 64, s: false } }); return x - 1n; };
        const urange = hi - lo, urng = 2147483645n;
        if (urange < 0n) this.fail(e, 'uniform_int_distribution: its bounds a <= b');
        if (urange > urng) this.fail(e, 'uniform_int_distribution: a range wider than the engine\'s is not simulated');
        if (urange === urng) return { v: next() + lo, t: d.t };
        const scale = urng / (urange + 1n), past = (urange + 1n) * scale;
        let r;
        do r = next(); while (r >= past);
        return { v: r / scale + lo, t: d.t };
      }
      case 'abs': case 'labs': case 'llabs': {
        const [x] = A();
        if (x.t?.fl) return { v: Math.abs(x.v), t: x.t };   // (C++'s std::abs of a double)
        const v = this.intOf(x, e);
        return { v: v < 0n ? -v : v, t: x.t };
      }
      case 'fflush': return num(0);
      case 'assert': { const [c] = A(); if (!this.truth(c)) this.fail(e, 'assertion failed'); return num(0); }
      // (rand: a linear congruential generator of 31 bits (RAND_MAX's), its seed srand's; its values are not the host
      // library's)
      case 'srand': { const [x] = A(); this.seed = this.intOf(x, e) & 0x7fffffffn; return num(0); }
      case 'rand': { this.seed = ((this.seed ?? 1n) * 1103515245n + 12345n) & 0x7fffffffn; return num(this.seed); }
      case 'ap_float_bits': case 'ap_double_bits': case 'ap_bits_float': case 'ap_bits_double': {
        // (a union's float or double member: its bits, core/c-union.js, #1896; a NaN's own bits not kept: a number)
        const { fl, bits } = BITCASTS[name], [x] = A();
        const dv = new DataView(new ArrayBuffer(8));
        if (bits) {
          if (fl === 32) dv.setFloat32(0, this.as(x, F32, e)); else dv.setFloat64(0, this.as(x, F64, e));
          return { v: fl === 32 ? BigInt(dv.getUint32(0)) : dv.getBigUint64(0), t: { w: fl, s: false } };
        }
        const v = BigInt.asUintN(fl, this.intOf(x, e));
        if (fl === 32) { dv.setUint32(0, Number(v)); return { v: dv.getFloat32(0), t: F32 }; }
        dv.setBigUint64(0, v);
        return { v: dv.getFloat64(0), t: F64 };
      }
      default: {
        // math.h's (core/c-float.js): on doubles, a float's (sqrtf, …) in float
        const m = MATH[name];
        if (!m) this.fail(e, `${name}() cannot be run in Silinx's C simulation`);
        const xs = A();
        if (xs.length !== m.n) this.fail(e, `${name}() takes ${m.n} argument(s)`);
        const r = m.f(...xs.map((x) => Number(x.v ?? this.intOf(x, e))));
        if (m.int) return { v: BigInt(r), t: { w: 64, s: true, ap: false } };
        return { v: name.endsWith('f') && name !== 'modf' ? Math.fround(r) : r, t: name.endsWith('f') ? F32 : F64 };
      }
    }
    return null;
  },
  write(fh, s, e) {
    if (fh.std) { this.out.push(s); return; }
    // (a file closed: its writes dropped, as a closed ofstream's (failed) <<, #1714)
    if (fh.closed) return;
    if (!fh.w) this.fail(e, `the file '${fh.name}' is open for reading`);
    fh.text += s;
    this.fs.set(fh.name, fh.text);
  },
  /** fscanf(f, format, &x, …): the conversions %d %i %u %x %o %c %s (h, l, ll), the format's spaces any space. */
  scan(e) {
    const [f, fmtA, ...ptrs] = e.args.map((a) => this.eval(a));
    const fmt = this.cString(fmtA);
    if (!f.fh || fmt === undefined) this.fail(e, 'fscanf: an open file and a format');
    const fh = f.fh;
    let got = 0, k = 0;
    const skip = () => { while (fh.pos < fh.text.length && /\s/.test(fh.text[fh.pos])) fh.pos++; };
    for (let i = 0; i < fmt.length; i++) {
      const ch = fmt[i];
      if (/\s/.test(ch)) { skip(); continue; }
      if (ch !== '%') { if (fh.text[fh.pos] !== ch) break; fh.pos++; continue; }
      const m = /^(hh|h|ll|l|L)?([diuxXoc s%feEgGaAv])/.exec(fmt.slice(i + 1).replace(/^ /, 's'));
      if (!m) this.fail(e, `fscanf: the conversion '${fmt.slice(i, i + 3)}' is not supported`);
      i += m[0].length;
      let conv = m[2];
      if (conv === '%') { if (fh.text[fh.pos] !== '%') break; fh.pos++; continue; }
      if (conv !== 'c') skip();
      if (fh.pos >= fh.text.length) return num(got || -1);
      const p = ptrs[k++];
      // (%v, C++'s f >> x: by x's type, #2309)
      if (conv === 'v') conv = p?.ptr?.t?.fl ? 'g' : 'd';
      if (conv === 'c') { p.ptr?.set({ v: BigInt(fh.text.charCodeAt(fh.pos++)), t: INT }); got++; continue; }
      if (conv === 's') {
        let s = '';
        while (fh.pos < fh.text.length && !/\s/.test(fh.text[fh.pos])) s += fh.text[fh.pos++];
        [...s, '\0'].forEach((c, j) => { if (p.arr && j < p.arr.length) p.arr[j].v = BigInt(c.charCodeAt(0)); });
        got++;
        continue;
      }
      // (%f, %e, %g: a float or, with l, a double, #1943)
      if (/[feEgGaA]/.test(conv)) {
        const t = /^[-+]?(inf(inity)?|nan|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)/i.exec(fh.text.slice(fh.pos));
        if (!t) break;
        fh.pos += t[0].length;
        if (!p?.ptr) this.fail(e, 'fscanf: its values are read through pointers (&x)');
        const x = Number(t[0].replace(/^([-+]?)inf(inity)?$/i, '$1Infinity'));
        p.ptr.set(m[1] === 'l' || m[1] === 'L' || (m[2] === 'v' && p.ptr.t.fl === 64) ? { v: x, t: F64 } : { v: Math.fround(x), t: F32 });
        got++;
        continue;
      }
      const re = /[xX]/.test(conv) ? /^[-+]?(0[xX])?[0-9a-fA-F]+/ : conv === 'o' ? /^[-+]?[0-7]+/ : conv === 'i' ? /^[-+]?(0[xX][0-9a-fA-F]+|0[0-7]*|[1-9]\d*)/ : /^[-+]?\d+/;
      const t = re.exec(fh.text.slice(fh.pos));
      if (!t) break;
      fh.pos += t[0].length;
      const neg = t[0].startsWith('-'), digits = t[0].replace(/^[-+]/, '');
      let v = /[xX]/.test(conv) ? BigInt(`0x${digits.replace(/^0[xX]/, '')}`) : conv === 'o' ? BigInt(`0o${digits}`) : conv === 'i' ? BigInt(/^0[xX]/.test(digits) ? digits : /^0\d/.test(digits) ? `0o${digits.slice(1)}` : digits) : BigInt(digits);
      if (neg) v = -v;
      if (!p?.ptr) this.fail(e, 'fscanf: its values are read through pointers (&x)');
      p.ptr.set({ v, t: INT });
      got++;
    }
    return num(got);
  },
  /** system(cmd): only `diff [--brief | -q] [-w | -b | -B …] a b` (the examples' check of their results): 0 when the
   *  two files are the same (with -w: whatever their spaces; -b: their amounts of space; -B: blank lines), else 1. */
  system(cmd, e) {
    const w = cmd.trim().split(/\s+/);
    if (w[0] !== 'diff') this.fail(e, `system("${cmd}") cannot be run in Silinx's C simulation (only diff)`);
    const opts = w.slice(1).filter((x) => x.startsWith('-')), names = w.slice(1).filter((x) => !x.startsWith('-'));
    if (names.length !== 2) this.fail(e, `system("${cmd}"): diff compares two files`);
    for (const n of names) this.inProject(n, e, `system("${cmd}")`);
    const [a, b] = names.map((n) => this.fileText(n));
    if (a === null || b === null) { this.out.push(`diff: ${a === null ? names[0] : names[1]}: No such file or directory\n`); return 2; }
    const flags = opts.flatMap((o) => (o.startsWith('--') ? [o] : [...o.slice(1)].map((c) => `-${c}`)));
    const norm = (t) => {
      let L = t.split('\n');
      if (L.at(-1) === '') L = L.slice(0, -1);
      if (flags.includes('-w') || flags.includes('--ignore-all-space')) L = L.map((l) => l.replace(/\s+/g, ''));
      else if (flags.includes('-b') || flags.includes('--ignore-space-change')) L = L.map((l) => l.replace(/\s+/g, ' ').replace(/ $/, ''));
      if (flags.includes('-B') || flags.includes('--ignore-blank-lines')) L = L.filter((l) => l.trim() !== '');
      return L.join('\n');
    };
    const same = norm(a) === norm(b);
    if (!same && (flags.includes('--brief') || flags.includes('-q'))) this.out.push(`Files ${names[0]} and ${names[1]} differ\n`);
    return same ? 0 : 1;
  },
};

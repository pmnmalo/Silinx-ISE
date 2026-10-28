// Silinx HLS C++ (#1898): the integer constants a template's argument or an array's size may name, as C++ (and so
// Vitis HLS) takes them: const / constexpr integers (a list of them, A = 1, B = A + 1), an enum's constants (E::A of an
// enum class), a class's static const members (C::N), sizeof of a type of C; each declared before its use, a block's
// gone at its end. For the passes around core/cpp-template.js (hls::split / hls::merge, arrays of tasks and of streams).
// Isomorphic ES module.
//
//   constants() -> { at(tokens, k), value(tokens) }: at k, the constant declared there kept; value: the BigInt of a
//     constant expression of numbers and the constants kept, or null
import { closing, constTokens } from './cpp-template.js';

const op = (t, v) => t && t.t === 'op' && t.v === v;
const isId = (t, v) => t && t.t === 'id' && (v === undefined || t.v === v);
const INTS = new Set(['int', 'unsigned', 'signed', 'short', 'long', 'char', 'bool', 'size_t', 'static', 'const', 'constexpr',
  'auto', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t']);

const SIZES = { char: 1, bool: 1, short: 2, 'short int': 2, int: 4, long: 8, 'long int': 8, 'long long': 8, 'long long int': 8, float: 4, double: 8,
  int8_t: 1, uint8_t: 1, int16_t: 2, uint16_t: 2, int32_t: 4, uint32_t: 4, int64_t: 8, uint64_t: 8, size_t: 8 };

export function constants() {
  const vals = new Map(), classes = [], scoped = [];   // (scoped: a block's constants, {key, old, depth}, gone at its end)
  let depth = 0;
  // (names: N, or C::N in its class C)
  const named = (toks) => {
    const out = [];
    for (let j = 0; j < toks.length; j++) {
      const x = toks[j];
      // sizeof(T) of a type of C (Vitis HLS's: x86-64's sizes)
      if (isId(x, 'sizeof') && op(toks[j + 1], '(')) {
        const c = closing(toks, j + 1), ty = toks.slice(j + 2, c).map((y) => y.v).filter((y) => !['unsigned', 'signed', 'const'].includes(y)).join(' ') || 'int';
        if (SIZES[ty]) { out.push({ ...x, t: 'num', v: String(SIZES[ty]) }); j = c; continue; }
      }
      if (isId(x) && op(toks[j + 1], '::') && isId(toks[j + 2]) && vals.has(`${x.v}::${toks[j + 2].v}`)) { out.push({ ...x, t: 'num', v: String(vals.get(`${x.v}::${toks[j + 2].v}`)) }); j += 2; continue; }
      const after = op(toks[j - 1], '.') || op(toks[j - 1], '->') || op(toks[j - 1], '::');
      out.push(isId(x) && !after && vals.has(x.v) ? { ...x, t: 'num', v: String(vals.get(x.v)) } : x);
    }
    return out;
  };
  const value = (toks) => constTokens(named(toks));
  const set = (key, v) => {
    if (depth > 0 && !inClass()) scoped.push({ key, old: vals.get(key), depth });
    vals.set(key, v);
  };
  const keep = (name, v, scope) => {
    set(name, v);
    if (scope) vals.set(`${scope}::${name}`, v);
  };
  const inClass = () => (classes.length && classes.at(-1).depth === depth ? classes.at(-1).name : null);
  /** At k: a class's or an enum's start, a constant's declaration. */
  const at = (toks, k) => {
    const t = toks[k];
    if (op(t, '{')) depth++;
    if (op(t, '}')) {
      if (classes.length && classes.at(-1).depth === depth) classes.pop();
      for (; scoped.length && scoped.at(-1).depth === depth; scoped.pop()) { const { key, old } = scoped.at(-1); if (old === undefined) vals.delete(key); else vals.set(key, old); }
      depth--;
    }
    // struct C { / class C : B {
    if ((isId(t, 'struct') || isId(t, 'class')) && !isId(toks[k - 1], 'enum') && isId(toks[k + 1])) {
      let j = k + 2;
      if (op(toks[j], ':')) while (toks[j] && !op(toks[j], '{') && !op(toks[j], ';')) j++;
      if (op(toks[j], '{')) classes.push({ name: toks[k + 1].v, depth: depth + 1 });
      return;
    }
    // enum [class] [E] [: T] { A, B = e, … }
    if (isId(t, 'enum')) {
      let j = k + 1;
      const scoped = isId(toks[j], 'class') || isId(toks[j], 'struct');
      if (scoped) j++;
      const tag = isId(toks[j]) ? toks[j++].v : null;
      if (op(toks[j], ':')) while (toks[j] && !op(toks[j], '{') && !op(toks[j], ';')) j++;
      if (!op(toks[j], '{')) return;
      const e = closing(toks, j), scope = inClass();
      let next = 0n;
      for (let i = j + 1; i < e;) {
        if (!isId(toks[i])) break;
        const name = toks[i].v;
        let v = next, s = i + 1;
        if (op(toks[s], '=')) {
          let f = s + 1;
          for (let d = 0; f < e && !(d === 0 && op(toks[f], ',')); f++) d += op(toks[f], '(') ? 1 : op(toks[f], ')') ? -1 : 0;
          v = value(toks.slice(s + 1, f));
          s = f;
        }
        if (v === null) break;
        if (!scoped) keep(name, v, scope);
        if (tag) set(`${tag}::${name}`, v);
        next = v + 1n;
        i = op(toks[s], ',') ? s + 1 : s;
      }
      return;
    }
    // const int A = e, B = e;   static constexpr unsigned N = e;   const int N{e};
    if ((isId(t, 'const') || isId(t, 'constexpr')) && !op(toks[k - 1], ')') && !op(toks[k - 1], ',') && !op(toks[k - 1], '(')) {
      let j = k + 1;
      while (isId(toks[j]) && INTS.has(toks[j].v)) j++;
      if (j === k + 1) return;
      const scope = inClass();
      for (;;) {
        if (!isId(toks[j]) || !(op(toks[j + 1], '=') || op(toks[j + 1], '{') || op(toks[j + 1], '('))) return;
        const name = toks[j].v;
        let e;
        if (op(toks[j + 1], '=')) {
          e = j + 2;
          for (let d = 0; toks[e] && !(d === 0 && (op(toks[e], ';') || op(toks[e], ','))); e++) d += op(toks[e], '(') ? 1 : op(toks[e], ')') ? -1 : 0;
          const v = value(toks.slice(j + 2, e));
          if (v !== null) keep(name, v, scope);
        } else {
          const c = closing(toks, j + 1);
          const v = value(toks.slice(j + 2, c));
          if (v !== null) keep(name, v, scope);
          e = c + 1;
        }
        if (!op(toks[e], ',')) return;
        j = e + 1;
      }
    }
  };
  return { at, value };
}

// The VHDL parser's helpers (#405: out of parser.js): sets without repeats, real ranges, the IR of a type, guarded
// items, a for loop's range, a package's declarations merged, subprograms with the same parameters.
import { INT_MAX, SCALAR_LOGIC, VECTOR_LOGIC, block } from './parse-defs.js';
import { bin, int, ref } from './nodes.js';

// --- helpers ------------------------------------------------------------------

export function dedupe(a) { return [...new Set(a)]; }

export function isRealRange(r) {
  return r && !r.of && (r.left.op === 'real' || r.right.op === 'real' ||
    (r.left.op === 'unary' && r.left.a.op === 'real'));
}

/** Map a VHDL type mark (+ optional constraint) to an IR TypeSpec. */
export function makeType(name, range, hasRange, pkg = null) {
  if (SCALAR_LOGIC.has(name)) return { kind: 'logic', range: null, signed: false };
  if (VECTOR_LOGIC.has(name)) {
    const t = { kind: 'logic', range: hasRange ? range : null, signed: name.endsWith('signed') && !name.endsWith('unsigned') };
    if (!hasRange || !range) t.unconstrained = true;
    // the non-numeric array types (std_logic_vector / bit_vector) keep their type mark: their
    // arithmetic depends on the use clauses (std_logic_unsigned / std_logic_signed)
    if (!name.endsWith('signed')) t.mark = name === 'bit_vector' ? 'bit_vector' : 'std_logic_vector';
    return t;
  }
  switch (name) {
    case 'integer': return { kind: 'integer', range: hasRange ? range : null };
    case 'natural': return { kind: 'integer', range: hasRange ? range : { left: int(0), right: int(INT_MAX), dir: 'to' } };
    case 'positive': return { kind: 'integer', range: hasRange ? range : { left: int(1), right: int(INT_MAX), dir: 'to' } };
    case 'boolean': return { kind: 'boolean' };
    case 'time': case 'delay_length': return { kind: 'time' };
    case 'string': return hasRange && range ? { kind: 'string', range } : { kind: 'string' };
    case 'real': return { kind: 'real' };
    default: {
      const t = { kind: 'named', name };
      if (pkg) t.pkg = pkg;
      if (hasRange && range) t.range = range;
      return t;
    }
  }
}

/** Guarded concurrent assignments: processes that assign only while the block's guard is true. */
export function guardItems(items, guard) {
  return items.map((it) => {
    if (it.kind === 'assign') {
      const a = { kind: 'assign', target: it.target, value: it.value, nonblocking: true, delay: it.delay, loc: it.loc };
      if (it.mech) a.mech = it.mech;
      return { kind: 'process', label: it.label || null, sens: 'all', initial: false, decls: [],
        body: [{ kind: 'if', cond: guard, then: block([a], it.loc), else: null, loc: it.loc }], loc: it.loc };
    }
    if (it.kind === 'process') return { ...it, body: [{ kind: 'if', cond: guard, then: block(it.body, it.loc), else: null, loc: it.loc }] };
    return it;
  });
}

/** generate_for init/cond/step from a range. */
export function forRangeParts(v, range) {
  const vr = ref(v);
  if (range && !range.of) {
    const down = range.dir === 'downto';
    return {
      init: range.left,
      cond: bin(down ? '>=' : '<=', vr, range.right),
      step: bin(down ? '-' : '+', vr, int(1)),
    };
  }
  const of = range ? range.of : ref('?');
  const rev = range && range.reverse;
  return {
    init: { op: 'attr', prefix: of, attr: rev ? 'high' : 'low', args: [] },
    cond: bin(rev ? '>=' : '<=', vr, { op: 'attr', prefix: of, attr: rev ? 'low' : 'high', args: [] }),
    step: bin(rev ? '-' : '+', vr, int(1)),
  };
}

/** Merge package-body decls into package decls (bodies replace declarations, deferred constants get values). */
export function mergePackageDecls(into, decls) {
  for (const d of decls) {
    const idx = into.findIndex((x) => x.name === d.name && x.kind === d.kind &&
      (d.kind !== 'function' || (x.declOnly && sameParams(x, d))));
    if (idx >= 0 && d.kind === 'function') {
      if (d.declOnly) continue;
      // (impure in the package declaration: the body is impure too)
      into[idx] = into[idx].purity === 'impure' && !d.purity ? { ...d, purity: 'impure' } : d;
    } else if (idx >= 0 && d.kind === 'const' && into[idx].value === null) {
      into[idx] = { ...into[idx], value: d.value, type: into[idx].type || d.type };
    } else {
      into.push(d);
    }
  }
}

function sameParams(a, b) {
  if (a.params.length !== b.params.length) return false;
  return a.params.every((p, k) => p.name === b.params[k].name);
}

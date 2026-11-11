// VHDL pure functions (#185). A function is pure unless it is declared `impure`, and a pure function
// may only use its parameters and what it declares itself: it must not read or write a signal, a
// port, a variable (of a process or of an enclosing subprogram), a shared variable or a file declared
// outside it, call an impure function, or call a procedure that does (a side-effect procedure).
// Reported as XST does for the Spartan-3E (its VHDL parser, HDLParsers), once per function, at its
// `end`: a warning when the function is pure by default (VHDL-87 had no `impure`), an error when it
// is written `pure function`:
//     WARNING:HDLParsers:3310 - Function f is not pure.  VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.
//     ERROR:HDLParsers:3241 - Function f is not pure.
// Silinx's message also says the first thing it uses (and the line where it uses it):
//     Function f is not pure: it uses signal 's' at line 13. VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.
//     Function f is not pure: it calls impure function 'g' at line 17.
//     Function f is not pure: it calls side-effect procedure 'p' at line 18.
// (ISim and XST's new parser make each use an error, HDLCompiler:250 / 1381 / 1382.) XST does not
// report `now` in a pure function: Silinx does not either.
//
//   purityErrors(units, { file, text, packages, entityOf }) -> [{ file, line, col, severity, message, tool, check }]
//     units: parsed VHDL units (core/vhdl/parser.js); packages(name): the package unit of that name
//     (its declarations are visible through a use clause); entityOf(arch): the entity of an
//     architecture unit of another file; text: the source, for the line of a use.
//
// Isomorphic module (browser + Node).

export const PURE_CHECK = 'pure-function';

// (XST reports any use of these, also s'length, and a file: writeline(f, l))
const OBJECT = new Set(['signal', 'port', 'variable', 'shared variable', 'file']);

class Scope {
  constructor(parent, file) { this.parent = parent; this.file = file; this.names = new Map(); }
  add(name, entry) { let a = this.names.get(name); if (!a) this.names.set(name, a = []); a.push({ file: this.file, ...entry, scope: this }); }
  /** { entries, scope } of the nearest scope that declares the name, or null */
  find(name) {
    for (let s = this; s; s = s.parent) if (s.names.has(name)) return { entries: s.names.get(name), scope: s };
    return null;
  }
}

const isFunction = d => d.kind === 'function' && !!d.returnType;

/** The pure-function errors of parsed VHDL units (see the top of the file). */
export function purityErrors(units, { file = null, text = null, packages = () => null, entityOf = () => null } = {}) {
  const out = [];
  const seen = new Set();
  const lines = text == null ? null : String(text).split('\n');
  const sideEffects = new Map();   // procedure decl -> (boundary -> it is a side-effect procedure)

  // the column of a name at or after a position (else the position itself)
  const colOf = (name, at) => {
    if (!lines || !at) return { line: at?.line || 1, col: at?.col || 1 };
    const re = new RegExp(`(^|[^\\w])(${name.replace(/[^\w]/g, '')})(?![\\w])`, 'i');
    for (let l = at.line; l <= Math.min(lines.length, at.line + 20); l++) {
      const from = l === at.line ? at.col - 1 : 0;
      const code = lines[l - 1].replace(/--.*$/, '');
      const m = re.exec(code.slice(from));
      if (m) return { line: l, col: from + m.index + m[1].length + 1 };
    }
    return { line: at.line, col: at.col };
  };
  const report = (d, fnScope, message, tool, severity) => {
    const at = d.endLoc || d.loc || { line: 1, col: 1 };
    const key = `${fnScope.file}:${at.line}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ file: fnScope.file || file, line: at.line, col: at.col, severity, message, tool, check: PURE_CHECK });
  };

  // ---- declarations of a region
  const declare = (scope, decls, { inSubprogram = false, inProcess = false } = {}) => {
    for (const d of decls || []) {
      switch (d.kind) {
        case 'signal':
          scope.add(d.name, { cls: d.net === 'variable' ? (inSubprogram || inProcess ? 'variable' : 'shared variable') : 'signal', decl: d });
          break;
        case 'file': scope.add(d.name, { cls: 'file', decl: d }); break;
        case 'const': scope.add(d.name, { cls: 'constant', decl: d }); break;
        case 'alias': {
          // an alias of an object is that object
          const t = d.target && aliasRoot(d.target);
          const r = t ? scope.find(t) : null;
          const obj = r?.entries.find(e => OBJECT.has(e.cls));
          scope.add(d.name, obj ? { cls: obj.cls, decl: d } : { cls: 'other', decl: d });
          break;
        }
        case 'function': scope.add(d.name, { cls: isFunction(d) ? 'function' : 'procedure', decl: d }); break;
        case 'type':
          scope.add(d.name, { cls: 'other', decl: d });
          if (d.type?.kind === 'enum') for (const v of d.type.values || []) if (typeof v === 'string') scope.add(v, { cls: 'other', decl: d });
          break;
        default: if (d.name) scope.add(d.name, { cls: 'other', decl: d });
      }
    }
  };
  const aliasRoot = (e) => {
    while (e && e.op !== 'ref' && e.op !== 'apply') e = e.base || e.prefix;
    return e?.name || null;
  };

  // ---- subprograms: a scope of their own (parameters, declarations), inside the one they are declared in
  const subScope = (d, outer) => {
    const s = new Scope(outer, outer.file);
    for (const p of d.params || []) s.add(p.name, { cls: 'parameter', decl: d });
    declare(s, d.decls, { inSubprogram: true });
    return s;
  };
  const impureFunction = e => e.cls === 'function' && e.decl.purity === 'impure';

  // the accesses of a body to what is declared outside `boundary`: fn(kind, entries, name, at)
  //   kind 'object' (a signal / variable… of entries), 'impure' (a call of an impure function),
  //   'procedure' (a call of a side-effect procedure declared outside)
  const walk = (node, scope, boundary, at, fn) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const x of node) walk(x, scope, boundary, at, fn); return; }
    if (node.loc && node.loc.line) at = node.loc;
    if (node.op) {
      switch (node.op) {
        case 'ref': case 'apply': {
          const r = scope.find(node.name);
          if (r) use(r, node.name, scope, boundary, at, fn, node.op === 'apply' || !r.entries.some(e => OBJECT.has(e.cls)));
          if (node.args) walk(node.args, scope, boundary, at, fn);
          return;
        }
        case 'field': walk(node.base, scope, boundary, at, fn); return;
        default: break;
      }
    }
    switch (node.kind) {
      case 'call': {
        const r = scope.find(node.name);
        if (r) use(r, node.name, scope, boundary, at, fn, true);
        walk(node.args, scope, boundary, at, fn);
        return;
      }
      case 'forrange': {
        const s = new Scope(scope, scope.file);
        s.add(node.var, { cls: 'constant', decl: node });
        walk(node.range, scope, boundary, at, fn);
        walk(node.body, s, boundary, at, fn);
        return;
      }
      case 'function': return;   // (a subprogram declared inside: where it is called)
      default: break;
    }
    if (node.decls?.length && node.kind === 'block') {
      const s = new Scope(scope, scope.file);
      declare(s, node.decls, { inSubprogram: true });
      walkDecls(node.decls, s, boundary, fn);
      walk(node.stmts, s, boundary, at, fn);
      return;
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'decls') continue;
      const v = node[k];
      if (v && typeof v === 'object') walk(v, scope, boundary, at, fn);
    }
  };
  const walkDecls = (decls, scope, boundary, fn) => {
    for (const d of decls || []) {
      if (d.kind !== 'function') walk({ init: d.init, value: d.value, type: d.type, target: d.kind === 'alias' ? d.target : undefined }, scope, boundary, d.loc, fn);
    }
  };
  // a name used in a subprogram: an object declared outside it, or a call
  const use = (r, n, scope, boundary, at, fn, call) => {
    const inside = insideOf(r.scope, boundary);
    if (call) {
      const subs = r.entries.filter(e => e.cls === 'function' || e.cls === 'procedure');
      if (subs.length && subs.length === r.entries.length) {
        if (subs.every(impureFunction)) { fn('impure', subs, n, at); return; }
        const procs = subs.filter(e => e.cls === 'procedure');
        if (procs.length === subs.length && procs.every(e => sideEffect(e, inside ? boundary : null))) { fn('procedure', procs, n, at); return; }
        return;
      }
    }
    if (inside) return;
    const objs = r.entries.filter(e => OBJECT.has(e.cls));
    if (objs.length && objs.length === r.entries.length) fn('object', objs, n, at);
  };
  const insideOf = (s, boundary) => { for (let x = s; x; x = x.parent) if (x === boundary) return true; return false; };

  // a side-effect procedure: one that uses what is declared outside it (one declared in the pure
  // function: outside the function, `boundary`)
  const sideEffect = (e, boundary) => {
    const d = e.decl;
    if (d.declOnly) return false;
    let memo = sideEffects.get(d);
    if (!memo) sideEffects.set(d, memo = new Map());
    if (memo.has(boundary)) return memo.get(boundary);
    memo.set(boundary, false);   // (recursion)
    const s = subScope(d, e.scope);
    let found = false;
    const fn = () => { found = true; };
    walkDecls(d.decls, s, boundary || s, fn);
    walk(d.body, s, boundary || s, d.loc, fn);
    memo.set(boundary, found);
    return found;
  };

  // ---- a pure function
  const checkFunction = (d, outer) => {
    if (!isFunction(d) || d.declOnly || d.purity === 'impure') return;
    const s = subScope(d, outer);
    let first = null;   // the first thing it uses: { kind, entries, name, line }
    const fn = (kind, entries, n, at) => {
      const line = colOf(n, at).line;
      if (!first || line < first.line) first = { kind, entries, name: n, line };
    };
    walkDecls(d.decls, s, s, fn);
    walk(d.body, s, s, d.loc, fn);
    if (first) {
      const what = first.kind === 'object' ? `uses ${first.entries[0].cls}` : first.kind === 'impure' ? 'calls impure function' : 'calls side-effect procedure';
      const msg = `Function ${d.name} is not pure: it ${what} '${first.name}' at line ${first.line}.`;
      if (d.purity === 'pure') report(d, s, msg, 'HDLParsers:3241', 'error');
      else report(d, s, `${msg} VHDL 87 allowed this; VHDL 93 requires the keyword IMPURE.`, 'HDLParsers:3310', 'warning');
    }
    region(d.decls, s);
  };
  // the functions declared in a region, and in the regions inside it
  const region = (decls, scope) => {
    for (const d of decls || []) if (d.kind === 'function' && !d.declOnly) {
      if (isFunction(d)) checkFunction(d, scope);
      else region(d.decls, subScope(d, scope));
    }
  };
  const items = (list, scope) => {
    for (const it of list || []) {
      if (!it || typeof it !== 'object') continue;
      if (it.kind === 'process') {
        const s = new Scope(scope, scope.file);
        declare(s, it.decls, { inProcess: true });
        region(it.decls, s);
      } else if (it.kind === 'generate_for' || it.kind === 'generate_if') {
        const s = new Scope(scope, scope.file);
        if (it.var) s.add(it.var, { cls: 'constant', decl: it });
        const decls = [...(it.decls || []), ...[...(it.then || []), ...(it.else || [])].filter(x => x?.kind === 'decl').map(x => x.decl)];
        declare(s, decls);
        region(decls, s);
        items(it.items, s);
        items(it.then, s);
        items(it.else, s);
      }
    }
  };
  // the scope of a design unit: the packages it uses, then its ports, generics and declarations
  const unitScope = (u, extra = []) => {
    const f = u.file || file;
    let s = new Scope(null, f);
    for (const name of u.uses || []) {
      const p = packages(name);
      if (!p || p === u) continue;
      const ps = new Scope(s, p.file || f);
      declare(ps, p.decls);
      s = ps;
    }
    for (const x of extra) s = x(s);
    const us = new Scope(s, f);
    for (const p of u.params || []) us.add(p.name, { cls: 'constant', decl: p });
    for (const p of u.ports || []) us.add(p.name, { cls: 'port', decl: p });
    declare(us, u.decls);
    return us;
  };
  for (const u of units || []) {
    if (u.lang && u.lang !== 'vhdl') continue;
    if (u.kind === 'package' || u.kind === 'module') {
      const s = unitScope(u);
      region(u.decls, s);
      items(u.items, s);
    } else if (u.kind === 'architecture') {
      // an architecture of an entity of another file: the entity's ports, generics, declarations around it
      const ent = entityOf(u);
      const s = unitScope(u, ent ? [(outer) => { const es = new Scope(outer, ent.file || file); for (const p of ent.params || []) es.add(p.name, { cls: 'constant', decl: p }); for (const p of ent.ports || []) es.add(p.name, { cls: 'port', decl: p }); declare(es, ent.decls); return es; }] : []);
      region(u.decls, s);
      items(u.items, s);
    }
  }
  return out;
}

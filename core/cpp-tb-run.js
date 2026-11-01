// Silinx HLS C++ (#2234): runs a test bench's library C++ (core/cpp-tb-parse.js's tree) for the C simulation: values
// with their dynamic types: a number, a string (JS's), a char a number, an object { cls, fields }, a map { kv, of } kept
// sorted as std::map, a vector { items }, an iterator { seq, i }, a file { good }. Variables are cells { v } (a
// reference parameter shares its argument's). new and delete hold objects as C++ does; a local object's destructor does
// not run when its scope ends (only delete's). Isomorphic ES module.
//
//   new TbRun(program, host)   host: { fail(tok, message), tick(tok), printf(fmt, args, tok), fileExists(name, tok) }
//   run.create(className, args) -> an object; run.callMethod(obj, name, args, tok) -> a value; run.callFree(name, args, tok)
class Ret { constructor(v) { this.v = v; } }
const BREAK = Symbol('break'), CONTINUE = Symbol('continue');
const INTS = /^(unsigned |signed )?(char|short|int|long( long)?( int)?|size_t|unsigned|signed|bool)$/;

const isStr = (x) => typeof x === 'string';
const isIter = (x) => x && typeof x === 'object' && x.seq !== undefined;
const seqLength = (s) => (isStr(s.of) ? s.of.length : s.kv ? s.kv.length : s.items.length);

export class TbRun {
  constructor(program, host) { this.p = program; this.host = host; this.scopes = []; this.self = null; }
  // ------------------------------------------------------------------ values of a type
  zero(type, tok) {
    if (type.ptr) return 0;
    if (type.name === 'string') return '';
    if (type.name === 'map') return { kv: [], valueType: type.args[1] };
    if (type.name === 'vector') return { items: [], valueType: type.args[0] };
    if (this.p.classes.has(type.name)) return this.create(type.name, [], tok);
    return 0;
  }
  /** A value given to a variable of its type: an integer type's truncated, an object copied. */
  coerce(type, v, tok) {
    if (type.ptr) return v;
    if (INTS.test(type.name) && typeof v === 'number') return type.name === 'bool' ? (v ? 1 : 0) : Math.trunc(v);
    if (this.p.classes.has(type.name) && v?.cls) return this.copy(v, tok);
    if (type.name === 'string' && typeof v === 'number') this.host.fail(tok, `a number given to a string in a test bench's class`);
    return v;
  }
  copy(obj, tok) {
    const copy1 = obj.cls.methods.get(obj.cls.name)?.find((f) => f.params.length === 1 && f.body);
    if (copy1) return this.create(obj.cls.name, [obj], tok);
    const c = { cls: obj.cls, fields: new Map() };
    for (const [k, cell] of obj.fields) c.fields.set(k, { v: cell.v, type: cell.type });
    return c;
  }
  create(name, args, tok) {
    const cls = this.p.classes.get(name);
    if (!cls) this.host.fail(tok, `the class '${name}' is not declared`);
    const obj = { cls, fields: new Map() };
    for (const f of cls.fields) obj.fields.set(f.name, { v: this.zero(f.type, tok), type: f.type });
    const ctors = cls.methods.get(name) ?? [];
    if (ctors.length) this.invoke(this.pick(ctors, args, name, tok), args, obj, tok);
    else if (args.length === 1 && args[0]?.cls === cls) for (const [k, c] of args[0].fields) obj.fields.get(k).v = c.v;
    else if (args.length) this.host.fail(tok, `the class '${name}' has no constructor of ${args.length} arguments`);
    return obj;
  }
  /** An overload by its number of arguments (with the default ones) and their kinds: a string, an object, a number. */
  pick(list, args, name, tok) {
    const n = args.length;
    const fits = (pa, a) => {
      const v = a?.ref ? a.ref.v : a;
      if (pa.type.ptr) return true;
      if (pa.type.name === 'string') return isStr(v);
      if (this.p.classes.has(pa.type.name)) return v?.cls?.name === pa.type.name;
      return typeof v === 'number';
    };
    const fn = list.find((f) => f.params.length >= n && f.params.filter((p) => !p.def).length <= n && args.every((a, k) => fits(f.params[k], a)));
    if (!fn) this.host.fail(tok, `'${name}' has no form of these ${n} arguments`);
    if (!fn.body) this.host.fail(tok, `'${name}' is declared but not defined`);
    return fn;
  }
  // ------------------------------------------------------------------ calls
  callMethod(obj, name, args, tok) {
    if (!obj?.cls) this.host.fail(tok, `'${name}' called on what is not an object`);
    const list = obj.cls.methods.get(name);
    if (!list) this.host.fail(tok, `the class '${obj.cls.name}' has no method '${name}'`);
    return this.invoke(this.pick(list, args, name, tok), args, obj, tok);
  }
  callFree(name, args, tok) {
    const fn = this.p.functions.get(name);
    if (!fn) this.host.fail(tok, `'${name}' is not declared`);
    return this.invoke(this.pick([fn], args, name, tok), args, null, tok);
  }
  /** args: values, for a reference parameter its argument's cell { ref: cell } when it has one. */
  invoke(fn, args, self, tok) {
    if (this.scopes.length > 200) this.host.fail(tok, 'the calls go too deep (recursion?)');
    const saved = [this.scopes, this.self];
    const scope = new Map();
    fn.params.forEach((pa, k) => {
      const a = k < args.length ? args[k] : this.eval(pa.def);
      scope.set(pa.name, a?.ref && pa.type.ref ? a.ref : { v: pa.type.ref ? a : this.coerce(pa.type, a?.ref ? a.ref.v : a, tok), type: pa.type });
    });
    this.scopes = [scope];
    this.self = self;
    try {
      const r = this.stmt(fn.body);
      return r instanceof Ret ? (fn.ret ? this.coerceRet(fn.ret, r.v, tok) : r.v) : undefined;
    } finally { [this.scopes, this.self] = saved; }
  }
  coerceRet(ret, v, tok) { return ret.ref ? v : this.coerce(ret, v, tok); }
  // ------------------------------------------------------------------ statements
  stmt(s) {
    this.host.tick(s.tok);
    switch (s.kind) {
      case 'block': {
        this.scopes.push(new Map());
        try { for (const x of s.items) { const r = this.stmt(x); if (r !== undefined) return r; } } finally { this.scopes.pop(); }
        return undefined;
      }
      case 'expr': this.eval(s.e); return undefined;
      case 'decl':
        for (const d of s.items) {
          let v;
          if (d.init) v = this.coerce(s.type, this.eval(d.init), d.init.tok);
          else if (d.args) v = this.construct(s.type, d.args.map((a) => this.eval(a)), s.tok);
          else v = this.zero(s.type, s.tok);
          this.scopes.at(-1).set(d.name, { v, type: s.type });
        }
        return undefined;
      case 'if': return this.truth(this.eval(s.c)) ? this.stmt(s.a) : s.b ? this.stmt(s.b) : undefined;
      case 'for': {
        this.scopes.push(new Map());
        try {
          if (s.init) this.stmt(s.init);
          while (!s.c || this.truth(this.eval(s.c))) {
            this.host.tick(s.tok);
            const r = this.stmt(s.body);
            if (r === BREAK) break;
            if (r instanceof Ret) return r;
            if (s.step) this.eval(s.step);
          }
        } finally { this.scopes.pop(); }
        return undefined;
      }
      case 'return': return new Ret(s.e ? this.eval(s.e) : undefined);
      case 'break': return BREAK;
      case 'continue': return CONTINUE;
      case 'delete': {
        const o = this.eval(s.e);
        if (o?.cls?.methods.has('~')) this.invoke(o.cls.methods.get('~')[0], [], o, s.tok);
        return undefined;
      }
      default: return this.host.fail(s.tok, `a statement '${s.kind}' in a test bench's class: not supported`);
    }
  }
  construct(type, args, tok) {
    if (type.name === 'string' && !type.ptr) return args.length ? this.str(args[0], tok) : '';
    if (type.name === 'ifstream') return { good: isStr(args[0]) && this.host.fileExists(args[0], tok), file: true };
    if (this.p.classes.has(type.name) && !type.ptr) return this.create(type.name, args, tok);
    return this.coerce(type, args[0], tok);
  }
  str(x, tok) {
    if (isStr(x)) return x;
    return this.host.fail(tok, `a string from what is not one in a test bench's class`);
  }
  truth(x) { return isStr(x) || (x && typeof x === 'object') ? true : !!x; }
  // ------------------------------------------------------------------ expressions
  cellOf(name) {
    for (let k = this.scopes.length - 1; k >= 0; k--) if (this.scopes[k].has(name)) return this.scopes[k].get(name);
    return this.self?.fields.get(name) ?? null;
  }
  /** An lvalue: { get, set }. */
  place(e) {
    switch (e.kind) {
      case 'id': {
        const c = this.cellOf(e.name);
        if (!c) this.host.fail(e.tok, `'${e.name}' is not declared`);
        return c;
      }
      case 'field': {
        let o = this.eval(e.obj);
        if (isIter(o)) o = this.deref(o, e.tok);
        const c = o?.fields?.get(e.name);
        if (!c) this.host.fail(e.tok, o === 0 ? `'${e.name}' of a null pointer` : `'${e.name}' is not a member of this value`);
        return c;
      }
      case 'index': return this.indexed(e, this.eval(e.a), this.eval(e.i));
      default: return this.host.fail(e.tok, 'this cannot be assigned in a test bench\'s class');
    }
  }
  /** b[i]: a place in a map or a vector, the value of a string's char (it cannot be assigned here) or argv's. */
  indexed(e, b, i) {
    if (b?.kv) return this.mapEntry(b, i, e.tok);
    if (b?.items) {
      if (i < 0 || i >= b.items.length) this.host.fail(e.tok, `the index ${i} is outside the vector (its size ${b.items.length})`);
      return { get v() { return b.items[i]; }, set v(x) { b.items[i] = x; } };
    }
    if (isStr(b)) { if (i < 0 || i > b.length) this.host.fail(e.tok, `the index ${i} is outside the string`); return { v: i === b.length ? 0 : b.charCodeAt(i), readonly: true }; }
    if (Array.isArray(b)) { if (i < 0 || i >= b.length) this.host.fail(e.tok, `the index ${i} is outside the array`); return { v: b[i], readonly: true }; }
    return this.host.fail(e.tok, `an index of what is not a string, a map or a vector in a test bench's class`);
  }
  /** m[k]: its entry, a new one with the value's zero, in order (std::map). */
  mapEntry(m, key, tok) {
    const lo = this.lowerBound(m, key);
    if (m.kv[lo]?.[0] !== key) m.kv.splice(lo, 0, [key, this.zero(m.valueType, tok)]);
    const entry = m.kv[lo];
    return { get v() { return entry[1]; }, set v(x) { entry[1] = x; } };
  }
  lowerBound(m, key) {
    let k = 0;
    while (k < m.kv.length && m.kv[k][0] < key) k++;
    return k;
  }
  eval(e) {
    switch (e.kind) {
      case 'num': case 'str': return e.value;
      case 'this': return this.self;
      case 'id': {
        const c = this.cellOf(e.name);
        if (!c) this.host.fail(e.tok, `'${e.name}' is not declared`);
        return c.v;
      }
      case 'field': case 'index': return this.place(e).v;
      case 'assign': {
        const c = this.place(e.a);
        if (c.readonly) this.host.fail(e.tok, 'this cannot be assigned in a test bench\'s class');
        const b = this.eval(e.b);
        if (e.op === '+=') { c.v = this.add(c.v, b, e.tok); return c.v; }
        const op = c.v?.cls?.methods.get('operator=');
        if (op && b?.cls) { this.invoke(this.pick(op, [b], 'operator=', e.tok), [b], c.v, e.tok); return c.v; }
        c.v = c.type ? this.coerce(c.type, b, e.tok) : b;
        return c.v;
      }
      case 'cond': return this.eval(this.truth(this.eval(e.c)) ? e.a : e.b);
      case 'bin': return this.binary(e);
      case 'un': {
        if (e.op === '&') return this.host.fail(e.tok, `& in a test bench's class: not supported`);
        const a = this.eval(e.a);
        if (e.op === '!') return this.truth(a) ? 0 : 1;
        if (e.op === '-') return -a;
        if (isIter(a)) return this.deref(a, e.tok);
        if (a?.cls) return a;
        return this.host.fail(e.tok, a === 0 ? 'a null pointer dereferenced' : `* of what is not a pointer in a test bench's class`);
      }
      case 'inc': {
        const c = this.place(e.a), old = c.v, d = e.op === '++' ? 1 : -1;
        c.v = isIter(old) ? { ...old, i: old.i + d } : old + d;
        return e.pre ? c.v : old;
      }
      case 'new': return this.construct(e.type, e.args.map((a) => this.eval(a)), e.tok);
      case 'cast': return this.coerce(e.type, this.eval(e.a), e.tok);
      case 'method': return this.method(e);
      case 'call': return this.call(e);
      default: return this.host.fail(e.tok, `'${e.kind}' in a test bench's class: not supported`);
    }
  }
  /** Arguments: a variable's its cell (a reference parameter's to share), the others values. */
  argsOf(list) {
    return list.map((a) => (a.kind === 'id' || a.kind === 'field' ? { ref: this.place(a) } : this.eval(a)));
  }
  add(a, b, tok) {
    if (isStr(a) && isStr(b)) return a + b;
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    return this.host.fail(tok, `'+' of a string and a char in a test bench's class: not supported ("-" + c is a pointer's arithmetic in C++)`);
  }
  binary(e) {
    if (e.op === '&&') return this.truth(this.eval(e.a)) && this.truth(this.eval(e.b)) ? 1 : 0;
    if (e.op === '||') return this.truth(this.eval(e.a)) || this.truth(this.eval(e.b)) ? 1 : 0;
    const a = this.eval(e.a), b = this.eval(e.b);
    switch (e.op) {
      case '+': return isIter(a) ? { ...a, i: a.i + b } : this.add(a, b, e.tok);
      case '-': return isIter(a) ? { ...a, i: a.i - b } : a - b;
      case '*': return a * b;
      case '%': if (!b) this.host.fail(e.tok, 'a division by zero'); return a % b;
      case '==': return this.same(a, b) ? 1 : 0;
      case '!=': return this.same(a, b) ? 0 : 1;
      case '<': return a < b ? 1 : 0;
      case '>': return a > b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0;
      case '>=': return a >= b ? 1 : 0;
      default: return this.host.fail(e.tok, `'${e.op}' in a test bench's class: not supported`);
    }
  }
  same(a, b) { return isIter(a) && isIter(b) ? a.seq === b.seq && a.i === b.i : a === b; }
  deref(it, tok) {
    if (it.i < 0 || it.i >= seqLength(it.seq)) this.host.fail(tok, 'an iterator at the end dereferenced');
    if (isStr(it.seq.of)) return it.seq.of.charCodeAt(it.i);
    if (it.seq.kv) return { fields: new Map([['first', { get v() { return it.seq.kv[it.i][0]; } }], ['second', { get v() { return it.seq.kv[it.i][1]; }, set v(x) { it.seq.kv[it.i][1] = x; } }]]) };
    return it.seq.items[it.i];
  }
  /** s.begin() of a string: the sequence one per call, equal by its text. */
  strSeq(s) { (this.strs ||= new Map()); if (!this.strs.has(s)) this.strs.set(s, { of: s }); return this.strs.get(s); }
  method(e) {
    const list = e.args;
    // (a user's object: overload by its count, references by place)
    const objv = this.eval(e.obj);
    const tok = e.tok;
    if (objv?.cls) {
      const ms = objv.cls.methods.get(e.name);
      if (!ms) this.host.fail(tok, `the class '${objv.cls.name}' has no method '${e.name}'`);
      const args = this.argsOf(list);
      return this.invoke(this.pick(ms, args, e.name, tok), args, objv, tok);
    }
    const args = list.map((a) => this.eval(a));
    if (isStr(objv)) {
      switch (e.name) {
        case 'length': case 'size': return objv.length;
        case 'empty': return objv.length ? 0 : 1;
        case 'c_str': case 'data': return objv;
        case 'find': { const k = objv.indexOf(this.str(args[0], tok), args[1] ?? 0); return k < 0 ? 18446744073709551615 : k; }
        case 'substr': return objv.substr(args[0] ?? 0, args[1]);
        case 'begin': return { seq: this.strSeq(objv), i: 0 };
        case 'end': return { seq: this.strSeq(objv), i: objv.length };
        default: return this.host.fail(tok, `std::string::${e.name}: not supported in a test bench`);
      }
    }
    if (objv?.kv) {
      switch (e.name) {
        case 'find': { const k = objv.kv.findIndex(([x]) => x === args[0]); return { seq: objv, i: k < 0 ? objv.kv.length : k }; }
        case 'begin': return { seq: objv, i: 0 };
        case 'end': return { seq: objv, i: objv.kv.length };
        case 'size': return objv.kv.length;
        case 'empty': return objv.kv.length ? 0 : 1;
        case 'count': return objv.kv.some(([x]) => x === args[0]) ? 1 : 0;
        default: return this.host.fail(tok, `std::map::${e.name}: not supported in a test bench`);
      }
    }
    if (objv?.items) {
      switch (e.name) {
        case 'size': return objv.items.length;
        case 'empty': return objv.items.length ? 0 : 1;
        case 'push_back': objv.items.push(args[0]); return undefined;
        case 'resize': { const n = args[0]; while (objv.items.length > n) objv.items.pop(); while (objv.items.length < n) objv.items.push(this.zero(objv.valueType, tok)); return undefined; }
        case 'begin': return { seq: objv, i: 0 };
        case 'end': return { seq: objv, i: objv.items.length };
        default: return this.host.fail(tok, `std::vector::${e.name}: not supported in a test bench's class`);
      }
    }
    if (objv?.file) {
      switch (e.name) {
        case 'good': case 'is_open': return objv.good ? 1 : 0;
        case 'close': return undefined;
        default: return this.host.fail(tok, `ifstream::${e.name}: not supported in a test bench's class`);
      }
    }
    return this.host.fail(tok, objv === 0 ? `'${e.name}' of a null pointer` : `'${e.name}' of what is not an object`);
  }
  call(e) {
    const tok = e.tok;
    // (a value of a type: string("x"), int(x))
    if (e.name === 'string') return e.args.length ? this.str(this.eval(e.args[0]), tok) : '';
    if (this.self) {
      const ms = this.self.cls.methods.get(e.name);
      if (ms) { const args = this.argsOf(e.args); return this.invoke(this.pick(ms, args, e.name, tok), args, this.self, tok); }
    }
    if (this.p.classes.has(e.name)) return this.create(e.name, e.args.map((a) => this.eval(a)), tok);
    const fn = this.p.functions.get(e.name);
    if (fn) { const args = this.argsOf(e.args); return this.invoke(this.pick([fn], args, e.name, tok), args, null, tok); }
    const args = e.args.map((a) => this.eval(a));
    switch (e.name) {
      case 'printf': return this.host.printf(this.str(args[0], tok), args.slice(1), tok);
      case 'atoi': return Math.trunc(Number.parseInt(this.str(args[0], tok), 10)) || 0;
      case 'atof': return Number.parseFloat(this.str(args[0], tok)) || 0;
      case 'isdigit': return args[0] >= 48 && args[0] <= 57 ? 1 : 0;
      case 'strlen': return this.str(args[0], tok).length;
      default: return this.host.fail(tok, `'${e.name}' in a test bench's class: not supported`);
    }
  }
}

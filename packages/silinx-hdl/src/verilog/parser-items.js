// Silinx - the Verilog parser's generate blocks, functions and instances (#405: out of core/verilog/parser.js):
// generate blocks, loops, case and if; functions and tasks with their local variables; gate and module instances.
import { Sync, TYPEWORDS } from './parser-defs.js';

/** Parser's methods of this part, assigned to its prototype by parser.js. */
export const itemMethods = {
  // a generate block: begin [: name] items end [: name], or a single item (its own scope)
  genBlock() {
    let label = null;
    const items = [], decls = [];
    this.beginGenScope();
    this.blockDepth++;
    try {
      if (this.accept('begin')) {
        if (this.accept(':')) label = this.ident();
        while (!this.is('end') && this.tok.t !== 'eof') this.moduleItem(items, decls, false);
        this.expect('end');
        if (this.accept(':')) this.ident();
      } else this.moduleItem(items, decls, false);
    } finally {
      this.blockDepth--;
    }
    this.endGenScope(items, decls);
    return { label, items, decls };
  },

  genFor(n = 0) {
    const loc = this.loc();
    this.expect('for'); this.expect('(');
    this.accept('genvar');
    const v = this.ident(); this.expect('='); const init = this.expr(); this.expect(';');
    const cond = this.expr(); this.expect(';');
    const sv = this.ident();
    if (sv !== v) this.error('generate loop step must assign the loop variable');
    const step = this.stepValue(v);
    this.expect(')');
    const blk = this.genBlock();
    const node = { kind: 'generate_for', label: blk.label, var: v, init, cond, step, decls: blk.decls, items: blk.items, loc };
    if (!blk.label) this.autoLabel(node, 'label', n);
    return node;
  },

  // after `i` in a step: `= expr`, `++`, `--`, `+= e`, `-= e`
  stepValue(v) {
    const ref = { op: 'ref', name: v };
    if (this.accept('=')) return this.expr();
    if (this.accept('++')) return { op: 'binary', o: '+', a: ref, b: { op: 'int', value: '1' } };
    if (this.accept('--')) return { op: 'binary', o: '-', a: ref, b: { op: 'int', value: '1' } };
    if (this.accept('+=')) return { op: 'binary', o: '+', a: ref, b: this.expr() };
    if (this.accept('-=')) return { op: 'binary', o: '-', a: ref, b: this.expr() };
    this.error('expected loop step assignment'); throw new Sync();
  },

  // case generate: a chain of if-generates on `expr == choice` (elseChain: the else branch is the
  // next alternative, in the same scope); the default is the last else branch
  genCase(n = 0) {
    const loc = this.loc();
    this.expect('case'); this.expect('(');
    const sel = this.expr(); this.expect(')');
    const alts = [];
    let def = null;
    while (!this.is('endcase') && this.tok.t !== 'eof') {
      if (this.accept('default')) { this.accept(':'); def = this.genBlock(); continue; }
      const choices = [];
      do { choices.push(this.expr()); } while (this.accept(','));
      this.expect(':');
      alts.push({ choices, blk: this.genBlock() });
    }
    this.expect('endcase');
    if (!alts.length) alts.push({ choices: [], blk: { label: null, items: [], decls: [] } });
    let next = null;
    for (let k = alts.length - 1; k >= 0; k--) {
      const { choices, blk } = alts[k];
      const cond = choices.length ? choices.map(c => ({ op: 'binary', o: '==', a: sel, b: c })).reduce((x, y) => ({ op: 'binary', o: '||', a: x, b: y })) : { op: 'int', value: '0' };
      const node = { kind: 'generate_if', label: blk.label, cond, then: blk.items, else: [], decls: blk.decls, loc };
      if (!blk.label) this.autoLabel(node, 'label', n);
      if (next) { node.else = [next]; node.elseChain = true; }
      else if (def) {
        node.else = def.items; node.elseDecls = def.decls; node.elseLabel = def.label;
        if (!def.label) this.autoLabel(node, 'elseLabel', n);
      }
      next = node;
    }
    return next;
  },

  genIf(n = 0) {
    const loc = this.loc();
    this.expect('if'); this.expect('(');
    const cond = this.expr(); this.expect(')');
    const thenB = this.genBlock();
    const node = { kind: 'generate_if', label: thenB.label, cond, then: thenB.items, else: [], decls: thenB.decls, loc };
    if (!thenB.label) this.autoLabel(node, 'label', n);
    if (this.accept('else')) {
      // else if: the next branch of the same construct (same number, same scope)
      if (this.is('if')) { node.else = [this.genIf(n)]; node.elseChain = true; }
      else {
        const b = this.genBlock();
        node.else = b.items; node.elseDecls = b.decls; node.elseLabel = b.label;
        if (!b.label) this.autoLabel(node, 'elseLabel', n);
      }
    }
    return node;
  },

  // automatic / static before a declaration of a block or a subprogram (SystemVerilog)
  lifetime() {
    const w = t => t.v === 'automatic' || t.v === 'static';
    if (w(this.tok) && (this.tok.t === 'kw' || this.tok.t === 'id') && this.peek().t !== 'op') return this.next().v;
    return null;
  },
  // the variables of a block or a subprogram; an automatic one's initializer is an assignment at each
  // entry (decls.inits), a static one's is its initial value (constant: evaluated once, before time 0)
  localVars(decls, life) {
    const n0 = decls.length;
    this.netDecl([], decls, true);
    const auto = life === 'automatic' || (life == null && this.autoScope);
    for (const d of decls.slice(n0)) {
      if (d.kind !== 'signal') continue;
      if (life) d.lifetime = life;
      if (auto && d.init) {
        (decls.inits || (decls.inits = [])).push({ kind: 'assign', target: { op: 'ref', name: d.name }, value: d.init, nonblocking: false, delay: null, loc: d.loc });
        d.init = null;
      }
    }
  },

  funcDecl() {
    const loc = this.loc();
    const kind = this.next().v;
    const automatic = !!this.accept('automatic');
    const outerAuto = this.autoScope;
    this.autoScope = automatic;
    try { return this.funcBody(loc, kind, automatic); } finally { this.autoScope = outerAuto; }
  },
  funcBody(loc, kind, automatic) {
    let returnType = null;
    if (kind === 'function') {
      if (this.isWord('void')) this.next();
      else if (this.tok.t === 'id' && !this.is(';', this.peek()) && !this.is('(', this.peek()) && !this.is('.', this.peek())) returnType = this.dataType();   // int f, my_t f
      else { this.accept('reg'); this.accept('logic'); returnType = this.dataType(); }
    }
    const name = this.ident();
    const params = [], decls = [];
    const parseType = () => {
      this.accept('reg'); this.accept('wire'); this.accept('logic');
      if (this.isWord('var')) this.next();
      // (a parameter named like a type word: input bit)
      if (this.tok.t === 'id' && (TYPEWORDS.has(this.tok.v) || this.typeNames.has(this.tok.v)) && [',', ')', ';'].includes(this.peek().v)) return { kind: 'logic', range: null, signed: false };
      return this.dataType();
    };
    const parseParamGroup = () => {
      const d = this.next().v;
      const dir = d === 'input' ? 'in' : d === 'output' ? 'out' : 'inout';
      return { dir, type: parseType() };
    };
    if (this.accept('(')) { // ANSI style
      if (!this.is(')')) {
        let cur = { dir: 'in', type: { kind: 'logic', range: null, signed: false } };
        do {
          if (this.isAny('input', 'output', 'inout')) cur = parseParamGroup();
          // a type without a direction: the direction of the parameter before (input first)
          else if (this.isAny('integer', 'reg', 'logic', 'signed', 'time', 'real', '[') || this.isTypeStart()) cur = { dir: cur.dir, type: parseType() };
          params.push({ name: this.ident(), ...cur });
        } while (this.accept(','));
      }
      this.expect(')');
    }
    this.expect(';');
    for (;;) {
      if (this.isAny('input', 'output', 'inout')) {
        const g = parseParamGroup();
        do { params.push({ name: this.ident(), ...g }); } while (this.accept(','));
        this.expect(';');
      } else if (this.isAny('parameter', 'localparam')) {
        this.next(); const { type } = this.paramType();
        do { const n = this.ident(); this.expect('='); decls.push({ kind: 'const', name: n, type, value: this.expr(), loc: this.loc() }); } while (this.accept(','));
        this.expect(';');
      } else if (this.isAny('reg', 'integer', 'logic', 'real', 'time') || this.isTypeStart() || (['automatic', 'static'].includes(this.tok.v) && this.peek().t !== 'op')) {
        const life = this.lifetime();
        this.localVars(decls, life || (automatic ? 'automatic' : null));
      } else if (this.isWord('typedef')) this.typedef(decls);
      else break;
    }
    const body = [...(decls.inits || [])];
    delete decls.inits;
    while (!this.isAny('endfunction', 'endtask', 'endmodule') && this.tok.t !== 'eof') { const i0 = this.i; body.push(this.stmt()); if (this.i === i0) break; }
    if (this.isAny('endfunction', 'endtask')) this.next(); else this.error(`expected '${kind === 'task' ? 'endtask' : 'endfunction'}' but found '${this.tok.v || this.tok.t}'`);
    // `input [4:0] r; reg [4:0] r;` / `input x; integer x;`: the second declaration gives the
    // argument's type (it does not declare a variable of its own)
    for (let k = decls.length - 1; k >= 0; k--) {
      const d = decls[k], p = d.kind === 'signal' && params.find(q => q.name === d.name);
      if (!p) continue;
      if (d.type.kind !== 'logic' || d.type.range || !p.type.range) p.type = { ...d.type, signed: d.type.signed || p.type.signed };
      decls.splice(k, 1);
    }
    for (const d of decls) if (d.kind === 'signal') d.net = 'variable';
    const fn = { kind, name, params, returnType, decls, body, loc, automatic };
    if (kind === 'function') fn.retVar = name;
    return fn;
  },

  gateInst(items) {
    const loc = this.loc();
    const g = this.next().v;
    let delay = null;
    if (this.is('#')) { this.next(); delay = this.delayValue(); }
    do {
      if (this.tok.t === 'id') this.next(); // instance name (optional)
      this.expect('(');
      const args = [];
      do { args.push(this.expr()); } while (this.accept(','));
      this.expect(')');
      const out = args[0], ins = args.slice(1);
      let value;
      if (g === 'not' || g === 'buf') {
        // not / buf: every terminal but the last is an output (not (o1, o2, i))
        const i = args[args.length - 1];
        for (const o of args.slice(0, -1)) items.push({ kind: 'assign', target: o, value: g === 'not' ? { op: 'unary', o: '~', a: i } : i, delay, loc, gate: true });
        continue;
      } else if (g.includes('if')) {   // bufif1 (out, in, enable): in when enabled, z otherwise
        const d = g.startsWith('not') ? { op: 'unary', o: '~', a: ins[0] } : ins[0];
        const z = { op: 'lit', bits: 'z', signed: false, sized: true };
        value = g.endsWith('1') ? { op: 'cond', cond: ins[1], then: d, else: z } : { op: 'cond', cond: ins[1], then: z, else: d };
      } else {
        const o = { and: '&', or: '|', xor: '^', nand: '&', nor: '|', xnor: '^' }[g];
        value = ins.reduce((acc, e) => ({ op: 'binary', o, a: acc, b: e }));
        if (g[0] === 'n' || g === 'xnor') value = { op: 'unary', o: '~', a: value };
      }
      items.push({ kind: 'assign', target: out, value, delay, loc, gate: true });
    } while (this.accept(','));
    this.expect(';');
  },

  instance(items) {
    const loc = this.loc();
    const module = this.ident();
    const params = [];
    if (this.accept('#')) {
      if (this.is('(')) {
        this.next();
        if (!this.is(')')) {
          do {
            if (this.accept('.')) {
              const n = this.ident(); this.expect('(');
              params.push({ name: n, value: this.is(')') ? null : this.expr() });
              this.expect(')');
            } else params.push({ name: null, value: this.expr() });
          } while (this.accept(','));
        }
        this.expect(')');
      } else params.push({ name: null, value: this.primary() });
    }
    do {
      const iloc = this.loc();
      const name = this.ident();
      const array = this.optRange();   // an array of instances: u [3:0] (…)
      this.expect('(');
      const conns = [];
      if (!this.is(')')) {
        do {
          if (this.accept('.')) {
            if (this.accept('*')) { conns.push({ port: '*', expr: null }); continue; }
            const port = this.ident();
            if (this.accept('(')) {
              conns.push({ port, expr: this.is(')') ? null : this.expr() });
              this.expect(')');
            } else conns.push({ port, expr: { op: 'ref', name: port } }); // .name shorthand
          } else if (this.is(',') || this.is(')')) conns.push({ port: null, expr: null });
          else conns.push({ port: null, expr: this.expr() });
        } while (this.accept(','));
      }
      this.expect(')');
      items.push({ kind: 'instance', name, module, params, conns, loc: items.length && name !== undefined ? iloc : loc, ...(array ? { array } : {}) });
    } while (this.accept(','));
    this.expect(';');
  },

  delayValue() {
    if (this.accept('(')) { const e = this.expr(); if (this.accept(',')) { this.expr(); if (this.accept(',')) this.expr(); } this.expect(')'); return e; }
    // a name is the delay, never called: in `x <= #Tp (a) ? b : c` the parenthesis starts the expression (#373)
    if (this.tok.t === 'id' && this.is('(', this.peek())) { const name = this.tok.v; this.next(); return { op: 'ref', name }; }
    return this.primary();
  }
};

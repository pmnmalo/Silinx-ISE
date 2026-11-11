// The Verilog translator's module (#405: out of toVerilog in synth-verilog.js): the processes (clocked, with their
// asynchronous resets, and combinational), the initial blocks, the primitives' instances, the declarations with the
// signals' start values, and the text of the one flat module with what the synthesis needs to know of it. The values
// and statements it writes come from toVerilog's translator. Isomorphic (no DOM, no Node APIs).
import { SimError, applyWrite, bitpos, exec } from './interp.js';
import * as V from './values.js';
import { SynthError, esc, findShiftMems, lit, sgn, yosysCell } from './synth-verilog.js';

/** The module's text and what the synthesis needs to know of it (toVerilog's result); setShiftMems: the shift-chain
 *  arrays found, for the translator's values. */
export function writeModule(ctx) {
  const {
    design, name, simprim, blocks, decls, fail, funcs, isMem, isRec, nullVec, packVal, portOf, prefix, primDriven,
    prims, sigName, skipProc, skipSig, stmt, tapWires, top, uniq, wOf, warnings, where, wiredDrv,
    setShiftMems
  } = ctx;

  // ---------------- processes
  // the clock condition: rising_edge(clk) / falling_edge(clk) / clk'event and clk = '1'
  // a one-bit signal or a constant bit of a vector (clks(k) in a for-generate, #98): { sig, bit }
  const bitRef = n => {
    if (n?.k === 'sig' && n.sig.t.w === 1) return { sig: n.sig, bit: null };
    if (n?.k === 'bit' && n.base.k === 'sig' && n.index.k === 'c') return { sig: n.base.sig, bit: bitpos(n.base.t, V.toNum(n.index.val)) };
    return null;
  };
  // the Verilog name of a clock / reset: the signal, or its bit
  const edgeName = r => `${sigName.get(r.sig)}${r.bit != null && (r.sig.t.w > 1 || !r.sig.t.scalar) ? `[${r.bit}]` : ''}`;
  function edgeOf(c) {
    if (!c) return null;
    if (c.k === 'edge' && c.sig) return { sig: c.sig, bit: c.bit ?? null, pos: c.pos !== false };
    if (c.k === 'bin' && (c.o === '&' || c.o === '&&')) {
      const ev = [c.a, c.b].find(x => x.k === 'event'), lv = [c.a, c.b].find(x => x.k === 'bin' && x.o === '==');
      if (ev && lv) {
        const s = bitRef(lv.a) || bitRef(lv.b), k = lv.a.k === 'c' ? lv.a : lv.b.k === 'c' ? lv.b : null;
        if (s && k && s.sig === ev.sig && (s.bit ?? 0) === (ev.bit ?? 0)) return { sig: s.sig, bit: s.bit, pos: V.toNum(k.val) === 1 };
      }
    }
    return null;
  }
  // an asynchronous reset condition: sig = '1' / '0', sig, not sig (a bit of a vector too)
  function levelOf(c) {
    if (bitRef(c)) return { ...bitRef(c), high: true };
    if (c.k === 'un' && (c.o === '!' || c.o === '~') && bitRef(c.a)) return { ...bitRef(c.a), high: false };
    if (c.k === 'bin' && c.o === '==') {
      const s = bitRef(c.a) || bitRef(c.b), k = c.a.k === 'c' ? c.a : c.b.k === 'c' ? c.b : null;
      if (s && k && !k.val.x) return { ...s, high: V.toNum(k.val) === 1 };
    }
    return null;
  }
  // (in the same order as a recursive walk, with a stack of its own: an elsif chain of thousands of branches, #2577)
  const hasEdge = n => {
    for (const stack = [n]; stack.length;) {
      const x = stack.pop();
      if (!x || typeof x !== 'object') continue;
      if (x.k === 'edge' || x.k === 'event') return true;
      const kids = Object.entries(x).filter(([k, v]) => k !== 't' && k !== 'sig' && k !== 'fn' && v && typeof v === 'object');
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i][1]);
    }
    return false;
  };

  // a concurrent assignment whose value is a condition chain with a clock edge
  // (q <= d when rising_edge(clk); q <= '0' when rst = '1' else d when rising_edge(clk)): the
  // equivalent if statements, without the branches that keep the target's own value
  const sameSig = (a, b) => a && b && a.k === 'sig' && b.k === 'sig' && a.sig === b.sig;
  function condToIf(st) {
    if (!st || st.k !== 'asg' || st.value?.k !== 'cond' || !hasEdge(st.value)) return st;
    const build = v => {
      if (v.k !== 'cond') return sameSig(v, st.target) ? null : { ...st, value: v };
      return { k: 'if', c: v.c, then: build(v.a), else: build(v.b), loc: st.loc };
    };
    return build(st.value);
  }

  let pn = 0;
  function process(p) {
    if (p.mode === 'initial' || p.mode === 'loop') return initialProcess(p);
    const ctx = { proc: p, locals: new Map(), fn: null, base: `p${pn++}`, flags: [] };
    const file = p.file;
    try {
      let head, body;
      if (p.mode === 'wait-first' && p.triggers?.length) {
        // Verilog always @(…): the event list as written
        const edges = p.triggers.filter(t => t.edge === 'pos' || t.edge === 'neg');
        if (edges.length && edges.length !== p.triggers.length) fail('an event list mixing edges and levels', p);
        head = edges.length ? `always @(${edges.map(t => `${t.edge === 'pos' ? 'posedge' : 'negedge'} ${edgeName({ sig: t.sig, bit: t.pos ?? null })}`).join(' or ')})` : 'always @*';
        body = stmt(p.body, ctx, '    ', 'proc');
      } else if (!hasEdge(p.body)) {
        if (p.mode !== 'comb' && p.mode !== 'sens' && p.kind !== 'assign' && p.kind !== 'glue') fail('a process with waits cannot be synthesized', p);
        head = 'always @*';
        body = stmt(p.body, ctx, '    ', 'proc');
      } else {
        // VHDL clocked process: [if reset … elsif] if clock-edge … ; nothing else at the top
        let s = condToIf(p.body);
        while (s.k === 'blk' && s.stmts.length === 1) s = s.stmts[0];
        if (s.k !== 'if') fail('a clocked process must be one if statement on the clock (and asynchronous resets before it)', p);
        const resets = [];
        let clock = null, cur = s;
        while (cur && cur.k === 'if') {
          const ed = edgeOf(cur.c);
          if (ed) { clock = { ...ed, body: cur.then, rest: cur.else }; break; }
          const lv = levelOf(cur.c);
          if (!lv) fail('a condition before the clock edge that is not an asynchronous reset (signal = \'0\' / \'1\')', cur);
          resets.push({ ...lv, body: cur.then });
          cur = cur.else && cur.else.k === 'blk' && cur.else.stmts.length === 1 ? cur.else.stmts[0] : cur.else;
        }
        if (!clock) fail('no clock edge found in this process', p);
        if (clock.rest) fail('statements after the clock edge branch (elsif / else after rising_edge)', p);
        const ev = [`${clock.pos ? 'posedge' : 'negedge'} ${edgeName(clock)}`, ...resets.map(r => `${r.high ? 'posedge' : 'negedge'} ${edgeName(r)}`)];
        head = `always @(${ev.join(' or ')})`;
        let txt = '';
        const rb = resets.map(r => stmt(r.body, ctx, '      ', 'proc'));
        resets.forEach((r, k) => { txt += `    ${k ? 'else ' : ''}if (${r.high ? '' : '!'}${edgeName(r)}) begin\n${rb[k]}    end\n`; });
        const cb = stmt(clock.body, ctx, resets.length ? '      ' : '    ', 'proc');
        // (nothing left in any branch: no body, the block is left out)
        body = !cb.trim() && rb.every(x => !x.trim()) ? '' : resets.length ? `${txt}    else begin\n${cb}    end\n` : cb;
      }
      if (hasEdge(p.body) && !head.includes('edge')) fail('a clock edge not at the top of the process', p);
      // a process variable keeps its value from one activation to the next: its declared initial
      // value is the register's (the INIT of its flip-flops)
      const init0 = p.frameInit ? p.frameInit() : [];
      const vinit = (i, l) => { const v = typeof i === 'number' ? init0[i] : undefined; return v && !Array.isArray(v) && v.str === undefined && l.t.kind !== 'array' && v.w > 0 && v.x !== (1n << BigInt(v.w)) - 1n ? ` = ${lit(V.resize(v, wOf(l.t)), wOf(l.t))}` : ''; };
      const loc = [...[...ctx.locals.entries()].map(([i, l]) => [i, l]), ...(ctx.extraLocals || []).map(l => [null, l])].map(([i, l]) => `  reg ${sgn(l.t) ? 'signed ' : ''}${isMem(l.t) ? `[${wOf(l.t.elem) - 1}:0] ${l.name} [0:${l.t.len - 1}]` : `[${wOf(l.t) - 1}:0] ${l.name}${vinit(i, l)}`};`);
      let text = body;
      for (const [sg, m] of wiredDrv) if (m.has(p)) text = `    ${m.get(p)} = ${lit(V.mk(wOf(sg.t), sg.wired === 'and' ? V.mask(wOf(sg.t)) : 0n))};\n${text}`;
      for (const f of ctx.flags) {
        const nm = uniq(`${ctx.base}${f}`);
        loc.push(`  reg ${nm};`);
        text = text.replaceAll(new RegExp(`\\b${f}\\b`, 'g'), nm);
      }
      // a process left with no statement (it only assigned vectors of no bit, VHDL null ranges, #61):
      // no always block (an empty one is noise)
      if (!text.trim() && !loc.length) return;
      // process variables first assigned in the process: blocking (as in VHDL)
      blocks.push(`${loc.join('\n')}${loc.length ? '\n' : ''}  // ${p.name || p.kind}${p.loc ? ` (${p.file || ''}:${p.loc.line})` : ''}\n  ${head} begin\n${text}  end`);
    } catch (err) {
      if (err instanceof SynthError) { err.file ||= file; err.proc = p.name; }
      throw err;
    }
  }

  // ---------------- initial blocks
  // An initial block without delays (or a VHDL process that ends in a bare `wait;`) only sets
  // the values the design starts with. It is run here, once, by the simulator's own interpreter
  // (so loops, functions, expressions mean exactly what they mean in simulation), on a stand-in
  // for the simulator that records the assignments; what it leaves in each signal becomes that
  // signal's initial value (the INIT of its flip-flops, the contents of its memory). Messages
  // ($display, report) have no effect; delays, waits on events and file reads cannot be synthesized.
  const initVal = new Map();     // signal -> its value after the initial blocks
  const drivers = new Map();     // signal -> the processes (not initial) that assign it
  for (const p of design.procs) if (p.mode !== 'initial' && p.mode !== 'loop') for (const s of p.writes || []) { if (!drivers.has(s)) drivers.set(s, []); drivers.get(s).push(p); }
  const inputSigs = new Set(design.top.ports.filter(pt => pt.dir === 'in').map(pt => pt.sig));
  function initialProcess(p) {
    const saved = new Map(), nba = [];
    try {
      // a value read from a signal that another process drives depends on the order the
      // processes start in at time 0: not an initial value
      for (const s of p.reads || []) if (!p.writes?.has(s) && drivers.has(s)) fail(`an initial block that reads ${s.name}, which another process drives`, p);
      // an input of the design: its value at time 0 is not known when synthesizing (output integer
      // q = off + 1;, a variable's initializer that is not constant: evaluated once, at time 0)
      for (const s of p.reads || []) if (inputSigs.has(s)) fail(p.declInit ? `an initializer that reads the input ${s.name} (evaluated once, at time 0) cannot be synthesized` : `an initial block that reads the input ${s.name} cannot be synthesized`, p);
      const no = what => () => fail(`${what} cannot be synthesized`, p);
      const write = (wr, v) => { const sg = wr.sig; if (!saved.has(sg)) saved.set(sg, sg.val); sg.val = applyWrite(sg.val, wr, v); };
      const sim = {
        now: 0, stamp: 0, write, nba: (wr, v) => nba.push([wr, v]), preempt() {}, print() {}, strobe() {}, monitor() {}, report() {}, finish() {},
        after: no('a delayed assignment in an initial block'), readmem: no('$readmemh / $readmemb (the file is not read by synthesis)'), random: no('$random'),
      };
      const ctx = { frame: p.frameInit ? p.frameInit() : [], sim, depth: 0, timeUnit: p.timeUnit, scopeName: p.inst?.path };
      const r = exec(p.body, ctx).next();
      // it must end (or stop for good: VHDL wait; / $finish) without waiting for time or events;
      // a VHDL process that runs to its end without waiting would start again at once
      if (r.done ? p.mode === 'loop' : !r.value?.forever) fail('a process with waits cannot be synthesized', p);
      for (const [wr, v] of nba) write(wr, v);
      for (const sg of saved.keys()) initVal.set(sg, sg.val);
    } catch (err) {
      if (err instanceof SimError) err = new SynthError(`initial block: ${err.message}${where(p)}`, p.loc);
      if (err instanceof SynthError) { err.file ||= p.file; err.proc = p.name; }
      throw err;
    } finally {
      for (const [sg, v] of saved) sg.val = v;
    }
  }
  for (const p of design.procs) if (!skipProc.has(p) && (p.mode === 'initial' || p.mode === 'loop')) process(p);

  // ---------------- primitive instances
  // A generic as Yosys's cell library (and the Xilinx Verilog UNISIM) declares it: strings and
  // booleans ("TRUE" / "FALSE") as strings, reals with a decimal point, vectors sized.
  function paramLit(prm, inst) {
    const v = prm.value, t = prm.t || {};
    if (v?.str !== undefined) return `"${v.str.replace(/["\\]/g, '\\$&')}"`;
    if (v?.real !== undefined || t.kind === 'real') { const x = v.real ?? V.toNum(v); return Number.isInteger(x) ? x.toFixed(1) : String(x); }
    if (t.kind === 'bool') return V.toNum(v) ? '"TRUE"' : '"FALSE"';
    if (t.kind === 'time' || Array.isArray(v)) fail(`${inst.module} ${inst.name}: generic ${prm.name} has no synthesizable value`, inst, inst.file);
    if (t.kind === 'int') { if (v.x) fail(`${inst.module} ${inst.name}: generic ${prm.name} is undefined`, inst, inst.file); return V.toDec(v, true); }
    return lit(v);
  }
  // (the names of the primitives, their generics and ports are upper case in Yosys's library;
  // VHDL gives them in whatever case the design wrote)
  const instances = [];   // { cell, name, params: { NAME: literal } }
  // (a SIMPRIM primitive: the cell it is compiled as, its pins renamed, the generics that place or time it left
  // out, #627; a primitive with no model keeps its name, for the compiled simulator's message)
  const simCell = inst => (simprim && inst.file === '<silinx>/simprim.vhd' ? simprim(inst.module.toUpperCase()) : null);
  const cellOf = inst => simCell(inst) || yosysCell(inst.module.toUpperCase(), inst.ports.map(pt => pt.name.toUpperCase()));
  function instance({ inst, driven }) {
    const sc = simCell(inst);
    const given = inst.params.filter(prm => prm.given && (!sc || sc.param(prm.name.toUpperCase()))).map(prm => [prm.name.toUpperCase(), paramLit(prm, inst)]);
    const params = given.map(([n, x]) => `    .${n}(${x})`);
    const cell = sc ? { name: sc.name, tie: {} } : yosysCell(inst.module.toUpperCase(), inst.ports.map(pt => pt.name.toUpperCase()));
    const conns = Object.entries(cell.tie).map(([pin, v]) => `    .${pin}(${v})`);
    for (const pt of inst.ports) {
      let x = sigName.get(pt.sig);
      // an input left unconnected (no actual drives its signal): the port's default value, if any
      if (pt.dir === 'in' && !pt.alias && !driven.has(pt.sig)) {
        const v = pt.sig.init;
        x = v && !Array.isArray(v) && v.str === undefined && v.x !== (1n << BigInt(v.w)) - 1n ? lit(v) : '';
      }
      conns.push(`    .${sc?.ports[pt.name.toUpperCase()] || pt.name.toUpperCase()}(${x})`);
    }
    const rel = inst.path.startsWith(prefix) ? inst.path.slice(prefix.length) : inst.name;
    const iname = esc(uniq(rel.replace(/\./g, '_')));
    instances.push({ cell: cell.name, name: iname.trim().replace(/^\\/, ''), params: Object.fromEntries(given) });
    const src = inst.parent?.file ? ` (${inst.parent.file})` : '';
    blocks.push(`  // ${inst.path}: ${inst.module}${src}\n  ${cell.name}${params.length ? ` #(\n${params.join(',\n')}\n  )` : ''} ${iname} (\n${conns.join(',\n')}\n  );`);
  }

  // ---------------- declarations
  // the value a signal starts with: what the initial blocks left in it, else its declared initial
  // value; none for the outputs of primitives (the primitive gives them their value). A VHDL
  // signal of an enumeration type (a state machine's state) or a boolean starts at its type's
  // first value (T'left, the VHDL default initial value) when it declares none: written too, so that the
  // netlist powers up in that state, as the RTL and XST do (Yosys keeps a register with an initial
  // value out of its FSM re-encoding, which could otherwise start it in another state)
  // (a signal starts at its declared value, or at the default its type gives it in simulation when
  // that is known: T'left of a VHDL integer, an enumeration or a boolean, '0' of a bit, a port's
  // default value (#60); an unknown start (std_logic 'U', Verilog x) gets no initial value)
  const startVal = sg => (primDriven.has(sg) ? undefined : initVal.has(sg) ? initVal.get(sg)
    : sg.hasInit || sg.t?.kind === 'enum' || sg.t?.kind === 'bool' || sg.t?.kind === 'int' || sg.t?.kind === 'logic' ? sg.init : undefined);
  const allX = v => !v || v.w <= 0 || v.x === (1n << BigInt(v.w)) - 1n;
  const initOf = (sg, w) => {
    let v = startVal(sg);
    if (Array.isArray(v) && isRec(sg.t)) v = packVal(v, sg.t);   // (a record: its fields packed)
    return v && !Array.isArray(v) && v.str === undefined && !allX(v) ? ` = ${lit(V.resize(v, w), w)}` : '';
  };
  const portDecl = [];
  for (const p of top.ports) {
    const s = p.sig, w = wOf(s.t);
    if (nullVec(s.t)) continue;   // (a port of no bit: not a port of the netlist)
    portDecl.push(`  ${p.dir === 'in' ? 'input' : p.dir === 'out' ? 'output' : 'inout'} ${p.dir === 'in' ? 'wire' : 'logic'} ${sgn(s.t) ? 'signed ' : ''}${w > 1 || !s.t.scalar ? `[${w - 1}:0] ` : ''}${sigName.get(s)}${p.dir === 'in' ? '' : initOf(s, w)}`);
  }
  for (const s of design.signals) {
    if (portOf.has(s) || skipSig.has(s) || nullVec(s.t)) continue;
    const t = s.t, name = sigName.get(s);
    if (isMem(t) || (Array.isArray(s.val) && !isRec(t))) {
      const et = t.elem || { w: s.val[0]?.w || 1 };
      const len = Array.isArray(s.init) ? s.init.length : (t.len ?? s.val.length);
      decls.push(`  logic ${et.s ? 'signed ' : ''}[${wOf(et) - 1}:0] ${name} [0:${len - 1}];`);
      const v0 = startVal(s);
      if (Array.isArray(v0)) {
        const set = v0.map((v, k) => { const pv = packVal(v, et); return allX(pv) ? null : `    ${name}[${k}] = ${lit(pv, wOf(et))};`; }).filter(Boolean);
        if (set.length) blocks.push(`  initial begin\n${set.join('\n')}\n  end`);
      }
      continue;
    }
    if (t.kind === 'real' || t.kind === 'str' || t.kind === 'time') { warnings.push(`signal ${s.path}: ${t.kind} signals are not synthesized`); continue; }
    const w = wOf(t);
    // a signal nothing drives keeps its initial value: a constant (wire x = v), not only an initial
    // value (an input port of an instance left unconnected, with its default value)
    const iv = initOf(s, w), konst = iv && !drivers.has(s) && !primDriven.has(s);
    decls.push(`  ${konst ? 'wire' : 'logic'} ${sgn(t) ? 'signed ' : ''}[${w - 1}:0] ${name}${iv};`);
  }
  setShiftMems(findShiftMems(design));
  for (const p of design.procs) if (!skipProc.has(p) && p.mode !== 'initial' && p.mode !== 'loop') process(p);
  for (const pr of prims) instance(pr);
  for (const [sg, m] of wiredDrv) {
    const w = wOf(sg.t);
    for (const nm of m.values()) decls.push(`  logic [${w - 1}:0] ${nm};`);
    blocks.push(`  // ${sg.path}: wired-${sg.wired} of its drivers\n  assign ${sigName.get(sg)} = ${[...m.values()].join(sg.wired === 'and' ? ' & ' : ' | ')};`);
  }

  const mod = esc(name || top.name);
  const text = `// Generated by Silinx (core/synth-verilog.js) from the design '${top.name}': one flat module for synthesis.\n`
    + `module ${mod} (\n${portDecl.join(',\n')}\n);\n${decls.join('\n')}\n${funcs.join('\n')}${funcs.length ? '\n' : ''}${blocks.join('\n')}\nendmodule\n`;
  // the shift-chain arrays read at a variable tap (#5): their names as Yosys writes them (\name)
  const shiftArrays = [...tapWires.keys()].map(sg => { const n = sigName.get(sg); return n.startsWith('\\') ? n.trim() : `\\${n}`; });
  return { text, top: mod.trim(), warnings, shiftArrays, instances, primitives: [...new Set(prims.map(pr => (cellOf(pr.inst)?.name || pr.inst.module.toUpperCase())))] };
}

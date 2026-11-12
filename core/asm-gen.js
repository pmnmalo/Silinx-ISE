// Silinx - the HDL generators of an ASM chart (#405: out of asm.js): the chart's VHDL and Verilog (the state register
// and its encoding, the next-state and output logic, registered outputs and registers, every-cycle blocks), with the
// header that lets core/asm-from-hdl.js recover the chart's spelling. Isomorphic ES module: no DOM and no Node APIs.
// asm.js re-exports these functions.
import { MAX_PATHS, analyze, bits, buildIndex, flatten, joinPoints, normalizeModel, pad, pathCount, treeSize, stateEncoding, stripParens, validate, vhAssign, vhBool, vhExpr, vhLitW, vhNot, vhTruth, vlAssign, vlExpr, vlLitW, vlNot, walkAlways } from './asm.js';

// ---------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------

function prepare(model) {
  const a = analyze(model);
  const errors = a.diags.filter((d) => d.severity === 'error');
  if (errors.length) {
    const e = new Error(`ASM chart '${a.m.name}' has ${errors.length} error(s):\n` + errors.map((d) => `  - ${d.message}`).join('\n'));
    e.diagnostics = a.diags;
    throw e;
  }
  a.enc = stateEncoding(a.m);
  a.encById = new Map(a.enc.map((s) => [s.id, s]));
  return a;
}

// Statement trees -> language-neutral statement lists
function nextStmts(tree, B) {
  switch (tree.k) {
    case 'goto': return [{ s: 'raw', text: B.setState(`S_${tree.name}`) }];
    case 'act': return nextStmts(tree.next, B);
    case 'if': {
      const t = nextStmts(tree.t, B), f = nextStmts(tree.f, B);
      if (JSON.stringify(t) === JSON.stringify(f)) return t;
      return [{ s: 'if', cond: B.cond(tree.node.id), then: t, else: f }];
    }
    case 'case': return B.caseStmt(tree.node.id, tree.branches.map((b) => nextStmts(b.sub, B)), true);
  }
  return [];
}
function outStmts(tree, B) {
  switch (tree.k) {
    case 'act': return [...B.actions(tree.node.id), ...outStmts(tree.next, B)];
    case 'if': {
      const t = outStmts(tree.t, B), f = outStmts(tree.f, B);
      if (!t.length && !f.length) return [];
      if (JSON.stringify(t) === JSON.stringify(f)) return t;
      if (!t.length) return [{ s: 'if', cond: B.not(B.cond(tree.node.id)), then: f, else: [] }];
      return [{ s: 'if', cond: B.cond(tree.node.id), then: t, else: f }];
    }
    case 'case': return B.caseStmt(tree.node.id, tree.branches.map((b) => outStmts(b.sub, B)), false);
  }
  return [];
}

// A state's statements (next: the next-state logic's, else the output logic's): its tree's, each decision's branches
// written in full to the state they reach, when the tree is small; past GEN_LIMIT boxes of it (a chain of decisions
// whose branches meet again: they double at each), the branches stop where they meet again and the boxes after are
// written once, after them (#3554), GEN_MAX statements at most.
const GEN_LIMIT = 1024, GEN_MAX = 200000;
// the header lists the paths of a block of HEADER_PATHS at most
const HEADER_PATHS = 256;
function stateStmts(a, s, B, next) {
  const tree = a.trees.get(s.id);
  if (treeSize(tree) <= GEN_LIMIT) return next ? nextStmts(tree, B) : outStmts(tree, B);
  const idx = a.idx, join = (a.join ??= joinPoints(idx));
  let budget = GEN_MAX;
  const emit = (out, ...st) => {
    if ((budget -= st.length) < 0) throw new Error(`State '${s.name}': its logic takes more than ${GEN_MAX} statements, too many to generate`);
    out.push(...st);
  };
  const seq = (id, stop) => {
    const out = [];
    while (id != null && id !== stop) {
      const n = idx.nodes.get(id), ex = idx.exits.get(id) || {};
      if (n.type === 'state') { if (next) emit(out, { s: 'raw', text: B.setState(`S_${n.name}`) }); break; }
      if (n.type === 'decision') {
        const j = join(id), t = seq(ex.true.to, j), f = seq(ex.false.to, j);
        if (JSON.stringify(t) === JSON.stringify(f)) emit(out, ...t);
        else if (!next && !t.length) emit(out, { s: 'if', cond: B.not(B.cond(id)), then: f, else: [] });
        else emit(out, { s: 'if', cond: B.cond(id), then: t, else: f });
        id = j;
      } else if (n.type === 'case') {
        const j = join(id);
        emit(out, ...B.caseStmt(id, (idx.cases.get(id) || []).map((e) => seq(e.to, j)), next));
        id = j;
      } else {
        if (!next) emit(out, ...B.actions(id));
        id = ex.next?.to ?? null;
      }
    }
    return out;
  };
  return seq(idx.exits.get(s.id)?.next?.to ?? null, null);
}

function printStmts(stmts, ind, lang, out) {
  const I = '    '.repeat(ind);
  for (const st of stmts) {
    if (st.s === 'raw') { out.push(I + st.text); continue; }
    if (st.s === 'case') {
      const arms = [...st.items.map((it) => [lang === 'vhdl' ? it.choices.join(' | ') : it.choices.join(', '), it.body]),
        ...(st.others ? [[lang === 'vhdl' ? 'others' : 'default', st.others]] : [])];
      if (lang === 'vhdl') {
        out.push(`${I}case ${st.expr} is`);
        for (const [ch, body] of arms) {
          out.push(`${I}    when ${ch} =>`);
          if (body.length) printStmts(body, ind + 2, lang, out); else out.push(`${I}        null;`);
        }
        out.push(`${I}end case;`);
      } else {
        out.push(`${I}case (${st.expr})`);
        for (const [ch, body] of arms) {
          if (!body.length) { out.push(`${I}    ${ch}: ;`); continue; }
          if (body.length === 1 && body[0].s === 'raw') { out.push(`${I}    ${ch}: ${body[0].text}`); continue; }
          out.push(`${I}    ${ch}: begin`);
          printStmts(body, ind + 2, lang, out);
          out.push(`${I}    end`);
        }
        out.push(`${I}endcase`);
      }
      continue;
    }
    if (lang === 'vhdl') {
      out.push(`${I}if ${st.cond} then`);
      printStmts(st.then, ind + 1, lang, out);
      let els = st.else;
      while (els.length === 1 && els[0].s === 'if') {
        out.push(`${I}elsif ${els[0].cond} then`);
        printStmts(els[0].then, ind + 1, lang, out);
        els = els[0].else;
      }
      if (els.length) { out.push(`${I}else`); printStmts(els, ind + 1, lang, out); }
      out.push(`${I}end if;`);
    } else {
      out.push(`${I}if (${st.cond}) begin`);
      printStmts(st.then, ind + 1, lang, out);
      let els = st.else;
      while (els.length === 1 && els[0].s === 'if') {
        out.push(`${I}end else if (${els[0].cond}) begin`);
        printStmts(els[0].then, ind + 1, lang, out);
        els = els[0].else;
      }
      if (els.length) { out.push(`${I}end else begin`); printStmts(els, ind + 1, lang, out); }
      out.push(`${I}end`);
    }
  }
  return out;
}

/** Paths of an every-cycle block: [{ conditions: [{ nodeId, cond, value }], actions: [{ nodeId, action }] }]. Throws past
 *  MAX_PATHS of them. */
function flattenAlways(tree) {
  const n = pathCount(tree);
  if (n > MAX_PATHS) throw new Error(`${n} paths through the decisions, more than ${MAX_PATHS} to list`);
  return flattenAlwaysInto(tree);
}
function flattenAlwaysInto(tree, conds = [], acts = [], out = []) {
  switch (tree.k) {
    case 'if':
      flattenAlwaysInto(tree.t, [...conds, { nodeId: tree.node.id, cond: tree.node.cond, value: true }], acts, out);
      flattenAlwaysInto(tree.f, [...conds, { nodeId: tree.node.id, cond: tree.node.cond, value: false }], acts, out);
      break;
    case 'act':
      flattenAlwaysInto(tree.next, conds, [...acts, ...tree.node.actions.map((a) => ({ nodeId: tree.node.id, action: a }))], out);
      break;
    case 'end':
      out.push({ conditions: conds, actions: acts });
      break;
    default: break; // errors (reported by validate)
  }
  return out;
}

/** Every-cycle blocks: [{ id, name, actions, paths: [{ conditions, actions }] }] (chart order). */
export function extractAlwaysBlocks(model) {
  const m = normalizeModel(model);
  const idx = buildIndex(m);
  const paths = (n) => {
    try { return flattenAlways(walkAlways(idx, n)); } catch (e) { throw new Error(`Every-cycle block '${n.name}': ${e.message}`); }
  };
  return m.nodes.filter((n) => n.type === 'always').map((n) => ({ id: n.id, name: n.name, actions: [...n.actions], paths: paths(n) }));
}

/** Join point (where both branches meet again) of each decision of the every-cycle blocks: (id) => id | null. */
export function asmJoinPoints(model) {
  return joinPoints(buildIndex(normalizeModel(model)));
}

/** Statements of an every-cycle block: header actions, then its boxes, joined branches emitted once. */
function alwaysStmts(a, header, B, join) {
  const idx = a.idx;
  const seq = (id, stop) => {
    const out = [];
    for (let guard = 0; id != null && id !== stop && guard < 10000; guard++) {
      const n = idx.nodes.get(id);
      if (!n || n.type === 'state' || n.type === 'always') break;
      const ex = idx.exits.get(id) || {};
      if (n.type === 'decision') {
        const j = join(id);
        const t = seq(ex.true?.to ?? null, j), f = seq(ex.false?.to ?? null, j);
        if (t.length) out.push({ s: 'if', cond: B.cond(id), then: t, else: f });
        else if (f.length) out.push({ s: 'if', cond: B.not(B.cond(id)), then: f, else: [] });
        id = j;
      } else {
        out.push(...B.actions(id));
        id = ex.next?.to ?? null;
      }
    }
    return out;
  };
  const ex = idx.exits.get(header.id) || {};
  return [...B.actions(header.id), ...seq(ex.next?.to ?? null, null)];
}

const condText = (conditions) => {
  const simple = (x) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x.cond.trim());
  return conditions.length
    ? conditions.map((x) => (simple(x) ? `${x.value ? '' : '!'}${x.cond.trim()}` : `${x.value ? '' : '!'}(${x.cond.trim()})`)).join(' && ')
    : 'always';
};

function headerLines(a, lang) {
  const { m, enc } = a;
  const c = lang === 'vhdl' ? '--' : '//';
  const rule = c + '='.repeat(78);
  const L = [];
  L.push(rule);
  L.push(`${c} ${lang === 'vhdl' ? 'Entity' : 'Module'}      : ${m.name}`);
  L.push(`${c} Description : ${a.alwaysNodes.length || a.registers.length ? 'controller (state machine + data path)' : 'finite state machine'} generated from the ASM chart ${m.name}.asm.json`);
  if (m.description) for (const line of m.description.split(/\r?\n/)) L.push(`${c}               ${line}`.trimEnd());
  L.push(`${c} Generator   : Silinx ASM editor (edit the chart, not this file).`);
  L.push(`${c} Style       : state register + next-state logic + output logic (latch-free)`);
  L.push(`${c} Clock       : ${m.clock} (rising edge)`);
  L.push(`${c} Reset       : ${m.reset.name}, active-${m.reset.active}, ${m.reset.sync ? 'synchronous' : 'asynchronous'}`);
  L.push(`${c} Encoding    : ${m.encoding}${m.encoding === 'enum' ? '' : ` (${enc[0]?.width ?? 0} state bit${enc[0]?.width === 1 ? '' : 's'})`}`);
  if (a.generics.length) L.push(`${c} Generics    : ${a.generics.map((g) => `${g.name} = ${g.default}`).join(', ')}`);
  const synced = m.inputs.filter((i) => i.sync);
  if (synced.length) L.push(`${c} Synchronised: ${synced.map((i) => i.name).join(', ')} (2 flip-flops each, <input>_meta and <input>_sync)`);
  L.push(c);
  L.push(`${c} States:`);
  const nw = Math.max(...enc.map((s) => s.name.length), ...a.alwaysNodes.map((n) => n.name.length), 4);
  for (const s of enc) {
    const node = a.idx.nodes.get(s.id);
    const code = m.encoding === 'enum' && lang === 'vhdl' ? '' : ` = ${s.bits}`;
    const moore = node.actions.length ? `  Moore: ${node.actions.join(', ')}` : '';
    L.push(`${c}   ${pad(s.name, nw)}${code}${s.id === m.initial ? '  (reset)' : '         '}${moore}`.trimEnd());
  }
  L.push(c);
  L.push(`${c} Transitions (condition -> next state [Mealy outputs]):`);
  // (a block of more paths than HEADER_PATHS has its number of paths, #3554)
  const tooMany = (what, n) => L.push(`${c}   (${what}: ${n} paths through its decisions, too many to list)`);
  for (const s of enc) {
    const paths = pathCount(a.trees.get(s.id));
    if (paths > HEADER_PATHS) { tooMany(`state ${s.name}`, paths); continue; }
    const ts = flatten(a.trees.get(s.id));
    for (const t of ts) {
      const mealy = t.mealyActions.length ? `  [${t.mealyActions.map((x) => x.action).join(', ')}]` : '';
      L.push(`${c}   ${pad(s.name, nw)} : ${condText(t.conditions)} -> ${t.nextName}${mealy}`);
    }
  }
  if (a.alwaysNodes.length) {
    L.push(c);
    L.push(`${c} Every cycle (in parallel with the states; the state's assignments take priority):`);
    for (const n of a.alwaysNodes) {
      if (n.actions.length) L.push(`${c}   ${pad(n.name, nw)}  Actions: ${n.actions.join(', ')}`);
      const paths = pathCount(a.alwaysTrees.get(n.id));
      if (paths > HEADER_PATHS) { tooMany(`every cycle ${n.name}`, paths); continue; }
      for (const p of flattenAlways(a.alwaysTrees.get(n.id))) {
        if (!p.conditions.length && !p.actions.length) continue;
        L.push(`${c}   ${pad(n.name, nw)} : ${condText(p.conditions)}${p.actions.length ? `  [${p.actions.map((x) => x.action).join(', ')}]` : ''}`);
      }
    }
  }
  const regs = m.outputs.filter((o) => o.registered);
  if (regs.length) {
    L.push(c);
    L.push(`${c} Registered outputs (${regs.map((o) => o.name).join(', ')}) load the value assigned in the`);
    L.push(`${c} current state/path at the clock edge and hold it otherwise.`);
  }
  if (a.registers.length) {
    L.push(c);
    L.push(`${c} Registers (internal; load the value assigned in this cycle at the clock edge, hold otherwise):`);
    const rw = Math.max(...a.registers.map((r) => r.name.length));
    for (const r of a.registers) L.push(`${c}   ${pad(r.name, rw)} : ${r.width} bit${r.width === 1 ? '' : 's'}, reset ${r.init}`);
  }
  L.push(rule);
  return L;
}

function makeBackend(a, lang) {
  const condCache = new Map();
  const reads = new Set();
  const ctxFor = () => ({
    reads,
    lookup: (name) => a.syms.get(name) || null,
    peek: (name) => a.syms.get(name) || null,
    error() {}, warn() {},
  });
  const sigOf = (name) => a.syms.get(name).next;
  return {
    reads,
    setState: (cn) => (lang === 'vhdl' ? `state_next <= ${cn};` : `state_next = ${cn};`),
    cond(id) {
      if (!condCache.has(id)) {
        const ast = a.parsedConds.get(id);
        const code = lang === 'vhdl' ? stripParens(vhBool(vhTruth(ast, ctxFor()))) : stripParens(vlExpr(ast, ctxFor()));
        condCache.set(id, code);
      }
      // re-register reads for this use (cache shares the same reads set anyway)
      return condCache.get(id);
    },
    not: (c) => (lang === 'vhdl' ? vhNot(c) : vlNot(c)),
    /**
     * Case statement of a case box; bodies[i] belongs to its i-th exit. `full`: the bodies are
     * complete (next-state logic), so arms equal to the others arm can be merged into it.
     */
    caseStmt(id, bodies, full) {
      const pc = a.parsedCases.get(id);
      const key = (b) => JSON.stringify(b);
      let others = null;
      const items = [];
      pc.branches.forEach((br, i) => {
        if (br.others) others = bodies[i];
        else items.push({ values: br.values, body: bodies[i] });
      });
      if (!items.length) return others || [];
      if (!full && !items.some((it) => it.body.length) && !(others && others.length)) return [];
      const all = [...items.map((it) => key(it.body)), ...(others ? [key(others)] : [])];
      if (all.every((k) => k === all[0])) return items[0].body;
      const w = pc.width;
      const ctx = ctxFor();
      const lit = (v) => (lang === 'vhdl' ? (w === 1 ? `'${v}'` : `"${bits(v, w)}"`) : `${w}'b${bits(v, w)}`);
      let expr;
      if (lang === 'vhdl') {
        const x = vhExpr(pc.ast, ctx);
        // a VHDL case needs a locally static subtype: slices are tested with if/elsif
        if (pc.ast.k === 'sel' && w > 1) {
          let chain = others || [];
          for (let i = items.length - 1; i >= 0; i--) {
            const cond = items[i].values.map((v) => `${x.c} = ${lit(v)}`).join(' or ');
            chain = [{ s: 'if', cond, then: items[i].body, else: chain }];
          }
          return chain;
        }
        expr = x.c;
      } else expr = stripParens(vlExpr(pc.ast, ctx));
      // arms that do the same as the others arm are left to it
      const ok = others ? items.filter((it) => key(it.body) !== key(others)) : items;
      return [{ s: 'case', expr, items: ok.map((it) => ({ choices: it.values.map(lit), body: it.body })), others: others || [] }];
    },
    actions(id) {
      const out = [];
      for (const act of a.parsedActions.get(id) || []) {
        const s = a.syms.get(act.target);
        out.push(...(lang === 'vhdl' ? vhAssign(sigOf(act.target), s.width, act.ast, ctxFor()) : vlAssign(sigOf(act.target), s.width, act.ast, ctxFor())));
      }
      return out;
    },
  };
}

function orderedReads(a, set) {
  const order = [];
  for (const i of a.m.inputs) { const s = i.sync ? `${i.name}_sync` : i.name; if (set.has(s)) order.push(s); }
  for (const o of a.m.outputs) if (o.registered && set.has(`${o.name}_reg`)) order.push(`${o.name}_reg`);
  for (const r of a.registers) if (set.has(r.name)) order.push(r.name);
  return order;
}

/** Statements of the output logic after the defaults: every-cycle blocks, then the states. */
function outputBody(a, B, lang) {
  const join = joinPoints(a.idx);
  const pre = [];
  const com = lang === 'vhdl' ? '--' : '//';
  for (const n of a.alwaysNodes) {
    pre.push({ s: 'raw', text: `${com} every cycle: ${n.name}` });
    pre.push(...alwaysStmts(a, n, B, join));
  }
  const items = [];
  for (const s of a.enc) {
    const st = [...B.actions(s.id), ...stateStmts(a, s, B, false)];
    if (st.length) items.push([s, st]);
  }
  return { pre, items };
}

/** Clocked statements: [reset, load] lines of every register (state, outputs, registers, synchronisers). */
function registerLines(a, lang) {
  const { m, enc } = a;
  const as = lang === 'vhdl' ? '<=' : '<=';
  const lit = (v, w) => (lang === 'vhdl' ? vhLitW(v, w) : vlLitW(v, w, 'd'));
  const regs = m.outputs.filter((o) => o.registered);
  const reset = [`state_reg ${as} ${enc[0].constName};`,
    ...regs.map((o) => `${o.name}_reg ${as} ${lit(a.defaults.get(o.name), o.width)};`),
    ...a.registers.map((r) => `${r.name} ${as} ${lit(a.defaults.get(r.name), r.width)};`)];
  const load = ['state_reg <= state_next;', ...regs.map((o) => `${o.name}_reg <= ${o.name}_next;`),
    ...a.registers.map((r) => `${r.name} <= ${r.name}_next;`)];
  for (const i of m.inputs.filter((x) => x.sync)) {
    reset.push(`${i.name}_meta ${as} ${lit(0n, i.width)};`, `${i.name}_sync ${as} ${lit(0n, i.width)};`);
    load.push(`${i.name}_meta <= ${i.name};`, `${i.name}_sync <= ${i.name}_meta;`);
  }
  return { reset, load };
}

/** Generate a synthesizable Verilog-2001 module. Throws if the chart has errors. */
export function generateVerilog(model) {
  const a = prepare(model);
  const { m, enc } = a;
  const W = enc[0].width;
  const rst = m.reset.name;
  const rstActive = m.reset.active === 'high' ? rst : `!${rst}`;
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const L = headerLines(a, 'verilog');
  L.push('');
  if (a.generics.length) {
    L.push(`module ${m.name} #(`);
    const gw = Math.max(...a.generics.map((g) => g.name.length));
    a.generics.forEach((g, i) => L.push(`    parameter ${pad(g.name, gw)} = ${g.default}${i < a.generics.length - 1 ? ',' : ''}`));
    L.push(') (');
  } else L.push(`module ${m.name} (`);
  const portLines = [];
  const vw = Math.max(0, ...[...m.inputs, ...m.outputs].map((p) => vec(p.width).length));
  portLines.push(`    input  wire ${pad('', vw)}${m.clock}`);
  portLines.push(`    input  wire ${pad('', vw)}${rst}`);
  for (const p of m.inputs) portLines.push(`    input  wire ${pad(vec(p.width), vw)}${p.name}`);
  for (const p of m.outputs) portLines.push(`    output ${p.registered ? 'wire' : 'reg '} ${pad(vec(p.width), vw)}${p.name}`);
  L.push(portLines.map((l, i) => l + (i < portLines.length - 1 ? ',' : '')).join('\n'));
  L.push(');');
  L.push('');
  L.push('    // ---------------------------------------------------------------- state encoding');
  const cw = Math.max(...enc.map((s) => s.constName.length));
  for (const s of enc) L.push(`    localparam ${vec(W)}${pad(s.constName, cw)} = ${W}'b${s.bits};`);
  L.push('');
  // initial values = reset values: the FPGA powers up as after a reset (XST uses them as INIT)
  L.push(`    reg ${vec(W)}state_reg = ${enc[0].constName};`);
  if (m.encoding !== 'enum') L.push('    // synthesis attribute fsm_encoding of state_reg is user');
  L.push(`    reg ${vec(W)}state_next;`);
  const regs = m.outputs.filter((o) => o.registered);
  if (regs.length) {
    L.push('');
    L.push('    // ---------------------------------------------------------------- output registers');
    for (const o of regs) L.push(`    reg ${vec(o.width)}${o.name}_reg = ${vlLitW(a.defaults.get(o.name), o.width, 'd')}, ${o.name}_next;`);
    for (const o of regs) L.push(`    assign ${o.name} = ${o.name}_reg;`);
  }
  if (a.registers.length) {
    L.push('');
    L.push('    // ---------------------------------------------------------------- internal registers');
    for (const r of a.registers) L.push(`    reg ${vec(r.width)}${r.name} = ${vlLitW(a.defaults.get(r.name), r.width, 'd')}, ${r.name}_next;`);
  }
  const synced = m.inputs.filter((i) => i.sync);
  if (synced.length) {
    L.push('');
    L.push('    // ---------------------------------------------------------------- input synchronisers (2 flip-flops)');
    for (const i of synced) L.push(`    reg ${vec(i.width)}${i.name}_meta = ${vlLitW(0n, i.width, 'd')}, ${i.name}_sync = ${vlLitW(0n, i.width, 'd')};`);
  }
  // state register (and the other registers)
  const extra = a.registers.length || synced.length;
  const R = registerLines(a, 'verilog');
  L.push('');
  L.push(`    // ---------------------------------------------------------------- ${extra ? 'registers' : 'state register'}`);
  const edge = m.reset.sync ? `posedge ${m.clock}` : `posedge ${m.clock} or ${m.reset.active === 'high' ? 'posedge' : 'negedge'} ${rst}`;
  L.push(`    always @(${edge}) begin`);
  L.push(`        if (${rstActive}) begin`);
  for (const l of R.reset) L.push(`            ${l}`);
  L.push('        end else begin');
  for (const l of R.load) L.push(`            ${l}`);
  L.push('        end');
  L.push('    end');

  // next-state logic
  const B = makeBackend(a, 'verilog');
  L.push('');
  L.push('    // ---------------------------------------------------------------- next-state logic');
  L.push('    always @(*) begin');
  L.push('        state_next = state_reg;');
  L.push('        case (state_reg)');
  for (const s of enc) {
    const st = stateStmts(a, s, B, true);
    if (st.length === 1 && st[0].s === 'raw') { L.push(`            ${s.constName}: ${st[0].text}`); continue; }
    L.push(`            ${s.constName}: begin`);
    printStmts(st, 4, 'verilog', L);
    L.push('            end');
  }
  L.push(`            default: state_next = ${enc[0].constName};`);
  L.push('        endcase');
  L.push('    end');

  // output logic
  if (m.outputs.length || a.registers.length) {
    L.push('');
    L.push(`    // ---------------------------------------------------------------- output ${a.registers.length ? 'and register ' : ''}logic`);
    L.push('    always @(*) begin');
    L.push('        // default values (every output is assigned on every path: no latches)');
    for (const o of m.outputs) {
      if (o.registered) L.push(`        ${o.name}_next = ${o.name}_reg;`);
      else L.push(`        ${o.name} = ${vlLitW(a.defaults.get(o.name), o.width, 'd')};`);
    }
    for (const r of a.registers) L.push(`        ${r.name}_next = ${r.name};`);
    const { pre, items } = outputBody(a, B, 'verilog');
    printStmts(pre, 2, 'verilog', L);
    if (items.length) {
      if (pre.length) L.push('        // state logic (takes priority over the every-cycle blocks)');
      L.push('        case (state_reg)');
      for (const [s, st] of items) {
        L.push(`            ${s.constName}: begin`);
        printStmts(st, 4, 'verilog', L);
        L.push('            end');
      }
      L.push('            default: ;');
      L.push('        endcase');
    }
    L.push('    end');
  }
  L.push('');
  L.push('endmodule');
  L.push('');
  return L.join('\n');
}

/** Generate a synthesizable VHDL-93 entity/architecture. Throws if the chart has errors. */
export function generateVhdl(model) {
  const a = prepare(model);
  const { m, enc } = a;
  const W = enc[0].width;
  const rst = m.reset.name;
  const typ = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const L = headerLines(a, 'vhdl');
  L.push('');
  L.push('library ieee;');
  L.push('use ieee.std_logic_1164.all;');
  L.push('use ieee.numeric_std.all;');
  L.push('');
  L.push(`entity ${m.name} is`);
  if (a.generics.length) {
    L.push('    generic (');
    const gw = Math.max(...a.generics.map((g) => g.name.length));
    a.generics.forEach((g, i) => L.push(`        ${pad(g.name, gw)} : integer := ${g.default}${i < a.generics.length - 1 ? ';' : ''}`));
    L.push('    );');
  }
  L.push('    port (');
  const ports = [[m.clock, 'in ', 'std_logic'], [rst, 'in ', 'std_logic'],
    ...m.inputs.map((p) => [p.name, 'in ', typ(p.width)]), ...m.outputs.map((p) => [p.name, 'out', typ(p.width)])];
  const pw = Math.max(...ports.map((p) => p[0].length));
  ports.forEach((p, i) => L.push(`        ${pad(p[0], pw)} : ${p[1]} ${p[2]}${i < ports.length - 1 ? ';' : ''}`));
  L.push('    );');
  L.push(`end entity ${m.name};`);
  L.push('');
  L.push(`architecture rtl of ${m.name} is`);
  L.push('');
  L.push('    -- state encoding');
  if (m.encoding === 'enum') {
    L.push(`    type state_t is (${enc.map((s) => s.constName).join(', ')});`);
  } else {
    L.push(`    subtype state_t is std_logic_vector(${W - 1} downto 0);`);
    const cw = Math.max(...enc.map((s) => s.constName.length));
    for (const s of enc) L.push(`    constant ${pad(s.constName, cw)} : state_t := "${s.bits}";`);
  }
  L.push('');
  // initial values = reset values: the FPGA powers up as after a reset (XST uses them as INIT)
  L.push(`    signal state_reg  : state_t := ${enc[0].constName};`);
  L.push('    signal state_next : state_t;');
  if (m.encoding !== 'enum') {
    L.push('');
    L.push('    attribute fsm_encoding : string;');
    L.push('    attribute fsm_encoding of state_reg : signal is "user";');
  }
  const regs = m.outputs.filter((o) => o.registered);
  if (regs.length) {
    L.push('');
    L.push('    -- output registers');
    for (const o of regs) L.push(`    signal ${o.name}_reg, ${o.name}_next : ${typ(o.width)} := ${vhLitW(a.defaults.get(o.name), o.width)};`);
  }
  if (a.registers.length) {
    L.push('');
    L.push('    -- internal registers');
    for (const r of a.registers) L.push(`    signal ${r.name}, ${r.name}_next : ${typ(r.width)} := ${vhLitW(a.defaults.get(r.name), r.width)};`);
  }
  const synced = m.inputs.filter((i) => i.sync);
  if (synced.length) {
    L.push('');
    L.push('    -- input synchronisers (2 flip-flops)');
    for (const i of synced) L.push(`    signal ${i.name}_meta, ${i.name}_sync : ${typ(i.width)} := ${vhLitW(0n, i.width)};`);
  }
  L.push('');
  L.push('begin');
  L.push('');
  // state register (and the other registers)
  const extra = a.registers.length || synced.length;
  const rstCond = `${rst} = '${m.reset.active === 'high' ? 1 : 0}'`;
  L.push(`    -- ------------------------------------------------------------------ ${extra ? 'registers' : 'state register'}`);
  const { reset: resetBody, load: loadBody } = registerLines(a, 'vhdl');
  if (m.reset.sync) {
    L.push(`    state_register : process (${m.clock})`);
    L.push('    begin');
    L.push(`        if rising_edge(${m.clock}) then`);
    L.push(`            if ${rstCond} then`);
    for (const l of resetBody) L.push(`                ${l}`);
    L.push('            else');
    for (const l of loadBody) L.push(`                ${l}`);
    L.push('            end if;');
    L.push('        end if;');
  } else {
    L.push(`    state_register : process (${m.clock}, ${rst})`);
    L.push('    begin');
    L.push(`        if ${rstCond} then`);
    for (const l of resetBody) L.push(`            ${l}`);
    L.push(`        elsif rising_edge(${m.clock}) then`);
    for (const l of loadBody) L.push(`            ${l}`);
    L.push('        end if;');
  }
  L.push('    end process state_register;');

  // next-state logic
  const Bn = makeBackend(a, 'vhdl');
  const body = [];
  for (const s of enc) {
    body.push(`            when ${s.constName} =>`);
    printStmts(stateStmts(a, s, Bn, true), 4, 'vhdl', body);
  }
  body.push('            when others =>');
  body.push(`                state_next <= ${enc[0].constName};`);
  L.push('');
  L.push('    -- ------------------------------------------------------------------ next-state logic');
  L.push(`    next_state_logic : process (${['state_reg', ...orderedReads(a, Bn.reads)].join(', ')})`);
  L.push('    begin');
  L.push('        state_next <= state_reg;');
  L.push('        case state_reg is');
  L.push(...body);
  L.push('        end case;');
  L.push('    end process next_state_logic;');

  // output logic
  if (m.outputs.length || a.registers.length) {
    const Bo = makeBackend(a, 'vhdl');
    const { pre, items } = outputBody(a, Bo, 'vhdl');
    for (const o of regs) Bo.reads.add(`${o.name}_reg`);
    for (const r of a.registers) Bo.reads.add(r.name);
    L.push('');
    L.push(`    -- ------------------------------------------------------------------ output ${a.registers.length ? 'and register ' : ''}logic`);
    L.push(`    output_logic : process (${['state_reg', ...orderedReads(a, Bo.reads)].join(', ')})`);
    L.push('    begin');
    L.push('        -- default values (every output is assigned on every path: no latches)');
    for (const o of m.outputs) {
      if (o.registered) L.push(`        ${o.name}_next <= ${o.name}_reg;`);
      else L.push(`        ${o.name} <= ${vhLitW(a.defaults.get(o.name), o.width)};`);
    }
    for (const r of a.registers) L.push(`        ${r.name}_next <= ${r.name};`);
    printStmts(pre, 2, 'vhdl', L);
    if (items.length) {
      if (pre.length) L.push('        -- state logic (takes priority over the every-cycle blocks)');
      L.push('        case state_reg is');
      for (const [s, st] of items) {
        L.push(`            when ${s.constName} =>`);
        printStmts(st, 4, 'vhdl', L);
      }
      L.push('            when others =>');
      L.push('                null;');
      L.push('        end case;');
    }
    L.push('    end process output_logic;');
  }
  if (regs.length) {
    L.push('');
    for (const o of regs) L.push(`    ${o.name} <= ${o.name}_reg;`);
  }
  L.push('');
  L.push('end architecture rtl;');
  L.push('');
  return L.join('\n');
}

/** Convenience: generate code for model.lang (or `lang`). Returns { lang, filename, code }. */
export function generate(model, lang) {
  const l = lang || (model && model.lang) || 'vhdl';
  const name = (model && model.name) || 'fsm';
  return l === 'verilog'
    ? { lang: 'verilog', filename: `${name}.v`, code: generateVerilog(model) }
    : { lang: 'vhdl', filename: `${name}.vhd`, code: generateVhdl(model) };
}

// Silinx FSM diagrams and ASM charts (#405: out of core/fsm.js): a diagram as an ASM chart (one decision box per
// condition, in priority order) and an ASM chart as a diagram (its paths from each state, their conditions and
// outputs), as the ASM editor and the diagram's conversions use them.
import { asmLayout } from './asm-from-hdl.js';
import { exprToString, normalizeModel as normalizeAsm, parseAction, parseCaseChoices } from './asm.js';
import {
  clone, condNames, constValue, evalCond, fsmKind, inputCombos, normalizeFsm, parseCond, placeNew, stateById,
  transitionsFrom
} from './fsm.js';
import { sortedOutputs } from './fsm-hdl.js';

// ---------------------------------------------------------------------------------------
// FSM <-> ASM chart
// ---------------------------------------------------------------------------------------

const actionsOf = (m, outs) => sortedOutputs(m, outs).map(([o, v]) => `${o.name} = ${v}`);

/** The ASM chart (core/asm.js model) of the diagram: one decision box per condition, in priority order. */
export function fsmToAsm(model) {
  const m = normalizeFsm(model);
  const nodes = [], edges = [];
  let k = 0;
  const id = (p) => `${p}${++k}`;
  for (const s of m.states) nodes.push({ id: s.id, type: 'state', name: s.name, x: 0, y: 0, actions: actionsOf(m, s.outputs) });
  for (const s of m.states) {
    let from = s.id, port = 'next';
    const link = (to) => edges.push({ id: id('e'), from, to, port });
    let ended = false;
    for (const t of transitionsFrom(m, s.id).filter((x) => stateById(m, x.to))) {
      const target = () => {
        const acts = actionsOf(m, t.outputs);
        if (!acts.length) return t.to;
        const o = id('o');
        nodes.push({ id: o, type: 'output', x: 0, y: 0, actions: acts });
        edges.push({ id: id('e'), from: o, to: t.to, port: 'next' });
        return o;
      };
      if (!t.cond) { link(target()); ended = true; break; }
      const d = id('d');
      nodes.push({ id: d, type: 'decision', x: 0, y: 0, cond: t.cond });
      link(d);
      from = d; port = 'true'; link(target());
      port = 'false';
    }
    if (!ended) link(s.id);   // nothing true: stay
  }
  const asm = normalizeAsm({
    version: 1, name: m.name, lang: m.lang, clock: m.clock, reset: m.reset, encoding: m.encoding,
    inputs: m.inputs.map((i) => ({ name: i.name, width: i.width })),
    outputs: m.outputs.map((o) => ({ name: o.name, width: o.width, default: o.default, registered: false })),
    nodes, edges, initial: m.initial, ...(m.description ? { description: m.description } : {}),
  });
  return asmLayout(asm);
}

/** Paths of the ASM block of a state: [{ conds: [{ ast, text, neg }], acts: ['z = 1'], to }] */
function asmPaths(asm, stateId) {
  const nodes = new Map(asm.nodes.map((n) => [n.id, n]));
  const exits = new Map();
  for (const e of asm.edges) { if (!exits.has(e.from)) exits.set(e.from, []); exits.get(e.from).push(e); }
  const widthOf = (name) => asm.inputs.find((i) => i.name === name)?.width ?? 1;
  const out = [];
  const walk = (id, conds, acts, depth) => {
    if (depth > 200) throw new Error('the chart has a loop without a state');
    const n = nodes.get(id);
    if (!n) throw new Error('the chart has an exit that leads nowhere');
    if (n.type === 'state') { out.push({ conds, acts, to: n.id }); return; }
    const ex = exits.get(id) || [];
    if (n.type === 'decision') {
      const p = parseCond(n.cond);
      if (p.error) throw new Error(`the condition '${n.cond}' is not valid (${p.error})`);
      for (const e of ex) {
        const neg = e.port === 'false';
        walk(e.to, [...conds, { ast: p.ast, text: n.cond, neg }], acts, depth + 1);
      }
      return;
    }
    if (n.type === 'case') {
      const p = parseCond(n.expr);
      if (p.error || !p.ast) throw new Error(`the case expression '${n.expr}' is not valid`);
      const w = p.ast.k === 'sel' ? p.ast.hi - p.ast.lo + 1 : widthOf(p.ast.name);
      const lit = (v) => ({ k: 'lit', v, w, base: 'b' });
      const all = ex.map((e) => parseCaseChoices(e.port, w));
      for (let i = 0; i < ex.length; i++) {
        const ch = all[i];
        let ast;
        if (ch.others) {
          const vals = all.filter((x) => x.values).flatMap((x) => x.values);
          ast = vals.length ? vals.map((v) => ({ k: 'bin', op: '!=', a: p.ast, b: lit(v) })).reduce((a, b) => ({ k: 'bin', op: '&&', a, b })) : null;
        } else ast = ch.values.map((v) => ({ k: 'bin', op: '==', a: p.ast, b: lit(v) })).reduce((a, b) => ({ k: 'bin', op: '||', a, b }));
        walk(ex[i].to, ast ? [...conds, { ast, text: exprToString(ast), neg: false }] : conds, acts, depth + 1);
      }
      return;
    }
    if (n.type === 'output') {
      const nx = ex.find((e) => e.port === 'next');
      if (!nx) throw new Error('a conditional output box has no exit');
      walk(nx.to, conds, [...acts, ...n.actions], depth + 1);
      return;
    }
    throw new Error(`a ${n.type} box cannot be part of a state diagram`);
  };
  const first = (exits.get(stateId) || []).find((e) => e.port === 'next');
  if (!first) return [];       // no exit: stays
  walk(first.to, [], [], 0);
  return out;
}

const atomic = (s) => /^!?[A-Za-z_][A-Za-z0-9_]*(\[\d+(:\d+)?\])?$/.test(s.trim());
const wrap = (s) => (atomic(s) ? s.trim() : `(${s.trim()})`);
/** A test of a 1-bit input against 0 / 1 written as x / !x. */
function simpleText(c, W) {
  const a = c.ast;
  let neg = c.neg;
  if (a && a.k === 'bin' && (a.op === '==' || a.op === '!=') && a.a.k === 'id' && W(a.a.name) === 1 && a.b.k === 'lit' && a.b.v <= 1n) {
    if ((a.b.v === 0n) !== (a.op === '!=')) neg = !neg;
    return { text: a.a.name, neg };
  }
  return { text: c.text, neg };
}
const condText = (conds, W = () => 0) => conds.map((c0) => {
  const c = simpleText(c0, W);
  return c.neg ? `!${wrap(c.text)}` : (conds.length > 1 ? wrap(c.text) : c.text.trim());
}).join(' && ');

/** Output assignments of ASM action texts: { name: value } or throws. */
function outputsOfActions(acts, m, prevOuts = {}) {
  const out = {};
  for (const a of acts) {
    const r = parseAction(a);
    if (r.error) throw new Error(`'${a}' is not an output assignment`);
    if (!m.outputs.some((o) => o.name === r.target)) throw new Error(`'${r.target}' is not an output`);
    if (r.ast.k !== 'lit') throw new Error(`the output ${r.target} gets the value ${exprToString(r.ast)}; a state diagram only gives outputs constant values`);
    const pv = prevOuts[r.target];
    out[r.target] = pv != null && constValue(pv) === r.ast.v ? pv : (r.ast.w == null ? r.ast.v.toString() : exprToString(r.ast));
  }
  return out;
}

/**
 * The diagram of an ASM chart (or of a chart read from HDL): conditions of the decision paths of
 * each state, conditional outputs as Mealy outputs. `previous`: an earlier diagram of the same
 * machine (positions, ids, spelling of conditions and the transitions of every state whose
 * behaviour did not change are kept). Throws if the chart is not a plain state machine.
 */
export function asmToFsm(asmModel, { previous = null } = {}) {
  const asm = normalizeAsm(asmModel);
  const why = [];
  if (asm.registers?.length) why.push(`it has internal registers (${asm.registers.map((r) => r.name).join(', ')})`);
  if (asm.generics?.length) why.push(`it has generics/parameters (${asm.generics.map((g) => g.name).join(', ')})`);
  if (asm.outputs.some((o) => o.registered)) why.push(`it has registered outputs (${asm.outputs.filter((o) => o.registered).map((o) => o.name).join(', ')})`);
  if (asm.inputs.some((i) => i.sync)) why.push('it synchronises inputs');
  if (asm.nodes.some((n) => n.type === 'always')) why.push('it has logic that runs on every cycle besides the states');
  if (why.length) throw new Error(`it is not a plain state machine: ${why.join('; ')}`);
  const prev = previous ? normalizeFsm(previous) : null;
  const pState = (name) => prev?.states.find((s) => s.name.toLowerCase() === name.toLowerCase());
  const m = normalizeFsm({
    name: prev && prev.name.toLowerCase() === asm.name.toLowerCase() ? prev.name : asm.name,
    lang: asm.lang, clock: asm.clock, reset: asm.reset, encoding: asm.encoding,
    style: prev?.style || '3process',
    inputs: asm.inputs.map((i) => ({ name: i.name, width: i.width })),
    outputs: asm.outputs.map((o) => {
      const po = prev?.outputs.find((x) => x.name === o.name);
      return { name: o.name, width: o.width, default: po && constValue(po.default) === constValue(o.default) ? po.default : o.default };
    }),
    states: [], transitions: [], initial: '',
    ...(asm.description || prev?.description ? { description: asm.description || prev.description } : {}),
  });
  const W = (n) => m.inputs.find((i) => i.name === n)?.width ?? 1;
  const asmStates = asm.nodes.filter((n) => n.type === 'state');
  // state ids: the previous diagram's, else the chart's
  const sid = new Map();
  const usedIds = new Set();
  for (const s of asmStates) {
    const ps = pState(s.name);
    let idv = ps && !usedIds.has(ps.id) ? ps.id : s.id;
    while (usedIds.has(idv)) idv = `${idv}_`;
    usedIds.add(idv);
    sid.set(s.id, idv);
  }
  for (const s of asmStates) {
    const ps = pState(s.name);
    m.states.push({ id: sid.get(s.id), name: ps ? ps.name : s.name, x: ps?.x ?? 0, y: ps?.y ?? 0, outputs: outputsOfActions(s.actions, m, ps?.outputs) });
  }
  m.initial = sid.get(asm.initial) || m.states[0]?.id || '';
  let tn = 0;
  const tUsed = new Set(prev ? prev.transitions.map((t) => t.id) : []);
  const newTid = () => { let x; do x = `t${++tn}`; while (tUsed.has(x)); tUsed.add(x); return x; };
  const outKey = (o) => JSON.stringify(Object.entries(o).map(([k, v]) => [k, String(constValue(v))]).sort());

  const order = new Map();
  for (const s of asmStates) {
    const me = sid.get(s.id);
    const ps = pState(s.name);
    const paths = asmPaths(asm, s.id).map((p) => ({ ...p, to: sid.get(p.to), outs: outputsOfActions(p.acts, m) }));
    // input combinations of this state's conditions (also those of the previous diagram)
    const prevTs = ps ? transitionsFrom(prev, ps.id).filter((t) => stateById(prev, t.to)) : [];
    // the list keeps the order of the previous diagram (a rebuilt state where its first transition was)
    const base = prevTs.length ? Math.min(...prevTs.map((t) => prev.transitions.indexOf(t))) : 1e9 + asmStates.indexOf(s);
    let k = 0;
    const push = (tr, key = base + (k++) * 1e-3) => { order.set(tr, key); m.transitions.push(tr); };
    const used = new Set();
    for (const p of paths) for (const c of p.conds) condNames(c.ast, used);
    const prevAsts = prevTs.map((t) => parseCond(t.cond));
    for (const p of prevAsts) if (!p.error) condNames(p.ast, used);
    for (const n of used) if (!m.inputs.some((i) => i.name === n)) used.delete(n);
    const { envs } = inputCombos(m, used, { maxBits: 14, samples: 3000 });
    const pathVal = (p, env) => p.conds.every((c) => evalCond(c.ast, env, W) !== c.neg);
    // behaviour: for each env, the (target, outputs) taken
    const read = envs.map((env) => { const p = paths.find((x) => pathVal(x, env)); return p ? `${p.to}|${outKey(p.outs)}` : `${me}|${outKey({})}`; });
    // 1. same behaviour as the previous diagram: keep its transitions as they are
    if (ps && prevAsts.every((p) => !p.error) && prevTs.every((t) => m.states.some((x) => x.id === t.to) && stateById(prev, t.to)?.name === m.states.find((x) => x.id === t.to)?.name)) {
      const prevBeh = envs.map((env) => {
        const i = prevAsts.findIndex((p) => evalCond(p.ast, env, W));
        return i < 0 ? `${me}|${outKey({})}` : `${prevTs[i].to}|${outKey(prevTs[i].outputs)}`;
      });
      if (prevBeh.every((b, i) => b === read[i])) {
        for (const t of prevTs) push(clone({ ...t, from: me }), prev.transitions.indexOf(t));
        continue;
      }
    }
    // 2. rebuild: one transition per (target, outputs), in the order of the paths; the stay
    //    without outputs is left implicit
    const groups = [];
    for (const p of paths) {
      const key = `${p.to}|${outKey(p.outs)}`;
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push(g = { key, to: p.to, outs: p.outs, paths: [] });
      g.paths.push(p);
    }
    const stayKey = `${me}|${outKey({})}`;
    const kept = groups.filter((g) => g.key !== stayKey);
    const covered = envs.map(() => false);
    for (const g of kept) {
      const fn = envs.map((env) => g.paths.some((p) => pathVal(p, env)));
      const valid = (text) => {
        const q = parseCond(text);
        if (q.error) return false;
        return envs.every((env, i) => covered[i] || (evalCond(q.ast, env, W) === fn[i]));
      };
      const cands = [];
      for (const t of prevTs) if (t.to === g.to && outKey(t.outputs) === outKey(g.outs)) cands.push(t.cond);
      const pos = g.paths.map((p) => p.conds.filter((c) => !c.neg));
      if (g.paths.length === 1) {
        if (pos[0].length) cands.push(condText(pos[0], W));
        cands.push(condText(g.paths[0].conds, W));
      } else {
        cands.push(pos.map((c) => (c.length ? wrap(condText(c, W)) : '1')).join(' || '));
        cands.push(g.paths.map((p) => (p.conds.length ? wrap(condText(p.conds, W)) : '1')).join(' || '));
      }
      let text = cands.find((x) => valid(x));
      if (text == null) text = cands[cands.length - 1];
      const pt = prevTs.find((t) => t.to === g.to);
      const tr = { id: pt && !m.transitions.some((x) => x.id === pt.id) ? pt.id : newTid(), from: me, to: g.to, cond: /^(1|true)$/i.test(text) ? '' : text, outputs: g.outs };
      if (pt?.bend != null) tr.bend = pt.bend;
      if (pt?.angle != null) tr.angle = pt.angle;
      push(tr);
      fn.forEach((v, i) => { if (v) covered[i] = true; });
    }
    // an explicit self-loop without outputs in the previous diagram stays explicit
    const stay = groups.find((g) => g.key === stayKey);
    const prevStay = prevTs.find((t) => t.to === me && !Object.keys(t.outputs).length);
    if (stay && prevStay) {
      const fn = envs.map((env) => stay.paths.some((p) => pathVal(p, env)));
      const q = parseCond(prevStay.cond);
      const ok = !q.error && envs.every((env, i) => covered[i] || evalCond(q.ast, env, W) === fn[i]);
      const pos = stay.paths.length === 1 ? stay.paths[0].conds.filter((c) => !c.neg) : [];
      const text = ok ? prevStay.cond : (pos.length ? condText(pos, W) : condText(stay.paths[0]?.conds || [], W));
      push({ id: m.transitions.some((x) => x.id === prevStay.id) ? newTid() : prevStay.id, from: me, to: me, cond: text, outputs: {}, ...(prevStay.angle != null ? { angle: prevStay.angle } : {}) });
    }
  }
  m.type = fsmKind(m);
  m.transitions = m.transitions.map((t, i) => [t, i]).sort((a, b) => order.get(a[0]) - order.get(b[0]) || a[1] - b[1]).map(([t]) => t);
  if (prev) {
    // the order of the previous diagram (new states last)
    const rank = (s) => { const i = prev.states.findIndex((p) => p.id === s.id); return i < 0 ? Infinity : i; };
    m.states = m.states.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
  }
  return placeNew(m, prev);
}

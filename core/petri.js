// Silinx - Petri nets (place / transition nets) as a source of a project: documents <name>.pn.json.
//
// The model: places (an initial number of tokens, a capacity, Moore outputs: the values they give
// while they hold a token), transitions (a guard: a condition on the inputs, a priority: their order,
// pulse outputs: 1 in the clock cycle after they fired), arcs place -> transition (with a weight: the
// tokens it takes; or an inhibitor arc: the transition is enabled only while the place holds fewer
// tokens than the weight) and transition -> place (the tokens it puts).
//
// Two ways to play it: the token game (fire one enabled transition, as in the textbooks) and the
// clock step, the hardware's semantics: on each clock edge every enabled transition whose guard is
// true fires, in priority order (a transition takes tokens only if they are still there after the
// higher-priority ones took theirs; the tokens put by the transitions arrive at the end of the step).
// generatePetri() makes that controller in VHDL / Verilog: one register per place (a counter when the
// place may hold more than one token), synchronous, with a reset to the initial marking.
// PNML (ISO/IEC 15909-2) import and export for the other Petri net tools.

import { portExprCoder, isIdentifier, reservedIn, reservedWarning } from './asm.js';
import { parseCond, evalCond, parseOutputs, constValue } from './fsm.js';
import { clone } from './util.js';

export const PETRI_VERSION = 1;
export const PLACE_R = 22;          // radius of a place (drawing units)
export const TRANS_W = 10, TRANS_H = 40;
const MAX_CAP = 255;
const arr = v => (Array.isArray(v) ? v : []);
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const bitsFor = n => Math.max(1, Math.ceil(Math.log2(n + 1)));

function normIo(list) {
  return arr(list).filter(p => p && p.name).map(p => ({ name: String(p.name), width: Math.max(1, Math.min(32, int(p.width, 1))) }));
}
function normOuts(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) if (k) out[k] = String(v ?? '1');
  return out;
}

/** A complete model from a document (missing fields filled in). */
export function normalizePetri(m) {
  const d = m && typeof m === 'object' ? m : {};
  const out = {
    kind: 'petri', version: PETRI_VERSION,
    name: String(d.name || 'petri_net'),
    lang: d.lang === 'verilog' ? 'verilog' : 'vhdl',
    description: String(d.description || ''),
    clock: String(d.clock || 'clk'),
    reset: { name: String(d.reset?.name || 'rst'), active: d.reset?.active === 'low' ? 'low' : 'high', sync: d.reset?.sync !== false },
    inputs: normIo(d.inputs),
    outputs: normIo(d.outputs),
    places: arr(d.places).filter(p => p && p.id).map(p => ({
      id: String(p.id), name: String(p.name || p.id), x: int(p.x, 100), y: int(p.y, 100),
      tokens: Math.max(0, int(p.tokens, 0)), capacity: Math.max(1, Math.min(MAX_CAP, int(p.capacity, 1))), outputs: normOuts(p.outputs),
    })),
    transitions: arr(d.transitions).filter(t => t && t.id).map(t => ({
      id: String(t.id), name: String(t.name || t.id), x: int(t.x, 200), y: int(t.y, 100),
      guard: String(t.guard || ''), outputs: normOuts(t.outputs),
    })),
    arcs: arr(d.arcs).filter(a => a && a.id && a.from && a.to).map(a => ({
      id: String(a.id), from: String(a.from), to: String(a.to), weight: Math.max(1, int(a.weight, 1)), ...(a.inhibitor ? { inhibitor: true } : {}),
    })),
  };
  if (d.generatedFile) out.generatedFile = String(d.generatedFile);
  return out;
}

/** A new net: two places, one transition between them, a token in the first. */
export function newPetri(name = 'petri_net', lang = 'vhdl') {
  return normalizePetri({
    name, lang,
    inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'busy', width: 1 }],
    places: [{ id: 'p1', name: 'idle', x: 120, y: 140, tokens: 1 }, { id: 'p2', name: 'work', x: 360, y: 140, outputs: { busy: '1' } }],
    transitions: [{ id: 't1', name: 'start', x: 240, y: 140, guard: 'go' }, { id: 't2', name: 'done', x: 240, y: 260, guard: '!go' }],
    arcs: [{ id: 'a1', from: 'p1', to: 't1' }, { id: 'a2', from: 't1', to: 'p2' }, { id: 'a3', from: 'p2', to: 't2' }, { id: 'a4', from: 't2', to: 'p1' }],
  });
}

const placeOf = (m, id) => m.places.find(p => p.id === id) || null;
const transOf = (m, id) => m.transitions.find(t => t.id === id) || null;
/** The arcs into / out of a transition: [{ place, weight, inhibitor }]. */
export function preset(m, tid) { return m.arcs.filter(a => a.to === tid && placeOf(m, a.from)).map(a => ({ place: a.from, weight: a.weight, inhibitor: !!a.inhibitor })); }
export function postset(m, tid) { return m.arcs.filter(a => a.from === tid && placeOf(m, a.to)).map(a => ({ place: a.to, weight: a.weight })); }

/** Errors and warnings: [{ severity, message, ref? }]. */
export function validatePetri(model) {
  const m = normalizePetri(model);
  const out = [];
  const add = (severity, message, ref) => out.push({ severity, message, ...(ref ? { ref } : {}) });
  const lang = m.lang;
  if (!isIdentifier(m.name) || reservedIn(m.name).length) add('error', `'${m.name}' is not a valid module name`);
  else if (reservedWarning(m.name)) add('warning', reservedWarning(m.name));
  const seen = new Map();
  // (places and transitions: prefixed in the HDL, pl_<name>, fired_<name>: any identifier, reserved words too)
  const name = (n, what, ref, prefixed = false) => {
    if (!isIdentifier(n) || (!prefixed && reservedIn(n).length)) { add('error', `${what} '${n}' is not a valid ${lang.toUpperCase()} name`, ref); return; }
    if (!prefixed && reservedWarning(n)) add('warning', reservedWarning(n), ref);
    const k = lang === 'vhdl' ? n.toLowerCase() : n;
    if (seen.has(k)) add('error', `'${n}' is used twice (${seen.get(k)} and ${what})`, ref); else seen.set(k, what);
  };
  name(m.clock, 'the clock'); name(m.reset.name, 'the reset');
  for (const p of m.inputs) name(p.name, 'input');
  for (const p of m.outputs) name(p.name, 'output');
  for (const p of m.places) {
    name(p.name, 'place', { kind: 'place', id: p.id }, true);
    if (p.tokens > p.capacity) add('error', `place ${p.name}: ${p.tokens} initial tokens, more than its capacity ${p.capacity}`, { kind: 'place', id: p.id });
  }
  for (const t of m.transitions) {
    name(t.name, 'transition', { kind: 'transition', id: t.id }, true);
    try { portExprCoder(m, lang).cond(t.guard || '1'); } catch (e) { add('error', `transition ${t.name}: guard '${t.guard}': ${e.message}`, { kind: 'transition', id: t.id }); }
    if (!preset(m, t.id).some(a => !a.inhibitor)) add('warning', `transition ${t.name} takes no token: it fires on every clock edge while its guard is true`, { kind: 'transition', id: t.id });
  }
  const outNames = new Set(m.outputs.map(o => o.name));
  for (const x of [...m.places, ...m.transitions]) for (const [o, v] of Object.entries(x.outputs)) {
    const ref = { kind: m.places.includes(x) ? 'place' : 'transition', id: x.id };
    if (!outNames.has(o)) add('error', `${x.name}: '${o}' is not an output of the net`, ref);
    else if (constValue(v) == null) add('error', `${x.name}: ${o} = ${v} is not a constant`, ref);
  }
  for (const a of m.arcs) {
    const p2t = placeOf(m, a.from) && transOf(m, a.to), t2p = transOf(m, a.from) && placeOf(m, a.to);
    if (!p2t && !t2p) add('error', 'an arc joins a place to a transition or a transition to a place', { kind: 'arc', id: a.id });
    if (a.inhibitor && !p2t) add('error', 'an inhibitor arc goes from a place to a transition', { kind: 'arc', id: a.id });
  }
  const unused = m.places.filter(p => !m.arcs.some(a => a.from === p.id || a.to === p.id));
  for (const p of unused) add('warning', `place ${p.name} is not connected`, { kind: 'place', id: p.id });
  return out;
}
export const petriErrors = m => validatePetri(m).filter(d => d.severity === 'error');

// ------------------------------------------------------------------ simulation
/** The initial marking: { placeId: tokens }. */
export const initialMarking = m => Object.fromEntries(normalizePetri(m).places.map(p => [p.id, p.tokens]));

const widthOfFn = m => n => (m.inputs.find(p => p.name === n) || m.outputs.find(p => p.name === n))?.width || 1;
function guardOk(m, t, env) {
  const r = parseCond(t.guard);
  if (r.error) return false;
  return evalCond(r.ast, env || {}, widthOfFn(m));
}
/** Is transition t enabled at a marking (tokens, inhibitors, the capacities of the places it fills; its guard with env)? */
export function isEnabled(model, marking, tid, env = null) {
  const m = normalizePetri(model);
  const t = transOf(m, tid);
  if (!t) return false;
  for (const a of preset(m, tid)) {
    const k = marking[a.place] || 0;
    if (a.inhibitor ? k >= a.weight : k < a.weight) return false;
  }
  for (const a of postset(m, tid)) {
    const back = preset(m, tid).filter(b => b.place === a.place && !b.inhibitor).reduce((s, b) => s + b.weight, 0);
    if ((marking[a.place] || 0) - back + a.weight > placeOf(m, a.place).capacity) return false;
  }
  return env == null || guardOk(m, t, env);
}
/** The enabled transitions (ids, in priority order). */
export function enabledTransitions(model, marking, env = null) {
  const m = normalizePetri(model);
  return m.transitions.filter(t => isEnabled(m, marking, t.id, env)).map(t => t.id);
}
/** The token game: fire one transition (it must be enabled): the new marking. */
export function fire(model, marking, tid) {
  const m = normalizePetri(model);
  const next = { ...marking };
  for (const a of preset(m, tid)) if (!a.inhibitor) next[a.place] = (next[a.place] || 0) - a.weight;
  for (const a of postset(m, tid)) next[a.place] = (next[a.place] || 0) + a.weight;
  return next;
}
/**
 * A clock step (the hardware): the enabled transitions whose guard is true fire, in priority order,
 * each one only if its tokens are still there; the tokens put arrive at the end.
 * { marking, fired: [ids] }.
 */
export function clockStep(model, marking, env = {}) {
  const m = normalizePetri(model);
  const cur = { ...marking }, add = {}, fired = [];
  for (const t of m.transitions) {
    if (!guardOk(m, t, env)) continue;
    const pre = preset(m, t.id);
    if (!pre.every(a => (a.inhibitor ? (marking[a.place] || 0) < a.weight : (cur[a.place] || 0) >= a.weight))) continue;
    // the capacities: what is there now, minus what it takes, plus what is put already, plus its own
    const post = postset(m, t.id);
    if (!post.every(a => (cur[a.place] || 0) - pre.filter(b => b.place === a.place && !b.inhibitor).reduce((s, b) => s + b.weight, 0) + (add[a.place] || 0) + a.weight <= placeOf(m, a.place).capacity)) continue;
    for (const a of pre) if (!a.inhibitor) cur[a.place] -= a.weight;
    for (const a of post) add[a.place] = (add[a.place] || 0) + a.weight;
    fired.push(t.id);
  }
  for (const [p, k] of Object.entries(add)) cur[p] = (cur[p] || 0) + k;
  return { marking: cur, fired };
}
/** No transition can fire (whatever the inputs): a deadlock. */
export const isDeadlock = (model, marking) => enabledTransitions(model, marking, null).length === 0;

/** The outputs at a marking (Moore, from the places that hold tokens) and after the fired transitions (pulses): { name: BigInt }. */
export function outputsOf(model, marking, fired = []) {
  const m = normalizePetri(model);
  const out = Object.fromEntries(m.outputs.map(o => [o.name, 0n]));
  const or = (o, v) => { if (o in out) out[o] |= BigInt(constValue(v) ?? 0n); };
  for (const p of m.places) if ((marking[p.id] || 0) > 0) for (const [o, v] of Object.entries(p.outputs)) or(o, v);
  for (const id of fired) for (const [o, v] of Object.entries(transOf(m, id)?.outputs || {})) or(o, v);
  return out;
}

// ------------------------------------------------------------------ HDL
/**
 * The synchronous controller of the net: { filename, code }. One register per place (std_logic /
 * a 1-bit reg when its capacity is 1, else a counter), reset to the initial marking; on each clock edge
 * the clock step above; the outputs: the OR of the values of the places that hold tokens (Moore) and
 * of the transitions that fired at the last edge (registered pulses).
 */
export function generatePetri(model, lang, { source } = {}) {
  const m = normalizePetri(model);
  lang = lang === 'verilog' || (!lang && m.lang === 'verilog') ? 'verilog' : 'vhdl';
  const errs = petriErrors({ ...m, lang });
  if (errs.length) { const e = new Error(`The Petri net '${m.name}' has ${errs.length} error(s):\n${errs.map(d => `  - ${d.message}`).join('\n')}`); e.diagnostics = errs; throw e; }
  const V = lang === 'vhdl', c = V ? '--' : '//';
  const coder = portExprCoder(m, lang);
  const W = p => bitsFor(p.capacity);
  const reg = p => `pl_${p.name}`, fr = t => `fired_${t.name}`;
  const ow = new Map(m.outputs.map(o => [o.name, o.width]));
  const lit = (v, w) => { const n = BigInt(constValue(v) ?? 0n) & ((1n << BigInt(w)) - 1n); return V ? (w === 1 ? `'${n}'` : `"${n.toString(2).padStart(w, '0')}"`) : `${w}'b${n.toString(2).padStart(w, '0')}`; };
  const num = (k, w) => (V ? (w === 1 ? `'${k}'` : `to_unsigned(${k}, ${w})`) : `${w}'d${k}`);
  const rstOn = V ? `${m.reset.name} = '${m.reset.active === 'low' ? 0 : 1}'` : (m.reset.active === 'low' ? `!${m.reset.name}` : m.reset.name);
  const L = [];
  const rule = c + '='.repeat(78);
  L.push(rule, `${c} ${V ? 'Entity' : 'Module'}      : ${m.name}`,
    `${c} Description : synchronous controller of the Petri net ${source || `${m.name}.pn.json`}`);
  if (m.description) for (const line of m.description.split(/\r?\n/)) L.push(`${c}               ${line}`.trimEnd());
  L.push(`${c} Generator   : Silinx Petri net editor (edit the net, not this file)`,
    `${c} Semantics   : on each rising edge of ${m.clock} the enabled transitions whose guard is true fire,`,
    `${c}               in priority order (a transition takes its tokens only if they are still there);`,
    `${c}               reset (${m.reset.name}, active-${m.reset.active}, synchronous) restores the initial marking.`,
    `${c} Places      : ${m.places.map(p => `${p.name}${p.tokens ? ` (${p.tokens} token${p.tokens > 1 ? 's' : ''})` : ''}${p.capacity > 1 ? ` [capacity ${p.capacity}]` : ''}`).join(', ')}`,
    `${c} Transitions : ${m.transitions.map(t => `${t.name}${t.guard ? ` [${t.guard}]` : ''}`).join(', ')}`, rule, '');
  const ins = [m.clock, m.reset.name], inW = n => m.inputs.find(p => p.name === n)?.width || 1;
  if (V) {
    L.push('library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '', `entity ${m.name} is`, '  port (');
    const ps = [...ins.map(n => `${n} : in std_logic`), ...m.inputs.map(p => `${p.name} : in ${p.width > 1 ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic'}`),
      ...m.outputs.map(p => `${p.name} : out ${p.width > 1 ? `std_logic_vector(${p.width - 1} downto 0)` : 'std_logic'}`)];
    L.push(ps.map(x => `    ${x}`).join(';\n'), '  );', `end entity ${m.name};`, '', `architecture petri of ${m.name} is`);
    for (const p of m.places) L.push(`  signal ${reg(p)} : ${W(p) === 1 ? 'std_logic' : `unsigned(${W(p) - 1} downto 0)`} := ${num(p.tokens, W(p))};`);
    for (const t of m.transitions) if (Object.keys(t.outputs).length) L.push(`  signal ${fr(t)} : std_logic := '0';`);
    L.push('begin', `  process (${m.clock})`);
    // o_: the marking at the edge (inhibitors read it), v_: what is left to take, add_: what is put
    if (m.places.length) L.push(`    variable ${m.places.map(p => `o_${p.name}, v_${p.name}, add_${p.name}`).join(", ")} : unsigned(8 downto 0);`);
    L.push('  begin', `    if rising_edge(${m.clock}) then`, `      if ${rstOn} then`);
    for (const p of m.places) L.push(`        ${reg(p)} <= ${num(p.tokens, W(p))};`);
    for (const t of m.transitions) if (Object.keys(t.outputs).length) L.push(`        ${fr(t)} <= '0';`);
    L.push('      else');
    for (const p of m.places) L.push(`        o_${p.name} := ${W(p) === 1 ? `unsigned'("00000000" & ${reg(p)})` : `resize(${reg(p)}, 9)`};`, `        v_${p.name} := o_${p.name};`, `        add_${p.name} := (others => '0');`);
    for (const t of m.transitions) {
      const pre = preset(m, t.id), post = postset(m, t.id);
      const P = id => placeOf(m, id);
      const conds = [];
      if (t.guard.trim()) conds.push(`(${coder.cond(t.guard)})`);
      for (const a of pre) conds.push(a.inhibitor ? `(o_${P(a.place).name} < ${a.weight})` : `(v_${P(a.place).name} >= ${a.weight})`);
      for (const a of post) {
        const back = pre.filter(b => b.place === a.place && !b.inhibitor).reduce((s2, b) => s2 + b.weight, 0);
        conds.push(`(v_${P(a.place).name} + add_${P(a.place).name} + ${a.weight} <= ${P(a.place).capacity + back})`);
      }
      L.push(`        -- ${t.name}`, `        if ${conds.length ? conds.join(' and ') : 'true'} then`);
      for (const a of pre) if (!a.inhibitor) L.push(`          v_${P(a.place).name} := v_${P(a.place).name} - ${a.weight};`);
      for (const a of post) L.push(`          add_${P(a.place).name} := add_${P(a.place).name} + ${a.weight};`);
      if (Object.keys(t.outputs).length) L.push(`          ${fr(t)} <= '1';`, '        else', `          ${fr(t)} <= '0';`);
      L.push('        end if;');
    }
    for (const p of m.places) {
      L.push(`        v_${p.name} := v_${p.name} + add_${p.name};`);
      L.push(W(p) === 1 ? `        ${reg(p)} <= v_${p.name}(0);` : `        ${reg(p)} <= resize(v_${p.name}, ${W(p)});`);
    }
    L.push('      end if;', '    end if;', '  end process;', '');
    // the outputs: the OR of the values of the marked places and of the transitions fired at the last edge
    const sens = [...m.places.map(reg), ...m.transitions.filter(t => Object.keys(t.outputs).length).map(fr)];
    if (m.outputs.length) {
      L.push(`  process (${sens.join(', ') || m.clock})`);
      for (const o of m.outputs) L.push(`    variable o_${o.name} : ${ow.get(o.name) === 1 ? 'std_logic' : `std_logic_vector(${ow.get(o.name) - 1} downto 0)`};`);
      L.push('  begin');
      for (const o of m.outputs) {
        const w = ow.get(o.name);
        L.push(`    o_${o.name} := ${w === 1 ? "'0'" : "(others => '0')"};`);
        for (const p of m.places) if (o.name in p.outputs) L.push(`    if ${W(p) === 1 ? `${reg(p)} = '1'` : `${reg(p)} /= 0`} then o_${o.name} := o_${o.name} or ${lit(p.outputs[o.name], w)}; end if;`);
        for (const t of m.transitions) if (o.name in t.outputs) L.push(`    if ${fr(t)} = '1' then o_${o.name} := o_${o.name} or ${lit(t.outputs[o.name], w)}; end if;`);
        L.push(`    ${o.name} <= o_${o.name};`);
      }
      L.push('  end process;');
    }
    L.push(`end architecture petri;`, '');
  } else {
    L.push('`timescale 1ns / 1ps', '', `module ${m.name} (`);
    const ps = [...ins.map(n => `input wire ${n}`), ...m.inputs.map(p => `input wire ${p.width > 1 ? `[${p.width - 1}:0] ` : ''}${p.name}`),
      ...m.outputs.map(p => `output wire ${p.width > 1 ? `[${p.width - 1}:0] ` : ''}${p.name}`)];
    L.push(ps.map(x => `  ${x}`).join(',\n'), ');', '');
    for (const p of m.places) L.push(`  reg ${W(p) > 1 ? `[${W(p) - 1}:0] ` : ''}${reg(p)} = ${num(p.tokens, W(p))};`);
    for (const t of m.transitions) if (Object.keys(t.outputs).length) L.push(`  reg ${fr(t)} = 1'b0;`);
    for (const p of m.places) L.push(`  reg [8:0] v_${p.name}, add_${p.name};`);
    L.push('', `  always @(posedge ${m.clock}) begin`, `    if (${rstOn}) begin`);
    for (const p of m.places) L.push(`      ${reg(p)} <= ${num(p.tokens, W(p))};`);
    for (const t of m.transitions) if (Object.keys(t.outputs).length) L.push(`      ${fr(t)} <= 1'b0;`);
    L.push('    end else begin');
    for (const p of m.places) L.push(`      v_${p.name} = ${reg(p)};`, `      add_${p.name} = 9'd0;`);
    for (const t of m.transitions) {
      const pre = preset(m, t.id), post = postset(m, t.id);
      const P = id => placeOf(m, id);
      const conds = [];
      if (t.guard.trim()) conds.push(`(${coder.cond(t.guard)})`);
      for (const a of pre) conds.push(a.inhibitor ? `(${reg(P(a.place))} < ${a.weight})` : `(v_${P(a.place).name} >= ${a.weight})`);
      for (const a of post) {
        const back = pre.filter(b => b.place === a.place && !b.inhibitor).reduce((s, b) => s + b.weight, 0);
        conds.push(`(v_${P(a.place).name} + add_${P(a.place).name} + ${a.weight} <= ${P(a.place).capacity + back})`);
      }
      L.push(`      // ${t.name}`, `      if (${conds.length ? conds.join(' && ') : "1'b1"}) begin`);
      for (const a of pre) if (!a.inhibitor) L.push(`        v_${P(a.place).name} = v_${P(a.place).name} - ${a.weight};`);
      for (const a of post) L.push(`        add_${P(a.place).name} = add_${P(a.place).name} + ${a.weight};`);
      if (Object.keys(t.outputs).length) L.push(`        ${fr(t)} <= 1'b1;`, '      end else begin', `        ${fr(t)} <= 1'b0;`);
      L.push('      end');
    }
    for (const p of m.places) L.push(`      ${reg(p)} <= v_${p.name} + add_${p.name};`);
    L.push('    end', '  end', '');
    for (const o of m.outputs) {
      const w = ow.get(o.name);
      const terms = [];
      for (const p of m.places) if (o.name in p.outputs) terms.push([`(${reg(p)} != 0)`, p.outputs[o.name]]);
      for (const t of m.transitions) if (o.name in t.outputs) terms.push([fr(t), t.outputs[o.name]]);
      L.push(`  assign ${o.name} = ${terms.length ? terms.map(([cnd, v]) => `(${cnd} ? ${lit(v, w)} : ${w}'b0)`).join(' | ') : `${w}'b0`};`);
    }
    L.push('', 'endmodule', '');
  }
  return { filename: `${m.name}.${V ? 'vhd' : 'v'}`, code: L.join('\n') };
}

// ------------------------------------------------------------------ PNML
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The net as PNML (place / transition net), with the Silinx parts (guards, outputs, capacities) as tool-specific data. */
export function toPnml(model) {
  const m = normalizePetri(model);
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', '<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml">',
    `  <net id="${xesc(m.name)}" type="http://www.pnml.org/version-2009/grammar/ptnet">`, `    <name><text>${xesc(m.name)}</text></name>`,
    `    <toolspecific tool="Silinx" version="${PETRI_VERSION}"><io>${xesc(JSON.stringify({ lang: m.lang, inputs: m.inputs, outputs: m.outputs, clock: m.clock, reset: m.reset, description: m.description }))}</io></toolspecific>`,
    '    <page id="page1">'];
  for (const p of m.places) {
    L.push(`      <place id="${xesc(p.id)}"><name><text>${xesc(p.name)}</text></name><graphics><position x="${p.x}" y="${p.y}"/></graphics>`
      + (p.tokens ? `<initialMarking><text>${p.tokens}</text></initialMarking>` : '')
      + `<toolspecific tool="Silinx" version="${PETRI_VERSION}"><capacity>${p.capacity}</capacity><outputs>${xesc(JSON.stringify(p.outputs))}</outputs></toolspecific></place>`);
  }
  for (const t of m.transitions) {
    L.push(`      <transition id="${xesc(t.id)}"><name><text>${xesc(t.name)}</text></name><graphics><position x="${t.x}" y="${t.y}"/></graphics>`
      + `<toolspecific tool="Silinx" version="${PETRI_VERSION}"><guard>${xesc(t.guard)}</guard><outputs>${xesc(JSON.stringify(t.outputs))}</outputs></toolspecific></transition>`);
  }
  for (const a of m.arcs) {
    L.push(`      <arc id="${xesc(a.id)}" source="${xesc(a.from)}" target="${xesc(a.to)}">${a.weight > 1 ? `<inscription><text>${a.weight}</text></inscription>` : ''}`
      + (a.inhibitor ? `<toolspecific tool="Silinx" version="${PETRI_VERSION}"><inhibitor/></toolspecific><type value="inhibitor"/>` : '') + '</arc>');
  }
  L.push('    </page>', '  </net>', '</pnml>', '');
  return L.join('\n');
}

/** A PNML document (a P/T net from any tool: PIPE, WoPeD, TINA…) as a Silinx net. */
export function fromPnml(xml, { name = null } = {}) {
  const text = String(xml || '');
  const un = s => s.replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  const tag = (s, t) => { const r = new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`).exec(s); return r ? r[1] : null; };
  const txt = (s, t) => { const x = tag(s, t); return x == null ? null : un((tag(x, 'text') ?? tag(x, 'value') ?? x).trim()); };   // (PIPE writes <value>)
  const attr = (s, a) => { const r = new RegExp(`\\b${a}="([^"]*)"`).exec(s); return r ? un(r[1]) : null; };
  const pos = s => { const g = tag(s, 'graphics') || ''; const r = /<position\b[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"/.exec(g); return r ? { x: Math.round(+r[1]), y: Math.round(+r[2]) } : null; };
  const json = (s, d) => { try { return JSON.parse(un(s)); } catch { return d; } };
  const safe = (s, i, pre) => { const n = String(s || '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z])/, `${pre}$1`).replace(/_+/g, '_'); return n || `${pre}${i}`; };
  const netT = tag(text, 'net') ?? text;
  const netId = attr((/<net\b[^>]*>/.exec(text) || [''])[0], 'id');
  const head = netT.split(/<(?:place|transition|page)\b/)[0];   // (the net's own name, not a place's)
  const io = json(tag(tag(netT, 'toolspecific') || '', 'io') || '{}', {});
  const m = { name: name || safe(txt(head, 'name') || netId || 'petri_net', 0, 'n'), lang: io.lang, inputs: io.inputs, outputs: io.outputs, clock: io.clock, reset: io.reset, description: io.description, places: [], transitions: [], arcs: [] };
  let i = 0;
  for (const r of netT.matchAll(/<place\b([^>]*)>([\s\S]*?)<\/place>|<place\b([^>]*)\/>/g)) {
    const head = r[1] || r[3], body = r[2] || '';
    const ts = tag(body, 'toolspecific') || '';
    const p = pos(body) || { x: 100 + 120 * (i % 6), y: 100 + 120 * Math.floor(i / 6) };
    m.places.push({ id: attr(head, 'id'), name: safe(txt(body, 'name'), ++i, 'p'), ...p, tokens: int(txt(body, 'initialMarking'), 0), capacity: int(tag(ts, 'capacity'), 1) || Math.max(1, int(txt(body, 'initialMarking'), 0)), outputs: json(tag(ts, 'outputs') || '{}', {}) });
  }
  let j = 0;
  for (const r of netT.matchAll(/<transition\b([^>]*)>([\s\S]*?)<\/transition>|<transition\b([^>]*)\/>/g)) {
    const head = r[1] || r[3], body = r[2] || '';
    const ts = tag(body, 'toolspecific') || '';
    const p = pos(body) || { x: 160 + 120 * (j % 6), y: 100 + 120 * Math.floor(j / 6) };
    m.transitions.push({ id: attr(head, 'id'), name: safe(txt(body, 'name'), ++j, 't'), ...p, guard: un(tag(ts, 'guard') || ''), outputs: json(tag(ts, 'outputs') || '{}', {}) });
  }
  for (const r of netT.matchAll(/<arc\b([^>]*?)(?:\/>|>([\s\S]*?)<\/arc>)/g)) {
    const head = r[1], body = r[2] || '';
    m.arcs.push({ id: attr(head, 'id') || `a${m.arcs.length + 1}`, from: attr(head, 'source'), to: attr(head, 'target'), weight: int(txt(body, 'inscription'), 1) || 1, inhibitor: /inhibitor/i.test(body) });
  }
  // a place given more tokens than its capacity (another tool's net): the capacity follows
  for (const p of m.places) p.capacity = Math.max(p.capacity, p.tokens, 1);
  return normalizePetri(m);
}

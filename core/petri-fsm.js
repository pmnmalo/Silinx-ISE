// The state machine of a Petri net (#2696): its state space, by the hardware's semantics (core/petri.js clockStep:
// on each clock edge the enabled transitions whose guard is true fire, in priority order), as an FSM diagram
// (core/fsm.js) to read beside the net. One state per reachable marking (and, when transitions have pulse outputs,
// per set of those that fired at the last edge: the pulses are registered, so they belong to the state); its Moore
// outputs the net's at that marking. From each state, a transition to each state the clock step may reach, its
// condition the combinations of the guards that lead there, minimized (core/logic.js) with the combinations no
// input value gives as don't cares; staying put is the FSM's default and has no arrow. The machine is the
// controller generatePetri() makes, state for state.
import { normalizePetri, preset, clockStepBy, outputsOf } from './petri.js';
import { normalizeFsm, parseCond, evalCond, condNames, inputCombos, autoLayout } from './fsm.js';
import { minimize } from './logic.js';

export const MAX_FSM_STATES = 200;    // the diagram stays readable
export const MAX_GUARDS = 10;         // guards that may be true or false at a marking (2^n combinations)
const MAX_INPUT_BITS = 12;            // the inputs the guards read, tried exhaustively (else every combination kept)

/**
 * { fsm, states, truncated, error? }: the FSM of the net (laid out), the number of its states, whether the state
 * space was cut at `maxStates`; error (and no fsm) when a marking has more than MAX_GUARDS guarded transitions.
 */
export function petriToFsm(model, { maxStates = MAX_FSM_STATES } = {}) {
  const m = normalizePetri(model);
  const P = m.places, T = m.transitions;
  const widthOf = n => m.inputs.find(p => p.name === n)?.width || 1;
  // each guard: always true (none), never (it does not parse: the clock step never fires it), or a condition
  const guards = T.map(t => { const r = parseCond(t.guard); return r.error ? { never: true } : { ast: r.ast }; });
  // the guards' values each input value gives (one string of 0/1 per combination of the inputs read), when few
  const read = new Set(); for (const g of guards) if (g.ast) condNames(g.ast, read);
  const combos = inputCombos(m, read, { maxBits: MAX_INPUT_BITS, samples: 0 });
  // (a name no input declares: its values unknown, every combination kept)
  const seen = combos.exhaustive && [...read].every(n => m.inputs.some(p => p.name === n)) ? combos.envs.map(env => guards.map(g => (g.ast && evalCond(g.ast, env, widthOf) ? '1' : '0')).join('')) : null;
  const pulsing = new Set(T.filter(t => Object.keys(t.outputs).length).map(t => t.id));

  // a state: a marking and the pulsing transitions that fired at the last edge
  const key = (mk, fired) => `${P.map(p => mk[p.id] || 0).join(',')}|${fired.filter(id => pulsing.has(id)).join(',')}`;
  const M0 = Object.fromEntries(P.map(p => [p.id, p.tokens]));
  const states = [{ marking: M0, fired: [] }], index = new Map([[key(M0, []), 0]]), edges = [];
  let truncated = false;
  for (let s = 0; s < states.length; s++) {
    const { marking } = states[s];
    // the guarded transitions that may fire here (their tokens there, their inhibitors empty)
    const G = T.map((t, j) => j).filter(j => guards[j].ast && preset(m, T[j].id).every(a => (a.inhibitor ? (marking[a.place] || 0) < a.weight : (marking[a.place] || 0) >= a.weight)));
    if (G.length > MAX_GUARDS) return { fsm: null, states: states.length, truncated, error: `${G.length} guarded transitions may fire at one marking (at most ${MAX_GUARDS})` };
    const n = G.length, rows = 1 << n;
    const possible = seen ? new Set(seen.map(v => G.map(j => v[j]).join(''))) : null;
    const to = new Map();   // state -> [rows]
    const dc = [];
    for (let r = 0; r < rows; r++) {
      const bits = G.map((_, i) => ((r >> (n - 1 - i)) & 1 ? '1' : '0')).join('');
      if (possible && !possible.has(bits)) { dc.push(r); continue; }
      const on = new Set(G.filter((_, i) => bits[i] === '1'));
      const step = clockStepBy(m, marking, t => { const j = T.indexOf(t); return !guards[j].never && (!guards[j].ast || on.has(j)); });
      const k = key(step.marking, step.fired);
      let d = index.get(k);
      if (d === undefined) {
        if (states.length >= maxStates) { truncated = true; continue; }
        d = states.length; index.set(k, d); states.push({ marking: step.marking, fired: step.fired.filter(id => pulsing.has(id)) });
      }
      if (!to.has(d)) to.set(d, []);
      to.get(d).push(r);
    }
    for (const [d, on] of to) if (d !== s) edges.push({ from: s, to: d, cond: condOf(on, dc, n, G.map(j => T[j].guard)) });
  }

  const names = new Set();
  const fsm = normalizeFsm({
    name: m.name, lang: m.lang, clock: m.clock, reset: m.reset, encoding: 'binary',
    inputs: m.inputs, outputs: m.outputs.map(o => ({ ...o, default: '0' })),
    states: states.map((st, i) => ({
      id: `s${i}`, name: unique(stateName(m, st), names),
      outputs: Object.fromEntries(Object.entries(outputsOf(m, st.marking, st.fired)).filter(([, v]) => v).map(([o, v]) => [o, v.toString()])),
      comment: P.map(p => `${p.name}=${st.marking[p.id] || 0}`).join(', ') + (st.fired.length ? `; fired ${st.fired.map(id => T.find(t => t.id === id).name).join(', ')}` : ''),
    })),
    transitions: edges.map((e, i) => ({ id: `t${i}`, from: `s${e.from}`, to: `s${e.to}`, cond: e.cond })),
    initial: 's0',
  });
  return { fsm: autoLayout(fsm), states: states.length, truncated };
}

// a state's name: the places that hold tokens (2·buf for two), ∅ for none; the pulsing transitions that fired, after a /
function stateName(m, st) {
  const marked = m.places.filter(p => st.marking[p.id] > 0).map(p => (st.marking[p.id] > 1 ? `${st.marking[p.id]}·${p.name}` : p.name));
  const fired = st.fired.map(id => m.transitions.find(t => t.id === id).name);
  return (marked.join(' ') || '∅') + (fired.length ? ` /${fired.join(' ')}` : '');
}
function unique(name, used) {
  let n = name;
  for (let i = 2; used.has(n); i++) n = `${name} (${i})`;
  used.add(n);
  return n;
}

// the condition of the rows `on` (bit n-1-i: guard i true), the rows `dc` impossible: a minimal sum of products of the
// guards, '' when it holds whatever the inputs
function condOf(on, dc, n, guards) {
  if (!n || on.length + dc.length === 1 << n) return '';
  const col = Array.from({ length: 1 << n }, (_, r) => (on.includes(r) ? '1' : dc.includes(r) ? 'X' : '0')).join('');
  const { terms } = minimize(col, n);
  const atom = g => (/^!?[A-Za-z_]\w*(\[\d+(:\d+)?\])?$/.test(g.trim()) ? g.trim() : `(${g.trim()})`);
  const lit = l => { const a = atom(guards[l.v]); return !l.neg ? a : a.startsWith('!') ? a.slice(1) : `!${a}`; };
  const prods = terms.map(t => t.literals.map(lit).join(' && '));
  if (prods.some(p => !p)) return '';
  return prods.length > 1 ? prods.map(p => (p.includes('&&') ? `(${p})` : p)).join(' || ') : prods[0];
}

// KISS2, the state-table format of the FSM benchmarks (#205): read into a state machine of the FSM
// editor (core/fsm.js), and written from one.
//
//   .i 2            inputs (bits)          .s 4   states        .r st0   the reset state
//   .o 1            outputs (bits)         .p 8   rows (terms)
//   -1 st0 st1 0    a row: input cube, present state, next state, output cube
//   .e
//
// The machine read: Mealy, one input bus x[.i] and one output bus y[.o] (one bit: x, y), a transition
// per row, its condition the cube (x[1] & !x[0]; '-' bits left out), its outputs the output cube ('-'
// bits: 0). A state's rows keep their order (the first that matches wins, as in the editor); where no
// row matches, the machine stays where it is with the outputs at 0. A row of next state '*' (any) or
// a present state '*' (every state) is expanded.
import { normalizeFsm, autoLayout } from './fsm.js';

const ident = (s, used) => {
  let n = String(s).replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!/^[A-Za-z]/.test(n)) n = `s_${n}`;
  let k = n, i = 2;
  while (used.has(k.toLowerCase())) k = `${n}_${i++}`;
  used.add(k.toLowerCase());
  return k;
};

/** A KISS2 text → an FSM model (throws on a malformed file). */
export function fromKiss2(text, { name = 'fsm', lang = 'vhdl' } = {}) {
  let ni = null, no = null, reset = null;
  const rows = [];
  for (const [k, raw] of String(text).split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const f = line.split(/\s+/);
    if (f[0].startsWith('.')) {
      if (f[0] === '.i') ni = +f[1];
      else if (f[0] === '.o') no = +f[1];
      else if (f[0] === '.r') reset = f[1];
      else if (f[0] === '.e' || f[0] === '.end') break;
      continue;   // .s, .p: counts only
    }
    if (f.length !== 4) throw new Error(`line ${k + 1}: a row is input, present state, next state, output`);
    rows.push({ line: k + 1, i: f[0], from: f[1], to: f[2], o: f[3] });
  }
  if (!Number.isInteger(ni) || ni < 0 || !Number.isInteger(no) || no < 0) throw new Error('.i and .o (the number of input and output bits) are missing');
  for (const r of rows) {
    if (r.i.length !== ni || /[^01-]/.test(r.i)) throw new Error(`line ${r.line}: the input '${r.i}' is not ${ni} bits of 0, 1, -`);
    if (r.o.length !== no || /[^01-]/.test(r.o)) throw new Error(`line ${r.line}: the output '${r.o}' is not ${no} bits of 0, 1, -`);
  }
  if (!rows.length) throw new Error('no rows');
  // the states, in their order of appearance; the reset one first
  const names = [];
  for (const r of rows) for (const s of [r.from, r.to]) if (s !== '*' && !names.includes(s)) names.push(s);
  if (reset && !names.includes(reset)) throw new Error(`.r ${reset}: no such state`);
  const used = new Set(['x', 'y', 'clk', 'rst']);
  const id = new Map(names.map((s, k) => [s, `s${k + 1}`]));
  const states = names.map(s => ({ id: id.get(s), name: ident(s, used), outputs: {} }));
  const X = ni === 1 ? 'x' : null;
  const cond = cube => cube.split('').map((c, k) => (c === '-' ? null : `${c === '0' ? '!' : ''}${X || `x[${ni - 1 - k}]`}`)).filter(Boolean).join(' & ');
  const outs = cube => (no ? { y: `${no}'b${cube.replace(/-/g, '0')}` } : {});
  const transitions = [];
  for (const r of rows) {
    const froms = r.from === '*' ? names : [r.from];
    for (const f of froms) {
      const to = r.to === '*' ? f : r.to;
      transitions.push({ id: `t${transitions.length + 1}`, from: id.get(f), to: id.get(to), cond: cond(r.i), outputs: outs(r.o) });
    }
  }
  const m = normalizeFsm({
    name, lang, encoding: 'binary', style: '3process',
    inputs: ni ? [{ name: 'x', width: ni }] : [], outputs: no ? [{ name: 'y', width: no, default: `${no}'b${'0'.repeat(no)}` }] : [],
    states, transitions, initial: id.get(reset || names[0]),
  });
  return autoLayout(m);
}

/** An FSM model whose conditions are cubes of one input bus (as fromKiss2 makes them) → KISS2. */
export function toKiss2(model) {
  const m = normalizeFsm(model);
  const ni = m.inputs[0]?.width || 0, no = m.outputs[0]?.width || 0;
  const name = id => m.states.find(s => s.id === id)?.name;
  const L = [`.i ${ni}`, `.o ${no}`, `.p ${m.transitions.length}`, `.s ${m.states.length}`, `.r ${name(m.initial)}`];
  for (const t of m.transitions) {
    const cube = Array(ni).fill('-');
    for (const lit of t.cond ? t.cond.split(/\s*&\s*/) : []) {
      const r = /^(!?)x(?:\[(\d+)\])?$/.exec(lit);
      if (!r) throw new Error(`transition ${t.id}: '${t.cond}' is not a cube of x`);
      cube[ni - 1 - (r[2] ? +r[2] : 0)] = r[1] ? '0' : '1';
    }
    const o = t.outputs.y ? /^\d+'b([01]+)$/.exec(t.outputs.y)?.[1] : '0'.repeat(no);
    if (o == null) throw new Error(`transition ${t.id}: the output '${t.outputs.y}' is not ${no}'b…`);
    L.push(`${cube.join('')} ${name(t.from)} ${name(t.to)} ${o}`);
  }
  return `${L.join('\n')}\n.e\n`;
}

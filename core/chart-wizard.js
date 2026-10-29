// The charts the FSM and ASM wizards of New Source make (#2082): the ports, the clock and the reset, the states (and
// an FSM's transitions) given on the wizard's pages, laid out for the editor to show them; the rest is drawn there.
import { normalizeFsm } from './fsm.js';
import { normalizeModel } from './asm.js';

const PER_ROW = 4;   // FSM: states per row of the drawing

const io = (ports, dir, extra = {}) => ports.filter(p => p.dir === dir).map(p => ({ name: p.name, width: +p.width, ...extra }));
const reset = name => ({ name, active: 'high', sync: false });

/**
 * A state diagram (.fsm.json): states [names], the first the initial one; transitions [{ from, to, cond }] by the
 * states' names, in priority order (cond '' or 1: always).
 */
export function fsmFromSpec({ name, lang, type = 'moore', clock = 'clk', reset: rst = 'rst', description = '', ports = [], states = [], transitions = [] }) {
  const id = new Map(states.map((s, i) => [s, `s${i + 1}`]));
  return normalizeFsm({
    name, lang, type, clock, reset: reset(rst), encoding: 'binary', style: '3process',
    ...(description.trim() ? { description: description.trim() } : {}),
    inputs: io(ports, 'in'),
    outputs: io(ports, 'out', { default: '0' }),
    states: states.map((s, i) => ({ id: id.get(s), name: s, x: 120 + 200 * (i % PER_ROW), y: 160 + 200 * Math.floor(i / PER_ROW), outputs: {} })),
    transitions: transitions.map((t, i) => ({ id: `t${i + 1}`, from: id.get(t.from) ?? '', to: id.get(t.to) ?? '', cond: t.cond ?? '' })),
    initial: id.get(states[0]) ?? '',
  });
}

/** An ASM chart (.asm.json): a state box per name, top to bottom, each followed by the next and the last by the first. */
export function asmFromSpec({ name, lang, clock = 'clk', reset: rst = 'rst', description = '', ports = [], states = [] }) {
  return normalizeModel({
    version: 1, name, lang, clock, reset: reset(rst), encoding: 'binary',
    ...(description.trim() ? { description: description.trim() } : {}),
    inputs: io(ports, 'in'),
    outputs: io(ports, 'out', { default: '0', registered: false }),
    nodes: states.map((s, i) => ({ id: `s${i + 1}`, type: 'state', name: s, x: 200, y: 80 + 130 * i, actions: [] })),
    edges: states.length ? states.map((_, i) => ({ id: `e${i + 1}`, from: `s${i + 1}`, to: `s${(i + 1) % states.length + 1}`, port: 'next' })) : [],
    initial: states.length ? 's1' : '',
  });
}

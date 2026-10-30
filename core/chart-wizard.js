// The charts the FSM and ASM wizards of New Source make (#2082): the ports, the clock and the reset, the states (and
// an FSM's transitions) given on the wizard's pages, laid out for the editor to show them; the rest is drawn there.
// A template (core/chart-templates.js, #2149) gives them first: an FSM's states' outputs, an ASM chart's boxes.
import { normalizeFsm } from './fsm.js';
import { normalizeModel } from './asm.js';
import { normalizePetri } from './petri.js';
import { fsmStatePos, asmTemplate } from './chart-templates.js';

const io = (ports, dir, extra = {}) => ports.filter(p => p.dir === dir).map(p => ({ name: p.name, width: +p.width, ...extra }));
const reset = name => ({ name, active: 'high', sync: false });

/**
 * A state diagram (.fsm.json): states [names], the first the initial one; outputs { state: { output: value } } (Moore);
 * transitions [{ from, to, cond, outputs? }] by the states' names, in priority order (cond '' or 1: always; outputs:
 * Mealy); layout 'circle': the states round a circle (else rows of 4).
 */
export function fsmFromSpec({ name, lang, type = 'moore', clock = 'clk', reset: rst = 'rst', description = '', ports = [], states = [], outputs = {}, transitions = [], layout }) {
  const id = new Map(states.map((s, i) => [s, `s${i + 1}`]));
  return normalizeFsm({
    name, lang, type, clock, reset: reset(rst), encoding: 'binary', style: '3process',
    ...(description.trim() ? { description: description.trim() } : {}),
    inputs: io(ports, 'in'),
    outputs: io(ports, 'out', { default: '0' }),
    states: states.map((s, i) => ({ id: id.get(s), name: s, ...fsmStatePos(i, states.length, layout), outputs: { ...outputs[s] } })),
    transitions: transitions.map((t, i) => ({ id: `t${i + 1}`, from: id.get(t.from) ?? '', to: id.get(t.to) ?? '', cond: t.cond ?? '', outputs: { ...t.outputs } })),
    initial: id.get(states[0]) ?? '',
  });
}

/**
 * An ASM chart (.asm.json): the template's boxes (core/chart-templates.js), its state boxes named `states`; the empty
 * template: a state box per name, top to bottom, each followed by the next and the last by the first.
 */
export function asmFromSpec({ name, lang, clock = 'clk', reset: rst = 'rst', description = '', ports = [], states = [], template = 'empty', params = {} }) {
  const { nodes, edges } = asmTemplate(template, params, states);
  return normalizeModel({
    version: 1, name, lang, clock, reset: reset(rst), encoding: 'binary',
    ...(description.trim() ? { description: description.trim() } : {}),
    inputs: io(ports, 'in'),
    outputs: io(ports, 'out', { default: '0', registered: false }),
    nodes, edges,
    initial: states.length ? 's1' : '',
  });
}

/** The net of the Petri Net Wizard (#208, moved from web/js/petri-wizard.js): the ports, the clock and the reset; a
 * template's places, transitions and arcs (#2149), none by default. */
export function petriFromPorts({ name, lang, description = '', ports, clock = 'clk', reset = 'rst', places = [], transitions = [], arcs = [] }) {
  return normalizePetri({
    name, lang, clock, reset: { name: reset, active: 'high', sync: true },
    ...(description.trim() ? { description: description.trim() } : {}),
    inputs: io(ports, 'in'),
    outputs: io(ports, 'out'),
    places, transitions, arcs,
  });
}

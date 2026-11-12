// A timing path in a drawing (#3178): the elements of a state diagram, an ASM chart or a schematic that a path of the
// Silinx toolchain's timing analysis goes through (packages/silinx-fpga/src/fpga/timing-paths.js), found by the
// drawing's own names on the path: the named nets between its stages and the signals its cells drive (a register's,
// an output's), in the module generated from the drawing.
//   a state diagram: its states when the path starts or ends in the state register, the transitions whose condition
//     reads a signal of the path, the states (Moore) or transitions (Mealy) that drive an output of the path;
//   an ASM chart: its state boxes when the path goes through the state register, the decision boxes whose condition
//     reads a signal of the path, the boxes whose operations use one, the arrows between two of them;
//   a schematic: the wires of the path's nets, the symbols that drive them.
//
//   pathNames(path, file)                      // the names of the path in the module generated into `file`
//   drawingPath(kind, model, names, { modules })  // [{ type: state | trans | node | edge | sym | wire, id, label }]
import { netlist } from './schdoc.js';
import { isIdent } from './ident.js';

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/g;
// (the generators' names of a signal's parts: a register's present and next value, an input's synchronisers)
const base = n => n.replace(/_(reg|next|sync|meta)$/, '');
/** A Yosys name's signal (its last part, with no bit index), or null for a name Yosys made ($…). */
export const signalOf = n => {
  if (!n || n.startsWith('$')) return null;
  const last = n.split('.').pop().replace(/\[\d+\]$/, '');
  return isIdent(last) ? last : null;
};

/** The signal names of a path in the module generated into `file` (lower case: VHDL's are): the named nets next to a
 *  stage whose logic comes from that file, and the signals those stages' cells drive. */
export function pathNames(p, file) {
  const out = new Set();
  const from = s => s?.sources?.some(x => x.file === file);
  const add = n => { const s = signalOf(n); if (s) out.add(base(s.toLowerCase())); };
  p.stages.forEach((s, i, st) => {
    if (s.kind === 'net') { if (from(st[i - 1]) || from(st[i + 1])) add(s.net); }
    else if (from(s)) for (const n of s.signals || []) add(n);
  });
  return out;
}

const reads = (text, names) => { for (const m of String(text ?? '').matchAll(IDENT)) if (names.has(base(m[0].toLowerCase()))) return true; return false; };
const outs = (o, names) => Object.keys(o || {}).some(k => names.has(base(k.toLowerCase())));

/** The elements of a drawing on a path (kind: fsm, asm, sch; names: pathNames'), each { type, id, label }. */
export function drawingPath(kind, model, names, { modules = {} } = {}) {
  if (!model || !names?.size) return [];
  const reg = names.has('state');
  if (kind === 'fsm') {
    const name = id => (model.states || []).find(s => s.id === id)?.name || id;
    return [
      ...(model.states || []).filter(s => reg || outs(s.outputs, names)).map(s => ({ type: 'state', id: s.id, label: s.name || s.id })),
      ...(model.transitions || []).filter(t => reads(t.cond, names) || outs(t.outputs, names))
        .map(t => ({ type: 'trans', id: t.id, label: `${name(t.from)} -> ${name(t.to)}${t.cond ? ` (${t.cond})` : ''}` }))];
  }
  if (kind === 'asm') {
    const nodes = (model.nodes || []).filter(n => (reg && n.type === 'state') || reads(n.cond, names) || (n.actions || []).some(a => reads(a, names)));
    const on = new Set(nodes.map(n => n.id));
    const label = n => (n.type === 'state' ? n.name : n.cond ?? (n.actions || []).join('; ')) || n.id;
    return [...nodes.map(n => ({ type: 'node', id: n.id, label: label(n) })),
      ...(model.edges || []).filter(e => on.has(e.from) && on.has(e.to)).map(e => ({ type: 'edge', id: e.id, label: `${e.from} -> ${e.to}` }))];
  }
  if (kind === 'sch') {
    let nl;
    try { nl = netlist(model, { modules }); } catch { return []; }
    const nameOf = n => n.endpoints.find(e => e.kind === 'port')?.name ?? n.name;
    const nets = nl.nets.filter(n => nameOf(n) && names.has(base(String(nameOf(n)).toLowerCase())));
    const syms = new Set(nets.flatMap(n => n.endpoints.filter(e => e.kind === 'pin' && e.dir === 'out').map(e => e.sym)));
    const sym = id => (model.symbols || []).find(s => s.id === id);
    const wires = new Map(nets.flatMap(n => n.wires.map(w => [w, nameOf(n)])));
    return [...[...syms].map(id => ({ type: 'sym', id, label: sym(id)?.name || sym(id)?.type || id })),
      ...[...wires].map(([id, net]) => ({ type: 'wire', id, label: net }))];
  }
  return [];
}

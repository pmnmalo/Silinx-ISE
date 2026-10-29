// Silinx ink - a drawing kept as text (#1749): the strokes of a handwriting dialog's pad, with what the dialog is
// for (an expression, a truth table, a schematic), the devices that drew it (pen, touch, mouse), what Silinx read
// and, in the corpus of real drawings (test/fixtures/ink/), what it should read as. A drawing copied from a dialog
// (Copy Drawing) is pasted back (Paste Drawing) or into an issue; read again by the recognizer of its kind.
//
//   encodeDrawing({ kind, strokes, devices, read, vars }) -> the drawing (an object, JSON.stringify for its text)
//   decodeDrawing(text | object) -> { kind, strokes: [[{x, y}]], devices, read, vars, expect, note }; throws Error
//   readDrawing(d, { templates }) -> what its kind's recognizer reads (the text a test compares with `expect`)
//   circuitText(circuit) -> a schematic's circuit as lines: `U1 and2 (A, B) -> Z`, a flip-flop's pins by name
import { recognizeEquations } from './equations.js';
import { readTable } from './table.js';
import { readSchematic, circuitErrors } from './schematic.js';
import { builtinTemplates } from './templates.js';
import { InkError } from './segment.js';

export const DRAWING_KINDS = ['expression', 'table', 'schematic'];
const DEVICES = ['pen', 'touch', 'mouse'];
const round = v => Math.round(v * 10) / 10;

export function encodeDrawing({ kind, strokes, devices = [], read = '', vars = null }) {
  return {
    silinx: 'ink-drawing', version: 1, kind,
    devices: [...new Set(devices)].filter(d => DEVICES.includes(d)),
    ...(vars ? { vars: [...vars] } : {}),
    read,
    strokes: strokes.filter(s => s.length).map(s => s.flatMap(p => [round(p.x), round(p.y)])),
  };
}

export function decodeDrawing(x) {
  let d = x;
  if (typeof x === 'string') {
    try { d = JSON.parse(x); } catch { throw new Error('Not a Silinx drawing: the text is not one copied with Copy Drawing.'); }
  }
  if (!d || d.silinx !== 'ink-drawing') throw new Error('Not a Silinx drawing: the text is not one copied with Copy Drawing.');
  if (d.version !== 1) throw new Error(`A Silinx drawing of version ${d.version}: this Silinx reads version 1.`);
  if (!DRAWING_KINDS.includes(d.kind)) throw new Error(`A Silinx drawing of an unknown kind: '${d.kind}'.`);
  const ok = Array.isArray(d.strokes) && d.strokes.length > 0 && d.strokes.every(a => Array.isArray(a) && a.length >= 2 && a.length % 2 === 0 && a.every(Number.isFinite));
  if (!ok) throw new Error('A Silinx drawing with no strokes, or strokes that are not lists of points.');
  const strokes = d.strokes.map(a => { const s = []; for (let i = 0; i < a.length; i += 2) s.push({ x: a[i], y: a[i + 1] }); return s; });
  return {
    kind: d.kind, strokes, devices: Array.isArray(d.devices) ? d.devices.filter(v => DEVICES.includes(v)) : [],
    read: typeof d.read === 'string' ? d.read : '', vars: Array.isArray(d.vars) ? d.vars.map(String) : null,
    expect: typeof d.expect === 'string' ? d.expect : null, note: typeof d.note === 'string' ? d.note : '',
  };
}

/** A schematic's circuit as lines, the gates and flip-flops by their ids: `U1 and2 (A, B) -> Z`; a net with no name
 *  by its source (`U1`, a flip-flop's `U2.QN`); the errors after, `! …`. */
export function circuitText(c) {
  const net = id => {
    const n = c.nets.find(x => x.id === id);
    if (!n) return '?';
    return n.name || (n.driver ? `${n.driver}${n.driverPin && n.driverPin !== 'Q' ? `.${n.driverPin}` : ''}` : '?');
  };
  const lines = c.gates.map(g => (g.kind === 'ff'
    ? `${g.id} ${g.type} (${Object.entries(g.pins).map(([p, n]) => `${p}: ${net(n)}`).join(', ')}) -> ${Object.entries(g.outputs).map(([p, n]) => `${p}: ${net(n)}`).join(', ')}`
    : `${g.id} ${g.type} (${g.inputs.map(net).join(', ')}) -> ${g.output ? net(g.output) : '?'}`));
  return [...lines, ...circuitErrors(c).map(e => `! ${e}`)].join('\n');
}

export function readDrawing(d, { templates = builtinTemplates() } = {}) {
  try {
    if (d.kind === 'expression') return recognizeEquations(d.strokes, { templates }).text;
    if (d.kind === 'table') return readTable(d.strokes, { templates }).text;
    return circuitText(readSchematic(d.strokes, { templates }));
  } catch (e) {
    if (!(e instanceof InkError)) throw e;
    return `! ${e.message}`;
  }
}

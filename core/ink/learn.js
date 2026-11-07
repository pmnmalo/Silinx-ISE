// Silinx ink - what the user corrected, learnt (#1751, part of #1055): when the user changes what a handwriting dialog
// read before using it, the correction is a sample of how that user writes, the ink of a character (or of a gate's
// outline) with what it was meant to be (templates.js encodeSample), kept by the browser with the samples of "Teach
// Silinx my handwriting" and used as the user's own templates.
//
//   expressionSamples(read, text, strokes) -> [{ c, s }]
//     read: recognizeEquations's result for the strokes; text: the text as the user left it; the characters changed,
//     line by line, where the text still lines up with the ink: the same lines, and on each the same number of the
//     characters drawn as shapes (letters, digits, _, ?), the reading's own lining up with its ink
//   schematicSamples(read, circuit, strokes) -> [{ c, s }]
//     read: readSchematic's result, as read (a copy); circuit: as the user corrected it (its gates' types, its names);
//     a gate whose type is of another outline (and, or, xor, buf): its outline as a sample of that one; a name
//     corrected, of as many letters: the letters changed
//   correctedChars(chars, text) -> [{ ch, ink }] the characters of a reading ([{ ch, ink }]) the text changes
import { encodeSample, GATE_KINDS } from './templates.js';
import { SYMBOLS } from './font.js';
import { SAME_SHAPE } from './expression.js';

// the characters drawn as shapes, which the text keeps as they were read (the marks, the operators and the brackets
// may be written in another notation: a prime as /, a bar as brackets, a dot as .)
const DRAWN = /^[A-Za-z0-9_?]$/;
const drawn = s => [...s].filter(c => DRAWN.test(c));

/** The characters of a reading the text changes, when it lines up with them; none when it does not, or when more
 *  than one character and more than half of them changed (a text written again, letters swapped: not a correction). */
export function correctedChars(chars, text) {
  const ink = chars.filter(c => DRAWN.test(c.ch)), now = drawn(text);
  if (now.length !== ink.length) return [];
  const changed = ink.map((c, i) => ({ ch: now[i], ink: c.ink, was: c.ch })).filter(c => c.ch !== c.was);
  if (changed.length > 1 && changed.length > ink.length / 2) return [];
  // (a letter written alike in both cases: its case is its size, not its shape)
  return changed.filter(c => SYMBOLS.includes(c.ch) && !(c.ch.toLowerCase() === c.was.toLowerCase() && SAME_SHAPE.has(c.ch.toLowerCase())))
    .map(({ ch, ink: k }) => ({ ch, ink: k }));
}

const sampleOf = (c, ink, strokes) => encodeSample(c, ink.map(k => strokes[k]).filter(Boolean));

export function expressionSamples(read, text, strokes) {
  const lines = String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!read?.lines || lines.length !== read.lines.length) return [];
  return read.lines.flatMap((l, i) => {
    // (the text shown lining up with its ink: the reading's characters, in its notation)
    if (drawn(l.text).join('') !== l.chars.filter(c => DRAWN.test(c.ch)).map(c => c.ch).join('')) return [];
    return correctedChars(l.chars, lines[i]).map(c => sampleOf(c.ch, c.ink, strokes));
  });
}

// a gate's outline: and (nand), or (nor), xor (xnor), buf (inv)
const outlineOf = type => ({ nand: 'and', nor: 'or', xnor: 'xor', inv: 'buf' }[String(type).replace(/\d+$/, '')] ?? String(type).replace(/\d+$/, ''));

export function schematicSamples(read, circuit, strokes) {
  if (!read || !circuit) return [];
  const out = [];
  for (const g of read.gates) {
    const now = circuit.gates.find(x => x.id === g.id);
    if (g.kind === 'ff' || !now || !g.ink?.length) continue;
    const kind = outlineOf(now.type);
    if (kind !== g.kind && GATE_KINDS.includes(kind)) out.push(sampleOf(kind, g.ink, strokes));
  }
  for (const n of read.nets) {
    const now = circuit.nets.find(x => x.id === n.id);
    if (!n.chars || !now?.name || now.name === n.name || n.chars.map(c => c.ch).join('') !== n.name) continue;
    out.push(...correctedChars(n.chars, now.name).map(c => sampleOf(c.ch, c.ink, strokes)));
  }
  return out;
}

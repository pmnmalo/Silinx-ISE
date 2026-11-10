// Silinx ink - the templates of the recognizer (#1056): the built-in ones (core/ink/templates.json, made by
// scripts/ink-templates.mjs from the skeleton font) and the user's own samples ("Teach Silinx my handwriting",
// kept by the browser), in one compact form: { c: symbol, s: [[x0, y0, x1, y1, ...], ...] }, whole numbers, the
// larger side of the symbol's box 100.
//
//   encodeSample(ch, strokes) -> { c, s }; decodeStrokes(s) -> strokes
//   builtinTemplates() -> [template]; userTemplates(samples) -> [template] (preferred: their distance counts less)
//   userGateTemplates(samples) -> [template] the user's gates' outlines (#1751: a gate's type corrected; c: and, or,
//     xor or buf, gates.js), for readSchematic's gates
//   validSamples(x) -> the well-formed samples of x (what the browser kept may be anything)
import { template } from './pdollar.js';
import { boxOf } from './segment.js';
import { SYMBOLS } from './font.js';
import BUILTIN from './templates.json' with { type: 'json' };

export const USER_WEIGHT = 0.85;
// the gates' outlines a sample may be of (gates.js GATES)
export const GATE_KINDS = ['and', 'or', 'xor', 'buf'];

export function encodeSample(ch, strokes) {
  const live = strokes.filter(s => s?.length);
  const b = boxOf(live), size = Math.max(b.w, b.h) || 1;
  return { c: ch, s: live.map(st => st.flatMap(p => [Math.round((p.x - b.minX) / size * 100), Math.round((p.y - b.minY) / size * 100)])) };
}

export function decodeStrokes(s) {
  return s.map(a => { const out = []; for (let i = 0; i + 1 < a.length; i += 2) out.push({ x: a[i], y: a[i + 1] }); return out; });
}

/** The samples of x that are well formed: a symbol of the set or a gate's outline, strokes of whole numbers. */
export function validSamples(x) {
  if (!Array.isArray(x)) return [];
  return x.filter(t => t && (SYMBOLS.includes(t.c) || GATE_KINDS.includes(t.c)) && Array.isArray(t.s) && t.s.length > 0 && t.s.length <= 12 &&
    t.s.every(a => Array.isArray(a) && a.length >= 2 && a.length <= 2000 && a.length % 2 === 0 && a.every(Number.isFinite)));
}

let builtin = null;
export function builtinTemplates() {
  builtin ||= BUILTIN.templates.map(t => template(t.c, decodeStrokes(t.s)));
  return builtin;
}

const userOf = (samples, kinds) => validSamples(samples).filter(t => kinds.includes(t.c)).map(t => template(t.c, decodeStrokes(t.s), { k: USER_WEIGHT, user: true }));
export const userTemplates = samples => userOf(samples, SYMBOLS);
export const userGateTemplates = samples => userOf(samples, GATE_KINDS);

// Silinx ink - a handwritten Boolean expression read as text (#1056). The ink is split into characters
// (segment.js), each one recognized ($P, pdollar.js) or, a small mark, read by its place (a prime at the top, a dot
// of AND in the middle); the case of the letters written alike in both (c C, o O, s S...) follows their size; the
// symbols written alike (O o 0, l 1 | I...) are chosen by the expression parser (core/logic.js parseExpr): the
// reading that parses; overbars become NOT. The text is for the user to correct before it is used, an expression that
// parses in the editor's notation (/A.B + C, #2001).
//
//   recognizeExpression(strokes, { templates, vars }) -> { text, written, name, expr, chars, warnings, error }
//     strokes: [[{x, y}, ...], ...]; templates: the built-in ones by default (templates.js), with the user's;
//     vars: the inputs' names, if known; text: in the editor's notation when it parses (/A.B + C, #2001), else as
//     written; written: as written (A'·B + C, the letters' case); name / expr: the two sides of "name = expr" (name ''
//     without '=');
//     chars: [{ ch, box, ink, alts }] (ink: the indexes of its strokes); warnings: what to check; error: the
//     parser's message, if the text does not parse
//   recognizeWords(strokes, { templates, gap, capH }) -> [{ text, box, ink }] names on a line (letters, digits, _)
//   splitEquation(text) -> { name, expr }; expressionInputs(expr) -> the inputs of an expression
import { segment, boxOf, InkError } from './segment.js';
import { classify } from './pdollar.js';
import { builtinTemplates } from './templates.js';
import { parseExpr, exprVars, formatExpr, LogicError } from '../logic.js';

export { InkError };

// the farthest a template may be for a symbol to be recognized ($P distance; nearer is likelier)
export const UNKNOWN_DISTANCE = 1.7;
// symbols written alike: the reading that parses wins
const LOOKALIKE = [['O', 'o', '0'], ['l', '1', '|', 'I'], ['C', 'c', '('], ['(', 'l', '1', '|', 'L'], [')', 'l', '1', '|', 'j', 'J'], ['x', 'X', '*'], ['S', 's', '5'], ['Z', 'z', '2'],
  ['B', '8'], ['g', '9', 'q'], ['b', '6'], ['A', '^'], ['V', 'v', 'U', 'u'], ['P', 'p'], ['K', 'k'], ['W', 'w'], ['Y', 'y'], ['¬', '7']];
const MARKS = ["'", '·'];
// the letters whose capital is the small letter drawn larger
const SAME_SHAPE = new Set('copsuvwxyz');   // (a k is as tall as a K)
const TALL = /[A-Z0-9bdfhklt]/;
const DESCENDS = /^[gjpqyY]$/;
const SHORT = /[acemnorsuvwxz]/;
// a symbol of the wrong height for its place (a capital-only shape at x-height, a short one up to the capitals)
const MISPLACED = 1.25;
const isLetter = c => /^[A-Za-z]$/.test(c);
const operandEnd = c => c && /[A-Za-z0-9_)']/.test(c);
const operandStart = c => c && /[A-Za-z0-9_(¬~]/.test(c);

function lookalikes(ch) {
  const set = new Set([ch]);
  for (const g of LOOKALIKE) if (g.includes(ch)) g.forEach(c => set.add(c));
  return [...set];
}

// a mark too small to be a letter, read by its place beside its neighbours: a prime at the top, a dot in the middle
function markOf(g, prev, next, H) {
  const ref = [prev, next].filter(n => n && !n.small).map(n => n.box);
  const top = ref.length ? Math.min(...ref.map(b => b.minY)) : g.box.minY - H / 2;
  const bot = ref.length ? Math.max(...ref.map(b => b.maxY)) : g.box.maxY + H / 2;
  const h = Math.max(bot - top, 0.5 * H);
  if (Math.hypot(g.box.w, g.box.h) >= 0.45 * h) return null;
  if (g.box.maxY < top + 0.5 * h) return "'";
  return Math.hypot(g.box.w, g.box.h) < 0.25 * h ? '·' : null;
}

// two flat strokes one above the other: '='
function equals(g) {
  if (g.strokes.length !== 2) return null;
  const [a, b] = g.strokes.map(st => boxOf([st])).sort((p, q) => p.minY - q.minY);
  const ov = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  return a.h <= 0.25 * a.w && b.h <= 0.25 * b.w && b.minY > a.maxY && ov > 0.5 * Math.min(a.w, b.w) ? '=' : null;
}

// capital or small, for the letters written alike in both: where the letter's top is, between the tops of the
// capitals (else of all the letters) and the baseline
function fixCase(gs) {
  const line = lineOf(gs, g => TALL.test(g.ch) && !SAME_SHAPE.has(g.ch.toLowerCase())) || lineOf(gs);
  if (!line) return;
  for (const g of gs) {
    if (SAME_SHAPE.has(g.ch.toLowerCase())) g.ch = atXHeight(g, line) ? g.ch.toLowerCase() : g.ch.toUpperCase();
  }
}

// where the capitals' tops and the baseline are (the letters' and digits'), or null
// (gs.capH: the capitals' height when it is known from elsewhere, e.g. the digits of a table under its header)
function lineOf(gs, filter = () => true) {
  const ref = gs.filter(g => /[A-Za-z0-9]/.test(g.ch) && !g.small && (gs.capH || filter(g)));
  if (!ref.length) return null;
  const median = a => a.sort((x, y) => x - y)[a.length >> 1];
  if (!gs.capH) return { top: Math.min(...ref.map(g => g.box.minY)), base: median(ref.map(g => g.box.maxY)) };
  // (the baseline: of the letters that do not go below it, else above the descenders)
  const sit = ref.filter(g => !DESCENDS.test(g.ch));
  const base = sit.length ? median(sit.map(g => g.box.maxY)) : median(ref.map(g => g.box.maxY)) - 0.35 * gs.capH;
  return { top: base - gs.capH, base };
}
const atXHeight = (g, line) => g.box.minY > line.top + 0.3 * (line.base - line.top);

// the alternatives of each letter reordered by its height: a tall shape at x-height is less likely, and the reverse
function byHeight(gs) {
  const line = lineOf(gs);
  if (!line) return;
  for (const g of gs) {
    if (!/[A-Za-z0-9]/.test(g.ch) || g.small || g.alts.length < 2) continue;
    const low = atXHeight(g, line);
    g.alts = g.alts.map(a => {
      const tall = TALL.test(a.ch) && !SAME_SHAPE.has(a.ch.toLowerCase()), short = SHORT.test(a.ch);
      return (low && tall) || (!low && short && !SAME_SHAPE.has(a.ch)) ? { ...a, d: a.d * MISPLACED } : a;
    }).sort((a, b) => a.d - b.d);
    if (g.alts[0].d <= UNKNOWN_DISTANCE) g.ch = g.alts[0].ch;
  }
}

// an i or a j: a small mark above the top of a stem
function dotted(g) {
  if (g.strokes.length < 2) return false;
  const boxes = g.strokes.map(st => boxOf([st]));
  const dot = boxes.findIndex(b => Math.hypot(b.w, b.h) < 0.3 * g.box.h);
  return dot >= 0 && boxes.every((b, i) => i === dot || b.minY > boxes[dot].maxY);
}

function readChars(strokes, templates, capH = null) {
  const { chars, bars, H } = segment(strokes);
  const shapes = templates.filter(t => !MARKS.includes(t.ch));   // the marks are read by their place
  const gs = chars.map(c => ({ ...c, small: Math.hypot(c.box.w, c.box.h) < 0.45 * H }));
  gs.forEach((g, i) => {
    const mark = (g.small ? markOf(g, gs[i - 1], gs[i + 1], H) : null) || equals(g);
    if (mark) { g.ch = mark; g.alts = [{ ch: mark, d: 0 }]; return; }
    g.alts = classify(g.strokes, shapes);
    // (a dot over a stem: an i or a j, however far their templates are)
    if (dotted(g)) { g.alts = classify(g.strokes, shapes.filter(t => t.ch === 'i' || t.ch === 'j')); g.ch = g.alts[0].ch; return; }
    g.ch = g.alts[0] && g.alts[0].d <= UNKNOWN_DISTANCE ? g.alts[0].ch : '?';
  });
  gs.capH = capH;
  byHeight(gs);
  fixCase(gs);
  return { gs, bars, H };
}

// the symbols written alike: the vertical line and the ring by their neighbours, then what makes the side parse
function resolve(gs, vars) {
  const known = new Set((vars || []).map(v => v.toLowerCase()));
  gs.forEach((g, i) => {
    const prev = gs[i - 1]?.ch, next = gs[i + 1]?.ch;
    if (['l', '|', 'I'].includes(g.ch) && !known.has(g.ch.toLowerCase())) g.ch = operandEnd(prev) && operandStart(next) ? '|' : (isLetter(prev) || isLetter(next)) && !vars ? 'l' : '1';
    if (['O', 'o'].includes(g.ch) && !known.has('o') && !isLetter(prev) && !isLetter(next)) g.ch = '0';
  });
}

// the alternatives of a character, likeliest first: the recognizer's near ones, then the look-alikes
function choices(g) {
  if (g.ch === '?') return [];
  const near = g.alts.filter(a => a.d <= Math.max(g.alts[0].d * 1.35, g.alts[0].d + 0.25)).map(a => a.ch);
  return [...new Set([...near, ...lookalikes(g.ch), ...near.flatMap(lookalikes)])].filter(c => c !== g.ch);
}

// the cost of reading a character as c instead: how much farther its template is
function cost(g, c) {
  const a = g.alts.find(x => x.ch === c);
  return a ? a.d - g.alts[0].d : 0.5;
}

// as many ')' as '(': the missing ones are the characters after an open bracket likeliest to be one
function balance(side) {
  for (let round = 0; round < side.length; round++) {
    const open = [];
    let extra = null;
    side.forEach((g, i) => { if (g.ch === '(') open.push(i); else if (g.ch === ')' && !open.pop() && extra == null) extra = i; });
    let want, from, to;
    if (open.length) [want, from, to] = [')', open[0] + 1, side.length];
    else if (extra != null) [want, from, to] = ['(', 0, extra];
    else return;
    const can = side.slice(from, to).filter(g => g.ch !== '(' && g.ch !== ')' && choices(g).includes(want)).sort((a, b) => cost(a, want) - cost(b, want));
    if (!can.length) return;
    can[0].ch = want;
  }
}

// change the characters near where the side stops parsing, while the parse goes further
function repair(side, parse) {
  const text = () => side.map(g => g.ch).join('');
  const at = () => { try { parse(text()); return Infinity; } catch (e) { return e instanceof LogicError ? (e.pos ?? 1) : 1; } };
  let pos = at();
  for (let round = 0; round < side.length * 2 && pos !== Infinity; round++) {
    let better = null;
    const k = Math.min(side.length, pos) - 1;
    for (const i of [k, k - 1, k + 1].filter(i => i >= 0 && i < side.length)) {
      const g = side[i], was = g.ch;
      for (const c of choices(g)) {
        g.ch = c;
        const p = at();
        if (p > pos) { better = { g, c, p }; break; }
      }
      g.ch = was;
      if (better) break;
    }
    if (!better) break;
    better.g.ch = better.c;
    pos = better.p;
  }
}

// the text, with each overbar as NOT: over one character a prime, over more a bracket and a prime
function withBars(gs, bars, H) {
  let items = gs.map(g => ({ text: g.ch, box: g.box }));
  for (const b of [...bars].sort((x, y) => x.box.w - y.box.w)) {
    const under = items.map((it, i) => ({ it, i })).filter(({ it }) => it.box.cx >= b.box.minX - 0.1 * H && it.box.cx <= b.box.maxX + 0.1 * H && it.box.minY > b.box.maxY);
    if (!under.length) continue;
    const i0 = under[0].i, i1 = under.at(-1).i, run = items.slice(i0, i1 + 1);
    const text = run.map(r => r.text).join('');
    const box = { ...b.box, cx: (Math.min(...run.map(r => r.box.minX)) + Math.max(...run.map(r => r.box.maxX))) / 2,
      minX: Math.min(b.box.minX, ...run.map(r => r.box.minX)), maxX: Math.max(b.box.maxX, ...run.map(r => r.box.maxX)) };
    items = [...items.slice(0, i0), { text: run.length === 1 ? `${text}'` : `(${text})'`, box }, ...items.slice(i1 + 1)];
  }
  return items.map(i => i.text).join('');
}

const spaced = t => t.replace(/\s*([=+⊕])\s*/g, ' $1 ').trim();

/** The two sides of "name = expression" (no '=': the whole text is the expression). */
export function splitEquation(text) {
  const s = String(text ?? '');
  const k = s.indexOf('=');
  return k < 0 ? { name: '', expr: s.trim() } : { name: s.slice(0, k).trim(), expr: s.slice(k + 1).trim() };
}

/**
 * The inputs of an expression, in order of appearance: its variables; when all of them are letters only, a run
 * of letters (ab'c) is a product of one-letter inputs, as it is written by hand. Throws the parser's LogicError.
 */
export function expressionInputs(expr) {
  const ids = exprVars(parseExpr(expr));
  const seen = new Map();
  const letters = ids.every(v => /^[A-Za-z]+$/.test(v));
  for (const v of letters ? ids.flatMap(x => [...x]) : ids) if (!seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
  const inputs = [...seen.values()];
  parseExpr(expr, { vars: inputs });
  return inputs;
}

// a name: letters, digits and _, a letter first (a symbol written alike read as one of them)
function asName(gs) {
  gs.forEach((g, i) => {
    if (/[A-Za-z0-9_]/.test(g.ch) && (i > 0 || isLetter(g.ch))) return;
    const c = [g.ch, ...choices(g)].find(x => (i > 0 ? /^[A-Za-z0-9_]$/ : /^[A-Za-z]$/).test(x));
    if (c) g.ch = c;
  });
}

/**
 * Handwritten names on a line (a truth table's header, #1066; a schematic's markers): letters, digits and _, read
 * together (their sizes tell the capitals), a word ending where the gap after a character is wider than `gap`
 * line heights; capH: the capitals' height, when known. Returns [{ text, box, ink }], from the left; box: of the
 * word's strokes as drawn.
 */
export function recognizeWords(strokes, { templates = builtinTemplates(), gap = 0.5, capH = null } = {}) {
  const live = strokes.filter(s => s?.length);
  const { gs, H } = readChars(live, templates, capH);
  const words = [];
  for (const g of gs) {
    const w = words.at(-1);
    if (w && g.box.minX - w.last.box.maxX <= gap * H) { w.gs.push(g); w.last = g; } else words.push({ gs: [g], last: g });
  }
  words.forEach(w => asName(w.gs));
  // the case: with the capitals' height known, word by word (each on its own baseline), else on the line
  if (capH) words.forEach(w => { w.gs.capH = capH; fixCase(w.gs); }); else fixCase(gs);
  return words.map(w => {
    const ink = w.gs.flatMap(g => g.ink);
    return { text: w.gs.map(g => g.ch).join(''), box: boxOf(ink.map(k => live[k])), ink };
  });
}

export function recognizeExpression(strokes, { templates = builtinTemplates(), vars = null } = {}) {
  const { gs, bars, H } = readChars(strokes, templates);
  const eq = gs.findIndex(g => g.ch === '=');
  const lhs = eq < 0 ? [] : gs.slice(0, eq), rhs = eq < 0 ? gs : gs.slice(eq + 1);
  asName(lhs);
  resolve(rhs, vars);
  const parse = vars ? t => parseExpr(t, { vars }) : t => expressionInputs(t);
  balance(rhs);
  if (rhs.length) repair(rhs, parse);
  fixCase(gs);
  const read = spaced(withBars(gs, bars, H));
  const { name, expr: written } = splitEquation(read);
  const warnings = [];
  const unknown = gs.filter(g => g.ch === '?').length;
  if (unknown) warnings.push(`${unknown === 1 ? 'A symbol was' : `${unknown} symbols were`} not recognized (shown as ?): write ${unknown === 1 ? 'it' : 'them'} again, or teach Silinx your handwriting.`);
  if (gs.filter(g => g.ch === '=').length > 1) warnings.push("More than one '=': only the first one separates the name from the expression.");
  let error = null, expr = written;
  try {
    if (!expr) throw new LogicError('the expression is empty');
    parse(expr);
    // in the editor's notation (#2001): /A.B + C, /(A + B)
    expr = formatExpr(parseExpr(expr, { vars: vars ?? expressionInputs(expr) }), 'slash');
  } catch (e) { if (!(e instanceof LogicError)) throw e; error = e.message; }
  const text = error ? read : name ? `${name} = ${expr}` : expr;
  return { text, written: read, name, expr, chars: gs.map(g => ({ ch: g.ch, box: g.box, ink: g.ink, alts: g.alts.map(a => ({ ch: a.ch, d: +a.d.toFixed(3) })) })), warnings, error };
}

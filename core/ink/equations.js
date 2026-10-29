// Silinx ink - several equations written by hand, one a line (#2010): the strokes split into lines (by their height
// on the pad), each line read as an expression (expression.js), with any names; the equations make a truth table
// (its inputs in order of appearance, its outputs the equations' names, a column and an expression each).
//
//   inkLines(strokes) -> [[stroke index, ...], ...] the lines, from the top; a flat stroke (an overbar, a stroke of =)
//     or a small mark (a dot, a prime) with the line it is nearest
//   recognizeEquations(strokes, { templates }) -> { text, lines: [recognizeExpression's, chars' ink global] }
//   tableFromEquations(text, { name, maxInputs }) -> { inputs, outputs, table, exprs }; throws LogicError
//     text: an equation a line ("F = /A.B + C"); name: the output of a single expression with no name; a parser's
//     message after its output's name when there are several
import { boxOf } from './segment.js';
import { recognizeExpression, splitEquation, expressionInputs } from './expression.js';
import { builtinTemplates } from './templates.js';
import { parseExpr, exprColumn, LogicError, MAX_EDIT_INPUTS } from '../logic.js';

export function inkLines(strokes) {
  const boxes = strokes.map(s => boxOf([s]));
  const hs = boxes.map(b => b.h).sort((a, b) => a - b);
  const H = Math.max(hs[Math.floor(hs.length * 0.75)] || 1, 1);
  // the strokes that make a line's height (not flat, not a mark); a line where their heights overlap
  const body = boxes.map((b, i) => i).filter(i => boxes[i].h >= 0.35 * H);
  body.sort((a, b) => boxes[a].minY - boxes[b].minY);
  const lines = [];
  for (const i of body) {
    const b = boxes[i], cur = lines.at(-1);
    if (cur && b.minY < cur.maxY - 0.1 * Math.min(b.h, cur.maxY - cur.minY)) { cur.ink.push(i); cur.maxY = Math.max(cur.maxY, b.maxY); } else lines.push({ minY: b.minY, maxY: b.maxY, ink: [i] });
  }
  if (!lines.length) return [strokes.map((_, i) => i)];
  // the rest with the nearest line (inside it, or by the gap to its top or its bottom)
  const gap = (l, y) => (y < l.minY ? l.minY - y : y > l.maxY ? y - l.maxY : 0);
  boxes.forEach((b, i) => {
    if (b.h >= 0.35 * H) return;
    const y = (b.minY + b.maxY) / 2;
    lines.reduce((best, l) => (gap(l, y) < gap(best, y) ? l : best)).ink.push(i);
  });
  return lines.map(l => l.ink.sort((a, b) => a - b));
}

export function recognizeEquations(strokes, { templates = builtinTemplates() } = {}) {
  const lines = inkLines(strokes).map(ink => {
    const r = recognizeExpression(ink.map(k => strokes[k]), { templates });
    return { ...r, chars: r.chars.map(c => ({ ...c, ink: c.ink.map(k => ink[k]) })) };
  });
  return { text: lines.map(l => l.text).join('\n'), lines };
}

export function tableFromEquations(text, { name = 'F', maxInputs = MAX_EDIT_INPUTS } = {}) {
  const eqs = String(text ?? '').split('\n').map(l => l.trim()).filter(Boolean).map(splitEquation);
  if (!eqs.length) throw new LogicError("Write an expression, e.g. F = /A.B + C.");
  if (eqs.length > 1 && eqs.some(e => !e.name)) throw new LogicError('Name each expression of several: F = …, G = …');
  if (eqs.length === 1 && !eqs[0].name) eqs[0].name = name;
  const outputs = [];
  for (const e of eqs) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(e.name)) throw new LogicError(`'${e.name}' is not a name: a letter, then letters, digits or _.`);
    if (outputs.some(o => o.toLowerCase() === e.name.toLowerCase())) throw new LogicError(`The output ${e.name} has two expressions.`);
    if (!e.expr) throw new LogicError(`${e.name} has no expression.`);
    outputs.push(e.name);
  }
  // the inputs: each expression's, in order of appearance (the letter case of the first)
  const inputs = [];
  for (const e of eqs) {
    let ins;
    try { ins = expressionInputs(e.expr); } catch (err) { if (err instanceof LogicError) throw eqs.length > 1 ? new LogicError(`The expression of ${e.name}: ${err.message}`) : err; throw err; }
    for (const v of ins) if (!inputs.some(x => x.toLowerCase() === v.toLowerCase())) inputs.push(v);
  }
  const both = outputs.find(o => inputs.some(v => v.toLowerCase() === o.toLowerCase()));
  if (both) throw new LogicError(`${both} is both an output and an input: an expression of the inputs only.`);
  if (!inputs.length) throw new LogicError('The expressions have no input.');
  if (inputs.length > maxInputs) throw new LogicError(`${inputs.length} inputs (${inputs.join(', ')}): at most ${maxInputs}.`);
  const table = {}, exprs = {};
  for (const e of eqs) {
    table[e.name] = exprColumn(parseExpr(e.expr, { vars: inputs }), inputs);
    exprs[e.name] = e.expr;
  }
  return { inputs, outputs, table, exprs };
}

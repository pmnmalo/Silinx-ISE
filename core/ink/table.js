// Silinx ink - a truth table drawn by hand read as a table (#1066). The ruling lines are the long straight strokes;
// the rest are the marks, in rows (by height, a horizontal line between two of them splits them) and in columns (the
// cells of the rows below the header, aligned); the header's names are read as words (expression.js), each cell as
// 0, 1 or X only (a ring is 0, a line is 1). The inputs end at a vertical line across the table (in a full grid,
// the double one); with none, the last column is the output. The table is then written as text, for the user to
// correct, and read back from it.
//
//   readTable(strokes, { templates }) -> { text, inputs, outputs, rows, split, warnings, errors }
//   tableText({ inputs, outputs, rows }) -> 'A B | F\n0 0 | 1\n…'
//   tableFromText(text, { maxInputs }) -> { inputs, outputs, table: { out: column }, warnings, errors }
import { segment, boxOf, InkError } from './segment.js';
import { classify } from './pdollar.js';
import { builtinTemplates } from './templates.js';
import { recognizeWords } from './expression.js';
import { NAME_RE } from '../ident.js';

// the cells' symbols, and what is written alike
const CELL = { 0: '0', O: '0', o: '0', 1: '1', l: '1', '|': '1', I: '1', X: 'X', x: 'X', '*': 'X' };
const median = a => [...a].sort((x, y) => x - y)[a.length >> 1];

function strokeInfo(s) {
  let len = 0;
  for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  const box = boxOf([s]);
  return { s, box, len, straight: len ? Math.hypot(s.at(-1).x - s[0].x, s.at(-1).y - s[0].y) / len : 0 };
}

// the ruling lines: long, straight, level or upright (all of them, when nothing else is drawn yet)
function findRules(items) {
  const size = median(items.map(i => Math.max(i.box.w, i.box.h)));
  const level = i => i.box.h <= 0.25 * i.box.w, upright = i => i.box.w <= 0.25 * i.box.h;
  const lines = items.every(i => i.straight >= 0.9 && (level(i) || upright(i)));
  for (const i of items) {
    if (i.straight < 0.9 || (i.len < 2.5 * size && !lines)) continue;
    if (level(i)) i.rule = 'h'; else if (upright(i)) i.rule = 'v';
  }
}

// the marks in rows, from the top: a mark joins the row whose middle is near its own, unless a level line is between;
// the small ones (the base of a 1, a dot) then join the row they are in or nearest
function toRows(marks, hRules, ch) {
  const rows = [];
  const between = (y0, y1, x) => hRules.some(h => h.box.cy > Math.min(y0, y1) && h.box.cy < Math.max(y0, y1) && h.box.minX < x && h.box.maxX > x);
  const add = (r, m) => {
    r.items.push(m);
    const tall = r.items.filter(i => i.box.h >= 0.5 * ch);
    if (tall.length) r.cy = tall.reduce((sum, i) => sum + i.box.cy, 0) / tall.length;
    r.top = Math.min(r.top, m.box.minY); r.bot = Math.max(r.bot, m.box.maxY);
  };
  for (const m of marks.filter(i => i.box.h >= 0.5 * ch).sort((a, b) => a.box.cy - b.box.cy)) {
    const r = rows.at(-1);
    if (r && !between(r.cy, m.box.cy, m.box.cx) && m.box.cy - r.cy <= 0.6 * ch) add(r, m); else rows.push({ items: [m], cy: m.box.cy, top: m.box.minY, bot: m.box.maxY });
  }
  for (const m of marks.filter(i => i.box.h < 0.5 * ch)) {
    const dist = r => (m.box.cy < r.top ? r.top - m.box.cy : m.box.cy > r.bot ? m.box.cy - r.bot : 0);
    const near = rows.filter(r => !between(r.cy, m.box.cy, m.box.cx)).sort((a, b) => dist(a) - dist(b))[0];
    if (near && dist(near) <= 0.6 * ch) add(near, m); else rows.push({ items: [m], cy: m.box.cy, top: m.box.minY, bot: m.box.maxY });
  }
  return rows.sort((a, b) => a.cy - b.cy);
}

// the characters of a row, with their boxes in the drawing (segment's are upright)
function rowChars(row) {
  const strokes = row.items.map(i => i.s);
  return segment(strokes).chars.map(c => ({ strokes: c.strokes, box: boxOf(c.ink.map(k => strokes[k])) }));
}

// the centres of the columns: the cells of the rows below the header, aligned
function columnsOf(bodyChars, ch) {
  const xs = bodyChars.map(c => c.box.cx).sort((a, b) => a - b);
  const cols = [];
  for (const x of xs) { const c = cols.at(-1); if (c && x - c.max <= ch) { c.xs.push(x); c.max = x; } else cols.push({ xs: [x], max: x }); }
  return cols.map(c => c.xs.reduce((s, x) => s + x, 0) / c.xs.length);
}
const nearest = (cols, x) => cols.reduce((b, c, i) => (Math.abs(c - x) < Math.abs(cols[b] - x) ? i : b), 0);

export function readTable(strokes, { templates = builtinTemplates() } = {}) {
  const items = (strokes || []).filter(s => Array.isArray(s) && s.length).map(strokeInfo);
  if (!items.length) throw new InkError('Nothing written: draw the table on the pad.');
  findRules(items);
  const marks = items.filter(i => !i.rule), hRules = items.filter(i => i.rule === 'h'), vRules = items.filter(i => i.rule === 'v');
  const warnings = [], errors = [];
  if (!marks.length) throw new InkError('Only lines: write the names and the values in the table.');
  const ch = median(marks.map(m => m.box.h)) || 1;
  const rows = toRows(marks, hRules, ch);
  if (rows.length < 2) throw new InkError('One row only: write the names in a header and the values in the rows below it.');
  const bodyRows = rows.slice(1).map(rowChars);
  const cols = columnsOf(bodyRows.flat(), ch);
  // the header: one name a column
  const names = cols.map(() => null);
  // (the capitals as tall as the digits below)
  const capH = median(bodyRows.flat().map(c => c.box.h));
  for (const w of recognizeWords(rows[0].items.map(i => i.s), { templates, capH })) {
    const c = nearest(cols, w.box.cx), name = w.text;
    if (names[c] != null) errors.push(`Header: two names over column ${c + 1} (${names[c]}, ${name}).`);
    else names[c] = name;
  }
  // the inputs end at an upright line across the table: the only one, else a double one
  const top = rows[0].top, bottom = rows.at(-1).bot;
  const across = vRules.filter(v => v.box.h >= 0.5 * (bottom - top)).map(v => ({ x: v.box.cx, k: cols.filter(c => c < v.box.cx).length })).filter(v => v.k > 0 && v.k < cols.length);
  const ks = [...new Set(across.map(v => v.k))];
  let split = ks.length === 1 ? ks[0] : null;
  if (ks.length > 1) split = across.find(a => across.some(b => b !== a && b.k === a.k && Math.abs(b.x - a.x) < 0.6 * ch))?.k ?? null;
  if (split == null) {
    split = cols.length - 1;
    warnings.push(ks.length ? 'Lines between all the columns, none double: the last column is the output.' : 'No line between the inputs and the outputs: the last column is the output.');
  }
  // the cells: 0, 1 or X
  const shapes = templates.filter(t => t.ch in CELL);
  const body = bodyRows.map((chars, i) => {
    const cells = cols.map(() => []);
    for (const c of chars) cells[nearest(cols, c.box.cx)].push(c);
    return cells.map((cs, c) => {
      if (cs.length !== 1) { errors.push(`Row ${i + 1}, column ${c + 1}: ${cs.length ? `${cs.length} symbols` : 'no value'}.`); return '?'; }
      return CELL[classify(cs[0].strokes, shapes)[0].ch];
    });
  });
  names.forEach((n, c) => { if (n == null) { names[c] = c < split ? `in${c + 1}` : `out${c + 1 - split}`; warnings.push(`Column ${c + 1} has no name: ${names[c]}.`); } });
  const result = { inputs: names.slice(0, split), outputs: names.slice(split), rows: body, split };
  return { ...result, text: tableText(result), warnings, errors };
}

/** The table as text: the names, a bar between the inputs and the outputs, one row a line. */
export function tableText({ inputs, outputs, rows }) {
  const names = [...inputs, ...outputs], w = names.map(n => Math.max(1, n.length));
  const line = cells => [...cells.slice(0, inputs.length).map((c, i) => String(c).padEnd(w[i])), '|',
    ...cells.slice(inputs.length).map((c, i) => String(c).padEnd(w[inputs.length + i]))].join(' ').trimEnd();
  return [line(names), ...rows.map(line)].join('\n');
}

/** A truth table from its text (tableText's form, or typed): its columns, or the errors. */
export function tableFromText(text, { maxInputs = 6 } = {}) {
  const lines = String(text ?? '').split('\n').map((l, i) => ({ l: l.trim(), n: i + 1 })).filter(x => x.l);
  const errors = [], warnings = [];
  const fail = msg => ({ inputs: [], outputs: [], table: null, warnings, errors: [...errors, msg] });
  if (!lines.length) return fail('The table is empty.');
  const head = lines[0].l.split('|');
  if (head.length !== 2) return fail("Line 1: the names of the inputs, '|', the names of the outputs.");
  const [inputs, outputs] = head.map(h => h.split(/[\s,;]+/).filter(Boolean));
  for (const n of [...inputs, ...outputs]) if (!NAME_RE.test(n)) errors.push(`Line 1: '${n}' is not a name.`);
  const seen = new Set();
  for (const n of [...inputs, ...outputs]) { if (seen.has(n.toLowerCase())) errors.push(`Line 1: '${n}' is named twice.`); seen.add(n.toLowerCase()); }
  if (inputs.length < 1 || inputs.length > maxInputs) errors.push(`1 to ${maxInputs} inputs (the table has ${inputs.length}).`);
  if (outputs.length < 1) errors.push('At least 1 output.');
  if (errors.length) return { inputs, outputs, table: null, warnings, errors };
  const n = inputs.length, cols = outputs.map(() => Array(1 << n).fill(null)), where = new Map();
  for (const { l, n: ln } of lines.slice(1)) {
    const v = l.split(/[\s|,;]+/).filter(Boolean);
    if (v.length !== n + outputs.length) { errors.push(`Line ${ln}: ${v.length} values, ${n + outputs.length} expected.`); continue; }
    const ins = v.slice(0, n), outs = v.slice(n).map(x => x.toUpperCase());
    if (!ins.every(x => x === '0' || x === '1')) { errors.push(`Line ${ln}: an input is '${ins.find(x => x !== '0' && x !== '1')}': only 0 or 1.`); continue; }
    if (!outs.every(x => ['0', '1', 'X'].includes(x))) { errors.push(`Line ${ln}: an output is '${outs.find(x => !['0', '1', 'X'].includes(x))}': only 0, 1 or X.`); continue; }
    const k = parseInt(ins.join(''), 2);
    if (where.has(k)) {
      const differs = outs.some((x, o) => cols[o][k] !== x);
      if (differs) errors.push(`Lines ${where.get(k)} and ${ln}: the inputs ${ins.join('')} with other outputs.`);
      else warnings.push(`Line ${ln} repeats line ${where.get(k)}.`);
      continue;
    }
    where.set(k, ln);
    outs.forEach((x, o) => { cols[o][k] = x; });
  }
  if (errors.length) return { inputs, outputs, table: null, warnings, errors };
  const missing = [...Array(1 << n).keys()].filter(k => !where.has(k)).map(k => k.toString(2).padStart(n, '0'));
  if (missing.length) warnings.push(`Not in the table: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` and ${missing.length - 8} more` : ''} (their outputs are 0).`);
  return { inputs, outputs, table: Object.fromEntries(outputs.map((o, i) => [o, cols[i].map(x => x ?? '0').join('')])), warnings, errors };
}

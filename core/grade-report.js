// Automatic grading (#3192): a submission's result (core/grade.js summarize) as a short text report for its student,
// and many submissions' results as a CSV (one row per submission). A hidden test's report gives its verdict and
// points only, never the expected values. Isomorphic.
import { VERDICTS } from './grade-format.js';

const num = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

// a visible test's first difference: the rows around it, as a small table of the inputs, expected and obtained
function windowLines({ window: w }) {
  const head = `      cycle  ${[...w.inputs, ...w.outputs.map(o => `${o} (expected / obtained)`)].join('  ')}`;
  return [head, ...w.rows.map(r => `      ${String(r.cycle).padStart(5)}  ${[...r.in, ...r.expected.map((e, j) => `${e} / ${r.obtained?.[j] ?? '?'}${r.obtained && e !== r.obtained[j] && [...e].some((c, i) => c !== '-' && c !== r.obtained[j][i]) ? ' <' : ''}`)].join('  ')}`)];
}

/** The text report of a result: the total, the design's messages, then a line per test (with its messages and, for a
 *  visible one, its first difference). */
export function textReport(r) {
  const lines = [`${r.submission}: ${num(r.points)} / ${num(r.max)} points (${r.verdictName})${r.visible ? ', the visible tests' : ''}`];
  if (r.design.verdict) lines.push(`  ${VERDICTS[r.design.verdict]}:`, ...r.design.messages.map(m => `    ${m}`));
  for (const w of r.design.warnings || []) lines.push(`  WARNING: ${w}`);
  for (const t of r.tests) {
    const v = t.verdict ? `${t.verdict} ${VERDICTS[t.verdict]}` : 'not run';
    lines.push(`  ${t.verdict === 'AC' ? '+' : '-'} ${t.id}${t.title && t.title !== t.id ? ` (${t.title})` : ''}: ${v}, ${num(t.points)} / ${num(t.max)}${t.visible ? '' : ' [hidden]'}`);
    if (r.design.verdict) continue;
    if (!t.visible && t.verdict === 'WA') continue;   // (a hidden test: its verdict only)
    for (const m of t.messages) lines.push(`      ${m}`);
    if (t.visible && t.detail?.window) lines.push(...windowLines(t.detail));
  }
  return `${lines.join('\n')}\n`;
}

const cell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@\t]/.test(s) ? `"${(/^[=+\-@\t]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s; };

/** The CSV of many results of one exercise: submission, points, max, verdict, then each test's verdict and points.
 *  A cell a spreadsheet would read as a formula (=, +, -, @) is quoted and starts with an apostrophe. */
export function csvReport(results, ex) {
  const ids = ex.tests.filter(t => results.some(r => r.tests.some(x => x.id === t.id))).map(t => t.id);
  const head = ['submission', 'points', 'max', 'verdict', ...ids.flatMap(id => [id, `${id} points`])];
  const rows = results.map(r => [r.submission, num(r.points), num(r.max), r.verdict,
    ...ids.flatMap(id => { const t = r.tests.find(x => x.id === id); return t ? [t.verdict || '', num(t.points)] : ['', '']; })]);
  return `${[head, ...rows].map(row => row.map(cell).join(',')).join('\n')}\n`;
}

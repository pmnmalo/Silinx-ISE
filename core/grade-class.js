// The class's results of an exercise (#3191, #3864): a teacher's run's JSON (`silinx grade --json`, `silinx classroom
// grade --json`: core/grade.js summarize's results, one per student) read back, checked as results (an untrusted file:
// its shape and sizes; its texts shown as text), and summed up per test (how many students it Accepted, its most
// frequent other verdict, the class's weakest test first) and per student (each test's verdict and points). The
// Results document (web/js/grade-results-view.js) and the MCP server's `grade results` show it. Isomorphic.
import { VERDICTS } from './grade-format.js';
import { csvReport } from './grade-report.js';

const MAX_RESULTS = 5000, MAX_TESTS = 500, MAX_TEXT = 1000;
const CODES = Object.keys(VERDICTS);
const isText = (v, n = MAX_TEXT) => typeof v === 'string' && v.length <= n;
const isNum = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const verdictOk = v => v === null || CODES.includes(v);

/** A results file's text: { results, exercise (its id, or null), problems }. */
export function parseResults(text, where = 'the results') {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { results: [], exercise: null, problems: [`${where}: not JSON (${e.message})`] }; }
  const fail = m => ({ results: [], exercise: null, problems: [`${where}: ${m}`] });
  if (!Array.isArray(data)) return fail('not a list of results (silinx grade --json writes one)');
  if (!data.length) return fail('no result');
  if (data.length > MAX_RESULTS) return fail(`more than ${MAX_RESULTS} results`);
  for (const [k, r] of data.entries()) {
    const at = `result ${k + 1}`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return fail(`${at}: not a result`);
    if (!isText(r.submission) || !r.submission) return fail(`${at}: "submission": a name`);
    if (!isNum(r.points) || !isNum(r.max)) return fail(`${at}: "points" and "max": numbers from 0`);
    if (!CODES.includes(r.verdict)) return fail(`${at}: "verdict": one of ${CODES.join(', ')}`);
    if (!Array.isArray(r.tests) || r.tests.length > MAX_TESTS) return fail(`${at}: "tests": a list of at most ${MAX_TESTS} tests`);
    for (const [j, t] of r.tests.entries()) {
      if (!t || typeof t !== 'object' || !isText(t.id, 100) || !t.id || !verdictOk(t.verdict ?? null) || !isNum(t.points) || !isNum(t.max)) return fail(`${at}: test ${j + 1}: { "id", "verdict", "points", "max" }`);
    }
  }
  const ids = new Set(data.map(r => r.exercise ?? null));
  if (ids.size > 1) return fail(`the results of more than one exercise (${[...ids].join(', ')})`);
  return { results: data, exercise: [...ids][0], problems: [] };
}

const num = n => (Number.isInteger(n) ? n : Math.round(n * 100) / 100);

/**
 * The class's summary: { tests, weakest, students, count, accepted, mean, max }. `tests`: in the exercise's order (`ex`,
 * when given), else as the results first list them; each { id, title, visible, max, graded, accepted, rate, other,
 * counts }; `weakest`: the tests by their rate of Accepted, lowest first (ties in the tests' order); `students`: by
 * name, each { submission, points, max, verdict, tests: { id: { verdict, points } } }.
 */
export function classSummary(results, ex = null) {
  const seen = [];
  for (const r of results) for (const t of r.tests) if (!seen.some(s => s.id === t.id)) seen.push({ id: t.id, title: typeof t.title === 'string' ? t.title : t.id, visible: !!t.visible, max: t.max });
  const order = ex?.tests ? [...ex.tests.filter(t => seen.some(s => s.id === t.id)).map(t => seen.find(s => s.id === t.id)), ...seen.filter(s => !ex.tests.some(t => t.id === s.id))] : seen;
  const tests = order.map(s => {
    const counts = {};
    let graded = 0;
    for (const r of results) {
      const t = r.tests.find(x => x.id === s.id);
      if (!t) continue;
      graded++;
      const v = t.verdict || '-';
      counts[v] = (counts[v] || 0) + 1;
    }
    const accepted = counts.AC || 0;
    // (the most frequent verdict but Accepted; ties in the verdicts' order)
    const other = Object.keys(counts).filter(v => v !== 'AC').sort((a, b) => counts[b] - counts[a] || CODES.indexOf(a) - CODES.indexOf(b))[0] || null;
    return { ...s, graded, accepted, rate: graded ? accepted / graded : 0, other, counts };
  });
  const weakest = [...tests].sort((a, b) => a.rate - b.rate || tests.indexOf(a) - tests.indexOf(b));
  const students = [...results].sort((a, b) => a.submission.localeCompare(b.submission, 'en', { numeric: true }))
    .map(r => ({ submission: r.submission, points: r.points, max: r.max, verdict: r.verdict, tests: Object.fromEntries(r.tests.map(t => [t.id, { verdict: t.verdict ?? null, points: t.points }])) }));
  const mean = num(results.reduce((s, r) => s + r.points, 0) / results.length);
  return { tests, weakest, students, count: results.length, accepted: results.filter(r => r.verdict === 'AC').length, mean, max: Math.max(...results.map(r => r.max)) };
}

/** The class's CSV, as `--csv` writes it, its tests in the summary's order. */
export const classCsv = (results, summary) => csvReport(results, { tests: summary.tests });

/** The summary as text (the MCP's): the class, the tests weakest first, then one line per student. */
export function classText(summary, title = '') {
  const pc = r => `${Math.round(r * 100)}%`;
  const lines = [`${title ? `${title}: ` : ''}${summary.count} student(s), ${summary.accepted} Accepted, mean ${summary.mean} / ${summary.max} points`,
    'The tests, the weakest first:',
    ...summary.weakest.map(t => `  ${t.id}${t.title !== t.id ? ` (${t.title})` : ''}: ${t.accepted} / ${t.graded} Accepted (${pc(t.rate)})${t.other ? `, most often ${t.other} ${VERDICTS[t.other] || 'not run'} (${t.counts[t.other]})` : ''}${t.visible ? '' : ' [hidden]'}`),
    'The students:',
    ...summary.students.map(s => `  ${s.submission}: ${s.points} / ${s.max} (${s.verdict}) ${summary.tests.map(t => `${t.id}=${s.tests[t.id]?.verdict || '-'}`).join(' ')}`)];
  return `${lines.join('\n')}\n`;
}

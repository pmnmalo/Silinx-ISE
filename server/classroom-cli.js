// `silinx classroom` (#3193): GitHub Classroom's assignments graded by Silinx (server/classroom.js).
//   silinx classroom template <exercise.json> [<starter project>] <out folder> [--silinx-version x.y.z]
//                             [--language vhdl|verilog] (no starter: one made from the statement, #3841)
//   silinx classroom grade <exercise.json> --org <organization> --assignment <name> --out <folder>
//                          [--before <date>] [--csv grades.csv] [--json grades.json] [--issues] [--quiet]
// The exit status: 0 when done (grade: every student Accepted), 2 when a student is not, 1 when the command is wrong.
import { makeTemplate, gradeClassroom, WORKFLOW } from './classroom.js';
import { textReport } from '../core/grade-report.js';

const VALUED = ['silinx-version', 'language', 'org', 'assignment', 'out', 'before', 'csv', 'json'];

/** The command's run on its arguments (after `classroom`): the exit status. out / err: where the texts go. runner: the
 *  GitHub CLI's and git's (server/classroom.js RUNNER; a test's own). */
export async function classroomCommand(args, { out, err, runner } = {}) {
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const bad = args.find(a => a.startsWith('--') && !['issues', 'quiet', ...VALUED].includes(a.slice(2)));
  if (bad) { err(`silinx classroom: unknown option ${bad}\n`); return 1; }
  for (const k of VALUED) if (args.includes(`--${k}`) && (!opt(k) || opt(k).startsWith('--'))) { err(`silinx classroom: --${k} needs a value\n`); return 1; }
  const [sub, ...plain] = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]?.slice(2)));
  if (sub === 'template') {
    const [exercise, ...rest] = plain;
    if (rest.length < 1 || rest.length > 2) { err('silinx classroom template: give the exercise, the starter project (or none: one made from the statement) and a new folder for the template\n'); return 1; }
    const [starter, dir] = rest.length === 2 ? rest : [null, rest[0]];
    try {
      const r = makeTemplate(exercise, starter, dir, { ...(opt('silinx-version') && { version: opt('silinx-version') }), ...(opt('language') && { lang: opt('language') }) });
      out(`${dir}: the template of ${r.exerciseFile} (${Object.keys(r.files).length} files: the starter project${starter ? '' : ' made from the statement'}, the visible tests, README.md, ${WORKFLOW})\n`);
      return 0;
    } catch (e) { err(`silinx classroom template: ${e.message}\n`); return 1; }
  }
  if (sub === 'grade') {
    const [exercise] = plain;
    const missing = ['org', 'assignment', 'out'].filter(k => !opt(k));
    if (!exercise || missing.length) { err(`silinx classroom grade: give the exercise${missing.length ? ` and --${missing.join(', --')}` : ''}\n`); return 1; }
    const quiet = args.includes('--quiet');
    let r;
    try {
      r = await gradeClassroom(exercise, { org: opt('org'), assignment: opt('assignment'), outDir: opt('out'), before: opt('before') || null, csv: opt('csv') || null, json: opt('json') || null,
        issues: args.includes('--issues'), ...(runner && { runner }), onResult: x => { if (!quiet) out(textReport(x)); } });
    } catch (e) { err(`silinx classroom grade: ${String(e.stderr || e.message).trim()}\n`); return 1; }
    if (r.problems.length) { err(`${r.problems.join('\n')}\n`); return 1; }
    const ok = r.results.filter(x => x.verdict === 'AC').length;
    out(`${ok} of ${r.results.length} student(s) Accepted${opt('csv') ? `; ${opt('csv')}` : ''}${args.includes('--issues') ? `; an issue in each repository` : ''}\n`);
    return ok === r.results.length ? 0 : 2;
  }
  err('silinx classroom: template or grade (silinx help)\n');
  return 1;
}

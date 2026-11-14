// `silinx grade` (#3192): an exercise's tests over submissions (server/grade.js), a text report per submission on
// stdout, the results as JSON (--json), as a CSV (--csv) and as GitHub's workflow commands, an annotation per verdict
// (--annotations, #3194: the Classroom workflow's); --visible, the visible tests only (a student's run);
// --student-copy, the exercise without its hidden tests and its reference (the student's copy, #3193). The exit status:
// 0 when every submission is Accepted, 2 when one is not, 1 when the exercise or the command is wrong.
import fs from 'node:fs';
import { gradeAll, loadExercise } from './grade.js';
import { textReport, csvReport } from '../core/grade-report.js';
import { annotationsText } from '../core/grade-annotations.js';
import { visibleCopy } from '../core/grade-format.js';

const VALUED = ['json', 'csv', 'annotations', 'student-copy'];

/** The command's run on its arguments: the exit status. out / err: where the texts go. */
export async function gradeCommand(args, { out, err }) {
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const bad = args.find(a => a.startsWith('--') && !['visible', 'quiet', ...VALUED].includes(a.slice(2)));
  if (bad) { err(`silinx grade: unknown option ${bad}\n`); return 1; }
  for (const k of VALUED) if (args.includes(`--${k}`) && (!opt(k) || opt(k).startsWith('--'))) { err(`silinx grade: --${k} needs a file\n`); return 1; }
  const plain = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]?.slice(2)));
  const [exercise, ...subs] = plain;
  if (!exercise) { err('silinx grade: give the exercise (a .exercise.json) and the submissions\n'); return 1; }
  const copy = opt('student-copy');
  if (copy) {
    const { exercise: ex, problems } = loadExercise(exercise);
    if (!ex) { err(`${problems.join('\n')}\n`); return 1; }
    fs.writeFileSync(copy, `${JSON.stringify(visibleCopy(ex), null, 2)}\n`);
    out(`${copy}: ${ex.id} with its ${visibleCopy(ex).tests.length} visible test(s), no hidden test and no reference\n`);
    return 0;
  }
  if (!subs.length) { err('silinx grade: give the submissions (project folders, zips, or a folder of them)\n'); return 1; }
  const quiet = args.includes('--quiet');
  const { results, problems, exercise: ex } = await gradeAll(exercise, subs, { visible: args.includes('--visible'), onResult: r => { if (!quiet) out(textReport(r)); } });
  if (problems.length) { err(`${problems.join('\n')}\n`); return 1; }
  if (opt('json')) fs.writeFileSync(opt('json'), `${JSON.stringify(results, null, 2)}\n`);
  if (opt('csv')) fs.writeFileSync(opt('csv'), csvReport(results, ex));
  if (opt('annotations')) fs.writeFileSync(opt('annotations'), annotationsText(results));
  const ok = results.filter(r => r.verdict === 'AC').length;
  out(`${ok} of ${results.length} submission(s) Accepted\n`);
  return ok === results.length ? 0 : 2;
}

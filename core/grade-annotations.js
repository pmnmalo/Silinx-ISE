// Automatic grading with GitHub Classroom (#3194, #3193): a submission's result as GitHub's workflow commands, one
// annotation per verdict, which GitHub keeps with the commit's check run and its API gives back (core/github-checks.js:
// Silinx's Git ▸ Checks reads them). The total first, then each test: an error when it is not Accepted, a notice when it
// is. GitHub keeps ten errors and ten notices of a step: the failed tests come first, and what is left over is said in
// the total. A design's names and messages are the student's text: every value is escaped as GitHub's workflow commands
// ask (% CR LF, and , : in a property), so no text can end the command and write one of its own. Isomorphic.
import { VERDICTS } from './grade-format.js';

const LIMIT = 10;   // (GitHub's annotations of each kind per step)
const num = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));
const data = s => String(s ?? '').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const prop = s => data(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
const command = (kind, title, message) => `::${kind} title=${prop(title)}::${data(message)}`;

/** The workflow commands of one result (core/grade.js summarize): an array of lines. */
export function annotations(r) {
  const failed = r.tests.filter(t => t.verdict !== 'AC'), passed = r.tests.filter(t => t.verdict === 'AC');
  const kind = r.verdict === 'AC' ? 'notice' : 'error';   // (the total takes one of its kind's ten)
  const errors = failed.slice(0, LIMIT - (kind === 'error')), notices = passed.slice(0, LIMIT - (kind === 'notice'));
  const left = r.tests.length - errors.length - notices.length;
  const design = r.design.verdict && r.design.messages.length ? ` (${r.design.messages[0]})` : '';
  const total = `${num(r.points)} / ${num(r.max)} points, ${r.verdictName}${design}${left ? ` (${left} more test(s) in the run's summary)` : ''}`;
  const line = t => {
    const v = t.verdict ? `${t.verdict} ${VERDICTS[t.verdict]}` : 'not run';
    const said = r.design.verdict ? [] : t.messages;
    return `${v}, ${num(t.points)} / ${num(t.max)}${said.length ? `: ${said.join(' ')}` : ''}`;
  };
  return [command(kind, `Silinx: ${r.exercise}`, total),
    ...errors.map(t => command('error', `Silinx: ${t.id}`, line(t))),
    ...notices.map(t => command('notice', `Silinx: ${t.id}`, line(t)))];
}

/** The annotations' text of several results, one command per line. */
export const annotationsText = results => `${results.flatMap(annotations).join('\n')}\n`;

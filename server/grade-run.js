// Automatic grading (#3192): one grading process (server/grade.js starts it, with its heap limited and Node's permission
// model where there is one). Its job comes on stdin as JSON, its results go to stdout one JSON line each:
//   { type: 'grade', exercise, submission: { project, files: [[path, text]] }, from, visible, vectors, exerciseUnits }
//     -> { type: 'design', design }, then per test { type: 'start', k } and { type: 'test', k, result }
//   { type: 'reference', exercise, test } -> { type: 'vectors', vectors } (a reference test's expected rows)
//   { type: 'expected', exercise, test } -> { type: 'expected', expected } (a vectors test filled from the reference, #3831)
// Whatever a module prints goes to stderr: stdout is the protocol's.
import { gradeTests, referenceVectors } from '../core/grade.js';
import { prepareDesign } from '../core/grade-design.js';
import { expectedFromReference } from '../core/grade-author.js';

const send = m => process.stdout.write(`${JSON.stringify(m)}\n`);
console.log = console.info = console.warn = (...a) => process.stderr.write(`${a.join(' ')}\n`);

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
const job = JSON.parse(input);
const ex = job.exercise;
if (job.type === 'reference') {
  send({ type: 'vectors', vectors: referenceVectors(ex, ex.tests.find(t => t.id === job.test)) });
} else if (job.type === 'expected') {
  send({ type: 'expected', expected: expectedFromReference(ex, job.test) });
} else {
  const submission = { project: job.submission.project, files: new Map(job.submission.files) };
  const exerciseUnits = new Set(job.exerciseUnits || []);
  const prep = prepareDesign(ex, submission, { exerciseUnits });
  send({ type: 'design', design: { verdict: prep.verdict, messages: prep.messages, warnings: prep.warnings } });
  let synth = null;
  const synthesize = async (sources, top, test) => {
    synth ||= await import('./grade-synth.js');
    return synth.synthesize(sources, top, test, { ...(ex.device && { device: ex.device }), status: job.synthesis });
  };
  // (the equivalence tests' Yosys, #3217)
  const yosys = async (...a) => (await import('../packages/silinx-fpga/src/node.js')).yosysNode(...a);
  await gradeTests(ex, submission, { from: job.from || 0, vectors: job.vectors || {}, exerciseUnits, synthesize, yosys, prepared: prep,
    onStart: k => send({ type: 'start', k }), onTest: (k, result) => send({ type: 'test', k, result }) });
}

// A submission's verdicts as GitHub's annotations (#3194, core/grade-annotations.js, `silinx grade --annotations`):
// - the total first, then the failed tests as errors and the passed ones as notices, their messages;
// - GitHub's ten of each kind per step: the total takes one, the failed first, what is left said in the total;
// - a design's verdict (Compile Error): its first message in the total, no test's messages;
// - the student's text escaped as GitHub's workflow commands ask: no text writes a command of its own (an independent
//   reader of the commands, as GitHub's runner parses them, gives back the text as it was);
// - the CLI on the shipped exercise's template (the workflow's run): the file, the exit status.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { annotations, annotationsText } from '../core/grade-annotations.js';
import { gradeCommand } from '../server/grade-cli.js';
import { makeTemplate } from '../server/classroom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let tmp;
before(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-annotations-'))); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const t = (id, verdict, points, max, messages = []) => ({ id, title: id, visible: true, verdict, points, max, messages });
const result = (tests, { verdict, design = { verdict: null, messages: [] } } = {}) => {
  const points = tests.reduce((s, x) => s + x.points, 0), max = tests.reduce((s, x) => s + x.max, 0);
  verdict ||= design.verdict || (tests.every(x => x.verdict === 'AC') ? 'AC' : tests.find(x => x.verdict !== 'AC').verdict);
  const names = { AC: 'Accepted', WA: 'Wrong Answer', CE: 'Compile Error' };
  return { submission: 's', exercise: 'ex1', visible: true, verdict, verdictName: names[verdict], points, max, design, tests };
};

// GitHub's runner's reading of a line (its ActionCommand parser): ::name key=value,key=value::message, unescaped
function parse(line) {
  const m = /^::([a-z-]+)(?: ([^:]*))?::(.*)$/.exec(line);
  if (!m) return null;
  const un = s => s.replace(/%0D/g, '\r').replace(/%0A/g, '\n').replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%25/g, '%');
  const props = Object.fromEntries((m[2] || '').split(',').filter(Boolean).map(kv => { const i = kv.indexOf('='); return [kv.slice(0, i), un(kv.slice(i + 1))]; }));
  return { name: m[1], props, message: m[3].replace(/%0D/g, '\r').replace(/%0A/g, '\n').replace(/%25/g, '%') };
}

test('#3194 the total, then the failed tests as errors and the passed as notices, with their messages', () => {
  const lines = annotations(result([t('count', 'WA', 0, 30, ['cycle 1: q is 0000, expected 0001']), t('impl', 'AC', 10, 10)]));
  assert.deepEqual(lines, [
    '::error title=Silinx%3A ex1::10 / 40 points, Wrong Answer',
    '::error title=Silinx%3A count::WA Wrong Answer, 0 / 30: cycle 1: q is 0000, expected 0001',
    '::notice title=Silinx%3A impl::AC Accepted, 10 / 10',
  ]);
  assert.deepEqual(annotations(result([t('a', 'AC', 2.5, 2.5)])), ['::notice title=Silinx%3A ex1::2.5 / 2.5 points, Accepted', '::notice title=Silinx%3A a::AC Accepted, 2.5 / 2.5']);
  assert.equal(annotationsText([result([t('a', 'AC', 1, 1)]), result([t('b', 'AC', 1, 1)])]).split('\n').length, 5);
});

test('#3194 GitHub\'s ten of each kind per step: the total takes one, the failed first, the rest said in the total', () => {
  const many = result([...Array.from({ length: 12 }, (_, i) => t(`w${i}`, 'WA', 0, 1)), ...Array.from({ length: 12 }, (_, i) => t(`a${i}`, 'AC', 1, 1))]);
  const lines = annotations(many).map(parse);
  assert.deepEqual([lines.filter(l => l.name === 'error').length, lines.filter(l => l.name === 'notice').length], [10, 10]);
  assert.equal(lines[0].message, '12 / 24 points, Wrong Answer (5 more test(s) in the run\'s summary)');
  assert.deepEqual(lines.slice(1, 10).map(l => l.props.title), Array.from({ length: 9 }, (_, i) => `Silinx: w${i}`));
  const passed = annotations(result(Array.from({ length: 11 }, (_, i) => t(`a${i}`, 'AC', 1, 1)))).map(parse);
  assert.deepEqual([passed.length, passed[0].message], [10, '11 / 11 points, Accepted (2 more test(s) in the run\'s summary)']);
});

test('#3194 a design\'s verdict: its first message in the total, no test\'s messages', () => {
  const r = result([t('count', 'CE', 0, 30, ['not run'])], { design: { verdict: 'CE', messages: ['counter4.vhd:3: syntax error', 'another'] } });
  assert.deepEqual(annotations(r), [
    '::error title=Silinx%3A ex1::0 / 30 points, Compile Error (counter4.vhd:3: syntax error)',
    '::error title=Silinx%3A count::CE Compile Error, 0 / 30',
  ]);
});

test('#3194 the student\'s text escaped: no line break, no command of its own, the text given back as it was', () => {
  const evil = 'q is 1%0A\n::add-mask::x\r\n::set-output name=a::b, c: d';
  const lines = annotations(result([t('x,y:z\n::warning::w', 'WA', 0, 1, [evil])]));
  assert.equal(lines.length, 2);
  for (const l of lines) assert.doesNotMatch(l, /[\r\n]/);
  const [, test1] = lines.map(parse);
  assert.deepEqual([test1.name, test1.props.title, test1.message, Object.keys(test1.props)], ['error', 'Silinx: x,y:z\n::warning::w', `WA Wrong Answer, 0 / 1: ${evil}`, ['title']]);
});

test('#3194 silinx grade --annotations on the template of the shipped exercise (the workflow\'s run)', { timeout: 120000 }, async () => {
  const dir = path.join(tmp, 'template');
  makeTemplate(path.join(ROOT, 'exercises/counter4/counter4.exercise.json'), path.join(ROOT, 'exercises/counter4/starter'), dir);
  const file = path.join(tmp, 'annotations.txt');
  let out = '', err = '';
  const code = await gradeCommand([path.join(dir, 'counter4.exercise.json'), dir, '--visible', '--quiet', '--annotations', file], { out: s => { out += s; }, err: s => { err += s; } });
  assert.deepEqual([code, out, err], [2, '0 of 1 submission(s) Accepted\n', '']);
  assert.equal(fs.readFileSync(file, 'utf8'), [
    '::error title=Silinx%3A counter4::10 / 40 points, Wrong Answer',
    '::error title=Silinx%3A count::WA Wrong Answer, 0 / 30: cycle 1 (vectors line 4): q is 0000, expected 0001',
    '::notice title=Silinx%3A impl::AC Accepted, 10 / 10', ''].join('\n'));
  const run = async args => { let e = ''; const c = await gradeCommand(args, { out: () => {}, err: s => { e += s; } }); return [c, e]; };
  assert.deepEqual(await run([path.join(dir, 'counter4.exercise.json'), dir, '--annotations']), [1, 'silinx grade: --annotations needs a file\n']);
});

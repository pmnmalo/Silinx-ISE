// The guided labs' runner (core/labs.js, core/labs-check.js, #3179): the lab file's problems, its texts in a language,
// the labs a project lists, the progress (a try recorded, the next step), and each check on a right and a wrong
// project (the gates example as it is and changed), with its exact reasons; the shipped labs valid, each on its example.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAB_VERSION, PROGRESS_FILE, checkLines, checkStep, isLabFile, labProblems, labProgress, listLabs, localize, nextOpen, parseLab, parseProgress, progressText, recordTry, stepOf } from '../core/labs.js';
import { CHECKS, exactly, expectedBits, pattern } from '../core/labs-check.js';
import { LABS } from '../core/labs-shipped.js';
import { EXAMPLE_ORDER } from '../core/examples.js';

const EX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'examples');

// an example as a lab's `io` reads it, its files changed by `edits` ({ path: text | (text => text) }, null: removed)
function exampleIo(name, edits = {}, json = {}) {
  const dir = path.join(EX, name);
  const pj = { ...JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')), ...json };
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(dir, path.join(d, e.name)).split(path.sep).join('/')]));
  const files = new Set(walk(dir).filter(f => f !== 'silinx.json'));
  for (const [f, v] of Object.entries(edits)) (v === null ? files.delete(f) : files.add(f));
  const read = f => {
    if (!files.has(f)) throw new Error(`no file ${f}`);
    const e = edits[f];
    const disk = () => fs.readFileSync(path.join(dir, f), 'utf8');
    return typeof e === 'string' ? e : typeof e === 'function' ? e(disk()) : disk();
  };
  return {
    project: async () => pj, files: async () => [...files].sort(), read: async f => read(f),
    sources: async sim => pj.files.filter(f => /^(vhdl|verilog)$/.test(f.lang) && files.has(f.path) && (sim || f.role !== 'sim')).map(f => ({ ...f, role: f.role || 'design', text: read(f.path) })),
  };
}
const run = async (c, io) => { assert.deepEqual(CHECKS[c.check].problems(c), [], `${c.check}: a valid check`); return CHECKS[c.check].run(c, io); };
const EVEN = (expr = 'not d') => vhd => vhd.replace('led : out std_logic_vector(1 downto 0)', 'led : out std_logic_vector(1 downto 0);\n    even : out std_logic')
  .replace('begin\n  d <=', `begin\n  even <= ${expr};\n  d <=`);
const gates = exampleIo('gates');

test('a lab\'s texts: one string, or { en, pt } in the language asked, else English', () => {
  assert.equal(localize('Hello', 'pt'), 'Hello');
  assert.equal(localize({ en: 'Hello', pt: 'Olá' }, 'pt'), 'Olá');
  assert.equal(localize({ en: 'Hello', pt: 'Olá' }, 'fr'), 'Hello');
  assert.equal(localize({ pt: 'Olá' }, 'en'), 'Olá');
  assert.equal(localize(undefined), '');
});

test('a lab file\'s problems: its version, id, title, steps, each step\'s fields and checks', () => {
  const good = { silinxLab: LAB_VERSION, id: 'a-1', title: 'A', points: 10, steps: [{ id: 's', title: 'S', text: 'T', checks: [{ check: 'file', path: 'x' }] }] };
  assert.deepEqual(labProblems(good), [], 'a key it does not know (points, for grading later) is kept');
  assert.deepEqual(labProblems([]), ['the lab: not a lab (a JSON object)']);
  assert.deepEqual(labProblems({ ...good, silinxLab: 2, id: 'a b', title: 3 }, 'x.lab.json'), ['x.lab.json: "silinxLab": 1 expected', 'x.lab.json: "id": letters, digits, - and _ (at most 64)', 'x.lab.json: "title": a text, or { "en": …, "pt": … }']);
  assert.deepEqual(labProblems({ ...good, steps: [] }), ['the lab: "steps": a list of steps']);
  assert.deepEqual(labProblems({ ...good, steps: [{ id: 's', title: 'S', text: 'T' }, { id: 's', title: { en: 1 }, text: 'T', hint: [], checks: {} }] }),
    ['the lab: step 2: the id \'s\' is another step\'s', 'the lab: step 2: "title": a text', 'the lab: step 2: "hint": a text', 'the lab: step 2: "checks": a list']);
  assert.deepEqual(labProblems({ ...good, steps: [{ id: 's', title: 'S', text: 'T', checks: [{ check: 'grade' }, { check: 'file' }, { check: 'syntax', warnings: ['/(/'] },
    { check: 'simulate', time_ns: -1, values: [{ signal: 'a' }], messages: 'x' }, { check: 'project' }, { check: 'module', ports: [{}] }] }] }), [
    'the lab: step 1, check 1: "check": one of project, file, module, syntax, simulate',
    'the lab: step 1, check 2 (file): "path": the file',
    'the lab: step 1, check 3 (syntax): "warnings": \'/(/\' is not a regular expression',
    'the lab: step 1, check 4 (simulate): "time_ns": from 0 to 1000000 ns', 'the lab: step 1, check 4 (simulate): "values": a list of { "signal", "at_ns", "value" }', 'the lab: step 1, check 4 (simulate): "messages": a list of patterns',
    'the lab: step 1, check 5 (project): one of "top", "simTop", "board", "part"',
    'the lab: step 1, check 6 (module): "name": the module', 'the lab: step 1, check 6 (module): "ports": a list of { "name", "dir", "width" }']);
  assert.deepEqual(parseLab('{', 'l.lab.json').problems.length, 1);
  assert.match(parseLab('{', 'l.lab.json').problems[0], /^l\.lab\.json: not JSON/);
  assert.equal(parseLab(JSON.stringify(good)).lab.id, 'a-1');
  assert.ok(isLabFile('labs/x.lab.json') && !isLabFile('labs/sub/x.lab.json') && !isLabFile('x.lab.json') && !isLabFile('labs/progress.json'));
});

test('the shipped labs: valid, each on an example, every text in English and Portuguese, the ids their own', () => {
  assert.ok(LABS.length >= 1);
  assert.equal(new Set(LABS.map(l => l.id)).size, LABS.length);
  for (const lab of LABS) {
    assert.deepEqual(labProblems(lab, lab.id), []);
    assert.ok(EXAMPLE_ORDER.includes(lab.example), `${lab.id}: an example`);
    const texts = [lab.title, lab.intro, ...lab.steps.flatMap(s => [s.title, s.text, s.hint])];
    for (const t of texts) assert.ok(t && typeof t.en === 'string' && typeof t.pt === 'string' && t.en !== t.pt, `${lab.id}: ${JSON.stringify(t)}`);
  }
});

test('the labs a project lists: its own (a teacher\'s version of a shipped one replacing it), then the shipped ones, its example\'s first', async () => {
  const other = { ...LABS[0], id: 'other', example: 'traffic' };
  const mine = { silinxLab: 1, id: 'gates-first-steps', title: 'Mine', steps: [{ id: 'a', title: 'A', text: 'A' }] };
  const files = { 'labs/a.lab.json': JSON.stringify(mine), 'labs/b.lab.json': 'no', 'labs/progress.json': '{}', 'src/x.lab.json': '{}' };
  const r = await listLabs(Object.keys(files), async f => files[f], { example: 'traffic', shipped: [LABS[0], other] });
  assert.deepEqual(r.labs.map(l => [l.id, l.source, l.lab.title]), [['gates-first-steps', 'labs/a.lab.json', 'Mine'], ['other', 'silinx', LABS[0].title]]);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /^labs\/b\.lab\.json: not JSON/);
  assert.deepEqual((await listLabs([], null, { example: 'traffic', shipped: [LABS[0], other] })).labs.map(l => l.id), ['other', 'gates-first-steps']);
  assert.deepEqual((await listLabs(['labs/c.lab.json'], async () => { throw new Error('x'); })).problems, ['labs/c.lab.json: cannot be read']);
});

test('the progress: a try recorded (done, or counted), the step a lab is at, the next step not done, its file', () => {
  const lab = LABS[0];
  const all = parseProgress('{"other": {"step": 1}}');
  const p = labProgress(all, lab);
  assert.deepEqual(p, { step: 1, done: {}, tries: {} });
  assert.equal(labProgress(all, lab), p, 'the same record: changes through it are kept');
  recordTry(all, lab, stepOf(lab, 'syntax'), true, 't1');
  recordTry(all, lab, stepOf(lab, 4), false);
  recordTry(all, lab, stepOf(lab, 'even'), false);
  assert.deepEqual(all[lab.id], { step: 1, done: { syntax: 't1' }, tries: { even: 2 } });
  recordTry(all, lab, stepOf(lab, 'syntax'), true, 't2');
  assert.equal(all[lab.id].done.syntax, 't1', 'done at its first pass');
  assert.equal(nextOpen(lab, p, 1), 3, 'after step 1: step 2 done, step 3');
  assert.equal(nextOpen(lab, p, 5), 1, 'after the last: the first not done');
  for (const s of lab.steps) recordTry(all, lab, s, true);
  assert.equal(nextOpen(lab, p, 2), null);
  recordTry(all, lab, stepOf(lab, 'pin'), false);
  assert.equal(p.done.pin, undefined, 'a step that fails again is not done');
  assert.equal(stepOf(lab, 9), null);
  assert.equal(stepOf(lab, 'x'), null);
  assert.deepEqual(parseProgress('[1]'), {});
  assert.deepEqual(parseProgress('no'), {});
  assert.deepEqual(labProgress({ [lab.id]: { step: 99, done: [], tries: 'x' } }, lab), { step: 1, done: {}, tries: {} });
  assert.equal(progressText({ a: 1 }), '{\n  "a": 1\n}\n');
  assert.equal(PROGRESS_FILE, 'labs/progress.json');
});

test('patterns: a text found in a message (case ignored) or /regex/; exactly these messages', () => {
  assert.ok(pattern('finished ok').test('Simulation finished OK'));
  assert.ok(!pattern('/^finished/').test('Simulation finished'));
  assert.ok(pattern('/LOC\\s*=\\s*"P7"/i').test('net "even" loc = "P7";'));
  assert.equal(pattern('/(/'), null);
  assert.deepEqual(exactly(['a1', 'b2'], ['a', '/b\\d/'], 'warning'), []);
  assert.deepEqual(exactly(['a1', 'a2'], ['a'], 'warning'), ['another warning: a2']);
  assert.deepEqual(exactly(['a1'], [], 'warning'), ['a warning: a1']);
  assert.deepEqual(exactly([], ['x'], 'warning'), ['no warning like \'x\'']);
});

test('the expected value of a signal: bits, a hexadecimal, a number (to its width), as VHDL writes them', () => {
  assert.equal(expectedBits('0010', 4), '0010');
  assert.equal(expectedBits('"0010"', 4), '0010');
  assert.equal(expectedBits("'1'", 1), '1');
  assert.equal(expectedBits('x', 1), 'X');
  assert.equal(expectedBits('0x2a', 8), '00101010');
  assert.equal(expectedBits(5, 4), '0101');
  assert.equal(expectedBits(-1, 3), '111');
  assert.equal(expectedBits('1010_0101', 8), '10100101');
});

test('check project: the top, the test bench, the board, the part', async () => {
  assert.deepEqual(await run({ check: 'project', top: 'gates', simTop: 'tb_gates', board: 'basys2', part: 'xc3s250e' }, gates), []);
  assert.deepEqual(await run({ check: 'project', top: 'GATES' }, gates), [], 'a name\'s case is VHDL\'s');
  assert.deepEqual(await run({ check: 'project', top: 'x', board: 'nexys2' }, exampleIo('gates', {}, { top: null })),
    ['the project\'s top module is not set, not \'x\'', 'the project\'s board is \'basys2\', not \'nexys2\'']);
});

test('check file: there, and its text like every pattern', async () => {
  assert.deepEqual(await run({ check: 'file', path: 'src/gates.sch.json' }, gates), []);
  assert.deepEqual(await run({ check: 'file', path: 'src/x.vhd' }, gates), ['the project has no file src/x.vhd']);
  assert.deepEqual(await run({ check: 'file', path: 'constraints/gates.ucf', contains: ['led<0>', '/LOC = "M5"/'] }, gates), []);
  assert.deepEqual(await run({ check: 'file', path: 'constraints/gates.ucf', contains: ['led<0>', 'even'] }, gates), ['constraints/gates.ucf has nothing like \'even\'']);
});

test('check module: its ports, their directions and widths, only those; a module not there or that does not compile', async () => {
  const ports = [{ name: 'sw', dir: 'in', width: 4 }, { name: 'led', dir: 'out', width: 2 }];
  assert.deepEqual(await run({ check: 'module', name: 'gates', ports, only: true }, gates), []);
  assert.deepEqual(await run({ check: 'module', name: 'gates', ports: [{ name: 'SW', dir: 'out', width: 3 }, { name: 'even' }] }, gates),
    ['port SW of gates is an in port, not out', 'port SW of gates is 4 bit(s) wide, not 3', 'module gates has no port even']);
  const even = exampleIo('gates', { 'src/gates.vhd': EVEN() });
  assert.deepEqual(await run({ check: 'module', name: 'gates', ports: [...ports, { name: 'even', dir: 'out', width: 1 }] }, even), []);
  assert.deepEqual(await run({ check: 'module', name: 'gates', ports, only: true }, even), ['module gates has a port even more']);
  assert.deepEqual(await run({ check: 'module', name: 'nothing' }, gates), ['there is no module nothing']);
  const broken = exampleIo('gates', { 'src/gates.vhd': v => v.replace('c_n <= not c;', 'c_n <= not ;') });
  const r = await run({ check: 'module', name: 'gates' }, broken);
  assert.equal(r.length, 1);
  assert.match(r[0], /^module gates does not compile: "src\/gates\.vhd" Line \d+: /);
});

test('check syntax: no warnings, exactly the warnings given, its errors; the simulation view', async () => {
  assert.deepEqual(await run({ check: 'syntax' }, gates), []);
  assert.deepEqual(await run({ check: 'syntax', simulation: true }, gates), []);
  // a signal never read: Check Syntax's warning (core/lint.js)
  const unused = exampleIo('gates', { 'src/gates.vhd': v => v.replace('signal d : std_logic;', 'signal d : std_logic;\n  signal spare : std_logic;').replace('begin\n  d <=', "begin\n  spare <= '1';\n  d <=") });
  const w = await run({ check: 'syntax' }, unused);
  assert.equal(w.length, 1);
  assert.match(w[0], /^a warning of Check Syntax: "src\/gates\.vhd" Line \d+: .*spare/);
  assert.deepEqual(await run({ check: 'syntax', warnings: ['spare'] }, unused), []);
  assert.deepEqual(await run({ check: 'syntax', warnings: ['spare', 'other'] }, unused), ['no warning of Check Syntax like \'other\'']);
  const broken = exampleIo('gates', { 'src/gates.vhd': v => v.replace('c_n <= not c;', 'c_n <= not ;') });
  assert.match((await run({ check: 'syntax' }, broken))[0], /^Check Syntax of gates fails: "src\/gates\.vhd" Line \d+: /);
  assert.deepEqual(await run({ check: 'syntax' }, exampleIo('gates', {}, { top: null })), ['the project has no top module']);
  assert.deepEqual(await run({ check: 'syntax', top: 'nothing' }, gates), ['Check Syntax of nothing fails: no module nothing']);
});

test('check simulate: values at times (of the test bench, through an instance), its messages, its errors', async () => {
  assert.deepEqual(await run({ check: 'simulate', time_ns: 200, values: [{ signal: 'sw', at_ns: 25, value: '0010' }, { signal: 'led', at_ns: 25, value: '11' }, { signal: 'uut/led', at_ns: 5, value: 0 }, { signal: 'led', at_ns: 135, value: '0x3' }], messages: ['Simulation finished OK'] }, gates), []);
  assert.deepEqual(await run({ check: 'simulate', time_ns: 200, values: [{ signal: 'led', at_ns: 5, value: '11' }, { signal: 'nothing', at_ns: 5, value: '1' }], messages: ['/^never$/'] }, gates),
    ['led is 00 at 5 ns, not 11', 'there is no signal nothing in tb_gates', 'the simulation printed nothing like \'/^never$/\'']);
  // a wrong design (11 not a prime): the test bench's errors are the check's, unless errors is true
  const wrong = exampleIo('gates', { 'src/gates.vhd': v => v.replace('prime_sop <= p1 or p2 or p3 or p4;', 'prime_sop <= p1 or p2 or p3;') });
  const r = await run({ check: 'simulate', time_ns: 200 }, wrong);
  assert.deepEqual(r, ['the simulation reported an error at 120 ns: ERROR: prime_sop (LD0) for 11 is \'0\', expected \'1\'', 'the simulation reported an error at 160 ns: ERROR: 1 wrong output(s)']);
  assert.deepEqual(await run({ check: 'simulate', time_ns: 200, errors: true }, wrong), []);
  assert.deepEqual(await run({ check: 'simulate' }, exampleIo('gates', {}, { simTop: null })), ['the project has no test bench (its simulation top)']);
  const broken = exampleIo('gates', { 'sim/tb_gates.vhd': v => v.replace('wait for 10 ns;', 'wait for ;') });
  assert.match((await run({ check: 'simulate' }, broken))[0], /^the simulation of tb_gates does not start: "sim\/tb_gates\.vhd" Line \d+: /);
});

test('a step checked: all its checks, each one\'s reasons; a step with none passes; the console\'s lines', async () => {
  const lab = LABS[0];
  const step = stepOf(lab, 'even');
  const no = await checkStep(step, gates);
  assert.deepEqual(no, { ok: false, results: [{ check: 'module', ok: false, reasons: ['module gates has no port even'] }, { check: 'simulate', ok: false, reasons: ['there is no signal uut/even in tb_gates'] }] }, 'a reason said once');
  assert.deepEqual(checkLines(lab, step, no), ['Lab "First steps", step 4 of 5: Add an output', 'WARNING: module gates has no port even', 'WARNING: there is no signal uut/even in tb_gates', 'Not done yet (2 problem(s)).']);
  assert.equal(checkLines(lab, step, no, 'pt')[0], 'Lab "Primeiros passos", step 4 of 5: Acrescentar uma saída');
  const yes = await checkStep(step, exampleIo('gates', { 'src/gates.vhd': EVEN() }));
  assert.equal(yes.ok, true);
  assert.equal(checkLines(lab, step, yes).at(-1), 'Step done.');
  assert.deepEqual(await checkStep({ id: 'r', title: 'R', text: 'R' }, gates), { ok: true, results: [] });
  // a check that throws (a project that cannot be read): its message the reason
  const failing = { project: async () => { throw new Error('cannot read silinx.json'); } };
  assert.deepEqual(await checkStep({ checks: [{ check: 'project', top: 'x' }] }, failing), { ok: false, results: [{ check: 'project', ok: false, reasons: ['cannot read silinx.json'] }] });
});

test('the gates lab on its example: the first three steps pass as it is, the last two after their actions, not after wrong ones', async () => {
  const lab = LABS.find(l => l.id === 'gates-first-steps');
  const done = async io => { const out = []; for (const s of lab.steps) out.push((await checkStep(s, io)).ok); return out; };
  assert.deepEqual(await done(gates), [true, true, true, false, false]);
  const ucf = v => `${v}NET "even" LOC = "P7" ;\n`;
  assert.deepEqual(await done(exampleIo('gates', { 'src/gates.vhd': EVEN() })), [true, true, true, true, false]);
  assert.deepEqual(await done(exampleIo('gates', { 'src/gates.vhd': EVEN(), 'constraints/gates.ucf': ucf })), [true, true, true, true, true]);
  // wrong: even = d; the pin of LD1 (M11); the port named odd
  assert.deepEqual(await done(exampleIo('gates', { 'src/gates.vhd': EVEN('d'), 'constraints/gates.ucf': v => `${v}NET "even" LOC = "M11" ;\n` })), [true, true, true, false, false]);
  assert.deepEqual(await done(exampleIo('gates', { 'src/gates.vhd': v => EVEN()(v).replace(/even/g, 'odd') })), [true, true, true, false, false]);
});

// An exercise packaged for its students (#3841, core/grade-package.js): the starter project made from the statement
// (compiled, elaborated with the statement's ports and graded, in VHDL and Verilog: a Wrong Answer, never a Compile or
// Interface Error), and the Classroom template's files: the same as server/classroom.js makeTemplate writes, nothing
// hidden in them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { starterProject, templateFiles, besideFiles } from '../core/grade-package.js';
import { gradeTests } from '../core/grade.js';
import { portProblems } from '../core/grade-design.js';
import { compile, elaborate } from '../core/compile.js';
import { visibleCopy } from '../core/grade-format.js';
import { WORKFLOW } from '../core/classroom-template.js';
import { loadExercise } from '../server/grade.js';
import { makeTemplate } from '../server/classroom.js';
import { counterExercise, ROOT } from './grade-fixtures.mjs';

const EX = path.join(ROOT, 'exercises/counter4');
const WIDE = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'a', dir: 'in', width: 8 }, { name: 'io', dir: 'inout', width: 4 }, { name: 'y', dir: 'out', width: 1 }];

test('#3841 the starter project from the statement: its top compiles with the statement\'s ports, in VHDL and Verilog; graded, a Wrong Answer', async () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const ex of [counterExercise(), counterExercise({ id: 'wide', top: 'wide', ports: WIDE })]) {
      const files = starterProject(ex, { lang });
      const file = `src/${ex.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`;
      assert.deepEqual([...files.keys()], ['silinx.json', file]);
      const pj = JSON.parse(files.get('silinx.json'));
      assert.deepEqual(pj, { name: ex.id, version: 1, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, board: 'basys2', top: ex.top, preferredLanguage: lang, files: [{ path: file, lang, role: 'design' }] });
      const lib = compile([{ path: file, lang, text: files.get(file) }]);
      const d = elaborate(lib, ex.top);
      assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error'), [], `${lang} ${ex.top}`);
      assert.deepEqual(portProblems(d.top, ex.ports, ex.top), [], `${lang} ${ex.top}`);
    }
    // (graded: no design verdict, no warning; each test a Wrong Answer)
    const ex = counterExercise();
    ex.tests = ex.tests.filter(t => t.kind !== 'reference');
    const r = await gradeTests(ex, { project: JSON.parse(starterProject(ex, { lang }).get('silinx.json')), files: starterProject(ex, { lang }) });
    assert.deepEqual(r.design, { verdict: null, messages: [], warnings: [] }, lang);
    assert.deepEqual(r.tests.map(t => [t.id, t.verdict, t.messages]), [['count', 'WA', ['cycle 0 (vectors line 3): q is XXXX, expected 0000']],
      ['bench', 'WA', ['after ten counts q is x at 112 ns (tb/tb_counter4.v line 9)']]], lang);
  }
  assert.equal(starterProject(counterExercise(), { lang: 'verilog' }).get('src/counter4.v'),
    '// counter4: the exercise\'s top module, with the statement\'s ports. Its design is yours to write.\nmodule counter4 (\n  input wire clk,\n  input wire rst,\n  input wire en,\n  output wire [3:0] q\n);\nendmodule\n');
  assert.match(starterProject(counterExercise({ ports: WIDE, top: 'wide' })).get('src/wide.vhd'), /port \(\n {4}clk : in std_logic;\n {4}a : in std_logic_vector\(7 downto 0\);\n {4}io : inout std_logic_vector\(3 downto 0\);\n {4}y : out std_logic\n {2}\);/);
  // the teacher's board and device
  const dev = { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-4' };
  assert.deepEqual(JSON.parse(starterProject(counterExercise(), { board: 'nexys2', device: dev }).get('silinx.json')).device, dev);
  assert.throws(() => starterProject(counterExercise(), { lang: 'c' }), /the starter's language: vhdl or verilog \(c\)/);
});

test('#3841 the template\'s files: makeTemplate\'s, with the shipped starter and with one from the statement; nothing hidden', () => {
  const file = path.join(EX, 'counter4.exercise.json');
  const { exercise: ex } = loadExercise(file);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const beside = rel => fs.readFileSync(path.join(EX, rel), 'utf8');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-package-'));
  try {
    const starter = new Map([['silinx.json', fs.readFileSync(path.join(EX, 'starter/silinx.json'), 'utf8')], ['src/counter4.vhd', fs.readFileSync(path.join(EX, 'starter/src/counter4.vhd'), 'utf8')]]);
    const files = templateFiles(ex, raw, { starter, beside, version: '1.2.3' });
    assert.deepEqual(Object.fromEntries(files), makeTemplate(file, path.join(EX, 'starter'), path.join(tmp, 'a'), { version: '1.2.3' }).files);
    assert.deepEqual([...files.keys()], ['silinx.json', 'src/counter4.vhd', 'tests/count.vec', 'counter4.exercise.json', 'README.md', '.gitignore', WORKFLOW]);
    // (no starter folder: the statement's, as makeTemplate makes it too)
    const made = templateFiles(ex, raw, { starter: starterProject(ex, { lang: 'verilog' }), beside, version: '1.2.3' });
    assert.deepEqual(Object.fromEntries(made), makeTemplate(file, null, path.join(tmp, 'b'), { version: '1.2.3', lang: 'verilog' }).files);
    assert.deepEqual([...made.keys()], ['silinx.json', 'src/counter4.v', 'tests/count.vec', 'counter4.exercise.json', 'README.md', '.gitignore', WORKFLOW]);
    const all = [...made.values()].join('\n');
    assert.doesNotMatch(all, /tb_counter4|"seed"|"reference"|ref\/counter4/);
    assert.deepEqual(JSON.parse(made.get('counter4.exercise.json')), visibleCopy(raw));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.deepEqual(besideFiles(visibleCopy(raw)), ['tests/count.vec']);
  // a starter project's exercises, hidden files and build/ left out; one with no silinx.json refused
  const ex2 = counterExercise({ tests: [counterExercise().tests[0]] });
  const out = templateFiles(ex2, ex2, { starter: new Map([['silinx.json', '{}'], ['x.exercise.json', '{}'], ['.git/config', ''], ['build/a.bit', ''], ['src/a.v', '']]), beside: () => '' });
  assert.deepEqual([...out.keys()], ['silinx.json', 'src/a.v', 'counter4.exercise.json', 'README.md', '.gitignore', WORKFLOW]);
  assert.throws(() => templateFiles(ex2, ex2, { starter: new Map(), beside: () => '' }), /the starter project has no silinx\.json/);
});

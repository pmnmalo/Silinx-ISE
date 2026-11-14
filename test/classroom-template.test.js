// The template repository's text (#3841, core/classroom-template.js, moved from server/classroom.js as it was): the old
// module exports every name it did, the same ones; the workflow and the README of the shipped exercise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as core from '../core/classroom-template.js';
import * as server from '../server/classroom.js';
import { VERSION } from '../core/version.js';
import { ROOT } from './grade-fixtures.mjs';

test('#3841 server/classroom.js exports what it did before the move, core/classroom-template.js\'s own', () => {
  assert.deepEqual(Object.keys(server).sort(), ['CHECKOUT', 'SETUP_NODE', 'WORKFLOW', 'assignmentRepos', 'gradeClassroom', 'makeTemplate', 'workflowYaml']);
  for (const k of ['CHECKOUT', 'SETUP_NODE', 'WORKFLOW', 'workflowYaml']) assert.equal(server[k], core[k], k);
  assert.equal(core.WORKFLOW, '.github/workflows/silinx-grade.yml');
});

test('#3841 the workflow: the visible tests of the exercise on each push, a release of Silinx checked; its wrong arguments', () => {
  const y = core.workflowYaml('counter4.exercise.json', { version: '1.2.3' });
  assert.match(y, /SILINX_VERSION: 1\.2\.3\n/);
  assert.match(y, /grade counter4\.exercise\.json \. --visible --json/);
  assert.match(y, /sha256sum -c -/);
  assert.match(y, /permissions:\n {2}contents: read\n/);
  assert.match(core.workflowYaml('a.exercise.json'), new RegExp(`SILINX_VERSION: ${VERSION.replace(/\./g, '\\.')}\\n`));
  assert.throws(() => core.workflowYaml('../a.exercise.json'), /the exercise's file: a name of letters, digits, \. _ - \(\.\.\/a\.exercise\.json\)/);
  assert.throws(() => core.workflowYaml('a.exercise.json', { version: 'latest' }), /a release of Silinx: a version x\.y\.z \(latest\)/);
});

test('#3841 the README: the statement and the top in English and Portuguese', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'exercises/counter4/counter4.exercise.json'), 'utf8'));
  const r = core.readmeText(ex, 'counter4.exercise.json');
  assert.match(r, /^# 4-bit counter with enable\n\n## 4-bit counter with enable\n\nMake counter4,/);
  assert.match(r, /The top module is `counter4`, with the ports `clk`, `rst`, `en`, `q`\./);
  assert.match(r, /\n## Contador de 4 bits com enable\n\nFaça o counter4,/);
  assert.match(r, /O módulo de topo é `counter4`, com os portos `clk`, `rst`, `en`, `q`\./);
});

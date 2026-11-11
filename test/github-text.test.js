// What the report scripts write on GitHub (#3417, scripts/github-text.mjs): the issue or comment taken is the bot's own,
// not one of the same title or start by another author; text from a log or an artifact is written inert (a code span or
// block that no backtick of the text closes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOT, byBot, code, codeBlock, ownComment, ownIssue } from '../scripts/github-text.mjs';
import { issueText } from '../scripts/report-failure.mjs';
import { MARK, mergeCorpus, reportMarkdown } from '../scripts/yosys-update-report.mjs';
import { MARK as NEXTPNR_MARK } from '../scripts/nextpnr-update-report.mjs';
import { TITLE } from '../scripts/check-pins.mjs';

const bot = { login: BOT }, someone = { login: 'someone' };

test('#3417 the bot\'s issue only: one of the same title by another author is not taken', () => {
  assert.equal(byBot({ user: bot }), true);
  assert.equal(byBot({ user: someone }), false);
  assert.equal(byBot({}), false);
  const theirs = { number: 1, title: TITLE, user: someone }, ours = { number: 2, title: TITLE, user: bot };
  assert.equal(ownIssue([theirs], TITLE), null);
  assert.equal(ownIssue([theirs, ours], TITLE), ours);
  assert.equal(ownIssue([{ number: 3, title: 'Nightly failed: designs', user: someone }], 'Nightly failed: designs'), null);
});

test('#3417 the bot\'s comment only: one that starts with the mark by another author is not taken', () => {
  for (const mark of [MARK, NEXTPNR_MARK]) {
    const theirs = { id: 1, body: `${mark}\nmine`, user: someone }, ours = { id: 2, body: `${mark}\n## …`, user: bot };
    assert.equal(ownComment([theirs], mark), null);
    assert.equal(ownComment([theirs, ours], mark), ours);
    assert.equal(ownComment([{ id: 3, body: 'other', user: bot }], mark), null);
  }
});

test('#3417 code: a code span that no backtick of the text closes, on one line', () => {
  assert.equal(code('a.v: 1: w'), '`a.v: 1: w`');
  assert.equal(code('x ` y'), '``x ` y``');
  assert.equal(code('```\n@someone'), '```` ``` @someone ````');
  assert.equal(code('`a`'), '`` `a` ``');
  assert.equal(code(''), '``');
  assert.equal(code(null), '``');
});

test('#3417 codeBlock: a fence longer than any run of backticks of its lines', () => {
  assert.deepEqual(codeBlock(['a', 'b']), ['```', 'a', 'b', '```']);
  assert.deepEqual(codeBlock(['```', '@someone **x**', '`````']), ['``````', '```', '@someone **x**', '`````', '``````']);
});

test('#3417 a failure\'s log lines holding a fence and a mention: inside a code block they cannot close', () => {
  const t = issueText({ workflow: 'Nightly', job: 'designs', runUrl: 'u', sha: 'abcdef0', lines: ['x', '```', '@someone see <img src=x>'] });
  assert.match(t.body, /What its log says:\n\n````\nx\n```\n@someone see <img src=x>\n````\n/);
});

test('#3417 the Yosys update\'s new warnings, results and tag from the artifact: in code spans', () => {
  const corpus = mergeCorpus({ 1: { tag: 'v0.68`@x', results: { 'a.v:a (synth)': 'mismatch: ``` @someone' }, expected: { 'a.v:a (synth)': 'pass' }, regress: ['a.v:a (synth)'], fixed: [],
    fresh: [], timedOut: ['t`.v'], newWarnings: ['a.v: 1: ```\n@someone [x](https://example.com)'], goneWarnings: [] } }, 1);
  const md = reportMarkdown({ baseVersion: '0.68.1207', headVersion: '0.68.1210', examples: [], designs: [], corpus, testsPin: { tag: 'v0.68', commit: 'x' } });
  assert.match(md, /### Yosys's test designs \(test\/corpus, ``v0\.68`@x``\)/);
  assert.match(md, /- `a\.v:a \(synth\)`: ````mismatch: ``` @someone````\n/);
  assert.match(md, /\*\*Timed out\*\* \(1\): ``t`\.v``\n/);
  assert.match(md, /\*\*New warnings\*\* \(1\):\n\n- ````a\.v: 1: ``` @someone \[x\]\(https:\/\/example\.com\)````\n/);
});

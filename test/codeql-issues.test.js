// Code scanning's alerts as issues (scripts/codeql-issues.mjs, #2021): one issue per open alert, never twice, closed
// when its alert is fixed or dismissed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertIssue, alertOf, closeComment, marker, plan } from '../scripts/codeql-issues.mjs';

const alert = (number, state = 'open', path = 'server/projects.js', more = {}) => ({
  number, state, html_url: `https://github.com/o/r/security/code-scanning/${number}`, created_at: '2026-10-28T10:05:00Z',
  rule: { id: 'js/path-injection', description: 'Uncontrolled data used in path expression', severity: 'error', security_severity_level: 'high' },
  most_recent_instance: { location: { path, start_line: 62 }, message: { text: 'This path depends on a user-provided value.\nThis path depends on a user-provided value.\n' } },
  ...more,
});
const issue = (number, n, state = 'open') => ({ number, state, body: `text\n\n(Opened by the workflow.) ${marker(n)}` });

test('codeql-issues: the issue of an alert says nothing of it but its number and link (public issues, SECURITY.md)', () => {
  const a = alert(86, 'open', 'server/projects.js', { dismissed_comment: 'secret detail' }), it = alertIssue(a);
  assert.equal(it.title, 'CodeQL: a new alert to review (Security ▸ Code scanning, alert #86)');
  assert.equal(it.body, [
    'CodeQL found something to review on the default branch: https://github.com/o/r/security/code-scanning/86 (the maintainers only).',
    '',
    'To decide: fix it (a regression test, `Fixes #N`), or dismiss the alert with its reason: the next analysis closes this issue then. Its details stay in Security ▸ Code scanning, not here (SECURITY.md).',
    '',
    '(Opened by the workflow, scripts/codeql-issues.mjs.) <!-- codeql-alert:86 -->',
  ].join('\n'));
  assert.deepEqual(it.labels, ['bug', 'security']);
  assert.equal(alertOf(it), 86);
  // no rule, file, line, message or severity, wherever the alert is (a test's too)
  for (const x of [a, alert(81, 'open', 'test/resource-check.test.js', { rule: { id: 'js/identity-replacement', severity: 'warning' } })]) {
    const t = alertIssue(x), text = `${t.title}\n${t.body}\n${t.labels.join(',')}`;
    for (const no of [x.rule.id, x.rule.description, x.rule.severity, x.rule.security_severity_level, x.most_recent_instance.location.path, 'projects', 'resource-check', ':62', 'user-provided', 'secret'].filter(Boolean))
      assert.ok(!text.includes(no), `${x.number}: ${no}`);
    assert.deepEqual(t.labels, ['bug', 'security']);
  }
  assert.equal(alertOf({ body: 'no marker' }), null);
  assert.equal(alertOf({ body: null }), null);
});

test('codeql-issues: the plan, an open alert with no issue opened, never twice; an open issue of a fixed or dismissed alert closed', () => {
  const alerts = [alert(1), alert(2), alert(3, 'fixed'), alert(4, 'dismissed'), alert(5, 'dismissed'), alert(6)];
  const issues = [issue(10, 2), issue(11, 3), issue(12, 4), issue(13, 5, 'closed'), issue(14, 6, 'closed'), issue(15, 99), { number: 16, state: 'open', body: 'another issue' }];
  const p = plan(alerts, issues);
  // 1: no issue, opened; 2: its issue open; 6: its issue closed by hand, not opened again
  assert.deepEqual(p.open.map((a) => a.number), [1]);
  // 3 fixed and 4 dismissed: their open issues closed; 5's closed already; 99's alert unknown: left
  assert.deepEqual(p.close.map(({ issue: i, alert: a }) => [i.number, a.number]), [[11, 3], [12, 4]]);
  // an alert with a closed issue and an open one (reopened by hand): the open one is its issue
  assert.deepEqual(plan([alert(7, 'fixed')], [issue(20, 7), issue(21, 7, 'closed')]).close.map(({ issue: i }) => i.number), [20]);
  assert.deepEqual(plan([alert(7, 'fixed')], [issue(21, 7, 'closed'), issue(20, 7)]).close.map(({ issue: i }) => i.number), [20]);
  assert.deepEqual(plan([], []), { open: [], close: [] });
});

test('codeql-issues: the comment that closes an issue says fixed, or dismissed with its reason, never the dismissal\'s comment', () => {
  assert.equal(closeComment(alert(3, 'fixed')), "CodeQL's alert https://github.com/o/r/security/code-scanning/3 is fixed: no longer found on the default branch.");
  assert.equal(closeComment(alert(4, 'dismissed', 'x', { dismissed_reason: 'false positive', dismissed_comment: 'through safeJoin' })),
    "CodeQL's alert https://github.com/o/r/security/code-scanning/4 was dismissed (false positive).");
  assert.equal(closeComment(alert(5, 'dismissed')), "CodeQL's alert https://github.com/o/r/security/code-scanning/5 was dismissed.");
});

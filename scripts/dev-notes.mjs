#!/usr/bin/env node
// The text of the pre-release "Development build" (.github/workflows/dev-release.yml): the commit,
// where to find it, and the changes not released yet: the changelog fragments (changes/*.md, #519),
// with CHANGELOG.md's newest section when no tag v<it> exists (a section written by hand). A release's
// body holds at most 125,000 characters (#2411): past LIMIT, the "In short" items stay in full and the
// "In detail" list keeps its newest entries, with a line saying how many were left out and where they are.
//   node scripts/dev-notes.mjs > notes.md
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseChangelog, mergeFragments } from '../core/changelog.js';
import { readFragments } from './changelog-release.mjs';

export const LIMIT = 120000;
export const FULL_LIST = 'https://github.com/pmnmalo/Silinx-ISE/tree/main/changes';

export function devNotes({ commit, date, changelog, tags, fragments = [], limit = LIMIT }) {
  const top = parseChangelog(changelog)[0];
  const open = top && !tags.includes(`v${top.version}`) ? top : null;
  const out = [`**Development build** of main, commit ${commit} (${date}): not a release, for testing.`,
    'The latest release is under Releases; this one is replaced after every change that passes the tests.',
    'In the browser: https://pmnmalo.github.io/Silinx-ISE/dev/', ''];
  if (open || fragments.length)
    out.push(`## Not released yet${open ? ` (${open.version})` : ''}`, '', mergeFragments(open ? open.body : '', fragments), '');
  const text = out.join('\n');
  return size(text) <= limit ? text : shorten(text, limit);
}

// counted in UTF-8 bytes, never fewer than GitHub's characters
const size = t => Buffer.byteLength(t, 'utf8');

// the notes cut to the limit: the "In detail" entries (each "- " at a line's start, its continuation
// indented) dropped from the oldest until the rest and the line saying so fit
function shorten(text, limit) {
  const mark = '\nIn detail:\n\n', at = text.lastIndexOf(mark);
  if (at < 0) return text;
  const head = text.slice(0, at), items = text.slice(at + mark.length).replace(/\n+$/, '').split(/\n(?=- )/);
  const note = n => `${n} older entr${n === 1 ? 'y' : 'ies'} of "In detail" left out (a release's notes hold at most 125,000 characters): ` +
    `the full list is in changes/ on main, ${FULL_LIST}, and in CHANGELOG.md at the next release.\n`;
  for (let keep = items.length - 1; keep > 0; keep--) {
    const t = `${head}${mark}${items.slice(0, keep).join('\n')}\n\n${note(items.length - keep)}`;
    if (size(t) <= limit) return t;
  }
  return `${head.trimEnd()}\n\n${note(items.length)}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  process.stdout.write(devNotes({ commit: git('rev-parse', '--short', 'HEAD'), date: git('log', '-1', '--format=%ci'),
    changelog: fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), tags: git('tag').split('\n'), fragments: readFragments() }));
}

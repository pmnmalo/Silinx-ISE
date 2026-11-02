// No family names in the interface's conditions (#2310): web/js asks the family's profile (core/family-profile.js)
// what it offers, instead of testing `family === 'spartan6'`. A new condition on a family's name fails here; ALLOWED
// lists the ones left (file: count), and an entry leaves it once its file has none (the list only shrinks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILY_INFO } from '../packages/silinx-fpga/src/family.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Map([]);

const ids = Object.keys(FAMILY_INFO).join('|');
const lit = `['"\`](?:${ids})['"\`]`;
// a comparison with a family's id on either side, a switch's case, or a list of ids tested with includes()
const CONDITION = new RegExp(`(?:[=!]==?\\s*${lit})|(?:${lit}\\s*[=!]==?)|(?:\\bcase\\s+${lit})|(?:\\[\\s*${lit}(?:\\s*,\\s*${lit})*\\s*\\]\\s*\\.includes\\()`);

/** The family conditions of a source: [line numbers]. Comments do not count. */
export function familyConditions(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\s\/\/\s.*$/, '');
    if (CONDITION.test(code)) out.push(i + 1);
  });
  return out;
}

function sources(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
    const p = `${dir}/${e.name}`;
    return e.isDirectory() ? sources(p) : /\.m?js$/.test(e.name) ? [p] : [];
  });
}

test('the scan finds the conditions it is for, and not the profile\'s questions', () => {
  for (const line of ["if (family === 'spartan6') x();", "const s6 = plan.family !== \"spartan6\";", "x = 'ice40' === f;",
    "switch (f) { case 'spartan3e': }", "if (['spartan3e', 'spartan6'].includes(family)) {}", 'if (fam == `artix7`) {}']) {
    assert.deepEqual(familyConditions(line), [1], line);
  }
  for (const line of ["if (familyProfile(family).clock?.manager === 'pll') {}", "const DEFAULT = { family: 'spartan3e' };",
    "// family === 'spartan6' in a comment", " * family === 'spartan6'", "deviceFamily(d) || 'spartan3e'", "if (bitDb === 's6') {}"]) {
    assert.deepEqual(familyConditions(line), [], line);
  }
});

test('web/js tests no family by its name, but those still listed', () => {
  const found = new Map();
  for (const f of sources('web/js')) {
    const n = familyConditions(fs.readFileSync(path.join(ROOT, f), 'utf8')).length;
    if (n) found.set(f, n);
  }
  const fresh = [...found].filter(([f, n]) => n > (ALLOWED.get(f) || 0)).map(([f, n]) => `${f}: ${n}`);
  assert.deepEqual(fresh, [], 'family conditions in web/js: ask the family\'s profile (core/family-profile.js) instead');
  const gone = [...ALLOWED].filter(([f, n]) => (found.get(f) || 0) < n).map(([f]) => f);
  assert.deepEqual(gone, [], 'fewer family conditions than ALLOWED says: lower or remove the entry');
});

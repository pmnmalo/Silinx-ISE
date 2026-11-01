// The interfaces' ids and names (#2451). Their ids silinx and ise, never the ids of before (modern, classic), anywhere
// in the code, the tests, the scripts and the workflows: data-ui and its CSS selectors, the saved preference,
// SILINX_UI_INTERFACE, the CI matrix; only the migration of a preference saved with an old id, and its tests, name them
// (ALLOW). Their names Silinx and ISE style (Silinx, Estilo ISE), never the names of before (Modern, Classic, the
// modern / classic interface, Moderna, Clássica) nor AMD's trademark as one (the Xilinx ISE interface), in the labels,
// the comments and the tests' names, and in the documentation (every Markdown file but the history and the research
// notes).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'test/interface-ids.test.js';

// an old id as an id: quoted, as data-ui's value, as SILINX_UI_INTERFACE's, in a workflow's matrix
export const OLD_IDS = [
  /(['"`])(modern|classic)\1/g,
  /data-ui=["']?(modern|classic)\b/g,
  /SILINX_UI_INTERFACE=["']?(modern|classic)\b/g,
  /interface: \[[^\]\n]*?\b(modern|classic)\b/g,
];

// an old name: a label, a menu's path, the interface called so in prose (English or Portuguese), the trademark as its name
export const OLD_NAMES = [
  /(['"`])(Modern|Classic|Moderna|Clássica)\1/g,
  /▸ (Modern|Classic)\b/g,
  /\b(modern|classic|Xilinx ISE)(['’]s)? (interfaces?|look|ones?|toolbar|header)\b/gi,
  /\binterfaces? (moderna|cl[aá]ssica)s?\b/gi,
];

// the lines allowed to name an old id, by file: how many matches each has, and why
const ALLOW = {
  'web/index.html': [2, 'the early script migrates a saved old id (#2451)'],
  'test/modern.test.js': [2, 'the migration, of the development edition\'s preference and on load'],
  'test/tasks.test.js': [2, 'the early script\'s migration'],
  'test/ui/tasks.test.js': [2, 'the migration in the browser'],
  'test/ui-interface.test.js': [5, 'SILINX_UI_INTERFACE=modern|classic mapped, with a warning'],
  'scripts/test-browsers.mjs': [1, 'the file test/ui/modern.test.js, not an interface'],
};

const matches = (patterns) => (text) => {
  const found = [];
  text.split('\n').forEach((l, i) => {
    for (const re of patterns) for (const m of l.matchAll(re)) found.push({ line: i + 1, text: m[0] });
  });
  return found;
};
/** The matches of the old ids in a text: [{ line, text }]. */
export const oldIds = matches(OLD_IDS);
/** The matches of the old names in a text: [{ line, text }]. */
export const oldNames = matches(OLD_NAMES);
// the documentation: the old names, the two of them named together ("modern and classic", "(modern, classic)"), and
// SILINX_UI_INTERFACE's old ids in its commands
export const OLD_IN_DOCS = [
  ...OLD_NAMES,
  /\b(modern|classic)(,? (and|or)|,) (classic|modern)\b/gi,
  /\b(modern|moderna|classic|cl[aá]ssica)\b[^.\n]{0,40}\b(ISE-like|ISE look|Project Navigator look)/gi,
  /SILINX_UI_INTERFACE=["']?(modern|classic)\b/g,
];
/** The matches of the old names in a document: [{ line, text }]. */
export const oldInDocs = matches(OLD_IN_DOCS);
// the documents searched: every Markdown file but the history (CHANGELOG.md, the changelog's fragments) and the
// research notes, as they were written
const docs = () => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '*.md'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter((f) => f && !/ \d+\.\w+$/.test(f) && !/^(CHANGELOG\.md$|changes\/|research\/|node_modules\/)|\/CHANGELOG\.md$/.test(f) && fs.existsSync(path.join(ROOT, f)));

// the files searched: the code, the tests, the scripts, the workflows (a new file not yet added too; a sync's copy,
// "name 2.js", not)
const sources = () => execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'web', 'test', 'scripts', '.github'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0').filter((f) => f && f !== SELF && !/ \d+\.\w+$/.test(f) && /\.(m?js|html|css|ya?ml|json)$/.test(f) && fs.existsSync(path.join(ROOT, f)));

test('#2451 oldIds finds the ids of before as ids, not the words', () => {
  assert.deepEqual(oldIds("x = 'modern'\nhtml[data-ui=\"classic\"] a {}\nSILINX_UI_INTERFACE=classic node --test"),
    [{ line: 1, text: "'modern'" }, { line: 2, text: '"classic"' }, { line: 2, text: 'data-ui="classic' }, { line: 3, text: 'SILINX_UI_INTERFACE=classic' }]);
  assert.deepEqual(oldIds('        interface: [modern, classic]').map((m) => m.text), ['interface: [modern']);
  assert.deepEqual(oldIds("a modern look, the classic one; 'silinx', data-ui=\"ise\", { modern: 'silinx' }; a classic worker"), []);
});

test('#2451 oldNames finds the names of before, not the words', () => {
  assert.deepEqual(oldNames("{ label: 'Classic' }\n// the modern interface, the classic one; View ▸ Modern\n'Moderna', a interface clássica, the Xilinx ISE look").map((m) => m.text),
    ["'Classic'", '▸ Modern', 'modern interface', 'classic one', "'Moderna'", 'Xilinx ISE look', 'interface clássica']);
  assert.deepEqual(oldNames("a classic worker, Windows classic, 'Silinx', 'ISE style', the Silinx interface, the ISE style one, Xilinx ISE 14.7"), []);
});

test('#2451 oldInDocs finds the names of before in prose, not the words', () => {
  assert.deepEqual(oldInDocs('- **Two interfaces** (modern and classic, ISE-like)\ntwo interfaces (modern, classic)\n`SILINX_UI_INTERFACE=classic`\nthe classic Xilinx ISE Project Navigator look').map((m) => m.text),
    ['modern and classic', 'modern and classic, ISE-like', 'modern, classic', 'SILINX_UI_INTERFACE=classic', 'classic Xilinx ISE Project Navigator look']);
  assert.deepEqual(oldInDocs('the Silinx and ISE style interfaces; a classic state table; `SILINX_UI_INTERFACE=ise`; modern tools'), []);
});

test('#2451 no old interface name in the documentation (README, docs/, ONBOARDING, CLAUDE.md, CONTRIBUTING…)', () => {
  const files = docs();
  for (const f of ['README.md', 'CLAUDE.md', 'ONBOARDING.md', 'CONTRIBUTING.md', 'docs/ARCHITECTURE.md']) assert.ok(files.includes(f), f);
  assert.ok(!files.some((f) => /^(CHANGELOG\.md|changes\/|research\/)/.test(f)), 'the history and the research notes as written');
  const found = files.flatMap((f) => oldInDocs(fs.readFileSync(path.join(ROOT, f), 'utf8')).map((m) => `${f}:${m.line}: ${m.text}`));
  assert.deepEqual(found, []);
});

test('#2451 no old interface name (Modern, Classic, the modern / classic interface) in web/, test/, scripts/, .github/', () => {
  const found = sources().flatMap((f) => oldNames(fs.readFileSync(path.join(ROOT, f), 'utf8')).map((m) => `${f}:${m.line}: ${m.text}`));
  assert.deepEqual(found, []);
});

test('#2451 no old interface id (modern, classic) in web/, test/, scripts/, .github/ but the migration\'s', () => {
  const files = sources();
  assert.ok(files.length > 100, 'the files found');
  const counts = {};
  for (const f of files) {
    const n = oldIds(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    if (n.length) counts[f] = n.length;
  }
  assert.deepEqual(counts, Object.fromEntries(Object.entries(ALLOW).map(([f, [n]]) => [f, n])));
});

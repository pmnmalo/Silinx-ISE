// Small modules and functions (#405, CLAUDE.md ▸ Programming): a source file of core/, web/js/, server/ and scripts/
// under 1000 lines, a function under 300. The files and functions over the limit when the rule was written are
// listed below: a new one fails, and an entry must leave its list once it is under the limit (the lists only shrink).
// Every function is measured, whatever its form (a declaration, a function expression, an arrow function, a method, a
// getter or a setter) and wherever it is (a nested one on its own too: #3542), from its first line to its last
// (test/code-size-lib.mjs); a file by its lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from './code-size-lib.mjs';

// (fileURLToPath: on Windows a URL's pathname keeps a slash before the drive letter, #886)
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['core', 'packages/silinx-fpga/src', 'packages/silinx-hdl/src', 'web/js', 'server', 'scripts'];
const MAX_FILE = 1000, MAX_FUNCTION = 300;

// over the limit on 2026-10-22; split them, never add to these lists (measuring every function, #3542, found none more)
const BIG_FILES = new Set([
]);
const BIG_FUNCTIONS = new Set([
]);

function sources() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p); else if (/\.m?js$/.test(e.name)) out.push(p);
    }
  };
  for (const d of DIRS) walk(d);
  return out.sort();
}
const measured = new Map(); // (each source measured once for both tests)
const measureFile = (f) => {
  if (!measured.has(f)) measured.set(f, measure(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  return measured.get(f);
};

test('#405 code size: how a file and its functions are measured', () => {
  const body = (n) => Array.from({ length: n }, (_, i) => `  x${i}();`).join('\n');
  const m = measure(`// a module\nimport x from './x.js';\nexport function a() {\n${body(3)}\n}\nasync function b(p) {\n  if (p) {\n  }\n}\nconst c = () => 1;\n`);
  assert.deepEqual(m, { lines: 12, functions: [['a', 5], ['b', 4], ['c', 1]] });
  assert.equal(measure('a\nb').lines, 2);
});

test('#3542 code size: every form of function is measured, a nested one on its own', () => {
  const src = [
    'export default function* gen(a) {', //  1
    '  yield a;',
    '}',
    'const expr = async function (x) {', //  4
    '  return x;',
    '};',
    'const named = function inner() { return 1; };', //  7
    'export const arrow = async (p, q) => {', //  8
    '  const sq = v => v * v;', //  9: a one-line arrow function, nested
    '  return sq(p) + q;',
    '};',
    'const tall = (x) =>', // 12: an expression's arrow function over lines
    '  x > 0',
    '    ? 1',
    '    : 2;',
    'class K extends Base {',
    '  static make(o) {', // 17
    '    return new K(o);',
    '  }',
    '  get size() { return this.n; }', // 20
    '  set size(v) {', // 21
    '    this.n = v;',
    '  }',
    '  async *#walk() {', // 24
    '    if (this.n) {',
    '      for (const x of this) yield x;',
    '    }',
    '  }',
    '  field = () => {', // 29
    '  };',
    '}',
    'const o = {',
    "  'quoted'() {", // 33
    '  },',
    '  [Symbol.iterator]() { return [][Symbol.iterator](); },', // 35
    '  key: function () {', // 36
    '  },',
    '};',
    'items.map((it) => {', // 39
    '  return it;',
    '}).forEach(function () {', // 41
    '});',
  ].join('\n');
  assert.deepEqual(measure(src).functions, [
    ['gen', 3], ['expr', 3], ['inner', 1], ['arrow', 4], ['sq', 1], ['tall', 4], ['make', 3], ['get size', 1],
    ['set size', 3], ['#walk', 5], ['field', 2], ['quoted', 2], ['computed', 1], ['key', 2], ['callback of map', 3],
    ['callback of forEach', 2],
  ]);
  // an anonymous function given to nothing named: by the function around it
  assert.deepEqual(measure('function outer() {\n  return [() => {\n  }];\n}\n(() => 0)();\n').functions,
    [['outer', 4], ['anonymous in outer', 2], ['anonymous', 1]]);
});

test('#3542 code size: strings, templates, regular expressions, comments and statements are no functions', () => {
  const src = [
    'function f(s) {',
    "  const a = '}{', b = \"function g() {\", c = /[}{]\\}/g.test(s) ? 1 : 2; // }",
    '  /* function h() {',
    '  } */',
    '  const t = `${s.map((x) => {',
    '    return `}${x}{`;',
    '  })}`;',
    '  if (a) {',
    '  } else if (b) {',
    '  }',
    '  for (const x of t) {',
    '  }',
    '  while (c) {',
    '  }',
    '  try {',
    '  } catch (e) {',
    '  }',
    '  switch (s) {',
    '  }',
    '  let i = 0; const r = i++ / 2 + i-- / 3;',
    '  return r;',
    '}',
  ].join('\n');
  assert.deepEqual(measure(src).functions, [['f', 22], ['callback of map', 3]]);
  assert.throws(() => measure('function f() {\n  (\n}\n'), /line 3: \} does not close the \( of line 2/);
  assert.throws(() => measure('function f() {\n'), /line 1: \{ never closed/);
  assert.deepEqual(measure('#!/usr/bin/env node\nmain();\n').functions, []);
});

test('#3542 code size: an arrow function, a function expression or a method over 300 lines is caught', () => {
  // the measure before #3542 saw only the declarations at the start of a line: none of these
  const body = (n) => Array.from({ length: n }, (_, i) => `    x${i}();`).join('\n');
  const src = [
    `export const big = () => {\n${body(299)}\n};`,
    `const alsoBig = function () {\n${body(299)}\n};`,
    `class C {\n  method() {\n${body(299)}\n  }\n}`,
    `const ok = () => {\n${body(298)}\n};`,
  ].join('\n');
  const { functions } = measure(src);
  assert.deepEqual(functions.filter(([, n]) => n > MAX_FUNCTION), [['big', 301], ['alsoBig', 301], ['method', 301]]);
  assert.deepEqual(functions.find(([name]) => name === 'ok'), ['ok', 300]);
});

test('#405 code size: no new file over 1000 lines, no listed one under it', () => {
  const files = sources();
  const over = files.filter((f) => measureFile(f).lines > MAX_FILE);
  assert.deepEqual(over.filter((f) => !BIG_FILES.has(f)), [], `over ${MAX_FILE} lines: split them (CLAUDE.md ▸ Programming)`);
  assert.deepEqual([...BIG_FILES].filter((f) => !over.includes(f)), [], `under ${MAX_FILE} lines now (or gone): remove them from BIG_FILES`);
});

test('#405 code size: no new function over 300 lines, no listed one under it', () => {
  const over = [];
  for (const f of sources()) {
    for (const [name, n] of measureFile(f).functions) if (n > MAX_FUNCTION) over.push(`${f} ${name}`);
  }
  assert.deepEqual(over.filter((k) => !BIG_FUNCTIONS.has(k)), [], `over ${MAX_FUNCTION} lines: split them (CLAUDE.md ▸ Programming)`);
  assert.deepEqual([...BIG_FUNCTIONS].filter((k) => !over.includes(k)), [], `under ${MAX_FUNCTION} lines now (or gone): remove them from BIG_FUNCTIONS`);
});

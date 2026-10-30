// Licence notices: THIRD-PARTY-NOTICES.md and core/third-party.js list every production dependency
// with its licence text (and are up to date), NOTICE carries the copyright, and the standalone
// Silinx-ISE.html embeds the notices of the components it contains.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { THIRD_PARTY } from '../core/third-party.js';
import { importMapPackages } from '../server/import-map.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('third-party notices are up to date with the installed production dependencies', () => {
  const out = execFileSync(process.execPath, ['scripts/third-party.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /up to date \(\d+ components\)/);
});

test('every component has a known licence and its full text; the editor\'s modules (CodeMirror 6), elkjs and the adepttool port are marked standalone', () => {
  const md = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.ok(THIRD_PARTY.length > 10);
  for (const c of THIRD_PARTY) {
    assert.match(c.license, /^(MIT|ISC|BSD-[23]-Clause|Apache-2\.0|EPL-2\.0 OR GPL-3\.0-or-later)$/, `${c.name}: licence ${c.license}`);
    const sec = new RegExp(`## ${c.name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} ${c.version} — [^\\n]*\\n\\n[^\\n]*\\n\\n\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``).exec(md);
    assert.ok(sec, `${c.name} has a section`);
    assert.ok(sec[1].length > 200 && !/no licence file/.test(sec[1]), `${c.name}: the licence text`);
  }
  // (CodeMirror 6: the packages of the import map of web/index.html, all MIT, the editor's own among them)
  const cm = importMapPackages();
  assert.ok(['@codemirror/state', '@codemirror/view', '@codemirror/lint', '@codemirror/legacy-modes', 'style-mod'].every(p => cm.includes(p)), cm.join(', '));
  assert.deepEqual(THIRD_PARTY.filter(c => c.standalone).map(c => `${c.name}:${c.license}`).sort(),
    ['adepttool:MIT', 'elkjs:EPL-2.0 OR GPL-3.0-or-later', ...cm.map(p => `${p}:MIT`)].sort());
  assert.match(md, /source code of elkjs \(EPL-2\.0 OR GPL-3\.0-or-later\) is available at https:\/\/github\.com\/kieler\/elkjs/);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const d of Object.keys(pkg.dependencies)) assert.ok(THIRD_PARTY.some(c => c.name === d), `direct dependency ${d} listed`);
});

test('licence: GNU AGPL-3.0 (LICENSE, package.json), NOTICE with the copyright and the elkjs permission; README has a Licence section', () => {
  const notice = fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8');
  assert.match(notice, /Copyright 2026 Pedro Maló/);
  assert.match(notice, /GNU Affero General Public License, version 3/);
  assert.match(notice, /Additional permission under GNU AGPL version 3 section 7[\s\S]*elkjs[\s\S]*Eclipse Public License 2\.0/);
  assert.match(fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8'), /^\s*GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).license, 'AGPL-3.0-only');
  assert.match(fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'), /## Licence[\s\S]*THIRD-PARTY-NOTICES\.md/);
});

test('the standalone Silinx-ISE.html embeds the copyright, the Apache licence and the licences of the editor\'s modules and elkjs', () => {
  const dist = path.join(ROOT, 'dist', 'Silinx-ISE.html');
  const before = fs.existsSync(dist) ? fs.readFileSync(dist) : null;
  try {
    execFileSync(process.execPath, ['scripts/build-standalone.mjs'], { cwd: ROOT, stdio: 'pipe' });
    const html = fs.readFileSync(dist, 'utf8');
    const m = /<script type="text\/plain" id="silinx-notices">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(m, 'notices block');
    assert.match(m[1], /Copyright 2026 Pedro Maló/);
    assert.match(m[1], /GNU AFFERO GENERAL PUBLIC LICENSE/);
    assert.match(m[1], /Additional permission under GNU AGPL version 3 section 7/);
    for (const p of importMapPackages()) assert.ok(m[1].includes(`## ${p} `), `the licence of ${p}`);
    assert.match(m[1], /## @codemirror\/view [^\n]* — MIT[\s\S]*Permission is hereby granted/);
    assert.match(m[1], /## elkjs [\s\S]*Eclipse Public License - v 2\.0/);
  } finally {
    if (before) fs.writeFileSync(dist, before);
  }
  assert.ok(os.tmpdir());
});

// silinx-fpga (#1681): Apache-2.0, its own NOTICE and THIRD-PARTY-NOTICES.md, the IDE's NOTICE naming it
test('silinx-fpga: Apache-2.0 (LICENSE, package.json), its NOTICE, its dependencies\' notices; the IDE\'s NOTICE names it', () => {
  const pkg = path.join(ROOT, 'packages', 'silinx-fpga');
  const json = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
  assert.equal(json.license, 'Apache-2.0');
  assert.match(fs.readFileSync(path.join(pkg, 'LICENSE'), 'utf8'), /^\s*Apache License\s+Version 2\.0, January 2004/);
  const notice = fs.readFileSync(path.join(pkg, 'NOTICE'), 'utf8');
  assert.match(notice, /^silinx-fpga\nCopyright 2026 Pedro Maló\n/);
  assert.match(notice, /Apache License, Version 2\.0[\s\S]*bitdb\/[\s\S]*devices\//);
  assert.match(notice, /Yosys \(YoWASP, ISC\)[\s\S]*nextpnr-spartan, ISC[\s\S]*THIRD-PARTY-NOTICES\.md/);
  assert.match(notice, /not affiliated with or endorsed by AMD\/Xilinx/);
  // the components are its dependencies', each with its licence text
  const md = fs.readFileSync(path.join(pkg, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.match(md, /^# Third-party notices\n\nsilinx-fpga \(Copyright 2026 Pedro Maló, Apache-2\.0\)/);
  const listed = [...md.matchAll(/^## (\S+) (\S+) — (\S+)$/gm)].map(m => m[1]);
  assert.deepEqual(listed, Object.keys(json.dependencies).sort());
  for (const name of listed) {
    const sec = new RegExp(`## ${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} [^\\n]*\\n\\n[^\\n]*\\n\\n\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``).exec(md);
    assert.ok(sec && sec[1].length > 200 && !/no licence file/.test(sec[1]), `${name}: the licence text`);
    assert.ok(THIRD_PARTY.some(c => c.name === name), `${name} in the IDE's notices too`);
  }
  assert.match(md, /Boost Software License[\s\S]*Mozilla Public License/);
  assert.match(fs.readFileSync(path.join(ROOT, 'NOTICE'), 'utf8'), /silinx-fpga \(packages\/silinx-fpga[^)]*\), is Copyright 2026 Pedro Maló too, under the Apache License 2\.0/);
});

// silinx-fpga's npm package (#1681): its code, data and notices, never its research nor its tests; every module its
// code imports is in it
test('silinx-fpga: npm pack holds src/, bin/, bitdb/, devices/ and the notices, every relative import of its code, no research or tests', () => {
  const pkg = path.join(ROOT, 'packages', 'silinx-fpga');
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: pkg, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }));
  const files = new Set(packed.files.map(f => f.path));
  assert.deepEqual([...new Set([...files].map(f => f.split('/')[0]))].sort(),
    ['LICENSE', 'NOTICE', 'README.md', 'THIRD-PARTY-NOTICES.md', 'bin', 'bitdb', 'devices', 'package.json', 'src']);
  const code = [...files].filter(f => /\.(m?js)$/.test(f));
  assert.ok(code.length > 50 && files.has('src/index.js') && files.has('src/node.js') && files.has('src/parts.js'));
  const missing = [];
  for (const f of code) {
    for (const [, spec] of fs.readFileSync(path.join(pkg, f), 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
      if (!files.has(target)) missing.push(`${f}: ${spec}`);
    }
  }
  assert.deepEqual(missing, []);
  // the exports and the command line in it
  const json = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
  for (const t of [...Object.values(json.exports), ...Object.values(json.bin)]) assert.ok(files.has(t.replace(/^\.\//, '')), t);
});

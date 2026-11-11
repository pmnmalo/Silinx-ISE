#!/usr/bin/env node
// Third-party notices: every production dependency shipped with Silinx (the app zip includes
// node_modules; the single-file Silinx.html embeds CodeMirror and elkjs), with its licence text; and
// silinx-fpga's own (#1681), the dependencies its npm package installs.
//   node scripts/third-party.mjs          writes THIRD-PARTY-NOTICES.md, core/third-party.js and
//                                         packages/silinx-fpga/THIRD-PARTY-NOTICES.md
//   node scripts/third-party.mjs --check  fails when they are out of date (used by the tests)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { importMapPackages } from '../server/import-map.js';
import { DOWNLOADED_PACKAGES } from './downloaded-packages.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// embedded in the standalone Silinx.html (scripts/build-standalone.mjs): elkjs and the editor's
// modules (CodeMirror 6, the import map of web/index.html)
const STANDALONE = new Set(['elkjs', ...importMapPackages()]);
// where to get the source of copyleft components (EPL-2.0 asks for it)
const SOURCE = { elkjs: 'https://github.com/kieler/elkjs' };

// this repository's own packages (its npm workspaces, packages/*: silinx-fpga, #1677): not third-party, their
// dependencies are
const WORKSPACES = new Set(fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true }).filter(e => e.isDirectory())
  .map(e => { try { return JSON.parse(fs.readFileSync(path.join(root, 'packages', e.name, 'package.json'), 'utf8')).name; } catch { return null; } }).filter(Boolean));

let npmTree;
// the production dependencies: the IDE's, or one workspace's (only: its name)
function productionDeps(only) {
  const tree = npmTree ??= JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }));
  const seen = new Map();
  const walk = (deps, dir) => {
    for (const [name, info] of Object.entries(deps || {})) {
      if (!info.version) continue;   // (an optional peer not installed: ws's bufferutil, utf-8-validate)
      const key = `${name}@${info.version}`;
      if (WORKSPACES.has(name)) { walk(info.dependencies, root); continue; }
      if (!seen.has(key)) {
        // the package folder: npm puts most at the top level, conflicting versions nested
        const cands = [path.join(dir, 'node_modules', name), path.join(root, 'node_modules', name)];
        const pkgDir = cands.find(d => { try { return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version === info.version; } catch { return false; } }) || cands[1];
        seen.set(key, { name, version: info.version, dir: pkgDir });
      }
      walk(info.dependencies, path.join(dir, 'node_modules', name));
    }
  };
  walk(only ? tree.dependencies[only].dependencies : tree.dependencies, root);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version, undefined, { numeric: true }));
}

function describe(d) {
  const pkg = JSON.parse(fs.readFileSync(path.join(d.dir, 'package.json'), 'utf8'));
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || (pkg.licenses || []).map(l => l.type || l).join(' OR ') || 'UNKNOWN';
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
  const url = (pkg.homepage || repo).replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '').replace(/^github:/, 'https://github.com/') || `https://www.npmjs.com/package/${d.name}`;
  const file = fs.readdirSync(d.dir).find(f => /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i.test(f)) || fs.readdirSync(d.dir).find(f => /^licen[cs]e/i.test(f));
  let text = file ? fs.readFileSync(path.join(d.dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : '';
  // no licence file in the package: the text kept in scripts/licences/ (e.g. @yowasp/yosys: YoWASP,
  // Yosys and ABC, which its WebAssembly build contains)
  const kept = path.join(root, 'scripts', 'licences', `${d.name.replace('/', '__')}.txt`);
  if (!text && fs.existsSync(kept)) text = fs.readFileSync(kept, 'utf8').replace(/\r\n/g, '\n').trim();
  if (!text) {   // no licence file: the License section of the README (e.g. cookie-signature)
    const readme = fs.readdirSync(d.dir).find(f => /^readme(\.(md|markdown|txt))?$/i.test(f));
    const m = readme && /^#+\s*licen[cs]e\b.*\n([\s\S]*?)(?=\n#+\s|(?![\s\S]))/im.exec(fs.readFileSync(path.join(d.dir, readme), 'utf8').replace(/\r\n/g, '\n'));
    if (m) text = m[1].trim();
  }
  // (not in the zip: downloaded on its first use, #2444, #2570)
  const downloaded = DOWNLOADED_PACKAGES.includes(d.name);
  return { name: d.name, version: d.version, license, url, text, standalone: STANDALONE.has(d.name), source: SOURCE[d.name] || null,
    ...(downloaded ? { downloaded, note: 'Not in silinx-<version>.zip: Silinx downloads it from npm\'s registry on its first use.' } : {}) };
}

// code ported into Silinx (not an npm package): its licence, kept in scripts/licences/
const PORTED = [
  { name: 'light8080', version: '57163bc', ported: true, license: 'LGPL-2.1', url: 'https://github.com/jaruiz/light8080',
    note: 'examples/micro80/src/light8080.vhdl and light8080_ucode_pkg.vhdl, the processor of the micro80 example, are its files as they are.' },
  { name: 'adepttool', version: 'ported', ported: true, license: 'MIT', url: 'https://github.com/mwkmwkmwk/adepttool', standalone: true,
    note: 'core/adept.js (the Digilent Adept USB programmer over WebUSB) is a JavaScript port of its USB and JTAG code.' },
  // the 7-series' bitstream (#3144), in silinx-fpga too
  { name: 'prjxray', version: 'c9f02d8', ported: true, license: 'ISC', url: 'https://github.com/f4pga/prjxray', fpga: true,
    note: 'packages/silinx-fpga/src/fpga/xc7/ (the 7-series\' frames and .bit of nextpnr\'s FASM) is a JavaScript port of its fasm2frames and xc7frames2bit.' },
  { name: 'prjxray-db', version: '0a0adde', ported: true, license: 'CC0-1.0', url: 'https://github.com/f4pga/prjxray-db', fpga: true,
    note: 'packages/silinx-fpga/bitdb/xc7/ is the subset of its database (artix7) the xc7a35t\'s bitstream needs.' },
  // the Gowin's bitstream (#2303), in silinx-fpga too; its chip databases are read from YoWASP's package, not shipped
  { name: 'apicula', version: '0.32', ported: true, license: 'MIT', url: 'https://github.com/YosysHQ/apicula', fpga: true,
    note: 'packages/silinx-fpga/src/fpga/gowin/ (the Gowin\'s .fs of nextpnr-himbaechel-gowin\'s routed netlist) is a JavaScript port of its gowin_pack and of the parts of its chipdb, bslib and attrids that gowin_pack uses; the chip databases it reads are Apicula\'s, in @yowasp/nextpnr-himbaechel-gowin, not shipped by Silinx.' },
];
const portedText = c => ({ ...c, source: null, text: fs.readFileSync(path.join(root, 'scripts', 'licences', `${c.name}.txt`), 'utf8').replace(/\r\n/g, '\n').trim() });

function build() {
  const ported = PORTED.map(portedText);
  const comps = [...productionDeps().map(describe), ...ported].sort((a, b) => a.name.localeCompare(b.name));
  const own = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const md = [
    '# Third-party notices',
    '',
    `Silinx (Copyright 2026 Pedro Maló, ${own.license}) includes the open-source components listed`,
    'below. The app (silinx-<version>.zip) ships all of them but the ones it downloads on their first use;',
    'the single-file Silinx.html embeds the ones marked *standalone*. Each one keeps its own licence,',
    'reproduced in full here.',
    'This file is generated by `node scripts/third-party.mjs` from the installed dependencies.',
    '',
    '| Component | Version | Licence | In Silinx.html | Project |',
    '|---|---|---|---|---|',
    ...comps.map(c => `| ${c.name} | ${c.version} | ${c.license} | ${c.standalone ? 'standalone' : ''} | ${c.url} |`),
    '',
    ...comps.filter(c => c.source).map(c => `The source code of ${c.name} (${c.license}) is available at ${c.source}.`),
    '',
    ...comps.flatMap(c => [`## ${c.name} ${c.version} — ${c.license}`, '', c.url, '', '```text', c.text || `(no licence file in the package; licence: ${c.license})`, '```', '', ...(c.note ? [c.note, ''] : [])]),
  ].join('\n');
  const js = [
    '// Silinx - open-source components shipped with Silinx (shown in Help ▸ About).',
    '// Generated by scripts/third-party.mjs from the production dependencies: do not edit.',
    `export const THIRD_PARTY = ${JSON.stringify(comps.map(({ name, version, license, url, standalone, ported, downloaded }) => ({ name, version, license, url, standalone, ...(ported ? { ported } : {}), ...(downloaded ? { downloaded } : {}) })), null, 2)};`,
    '',
  ].join('\n');
  return { md, js, comps, fpga: buildFpga() };
}

// silinx-fpga's (#1681): the components its npm package installs, with their licence texts
function buildFpga() {
  const comps = [...productionDeps('silinx-fpga').map(describe), ...PORTED.filter(c => c.fpga).map(portedText)].sort((a, b) => a.name.localeCompare(b.name));
  const own = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'silinx-fpga', 'package.json'), 'utf8'));
  return [
    '# Third-party notices',
    '',
    `silinx-fpga (Copyright 2026 Pedro Maló, ${own.license}) depends on the open-source components listed below,`,
    'which npm installs with it, and includes the ported ones (their code or data in its own files). Each one keeps its own licence, reproduced in full here. This file is generated by',
    '`node scripts/third-party.mjs` (in the Silinx repository) from the installed dependencies.',
    '',
    '| Component | Version | Licence | Project |',
    '|---|---|---|---|',
    ...comps.map(c => `| ${c.name} | ${c.version} | ${c.license} | ${c.url} |`),
    '',
    ...comps.flatMap(c => [`## ${c.name} ${c.version} — ${c.license}`, '', c.url, '', '```text', c.text || `(no licence file in the package; licence: ${c.license})`, '```', '', ...(c.note ? [c.note, ''] : [])]),
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { md, js, comps, fpga } = build();
  const files = [[path.join(root, 'THIRD-PARTY-NOTICES.md'), md], [path.join(root, 'core/third-party.js'), js],
    [path.join(root, 'packages/silinx-fpga/THIRD-PARTY-NOTICES.md'), fpga]];
  if (process.argv.includes('--check')) {
    const stale = files.filter(([f, t]) => { try { return fs.readFileSync(f, 'utf8') !== t; } catch { return true; } }).map(([f]) => path.relative(root, f));
    if (stale.length) { console.error(`out of date: ${stale.join(', ')} — run: node scripts/third-party.mjs`); process.exit(1); }
    console.log(`third-party notices up to date (${comps.length} components)`);
  } else {
    for (const [f, t] of files) fs.writeFileSync(f, t);
    console.log(`wrote THIRD-PARTY-NOTICES.md, core/third-party.js and packages/silinx-fpga/THIRD-PARTY-NOTICES.md (${comps.length} components)`);
  }
}

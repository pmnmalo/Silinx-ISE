// What the release zip leaves out of its node_modules (#3232): the files the app never reads, so that the zip stays
// within its budget (test/release/release.test.js) as the shared projects' packages came in (#3214, #3263).
// - of every package: its source maps and its type declarations (nothing loads them when the app runs);
// - of the shared projects' packages: their tests, demos and coverage, which their own npm packages ship;
// - of CodeMirror's legacy modes: all but the editor's (VHDL, Verilog, C).
// Their entry points, the import map's targets (web/index.html) and their licences stay (test/zip-trim.test.js).
//   leaveOutUnused(app) -> { files, bytes }: what was removed from app/node_modules
import fs from 'node:fs';
import path from 'node:path';

/** Of every package. */
const UNUSED = /\.(map|d\.ts|d\.mts|d\.cts)$/;
/** Of some packages, their paths inside them (yjs's tests/ apart: its exports name tests/testHelper.js). */
const UNUSED_IN = Object.freeze({
  lib0: [/^coverage\//, /\.test\.(js|cjs|mjs)$/, /^dist\/test\.(cjs|js|mjs)$/],
  'y-protocols': [/\.test\.(js|cjs|mjs)$/, /^dist\/test\.(cjs|js|mjs)$/],
  'y-codemirror.next': [/^dist\/(demo|test)\.(cjs|js|mjs)$/],
  // (the editor's three modes of the hundred: web/js/editor.js, the import map)
  '@codemirror/legacy-modes': [/^mode\/(?!(vhdl|verilog|clike)\.)/],
});

// the packages of a node_modules folder: [{ name, dir }], scoped ones too, nested node_modules apart
function packagesOf(nm) {
  const out = [];
  if (!fs.existsSync(nm)) return out;
  for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    if (e.name.startsWith('@')) {
      for (const s of fs.readdirSync(path.join(nm, e.name), { withFileTypes: true })) if (s.isDirectory()) out.push({ name: `${e.name}/${s.name}`, dir: path.join(nm, e.name, s.name) });
    } else out.push({ name: e.name, dir: path.join(nm, e.name) });
  }
  return out;
}

/** The files a package's folder holds, as paths inside it (its own node_modules apart). */
export function filesOf(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...filesOf(dir, rel)); }
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

/** Whether the zip leaves out a package's file (`rel`: its path inside the package). */
export const unused = (name, rel) => UNUSED.test(rel) || (UNUSED_IN[name] || []).some(re => re.test(rel));

/** Removes the files the app never reads from app/node_modules. */
export function leaveOutUnused(app) {
  let files = 0, bytes = 0;
  for (const { name, dir } of packagesOf(path.join(app, 'node_modules'))) {
    for (const rel of filesOf(dir)) {
      if (!unused(name, rel)) continue;
      const f = path.join(dir, rel);
      bytes += fs.statSync(f).size;
      fs.rmSync(f);
      files++;
    }
  }
  return { files, bytes };
}

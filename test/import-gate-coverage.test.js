// Every importer goes through the import gate (core/import-gate.js, #2830): a module of the application that reads a
// file from outside (a file picked or dropped, a zip, an upload, the MCP's exchange folder, a design link's compressed
// text) imports the gate, or is listed below with the reason it needs none. A new importer that bypasses the gate fails
// here: route it through gateZip / gateEntries / gateFile, or say here why it reads nothing a project keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['core', 'server', 'web/js'];

// what reads a file from outside
const MARKERS = [
  [/h\('input',\s*\{[^}]*type:\s*'file'/, 'a file input'],
  [/dataTransfer\.files/, 'files dropped'],
  [/showOpenFilePicker/, 'a file picker'],
  [/\breadZip\(/, 'a zip read'],
  [/new FileReader\b/, 'a FileReader'],
  [/DecompressionStream\('deflate-raw'\)/, 'compressed text inflated (a zip, a design link)'],
  [/express\.raw\(/, 'an upload'],
  [/exchangePath\(/, "the MCP's exchange folder"],
  [/\bimport(Zip|Xise|Bundle):\s*async\b/, "the browser edition's import of a project"],
  [/api\.post\('\/projects\/import-/, "the server's import of a project"],
];
// the modules that read such a file but need no gate: why (`via`: the module that gates what they hand on)
const ALLOW = {
  'core/import-gate.js': { why: 'the gate itself' },
  'core/zip.js': { why: 'the zip reader the gate calls (gateZip), with its caps and its check of each entry' },
  'core/collab-codes.js': { why: 'a WebRTC session description a follower or the owner pastes (#3227): sealed with the link\'s key, its size capped inflated; never a project\'s file' },
  'web/js/api.js': { why: 'the local server\'s client: it sends the zip or the .xise to the server, which gates them', via: 'server/xise-routes.js' },
  'web/js/wizards.js': { why: 'Import Source\'s files go through core/import-source.js importSourceFile, which gates each one (gateFile, #3546)' },
  'web/js/project-zip-dialogs.js': { why: 'Import Project (.zip)… (#3703): the files picked go to api.importZip / importXise, gated by the server (server/xise-routes.js) or the browser edition (web/js/api-local.js); its own zip read lists the entries\' names only, to preselect the software, none inflated nor kept', via: 'web/js/api-local.js' },
  'web/js/impact.js': { why: 'a bitstream programmed into a board, never kept in a project' },
  'server/mcp-hdl.js': { why: 'simulate writes a VCD into the exchange folder: an output, nothing read' },
  'server/mcp-grade.js': { why: 'grade\'s submissions of the exchange folder are read by server/grade.js, through the gate; its CSV and student\'s copy are outputs', via: 'server/grade.js' },
};

const GATE = /core\/import-gate\.js['"]/;
function files() {
  const out = [];
  const walk = (rel) => {
    for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = `${rel}/${d.name}`;
      if (d.isDirectory()) { if (d.name !== 'vendor') walk(r); } else if (/\.m?js$/.test(d.name)) out.push(r);
    }
  };
  for (const d of DIRS) walk(d);
  return out;
}

test('every module that reads a file from outside imports the import gate, or says why it needs none', () => {
  const bypass = [], seen = new Set();
  for (const f of files()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const found = MARKERS.filter(([re]) => re.test(src)).map(([, what]) => what);
    if (!found.length) continue;
    seen.add(f);
    const allow = ALLOW[f];
    if (allow) {
      if (allow.via) assert.match(fs.readFileSync(path.join(ROOT, allow.via), 'utf8'), GATE, `${f}: ${allow.via} imports the gate`);
      continue;
    }
    if (!GATE.test(src)) bypass.push(`${f} (${found.join(', ')})`);
  }
  assert.deepEqual(bypass, [], 'importers that bypass core/import-gate.js');
  // the list stays exact: an entry whose module no longer reads such a file leaves it
  assert.deepEqual(Object.keys(ALLOW).filter(f => !seen.has(f)), []);
  // the importers known today are among those found (the scan sees them)
  for (const f of ['web/js/wizards.js', 'web/js/petri-toolbar.js', 'web/js/api-local.js', 'server/xise-routes.js', 'server/mcp-transfer.js']) assert.ok(seen.has(f), f);
});

test('the project importers take only a gate\'s result; the MCP\'s write_file gates what it writes', () => {
  for (const [f, fn] of [['server/project-zip.js', 'importProjectEntries'], ['web/js/project-store.js', 'projectFromZip']]) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(src, new RegExp(`export (async )?function ${fn}\\([^)]*\\) \\{\\n  const entries = requireGated\\(`), `${f}: ${fn} starts with requireGated`);
  }
  const mcp = fs.readFileSync(path.join(ROOT, 'server/mcp-projects.js'), 'utf8');
  const write = mcp.slice(mcp.indexOf("name: 'write_file'"));
  assert.ok(write.indexOf('gateFile(') > 0 && write.indexOf('gateFile(') < write.indexOf('P.writeFile('), 'write_file: gateFile before the file is written');
  // Import Source (#3546): the dialog and the MCP's import_source copy through importSourceFile, which gates the file
  const copy = fs.readFileSync(path.join(ROOT, 'core/import-source.js'), 'utf8');
  assert.match(copy, /export function importSourceFile\([^)]*\) \{\n {2}const path = [^\n]*\n {2}let text[^\n]*\n {2}try \{\n {4}const g = gateFile\(path, data\);/, 'importSourceFile gates first');
  for (const [f, from, write] of [['web/js/wizards.js', 'export async function addSourceDialog', 'api.writeFile('], ['server/mcp-transfer.js', "name: 'import_source'", 'P.writeFile(']]) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const body = src.slice(src.indexOf(from));
    assert.ok(body.indexOf('importSourceFile(') > 0 && body.indexOf('importSourceFile(') < body.indexOf(write), `${f}: importSourceFile before the file is written`);
  }
});

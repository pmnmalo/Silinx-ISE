// A file's path by one rule in the browser's store and on the server (#3598, core/import-gate.js filePath): the same
// answer, the same message, for every file operation (read, write, rename, delete), in both editions and in the MCP's
// file tools. Before it, the server read src/../x.v as x.v and refused src\y.v; the browser's store the other way.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { filePath } from '../core/import-gate.js';
import { browserStore, projectOps, cleanPath } from '../web/js/project-store.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-file-path-test-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
const VHD = 'entity x is end;\narchitecture a of x is begin end;\n';
const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

// each path, and what the rule makes of it: its canonical path, or the message every operation throws
const CASES = {
  'src/../x.v': "'src/../x.v': invalid path: path leaves the project ('..')",
  'src\\y.v': "'src\\y.v': invalid path: backslash in the name",
  'src/..': "'src/..': invalid path: path leaves the project ('..')",
  '../x.v': "'../x.v': invalid path: path leaves the project ('..')",
  '/etc/x.v': "'/etc/x.v': invalid path: absolute path",
  'C:\\x.v': "'C:\\x.v': invalid path: absolute path (a drive letter)",
  'C:x.v': "'C:x.v': invalid path: absolute path (a drive letter)",
  'src/a\n.v': "'src/a\n.v': invalid path: control character in the name",
  '': 'missing path',
  './': "'./': invalid path: the project's folder, not a file's path",
};
const OK = { './src//a.v': 'src/a.v', 'src/./b.v': 'src/b.v', 'src/..c.v': 'src/..c.v', 'd/': 'd' };

test('#3598 filePath: the rule, its canonical paths and its messages', () => {
  for (const [p, message] of Object.entries(CASES)) {
    assert.equal(filePath(p).message, message, JSON.stringify(p));
    assert.throws(() => cleanPath(p), { message }, `cleanPath ${JSON.stringify(p)}`);
  }
  for (const v of [undefined, null, 42, ['a.v']]) assert.deepEqual(filePath(v), { reason: 'no name', message: 'missing path' });
  for (const [p, n] of Object.entries(OK)) { assert.deepEqual(filePath(p), { path: n }); assert.equal(cleanPath(p), n); }
});

// what an operation answers: the error's message, or 'ok'
const answer = async f => { try { await f(); return 'ok'; } catch (e) { return e.message; } };

test('#3598 the browser\'s store and the server: the same answer for each path, read, write, rename and delete', async () => {
  const s = browserStore(memStorage()), ops = projectOps(() => s, {});
  await ops.create({ name: 'Paths' });
  await P.createProject({ name: 'Paths', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } });
  for (const store of [ops, P]) { await store.writeFile('Paths', 'src/a.vhd', VHD); await store.writeFile('Paths', 'x.v', VHD); }
  const opsOf = store => ({
    read: p => store.readFile('Paths', p),
    write: p => store.writeFile('Paths', p, VHD),
    'rename to': p => store.renameFile('Paths', 'src/a.vhd', p),
    'rename from': p => store.renameFile('Paths', p, 'src/z.vhd'),
    delete: p => store.deleteFile('Paths', p),
  });
  const browser = opsOf(ops), server = opsOf(P);
  for (const [p, message] of Object.entries(CASES)) {
    for (const op of Object.keys(browser)) {
      const b = await answer(() => browser[op](p)), sv = await answer(() => server[op](p));
      assert.deepEqual({ browser: b, server: sv }, { browser: message, server: message }, `${op} ${JSON.stringify(p)}`);
    }
  }
  // (nothing written, renamed or deleted: x.v is still the project's own, not read through src/..)
  assert.deepEqual((await ops.project('Paths')).fileTree.filter(f => /\.(v|vhd)$/.test(f)).sort(), ['src/a.vhd', 'x.v']);
  assert.equal(fs.existsSync(`${P.projectDir('Paths')}/src\\y.v`), false);
  assert.equal(await P.readFile('Paths', './src//a.vhd'), VHD);
  assert.equal(await ops.readFile('Paths', './src//a.vhd'), VHD);
});

test('#3598 the MCP\'s file tools: the same rule and messages', async () => {
  const call = async (name, args) => (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { project: 'Paths', ...args } } })).result;
  for (const [p, message] of Object.entries(CASES)) {
    if (!p) continue;   // (no path: the tool's own 'missing path', mcp.test.js)
    for (const [tool, args] of [['read_file', { path: p }], ['write_file', { path: p, text: VHD }], ['delete_file', { path: p }],
      ['rename_file', { from: 'src/a.vhd', to: p }], ['rename_file', { from: p, to: 'src/z.vhd' }]]) {
      const r = await call(tool, args);
      assert.deepEqual([r.isError, r.content[0].text], [true, `${tool}: ${message}`], `${tool} ${JSON.stringify(args)}`);
    }
  }
});

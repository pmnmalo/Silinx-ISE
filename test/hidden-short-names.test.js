// Hidden paths: their 8.3 aliases refused too (server/paths.js hiddenName, nativeRealOf; core/import-gate.js): a Windows
// short name (GIT~1 for .git) has a '~' and digits in its base name, and a path the system resolves (realpath's native
// form, which expands short names) to a hidden one is refused as well, on every system: the import gate, the server's
// file writes (the interface's route) and the MCP's file tools.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';
import { normalizePath } from '../core/import-gate.js';

let tmp, ws;
const P = await import('../server/projects.js');
const { hiddenName } = await import('../server/paths.js');
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, isError: r.isError };
}
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-short-names-'));
  ws = process.env.SILINX_WORKSPACE;
  await P.createProject({ name: 'p', template: 'gates' });
  fs.mkdirSync(path.join(ws, 'p', '.git'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'p', '.git', 'config'), '[core]\n');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('hiddenName: a dot name, or a short (8.3) name\'s ~ and digits in the base name', () => {
  for (const s of ['.git', '.env', 'GIT~1', 'git~12', 'GITHUB~1.YML', 'VSCODE~1', 'A~9.TXT']) assert.equal(hiddenName(s), true, s);
  for (const s of ['src', 'top.vhd', 'a~b.v', 'top~.v', 'x.v~1', '~', '.', '..', 'notes~draft.txt']) assert.equal(hiddenName(s), false, s);
});

test('the import gate refuses a short name (a zip, a new name, a rename)', () => {
  assert.deepEqual(normalizePath('GIT~1/config'), { reason: 'a short (8.3) name, which may be a hidden file\'s or folder\'s (\'GIT~1\')' });
  assert.deepEqual(normalizePath('src/GITHUB~1.YML'), { reason: 'a short (8.3) name, which may be a hidden file\'s or folder\'s (\'GITHUB~1.YML\')' });
  assert.deepEqual(normalizePath('src/a~b.v'), { path: 'src/a~b.v' });
  assert.deepEqual(normalizePath('src/x.v~1'), { path: 'src/x.v~1' });
});

test('the file writes (the server\'s and the MCP\'s): an alias segment refused, with its message', async () => {
  for (const rel of ['GIT~1/config', 'src/GIT~1/config', 'git~1/hooks/pre-commit']) {
    const seg = rel.split('/').find(hiddenName);
    await assert.rejects(P.writeFile('p', rel, 'x'), { status: 400, message: `'${rel}': not written: hidden file or folder ('${seg}')` });
    await fails('write_file', { project: 'p', path: rel, text: 'x' }, `'${rel}': a hidden file or folder cannot be written`);
    await fails('read_file', { project: 'p', path: rel }, `'${rel}': a hidden file or folder cannot be read`);
  }
  assert.equal(fs.readFileSync(path.join(ws, 'p', '.git', 'config'), 'utf8'), '[core]\n');
  assert.equal(fs.existsSync(path.join(ws, 'p', 'GIT~1')), false);
  // the interface's route: the same
  const app = await startApp();
  try {
    const r = await app.call('PUT', `/projects/p/file?path=${encodeURIComponent('GIT~1/config')}`, 'x');
    assert.deepEqual([r.status, r.body], [400, { error: '\'GIT~1/config\': not written: hidden file or folder (\'GIT~1\')' }]);
    assert.equal((await app.call('PUT', `/projects/p/file?path=${encodeURIComponent('src/a~b.v')}`, 'module a; endmodule\n')).status, 200);
  } finally { await app.close(); }
});

test('a path the system resolves to a hidden one (realpath\'s native form, as Windows expands a short name): refused', async () => {
  // (emulated: a folder 'alias' that the native realpath names .git, as Windows' would name GIT~1)
  const dir = path.join(ws, 'p');
  fs.mkdirSync(path.join(dir, 'alias'));
  const native = fs.realpathSync.native;
  const real = native(dir), alias = path.join(real, 'alias');
  fs.realpathSync.native = (p, ...a) => {
    const r = native(p, ...a);
    return r === alias || r.startsWith(alias + path.sep) ? path.join(real, '.git', r.slice(alias.length)) : r;
  };
  try {
    await assert.rejects(P.writeFile('p', 'alias/config', 'x'), { status: 400, message: '\'alias/config\': not written: hidden file or folder (\'.git\')' });
    await fails('write_file', { project: 'p', path: 'alias/config', text: 'x' }, '\'alias/config\': a hidden file or folder cannot be written');
    await fails('read_file', { project: 'p', path: 'alias/config' }, '\'alias/config\': a hidden file or folder cannot be read');
  } finally { fs.realpathSync.native = native; }
  assert.equal(fs.existsSync(path.join(dir, 'alias', 'config')), false);
  // (the system's own names: written)
  await P.writeFile('p', 'alias/notes.txt', 'x');
  assert.equal(fs.readFileSync(path.join(dir, 'alias', 'notes.txt'), 'utf8'), 'x');
});

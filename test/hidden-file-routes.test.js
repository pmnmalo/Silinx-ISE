// The file routes read, rename and delete no hidden file or folder (#3354, server/projects.js refuseHidden): by its name,
// a short (8.3) name or a symbolic link, as writeFile refuses it (#3036); a folder that holds one (a clone's .git) is
// neither renamed nor deleted, so a clone's untrusted mark (#2830, kept in .git) stays. The interface's routes and the
// MCP's tools alike.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp, ws, app;
const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, isError: r.isError };
}
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const q = encodeURIComponent;
const put = (rel, text) => { const f = path.join(ws, 'p', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const has = rel => fs.existsSync(path.join(ws, 'p', rel));

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-hidden-routes-'));
  ws = process.env.SILINX_WORKSPACE;
  await P.createProject({ name: 'p', template: 'gates' });
  put('.git/config', '[remote]\n');
  put('.env', 'KEY=1\n');
  put('sub/.git/config', '[core]\n');
  put('sub/a.txt', 'a\n');
  fs.symlinkSync(path.join(ws, 'p', '.git'), path.join(ws, 'p', 'src', 'g'));
  app = await startApp();
});
after(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('readFile, renameFile, deleteFile: a hidden path refused, by its name, a short name or a link, with its message', async () => {
  for (const [rel, seg] of [['.git/config', '.git'], ['.env', '.env'], ['GIT~1/config', 'GIT~1'], ['src/g/config', '.git'], ['sub/.git/config', '.git']]) {
    await assert.rejects(P.readFile('p', rel), { status: 400, message: `'${rel}': not read: hidden file or folder ('${seg}')` }, rel);
    await assert.rejects(P.renameFile('p', rel, 'src/x.txt'), { status: 400, message: `'${rel}': not renamed: hidden file or folder ('${seg}')` }, rel);
    await assert.rejects(P.deleteFile('p', rel), { status: 400, message: `'${rel}': not deleted: hidden file or folder ('${seg}')` }, rel);
  }
  // a new name through a link to a hidden folder (the import gate checks its name only)
  await assert.rejects(P.renameFile('p', 'sub/a.txt', 'src/g/a.txt'), { status: 400, message: '\'src/g/a.txt\': not renamed: hidden file or folder (\'.git\')' });
  for (const rel of ['.git/config', '.env', 'sub/.git/config', 'sub/a.txt']) assert.ok(has(rel), rel);
  assert.equal(has('src/x.txt'), false);
});

test('the routes: the same refusals', async () => {
  let r = await app.call('GET', `/projects/p/file?path=${q('.git/config')}`);
  assert.deepEqual([r.status, r.body], [400, { error: '\'.git/config\': not read: hidden file or folder (\'.git\')' }]);
  r = await app.call('GET', '/projects/p/file?path=.env');
  assert.deepEqual([r.status, r.body], [400, { error: '\'.env\': not read: hidden file or folder (\'.env\')' }]);
  r = await app.call('POST', '/projects/p/rename', { from: '.git', to: 'git' });
  assert.deepEqual([r.status, r.body], [400, { error: '\'.git\': not renamed: hidden file or folder (\'.git\')' }]);
  r = await app.call('DELETE', '/projects/p/file?path=.git');
  assert.deepEqual([r.status, r.body], [400, { error: '\'.git\': not deleted: hidden file or folder (\'.git\')' }]);
  r = await app.call('DELETE', `/projects/p/file?path=${q('GIT~1')}`);
  assert.deepEqual([r.status, r.body], [400, { error: '\'GIT~1\': not deleted: hidden file or folder (\'GIT~1\')' }]);
  // a folder that holds a hidden one
  r = await app.call('POST', '/projects/p/rename', { from: 'sub', to: 'sub2' });
  assert.deepEqual([r.status, r.body], [400, { error: '\'sub\': not renamed: the folder holds a hidden file or folder (\'sub/.git\')' }]);
  r = await app.call('DELETE', '/projects/p/file?path=sub');
  assert.deepEqual([r.status, r.body], [400, { error: '\'sub\': not deleted: the folder holds a hidden file or folder (\'sub/.git\')' }]);
  for (const rel of ['.git/config', '.env', 'sub/.git/config', 'sub/a.txt']) assert.ok(has(rel), rel);
  // what is not hidden: read, renamed and deleted as before
  r = await app.call('GET', '/projects/p/file?path=sub/a.txt');
  assert.deepEqual([r.status, r.body], [200, 'a\n']);
  put('tmp/b.txt', 'b\n');
  assert.equal((await app.call('POST', '/projects/p/rename', { from: 'tmp/b.txt', to: 'tmp/c.txt' })).status, 200);
  assert.equal((await app.call('DELETE', '/projects/p/file?path=tmp')).status, 200);
  assert.equal(has('tmp'), false);
});

test('the MCP\'s tools: a folder that holds a hidden one, refused with the same message', async () => {
  await fails('rename_file', { project: 'p', from: 'sub', to: 'sub2' }, '\'sub\': not renamed: the folder holds a hidden file or folder (\'sub/.git\')');
  await fails('delete_file', { project: 'p', path: 'sub' }, '\'sub\': not deleted: the folder holds a hidden file or folder (\'sub/.git\')');
  await fails('rename_file', { project: 'p', from: '.git', to: 'git' }, '\'.git\': a hidden file or folder cannot be renamed');
  await fails('delete_file', { project: 'p', path: '.git' }, '\'.git\': a hidden file or folder cannot be deleted');
  await fails('read_file', { project: 'p', path: 'src/g/config' }, '\'src/g/config\': a hidden file or folder cannot be read');
  assert.ok(has('sub/.git/config'));
  // a Mac's .DS_Store is no reason to keep a folder
  put('mac/.DS_Store', 'x');
  put('mac/a.txt', 'a\n');
  const r = await call('delete_file', { project: 'p', path: 'mac' });
  assert.equal(r.isError, false, r.text);
  assert.equal(has('mac'), false);
});

test('a clone stays untrusted: its .git, with the mark, is neither renamed nor deleted', async () => {
  await P.createProject({ name: 'clone', template: 'gates' });
  const dir = path.join(ws, 'clone');
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, P.CLONE_TRUST), JSON.stringify({ trusted: false }) + '\n');
  assert.equal((await P.readProject('clone')).trusted, false);
  for (const [m, url, body] of [['DELETE', '/projects/clone/file?path=.git'], ['DELETE', `/projects/clone/file?path=${q('.git/silinx-trust.json')}`],
    ['POST', '/projects/clone/rename', { from: '.git', to: 'git' }], ['POST', '/projects/clone/rename', { from: '.git/silinx-trust.json', to: 'x.json' }]]) {
    assert.equal((await app.call(m, url, body)).status, 400, url);
  }
  await fails('delete_file', { project: 'clone', path: '.git' }, '\'.git\': a hidden file or folder cannot be deleted');
  await fails('rename_file', { project: 'clone', from: '.git', to: 'git' }, '\'.git\': a hidden file or folder cannot be renamed');
  assert.ok(fs.existsSync(path.join(dir, P.CLONE_TRUST)));
  assert.equal((await P.readProject('clone')).trusted, false);
});

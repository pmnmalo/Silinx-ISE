// Delete File / Delete Folder into the workspace's .trash (#3364, server/projects.js deleteFile { trash }): the
// interface's route (trash=1) and the MCP's delete_file move a file or a folder to .trash/<project>-<time>/<its path>,
// as delete_project moves a project, from where it can be moved back; the project's other files as they were, its
// silinx.json without the files; a deletion of Silinx's own (a drawing's HDL made again: no trash=1) deletes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp, ROOT } from './server-helpers.js';

let tmp, ws;
const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const example = (...p) => read(ROOT, 'examples', 'stopwatch', ...p);
// every file of a folder, its path with '/'
const tree = dir => fs.readdirSync(dir, { recursive: true }).map(f => f.split(path.sep).join('/')).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort();

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-delete-trash-'));
  ws = process.env.SILINX_WORKSPACE;
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the interface\'s Delete: a file and a folder into the workspace\'s .trash, the other files as they were; Silinx\'s own deletion deletes', async () => {
  await P.createProject({ name: 'sw', template: 'stopwatch' });
  const dir = P.projectDir('sw'), before = tree(dir);
  const app = await startApp();
  try {
    let r = await app.call('DELETE', `/projects/sw/file?path=${encodeURIComponent('src/debounce.vhd')}&trash=1`);
    assert.equal(r.status, 200);
    assert.match(r.body.trashed, /^\.trash\/sw-\d+\/src\/debounce\.vhd$/);
    assert.deepEqual(r.body, { ok: true, trashed: r.body.trashed });
    assert.equal(read(ws, r.body.trashed), example('src', 'debounce.vhd'));
    assert.equal(fs.existsSync(path.join(dir, 'src', 'debounce.vhd')), false);
    assert.equal((await P.readProject('sw')).files.some(f => f.path === 'src/debounce.vhd'), false);
    // a folder: the whole of it, at its path
    r = await app.call('DELETE', `/projects/sw/file?path=sim&trash=1`);
    assert.match(r.body.trashed, /^\.trash\/sw-\d+(-\d+)?\/sim$/);
    assert.deepEqual(tree(path.join(ws, r.body.trashed)), fs.readdirSync(path.join(ROOT, 'examples', 'stopwatch', 'sim')).sort());
    assert.equal(fs.existsSync(path.join(dir, 'sim')), false);
    // the project's other files as they were
    const left = before.filter(f => f !== 'src/debounce.vhd' && !f.startsWith('sim/') && f !== 'silinx.json');
    assert.deepEqual(tree(dir).filter(f => f !== 'silinx.json'), left);
    for (const f of left) assert.equal(read(dir, f), example(f), f);
    // no trash=1 (a drawing's HDL made again, a conversion): deleted, nothing in .trash
    const trashed = tree(path.join(ws, '.trash'));
    r = await app.call('DELETE', `/projects/sw/file?path=${encodeURIComponent('src/sevenseg.vhd')}`);
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);
    assert.equal(fs.existsSync(path.join(dir, 'src', 'sevenseg.vhd')), false);
    assert.deepEqual(tree(path.join(ws, '.trash')), trashed);
    // refused as before: silinx.json, the folder itself, a hidden file
    assert.deepEqual(await app.call('DELETE', '/projects/sw/file?path=silinx.json&trash=1').then(x => [x.status, x.body]), [400, { error: 'silinx.json cannot be deleted' }]);
    assert.deepEqual(await app.call('DELETE', '/projects/sw/file?path=.&trash=1').then(x => [x.status, x.body]), [400, { error: "'.': invalid path: the project's folder, not a file's path" }]);
  } finally { await app.close(); }
});

test('the MCP\'s delete_file: a folder into the workspace\'s .trash, said where; the project\'s other files as they were', async () => {
  await P.createProject({ name: 'm', template: 'stopwatch' });
  const dir = P.projectDir('m');
  const r = await call('delete_file', { project: 'm', path: 'src' });
  assert.equal(r.isError, false, r.text);
  assert.match(r.data.trashed, /^\.trash\/m-\d+\/src$/);
  assert.equal(r.text, `INFO: The top-level module 'stopwatch' is no longer in the project, nor any other module.\nsrc deleted (a folder: 4 file(s); moved to the workspace's .trash folder: ${r.data.trashed}).`);
  assert.deepEqual(tree(path.join(ws, r.data.trashed)), ['debounce.vhd', 'sevenseg.vhd', 'stopwatch.vhd', 'to_decimal.vhd']);
  for (const f of tree(path.join(ws, r.data.trashed))) assert.equal(read(ws, r.data.trashed, f), example('src', f));
  assert.equal(fs.existsSync(path.join(dir, 'src')), false);
  for (const f of tree(dir).filter(x => x !== 'silinx.json')) assert.equal(read(dir, f), example(f), f);
  assert.deepEqual((await P.readProject('m')).files.map(f => f.path), ['sim/tb_stopwatch.vhd']);
});

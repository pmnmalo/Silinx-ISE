// What the MCP server gives an assistant of the user's folders: import_project never takes the exchange folder (the
// user's Downloads) as a whole, by a .xise at its root or by the folder itself (#3412); read_file of build/ redacted as
// get_report is, and the workspace and the exchange folder named as such in results and errors, never their absolute
// paths (#3418).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp, xchg;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-exchange-paths-'));
  xchg = path.join(tmp, 'exchange');
  fs.mkdirSync(xchg);
  process.env.SILINX_MCP_FOLDER = xchg;
  // (the ISE machine, as Toolchain Settings' ssh mode names it: a made-up one)
  process.env.SILINX_ISE_HOST = 'student@ise-box.example';
});
after(() => { delete process.env.SILINX_ISE_HOST; fs.rmSync(tmp, { recursive: true, force: true }); });

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content.map(c => c.text).join('\n'), data: r.structuredContent, isError: r.isError };
}
const XISE = '<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://www.xilinx.com/XMLSchema"><files><file xil_pn:name="top.vhd" xil_pn:type="FILE_VHDL"/></files></project>\n';

test('#3412 import_project: a .xise at the exchange folder\'s root, or the folder itself, refused; the other files not taken', async () => {
  fs.writeFileSync(path.join(xchg, 'a.xise'), XISE);
  fs.writeFileSync(path.join(xchg, 'top.vhd'), 'entity top is end;\narchitecture a of top is begin end;\n');
  fs.writeFileSync(path.join(xchg, 'notes.txt'), 'private notes');
  fs.mkdirSync(path.join(xchg, 'other'));
  fs.writeFileSync(path.join(xchg, 'other', 'thesis.vhd'), '-- a thesis');
  for (const from of ['a.xise', path.join(xchg, 'a.xise'), '<exchange folder>/a.xise']) {
    const r = await call('import_project', { name: 'x', from });
    assert.deepEqual([r.isError, r.text], [true, `import_project: from: '${from.replace(xchg, '<exchange folder>')}' is at the exchange folder's root, with whatever else is there: put the ISE project in a folder of its own and import that folder's .xise`], from);
  }
  for (const from of ['.', xchg, '<exchange folder>', 'other/..']) {
    const r = await call('import_project', { name: 'x', from });
    assert.deepEqual([r.isError, r.text], [true, `import_project: from: '${from.replace(xchg, '<exchange folder>')}' is the exchange folder itself: give a project's own folder in it`], from);
  }
  assert.equal(fs.existsSync(P.projectDir('x')), false);
  // (in a folder of its own: its files only)
  fs.mkdirSync(path.join(xchg, 'ise'));
  fs.renameSync(path.join(xchg, 'a.xise'), path.join(xchg, 'ise', 'a.xise'));
  fs.renameSync(path.join(xchg, 'top.vhd'), path.join(xchg, 'ise', 'top.vhd'));
  const r = await call('import_project', { name: 'x', from: 'ise/a.xise' });
  assert.equal(r.isError, false, r.text);
  const files = fs.readdirSync(P.projectDir('x'), { recursive: true }).map(f => String(f).split(path.sep).join('/'));
  assert.ok(files.includes('top.vhd'), files.join(', '));
  assert.deepEqual(files.filter(f => /notes|thesis|other/.test(f)), []);
});

test('#3418 read_file of build/: the ISE machine redacted, as get_report has it', async () => {
  await P.createProject({ name: 'rep' });
  await P.writeFile('rep', 'build/top.syr', 'Synthesis on student@ise-box.example by ssh\nhost ise-box.example\n');
  await P.writeFile('rep', 'src/notes.txt', 'x');
  const r = await call('read_file', { project: 'rep', path: 'build/top.syr' });
  assert.equal(r.isError, false, r.text);
  assert.match(r.text, /^Synthesis on <ISE host> by ssh\nhost <ISE host>\n/);
  assert.doesNotMatch(r.text, /ise-box/);
});

test('#3418 the workspace and the exchange folder named as such in results and errors, never their absolute paths', async () => {
  const list = await call('list_projects');
  assert.equal(list.data.workspace, '<workspace>');
  const x = await call('export_project', { project: 'rep', kind: 'silinx', path: 'rep.zip' });
  assert.equal(x.isError, false, x.text);
  assert.deepEqual([x.data.path, x.data.folder], ['<exchange folder>/rep.zip', '<exchange folder>']);
  assert.match(x.text, /^Exported 'rep' as a Silinx project: <exchange folder>\/rep\.zip \(\d+ bytes\)\.$/);
  // (the path as the result names it is one of the exchange folder's)
  assert.equal((await call('import_project', { name: 'rep2', from: x.data.path })).isError, false);
  const e = await call('import_project', { name: 'n', from: 'none.zip' });
  assert.equal(e.text, "import_project: no file or folder '<exchange folder>/none.zip'");
  for (const r of [list, x, e]) assert.ok(!JSON.stringify(r).includes(tmp), JSON.stringify(r));
  // (a folder's name only where it ends: one that starts the same is not the exchange folder)
  fs.mkdirSync(`${xchg}2`);
  const o = await call('export_project', { project: 'rep', path: path.join(`${xchg}2`, 'r.zip') });
  assert.equal(o.text, `export_project: path: '${path.join(`${xchg}2`, 'r.zip')}' is outside the exchange folder (SILINX_MCP_FOLDER sets another)`);
});

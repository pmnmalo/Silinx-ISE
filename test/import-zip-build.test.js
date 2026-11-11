// An imported project never gets a build/ (#3405, server/project-zip.js importProjectEntries): the import gate refuses
// build/ by a path's first segment, and a zip (or a folder) whose project is under a root folder is checked again once
// that folder is taken off, so p/build/top.bit is refused as build/top.bit is. The interface's route and the MCP's
// import_project alike.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-import-build-'));
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { handle } = await import('../server/mcp.js');
const { createZip } = await import('../core/zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}

const VHD = 'entity t is port(a: in bit; b: out bit); end;\narchitecture r of t is begin b <= a; end;\n';
const PJ = JSON.stringify({ version: 1, top: 't', files: [{ path: 'src/t.vhd', lang: 'vhdl', role: 'design' }], device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' } });
const files = root => [
  { path: `${root}silinx.json`, data: PJ }, { path: `${root}src/t.vhd`, data: VHD },
  { path: `${root}build/reports.json`, data: '{"available":true}' }, { path: `${root}build/t.syr`, data: 'syr' }, { path: `${root}Build/open/t.json`, data: '{}' },
];
const BUILD = "the project's build folder (build/) is Silinx's own";
const refusals = root => [`${root}build/reports.json: not imported: ${BUILD}`, `${root}build/t.syr: not imported: ${BUILD}`, `${root}Build/open/t.json: not imported: ${BUILD}`];
const noBuild = name => assert.deepEqual(fs.readdirSync(P.projectDir(name)).filter(f => /^build$/i.test(f)), [], name);

test('the route: a zip with or without a root folder, its build/ refused, with the same messages', async () => {
  const app = await startApp();
  try {
    for (const [name, root] of [['flat', ''], ['rooted', 'p/'], ['deep', 'a/b/']]) {
      const r = await app.call('POST', `/projects/import-zip?name=${name}`, await createZip(files(root), NODE_CODEC));
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body.warnings, refusals(root), name);
      assert.deepEqual(r.body.extra, ['src/t.vhd'], name);
      assert.equal(r.body.project.trusted, false);
      noBuild(name);
      const rep = await app.call('GET', `/projects/${name}/reports`);
      assert.equal(rep.body.available, false, name);
    }
  } finally { await app.close(); }
});

test('the MCP\'s import_project: a zip and a folder with a root folder, the same refusals', async () => {
  fs.writeFileSync(path.join(tmp, 'exchange', 'rooted.zip'), await createZip(files('p/'), NODE_CODEC));
  // (the folder without Build/, which a case-insensitive file system takes for build/)
  for (const f of files('p/').slice(0, -1)) { const to = path.join(tmp, 'exchange', 'dir', f.path); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, f.data); }
  for (const [name, from] of [['mz', 'rooted.zip'], ['mf', 'dir']]) {
    const r = await call('import_project', { name, from: path.join(tmp, 'exchange', from) });
    assert.equal(r.isError, false, r.text);
    assert.deepEqual(r.text.split('\n').slice(0, -1), refusals('p/').slice(0, name === 'mf' ? -1 : 3).map(w => `WARNING: ${w}`), name);
    assert.deepEqual(r.data.extra, ['src/t.vhd'], name);
    noBuild(name);
  }
});

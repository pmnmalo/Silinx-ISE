// A project the MCP server makes from an example is never on disk as a trusted one (#3413): its silinx.json is written
// once, already marked untrusted, never copied from the example first; and a JSON-RPC batch's requests run in order,
// each seeing the one before it done (a project's creation, then a request on it).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-mcp-example-trust-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle, serveMcp } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
const { isTrusted } = await import('../core/trust.js');

test('#3413 new_project_from_example: silinx.json never read from disk without trusted: false while the project is made', async () => {
  let reads = 0;
  for (let k = 0; k < 10; k++) {
    const name = `Ex${k}`, f = path.join(P.projectDir(name), 'silinx.json');
    let done = false;
    const call = handle({ jsonrpc: '2.0', id: k, method: 'tools/call', params: { name: 'new_project_from_example', arguments: { name, example: 'micro80', board: 'nexys2' } } }).then(r => { done = true; return r; });
    // (a watcher: every read of the file while the tool runs)
    while (!done) {
      let pj = null;
      try { pj = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* not there yet, or being replaced */ }
      if (pj) { reads++; assert.equal(isTrusted(pj), false, `${name}: read as trusted`); assert.deepEqual([pj.trusted, pj.madeBy], [false, 'mcp']); }
      await new Promise(r => setImmediate(r));
    }
    const r = await call;
    assert.equal(r.result.isError, false, JSON.stringify(r.result));
    assert.deepEqual([(await P.readProject(name)).trusted, (await P.readProject(name)).madeBy], [false, 'mcp']);
  }
  assert.ok(reads > 0, 'the watcher read the file at least once');
  // (the example's files all there, and its description written once: no temporary file left)
  const src = path.join(P.projectDir('Ex0'));
  assert.ok(fs.existsSync(path.join(src, 'src')));
  assert.deepEqual(fs.readdirSync(src).filter(f => f.endsWith('.tmp')), []);
});

test('#3413 a JSON-RPC batch: its requests in order, the second seeing the first\'s project', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const done = serveMcp({ input, output });
  const lines = [];
  output.on('data', d => lines.push(...String(d).split('\n').filter(Boolean)));
  input.write(`${JSON.stringify([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'new_project', arguments: { name: 'Batch1' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'project_info', arguments: { project: 'Batch1' } } },
  ])}\n`);
  input.end();
  await done;
  assert.equal(lines.length, 1);
  const out = JSON.parse(lines[0]);
  assert.deepEqual(out.map(m => [m.id, m.result?.isError ?? false]), [[1, false], [2, false]]);
  assert.match(out[1].result.content[0].text, /Batch1/);
});

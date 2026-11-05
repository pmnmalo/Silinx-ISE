// The open projects watched (#2843, server/project-watch.js): a file written, created, renamed or deleted in the
// project, and the build's summary written by a run, are told; nothing outside the project (another project, the
// build's other outputs, hidden files); the server's own changes (a request of the page, a run of its own) are not.
// Then through the server: GET /api/projects/:p/events tells what another process (the MCP server) writes, and
// not what the page writes through the API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProjectWatcher, diffScans, BUILD_WATCHED } from '../server/project-watch.js';
import { scratchEnv, startApp, sleep } from './server-helpers.js';

let tmp;
before(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'silinx-watch-')); });
after(() => fs.rm(tmp, { recursive: true, force: true }));

// a project's folder with a source, and a watcher of it told into `seen` (looked at by check(), not by its timer)
async function setup(name) {
  const dirOf = n => path.join(tmp, n);
  for (const n of [name, `${name}-other`]) {
    await fs.mkdir(path.join(dirOf(n), 'src'), { recursive: true });
    await fs.mkdir(path.join(dirOf(n), 'build'), { recursive: true });
    await fs.writeFile(path.join(dirOf(n), 'silinx.json'), '{}\n');
    await fs.writeFile(path.join(dirOf(n), 'src', 'top.vhd'), 'entity top is end;\n');
  }
  const state = { busy: false };
  const w = createProjectWatcher({ dirOf, busy: () => state.busy, interval: 60_000 });
  const seen = [];
  const off = w.subscribe(name, ev => seen.push(ev));
  await w.check(name);
  const dir = dirOf(name);
  // the changes told by the next look
  const next = async () => { seen.length = 0; await w.check(name); return seen.flatMap(e => { assert.equal(e.project, name); return e.changes; }); };
  return { w, dir, other: dirOf(`${name}-other`), state, next, off };
}
// (another time stamp for the next write: a write within the same millisecond and of the same size would not show)
const tick = () => sleep(15);

test('diffScans: created, changed and deleted, by path', () => {
  const a = new Map([['a', '1:1'], ['b', '1:1'], ['c', '1:1']]);
  const b = new Map([['a', '1:1'], ['b', '2:2'], ['d', '1:1']]);
  assert.deepEqual(diffScans(a, b), [{ path: 'b', kind: 'changed' }, { path: 'c', kind: 'deleted' }, { path: 'd', kind: 'created' }]);
  assert.deepEqual(diffScans(a, a), []);
});

test('a file written, created, renamed and deleted in the project: each told', async () => {
  const { w, dir, next } = await setup('p1');
  assert.deepEqual(await next(), [], 'nothing changed: nothing told');
  await tick();
  await fs.writeFile(path.join(dir, 'src', 'top.vhd'), 'entity top is end entity;\n');
  assert.deepEqual(await next(), [{ path: 'src/top.vhd', kind: 'changed' }]);
  await fs.writeFile(path.join(dir, 'src', 'add.v'), 'module add; endmodule\n');
  assert.deepEqual(await next(), [{ path: 'src/add.v', kind: 'created' }]);
  await fs.rename(path.join(dir, 'src', 'add.v'), path.join(dir, 'src', 'adder.v'));
  assert.deepEqual(await next(), [{ path: 'src/add.v', kind: 'deleted' }, { path: 'src/adder.v', kind: 'created' }]);
  await fs.rm(path.join(dir, 'src', 'adder.v'));
  assert.deepEqual(await next(), [{ path: 'src/adder.v', kind: 'deleted' }]);
  await tick();
  await fs.writeFile(path.join(dir, 'silinx.json'), '{ "top": "top" }\n');
  assert.deepEqual(await next(), [{ path: 'silinx.json', kind: 'changed' }], 'the project file too');
  await fs.mkdir(path.join(dir, 'sim', 'deep'), { recursive: true });
  await fs.writeFile(path.join(dir, 'sim', 'deep', 'tb.vhd'), '--\n');
  assert.deepEqual(await next(), [{ path: 'sim/deep/tb.vhd', kind: 'created' }], 'in a new folder');
  w.close();
});

test('the build\'s summary written by a run: told; the build\'s other outputs, hidden files, another project: not', async () => {
  const { w, dir, other, next } = await setup('p2');
  assert.deepEqual(BUILD_WATCHED, ['build/reports.json', 'build/silinx-status.json']);
  await fs.writeFile(path.join(dir, 'build', 'reports.json'), '{"top":"top"}\n');
  await fs.writeFile(path.join(dir, 'build', 'silinx-status.json'), '{}\n');
  assert.deepEqual(await next(), [{ path: 'build/reports.json', kind: 'created' }, { path: 'build/silinx-status.json', kind: 'created' }]);
  await fs.writeFile(path.join(dir, 'build', 'top.bit'), 'bits');
  await fs.mkdir(path.join(dir, 'build', 'open'), { recursive: true });
  await fs.writeFile(path.join(dir, 'build', 'open', 'report.json'), '{}');
  await fs.writeFile(path.join(dir, '.DS_Store'), 'x');
  await fs.writeFile(path.join(dir, '.silinx.json.1.tmp'), 'x');
  await fs.writeFile(path.join(other, 'src', 'top.vhd'), 'another project\n');
  await fs.writeFile(path.join(tmp, 'loose.txt'), 'the workspace itself');
  assert.deepEqual(await next(), [], 'none of these told');
  // (a link out of the project is not a project file: server/projects.js's walk)
  await fs.symlink(path.join(other, 'src', 'top.vhd'), path.join(dir, 'src', 'link.vhd')).catch(() => {});
  assert.deepEqual(await next(), []);
  w.close();
});

test('the server\'s own changes: held while a request runs, and during a run of its own, not told', async () => {
  const { w, dir, state, next } = await setup('p3');
  // a request of the page: held while it runs; what it wrote is known once it ends
  const release = w.hold('P3');   // (by any case of its name: one folder)
  await fs.writeFile(path.join(dir, 'src', 'own.vhd'), '--\n');
  assert.deepEqual(await next(), [], 'held: nothing told');
  release();
  release();   // (twice: once only)
  assert.deepEqual(await next(), [], 'released: the page\'s own file is known');
  await fs.writeFile(path.join(dir, 'src', 'mcp.vhd'), '--\n');
  assert.deepEqual(await next(), [{ path: 'src/mcp.vhd', kind: 'created' }], 'another process\'s file after it: told');
  // a run of its own (Implement Design from the page): its summary is not told, during the run nor once it ends
  state.busy = true;
  await fs.writeFile(path.join(dir, 'build', 'reports.json'), '{}');
  assert.deepEqual(await next(), []);
  await tick();
  await fs.writeFile(path.join(dir, 'build', 'reports.json'), '{"done":true}');
  state.busy = false;
  assert.deepEqual(await next(), [], 'the run ended: its last writes known');
  await tick();
  await fs.writeFile(path.join(dir, 'build', 'reports.json'), '{"mcp":true}');
  assert.deepEqual(await next(), [{ path: 'build/reports.json', kind: 'changed' }], 'a run of another process: told');
  // a project not watched: holding it does nothing
  assert.doesNotThrow(() => w.hold('nobody')());
  w.close();
});

test('unsubscribed: the project no longer watched once its last page left', async () => {
  const { w, off } = await setup('p4');
  const off2 = w.subscribe('p4', () => {});
  off();
  assert.equal(w.watching('p4'), true, 'another page still listens');
  off2();
  assert.equal(w.watching('p4'), false);
  w.close();
});

test('the server: GET /api/projects/:p/events tells another process\'s changes, not the page\'s own', async () => {
  const scratch = await scratchEnv('silinx-watch-api-');
  const P = await import('../server/projects.js');
  const app = await startApp();
  try {
    assert.equal((await app.call('POST', '/projects', { name: 'Watched' })).status, 200);
    assert.equal((await app.call('GET', '/projects/Nope/events')).status, 404, 'a project that does not exist: its error');
    const ctl = new AbortController();
    const r = await fetch(`${app.base}/projects/Watched/events`, { signal: ctl.signal });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /^text\/event-stream/);
    const events = [];
    const reader = r.body.getReader();
    (async () => {
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        let chunk;
        try { chunk = await reader.read(); } catch { return; }
        if (chunk.done) return;
        buf += dec.decode(chunk.value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, k); buf = buf.slice(k + 2);
          const data = block.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
          if (data) events.push(JSON.parse(data));
        }
      }
    })();
    const watcher = app.app.locals.watcher;
    for (let k = 0; k < 50 && !watcher.watching('Watched'); k++) await sleep(10);
    await watcher.check('Watched');
    const settle = async () => { await watcher.check('Watched'); await sleep(50); };
    // the page writes a source, and the project: not told back to it
    assert.equal((await app.call('PUT', '/projects/Watched/file?path=src/page.vhd', 'entity page is end;\n')).status, 200);
    const pj = (await app.call('GET', '/projects/Watched')).body;
    assert.equal((await app.call('PUT', '/projects/Watched', { ...pj, fileTree: undefined, top: null })).status, 200);
    await settle();
    assert.deepEqual(events, [], 'the page\'s own writes are not told');
    // the MCP server (another process, the same functions) writes a source: told
    await P.writeFile('Watched', 'src/mcp.vhd', 'entity mcp is end;\n');
    await settle();
    // (the source, and the project that lists it now)
    assert.deepEqual(events, [{ project: 'Watched', changes: [{ path: 'silinx.json', kind: 'changed' }, { path: 'src/mcp.vhd', kind: 'created' }] }]);
    ctl.abort();
    for (let k = 0; k < 50 && watcher.watching('Watched'); k++) await sleep(10);
    assert.equal(watcher.watching('Watched'), false, 'the page gone: not watched');
  } finally {
    await app.close();
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

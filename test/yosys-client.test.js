// The page's Yosys client (web/js/yosys-client.js) with several workers (#276): two runs at once in two
// workers, a third queued until one ends, the workers kept for the next runs; one worker on a device with
// few cores or little memory; after a crash one Yosys at a time. The flow worker's pool (#279): its
// workers' code (core/synth-open.js yosysWorkerSource) run against a stand-in for Yosys; a worker that
// cannot start says so (the flow worker then runs Yosys in its own thread).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { yosysWorkerSource } from '../core/synth-open.js';

// a fake Web Worker: its run ends when the test says so (done(i, reply)), in the order the runs came
const workers = [], runs = [];
globalThis.Worker = class {
  constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
  postMessage({ id, args }) { runs.push({ worker: this, id, args, ended: false }); }
  terminate() { this.terminated = true; }
};
const done = (i, reply = { files: { out: runs[i].args.join(' ') } }) => {
  const r = runs[i];
  r.ended = true;
  r.worker.onmessage({ data: { id: r.id, ...reply } });
};
const tick = () => new Promise(r => setTimeout(r, 0));
const withNavigator = async (nav, f) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true });
  try { return await f(); } finally { if (old) Object.defineProperty(globalThis, 'navigator', old); else delete globalThis.navigator; }
};
let n = 0;
const load = nav => withNavigator(nav, () => import(`../web/js/yosys-client.js?${++n}`));

test('#276 Yosys client: as many workers as the device allows', async () => {
  assert.equal((await load({ hardwareConcurrency: 8, deviceMemory: 8 })).WORKERS, 2);
  assert.equal((await load({ hardwareConcurrency: 8 })).WORKERS, 2, 'no deviceMemory (Firefox, Safari): 2');
  assert.equal((await load({ hardwareConcurrency: 8, deviceMemory: 4 })).WORKERS, 1, 'little memory');
  assert.equal((await load({ hardwareConcurrency: 2, deviceMemory: 8 })).WORKERS, 1, 'few cores');
  assert.equal((await load({})).WORKERS, 1, 'nothing known');
});

test('#276 Yosys client: two runs at once in two workers, a third queued, the workers kept', async () => {
  const { yosysBrowser } = await load({ hardwareConcurrency: 8, deviceMemory: 8 });
  workers.length = runs.length = 0;
  assert.equal(yosysBrowser.parallel, 2);
  const lines = [];
  const p = ['a', 'b', 'c'].map(x => yosysBrowser([x], {}, l => lines.push(l)));
  await tick();
  assert.deepEqual(runs.map(r => r.args[0]), ['a', 'b'], 'the third waits');
  assert.equal(workers.length, 2);
  assert.notEqual(runs[0].worker, runs[1].worker);
  done(1);
  await tick();
  assert.deepEqual(runs.map(r => r.args[0]), ['a', 'b', 'c']);
  assert.equal(runs[2].worker, runs[1].worker, 'in the worker that ended');
  // a line reaches its own run
  runs[2].worker.onmessage({ data: { id: runs[2].id, line: 'from c' } });
  done(0);
  done(2);
  assert.deepEqual(await Promise.all(p), [{ out: 'a' }, { out: 'b' }, { out: 'c' }]);
  assert.deepEqual(lines, ['from c']);
  // the next ones in the same two workers
  const q = [yosysBrowser(['d'], {}), yosysBrowser(['e'], {})];
  await tick();
  assert.equal(workers.length, 2);
  done(3); done(4);
  assert.deepEqual(await Promise.all(q), [{ out: 'd' }, { out: 'e' }]);
  // an error of the design: that run fails, the other not
  const r = [yosysBrowser(['f'], {}), yosysBrowser(['g'], {})];
  await tick();
  done(5, { error: 'Yosys failed (exit code 1)', code: 1, crash: false });
  done(6);
  await assert.rejects(r[0], e => e.code === 1);
  assert.deepEqual(await r[1], { out: 'g' });
});

test('#276 Yosys client: after a crash, the run once more in a new worker and one Yosys at a time', async () => {
  const { yosysBrowser } = await load({ hardwareConcurrency: 8, deviceMemory: 8 });
  workers.length = runs.length = 0;
  const lines = [];
  const p = [yosysBrowser(['a'], {}, l => lines.push(l)), yosysBrowser(['b'], {})];
  await tick();
  done(0, { error: 'Yosys failed: RangeError', crash: true });
  await tick();
  assert.ok(runs[0].worker.terminated);
  assert.equal(yosysBrowser.parallel, 1);
  assert.deepEqual(lines, ['Yosys failed: RangeError: Yosys is started again (a new worker) and the synthesis run once more']);
  // b still running: a's second try waits for it, then runs in b's worker (one at a time)
  assert.equal(runs.length, 2);
  done(1);
  await tick();
  assert.deepEqual(runs.map(r => r.args[0]), ['a', 'b', 'a']);
  assert.equal(runs[2].worker, runs[1].worker);
  done(2);
  assert.deepEqual(await Promise.all(p), [{ out: 'a' }, { out: 'b' }]);
  assert.equal(workers.filter(w => !w.terminated).length, 1);
});

test('#279 a worker that cannot start: its run fails as such (workerFailed), the next one starts another', async () => {
  const { yosysPool } = await load({ hardwareConcurrency: 8, deviceMemory: 8 });
  const made = [];
  const run = yosysPool({ spawn: () => { const w = { postMessage() {}, terminate() {} }; made.push(w); return w; }, workers: 2 });
  assert.equal(run.parallel, 2);
  const p = run(['a'], {});
  made[0].onerror({ message: 'blocked' });
  await assert.rejects(p, e => e.workerFailed === true && e.message === 'the Yosys worker failed: blocked');
  run(['b'], {});
  assert.equal(made.length, 2);
});

test('#400 a worker that fails at run time (after answering): terminated, its run once more in a new one, the pool kept', async () => {
  const { yosysPool } = await load({ hardwareConcurrency: 8, deviceMemory: 8 });
  const made = [], posted = [];
  const run = yosysPool({ spawn: () => { const w = { postMessage(m) { posted.push({ w, ...m }); }, terminate() { this.terminated = true; } }; made.push(w); return w; }, workers: 2 });
  const lines = [];
  const p = run(['a'], {}, l => lines.push(l));
  // it answers (a line), then fails outside Yosys's own error handling
  made[0].onmessage({ data: { id: posted[0].id, line: 'Yosys 0.70' } });
  made[0].onerror({ message: 'out of memory' });
  assert.equal(made[0].terminated, true);
  assert.deepEqual(lines, ['Yosys 0.70', 'the Yosys worker failed: out of memory: Yosys is started again (a new worker) and the synthesis run once more']);
  assert.equal(made.length, 2);
  assert.equal(run.parallel, 1);
  made[1].onmessage({ data: { id: posted[1].id, files: { out: 'ok' } } });
  assert.deepEqual(await p, { out: 'ok' });
  // a second failure of the same run: it fails, not as a worker that cannot start (the flow keeps its pool)
  const q = run(['b'], {});
  const last = posted.at(-1);
  last.w.onmessage({ data: { id: last.id, line: 'x' } });
  last.w.onerror({ message: 'again' });
  const last2 = posted.at(-1);
  last2.w.onmessage({ data: { id: last2.id, line: 'y' } });
  last2.w.onerror({ message: 'and again' });
  await assert.rejects(q, e => e.message === 'the Yosys worker failed: and again' && !e.workerFailed);
  assert.equal(last.w.terminated, true);
  assert.equal(last2.w.terminated, true);
});

// a stand-in for YoWASP's bundle, and the checks of a worker's code against it
function fakeBundle(dir) {
  const fake = path.join(dir, 'bundle.js');
  fs.writeFileSync(fake, `export async function runYosys(args, files, { stdout }) {
  if (args[0] === 'fail') throw Object.assign(new Error('Exited with status 1'), { code: 1 });
  if (args[0] === 'crash') throw new RangeError('Out of memory');
  stdout(new TextEncoder().encode('one\\ntw')); stdout(new TextEncoder().encode('o\\n'));
  return { 'o.json': new TextEncoder().encode(files['i.v'] + '!'), 'n.txt': 'text' };
}
`);
  return fake;
}
async function checkWorkerCode(src, dir) {
  const file = path.join(dir, `worker-${++n}.mjs`);
  fs.writeFileSync(file, src);
  const sent = [];
  globalThis.self = { postMessage: m => sent.push(m) };
  try {
    await import(pathToFileURL(file).href);
    await globalThis.self.onmessage({ data: { id: 7, args: ['ok'], files: { 'i.v': 'x' } } });
    assert.deepEqual(sent, [{ id: 7, line: 'one' }, { id: 7, line: 'two' }, { id: 7, files: { 'o.json': 'x!', 'n.txt': 'text' } }]);
    sent.length = 0;
    await globalThis.self.onmessage({ data: { id: 8, args: ['fail'], files: {} } });
    assert.deepEqual(sent, [{ id: 8, error: 'Yosys failed (exit code 1)', code: 1, crash: false }]);
    sent.length = 0;
    await globalThis.self.onmessage({ data: { id: 9, args: ['crash'], files: {} } });
    assert.deepEqual(sent, [{ id: 9, error: 'Yosys failed: Out of memory', code: undefined, crash: true }]);
  } finally { delete globalThis.self; }
}

test('#279 the code of a Yosys worker from a Blob: Yosys from the URL given, its lines, files and errors as web/js/yosys-worker.js', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-yw-'));
  const fake = fakeBundle(dir);
  const src = yosysWorkerSource(pathToFileURL(fake).href);
  // (a dynamic import: the code of a classic worker, which a file:// page can start from a Blob, #512)
  assert.match(src, new RegExp(`^const yosys = import\\(${JSON.stringify(pathToFileURL(fake).href).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\);`));
  assert.doesNotMatch(src, /^import /m, 'no static import');
  await checkWorkerCode(src, dir);
});

test('#403 the Blob worker\'s code from the minified single-file edition: the shared runner still has its helpers', async () => {
  // (esbuild renames the module's names when it minifies: the runner's text must not use them)
  const esbuild = await import('esbuild');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-yw-'));
  const out = path.join(dir, 'synth-open.min.mjs');
  // (resolveDir: a file path, on Windows too, #447)
  await esbuild.build({ stdin: { contents: "export { yosysWorkerSource } from './core/synth-open.js';", resolveDir: path.join(path.dirname(fileURLToPath(import.meta.url)), '..') },
    bundle: true, format: 'esm', minify: true, target: 'es2022', outfile: out, logLevel: 'silent' });
  const { yosysWorkerSource: minified } = await import(pathToFileURL(out).href);
  await checkWorkerCode(minified(pathToFileURL(fakeBundle(dir)).href), dir);
});

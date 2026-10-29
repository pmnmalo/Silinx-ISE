// A crash of Yosys in the browser (#153): what it says (packages/silinx-fpga/src/synth-open.js yosysError: never
// "Yosys failed: undefined"), and the page's Yosys client (web/js/yosys-client.js) running the
// synthesis once more in a new worker after a crash, not after an error of the design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yosysError } from '../packages/silinx-fpga/src/synth-open.js';

test('Yosys crash: a message for every kind of failure, and whether it is a crash', () => {
  assert.deepEqual(yosysError(Object.assign(new Error('Exited with status 1'), { code: 1 })), { message: 'Yosys failed (exit code 1)', code: 1, crash: false });
  // an uncaught C++ exception inside the WebAssembly module (e.g. std::bad_alloc): no message of its own
  const ex = new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []);
  assert.equal(ex.message, undefined);
  assert.deepEqual(yosysError(ex), { message: 'Yosys failed: an exception inside its WebAssembly module that it does not handle (out of memory?)', code: undefined, crash: true });
  assert.deepEqual(yosysError(new RangeError('Out of memory')), { message: 'Yosys failed: Out of memory', code: undefined, crash: true });
  assert.equal(yosysError(new RangeError('')).message, 'Yosys failed: RangeError');
  assert.equal(yosysError('unreachable').message, 'Yosys failed: unreachable');
  assert.equal(yosysError({}).message, 'Yosys failed: an error without a message ([object Object])');
  assert.equal(yosysError(undefined).message, 'Yosys failed: an error without a message ([object Undefined])');
  for (const e of [ex, {}, undefined, null, 'x', new Error('')]) assert.doesNotMatch(yosysError(e).message, /undefined$|: $/);
});

// a fake Web Worker: each one answers its runs with the next of the replies given
const workers = [];
let replies = [];
globalThis.Worker = class {
  constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
  postMessage({ id, args }) {
    const r = replies.shift();
    setTimeout(() => {
      this.onmessage({ data: { id, line: `yosys ${args.join(' ')}` } });
      this.onmessage({ data: { id, ...r } });
    }, 1);
  }
  terminate() { this.terminated = true; }
};
const { yosysBrowser } = await import('../web/js/yosys-client.js');

test('Yosys crash: the run is made once more in a new worker, the crashed one ended', async () => {
  workers.length = 0;
  replies = [{ error: 'Yosys failed: an exception inside its WebAssembly module that it does not handle (out of memory?)', crash: true }, { files: { 'top.json': '{}' } }];
  const lines = [];
  assert.deepEqual(await yosysBrowser(['-q', 'run.ys'], { 'top.v': '' }, (l) => lines.push(l)), { 'top.json': '{}' });
  assert.equal(workers.length, 2, 'a second worker');
  assert.ok(workers[0].terminated && !workers[1].terminated);
  assert.deepEqual(lines, ['yosys -q run.ys',
    'Yosys failed: an exception inside its WebAssembly module that it does not handle (out of memory?): Yosys is started again (a new worker) and the synthesis run once more',
    'yosys -q run.ys']);
  // the next run in the new worker
  replies = [{ files: {} }];
  await yosysBrowser(['x'], {});
  assert.equal(workers.length, 2);
});

test('Yosys crash: an error of the design is not run again; a second crash is reported', async () => {
  workers.length = 0;
  replies = [{ error: 'Yosys failed (exit code 1)', code: 1, crash: false }];
  await assert.rejects(yosysBrowser(['x'], {}), (e) => e.message === 'Yosys failed (exit code 1)' && e.code === 1);
  assert.equal(workers.length, 0, 'the same worker as before');
  replies = [{ error: 'Yosys failed: RangeError', crash: true }, { error: 'Yosys failed: RangeError', crash: true }];
  await assert.rejects(yosysBrowser(['x'], {}), /^Error: Yosys failed: RangeError$/);
  assert.equal(workers.length, 1, 'one new worker, for the one retry');
});

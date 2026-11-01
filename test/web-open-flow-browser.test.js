// The browser edition's flow runner (web/js/open-flow-browser.js) with a fake Web Worker: each run
// hears only its own messages, Stop terminates the worker, a failed worker is terminated and
// replaced (#397, #399); what a device's Implement needs, prepared in the background (#967).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';

class FakeWorker {
  static all = [];
  constructor(url, opts) { Object.assign(this, { url, opts, posted: [], terminated: false }); FakeWorker.all.push(this); }
  postMessage(m) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  // a message from the worker's side
  send(data) { this.onmessage({ data }); }
}
globalThis.Worker = FakeWorker;
globalThis.SILINX_ASSETS = 'https://example.test/assets/';
const { runBrowserFlow, prepareBrowserFlow, browserOpenStatus } = await import('../web/js/open-flow-browser.js');

const project = { name: 'p', top: 'top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: [{ path: 'top.v', lang: 'verilog', role: 'design' }] };
const files = { 'top.v': 'module top(input a, output y); assign y = a; endmodule\n' };
const start = (opts = {}) => {
  const lines = [], writes = [];
  const run = runBrowserFlow({ project, files, steps: ['synth'], onLine: l => lines.push(l), onWrite: (p, d) => writes.push([p, d]), ...opts });
  return { run, lines, writes };
};
// the live worker once it has n runs posted (a run checks the design's pins before it posts)
const live = () => FakeWorker.all.filter(w => !w.terminated).at(-1);
async function posts(n) {
  for (let i = 0; i < 400; i++) { const w = live(); if (w && w.posted.length >= n) return w; await new Promise(r => setTimeout(r, 5)); }
  throw new Error(`no worker with ${n} runs posted`);
}

test('two runs on the one worker: each hears only the messages with its own id', async () => {
  const a = start(), b = start();
  const w = await posts(2);
  const [ma, mb] = w.posted;
  assert.equal(FakeWorker.all.filter(x => !x.terminated).length, 1, 'one worker');
  assert.notEqual(ma.id, mb.id);
  w.send({ id: mb.id, line: 'b says' });
  w.send({ id: ma.id, line: 'a says' });
  w.send({ id: ma.id, write: 'build/open/x.txt', data: 'A' });
  w.send({ id: 999, line: 'nobody' });
  w.send({ id: mb.id, done: { ok: true, report: 'B' } });
  w.send({ id: ma.id, done: { ok: false, error: 'A failed' } });
  assert.deepEqual(await b.run, { ok: true, report: 'B' });
  assert.deepEqual(await a.run, { ok: false, error: 'A failed' });
  assert.ok(a.lines.includes('a says') && !a.lines.includes('b says') && !a.lines.includes('nobody'));
  assert.ok(b.lines.includes('b says') && !b.lines.includes('a says'));
  assert.deepEqual(a.writes, [['build/open/x.txt', 'A']]);
  assert.deepEqual(b.writes, []);
  // a message after a run's end is not heard
  w.send({ id: ma.id, line: 'late' });
  assert.ok(!a.lines.includes('late'));
});

test('Stop (the signal): the worker is terminated, the run rejects as cancelled, the next run gets a new worker', async () => {
  const ctl = new AbortController();
  const r = start({ signal: ctl.signal });
  const w = await posts(1);
  ctl.abort();
  await assert.rejects(r.run, e => e.cancelled === true && e.message === 'cancelled by user');
  assert.equal(w.terminated, true);
  // a stopped signal before the start: nothing posted
  const n = FakeWorker.all.length;
  await assert.rejects(start({ signal: AbortSignal.abort() }).run, e => e.cancelled === true);
  assert.equal(FakeWorker.all.length, n);
  const next = start();
  const w2 = await posts(1);
  assert.notEqual(w2, w);
  const [m] = w2.posted;
  w2.send({ id: m.id, done: { ok: true } });
  assert.deepEqual(await next.run, { ok: true });
});

test('a worker that fails: terminated, every run on it rejects, the next run starts a new one', async () => {
  const a = start(), b = start();
  const w = await posts(2);
  w.onerror({ message: 'boom' });
  for (const r of [a, b]) await assert.rejects(r.run, /^Error: the Silinx toolchain could not start in this browser: boom$/);
  assert.equal(w.terminated, true);
  const c = start();
  const w2 = await posts(1);
  assert.notEqual(w2, w);
  const [m] = w2.posted;
  w2.send({ id: m.id, done: { ok: true } });
  assert.deepEqual(await c.run, { ok: true });
});

test('#967 prepareBrowserFlow: the device\'s assets asked of the flow\'s worker once (with the cache\'s root and Yosys); none without Cache Storage, for a device not supported; again after a failed worker', async () => {
  const dev = { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-4' };
  // no Cache Storage (a page opened from a file, an insecure page): nothing asked, no worker
  const n = FakeWorker.all.length;
  assert.equal(await prepareBrowserFlow(dev), null);
  globalThis.caches = {};
  assert.equal(await prepareBrowserFlow(dev), null, 'not a secure context');
  globalThis.isSecureContext = true;
  assert.equal(await prepareBrowserFlow({ family: 'spartan6', part: 'xc6slx9', package: 'csg324' }), null, 'a device the Silinx toolchain does not support');
  assert.equal(FakeWorker.all.length, n);
  try {
    const p = prepareBrowserFlow(dev);
    const w = live(), m = w.posted.at(-1);
    assert.deepEqual(m.prepare, { graph: 'xc3s500efg320-4.json.gz', part: 'xc3s500efg320-4', family: 'spartan3e', device: 'xc3s500e', pkg: 'fg320', nextpnr: true });   // (nextpnr by default, #2136)
    assert.equal(m.assets, 'https://example.test/assets/');
    assert.equal(m.root, 'https://example.test/assets/', 'unbuilt: the assets folder itself');
    assert.equal(m.yosys, 'https://example.test/assets/vendor/yowasp-yosys/gen/bundle.js');
    assert.equal(m.nextpnr, 'https://example.test/assets/vendor/nextpnr-spartan/gen/bundle.js');
    w.send({ id: m.id, line: 'ignored' });
    w.send({ id: m.id, done: { fetched: 9, bytes: 17e6, pruned: 0 } });
    assert.deepEqual(await p, { fetched: 9, bytes: 17e6, pruned: 0 });
    assert.equal(await prepareBrowserFlow(dev), null, 'prepared already');
    // another device: asked; its worker fails: null, and asked again later
    const dev2 = { ...dev, part: 'xc3s1200e' };
    const q = prepareBrowserFlow(dev2);
    live().onerror({ message: 'boom' });
    assert.equal(await q, null);
    // (a project on the Silinx engine: no nextpnr fetched, #2136)
    const q2 = prepareBrowserFlow(dev2, { engine: 'silinx' });
    const w2 = live(), m2 = w2.posted.at(-1);
    assert.equal(m2.prepare.graph, 'xc3s1200efg320-4.json.gz');
    assert.equal(m2.prepare.nextpnr, false);
    w2.send({ id: m2.id, done: { fetched: 0, bytes: 0, pruned: 1 } });
    assert.deepEqual(await q2, { fetched: 0, bytes: 0, pruned: 1 });
  } finally { delete globalThis.caches; delete globalThis.isSecureContext; }
});

test('#1450 prepareBrowserFlow: nothing in a page opened from a file, though it has Cache Storage (WebKit, Firefox); a site\'s page prepares', async () => {
  const dev = { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' };
  globalThis.caches = {};
  globalThis.isSecureContext = true;   // (a file:// page is a secure context)
  try {
    const n = FakeWorker.all.length, sent = FakeWorker.all.reduce((k, w) => k + w.posted.length, 0);
    for (const href of ['file:///Users/me/Silinx-ISE.html', 'file:///C:/Users/me/Downloads/Silinx-ISE.html']) {
      globalThis.location = new URL(href);
      const p = prepareBrowserFlow(dev);
      assert.equal(FakeWorker.all.length, n, `${href}: no worker`);
      assert.equal(FakeWorker.all.reduce((k, w) => k + w.posted.length, 0), sent, `${href}: nothing asked`);
      assert.equal(await p, null);
    }
    // the same device from the site: asked
    globalThis.location = new URL('https://example.test/');
    const p = prepareBrowserFlow(dev);
    const w = live(), m = w.posted.at(-1);
    assert.deepEqual(m.prepare, { graph: 'xc3s100ecp132-4.json.gz', part: 'xc3s100ecp132-4', family: 'spartan3e', device: 'xc3s100e', pkg: 'cp132', nextpnr: true });
    w.send({ id: m.id, done: { fetched: 9, bytes: 17e6, pruned: 0 } });
    assert.deepEqual(await p, { fetched: 9, bytes: 17e6, pruned: 0 });
  } finally { delete globalThis.caches; delete globalThis.isSecureContext; delete globalThis.location; }
});

test('#2103 the Spartan-6 in the browser: the Nexys3\'s and the Atlys\'s parts, with their steps; a run says its family and refuses a step the part has not; prepare asks for its databases', async () => {
  const nexys3 = { family: 'spartan6', part: 'xc6slx16', package: 'csg324', speed: '-3' };
  const steps = ['synth', 'postsynth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit'];
  assert.deepEqual(browserOpenStatus(nexys3), { available: true, part: 'xc6slx16csg324-3', family: 'spartan6', graph: 'xc6slx16csg324-3.json.gz', steps,
    reason: 'xc6slx16csg324-3: the Spartan-6: synthesis, its post-synthesis simulation model, Map, Place & Route, the static timing, the bitstream (in the browser)' });
  assert.equal(browserOpenStatus({ part: 'xc6slx45', package: 'csg324', speed: '-3' }).graph, 'xc6slx45csg324-3.json.gz', 'the family from the part');
  // another part, another package: no
  assert.deepEqual(browserOpenStatus({ family: 'spartan6', part: 'xc6slx9', package: 'csg324', speed: '-2' }), { available: false, part: 'xc6slx9csg324-2', family: 'spartan6',
    reason: 'the Silinx toolchain for the Spartan-6 is for the XC6SLX16 (CSG324, Nexys3), XC6SLX45 (CSG324, Atlys) only: use an ISE mode for the xc6slx9' });
  assert.equal(browserOpenStatus({ ...nexys3, package: 'ftg256' }).available, false);
  assert.match(browserOpenStatus({ family: 'artix7', part: 'xc7a35t', package: 'cpg236', speed: '-1' }).reason, /^the Silinx toolchain supports the Spartan-3E and the Nexys3's and Atlys's Spartan-6 only \(xc3s100e cp132, .*xc6slx16 csg324, xc6slx45 csg324\)/);
  const s6 = { ...project, device: nexys3 };
  const before = live()?.posted.length || 0;
  const r = runBrowserFlow({ project: s6, files, steps: ['bitgen'], onLine: () => {} });
  const w = await posts(before + 1);
  const m = w.posted.at(-1);
  assert.equal(m.spec.family, 'spartan6');
  assert.equal(m.spec.part, 'xc6slx16csg324-3');
  assert.equal(m.spec.graph, 'xc6slx16csg324-3.json.gz');
  assert.deepEqual(m.spec.steps, ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  w.send({ id: m.id, done: { ok: true } });
  assert.deepEqual(await r, { ok: true });
  await assert.rejects(runBrowserFlow({ project: s6, files, steps: ['xpwr'], onLine: () => {} }),
    /^Error: the Silinx toolchain has no xpwr for xc6slx16csg324-3 yet \(only synth, postsynth, translate, map, par, trce, bitgen, prombit\)$/);
  globalThis.caches = {};
  globalThis.isSecureContext = true;
  try {
    const p = prepareBrowserFlow(nexys3);
    const pw = live(), pm = pw.posted.at(-1);
    // (no nextpnr: the Spartan-6's engine is Silinx's unless the project asks for nextpnr, which the browser has not for it)
    assert.deepEqual(pm.prepare, { graph: 'xc6slx16csg324-3.json.gz', part: 'xc6slx16csg324-3', family: 'spartan6', device: 'xc6slx16', pkg: 'csg324', nextpnr: false });
    pw.send({ id: pm.id, done: { fetched: 30, bytes: 3e6, pruned: 0 } });
    assert.deepEqual(await p, { fetched: 30, bytes: 3e6, pruned: 0 });
  } finally { delete globalThis.caches; delete globalThis.isSecureContext; }
});

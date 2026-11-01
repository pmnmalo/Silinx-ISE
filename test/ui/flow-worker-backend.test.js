// UI: a family of the Silinx toolchain added by its back end runs in the browser's Web Worker as in Node (#2388, part of
// #2360): a module worker with the browser edition's io (web/js/open-flow-worker-io.js, the flow worker's), a fake family
// with its own steps (synth, pnr, timing, bitstream) and its routed design in its own file; the lines, the files in memory
// and the report posted to the page, an earlier run's file read again, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// the worker: the fake family registered, then runFlow with the browser's io for each message's steps
const WORKER = origin => `
import { runFlow, registerBackend } from '${origin}/packages/silinx-fpga/src/index.js';
import { workerIo } from '${origin}/js/open-flow-worker-io.js';
const SYNTH = { top: 'top', files: { 'top.json': JSON.stringify({ modules: { top: { attributes: { top: 1 }, ports: { a: { direction: 'input', bits: [2] } }, cells: {}, netnames: {} } } }), 'top_stat.txt': 'cells 0' }, util: { cells: 0 }, warnings: [] };
registerBackend({
  id: 'fake',
  steps: [{ id: 'synth', label: 'Synthesize', needs: [] }, { id: 'pnr', label: 'Place and route', needs: ['synth'] },
    { id: 'timing', label: 'Timing', needs: ['pnr'] }, { id: 'bitstream', label: 'Bitstream', needs: ['pnr'] }],
  synth: async () => SYNTH,
  mount: ctx => {
    const routed = () => { const t = ctx.io.read('open/top.asc'); if (t == null) throw new ctx.StepError('nothing routed', [], ''); return t; };
    return { steps: {
      pnr: () => { ctx.readNetlist(); ctx.report.files.routed = ctx.io.write('open/top.asc', '.asc ' + ctx.netlist().ports.length); },
      timing: () => { ctx.report.timing = { routed: routed() }; ctx.log('Timing of ' + routed() + ': met.'); },
      bitstream: () => { const b = new Uint8Array([1, 2, 3]); ctx.report.bit = { path: ctx.io.write('top.bin', b), size: b.length }; },
    } };
  },
});
self.onmessage = async ({ data }) => {
  const { io, store } = workerIo({ post: m => self.postMessage(m), sources: [{ path: 'top.v', lang: 'verilog', text: 'module top(input a); endmodule' }], files: data.files });
  const res = await runFlow({ top: 'top', family: 'fake', steps: data.steps }, io);
  self.postMessage({ done: { ok: res.ok, error: res.error, report: res.report, store: Object.keys(store).sort() } });
};`;

uiTest('#2388 a fake family\'s back end runs in the browser\'s worker: its steps, its files in memory, its report, no warnings', E, async (page) => {
  const origin = await page.eval(() => location.origin);
  const r = await page.eval(async (src) => {
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module' });
    const run = (steps, files) => new Promise((resolve, reject) => {
      const got = { lines: [], writes: [], reports: 0 };
      w.onerror = (e) => reject(new Error(e.message || 'the worker failed'));
      w.onmessage = ({ data }) => {
        if (data.line != null) got.lines.push(data.line);
        if (data.write) got.writes.push([data.write, typeof data.data === 'string' ? data.data : [...data.data]]);
        if (data.report) got.reports++;
        if (data.done) resolve({ ...got, done: data.done });
      };
      w.postMessage({ steps, files });
    });
    try {
      const first = await run(['synth', 'pnr', 'timing', 'bitstream']);
      // (an earlier run's routed design, read again from the build folder's files)
      const again = await run(['timing'], { 'open/top.asc': '.asc 9' });
      return { first, again };
    } finally { w.terminate(); URL.revokeObjectURL(url); }
  }, WORKER(origin));
  const { first, again } = r;
  assert.equal(first.done.ok, true, first.done.error);
  assert.deepEqual(first.lines.filter((l) => /^=== SILINX/.test(l)), ['synth', 'pnr', 'timing', 'bitstream'].map((s) => `=== SILINX STEP ${s} ===`).concat('=== SILINX DONE ==='));
  assert.ok(first.lines.includes('Timing of .asc 1: met.'), first.lines.join('\n'));
  assert.deepEqual(first.writes.filter(([p]) => !/^build\/open\/top(\.json|_stat\.txt)$/.test(p)), [['build/open/top.asc', '.asc 1'], ['build/top.bin', [1, 2, 3]]]);
  assert.deepEqual(first.done.store, ['open/top.asc', 'open/top.json', 'open/top_stat.txt', 'top.bin']);
  assert.deepEqual(first.done.report.bit, { path: 'build/top.bin', size: 3 });
  assert.equal(first.done.report.files.routed, 'build/open/top.asc');
  assert.equal(first.reports, 4);
  assert.deepEqual(first.lines.filter((l) => /^(WARNING|ERROR)/.test(l)), []);
  assert.equal(again.done.ok, true, again.done.error);
  assert.deepEqual(again.done.report.timing, { routed: '.asc 9' });
  assert.deepEqual(again.lines.filter((l) => /^(WARNING|ERROR)/.test(l)), []);
}, { timeout: 60000 });

// The import gate's XML scan and the .xise reader take linear time (#3406): an unclosed construct repeated to a few MB
// (an unclosed tag, comment, CDATA section, processing instruction; an unclosed <file>, comment and <property> of a
// .xise) is read within a time bound, where regular expressions took quadratic time and froze the server for minutes.
// Each run is in a worker, stopped at the bound, so a slow scan fails the test instead of blocking it. The results on
// unclosed constructs are the regular expressions' own (skipped, not refused), and on ISE's own .xise files unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { gateEntries } from '../core/import-gate.js';
import { importXise } from '../server/xise.js';

const GATE = new URL('../core/import-gate.js', import.meta.url).href;
const XISE = new URL('../server/xise.js', import.meta.url).href;
const BOUND_MS = 5000;   // a linear scan of 3 MB takes milliseconds; the regular expressions took minutes

// `call` run in a worker on `unit` repeated n times between `head` and `tail`: its result, or a failure past the bound
function timed(module, call, head, unit, n, tail = '') {
  const code = `const { parentPort, workerData: w } = require('node:worker_threads');
    import(w.module).then(m => { const text = w.head + w.unit.repeat(w.n) + w.tail; const t0 = Date.now();
      let out; try { out = ${call}; } catch (e) { out = 'error: ' + e.message; }
      parentPort.postMessage({ out, ms: Date.now() - t0 }); });`;
  return new Promise((resolve, reject) => {
    const w = new Worker(code, { eval: true, workerData: { module, head, unit, n, tail } });
    const timer = setTimeout(() => { w.terminate(); reject(new Error(`${JSON.stringify(unit)} x ${n}: not done in ${BOUND_MS} ms`)); }, BOUND_MS);
    w.once('message', r => { clearTimeout(timer); w.terminate(); resolve(r); });
    w.once('error', e => { clearTimeout(timer); reject(e); });
  });
}

test('#3406 the gate: an unclosed tag, comment, CDATA section or processing instruction repeated to 3 MB is scanned within the bound', async () => {
  for (const unit of ['<a ', '<!--', '<![CDATA[', '<?']) {
    const n = Math.ceil(3e6 / unit.length);
    const r = await timed(GATE, "JSON.stringify(m.gateEntries([{ path: 'a.sch', data: text }]).refusals)", '<?xml version="1.0"?>', unit, n);
    assert.equal(r.out, '[]', `${unit}: accepted, as before (nothing it nests)`);
  }
});

test('#3406 the .xise reader: an unclosed <file>, comment or <property> repeated to 3 MB is read within the bound', async () => {
  for (const unit of ['<file>', '<!--', '<property a="', '<file name="a.vhd"><association ']) {
    const n = Math.ceil(3e6 / unit.length);
    const r = await timed(XISE, 'JSON.stringify(m.importXise(text).files)', '<project>', unit, n);
    assert.equal(r.out, '[]', `${unit}: no file read`);
  }
  const r = await timed(XISE, 'm.importXise(text).device.part', '<project><property name="Device" value="xc3s100e" ', 'a', 3e6, '/>');
  assert.equal(r.out, 'xc3s100e', 'a 3 MB run of name characters in a tag: its attributes read');
});

test('#3406 the gate: unclosed constructs are skipped as before, the elements after them still counted', () => {
  const L = { maxText: 1000, maxLine: 100, maxDepth: 2, maxBranches: 5 };
  const one = t => gateEntries([{ path: 'a.sch', data: t }], { limits: L }).refusals[0]?.reason ?? null;
  assert.equal(one('<a><!-- unclosed <b><c>'), 'XML nested deeper than 2 elements', 'a comment never closed hides nothing');
  assert.equal(one('<a><? unclosed <b><c>'), 'XML nested deeper than 2 elements');
  assert.equal(one('<a><![CDATA[ unclosed <b><c>'), 'XML nested deeper than 2 elements');
  assert.equal(one('<a><b/><b /><!-- <c><d> --><![CDATA[<c><d>]]><?pi <c><d>?></a>'), null, 'closed constructs and self-closing tags do not nest');
  assert.equal(one('<a><b><c'), null, 'a tag never closed is not an element');
  assert.equal(one('<a></b></c></d><b><c><d>'), 'XML nested deeper than 2 elements', 'more end tags than elements: the depth stays at 0');
});

test('#3406 the .xise reader: unclosed elements and comments read as before', () => {
  const p = importXise(`<project><!-- a comment --><file name="a.vhd" type="FILE_VHDL"><association name="Implementation"/></file>
    <file name="b.v"/><file name="c.vhd" type="FILE_VHDL"><association name="BehavioralSimulation"/></file>
    <property name="Device" value="xc3s100e"/><property xil_pn:name="Package" xil_pn:value="cp132"/>
    <file name="lost.vhd"><!-- never closed: lost.vhd left out, d.vhd read <file name="d.vhd"/>`);
  assert.deepEqual(p.files.map(f => [f.path, f.lang, f.role]), [['a.vhd', 'vhdl', 'impl'], ['b.v', 'verilog', 'design'], ['c.vhd', 'vhdl', 'sim'], ['d.vhd', 'vhdl', 'design']]);
  assert.deepEqual([p.device.part, p.device.package], ['xc3s100e', 'cp132']);
  // an unclosed <file …> is skipped and the <file …/> after it read; a property without its '>' runs into the next one (its name the last)
  const q = importXise('<project><file name="x.vhd"><file name="y.vhd"/><property name="Device" value="xc3s250e"<property name="Package" value="tq144"/>');
  assert.deepEqual(q.files.map(f => f.path), ['y.vhd']);
  assert.deepEqual([q.device.part, q.device.package], [null, 'tq144']);
});

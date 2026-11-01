// UI: the iCE40's back end in the browser's real flow worker (#2295): web/js/open-flow-worker.js with nextpnr-ice40 and
// icepack served by the local server, a design from HDL to its .bin in memory, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#2295 a design of the iCE40 from HDL to its bitstream in the flow worker, no warnings', E, async (page) => {
  const r = await page.eval(async () => {
    const { browserOpenStatus, browserSteps, nextpnrBundleUrl } = await import('/js/open-flow-browser.js');
    const device = { family: 'ice40', part: 'ice40up5k', package: 'sg48' };
    const st = browserOpenStatus(device);
    const steps = browserSteps(['bitgen'], { family: st.family });
    const root = new URL('/', location.href).href;
    const w = new Worker('/js/open-flow-worker.js', { type: 'module' });
    const lines = [], writes = {};
    const done = await new Promise((resolve, reject) => {
      w.onerror = e => reject(new Error(e.message));
      w.onmessage = ({ data }) => {
        if (data.line !== undefined) lines.push(data.line);
        else if (data.write !== undefined) writes[data.write] = data.data;
        else if (data.done) resolve(data.done);
      };
      w.postMessage({ id: 1, spec: { top: 'blinky', part: st.part, device: 'ice40up5k', pkg: 'sg48', family: 'ice40', steps, seed: 1 },
        sources: [{ path: 'blinky.v', lang: 'verilog', text: 'module blinky(input clk, output reg led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23]; end\nendmodule\n' }],
        simSources: [], ucf: 'set_io clk 35\nset_io led 11\nset_frequency clk 12\n', ucfName: 'blinky.pcf', files: {}, assets: root,
        yosys: new URL('vendor/yowasp-yosys/gen/bundle.js', root).href, nextpnr: nextpnrBundleUrl(root), nextpnrIce40: new URL('vendor/nextpnr-ice40/gen/bundle.js', root).href });
    });
    w.terminate();
    return { st, steps, ok: done.ok, error: done.error, bit: done.report?.bit, size: writes['build/blinky.bin']?.length,
      warnings: lines.filter(l => /WARNING/.test(l)), steplines: lines.filter(l => /^=== SILINX STEP/.test(l)), asc: typeof writes['build/open/routed.asc'] };
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.st.available, true);
  assert.deepEqual(r.steps, ['synth', 'translate', 'par', 'bitgen']);
  assert.deepEqual(r.steplines, r.steps.map(s => `=== SILINX STEP ${s} ===`));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.size, 104090);
  assert.equal(r.asc, 'string');
  assert.equal(r.bit.size, 104090);
});

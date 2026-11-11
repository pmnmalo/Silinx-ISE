// UI: the ECP5's back end in the browser's real flow worker (#2302): web/js/open-flow-worker.js with nextpnr-ecp5 and ecppack
// served by the local server (what the browser's flow sends: nextpnrOwn), a design from HDL to its .bit in memory, no warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#2302 a design of the ECP5 from HDL to its bitstream in the flow worker, no warnings', E, async (page) => {
  const r = await page.eval(async () => {
    const { browserOpenStatus, browserSteps, nextpnrBundleUrl, ownBundle } = await import('/js/open-flow-browser.js');
    const { familyProfile } = await import('/core/family-profile.js');
    const device = { family: 'ecp5', part: 'lfe5u-25f', package: 'cabga381', speed: '-6' };
    const st = browserOpenStatus(device);
    const steps = browserSteps(['bitgen'], { family: st.family });
    const root = new URL('/', location.href).href;
    const where = ownBundle(familyProfile('ecp5').openFlow, root);
    const w = new Worker('/js/open-flow-worker.js', { type: 'module' });
    const lines = [], writes = {};
    const done = await new Promise((resolve, reject) => {
      w.onerror = e => reject(new Error(e.message));
      w.onmessage = ({ data }) => {
        if (data.line !== undefined) lines.push(data.line);
        else if (data.write !== undefined) writes[data.write] = data.data;
        else if (data.done) resolve(data.done);
      };
      w.postMessage({ id: 1, spec: { top: 'blinky', part: st.part, device: 'lfe5u-25f', pkg: 'cabga381', speed: '-6', family: 'ecp5', steps, seed: 1 },
        sources: [{ path: 'blinky.v', lang: 'verilog', text: 'module blinky(input clk, output reg led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23]; end\nendmodule\n' }],
        simSources: [], ucf: 'LOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led" SITE "B2";\nFREQUENCY PORT "clk" 25 MHZ;\n', ucfName: 'blinky.lpf', files: {}, assets: root,
        yosys: new URL('vendor/yowasp-yosys/gen/bundle.js', root).href, nextpnr: nextpnrBundleUrl(root),
        nextpnrOwn: { family: 'ecp5', where, tools: 'nextpnr-ecp5 and ecppack', mb: 30 } });
    });
    w.terminate();
    return { st, steps, where, ok: done.ok, error: done.error, bit: done.report?.bit, fmax: done.report?.par?.fmax, size: writes['build/blinky.bit']?.length,
      warnings: lines.filter(l => /WARNING/.test(l)), steplines: lines.filter(l => /^=== SILINX STEP/.test(l)), config: typeof writes['build/open/routed.config'] };
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.st.available, r.st.part], [true, 'lfe5u-25f-6cabga381']);
  assert.match(r.where, /\/vendor\/nextpnr-ecp5\/gen\/bundle\.js$/);
  assert.deepEqual(r.steps, ['synth', 'translate', 'par', 'bitgen']);
  assert.deepEqual(r.steplines, r.steps.map(s => `=== SILINX STEP ${s} ===`));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.config, 'string');
  assert.ok(r.size > 500000, String(r.size));
  assert.equal(r.bit.size, r.size);
  assert.deepEqual(r.fmax.map(f => [f.clock, f.constraint]), [['clk', 25]]);
});

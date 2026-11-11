// UI: the Gowin's back end in the browser's real flow worker (#2303): web/js/open-flow-worker.js with nextpnr-himbaechel-gowin
// served by the local server (what the browser's flow sends: nextpnrOwn), a design from HDL to its routed design in memory, no warnings, no bitstream.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#2303 a design of the Gowin from HDL to its routed design in the flow worker, no warnings, no bitstream', E, async (page) => {
  const r = await page.eval(async () => {
    const { browserOpenStatus, browserSteps, nextpnrBundleUrl, ownBundle } = await import('/js/open-flow-browser.js');
    const { familyProfile } = await import('/core/family-profile.js');
    const device = { family: 'gowin', part: 'gw1nr-9c', package: 'qn88', speed: '-6' };
    const st = browserOpenStatus(device);
    const steps = browserSteps(['par'], { family: st.family });
    const root = new URL('/', location.href).href;
    const where = ownBundle(familyProfile('gowin').openFlow, root);
    const w = new Worker('/js/open-flow-worker.js', { type: 'module' });
    const lines = [], writes = {};
    const done = await new Promise((resolve, reject) => {
      w.onerror = e => reject(new Error(e.message));
      w.onmessage = ({ data }) => {
        if (data.line !== undefined) lines.push(data.line);
        else if (data.write !== undefined) writes[data.write] = data.data;
        else if (data.done) resolve(data.done);
      };
      w.postMessage({ id: 1, spec: { top: 'blinky', part: st.part, device: 'gw1nr-9c', pkg: 'qn88', speed: '-6', family: 'gowin', steps, seed: 1 },
        sources: [{ path: 'blinky.v', lang: 'verilog', text: 'module blinky(input clk, output reg led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23]; end\nendmodule\n' }],
        simSources: [], ucf: 'IO_LOC "clk" 52;\nIO_LOC "led" 10;\n// create_clock -name clk -period 37.037 [get_ports {clk}]\n', ucfName: 'blinky.cst', files: {}, assets: root,
        yosys: new URL('vendor/yowasp-yosys/gen/bundle.js', root).href, nextpnr: nextpnrBundleUrl(root),
        nextpnrOwn: { family: 'gowin', where, tools: 'nextpnr-himbaechel-gowin', mb: 32 } });
    });
    w.terminate();
    return { st, steps, where, ok: done.ok, error: done.error, bit: done.report?.bit, fmax: done.report?.par?.fmax, written: Object.keys(writes),
      warnings: lines.filter(l => /WARNING/.test(l)), steplines: lines.filter(l => /^=== SILINX STEP/.test(l)), routed: typeof writes['build/open/routed.json'], notes: lines.filter(l => /^NOTE/.test(l)) };
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual([r.st.available, r.st.part], [true, 'gw1nr-9c-6qn88']);
  assert.match(r.where, /\/vendor\/nextpnr-himbaechel-gowin\/gen\/bundle\.js$/);
  assert.deepEqual(r.steps, ['synth', 'translate', 'par']);
  assert.deepEqual(r.steplines, r.steps.map(s => `=== SILINX STEP ${s} ===`));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.routed, 'string');
  assert.deepEqual(r.written.filter(f => /\.(fs|bit|bin)$/.test(f)), []);
  assert.equal(r.bit, undefined);
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /^NOTE: no bitstream for the Gowin yet/);
  assert.deepEqual(r.fmax.map(f => [f.clock, f.constraint]), [['clk', 27]]);
});

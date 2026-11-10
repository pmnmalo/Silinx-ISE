// The Exercise document's synthesis tests (#3216, automatic grading #3192): core/grade.js's `synthesize` in the page.
// The local server's page asks its server (server/grade-routes.js, a grading process as silinx grade's); the browser
// editions run the open synthesis in the flow's worker (web/js/open-flow-browser.js runBrowserSpec, as Synthesize runs it) on
// the spec and numbers of the server's grader (core/grade-synth.js): the same verdicts in the page as in silinx grade.
// A test past its time limit stops the worker (a Time Limit Exceeded); where Place & Route cannot run (no chip
// database offline, no device description served), the slices are not checked, said so, as the server's grader's (#3215).
import { runBrowserSpec, browserOpenStatus } from './open-flow-browser.js';
import { S } from './app.js';
import { api } from './api.js';
import { resourcesOf } from '/packages/silinx-fpga/src/parts.js';
import { GRADE_DEVICE, synthesisSpec, synthesisNumbers } from '/core/grade-synth.js';
import { limitsOf } from '/core/grade-format.js';

/** An exercise's `synthesize(sources, top, test)` in the page: the local server's page asks its server (the project
 *  `name`'s exercise `file`, as saved: its test's { result }). */
export function browserSynthesize(ex, { name, file } = {}) {
  if (!api.standalone) return async (sources, top, test) => api.gradeSynthesis(name, file, test.id);
  const device = ex.device || GRADE_DEVICE, dev = String(device.part).toLowerCase();
  return async (sources, top, test) => {
    const st = browserOpenStatus(device);
    if (!st.available) return { errors: [`the Silinx toolchain cannot synthesize for ${device.part}: ${st.reason}`] };
    const status = { part: st.part, device: dev, graph: st.graph || null };
    const part = S.devices?.parts.find(p => p.part === String(device.part).toLowerCase()), resources = part ? resourcesOf(part, device.package) : null;
    const seconds = limitsOf(ex, test).seconds;
    const run = async () => {
      const lines = [], ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), seconds * 1000);
      try {
        // (the synthesis alone needs no device description: the worker fetches none; Place & Route, nextpnr, which the
        // worker loads for the spec's engine)
        const spec = synthesisSpec(top, test, device, status, resources);
        if (spec.steps.includes('par')) spec.engine = 'nextpnr';
        else spec.graph = null;
        return { r: await runBrowserSpec({ spec, sources, onLine: l => lines.push(l), signal: ctl.signal }), lines };
      } catch (e) {
        if (e.cancelled) return { timedOut: true };
        throw e;
      } finally { clearTimeout(timer); }
    };
    let out = await run();
    // (Place & Route that cannot run here: nextpnr's chip database not to be had, offline, or the device's description
    // not served, the local server's page: the slices not checked, the other limits' verdict)
    const why = !out.timedOut && !out.r.ok && test.slices !== undefined && out.lines.find(l => /^\s*ERROR/.test(l) && /chip database|device description|bit database/.test(l));
    if (why) {
      status.slicesReason = `the slices are not checked here: Place & Route cannot run in this page (${why.replace(/^ERROR:\S+ - /, '').replace(/ \(.*$/, '')}); silinx grade checks them`;
      out = await run();
    }
    if (out.timedOut) return { timedOut: seconds };
    return synthesisNumbers(out.r, out.lines, test, status);
  };
}

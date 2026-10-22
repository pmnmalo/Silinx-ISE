// The programming file of Program FPGA (iMPACT, web/js/impact.js, #1024): is it there and up to date with the
// sources, from the implementation processes' state (S.status)? When it is not, Program FPGA asks whether to
// implement the design first and programs once it is built (as Generate and Simulate, #490). No DOM: unit tested
// (test/impact-file.test.js).

// (the processes of Implement Top Module: Synthesize, Translate, Map, Place & Route, Generate Programming File)
const IMPL = ['synth', 'translate', 'map', 'par', 'bitgen'];

/** The programming file's state: 'ok' (built, up to date), 'running' (being implemented), 'err' (the last
 *  implementation failed), 'stale' (older than the sources) or 'none' (not built yet). */
export function programFileState(status = {}) {
  const st = IMPL.map(id => status[id]);
  if (st.includes('running')) return 'running';
  if (st.includes('err')) return 'err';
  if (st.includes('stale')) return 'stale';
  return ['ok', 'warn'].includes(status.bitgen) ? 'ok' : 'none';
}

/** The question of Program FPGA when the file is not up to date (`state` from programFileState, `top` the
 *  top module): its lines; null when it is up to date or being built (nothing to ask). */
export function implementFirstText(state, top) {
  const why = {
    none: `There is no programming file of '${top}' yet.`,
    stale: `The programming file of '${top}' is older than the sources.`,
    err: `The last implementation of '${top}' failed.`,
  }[state];
  return why ? [why, 'Implement the design first? When it ends without errors, the FPGA is programmed.'] : null;
}

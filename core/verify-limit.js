// Silinx - the time limit of the formal checks (#3261): Verify Equivalence, Verify Assertions and Verify Property run
// Yosys's `sat -tempinduct`, whose own -timeout does nothing in WebAssembly (it relies on a signal). A check that takes
// longer than its limit is stopped from outside: the run's AbortSignal aborted, on which the page's Yosys worker
// (web/js/yosys-client.js yosysPool) and the server's (packages/silinx-fpga/src/synth-open-node.js yosysNode, a worker
// thread) are terminated; its verdict, 'timeout', says how many clock cycles Yosys had checked with no failure by then
// (its last base case solved).
//
//   const t = await runLimited(run, args, files, onLine, timeLimit)   // null: finished; { timedOut: true }: stopped

/** The time limit of a check, in seconds (the checks' dialogs' Time limit, the MCP tool's time_limit). */
export const VERIFY_TIME_LIMIT = 60;
export const MAX_TIME_LIMIT = 3600;

/** The time limit's problem (a message), or null. */
export function timeLimitError(s) {
  return typeof s === 'number' && s > 0 && s <= MAX_TIME_LIMIT ? null : `the time limit must be a number of seconds, more than 0 and at most ${MAX_TIME_LIMIT}`;
}

/**
 * Yosys's run(args, files, onLine) stopped after timeLimit seconds: null when it finished (its errors thrown), else
 * { timedOut: true }. The run is given { signal } (its fifth argument) to stop its worker; one that does not take it
 * is left to finish on its own, its result unread.
 */
export async function runLimited(run, args, files, onLine, timeLimit = VERIFY_TIME_LIMIT) {
  const ctl = new AbortController();
  let timer;
  const stopped = new Promise(resolve => { timer = setTimeout(() => { ctl.abort(); resolve({ timedOut: true }); }, timeLimit * 1000); });
  const done = Promise.resolve().then(() => run(args, files, onLine, undefined, { signal: ctl.signal })).then(() => null);
  try { return await Promise.race([done, stopped]); }
  catch (e) { if (ctl.signal.aborted) return { timedOut: true }; throw e; }
  finally { clearTimeout(timer); done.catch(() => {}); }
}

/** The clock cycles Yosys's log shows checked with no failure: its last base case solved ("[induction step N]" follows it). */
export function cyclesChecked(lines) {
  let k = 0;
  for (const l of lines) {
    const m = /^\[induction step (\d+)\]/.exec(l) || /^\*\* Trying induction with length (\d+) \*\*/.exec(l);
    if (m) k = Math.max(k, m[0].startsWith('**') ? +m[1] - 1 : +m[1]);
  }
  return k;
}

/** A timed-out check's verdict: "did not finish in N s (its time limit): <what> in the first k clock cycle(s), …". */
export function timeoutText(r, what) {
  const s = `the check did not finish in ${r.timeLimit} s (its time limit)`;
  if (!r.checked) return `${s}: no clock cycle checked; a larger time limit, or a smaller depth.`;
  return `${s}: ${what} in the first ${r.checked} clock cycle(s), not checked beyond them: a larger time limit, or a smaller depth.`;
}

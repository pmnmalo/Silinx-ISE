// ISim's simulation control (#405: out of mountISim): the queue of commands (one given while a run goes on waits
// for it, Break cancels the ones still waiting, #215), a run for some time in chunks that keep the page responsive,
// and Step. mountRun(ctx) is called by mountISim where this code was.
import { fmtTime } from './isim.js';

/** { enqueue, runTo, followEnd, step, breakCommands, destroy, isDestroyed } of an ISim window. */
export function mountRun(ctx) {
  const { st, sim, runAllCap, logLine, setMsg, invalidate, setCursor, tOf, width, applyFit, objectsChanged } = ctx;

  const yieldUI = () => new Promise(r => setTimeout(r, 0));
  // Commands run in turn, as in ISim's console: one typed (or a Run button pressed) while a run goes on
  // or before ISim's first run of 1 us starts waits for that run and for the commands given before it;
  // it used to be dropped without a word (#215). Break cancels the commands still waiting.
  // runDone: the end of the run going on; cmdGen counts the Breaks.
  let runDone = Promise.resolve(), cmdGen = 0, destroyed = false, cmdTail = Promise.resolve(), cmdPending = 0;
  function enqueue(s, fn) {
    const gen = cmdGen;
    const go = async () => {
      try {
        while (st.running) await runDone;
        if (destroyed) return;
        if (gen !== cmdGen) { logLine(`Command '${s}' cancelled (Break)`, 'warning'); return; }
        await fn();
      } catch (e) { console.error(e); } finally { cmdPending--; }
    };
    // (nothing before it: started at once, so a command's output follows its echo at once)
    return (cmdTail = cmdPending++ || st.running ? cmdTail.then(go) : go());
  }
  // Break: the run going on stops at its next chunk, the commands waiting are cancelled
  function breakCommands() { st.breakReq = true; cmdGen++; }
  // runs for `dur` ps from the time the run starts: a run asked for during another (the Run for field
  // while ISim's first run goes on) waits for it
  async function runTo(dur, label) {
    const gen = cmdGen;
    while (st.running) await runDone;
    if (destroyed || gen !== cmdGen) return;
    if (sim.finished) { logLine(`Simulation has already finished (${sim.finished}); use Restart to run again.`, 'warning'); return; }
    const target = sim.now + dur;
    let endRun;
    runDone = new Promise((r) => { endRun = r; });
    st.running = true; st.breakReq = false; st.runStart = sim.now; st.runTarget = target;
    const follow = st.fit || (sim.now >= st.t0 && sim.now <= tOf(width()) + 1);
    setMsg(label || 'Running...');
    invalidate(false);
    let lastYield = performance.now();
    let chunk = 10_000; // ps
    let stalled = false;
    try {
      while (!sim.finished && sim.now < target && !st.breakReq) {
        if (label === 'Run All' && sim.started && !sim.heap.size && !sim.active.length && !sim.nbaQ.length) { stalled = true; break; }
        const tgt = Math.min(target, sim.now + chunk);
        const a = performance.now();
        const r = sim.run(tgt);
        const dt = performance.now() - a;
        if (dt < 8) chunk = Math.min(chunk * 2, 1e12); else if (dt > 25) chunk = Math.max(1, Math.floor(chunk / 3));
        if (!r.pending && !sim.finished) {
          // nothing left to simulate: Run All stops here, Run for just advances time
          if (label === 'Run All') stalled = true; else sim.run(target);
          break;
        }
        if (performance.now() - lastYield > 30 || st.breakReq) {
          lastYield = performance.now();
          setMsg(`${label || 'Running'}... ${fmtTime(sim.now)}`);
          if (follow) followEnd();
          setCursor(sim.now);
          invalidate();
          await yieldUI();
        }
      }
    } catch (e) {
      logLine(`ERROR: internal simulator error: ${e.message}`, 'error');
      console.error(e);
    }
    st.running = false;
    endRun();   // (whoever waits for it goes on after the rest of this, all synchronous)
    if (st.breakReq) logLine(`Simulation interrupted (Break) at ${fmtTime(sim.now)}`, 'warning');
    else if (stalled) logLine(`Simulation stopped: no more events scheduled (time ${fmtTime(sim.now)})`, 'info');
    else if (!sim.finished && target !== Infinity && sim.now >= st.runStart + (runAllCap) && label === 'Run All') logLine(`Run All stopped at the ${fmtTime(runAllCap)} limit (time ${fmtTime(sim.now)})`, 'warning');
    if (sim.waveTruncated) setMsg('Waveform recording limit reached');
    else setMsg(sim.finished ? `Simulation ${sim.finished === 'error' ? 'stopped with an error' : 'finished'} at ${fmtTime(sim.now)}` : `Ready`);
    if (follow) followEnd();
    setCursor(sim.now);
    objectsChanged();
    invalidate();
  }
  function followEnd() {
    if (st.fit) { applyFit(); return; }
    const span = width() * st.scale;
    if (sim.now > st.t0 + span) st.t0 = sim.now - span * 0.9;
  }
  // Step: to the next scheduled event
  function step() {
    if (st.running) return;
    if (sim.finished) { logLine('Simulation has finished; use Restart.', 'warning'); return; }
    if (!sim.started) sim.run(sim.now); // time-0 initialisation
    const top = sim.heap.peek();
    if (!top) { sim.run(sim.now); logLine('No more events scheduled', 'info'); }
    else { sim.run(top.t); logLine(`Stepped to ${fmtTime(sim.now)}`, 'info'); }
    followEnd(); setCursor(sim.now); invalidate();
  }

  return { enqueue, runTo, followEnd, step, breakCommands, destroy() { destroyed = true; }, isDestroyed: () => destroyed };
}

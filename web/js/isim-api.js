// ISim's public API (#405: out of mountISim in isim.js): what the app calls on a simulation window (refresh, run,
// step, restart, add signals, destroy, redraw, a command), its state saved and restored (the rows and their groups,
// the cursor and markers, the view, the panels' sizes, the run time, the forces), its wave configuration as a .wcfg
// file (isim-wcfg.js, #1019), and the waveform exported as VCD.
import * as V from '/core/values.js';
import { mountWcfg } from './isim-wcfg.js';
import { applyStimuli } from '/core/stimuli.js';
import { toVCD } from '/core/simulator.js';

/** { api, exportVCD } of mountISim (consoleH(), leftW(), needScroll(), objDirty(), rafId(): its current values). */
export function mountApi(ctx) {
  const {
    opts, addSignals, applyFit, applySizes, cleanups, clearBits, newRow, rebuildFlat, closeDialog, consoleH, design, draw, echo, execCommand, findInst, injectForce,
    invalidate, layout, leftW, logLine, needScroll, objDirty, rafId, readColors, renderObjects, renderTree, rfUnit,
    rfVal, root, runAllCap, runTo, setMsg, sim, st, stepEvent, stopRuns, topSig, setObjDirty, setLeftW, setConsoleH,
    setRafId, setNeedScroll
  } = ctx;

  // the wave configuration (#1019)
  const { wcfgText, applyWcfg, saveWcfg, loadWcfg } = mountWcfg({ opts, st, design, newRow, rebuildFlat, invalidate, logLine });

  // ---------------------------------------------------------------- public API
  const api = {
    refresh() { readColors(); renderTree(); renderObjects(); rebuildFlat(); layout(); },
    runFor(ps) { return runTo(Math.max(1, Math.round(ps)), 'Run'); },
    runAll() { return runTo(runAllCap, 'Run All'); },
    step() { stepEvent(); },
    restart(silentEcho) {
      if (st.running) { st.breakReq = true; }
      if (!silentEcho) echo('restart');
      sim.reset();
      clearBits();
      for (const f of st.forces) injectForce(f);
      if (st.stim.m) applyStimuli(sim, n => topSig.get(n) || null, st.stim.m);
      st.cursor = 0; st.t0 = 0;
      if (st.fit) applyFit();
      logLine('Simulator is doing circuit initialization process.');
      logLine('Finished circuit initialization process.');
      if (st.forces.length) logLine(`${st.forces.length} force(s) re-applied.`);
      setMsg('Ready'); setObjDirty(true); invalidate();
    },
    addSignals(sigs) { addSignals(sigs); },
    destroy() {
      st.breakReq = true; stopRuns();
      if (rafId()) cancelAnimationFrame(rafId());
      closeDialog();
      for (const c of cleanups.splice(0)) c();
      root.remove();
    },
    getState() {
      return {
        // (a group by its index among the rows: its members' `group`)
        rows: st.rows.map(r => ({
          ...(r.kind === 'div' ? { kind: 'div', name: r.name } : r.kind === 'group' ? { kind: 'group', name: r.name, expanded: r.expanded } : { kind: 'sig', path: r.sig.path, radix: r.radix, expanded: r.expanded }),
          ...(r.group != null ? { group: st.rows.findIndex(g => g.id === r.group) } : {}),
        })),
        cursor: st.cursor, markers: st.markers.map(m => m.t), t0: st.t0, scale: st.scale, fit: st.fit,
        nameW: st.nameW, valW: st.valW, leftW: leftW(), consoleH: consoleH(),
        runTime: { value: rfVal.value, unit: rfUnit.value },
        curInst: st.curInst?.path ?? null,
        forces: st.forces.map(f => ({ path: f.sig.path, start: f.start, repeat: f.repeat, end: f.end, endRelease: f.endRelease, desc: f.desc, pattern: f.pattern.map(p => ({ off: p.off, bits: V.toBin(p.val) })) })),
      };
    },
    setState(s) {
      if (!s) return;
      if (Array.isArray(s.rows)) {
        st.rows = [];
        const ids = new Map();   // index in s.rows of a group -> its new row id
        s.rows.forEach((r, i) => {
          let row = null;
          if (r.kind === 'div') row = { id: st.rowSeq++, kind: 'div', name: r.name };
          else if (r.kind === 'group') { row = { id: st.rowSeq++, kind: 'group', name: r.name, expanded: r.expanded !== false }; ids.set(i, row.id); }
          else { const sig = design.signals.find(x => x.path === r.path); if (sig) row = newRow(sig, { radix: r.radix || 'default', expanded: !!r.expanded }); }
          if (row && r.group != null && ids.has(r.group)) row.group = ids.get(r.group);
          if (row) st.rows.push(row);
        });
        st.sel.clear();
      }
      if (s.cursor != null) st.cursor = s.cursor;
      if (Array.isArray(s.markers)) { st.markers = s.markers.map(t => ({ id: st.markerSeq++, t })); st.activeMarker = st.markers[st.markers.length - 1] || null; }
      if (s.scale) { st.scale = s.scale; st.t0 = s.t0 || 0; st.fit = !!s.fit; }
      if (s.nameW) st.nameW = s.nameW; if (s.valW) st.valW = s.valW;
      if (s.leftW) setLeftW(s.leftW); if (s.consoleH) setConsoleH(s.consoleH);
      if (s.runTime) { rfVal.value = s.runTime.value; rfUnit.value = s.runTime.unit; }
      if (s.curInst) { const i = findInst(s.curInst); if (i) st.curInst = i; }
      if (Array.isArray(s.forces)) {
        for (const f of s.forces) {
          const sig = design.signals.find(x => x.path === f.path);
          if (!sig || !sig.wave) continue;
          const pattern = f.pattern.map(p => ({ off: p.off, val: V.withSign(V.resize(V.fromBits(p.bits), sig.t.w, false), !!sig.t.s) }));
          const ff = { id: st.forceSeq++, sig, pattern, start: f.start, repeat: f.repeat, end: f.end ?? null, endRelease: f.endRelease !== false, desc: f.desc };
          st.forces.push(ff);
          if (!sim.finished && (ff.end == null || ff.end > sim.now)) injectForce(ff);
        }
      }
      applySizes(); renderTree(); renderObjects(); rebuildFlat(); layout();
    },
    // extras
    redraw() { if (rafId()) { cancelAnimationFrame(rafId()); setRafId(0); } setNeedScroll(true); draw(); },
    exec: (cmd) => execCommand(cmd),
    exportVCD: () => exportVCD(),
    wcfg: () => wcfgText(), setWcfg: (text, name) => applyWcfg(text, name), saveWcfg, loadWcfg,
    get state() { return st; },
  };

  function exportVCD() {
    try {
      const text = toVCD(design, sim);
      const blob = new Blob([text], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${design.top?.name || 'waveform'}.vcd`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      logLine(`Waveform exported to ${a.download} (${(text.length / 1024).toFixed(1)} KB)`);
    } catch (e) { logLine(`ERROR: VCD export failed: ${e.message}`, 'error'); }
  }

  return { api, exportVCD };
}

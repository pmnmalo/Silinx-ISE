// ISim's toolbar (#405: out of mountISim in isim.js): restart, run all, run for a time (its value and unit), step,
// break, the zooms, the cursor's moves, a marker, the radix, Save and Load Wave Configuration (#1019: with
// opts.wcfg; no VCD export), and Edit Stimuli with its bar of commands (#336, #853) when the window can draw stimuli.
import { h } from './dom.js';
import { ICON, UNITS, parseTime } from './isim.js';

/** { btns, rfUnit, rfVal, stimBar } of mountISim (api(): its current values). */
export function mountToolbar(ctx) {
  const {
    opts, $, addMarker, api, breakCommands, echo, enqueue, ensureVisible, fillStim, jumpEdge, logLine,
    radixItems, setCursor, showMenu, sim, st, stimOpt, timingDialog, toggleStim, zoomAt, zoomFit
  } = ctx;

  // ---------------------------------------------------------------- toolbar
  const tb = $('.isim-toolbar');
  const btns = {};
  const addBtn = (key, title, fn) => {
    const b = h('button', { class: 'tb-btn', html: ICON[key] }); b.title = title; b.type = 'button';
    b.addEventListener('click', () => { fn(); });
    tb.appendChild(b); btns[key] = b; return b;
  };
  const sep = () => tb.appendChild(h('span', { class: 'tb-sep' }));
  addBtn('restart', 'Restart', () => api().restart());
  addBtn('runAll', 'Run All', () => { echo('run all'); enqueue('run all', () => api().runAll()); });
  addBtn('runFor', 'Run for the specified time', () => runForUi());
  const rfVal = h('input', { class: 'isim-rf-val' }); rfVal.value = String(opts.defaultRunTime?.value ?? 1); rfVal.title = 'Simulation run time';
  const rfUnit = h('select', { class: 'isim-rf-unit', html: Object.keys(UNITS).map(u => `<option>${u}</option>`).join('') });
  rfUnit.value = opts.defaultRunTime?.unit ?? 'us'; rfUnit.title = 'Time unit';
  tb.appendChild(rfVal); tb.appendChild(rfUnit);
  rfVal.addEventListener('keydown', e => { if (e.key === 'Enter') runForUi(); });
  addBtn('step', 'Step (advance to the next scheduled event)', () => api().step());
  addBtn('brk', 'Break', () => breakCommands());
  sep();
  addBtn('zoomIn', 'Zoom In', () => zoomAt(0.5));
  addBtn('zoomOut', 'Zoom Out', () => zoomAt(2));
  addBtn('zoomFit', 'Zoom to Full View', () => zoomFit());
  sep();
  addBtn('toStart', 'Go to Time 0', () => { setCursor(0); ensureVisible(0); });
  addBtn('toEnd', 'Go to Latest Time', () => { setCursor(sim.now); ensureVisible(sim.now); });
  addBtn('prevEdge', 'Previous Transition (selected signal)', () => jumpEdge(-1));
  addBtn('nextEdge', 'Next Transition (selected signal)', () => jumpEdge(1));
  sep();
  addBtn('marker', 'Add Marker at cursor', () => addMarker(st.cursor));
  const radixBtn = addBtn('radix', 'Radix of selected signals', () => {
    const r = radixBtn.getBoundingClientRect();
    showMenu(r.left, r.bottom, radixItems());
  });
  if (opts.wcfg) {
    sep();
    addBtn('wcfgSave', 'Save Wave Configuration', () => api().saveWcfg());
    addBtn('wcfgLoad', 'Load Wave Configuration', () => api().loadWcfg());
  }
  // the stimuli drawn on the inputs' waveforms (#336), with their bar of commands
  const stimBar = h('div', { class: 'isim-stimbar' });
  stimBar.hidden = true;
  if (stimOpt) {
    sep();
    // with its label, so that drawing stimuli is seen among the icons (#853)
    addBtn('stim', 'Edit Stimuli: click the waveforms of the inputs (as the HDL Bencher)', () => toggleStim()).append(h('span', { class: 'tb-label', text: 'Edit Stimuli' }));
    stimBar.innerHTML = `<span class="isim-stim-h">Stimuli</span><button class="btn" data-stim="timing">Timing…</button><button class="btn" data-stim="fill">Fill Expected Outputs</button>`
      + `<button class="btn" data-stim="save">Save as Test Bench…</button><button class="btn" data-stim="stop">Stop Editing</button><span class="isim-stim-st"></span>`;
    tb.after(stimBar);
    stimBar.querySelector('[data-stim=timing]').onclick = () => timingDialog();
    stimBar.querySelector('[data-stim=fill]').onclick = () => fillStim();
    stimBar.querySelector('[data-stim=save]').onclick = () => { if (st.stim.m) stimOpt.onSaveTestbench?.(JSON.parse(JSON.stringify(st.stim.m))); };
    stimBar.querySelector('[data-stim=stop]').onclick = () => toggleStim(false);
  }
  btns.brk.disabled = true;

  function runForUi() {
    const ps = parseTime(rfVal.value, rfUnit.value);
    if (!(ps > 0)) { logLine(`ERROR: invalid run time '${rfVal.value} ${rfUnit.value}'`, 'error'); return; }
    const s = `run ${rfVal.value} ${rfUnit.value}`;
    echo(s);
    enqueue(s, () => api().runFor(Math.max(1, ps)));
  }

  return { btns, rfUnit, rfVal, stimBar };
}

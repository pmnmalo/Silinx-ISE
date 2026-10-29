// The schematic's Try it inputs (#405: out of liveController in sch-live.js): the clocks run at their rates (a cycle
// step per frame, at most 100 at once) and their Run / Pause buttons, and the value editor of a bus input or of a
// bidirectional port (a value typed in a radix, +1 / −1, 0, Z to release the bus).
import { fmtValue, parseValue } from '/core/schlive.js';
import { t } from './i18n.js';

/** { closeEditor, openEditor, startClock, stopAll, stopClock } of liveController (destroyed(), editor(), lastT(), radix(), raf(): its current values). */
export function mountLiveInputs(parts) {   // (parts: ctx is the editor's, as in liveController)
  const {
    ctx, live, act, canvas, clockBoxes, destroyed, doc, editor, h, lastT, radix, raf, running, update, setRaf, setLastT,
    setEditor
  } = parts;

  // ------------------------------------------------------------------ clocks
  function startClock(id, rate) {
    running.set(id, { rate, acc: 0 });
    syncClockBtns();
    if (!raf()) { setLastT(performance.now()); setRaf(requestAnimationFrame(tick)); }
  }
  function stopClock(id) { running.delete(id); syncClockBtns(); }
  function stopAll() { running.clear(); syncClockBtns(); }
  function syncClockBtns() {
    for (const b of clockBoxes) {
      const on = running.has(b.c.id);
      b.runBtn.textContent = on ? 'Pause' : 'Run';
      b.runBtn.classList.toggle('on', on);
    }
    if (!destroyed()) update();   // (the clocks' markers: green while they run, #1110)
  }
  function tick(t) {
    setRaf(0);
    if (destroyed() || !running.size) return;
    const dt = Math.min(0.25, Math.max(0, (t - lastT()) / 1000));
    setLastT(t);
    let any = false;
    for (const [id, st] of running) {
      st.acc += dt * st.rate;
      const n = Math.min(100, Math.floor(st.acc));
      if (n > 0) { st.acc -= n; live.cycles([id], n); any = true; }
    }
    if (any) update();
    if (running.size && !live.error) setRaf(requestAnimationFrame(tick));
  }

  // ------------------------------------------------------------------ bus value editor
  function openEditor(portId) {
    closeEditor();
    const p = doc.ports.find(q => q.id === portId), bd = live.bidir?.(portId), inp = live.input(portId) || bd;
    if (!p || !inp) return;
    const setv = n => (bd ? live.drive(portId, n) : live.set(portId, n));
    const pos = ctx.toCanvas({ x: p.x - 30, y: p.y + 10 });
    const field = h('input', { type: 'text', class: 'lv-edit-in', spellcheck: 'false' });
    const rsel = h('select', { title: 'Number format' }, h('option', { value: 'bin', text: 'Bin' }), h('option', { value: 'hex', text: 'Hex' }), h('option', { value: 'dec', text: 'Dec' }),
      h('option', { value: 'sdec', text: "Dec (two's)" }), h('option', { value: 'c1dec', text: "Dec (one's)" }));   // (two's / one's complement, #2015)
    rsel.value = radix();
    const show = () => { field.value = fmtValue(live.portValue(portId), rsel.value).replace(/^X+$|^Z+$/, ''); };
    const apply = () => {
      const n = parseValue(field.value, inp.width, rsel.value);
      if (n == null) { field.classList.add('bad'); return false; }
      field.classList.remove('bad');
      act(() => setv(n));
      show();
      return true;
    };
    const step = d => { act(() => setv((inp.value ?? 0n) + BigInt(d))); show(); };
    rsel.addEventListener('change', show);
    field.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { if (apply()) closeEditor(); }
      else if (e.key === 'Escape') closeEditor();
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
    });
    const box = h('div', { class: 'lv-editor', style: `left:${Math.max(4, pos.x)}px;top:${Math.max(4, pos.y)}px` },
      h('div', { class: 'lv-edit-head' }, h('b', { text: `${p.name}`, 'data-no-i18n': '' }), h('span', { text: ` (${inp.width} bits)`, 'data-no-i18n': '' }), h('span', { class: 'lv-sp' }),
        h('button', { type: 'button', class: 'lv-x', title: 'Close', text: '×', onclick: closeEditor })),
      h('div', { class: 'lv-edit-row' }, field, rsel),
      h('div', { class: 'lv-edit-row' },
        h('button', { type: 'button', class: 'btn', title: 'Subtract 1', text: '−1', onclick: () => step(-1) }),
        h('button', { type: 'button', class: 'btn', title: 'Add 1', text: '+1', onclick: () => step(1) }),
        h('button', { type: 'button', class: 'btn', text: '0', title: 'All bits 0', onclick: () => { act(() => setv(0n)); show(); } }),
        bd ? h('button', { type: 'button', class: 'btn lv-release', text: 'Z', title: 'Release the bus (Z): the circuit drives it', onclick: () => { act(() => live.drive(portId, null)); closeEditor(); } }) : null,
        h('button', { type: 'button', class: 'btn primary', text: 'Set', onclick: () => { if (apply()) closeEditor(); } })),
      h('div', { class: 'lv-note', text: 'Hex 0x1F, binary 0b101, or decimal; ↑ / ↓ add / subtract 1' }));
    box.addEventListener('pointerdown', e => e.stopPropagation());
    canvas.append(box);
    setEditor({ box, portId });
    // a marker near the right edge (bidirectional markers are on the right): keep the editor inside the canvas
    const over = box.offsetLeft + box.offsetWidth - (canvas.clientWidth - 4);
    if (over > 0) box.style.left = `${Math.max(4, box.offsetLeft - over)}px`;
    show();
    setTimeout(() => { field.focus(); field.select(); }, 0);
  }
  function closeEditor() { if (editor()) { editor().box.remove(); setEditor(null); } }

  return { closeEditor, openEditor, startClock, stopAll, stopClock };
}

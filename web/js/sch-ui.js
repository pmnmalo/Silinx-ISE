// The schematic editor's small helpers (#405: out of mountSchEditor in sch-editor.js): a message flashed on the
// canvas a moment, and a text asked for in a box at a point of the sheet.
import { h } from './dom.js';

/** { flash, promptBox } of mountSchEditor (view(): its current values). */
export function mountSchUi(ctx) {
  const {
    container, canvas, hint, svg, view
  } = ctx;

  // ---------------- small UI helpers
  let flashTimer = null;
  function flash(msg, ms = 1800) {
    hint.textContent = msg; hint.hidden = false;
    clearTimeout(flashTimer); flashTimer = setTimeout(() => { hint.hidden = true; }, ms);
  }
  function promptBox(pt, label, value) {
    return new Promise(resolve => {
      const r = svg.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const x = Math.min(cr.width - 220, Math.max(4, pt.x * view().s + view().tx + (r.left - cr.left) + 8));
      const y = Math.min(cr.height - 60, Math.max(4, pt.y * view().s + view().ty + (r.top - cr.top) + 8));
      const input = h('input', { type: 'text', value: value || '' });
      const box = h('div', { class: 'se-prompt', style: `left:${x}px;top:${y}px` }, h('label', { text: label }), input);
      let done = false;
      const end = v => { if (done) return; done = true; box.remove(); container.focus({ preventScroll: true }); resolve(v); };
      // (Enter's default prevented: its keypress would press the button of a dialog the name opens, #2170)
      input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(input.value.trim() || null); } else if (e.key === 'Escape') end(null); });
      input.addEventListener('blur', () => setTimeout(() => end(input.value.trim() || null), 0));
      canvas.append(box);
      setTimeout(() => { input.focus(); input.select(); }, 0);
    });
  }

  return { flash, promptBox };
}

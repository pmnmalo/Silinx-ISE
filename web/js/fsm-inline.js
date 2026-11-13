// The state diagram editor's inline editing (#405: out of mountFsmEditor in fsm-editor.js): a state's name and
// outputs, or a transition's condition and outputs, edited in place on the drawing, applied on Enter or a click
// elsewhere, cancelled by Escape.
import { formatOutputs, parseLabel, parseOutputs } from '/core/fsm.js';
import { h } from './ui.js';
import { clamp, textW } from './fsm-editor.js';

/** { closeInline, editLabel, editState } of mountFsmEditor (M(): its current values). */
export function mountFsmInline(ctx) {
  const {
    M, canvasWrap, commit, flash, geom, renderSide, root, stateById, toScreen, transById
  } = ctx;

  // ---------------------------------------------------------------------------- inline editing
  let inline = null;
  function closeInline(commitIt) {
    if (!inline) return;
    const { input, apply, value } = inline;
    inline = null;
    // (a text left as it was: nothing applied, nothing drawn anew; the side panel's field clicked keeps the focus, #3763)
    const focused = document.activeElement === input || document.activeElement === document.body;
    if (commitIt && input.value !== value) apply(input.value);
    input.remove();
    if (focused) root.focus({ preventScroll: true });
  }
  function inlineAt(world, value, apply, { width = 200 } = {}) {
    closeInline(true);
    const sc = toScreen(world.x, world.y);
    const wr = canvasWrap.getBoundingClientRect();
    const input = h('input', { type: 'text', class: 'asm-input mono fsm-inline', value, spellcheck: 'false' });
    input.style.left = `${clamp(sc.x - wr.left - width / 2, 4, wr.width - width - 4)}px`;
    input.style.top = `${clamp(sc.y - wr.top - 14, 4, wr.height - 32)}px`;
    input.style.width = `${width}px`;
    canvasWrap.append(input);
    inline = { input, apply, value };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); closeInline(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closeInline(false); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (inline?.input === input) closeInline(true); }, 0));
    input.focus(); input.select();
  }
  function editState(s) {
    const outs = formatOutputs(s.outputs);
    inlineAt({ x: s.x, y: s.y }, outs ? `${s.name} / ${outs}` : s.name, (v) => {
      const k = v.indexOf('/');
      const name = (k < 0 ? v : v.slice(0, k)).trim();
      const r = k < 0 ? { outputs: s.outputs } : parseOutputs(v.slice(k + 1), M().outputs);
      if (r.error) { flash(r.error, 'err'); return; }
      const cur = stateById(s.id);
      if (!cur) return;
      if (name) cur.name = name;
      cur.outputs = r.outputs;
      commit(); renderSide();
    }, { width: Math.max(140, textW(s.name) + 140) });
  }
  function editLabel(t) {
    const g = geom(t);
    if (!g) return;
    const o = formatOutputs(t.outputs);
    inlineAt(g.lab, M().type === 'mealy' || o ? `${t.cond}${o ? ` / ${o}` : (M().type === 'mealy' ? ' / ' : '')}` : t.cond, (v) => {
      const cur = transById(t.id);
      if (!cur) return;
      const p = parseLabel(v, M().outputs);
      if (p.error) { flash(p.error, 'err'); return; }
      cur.cond = p.cond;
      cur.outputs = p.outputs;
      commit(); renderSide();
    }, { width: 240 });
  }

  return { closeInline, editLabel, editState };
}

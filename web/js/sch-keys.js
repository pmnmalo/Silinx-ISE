// The schematic editor's keyboard (#405: out of mountSchEditor in sch-editor.js): Space held to pan, the tools'
// letters, Delete, Escape, the arrows moving the selection by the grid (Shift: 5 steps), Rotate / Mirror, Undo /
// Redo, Cut / Copy / Paste, Select All, and the keys of Try it.
import { GRID } from '/core/schdoc.js';
import { pasteFromKey } from './clipboard.js';

/** { onKey, onKeyUp } of mountSchEditor (destroyed(), live(), sel(), spaceDown(), tool(), wireDraw(): its current values). */
export function mountSchKeys(ctx) {
  const {
    container, opts, applyMove, beginMove, canvas, copySel, deleteSel, destroyed, finishMove, finishWire, fit,
    infoTarget, leaveSim, live, mirrorSel, openInfo, openSelected, paste, readOnly, redo, render, renderOverlay,
    renderProps, rotateSel, sel, selectAll, setTool, spaceDown, tool, undo, wireDraw, zoomAt, setSpaceDown, setWireDraw
  } = ctx;

  // ---------------- keyboard
  function onKey(e) {
    if (destroyed()) return;
    if (live()) {
      if (!container.contains(document.activeElement) && document.activeElement !== container && !(e.key === 'Escape' && document.activeElement === document.body && container.offsetParent)) return;
      const t0 = e.target;
      if (t0 && (t0.tagName === 'INPUT' || t0.tagName === 'TEXTAREA' || t0.tagName === 'SELECT')) return;
      const k0 = e.key.toLowerCase();
      if (k0 === 'escape') { e.preventDefault(); if (live().editing) live().closeEditor(); else leaveSim(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // (a symbol clicked in Try it: its Symbol Info, #1175)
      if (e.key === 'F1') { e.preventDefault(); const t1 = infoTarget(); if (t1) openInfo(t1); return; }
      if (k0 === ' ' && !spaceDown()) { setSpaceDown(true); canvas.classList.add('pan-ready'); e.preventDefault(); }
      else if (k0 === 'f') fit();
      else if (k0 === '+' || k0 === '=') zoomAt(1.25);
      else if (k0 === '-' || k0 === '_') zoomAt(0.8);
      return;
    }
    // Esc stops placing a symbol / drawing a wire wherever the keyboard focus is (palette, search
    // box, page), as long as this editor is on screen
    if (e.key === 'Escape' && (tool() !== 'select' || wireDraw()) && container.isConnected && container.offsetParent) {
      e.preventDefault();
      if (wireDraw()) { if (wireDraw().pts.length > 1) finishWire(); else { setWireDraw(null); renderOverlay(); } }
      else setTool('select');
      container.focus({ preventScroll: true });
      return;
    }
    if (!container.contains(document.activeElement) && document.activeElement !== container) return;
    if (e.key === 'F1') { e.preventDefault(); const t1 = infoTarget(); if (t1) openInfo(t1); return; }
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (k === ' ' && !spaceDown()) { setSpaceDown(true); canvas.classList.add('pan-ready'); e.preventDefault(); return; }
    // read-only (RTL view): Backspace = up to the parent module, Enter = push into the selected instance
    if (readOnly && k === 'backspace' && !mod) { e.preventDefault(); opts.onUp?.(); return; }
    if (readOnly && k === 'enter' && !mod) { if (openSelected()) e.preventDefault(); return; }
    if (readOnly && !(['escape', 'f', '+', '=', '-', '_'].includes(k) || (mod && (k === 'a' || k === 'c')))) return;
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((mod && k === 'y') || (mod && k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
    if (mod && k === 'r') { e.preventDefault(); rotateSel(); return; }
    if (mod && k === 'm') { e.preventDefault(); mirrorSel(); return; }
    if (mod && k === 'c') { e.preventDefault(); if (!readOnly) copySel(); return; }
    if (mod && k === 'x') { e.preventDefault(); copySel(true); return; }
    // (Ctrl+V: the browser's paste event below, which reads the system clipboard with no permission asked;
    // the app's own clipboard if the browser sends none)
    if (mod && k === 'v') { if (!readOnly) pasteFromKey('schematic', paste); return; }
    if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
    if (mod) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); return; }
    if (k === 'escape') {
      if (wireDraw()) { if (wireDraw().pts.length > 1) finishWire(); else { setWireDraw(null); renderOverlay(); } return; }
      if (tool() !== 'select') { setTool('select'); return; }
      sel().clear(); render(); renderProps(); return;
    }
    if (k === 'w') setTool('wire');
    else if (k === 'n') setTool('net');
    else if (k === 'o') setTool('io');
    else if (k === 's' && tool() !== 'select') setTool('select');
    else if (k === 'f') fit();
    else if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-' || k === '_') zoomAt(0.8);
    else if (k.startsWith('arrow') && sel().size) {
      e.preventDefault();
      const d = (e.shiftKey ? 5 : 1) * GRID;
      const dx = k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, dy = k === 'arrowup' ? -d : k === 'arrowdown' ? d : 0;
      const m = beginMove({ x: 0, y: 0 });
      applyMove(m, dx, dy);
      finishMove(m);
    }
  }
  function onKeyUp(e) { if (e.key === ' ') { setSpaceDown(false); canvas.classList.remove('pan-ready'); } }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  return { onKey, onKeyUp };
}

// The schematic editor's toolbar (#405: out of mountSchEditor in sch-editor.js): its tools and buttons (Select, Wire,
// Net Name, I/O Marker, Undo / Redo (#1696), Rotate, Mirror Horizontal / Vertical (#2209), Delete, the zooms, Keep connections, Select whole branch (#2211), Names, Check, Try it, the panels on a narrow
// screen; the menu at the right of the first line, #2208: Rearrange Wires / Rearrange Schematic (#1481, #1506, #1730), Curved wires (#1144), Hop-overs), the editing ones hidden when read-only, and their clicks.
import { PROPS_KEY, SYMBOLS_KEY, panelToggle } from './narrow.js';
import { h } from './dom.js';
import { undoButton } from './ui.js';
import { ICON } from './sch-editor.js';

/** { optBox } of mountSchEditor (live(): its current values). */
export function mountSchToolbar(ctx) {
  const {
    branchBox, rearrangeWires, rearrangeSheet, container, btn, canSim, curvedBox, deleteSel, enterSim, fit, hopsBox, keepBox, leaveSim, live, mirrorSel, mirrorVSel, namesBox,
    readOnly, redo, rotateSel, runCheck, sep, setTool, tb, undo, zoomAt
  } = ctx;

  const optBox = h('span', { class: 'se-opts' });
  // the menu (#2208): its button always at the right of the toolbar's first line (absolute, the CSS), open until a
  // click elsewhere, Esc or one of its commands (its tick boxes leave it open, their effect seen on the sheet)
  const moreMenu = h('div', { class: 'se-more-menu', hidden: true },
    // (#1730: the wires only, the symbols where they are; or the whole schematic, its symbols moved where needed)
    h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'rewire', title: 'Rearrange Wires: draw the wires again with few bends and crossings, the symbols, I/O markers and net names where they are; with a selection, only its wires. The connections stay the same', html: `${ICON.rewire}<span>Rearrange Wires</span>` }),
    h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'relayout', title: 'Rearrange Schematic: lay the whole schematic out again, easier to read (the inputs on the left, the outputs on the right, the symbols moved in the order of the signals, the wires with few bends and crossings). The connections stay the same', html: `${ICON.beautify}<span>Rearrange Schematic</span>` }),
    // (Curved wires, how the wires are drawn, before Hop-overs, #1175)
    h('span', { class: 'se-sep' }), h('label', { class: 'se-curved', title: 'Draw the wires as smooth curves of any shape instead of the technical drawing\'s square corners (the connections, the nets and the HDL the same)' },
      curvedBox, h('span', { text: 'Curved wires' })),
    h('label', { class: 'se-hops', title: 'Draw a small arc where two wires cross without connecting' }, hopsBox, h('span', { text: 'Hop-overs' })),
  );
  const moreBtn = h('button', { type: 'button', class: 'se-btn', 'data-act': 'more', title: 'Wires and layout', 'aria-haspopup': 'true', 'aria-expanded': 'false', html: ICON.more });
  const more = h('span', { class: 'se-more' }, moreBtn, moreMenu);
  const onOutside = e => { if (!more.contains(e.target)) showMore(false); };
  const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); showMore(false); container.focus({ preventScroll: true }); } };
  function showMore(open) {
    moreMenu.hidden = !open;
    moreBtn.classList.toggle('on', open);
    moreBtn.setAttribute('aria-expanded', String(open));
    document[open ? 'addEventListener' : 'removeEventListener']('pointerdown', onOutside, true);
    document[open ? 'addEventListener' : 'removeEventListener']('keydown', onEsc, true);
  }
  tb.append(
    btn('select', 'select', 'Select (Esc)'), btn('wire', 'wire', 'Add Wire (W)'), btn('net', 'net', 'Add Net Name (N)'), btn('io', 'io', 'Add I/O Marker (O)'),
    // (Undo / Redo right after the drawing tools, #1696)
    sep(), undoButton('undo', undefined, { 'data-act': 'undo' }), undoButton('redo', undefined, { 'data-act': 'redo' }),
    sep(), btn('rotate', 'rotate', 'Rotate (Ctrl+R)'), btn('mirror', 'mirror', 'Mirror Horizontal (Ctrl+M)'), btn('mirrorv', 'mirrorv', 'Mirror Vertical'), btn('delete', 'del', 'Delete (Del)'),
    sep(), btn('zin', 'zin', 'Zoom In (+)'), btn('zout', 'zout', 'Zoom Out (−)'), btn('fit', 'fit', 'Zoom to Full View (F)'),
    // (Keep connections after the view's buttons, #1733)
    sep(), h('label', { class: 'se-keep', title: 'Moving components: keep the wires connected (re-routed around other parts) or detach them' },
      keepBox, h('span', { text: 'Keep connections' })),
    h('label', { class: 'se-branch', title: 'A click on a wire selects the whole network of wires of its signal; not ticked, only the straight segment clicked' },
      branchBox, h('span', { text: 'Select whole branch' })),
    sep(),
    h('label', { class: 'se-names', title: 'Show the name of every instance and every net (the automatic ones too)' }, namesBox, h('span', { text: 'Names' })),
    h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'check', title: 'Check Schematic', html: `${ICON.check}<span>Check</span>` }),
    sep(), h('button', { type: 'button', class: 'se-btn wide', 'data-act': 'sim', title: 'Try it: click the inputs and watch the circuit work (Esc to stop)', html: `${ICON.sim}<span>Try it</span>` }),   // (not "Simulate": the design flow's, the waves, #992)
    sep(), optBox, more,
    // a narrow screen (#266): the symbols and the properties over the canvas, shown by these
    h('span', { class: 'se-panels' },
      panelToggle(container, h('button', { type: 'button', class: 'se-btn wide', 'data-panel': 'symbols', title: 'Show / hide the symbols panel' }, '☰ Symbols'), { cls: 'pal-open', key: SYMBOLS_KEY }),
      panelToggle(container, h('button', { type: 'button', class: 'se-btn wide', 'data-panel': 'props', title: 'Show / hide the properties panel' }, '☰ Properties'), { key: PROPS_KEY })),
  );
  // read-only (RTL view): the editing tools are hidden (Curved wires kept, how it is drawn: #1193), so drop the
  // separators they leave doubled
  if (readOnly) {
    let prevSep = true;                                   // a separator at the start is not needed
    let lastSep = null;
    for (const el of tb.children) {
      if (el.classList.contains('se-keep') || el.classList.contains('se-branch') || el.classList.contains('se-opts') || el.classList.contains('se-more') || ['wire', 'net', 'io', 'rotate', 'mirror', 'mirrorv', 'delete', 'undo', 'redo'].includes(el.dataset.act) || (el.dataset.act === 'sim' && !canSim)) continue;   // hidden by .read-only CSS
      if (el.classList.contains('se-sep')) { if (prevSep) el.style.display = 'none'; else { prevSep = true; lastSep = el; } }
      else { prevSep = false; lastSep = null; }
    }
    if (lastSep) lastSep.style.display = 'none';          // nor at the end
  }
  tb.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'sim') { if (live()) leaveSim(); else enterSim(); container.focus({ preventScroll: true }); return; }
    if (a === 'more') { showMore(moreMenu.hidden); return; }
    if (live() && !['zin', 'zout', 'fit', 'check'].includes(a)) return;
    if (a === 'select' || a === 'wire' || a === 'net' || a === 'io') setTool(a);
    else if (a === 'rotate') rotateSel(); else if (a === 'mirror') mirrorSel(); else if (a === 'mirrorv') mirrorVSel(); else if (a === 'delete') deleteSel();
    else if (a === 'rewire') { showMore(false); rearrangeWires(); } else if (a === 'relayout') { showMore(false); rearrangeSheet(); }
    else if (a === 'undo') undo(); else if (a === 'redo') redo();
    else if (a === 'zin') zoomAt(1.25); else if (a === 'zout') zoomAt(0.8); else if (a === 'fit') fit();
    else if (a === 'check') runCheck(true);
    container.focus({ preventScroll: true });
  });

  return { optBox };
}

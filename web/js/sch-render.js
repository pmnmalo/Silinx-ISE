// The schematic editor's drawing of its document (#405: out of mountSchEditor): the sheet and its title block, the
// wires (their hops, their bus names), the symbols, I/O markers and net names, the unconnected pins; the overlay of
// the tool in use (the symbol being placed, the wire being drawn, the pin under the pointer, the selection band); the
// toolbar's state and the status line. mountRender(ctx) is called by mountSchEditor where this code was.
import { symbolDef, symbolPins, rotSize, parseNetName, wireCrossings } from '/core/schdoc.js';
import { esc } from './dom.js';
import { symbolSvg, portSvg, hopPath, inLineRuns, wireRun } from './sch-svg.js';
import { snap } from './sch-editor.js';

/** { renderSheet, render, renderOverlay, updateToolbar, updateStatus } of a schematic editor (state(): its current
 *  document, netlist, selection, tool, … at the time of the call; refreshNetlist() computes the netlist again). */
export function mountRender(ctx) {
  const { state, refreshNetlist, uidE, readOnly, sheetG, contentG, overlayG, tb, status, undoStack, redoStack, routeTo, snapPoint, bandRect,
    infoTarget } = ctx;

  function renderSheet() {
    const { doc } = state();
    const W = doc.sheet.w, H = doc.sheet.h;
    const tbw = 300, tbh = 60;
    sheetG.innerHTML = `<rect class="sheet" x="0" y="0" width="${W}" height="${H}"/>`
      + `<rect class="gridfill" x="0" y="0" width="${W}" height="${H}" fill="url(#se-grid-${uidE})"/>`
      + `<rect class="gridfill2" x="0" y="0" width="${W}" height="${H}" fill="url(#se-grid2-${uidE})"/>`
      + `<rect class="frame" x="10" y="10" width="${W - 20}" height="${H - 20}"/>`
      + `<g class="titleblock"><rect x="${W - 10 - tbw}" y="${H - 10 - tbh}" width="${tbw}" height="${tbh}"/>`
      + `<line x1="${W - 10 - tbw}" y1="${H - 10 - tbh / 2}" x2="${W - 10}" y2="${H - 10 - tbh / 2}"/>`
      + `<text x="${W - tbw}" y="${H - 10 - tbh / 2 - 9}" class="tb-l">SHEET</text><text x="${W - tbw + 50}" y="${H - 10 - tbh / 2 - 9}" class="tb-v">${esc(doc.name)}</text>`
      + `<text x="${W - tbw}" y="${H - 19}" class="tb-l">LANGUAGE</text><text x="${W - tbw + 70}" y="${H - 19}" class="tb-v">${doc.lang.toUpperCase()}</text>`
      + `<text x="${W - 20}" y="${H - 19}" class="tb-l" text-anchor="end">Silinx</text></g>`
      // the sheet description (Schematic Wizard / sheet properties), top left
      + (String(doc.description || '').trim() ? `<text class="se-desc" x="30" y="40">${String(doc.description).trim().split(/\r?\n/).map((l, i) => `<tspan x="30" dy="${i ? 16 : 0}">${esc(l)}</tspan>`).join('')}</text>` : '');
  }
  function render() {
    if (state().destroyed) return;
    refreshNetlist();
    const { doc, nl, sel, live, modules, showHops, showNames } = state();
    renderSheet();
    const parts = [];
    const busW = new Map();
    if (nl) for (const [wid, n] of nl.wireNet) busW.set(wid, n.width);
    // wires (Hop-overs: the crossings of each, by segment, #692)
    let hops = null;
    if (showHops) {
      hops = new Map();
      for (const c of wireCrossings(doc)) { let m = hops.get(c.wire); if (!m) hops.set(c.wire, m = new Map()); let l = m.get(c.seg); if (!l) m.set(c.seg, l = []); l.push(c.x); }
    }
    for (const w of doc.wires) {
      const pts = w.points.map(p => `${p.x},${p.y}`).join(' ');
      const bus = w.bus || (busW.get(w.id) || 1) > 1;
      const cls = `wire${bus ? ' bus' : ''}${sel.has(`wire:${w.id}`) ? ' sel' : ''}`;
      const line = hops?.has(w.id) ? `<path class="wline" d="${hopPath(w, hops.get(w.id))}"/>` : `<polyline class="wline" points="${pts}"/>`;
      parts.push(`<g class="${cls}" data-kind="wire" data-id="${esc(w.id)}"><polyline class="whit" points="${pts}"/>${line}</g>`);
    }
    if (nl) for (const j of nl.junctions) parts.push(`<circle class="junction" cx="${j.x}" cy="${j.y}" r="3.2"/>`);
    // a named bus (connected to an input / output marker or labelled) carries its name on every wire
    // of it, over its longest horizontal run (#173); the wires with a label of their own keep that
    if (nl) {
      const labelled = new Set(doc.labels.map(l => nl.labelNet.get(l.id)?.id));
      // (Names: also the 1-bit and the automatic nets, their name once, on their longest run)
      const once = new Set();
      // (a wire split at a tap or a branch, #678: its pieces in line one wire, the name on the longest)
      const run = inLineRuns(doc.wires, w => nl.wireNet.get(w.id)?.id), runNamed = new Set();
      for (const w of [...doc.wires].sort((a, b) => wireRun(b) - wireRun(a))) {
        const n = nl.wireNet.get(w.id);
        if (!n || !n.name || labelled.has(n.id)) continue;
        const named = !n.auto && n.width > 1;
        if (!named && (!showNames || once.has(n.id))) continue;
        if (runNamed.has(run.get(w.id))) continue;
        runNamed.add(run.get(w.id));
        let best = null;
        for (let i = 0; i + 1 < w.points.length; i++) {
          const a = w.points[i], b = w.points[i + 1];
          const len = a.y === b.y ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y) * 0.5;   // (horizontal runs first)
          if (!best || len > best.len) best = { a, b, len };
        }
        if (!best || best.len < 30) continue;
        // (near the start of the run, clear of the taps and pins further on)
        const hz = best.a.y === best.b.y;
        const x = hz ? Math.min(best.a.x, best.b.x) + 12 : best.a.x + 4, y = hz ? best.a.y - 4 : Math.min(best.a.y, best.b.y) + 16;
        if (!named) once.add(n.id);
        parts.push(`<text class="busname${named ? '' : ' netname'}" x="${x}" y="${y}" text-anchor="start">${esc(n.width > 1 ? `${n.name}(${n.width - 1}:0)` : n.name)}</text>`);
      }
    }
    // symbols
    for (const s of doc.symbols) {
      let def;
      try { def = symbolDef(s, modules); } catch { continue; }
      const tapped = s.type === 'slice' ? nl?.pinNet.get(`${s.id}/I`) : null;
      parts.push(symbolSvg(s, def, sel.has(`sym:${s.id}`) ? ' sel' : '', { busName: tapped && !tapped.auto ? tapped.name : '', allNames: showNames }));
    }
    for (const p of doc.ports) parts.push(portSvg(p, sel.has(`port:${p.id}`) ? ' sel' : ''));
    for (const l of doc.labels) {
      const n = nl?.labelNet.get(l.id);
      const bus = n && n.width > 1 && !parseNetName(l.net).width ? `(${n.width - 1}:0)` : '';
      parts.push(`<g class="label${sel.has(`label:${l.id}`) ? ' sel' : ''}" data-kind="label" data-id="${esc(l.id)}"><text x="${l.x + 2}" y="${l.y - 4}">${esc(l.net)}${bus}</text><rect class="hitbox" x="${l.x}" y="${l.y - 14}" width="${Math.max(16, (l.net.length + bus.length) * 6.5 + 4)}" height="14"/><circle class="lpt" cx="${l.x}" cy="${l.y}" r="1.6"/></g>`);
    }
    // unconnected pin markers
    if (nl) {
      for (const s of doc.symbols) {
        for (const p of symbolPins(s, modules)) {
          const n = nl.pinNet.get(`${s.id}/${p.name}`);
          if (!n || (n.endpoints.length + n.wires.length + n.labels.length) <= 1) parts.push(`<rect class="nc" x="${p.x - 2.5}" y="${p.y - 2.5}" width="5" height="5"/>`);
        }
      }
    }
    contentG.innerHTML = parts.join('');
    renderOverlay();
    updateToolbar();
    updateStatus();
    if (live) live.update(true);
  }
  function renderOverlay() {
    const { tool, placing, modules, cursor, wireDraw, hoverPin, drag } = state();
    let s = '';
    if (tool === 'place' && placing) {
      const g = { id: 'ghost', type: placing.type, x: 0, y: 0, rot: placing.rot, mirror: placing.mirror, name: '', params: placing.params };
      const def = symbolDef(g, modules);
      const sz = rotSize(g, def);
      g.x = snap(cursor.x - sz.w / 2); g.y = snap(cursor.y - sz.h / 2);
      s += `<g class="ghost">${symbolSvg(g, def)}</g>`;
    }
    if (tool === 'wire' && wireDraw) {
      const pts = [...wireDraw.pts, ...routeTo(wireDraw.pts[wireDraw.pts.length - 1], snapPoint(cursor), wireDraw)];
      s += `<polyline class="wire-preview" points="${pts.map(p => `${p.x},${p.y}`).join(' ')}"/>`;
    }
    // a freehand stroke (#1052): its ink trail
    if (drag?.kind === 'stroke' && drag.inking) s += `<polyline class="wire-ink" points="${drag.ink.map(p => `${p.x},${p.y}`).join(' ')}"/>`;
    if ((tool === 'wire' || tool === 'io' || tool === 'net') && hoverPin) s += `<rect class="pinhover" x="${hoverPin.x - 4}" y="${hoverPin.y - 4}" width="8" height="8"/>`;
    if (tool === 'wire' || tool === 'io') { const c = snapPoint(cursor); s += `<path class="xhair" d="M${c.x - 6},${c.y} H${c.x + 6} M${c.x},${c.y - 6} V${c.y + 6}"/>`; }
    if (drag && drag.kind === 'band') {
      const r = bandRect();
      s += `<rect class="band" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`;
    }
    overlayG.innerHTML = s;
  }
  function updateToolbar() {
    const { live, tool, sel } = state();
    tb.querySelectorAll('[data-act]').forEach(b => b.classList.toggle('on', live ? b.dataset.act === 'sim' : b.dataset.act === tool));
    tb.querySelector('[data-act="undo"]').disabled = !undoStack.length;
    tb.querySelector('[data-act="redo"]').disabled = !redoStack.length;
    const any = sel.size > 0;
    tb.querySelector('[data-act="delete"]').disabled = !any;
    const symSel = [...sel].some(k => k.startsWith('sym:') || k.startsWith('port:')) || (tool === 'place');
    tb.querySelector('[data-act="rotate"]').disabled = !symSel;
    tb.querySelector('[data-act="mirror"]').disabled = !symSel;
    tb.querySelector('[data-act="info"]').disabled = !infoTarget();
  }
  const TOOL_HINT = {
    select: 'Click to select, drag to move (connected wires follow), drag on empty space to select a region. Double-click a module to open it.',
    wire: 'Add Wire: click to start, click to add a bend, click on a pin/wire or double-click to finish; or draw a stroke from a pin/wire to another. Esc ends the wire.',
    net: 'Add Net Name: type a name, then click a wire to attach it.',
    io: 'Add I/O Marker: click a wire end, a pin or empty space to add a port marker (a wire to its tip connects it later).',
    place: 'Click to place the symbol (Ctrl+R rotate, Ctrl+M mirror). Esc to stop placing.',
  };
  function updateStatus() {
    const { doc, nl, live, tool, lastDiags, cursor, view } = state();
    const n = doc.symbols.length;
    const tip = live ? 'Trying it out: click the inputs (switches, bus values, clocks), hover a wire or pin to see its value, drag to pan. Esc stops.' : readOnly ? 'Read-only view. Drag on empty space to select, double-click a module to open it, wheel to zoom.' : (TOOL_HINT[tool] || '');
    const d = lastDiags ? ` · ${lastDiags.filter(x => x.severity === 'error').length} error(s), ${lastDiags.filter(x => x.severity === 'warning').length} warning(s)` : '';
    status.innerHTML = `<span class="hint">${esc(tip)}</span><span class="sp"></span><span>${n} symbol${n === 1 ? '' : 's'}, ${nl ? nl.nets.length : 0} nets${d}</span><span class="xy">X ${snap(cursor.x)} Y ${snap(cursor.y)}</span><span class="zoom">${Math.round(view.s * 100)}%</span>`;
  }

  return { renderSheet, render, renderOverlay, updateToolbar, updateStatus };
}

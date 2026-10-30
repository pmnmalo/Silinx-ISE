// UI: the schematic editor's drawing of its document (web/js/sch-render.js, #405: out of mountSchEditor), mounted
// alone in the page on an SVG of its own with the editor's state given: the sheet and its title block, the wires (a bus,
// the selection, the junctions, a bus's name), the symbols, I/O markers and net names, the unconnected pins; the
// overlay of each tool; the toolbar's state; the status line (read-only, live, the check's counts).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// an inverter U1 between the I/O markers A (in) and Y (out), each joined by a wire; a 4-bit bus D (a marker, a wire and
// a net name) to nothing; an AND2 U2 with no wire (its 3 pins unconnected)
const MOUNT = async () => {
  const { mountRender } = await import('/js/sch-render.js');
  const { mountSchCurve } = await import('/js/sch-curve.js');
  const { normalizeDoc, symbolPins, netlist } = await import('/core/schdoc.js');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.innerHTML = '<g class="se-sheet"></g><g class="se-content"></g><g class="se-overlay"></g>';
  const tb = document.createElement('div'), status = document.createElement('div');
  tb.innerHTML = ['select', 'wire', 'net', 'io', 'place', 'sim', 'undo', 'redo', 'delete', 'rotate', 'mirror', 'mirrorv'].map((a) => `<button data-act="${a}"></button>`).join('');
  document.body.append(svg, tb, status);
  const inv = { id: 'S1', type: 'inv', name: 'U1', x: 200, y: 100 };
  const [I, O] = symbolPins(normalizeDoc({ symbols: [inv] }).symbols[0]);
  const doc = normalizeDoc({ name: 'top', lang: 'verilog', symbols: [inv, { id: 'S2', type: 'and2', name: 'U2', x: 400, y: 300 }],
    ports: [{ id: 'P1', name: 'A', dir: 'in', x: I.x - 60, y: I.y }, { id: 'P2', name: 'Y', dir: 'out', x: O.x + 60, y: O.y },
      { id: 'P3', name: 'D', dir: 'in', width: 4, x: 100, y: 500 }],
    wires: [{ id: 'W1', points: [{ x: I.x - 60, y: I.y }, { x: I.x, y: I.y }] }, { id: 'W2', points: [{ x: O.x, y: O.y }, { x: O.x + 60, y: O.y }] },
      { id: 'W3', points: [{ x: 100, y: 500 }, { x: 300, y: 500 }] }],
    labels: [{ id: 'L1', x: 300, y: 500, net: 'D' }] });
  const st = { doc, nl: null, sel: new Set(['wire:W3', 'sym:S1']), tool: 'select', placing: null, drag: null, wireDraw: null, cursor: { x: 123, y: 456 },
    hoverPin: null, lastDiags: null, live: null, modules: {}, view: { s: 1.5 }, destroyed: false, showHops: true, showNames: false };
  const undoStack = [], redoStack = ['x'];
  // (curved wires, #1144: the editor's, on this state)
  const curve = mountSchCurve({ doc: () => st.doc, sel: () => st.sel, view: () => st.view, readOnly: false, edit: (fn) => fn(), render: () => {}, renderProps: () => {}, snapshot: () => '', pushUndo: () => {}, changed: () => {} });
  const r = mountRender({ curve, segSel: { current: () => null }, state: () => st, refreshNetlist: () => { st.nl = netlist(st.doc); }, uidE: 7, readOnly: false,
    sheetG: svg.querySelector('.se-sheet'), contentG: svg.querySelector('.se-content'), overlayG: svg.querySelector('.se-overlay'), tb, status,
    undoStack, redoStack, routeTo: (a, b) => [{ x: b.x, y: a.y }, b], snapPoint: (p) => ({ x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 }),
    bandRect: () => ({ x: 10, y: 20, w: 30, h: 40 }) });
  const q = (s) => [...svg.querySelectorAll(s)];
  const off = (a) => tb.querySelector(`[data-act="${a}"]`).disabled;
  const on = () => [...tb.querySelectorAll('.on')].map((b) => b.dataset.act);
  window.__r = { r, st, q, off, on, status, svg, curve };
  return true;
};

uiTest('#405 schematic drawing: the sheet, the wires, symbols, markers and names, the unconnected pins; the toolbar; the status', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { r, st, q, off, on, status, svg } = window.__r;
    const o = {};
    r.render();
    o.sheet = [svg.querySelector('.se-sheet .tb-v').textContent, q('.se-sheet .tb-v')[1].textContent, svg.querySelector('.gridfill').getAttribute('fill')];
    o.wires = q('.se-content g[data-kind=wire]').map((g) => `${g.dataset.id}:${g.getAttribute('class')}`);
    o.syms = q('.se-content g[data-kind=sym]').map((g) => `${g.dataset.id}:${g.getAttribute('class')}`);
    o.ports = q('.se-content g[data-kind=port] .ioname').map((t) => t.textContent);
    o.labels = q('.se-content g[data-kind=label] text').map((t) => t.textContent);
    o.nc = q('.se-content .nc').length;
    o.toolbar = [on(), off('undo'), off('redo'), off('delete'), off('rotate'), off('mirrorv')];
    o.status = status.textContent;
    // nothing selected, the check's counts, read-only is not in the hint (the editor's flag), a live simulation's
    st.sel = new Set(); st.lastDiags = [{ severity: 'error' }, { severity: 'warning' }, { severity: 'warning' }];
    r.render();
    o.toolbar2 = [off('delete'), off('rotate'), off('mirrorv')];
    o.status2 = status.textContent;
    let updated = 0;
    st.live = { update: (full) => { updated += full ? 1 : 0; } };
    r.render();
    o.live = [updated, on(), /^Trying it out/.test(status.textContent)];
    st.live = null;
    // destroyed: not drawn
    st.destroyed = true; st.doc = { ...st.doc, symbols: [] };
    r.render();
    o.destroyed = q('.se-content g[data-kind=sym]').length;
    return o;
  });
  assert.deepEqual(out.sheet, ['top', 'VERILOG', 'url(#se-grid-7)']);
  assert.deepEqual(out.wires, ['W1:wire', 'W2:wire', 'W3:wire bus sel']);
  assert.deepEqual(out.syms, ['S1:sym sel', 'S2:sym']);
  assert.deepEqual(out.ports, ['A', 'Y', 'D(3:0)']);
  assert.deepEqual(out.labels, ['D(3:0)']);   // (the net's width after a name given without it)
  assert.equal(out.nc, 3);
  assert.deepEqual(out.toolbar, [['select'], true, false, false, false, false]);
  // (6 nets: A, Y, D and the 3 pins of U2, each a net of its own)
  assert.match(out.status, /^Click to select, drag to move.*2 symbols, 6 nets\s*X 120 Y 460\s*150%$/);
  assert.deepEqual(out.toolbar2, [true, true, true]);
  assert.match(out.status2, /2 symbols, 6 nets · 1 error\(s\), 2 warning\(s\)/);
  assert.deepEqual(out.live, [1, ['sim'], true]);
  assert.equal(out.destroyed, 2);
});

uiTest('#405 schematic drawing: the overlay of each tool (a symbol placed, a wire drawn, the pin under the pointer, the band)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { r, st, q, off, on } = window.__r;
    const o = {};
    const overlay = () => q('.se-overlay > *').map((e) => e.getAttribute('class'));
    st.tool = 'place'; st.placing = { type: 'and2', params: {}, rot: 0, mirror: false };
    r.render();
    o.place = [overlay(), on(), off('rotate')];
    st.tool = 'wire'; st.wireDraw = { pts: [{ x: 0, y: 0 }] }; st.hoverPin = { x: 50, y: 60 };
    r.renderOverlay();
    o.wire = overlay();
    o.preview = q('.wire-preview')[0].getAttribute('points');
    st.tool = 'net';
    r.renderOverlay();
    o.net = overlay();
    st.tool = 'select'; st.hoverPin = null; st.drag = { kind: 'band' };
    r.renderOverlay();
    o.band = [overlay(), q('.band')[0].getAttribute('width')];
    return o;
  });
  assert.deepEqual(out.place, [['ghost'], ['place'], false]);
  assert.deepEqual(out.wire, ['wire-preview', 'pinhover', 'xhair']);
  assert.equal(out.preview, '0,0 120,0 120,460');
  assert.deepEqual(out.net, ['pinhover']);
  assert.deepEqual(out.band, [['band'], '30']);
});

uiTest('#1144 schematic drawing: Curved wires: each wire its curve (core/schcurve.js), no hops, the net name on the curve, the selected wire\'s handles, the box ticked, the curve previewed', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(async () => {
    const C = await import('/core/schcurve.js');
    const { r, st, q, curve } = window.__r;
    const o = {};
    st.doc.wireStyle = 'curved';
    C.setCurve(st.doc.wires.find((w) => w.id === 'W3'), [{ x: 200, y: 450 }]);
    st.sel = new Set(['wire:W3']);
    r.render();
    o.wires = q('.se-content g[data-kind=wire]').map((g) => [g.dataset.id, g.querySelector('.wline').tagName, g.querySelector('.wline').getAttribute('d') === C.curveD(st.doc.wires.find((w) => w.id === g.dataset.id)), g.querySelector('.whit').getAttribute('d') === g.querySelector('.wline').getAttribute('d')]);
    o.handles = q('.se-content .chandle .cdot').map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
    o.box = curve.box.checked;
    // the net name L1 at W3's end (300, 500): on the curve's end, the same point
    o.label = q('.se-content g[data-kind=label] .lpt').map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
    // a net name in the middle of W3's path: drawn on its curve, at the same fraction of its length
    st.doc.labels[0].x = 200;
    r.render();
    const m = C.curvePointAt(st.doc.wires.find((w) => w.id === 'W3'), 0.5);
    o.mid = q('.se-content g[data-kind=label] .lpt').map((c) => Math.hypot(+c.getAttribute('cx') - m.x, +c.getAttribute('cy') - m.y) < 0.2);
    st.tool = 'wire'; st.wireDraw = { pts: [{ x: 0, y: 0 }, { x: 40, y: -30 }] }; st.cursor = { x: 120, y: 0 };
    r.renderOverlay();
    // (the points drawn and the route to the cursor, this test's routeTo: a corner)
    o.preview = q('.wire-preview').map((e) => [e.tagName, e.getAttribute('d') === curve.previewD([{ x: 0, y: 0 }, { x: 40, y: -30 }, { x: 120, y: -30 }, { x: 120, y: 0 }])]);
    // unticked: polylines, no handles, the box unticked
    delete st.doc.wireStyle; st.tool = 'select'; st.wireDraw = null;
    r.render();
    o.plain = [q('.se-content .wline').map((e) => e.tagName), q('.se-content .chandle').length, curve.box.checked];
    return o;
  });
  assert.deepEqual(out.wires, [['W1', 'path', true, true], ['W2', 'path', true, true], ['W3', 'path', true, true]]);
  assert.deepEqual(out.handles, [[200, 450]]);
  assert.equal(out.box, true);
  assert.deepEqual(out.label, [[300, 500]]);
  assert.deepEqual(out.mid, [true]);
  assert.deepEqual(out.preview, [['path', true]]);
  assert.deepEqual(out.plain, [['polyline', 'polyline', 'polyline'], 0, false]);
});

// A schematic's graphics (#2593, core/schgraphics.js): drawings with no function (text, line, rectangle, circle, arc)
// kept by the document, ignored by the netlist and the HDL, copied and pasted, their size set for several texts at
// once, read from and written to an ISE schematic's sheet (core/isesch-graphics.js). The arcs' geometry is checked
// against points sampled along them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_SIZE, arcCircle, graphicBox, graphicDistance, graphicPath, graphicSvg, moveGraphic, normalizeGraphic, textBox
} from '../core/schgraphics.js';
import { generateHdl, netlist, newDoc, normalizeDoc } from '../core/schdoc.js';
import { clipEmpty, copySchematic, pasteOffset, pasteSchematic } from '../core/schclip.js';
import { applyProp, commonProps } from '../core/schmulti.js';
import { exportIseSch, importIseSch, parseIseSch } from '../core/isesch.js';
import { graphicsFromIse, graphicsToIse, iseGraphic } from '../core/isesch-graphics.js';

// the points of an arc (from its first point through its second to its third), sampled along its circle: the
// reference its box, its distance and its path are checked against
function sampleArc(g, n = 2000) {
  const { x1, y1, x2, y2, x3, y3 } = g;
  // (the centre by perpendicular bisectors, solved with Cramer's rule)
  const a1 = 2 * (x2 - x1), b1 = 2 * (y2 - y1), c1 = x2 * x2 - x1 * x1 + y2 * y2 - y1 * y1;
  const a2 = 2 * (x3 - x2), b2 = 2 * (y3 - y2), c2 = x3 * x3 - x2 * x2 + y3 * y3 - y2 * y2;
  const det = a1 * b2 - a2 * b1;
  const cx = (c1 * b2 - c2 * b1) / det, cy = (a1 * c2 - a2 * c1) / det, r = Math.hypot(x1 - cx, y1 - cy);
  const at = (x, y) => Math.atan2(y - cy, x - cx), T = 2 * Math.PI, norm = v => ((v % T) + T) % T;
  const s = at(x1, y1), m = norm(at(x2, y2) - s), e = norm(at(x3, y3) - s);
  // (the way round that passes the middle point)
  const span = m < e ? e : e - T;
  return Array.from({ length: n + 1 }, (_, i) => { const a = s + span * i / n; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; });
}
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('#2593 normalizeGraphic: each kind kept with its coordinates (integers); nothing of no size, an empty text, an unknown kind', () => {
  assert.deepEqual(normalizeGraphic({ id: 'a', kind: 'line', x1: 10.4, y1: '20', x2: 30, y2: 40, extra: 1 }), { id: 'a', kind: 'line', x1: 10, y1: 20, x2: 30, y2: 40 });
  assert.deepEqual(normalizeGraphic({ id: 'b', kind: 'circle', cx: 5, cy: 6, r: -7 }), { id: 'b', kind: 'circle', cx: 5, cy: 6, r: 7 });
  assert.deepEqual(normalizeGraphic({ id: 'c', kind: 'arc', x1: 0, y1: 0, x2: 10, y2: 10, x3: 20, y3: 0 }), { id: 'c', kind: 'arc', x1: 0, y1: 0, x2: 10, y2: 10, x3: 20, y3: 0 });
  // a rectangle dragged up and to the left: its top left corner, a positive size
  assert.deepEqual(normalizeGraphic({ id: 'd', kind: 'rect', x: 100, y: 80, w: -60, h: -30 }), { id: 'd', kind: 'rect', x: 40, y: 50, w: 60, h: 30 });
  // a text: its line ends, its size clamped (the default one not written)
  assert.deepEqual(normalizeGraphic({ id: 'e', kind: 'text', x: 1, y: 2, text: '\r\nfirst\r\nsecond  \n' }), { id: 'e', kind: 'text', x: 1, y: 2, text: 'first\nsecond' });
  assert.equal(normalizeGraphic({ kind: 'text', x: 0, y: 0, text: 'a', size: 200 }).size, 72);
  assert.equal(normalizeGraphic({ kind: 'text', x: 0, y: 0, text: 'a', size: 2 }).size, 8);
  assert.equal('size' in normalizeGraphic({ kind: 'text', x: 0, y: 0, text: 'a', size: TEXT_SIZE }), false);
  for (const g of [{ kind: 'text', text: '  \n ' }, { kind: 'line', x1: 5, y1: 5, x2: 5, y2: 5 }, { kind: 'rect', x: 1, y: 1, w: 0, h: 0 },
    { kind: 'circle', cx: 1, cy: 1, r: 0 }, { kind: 'arc', x1: 1, y1: 1, x2: 4, y2: 4, x3: 1, y3: 1 }, { kind: 'polygon' }, null, 'x']) {
    assert.equal(normalizeGraphic(g), null, JSON.stringify(g));
  }
});

test('#2593 normalizeDoc keeps the graphics with ids unique in the document; none: no graphics key; the netlist and the HDL ignore them', () => {
  const d = newDoc('ann', 'vhdl');
  d.symbols.push({ id: 'G1', type: 'inv', x: 200, y: 200 });
  d.ports.push({ id: 'P1', name: 'a', dir: 'in', x: 180, y: 220 });
  const plain = normalizeDoc(d);
  assert.equal('graphics' in plain, false);
  const drawn = normalizeDoc({ ...d, graphics: [{ id: 'G1', kind: 'rect', x: 100, y: 100, w: 300, h: 200 }, { kind: 'text', x: 110, y: 120, text: 'the inverter' }, { kind: 'bogus' }] });
  assert.deepEqual(drawn.graphics.map(g => [g.id, g.kind]), [['G3', 'rect'], ['G4', 'text']]);   // (G1: the symbol's, a fresh one after the ids taken)
  assert.deepEqual(normalizeDoc({ ...d, graphics: [] }).graphics, undefined);
  // a drawing over the inverter's pins connects nothing: the same nets, the same HDL, the same check
  const nets = n => n.nets.map(x => [x.name, x.width, x.endpoints.length]);
  assert.deepEqual(nets(netlist(drawn)), nets(netlist(plain)));
  assert.deepEqual(netlist(drawn).diagnostics, netlist(plain).diagnostics);
  for (const lang of ['vhdl', 'verilog']) assert.equal(generateHdl(drawn, { lang }).text, generateHdl(plain, { lang }).text);
});

test('#2593 arcCircle and graphicPath: the circle through the three points, the arc drawn the way round that passes the middle one', () => {
  const below = { kind: 'arc', x1: 0, y1: 0, x2: 10, y2: 10, x3: 20, y3: 0 };
  assert.deepEqual(arcCircle(below), { cx: 10, cy: 0, r: 10, sweep: 0 });
  assert.equal(graphicPath(below), 'M0,0 A10,10 0 0,0 20,0');
  assert.equal(graphicPath({ ...below, y2: -10 }), 'M0,0 A10,10 0 0,1 20,0');
  // more than half the circle: the large arc
  assert.equal(graphicPath({ ...below, y2: 20 }), 'M0,0 A12.5,12.5 0 1,0 20,0');
  // in line: a straight line
  assert.equal(arcCircle({ kind: 'arc', x1: 0, y1: 0, x2: 5, y2: 5, x3: 10, y3: 10 }), null);
  assert.equal(graphicPath({ kind: 'arc', x1: 0, y1: 0, x2: 5, y2: 5, x3: 10, y3: 10 }), 'M0,0 L10,10');
  // every arc's three points on its circle (an independent check of the centre)
  for (const g of [below, { kind: 'arc', x1: 30, y1: 70, x2: 90, y2: 10, x3: 140, y3: 60 }, { kind: 'arc', x1: 0, y1: 0, x2: -30, y2: 40, x3: 10, y3: 90 }]) {
    const c = arcCircle(g);
    for (const [x, y] of [[g.x1, g.y1], [g.x2, g.y2], [g.x3, g.y3]]) near(Math.hypot(x - c.cx, y - c.cy), c.r, 1e-9);
  }
});

test('#2593 graphicBox and graphicDistance against the arc sampled along its circle', () => {
  const arcs = [
    { kind: 'arc', x1: 0, y1: 0, x2: 10, y2: 10, x3: 20, y3: 0 },
    { kind: 'arc', x1: 0, y1: 0, x2: 10, y2: 20, x3: 20, y3: 0 },
    { kind: 'arc', x1: 30, y1: 70, x2: 90, y2: 10, x3: 140, y3: 60 },
    { kind: 'arc', x1: 100, y1: 0, x2: 0, y2: 100, x3: -100, y3: 0 },
    { kind: 'arc', x1: 0, y1: 0, x2: -30, y2: 40, x3: 10, y3: 90 },
  ];
  for (const g of arcs) {
    const pts = sampleArc(g);
    const b = graphicBox(g), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    near(b.x, Math.min(...xs)); near(b.y, Math.min(...ys)); near(b.x + b.w, Math.max(...xs)); near(b.y + b.h, Math.max(...ys));
    for (const q of [{ x: 5, y: 5 }, { x: 50, y: -40 }, { x: 0, y: 60 }, { x: 120, y: 120 }]) {
      near(graphicDistance(g, q.x, q.y), Math.min(...pts.map(p => Math.hypot(p.x - q.x, p.y - q.y))), 0.2);
    }
  }
  const rect = { kind: 'rect', x: 10, y: 10, w: 100, h: 50 };
  assert.deepEqual(graphicBox(rect), { x: 10, y: 10, w: 100, h: 50 });
  assert.equal(graphicDistance(rect, 60, 35), 25);   // (inside: to its nearest side; its inside does not pick it)
  assert.equal(graphicDistance(rect, 60, 5), 5);
  assert.equal(graphicDistance({ kind: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }, 50, 7), 7);
  assert.equal(graphicDistance({ kind: 'circle', cx: 0, cy: 0, r: 50 }, 30, 40), 0);
  assert.deepEqual(graphicBox({ kind: 'circle', cx: 50, cy: 60, r: 20 }), { x: 30, y: 40, w: 40, h: 40 });
  const text = { kind: 'text', x: 100, y: 100, text: 'ab\nabcd', size: 10 };
  assert.deepEqual(textBox(text), { lines: ['ab', 'abcd'], size: 10, lh: 13, x: 100, y: 90, w: 24, h: 25 });
  assert.equal(graphicDistance(text, 110, 100), 0);
});

test('#2593 moveGraphic moves every point of each kind, not a size or a radius; the original kept', () => {
  const cases = [
    [{ kind: 'text', x: 1, y: 2, text: 't' }, { kind: 'text', x: 11, y: -3, text: 't' }],
    [{ kind: 'line', x1: 1, y1: 2, x2: 3, y2: 4 }, { kind: 'line', x1: 11, y1: -3, x2: 13, y2: -1 }],
    [{ kind: 'rect', x: 1, y: 2, w: 30, h: 40 }, { kind: 'rect', x: 11, y: -3, w: 30, h: 40 }],
    [{ kind: 'circle', cx: 1, cy: 2, r: 9 }, { kind: 'circle', cx: 11, cy: -3, r: 9 }],
    [{ kind: 'arc', x1: 1, y1: 2, x2: 3, y2: 4, x3: 5, y3: 6 }, { kind: 'arc', x1: 11, y1: -3, x2: 13, y2: -1, x3: 15, y3: 1 }],
  ];
  for (const [g, want] of cases) {
    const before = JSON.stringify(g);
    assert.deepEqual(moveGraphic(g, 10, -5), want);
    assert.equal(JSON.stringify(g), before);
  }
});

test('#2593 graphicSvg: a group to pick it by (data-kind graphic), its text escaped, a line per tspan', () => {
  assert.equal(graphicSvg({ id: 'G1', kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, ' sel'),
    '<g class="graphic g-line sel" data-kind="graphic" data-id="G1"><path class="ghit" d="M0,0 L10,0"/><path class="gline" d="M0,0 L10,0"/></g>');
  const s = graphicSvg({ id: 'G"2', kind: 'text', x: 10, y: 20, text: '<b>a</b> & b\nsecond', size: 10 });
  assert.equal(s, '<g class="graphic g-text" data-kind="graphic" data-id="G&quot;2"><rect class="hitbox" x="10" y="10" width="72" height="25"/>'
    + '<text class="gtext" x="10" y="20" style="font-size:10px"><tspan x="10" dy="0">&lt;b&gt;a&lt;/b&gt; &amp; b</tspan><tspan x="10" dy="13">second</tspan></text></g>');
});

test('#2593 copy and paste: the drawings selected copied as they are, pasted offset with fresh ids; a clipboard of drawings only is not empty', () => {
  const doc = normalizeDoc({ ...newDoc('c'), graphics: [{ id: 'G1', kind: 'rect', x: 100, y: 100, w: 80, h: 40 }, { id: 'G2', kind: 'text', x: 110, y: 130, text: 'note' }, { id: 'G3', kind: 'line', x1: 0, y1: 0, x2: 50, y2: 0 }] });
  const clip = copySchematic(doc, { graphics: ['G1', 'G2'] });
  assert.deepEqual(clip.graphics, [{ id: 'G1', kind: 'rect', x: 100, y: 100, w: 80, h: 40 }, { id: 'G2', kind: 'text', x: 110, y: 130, text: 'note' }]);
  assert.equal(clipEmpty(clip), false);
  assert.equal('graphics' in copySchematic(doc, { graphics: [] }), false);
  const { ids } = pasteSchematic(doc, clip, { dx: 40, dy: 20 });
  assert.deepEqual(ids, { symbols: [], wires: [], ports: [], labels: [], graphics: ['G4', 'G5'] });
  assert.deepEqual(doc.graphics.slice(3), [{ id: 'G4', kind: 'rect', x: 140, y: 120, w: 80, h: 40 }, { id: 'G5', kind: 'text', x: 150, y: 150, text: 'note' }]);
  // into a sheet with no drawings; where it goes centred on the pointer: by the drawings' box
  const other = normalizeDoc(newDoc('o'));
  assert.deepEqual(pasteOffset(other, clip, { at: { x: 500, y: 500 } }), { dx: 360, dy: 380 });
  pasteSchematic(other, clip, { dx: 0, dy: 0 });
  assert.deepEqual(normalizeDoc(other).graphics.map(g => g.id), ['G1', 'G2']);
});

test('#2593 several texts selected: their size set at once (clamped); a shape has no size', () => {
  const doc = normalizeDoc({ ...newDoc('m'), graphics: [{ id: 'G1', kind: 'text', x: 0, y: 0, text: 'a' }, { id: 'G2', kind: 'text', x: 0, y: 50, text: 'b', size: 20 }, { id: 'G3', kind: 'rect', x: 0, y: 0, w: 10, h: 10 }] });
  assert.deepEqual(commonProps(doc, ['graphic:G1', 'graphic:G2']).map(f => [f.key, f.value, f.mixed]), [['size', null, true]]);
  assert.deepEqual(commonProps(doc, ['graphic:G1', 'graphic:G3']), []);
  assert.equal(applyProp(doc, ['graphic:G1', 'graphic:G2', 'graphic:G3'], 'size', 300), 2);
  assert.deepEqual(doc.graphics.map(g => g.size), [72, 72, undefined]);
});

test('#2593 ISE: the sheet\'s texts and drawings read (their font size), an arc made of three points the way ISE draws it', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<drawing version="7">
    <netlist />
    <sheet sheetnum="1" width="3520" height="2720">
        <text style="fontsize:40;fontname:Arial" x="320" y="320">A note &amp; more</text>
        <rect width="960" x="256" y="192" height="320" />
        <line x2="1280" y1="1280" y2="1280" x1="256" />
        <circle r="128" cx="1600" cy="960" />
        <arc ex="144" ey="-144" sx="144" sy="-48" r="48" cx="144" cy="-96" />
    </sheet>
</drawing>`;
  const m = parseIseSch(xml);
  assert.deepEqual(m.sheets[0].graphics, [
    { kind: 'text', x: 320, y: 320, text: 'A note & more', size: 40 },
    { kind: 'rect', x: 256, y: 192, w: 960, h: 320 },
    { kind: 'line', x1: 256, y1: 1280, x2: 1280, y2: 1280 },
    { kind: 'circle', cx: 1600, cy: 960, r: 128 },
    { kind: 'arc', cx: 144, cy: -96, r: 48, sx: 144, sy: -48, ex: 144, ey: -144 },
  ]);
  assert.deepEqual(iseGraphic('text', { x: '1', y: '2' }, ' t '), { kind: 'text', x: 1, y: 2, text: 't' });
  // placed by the import's maps (here the identity, sizes as they are): the AND gate's arc through its right side
  const g = graphicsFromIse(m, (s, x) => x, (s, y) => y, 1);
  assert.deepEqual(g[4], { id: 'G5', kind: 'arc', x1: 144, y1: -48, x2: 192, y2: -96, x3: 144, y3: -144 });
  assert.deepEqual(g[0], { id: 'G1', kind: 'text', x: 320, y: 320, text: 'A note & more', size: 40 });
  // written back as ISE has it
  assert.deepEqual(graphicsToIse(g, v => Math.round(v), ''), [
    '<text style="fontsize:40;fontname:Arial" x="320" y="320">A note &amp; more</text>',
    '<rect width="960" x="256" y="192" height="320" />',
    '<line x2="1280" y1="1280" y2="1280" x1="256" />',
    '<circle r="128" cx="1600" cy="960" />',
    '<arc ex="144" ey="-144" sx="144" sy="-48" r="48" cx="144" cy="-96" />',
  ]);
  // an arc of Silinx's the other way round: written from its end
  assert.deepEqual(graphicsToIse([{ kind: 'arc', x1: 144, y1: -144, x2: 192, y2: -96, x3: 144, y3: -48 }], v => v, ''), ['<arc ex="144" ey="-144" sx="144" sy="-48" r="48" cx="144" cy="-96" />']);
  // a text of several lines: a text per line
  assert.deepEqual(graphicsToIse([{ kind: 'text', x: 10, y: 20, text: 'one\ntwo', size: 10 }], v => v, ''), [
    '<text style="fontsize:10;fontname:Arial" x="10" y="20">one</text>', '<text style="fontsize:10;fontname:Arial" x="10" y="33">two</text>']);
});

test('#2593 ISE: a schematic\'s drawings exported to its sheet and imported back the same (moved alike), with no warnings', () => {
  const d = newDoc('t');
  d.symbols.push({ id: 'S1', type: 'inv', x: 200, y: 200 });
  d.ports.push({ name: 'a', dir: 'in', x: 150, y: 220 });
  d.graphics = [{ kind: 'text', x: 100, y: 100, text: 'Hello <world>', size: 20 }, { kind: 'rect', x: 80, y: 60, w: 300, h: 100 },
    { kind: 'line', x1: 80, y1: 400, x2: 400, y2: 400 }, { kind: 'circle', cx: 500, cy: 300, r: 40 }, { kind: 'arc', x1: 600, y1: 300, x2: 640, y2: 340, x3: 680, y3: 300 }];
  const doc = normalizeDoc(d);
  const { xml, warnings } = exportIseSch(doc, { timestamp: '2026-1-1T0:0:0' });
  assert.deepEqual(warnings, []);
  const sheet = xml.slice(xml.indexOf('<sheet'));
  assert.ok(sheet.includes('        <text style="fontsize:64;fontname:Arial" x="320" y="320">Hello &lt;world&gt;</text>\n'), sheet);
  assert.ok(sheet.includes('        <arc ex="2176" ey="960" sx="1920" sy="960" r="128" cx="2048" cy="960" />\n'), sheet);
  const r = importIseSch(xml, {});
  assert.deepEqual(r.warnings, []);
  const back = r.doc.graphics;
  assert.deepEqual(back.map(g => g.kind), ['text', 'rect', 'line', 'circle', 'arc']);
  const dx = back[0].x - 100, dy = back[0].y - 100;
  assert.deepEqual(back.map(({ id, ...g }) => g), doc.graphics.map(({ id, ...g }) => moveGraphic(g, dx, dy)));
});

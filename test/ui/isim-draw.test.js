// UI: ISim's rendering (web/js/isim-draw.js, #405: out of mountISim), mounted alone in the page on two canvases of its
// own, with the rows, the view and the colours given and the calls recorded: the names column (the selection, the value
// at the cursor, the forces, the drop line of a drag) and the wave window (a scalar's levels, a bus, the cursor, the
// active marker, the drawn stimuli), read back from the canvases' pixels.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// rows: clk (1 bit: 0, 1 at 1 ns, 0 at 2 ns), q (4 bits: 3, 12 at 2.5 ns; selected and forced), a group, a divider;
// 10 ps a pixel from 0, the cursor at 1.5 ns (x 150), the active marker at 3 ns (x 300), the simulation at 4 ns
const MOUNT = async () => {
  const { mountDraw } = await import('/js/isim-draw.js');
  const V = await import('/core/values.js');
  const cn = document.createElement('canvas'), cw = document.createElement('canvas');
  cn.width = 300; cn.height = 100; cw.width = 400; cw.height = 100;
  document.body.append(cn, cw);
  const logic = (w) => ({ kind: 'logic', w, s: false });
  const clk = { id: 1, name: 'clk', t: logic(1), wave: { t: [0, 1000, 2000], v: [V.ZERO, V.ONE, V.ZERO] } };
  const q = { id: 2, name: 'q', t: { ...logic(4), left: 3, right: 0 }, wave: { t: [0, 2500], v: [V.fromInt(3, 4, false), V.fromInt(12, 4, false)] } };
  const rows = [{ id: 1, kind: 'sig', sig: clk, name: 'clk', radix: 'default' }, { id: 2, kind: 'sig', sig: q, name: 'q', radix: 'hex' },
    { id: 3, kind: 'group', name: 'g', expanded: true }, { id: 4, kind: 'div', name: 'divider' }];
  const flat = rows.map((row) => ({ row, bit: null, key: String(row.id), depth: 0 }));
  const marker = { id: 1, t: 3000 };
  const st = { rows, sel: new Set(['2']), cursor: 1500, markers: [marker], activeMarker: marker, t0: 0, scale: 10, nameW: 180, valW: 120,
    scrollY: 0, stim: { m: null } };
  const sim = { now: 4000, valueAt: (s, t) => V.fromInt(s === q ? (t >= 2500 ? 12 : 3) : 1, s.t.w, false) };
  const colors = { bg: '#000000', grid: '#303030', fg: '#00ff00', x: '#ff0000', z: '#4080ff', text: '#ffffff', cursor: '#ffff00',
    marker: '#00c0ff', names: '#ffffff', accent: '#316ac5', accentFg: '#ffffff', border: '#a0a0a0', borderLight: '#d4d0c8', fgText: '#000000',
    muted: '#6d6d6d', header: '#f0f0f0', head1: '#fbfbfb', head2: '#e3e3e3', rulerFg: '#000000', rulerTick: '#555555', font: 'Arial', mono: 'monospace' };
  const calls = [];
  let dragRow = null;
  const draw = mountDraw({ st, sim, cn, cw, sizes: () => ({ dpr: 1, NW: 300, NH: 100, WW: 400, WH: 100 }), colors: () => colors,
    flat: () => flat, dragRow: () => dragRow, xOf: (t) => (t - st.t0) / st.scale, tOf: (x) => st.t0 + x * st.scale,
    itemWave: (it) => it.row.sig?.wave || null,
    valueOf: (it, t) => { calls.push(['valueOf', it.row.name, t]); return sim.valueAt(it.row.sig, t); },
    itemType: (it) => it.row.sig.t, itemRadix: (it) => it.row.radix,
    isForced: (s) => { calls.push(['isForced', s.name]); return s === q; },
    drawStim: (ctx, first, last) => { calls.push(['drawStim', first, last]); } });
  const px = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3)];
  window.__draw = { draw, st, calls, cn, cw, px, setDrag: (d) => { dragRow = d; } };
  return true;
};

uiTest('#405 ISim rendering: the names column (the selection, the values at the cursor, the forces, the drop line of a drag)', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { draw, calls, cn, px, setDrag } = window.__draw;
    const r = {};
    draw.drawNames();
    r.calls = calls.splice(0);
    r.clkRow = px(cn, 2, 35); // row 0 (y 30 to 50): the names' background
    r.qRow = px(cn, 2, 55); // row 1, selected: the accent
    r.groupRow = px(cn, 100, 70); // row 2 (an even row: not shaded)
    // a drag: the drop line at its y (black, 2 pixels)
    setDrag({ y: 40 });
    draw.drawNames();
    r.drop = px(cn, 100, 70);
    calls.splice(0);
    return r;
  });
  assert.deepEqual(out.calls, [['isForced', 'clk'], ['valueOf', 'clk', 1500], ['isForced', 'q'], ['valueOf', 'q', 1500]]);
  assert.deepEqual(out.clkRow, [255, 255, 255]);
  assert.deepEqual(out.qRow, [0x31, 0x6a, 0xc5]);
  assert.deepEqual(out.groupRow, [255, 255, 255]);
  assert.deepEqual(out.drop, [0, 0, 0]);
});

uiTest('#405 ISim rendering: the wave window (a scalar\'s levels, a bus, the cursor, the active marker, the drawn stimuli); setFont, fitText', E, async (page) => {
  await page.eval(MOUNT);
  const out = await page.eval(() => {
    const { draw, st, calls, cw, px } = window.__draw;
    const r = {};
    draw.drawWaves();
    // clk (row 0, y 30 to 50): low (y 46) before 1 ns, high (y 34) from 1 to 2 ns
    r.clkLow = [px(cw, 50, 46), px(cw, 50, 34)];
    r.clkHigh = [px(cw, 120, 34), px(cw, 120, 46)];
    // q (row 1, selected): the bus's top line
    r.bus = px(cw, 60, 54);
    r.cursor = px(cw, 150, 95);
    r.marker = px(cw, 300, 95);
    r.noStim = calls.filter((c) => c[0] === 'drawStim');
    // the drawn stimuli, over the rows shown
    st.stim.m = {};
    draw.drawWaves();
    r.stim = calls.filter((c) => c[0] === 'drawStim');
    const ctx = cw.getContext('2d');
    draw.setFont(ctx, 11, true);
    r.font = ctx.font;
    r.fit = [draw.fitText(ctx, 'abc', 100), draw.fitText(ctx, 'a much longer label than this', 40).endsWith('…'), draw.fitText(ctx, 'abc', 3)];
    return r;
  });
  assert.deepEqual(out.clkLow, [[0, 255, 0], [0, 0, 0]]);
  assert.deepEqual(out.clkHigh, [[0, 255, 0], [0, 0, 0]]);
  assert.deepEqual(out.bus, [0, 255, 0]);
  assert.deepEqual(out.cursor, [255, 255, 0]);
  assert.deepEqual(out.marker, [0, 0xc0, 255]);
  assert.deepEqual(out.noStim, []);
  assert.deepEqual(out.stim, [['drawStim', 0, 3]]);
  assert.equal(out.font, 'bold 11px Arial');
  assert.deepEqual(out.fit, ['abc', true, '']);
});

// UI: two fingers on a drawing (#674). On a touch screen (an iPad) a two-finger drag pans the view and a
// pinch zooms it about the fingers' centre, in the schematic, ASM chart, state diagram and Petri net
// editors and the waveform viewer, whatever the first finger touched: nothing is selected, moved or
// deselected by it; one finger still selects (a band) as before. Real touch events in Chrome (CDP), the
// touch screen's pointer events in the other browsers (page.touchGesture). No console warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { newDoc } from '../../core/schdoc.js';
import { newFsm } from '../../core/fsm.js';
import { newPetri } from '../../core/petri.js';
import { newModel } from '../../core/asm.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const rectOf = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const plus = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
const warnings = (page) => page.console.filter((m) => /^warn/.test(m.type)).map((m) => m.text);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);
// the view of a drawing: its transform="translate(tx,ty) scale(s)"
const viewOf = (page, sel) => page.eval((s) => {
  const t = document.querySelector(s).getAttribute('transform') || '';
  const n = (t.match(/-?[\d.]+(e-?\d+)?/g) || []).map(Number);
  return { tx: n[0] || 0, ty: n[1] || 0, s: n[2] ?? 1 };
}, sel);
const count = (page, sel) => page.eval((s) => document.querySelectorAll(s).length, sel);
// the empty point of the drawing `svg` nearest to `ref` (dx, dy from it), at least 40 px inside it, with its
// neighbours `also` (offsets) empty and inside too: no element of the drawing under any of them
const emptyPoint = (page, svg, ref, also = []) => page.eval((s, r, more) => {
  const el = document.querySelector(s), b = el.getBoundingClientRect();
  const empty = (x, y) => x > b.left + 40 && x < b.right - 40 && y > b.top + 40 && y < b.bottom - 40 && el.contains(document.elementFromPoint(x, y)) && !document.elementFromPoint(x, y).closest('[data-kind],[data-node],[data-state],[data-trans],[data-edge]');
  let best = null;
  for (let y = b.top + 40; y < b.bottom - 40; y += 10) for (let x = b.left + 40; x < b.right - 40; x += 10) {
    if (!empty(x, y) || !more.every(([dx, dy]) => empty(x + dx, y + dy))) continue;
    const d = Math.hypot(x - r.x, y - r.y);
    if (!best || d < best.d) best = { x, y, d };
  }
  return best && { x: best.x, y: best.y };
}, svg, ref, also);
const onItem = (page, p) => page.eval((x, y) => !!document.elementFromPoint(x, y)?.closest('[data-kind],[data-node],[data-state],[data-trans],[data-edge]'), p.x, p.y);
// the centre of `sel` once it stands still over two frames (the editor fits its view when it first has a size, #339)
async function steady(page, sel) {
  let p = null;
  for (let i = 0; i < 50; i++) {
    const q = center(await rectOf(page, sel));
    if (p && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5) return q;
    p = q;
    await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  return p;
}
const frame = (page) => page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// two fingers, the first on `item`, the other on empty space of the drawing `svg`: the view panned by (dx, dy), the item moved with
// it only, `selected` (the selection's elements) as it was
async function panOnItem(page, { item, vp, svg, selected, dx = 60, dy = 40, what }) {
  const a = await steady(page, item), v0 = await viewOf(page, vp), n0 = await count(page, selected);
  const empty = await emptyPoint(page, svg, plus(a, 0, 80));
  assert.ok(empty, `${what}: empty space for the second finger`);
  await page.touchGesture([[a, plus(a, dx, dy)], [empty, plus(empty, dx, dy)]]);
  await frame(page);
  const v1 = await viewOf(page, vp), a1 = center(await rectOf(page, item));
  near(v1.tx - v0.tx, dx, 1, `${what}: the view panned (x)`);
  near(v1.ty - v0.ty, dy, 1, `${what}: the view panned (y)`);
  near(v1.s, v0.s, 1e-6, `${what}: the zoom kept`);
  near(a1.x - a.x, dx, 1, `${what}: the item moved with the view only (x)`);
  near(a1.y - a.y, dy, 1, `${what}: the item moved with the view only (y)`);
  assert.equal(await count(page, selected), n0, `${what}: the selection as it was`);
}
// a pinch about the empty point of the drawing `svg` nearest to `ref`, spreading the fingers from 2·r0 to 2·r1 px: the view zoomed by r1 / r0, the
// drawing's point under `c` kept there
async function pinch(page, { vp, svg, ref, r0 = 50, r1 = 75, what }) {
  const c = await emptyPoint(page, svg, ref, [[-r0, 0], [r0, 0]]);
  assert.ok(c, `${what}: empty space for the pinch`);
  const v0 = await viewOf(page, vp), o = await rectOf(page, svg);
  await page.touchGesture([[plus(c, -r0, 0), plus(c, -r1, 0)], [plus(c, r0, 0), plus(c, r1, 0)]]);
  await frame(page);
  const v1 = await viewOf(page, vp);
  near(v1.s / v0.s, r1 / r0, 0.02, `${what}: zoomed by the pinch`);
  near((c.x - o.x - v1.tx) / v1.s, (c.x - o.x - v0.tx) / v0.s, 1, `${what}: the point under the fingers kept (x)`);
  near((c.y - o.y - v1.ty) / v1.s, (c.y - o.y - v0.ty) / v0.s, 1, `${what}: the point under the fingers kept (y)`);
}

uiTest('touch (#674): in the schematic editor two fingers pan the sheet and a pinch zooms it, selecting and moving nothing; one finger still selects', E, async (page) => {
  const doc = newDoc('tp', 'vhdl');
  const add = (type, x, y) => doc.symbols.push({ id: `S${doc.symbols.length + 1}`, type, x, y, rot: 0, mirror: false, name: `XLXI_${doc.symbols.length + 1}`, params: { width: 1 } });
  add('and2', 100, 60); add('or2', 300, 60);
  await makeProject(env, { name: 'TouchPan', files: { 'src/tp.sch.json': JSON.stringify(doc) } });
  await page.openProject('TouchPan');
  await page.eval(() => window.SilinxApp.openSch('src/tp.sch.json'));
  const ED = '.doc:not([hidden]) .sch-editor', VP = `${ED} .se-vp`, SEL = `${ED} svg .sym.sel`;
  const S1 = `${ED} svg .sym[data-id=S1]`;
  await page.waitFor((s) => document.querySelector(s)?.getBoundingClientRect().width > 5, [S1], { what: 'the symbols drawn' });
  const SVG = `${ED} .se-canvas svg`;

  // two fingers on empty space: the sheet panned, nothing selected
  const v0 = await viewOf(page, VP), a0 = await steady(page, S1);
  const empty = await emptyPoint(page, SVG, plus(a0, 0, 100), [[80, 0]]);
  assert.ok(empty, 'empty space for the fingers');
  await page.touchGesture([[empty, plus(empty, 80, 50)], [plus(empty, 80, 0), plus(empty, 160, 50)]]);
  await frame(page);
  const v1 = await viewOf(page, VP);
  near(v1.tx - v0.tx, 80, 1, 'the sheet panned (x)');
  near(v1.ty - v0.ty, 50, 1, 'the sheet panned (y)');
  near(v1.s, v0.s, 1e-6, 'the zoom kept');
  const a1 = center(await rectOf(page, S1));
  near(a1.x - a0.x, 80, 1, 'the symbol moved with the sheet (x)');
  near(a1.y - a0.y, 50, 1, 'the symbol moved with the sheet (y)');
  assert.equal(await count(page, SEL), 0, 'no band selection');
  assert.equal(await count(page, `${ED} .se-overlay rect`), 0, 'no band left drawn');

  // the first finger on a symbol: neither moved nor selected by it
  await panOnItem(page, { item: S1, vp: VP, svg: SVG, selected: SEL, what: 'schematic' });

  // one finger still draws a selection band: the AND gate selected
  const b = await rectOf(page, S1);
  const from = { x: b.x - 15, y: b.y - 25 }, to = { x: b.x + b.w + 15, y: b.y + b.h + 15 };
  assert.ok(!(await onItem(page, from)), 'the band starts on empty space');
  await page.touchGesture([[from, to]]);
  await frame(page);
  assert.deepEqual(await page.eval((s) => [...document.querySelectorAll(s)].map((e) => e.dataset.id), SEL), ['S1'], 'one finger selects with a band');

  // a pinch zooms about the fingers, the selection kept
  await pinch(page, { vp: VP, svg: SVG, ref: plus(await steady(page, S1), 0, 100), what: 'schematic' });
  assert.deepEqual(await page.eval((s) => [...document.querySelectorAll(s)].map((e) => e.dataset.id), SEL), ['S1'], 'the selection kept by the pinch');
  assert.deepEqual(warnings(page), []);
});

uiTest('touch (#674): in the ASM chart, state diagram and Petri net editors two fingers pan (moving and selecting nothing) and a pinch zooms', E, async (page) => {
  await makeProject(env, { name: 'TouchPan2', top: '', files: {
    'src/ctl.asm.json': JSON.stringify(newModel('ctl', 'vhdl')),
    'src/det.fsm.json': JSON.stringify(newFsm('det')),
    'src/pn.pn.json': JSON.stringify(newPetri('pn', 'vhdl')),
  } });
  await page.openProject('TouchPan2');

  // ASM chart
  await page.eval(() => window.SilinxApp.openAsm('src/ctl.asm.json'));
  const AE = '.doc:not([hidden]) .asm-editor';
  await page.waitFor((ed) => document.querySelector(`${ed} [data-node=s1]`)?.getBoundingClientRect().width > 10, [AE], { what: 'the ASM editor' });
  await panOnItem(page, { item: `${AE} [data-node=s1]`, vp: `${AE} .asm-vp`, svg: `${AE} .asm-canvas`, selected: `${AE} [data-node].sel`, what: 'ASM chart' });
  await pinch(page, { vp: `${AE} .asm-vp`, svg: `${AE} .asm-canvas`, ref: plus(await steady(page, `${AE} [data-node=s1]`), 150, 0), what: 'ASM chart' });

  // state diagram
  await page.eval(() => window.SilinxApp.openFsm('src/det.fsm.json'));
  const FE = '.doc:not([hidden]) .fsm-editor', ST = `${FE} [data-state=s1] .fsm-circle`;
  await page.waitFor((s) => document.querySelector(s)?.getBoundingClientRect().width > 10, [ST], { what: 'the state diagram editor' });
  await panOnItem(page, { item: ST, vp: `${FE} .fsm-vp`, svg: `${FE} .fsm-canvas`, selected: `${FE} .fsm-state.sel`, what: 'state diagram' });
  await pinch(page, { vp: `${FE} .fsm-vp`, svg: `${FE} .fsm-canvas`, ref: plus(await steady(page, ST), 0, 100), what: 'state diagram' });

  // Petri net
  await page.eval(() => window.SilinxApp.openPetri('src/pn.pn.json'));
  const PE = '.doc:not([hidden]) .petri-editor';
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-place .pn-circle`)?.getBoundingClientRect().width > 10, [PE], { what: 'the Petri net editor' });
  const id = await page.eval((ed) => document.querySelector(`${ed} .pn-place`).dataset.id, PE);
  const PL = `${PE} .pn-place[data-id="${id}"] .pn-circle`;
  await panOnItem(page, { item: PL, vp: `${PE} .pn-world`, svg: `${PE} .pn-canvas`, selected: `${PE} .sel`, what: 'Petri net' });
  await pinch(page, { vp: `${PE} .pn-world`, svg: `${PE} .pn-canvas`, ref: plus(await steady(page, PL), 0, 100), what: 'Petri net' });
  assert.deepEqual(warnings(page), []);
});

const CNT = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is port (clk : in std_logic; q : out std_logic_vector(7 downto 0)); end cnt;
architecture rtl of cnt is
  signal r : unsigned(7 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then r <= r + 1; end if;
  end process;
  q <= std_logic_vector(r);
end rtl;
`;
const TB = `library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture sim of tb is
  signal clk : std_logic := '0';
  signal q : std_logic_vector(7 downto 0);
begin
  u : entity work.cnt port map (clk => clk, q => q);
  clk <= not clk after 5 ns;
end sim;
`;

uiTest('touch (#674): in the waveform viewer two fingers scroll the time (the cursor and the selection as they were) and a pinch zooms it', E, async (page) => {
  await makeProject(env, { name: 'TouchPanWave', top: 'cnt', files: { 'src/cnt.vhd': CNT, 'sim/tb.vhd': TB }, roles: { 'sim/tb.vhd': 'sim' } });
  await page.openProject('TouchPanWave');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view, [], { what: 'ISim open', timeout: 20000 });
  await page.waitFor(() => /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [], { what: 'sim time 1 us', timeout: 20000 });
  const state = () => page.eval(() => { const s = window.Silinx.active.view.state; return { t0: s.t0, scale: s.scale, cursor: s.cursor, sel: [...s.sel] }; });
  const w = await rectOf(page, '.doc:not([hidden]) .isim-waves');
  const c = { x: w.x + w.w / 2, y: w.y + Math.min(w.h - 10, 60) };
  const s0 = await state();
  // the time scrolled by 100 px (the drawing follows the fingers, to the left)
  await page.touchGesture([[c, plus(c, -100, 0)], [plus(c, 60, 0), plus(c, -40, 0)]]);
  await frame(page);
  const s1 = await state();
  near(s1.t0 - s0.t0, 100 * s0.scale, s0.scale, 'the time scrolled');
  near(s1.scale, s0.scale, 1e-9, 'the zoom kept');
  assert.equal(s1.cursor, s0.cursor, 'the cursor as it was');
  assert.deepEqual(s1.sel, s0.sel, 'the selection as it was');
  // a pinch spreading the fingers 2×: the time zoomed in 2×, the time under the fingers kept
  const tAt = (s) => s.t0 + (c.x - w.x) * s.scale;
  await page.touchGesture([[plus(c, -40, 0), plus(c, -80, 0)], [plus(c, 40, 0), plus(c, 80, 0)]]);
  await frame(page);
  const s2 = await state();
  near(s1.scale / s2.scale, 2, 0.02, 'the time zoomed in by the pinch');
  near(tAt(s2), tAt(s1), 2 * s1.scale, 'the time under the fingers kept');
  assert.equal(s2.cursor, s0.cursor, 'the cursor as it was');
  // the time's scrollbar follows a frame later: its scroll event, from where the view put it a frame before, may come
  // after the fingers moved the time on (#915, the time taken back 12 px on a loaded runner); here the two-finger
  // scroll and that event in one task, before the view's next frame
  const s3 = await page.eval((p) => {
    const cw = document.querySelector('.doc:not([hidden]) .isim-waves'), hsc = document.querySelector('.doc:not([hidden]) .isim-hscroll');
    const fire = (type, k, x) => cw.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, pointerId: 201 + k,
      pointerType: 'touch', isPrimary: k === 0, clientX: x, clientY: p.y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, width: 1, height: 1 }));
    fire('pointerdown', 0, p.x); fire('pointerdown', 1, p.x + 60);
    fire('pointermove', 0, p.x - 50); fire('pointermove', 1, p.x + 10);
    fire('pointerup', 0, p.x - 50); fire('pointerup', 1, p.x + 10);
    hsc.dispatchEvent(new Event('scroll'));
    const st = window.Silinx.active.view.state;
    return { t0: st.t0, scale: st.scale };
  }, c);
  near(s3.t0 - s2.t0, 50 * s2.scale, s2.scale / 100, 'the time scrolled, a late scroll event of the scrollbar ignored');
  await frame(page);
  near((await state()).t0, s3.t0, s2.scale / 100, 'the time kept once the scrollbar followed it');
  // the scrollbar moved by the user still scrolls the time: back to its start, the time from 0
  await page.eval(() => { document.querySelector('.doc:not([hidden]) .isim-hscroll').scrollLeft = 0; });
  await page.waitFor(() => window.Silinx.active.view.state.t0 === 0, [], { what: 'the time from 0' });
  assert.deepEqual(warnings(page), []);
});

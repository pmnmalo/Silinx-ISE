// UI: touch screens (#264, #265). A finger (CDP touch events: pointer events of pointerType 'touch')
// drags a pane splitter, a dialog by its title, the waveform viewer's cursor, a state of the FSM
// editor and a place of the Petri net editor; the mouse still drags the splitter, the dialog and the
// cursor the same; the drag handles and the canvases say touch-action: none (else the browser pans
// the page and cancels the pointer). No console warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const touchAction = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).touchAction : null; }, sel);
const rectOf = (page, sel) => page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const warnings = (page) => page.console.filter((m) => /^warn/.test(m.type)).map((m) => m.text);
// the centre of `sel` once it stands still over two frames (an editor fits its view to the drawing when its
// canvas first has a size: a point taken before that is not where the drawing is, #339)
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
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not ${b} ± ${tol}`);

uiTest('touch (#264): a finger drags a pane splitter and a dialog by its title; the mouse still does', E, async (page) => {
  await makeProject(env, { name: 'TouchPj', files: {} });
  await page.openProject('TouchPj');
  // the first vertical splitter (between the side panes and the documents)
  const SPLIT = '.splitter.split-h';
  await page.waitForSelector(SPLIT);
  assert.equal(await touchAction(page, SPLIT), 'none');
  const s0 = await rectOf(page, SPLIT);
  await page.touchDrag(center(s0), { x: center(s0).x + 60, y: center(s0).y });
  const s1 = await rectOf(page, SPLIT);
  near(s1.x - s0.x, 60, 1, 'the splitter dragged by a finger');
  await page.drag(center(s1), { x: center(s1).x - 60, y: center(s1).y });
  near((await rectOf(page, SPLIT)).x, s0.x, 1, 'the splitter dragged back by the mouse');
  assert.equal(await page.eval(() => document.body.classList.contains('resizing-h')), false);

  // a dialog by its title: a finger, then the mouse
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  const T = '.dlg-overlay .dlg-title';
  assert.equal(await touchAction(page, T), 'none');
  const d0 = await rectOf(page, '.dlg-overlay .dlg');
  const t0 = await rectOf(page, T);
  const grab = { x: t0.x + 40, y: t0.y + t0.h / 2 };
  await page.touchDrag(grab, { x: grab.x + 80, y: grab.y + 50 });
  const d1 = await rectOf(page, '.dlg-overlay .dlg');
  near(d1.x - d0.x, 80, 1, 'the dialog dragged by a finger (x)');
  near(d1.y - d0.y, 50, 1, 'the dialog dragged by a finger (y)');
  await page.drag({ x: grab.x + 80, y: grab.y + 50 }, { x: grab.x + 20, y: grab.y + 10 });
  const d2 = await rectOf(page, '.dlg-overlay .dlg');
  near(d2.x - d0.x, 20, 1, 'the dialog dragged by the mouse (x)');
  near(d2.y - d0.y, 10, 1, 'the dialog dragged by the mouse (y)');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

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

uiTest('touch (#264): a finger moves the waveform viewer\'s cursor; the mouse still does', E, async (page) => {
  await makeProject(env, { name: 'TouchWave', top: 'cnt', files: { 'src/cnt.vhd': CNT, 'sim/tb.vhd': TB }, roles: { 'sim/tb.vhd': 'sim' } });
  await page.openProject('TouchWave');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view, [], { what: 'ISim open', timeout: 20000 });
  await page.waitFor(() => /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [], { what: 'sim time 1 us', timeout: 20000 });
  for (const sel of ['.isim-waves', '.isim-names', '.isim-split-names', '.isim-split-v', '.isim-split-h']) assert.equal(await touchAction(page, `.doc:not([hidden]) ${sel}`), 'none', sel);
  // the client point of time t (ps) in the ruler (no row: no snapping to a transition)
  const at = (t) => page.eval((tt) => {
    const s = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-waves').getBoundingClientRect();
    return { x: c.left + (tt - s.t0) / s.scale, y: c.top + 10 };
  }, t);
  const cursor = () => page.eval(() => window.Silinx.active.view.state.cursor);
  const ps = () => page.eval(() => window.Silinx.active.view.state.scale);   // ps per pixel
  await page.touchDrag(await at(100000), await at(400000));
  near(await cursor(), 400000, 2 * await ps(), 'the cursor moved by a finger');
  await page.drag(await at(400000), await at(250000));
  near(await cursor(), 250000, 2 * await ps(), 'the cursor moved by the mouse');
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

uiTest('touch (#265): a finger drags a state of the FSM editor and a place of the Petri net editor (their canvases touch-action: none)', E, async (page) => {
  await makeProject(env, { name: 'TouchDiag', top: '', files: {} });
  await page.openProject('TouchDiag');
  // a state diagram
  await page.menu('Project', 'New Source…');
  await page.waitDialog('New Source Wizard');
  await page.eval(() => { const r = [...document.querySelectorAll('.dlg-overlay .src-types .st')].find((e) => e.textContent.trim() === 'State Machine (FSM)'); r.scrollIntoView(); r.click(); });
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'det');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  const FSM = '.doc:not([hidden]) .fsm-editor';
  await page.waitFor((ed) => document.querySelector(`${ed} [data-state=s1] .fsm-circle`)?.getBoundingClientRect().width > 10, [FSM], { what: 'the state diagram editor' });
  assert.equal(await touchAction(page, `${FSM} .fsm-canvas`), 'none');
  const S = `${FSM} [data-state=s1] .fsm-circle`;
  const a0 = await steady(page, S);
  await page.touchDrag(a0, { x: a0.x + 60, y: a0.y + 40 });
  const a1 = center(await rectOf(page, S));
  near(a1.x - a0.x, 60, 15, 'the state dragged by a finger (x)');
  near(a1.y - a0.y, 40, 15, 'the state dragged by a finger (y)');

  // a Petri net
  await page.menu('Tools', 'Petri Net Editor…');
  await page.waitDialog('New Source Wizard');
  await page.dialogButton('Next >');
  await page.fill('.dlg-overlay .wiz-main input[type=text]', 'ctl');
  await page.dialogButton('Next >');
  await page.dialogButton('Finish');
  await page.waitNoDialog();
  const PN = '.doc:not([hidden]) .petri-editor';
  await page.waitFor((ed) => document.querySelector(`${ed} .pn-place .pn-circle`)?.getBoundingClientRect().width > 10, [PN], { what: 'the Petri net editor' });
  assert.equal(await touchAction(page, `${PN} .pn-canvas`), 'none');
  const id = await page.eval((ed) => document.querySelector(`${ed} .pn-place`).dataset.id, PN);
  const P = `${PN} .pn-place[data-id="${id}"] .pn-circle`;
  const p0 = await steady(page, P);
  await page.touchDrag(p0, { x: p0.x + 60, y: p0.y + 40 });
  const p1 = center(await rectOf(page, P));
  near(p1.x - p0.x, 60, 15, 'the place dragged by a finger (x)');
  near(p1.y - p0.y, 40, 15, 'the place dragged by a finger (y)');
  assert.deepEqual(warnings(page), []);
}, { skip: chromeOnly });

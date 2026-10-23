// UI: the ISim Wave window — zoom in / out / full view, markers (here, at the cursor, delete one / all),
// radix of a bus, force constant / clock / remove force (the forced values in the waveform data, the
// console lines), new / rename divider, add an instance to the wave window (recursive), copy path,
// go to source code, restart.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

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

const rows = (page) => page.eval(() => window.Silinx.active.view.state.rows.map((r) => (r.kind === 'div' ? `-- ${r.name}` : r.sig.path.replace(/\./g, '/'))));
const consoleText = (page) => page.eval(() => Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n'));
// client point of time t (ps) on the wave canvas, in row `row` (-1: the ruler)
const waveAt = (page, t, row) => page.eval((tt, r) => {
  const s = window.Silinx.active.view.state, c = document.querySelector('.doc:not([hidden]) .isim-waves').getBoundingClientRect();
  return { x: c.left + (tt - s.t0) / s.scale, y: c.top + (r < 0 ? 15 : 30 + r * 20 + 10 - s.scrollY) };
}, t, row);
const menuItem = (page, label) => page.click('.isim-menu-item', { text: label });
// the texts drawn on the names / values canvas
const drawnNames = (page) => page.eval(() => {
  const c = document.querySelector('.doc:not([hidden]) .isim-names'), ctx = c.getContext('2d'), out = [];
  const f = ctx.fillText;
  ctx.fillText = function (s, ...a) { out.push(String(s)); return f.call(this, s, ...a); };
  try { window.Silinx.active.view.redraw(); } finally { ctx.fillText = f; }
  return out;
});
const simTime = (page, ps) => page.waitFor((re) => new RegExp(re).test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [`Sim Time: ${ps} ps`], { what: `sim time ${ps} ps`, timeout: 20000 });
async function cmd(page, text) {
  await page.click('#mc-cmd input');   // (ISim's command line: the bottom console's, #925)
  await page.type(text);
  await page.key('Enter');
}
const waveOf = (page, path) => page.eval((p) => { const w = window.Silinx.active.view.state.rows.find((r) => r.sig?.path.replace(/\./g, '/') === p).sig.wave; return { t: [...w.t], n: w.t.length }; }, path);

uiTest('ISim Wave window: zoom, markers, radix, force constant / clock / remove, dividers, add to wave (recursive), copy path, restart, go to source', E, async (page) => {
  await makeProject(env, { name: 'WavePj', top: 'cnt', files: { 'src/cnt.vhd': CNT, 'sim/tb.vhd': TB }, roles: { 'sim/tb.vhd': 'sim' } });
  await page.openProject('WavePj');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view, [], { what: 'ISim open', timeout: 20000 });
  await simTime(page, '1,000,000');
  assert.deepEqual(await rows(page), ['tb/clk', 'tb/q']);
  const startLog = await consoleText(page);
  const view = (k) => page.eval((key) => window.Silinx.active.view.state[key], k);
  const tbBtn = (title) => page.click(`.doc:not([hidden]) .isim-toolbar .tb-btn[title="${title}"]`);

  // ---- zoom: in halves the time scale, out doubles it, full view fits 0 .. 1 us again
  const fit = await view('scale');
  assert.equal(await view('fit'), true);
  await tbBtn('Zoom In');
  assert.equal(await view('scale'), fit / 2);
  assert.equal(await view('fit'), false);
  await tbBtn('Zoom Out');
  await tbBtn('Zoom Out');
  assert.equal(await view('scale'), fit * 2);
  await tbBtn('Zoom to Full View');
  assert.equal(await view('scale'), fit);
  assert.equal(await view('fit'), true);
  assert.equal(await view('t0'), 0);
  // (and from the wave window's context menu)
  await page.rightClick(await waveAt(page, 500000, -1));
  await menuItem(page, 'Zoom In');
  assert.equal(await view('scale'), fit / 2);
  await page.rightClick(await waveAt(page, 500000, -1));
  await menuItem(page, 'Zoom to Full View');
  assert.equal(await view('scale'), fit);

  // ---- markers: here (snapped to the nearest clk edge, 300 ns), at the cursor (the latest time), delete one, delete all
  const markers = () => page.eval(() => window.Silinx.active.view.state.markers.map((m) => m.t));
  await page.rightClick(await waveAt(page, 301000, 0));
  await page.waitForSelector('.isim-menu-root');
  assert.equal(await page.eval(() => document.querySelector('.isim-menu-item.dis')?.textContent), 'Delete Marker', 'no marker near: Delete Marker disabled');
  await menuItem(page, 'Add Marker Here');
  assert.deepEqual(await markers(), [300000]);
  await tbBtn('Go to Latest Time');
  assert.equal(await view('cursor'), 1000000);
  await page.rightClick(await waveAt(page, 600000, -1));
  await menuItem(page, 'Add Marker at Cursor');
  assert.deepEqual(await markers(), [300000, 1000000]);
  await page.rightClick(await waveAt(page, 300000, -1));
  await menuItem(page, 'Delete Marker');
  assert.deepEqual(await markers(), [1000000]);
  await page.rightClick(await waveAt(page, 600000, -1));
  await menuItem(page, 'Add Marker Here');
  assert.equal((await markers()).length, 2);
  await page.rightClick(await waveAt(page, 600000, -1));
  await menuItem(page, 'Delete All Markers');
  assert.deepEqual(await markers(), []);

  // ---- radix of q (100 at 1 us): default hex 64, then binary, signed decimal, octal
  assert.deepEqual(await drawnNames(page), ['Name', 'Value', 'clk', '0', 'q[7:0]', '64']);
  // (right-clicked at the left, then near the right edge: the submenu opens to the left, inside the window, #201)
  for (const [label, key, shown, at] of [['Binary', 'bin', '01100100', 50000], ['Signed Decimal', 'sdec', '100', 980000], ['Octal', 'oct', '144', 500000], ['Hexadecimal', 'hex', '64', 980000]]) {
    await page.rightClick(await waveAt(page, at, 1));
    await page.hover(await page.point('.isim-menu-item', { text: 'Radix' }));
    await page.waitForSelector('.isim-menu-root .isim-menu');
    const sub = await page.eval(() => { const r = document.querySelector('.isim-menu-root .isim-menu').getBoundingClientRect(); return { left: r.left, right: r.right, w: window.innerWidth }; });
    assert.ok(sub.left >= 0 && sub.right <= sub.w, `the Radix submenu inside the window (at ${at}): ${JSON.stringify(sub)}`);
    await page.click('.isim-menu-root .isim-menu .isim-menu-item', { text: label });
    assert.equal(await page.eval(() => window.Silinx.active.view.state.rows[1].radix), key);
    assert.equal((await drawnNames(page))[5], shown, `q in ${label}`);
  }

  // ---- force constant: clk (1 at 1 us) forced to 0, no transition while it runs 100 ns, q stays 0x64
  const qShown = async () => { await tbBtn('Go to Latest Time'); return (await drawnNames(page)).at(-1); };
  const edgesIn = async (a, b) => (await waveOf(page, 'tb/clk')).t.filter((t) => t >= a && t <= b);
  const forceMenu = async (label) => {
    await page.rightClick(await waveAt(page, 50000, 0));
    await menuItem(page, label);
    await page.waitForSelector('.isim-dlg');
  };
  await forceMenu('Force Constant...');
  assert.equal(await page.eval(() => document.querySelector('.isim-dlg-title').firstChild.textContent), 'Force Selected Signal');
  assert.equal(await page.eval(() => document.querySelector('.isim-dlg [name=sig]').value), '/tb/clk');
  assert.equal(await page.eval(() => document.querySelector('.isim-dlg [name=value]').value), '0', 'prefilled with the value now');
  await page.fill('.isim-dlg [name=value]', '0');
  await page.click('.isim-dlg [data-a=ok]');
  await page.waitFor(() => !document.querySelector('.isim-dlg'));
  await cmd(page, 'run 100 ns');
  await simTime(page, '1,100,000');
  assert.deepEqual(await edgesIn(990000, 1100000), [990000, 995000, 1000000], 'no clk transition while forced');
  assert.deepEqual(await drawnNames(page), ['Name', 'Value', 'clk', 'F', '0', 'q[7:0]', '64'], 'clk marked forced (F), q stopped');
  // ---- remove force
  await page.rightClick(await waveAt(page, 50000, 0));
  await menuItem(page, 'Remove Force');
  await cmd(page, 'run 100 ns');
  await simTime(page, '1,200,000');
  const every = (a, b, step) => Array.from({ length: (b - a) / step + 1 }, (_, i) => a + i * step);
  assert.deepEqual(await edgesIn(1100001, 1200000), every(1105000, 1200000, 5000), 'the test bench drives clk again');
  assert.equal(await qShown(), '6E');
  // ---- force clock 20 ns
  await forceMenu('Force Clock...');
  assert.equal(await page.eval(() => document.querySelector('.isim-dlg-title').firstChild.textContent), 'Define Clock');
  await page.fill('.isim-dlg [name=period]', '20 ns');
  await page.click('.isim-dlg [data-a=ok]');
  await page.waitFor(() => !document.querySelector('.isim-dlg'));
  await cmd(page, 'run 200 ns');
  await simTime(page, '1,400,000');
  assert.deepEqual(await edgesIn(1200000, 1400000), every(1200000, 1400000, 10000), 'the forced 20 ns clock');
  assert.equal(await qShown(), '78');
  assert.equal(await consoleText(page), `${startLog}
SSim> ssim force add /tb/clk 0 -radix bin
SSim> run 100 ns
Force removed from /tb/clk
SSim> run 100 ns
SSim> ssim force add /tb/clk 0 -radix bin -value 1 -time 10 ns -repeat 20 ns
SSim> run 200 ns`);

  // ---- restart: time 0, the forces kept
  await tbBtn('Restart');
  await simTime(page, '0');
  assert.equal(await view('cursor'), 0);
  assert.equal(await consoleText(page), `${startLog}
SSim> ssim force add /tb/clk 0 -radix bin
SSim> run 100 ns
Force removed from /tb/clk
SSim> run 100 ns
SSim> ssim force add /tb/clk 0 -radix bin -value 1 -time 10 ns -repeat 20 ns
SSim> run 200 ns
SSim> restart
Simulator is doing circuit initialization process.
Finished circuit initialization process.
2 force(s) re-applied.`);
  assert.equal((await page.eval(() => window.Silinx.active.view.getState().forces)).length, 2);

  // ---- dividers: New Divider above the selected q row (named through the prompt), Rename Divider
  await page.eval(() => { window.__prompts = ['Counter', 'Counter out']; window.__asked = []; window.prompt = (m, d) => { window.__asked.push([m, d]); return window.__prompts.shift(); }; });
  await page.rightClick(await waveAt(page, 50000, 1));
  await menuItem(page, 'New Divider');
  assert.deepEqual(await rows(page), ['tb/clk', '-- Counter', 'tb/q']);
  await page.rightClick(await waveAt(page, 50000, 1));
  await menuItem(page, 'Rename Divider...');
  assert.deepEqual(await rows(page), ['tb/clk', '-- Counter out', 'tb/q']);
  assert.deepEqual(await page.eval(() => window.__asked), [['Divider name:', 'New Divider'], ['Divider name:', 'Counter']]);

  // ---- Add to Wave Window (Recursive) from the instance tree: a divider per instance and its signals
  await page.rightClick('.doc:not([hidden]) .isim-tree .row', { text: '' });
  await menuItem(page, 'Add to Wave Window (Recursive)');
  assert.deepEqual(await rows(page), ['tb/clk', '-- Counter out', 'tb/q', '-- /tb', 'tb/clk', 'tb/q', '-- /tb/u', 'tb/clk', 'tb/q', 'tb/u/r']);  // (u's ports are the test bench's signals)

  // ---- Copy Path from the Objects panel
  await page.eval(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied.push(t); } } }); });
  await page.rightClick('.doc:not([hidden]) .isim-objs tbody tr', { index: 1 });
  await menuItem(page, 'Copy Path');
  assert.deepEqual(await page.eval(() => window.__copied), ['/tb/q']);

  // ---- Go To Source Code (the q row): the test bench opens at the declaration of q
  await page.rightClick(await waveAt(page, 50000, 2));
  await menuItem(page, 'Go To Source Code');
  await page.waitFor(() => window.Silinx.active?.id !== 'isim', [], { what: 'source opened' });
  assert.equal(await page.eval(() => window.Silinx.active.id), 'file:sim/tb.vhd');
  await page.waitFor(() => window.Silinx.active.editor?.view, [], { what: 'editor ready' });
  await page.waitFor(() => window.Silinx.active.editor.getCursor().line + 1 === 5, [], { what: 'cursor on line 5 (signal q)' });
  assert.doesNotMatch(await page.eval(() => document.querySelector('#console')?.innerText || ''), /error/i);
});

// A test bench whose clock toggles every 10 ps (a run of 1 ms does not end before a Break).
const TB_FAST = TB.replace('after 5 ns', 'after 10 ps');
// the console's lines from the first command on
const commandLines = (page) => page.eval(() => { const l = Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n').split('\n'); return l.slice(l.findIndex((x) => x.startsWith('SSim>'))); });
// in the page: type `cmds` into ISim's command line (`input`), one after the other, at once
const TYPE = `(input, cmds) => { for (const c of cmds) { input.value = c; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } }`;
// starts `run` and types `cmds` while it goes on: performance.now() made to jump, the run yields
// after its first chunk of time (as a long run does), so it still runs when they are typed
const typeDuringRun = (page, run, cmds) => page.eval((r, cs, type) => {
  const v = window.Silinx.active.view, now = performance.now;
  let jump = 0;
  performance.now = () => now.call(performance) + (jump += 100);
  try { v.exec(r); } finally { performance.now = now; }
  const running = v.state.running;
  (0, eval)(type)(document.querySelector('.doc:not([hidden]) .isim-cmdline input'), cs);
  return running;
}, run, cmds, TYPE);

uiTest('ISim command line: commands given before ISim\'s first run starts or during a run wait for it and run in turn, none lost; Break cancels the waiting ones (#215)', E, async (page) => {
  await makeProject(env, { name: 'RunQueuePj', top: 'cnt', files: { 'src/cnt.vhd': CNT, 'sim/tb.vhd': TB_FAST }, roles: { 'sim/tb.vhd': 'sim' } });
  await page.openProject('RunQueuePj');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb');
  // typed as soon as ISim's command line is there, before its first run (1 us) has started, when ISim
  // looks ready (not running): they wait for that run (the CI failure of #215: 'run all' lost)
  await page.eval((type) => {
    const mo = new MutationObserver(() => {
      const input = document.querySelector('.isim-cmdline input');
      if (!input) return;
      mo.disconnect();
      window.__early = { running: window.Silinx.active?.view?.state?.running ?? false, time: document.querySelector('.isim-st-time')?.textContent ?? '' };
      (0, eval)(type)(input, ['run 2 ns', 'show time']);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }, TYPE);
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view, [], { what: 'ISim open', timeout: 20000 });
  await simTime(page, '1,002,000');
  assert.deepEqual(await page.eval(() => window.__early), { running: false, time: '' }, 'typed before the first run started');
  assert.deepEqual(await commandLines(page), ['SSim> run 1 us', 'SSim> run 2 ns', 'SSim> show time', 'Simulation time: 1.002 us']);

  // typed during a run: a run, the time, another run; each waits for the one before it
  await page.eval(() => { document.querySelector('.doc:not([hidden]) .isim-console').innerHTML = ''; });
  assert.equal(await typeDuringRun(page, 'run 100 ns', ['run 2 ns', 'show time', 'run 3 ns']), true, 'typed while the run goes on');
  await simTime(page, '1,107,000');
  assert.deepEqual(await commandLines(page), ['SSim> run 100 ns', 'SSim> run 2 ns', 'SSim> show time', 'SSim> run 3 ns', 'Simulation time: 1.104 us']);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-st-msg').textContent), 'Ready');

  // Break during a run: that run stops, the command waiting for it is cancelled (said so)
  await page.eval(() => { document.querySelector('.doc:not([hidden]) .isim-console').innerHTML = ''; });
  assert.equal(await typeDuringRun(page, 'run 1 ms', ['run 1 us']), true, 'typed while the run goes on');
  await page.click('.doc:not([hidden]) .isim-toolbar .tb-btn[title="Break"]');
  await page.waitFor(() => !window.Silinx.active.view.state.running && /cancelled/.test(Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n')), [], { what: 'run broken, the waiting one cancelled', timeout: 20000 });
  const lines = await commandLines(page);
  assert.equal(lines.length, 4, lines.join('\n'));
  assert.deepEqual([lines[0], lines[1], lines[3]], ['SSim> run 1 ms', 'SSim> run 1 us', 'Command \'run 1 us\' cancelled (Break)']);
  assert.match(lines[2], /^Simulation interrupted \(Break\) at [\d.]+ (ns|us)$/);
  assert.equal(await page.eval(() => window.Silinx.active.view.state.runTarget), 1_107_000 + 1e9, 'the broken run, not the cancelled one, was the last');
  // the next command runs as usual
  await page.eval(() => { window.Silinx.active.view.exec('run 1 ns'); });
  await page.waitFor(() => !window.Silinx.active.view.state.running && window.Silinx.active.view.state.runTarget !== 1_107_000 + 1e9, [], { what: 'a run after the Break' });
  assert.equal(await page.eval(() => window.Silinx.active.view.state.runTarget - window.Silinx.active.view.state.runStart), 1000);
  assert.equal((await commandLines(page)).length, 5);
  assert.doesNotMatch(await page.eval(() => document.querySelector('#console')?.innerText || ''), /error/i);
});

// #341: groups of signals, as ISim's New Group: the selected rows in a named group that opens and closes (its
// twisty, a double-click), renamed, a signal dragged into it and out of it, kept by getState / setState, Ungroup,
// deleted with its signals; the menu in Portuguese
uiTest('ISim Wave window (#341): New Group, open / close, Rename Group, drag into and out of it, state, Ungroup, Delete, Portuguese', E, async (page) => {
  await makeProject(env, { name: 'GroupPj', top: 'cnt', files: { 'src/cnt.vhd': CNT, 'sim/tb.vhd': TB }, roles: { 'sim/tb.vhd': 'sim' } });
  await page.openProject('GroupPj');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view, [], { what: 'ISim open', timeout: 20000 });
  await simTime(page, '1,000,000');
  // the instance u's signals too: clk q (tb), u/r
  await page.rightClick('.doc:not([hidden]) .isim-tree .row', { text: '' });
  await menuItem(page, 'Add to Wave Window (Recursive)');
  const st = () => page.eval(() => window.Silinx.active.view.state.rows.map((r) => (r.kind === 'group' ? `[${r.name}${r.expanded ? '' : ' +'}]` : `${r.group != null ? '  ' : ''}${r.kind === 'div' ? `-- ${r.name}` : r.sig.path.replace(/\./g, '/')}`)));
  await page.eval(() => { window.__prompts = ['Counter', 'Counter out', 'Bad']; window.__asked = []; window.prompt = (m, d) => { window.__asked.push([m, d]); return window.__prompts.shift(); }; });
  const nameAt = (row) => page.eval((r) => { const c = document.querySelector('.doc:not([hidden]) .isim-names').getBoundingClientRect(); return { x: c.left + 60, y: c.top + 30 + r * 20 + 10 }; }, row);
  const twisty = (row) => page.eval((r) => { const c = document.querySelector('.doc:not([hidden]) .isim-names').getBoundingClientRect(); return { x: c.left + 8, y: c.top + 30 + r * 20 + 10 }; }, row);
  assert.deepEqual(await st(), ['tb/clk', 'tb/q', '-- /tb', 'tb/clk', 'tb/q', '-- /tb/u', 'tb/clk', 'tb/q', 'tb/u/r']);
  // ---- New Group of rows 0 and 1 (clk, q): selected with Ctrl+click
  await page.click(await nameAt(0));
  await page.click(await nameAt(1), { modifiers: 2 });
  await page.rightClick(await nameAt(1));
  await menuItem(page, 'New Group');
  assert.deepEqual((await st()).slice(0, 4), ['[Counter]', '  tb/clk', '  tb/q', '-- /tb']);
  const drawn = await drawnNames(page);
  assert.ok(drawn.includes('Counter') && drawn.includes('(2)'), drawn.join(' '));
  // ---- closed by its twisty (its signals hidden), opened by a double-click
  await page.click(await twisty(0));
  assert.deepEqual((await st()).slice(0, 4), ['[Counter +]', '  tb/clk', '  tb/q', '-- /tb']);
  // (its two signals not drawn: clk twice, not three times)
  const count = async (n) => (await drawnNames(page)).filter((t) => t === n).length;
  assert.equal(await count('clk'), 2);
  await page.dblclick(await nameAt(0));
  assert.equal((await st())[0], '[Counter]');
  assert.equal(await count('clk'), 3);
  // ---- Rename Group...
  await page.rightClick(await nameAt(0));
  await menuItem(page, 'Rename Group...');
  assert.equal((await st())[0], '[Counter out]');
  // ---- u/r (the last row, 9) dragged between clk and q: in the group; then q (row 3 now) dragged to the top: out of it
  await page.click(await nameAt(9));
  await page.drag(await nameAt(9), { ...(await nameAt(2)), y: (await nameAt(2)).y - 10 });
  assert.deepEqual((await st()).slice(0, 5), ['[Counter out]', '  tb/clk', '  tb/u/r', '  tb/q', '-- /tb']);
  await page.click(await nameAt(3));
  await page.drag(await nameAt(3), { ...(await nameAt(0)), y: (await nameAt(0)).y - 10 });
  assert.deepEqual((await st()).slice(0, 5), ['tb/q', '[Counter out]', '  tb/clk', '  tb/u/r', '-- /tb']);
  // ---- the state keeps the group
  const s = await page.eval(() => window.Silinx.active.view.getState().rows.slice(0, 4));
  assert.deepEqual(s.map((r) => [r.kind, r.name ?? r.path, r.group ?? null]), [['sig', 'tb.q', null], ['group', 'Counter out', null], ['sig', 'tb.clk', 1], ['sig', 'tb.u.r', 1]]);
  await page.eval(() => { const v = window.Silinx.active.view; v.setState(v.getState()); v.refresh(); });
  assert.deepEqual((await st()).slice(0, 4), ['tb/q', '[Counter out]', '  tb/clk', '  tb/u/r']);
  // ---- the menu in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  await page.rightClick(await nameAt(1));
  const items = await page.eval(() => [...document.querySelectorAll('.isim-menu-item .lbl')].map((e) => e.textContent));
  for (const t of ['Novo Grupo', 'Mudar Nome do Grupo...', 'Desagrupar']) assert.ok(items.includes(t), items.join(' | '));
  await page.key('Escape');
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  // ---- Ungroup: its signals stay where they are
  await page.rightClick(await nameAt(1));
  await menuItem(page, 'Ungroup');
  assert.deepEqual((await st()).slice(0, 4), ['tb/q', 'tb/clk', 'tb/u/r', '-- /tb']);
  // ---- a group deleted (Delete) goes with its signals
  await page.click(await nameAt(1));
  await page.click(await nameAt(2), { modifiers: 2 });
  await page.rightClick(await nameAt(2));
  await menuItem(page, 'New Group');
  assert.deepEqual((await st()).slice(0, 4), ['tb/q', '[Bad]', '  tb/clk', '  tb/u/r']);
  await page.click(await nameAt(1));
  await page.key('Delete');
  assert.deepEqual((await st()).slice(0, 2), ['tb/q', '-- /tb']);
  assert.deepEqual(await page.eval(() => window.__asked), [['Group name:', 'New Group'], ['Group name:', 'Counter'], ['Group name:', 'New Group']]);
  assert.deepEqual(page.dialogs, []);
});

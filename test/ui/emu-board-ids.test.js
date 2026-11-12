// UI: every drawn board its own SVG ids (#2838): the Board Emulator and I/O Pin Planning's Board view drawn at the
// same time, their tabs switched, one closed, then the other; and a board drawn alone. The PCB's gradient resolves to
// the one in its own drawing, its colour the board's, with a plain fallback colour; no id twice in the document.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard } from '../../server/devices.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINK = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity blink is
  port (clk : in std_logic; led : out std_logic_vector(7 downto 0));
end blink;
architecture rtl of blink is
  signal q : unsigned(31 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(31 downto 24));
end rtl;
`;
const ICE = `library ieee; use ieee.std_logic_1164.all;
entity blink is
  port (clk, btn_n : in std_logic; led : out std_logic_vector(4 downto 0));
end blink;
architecture rtl of blink is
begin
  led <= "0000" & not btn_n;
end rtl;
`;

// each board's PCB: its gradient's top colour (the boards' own modules, web/js/emulator-<board>.js)
const PCB = { basys2: '#2156b3', nexys2: '#26493a', 's3e-starter': '#2a5c3d', nexys3: '#2b4f3e', atlys: '#2a4d40', icebreaker: '#1d3a7a', basys3: '#1f58ad', 'nexys-a7': '#1f5442' };
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

/** The boards drawn in the document, the visible first: for each, where its PCB's fill resolves ('own': its own
 *  drawing's gradient; else the drawing it resolves to, or 'none'), that gradient's top colour, the computed fill's
 *  fallback colour; and the ids the document has more than once. */
const pcbs = (page) => page.eval(() => {
  const arts = [...document.querySelectorAll('svg.emu-pcb-art')];
  const where = (a) => (a.closest('.emu-sim-host, .emulator, [data-doc="emulator"]') ? 'emulator' : a.closest('.pin-planner') ? 'pins' : '?');
  const seen = new Map();
  for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) || 0) + 1);
  return {
    boards: arts.map((a) => {
      const rect = a.querySelector('rect[fill^="url(#"]');
      const id = /url\(#([^)]+)\)/.exec(rect.getAttribute('fill'))[1];
      const g = document.getElementById(id);
      return {
        visible: a.getClientRects().length > 0,
        resolves: !g ? 'none' : a.contains(g) ? 'own' : 'other',
        colour: g?.querySelector('stop')?.getAttribute('stop-color') ?? null,
        fallback: /\)\s*(rgb\([^)]*\))/.exec(getComputedStyle(rect).fill)?.[1] ?? null,
      };
    }),
    twice: [...seen].filter(([, n]) => n > 1).map(([id]) => id),
    where: arts.map(where),
  };
});
const visible = (r) => r.boards.filter((b) => b.visible);

for (const board of Object.keys(PCB)) {
  uiTest(`#2838 the ${board}'s PCB keeps its colour: the Board Emulator and Pin Planning's Board view drawn together, tabs switched, closed; drawn alone`, E, async (page) => {
    const name = `Ids-${board}`;
    await makeProject(env, { name, board, device: resolveBoard(board).device, files: { 'src/blink.vhd': board === 'icebreaker' ? ICE : BLINK }, top: 'blink' });
    await page.setViewport(1366, 900);
    await page.openProject(name);
    assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
    const want = { visible: true, resolves: 'own', colour: PCB[board], fallback: rgb(PCB[board]) };
    const check = async (n, what) => {
      const r = await pcbs(page);
      assert.equal(r.boards.length, n, `${what}: boards drawn`);
      assert.deepEqual(r.twice, [], `${what}: no id twice`);
      assert.deepEqual(r.boards.map((b) => b.resolves), r.boards.map(() => 'own'), `${what}: every drawing's own gradient`);
      assert.deepEqual(visible(r), [want], what);
    };

    // the Board Emulator alone
    await page.eval(() => window.SilinxApp.openFile('src/blink.vhd'));
    await page.menu('Tools', 'Board Emulator');
    await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
    await check(1, 'the emulator alone');
    // Pin Planning's Board view too
    await page.menu('Tools', 'I/O Pin Planning');
    await page.waitFor(() => window.Silinx.active?.id === 'pins', [], { what: 'the planner' });
    await page.click('.doc:not([hidden]) .pin-planner .pp-bar .pp-view', { text: 'Board' });
    await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .pin-planner .pp-board .emu-pcb svg.emu-pcb-art'), [], { what: 'the board' });
    await check(2, 'the planner over the emulator');
    // back to the emulator, then to the planner
    await page.eval(() => window.SilinxApp.activateDoc(window.SilinxApp.findDoc('emulator')));
    await page.waitFor(() => window.Silinx.active?.id === 'emulator', [], { what: 'the emulator shown' });
    await check(2, 'the emulator over the planner');
    await page.eval(() => window.SilinxApp.activateDoc(window.SilinxApp.findDoc('pins')));
    await page.waitFor(() => window.Silinx.active?.id === 'pins', [], { what: 'the planner shown' });
    // the planner's board drawn again (the table, then the board)
    await page.click('.doc:not([hidden]) .pin-planner .pp-bar .pp-view', { text: 'Table' });
    await page.click('.doc:not([hidden]) .pin-planner .pp-bar .pp-view', { text: 'Board' });
    await check(2, 'the planner shown again');
    // the emulator closed: the planner alone; then the emulator opened again and the planner closed
    await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator'), { force: true }));
    await page.waitFor(() => !window.SilinxApp.findDoc('emulator'), [], { what: 'the emulator closed' });
    await check(1, 'the planner alone');
    await page.eval(() => window.SilinxApp.openFile('src/blink.vhd'));
    await page.menu('Tools', 'Board Emulator');
    await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running again' });
    await check(2, 'the emulator opened again');
    await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('pins'), { force: true }));
    await page.waitFor(() => !window.SilinxApp.findDoc('pins'), [], { what: 'the planner closed' });
    await check(1, 'the emulator alone again');
    await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator'), { force: true }));
    assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  });
}

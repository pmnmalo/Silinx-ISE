// UI: I/O Pin Planning's Board view (#2694, web/js/pinplanner-board.js): the board drawn as the Board Emulator draws
// it, the design's ports dragged onto its parts (a bus over a row of switches or LEDs, the segments and the anodes on a
// digit, a clock on its chip), an output on a switch warned, a part taken from another port, undone; the table the
// same assignments; the UCF written, on the Basys2 and the Nexys2; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk : in std_logic; sw : in std_logic_vector(3 downto 0); go : in std_logic;
  led : out std_logic_vector(3 downto 0); seg : out std_logic_vector(6 downto 0); an : out std_logic_vector(3 downto 0); y : out std_logic); end top;
architecture rtl of top is begin led <= sw; seg <= (others => go); an <= sw; y <= clk; end rtl;
`;
const P = '.doc:not([hidden]) .pin-planner';
// (the part scrolled into view first)
const dragTo = async (page, port, target) => {
  const [a, b] = await page.eval((p, n, t) => {
    const to = document.querySelector(`${p} .pp-board ${t}`);
    to.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = document.querySelector(`${p} .pp-port[data-port="${n}"]`).getBoundingClientRect(), q = to.getBoundingClientRect();
    return [{ x: r.left + r.width / 2, y: r.top + r.height / 2 }, { x: q.left + q.width / 2, y: q.top + q.height / 2 }];
  }, P, port, target);
  await page.drag(a, b);
};
const msg = (page) => page.eval((p) => [...document.querySelectorAll(`${p} .pp-drop-msg > div`)].map((d) => d.textContent), P);
const ports = (page) => page.eval((p) => [...document.querySelectorAll(`${p} .pp-port`)].map((e) => `${e.textContent}${e.classList.contains('placed') ? ' ✓' : ''}`), P);
const ucfLocs = (ucf) => [...ucf.matchAll(/NET "([^"]+)"\s+LOC = "([^"]+)"/g)].map(([, n, l]) => `${n}=${l}`);

async function openBoard(page, name, board) {
  await makeProject(env, { name, board, files: { 'src/top.vhd': TOP }, top: 'top' });
  await page.setViewport(1366, 900);
  await page.openProject(name);
  await page.menu('Tools', 'I/O Pin Planning');
  await page.waitFor((p) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${p} .pp-table tr`).length === 23, [P], { what: 'the planner' });
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Board' });
  await page.waitFor((p) => !!document.querySelector(`${p} .pp-board .emu-pcb [data-part="sw0"].pp-target`), [P], { what: 'the board' });
}
const saved = async (page, name) => {
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'), [], { what: 'pin planning saved' });
  return readWs(env, name, 'constraints/top.ucf');
};

uiTest('#2694 I/O Pin Planning on the Basys2: ports dragged onto its switches, LEDs, digits and clock; an output on a switch warned; a part taken; undone; the table and the UCF', E, async (page) => {
  await openBoard(page, 'PinBoardB2', 'basys2');
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-bar .pp-view`)].map((b) => `${b.textContent}${b.classList.contains('on') ? ' (on)' : ''}`), P), ['Table', 'Board (on)']);
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-table`).hidden, P), true);
  assert.deepEqual(await ports(page), ['→clk0/1', '→sw(3:0)0/4', '→go0/1', '←led(3:0)0/4', '←seg(6:0)0/7', '←an(3:0)0/4', '←y0/1']);
  // the resources the drawing has no part for: chips under it
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-chip b`)].map((b) => b.textContent), P),
    ['mclk', 'uclk', 'seg', 'dp', 'vga_red', 'vga_green', 'vga_blue', 'vga_hsync', 'vga_vsync', 'ps2_clk', 'ps2_data', 'ja', 'jb', 'jc', 'jd', 'rx', 'tx']);
  // a bus on SW0: SW0..SW3; on LD4: LD4..LD7; seg and an on a digit; clk on the oscillator's chip
  await dragTo(page, 'sw', '[data-part="sw0"]');
  assert.deepEqual(await msg(page), ['sw<0> → sw<0>, sw<1> → sw<1>, sw<2> → sw<2>, sw<3> → sw<3>']);
  await dragTo(page, 'led', '[data-part="led4"]');
  assert.deepEqual(await msg(page), ['led<0> → led<4>, led<1> → led<5>, led<2> → led<6>, led<3> → led<7>']);
  await dragTo(page, 'seg', '[data-part="an1"]');
  await dragTo(page, 'an', '[data-part="an3"]');
  assert.deepEqual(await msg(page), ['an<0> → an<0>, an<1> → an<1>, an<2> → an<2>, an<3> → an<3>']);
  await dragTo(page, 'clk', '.pp-chip[data-res="mclk"]');
  // the parts show the bits placed on them
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-board .emu-port`)].map((e) => e.textContent).join(' '), P),
    'led<3> — led<2> — led<1> — led<0> — — sw<3> — sw<2> — sw<1> — sw<0> an<3> an<2> an<1> an<0> — — — —');
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-chip[data-res="mclk"]`).textContent, P), 'mclk clk');
  // an output on a switch: placed, warned (here and in the console)
  await dragTo(page, 'y', '[data-part="sw7"]');
  assert.deepEqual(await msg(page), ['y → sw<7>', '⚠ y is an output: sw is an input of the board']);
  assert.match(await page.consoleText(), /I\/O Pin Planning: y is an output: sw is an input of the board\./);
  // go on SW7: taken from y; undone, y back on it; redone
  await dragTo(page, 'go', '[data-part="sw7"]');
  assert.deepEqual(await msg(page), ['go → sw<7>', 'sw<7> taken from y']);
  assert.deepEqual((await ports(page)).slice(-2), ['←an(3:0)4/4 ✓', '←y0/1']);
  await page.eval(() => window.SilinxApp.findDoc('pins').pinPlanner.undo());
  assert.deepEqual(await page.eval((p) => document.querySelector(`${p} [data-part="sw7"]`).title, P), 'sw<7> (N3): y');
  await page.eval(() => window.SilinxApp.findDoc('pins').pinPlanner.redo());
  assert.deepEqual(await page.eval((p) => document.querySelector(`${p} [data-part="sw7"]`).title, P), 'sw<7> (N3): go');
  // the table: the same assignments
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Table' });
  assert.deepEqual(await page.eval((p) => Object.fromEntries([...document.querySelectorAll(`${p} .pp-table tr`)].slice(1).map((r) => [r.cells[0].textContent, r.cells[3].querySelector('input').value])), P), {
    clk: 'B8', 'sw<0>': 'P11', 'sw<1>': 'L3', 'sw<2>': 'K3', 'sw<3>': 'B4', go: 'N3', 'led<0>': 'N5', 'led<1>': 'N4', 'led<2>': 'P4', 'led<3>': 'G1',
    'seg<0>': 'L14', 'seg<1>': 'H12', 'seg<2>': 'N14', 'seg<3>': 'N11', 'seg<4>': 'P12', 'seg<5>': 'L13', 'seg<6>': 'M12',
    'an<0>': 'F12', 'an<1>': 'J12', 'an<2>': 'M13', 'an<3>': 'K14', y: '',
  });
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-status`).textContent, P), '21/22 I/Os assigned');
  // the UCF: the pins, clk's period
  const ucf = await saved(page, 'PinBoardB2');
  assert.deepEqual(ucfLocs(ucf), ['clk=B8', 'sw<0>=P11', 'sw<1>=L3', 'sw<2>=K3', 'sw<3>=B4', 'go=N3', 'led<0>=N5', 'led<1>=N4', 'led<2>=P4', 'led<3>=G1',
    'seg<0>=L14', 'seg<1>=H12', 'seg<2>=N14', 'seg<3>=N11', 'seg<4>=P12', 'seg<5>=L13', 'seg<6>=M12', 'an<0>=F12', 'an<1>=J12', 'an<2>=M13', 'an<3>=K14']);
  assert.match(ucf, /PERIOD "clk" 20 ns HIGH 50%/);
  // the only warning of the session: the drop's
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR|warn/i.test(l) || /Pin Planning:/.test(l)), ['I/O Pin Planning: y is an output: sw is an input of the board.']);
});

uiTest('#2694 I/O Pin Planning on the Nexys2: a bus wider than its buttons warned, the rest placed, then moved to a digit; an input on an LED warned; the UCF; Portuguese', E, async (page) => {
  await openBoard(page, 'PinBoardN2', 'nexys2');
  // seg on the buttons: an output on an input of the board, 3 bits left; the 4 placed
  await dragTo(page, 'seg', '[data-part="btn1"]');
  assert.deepEqual(await msg(page), ['seg<0> → btn<0>, seg<1> → btn<1>, seg<2> → btn<2>, seg<3> → btn<3>',
    '⚠ seg is an output: btn is an input of the board', '⚠ seg has 7 bits, btn 4: seg<4>, seg<5>, seg<6> not placed']);
  assert.deepEqual(await ports(page).then((l) => l[4]), '←seg(6:0)4/7');
  // led on the LEDs from LD0, sw on the buttons (taken from seg), seg moved to a digit
  await dragTo(page, 'led', '[data-part="led0"]');
  await dragTo(page, 'sw', '[data-part="btn2"]');
  assert.deepEqual(await msg(page), ['sw<0> → btn<0>, sw<1> → btn<1>, sw<2> → btn<2>, sw<3> → btn<3>',
    'btn<0> taken from seg<0>', 'btn<1> taken from seg<1>', 'btn<2> taken from seg<2>', 'btn<3> taken from seg<3>']);
  await dragTo(page, 'seg', '[data-part="an0"]');
  await dragTo(page, 'an', '[data-part="an2"]');
  // an input on an LED: warned
  await dragTo(page, 'go', '[data-part="led7"]');
  assert.deepEqual(await msg(page), ['go → led<7>', '⚠ go is an input: led is an output of the board']);
  // the table in sync, the UCF written
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Table' });
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-status`).textContent, P), '20/22 I/Os assigned');
  const ucf = await saved(page, 'PinBoardN2');
  assert.deepEqual(ucfLocs(ucf), ['sw<0>=B18', 'sw<1>=D18', 'sw<2>=E18', 'sw<3>=H13', 'go=R4', 'led<0>=J14', 'led<1>=J15', 'led<2>=K15', 'led<3>=K14',
    'seg<0>=L18', 'seg<1>=F18', 'seg<2>=D17', 'seg<3>=D16', 'seg<4>=G14', 'seg<5>=J17', 'seg<6>=H14', 'an<0>=F17', 'an<1>=H17', 'an<2>=C18', 'an<3>=F15']);
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR|warn/i.test(l) || /Pin Planning:/.test(l)), [
    'I/O Pin Planning: seg is an output: btn is an input of the board.', 'I/O Pin Planning: seg has 7 bits, btn 4: seg<4>, seg<5>, seg<6> not placed.',
    'I/O Pin Planning: go is an input: led is an output of the board.']);
  // in Portuguese: the view's labels, a drop's messages
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Placa' });
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-bar .pp-view`)].map((b) => b.textContent), P), ['Tabela', 'Placa']);
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-board h4`)].map((b) => b.textContent), P), ['Portas', 'Outros recursos da placa']);
  assert.match(await page.eval((p) => document.querySelector(`${p} .emu-board-note`).textContent, P), /Arraste uma porta para uma peça da placa$/);
  await dragTo(page, 'y', '[data-part="sw0"]');
  await dragTo(page, 'clk', '[data-part="sw0"]');
  await page.waitFor((p) => document.querySelector(`${p} .pp-drop-msg`).textContent.includes('tirado'), [P], { what: 'translated' });
  assert.deepEqual(await msg(page), ['clk → sw<0>', 'sw<0> tirado a y']);
  await dragTo(page, 'y', '[data-part="sw1"]');
  await page.waitFor((p) => document.querySelector(`${p} .pp-drop-msg`).textContent.includes('saída'), [P], { what: 'translated' });
  assert.deepEqual(await msg(page), ['y → sw<1>', '⚠ y é uma saída: sw é uma entrada da placa']);
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
});

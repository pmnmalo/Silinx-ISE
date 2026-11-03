// UI: I/O Pin Planning's Board view (#2694, #2715, web/js/pinplanner-board.js, pinplanner-ports.js): the board drawn as
// the Board Emulator draws it, the design's ports dragged from the Ports panel on its left (the editors' side panel,
// folded to a strip) onto its parts (a bus over a row of switches or LEDs, the segments and the anodes on a digit) or
// onto the rows of Board Resources (the clock, VGA, a Pmod); a bus expanded, its bits dragged one by one; a bit taken
// off its pin (its ✕, a part's or a row's right-click menu); an output on a switch warned, a part taken from another
// port, undone; what a drop says in the console only; the table the same assignments; the UCF written, on the Basys2
// and the Nexys2; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { BOARDS } from '../../server/boards.js';

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
const pins = (board, res) => BOARDS.find((b) => b.id === board).resources.find((r) => r.name === res).pins;
// a port (or a bit: its net) dragged onto a target of the planner (the target scrolled into view first)
const dragTo = async (page, from, target) => {
  const [a, b] = await page.eval((p, f, t) => {
    const to = document.querySelector(`${p} ${t}`);
    to.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const el = document.querySelector(`${p} .pp-ports-side ${/</.test(f) ? `.pp-bit[data-net="${f}"]` : `.pp-port[data-port="${f}"]`}`);
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect(), q = to.getBoundingClientRect();
    return [{ x: r.left + r.width / 3, y: r.top + r.height / 2 }, { x: q.left + q.width / 2, y: q.top + q.height / 2 }];
  }, P, from, target);
  await page.drag(a, b);
};
const ports = (page) => page.eval((p) => [...document.querySelectorAll(`${p} .pp-ports-side .pp-port`)].map((e) => `${e.classList.contains('pp-bit') ? '  ' : ''}${e.textContent}`), P);
// the console's lines of I/O Pin Planning, since the last read
let seen = 0;
const said = async (page) => {
  const lines = (await page.consoleText()).split('\n').filter((l) => /Pin Planning:/.test(l));
  const r = lines.slice(seen);
  seen = lines.length;
  return r;
};
const ucfLocs = (ucf) => [...ucf.matchAll(/NET "([^"]+)"\s+LOC = "([^"]+)"/g)].map(([, n, l]) => `${n}=${l}`);
const menu = (page) => page.eval(() => [...document.querySelectorAll('.menu-popup .mi .lbl')].map((e) => e.textContent));

async function openBoard(page, name, board) {
  await makeProject(env, { name, board, files: { 'src/top.vhd': TOP }, top: 'top' });
  await page.setViewport(1366, 900);
  await page.eval(async () => {
    const { prefKey } = await import('/js/prefs.js');
    localStorage.removeItem(prefKey('silinx.pins.ports.folded')); localStorage.removeItem(prefKey('silinx.pins.props.folded'));
  });
  await page.openProject(name);
  await page.menu('Tools', 'I/O Pin Planning');
  await page.waitFor((p) => window.Silinx.active?.id === 'pins' && document.querySelectorAll(`${p} .pp-table tr`).length === 23, [P], { what: 'the planner' });
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Board' });
  await page.waitFor((p) => !!document.querySelector(`${p} .pp-board .emu-pcb [data-part="sw0"].pp-target`), [P], { what: 'the board' });
  seen = 0;
}
const saved = async (page, name) => {
  await page.waitFor(() => !window.Silinx.active.tab.classList.contains('dirty'), [], { what: 'pin planning saved' });
  return readWs(env, name, 'constraints/top.ucf');
};

uiTest('#2694 #2715 I/O Pin Planning on the Basys2: the Ports panel; ports onto the switches, LEDs, digits, the clock\'s and VGA\'s rows; a bus\'s bits one by one; bits taken off; folded; the table and the UCF', E, async (page) => {
  await openBoard(page, 'PinBoardB2', 'basys2');
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-bar .pp-view`)].map((b) => `${b.textContent}${b.classList.contains('on') ? ' (on)' : ''}`), P), ['Table', 'Board (on)']);
  // the Ports panel: the editors' side panel, on the left of the board; the board alone in the middle (nothing under it)
  const look = () => page.eval((p) => {
    const pp = document.querySelector(p), side = pp.querySelector('.pp-ports-side'), board = pp.querySelector('.pp-board');
    return { cap: side.querySelector('.asm-cap').textContent, left: side.getBoundingClientRect().right <= board.getBoundingClientRect().left + 1,
      width: side.offsetWidth, shown: side.getClientRects().length > 0, table: !pp.querySelector('.pp-table').hidden,
      under: [...board.children].map((e) => e.className), resFolded: pp.classList.contains('props-folded') };
  }, P);
  let L = await look();
  assert.deepEqual(L, { cap: 'Ports', left: true, width: 200, shown: true, table: false, under: ['emu-board-wrap'], resFolded: false });
  assert.deepEqual(await ports(page), ['→clk—', '▸→sw(3:0)0/4', '→go—', '▸←led(3:0)0/4', '▸←seg(6:0)0/7', '▸←an(3:0)0/4', '←y—']);
  // a bus on SW0: SW0..SW3; on LD4: LD4..LD7; seg and an on a digit; what each placed, in the console
  await dragTo(page, 'sw', '[data-part="sw0"]');
  await dragTo(page, 'led', '[data-part="led4"]');
  await dragTo(page, 'seg', '[data-part="an1"]');
  await dragTo(page, 'an', '[data-part="an3"]');
  assert.deepEqual(await said(page), [
    'I/O Pin Planning: sw<0> → sw<0>, sw<1> → sw<1>, sw<2> → sw<2>, sw<3> → sw<3>.',
    'I/O Pin Planning: led<0> → led<4>, led<1> → led<5>, led<2> → led<6>, led<3> → led<7>.',
    'I/O Pin Planning: seg<0> → seg<0>, seg<1> → seg<1>, seg<2> → seg<2>, seg<3> → seg<3>, seg<4> → seg<4>, seg<5> → seg<5>, seg<6> → seg<6>.',
    'I/O Pin Planning: an<0> → an<0>, an<1> → an<1>, an<2> → an<2>, an<3> → an<3>.']);
  // what the drawing has no part for: onto the rows of Board Resources (the clock, VGA's hsync)
  await dragTo(page, 'clk', '.pp-res .res[data-res="mclk"]');
  await dragTo(page, 'y', '.pp-res .res[data-res="vga_hsync"]');
  assert.deepEqual(await said(page), ['I/O Pin Planning: clk → mclk.', 'I/O Pin Planning: y → vga_hsync.']);
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-res .res.used`)].filter((e) => /clk|vga_hsync/.test(e.dataset.res)).map((e) => e.textContent), P),
    [`mclk${pins('basys2', 'mclk')[0]}`, `vga_hsync${pins('basys2', 'vga_hsync')[0]}`]);
  // the parts show the bits placed on them
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-board .emu-port`)].map((e) => e.textContent).join(' '), P),
    'led<3> — led<2> — led<1> — led<0> — — sw<3> — sw<2> — sw<1> — sw<0> an<3> an<2> an<1> an<0> — — — —');
  // a bus expanded: its bits, where each is; one moved alone (the others kept), then one taken off by its ✕
  await page.click(`${P} .pp-port[data-port="led"] .pp-exp`);
  assert.deepEqual((await ports(page)).slice(3, 8), ['▸←led(3:0)4/4✕', '  led<3>led<7>✕', '  led<2>led<6>✕', '  led<1>led<5>✕', '  led<0>led<4>✕']);
  await dragTo(page, 'led<0>', '[data-part="led0"]');
  await page.click(`${P} .pp-bit[data-net="led<3>"] .pp-x`);
  assert.deepEqual((await ports(page)).slice(3, 8), ['▸←led(3:0)3/4✕', '  led<3>—', '  led<2>led<6>✕', '  led<1>led<5>✕', '  led<0>led<0>✕']);
  assert.deepEqual(await said(page), ['I/O Pin Planning: led<0> → led<0>.', 'I/O Pin Planning: removed from their pins: led<3> (led<7>).']);
  // a bit off a part by its right-click menu; off a row of Board Resources by its own (clk: its period gone too)
  await page.rightClick(`${P} [data-part="sw1"]`);
  assert.deepEqual(await menu(page), ['Remove sw<1> from its pin']);
  await page.click('.menu-popup .mi', { text: 'Remove sw<1> from its pin' });
  await page.eval((p) => document.querySelector(`${p} .pp-res .res[data-res="mclk"]`).scrollIntoView({ block: 'center' }), P);
  await page.rightClick(`${P} .pp-res .res[data-res="mclk"]`);
  await page.click('.menu-popup .mi', { text: 'Remove clk from its pin' });
  assert.deepEqual(await said(page), ['I/O Pin Planning: removed from their pins: sw<1> (sw<1>).', 'I/O Pin Planning: removed from their pins: clk (mclk).']);
  // a free part: no menu
  await page.rightClick(`${P} [data-part="btn0"]`);
  assert.deepEqual(await menu(page), []);
  // go on SW0: taken from sw<0>, said so; undone, sw<0> back; redone
  await dragTo(page, 'go', '[data-part="sw0"]');
  assert.deepEqual(await said(page), ['I/O Pin Planning: go → sw<0>.', 'I/O Pin Planning: sw<0> taken from sw<0>.']);
  await page.eval(() => window.SilinxApp.findDoc('pins').pinPlanner.undo());
  assert.equal(await page.eval((p) => document.querySelector(`${p} [data-part="sw0"]`).title, P), 'sw<0> (P11): sw<0>');
  await page.eval(() => window.SilinxApp.findDoc('pins').pinPlanner.redo());
  assert.equal(await page.eval((p) => document.querySelector(`${p} [data-part="sw0"]`).title, P), 'sw<0> (P11): go');
  // the Ports panel folded to a strip (Board Resources not), remembered; a click on the strip expands it
  await page.click(`${P} .pp-ports-side .asm-fold`);
  L = await look();
  assert.deepEqual([L.width, L.resFolded], [24, false]);
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-ports-side .asm-fold`).title, P), 'Expand the Ports panel');
  assert.equal(await page.eval(async () => localStorage.getItem((await import('/js/prefs.js')).prefKey('silinx.pins.ports.folded'))), '1');
  await page.click(`${P} .pp-ports-side`);
  assert.equal((await look()).width, 200);
  // the table: the Ports panel hidden; the same assignments
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Table' });
  L = await look();
  assert.deepEqual([L.shown, L.table], [false, true]);
  const hsync = pins('basys2', 'vga_hsync')[0];
  assert.deepEqual(await page.eval((p) => Object.fromEntries([...document.querySelectorAll(`${p} .pp-table tr`)].slice(1).map((r) => [r.cells[0].textContent, r.cells[3].querySelector('input').value])), P), {
    clk: '', 'sw<0>': '', 'sw<1>': '', 'sw<2>': 'K3', 'sw<3>': 'B4', go: 'P11', 'led<0>': 'M5', 'led<1>': 'N4', 'led<2>': 'P4', 'led<3>': '',
    'seg<0>': 'L14', 'seg<1>': 'H12', 'seg<2>': 'N14', 'seg<3>': 'N11', 'seg<4>': 'P12', 'seg<5>': 'L13', 'seg<6>': 'M12',
    'an<0>': 'F12', 'an<1>': 'J12', 'an<2>': 'M13', 'an<3>': 'K14', y: hsync,
  });
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-status`).textContent, P), '18/22 I/Os assigned');
  // the UCF: the pins; no period (clk taken off its pin)
  const ucf = await saved(page, 'PinBoardB2');
  assert.deepEqual(ucfLocs(ucf), ['sw<2>=K3', 'sw<3>=B4', 'go=P11', 'led<0>=M5', 'led<1>=N4', 'led<2>=P4',
    'seg<0>=L14', 'seg<1>=H12', 'seg<2>=N14', 'seg<3>=N11', 'seg<4>=P12', 'seg<5>=L13', 'seg<6>=M12', 'an<0>=F12', 'an<1>=J12', 'an<2>=M13', 'an<3>=K14', `y=${hsync}`]);
  assert.doesNotMatch(ucf, /PERIOD/);
  // no warning of I/O Pin Planning, nor any error
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln.warn, #console-log .ln.err')].map((e) => e.textContent).filter((t) => /Pin Planning/.test(t))), []);
});

uiTest('#2694 #2715 I/O Pin Planning on the Nexys2: a bus wider than its buttons warned, the rest placed, then moved to a digit; an input on an LED warned; a bus on a Pmod\'s row; the console; the UCF; Portuguese', E, async (page) => {
  await openBoard(page, 'PinBoardN2', 'nexys2');
  // seg on the buttons: an output on an input of the board, 3 bits left; the 4 placed; warned in the console
  await dragTo(page, 'seg', '[data-part="btn1"]');
  assert.deepEqual(await said(page), ['I/O Pin Planning: seg<0> → btn<0>, seg<1> → btn<1>, seg<2> → btn<2>, seg<3> → btn<3>.',
    'I/O Pin Planning: seg is an output: btn is an input of the board.', 'I/O Pin Planning: seg has 7 bits, btn 4: seg<4>, seg<5>, seg<6> not placed.']);
  assert.equal((await ports(page))[4], '▸←seg(6:0)4/7✕');
  // led on the LEDs from LD0, sw on the buttons (taken from seg), seg moved to a digit
  await dragTo(page, 'led', '[data-part="led0"]');
  await dragTo(page, 'sw', '[data-part="btn2"]');
  assert.deepEqual((await said(page)).slice(1), ['I/O Pin Planning: sw<0> → btn<0>, sw<1> → btn<1>, sw<2> → btn<2>, sw<3> → btn<3>.',
    'I/O Pin Planning: btn<0> taken from seg<0>.', 'I/O Pin Planning: btn<1> taken from seg<1>.', 'I/O Pin Planning: btn<2> taken from seg<2>.', 'I/O Pin Planning: btn<3> taken from seg<3>.']);
  await dragTo(page, 'seg', '[data-part="an0"]');
  // an on the Pmod JA's row ja<6>: moved back to fit, ja<4>..ja<7>
  await dragTo(page, 'an', '.pp-res .res[data-res="ja"][data-idx="6"]');
  // an input on an LED: warned
  await dragTo(page, 'go', '[data-part="led7"]');
  assert.deepEqual((await said(page)).slice(1), ['I/O Pin Planning: an<0> → ja<4>, an<1> → ja<5>, an<2> → ja<6>, an<3> → ja<7>.',
    'I/O Pin Planning: go → led<7>.', 'I/O Pin Planning: go is an input: led is an output of the board.']);
  // the warnings of I/O Pin Planning: the drops', in the console
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#console-log .ln.warn')].map((e) => e.textContent).filter((t) => /Pin Planning/.test(t))), [
    'I/O Pin Planning: seg is an output: btn is an input of the board.', 'I/O Pin Planning: seg has 7 bits, btn 4: seg<4>, seg<5>, seg<6> not placed.',
    'I/O Pin Planning: go is an input: led is an output of the board.']);
  // the table in sync, the UCF written
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Table' });
  assert.equal(await page.eval((p) => document.querySelector(`${p} .pp-status`).textContent, P), '20/22 I/Os assigned');
  const ucf = await saved(page, 'PinBoardN2');
  const ja = pins('nexys2', 'ja');
  assert.deepEqual(ucfLocs(ucf), ['sw<0>=B18', 'sw<1>=D18', 'sw<2>=E18', 'sw<3>=H13', 'go=R4', 'led<0>=J14', 'led<1>=J15', 'led<2>=K15', 'led<3>=K14',
    'seg<0>=L18', 'seg<1>=F18', 'seg<2>=D17', 'seg<3>=D16', 'seg<4>=G14', 'seg<5>=J17', 'seg<6>=H14', ...ja.slice(4).map((l, i) => `an<${i}>=${l}`)]);
  // in Portuguese: the panel, its buttons' tips, a part's menu (the console's lines in English, as every process's)
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('pt')));
  await page.waitFor(() => document.documentElement.lang === 'pt');
  await page.click(`${P} .pp-bar .pp-view`, { text: 'Placa' });
  assert.deepEqual(await page.eval((p) => [...document.querySelectorAll(`${p} .pp-bar .pp-view`)].map((b) => b.textContent), P), ['Tabela', 'Placa']);
  assert.deepEqual(await page.eval((p) => {
    const s = document.querySelector(`${p} .pp-ports-side`);
    return [s.querySelector('.asm-cap').textContent, s.querySelector('.asm-fold').title, s.querySelector('.pp-port[data-port="led"]').title, s.querySelector('.pp-port[data-port="led"] .pp-exp').title, s.querySelector('.pp-port[data-port="go"] .pp-x').title];
  }, P), ['Portas', 'Recolher o painel Portas', 'Arraste-a para uma peça da placa ou uma linha de Recursos da Placa', 'Expandir os seus bits', 'Retirá-la do seu pino']);
  assert.match(await page.eval((p) => document.querySelector(`${p} .emu-board-note`).textContent, P), /Arraste uma porta para uma peça da placa$/);
  await dragTo(page, 'y', '[data-part="sw0"]');
  await dragTo(page, 'clk', '[data-part="sw0"]');
  await page.rightClick(`${P} [data-part="sw0"]`);
  assert.deepEqual(await menu(page), ['Retirar clk do seu pino']);
  await page.click('.menu-popup .mi', { text: 'Retirar clk do seu pino' });
  assert.deepEqual(await said(page), ['I/O Pin Planning: y → sw<0>.', 'I/O Pin Planning: y is an output: sw is an input of the board.',
    'I/O Pin Planning: clk → sw<0>.', 'I/O Pin Planning: sw<0> taken from y.', 'I/O Pin Planning: removed from their pins: clk (sw<0>).']);
  await page.eval(() => import('/js/i18n.js').then((m) => m.setLanguage('en')));
});

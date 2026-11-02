// UI: the Board Emulator's serial terminal (web/js/emulator-serial.js, #2536): a UART echo on a Nexys2's RS-232 port
// (test/fixtures/compiled-sim/uart_echo.vhd): the line typed comes back; its pins, its
// rate, shown or hidden with the other modules, in Portuguese; the event-driven engine cannot; no terminal on a
// board whose UCF wires no serial port.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const ECHO = fs.readFileSync(path.join(ROOT, 'test/fixtures/compiled-sim/uart_echo.vhd'), 'utf8');
const UCF = `NET "clk" LOC = "B8"; NET "rx" LOC = "U6"; NET "tx" LOC = "P9";
NET "led<0>" LOC = "J14"; NET "led<1>" LOC = "J15"; NET "led<2>" LOC = "K15"; NET "led<3>" LOC = "K14";
NET "led<4>" LOC = "E17"; NET "led<5>" LOC = "P15"; NET "led<6>" LOC = "F4"; NET "led<7>" LOC = "R4";
`;
const DOC = '.doc:not([hidden])';
const open = async (page) => {
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
};
const out = (page) => page.eval((d) => document.querySelector(`${d} .emu-serial-out`).textContent, DOC);
const type = (page, text) => page.eval((d, t) => {
  const i = document.querySelector(`${d} .emu-serial-in`);
  i.value = t;
  i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}, DOC, text);

uiTest('#2536 the serial terminal: a line typed comes back from a UART echo, its rate, its pins; shown or hidden; in Portuguese; the event-driven engine cannot', E, async (page) => {
  await makeProject(env, { name: 'EmuSerial', board: 'nexys2', top: 'uart_echo', constraints: 'constraints/echo.ucf', files: { 'src/uart_echo.vhd': ECHO, 'constraints/echo.ucf': UCF } });
  await page.openProject('EmuSerial');
  await open(page);
  assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled');
  // the box: its title, its rate, its pins (the Nexys2's RS-232 port), before the side panel
  assert.deepEqual(await page.eval((d) => {
    const b = document.querySelector(`${d} .emu-serial`);
    return [b.querySelector('h4').textContent, b.querySelector('select').value, b.querySelector('.emu-hint').textContent, b.nextElementSibling.classList.contains('emu-side')];
  }, DOC), ['Serial terminal', '9600', 'TX: tx (pin P9) · RX: rx (pin U6)', true]);
  // a line: back as typed, a CR its end
  await type(page, 'Hello, FPGA');
  await page.waitFor((d) => document.querySelector(`${d} .emu-serial-out`).textContent === 'Hello, FPGA\n', [DOC], { what: 'the echo', timeout: 30000 });
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-serial-in`).value, DOC), '');
  // two lines more, the second sent before the first is back: in order
  await type(page, 'ab');
  await type(page, 'é');
  await page.waitFor((d) => document.querySelector(`${d} .emu-serial-out`).textContent === 'Hello, FPGA\nab\n<C3><A9>\n', [DOC], { what: 'two lines', timeout: 30000 });
  // hidden: what comes is kept; shown again, there
  assert.deepEqual(await page.eval((d) => [...document.querySelectorAll(`${d} [data-module-toggle]`)].map((c) => c.dataset.moduleToggle), DOC), ['serial']);
  await page.eval((d) => document.querySelector(`${d} [data-module-toggle="serial"]`).click(), DOC);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-serial`).offsetHeight, DOC), 0);
  await type(page, 'x');
  await new Promise((r) => setTimeout(r, 1500));
  await page.eval((d) => document.querySelector(`${d} [data-module-toggle="serial"]`).click(), DOC);
  await page.waitFor((d) => document.querySelector(`${d} .emu-serial-out`).textContent.endsWith('<A9>\nx\n'), [DOC], { what: 'kept while hidden', timeout: 30000 });
  // Clear
  await page.click(`${DOC} .emu-serial .btn`, { text: 'Clear' });
  assert.equal(await out(page), '');
  // another rate than the design's: what comes back is not the line
  await page.eval((d) => { const s = document.querySelector(`${d} .emu-serial select`); s.value = '19200'; s.dispatchEvent(new Event('change')); }, DOC);
  await type(page, 'UU');
  await new Promise((r) => setTimeout(r, 2000));
  assert.notEqual(await out(page), 'UU\n');
  await page.eval((d) => { const s = document.querySelector(`${d} .emu-serial select`); s.value = '9600'; s.dispatchEvent(new Event('change')); }, DOC);
  // in Portuguese: no untranslated text
  await page.click(`${DOC} .emu-bar .btn`, { text: '⏸ Pause' });
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-serial')));
  await setLang('pt');
  const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-serial')));
  assert.ok(pt.includes('Terminal série') && pt.includes('TX: tx (pino P9) · RX: rx (pino U6)'), pt.join(' | '));
  assert.match(await page.eval((d) => document.querySelector(`${d} .emu-bar`).textContent, DOC), /Terminal série/);
  await setLang('en');
  assert.deepEqual(untranslated(en, pt, [/^\d+ baud$/]), []);
  // the event-driven engine: the terminal says it needs the compiled one, nothing can be sent
  await page.eval(() => { const s = [...document.querySelectorAll('.doc:not([hidden]) .emu-bar select')].find((x) => [...x.options].some((o) => o.value === 'compiled')); s.value = 'event'; s.dispatchEvent(new Event('change')); });
  await page.waitFor(() => window.Silinx.active.view?.engine === 'event' && window.Silinx.active.view.outputs, [], { what: 'the event-driven engine' });
  assert.deepEqual(await page.eval((d) => [document.querySelector(`${d} .emu-serial .emu-hint`).textContent, document.querySelector(`${d} .emu-serial-in`).disabled], DOC),
    ['The serial terminal needs the compiled engine (the event-driven one is too slow for a frame)', true]);
  assert.deepEqual(page.dialogs, []);
});

uiTest('#2536 no serial port in the UCF: no terminal', E, async (page) => {
  const RTL = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0)); end top;\narchitecture r of top is begin led <= sw; end r;\n';
  await makeProject(env, { name: 'EmuNoSerial', board: 'nexys2', files: { 'src/top.vhd': RTL }, top: 'top' });
  await page.openProject('EmuNoSerial');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await open(page);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-serial`), DOC), null);
  assert.doesNotMatch(await page.eval((d) => document.querySelector(`${d} .emu-bar`).textContent, DOC), /Serial terminal/);
});

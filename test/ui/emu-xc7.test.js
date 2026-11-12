// UI: the Board Emulator on the 7-series' boards (#3704): a Basys 3 project has Emulate on Board in its processes (its RTL
// model only: the flow makes no simulation model), the Silinx toolbar's Emulate and the Tasks interface's Emulate task; the
// emulator opens on the board drawn as the real one (#3706), its pins the XDC's, and reacts: the
// switches and the centre button drive the LEDs, SW0 the digit. In Portuguese; both interfaces and the Tasks interface. Its warnings Check Syntax's only.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { resolveBoard } from '../../server/devices.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// SW3..SW0 on LD3..LD0, BTNC (btn(0)) on LD4; the rightmost digit 1 when SW0 is on, else 0
const TOP = `library ieee; use ieee.std_logic_1164.all;
entity emu7 is
  port (clk : in std_logic; sw : in std_logic_vector(3 downto 0); btn : in std_logic_vector(4 downto 0);
        led : out std_logic_vector(7 downto 0); seg : out std_logic_vector(6 downto 0); dp : out std_logic; an : out std_logic_vector(3 downto 0));
end emu7;
architecture rtl of emu7 is
begin
  led <= "000" & btn(0) & sw;
  seg <= "1111001" when sw(0) = '1' else "1000000";
  dp <= '1';
  an <= "1110";
end rtl;
`;
const warnings = async (page) => {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  // (the console's: the Check Syntax the emulator runs first, its inputs the design does not read)
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /WARNING|ERROR/.test(l)), [
    'WARNING:Silinx:647 - "src/emu7.vhd" Line 3: Input <clk> is never used.', 'WARNING:Silinx:647 - "src/emu7.vhd" Line 3: Input <btn<4:1>> is never used.']);
};
// what the board shows: the LEDs (rounded), the rightmost digit's lit segments (a..g)
const settled = (page, want, what) => page.waitFor((w) => {
  const o = window.Silinx.active?.view?.outputs;
  return o && JSON.stringify({ leds: o.leds.map((v) => Math.round(v)), digit: o.digits[0] ? o.digits[0].seg.map((v) => Math.round(v)).join('') : null }) === w;
}, [JSON.stringify(want)], { what });
const ZERO = '1111110', ONE = '0110000';
// (the LEDs the design drives: its led's 8, LD0..LD7)
const LEDS = (...on) => Array.from({ length: 8 }, (_, k) => (on.includes(k) ? 1 : 0));

/** A Basys 3 project with the design, its XDC the board's pins (Update Constraints). */
async function basys3(page, name) {
  await makeProject(env, { name, board: 'basys3', device: resolveBoard('basys3').device, files: { 'src/emu7.vhd': TOP }, top: 'emu7', constraints: 'constraints/emu7.xdc' });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  assert.match(await readWs(env, name, 'constraints/emu7.xdc'), /set_property -dict \{ PACKAGE_PIN V17 IOSTANDARD LVCMOS33 \} \[get_ports \{sw\[0\]\}\]/);
}

/** The emulator running, and reacting: SW0 and SW2 on, BTNC held; then all released. */
async function reacts(page) {
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
  // the Basys 3 drawn as the real board (#3706): its name, 4 digits, 16 LEDs, 16 switches, 5 buttons; its clock the XDC's
  assert.deepEqual(await page.eval(() => {
    const b = document.querySelector('.doc:not([hidden]) .emu-board-wrap');
    return [b?.querySelector('.emu-board-note [data-no-i18n]').textContent, !!b.querySelector('.emu-pcb'), ...['svg[viewBox="0 0 44 64"]', '.emu-led', '.emu-sw', '.emu-btn'].map((s) => b.querySelectorAll(s).length)];
  }), ['Digilent Basys 3 — emu7', true, 4, 16, 16, 5]);
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-note').textContent), /Clock clk: 100 MHz on the board/);
  await settled(page, { leds: LEDS(), digit: ZERO }, 'at rest');
  // (the parts by their names on the board: sw0, btn0 = BTNC)
  const click = (part, opts) => page.click(`.doc:not([hidden]) [data-part="${part}"] > *`, opts?.shift ? { modifiers: 8 } : {});
  await click('sw0');
  await settled(page, { leds: LEDS(0), digit: ONE }, 'SW0 on: LD0, the digit 1');
  await click('sw2');
  await settled(page, { leds: LEDS(0, 2), digit: ONE }, 'SW2 on: LD2');
  await click('btn0', { shift: true });
  await settled(page, { leds: LEDS(0, 2, 4), digit: ONE }, 'BTNC held: LD4');
  await click('sw0');
  await settled(page, { leds: LEDS(2, 4), digit: ZERO }, 'SW0 off: the digit 0');
}

uiTest('#3704 a Basys 3 project: Emulate on Board (its RTL model only), the toolbar\'s Emulate; the emulator on the XDC\'s pins, reacting; in Portuguese', E, async (page) => {
  await basys3(page, 'Emu7');
  await page.setView('impl');
  await page.treeRow('#hier', 'emu7');
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row')].map((x) => x.textContent.trim().replace(/^▾/, '')));
  for (const present of ['Emulate on Board', 'Emulate Behavioral Model (RTL)']) assert.ok(labels.includes(present), `${present}: ${labels}`);
  assert.ok(!labels.some((l) => /^Emulate Post-/.test(l)), String(labels));
  // (the Silinx interface's toolbar: its Emulate on)
  if (await page.eval(() => !!document.querySelector('#toolbar .m-step[data-step="emulate"]'))) {
    assert.equal(await page.eval(() => document.querySelector('#toolbar .m-step[data-step="emulate"]').disabled), false);
  }
  await page.treeRow('#procs', 'Emulate on Board', { dbl: true, exact: true });
  await reacts(page);
  // in Portuguese: the process's name
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.setView('impl');
  await page.treeRow('#hier', 'emu7');
  const pt = await page.eval(() => [...document.querySelectorAll('#procs .row')].map((x) => x.textContent.trim().replace(/^▾/, '')));
  assert.ok(pt.includes('Emular na Placa') && pt.includes('Emular Modelo Comportamental (RTL)'), String(pt));
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await warnings(page);
});

uiTest('#3704 the Tasks interface: a Basys 3 project has the Emulate task; Emulate on Board opens the emulator, which reacts; in Portuguese', E, async (page) => {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await page.setViewport(1680, 1050);
  await basys3(page, 'Emu7Tasks');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-switch .task-btn')].map((b) => b.dataset.task)), ['edit', 'sim', 'emu', 'impl']);
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.waitFor(() => !document.querySelector('#task-emu-bar [data-act=emulate]')?.disabled, [], { what: 'Emulate on Board on' });
  // its processes: the top's User Constraints and Emulate on Board, its RTL model only
  await page.waitFor(() => document.querySelectorAll('#task-emu-panel .task-emu-tree li').length > 0, [], { what: 'Emulate\'s Processes' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-emu-panel .task-emu-tree .row .lbl')].map((x) => x.textContent)),
    ['User Constraints', 'I/O Pin Planning', 'Edit Constraints (Text)', 'Check Constraints', 'Emulate on Board', 'Emulate Behavioral Model (RTL)']);
  await page.click('#task-emu-bar [data-act=emulate]');
  await reacts(page);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-switch .task-btn[data-task="emu"]')?.textContent.includes('Emular'), [], { what: 'Portuguese' });
  assert.equal(await page.eval(() => document.querySelector('#task-emu-bar [data-act=emulate]').textContent), 'Emular na Placa');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  await page.eval(() => localStorage.removeItem('silinx.ui'));
  await warnings(page);
});

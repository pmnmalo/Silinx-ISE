// UI: the Board Emulator on constraints made for another board (#3742): the clock example's Basys2 pins on a Numato
// Mimas V2 (its board changed in Design Properties, Update Constraints declined). As Implement does, the emulator says
// that they are another board's and offers to regenerate them from the board's pin table: declined, it does not run;
// accepted, it runs on the board's pins. An input on the board's serial TX pin (the Basys2's clock pin B8 on the Mimas
// V2) is not the serial terminal's RX. In Portuguese, the dialog's title.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { emuNotes, waitEmuNote } from './emu-notes.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const RTL = `library ieee; use ieee.std_logic_1164.all;
entity top is
  port (clk : in std_logic; sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0));
end top;
architecture rtl of top is
begin
  process (clk) begin
    if rising_edge(clk) then led <= sw; end if;
  end process;
end rtl;
`;
// the Basys2's pins
const BASYS2 = 'NET "clk" LOC = "B8";\nNET "sw<0>" LOC = "P11";\nNET "sw<1>" LOC = "L3";\nNET "led<0>" LOC = "M5";\nNET "led<1>" LOC = "M11";\n';
const BAD = 'WARNING: Board Emulator: constraints/top.ucf uses 4 pin(s) that are not on the Numato Mimas V2 (constraints made for another board): sw<0>=P11, sw<1>=L3, led<0>=M5, led<1>=M11';
// the emulator's notes on a compiled design: the engine's only, no warning
const COMPILED = ['the design is compiled (its netlist, by Yosys) and runs at up to the board\'s clock rate; registers without an initial value start at 0, as on the FPGA; '
  + 'the event-driven engine shows X values and the design\'s messages. Each display digit keeps the last pattern it showed between its refreshes, as your eye does on the real board.'];
const TITLE = 'Constraints do not match the board';
const DOC = '.doc:not([hidden])';
const lines = (page) => page.eval(() => [...document.querySelectorAll('#console-log .ln')].map((l) => l.textContent));
const emulator = (page) => page.eval(() => !!window.Silinx.docs.find((d) => d.id === 'emulator'));
const readUcf = (pj) => env.server.api('GET', `/api/projects/${pj}/file?path=${encodeURIComponent('constraints/top.ucf')}`);
const setLang = (page, l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);

uiTest('#3742 the Board Emulator on another board\'s constraints: said, their regeneration offered; declined, not run; accepted, run on the board\'s pins', E, async (page) => {
  await makeProject(env, { name: 'EmuOtherBoard', board: 'mimas-v2', top: 'top', constraints: 'constraints/top.ucf', files: { 'src/top.vhd': RTL, 'constraints/top.ucf': BASYS2 } });
  await page.openProject('EmuOtherBoard');
  // declined: said in the console, not run
  await page.menu('Tools', 'Board Emulator');
  assert.equal(await page.waitDialog(TITLE), TITLE);
  assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().textContent),
    /constraints\/top\.ucf assigns 4 pin\(s\) that do not exist on the Numato Mimas V2 \(sw<0>=P11, sw<1>=L3, led<0>=M5, led<1>=M11\)\.\s*Regenerate the constraints from the Numato Mimas V2 pin table now\?/);
  // (in Portuguese: its title)
  await setLang(page, 'pt');
  assert.equal(await page.topDialogTitle(), 'As restrições não correspondem à placa');
  await setLang(page, 'en');
  await page.dialogButton('No');
  await page.waitConsole(/Board Emulator: not run: /);
  const said = (await lines(page)).filter((t) => /Board Emulator|WARNING|ERROR/.test(t));
  assert.deepEqual(said, [BAD,
    'Board Emulator: not run: constraints/top.ucf is another board\'s; regenerate it for the Numato Mimas V2 (Update Constraints) or set its pins in I/O Pin Planning.']);
  assert.equal(await emulator(page), false);
  assert.equal(await readUcf('EmuOtherBoard'), BASYS2);
  // accepted: regenerated from the Mimas V2's pin table, then run on it, every port on a resource, no serial terminal
  await page.menu('Tools', 'Board Emulator');
  await page.waitDialog(TITLE);
  await page.dialogButton('Yes');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running', timeout: 60000 });
  const ucf = await readUcf('EmuOtherBoard');
  assert.match(ucf, /NET "clk"\s+LOC = "V10"/);
  assert.doesNotMatch(ucf, /"(B8|P11|L3|M5|M11)"/);
  await waitEmuNote(page, /^the design is compiled/);
  assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled');
  const after = (await lines(page)).filter((t) => /Board Emulator|WARNING|ERROR|regenerated/.test(t)).slice(2);
  assert.deepEqual(after, [BAD, 'constraints/top.ucf regenerated for Numato Mimas V2: clk, sw, led',
    'Board Emulator: \'top\' (RTL, compiled) on Numato Mimas V2 — 5 port bit(s) on board resources.', ...COMPILED.map((t) => `Board Emulator: ${t}`)]);
  assert.deepEqual(await emuNotes(page), COMPILED);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-serial`), DOC), null);
  assert.deepEqual(page.dialogs, []);
});

uiTest('#3742 an input on the board\'s serial TX pin is not the serial terminal\'s RX: no terminal', E, async (page) => {
  // the Mimas V2's own clock, and an input on its USB-UART TX pin (B8, an output of the FPGA)
  const ucf = 'NET "clk" LOC = "V10";\nNET "sw<0>" LOC = "B8";\nNET "sw<1>" LOC = "C18";\nNET "led<0>" LOC = "P15";\nNET "led<1>" LOC = "P16";\n';
  await makeProject(env, { name: 'EmuTxInput', board: 'mimas-v2', top: 'top', constraints: 'constraints/top.ucf', files: { 'src/top.vhd': RTL, 'constraints/top.ucf': ucf } });
  await page.openProject('EmuTxInput');
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running', timeout: 60000 });
  await waitEmuNote(page, /^the design is compiled/);
  // (the old code: "the serial terminal: TX: not connected in the UCF · RX: sw<0> (pin B8)." and a terminal)
  assert.deepEqual(await emuNotes(page), COMPILED);
  assert.equal(await page.eval((d) => document.querySelector(`${d} .emu-serial`), DOC), null);
  assert.deepEqual(page.dialogs, []);
});

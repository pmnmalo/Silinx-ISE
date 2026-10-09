// UI: behavioural simulation in the ISim view (waveforms with values), the board emulator on the
// Basys2, Nexys2 and Spartan-3E Starter Kit (LEDs, 7-segment display, LCD, rotary knob react to
// switches / buttons), the "Run anyway?" question for a netlist with a cell that has no model.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, writeWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('ISim: Simulate Behavioral Model runs the test bench; waveforms and objects have values; run more from the command line', E, async (page) => {
  await makeProject(env, { name: 'SimPj', template: 'blinky' });
  await page.openProject('SimPj');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view);
  // the initial run: 1 us
  await page.waitFor(() => /Sim Time: 1,000,000 ps/.test(document.querySelector('.isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [], { what: 'initial 1 us run', timeout: 20000 });
  const st = await page.eval(() => {
    const s = window.Silinx.active.view.state;
    return {
      rows: s.rows.map((r) => r.name),
      waves: Object.fromEntries(s.rows.map((r) => [r.name, r.sig?.wave?.t?.length ?? 0])),
      title: document.querySelector('.isim-title-text').textContent,
      objects: [...document.querySelectorAll('.isim-objs tbody tr')].map((tr) => [...tr.cells].slice(1, 3).map((c) => c.textContent)),
    };
  });
  assert.equal(st.title, 'tb_top');
  for (const n of ['clk', 'sw', 'btn', 'led']) assert.ok(st.rows.includes(n), `waveform row ${n}: ${st.rows}`);
  assert.ok(st.waves.clk >= 100, `clk toggles (${st.waves.clk} events in 1 us)`);
  const objs = Object.fromEntries(st.objects);
  assert.match(objs.led || '', /^[01]{8}$/, `led value in the Objects panel: ${JSON.stringify(st.objects)}`);
  assert.ok(objs.clk === '0' || objs.clk === '1');
  // the wave canvas has been drawn (not blank)
  // (drawn on the next animation frame: wait for it)
  await page.waitFor(() => {
    const c = document.querySelector('.isim-waves');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 16) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return colors.size > 3;
  }, [], { what: 'the waveform canvas shows traces' });
  // ISim> run 500 ns
  await page.click('.isim-cmdline input');
  await page.type('run 500 ns');
  await page.key('Enter');
  await page.waitFor(() => /Sim Time: 1,500,000 ps/.test(document.querySelector('.isim-st-time').textContent), [], { what: 'run 500 ns' });
  assert.match(await page.eval(() => document.querySelector('.isim-console').innerText), /run 500 ns/);
  // the LEDs move every 64 clock cycles (1.28 us) in this test bench
  assert.ok(await page.eval(() => window.Silinx.active.view.state.rows.find((r) => r.name === 'led').sig.wave.t.length) >= 2, 'led changes');
  // the simulation process is marked OK
  await page.click('#left-tabs .tab[data-page=design]');
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === 'Simulate Behavioral Model')?.querySelector('.status svg')));
});

// ---------------------------------------------------------------------------- board emulator
const EMU_7SEG = `library ieee; use ieee.std_logic_1164.all;
entity emu is
  port (clk : in std_logic;
        sw  : in std_logic_vector(7 downto 0);
        btn : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0);
        seg : out std_logic_vector(6 downto 0);
        dp  : out std_logic;
        an  : out std_logic_vector(3 downto 0));
end emu;
architecture rtl of emu is
begin
  led <= sw(7 downto 1) & btn(0);                       -- LD0 = BTN0, LDk = SWk
  an  <= "1110";                                        -- digit 0 only
  seg <= "1111001" when sw(0) = '1' else "1000000";     -- shows 1 / 0 (active low, g..a)
  dp  <= not btn(1);                                    -- lit while BTN1 is pressed
end rtl;
`;

async function emulatorProject(page, name, board, files, top) {
  await makeProject(env, { name, board, files, top });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view && document.querySelector('.doc:not([hidden]) .emu-pcb'), [], { what: 'emulator open' });
  await page.waitFor(() => window.Silinx.active.view.outputs, [], { what: 'emulator running' });
}
// a widget of the board by the start of its tooltip ("SW3 = sw<3> (pin …)")
async function widget(page, title, opts = {}) {
  const idx = await page.waitFor((t) => { const i = [...document.querySelectorAll('.doc:not([hidden]) [title]')].findIndex((e) => e.title.startsWith(t)); return i >= 0 ? i + 1 : 0; }, [title], { what: `widget ${title}` });
  return page.click('.doc:not([hidden]) [title]', { index: idx - 1, ...opts });
}
const led = (page, k) => page.eval((i) => window.Silinx.active.view.outputs?.leds[i] ?? 0, k);
const waitLed = (page, k, on) => page.waitFor((i, o) => { const v = window.Silinx.active.view.outputs?.leds[i] ?? 0; return o ? v > 0.5 : v < 0.5; }, [k, on], { what: `LED ${k} ${on ? 'on' : 'off'}` });
const digit = (page, k) => page.eval((i) => window.Silinx.active.view.outputs?.digits[i] || null, k);

for (const [board, name] of [['basys2', 'Basys2'], ['nexys2', 'Nexys2']]) {
  uiTest(`board emulator (RTL) on the ${name}: switches and buttons drive the LEDs and the 7-segment display`, E, async (page) => {
    await emulatorProject(page, `Emu_${board}`, board, { 'src/emu.vhd': EMU_7SEG }, 'emu');
    assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-note').textContent), new RegExp(`${name}.* — emu · Clock clk: 50 MHz on the board`));
    for (let k = 0; k < 8; k++) assert.ok(await led(page, k) < 0.5, `LD${k} off at start`);
    // the digit shows 0 (segments a..f on, g off)
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.seg[0] > 0.5);
    let d = await digit(page, 0);
    assert.deepEqual(d.seg.map((x) => (x > 0.5 ? 1 : 0)), [1, 1, 1, 1, 1, 1, 0]);
    // SW3 on: LD3 on; SW0 on: the digit shows 1
    await widget(page, 'SW3 = sw<3>');
    await waitLed(page, 3, true);
    assert.ok(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-sw.on')].length === 1));
    await widget(page, 'SW0 = sw<0>');
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.seg[0] < 0.5);
    d = await digit(page, 0);
    assert.deepEqual(d.seg.map((x) => (x > 0.5 ? 1 : 0)), [0, 1, 1, 0, 0, 0, 0]);
    assert.equal(await digit(page, 1), null, 'AN1 is off: digit 1 dark');
    // BTN0 held (Shift+click latches it): LD0 on; again: off
    await widget(page, 'BTN0 = btn<0>', { modifiers: 8 });
    await waitLed(page, 0, true);
    await widget(page, 'BTN0 = btn<0>', { modifiers: 8 });
    await waitLed(page, 0, false);
    // a plain press: on while the mouse button is down
    const p = await page.point('.doc:not([hidden]) [title^="BTN1 = btn<1>"]');
    await page.mouse('mouseMoved', p.x, p.y);
    await page.mouse('mousePressed', p.x, p.y);
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.dp > 0.5, [], { what: 'DP lit while BTN1 is held (active low)' });
    await page.mouse('mouseReleased', p.x, p.y);
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.dp < 0.5, [], { what: 'DP dark again' });
    // SW3 off again; Pause / Step / Power cycle
    await widget(page, 'SW3 = sw<3>');
    await waitLed(page, 3, false);
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
    const t1 = await page.eval(() => window.Silinx.active.view.sim.now);
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏭ Step' });
    assert.equal(await page.eval(() => window.Silinx.active.view.sim.now) - t1, 20000, 'one 50 MHz clock cycle');
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⟲ Power cycle' });
    await page.waitFor(() => window.Silinx.active.view.sim.now === 0);
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '▶ Run' });
    await page.waitFor(() => window.Silinx.active.view.sim.now > 0);
    // a signal in the Watch box
    await page.eval(() => { const s = document.querySelector('.doc:not([hidden]) .emu-box select'); s.value = [...s.options].find((o) => o.textContent.endsWith('led')).value; s.dispatchEvent(new Event('change')); });
    await page.waitFor(() => /^[01X]{8}/.test(document.querySelector('.doc:not([hidden]) .emu-box tbody td:nth-child(2)')?.textContent || ''));
  });
}

const EMU_S3E = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity s3e is
  port (clk : in std_logic;
        sw : in std_logic_vector(3 downto 0);
        rot_a, rot_b, rot_center, btn_north : in std_logic;
        led : out std_logic_vector(7 downto 0);
        lcd_e, lcd_rs, lcd_rw : out std_logic;
        lcd_d : out std_logic_vector(3 downto 0));
end s3e;
architecture rtl of s3e is
  -- the knob: count on the rising edges of ROT_A (up when ROT_B = 0)
  signal cnt : unsigned(5 downto 0) := (others => '0');
  signal a_prev : std_logic := '1';
  -- the LCD, once SW0 is on: 4-bit mode, display on, "HI" (RS & nibble per transfer)
  type rom_t is array (0 to 6) of std_logic_vector(4 downto 0);
  constant ROM : rom_t := ("00010", "00000", "01100", "10100", "11000", "10100", "11001");
  signal step : integer range 0 to 7 := 0;
  signal ph : integer range 0 to 2 := 0;
begin
  process (clk) begin
    if rising_edge(clk) then
      a_prev <= rot_a;
      if rot_a = '1' and a_prev = '0' then
        if rot_b = '0' then cnt <= cnt + 1; else cnt <= cnt - 1; end if;
      end if;
      if sw(0) = '1' and step < 7 then
        if ph = 2 then ph <= 0; step <= step + 1; else ph <= ph + 1; end if;
      end if;
    end if;
  end process;
  led <= rot_center & btn_north & std_logic_vector(cnt);
  lcd_rw <= '0';
  lcd_e  <= '1' when ph = 1 and step < 7 else '0';
  lcd_rs <= ROM(step)(4) when step < 7 else '0';
  lcd_d  <= ROM(step)(3 downto 0) when step < 7 else "0000";
end rtl;
`;

uiTest('board emulator (RTL) on the Spartan-3E Starter Kit: LCD text after a switch, rotary knob, knob push and direction buttons', E, async (page) => {
  await emulatorProject(page, 'Emu_s3e', 's3e-starter', { 'src/s3e.vhd': EMU_S3E }, 's3e');
  const lcd = () => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-lcd-cell')].map((c) => c.textContent).join('').trim());
  assert.equal(await lcd(), '', 'the LCD is off before the design writes to it');
  await widget(page, 'SW0 = sw<0>');
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-lcd-cell')].map((c) => c.textContent).join('').trim() === 'HI', [], { what: 'LCD shows HI' });
  // the knob: ⟳ counts up, ⟲ counts down (LEDs 0..5 show the count)
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn right (clockwise)"]');
  await waitLed(page, 0, true);
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn right (clockwise)"]');
  await page.waitFor(() => { const l = window.Silinx.active.view.outputs.leds; return l[0] < 0.5 && l[1] > 0.5; }, [], { what: 'count 2' });
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn left (counter-clockwise)"]');
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn left (counter-clockwise)"]');
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn left (counter-clockwise)"]');
  await page.waitFor(() => window.Silinx.active.view.outputs.leds.slice(0, 6).every((v) => v > 0.5), [], { what: 'count -1 = 63' });
  // the knob push (ROT_CENTER) and BTN_NORTH, latched with Shift+click
  await widget(page, 'ROT_CENTER = rot_center', { modifiers: 8 });
  await waitLed(page, 7, true);
  await widget(page, 'BTN_NORTH = btn_north', { modifiers: 8 });
  await waitLed(page, 6, true);
  // the emulator in Portuguese: no untranslated text
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  await setLang('pt');
  const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  await setLang('en');
  const db = await env.server.api('GET', '/api/devices');
  const same = [{ test: (s) => db.boards.some((b) => b.name === s) }, /^(s3e|led|sw|rot_\w+|btn_\w+|lcd_\w+|clk|cnt|a_prev|step|ph|real \(÷1\))\b/, /^@?[A-Z_0-9]+:? /, /^@?[A-Z_0-9]+ = /];
  assert.deepEqual(untranslated(en, pt, same), []);
});

uiTest('emulating a netlist with a cell that has no model asks "Run anyway?" (No: nothing opens; Yes: it runs)', E, async (page) => {
  const RTL = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0)); end top;\narchitecture r of top is begin led <= sw; end r;\n';
  await makeProject(env, { name: 'NetPj', board: 'basys2', top: 'top', files: { 'src/top.vhd': RTL } });
  // what netgen writes (build/netgen/synthesis/<top>_synthesis.vhd), with one cell Silinx has no model for
  await writeWs(env, 'NetPj', 'build/netgen/synthesis/top_synthesis.vhd', `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
library UNISIM; use UNISIM.VCOMPONENTS.ALL;
entity top is port ( sw : in STD_LOGIC_VECTOR ( 1 downto 0 ); led : out STD_LOGIC_VECTOR ( 1 downto 0 ) ); end top;
architecture Structure of top is
begin
  led_0_OBUF : OBUF port map ( I => sw(0), O => led(0) );
  mystery : SILINX_NO_SUCH_CELL port map ( I => sw(1), O => led(1) );
end Structure;
`);
  await page.openProject('NetPj');
  await page.eval(() => window.SilinxApp.regenerateUcf());
  await page.treeRow('#hier', 'top');
  const emulate = async (answer) => {
    await page.treeRow('#procs', 'Emulate Post-Synthesis Model', { dbl: true, exact: true });
    await page.waitDialog('Board Emulator');
    const text = await page.eval(() => document.querySelector('.dlg-overlay').innerText);
    assert.match(text, /1 elaboration error\(s\), 1 of them instances of cells or entities that have no model/);
    assert.match(text, /silinx_no_such_cell' not found/i);
    assert.match(text, /Run anyway\?/);
    await page.dialogButton(answer);
    await page.waitNoDialog();
  };
  await emulate('No');
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('emulator')), false);
  assert.match(await page.eval(() => document.getElementById('console-errors').innerText), /silinx_no_such_cell' not found/i);
  await emulate('Yes');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs);
  assert.match(await page.eval(() => window.Silinx.active.title), /Board Emulator \(top, Post-Synthesis\)/);
  // the modelled cell works: SW0 drives LD0 through the OBUF
  await widget(page, 'SW0 = sw<0>');
  await waitLed(page, 0, true);
  // the simulation of the same netlist asks too
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'Simulate Post-Synthesis Model', { dbl: true, exact: true });
  await page.waitDialog('Simulate Post-Synthesis Model');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /Run anyway\?/);
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('isim')), false);
});

// The MCP server's module wizards (#2674, server/mcp-wizards.js): clock_manager (a DCM on the Spartan-3E, a PLL on the
// Spartan-6) and block_memory (a RAM or a ROM of block RAMs), in VHDL and in Verilog: the results with each output's
// frequency and the block RAMs taken; a module made again from its header's settings (edit); Check Syntax with its
// exact warnings (#2716: a feedback signal said unused); a test bench of the modules, simulated: the ROMs read back
// their .mem file, the DCMs lock and their 100 MHz output toggles at 100 MHz; the wizards' refusals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const checks = async (project, top) => (await ok('check_syntax', { project, top })).text;

before(async () => {
  tmp = await scratchEnv('silinx-mcp-wizards-');
  await ok('new_project', { name: 'p', board: 'basys2' });
  await ok('new_source', { project: 'p', type: 'mem', name: 'rom' });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('clock_manager on a Spartan-3E: the DCM\'s outputs, the nearest CLKFX, made again by edit; Check Syntax', async () => {
  assert.equal((await ok('clock_manager', { project: 'p' })).text, 'Clocking Wizard: created src/clkgen.vhd, the module clkgen: clk0 50 MHz.');
  const r = await ok('clock_manager', { project: 'p', name: 'clk_vhd', outputs: [{ pin: 'CLK0', port: 'clk50' }, { pin: 'CLKFX', port: 'clk100', mhz: 100 }, { pin: 'CLKDV', port: 'clk25', mhz: 25 }] });
  assert.equal(r.text, 'Clocking Wizard: created src/clk_vhd.vhd, the module clk_vhd: clk50 50 MHz, clk100 100 MHz, clk25 25 MHz.');
  assert.equal(r.data.primitive, 'DCM_SP');
  assert.equal(await checks('p', 'clk_vhd'), 'Process "Check Syntax" of <clk_vhd> completed successfully (33 signals, 30 processes).');
  // made again from its header, CLKFX at the nearest it can
  const e = await ok('clock_manager', { project: 'p', edit: 'src/clk_vhd.vhd', outputs: [{ pin: 'CLK0', port: 'clk50' }, { pin: 'CLKFX', port: 'clk100', mhz: 73 }] });
  assert.equal(e.text, 'Clocking Wizard: wrote again src/clk_vhd.vhd, the module clk_vhd: clk50 50 MHz, clk100 73.077 MHz.\nclk100: 73.077 MHz, the nearest to the 73 MHz asked (CLKIN x 19 / 13)');
  await ok('clock_manager', { project: 'p', edit: 'src/clk_vhd.vhd', outputs: [{ pin: 'CLK0', port: 'clk50' }, { pin: 'CLKFX', port: 'clk100', mhz: 100 }] });
  // in Verilog
  assert.equal((await ok('clock_manager', { project: 'p', name: 'clk_v', language: 'verilog', outputs: [{ pin: 'CLK0', port: 'clk50' }, { pin: 'CLKFX', port: 'clk100', mhz: 100 }] })).text,
    'Clocking Wizard: created src/clk_v.v, the module clk_v: clk50 50 MHz, clk100 100 MHz.');
  assert.match(await checks('p', 'clk_v'), /^Process "Check Syntax" of <clk_v> completed successfully \(\d+ signals, \d+ processes\)\.$/);
  // CLK0 not an output, in both languages (#2716: its feedback said unused)
  for (const [lang, ext, line] of [['vhdl', 'vhd', 23], ['verilog', 'v', 19]]) {
    await ok('clock_manager', { project: 'p', name: `fx_${ext}`, language: lang, outputs: [{ pin: 'CLKFX', port: 'f', mhz: 100 }] });
    assert.equal(await checks('p', `fx_${ext}`), `WARNING:Silinx:646 - "src/fx_${ext}.${ext}" Line ${line}: Signal <clkfb_b> is assigned but never used. This unconnected signal will be trimmed during the optimization process.\nProcess "Check Syntax" of <fx_${ext}> completed successfully with 1 warning(s) (31 signals, 28 processes).`);
  }
});

test('block_memory on a Spartan-3E: a RAM, a ROM from a .mem file, in VHDL and in Verilog; made again by edit', async () => {
  const r = await ok('block_memory', { project: 'p' });
  assert.equal(r.text, 'Block Memory: created src/bram.vhd, the module bram: 1024 x 8, 1 RAMB16_S9.\nBlock RAMs: 1 RAMB16 of the 12 on this device; RAMB16_S9 of 2048 x 9, 1 side by side.');
  assert.equal(await checks('p', 'bram'), 'Process "Check Syntax" of <bram> completed successfully (13 signals, 8 processes).');
  for (const [lang, ext] of [['vhdl', 'vhd'], ['verilog', 'v']]) {
    const m = await ok('block_memory', { project: 'p', name: `rom_${ext}`, language: lang, kind: 'rom', width: 8, depth: 16, init: 'src/rom.mem' });
    assert.equal(m.text, `Block Memory: created src/rom_${ext}.${ext}, the module rom_${ext}: 16 x 8, 1 RAMB16_S9.\nBlock RAMs: 1 RAMB16 of the 12 on this device; RAMB16_S9 of 2048 x 9, 1 side by side.`);
    assert.match(await checks('p', `rom_${ext}`), new RegExp(`^Process "Check Syntax" of <rom_${ext}> completed successfully \\(\\d+ signals, \\d+ processes\\)\\.$`));
  }
  const e = await ok('block_memory', { project: 'p', edit: 'src/bram.vhd', width: 16, depth: 2048, style: 'inferred' });
  assert.equal(e.text, 'Block Memory: wrote again src/bram.vhd, the module bram: 2048 x 16, inferable HDL.\nBlock RAMs: 2 RAMB16 of the 12 on this device; RAMB16_S9 of 2048 x 9, 2 side by side.');
});

test('the wizards\' modules simulated: the ROMs read back their .mem file, the DCMs lock and make 100 MHz', async () => {
  const tb = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb_w is end;
architecture t of tb_w is
  signal clk, c50a, c100a, lka, c50b, c100b, lkb : std_logic := '0'; signal rst : std_logic := '1';
  signal addr : std_logic_vector(3 downto 0) := (others => '0'); signal d1, d2 : std_logic_vector(7 downto 0);
  signal na, nb : integer := 0;
begin
  clk <= not clk after 10 ns;
  r1 : entity work.rom_vhd port map (clka => clk, addra => addr, douta => d1);
  r2 : entity work.rom_v port map (clka => clk, addra => addr, douta => d2);
  c1 : entity work.clk_vhd port map (clk_in => clk, rst => rst, clk50 => c50a, clk100 => c100a, locked => lka);
  c2 : entity work.clk_v port map (clk_in => clk, rst => rst, clk50 => c50b, clk100 => c100b, locked => lkb);
  process (c100a) begin if rising_edge(c100a) then na <= na + 1; end if; end process;
  process (c100b) begin if rising_edge(c100b) then nb <= nb + 1; end if; end process;
  process begin
    wait for 40 ns; rst <= '0';
    for i in 0 to 3 loop
      addr <= std_logic_vector(to_unsigned(i, 4));
      wait until rising_edge(clk); wait for 1 ns;
      assert d1 = std_logic_vector(to_unsigned(i, 8)) and d2 = d1 report "rom word " & integer'image(i) severity error;
    end loop;
    wait for 3000 ns;
    report "locked " & std_logic'image(lka) & std_logic'image(lkb) & ", 100 MHz edges " & integer'image(na) & " " & integer'image(nb);
    wait;
  end process;
end;
`;
  await ok('write_file', { project: 'p', path: 'sim/tb_w.vhd', text: tb });
  const s = await ok('simulate', { project: 'p', top: 'tb_w', time_ns: 4000, signals: [] });
  assert.equal(s.data.failed, false, s.text);
  assert.deepEqual(s.data.log.map(l => l.text), ['locked \'1\'\'1\', 100 MHz edges 301 301']);
});

test('the Spartan-6: a PLL\'s outputs and phases, a dual-port block RAM in halves of 9 Kbit', async () => {
  await ok('new_project', { name: 's6' });
  await ok('set_design_properties', { project: 's6', board: 'nexys3' });
  const c = await ok('clock_manager', { project: 's6', input_mhz: 100, outputs: [{ port: 'c200', mhz: 200 }, { port: 'c50', mhz: 50, phase: 90 }] });
  assert.equal(c.text, 'Clocking Wizard: created src/clkgen.vhd, the module clkgen: c200 200 MHz, c50 50 MHz.\nVCO: 100.000 MHz x 10 / 1 = 1000.000 MHz (its range 400 to 1080 MHz).');
  assert.equal(c.data.primitive, 'PLL_BASE');
  // (#2716: the PLL's feedback said unused)
  assert.match(await checks('s6', 'clkgen'), /^WARNING:Silinx:646 - "src\/clkgen\.vhd" Line \d+: Signal <clkfb_u> is assigned but never used\. This unconnected signal will be trimmed during the optimization process\.\nProcess "Check Syntax" of <clkgen> completed successfully with 1 warning\(s\) \(\d+ signals, \d+ processes\)\.$/);
  const m = await ok('block_memory', { project: 's6', ports: 'dual', width: 16, depth: 2048 });
  assert.equal(m.text, 'Block Memory: created src/bram.vhd, the module bram: 2048 x 16, 2 RAMB16BWER.\nBlock RAMs: 2 RAMB16BWER (4 of the 64 halves of 9 Kbit on this device); RAMB16BWER of 2048 x 9, 2 side by side.');
  assert.match(await checks('s6', 'bram'), /^Process "Check Syntax" of <bram> completed successfully \(\d+ signals, \d+ processes\)\.$/);
  await fails('clock_manager', { project: 's6', name: 'k', divide_input_by_2: true }, 'divide_input_by_2 and phase_shift: a Spartan-3E DCM\'s (a Spartan-6 PLL output has its own phase)');
});

test('the wizards\' refusals', async () => {
  await fails('clock_manager', { project: 'p', name: 'k1', input_mhz: 500 }, 'The DCM\'s input (500.000 MHz) is out of the DLL\'s range, 5 to 240 MHz: divide the input by 2.\nCLK0 (500.000 MHz) is out of its range, 5 to 240 MHz.');
  await fails('clock_manager', { project: 'p', name: 'clkgen' }, 'src/clkgen.vhd already exists: choose another name (or edit it).');
  await fails('clock_manager', { project: 'p', name: 'bram', location: 'gen' }, 'A module named \'bram\' already exists.');
  await fails('clock_manager', { project: 'p', name: 'k2', outputs: [{ pin: 'CLK0', port: 'signal' }] }, 'Output CLK0: \'signal\' is a reserved word of VHDL.');
  await fails('clock_manager', { project: 'p', name: 'k3', reset: 'clk_in' }, 'Two ports have the same name.');
  await fails('clock_manager', { project: 'p', edit: 'src/bram.vhd' }, 'src/bram.vhd was not made by the Clocking Wizard');
  await fails('clock_manager', { project: 'p', edit: 'src/clkgen.vhd', name: 'other' }, 'edit: the module\'s name, language and location stay its own');
  await fails('block_memory', { project: 'p', name: 'big', width: 36, depth: 8192 }, 'It takes 16 block RAMs and the device has 12: make it smaller.');
  await fails('block_memory', { project: 'p', name: 'b2', init: 'src/rom.txt' }, 'init: src/rom.txt is not a .mem or .coe file');
  await fails('block_memory', { project: 'p', name: 'b3', init: 'src/none.mem' }, 'src/none.mem cannot be read.');
  await fails('block_memory', { project: 'p', name: 'b4', width: 0 }, 'The width is a whole number of bits from 1 to 256.');
  await fails('block_memory', { project: 'p', edit: 'src/clkgen.vhd' }, 'src/clkgen.vhd was not made by the Block Memory wizard');
  // a family the wizards do not make modules for: an iCE40
  await ok('new_project', { name: 'ice' });
  await ok('set_design_properties', { project: 'ice', board: 'none', part: 'ice40hx1k', package: 'vq100' });
  await fails('clock_manager', { project: 'ice' }, 'The Clocking Wizard makes a DCM for the Spartan-3E and a PLL for the Spartan-6: choose one of them as the target device (set_design_properties).');
  await fails('block_memory', { project: 'ice' }, 'The Block Memory wizard makes block RAMs of the Spartan-3E and the Spartan-6: choose one of them as the target device (set_design_properties).');
  assert.ok(!fs.existsSync(path.join(P.projectDir('p'), 'src/k1.vhd')));
});

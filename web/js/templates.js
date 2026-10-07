// Source templates in the style of ISE's New Source Wizard.
const today = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

function vhdlHeader(name, project, desc = '') {
  return `----------------------------------------------------------------------------------
-- Company:
-- Engineer:
--
-- Create Date:    ${today()}
-- Design Name:    ${name}
-- Module Name:    ${name}
-- Project Name:   ${project.name}
-- Target Devices: ${project.device.part}${project.device.speed}-${project.device.package}
-- Tool versions:  Silinx
-- Description:    ${desc}
--
-- Dependencies:
--
-- Revision:
-- Revision 0.01 - File Created
-- Additional Comments:
--
----------------------------------------------------------------------------------
`;
}

function vlogHeader(name, project, desc = '') {
  return `\`timescale 1ns / 1ps
//////////////////////////////////////////////////////////////////////////////////
// Company:
// Engineer:
//
// Create Date:    ${today()}
// Design Name:    ${name}
// Module Name:    ${name}
// Project Name:   ${project.name}
// Target Devices: ${project.device.part}${project.device.speed}-${project.device.package}
// Tool versions:  Silinx
// Description:    ${desc}
//
// Dependencies:
//
// Revision:
// Revision 0.01 - File Created
// Additional Comments:
//
//////////////////////////////////////////////////////////////////////////////////
`;
}

// ports: [{ name, dir:'in'|'out'|'inout', bus:bool, msb, lsb }]
export function vhdlModule(name, arch, ports, project) {
  const pl = ports.map(p => {
    const t = p.bus ? `STD_LOGIC_VECTOR (${p.msb} ${+p.msb >= +p.lsb ? 'downto' : 'to'} ${p.lsb})` : 'STD_LOGIC';
    return `           ${p.name.padEnd(6)} : ${p.dir.toUpperCase().padEnd(5)} ${t}`;
  });
  return `${vhdlHeader(name, project)}library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity ${name} is
${pl.length ? `    Port (\n${pl.join(';\n')});\n` : ''}end ${name};

architecture ${arch || 'Behavioral'} of ${name} is

begin


end ${arch || 'Behavioral'};
`;
}

export function vlogModule(name, ports, project) {
  const dirKw = { in: 'input', out: 'output', inout: 'inout' };
  const pl = ports.map(p => `    ${dirKw[p.dir]} ${p.bus ? `[${p.msb}:${p.lsb}] ` : ''}${p.name}`);
  return `${vlogHeader(name, project)}module ${name}(${pl.length ? '\n' + pl.join(',\n') + '\n    ' : ''});


endmodule
`;
}

export function vhdlPackage(name, project) {
  return `${vhdlHeader(name, project, 'Package')}library IEEE;
use IEEE.STD_LOGIC_1164.all;
use IEEE.NUMERIC_STD.all;

package ${name} is

  -- constant C_WIDTH : natural := 8;
  -- function my_function (x : std_logic_vector) return std_logic;

end ${name};

package body ${name} is

end ${name};
`;
}

const isClock = n => /^(clk|clock|clk_?\w*|\w*_clk|mclk|sysclk)$/i.test(n);
const isReset = n => /^(rst|reset|rst_?n|resetn|rst_\w+|\w*_rst)$/i.test(n);

// uut: { name, lang, ports:[{name, dir, width, typeText(VHDL), msb, lsb}], params:[{name, default}] }
export function vhdlTestbench(tbName, uut, project) {
  const sigs = uut.ports.map(p => {
    const init = p.dir === 'in' ? (p.width > 1 ? " := (others => '0')" : " := '0'") : '';
    return `   signal ${p.name} : ${p.vhdlType}${init};`;
  });
  const clk = uut.ports.find(p => p.dir === 'in' && p.width === 1 && isClock(p.name));
  const rst = uut.ports.find(p => p.dir === 'in' && p.width === 1 && isReset(p.name));
  return `${vhdlHeader(tbName, project, `VHDL Test Bench for module: ${uut.name}`)}LIBRARY ieee;
USE ieee.std_logic_1164.ALL;
USE ieee.numeric_std.ALL;

ENTITY ${tbName} IS
END ${tbName};

ARCHITECTURE behavior OF ${tbName} IS

   -- Inputs / Outputs
${sigs.join('\n')}
${clk ? `
   -- Clock period definitions
   constant ${clk.name}_period : time := 20 ns;
` : ''}
BEGIN

   -- Instantiate the Unit Under Test (UUT)
   uut: entity work.${uut.name}${uut.params.length ? `\n      GENERIC MAP (\n${uut.params.map(p => `         ${p.name} => ${p.default}`).join(',\n')}\n      )` : ''}
      PORT MAP (
${uut.ports.map(p => `         ${p.name} => ${p.name}`).join(',\n')}
      );
${clk ? `
   -- Clock process definitions
   ${clk.name}_process : process
   begin
      ${clk.name} <= '0';
      wait for ${clk.name}_period/2;
      ${clk.name} <= '1';
      wait for ${clk.name}_period/2;
   end process;
` : ''}
   -- Stimulus process
   stim_proc: process
   begin
${rst ? `      -- hold reset state for 100 ns.
      ${rst.name} <= '${/n$/i.test(rst.name) ? '0' : '1'}';
      wait for 100 ns;
      ${rst.name} <= '${/n$/i.test(rst.name) ? '1' : '0'}';
` : `      wait for 100 ns;
`}${clk ? `      wait for ${clk.name}_period*10;
` : ''}
      -- insert stimulus here

      report "Simulation finished" severity note;
      wait;
   end process;

END;
`;
}

export function vlogTestbench(tbName, uut, project) {
  const clk = uut.ports.find(p => p.dir === 'in' && p.width === 1 && isClock(p.name));
  const rst = uut.ports.find(p => p.dir === 'in' && p.width === 1 && isReset(p.name));
  const decl = p => `${p.width > 1 ? `[${p.msb}:${p.lsb}] ` : ''}${p.name}`;
  const ins = uut.ports.filter(p => p.dir === 'in').map(p => `	reg ${decl(p)};`);
  const outs = uut.ports.filter(p => p.dir !== 'in').map(p => `	wire ${decl(p)};`);
  return `${vlogHeader(tbName, project, `Verilog Test Fixture for module: ${uut.name}`)}
module ${tbName};

	// Inputs
${ins.join('\n')}

	// Outputs
${outs.join('\n')}

	// Instantiate the Unit Under Test (UUT)
	${uut.name}${uut.params.length ? ` #(${uut.params.map(p => `.${p.name}(${p.default})`).join(', ')})` : ''} uut (
${uut.ports.map(p => `		.${p.name}(${p.name})`).join(',\n')}
	);
${clk ? `
	// Clock: 50 MHz
	always #10 ${clk.name} = ~${clk.name};
` : ''}
	initial begin
		// Initialize Inputs
${uut.ports.filter(p => p.dir === 'in').map(p => `		${p.name} = 0;`).join('\n')}
${rst ? `		${rst.name} = ${/n$/i.test(rst.name) ? 0 : 1};
` : ''}
		// Wait 100 ns for global reset to finish
		#100;
${rst ? `		${rst.name} = ${/n$/i.test(rst.name) ? 1 : 0};
` : ''}
		// Add stimulus here

		#1000;
		$display("Simulation finished at %0t", $time);
		$finish;
	end

endmodule
`;
}

export function ucfTemplate(project) {
  return `# User Constraints File for ${project.name}
# Target: ${project.device.part}${project.device.speed}-${project.device.package}
#
# Example:
# NET "clk" LOC = "C9" | IOSTANDARD = LVCMOS33 ;
# NET "clk" TNM_NET = "clk";
# TIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50%;
# NET "led<0>" LOC = "F12" | IOSTANDARD = LVTTL ;
`;
}

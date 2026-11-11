// Silinx - the JTAG's user access primitives (#3176, the logic analyzer's link): BSCAN_SPARTAN3 (Spartan-3E),
// BSCAN_SPARTAN6 and BSCANE2 (Artix-7), Silinx's own functional models as core/unisim.js's, written from the
// Libraries Guides (UG617, UG615, UG953). A simulation has no JTAG scans: the outputs stay at rest (no user
// instruction loaded: SEL, DRCK, CAPTURE, SHIFT, UPDATE, RESET, RUNTEST low, TDI, TMS, TCK low) and TDO is read
// by no one. The open synthesis keeps them as instances of the primitive (core/synth-verilog.js).
const bscan = (name, generics, ports) => `
library IEEE; use IEEE.STD_LOGIC_1164.ALL;
entity ${name} is
${generics ? `  generic (${generics});\n` : ''}  port (${ports.map(([p, d]) => `${p} : ${d} std_ulogic`).join('; ')});
end ${name};
architecture silinx of ${name} is
begin
${ports.filter(([, d]) => d === 'out').map(([p]) => `  ${p} <= '0';`).join('\n')}
end silinx;`;

const out = n => n.split(' ').map(p => [p, 'out']);
export const UNISIM_JTAG_VHDL = [
  bscan('BSCAN_SPARTAN3', '', [...out('CAPTURE DRCK1 DRCK2 RESET SEL1 SEL2 SHIFT TDI UPDATE'), ['TDO1', 'in'], ['TDO2', 'in']]),
  bscan('BSCAN_SPARTAN6', 'JTAG_CHAIN : integer := 1', [...out('CAPTURE DRCK RESET RUNTEST SEL SHIFT TCK TDI TMS UPDATE'), ['TDO', 'in']]),
  bscan('BSCANE2', 'DISABLE_JTAG : string := "FALSE"; JTAG_CHAIN : integer := 1', [...out('CAPTURE DRCK RESET RUNTEST SEL SHIFT TCK TDI TMS UPDATE'), ['TDO', 'in']]),
].join('\n');

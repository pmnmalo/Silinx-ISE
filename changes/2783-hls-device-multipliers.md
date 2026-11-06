In short:

- **Silinx HLS:** a C function is scheduled within the device's multiplier blocks (the MULT18X18s or DSP48A1s), no
  longer as if it had any number of them.

In detail:

- **The device's multiplier blocks a limit (#2783):** the interface and the MCP server's C tools gave `resourceCount`
  the device's part name where it needs its part record (`S.devices.parts`, `findPart`): it threw, and every C function
  was scheduled with no limit of multiplier blocks. `hlsMultsOf` (core/c-report.js) takes the part record now: six
  multiplications in one state take the 4 MULT18X18s of an XC3S100E (Basys2-100), two of them used twice, and
  co-simulate in VHDL and in Verilog with no warnings; View C Synthesis Report, C/RTL Co-simulation and the HDL made
  from the C follow the device.

In short:

- **Device Primitives built with ISE:** a schematic's RAMB16_S1, Spartan-6 block RAMs and DSP48A1 now give HDL that
  Xilinx ISE synthesizes and implements; a DSP48A1 with both M and P connected is an error.

In detail:

- **Device primitives under ISE (#859):** a 1-bit data port of a RAMB16 (RAMB16_S1, a dual port's 1-bit side) is
  associated `DI(0) =>` as UNISIM's vector (XST's HDLParsers:800); RAMB8BWER / RAMB16BWER's DATA_WIDTH_A / _B written as
  integers (XST's HDLCompiler:837 on the string); RAMB16BWER's SIM_DEVICE = "SPARTAN6" always written, in the schematic
  and in its Language Template (ngdbuild changed it from SPARTAN3ADSP, a warning); DSP48A1's M and P both connected an
  error (ISE's map refuses it, PhysDesignRules:2136), Symbol Info's HDL leaving M out; a bus tap of bit 0 of a 1-bit net
  written as the net (an index of a scalar, refused by XST in VHDL and Verilog).

In detail:

- **Spartan-6 synthesis: no warning on an inferred block RAM's ports (#2045):** Yosys's block-RAM mapping for the
  Spartan-6 connects its generic 64- and 8-bit data ports and a 14-bit address to the RAMB8BWER's narrower ones. It
  logs "Resizing cell port … DOADO from 64 bits to 16 bits" and "ADDRAWRADDR from 14 bits to 13 bits" (a RAMB8BWER's
  rule has 13 address bits, so the 14th is never used). These are left out of the log and the warnings as the
  Spartan-3E's were (packages/silinx-fpga/src/synth-open.js QUIET). The stopwatch example now synthesizes for the
  Nexys3 with no warning. Tests: test/synth-open.test.js, test/s6-devices.test.js, test/unisim-s6.test.js.

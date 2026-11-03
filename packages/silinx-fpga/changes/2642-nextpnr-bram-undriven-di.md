In detail:

- **The nextpnr engine leaves a block RAM's undriven data input unconnected (#2642).** A data bit Yosys leaves undriven
  (a 512 x 16 RAM on a RAMB16_S18, whose top data bit the word does not use) was tied to 0, and ISE's DRC warned of a
  dangling output pin (PhysDesignRules:812, DOA15 on feat_bramwiz_inf); it is now left out, as Silinx's packer does
  (the parity inputs stay at 0, all or none). On the open flow's 8 designs with block RAMs, ISE's DRC clean and
  Silinx's `.bit` byte-identical to ISE's (CRC on and off).
  - **Tests:** packages/silinx-fpga/test/nextpnr-hard.test.js (`hardInputs`: the undriven data bit free),
    packages/silinx-fpga/test/nextpnr-engine.test.js (feat_bramwiz_inf built through nextpnr with no warnings, its new
    fixture).

In short:

- **The nextpnr engine takes block RAMs and multipliers:** `--engine nextpnr` now places and routes RAMB16_S* and
  MULT18X18 / MULT18X18S / MULT18X18SIO cells, not yet a multiplier's cascade. The stopwatch example goes through it on
  all four Spartan-3E devices.

In detail:

- **The nextpnr engine: block RAMs and multipliers (#2193):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is
  now nextpnr-spartan v0.5.0. Its micro-architecture has RAMB16 and MULT18X18SIO BELs and their delays, and sources for
  their constant pins: a VCC site beside each pin, a SLICEL giving 0 on Y.
  - **src/open-flow-nextpnr.js:** `hardInputs` leaves a block RAM's and a multiplier's inputs as Silinx's packer does
    (`parityToData`, now exported by src/fpga/pack-bram.js; a port never written without its data; the other undriven
    inputs at 0).
  - **src/fpga/nextpnr-xdl.js** writes their settings as src/fpga/pack-cfg.js does, and the constants as XDL's `vcc` and
    `gnd` nets, which ISE takes for constants.
  - **Checked with ISE:** the stopwatch example on the Basys2-100 / 250 and the Nexys2-500 / 1200: no DRC errors or
    warnings, the `.bit` byte-identical to ISE's bitgen, with and without CRC.
  - **Tests:** packages/silinx-fpga/test/nextpnr-hard.test.js. The traffic example takes 71 slices (70): nextpnr-spartan
    v0.4.0's change, not pinned here before.

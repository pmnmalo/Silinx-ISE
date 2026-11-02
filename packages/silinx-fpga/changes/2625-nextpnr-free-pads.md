In detail:

- **nextpnr-spartan v0.15.0 (#2625): the ports with no LOC on pads nextpnr chooses.** The nextpnr engine refused a port
  the constraints give no pad; nextpnr now puts it on a free bonded pad as Silinx's placer chooses them: an input-only
  pad for an input only, a bank whose VCCO its I/O standard needs, the clock inputs first on their dedicated paths (a
  DCM's CLKIN, a clock switch's two pads, a global buffer's), an I/O with registers out of a differential pair whose
  other IOB has registers of that kind on another clock (#749). On 13 of the open flow's designs with such ports: ISE's
  DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on and off).
  - **Tests:** test/open-toolchain.test.js (#31 and #4 on the Silinx engine, which they test); packages/silinx-fpga/test/nextpnr-engine.test.js (`nextpnrNetlist` with ports with no LOC; the gates
    example built with `--engine auto` and a pad left out: nextpnr, on a free bonded pad), test/silinx-fpga-package.test.js,
    test/toolchain-boundary.test.js and the third-party notices' check.

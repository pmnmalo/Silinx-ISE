In short:

- **Spartan-6, every pad usable:** on the Nexys3 and the Atlys, the Silinx toolchain now places inputs and outputs
  on every pad, including the top-bank pads that took no output (30 on the XC6SLX16, 23 on the XC6SLX45) and the four
  pads beside a clock column that took no input.

In detail:

- **The Spartan-6's nextpnr at 0.4.1, from npm (#3349, #3357):** `@silinx/nextpnr-himbaechel-spartan6` is pinned at
  0.4.1 from the npm registry, no longer by the URL of a GitHub release asset (spartan6-v0.3.0), which `npm i
  silinx-fpga` fetched unpinned (#3357). Its chip database has the pads' PIPs that ISE measured (#3269, #3350, #3169),
  which move from `bitdb/s6/s6-pips-held.json` (removed) into the bit database the flow reads, so every pad of both
  parts has an input and an output path, and nextpnr routes them.

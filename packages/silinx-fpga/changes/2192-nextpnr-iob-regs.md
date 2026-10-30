In short:

- **The nextpnr engine takes the IOB registers:** `--engine nextpnr` now places IOB flip-flops, IDDR2 / ODDR2 and
  tristate outputs, and a clock pad's global buffer on its dedicated path.

In detail:

- **The nextpnr engine: the IOB's registers and DDR, the clock pads (#2192):** the dependency
  `@silinx/nextpnr-himbaechel-spartan3e` has this since nextpnr-spartan v0.4.0: its micro-architecture packs a flip-flop into
  its pad's IOB when asked (the UCF's `IOB = TRUE`), an IDDR2 / ODDR2 as the IOB's two flip-flops, and places a pad's
  global buffer where the pad's dedicated path reaches it.
  - **src/fpga/nextpnr-iob.js** (new) writes the IOB's settings as Silinx's packer does; **src/open-flow-nextpnr.js**
    (Map) accepts IBUFG, OBUFT, IOBUF, IDDR2 and ODDR2, and passes the UCF's IOB constraints; **research/nextpnr-s3e/lib.mjs**'s
    simCheck simulates the IOB's registers on both clock edges and with random inputs.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.

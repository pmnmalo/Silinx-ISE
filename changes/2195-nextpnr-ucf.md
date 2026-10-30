In short:

- **The nextpnr engine takes the whole UCF:** a pad's IOSTANDARD, DRIVE, SLEW, PULLUP / PULLDOWN / KEEPER now reach the
  bitstream (they were fixed at LVCMOS25, 12 mA, slow), and each clock's PERIOD is its own target for place and route.

In detail:

- **The nextpnr engine: the UCF beyond LOC and PERIOD (#2195):**
  - **The pads' attributes:** `nextpnrNetlist` puts them on each pad's buffer, a NET name with wildcards on every bit it
    matches, and **src/fpga/nextpnr-iob.js** writes them as Silinx's packer does. An input nothing reads gets no pad, as
    with Silinx's engine.
  - **Several clocks:** one `create_clock` per PERIOD in an SDC file (`--sdc`), on the clock's net after its global
    buffer; the tightest stays as `--freq` for clocks with none. No new nextpnr-spartan release.
  - **OFFSET, TIG, CLOCK_DEDICATED_ROUTE:** as in Silinx's flow, where the placer and the router read none of them: OFFSET
    and PERIOD are checked by the shared timing step; TIG and CLOCK_DEDICATED_ROUTE change nothing, with no warning.
  - **Proof:** research/nextpnr-s3e/ucf_all.v: every IOB's settings equal to Silinx's packer's; ISE's DRC with no errors
    or warnings, the .bit byte-identical to ISE's bitgen; its flip-flops simulate equal to the netlist.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js (the settings against Silinx's packer, the SDC, the
    checks of both engines compared, no warnings).

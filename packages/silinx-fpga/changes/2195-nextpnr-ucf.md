In short:

- **The nextpnr engine takes the whole UCF:** IOSTANDARD, DRIVE, SLEW and the pulls reach the bitstream, and each clock's
  PERIOD is its own target.

In detail:

- **The nextpnr engine: the UCF beyond LOC and PERIOD (#2195):** `nextpnrNetlist` puts a pad's attributes on its buffer
  (wildcards too) and writes an SDC with one `create_clock` per PERIOD; **src/fpga/nextpnr-iob.js** writes the settings as
  Silinx's packer does; an input nothing reads gets no pad. OFFSET and PERIOD are checked by the timing step; TIG and
  CLOCK_DEDICATED_ROUTE change nothing, as in Silinx's own flow.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.

In short:

- **Ports with no pin through nextpnr:** a design whose constraints leave some ports without a `LOC` now builds with the
  nextpnr engine, which chooses their pads (Back-annotate Pin Locations writes them), instead of falling back to the
  Silinx engine.

In detail:

- **nextpnr-spartan v0.15.0 (#2625):** nextpnr puts each port with no LOC on a free bonded pad, as Silinx's placer
  chooses them (the banks' VCCO, the clock inputs on their dedicated paths, the differential pairs' clock wires).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js.

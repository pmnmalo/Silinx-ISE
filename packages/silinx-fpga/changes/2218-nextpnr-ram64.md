In short:

- **RAM64X1S with nextpnr:** a design with a RAM64X1S now builds with the nextpnr engine, instead of falling back to Silinx's.

In detail:

- **RAM64X1S in the nextpnr engine (#2218):** `nextpnrNetlist` lowers it to two RAM32X1S and the LUTs of their write enables and read multiplexer (`lowerRam64`), as `pack-prep.js` does.
  - **Tests:** test/nextpnr-engine.test.js (the lowering, its edge cases, a build with no warnings, the routed XDL simulated against the RAM64X1S).

In detail:

- **A Spartan-6 RAM32M with no DID (#2755):** the open synthesis's RAM32M of micro80's register bank has no DID, so
  the D LUT's DX and DI site pins had no net, and ISE's DRC gave 4 errors (PhysDesignRules:1422, 2100: a RAM's DI1 and
  DI2 must be connected); ISE's bitgen then refused the routed design. The physical stage now ties a RAM32M's or
  RAM64M's data input with no net low, as ISE's map ties the same netlist's (DX and DI on GLOBAL_LOGIC0)
  (`s6/phys-mem.js`). Tests: test/s6-xdl-mem.test.js.

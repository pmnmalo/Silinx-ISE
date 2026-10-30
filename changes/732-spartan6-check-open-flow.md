In detail:

- **`npm run check:open-flow` for the Spartan-6 (#732):** a Nexys3 or Atlys project (its device's family) runs the
  application's own open flow on a copy of it. ISE converts its routed design (xdl -xdl2ncd), checks it (drc) and
  writes its bitstreams (CRC on and off), and Silinx's bitstream of the same routing is compared with each, byte
  for byte (research/s6/check-bitgen6.mjs). The nightly ISE tests run this check for every example on both boards;
  ISE's own build of the examples on them is not recorded there yet. Tests: test/ise/examples.test.js.

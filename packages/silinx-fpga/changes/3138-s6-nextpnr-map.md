In detail:

- **The Spartan-6's Map by nextpnr, behind an option (#3138):** `spec.s6Map` 'nextpnr' (`s6MapOf(impl)`, from
  `parts.js`): Place & Route (`open-flow-nextpnr-s6.js`) gives nextpnr-himbaechel's spartan6 package (0.3.0) Yosys's
  netlist, each I/O buffer with its port and constraints (`fpga/s6/nextpnr-pack.js` `packInput`), for its packer and
  placer; the sites it packed are checked against Silinx's Map's (`samePacking`: a difference fails the step, naming the
  sites), its placement read back by them, and the design routed as before. The netlist's cells are sorted by name
  then (`sortedNetlistText`), so that Silinx's Map names its sites as the packer does. Silinx's Map stays the default
  until parity (#3139).

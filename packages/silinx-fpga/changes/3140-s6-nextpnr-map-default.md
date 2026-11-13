In detail:

- **The Spartan-6's Map: nextpnr's packer the default (part of #3140):** `s6MapOf` gives `nextpnr` unless `impl.s6Map` is
  `silinx`, and the Spartan-6's back end packs with nextpnr (`fpga/s6/nextpnr-pack.js`) unless the spec's `s6Map` is
  `silinx`: the command line too. Silinx's own placement of its Map's sites stays until it is removed.

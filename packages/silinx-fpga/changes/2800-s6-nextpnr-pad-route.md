In detail:

- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.1.3, every seed of the examples routed on the
  Nexys3 and the Atlys (#2800).** Some nets from an input pad fit inside one of nextpnr's router partitions, but their
  routes leave it. The single-threaded router (the WebAssembly build that ships) retried them only inside that
  partition and gave up ("Failed to route arc 0.0 of net 'u_knight.mode', from X27Y72/BIOB_IBUF0_PINW …": blinky on
  the Nexys3, seed 1; the net `db2.btn` of clock on the Atlys, seeds 2 and 3). The chip database had their path: the
  pad's IBUF, the ILOGIC route-through, then the interconnect. In 0.1.3 (nextpnr-spartan's PR 11), the router hands
  them to its whole-device pass, as the threaded build does.
  - **Tests:** test/examples-nextpnr-s6.test.js.

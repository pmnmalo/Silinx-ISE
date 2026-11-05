In detail:

- **nextpnr-himbaechel-spartan3e 1.0.0 (#2438).** nextpnr-spartan's PR 12 (2a07796a), the only change since 0.20.0:
  the package's interface frozen under semantic versioning (its README's "The interface" and "Stability"): the module's
  exports, documented in `lib/api.d.ts`; the chip databases' files and the release's assets; the arguments Silinx
  passes to nextpnr, the netlist's attributes, the routed design's and the log's form. Placement and routing are
  0.20.0's. The package now ships its README and CHANGELOG.md.
  - **Tests:** test/nextpnr-s3e-interface.test.js (new): the pinned version a 1.x, the exports Silinx imports declared,
    the chip databases' files and the release's URL, every argument open-flow-nextpnr.js passes among the frozen ones;
    test/examples-nextpnr-s3e.test.js: the examples route on every seed with no warnings on 1.0.0.

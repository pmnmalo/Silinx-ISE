In short:

- **Larger designs placed and routed by the nextpnr engine:** ITC'99 b14, b21 and b22 (XC3S250E) build, where before
  nextpnr stopped on an error; a routing that does not converge stops with an error naming the wires, not running with
  no end.

In detail:

- **The Spartan-3E's nextpnr engine at 1.3.0 (#2818, #2977, #2982).** nextpnr-himbaechel-spartan3e 1.1.2, 1.2.0 and
  1.3.0 (nextpnr-spartan PRs 20 and 24, 50328fbb):
  - 1.1.2 (#2818): a LUT on the S of two stages of one carry chain, their sums not used, is the LUT of one stage only;
    taken for both, the placer bound it on two BELs and stopped on an assertion, a WebAssembly exception with no
    message. Such an exception is now said as an ERROR line.
  - 1.2.0 (#2982): a SLICEM memory's address pin at 0 is routed from a free slice's GND source, no longer a LUT each
    (iwls05-sasc on the XC3S1200E: 80 -> 52 slices).
  - 1.3.0 (#2977): a carry stage's DI no longer comes through pin 1 of a LUT whose four inputs are other nets when BX /
    BY is free (router 2 left the LUT's four nets three pins, overused for ever); router 2 stops after 500 iterations
    with `Routing design failed: router 2 did not converge in 500 iterations (router2/maxIter), <n> wire(s) still
    overused: …`.
  - The design corpus: itc99-b14 complete (657 slices, 35.424 ns), itc99-b21 (1363 slices, 38.190 ns), itc99-b22
    (2030 slices, 39.372 ns), each with the PERIOD 20 ns warning; itc99-b20 fails with router 2's new error (2 wires
    overused after 500 iterations), recorded in test/designs-corpus/expected.json.

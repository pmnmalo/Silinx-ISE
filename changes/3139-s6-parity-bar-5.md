In detail:

- **The Spartan-6's nextpnr Map: its parity bar is 5 % (part of #3139):** the maintainer's bar (2026-11-12) for
  nextpnr's Map against Silinx's Map is each board's examples' periods within 5 % on average (the geometric mean of
  their ratios; the Spartan-3E's was about 4 %), stated so in packages/silinx-fpga/research/s6/README.md and in
  test/examples-nextpnr-s6-pack-lib.mjs, whose average is now its `meanRatio`. The new test/s6-nextpnr-parity.test.js
  checks the bar, the average against the README's recorded periods (1.7 % on the Nexys3, 4.1 % on the Atlys), its
  edges, and that the README states the bar the test checks.

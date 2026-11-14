In detail:

- **The nightly CI of 14 November, fixed (#3856, #3857, #3858, #3860, #3861, #3862, #3863):** the symbol editor's own
  `clone` replaced by core/util.js's (#1406's one copy); the Spartan-6's Yosys script's BSCAN clock-driver step (#3766)
  in test/synth-open.test.js; blinky's `step` assignment at its new line (the examples' generics) in
  test/twr-paths.test.js; on Windows, the temporary folder's absolute path refused as a drive letter in
  test/server-paths.test.js; the VHDL LRM's section number in a commit message allowed by the private-data scan.

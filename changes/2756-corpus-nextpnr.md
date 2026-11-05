In detail:

- **The design corpus and the synthesis's measurements on the nextpnr engine (#2756).** `test/designs-corpus/run.mjs`
  places and routes each design through the flow's Translate, Map and Place & Route with the nextpnr engine, one
  placement (`lib.mjs` `nextpnrPlaceRoute`), not through Silinx's `placeRouteBest`. Silinx's packer still gives the size
  the runner reads first, to choose a larger device. nextpnr's errors are read for the I/O wrapper ("no free pad left in
  this package") and for the larger device ("no BELs remaining"), and a failure gives nextpnr's reason. The expectations
  are recorded again (the README's results table). 63 of the 67 designs build, 13 smaller or faster. The ITC'99 b14,
  b20, b21 and b22 stop in nextpnr's placer (#2818). Nine are larger or slower than Silinx's engine made them (#2819). Six
  have nextpnr's "Max frequency" warning (#2820). `research/synth-quality`'s `abc9.mjs` and `fsm.mjs` place and route
  through the same helper. `measure.mjs` loses `--place`, the estimate of Silinx's placer.
  - **Tests:** test/designs-corpus.test.js (nextpnrPlaceRoute on the gates netlist; a failure as an error).

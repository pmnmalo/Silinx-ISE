In detail:

- **The toolchain package's public API (#1678):** the first part of step 7 of the toolchain's separation (#1651,
  docs/TOOLCHAIN-SEPARATION.md). packages/silinx-fpga gets its entries (`exports`): `silinx-fpga`
  (src/index.js, the same in Node and in the browser: the flow, runFlow with its io, and its steps; the synthesis;
  the netlist and the UCF in; pack, place and route, bitgen for a flow of one's own; the XDL and the .bit out; the
  timing and power reports; the devices and bit databases from their files' contents; the parts' families and
  resources) and `silinx-fpga/node` (the same, with the device graphs and bit databases read from the disk and Yosys
  in Node's workers). The flow places and routes through `io.placeRoute` when its io gives one (another engine, such
  as nextpnr: #1953, #1954), Silinx's own placeRouteBest otherwise. The package's README documents the API with an
  example. Tests: test/silinx-fpga-api.test.js (the API's names, none of Node's modules behind the browser's entry, a
  counter from Verilog and a UCF to its routed XDL and .bit through the API alone, a place and route given through
  io and its failure). The IDE's importers switch to the API in the second part. No behaviour change.

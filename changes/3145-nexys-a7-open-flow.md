In short:

- **The Nexys A7 in the Silinx toolchain (experimental):** a Nexys A7 project builds without Vivado too, from HDL to its
  `.bit`, as a Basys 3 project does.

In detail:

- **The Nexys A7's xc7a100t in the 7-series' back end (#3145, part of #3147):** silinx-fpga ships the xc7a100t's bit
  database (`bitdb/xc7/xc7a100tcsg324-1.json.gz`), so `openStatus` says the Nexys A7 is available and the local server
  runs the 7-series' back end for it. Every example builds on the Nexys A7 with no warning, each clock at the board's
  100 MHz by nextpnr's estimate, its `.bit` the xc7a100t's (its ID code, its 9448 frames), its frames those
  `fasm2frames` makes of nextpnr's FASM and its round trip by bits clean (test/open-flow-xc7-server.test.js, now over
  both boards, `XC7_TARGETS`). The prjxray-db notice names the xc7a100t too.

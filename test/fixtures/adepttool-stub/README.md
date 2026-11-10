Stand-ins for adepttool (github.com/mwkmwkmwk/adepttool) and its `usb1`, for the tests of `scripts/ila-scan.py`
(`test/ila-board.test.js`, #3176): a board of a Spartan-3E and a Platform Flash on the chain, the FPGA's USER1 register a
model of the logic analyzer's core (its samples, the captures its trigger takes: the environment's `SILINX_ILA_STUB`,
JSON, else `ila-stub.json` in `SILINX_CONFIG_DIR`: the UI test's server, already running). `basys2_prog.py` is there only so that `server/programmer.js adepttoolPaths` takes the folder for adepttool's.

# The measurements of the XC3S100E (#3)

What the measured description of the XC3S100E-CP132 (Basys2-100) is built from (research/s3e-device README, "The
recipe for the other dies"), and the description itself. `node research/s3e-device/build-measured.mjs out.json.gz
research/s3e-device/data/xc3s100e --part xc3s100ecp132-4` rebuilds it from these files alone, with the bit database and
the device report's grid and sites; `test/s3e-device.test.js` checks the rebuild is `measured.json.gz`.

| File | What |
|---|---|
| `obs.json.gz` | The observation of ISE's routed designs (`prototype.mjs observe`, `INTERSECT=1`): the 38 observation designs and `iobddr-b`, the 12 sparser clock designs, the 4 random designs, 33 of the `test/fixtures/open-flow` designs: PIPs, sites, pin wires, joins seen, the joins rules decided (`decided`, hypotheses), the ambiguous ones |
| `others.json.gz` | Silinx's routes of the 7 examples on the shipped graph, which ISE's DRC passed (their XB / YB pins only) |
| `probes.json.gz` | The arc probe's answers (`xdl -xdl2ncd`): `yes` / `no` per PIP and tile, by probe (the I/O tiles of the joins left, every non-CLB tile's PIPs and the I/O names, the block RAMs' clock PIPs) |
| `verdicts.json.gz` | The verdicts of every round of join and clock tests (ISE's DRC), by round, in the order they were taken: `[a, b, 'join' \| 'no-join' \| …]` (`invalid`: a test whose path crossed a join not yet known) |
| `switch-tiles.txt` | The tiles that hold a switch box (the tile probe), for the rules in switch-box coordinates |
| `measured.json.gz` | The measured description, Silinx's packed format (`packages/silinx-fpga/src/fpga/device.js` `loadDevice`) |

None of these is a file of ISE's: they are Silinx's own measurements of what ISE accepts and how it routes.

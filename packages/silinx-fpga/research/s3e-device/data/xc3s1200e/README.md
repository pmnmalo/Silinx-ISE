# The measurements of the XC3S1200E (#3)

What the measured description of the XC3S1200E-FG320 (Nexys2-1200) is built from (research/s3e-device README, "The
recipe for the other dies", part 9), and the description itself. `node research/s3e-device/build-measured.mjs
out.json.gz research/s3e-device/data/xc3s1200e --part xc3s1200efg320-4` rebuilds it from these files alone, with the bit
database and the device report's grid and sites; `test/s3e-device.test.js` checks the rebuild is `measured.json.gz`.

| File | What |
|---|---|
| `obs.json.gz` | The observation of ISE's routed designs (`prototype.mjs observe`, `INTERSECT=1`): the 38 observation designs and `iobddr-b`, the 12 sparser clock designs, the 4 random designs, the 44 open-flow designs ISE implemented: PIPs, sites, pin wires, joins seen, the joins rules decided (`decided`, hypotheses), the ambiguous ones. The joins and decided joins of a long line's two halves at the splitters (`LVk` / `LHk`, `CLK*_LL*_L[HV]k`) that the shipped graph keeps apart are left out (part 9) |
| `others.json.gz` | Silinx's routes of the 7 examples on the shipped graph, which ISE's DRC passed (their XB / YB pins only) |
| `probes.json.gz` | The arc probe's answers (`xdl -xdl2ncd`): `yes` / `no` per PIP and tile, by probe (the I/O tiles of the joins left; every non-CLB tile's PIPs, the I/O names and the block RAMs' clock PIPs) |
| `verdicts.json.gz` | The verdicts of every round of join and clock tests (ISE's DRC), by round, in the order they were taken: `[a, b, 'join' \| 'no-join' \| …]` (`invalid`: a test whose path crossed the other end's node, part 7, or a long line's two halves at a splitter, part 9) Round `sp`: the long-line splitters measured by half with ISE's bitgen (part 10, #2483). |
| `switch-tiles.txt` | The tiles that hold a switch box (the tile probe), for the rules in switch-box coordinates |
| `measured.json.gz` | The measured description, Silinx's packed format (`core/fpga/device.js` `loadDevice`) |

None of these is a file of ISE's: they are Silinx's own measurements of what ISE accepts and how it routes.

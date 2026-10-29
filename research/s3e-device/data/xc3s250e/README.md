# The measurements of the XC3S250E (#3)

What the measured description of the XC3S250E-CP132 is built from (research/s3e-device README sections 9-15), and the
description itself. `node research/s3e-device/build-measured.mjs out.json.gz` (`--part xc3s250ecp132-4`, the default) rebuilds it from these files alone, with
the bit database and the device report's grid and sites; `test/s3e-device.test.js` checks the rebuild is
`measured.json.gz`.

| File | What |
|---|---|
| `obs.json.gz` | The observation of ISE's routed designs (`prototype.mjs observe`, 178 designs, merged with the earlier ones'): PIPs, sites, pin wires, joins seen, the joins rules decided (`decided`, hypotheses), the ambiguous ones |
| `others.json.gz` | The other observations: the FT256 package's (its pads renamed to the CP132's sites), Silinx's XB / YB routes ISE's DRC passed (pins only) |
| `probes.json.gz` | The arc probe's answers (`xdl -xdl2ncd`): `yes` / `no` per PIP and tile, by probe |
| `verdicts.json.gz` | The verdicts of every round of join tests and clock tests (ISE's DRC), by round, in the order they were taken: `[a, b, 'join' \| 'no-join' \| …]` |
| `switch-tiles.txt` | The tiles that hold a switch box (the tile probe), for the rules in switch-box coordinates |
| `measured.json.gz` | The measured description, Silinx's packed format (`packages/silinx-fpga/src/fpga/device.js` `loadDevice`) |

None of these is a file of ISE's: they are Silinx's own measurements of what ISE accepts and how it routes.

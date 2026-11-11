In detail:

- **The 7-series' bitstream checked with no Vivado and no board (part of #3145):** `src/fpga/xc7/readback.js` reads a
  `.bit` back into its features as Project X-Ray's `bitread` and `bit2fasm` do (`readBitFramesXc7`: the frames from the
  FAR and FDRI's data, the padding checked, the ECC bits left out; `framesToFeatures`: the features whose bits a tile's
  frames hold, the bits no feature explains), on its own index of the bit database (`bitIndexXc7`, `tileFeatureBits`),
  apart from the generator's lookups. `src/fpga/xc7/roundtrip.js` writes the frames `fasm2frames` makes of a FASM
  (`referenceFrames`, what it adds too: the required features, PUDC_B's pull-up, a bank's STEPDOWN) and compares a
  `.bit` with nextpnr's FASM by bits, not by names (`roundTrip`: no bit lost, none stray, none of no feature; the
  pseudo-PIPs, zero encodings, aliases and added features counted). The reference frames are Project X-Ray's for the
  three FASMs of the fork's CI, and every example's `.bit` on the Basys 3 has the frames of its FASM and a clean round
  trip.

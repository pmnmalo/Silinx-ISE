In short:
- gowin_pack: the rPLL and the oscillator, their .fs byte for byte Apicula's.

In detail:
- `src/fpga/gowin/pll-osc.js` (#2303): `pllAttrs`, `pllPump`, `pllAuxCols`, `oscAttrs` (Apicula 0.32's set_pll_attrs, calc_pll_pump, extra_pll_bels and set_osc_attrs); `gowinPack(netlist, db, device)` takes the device's name (`'GW1N-9C'` by default), which `io.nextpnr.gowin`'s `pack` passes; `attrids.js` gains the PLL and OSC tables.

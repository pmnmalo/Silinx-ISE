In short:
- The Gowin's bitstream with a PLL or the oscillator: a design that instantiates the GW1N's rPLL (CLKOUT, CLKOUTP, CLKOUTD, CLKOUTD3) or its internal oscillator (OSC) now gets its .fs on the Tang Nano 9K, byte for byte Apicula's own.

In detail:
- gowin_pack's rPLL and oscillator in JavaScript (#2303): packages/silinx-fpga/src/fpga/gowin/pll-osc.js ports Apicula 0.32's set_pll_attrs (the dividers checked against the device's frequencies, the charge pump and loop filter from them, the phase and duty fixed or dynamic, the bypasses, the dividers static or dynamic), the cells beside an rPLL (RPLLB) and set_osc_attrs (its divider even); attrids.js gains Apicula's PLL and OSC tables. The other PLLs (PLLVR, PLLA), IOLOGIC and LVDS stay refused by name.
- Tests: test/gowin-pll-osc.test.js builds seven designs (the rPLL on each side of the GW1N-9C with its outputs, phase, duty, bypasses and dividers; the oscillator by 10 and by 128) from HDL to their .fs, compared with Apicula's own gowin_pack run offline (their SHA-256 in test/fixtures/gowin-pack/apicula-0.32.json), their warnings asserted; the charge pump against Apicula's values; the limits refused with Apicula's messages.

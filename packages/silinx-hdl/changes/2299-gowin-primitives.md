In detail:

- **The Gowin primitives' simulation models (#2299, #3498):** src/gowin-prims.js, gowin-bsram.js and gowin-dsp.js (LUT1-4,
  MUX2_LUT*, the flip-flops and latches, ALU, the distributed and block RAMs, the buffers, rPLL / PLLVR, OSC / OSCZ / OSCH,
  MULT9X9 / 18X18 / 36X36), added by primitiveSources (unisim.js) in place of UNISIM's to a design that instantiates them
  or uses `library gw1n`; native-gowin.js runs the netlist cells natively; the flat Verilog keeps a Gowin primitive as
  Gowin's cell, its name as Gowin writes it (rPLL, pROM).

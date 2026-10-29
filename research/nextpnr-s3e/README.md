# The Spartan-3E as a nextpnr Himbaechel micro-architecture (spike, #1954)

Can nextpnr place and route the Spartan-3E, with Silinx's device graph as its chip database and
Silinx's bitgen writing the `.bit`? The spike: LUTs, flip-flops, IOBs and BUFGMUXes only, on the
XC3S250E (Basys2-250).

## The pieces

| Where | What |
|---|---|
| nextpnr fork, branch `silinx-s3e`: `himbaechel/uarch/spartan3e/gen/s3e_gen.py` | The chip database from Silinx's device graph (`packages/silinx-fpga/devices/<part>.json.gz`): one tile type per template, the graph's wires, PIPs and nodes, and the BELs inside the sites written by hand (the graph has no site internals) |
| the same, `spartan3e.cc` | The micro-architecture: Yosys's `synth_xilinx -family xc3se -nocarry -nowidelut` cells (LUT1…4, INV, FD*, IBUF, OBUF, BUFG) to LUT4 / FF / IOB / BUFGMUX, the pads from the ports' `LOC` attributes, the slice's shared CLK / CE / SR checked |
| `export-unknown-pips.mjs` | The PIPs whose bits Silinx's bit database does not know (Silinx's own router is kept off them: `knownRouting`), per tile, for the generator to leave out |
| `nextpnr-to-xdl.mjs` | nextpnr's routed design (`--write`) to XDL: one instance per used site with its settings, each net's site pins and PIPs |
| `xdl-to-bit.mjs` | Silinx's bitgen on that XDL |
| `xdl-report.mjs` | The size (slices, LUTs, flip-flops) and speed (each clock's minimum period, Silinx's static timing analysis fitted to trce) of a routed XDL: nextpnr's result and Silinx's measured the same way |

The site model, per slice: two LUT4s (F, G, inputs on F1…F4 / G1…G4), their outputs to X / Y
(FXMUX / GYMUX) and to the flip-flops (DXMUX / DYMUX, or BX / BY), two flip-flops on the site's
CLK, CE and SR. Per IOB: one pad buffer (O1, T1, I). Route-through PIPs (through a LUT, the carry
chain) are left out.

## Build and run

```
# in the nextpnr fork
cmake -S . -B build-s3e -DARCH=himbaechel -DHIMBAECHEL_UARCH=spartan3e -DBUILD_PYTHON=OFF -DBUILD_GUI=OFF \
  -DSILINX_DEVICES=<silinx>/packages/silinx-fpga/devices -DSILINX_UNKNOWN_PIPS=<dir of unknown-pips-xc3s250e.json>
cmake --build build-s3e -j6

# in Silinx
node research/nextpnr-s3e/export-unknown-pips.mjs xc3s250ecp132-4 <dir>/unknown-pips-xc3s250e.json
yosys -p "read_verilog blink.v; synth_xilinx -family xc3se -nocarry -nowidelut -top blink; write_json blink.json"
nextpnr-himbaechel --device xc3s250ecp132-4 --json blink.json --write routed.json
node research/nextpnr-s3e/nextpnr-to-xdl.mjs routed.json <build-s3e>/himbaechel/uarch/spartan3e/sites-xc3s250e.json routed.xdl
node research/s3e-route/check.mjs routed.xdl
node research/nextpnr-s3e/xdl-to-bit.mjs routed.xdl blink.bit
```

`blink.v` (in this folder): a 24-bit counter on the 50 MHz clock, its top byte on the LEDs, the ports'
pads as `LOC` attributes.

## Results (2026-10-29)

The chip database of the XC3S250E: 19 s in Python, a 75 MB `.bba`, a 24 MB `.bin` (293 tile types,
1243 routing shapes after deduplication). 28 030 of 2 108 744 PIPs left out for their unknown bits.

`blink.v`, the same Yosys netlist (37 LUTs, 24 flip-flops, 10 IOBs, 1 BUFGMUX) placed and routed by both:

| | nextpnr, LUT–FF pairs | nextpnr, slices packed | Silinx |
|---|---|---|---|
| P&R time | 0.3 s | 0.3 s | 0.6 s (place 0.1 s, route 0.5 s) |
| slices | 28 | 19 | 19 |
| PIPs | 448 | 450 | 351 |
| routing check against the graph | OK | OK | OK |
| ISE: `xdl -xdl2ncd`, `drc` | 0 errors, 0 warnings | 0 errors, 0 warnings | 0 errors, 0 warnings |
| ISE: `trce` minimum period | 9.269 ns | 10.343 ns | 6.717 ns |
| Silinx's timing analysis (`xdl-report.mjs`) | 9.432 ns | 10.421 ns | 6.821 ns |
| Silinx's bitgen against ISE's `bitgen` | byte-identical | byte-identical | byte-identical |

The slices packed (`pack_slices`): a LUT with the flip-flop it feeds, or either alone, is a unit; two
units with the same control set go into one slice, chosen by the nets they share (each net weighing
1 / its fanout), the rest paired by control set; each slice a cluster (F, G, FFX, FFY at z 0…3).

Not yet run on a Basys2.

What ISE taught the converter: an input alone is an `IBUF` instance, also on an IOB site; logic on a
SLICEM site is a `SLICEL` instance (as a `SLICEM`, ISE's DRC finds the SR pin "partially connected");
a BUFGMUX's select S is tied to VCC through its tile's VCC site (`XDL_DUMMY_<tile>_<site>`).

## What is left for a decision

- **Timing.** No timing model yet (all delays the default), so the placer and the router do not see
  speed: 10.3 ns against Silinx's 6.7 ns. Silinx's model (fitted to trce) to be written into the chip
  database's speed grade.
- **Constants**, the carry chain, MUXF5…F8, SLICEM's RAMs and shift registers, the IOB's registers,
  BRAM, MULT18X18, DCM: each a cell type, its BELs and its settings in the converter.
- **The clock pads.** nextpnr routes a pad to its BUFGMUX on general routing where a dedicated path
  exists, for want of delays.
- **WebAssembly**: the build of nextpnr-himbaechel with Emscripten (as YoWASP does), and the chip
  database (24 MB per device) loaded in the browser.

# The Spartan-3E as a nextpnr Himbaechel micro-architecture (spike, #1954)

Can nextpnr place and route the Spartan-3E, with Silinx's device graph as its chip database and
Silinx's bitgen writing the `.bit`? The spike: LUTs, flip-flops, IOBs and BUFGMUXes only, on the
XC3S250E (Basys2-250).

## The pieces

| Where | What |
|---|---|
| [pmnmalo/nextpnr-spartan](https://github.com/pmnmalo/nextpnr-spartan/tree/silinx), branch `silinx`: `himbaechel/uarch/spartan3e/gen/s3e_gen.py` | The chip database from Silinx's device graph (`packages/silinx-fpga/devices/<part>.json.gz`): one tile type per template, the graph's wires, PIPs and nodes, and the BELs inside the sites written by hand (the graph has no site internals) |
| the same, `spartan3e.cc` | The micro-architecture: Yosys's `synth_xilinx -family xc3se -nocarry -nowidelut` cells (LUT1…4, INV, FD*, IBUF, OBUF, BUFG) to LUT4 / FF / IOB / BUFGMUX, the pads from the ports' `LOC` attributes, the slice's shared CLK / CE / SR checked |
| `lib.mjs` | The functions of the scripts below (the converter to XDL and `xdlSize` re-exported from the toolchain's `src/fpga/nextpnr-xdl.js`, where they moved for the flow's nextpnr engine, #2136) (`unknownPips`, `timingExport`, `nextpnrToXdl`, `simCheck`, `xdlSize`); tested by `test/nextpnr-s3e.test.js` on nextpnr's routed counter (`test/fixtures/nextpnr-s3e/`) |
| `export-unknown-pips.mjs` | The PIPs whose bits Silinx's bit database does not know (Silinx's own router is kept off them: `knownRouting`), per tile, for the generator to leave out |
| `nextpnr-to-xdl.mjs` | nextpnr's routed design (`--write`) to XDL: one instance per used site with its settings (the sites named from the device graph), each net's site pins and PIPs |
| `xdl-to-bit.mjs` | Silinx's bitgen on that XDL |
| `export-timing.mjs` | Silinx's delay model (`SPEED_4`, fitted to trce) for the chip database: the class of the node each PIP drives, per template, and the model's delays |
| `xdl-sim-check.mjs` | Does the converted XDL implement nextpnr's netlist? Both simulated cycle by cycle, every flip-flop compared after each clock edge (the IOBs' too, a DDR register's on both edges); also from random states, for a counter's top bits, and with random inputs (`--random-inputs`), for an input register's edge or a reset; ISE's DRC cannot tell a wrong LUT equation |
| `xdl-report.mjs` | The size (slices, LUTs, flip-flops) and speed (each clock's minimum period, Silinx's static timing analysis fitted to trce) of a routed XDL: nextpnr's result and Silinx's measured the same way |

The site model, per slice: two LUT4s (F, G, inputs on F1…F4 / G1…G4), their outputs to X / Y
(FXMUX / GYMUX) and to the flip-flops (DXMUX / DYMUX, or BX / BY), two flip-flops on the site's
CLK, CE and SR. Per IOB: one pad buffer (O1, T1, I). Route-through PIPs (through a LUT, the carry
chain) are left out.

## Build and run

```
# in the nextpnr fork
cmake -S . -B build-s3e -DARCH=himbaechel -DHIMBAECHEL_UARCH=spartan3e -DBUILD_PYTHON=OFF -DBUILD_GUI=OFF \
  -DSILINX_DEVICES=<silinx>/packages/silinx-fpga/devices -DSILINX_UNKNOWN_PIPS=<dir> -DSILINX_TIMING=<dir>
cmake --build build-s3e -j6

# in Silinx
node packages/silinx-fpga/research/nextpnr-s3e/export-unknown-pips.mjs xc3s250ecp132-4 <dir>/unknown-pips-xc3s250e.json
node packages/silinx-fpga/research/nextpnr-s3e/export-timing.mjs xc3s250ecp132-4 <dir>/timing-xc3s250e.json
yosys -p "read_verilog blink.v; synth_xilinx -family xc3se -nocarry -nowidelut -top blink; write_json blink.json"
nextpnr-himbaechel --device xc3s250ecp132-4 --json blink.json --write routed.json
node packages/silinx-fpga/research/nextpnr-s3e/nextpnr-to-xdl.mjs routed.json routed.xdl
node packages/silinx-fpga/research/s3e-route/check.mjs routed.xdl
node packages/silinx-fpga/research/nextpnr-s3e/xdl-sim-check.mjs routed.json routed.xdl 1000 --starts 2000
node packages/silinx-fpga/research/nextpnr-s3e/xdl-report.mjs routed.xdl
node packages/silinx-fpga/research/nextpnr-s3e/xdl-to-bit.mjs routed.xdl blink.bit
```

`blink.v` (in this folder): a 24-bit counter on the 50 MHz clock, its top byte on the LEDs, the ports'
pads as `LOC` attributes. `blink27.v`: the same with 27 bits, bits 26…19 on the LEDs (LD7 a cycle every
2.68 s), to time on the board.

## Results (2026-10-29)

The chip database of the XC3S250E: 19 s in Python, a 75 MB `.bba`, a 24 MB `.bin` (293 tile types,
1243 routing shapes after deduplication). 28 030 of 2 108 744 PIPs left out for their unknown bits.

`blink.v`, the same Yosys netlist (37 LUTs, 24 flip-flops, 10 IOBs, 1 BUFGMUX) placed and routed by both:

| | nextpnr, LUT–FF pairs | slices packed | packed and timed | LUT pins permuted | Silinx |
|---|---|---|---|---|---|
| P&R time | 0.3 s | 0.3 s | 0.5 s | 0.5 s | 0.6 s (place 0.1 s, route 0.5 s) |
| slices | 28 | 19 | 19 | 19 | 19 |
| ISE: `xdl -xdl2ncd`, `drc` | clean | clean | clean | clean | clean |
| ISE: `trce` minimum period | 9.269 ns | 10.343 ns | 8.430 ns | 7.150 ns (seed 3) | 6.717 ns |
| Silinx's timing analysis (`xdl-report.mjs`) | 9.432 ns | 10.421 ns | 8.536 ns | 7.350 ns | 6.821 ns |
| nextpnr's own estimate | — | — | 7.56 ns | 6.90 ns | — |
| Silinx's bitgen against ISE's `bitgen` | byte-identical | byte-identical | byte-identical | byte-identical | byte-identical |

LUT pins permuted, five seeds: 7.35 to 7.80 ns by Silinx's analysis (nextpnr's estimate 6.63 to 7.13 ns).
A LUT's inputs I0..I3 are wires of their own, each reached from every site pin F1..F4 (G1..G4) by a PIP
carrying that pin's own delay (Silinx's `lutPin`), so the router puts the critical inputs on the fast pins;
the converter rewrites each LUT's equation for the pins chosen, and checks that every input's net is the
net on the site pin the equation reads it from.

Packed and timed, before the permutation, five seeds: 8.32 to 8.81 ns by Silinx's analysis (nextpnr's estimate 7.49 to 8.05 ns);
`--router router2`, `--placer sa`, `--placer-heap-timingweight 50` and `--tmg-ripup` no better.

The timing model (`export-timing.mjs`, the generator's `--timing`): nextpnr counts a PIP's delay, not a
wire's, so each PIP takes Silinx's delay of the class of the node it drives (double, hex, long, OMUX,
IMUX, global clock…; 407 template PIPs whose tiles disagree take the most frequent class); a LUT's
input arcs Silinx's Tilo with the pin's own offset and the connection's fixed part; a flip-flop's
clock to Q, setup on D, CE, SR; BX to the flip-flop as a PIP of its own delay; the placer's and the
router's estimates Silinx's distance model. Silinx's loads (a delay per extra branch off a node) are
left out: as nextpnr's RC model they are not seen by its router (fast PIP delays while routing), and
with them the routes came out slower (8.96 to 10.51 ns). nextpnr's estimate stays about 1 ns below the
analysis of its result for want of them.

The slices packed (`pack_slices`): a LUT with the flip-flop it feeds, or either alone, is a unit; two
units with the same control set go into one slice, chosen by the nets they share (each net weighing
1 / its fanout), the rest paired by control set; each slice a cluster (F, G, FFX, FFY at z 0…3).

On a Basys2-250 (2026-10-30), loaded by adepttool: `blink.v` (LUT pins permuted, seed 3) counts, each LED
twice as fast as the one above, SW0 holds them off; `blink27.v` (seed 3: 22 slices, ISE's DRC clean, trce
6.982 ns, `.bit` byte-identical to ISE's) takes about 27 s for 10 cycles of LD7 (26.8 s at 50 MHz), as
Silinx's build of the same netlist does. Both converted XDLs pass `xdl-sim-check.mjs` (5000 random starts).
At 3 to 12 Hz the rates of two builds could not be told apart by eye: the slower counter settled it.

What ISE taught the converter: an input alone is an `IBUF` instance, also on an IOB site; logic on a
SLICEM site is a `SLICEL` instance (as a `SLICEM`, ISE's DRC finds the SR pin "partially connected");
a BUFGMUX's select S is tied to VCC through its tile's VCC site (`XDL_DUMMY_<tile>_<site>`).

## The IOBs' registers and the clock pads (#2192)

`iob_regs.v` (in this folder): an input register, an output register, an output-enable one (the UCF's `IOB = TRUE`, which
the flow's `nextpnrNetlist` gives the micro-architecture as the attribute `IOB`), an IDDR2 and an ODDR2 on the clock and
its inverse, the clock on B8 (a GCLK pin); its constraints `test/fixtures/nextpnr-engine/iob_regs.ucf`. With
nextpnr-spartan v0.4.0 (2026-10-30), from Silinx's synthesis:
- the registers in their IOBs (IFF1 / IFF2, OFF1 / OFF2, TFF1: BELs of the IOB site), each IOB's settings those of
  Silinx's packer for the same netlist, in the same order (`nextpnr-iob.js`);
- the clock pad's BUFGMUX placed where its dedicated path reaches (BUFGMUX_X2Y11), the net routed on that path
  (`I0_PINWIRE -> IOIS_IBUF0`, `CLKT_CKI4 -> CLKT_GCLK0 -> CLKT_GCLKIN00`), as Silinx routes it;
- the routing check and `xdl-sim-check.mjs --random-inputs` passed (the 8 flip-flops, on both edges);
- ISE: `xdl -xdl2ncd` clean, `drc` 0 errors and 0 warnings, its `bitgen`'s `.bit` (CRC on and off) byte-identical to
  Silinx's; so too blink and blink_carry on the new chip database. Again with v0.5.0: iob_regs and all seven examples (Basys2-250).

## What is left for a decision

- **Speed.** With Silinx's delays nextpnr got 8.4 ns where Silinx gets 6.7 ns on the same netlist:
  Silinx's placer and router are the better ones here (its timing-driven placement, the loads in its
  router's costs). With the LUT pins permuted, 7.15 ns against 6.72 ns.
- **Constants**, the carry chain, MUXF5…F8, SLICEM's RAMs and shift registers,
  BRAM, MULT18X18, DCM: each a cell type, its BELs and its settings in the converter.
- **WebAssembly**: the build of nextpnr-himbaechel with Emscripten (as YoWASP does), and the chip
  database (24 MB per device) loaded in the browser.

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

## The wide multiplexers (#2190)

`widemux.v` (in this folder): a 16:1 tree (MUXF5, F6, F7, an F8), an 8:1 with an F7 on top, a MUXF7 whose inputs are no F6s (a
LUT); its constraints `test/fixtures/nextpnr-engine/widemux.ucf`. The primitives are instantiated: the synthesis keeps its
own trees only when they beat its other mappings. With nextpnr-spartan v0.6.0 (2026-10-30), the same F5MUX, F6MUX, F5USED and
FXUSED settings as Silinx's packer; the routing check and `xdl-sim-check.mjs --random-inputs` passed (32 flip-flops); ISE's
`drc` 0 errors and 0 warnings, its `bitgen`'s `.bit` (CRC on and off) byte-identical to Silinx's.

## The SLICEM's memories (#2191)

`slicemem.v` (in this folder): two RAM16X1S on one address, a RAM16X1D, a RAM32X1S, SRL16s with and without an enable, one into a flip-flop, a
cascade, four SRLC16E through Q15, an SRL16E_1; its constraints `test/fixtures/nextpnr-engine/slicemem.ucf`. With nextpnr-spartan v0.9.1
(2026-10-30): the settings of each memory slice those of Silinx's packer (which of a pair takes G apart); the routing check and
`xdl-sim-check.mjs --random-inputs` passed; ISE's `drc` 0 errors and 0 warnings, its `bitgen`'s `.bit` (CRC on and off) byte-identical. A
RAM64X1S (`ram64.v`, #2218) is lowered in the flow's netlist to two RAM32X1S and a LUT, as Silinx's packer does (`lowerRam64`).

## Flip-flops alone in the carry chains' slices (#2223)

As Silinx's packer (`fpga/pack-luts.js`), a flip-flop alone (its D through BX / BY: a shift register, a register loaded from
another) first takes a free flip-flop place of a carry chain's slices, one holding logic of its nets if it can, when the
slice's BX / BY is free or carries the same net (a chain's carry in, a DI its LUT cannot bring on pin 1) and its control
set suits; it joins the chain's cluster, and its D comes only through BX / BY. A chain's carry in at 1 comes from the CLB's
VCC site (XDL's `vcc` net to BX), not from a LUT giving 1; a stage whose select is a constant reads a LUT giving it.
`ffcarry.v` (in this folder): a counter, two comparators and a difference on shift registers, one loaded with an enable;
its constraints `test/fixtures/nextpnr-engine/ffcarry.ucf`. With nextpnr-spartan v0.10.0 (2026-10-30): 22 slices (Silinx 23),
ten flip-flops in the chains' slices, the routing check and `xdl-sim-check.mjs --random-inputs` passed, ISE's `drc` 0 errors
and 0 warnings, its `bitgen`'s `.bit` (CRC on and off) byte-identical. The VGA example: 148 slices and 278 LUTs where v0.9.1
took 157 and 296 (Silinx: 150 to 153, its GND sources' slices included).

## Falling edges, latches and clock switches (#2457)

Every cell Silinx's packer takes, the nextpnr engine takes too. A falling-edge flip-flop (`FD*_1`) or a latch (`LD*`) is an
FF with the slice's CLKINV as `pack-slices.js` writes it: a latch is transparent while CLKINV's output is low, so one with
an active-high gate takes CLK_B. A slice's two flip-flops share CLKINV and the latch mode; a latch stays out of the IOBs
(`pack-iobregs.js`); a latch's SYNC_ATTR is ASYNC. A clock switch (`BUFGMUX`, `BUFGMUX_1`) keeps I1 and S, and the flow's
netlist leaves it as `pack-prep.js` does (`lowerClockSwitches`: an input from a BUFG that BUFG's input, a constant select a
BUFG). The two buffers of a pair share their input lines: in the CLKT tile, `CLKT_GCLK1` drives both `GCLKIN01` (one buffer's
I0) and `GCLKIN10` (its partner's I1). A switch next to a buffer of another clock made router 1 loop on that line, so the
micro-architecture checks the pair as `place-bufgs.js` does (#846).
`edges.v` (in this folder): two falling-edge flip-flops, one into the other; an active-high latch with its enable and clear;
an active-low one with its preset; an output and an input register on the falling edge in their IOBs; a BUFGMUX_1 between
clk and clk2 beside clk's BUFG; a BUFGMUX whose select is 0. Its constraints are `test/fixtures/nextpnr-engine/edges.ucf`.
With the native build of nextpnr-spartan's branch (2026-11-01): 6 slices (as Silinx); ISE's xdl2ncd 0 warnings, its `drc`
0 errors and 0 warnings; its `bitgen`'s `.bit` (CRC on and off) byte-identical; trce 1.916 ns (Silinx's analysis 1.923 ns);
the XDL simulates equal to the netlist.

## The placer (#2222)

Most of the speed gap to Silinx's engine is placement (#2196): the same logic depth on the critical paths, longer nets
(clock on the Nexys2-500: 4.08 ns of nets against 3.07 ns). Two causes, measured on the examples' routes:
- **HeAP's refinement was a greedy pass** (placer1 at a temperature of 1e-7, a window of 3). The full annealer
  (`--placer sa`) cannot legalise the carry chains (their offsets are estimates), but the refinement moves a cluster
  whole through `getClusterPlacement`: from a warm temperature it is the annealing Silinx's placer does.
- **The placer's delays were the router's** (0.55 ns plus 0.1 ns a tile). Routed, a connection from a LUT takes 0.29 ns
  in its own CLB, 0.43 ns to the next and about 65 ps a tile beyond; from a flip-flop (through an OMUX) 0.49, 0.47 ns,
  then about 95 ps a tile. A net's loads (Silinx's delay per branch) add about 60 ps per doubling of its fanout.

nextpnr-spartan v0.11.0 (2026-10-31): the refinement from 1e-2 in a window of 30 tiles, 30 passes a temperature, the
criticalities to the 4th; `predictDelay` by the driver as above, and `predictNetLoadDelay` (a new arch hook, 0 by
default) for the loads. The examples on the four devices, 8 placements each, Silinx's analysis, against v0.10.0: periods
1.4 % shorter at best and 2.1 % on average (every example shorter on average), the slices unchanged; each placement takes
three to five times as long (1 to 7 s more natively). Best of 4 against Silinx's own engine: 7.4 % slower with v0.10.0,
5.4 % with v0.11.0. Their best of 4 routed: the routing check and `xdl-sim-check.mjs --random-inputs` passed, ISE's
`xdl2ncd`, `drc` and `bitgen` with no warnings, the `.bit` byte-identical (CRC on and off). Tried and dropped (within
noise, about ±0.7 %): the loads alone, the fitted delays alone, `lambda` 0.3 and 0.8, Silinx's exponent ramp from 1 to 8,
extra moves for the critical clusters, warmer starts (up to an annealing from 1.0), 15 passes (−0.9 / −1.6 %).

## What is left for a decision

- **Speed.** With Silinx's delays nextpnr got 8.4 ns where Silinx gets 6.7 ns on the same netlist:
  Silinx's placer and router are the better ones here (its timing-driven placement, the loads in its
  router's costs). With the LUT pins permuted, 7.15 ns against 6.72 ns.
- **Constants**, the carry chain,
  BRAM, MULT18X18, DCM: each a cell type, its BELs and its settings in the converter.
- **WebAssembly**: the build of nextpnr-himbaechel with Emscripten (as YoWASP does), and the chip
  database (24 MB per device) loaded in the browser.

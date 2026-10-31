# Spartan-3E routing: device graph and router (2026-10-10)

Silinx's router for the Xilinx Spartan-3E XC3S250E-4CP132 (Digilent Basys2), checked against
Xilinx ISE 14.7, following the method in [docs/OPEN-TOOLCHAIN.md](../../../../docs/OPEN-TOOLCHAIN.md).

- `packages/silinx-fpga/src/fpga/device.js`: the routing graph of the device (browser + Node).
- `packages/silinx-fpga/src/fpga/device-node.js`: its cache file (Node only).
- `packages/silinx-fpga/src/fpga/route.js`: the router (PathFinder) and a routing check.
- `packages/silinx-fpga/src/xdl.js` `writeXdl()`: a design back to XDL text.

| Script | What it does |
|---|---|
| `build-device.mjs` | Builds the graph cache from the full device report; prints sizes and load time |
| `timing-fit.mjs` | Fits the wire delay model of `packages/silinx-fpga/src/fpga/timing.js` to ISE's `reportgen -delay` of routed designs |
| `route.mjs` | Removes a design's PIPs, routes it, writes the XDL, checks it against the graph (`--known`: only PIPs of known bits) |
| `open-flow.mjs` | The fully open flow for a project: synthesis (Silinx + Yosys), pack, place, route on known PIPs, Silinx's bitgen |
| `ise-open-check.sh` | Inside the ISE container, the oracle of the open flow: `xdl -xdl2ncd`, `drc`, `bitgen` (CRC on / off), `trce -a`, `reportgen -delay` |
| `check.mjs` | Checks the routing of an XDL design (ISE's or Silinx's) against the graph |
| `gen-controls.mjs` | Control designs: all PIPs removed, one antenna added, bidirectional PIPs flipped, rewritten unchanged |
| `ise-check.sh` | Inside the ISE container: `xdl -xdl2ncd`, `drc`, `bitgen`, `trce` for each design |
| `cmpbit.mjs` | Compares the configuration frames of two bitstreams |
| `sdf-compare.mjs` | Compares the post-place & route model's SDF (#122) with ISE's netgen SDF of the same routed design |
| `dcm-timing.mjs` | trce on DCM designs (#601): Silinx's open flow here; on the ISE host ISE's own flow and trce on both routings (`ise-timing-check.sh`), Silinx's with a PCF in map's form (`silinxPcf`) |
| `dcm-timing-compare.mjs` | Silinx's static timing against trce's report of the same routing: the paths between two clocks, the pads' setup, hold, clock to pad |

Tools: ISE 14.7 (`xdl` P.20131013, `drc`, `bitgen`, `trce`) in the private Docker image
`xilinx/ise:14.7` (linux/amd64 under emulation); Node 22+.

## The device graph

**Source.** `xdl -report -pips -all_conns xc3s250ecp132-4 dev-full.xdlrc` (1 min 50 s): 204 MB of
text, 1419 tiles, 4615 sites, 569 094 tile wires, 2 139 368 PIPs. It comes from each user's own ISE
installation and is **not in the repository**, nor is anything derived from it (open legal question
in docs/OPEN-TOOLCHAIN.md): each user builds the cache once.

```
node research/s3e-route/build-device.mjs dev-full.xdlrc      # -> ~/.silinx/devices/xc3s250ecp132-4.json.gz
```

**Representation.** Most tiles of a kind are identical, so the graph is stored as *templates*:
each distinct tile content (wires, PIPs, sites with the tile wire of each pin) once, by local
index; each tile names its template, position and site names. The connections across tiles are
stored as *nodes*: sets of tile wires joined by metal (union of the report's `conn` lists),
varint-coded. 293 templates (576 CLBs share one), 200 181 nodes.

| | Size |
|---|---|
| Report (text) | 204 MB |
| Packed graph, JSON | 6.6 MB (templates 5.1, nodes 1.2, tiles 0.1, wire names 0.1) |
| Packed graph, gzip (the cache) | **1.96 MB** (templates 1.6, nodes 0.32) |
| Build (stream parse + pack + gzip) | 3.4 s |
| Load (gunzip 12 ms, JSON.parse 7 ms, `loadDevice` ~70 ms) | ~90 ms |
| Node-level edge arrays (`routingEdges()`, on first use) | 35 ms, 2.1 M edges, ~26 MB |
| Memory after load + edges | ~85 MB heap |

**Facts learned from the report and ISE's designs** (needed by the bitstream writer too):

- PIP directions in the report: `->` (2 134 376) and `=-` (4 992, bidirectional, buffered both
  ways: BX/BY of the CLBs and BRAM_FAN_BX/BY). Each bidirectional PIP is listed in both
  orientations, but a routed design names it in one only, whatever the direction of the signal
  (lab11 has `BY0 =- BX2` carrying BX2 to BY0 in one CLB and BY0 to BX2 in another): the wire with
  the lower number first (`BX0 =- BY1`, `BY0 =- BX2`, `BX1 =- BY3`, `BY2 =- BX3`). Writing them the
  other way round gives the **same bitstream** (lab11, 14 PIPs flipped: 0 frame bits differ).
- Route-through PIPs (`(pip T A -> B (_ROUTETHROUGH-A-B SITETYPE))`): through a LUT (F1..F4 -> X,
  G1..G4 -> Y), F5 -> X, FX -> Y, CIN -> X, COUT -> YB, SHIFTOUT -> XB, BUFGMUX I0 -> O. ISE uses
  COUT -> YB when a carry chain ends in a LUT input (blinky: `CLB_X14Y17 COUT3 -> YB3`). The
  comment ISE writes after it in XDL is not needed (blinky written back without it: same bitstream).
- Carry chains: COUT -> CIN is an ordinary PIP (`COUT0 -> CIN2` inside a CLB, `COUT2 -> COUT_N1`
  joined to the CIN of the CLB above).
- Global clocks: BUFGMUX `O` -> `CLKT_GCLK_PINWIRE0 -> CLKT_GCLK_MAIN0` -> CLKC -> GCLKVM -> GCLKVC ->
  GCLKH -> the CLBs' `GCLK0..7 -> CLK0..3`; every wire of that network has GCLK in its name. The
  slices' CLK pins can also be reached from general routing (and the GCLK network leaks into general
  routing), so a clock net must be kept on it explicitly.
- Constants: ISE ties VCC to a VCC site (in every CLB, I/O and block-RAM interconnect tile; pin
  VCCOUT; `VCC_PINWIRE`, `IOIS_VCC_WIRE`, `BRAM_VCC_WIRE`…: the one of the pin's own tile; a block
  RAM's or multiplier's pin is two switches from the VCC site of the interconnect tile its wire
  comes from, `BRAM_VCC_WIRE -> BRAM_DIB_B16`, `BRAM_DIB_B16_INT1 -> MULT18X18SIO_B4`) and GND to
  the Y output of an unused slice, naming the source
  `XDL_DUMMY_<tile>_<site>` (e.g. `outpin "XDL_DUMMY_CLB_X9Y1_SLICE_X17Y1" Y`); `xdl -xdl2ncd`
  accepts these (ISE's lab11 written back by Silinx gives ISE's bitstream, 0 frame bits differ).

## The router

PathFinder: each net is a tree over the nodes; each sink (nearest first) is found by A* from the
whole tree (cost per node `(1 + history) x (1 + present factor x other nets on it)`, estimate
0.3 per tile of distance to the sink). Nets may share nodes at first; after each pass the shared
nodes cost more (present factor x1.6 per pass, history +0.5 per extra net), and only the nets on
shared nodes are rerouted, until no node is shared. Clock nets (driven by a BUFGMUX) search only
GCLK nodes, falling back to general routing for a sink the global network cannot reach. Pins belong
to their net (no other net routes through them), and so does a pin's only entry wire (a slice's BX / BY
wire, which also feeds the CLB's LUT inputs, #82). Route-throughs only out of the net's own source
site onto a free pin. VCC / GND nets without a source get ISE-style dummy sources.

```
node research/s3e-route/route.mjs in.xdl out.xdl     # strip the PIPs, route, write, check
node research/s3e-route/check.mjs design.xdl         # check a routed design against the graph
```

## Validation with ISE

`ise-check.sh` (inside the container): `xdl -xdl2ncd`, then `drc -z` (ISE's design rule check),
`bitgen` (which runs the DRC again) and, with the PCF of ISE's map, `trce`. Controls show the
checks are meaningful: lab11 with all PIPs removed -> DRC: 372 errors ("completely unrouted"), and
`xdl2ncd` already warns; lab11 with one extra hanging PIP -> DRC: 1 error, "has an antenna. Routing
is incomplete", no bitstream.

First, the graph against ISE's own routing (`check.mjs`): every PIP exists, every sink is reached,
no antenna, no node shared, for lab11 (410 nets, 4072 PIPs), blinky (241 nets, 1651 PIPs) and the
switch -> LED design (5 PIPs).

Then ISE's placement with the PIPs removed and the nets routed by Silinx:

| Design | Nets routed | Passes | Time | PIPs (ISE) | xdl2ncd | DRC | bitgen | Timing (ISE's routing) |
|---|---|---|---|---|---|---|---|---|
| switch -> LED (`research/s3e-bitstream/top.v`) | 1 | 1 | 41 ms | 5 (5) | ok | 0 errors, 0 warnings | ok | (no constraint) |
| blinky (examples/blinky, XST) | 226 | 3 | 0.2 s | 1592 (1651) | ok | 0 errors, 0 warnings | ok | 6.746 ns, met (6.701 ns) |
| lab11 (XST) | 377 | 4 | 0.9 s | 3892 (4072) | ok | 0 errors, 0 warnings | ok | no constraint; clk -> clk 11.70 ns (10.91 ns) |

The placer's first outputs (open synthesis, placed by Silinx, `/tmp/claude-501/place/run`, not
routed by anyone before), routed by Silinx:

| Design | Nets routed | Passes | Time | PIPs | xdl2ncd | DRC | bitgen |
|---|---|---|---|---|---|---|---|
| blinky (placer's, 2026-10-10 18:38) | 264 | 4 | 0.3 s | 1607 | ok | 0 errors, 0 warnings | ok |
| lab11 (placer's, 2026-10-10 18:38) | 760 | 4 | 2.8 s | 7697 | ok | 0 errors, 0 warnings | ok |

Both have constant nets without a source (the placer's `GLOBAL_LOGIC0` / `GLOBAL_LOGIC1`), tied by
the router to ISE-style dummy sources. The first attempt failed in `xdl -xdl2ncd` ("undefined net
instance 'XDL_DUMMY_…'"): ISE also declares each dummy source as an instance
(`cfg "_NO_USER_LOGIC:: _GND_SOURCE::Y "`, or `_VCC_SOURCE::VCCOUT` on a VCC site), which the
router now writes too.

Writer check: ISE's lab11 and blinky, parsed and written back by `writeXdl()` without any change,
give ISE's bitstream (0 frame bits differ, `cmpbit.mjs`), so the writer loses nothing ISE needs.

## On the board

2026-10-10: blinky and lab11 synthesized by Silinx + Yosys, packed, placed and routed by Silinx
(`core/fpga/`), with ISE only converting the XDL (`xdl -xdl2ncd`), checking it (`drc`: 0 errors,
0 warnings) and writing the bitstream (`bitgen -g StartUpClk:JtagClk`), both work on a Basys2
(XC3S250E-CP132): the first bitstreams in which no ISE tool chose a cell, a site or a wire.

2026-10-11: **fully open bitstreams on the board.** blinky and lab11 synthesized (Silinx + Yosys
in WebAssembly), packed, placed, routed (timing-driven, on PIPs of known bits) and written as .bit
by Silinx, with no Xilinx tool at any step (`open-flow.mjs`): `blinky-open-timing.bit` (11.5 ns by
ISE's trce), `lab11-open-timing.bit` (17.2 ns) and `lab11-open-timing-s3.bit` (16.9 ns, placer
seed 3) all work on a Basys2 (XC3S250E-CP132).

## Fully open bitstreams (2026-10-10)

**Result: blinky and lab11 go from their VHDL / Verilog sources to a `.bit` file with no Xilinx
tool in the flow** — Silinx's front end + Yosys, Silinx's packer, placer, router and bitgen — and
the bitstream is byte-identical to the one ISE's bitgen writes from the same routed XDL.

```
node research/s3e-route/open-flow.mjs examples/blinky out/blinky     # -> out/blinky/top.bit
node research/s3e-route/open-flow.mjs ~/Silinx-projects/lab11 out/lab11
```

What it took, besides chaining the steps:

- **Router restricted to known switches** (`routeDesign(design, device, knownRouting(db))`,
  `packages/silinx-fpga/src/fpga/bitgen.js`): a PIP may be used only if its feature `from->to` (wires in the direction
  of the signal, so a bidirectional `BX0 =- BY1` is checked the way it is used) is in the database
  for the tile's type (named as bitgen names it: `CLB` -> `CENTER_SMALL` / `CENTER_SMALL_BRK`…) and
  the layout knows the tile. A feature with no bits counts only for dedicated wires (carry chain,
  pin wires, clock spines, terminations), not for a switch into a general routing wire: the
  database has 253 such empty entries in the I/O and corner tiles and at least one is wrong (below).
  GND sources only on slices whose `USED` and `_GND_SOURCE:Y` are known (SLICEL positions 2 / 3);
  VCC sources (VCC sites, no settings) only through allowed PIPs. A net that cannot be routed on
  known PIPs fails, with its unreached sinks listed (`unreached`), never through an unknown switch.
- **Carry chains:** the four carry PIPs of a CLB as the device names them are `COUT0->CIN2`,
  `COUT1->CIN3`, `COUT2->COUT_N1`, `COUT3->COUT_N3`; none sets bits (the database had the first
  three; `COUT2->COUT_N1` added, `measured/fix-9carry.json`: the Silinx-routed blinky's tiles whose
  only unknown feature it was had no bit different from ISE's bitgen).
- **Carry out read by logic** (blinky's comparators): the packer's `carryOut: 'xor'` brings it out
  through one more chain stage, XOR with a LUT giving 0, and the X / Y output (FXOR / GXOR), instead
  of the XB / YB pins (`XBUSED`, `XB->OMUX`, `COUT->YB` are not measured). Simulated against the
  netlist in the unit tests; the default stays `'pin'`, as ISE does.
- The placer reads its sites from the device cache (`deviceSites(device)`, same result as from the
  204 MB report), so the flow needs only the cache.

Checked with ISE as the oracle (`ise-open-check.sh`, one job at a time on an Intel Mac mini):

| Design | Placement | Nets | PIPs | Unknown features | DRC | bitgen vs Silinx (CRC on / off) | trce (no constraint) |
|---|---|---|---|---|---|---|---|
| blinky | seed 1 (default) | 265 | 1627 | 0 | 0 errors, 0 warnings | byte-identical / byte-identical | 12.12 ns |
| blinky | seeds 2, 3, 4 | 265 | | 0 | 0 / 0 | byte-identical / byte-identical | 13.30, 11.93, 12.22 ns |
| lab11 | seed 1 (default) | 777 | 7773 | 0 | 0 errors, 0 warnings | byte-identical / byte-identical | clk 22.85 ns |
| lab11 | seeds 3, 4 | 777 | | 0 | 0 / 0 | byte-identical / byte-identical | clk 24.02, 23.09 ns |
| lab11 | seed 2, effort 3, timing 4 | 777 | 7770 | 0 | 0 / 0 | byte-identical / byte-identical | clk 20.57 ns |

(blinky's own constraint is 20 ns.) The restriction costs little: lab11's default placement routed
on all PIPs takes 7764 PIPs and 23.86 ns (it is the one routed earlier and run on the board), on
known PIPs 7773 PIPs and 22.85 ns. Before the restriction, the same designs used 31 (blinky) / 36
(lab11) features the database does not know and differed from ISE's bitgen in 39 / 66 bits.

A first run of the slower lab11 placement (seed 2, effort 3, timing 4) still differed in 4 bits
with 0 unknown features: it used `W6END4->E2BEG4` and `LH6->E6BEG0` of a left I/O tile, which the
database lists with no bits, while ISE sets 17,25 17,26 for the first (the second: 18,59 and one bit
at frame offset 19). Hence the rule above on empty switches into general wires.

The open bitstreams for the board: `~/Silinx-projects/open-flow/blinky-open.bit`,
`lab11-open.bit` (default placement) and `lab11-open-fast.bit` (seed 2, effort 3, timing 4).

Still missing for every placement to route (for the measurement of the database):

- **Clock pins:** only 13 of the 32 `GCLKk -> CLKn` switches of a CLB are known (`GCLK4` reaches
  all four slices; missing: GCLK0->CLK2, GCLK1->CLK0/2/3, GCLK2->CLK0/1/3, GCLK3->CLK1/2/3,
  GCLK5->CLK0/2/3, GCLK6->CLK0/1/3, GCLK7->CLK1/2/3). A second clock on another line fails when a
  flip-flop of it lands in a slice its line cannot reach with known switches: lab11 with seed 2, and
  with seed 1 effort 3 timing 4 (`bit_ready -> …CLK`), fail this way.
- XB / YB -> OMUX (only `YB1->OMUX0` known), `XBUSED` / `YBUSED`, `COUTk->YBk` route-throughs (only
  `COUT1->YB1`): avoided by `carryOut: 'xor'`, needed for a carry chain read in the middle.
- The 253 empty switches into general wires of the I/O and corner tiles (BIOIS, LIOIS*, RIOIS*,
  TIOIS, LIBUFS*, RIBUFS*, TIBUFS, BIBUFS, LL / LR / UL / UR), refused by the router until measured.
- `VCC_PINWIRE->BX0` (BX1, BX3 known), `SLICE0:_GND_SOURCE:Y` (SLICEM GND sources), long lines and
  hexes through I/O, block RAM and DCM tiles that the earlier routes used.
- `measured/learn-7carry.json` lists carry PIPs the device does not have (`COUT0->CIN0`,
  `COUT1->CIN1`, `COUT0->COUT_N0`, `COUT1->COUT_N1`, `COUT2->COUT_N2`); harmless, never used.

## Timing (2026-10-11)

**Result: lab11 at 17.2 ns (58 MHz) by ISE's own timing analyzer, under the board's 20 ns, from
21.3-23.9 ns; blinky 11.5 ns from 12.1-13.3 ns** — still fully open (known PIPs only, bitstream
complete, byte-identical to ISE's bitgen, DRC clean). Pieces:

- `packages/silinx-fpga/src/fpga/timing.js`: a delay model of the XC3S250E -4 and a static timing analysis (STA).
- `packages/silinx-fpga/src/fpga/route.js`: timing-driven routing (`routeDesign(…, { timing: true })`), the default of
  `open-flow.mjs` (`--timing-route 0` turns it off); `clockReach()`.
- `packages/silinx-fpga/src/fpga/place.js`: the timing term in ns with the same model; `clockSites` keeps each clock's
  flip-flops on the slices its global line reaches through known switches.
- `timing-fit.mjs`: fits the wire model; `scripts/check-open-flow.mjs` now takes open-flow options
  per project and, with `SILINX_KEEP=1`, keeps ISE's `routed.twr` (`trce -a -v 3`) and
  `routed.dly` (`reportgen -delay`: the delay of every connection) next to each `routed.xdl`.

**Delay model: measured, not copied.** Only our own fitted numbers are in the code; no Xilinx file.

- *Wires.* Each node of the device graph gets a class from the names of its wires: OMUX, double,
  hex, long line, input multiplexer (`F1_B…`, `BX…`), clock, I/O, site pin. A routed connection's
  delay = base + Σ over its nodes (after the driver's pin) of (class delay + class branch load x the
  branches the net takes off the node) + a load term at the driver. Fitted (non-negative least
  squares) to ISE's `reportgen -delay` of the same routed designs: 10 486 connections of 7 Silinx
  routings of blinky and lab11 (with and without timing), **rms error 0.099 ns, 95% within 0.19 ns,
  worst 0.51 ns**. Fitted values (ns): OMUX 0.345, double 0.269, hex 0.350, long 0.445, input mux
  0.208 (+0.213 per extra branch), base -0.103, driver +0.049 per extra branch. Splitting doubles /
  hexes by the tap they are left at, the fanout and an Elmore-like subtree load did not improve the
  fit. A connection with no general wire (carry chain, F5 / FX -> FXIN) takes 0, as trce says.
- *Logic.* Every logic element of every path of the `trce -v 3` reports (16 reports of Silinx's
  routings), keyed by the path through the slice and its settings: LUT (Tilo 0.704 / 0.759 ns,
  SLICEL / SLICEM), F5 / F6..F8 multiplexers, carry chain (a LUT pin that is also the carry's data
  input `CY0F` / `CY0G`, BX / BY as data input or `CYINIT`), XOR outputs, flip-flop clock-to-out,
  setup through X / Y (+0.133) or from BX / BY (0.308), SR. SLICEM and SLICEL differ (the packer
  writes `SLICEL` everywhere: the site decides). After the fit all but two arcs match trce
  exactly; Topcyg is 0.888 or 1.131 for the same settings (kept as the data-input rule). A few arcs
  never seen on a reported path are marked *est.* in `SPEED_4`.

**STA against trce** (minimum period of the main clock, same routed design; `-`: Silinx lower):

| Designs | n | Error |
|---|---|---|
| lab11 (9 routings: wirelength and timing-driven, 4 placements) | 9 | -1.8% .. +1.9% |
| blinky (8 routings) | 8 | -4.0% .. +0.8% |
| lab11 second clock (`bit_ready`, 2.3-3.0 ns) | 9 | within 0.13 ns |
| all main clocks | 21 | mean \|error\| 1.4%, worst 4.0% (0.46 ns) |

STA of lab11: 15-50 ms.

**Block RAMs and multipliers (#457).** Their arcs were estimates until trce measured them (`timing-fit.mjs --arcs`
on the verbose reports, `trce -a -v 1000`, of nine designs routed by Silinx: hard_prim, feat_bram, feat_const_bram,
feat_mult, feat_const_mult, feat_constmult, stopwatch, and two of multipliers with input registers; the routed
designs and trce's periods of three of them are test fixtures, `packages/silinx-fpga/test/fixtures/fpga/trce/`). A block RAM's arcs are
the same at every width and write mode (clock to out Tbcko 2.812 ns; setups: address 0.377, data 0.227, EN 0.770,
WE 1.253, SSR 0.705). A multiplier's path through it depends on the product bit only: A / B -> P 3.657 ns for P0..P5,
then 4.086 .. 4.860, 4.873 from P17; from its input registers (AREG / BREG) to P the same plus 0.260 (P0..P5) or
0.089; from the product register 1.100; an unregistered input into the product register 3.980; into AREG 0.223, BREG
0.384, CE 0.735, RST 0.736. The wires next to them (the block-RAM interconnect tile's `BRAM_DIA_B…`, `BRAM_ADDRA_B…`,
`BRAM_MULTINA_B…` in, `BRAM_DOA…`, `BRAM_MOUT…` out) were counted as "other" wires (0.3 ns); against reportgen
-delay (1 961 connections of the same designs) the wires in cost 0.240 (rms error 0.167 ns) and those out nothing
(0.095 ns), their own classes now. The STA against trce on the nine designs:

| Design | trce (ns) | STA before (ns) | STA (ns) |
|---|---|---|---|
| hard_prim | 7.147 | 8.390 (+17.4 %) | 7.110 (-0.5 %) |
| feat_bram | 6.357 | 6.537 (+2.8 %) | 6.474 (+1.8 %) |
| feat_const_bram | 4.591 | 4.382 (-4.6 %) | 4.319 (-5.9 %) |
| feat_mult | 11.135 | 11.270 (+1.2 %) | 10.767 (-3.3 %) |
| feat_const_mult | 7.107 | 8.681 (+22.1 %) | 7.401 (+4.1 %) |
| feat_constmult | 11.426 | 12.335 (+8.0 %) | 11.909 (+4.2 %) |
| stopwatch | 12.719 | 12.867 (+1.2 %) | 12.602 (-0.9 %) |
| multipliers, AREG / BREG | 8.735 | 9.577 (+9.6 %) | 8.937 (+2.3 %) |
| multipliers, AREG / BREG, every P bit into a flip-flop | 8.722 | 9.098 (+4.3 %) | 8.711 (-0.1 %) |

The logic arcs on the critical paths now match trce's exactly; what is left is the wire model's error on single
nets (0.02-0.27 ns, either way: feat_const_bram's critical net has 19 loads, 3.350 ns by Silinx, 3.622 by trce).

**Timing-driven routing.** VPR's criticality term in PathFinder: for a connection of criticality c,
a node costs c x its delay / 0.3 ns + (1 - c) x its congestion cost, and the A* search starts from
each tree node at c x its delay from the source, so a critical load gets a direct, fast path and the
others share wires. Criticality = (1 - slack / period)^k, k from 1 to 8 over the passes, at most
0.99; first from the distances (placement estimate), then from the STA of the routed delays after
every pass. The most critical loads of a net are routed first. Once legal, 2 more passes reroute
the nets of connections with criticality > 0.5; the best legal routing (by the STA) is returned.
Without it, lab11's 220-262-fanout nets were routed as long chains of doubles (5.1-5.5 ns to
the critical load).

**Placement.** The placer's timing term used made-up units (a LUT 1, a connection 0.6 + 0.12 / CLB);
it now uses the model in ns (the slice arcs, a distance estimate: 0.55 + 0.1 ns / tile up to 12
tiles, then 0.03, fitted to the delays above; carry / multiplexer links 0) and analyses flip-flop
to flip-flop paths, as trce's period. Gains are small next to the router's (lab11 by the STA: 17.5
ns with timing 0, 17.1-17.5 with the default). `clockSites` fixes a failure: with the timing
placer, seeds 1 and 2 of lab11 put a `bit_ready` flip-flop on a slice its clock line reaches only
through an unknown `GCLKk -> CLKn` switch (no bitstream); now the placer keeps each clock's flip-flops
on the slices `clockReach(device, bufgmux, allowPip)` finds.

Checked with ISE as the oracle (`SILINX_ISE_HOST=… node scripts/check-open-flow.mjs …`, Intel Mac
mini, one job at a time; every design: DRC 0 errors 0 warnings, `.bit` byte-identical to ISE's
bitgen with CRC on and off):

| Design | Placement | Routing | trce (ns) | Silinx STA (ns) | Route time |
|---|---|---|---|---|---|
| lab11 | old placer, seed 1 | wirelength (before) | 21.273 | 21.499 | 2.6 s |
| lab11 | old placer, seed 1 | timing | 17.491 | 17.647 | 3.3 s |
| lab11 | old placer, seed 2, effort 3, timing 4 | wirelength (before) | 19.649 | 19.556 | |
| lab11 | old placer, seed 2, effort 3, timing 4 | timing | 17.620 | 17.687 | |
| lab11 | new placer, seed 1 (default) | wirelength | 20.313 | 20.533 | |
| **lab11** | **new placer, seed 1 (default)** | **timing (default)** | **17.188** | 17.493 | 3.2-4.3 s |
| lab11 | new placer, seed 3 | timing | 16.889 | 16.869 | |
| blinky | old placer, seed 1 | wirelength (before) | 12.667 | 12.497 | 0.4 s |
| blinky | old placer, seed 1 | timing | 12.024 | 11.562 | 0.45 s |
| **blinky** | **new placer, seed 1 (default)** | **timing (default)** | **11.494** | 11.030 | 0.35 s |
| blinky | new placer, seed 2 | timing | 11.404 | 11.165 | |

For comparison, ISE's own par of the same Yosys netlist of lab11 reached 16.67 ns
(`research/s3e-place/README.md`). The router takes about 25% longer on lab11 (9-12 passes instead
of 4; the A* estimate of the delay part is 0.1 ns / tile, a little above the fastest wires', to
keep the search short).

On the board (to test): `~/Silinx-projects/open-flow/lab11-open-timing.bit` (default flow, 17.19
ns), `lab11-open-timing-s3.bit` (seed 3, 16.89 ns), `blinky-open-timing.bit` (11.49 ns).

Not done / next: hold-time analysis and clock skew (trce's skew was 0-0.02 ns here), pad-to-pad
and OFFSET paths (`instArcs` has rough pad delays only), more designs for the fit (the carry XOR /
BY arcs marked *est.*). (The branch loads in the router's cost: done, below.)

## Closing the routing gap (2026-10-11, 15.10.2)

**Result: lab11 11.60 ns by ISE's trce (was 13.73; ISE's own flow, XST + map + par: 10.9 ns, so
6% slower instead of 26%), blinky 7.37 ns (was 7.96; ISE: 6.7 ns, 10% slower)**, the netlists of
the open synthesis of 15.10.2 unchanged, still fully open (known PIPs, DRC 0 errors 0 warnings,
`.bit` byte-identical to ISE's bitgen with CRC on and off), and faster to place and route than
before. On lab11's critical path trce now counts 4.26 ns of routing (was ~6 ns; XST's design with
ISE's place and route: about 4) and 8.2 ns of logic.

What was found (`crit`-style analysis: each connection of the critical path against the fastest
route the device has between the same pins, no congestion, known PIPs only): with the old placer
and router, lab11's critical path had 5.96 ns of routing where 5.0 ns was possible for that
placement; the router was close to the best it could do on given pins, the rest was placement
(critical cells 3-7 tiles apart) and **pins**: the packer fixes which LUT input each net uses, and
the fast direct connections (a slice output to some inputs of its own and the neighbouring CLBs)
reach only some of them. With any input of the LUT allowed, the fastest routing of the same path
was 1-1.2 ns shorter.

The changes, each measured on lab11 and blinky (Silinx STA, mean over placer seeds: one seed
moves the result by ±0.3-0.5 ns, so single runs say little; ISE's trce on seed 1, the default):

| Change | lab11 STA (seeds) | blinky STA (seeds) | ISE trce lab11 / blinky |
|---|---|---|---|
| before (15.10.2 synthesis, 15.10.1 place and route) | 13.97 (4) | 8.21 (8) | 13.73 / 7.96 |
| placer: VPR's timing cost, linear distance model | 13.12 (6) | | |
| placer: the same with the device's delay table | 12.63 (6), 12.83 (12) | | |
| router: LUT input swapping | 12.22 (12) | 7.48 (8) | 12.48 / 7.41 |
| router: branch loads in the cost | 12.10 (8) | 7.42 (8) | |
| placer: timing weight 1.5 (lambda 0.43, was 0.33) | **12.01 (16)** | **7.44 (8)** | **11.60 / 7.37** |

Tried and not kept (no gain beyond the seed noise, or worse): a fanout term in the placer's
estimate (what routing adds on average, by fanout, fitted to the routed delays), a penalty in the
placer for critical slices on SLICEM sites (their LUTs and F5 multiplexers are 0.05-0.16 ns
slower), smoothing the criticalities between router passes (mean or max with the last pass), more
timing passes (2 -> 5-8), a lower A* delay estimate (0.06 ns / tile), more placer effort (2.5),
timing weights 0.1-0.3 and 2-3. The branch-load penalty with weights above 1 is worse.

- **Delay table** (`timing.js delayTable(device, { allowPip })`): the fastest route by the model
  (Dijkstra over the device graph, known PIPs only) from the X / Y / XQ / YQ outputs of a CLB to
  the LUT and BX / BY inputs of every slice, the mean over those inputs of the fastest arrival at
  each offset (columns, rows), averaged over five source CLBs (the centre and four around it);
  offsets with no CLB (clock rows, block-RAM columns) from their neighbours. 0.25-0.5 s, once per
  device and process (cached). Same CLB 0.16 ns (direct connections), next CLB 0.37-0.55, 7 rows
  0.72, 15 columns 1.0: hexes and long lines make it far from linear.
  Since #104 two tables (`DELAY_KIND`): from X / Y, and from XQ / YQ. The fastest of the four outputs
  hid that a flip-flop's output goes through an OMUX to every input: X / Y -> a LUT of the same CLB
  0.105 ns (the fast connects), XQ / YQ 0.450 (OMUX2, 6, 9 or 13, the only four that turn back into
  the CLB); the next CLB 0.374 (X / Y straight onto a double) against 0.450-0.554; two rows 0.643
  against 0.719-0.771. The old 0.159 for the same CLB was X / Y's 0.105 to a LUT and 0.374 to BX / BY.
  Telling the loads apart too (a LUT input or BX / BY: four tables) made the placer pack LUT chains
  tighter and lost on some designs (traffic on the XC3S100E +4 % over 8 seeds): the loads stay averaged.
- **Timing-driven placement** (`place.js`): VPR's cost, `(1 - lambda) x wirelength / its value +
  lambda x sum(criticality^exp x delay) / its value`, both normalised at every temperature, the
  delay of a connection from the table (or the old linear model without one), the exponent from 1
  to 8 as the move window shrinks; lambda = timing / (2 + timing), timing 1.5 by default. It
  replaces the net weights `1 + timing x criticality^4` on the wirelength. The placer's STA takes
  the SLICEL or SLICEM arcs by the site. (A change in the cost and annealing only; the site rules
  of the placer are untouched.)
- **LUT input swapping** (`route.js`, `swapLutPins`, default on): the inputs of a LUT whose F / G
  is a `#LUT:` equation are interchangeable; a net may end on any of its LUT's inputs that no
  other net takes (the search ends on any of them). Not moved: the carry's data input (`CY0F` /
  `CY0G` = F1 / F2…), the pins of nets the router does not route (no source, made-up power
  nets), RAM / ROM / shift-register LUTs. The equation is rewritten for the permutation (`Ak` is the
  input on pin k; unused variables onto the pins left) and the inpins follow; the routed XDL is
  what bitgen and ISE read, so nothing else changes. On lab11 277 of 330 LUTs end up with their
  inputs swapped, blinky 125 of 171; every LUT computes the same function of the same nets (checked
  on both, and in `test/open-flow.test.js` on blinky).
- **Branch loads** (`route.js`, `branchLoad`, default 1): the model's delay of a node grows with
  the branches the net takes off it (0.049 ns per extra branch at the driver's pin, 0.027 at an
  OMUX, 0.213 at an input multiplexer…). A new branch now starts at the delay to its tree node
  including the loads already there and the one it adds, plus (weighted by `branchLoad`) the load
  it puts on the routed connections below that node x their criticalities. A 17-load net routed
  on the real device branches 3 times at its driver instead of 6 and is faster (test).
- `open-flow.mjs --tries N`: N placements (seeds seed .. seed + N - 1), each routed, the fastest
  by the STA kept: lab11 with 3 tries 11.60 ns (STA) instead of 11.69, at three times the time.

Checked with ISE (`SILINX_ISE_HOST=… node scripts/check-open-flow.mjs examples/blinky
~/Silinx-projects/lab11`, default options):

| Design | xdl2ncd | DRC | .bit vs ISE's bitgen | trce (ns) | Silinx STA (ns) | ISE (XST + par) |
|---|---|---|---|---|---|---|
| lab11 (clk) | 0 warnings | 0 errors, 0 warnings | byte-identical (CRC on / off) | **11.598** | 11.691 | 10.9 |
| lab11 (bit_ready) | | | | 2.353 | 2.279 | |
| blinky | 0 warnings | 0 errors, 0 warnings | byte-identical (CRC on / off) | **7.374** | 7.317 | 6.7 |

Times (Apple Silicon, Node 25, default options; before -> now): lab11 placement 1.95 -> 1.4-1.6 s
(+0.3-0.5 s for the delay table), routing 1.05 -> 0.7-0.8 s; blinky placement 0.57 -> 0.27 s,
routing 0.37 -> 0.19 s (lab11: 3209 PIPs instead of 3470, 11 passes instead of 10).

What is left of the gap: lab11's critical path is now state register -> decoding (F5 / F6) ->
three LUTs -> ALU carry (2 stages) -> LUT -> F5 -> register, 9 levels, 8.2 ns of logic and 4.26 ns
of routing; the routing is at ISE's level. The largest single connection is the state register's
(fanout 54): 1.03 ns to a slice next to it, of which about 0.5 ns is the load of its branches. XST
replicates such flip-flops; the open flow does since 15.10.3 (after a first place and route, below:
"The design corpus against ISE"). blinky: 5.3 ns of logic (a 3-stage comparator
chain, two LUTs) and 2.0 ns of routing on its critical path, where the fastest routes of that
placement would give 1.4 ns; its loads are 9 LUT inputs of one CLB driven by one output, which
must branch at the driver. Both run on the board's 50 MHz with a wide margin.

The bitstreams: `~/Silinx-projects/open-flow/lab11-open-v3.bit` (11.60 ns) and
`blinky-open-v3.bit` (7.37 ns), the files checked above (to test on the board).

## The design corpus against ISE (15.10.3)

docs/QUALITY.md (15.10.1) had the Silinx toolchain's critical paths 15 % longer than ISE's
(geometric mean, 20 designs, both by trce). What was found on the designs furthest from ISE, and
changed (each measured by Silinx's analysis of the routed design, mean of placer seeds 1-3, on 32
designs: the corpus on the XC3S1200E, the examples on the XC3S250E):

1. **The timing analysis missed paths** (`timing.js`): BX as the F stage's carry data input
   (`CY0F = BX`, how the packer builds comparators) into the G XOR had no arc (trce's Tbxy,
   1.574 ns), and every input of a LUT counted as a path through it, also the carry's data input
   wired to a LUT pin the LUT does not read; that made false loops, and the analysis drops every
   pin after a loop. verilog-uart: 6.65 ns by Silinx, 11.89 by trce on the same routed design; now
   12.12. The placer and router now see those paths: verilog-uart 10.17 ns by trce (ISE's own flow
   9.24). Also from trce: the carry data input on F1 / F2 to COUT 1.162 ns (was 0.953), BY into
   the Y flip-flop 0.361 / 0.382 ns. On 14 designs checked the analysis is then within 0-5 % of
   trce (mostly above it). Geometric mean of the 32: -0.7 % (the noise of a placement is ±4 %).
2. **The router gave up** on a sink after 400 000 expanded nodes: on the XC3S1200E a slice's BY
   input took more (EPFL priority and adder "cannot be routed on known switches", #33). Such a sink
   is now searched again up to 8 000 000 nodes; both route.
3. **Logic depth** (the synthesis, research/synth-quality/README.md "Logic depth"): a second LUT
   mapping with ABC's SOP balancing, kept when faster. EPFL max 71 -> 37 ns, priority 43 -> 17,
   geometric mean -6.0 %.
4. **Register replication** (`packages/silinx-fpga/src/fpga/replicate.js`, #4): after placing and routing, the
   flip-flops with at least 8 loads whose output has a connection of criticality >= 0.98 and
   >= 1.0 ns (at most 8 of them) are copied, one copy per group of up to 16 loads (k-means on the
   tiles the loads were placed on; the group nearest the flip-flop keeps it); the netlist is packed,
   placed (same seed) and routed again, and the faster kept (so never slower by the analysis; one
   more place and route when there is something to copy; designs of up to 3000 slices). The copies
   have the flip-flop's D, clock, enable, set / reset and INIT. epfl-bar (a register of 256 loads)
   -4 %, vtr-mkPktMerge -4.5 %, T80 -1.2 %, nothing for the others (not kept, or nothing to copy).
   Tried and not kept: copies of every flip-flop of criticality >= 0.95 (diffeq2 +14 %, its
   multiplier inputs), 8 loads per copy (more copies, more congestion).
   Since #87 and #522 the replicated design is placed from the first placement (place.js
   `start`, replicate.js `warmStart`: each slice on the slice of its cells, a copy on the free slice
   nearest the centre of its loads, then the placer's greedy pass alone, in a window of 3 slices):
   placed again from scratch, the noise of a new placement (±0.5 ns on the T80) hid what the copies
   gained. The pass's placement takes 0.4 s instead of 8 s on the T80 (16.4 s -> 7.6 s for the whole
   pass), 0.1 s instead of 3 s on epfl-bar (kept as before: 10.98 -> 10.73 ns on the corpus's
   device). LUTs are copied too: a reset or clock enable computed by logic on the SR / CE pins of
   many flip-flops. vtr-ch-intrinsics (seed 1, XC3S1200E): its reset LUT (32 FDRE.R loads) copied,
   trce 6.43 -> 5.99 ns; kept on 1 of the 3 seeds of 8 on which it fires (on the others slower by the
   analysis: the copy also loads its own input nets, as critical, so the gain on the reset net is
   lost before the copy). Not done: the logic before that LUT is a chain of three LUT2s of fanout ~33
   each from 3-4 flip-flops, which ISE's map packs shallower; and sync resets as logic in the D
   LUTs (Yosys `dffunmap -srst-only` before map_ffs) was -2 % on ch-intrinsics, +4 % on usb-phy
   (median of 6 seeds), not kept.
   The flows place and route through one helper, `packages/silinx-fpga/src/fpga/place-route.js` (`placeRouteBest`:
   the placer with the delay table, tries, routing, STA, replication): the app's
   (`server/open-flow-run.js`), `open-flow.mjs` and the design corpus's
   (`test/designs-corpus/run.mjs`, which placed without the delay table and did not replicate
   before, #79, #88).

Silinx STA, base (15.10.2) -> all four, mean of 3 seeds: -7.0 % over the 31 designs that built
before (the examples: blinky +0.6 %, pong +4 %, stopwatch -4 %: placement noise).

Checked with ISE (`scripts/check-open-flow.mjs`, seed 1, default options): DRC 0 errors and 0
warnings, xdl2ncd 0 warnings, `.bit` byte-identical to ISE's bitgen (CRC on and off) for every one:

| design | trce 15.10.1 (QUALITY.md) | trce now | ISE's flow |
|---|---|---|---|
| epfl-max | 69.86 | **37.10** | 25.68 |
| epfl-priority | not routed | **16.79** | 20.83 |
| epfl-adder | not routed | 81.32 (after 1-2) | 12.25 |
| epfl-bar (replicated) | 11.13 | **10.32** | 9.08 |
| t80 (replicated) | 22.97 | **22.39** | 18.13 |
| vtr-stereovision3 | 8.60 | **7.64** | 4.92 |
| verilog-uart | 11.89 | **10.17** | 9.24 |
| verilog-i2c-master | 11.22 | **10.91** | 9.88 |
| examples/blinky | 7.37 | 7.24 | 6.7 |
| examples/pong | 12.60 | 12.71 | |
| examples/stopwatch | 13.21 | 12.17 | |
| fan64 (test design, replicated) | | 2.88 (3.72 by STA without) | |

Left: EPFL adder (XST's netlist is 6.6 times faster: a 128-bit adder of gates, which neither
mapping restructures into a fast adder), max (1.4 times ISE's), stereovision3 (a state register of
31 loads into four levels of LUTs, F5 and F6, where ISE has fewer); vtr-ch-intrinsics' gated clocks
(the clock inverters of `-ise` extractinv on LUTs, 21 DRC warnings "Gated clock": its period is
not comparable).

## The post-place & route simulation model's timing (SDF, #122, 2026-10-19)

The Silinx toolchain's *Post-Place & Route Simulation Model* (`core/sim-model.js` postParModels) writes the routed
design as SIMPRIM primitives and its timing as an SDF file (`core/sdf.js`): every connection's delay (PORT, the
static timing's, on the elements that read the site pin) and every element's paths (IOPATH; each path through a
slice of `packages/silinx-fpga/src/fpga/timing.js` split over the elements it goes through, so that their sum is the timing's) and setup
checks (SETUPHOLD). Silinx's simulator applies an SDF by building it into the netlist (`annotateSdf`: transport wire
delays, inertial gate delays, clock to out, setup checks from 100 ns on, as glbl's GSR).

Against ISE, on blinky routed by Silinx (seed 1): `xdl -xdl2ncd routed.xdl`, then `netgen -sim -ofmt vhdl` writes ISE's
model and SDF of the same placement and routing; `node research/s3e-route/sdf-compare.mjs <folder>`:

| | Silinx | ISE |
|---|---|---|
| connections compared (site input pins: LUTs, BX / BY, CE, SR, output pads) | 307 | 307 |
| their mean delay | 679 ps | 663 ps |
| Silinx - ISE | mean +16 ps, rms 69 ps, 84 % within 100 ps, 99 % within 200 ps, max 254 ps | |
| minimum period by the SDF (longest path from a clock's edge to a setup check, over the elements) | 7.451 ns (its static timing: 7.451) | 7.363 ns (trce: 7.365) |

The element-level paths differ (ISE's LUT IOPATH is 559 ps and its slice's output multiplexers carry the rest of the
LUT-to-pin delay; Silinx puts the whole site path in the LUT), but the paths' sums agree: the longest path over
ISE's own SDF is trce's period within 2 ps, which checks the comparison's method, and Silinx's SDF is within 1.2 %
of ISE's on the same routing. The tests (`test/sim-model-par.test.js`) check that the longest path over Silinx's SDF
is its static timing's minimum period within 10 ps, on every example.

## A carry chain's result read by logic (#591, 2026-10-19)

blinky's critical path ended on its comparator's result (a 10-stage chain against a constant), the net
that drives 9 LUT inputs. Two things made it slow, neither of them the routing of its 9 loads:

- **The chain's last six stages passed the carry on**: their selects are the constant 1 (the constant's
  bits), O = CI. The packer now leaves such a stage out (its loads read its carry in), unless a sum reads
  that carry in. blinky's comparator is 4 stages instead of 10 (`stats.carryPass`: 6).
- **The result left through one more stage, XOR with a LUT giving 0 (`carryOut: 'xor'`)**, because the
  XB / YB outputs were not measured when the open flow began (above, "Fully open bitstreams"). They are
  now: every `XBk / YBk -> OMUXj` of every CLB of the four devices is in the bit database, and XBUSED /
  YBUSED set no bits. A stage's XOR on the G side costs CIN -> Y 0.869-0.883 ns, the carry multiplexer's
  own output CIN -> XB 0.13 (the model's Tbyp: trce's value of this arc is still to be read). The open
  flows now pack with `carryOut: 'pin'`, as ISE's map does.

Silinx STA (the open flow, default options), main -> this change, seeds 1 / 2:

| design | XC3S100E | XC3S250E | XC3S500E | XC3S1200E | slices |
|---|---|---|---|---|---|
| blinky | 7.55 / 7.35 -> 6.74 / 6.43 | 7.43 / 7.24 -> 6.43 / 6.54 | 7.61 / 7.54 -> 6.73 / 6.48 | 7.47 / 7.51 -> 6.68 / 7.02 | 79 -> 76 |
| vga | 9.93 / 9.66 -> 9.99 / 9.51 | 10.09 / 9.56 -> 9.05 / 9.28 | 9.52 / 10.04 -> 9.41 / 9.55 | 9.81 / 9.84 -> 9.62 / 9.22 | 154 -> 144 |
| pong | 12.47 / 12.28 -> 12.08 / 11.64 | 12.26 / 12.95 -> 12.52 / 12.48 | 13.02 / 11.92 -> 12.19 / 12.22 | 12.12 / 12.29 -> 12.11 / 12.13 | 245 |
| stopwatch | 12.70 / 12.65 -> 13.11 / 13.17 | 13.01 / 12.77 -> 13.16 / 12.96 | 12.54 / 12.64 -> 12.79 / 12.36 | 12.71 / 12.46 -> 12.82 / 12.92 | 194 |

gates, traffic and clock: the same (no chain read by logic). blinky over seeds 1-4 on the XC3S250E: 7.24-7.43
-> 6.43-6.88 ns (ISE's own flow: 6.7). stopwatch's critical path is block RAM -> LUT -> multiplier ->
flip-flop, no carry: its +1.8 % is the placement's noise (the same slices, packed in another order).

To check with ISE (the Mac mini): `scripts/check-open-flow.mjs` on the examples (DRC, the `.bit`
byte-identical with XBUSED / YBUSED and the XB / YB switches, trce's CIN -> XB).

## The pads' paths, the hold check and OFFSET (#26, 2026-10-19)

The static timing covered the period only (flip-flop to flip-flop on one clock). `timingGraph().pads()` adds, as
trce's data sheet report has them: **pad to setup** (an input pad to each clock's flip-flops: the data's arrival plus
the setup minus the clock's arrival at that flip-flop, what `OFFSET = IN … BEFORE` bounds), **clock to pad** (the
clock's pad through a flip-flop to an output pad, `OFFSET = OUT … AFTER`), **pad to pad** (through logic only) and a
**hold check** (the shortest flip-flop to flip-flop path of each clock and edge). The clock's arrival at each clock
pin (`clockArrivals`): the input pad's delay, the routed nets to the global buffer and from it, the buffer's delay.
The UCF's OFFSET constraints (on all pads or a NET) are checked in the flows (timing.txt, warnings, the report).

**Fitted to trce** (#26, the second part): its data sheet of lab11 placed and routed twice, by Silinx and by ISE.
The routed XDL and trce's reports were kept from the 10 October runs: 20 setup / hold, 34 clock-to-pad and 14
pad-to-pad figures.

- **The global clock reaches every flip-flop at once.** trce gives a clock path skew of 0.000 ns (-0.001 at most)
  between flip-flops on the global lines. The model's routed clock nets spread 0.4 ns over their loads (the GCLK
  class was never fitted), so `clockArrivals` gives every load of a global buffer `Tgclk` = 3.045 ns after the pad,
  and `minScale` x that at the earliest.
- **A global clock's load reached through general routing is not at once** (#2224): trce's clock delay at such a
  flip-flop is ISE's delay of that connection of the clock net (`reportgen -delay`: 0.07-0.12 ns to a load on the
  global lines, 0.86-2.57 ns off them), so a path between the two kinds has that skew. `clockArrivals` gives such a load
  `model.clock.detour` later: a + b x the model's delay of the general wires from where its path leaves the global
  lines (an OMUX, double, hex or long line: a block RAM's `BRAM_CLK` and an I/O tile's `IOIS_CLK` are the global lines'
  own way into the pin), fitted with `clock-detour.mjs` on 129 such loads of nine routings of blinky and stopwatch
  (Silinx's with 3 or 12 pins moved off the global lines by `--reroute`, nextpnr-spartan v0.6.0's): -0.708 + 1.188 x,
  rms error 0.100 ns, 0.220 at most. The periods then follow trce's (blinky with 12 pins moved: +1.10 ns in trce,
  +1.08 in the analysis; nextpnr v0.6.0's blinky 7.918 ns against trce's 8.015, 7.647 before). The hold check of two
  flip-flops counts the skew too (fitted to trce's hold paths in #2226, below).
- **trce's minimum delays** are 0.751 (`minScale`) of the model's: the slope of the inputs' hold against the model's
  shortest data paths.
- **A slice's ways through the carry chain's XORs and onto XB** (#2286) are trce's own maximum delays, read from the
  setup paths of the nine routings of #2224 (their "Maximum Data Path"): Topx 1.060 / 1.118, Togy (trce's Topgy) 1.231
  / 1.288, Topy 1.641 / 1.732, Topcyf 1.162, Topcyg 1.001 / 1.131 (from a LUT pin; the model had 0.953 / 0.888 there),
  Tdick 0.308 / 0.360, Tbxy 1.676 (SLICEM); XB (#591): Tcinxb 0.495 (the model had half of CIN -> COUT, 0.065), Topxb
  1.344, from the carry's data input 1.135 (a LUT pin) / 1.288 (BX), on the SLICEM, the SLICEL's taken the same. The
  periods of designs with carry chains follow trce's: blinky routed by Silinx 6.607 -> 7.037 ns (trce 7.075), by
  nextpnr 6.659 -> 7.089 (7.051); stopwatch's unchanged.
- **The hold check of two flip-flops** (#2226) is trce's hold path: the data's earliest arrival at the end's pin plus
  the end's hold margin, less the clock's skew from the launching flip-flop to it (#2224). trce's earliest delays are
  0.80 of the model's in every logic arc of its hold paths (clock-to-out, LUT, carry, a block RAM's clock to out:
  `minLogic`) and 0.784 on the wires (`minNet`: 4 410 connections, rms error 0.053 ns), not `minScale` (the inputs'
  hold, through a pad); the margin is trce's (-Th): through the slice, `minLogic` x the way to X / Y less 0.047 ns
  (`Tckdx`); BX 0.093 / 0.134, BY 0.135 / 0.152 (SLICEL / SLICEM: `Tckdi`, `Tckdy`), CE 0.069, SR 0.491 ns
  (`ff-hold.mjs` on the nine routings of #2224). Before, the inputs' hold time (-1.018 ns) stood for it, 0.57-0.79 ns
  over trce's slack; now the worst hold path of each routing is trce's pair of flip-flops, its slack within -0.09 /
  +0.13 ns (blinky with 12 clock pins off the global lines: -0.547 ns, NOT MET, against trce's -0.659). An end trce's
  reports did not show (an IOB's, a block RAM's, a multiplier's, a SLICEM memory's pins) has no margin (0).
- **Setup uses the clock's earliest arrival, clock-to-pad its latest.** With one arrival for both, pad to pad did not
  close: it predicted 5.27 ns over the model's paths, and trce measures 4.51.
- `Tiopi` = 1.253 ns and `Tioop` = 3.257 ns solve the three together: setup (Tiopi - minScale x Tgclk = -1.034),
  clock to pad (Tgclk + Tioop = 6.302) and pad to pad (Tiopi + Tioop = 4.51).
- `hold` = -1.018 ns is a flip-flop's data hold time as trce times an input's hold: hold = Tgclk - minScale x
  (Tiopi + path) + hold. The hold between flip-flops of one global clock is minScale x (clock-to-out + path) - hold,
  so at least 1.4 ns: it cannot fail, as trce finds (0 hold errors on every design checked).
- An asynchronous set / reset (`SYNC_ATTR::ASYNC`) is not a data input: trce leaves it out of the data sheet.

Model - trce (ns):

| | setup | hold | clock to pad | pad to pad |
|---|---|---|---|---|
| estimates (#600) | mean -1.88, rms 1.89 | (none) | mean +1.18 / +1.28 | rms 0.106 / 0.087 |
| lab11, Silinx's routing | rms 0.134, max 0.260 | rms 0.194, max 0.339 | rms 0.139, max 0.296 | rms 0.078, max 0.120 |
| lab11, ISE's routing | rms 0.139, max 0.264 | rms 0.146, max 0.339 | rms 0.181, max 0.575 | rms 0.098, max 0.192 |

That is the connection model's accuracy (rms 0.1 per connection). Still estimates: the IOB registers' delays (#96).
A clock from a DCM and paths between two clocks: #601, below.
blinky's pad-to-pad paths (sw<3> -> led<1> 9.81 ns on main's seed-1 placement) are what its test bench's invert check
waits for: half a clock period was too little for another placement (#591).

## A DCM's clocks and the paths between two clocks (#601, 2026-10-20)

The first part (#644) gave a DCM's clocks the PERIOD constraints trce derives from the pad's (`clockSources`,
`checkPeriods`) and timed the paths between two clocks of one pad against the time between their edges
(`clockRequirement`, `checkCross`). The second part measures the rest with trce: six DCM designs (feat_dcm,
feat_dcm_cross, feat_dcm_phase, feat_dcm_fx on the XC3S500E, feat_dcm_div2, feat_dcm2), with PERIOD 20 ns and
`OFFSET = IN 10 ns BEFORE` / `OUT 20 ns AFTER` on the pad's clock, built by ISE's own flow and placed and routed by
Silinx (`dcm-timing.mjs`). trce reads no UCF for an NCD from XDL ("no timing constraints found"), so Silinx's routing
gets a PCF in the form map writes (`silinxPcf`: a TIMEGRP of each clock's flip-flops, `TS_clk / 1.5 PHASE 2.5 ns`).

- **The derived constraints** are the ones `clockSources` computes: CLK2X `TS_clk / 2`, CLKDV `* 4`, CLKFX `/ 1.5`,
  CLKIN_DIVIDE_BY_2 `* 2`, CLK2X180 `PHASE 5 ns`, PHASE_SHIFT 32 `PHASE 2.5 ns` on every output (CLK90 7.5, CLK180
  12.5), a cascade relative to the first DCM's.
- **The requirements between two clocks** are `clockRequirement`'s to trce's rounding: CLK0 -> CLKFX 6.666 (6.667),
  CLKFX -> CLK2X 3.334 (3.333), CLKDV -> CLK0's falling edge 10, CLK0 -> CLKDV 20, CLK0 -> CLK90 5, CLK180 -> CLK0 10.
- **No skew, no uncertainty between a DCM's outputs:** trce's clock path skew is within ±0.02 ns, its clock
  uncertainty 0.000 ns (the Spartan-3E has no default system jitter, no discrete jitter or phase error terms).
- **A DCM's clock path** (trce's, from the pad): Tiopi, the CLKIN net, `Tdcmino` (negative: the deskew), the
  buffer and the global line: 0.79 ns at the latest and -0.27 at the earliest on the XC3S250E's B8 (a pad's own
  global clock: about 3.4), 0.96 / -0.04 on the XC3S500E. `Tdcmino` is -3.596 / -3.879 ns with DESKEW_ADJUST 7
  (SYSTEM_SYNCHRONOUS), -2.389 / -2.068 with 0 (SOURCE_SYNCHRONOUS: 0.176 / 0.26 ns a tap), -2.222 / -1.795 for a
  DCM whose CLKIN is on a global line (a cascade: 0.02 ns after the first DCM's clock).
- **The phase** is the clock's arrival: trce's data sheet gives setup and clock to pad from the pad's edge, the
  output's first edge o x the period later; a falling-edge flip-flop's from its edge, half the output's period later.

`clockArrivals` gives a DCM's clock its CLKIN's arrival plus `SPEED_4.clock.dcm` (pad / global / taps), then the
phase. As `Tgclk` (#26), the terms are fitted with the model's data paths, to trce's data sheet of Silinx's routing:
three of them, the latest (clock to pad), the earliest (setup) and the one of the inputs' hold (one for both clock to
pad and hold left 0.36 ns between their means). Model - trce (ns), Silinx's routing of the six designs:

| | setup | hold | clock to pad | between two clocks (data path) |
|---|---|---|---|---|
| raw trce clock path (0.79 / -0.27) | mean -0.94, rms 0.95 | mean +0.27, rms 0.29 | mean +0.63 | |
| fitted (27 values each) | rms 0.131, max 0.296 | rms 0.094, max 0.206 | rms 0.116, max 0.361 | rms 0.179, max 0.272 |

The data paths between two clocks are the model's (0.03-0.27 ns faster than trce's, as its periods). Silinx's
routing of feat_dcm_cross misses CLKFX -> CLK2X (3.333 ns): Silinx -0.361, trce -0.392 ns (ISE's own routing meets
it). trce's Component Switching Limit checks (feat_dcm_div2's CLKFX at 200 ns against Tdcmpfx's 100): #661, below.

## trce's Component Switching Limit checks on the DCMs (#661, 2026-10-20)

trce reports, under each PERIOD constraint, the "Component Switching Limit Checks": each pin's period against the
minimum and maximum the speed data allow, a timing error (score 100000 for the first) when one is out. ISE's own flow
on feat_dcm_div2 gave one: its CLKFX, 200 ns, over a "Max period limit: 100.000ns (10.000MHz) (Tdcmpfx)".
`switching-limits.mjs` builds DCM_SP variants (`switching-limits.json`: the settings, the outputs used, the pad's
PERIOD) by ISE's own flow on the Basys2-250 and brings back trce's reports; 23 designs. On the -4 (ns):

| pin (check) | DLL used (CLK_FEEDBACK 1X / 2X) | DFS only (CLK_FEEDBACK NONE) |
|---|---|---|
| CLKIN (Tdcmpc) | 4.166 - 200 | 3.002 - 5000 |
| CLK0, CLK90, CLK180, CLK270 (Tdcmpco) | 4.166 - 200 | |
| CLK2X, CLK2X180 (Tdcmpco) | 3.214 - 100 | |
| CLKDV (Tdcmpdv) | 6.249 - 3225.8 | |
| CLKFX, CLKFX180 (Tdcmpfx) | 3.067 - 200 | 3.067 - 200 |

- **CLKIN_DIVIDE_BY_2 halves every limit of the DCM**, its outputs' too: CLKIN 2.082 - 100 (DFS only: 1.501 - 2500),
  CLK0 2.083 - 100, CLK2X 1.607 - 50, CLKDV 3.125 - 1612.9, CLKFX 1.533 - 100. The CLKIN period checked is still the
  pad's (20 ns), the outputs' those of the halved input (CLK0 40 ns). So a CLKFX of 5 MHz, legal without it, is a timing error with it: feat_dcm_div2's
  x 3 / 15 (200 ns); its CLKFX is now x 2 / 5, 100 ns, slack 0 (met, as trce).
- The limits do not depend on CLKIN_PERIOD (20.9 or 20), DESKEW_ADJUST or DFS_FREQUENCY_MODE: trce checks the PERIOD
  constraint's periods. Without a PERIOD on the DCM's pad nothing is checked (feat_dcm_fx had no error for that).
  par warns too (Par:450, "component switching limit violations").
- CLKIN's pulse widths are checked too (period - pulse limit / duty): 3 ns at 20 or 40 ns, 1.5 ns at 4 or 8, 25 ns at
  250; never the binding check (CLKIN's period limits bind first) and left out.
- The flip-flops' Tcp (1.596 ns, a 0.798 ns pulse each way) and the global buffers have their limits too, far beyond
  any period a design meets here: left out.

`packages/silinx-fpga/src/fpga/timing.js checkSwitching` checks these (DCM_LIMITS), in the flows' timing report, warnings and Design
Summary. They are not checked in the packer: map and par accept such a DCM; it is a timing error, from the PERIOD.

## The critical path's routing against ISE's (#651, 2026-10-20)

The weekly comparison (docs/QUALITY.md, 2026-10-20) had 17 of the 40 timed designs with more than 0.5 ns more
routing on their critical path than ISE's, with about as much logic. Where that routing goes, on the worst
(the app's flow at Normal on the XC3S1200E, seed 1; the same routed designs timed by ISE's trce, `trce -v`):

- `crit-path.mjs`: each connection of Silinx's critical path (its timing analysis, which is within 1 % of trce
  on these) against the fastest route the device has for the same placement: to the same pin, to any input of
  the same LUT (the router may swap them: **the placement's floor**), and to any of them on the wires no other
  net uses (the floor plus **the contention**); the rest is **the router's own choice** (the branch loads of
  the net's own tree, a slower path where a free one was faster).
- `twr-path.mjs`: a trce report's critical path, net by net (fanout, delay, the sites at both ends, the distance
  in CLBs), for ISE's flow and for Silinx's routing alike.

Silinx's critical path, split (ns), against ISE's routing (trce):

| design | routing | placement floor | contention | router | per net: floor / ISE | ISE's routing |
|---|---:|---:|---:|---:|---|---:|
| itc99-b08 | 3.64 | 1.70 | 1.63 | 0.31 | 0.34 / 0.29 | 1.47 |
| iwls05-i2c | 4.26 | 3.63 | 0 | 0.64 | 0.52 / 0.34 | 1.72 |
| verilog-uart | 4.29 | 2.78 | 0.81 | 0.70 | 0.46 / 0.63 | 2.53 |
| itc99-b05 | 4.31 | 3.03 | 0.08 | 1.20 | 0.43 / 0.50 | 2.99 |
| itc99-b10 | 3.04 | 1.79 | 0.98 | 0.27 | 0.45 / 0.67 | 2.01 |
| itc99-b12 | 4.12 | 3.26 | 0.21 | 0.66 | 0.47 / 0.59 | 2.94 |
| iwls05-simple-spi | 3.01 | 1.90 | 0.81 | 0.31 | 0.38 / 0.33 | 1.63 |
| vtr-diffeq1 | 11.97 | 8.04 | 2.16 | 1.77 | 0.73 / 0.80 | 8.85 |
| t80 | 10.55 | 6.50 | 0.40 | 3.66 | 0.46 / 0.47 | 6.13 |

What it says:

- **Per connection, the placement is at ISE's level; the excess is the router's.** The floor per routed net of
  the path is about what ISE's routing achieves per net (0.34 against 0.29 ns, 0.46 against 0.47 on the T80);
  only iwls05-i2c's placement is clearly worse (0.52 against 0.34: six levels of LUTs, 1–2 CLBs apart, where
  ISE's four are next to each other). What Silinx adds above the floor, 0.9–4 ns, is contention and the
  router's choices, 30–45 % of the path's routing.
- **Contention: the fast wires next to a load held by another net.** On itc99-b08 two connections inside one
  CLB take 0.91–0.93 ns, a loop of three doubles back into the CLB, where the device has 0.105 ns (the CLB's
  fast connect to another input of the same LUT) or 0.45 (an OMUX): the fast connect's input is another
  critical net's, the OMUX (OMUX13) a non-critical net's (`in_r<2>`), and the other inputs of the LUT are taken
  by nets that reached them first (one of crit 0.76 on the only input the critical net's fast connect reaches,
  routed at 0.55 ns). vtr-diffeq1: a double (E2BEG5) next to the load held by an adder's net, 1.53 ns instead
  of 0.72. Once the routing is legal, the router's two timing passes rerouted every net with a critical
  connection at once, at the congestion cost the passes had reached (a present factor of 30 and more), and
  kept the result only when the critical path was shorter: the conflicts stayed.
- **The critical load of a high-fanout net at the end of a shared branch.** The T80's path goes through nets of
  78 and 45 loads (ISE's: none above 8); the load of the 45 two rows from its driver at 2.52 ns, after ten
  doubles shared with the other loads, where a free route takes 0.37: it was not critical when its net was
  routed, and the timing passes routed the whole net again with the others' criticalities. Silinx's critical
  paths go through more nets of many loads than ISE's (itc99-b08 17 against 3, itc99-b10 18 against 7,
  verilog-uart 23 against 19, the T80 78 and 45 against 8): their branch loads are most of "router" above.
- **The multipliers' column (vtr-diffeq1).** Its 13 multipliers fit in one of the XC3S1200E's two columns of 14;
  ISE keeps those of its path in column X0 next to their logic; Silinx's placement of seed 1 has 5 in X0 and 8
  in X1, so a product crosses the chip (3.54 ns from MULT18X18_X0Y8 to SLICE_X78Y59, 1.78 back). Seeds 2 and 3
  are 4–8 % faster; vtr-diffeq2's 13 are in one column and it is faster than ISE. Not changed: moving the
  multipliers within the placer's shrinking window instead of anywhere (as the slices move) gained nothing
  (geometric mean of 7 designs with multipliers or block RAMs over 3 seeds −0.7 % at a window of 4 tiles, +0.2 %
  at 8: noise).
- **Placement options** (the timing weight 3 instead of 1.5, effort 2) moved the 8 smaller designs by +0.8 % and
  −1.0 % (geometric mean over 3 seeds): the seeds alone move a design by 5–10 %.
- The placer's delay table against the routed delays (9 designs, all connections between slices): the routed
  ones are 1.3–1.8 times the table at every distance (the table has no fanout and no congestion), about evenly,
  so it does not mislead the placer at short distances more than at long ones.

**The change (#662): the router's polish of the critical path** (`packages/silinx-fpga/src/fpga/route.js`). Once the routing is
legal, the timing passes are 4 (were 2), at a present factor of 1 (`timingPf`), so that a critical net can take
a contested wire; then the critical path's connections one at a time, the slowest first: its own branch (from
the load up to where it leaves the net's tree) routed again on the wires no other net uses, else on those of
other nets at a cost (`stealCost`, 1 unit = 0.3 ns at criticality 1), those nets (at most `stealNets`, 8) then
routed again on free wires; kept when the analysis says the critical path is shorter, or as long with that
connection faster (another path of the same delay), until no connection of the path gains (at most `polish`,
300, changes). It is never slower by the analysis, the routing stays legal (each change is checked against its
nets' wires) and complete.

Tried on the same placements (seed 1 of the 9 designs, then of the examples) before it: more timing passes
alone (8, 20: the T80 −2 %, itc99-b08 −12 %, the others unchanged), the critical nets first in the timing
passes, the history cost cleared there, a polish that routes the path's whole nets again (the T80 −1 %: it moves
their other loads too), a polish on free wires only (the T80 −2 %, nothing else: the wires it needs are taken).

Silinx's analysis, the app's place and route (no replication), 3 seeds per design, mean of the seeds (ns):

| design | before | after | |
|---|---:|---:|---:|
| itc99-b08 | 6.908 | 6.542 | −5.3 % |
| iwls05-i2c | 9.788 | 9.792 | 0.0 % |
| verilog-uart | 9.956 | 9.931 | −0.3 % |
| itc99-b05 | 11.431 | 11.364 | −0.6 % |
| itc99-b10 | 6.183 | 6.129 | −0.9 % |
| itc99-b12 | 10.113 | 9.500 | −6.1 % |
| iwls05-simple-spi | 6.899 | 6.809 | −1.3 % |
| vtr-diffeq1 | 36.014 | 35.857 | −0.4 % |
| t80 | 22.055 | 21.710 | −1.6 % |
| vtr-diffeq2 | 26.603 | 26.557 | −0.2 % |
| fpu-multiplier | 14.315 | 14.098 | −1.5 % |
| femtorv32-quark | 19.028 | 18.853 | −0.9 % |
| light8080 | 12.646 | 12.540 | −0.8 % |
| traffic | 10.107 | 9.737 | −3.7 % |
| blinky | 6.321 | 6.304 | −0.3 % |
| pong | 12.313 | 12.325 | +0.1 % |
| stopwatch | 12.678 | 12.674 | 0.0 % |
| clock | 8.126 | 8.130 | +0.1 % |
| vga | 9.391 | 9.302 | −0.9 % |
| geometric mean | 11.656 | 11.504 | **−1.3 %** |

With 8 timing passes instead of 4, −1.5 %, at twice the routing time; the routing with 4 takes about 1.3 times
as long as before (the T80 6.7 -> 9.7 s, vtr-diffeq2 2.7 -> 4.2 s, the examples 0.2-0.6 -> 0.3-0.7 s).

Checked with ISE (`scripts/check-open-flow.mjs`, seed 1; the 9 designs from the app's netlists of the runs above,
the examples from open-flow.mjs's synthesis): every one DRC 0 errors and 0 warnings, xdl2ncd 0 warnings, the
`.bit` byte-identical to ISE's bitgen (CRC on and off). ISE's trce, the main clock's period (ns):

| design | before | after | | routing after (was) |
|---|---:|---:|---:|---|
| itc99-b08 | 7.692 | 6.727 | −12.5 % | 2.71 (3.62) |
| iwls05-i2c | 9.514 | 9.514 | 0 | 3.98 (3.98) |
| verilog-uart | 10.530 | 10.448 | −0.8 % | 4.31 (4.61) |
| itc99-b05 | 12.019 | 11.922 | −0.8 % | 4.46 (4.56) |
| itc99-b10 | 6.470 | 6.660 | +2.9 % | 3.35 (3.16) |
| itc99-b12 | 9.612 | 9.468 | −1.5 % | 4.04 (4.02) |
| iwls05-simple-spi | 6.999 | 6.996 | 0 | 2.80 (2.81) |
| vtr-diffeq1 | 38.865 | 38.865 | 0 | 14.05 (14.05) |
| t80 | 21.956 | 20.758 | −5.5 % | 8.90 (10.23) |
| traffic | 7.927 | 7.985 | +0.7 % | |
| blinky | 6.932 | 6.989 | +0.8 % | |
| pong | 12.221 | 12.221 | 0 | |
| stopwatch | 12.729 | 12.729 | 0 | |
| clock | 8.124 | 8.094 | −0.4 % | |
| vga | 10.193 | 10.141 | −0.5 % | |

Geometric mean −2.1 % on the 9, +0.1 % on the examples. The polish alone is never slower by the analysis; the
timing passes' new schedule can be (itc99-b10 at seed 1, +0.6 % by the analysis, +2.9 % by trce; blinky and
traffic are within the analysis's error of trce).

What is left (the same split after the change, seed 1): the contention is gone on itc99-b08 (1.63 -> 0.27 ns),
verilog-uart, the T80 (0.40 -> 0) and itc99-b12, but stays on itc99-b10 (0.71), iwls05-simple-spi (0.81) and
vtr-diffeq1 (1.84), whose critical connections compete with others as critical; the router's share is the branch
loads of the high-fanout nets (the T80 3.66 -> 1.86 ns), which only fewer loads per net (replication, or a
netlist like XST's) remove; and the placement's floor, above ISE's routing on iwls05-i2c (the levels, #652) and
on vtr-diffeq1 at seed 1 (the multipliers' columns).

### The polish's whole-net move and lookahead (#651, 2026-10-21)

Measured locally, with Silinx's analysis only (ISE's machine busy that night): the corpus netlists of 31 designs
(the issue's, the examples, a few more; main 0b69aca), each placed once per seed (1-3) and the placement cached,
then routed with each variant of the router on the same placements (no replication), on the corpus's device
(the XC3S250E; vtr-diffeq1 / 2 on the XC3S1200E for their multipliers) and 16 of them on the XC3S1200E (seeds
1-2). One seed of one design moves by ±2-5 % with any change to the router's main passes, so the geometric mean
of the 90 routings is known to about ±0.2 %.

`crit-path.mjs` counted the floor of a carry chain's connection (COUT -> CIN, no general wire) as the model's
base, −0.103 ns, where its delay is 0: the router's share was 0.1 ns too high per carry stage (pong 1.13 of its
1.57 ns). Corrected, the split at seed 1 (sums over the designs, ns):

| | routing on the critical paths | placement's floor | contention | router |
|---|---:|---:|---:|---:|
| XC3S250E, 30 designs | 123.6 | 99.5 | 8.7 | 15.4 |
| XC3S1200E, 16 designs × 2 seeds, before | 137.1 | 104.8 | 7.7 | 24.6 |
| XC3S1200E, the same, after the change | 132.9 | 103.8 | 9.8 | 19.3 |

The router's share left on the XC3S1200E was mostly two cases:

- **A reset or an enable whose loads are all critical** (CE, SR, BX pins of 12-23 flip-flops): the critical load
  at the end of a chain of doubles shared by the others (vtr-ch-intrinsics 1.41 ns where 0.51 is free, iwls05-i2c
  1.22 against 0.51, femtorv32 1.49 against 0.85). The polish could not shorten it: a direct branch for one load
  adds a branch at the driver (0.049 ns) to all the others, so the critical path gets longer at every step. The
  cause is the branch-load term of the router's cost: a new branch off a node pays its load times the *sum* of
  the criticalities of the routed loads below the node; with 16 loads at 0.99 that is 16 × 0.049 ns, so the
  search keeps to the deep nodes of the tree (a chain) rather than branch near the driver, where the period
  only grows by 0.049.
- **Nets of 117-257 loads** (epfl-bar, epfl-max): the same, plus the loads of so many branches; the app's flow
  replicates these (#4).

Tried (each on the same placements; geometric mean of the period by the analysis, against the router before):

| change | XC3S250E (30 × 3) | XC3S1200E (16 × 2) | kept |
|---|---:|---:|---|
| the polish's searches counting the branch loads of the tree (they did not) | −0.0 % | | as part of the last |
| the polish's A* estimate 0.05 ns / tile (0.1: above a hex's or a long line's per tile) | −0.0 % | | no |
| a steal's victim repaired (only its branches through the wires taken) instead of routed again | +0.0 % | | no |
| a 4-step lookahead after a steal that makes the path longer | −0.03 % | | as part of the last |
| the branch-load term weighted by the most critical load below (max), in all the router's passes | +0.18 % (12 worse) | | no: the sum protects the many moderately critical loads |
| the same, the sum capped at 2 / 4, or a sum of criticality⁴ | −0.21 / −0.22 / −0.15 % (3-5 worse) | −0.24 % (4 worse) | no |
| the branch-load term without counting the node's own branches twice | −0.05 % (7 worse, 7 better) | | no |
| **the polish: the whole net routed again with the max weighting, and a 16-step lookahead with free moves** | **−0.33 %** (none worse) | **−0.49 %** (none worse) | **yes** |

The polish (packages/silinx-fpga/src/fpga/route.js) now has, besides #662's moves (a connection's own branch on free wires, then on
other nets' wires): the whole net of a connection of the critical path routed again on free wires (and its own),
its branch loads weighted by the most critical load below a node (`polishNet`, default on); and, when no move
gains, a lookahead (`lookahead`, 16): one of the path's three slowest connections made faster on free wires (else
on others') whatever the critical path does, then up to 16 moves from there, all kept when the critical path ends
shorter, else every net back as it was. Every move is still kept only when the analysis says so: never slower by
it, the routing legal and complete. Its searches count the branch loads of the net's tree (with the max
weighting), as the router's do.

The app's flow (`placeRouteBest`: the placement, the routing, register replication), main's code against the
change from the same netlists, seeds 1-2: XC3S250E (30 designs) −0.27 % (epfl-max −1.8 %, epfl-bar −1.6 %,
verilog-uart −1.0 %, none slower), XC3S1200E (16) −0.29 % (epfl-bar −1.9 %, verilog-uart −0.8 %; epfl-max seed 2
+1.1 %: its first routing differs, so replication copies differently; seed 1 −0.9 %); the place and route's time
×0.98-1.02. A small step: what is left of the gap with ISE's routing is the placement's floor (above ISE's on
iwls05-i2c and the T80) and the high-fanout nets of Silinx's netlists (#652).

Checked with ISE (`scripts/check-open-flow.mjs`, seed 1, default options, main 08182b2 against the change; the
examples and six corpus designs on the XC3S250E): every one DRC 0 errors and 0 warnings, xdl2ncd 0 warnings, the
`.bit` byte-identical to ISE's bitgen (CRC on and off). ISE's trce, the main clock's period (ns):

| design | before | after | |
|---|---:|---:|---:|
| epfl-max | 23.523 | 22.487 | −4.4 % |
| epfl-bar | 8.874 | 8.620 | −2.9 % |
| iwls05-i2c | 8.735 | 8.516 | −2.5 % |
| verilog-uart | 8.421 | 8.236 | −2.2 % |
| femtorv32-quark | 16.536 | 16.413 | −0.7 % |
| blinky | 6.989 | 6.961 | −0.4 % |
| clock | 8.431 | 8.411 | −0.2 % |
| iwls05-simple-spi, traffic, pong, stopwatch, vga | | | 0 |

Geometric mean −1.12 % (12 timed designs; gates has no clock), none slower.

### Two placements at Optimization Effort High (#651, 2026-10-21)

After #662 and #741 the router is no longer most of what is left: on the slowest designs against ISE, Silinx's critical
path splits (`crit-path.mjs`, routed at Normal, seed 1) as itc99-b05 3.41 ns of routing = 2.85 placement floor + 0.08
contention + 0.49 router, itc99-b12 3.89 = 3.20 + 0.08 + 0.61, itc99-b10 2.52 = 1.87 + 0.27 + 0.39, epfl-i2c 2.99 = 2.22
+ 0.27 + 0.51, verilog-uart 4.40 = 3.30 + 0.81 + 0.29. The placement's floor (the cells of the path apart) is most of it.
And one placement's seed moves a design by several per cent, more than any placer option measured before (timing weight
3, effort 2: ±1 %).

Tried on 15 of them (the ITC'99 b05, b08, b10, b12, vtr-ch-intrinsics, epfl-i2c, uart-for-fpga, verilog-uart,
iwls05-simple-spi, fpu-adder, light8080, femtorv32-quark, pong, vga, clock; Normal's netlists, the same placement and
routing before each), a second placement and routing, the faster of the two kept (Silinx's static timing, geometric
mean of the period; place and route time):

| the second placement | period | changed | time |
|---|---:|---:|---:|
| from the first (warm start, window 3, temperature 0.05), each connection's estimate scaled by routed / estimated there (0.5-4) | −0.59 % | 5 of 15 | ×1.27 |
| the same, window 6, temperature 0.3 | −0.69 % | 6 | ×1.27 |
| the same, without the scaling | −0.94 % | 6 | ×1.30 |
| **another seed (seed + 1), from scratch** | **−2.28 %** | 8 | ×1.26 |

The routed delays fed back into the placer gain least: the cool annealing from the first placement stays in its
neighbourhood, and the connections that routed slowly are those of many loads, which a move does not make shorter. A
placement from another seed is a different neighbourhood. So the flows (`packages/silinx-fpga/src/open-flow-core.js`) make `HIGH_TRIES` (2)
placements at Optimization Effort High, seeds 1 and 2, and keep the faster, then register replication from it, as
before; Normal makes one (its place and route stays as fast).

The corpus's 53 designs of 1500 LUTs at most and the 7 examples at High, main of 2026-10-21 (ce30ac0) against the change,
seed 1: **1.52 % shorter** in geometric mean, 29 designs faster (3.1 % on average: verilog-axis-fifo −10.8 %, the clock
example −10.4 %, spi-fpga-slave −7.3 %, epfl-router −6.9 %, itc99-b09 −5.5 %, verilog-i2c-master −5.0 %, picorv32 −4.8 %,
femtorv32-quark −3.8 %, vga −3.0 %), two slower (iwls05-usb-phy +2.2 %, iwls05-sasc +0.1 %: the faster placement before
replication is not the faster after it), slices 10738 → 10735, place and route 563 → 751 s in all (×1.33).

**ISE's check** (on the Mac mini, the 29 changed routings, main against the change): every DRC 0 errors (picorv32's one
warning, a gated clock, main's too), xdl2ncd no new warning, the `.bit` byte-identical to ISE's bitgen (CRC on and off);
trce's period **2.92 % shorter** over the 29 in geometric mean (1.42 % over the 60), 20 faster: the clock example
−14.3 %, verilog-axis-fifo −9.1 %, femtorv32-quark −8.1 %, picorv32 −7.3 %, itc99-b03 and b09 −7.2 %, vga −5.3 %,
spi-fpga-slave −5.2 %, verilog-i2c-master −4.5 %, verilog-uart −4.2 %, epfl-router −4.1 %, blinky −3.9 %, stopwatch
−3.2 %; 8 slower, by 2.3 % at most (vtr-mkPktMerge +2.3 %, nandland-spi-verilog +2.1 %, verilog-lfsr-crc +2.0 %,
epfl-i2c +1.9 %, itc99-b12 +1.3 %, epfl-adder +1.2 %, serv +1.1 %, itc99-b11 +0.2 %: within the static timing's
error of trce, the two placements' periods close).

### Two placements at Normal for a small design (#651, 2026-10-22)

At Normal, the default, the designs furthest from ISE were small ones (the weekly comparison of 2026-10-21 by Silinx's
static timing on today's main: itc99-b05 1.21×, b10 1.20×, b12 1.15×, epfl-i2c and uart-for-fpga 1.09×), whose critical
path is mostly routing above the placement's floor; at High, with its two placements, they were 0.94-1.06×. So Normal
now makes two placements too (`NORMAL_TRIES`: seeds 1 and 2, the faster kept, then register replication) for a design
of 500 slices at most, and one for a larger one (`effortTries` in packages/silinx-fpga/src/fpga/place-route.js).

The corpus's 53 designs of 1500 LUTs at most and the 7 examples at Normal (main 1d895f9, the same netlists placed and
routed by each variant, seed 1; Silinx's static timing):

| two placements | period, geometric mean over the 60 | designs changed |
|---|---:|---:|
| every design | −1.42 % | 27 |
| 500 slices at most | **−1.25 %** | 24 |
| 250 slices at most | −1.25 % | 22 |
| 100 slices at most | −0.70 % | 13 |

The slices are the same (10756 → 10755). The place and route's time (translate to trce, measured interleaved, the
best of two runs): itc99-b10 (25 slices) 2.4 → 2.6 s, iwls05-sasc (65) 3.4 → 3.4 s, itc99-b12 (178) 4.2 → 5.2 s, pong
(243) 2.0 → 4.2 s, femtorv32-quark (438) 11.9 → 17.3 s, picorv32 (706) 20.7 → 33.0 s, epfl-max (672) 22.1 → 35.0 s.
Above 500 slices the three designs that gain (picorv32 −4.7 %, itc99-b14 −4.2 %, vtr-mkPktMerge −0.9 %) would take
about 12 s more each: they keep Normal's one placement (High is there for them).

**ISE's check** (on the Mac mini, the 24 changed routings, one placement against two): trce's period **2.38 % shorter**
in geometric mean (about 1 % over the 60), 18 faster (the clock example 7.508 → 6.433 ns, −14.3 %; verilog-axis-fifo
−9.1 %, vga −5.3 %, spi-fpga-slave −5.2 %, verilog-lfsr-crc −4.6 %, itc99-b07 −3.0 %, iwls05-i2c, sasc and spi −2.3 to
−2.5 %), 6 slower by 2.1 % at most (nandland-spi-verilog +2.1 %, itc99-b12 +1.3 %, epfl-adder +1.2 %, serv +1.1 %,
verilog-i2c-master +1.0 %: the two placements' periods within the static timing's error of trce). Every DRC 0 errors and
0 warnings, xdl2ncd no warning, every `.bit` byte-identical to ISE's bitgen (CRC on and off).

### Where the critical path's routing goes now, and a third placement at High (#651, 2026-10-24)

Measured on main 21de106 (the corpus's 53 designs of 1500 LUTs at most and the T80 in their I/O wrapper on the
XC3S1200E, the 7 examples on their boards; the app's place and route of the same netlists, `placeRouteBest`). By
Silinx's static timing against ISE's trce of the last Quality run (2026-10-20), the critical path is now **6.6 % shorter
than ISE's at Normal** in geometric mean (38 designs timed by both) and 8.7 % at High. Of the five designs this issue
named, three are faster than ISE at Normal (verilog-uart 0.92×, itc99-b08 0.96×, iwls05-i2c 0.97×), vtr-diffeq1 is at
1.02× and the T80 at 1.17×; the slowest against ISE are vtr-stereovision3 (1.37×: a level of logic more), itc99-b05 and
b10 (1.2×), the T80, vtr-ch-intrinsics and itc99-b12 (1.14-1.17×).

The critical paths' routing, split by `crit-path.mjs` (sums over the 61 designs at both efforts, ns): 368.6 of routing
= **299.6 placement floor (81 %)** + 24.3 contention + 44.6 the router's choice. Of the contention, the connections
that miss a CLB's fast connect (0.105 ns) because another net holds the LUT input it reaches are 11 ns in all (3 %;
vtr-ch-intrinsics 0.61, the T80 0.64, spi-fpga-slave 0.45). The router's share is mostly a few nets of many loads all
critical (verilog-uart: a comparator's carry-out of 37 loads, the critical one at 1.59 ns where 0.45 is free; making it
direct slows the others).

Tried, measured on the same netlists (period by Silinx's analysis, geometric mean over the 57 timed designs per effort;
one design moves by ±2-5 % with any change of its placement, so a variant is known to about ±0.5 %):

| change | Normal | High | time | kept |
|---|---:|---:|---:|---|
| register replication from 4 loads (8) | −0.14 % | −0.03 % | ×1.07 | no |
| replication of up to 16 cells (8) | 0 | 0 | | no |
| replication from criticality 0.95 (0.98) | −0.03 % | −0.01 % | | no |
| the placer's estimate + 0.05 / 0.09 / 0.15 ns × log2(loads) | −0.17 / +0.71 / +0.49 % | +0.17 / +0.74 / +0.35 % | | no |
| the placer's effort 2 / 4 (1) | −0.16 / −0.56 % | −0.33 / −0.61 % | ×1.4 / ×2.6 | no |
| at High, a third placement, routed | | −0.90 % | ×1.51 | |
| at High, 4 placements, the 2 of the shortest estimates routed | | −0.80 % (some slower) | ×1.28 | no |
| **at High, a third placement, routed when its estimate is shorter than one of the first two's** | | **−0.81 %** (none slower) | **×1.20** | **yes** |

The routed delay over the placer's table grows with the net's loads (critical connections: +0.03 ns at 1 load, +0.15 at
4-7, +0.40 at 16-31, +0.68 at 64 and more, about 0.09 ns × log2(loads)); at one to three loads the table is right within
1.1-1.3× at every offset. Adding that term to the placer's estimate changes every placement (the criticalities move)
but not for the better. More moves per temperature gain little: the annealing has converged, what is left is the
variance between seeds. Choosing among placements before routing them: over seeds 1-6 of the 57 designs, the placer's
estimate ranks the routed periods with a Spearman correlation of 0.38 only; a routing without the timing passes and the
polish ranks them better (0.66) but costs 60 % of a whole routing. So the estimate is used only to skip the routing of a
third placement that is unlikely to win: at High (`HIGH_EXTRA`, `placeRouteBest`'s `extra`), seeds 1 and 2 placed and
routed as before, seed 3 placed and routed when its estimate is shorter than the longer of the first two's (37 of 57
designs in the simulation over seeds 1-6, 90 % of the third seed's gain for 70 % of its cost).

**ISE's check** (on the Mac mini, the 19 changed routings at High, main against the change): trce's period **2.17 %
shorter** in geometric mean (about 0.7 % over the 57), 16 faster (itc99-b06 −6.3 %, verilog-lfsr-crc −6.0 %, itc99-b09
−5.2 %, iwls05-usb-phy −3.9 %, itc99-b12 −3.7 %, the stopwatch example and itc99-b08 −3.5 %, fpu-multiplier −3.2 %,
verilog-uart −2.7 %), 3 slower (spi-fpga-master +4.1 %, epfl-priority +2.8 %, t80 +0.2 %: within the static timing's
error of trce). Every DRC 0 errors and 0 warnings, xdl2ncd no warning, every `.bit` byte-identical to ISE's bitgen (CRC
on and off).

What is left of the gap with ISE's routing is the placement floor of a single annealing (Normal's one placement of a
design above 500 slices: the T80) and the nets of many critical loads, which only a different netlist (#652) or a
replication of their driver (a carry chain's output cannot be copied today) removes.

## A LUT input's delay by its pin (#1359, 2026-10-27)

ISE's delay into a LUT depends on the input pin. On `reportgen -delay` of 9 routed designs (31 748 connections), the
model's error by pin (model − ISE, mean) was pin 1 −0.025, pin 2 +0.036, pin 3 +0.095, pin 4 +0.084 ns, the same in
every design; trce's critical paths show it too (F1 −0.030, G1 −0.050, F3 +0.091, F4 +0.102). Earlier fits grouped F1–F4
and missed it. `SPEED_4.lutPin` adds [0.06, 0, −0.06, −0.05] ns at the pin (the shape fitted, the common offset set on
trce's periods): rms per connection 0.119 → 0.093 ns (cross-validated by design), the period against trce on 114
routings mean −0.37 % → +0.09 %, σ 3.21 → 3.00 %. `nodeDelays` carries it, so the timing-driven router, which already
permutes a LUT's inputs, puts the critical loads on pins 3 and 4.

Routing the corpus again (122 builds, seed 1), 99 routings changed. trce: the period **0.96 % shorter** in geometric
mean, 59 faster (spi-fpga-slave −11.1 %, spi-fpga-master −6.6 %, vtr-mkPktMerge (High) −6.5 %, pong −5.3 %), 38 slower
(light8080 (High) +6.3 %, iwls05-ss-pcm +5.6 %, vtr-mkPktMerge +5.3 %), 2 the same; slices −8 in all, the place & route
time the same. Every DRC 0 errors with the warnings of the base, xdl2ncd the same, every `.bit` byte-identical to ISE's
bitgen. The router's own estimate before the change (flat pins) judged the same routings 0.71 % slower: only trce can
judge a change of the model.

## The XC3S1200E's long-line splitters (#23, 2026-10-21)

The XC3S1200E joins each vertical long line's two halves across the centre row (CLKH_LL; the bits:
research/s3e-bitstream/README.md, stage F). A routed design writes the splitter as `a =- b`. bitgen now
takes its direction from the device description (`pipFeatures`: the half of the line the net drives is
the input), so the router may use it. Three ways were compared on 21 designs (the 9 of #651, six more
of the corpus, the examples on the Nexys2-1200) at 3 seeds, the same netlists:

| | Silinx's analysis, geometric mean |
|---|---:|
| without the splitters (before) | 11.417 ns |
| the router uses them, the placer's delay table without them | 11.414 ns (−0.02 %) |
| the placer's delay table counts them too (#599's) | 11.509 ns (+0.81 %; vtr-diffeq2 +8.5 %, itc99-b05 +6.2 %) |

Counted in the delay table, the splitters make far vertical offsets look faster than they route, and the
placements are slower. So the table leaves them out (`knownRouting` `delayPip`), and the placements are
the same as before. The router takes a splitter in 18 of the 63 runs (31 in all). By ISE's trce on those
18, against the same placement routed without them: −0.10 % in geometric mean (8 faster, 7 slower,
within ±4 %; picorv32 +0.6 to +3.5 %, vtr-diffeq2 −1.2 / −1.7 %, blinky −3.8 % at seed 1). The other 45
route as before. All 41 routings checked: DRC 0 errors (picorv32's one warning, its gated clock, with or
without the splitters), xdl2ncd no new warning, the `.bit` byte-identical to ISE's bitgen (CRC on and
off). The splitters change little: a design that reaches across the centre row is rare, and a hex or
two does nearly as well. The XC3S1200E's other splitters (horizontal, across the centre column; the
I/O columns') are not in the bit database yet: #709.

### The other splitters (#709, 2026-10-22)

The bit database now has the XC3S1200E's other long-line splitters too (research/s3e-bitstream/README.md: CLKV_LL,
CLKT_LL / CLKB_LL across the centre column, CLKL_IOIS_LL / CLKR_IOIS_LL and CLKLH_DCM_LL / CLKRH_DCM_LL across the centre
row), and the router takes them as it takes CLKH_LL's; the placer's delay table leaves out the splitter types' own
switches only. Measured with Silinx's analysis on 18 designs of the corpus on the XC3S1200E (`research/s3e-route/open-flow.mjs`, the
same netlists and seeds 1 and 2, against main: the first placement is the same, as the delay table is; 9 of the 36
end on another one, register replication placing again after a different routing):

| | |
|---|---:|
| the 36 routings, geometric mean | −0.13 % |
| routings that take a new splitter | 8 (vtr-diffeq1: 33 and 19 of them; picorv32, secworks-sha1, itc99-b15: 1-2) |
| the most changed | vtr-ch-intrinsics s1 −4.1 %, fpu-adder s1 −3.8 %, secworks-sha1 s1 +4.0 % |

ISE on the 8 routings that take a new splitter, and on main's of the same designs (`scripts/check-open-flow.mjs`,
SILINX_KEEP=1): all 16 byte-identical to ISE's bitgen (CRC on and off), DRC 0 errors (picorv32's one warning, its gated
clock, on both). By ISE's trce, against main's: +0.74 % in geometric mean (vtr-diffeq1, 33 and 21 CLKV_LL splitters:
−0.3 / −0.5 %; itc99-b15 −0.6 / +1.4 %; picorv32 +1.7 / +0.6 %; secworks-sha1 +2.2 / +1.5 %, which take one or two). The
splitters taken are all CLKV_LL's; where one or two are, the rest of the routing changed more than they did.

Within the noise of a router change (±0.2 % in geometric mean, ±2-5 % per routing): the routes change even where no
splitter is taken (the search sees them), and a design that crosses the centre on a long line is rare. The splitters
are there for completeness (ISE's own routings of the XC3S1200E are now byte-identical) more than for speed.
`test/fixtures/open-flow/feat_ll_splitters` (paths between IOB registers of opposite sides) takes the left DCM column's
at seeds 2, 7 and 8.

## Open problems

- Timing: no timing constraints (UCF PERIOD) are read yet; the router and the placer minimise the
  critical path by the model, with no target.
- GND / VCC sources: the made-up `XDL_DUMMY` source is understood by `xdl -xdl2ncd`, and Silinx's
  bitgen programs what ISE programs for it on SLICEL positions (byte-identical above); SLICEM
  positions as GND sources are not measured (`SLICE0:_GND_SOURCE:Y`).
- The placer keeps each clock's flip-flops on the slices its line reaches with known switches
  (`clockSites`, above); it could also choose the global buffer by it.
- Route-throughs are used only out of the source site (COUT -> YB). LUT route-throughs (to reach
  a pin otherwise unreachable) are never used.
- Only the XC3S250E has been checked; other Spartan-3E parts need their own report (same code).
- The 293 templates are most of the cache; many differ only slightly (BRAM / clock variants) and
  could share their PIP lists if the cache must get smaller.

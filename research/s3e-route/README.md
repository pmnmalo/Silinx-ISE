# Spartan-3E routing: device graph and router (2026-10-10)

Silinx's router for the Xilinx Spartan-3E XC3S250E-4CP132 (Digilent Basys2), checked against
Xilinx ISE 14.7, following the method in [docs/OPEN-TOOLCHAIN.md](../../docs/OPEN-TOOLCHAIN.md).

- `core/fpga/device.js`: the routing graph of the device (browser + Node).
- `core/fpga/device-node.js`: its cache file (Node only).
- `core/fpga/route.js`: the router (PathFinder) and a routing check.
- `core/xdl.js` `writeXdl()`: a design back to XDL text.

| Script | What it does |
|---|---|
| `build-device.mjs` | Builds the graph cache from the full device report; prints sizes and load time |
| `timing-fit.mjs` | Fits the wire delay model of `core/fpga/timing.js` to ISE's `reportgen -delay` of routed designs |
| `route.mjs` | Removes a design's PIPs, routes it, writes the XDL, checks it against the graph (`--known`: only PIPs of known bits) |
| `open-flow.mjs` | The fully open flow for a project: synthesis (Silinx + Yosys), pack, place, route on known PIPs, Silinx's bitgen |
| `ise-open-check.sh` | Inside the ISE container, the oracle of the open flow: `xdl -xdl2ncd`, `drc`, `bitgen` (CRC on / off), `trce -a`, `reportgen -delay` |
| `check.mjs` | Checks the routing of an XDL design (ISE's or Silinx's) against the graph |
| `gen-controls.mjs` | Control designs: all PIPs removed, one antenna added, bidirectional PIPs flipped, rewritten unchanged |
| `ise-check.sh` | Inside the ISE container: `xdl -xdl2ncd`, `drc`, `bitgen`, `trce` for each design |
| `cmpbit.mjs` | Compares the configuration frames of two bitstreams |
| `sdf-compare.mjs` | Compares the post-place & route model's SDF (#122) with ISE's netgen SDF of the same routed design |

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
  `core/fpga/bitgen.js`): a PIP may be used only if its feature `from->to` (wires in the direction
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

- `core/fpga/timing.js`: a delay model of the XC3S250E -4 and a static timing analysis (STA).
- `core/fpga/route.js`: timing-driven routing (`routeDesign(…, { timing: true })`), the default of
  `open-flow.mjs` (`--timing-route 0` turns it off); `clockReach()`.
- `core/fpga/place.js`: the timing term in ns with the same model; `clockSites` keeps each clock's
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
designs and trce's periods of three of them are test fixtures, `test/fixtures/fpga/trce/`). A block RAM's arcs are
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
4. **Register replication** (`core/fpga/replicate.js`, #4): after placing and routing, the
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
   The flows place and route through one helper, `core/fpga/place-route.js` (`placeRouteBest`:
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
slice of `core/fpga/timing.js` split over the elements it goes through, so that their sum is the timing's) and setup
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
- **trce's minimum delays** are 0.751 (`minScale`) of the model's: the slope of the inputs' hold against the model's
  shortest data paths.
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
A clock from a DCM (deskewed, about 0 insertion delay, not Tgclk) and paths between two clocks are left to #601.
blinky's pad-to-pad paths (sw<3> -> led<1> 9.81 ns on main's seed-1 placement) are what its test bench's invert check
waits for: half a clock period was too little for another placement (#591).

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

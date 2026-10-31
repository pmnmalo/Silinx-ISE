# Changelog

What changed in each version of silinx-fpga, the Silinx toolchain. The newest version is first. Its versions
are its own (semver, 0.x until its API is stable), apart from Silinx ISE's.

## 0.1.3

The first version on npm: 0.1.2 was tagged and tested, but npm refused it with no repository in its package.json
(#2382). 0.1.1's and 0.1.2's changes are in it.

In short:

- **A family's back end:** `registerBackend` adds a family to `runFlow` with its own steps. `io.nextpnr` is now keyed by
  micro-architecture (`io.nextpnr.spartan3e`, `io.nextpnr.spartan6`), and `io.nextpnrS6` is gone: a flow of one's own that
  gives these hooks changes them.

In detail:

- **The package's repository (#2382):** package.json names it (Silinx ISE's repository, the folder packages/silinx-fpga),
  which npm's provenance is checked against: 0.1.2's publish was refused without it.
- **The flow's back ends, first step (#2360):** `runFlow` names no family and no engine: the Spartan-3E's and the Spartan-6's
  Map, Place & Route, engines, timing model and bitstream are back ends (`open-flow-backends.js`; the Spartan-3E's steps moved
  as they are to `open-flow-s3e.js`), with the same output; a test keeps the orchestrator free of those names.
- **Spartan-6: an OLOGIC2's output flip-flop (#2025):** `OMUX::OUTFF`, the register ISE packs into a pad, measured at
  every site of the XC6SLX16 and the XC6SLX45 (`research/s6/gen-ologic6.mjs`, `ana-ologic6.mjs`; 10 designs). It sets
  two bits of its IOI tile, by the tile's layout and the site, and one bit of the HCLK tile its clock passes in its
  column and clock region (`bitdb/s6/s6-ologic.json`, `src/fpga/s6/bitgen-ologic.js`). Its clock paths' PIPs in the
  top, left and right IOI tiles, the slave sites and the HCLK tiles were measured first, one at a time (83 PIPs,
  `bitdb/s6/s6-pips-flow.json`). On the XC6SLX16's 203 CMT and example designs the rules predict 196 bit for bit (122
  before), with 21 bits left over (264) and none predicted that ISE does not set; the XC6SLX45's 184 stay exact.
  - **Tests:** test/s6-ologic.test.js.
- **Spartan-6: a top pad's output pin PIP has no bits (#2372):** `TIOB TIOB_O0 -> TIOB_O0_PINW` carried the bits of the
  OLOGIC2's D1 -> OQ route-through, so an output register in a top-outer IOI tile predicted bit 28,49, which ISE does
  not set. The pin PIP now has no bits, like every other pad's; the route-through keeps its own.
  - **Tests:** test/s6-ologic.test.js.

## 0.1.2

0.1.1 was tagged but not published either, its CI having failed on a break fixed since
(#2356). 0.1.1's changes are in it.

In detail:

- **`leaveOutChipdbs` in the Node API (#2356):** `silinx-fpga/node` exports it (a nextpnr package without its chip
  databases, fetched on first use), which Silinx ISE's release script imported from the module itself, across the
  package's API.

## 0.1.1

0.1.0 was tagged but not published, its CI having failed on two breaks fixed since (#2329, #2335).

In short:

- **`--engine nextpnr` takes fewer slices:** flip-flops alone share the carry chains' slices, and a chain's carry in at 1 costs no LUT.
- **`--engine nextpnr` gives faster designs:** about 2 % shorter periods, for a longer Place & Route.

In detail:

- **nextpnr's chip databases on first use (#2329):** `nextpnrNode()` and `nextpnrS6Node()` download a database their package
  does not have, when its `chipdb/fetch.json` says where (Silinx ISE's release zip leaves them out), check its size and
  SHA-256 and keep it in `~/.silinx/nextpnr/`. An installation from npm has them all, and nothing changes. The module:
  `src/nextpnr-chipdb-node.js`, tested by test/nextpnr-chipdb.test.js.
- **nextpnr from npm (#2307):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is pinned by its version on npm,
  0.11.2 (published by nextpnr-spartan's CI through npm's trusted publishing, with its provenance), no longer by the URL
  of its GitHub release. Its engine is v0.11.0's.
- **The nextpnr engine's packing, flip-flops in carry slices (#2223):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now
  nextpnr-spartan v0.10.0. A flip-flop alone takes a free place of a chain's slices when BX / BY is free or carries the same net and the
  control set suits (fpga/pack-luts.js's way); a chain's carry in at 1 comes from the CLB's VCC site (XDL's `vcc` net to BX); a stage's
  constant select reads a LUT giving it. src/fpga/nextpnr-xdl.js needs no change: its settings for those slices are checked.
  - **Research:** research/nextpnr-s3e/ffcarry.v.
  - **Tests:** test/nextpnr-engine.test.js (test/fixtures/nextpnr-engine/ffcarry.*: the mixed slices' settings, the `vcc` net; the VGA example's size).
- **The nextpnr engine's placer (#2222):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.11.0. HeAP's refinement is a timing-driven annealing (placer1 from a temperature of 1e-2 in a window of 30 tiles, 30
  passes a temperature, the criticalities to the 4th) that moves the carry chains and slices whole; the placer's delays
  are fitted to Silinx's delays of the examples' routes (from a flip-flop's Q through an OMUX, from a LUT by its CLB's
  fast connects, by the distance) plus a net's load, about 60 ps a doubling of its fanout. Settings tried and dropped
  are reported in the issue.
- **Spartan-6: the I/O logic's clock and the CMTs' HCLK outputs (#2025):** 63 PIPs of the XC6SLX16's CMT designs that
  no database had (a global clock to an OLOGIC2's or ILOGIC2's CLK0, a DCM's or PLL's outputs onto the HCLK lines,
  some BUFIO2 inputs) measured one at a time against ISE's bitgen: those with bits near their tile in
  `bitdb/s6/s6-pips-flow.json`, the others in `bitdb/s6/xc6slx16-pips-cmt.json`. On the XC6SLX16's 203 CMT and example
  designs the rules predict 122 bit for bit (103 before), with no bit ISE does not set.
  - **Tests:** test/s6-cmtpaths.test.js.

## 0.1.0

The first version of silinx-fpga, the Silinx toolchain as a package of its own, separated from Silinx ISE
(`npm install silinx-fpga`).

In short:

- **silinx-fpga:** the Silinx toolchain for the Spartan-3E (Basys2, Nexys2) and the Spartan-6 (Nexys3, Atlys):
  synthesis with Yosys in WebAssembly from flat Verilog or a Yosys netlist, then pack, place, route, timing and the
  bitstream, byte for byte the one ISE's bitgen writes, with the device graphs and the bit databases; an API
  (`silinx-fpga`, `silinx-fpga/parts`, `silinx-fpga/node`) and a command line, `silinx-fpga`.
- **Two Place & Route engines:** Silinx's own, and nextpnr's (`--engine nextpnr`, on the Spartan-3E and the
  Spartan-6): carry chains, wide multiplexers (MUXF5 to MUXF8), distributed and block RAMs, multipliers, DCMs, IOB
  registers and the whole UCF. `--engine auto` takes nextpnr when it can implement the design, else Silinx's own.
- **Static timing as ISE's trce:** a slice's carry chain, the hold check of two flip-flops and a clock on general
  routing as trce counts them; periods within about 1 % of trce's.
- **Published on npm with provenance**, from its tag in the Silinx ISE repository once all its tests have passed;
  Apache-2.0, its code and its data.

In detail:

- **Static timing: a slice's ways through the carry's XORs and onto XB as trce's (#2286):** `SPEED_4.slice`
  (src/fpga/timing.js) had estimates under trce's for Topx (0.85 / 0.9 -> 1.060 / 1.118), Togy (0.9 / 0.95 -> 1.231 /
  1.288), Topy, Topcyf, Topcyg, Tdick and Tbxy, and XB (#591) was half of CIN -> COUT short of COUT (CIN -> XB 0.065 ns
  against trce's 0.495). They are now trce's, read from its setup paths of nine routings of blinky and stopwatch, and XB
  has its own arcs (`Tcinxb`, `Topxb`, `TopxbDI`, `Tbxxb`, src/fpga/timing-arcs.js). The placer and the router see the
  same delays, so placements of designs with carry chains change; the post-place & route model (core/sim-model.js)
  gives XB its own element with these delays. Tests: test/fpga-slice-delays.test.js (fixture: blinky routed by Silinx,
  trce's period).
- **The nextpnr engine: x<0> on a one-bit bus port only, not on a scalar (#2232):** `nextpnrNetlist`
  (src/open-flow-nextpnr.js) looked every one-bit port up as `x<0>` too, a `std_logic` one included, which ngdbuild
  does not find. Now only a port Yosys marks `single_bit_vector` (`std_logic_vector(0 downto 0)`, `[0:0]`) takes it, as
  Silinx's packer does since #2229. Test: test/nextpnr-engine.test.js.
- **The packer: x<0> on a one-bit bus port only, not on a scalar (#2229):** #2199 applied a UCF name `x<0>`, `x(0)` or
  `x[0]` to any one-bit port `x`, a `std_logic` one too, which ngdbuild does not find (the #84 test failed). Now only a
  port declared `std_logic_vector(0 downto 0)` / `[0:0]` takes it: `readYosysJson` (src/fpga/netlist.js) marks it
  `oneBitBus` from Yosys's `single_bit_vector` attribute, and `portAssignments` (src/ucf.js) takes their names
  (`oneBitBuses`, from `oneBitBusesOf` in src/fpga/pack.js, for the Spartan-3E packer and src/fpga/s6/phys.js). Tests:
  test/ucf.test.js, test/iob-pack.test.js, packages/silinx-fpga/test/fpga-hard.test.js (#84).
- **Static timing: the hold check of two flip-flops fitted to trce's hold paths (#2226):** `pads().hold`
  (src/fpga/timing.js) took the inputs' hold time (-1.018 ns, `model.clock.hold`) and `minScale` for every
  flip-flop, 0.57-0.79 ns over trce's slack, so a real violation (trce: -0.659 ns on blinky with 12 clock pins off the
  global lines) was reported as met. The check now takes trce's earliest delays (`model.clock.minLogic` 0.80 of the
  logic's, `minNet` 0.784 of the wires') and the end's own hold margin: each setup arc's third element (`instArcs`,
  src/fpga/timing-arcs.js), the way through the slice at its earliest less the flip-flop's hold time (`Tckdx`,
  `Tckdi`, `Tckdy`, `Tckce`, `Tcksr`, trce's (-Th)), fitted with research/s3e-route/ff-hold.mjs on nine routings of
  blinky and stopwatch. Each routing's worst hold path is then trce's pair of flip-flops, its slack within -0.09 / +0.13
  ns; the periods and the pads' paths are unchanged. Tests: test/fpga-ff-hold.test.js (fixture:
  blinky-hold-violation, trce's numbers).
- **Static timing: the clock skew of a global clock's loads off the global lines (#2224):** `clockArrivals`
  (src/fpga/timing.js) gave every load of a global buffer the same arrival, so a routing with clock pins on general
  routing was timed as if it had no skew (nextpnr-spartan v0.6.0's blinky: 28 of 77 clock pins, 7.647 ns against
  trce's 8.015). Such a load now arrives later by its detour (`clockDetour`, `model.clock.detour`: a + b x the model's
  delay of the general wires from where it leaves the global lines, fitted on ISE's delays of 129 such loads, rms
  error 0.100 ns, research/s3e-route/clock-detour.mjs), and `analyzeTiming` counts that skew in the periods and the
  hold check (`r.detours`, and a line in `timingReport`): the same blinky 7.918 ns, its critical path's skew -1.744 ns
  against trce's -1.774. A clock wholly on the global lines (Silinx's routings, nextpnr-spartan v0.9.1's) keeps its
  periods exactly. Tests: test/fpga-clock-skew.test.js (fixture: that routing, trce's and reportgen's numbers).
- **The packer: a LOC written x<0> on a one-bit bus port (#2199):** such a port is `x` in the netlist, as XST names it
  `x<0>` in the UCF. `portAssignments` (src/ucf.js) took the exact name only, so the constraint was dropped silently
  and the placer chose the pad. An exact name `x<0>`, `x(0)` or `x[0]` that no port bit has now goes to the port bit
  `x`, as ngdbuild finds it and the nextpnr engine already did; a name no port has stays as written (Check Constraints
  reports it). The traffic (`btn`) and vga (`sw`) examples now get every UCF pin on the Basys2-100 / 250 and the
  Nexys2-500 / 1200. The Spartan-6 flow reads the constraints the same way (src/fpga/s6/phys.js): traffic, stopwatch
  and vga (`sw`) on the Nexys3 and the Atlys move to their UCF pins, and their routing switches in
  research/s6/measured/route-compare.json are measured again (Silinx's figures only; ISE's night-1 routing is
  unchanged). Tests: test/ucf.test.js, test/iob-pack.test.js, test/s6-route.test.js.
- **The nextpnr engine's packing (#2196):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.7.1, whose micro-architecture fills a slice's free places with unrelated LUTs and flip-flops, the critical connections
  first (fpga/pack-luts.js's way), reads a shared LUT by a copy in carry stages and F5s (pack-slices.js `lutFor`), leaves out
  a carry stage whose select is the constant 1, takes a carry out read by logic out by XB / YB, and routes a global buffer's
  clock pins on its global lines before everything else.
  - **src/fpga/nextpnr-xdl.js** writes XBUSED / YBUSED, and COUTUSED only when the chain goes on; **research/nextpnr-s3e/lib.mjs**'s
    simCheck simulates XB and YB.
  - **Tests:** test/nextpnr-s3e.test.js (the VGA example's routed design) and test/nextpnr-engine.test.js (built with the engine).
- **The nextpnr engine: the UCF beyond LOC and PERIOD (#2195):** `nextpnrNetlist` puts a pad's attributes on its buffer
  (wildcards too) and writes an SDC with one `create_clock` per PERIOD; **src/fpga/nextpnr-iob.js** writes the settings as
  Silinx's packer does; an input nothing reads gets no pad. OFFSET and PERIOD are checked by the timing step; TIG and
  CLOCK_DEDICATED_ROUTE change nothing, as in Silinx's own flow.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
- **The nextpnr engine: the DCM (#2194):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` has this since nextpnr-spartan
  v0.9.0 (on main through v0.9.1). **src/fpga/nextpnr-dcm.js** (new) writes the settings as Silinx's packer does; **src/open-flow-nextpnr.js** (Map)
  accepts the cells, passes `INST LOC` and gives each DCM clock its derived period; the global buffers of a tile share
  one VCC net; **research/nextpnr-s3e/lib.mjs**'s simCheck takes the DCM's non-clock outputs as inputs.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
- **export-timing: the block RAMs' and multipliers' delays (#2193):** research/nextpnr-s3e/lib.mjs's `timingExport` also
  gives nextpnr's chip database `bram` and `mult` (SPEED_4's, trce's values), for the spartan3e micro-architecture's
  RAMB16 and MULT18X18SIO. Test: test/nextpnr-s3e.test.js.
- **The nextpnr engine: block RAMs and multipliers (#2193):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is
  now nextpnr-spartan v0.5.0. Its micro-architecture has RAMB16 and MULT18X18SIO BELs and their delays, and sources for
  their constant pins: a VCC site beside each pin, a SLICEL giving 0 on Y.
  - **src/open-flow-nextpnr.js:** `hardInputs` leaves a block RAM's and a multiplier's inputs as Silinx's packer does
    (`parityToData`, now exported by src/fpga/pack-bram.js; a port never written without its data; the other undriven
    inputs at 0).
  - **src/fpga/nextpnr-xdl.js** writes their settings as src/fpga/pack-cfg.js does, and the constants as XDL's `vcc` and
    `gnd` nets, which ISE takes for constants.
  - **Checked with ISE:** the stopwatch example on the Basys2-100 / 250 and the Nexys2-500 / 1200: no DRC errors or
    warnings, the `.bit` byte-identical to ISE's bitgen, with and without CRC.
  - **Tests:** packages/silinx-fpga/test/nextpnr-hard.test.js. The traffic example takes 71 slices (70): nextpnr-spartan
    v0.4.0's change, not pinned here before.
- **The nextpnr engine: the IOB's registers and DDR, the clock pads (#2192):** the dependency
  `@silinx/nextpnr-himbaechel-spartan3e` has this since nextpnr-spartan v0.4.0: its micro-architecture packs a flip-flop into
  its pad's IOB when asked (the UCF's `IOB = TRUE`), an IDDR2 / ODDR2 as the IOB's two flip-flops, and places a pad's
  global buffer where the pad's dedicated path reaches it.
  - **src/fpga/nextpnr-iob.js** (new) writes the IOB's settings as Silinx's packer does; **src/open-flow-nextpnr.js**
    (Map) accepts IBUFG, OBUFT, IOBUF, IDDR2 and ODDR2, and passes the UCF's IOB constraints; **research/nextpnr-s3e/lib.mjs**'s
    simCheck simulates the IOB's registers on both clock edges and with random inputs.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
- **The nextpnr engine: the SLICEM's memories (#2191):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.9.1. **src/fpga/nextpnr-mem.js** (new) writes the memories' settings as Silinx's packer does; **src/open-flow-nextpnr.js** (Map)
  accepts the cells; **research/nextpnr-s3e/lib.mjs**'s simCheck simulates their contents. RAM64X1S is still refused at Map.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
- **The nextpnr engine: MUXF7 and MUXF8 (#2190):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now nextpnr-spartan
  v0.6.0, whose packer takes a whole tree of MUXF5 to MUXF8 as one cluster; **research/nextpnr-s3e/lib.mjs**'s simCheck simulates
  them.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
- **fsm_detect's messages: the top's name taken as it is (#2157):** `parseDetect` (src/synth-fsm.js) removed the
  top's name from a register's with a regular expression that escaped only `.`, `$` and `\`, so a top named with
  another of a pattern's characters (an escaped Verilog identifier) threw or matched another name. It now compares
  the text itself. Test: test/synth-fsm.test.js.
- **nextpnr's Place & Route on the Spartan-6 (#2138):** the new dependency `@silinx/nextpnr-himbaechel-spartan6`, the fork's
  `spartan6` micro-architecture with one BEL per site (pmnmalo/nextpnr-spartan, release spartan6-v0.1.0). ISE checks
  the seven examples it routes on both boards: a clean DRC and bitstreams byte-identical to Silinx's.
  - **src/open-flow-nextpnr-s6.js:** three seeds placed and routed, the fastest by Silinx's timing model kept. The pads,
    global buffers, block RAMs and DSP48A1s are fixed by Silinx's placer.
  - **src/fpga/s6/nextpnr.js:** the sites as nextpnr's netlist, each cell with its timing arcs; the results read back.
  - **src/fpga/s6/nextpnr-export.js, research/nextpnr-s6:** the unknown PIPs and the delay model for the chip database.
- **The engine `auto` (#2136):** the flow's spec.engine `auto` takes nextpnr when its Map has no problem with the design, and
  the Silinx engine otherwise, which Map says in one line; the Spartan-6 keeps the Silinx engine. `engineOf(impl)` reads a
  project's engine. **src/nextpnr-io.js** (new): the runner of nextpnr's WebAssembly package, for Node and for a browser worker.
  - **Tests:** test/nextpnr-engine.test.js and test/silinx-fpga-cli.test.js.
- **The nextpnr engine: carry chains and constants (#2135):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is
  now nextpnr-spartan v0.2.1. Its micro-architecture places and routes MUXCY / XORCY chains up a column of slices,
  takes the constants, and adds a carry-in stage when a chain's first DI needs BX.
  - **src/fpga/nextpnr-xdl.js** writes the carry settings (CYINIT, CY0F / CY0G with GNDF / C1VDD, CYMUXF, XORF,
    FXOR / GXOR, COUTUSED). It trims nextpnr's string parameters' trailing space, which had reached the XDL
    (`CY0F::1\ `) and misread the flip-flops' set / reset modes.
  - **src/open-flow-nextpnr.js** (Map) accepts MUXCY, XORCY, GND and VCC.
  - **research/nextpnr-s3e/lib.mjs**'s simCheck simulates the carry.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js (the counter built with the engine).
- **The nextpnr engine: MUXF5 and MUXF6 (#2135):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` is now
  nextpnr-spartan v0.3.0, whose micro-architecture places an MUXF5 with its slice's two LUTs and an MUXF6 with the
  two F5s it reads (MUXF7 and MUXF8 as LUTs for now).
  - **src/fpga/nextpnr-xdl.js** writes F5MUX, F6MUX, F5USED / FXUSED, FXMUX = F5 and GYMUX = FX; **src/open-flow-nextpnr.js**
    (Map) accepts MUXF5 to MUXF8; **research/nextpnr-s3e/lib.mjs**'s simCheck simulates them.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js (the traffic example built with the engine).
- **Spartan-6: the XC6SLX45's DCMs and PLLs (#2025):** the CMT paths' PIPs are now a database per device
  (`bitdb/s6/<device>-pips-cmt.json`; the XC6SLX16's renamed from `s6-pips-cmt.json`), since their bits far from
  their tile depend on the device's layout; the XC6SLX45's measured one at a time against ISE's bitgen (1147 drops),
  with its CMTs' settings and input table, and **src/fpga/s6/bitgen-cmt.js**'s REGC bits for it. On the XC6SLX45's 184
  CMT designs the rules predict every bit; the XC6SLX16's results are unchanged.
  - **Tests:** test/s6-cmtpaths.test.js and test/s6-cmtsites.test.js.
- **The research scripts' ssh does not hang (#2019):** the scripts under research/ that reach the ISE machine give
  every ssh and rsync `ServerAliveInterval=30`, `ServerAliveCountMax=4` and `ConnectTimeout=30`. `ise-remote.sh`,
  when the connection is lost during a run, fetches what it can, says so, exits with 1 and keeps the remote folder,
  so that missing logs are not read as verdicts. Test: test/ssh-keepalive.test.js.
- **The Spartan-3E research flow and C sources (#1966):** `research/s3e-route/open-flow.mjs` adds the module of each C source of the project (Silinx HLS: its HDL made from the C, as the IDE makes it, with no file of its own), so `check:open-flow` takes a project with one, as the example isqrt.
- **Published on npm (#1681):** `npm install silinx-fpga`; each version from its tag `silinx-fpga-vX` in the Silinx
  ISE repository, once all its tests have passed on that commit, with npm's provenance.
- **The package (#1651):** the toolchain moved out of Silinx ISE into packages/silinx-fpga
  (docs/TOOLCHAIN-SEPARATION.md in the Silinx ISE repository): its modules and data (#1677), its API
  (src/index.js, src/parts.js, src/node.js, #1678), its command line (#1679), its tests and its research
  (#1680), its licence (Apache-2.0) and notices (#1681).

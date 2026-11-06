# Changelog

What changed in each version of silinx-fpga, the Silinx toolchain. The newest version is first. Its versions
are its own (semver, 0.x until its API is stable), apart from Silinx ISE's.

## 0.3.0

In short:

- **nextpnr is the only engine:** it places and routes the Spartan-3E (nextpnr-himbaechel-spartan3e 1.0.0) and the
  Spartan-6. Silinx's Spartan-3E placer and router and its Spartan-6 router are removed: `placeRouteBest` and
  `io.placeRoute` leave the API, and the command line refuses `--engine`.
- The Silinx toolchain's timing report names a clock from a pin as the design does (clock clk), no longer by Yosys's
  pad net ($iopadmap$clk).
- The Spartan-6 bitstream writer writes a SLICEM's distributed RAM and shift register contents, byte-identical with
  ISE's bitgen.
- The Spartan-6 placer takes the SLICEM's distributed RAMs (RAM32X1S / D, RAM64X1S / D, RAM128X1S / D, RAM256X1S,
  RAM32M, RAM64M) and writes them and the shift registers (SRL16, SRL16E, SRLC16E, SRLC32E) as XDL as ISE writes them.

In detail:

- **The number of nextpnr's placements, for tests (#2828):** the flow's spec takes `placements`, the placements
  nextpnr's Place & Route makes (the fastest kept), in place of the Optimization's (Normal: four for a small design,
  High: eight); the IDE and the command line do not set it.
  - **Tests:** test/power.test.js.
- **Silinx's Spartan-6 router removed: nextpnr places and routes the Spartan-6 alone (#2824).** As the Spartan-3E's
  placer and router went (#2137), now that nextpnr's speed gap on the Spartan-6 (#2798, 13.5 % on the examples) is
  accepted for now: `fpga/s6/route.js` and `route-swap.js` (its LUT input swapping, #1152) are gone with
  `open-flow-s6.js`'s Place & Route, `test/s6-route.test.js` and `research/s6/compare-route.mjs` (with its record,
  `measured/route-compare.json`; the results stay in the research README and in git's history). `runFlow` on the
  Spartan-6 places and routes by nextpnr whatever `spec.engine` says (the application and the command line already
  did); Place & Route alone packs first, as before. The Spartan-6's placer stays: nextpnr's step places the pads, the
  global buffers, the block RAMs and the DSPs with it. The modules nextpnr's routing uses (`route-nets.js`,
  `route-output.js`, `route-check.js`) stay, tested on nextpnr's routing (test/s6-routing.test.js).
  - **Tests:** test/s6-routing.test.js, test/open-flow-backends.test.js, packages/silinx-fpga/test/nextpnr-s6.test.js.
- **The Spartan-6's tests and research that routed with Silinx's own router, on nextpnr (#2824).** The first step of
  the router's removal; no change for the toolchain's users. The routing modules nextpnr's Place & Route shares with
  the router (`route-nets.js`, `route-output.js`, `route-check.js`) are tested on designs nextpnr routed
  (test/s6-routing.test.js); the static timing's tests time a design nextpnr routed; `research/s6/flow-xdl6.mjs` and
  `place-xdl.mjs --route` route with nextpnr. A placement routed by nextpnr has its pads on pins whose I/O paths
  nextpnr's chip database has: the tests' designs are constrained to the Nexys3's switches and LEDs.
  - **Tests:** test/s6-routing.test.js, test/s6-timing.test.js, test/s6-timing-flow.test.js.
- **nextpnr's "Max frequency" is no warning on the Spartan-3E (#2820):** the nextpnr step (`open-flow-nextpnr.js`)
  leaves nextpnr's estimate of each clock out of its warnings, as the Spartan-6's step does; the timing step alone
  says whether a PERIOD is met. Test: test/nextpnr-fmax-warning.test.js.
- **The Spartan-3E's nextpnr engine: nextpnr-himbaechel-spartan3e 0.20.0, the single-threaded router's fix of #2800
  (#2811).** nextpnr-spartan's PR 11 (d5190e23), the only change since 0.19.0: in a build without threads (the
  WebAssembly build that ships), router2 routed each partition as in the threaded case but kept the search inside it, so
  an arc whose route leaves its partition was given up ("Failed to route arc"); it is now left to the whole-device pass,
  as the threaded build does. The Spartan-6 has had it since 0.1.3. No Spartan-3E example met it with 0.19.0 (the ten
  examples on the four devices, seeds 1 to 8, all routed), so the test guards against it coming back.
  - **Tests:** test/examples-nextpnr-s3e.test.js (new).
- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.1.3, every seed of the examples routed on the
  Nexys3 and the Atlys (#2800).** Some nets from an input pad fit inside one of nextpnr's router partitions, but their
  routes leave it. The single-threaded router (the WebAssembly build that ships) retried them only inside that
  partition and gave up ("Failed to route arc 0.0 of net 'u_knight.mode', from X27Y72/BIOB_IBUF0_PINW …": blinky on
  the Nexys3, seed 1; the net `db2.btn` of clock on the Atlys, seeds 2 and 3). The chip database had their path: the
  pad's IBUF, the ILOGIC route-through, then the interconnect. In 0.1.3 (nextpnr-spartan's PR 11), the router hands
  them to its whole-device pass, as the threaded build does.
  - **Tests:** test/examples-nextpnr-s6.test.js.
- **nextpnr-spartan v0.18.0 (#2797): no more slices than Silinx's engine.** The spartan3e micro-architecture made a LUT
  for each constant input; it now routes those that need no LUT as `tieConstants` does (a chain's carry in at 0, a pad's
  output, a flip-flop's D through BX / BY: the Y of the nearest slice that holds nothing, or the VCC site that reaches
  the pin), and reads `IS_CE_INVERTED` / `IS_R_INVERTED`… as the slice's CEINV / SRINV (its two flip-flops of one
  polarity). `nextpnrNetlist` turns an inverter on a flip-flop's, latch's or DDR register's control pin into that pin's
  inversion (`lowerControlInverters`, as `pack-prep.js`), the converter writes `CE_B` / `SR_B` (slices and IOBs), and
  `xdlSize` no longer counts a constant 0's source slice (`_NO_USER_LOGIC`) as occupied. `research/nextpnr-s3e/lib.mjs`'s
  simulator takes the inversions too. Test designs: `research/nextpnr-s3e/consts.v`. Tests: test/nextpnr-engine.test.js,
  test/nextpnr-s3e.test.js, test/nextpnr-hard.test.js.
- **A pad's clock named by its port in the timing report (#2793):** the report (fpga/timing-checks.js `timingReport`)
  named a clock by its net, which Yosys's I/O pad mapping calls `$iopadmap$<port>`, where its constraint's line and
  ISE's trce name the port; every line that names a clock (its period, its detours, the paths between clocks, its
  hold check) now says the port's name (`shownClock`), a clock made by logic its net's. The report's data keep the
  nets' names. Tests: test/fpga-timing.test.js, test/open-flow-core.test.js, test/fpga-clock-skew.test.js,
  test/fpga-ff-hold.test.js.
- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.1.2, its chip database from the current bit database
  (#2791).** The 0.1.1 chip database was built before #2539 measured the Atlys's USB-UART pins' switches. It left those
  PIPs out, so nothing drove `TIOB_O2_PINW` of the uart's `tx` (B16), and no seed routed ("Failed to route arc 0.0 …
  to X83Y0/TIOB_O2_PINW"). With 0.1.2, uart routes on the Nexys3 and the Atlys, on every seed, with no warnings.
  - **Tests:** test/examples-nextpnr-s6.test.js.
- **The Spartan-6's nextpnr engine: a seed it cannot route is skipped (#2788).** Of its three placements, a seed that
  nextpnr cannot route is logged on its `nextpnr, seed N:` line with nextpnr's reason, and the next ones are tried. Place
  & Route fails only when none routes, with "it stopped on an error" and nextpnr's ERROR lines, no longer "undefined"
  (nextpnr's WebAssembly exception has no message). Only the kept seed's warnings are logged. blinky on the Nexys3 and
  clock on the Atlys now build with the nextpnr engine.
  - **Tests:** packages/silinx-fpga/test/nextpnr-s6.test.js.
- **nextpnr-spartan v0.19.0 (#2770, #2768, #2766): the clocks on their dedicated paths.** nextpnr chooses the DCMs'
  sites together (the most clock outputs on buffers of their own, then the most CLKIN / CLKFB on dedicated paths from
  a pad or a buffer's line), a pad's buffer whose line reaches the DCM inputs it drives, a clock switch's buffer before
  a plain BUFG's, and routes the DCMs' and buffers' clock inputs from a pad or a DCM on their dedicated paths first. A
  DCM's CLKIN from a pad off its dedicated path is a warning naming the pads that reach it (Silinx's placer gave it).
  A LOC'd differential pair's two registers of one kind on different clocks: the DIFFM's on its second flip-flop;
  `fpga/nextpnr-iob.js` writes a register alone on IFF2 / OFF2 as ISE's map does (OMUX::OFF2, ICLK2, OTCLK2).
  HeAP's spreader sorts its cut stably, so the native and WebAssembly builds place alike; the README's blinky: seed 1,
  5.069 ns.
  - **Tests:** packages/silinx-fpga/test/nextpnr-iob.test.js (new), test/open-flow.test.js, test/clocking-flow.test.js,
    test/ise/open-flow.test.js, test/silinx-fpga-cli.test.js.
- **The open flow's research command line on the nextpnr engine (#2756).** `research/s3e-route/open-flow.mjs`, which
  `npm run check:open-flow`, the ISE tests and the design corpus's board designs run, builds through the flow's
  Translate, Map and Place & Route with the nextpnr engine (`runFlow`), as the application does, not through Silinx's
  own packer, placer and router; it writes no `placed.xdl`, and refuses the options of Silinx's placer and router
  (`--effort`, `--timing`, `--timing-route`, `--tries`, `--no-replicate`, `--replicate-opts`) by name. Its tests assert
  what ISE requires where nextpnr chooses the sites (a clock pad into its buffer or its DCM on the dedicated path),
  not the sites Silinx's placer chose. A DCM with five outputs on global buffers, which Silinx's placer refused, is
  built (the fifth through general routing); two IOB registers on different clocks in a LOC'd differential pair do not
  route yet (#2766), some clocks into DCMs and buffers take general routing where a dedicated path exists (#2770), and nextpnr does not say when a DCM's CLKIN comes from a pad through general routing (#2768).
  Checked with ISE (`test/ise/open-flow.test.js`, the new tool): every design DRC clean and byte-identical (CRC on and
  off) but the LOC'd pairs of #2766, and the five-output DCM and the Clocking Wizard's module on the XC3S100E too.
  - **Tests:** test/ise/open-flow.test.js (the LOC'd pairs todo, #2766), test/open-flow.test.js, test/blockram-flow.test.js, test/clocking-flow.test.js, test/fpga-place-route.test.js.
- **A Spartan-6 RAM32M with no DID (#2755):** the open synthesis's RAM32M of micro80's register bank has no DID, so
  the D LUT's DX and DI site pins had no net, and ISE's DRC gave 4 errors (PhysDesignRules:1422, 2100: a RAM's DI1 and
  DI2 must be connected); ISE's bitgen then refused the routed design. The physical stage now ties a RAM32M's or
  RAM64M's data input with no net low, as ISE's map ties the same netlist's (DX and DI on GLOBAL_LOGIC0)
  (`s6/phys-mem.js`). Tests: test/s6-xdl-mem.test.js.
- **Spartan-6 bitgen with two or more block RAMs (#2679):** `bramRewrites` named every design with more than one
  RAMB8BWER / RAMB16BWER as not measured, so the open flow wrote no bitstream (micro80's two RAMB16BWERs). Measured
  with ISE (`research/s6/gen-brams6.mjs`: two and three block RAMs of each type and mixed, in one tile, one column and
  row, two columns, two rows, on both parts; and the designs with every site of a type, up to 232 RAMB8BWERs): bitgen
  writes one frame again per column and row with a RAMB8BWER, in the frames' order, every RAMB8BWER tile's two bits
  cleared in it and the RAMB16BWERs' of that column and row too; none for RAMB16BWERs. `writeBit6` writes WCFG before
  the first frame written again only, as bitgen does. Byte-identical with ISE's bitgen: the XC6SLX16's designs, micro80
  on the Nexys3 and the Atlys. Tests: test/s6-bitgen.test.js, test/s6-bitstream.test.js.
- **The nextpnr engine leaves a block RAM's undriven data input unconnected (#2642).** A data bit Yosys leaves undriven
  (a 512 x 16 RAM on a RAMB16_S18, whose top data bit the word does not use) was tied to 0, and ISE's DRC warned of a
  dangling output pin (PhysDesignRules:812, DOA15 on feat_bramwiz_inf); it is now left out, as Silinx's packer does
  (the parity inputs stay at 0, all or none). On the open flow's 8 designs with block RAMs, ISE's DRC clean and
  Silinx's `.bit` byte-identical to ISE's (CRC on and off).
  - **Tests:** packages/silinx-fpga/test/nextpnr-hard.test.js (`hardInputs`: the undriven data bit free),
    packages/silinx-fpga/test/nextpnr-engine.test.js (feat_bramwiz_inf built through nextpnr with no warnings, its new
    fixture).
- **A Spartan-6 carry chain's CYINIT and DI<0> both signals (#2638):** an adder with a carry in (`a + b + c`, the
  light8080's ALU in micro80) needed the bypass input AX for both. The packer only warned ("CYINIT and DI<0> both need
  the bypass input AX"), and since #1153 the physical stage refused it ("its pin AX carries … and …"). The packer now
  does what ISE's map does on the same netlist: CYINIT keeps AX (`PRECYINIT::AX`), and DI<0> goes through A's O5 as a
  route-through of its net (`ACY0::O5`, A6 high), on the S LUT's own input pin when DI<0> is one of them
  (`s6/pack.js`, `s6/phys.js`, `s6/xdl.js`). The warning remains only when O5 is taken or the S LUT leaves no input.
  ISE accepts the result: the adder's placed XDL through `par -k` and its routed XDL through `drc`, with no error or
  warning; micro80 on the Nexys3 and the Atlys packs with no warning and `par -k` routes it completely. Its DRC errors
  left are the RAM32M's (#2639), and the open flow's bitgen refuses its two block RAMs (#2679), which
  test/examples.test.js now expects instead of the refusal at AX. Tests: test/s6-pack.test.js, test/s6-xdl.test.js, test/examples.test.js.
- **The Spartan-6 packer's LUT combining after the storage elements (#2636):** `packS6(nl, { combine: 'area' })`
  combined the LUTs before the storage elements that go with others of their control set were placed: it took the
  O5s their 5FFs' route-throughs needed and emptied slices whose FFs they then filled again, one slice more than
  without combining (#2279's isqrt top, on today's synthesis even with #2279's all-or-none move; no later pack change
  brought it back). It now combines once every storage element is placed, where moving a slice's LUTs can only save
  that slice, and packs once: #2635's second packing without combining is gone. The isqrt example packs in 28 slices
  with combining (29 before). Test: test/s6-pack.test.js.
- **nextpnr-spartan v0.16.0 (#2627, #2629): the global lines' reach.** A side buffer drives its line in its half of the
  chip only, and in each half a line comes from the top / bottom buffer or from the side buffer, never both (#95);
  nextpnr's placer now keeps every clock pin in reach of its buffer, and the buffers are placed at pack (the free top /
  bottom buffers in Silinx's order first). It had put a side buffer's flip-flops in the other half: router 1 stopped on
  its assert `valid_wires_for_net` (feat_clocks12, feat_side_clock) or did not route (feat_iob_lines). On 41 of the open
  flow's designs: ISE's DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on and off); the 42nd,
  feat_bramwiz_inf, has a DRC warning of its own (#2642).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (feat_side_clock built through nextpnr, its new
    fixture `side_clock`), test/silinx-fpga-package.test.js, test/toolchain-boundary.test.js and the third-party
    notices' check.
- **nextpnr-spartan v0.17.0 (#2626, #2628, #2656): the router's loop and two nets on a slice's SR.** A carry
  multiplexer's DI read from its own select's net, which the slice cannot route from its own LUT, is now a 0 (the same
  function: DI is read only while the select is 0; feat_bram); a block RAM with a 36-bit port no longer shares its tile
  with a multiplier, whose inputs take the RAM's upper data bits, as Silinx's placer keeps them apart (hard_prim): on
  both router 1 had looped. A slice's two memories with no write or shift enable share one constant on the SR they
  share, where each had had its own VCC net and routing stopped (feat_constmult). A DCM's clock input from a global
  buffer of the other edge, which no dedicated path joins and which ISE's DRC passes, is routed with no warning, as
  with Silinx's engine (feat_dcm2); the warning that stays names the pins out of reach. On 44 of the open flow's 45
  designs: ISE's DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on and off); the 45th, feat_bramwiz_inf,
  has a DRC warning of its own (#2642).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (feat_bram, hard_prim, feat_constmult and feat_dcm2
    built through nextpnr with no warnings, their new fixtures), test/silinx-fpga-package.test.js,
    test/toolchain-boundary.test.js and the third-party notices' check.
- **nextpnr-spartan v0.15.0 (#2625): the ports with no LOC on pads nextpnr chooses.** The nextpnr engine refused a port
  the constraints give no pad; nextpnr now puts it on a free bonded pad as Silinx's placer chooses them: an input-only
  pad for an input only, a bank whose VCCO its I/O standard needs, the clock inputs first on their dedicated paths (a
  DCM's CLKIN, a clock switch's two pads, a global buffer's), an I/O with registers out of a differential pair whose
  other IOB has registers of that kind on another clock (#749). On 13 of the open flow's designs with such ports: ISE's
  DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on and off).
  - **Tests:** test/open-toolchain.test.js (#31 and #4 on the Silinx engine, which they test); packages/silinx-fpga/test/nextpnr-engine.test.js (`nextpnrNetlist` with ports with no LOC; the gates
    example built with `--engine auto` and a pad left out: nextpnr, on a free bonded pad), test/silinx-fpga-package.test.js,
    test/toolchain-boundary.test.js and the third-party notices' check.
- **A RAMB16BWER's two RAM_MODE bits in the Spartan-6 bitstream (#2586):** `s6/bitgen.js` `bramRewrites` clears bit 0
  of word w and bit 15 of word w + 15 of minor 23 (the bits `RAM_MODE=SP` clears) only for a RAMB16BWER whose XDL has
  no `RAM_MODE`, as Silinx's own XDL, and for every such block RAM, not only the first. One with `RAM_MODE::TDP`, as
  ISE's map writes it, keeps them, as ISE's bitgen does. The 5 RAMB16BWER designs of #728 that ISE implemented
  (XC6SLX16 and XC6SLX45), 2 bytes off before, are byte-identical with ISE's `.bit`, and so are #728's other 9 and
  stopwatch's on the Nexys3 and the Atlys (`check-bitgen6.mjs`); the XC6SLX16's 23 XDL RAMB16BWER designs too (none
  before). The open flow's `.bit` is unchanged. Test: packages/silinx-fpga/test/s6-bitgen.test.js.
- **The nextpnr engine keeps every pad a bus port reads (#2567):** an input read only by a bus port's later bits (a
  multiplier's A1, a block RAM's ADDR3, not their bit 0) lost its pad, and the block's pin was left unconnected (ISE's DRC:
  PhysDesignRules:1078 and 1133). A multiplier's `B_INPUT` in the XDL is now the one nextpnr sets (`CASCADE` for a cascaded
  multiplier, #2566), `DIRECT` otherwise. When nextpnr stops on an error, the step now shows nextpnr's own ERROR lines,
  not "nextpnr failed: undefined".
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js, packages/silinx-fpga/test/nextpnr-hard.test.js.
- **nextpnr-spartan v0.14.0 (#2566): the multiplier cascade.** nextpnr now takes a `MULT18X18SIO` whose B comes from the
  multiplier below (`B_INPUT = CASCADE`, `BCOUT -> BCIN`), where it refused it. A chain's multipliers sit on consecutive
  sites of a block RAM column, from its lowest one up, and a LOC on a member is refused, as Silinx's packer does. On
  `feat_mult_chain` (three multipliers in a chain): ISE's DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on
  and off).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (the design built through nextpnr, its new fixture
    `mult_chain`), test/silinx-fpga-package.test.js, test/toolchain-boundary.test.js and the third-party notices' check.
- **A LUT RAM's and shift register's contents in the Spartan-6 bitstream (#2556):** `s6/bitgen-slice.js` `memEntries`
  turns a SLICEM LUT's `#RAM:O6=0x…` / `#RAM:O5=0x…` into its 64 entries by its RAMMODE: a RAM's (SPRAM64, DPRAM64,
  DPRAM32) as a LUT's, by the LUT map, a shift register's bit i at entries 2i and 2i + 1, a 16-bit one's in the upper
  half. Measured on the 21 designs of `research/s6/gen-mem6.mjs` that ISE implemented (`ana-mem6.mjs` now keeps the
  LUT entries ISE's `.bit` sets, `measured/mem.json`): their `.bit`, CRC on and off, are byte-identical with ISE's
  (`check-bitgen6.mjs`). A ROM's contents other than zeros, SPRAM32 and a 16-bit shift register's INIT past bit 15
  stay reported as not measured. Test: test/s6-check-slice.test.js.
- **UCF wildcards in linear time (#2551):** `ucfPattern` matches with two pointers instead of a backtracking RegExp, whose time
  on a name such as `a*a*a*…b` was exponential (Fixes #2319).
- **Unused code removed (#2545):** `allowedAt` of the hard-macro placement, never called; the READMEs of the device
  descriptions and of `research/s3e-device` in step with the repository.
- The Spartan-6 bit database: the two routing switches of the Atlys's USB-UART pins measured with ISE (a top inner I/O tile's output path, a BTERM's switch), so that a design on those pins has a bitstream (#2539).
- `boardAutoAssign`: the ports `rx` and `tx` take the board's serial port (its UART, RS-232 or USB-UART resources), whatever the board calls them (#2537).
- **The device measurements' grid and sites measured too (#2502).** Research only; no change for the toolchain's
  users. `research/s3e-device/build-measured.mjs` rebuilds the Spartan-3E dies' measured descriptions without ISE's
  device report (`grid.mjs`). The tiles are the ones the measurements name, and their types come from their names.
  Their rows and columns follow a rule checked against the report on the four dies. The sites are the ones ISE placed
  or routed to, their types, slots and order by rule, and the VCC sites are named by rule. On the four dies, the
  descriptions keep the same tiles, PIPs, wires, nodes and pins. They leave out only the sites no design can use: the
  unbonded pads, the reserved and configuration sites, and the corners' VCC sites (`compare-grid.mjs`, README section
  16).
  - **Tests:** test/s3e-device.test.js.
- **The bit database's layouts built from the measured tiles (#2502).** Research only; no change for the toolchain's
  users. `research/s3e-bitstream/gen-layout.mjs` takes the tile names and the break rows from the die's measured grid
  (`research/s3e-device/grid.mjs`), not from ISE's device report. Its parts are now functions (`frameGrid`,
  `typeTables`), and from the measured tiles and the committed chip maps they give the four committed layouts
  unchanged.
  - **Tests:** packages/silinx-fpga/test/s3e-bitstream-tools.test.js.
- **The bit database's routing tests on the measured descriptions (#2502).** Research only; no change for the
  toolchain's users. `research/s3e-bitstream/gen-pipcover.mjs` takes `measured`, the die's measured description, as
  the graph it routes its tests on, and its candidates are the measured PIPs; `measure-db.sh` passes it by default.
  The PIPs of the measured descriptions that only the bit database showed (258, 789, 788 and 829 per tile type on the
  four Spartan-3E dies) were asked of ISE's arc probe (`candidates.mjs types`), and all exist. Every PIP of the four
  descriptions is now shown by ISE, in a route or by the probe.
  - **Tests:** test/s3e-device.test.js, packages/silinx-fpga/test/s3e-bitstream-tools.test.js.
- **nextpnr-himbaechel-spartan3e 1.0.0 (#2438).** nextpnr-spartan's PR 12 (2a07796a), the only change since 0.20.0:
  the package's interface frozen under semantic versioning (its README's "The interface" and "Stability"): the module's
  exports, documented in `lib/api.d.ts`; the chip databases' files and the release's assets; the arguments Silinx
  passes to nextpnr, the netlist's attributes, the routed design's and the log's form. Placement and routing are
  0.20.0's. The package now ships its README and CHANGELOG.md.
  - **Tests:** test/nextpnr-s3e-interface.test.js (new): the pinned version a 1.x, the exports Silinx imports declared,
    the chip databases' files and the release's URL, every argument open-flow-nextpnr.js passes among the frozen ones;
    test/examples-nextpnr-s3e.test.js: the examples route on every seed with no warnings on 1.0.0.
- **The Spartan-6 records of blinky, pong, stopwatch and clock measured again (#2321):** the examples' counters
  narrowed and the stopwatch's lap memory made a whole block RAM, so ISE builds them on the Nexys3 and the Atlys with
  no warning; ISE's map and par of the open synthesis's new netlists (night 1's `edif` step, both boards) and the
  packer's, placer's and router's measures of them in research/s6/measured/night1.json, place-compare.json and
  route-compare.json (the other examples' entries as they were).
- **A one-bit bus's UCF name in linear time (#2318).** `portAssignments` found the bus x of a NET name x<0> (x(0), x[0])
  with a RegExp that took quadratic time on a name with a long run of spaces (CodeQL's js/polynomial-redos); `oneBitBase`
  finds it from the bit's end, in linear time, with the same result on every name. Tests: test/ucf.test.js.
- **The Spartan-6 packer: a carry's DI the same net as its S (#2291):** when S is a LUT's output, its DI takes the
  bypass input (AX … DX), as phys.js routes it, and the packer now reserves that input, so no flip-flop of the
  position takes it for its D (the physical design stopped at "its pin AX carries … and …" on a small design). Test:
  test/s6-pack.test.js.
- **The Spartan-6 packer's LUT combining: all of a slice's LUTs or none (#2279):** `packS6(nl, { combine: 'area' })`
  moves a SLICEX's LUTs into other SLICEX positions' O5 only when every one of them finds a place, emptying the
  slice; moved one by one from slices they did not empty, they saved no slice and took the O5s the 5FFs' route-throughs
  need, and the first version of the isqrt example packed in 29 slices with combining against 28 without. When the
  storage elements placed after the combining still need the O5s it took (they then fill the slice it emptied), the
  packing without combining is returned: `'area'` never takes more slices than `'off'`. Test:
  test/s6-pack.test.js.
- **The parts of Silinx's placer and router that other modules use, in modules of their own (#2137):** the first step
  of removing the Spartan-3E's own placer and router, moved as they are, with no change in behaviour. The device's
  sites and its I/O banks' voltages (`deviceSites`, `bankOfPad`, `vccoOfStandard`) go to `fpga/device-sites.js`; the
  placers' error, seeded random numbers and crossing correction (`PlaceError`, `rng`, `crossing`, which the
  Spartan-6's placer uses too) to `fpga/place-common.js`; a routed design's check (`checkRouting`, `netEndpoints`, which
  the nextpnr flow and the Spartan-6 use) to `fpga/route-check.js`. `fpga/place.js` and `fpga/route.js` still export
  them. Test: test/engine-shared-parts.test.js.
- **A back end places and routes another netlist (#2137).** The Spartan-3E's and the Spartan-6's back ends give
  `placeRouteNetlist(text, top)`: their Map and Place & Route (nextpnr) on a netlist other than the run's, on a report and
  a log of their own, nothing written; it resolves the routed design. `runFlow` hands it to the simulation models
  (`io.simModels`), which no longer use `placeRouteBest`.
  - **Tests:** test/sim-model-par.test.js.
- **nextpnr, the flow's engine (#2137).** `engineOf` gives `nextpnr` whatever the project saved. `runFlow` with
  `engine: 'auto'` no longer falls back to Silinx's engine (`auto` is gone): `engine: 'nextpnr'` runs nextpnr, on the
  Spartan-3E and the Spartan-6, and Silinx's own engine is left only without it, until its removal. A chip database that
  cannot be loaded fails Place & Route with "nextpnr's chip database of <part> could not be downloaded (…)" (`loadChipdb`,
  `CHIPDB_HINT` in `nextpnr-io.js`). The nextpnr steps' hints no longer name the Silinx engine. The command line's
  `--engine` is `nextpnr` (the default) or `silinx`.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js, test/silinx-fpga-cli.test.js.
- **Silinx's Spartan-3E placer and router removed (#2137).** `placeRouteBest` and `io.placeRoute` leave the API:
  `runFlow` places and routes the Spartan-3E with nextpnr (`io.nextpnr`, the one engine), whatever `spec.engine` says.
  `fpga/place.js`, `place-*.js`, `place-route.js`, `route.js`, `route-*.js`, `replicate.js` and `open-flow-s3e.js` are
  gone; `deviceSites`, `bankOfPad` and `vccoOfStandard` are in `fpga/device-sites.js`, `PlaceError`, `rng` and `crossing`
  in `fpga/place-common.js`, `checkRouting` and `netEndpoints` in `fpga/route-check.js` (the API's `checkRouting` from
  there), `clockReach`, `bufgReach` and `DCM_PAD` in `fpga/clock-reach.js`. `runFlow` no longer gives the back ends
  `knownPips`, `parTries` or `parExtra`. The command line refuses `--engine` and `--no-replicate` by name.
  - **Tests:** packages/silinx-fpga/test/silinx-fpga-api.test.js, test/silinx-fpga-cli.test.js,
    packages/silinx-fpga/test/engine-shared-parts.test.js.
- **The HCLK feedthrough PIPs of the block RAM and DSP columns, both halves of a clock row (#1957):** 126 PIPs of
  BRAM_HCLK_FEEDTHRU, DSP_INT_HCLK_FEEDTHRU, their _FOLD types and the XC6SLX45's folded HCLK_CLB tiles, probed with
  ISE (`research/s6/gen-cmtprobe6.mjs --types`, `ana-cmtprobe6.mjs --add`) into `bitdb/s6/s6-pips-probe.json`: GCLK n
  sets minor n, bit 14 (lower half) or 15 (upper) of the tile's region. #728's block RAM and DSP designs leave no bit
  over (13 on the XC6SLX45 before), and 9 of 14 of their bitstreams are byte-identical with ISE's (5 before). Test:
  test/s6-cmtsites.test.js.
- **The SLICEM's distributed RAMs and shift registers placed and written as XDL (#1153):** `s6/phys-mem.js` gives each
  RAM's and shift register's pins the SLICEM's site pins as ISE's map does (the read address on each position's
  inputs, the write address the D LUT's, a 32-bit RAM in the 64-bit mode with A1 low, the 7th and 8th address bits on
  CX / AX and BX, the data on DX, AX … or AI …, the write enable on CE, a shift register's cascade out on DMUX from
  position A), and `s6/xdl-mem.js` writes their settings (`#RAM:O6=0x…` from the INIT, the RAMMODEs, the DI1
  multiplexers, WA7USED / WA8USED, WEMUX::CE). The packer puts a two-LUT cell in a pair of positions (D and C, B and A),
  a shift register's cascade out in position A, and no storage element beside RAMs. Measured on 21 designs of one
  primitive each implemented by ISE (`research/s6/gen-mem6.mjs`, `ana-mem6.mjs`, `measured/mem.json`): the Silinx
  toolchain writes the same settings and pins (test/s6-xdl-mem.test.js); ISE reads its placement and its routing of
  them, routes the placement completely (`par -k`) and its DRC finds no error. The contents other than zeros in the
  bitstream: #2556.
- **The Spartan-6 router swaps a LUT's inputs (#1152):** `routeS6(design, device, { swapLutPins })` (default on, as the
  Spartan-3E router's): a net may end on any pin of its LUT position (A1 … A6) no other net takes, the one its path
  reaches best (`s6/route-swap.js`: not a RAM or shift register, not A6 under an O5, not the pins of clocks, power or
  unrouted nets); `routedXdlS6` rewrites the position's O6 and O5 equations for the pins taken. The examples take 10
  to 14 % fewer PIPs (1.00 to 1.08 times ISE's per connection, 1.10 to 1.22 before; `research/s6/compare-route.mjs
  --silinx`, `measured/route-compare.json`), every LUT the same function of its nets. Test: test/s6-route.test.js.

## 0.2.0

In short:

- **The nextpnr engine takes every cell Silinx's own engine takes:** flip-flops on the falling edge (`FD*_1`), latches
  (`LD`, `LDE`, `LDCE`, `LDPE` and their `_1`), clock switches (`BUFGMUX`, `BUFGMUX_1`) and `BUF`; a design with them
  no longer falls back to Silinx's engine under `--engine auto`.
- The iCE40: a design goes from HDL to its bitstream with Yosys's `synth_ice40`, nextpnr-ice40 and icepack, with its pins in a PCF.
- **Faster designs through nextpnr:** the examples placed and routed by nextpnr run about 1.4 % faster on average
  (4.2 % short of the Silinx engine's speed, from 5.8 %), at the same size, and place and route about 30 % sooner.

In detail:

- The iCE40's back end: a port that is a vector of one bit takes its PCF's `set_io` and `set_frequency` named either `btn[0]` (as a board's constraints write it) or `btn`, nextpnr-ice40's name; before, `btn[0]` was an unmatched constraint and the port was placed anywhere (#2518).
- `spec.synthGoal` of `runFlow`: 'fast' (the usual mapping alone, `FAST_SYNTH`; one placement, no register replication), 'area' (`synthesizeArea`: the smaller of the usual mapping's netlist and Speed's; one placement) or 'speed'; `synthGoal(impl)` and `GOAL_IMPL` between it and ISE's Optimization Goal and Effort (#2470).
- `boardConstraintsText`: a board's constraints, made from its pin table, in the format of its device's family: UCF, or PCF on the iCE40 (#2468).
- `openOnlyDevice(device)`: is the device's family one only the open toolchain implements; `PCF` among the light exports (`./parts`); `orderSteps` takes Map on a list without it (nextpnr's) as its Place & Route; the iCE40's resources (`resourcesOf`: its LUTs, flip-flops, global buffers, EBRs and SB_MAC16s) (#2463).
- **The nextpnr engine: falling-edge flip-flops, latches, clock switches (#2457):** the dependency
  `@silinx/nextpnr-himbaechel-spartan3e` has them since nextpnr-spartan v0.13.0: a flip-flop or latch takes the slice's
  CLKINV as Silinx's packer writes it (a latch with an active-high gate: CLK_B), a slice's two share it and the latch
  mode, a latch stays out of the IOBs; a clock switch keeps its I1 and S, and the two buffers of a pair go together only
  when their shared input lines carry one clock (#846).
  - **src/open-flow-nextpnr.js** (Map): NEXTPNR_CELL takes them; `lowerClockSwitches` leaves the switches as Silinx's
    packer does (an input from a BUFG that BUFG's input, a constant select a BUFG); a BUF is a LUT1; a clock's PERIOD
    reaches a switch's output. **src/fpga/nextpnr-xdl.js** writes `#LATCH`, `CLKINV::CLK_B`, a latch's `ASYNC`, and a
    switch's `I1_USED`, `SINV::S` and `DISABLE_ATTR` (its select not tied to VCC).
  - **research/nextpnr-s3e/edges.v through nextpnr (Basys2-250):** ISE's xdl2ncd with no warnings, its DRC with no
    errors or warnings, the .bit byte-identical to ISE's bitgen, CRC on and off; the XDL simulates equal to the netlist.
  - **Tests:** test/nextpnr-engine.test.js (every cell of Silinx's packer taken; the switches' lowering; the design
    built: no warnings, each setting, the simulation catching a wrong latch, clock edge or select);
    test/fpga-sim.js simulates a BUFGMUX's select.
- The first family that is not Xilinx's, on the back ends of #2360: `open-flow-ice40.js` (its steps: synth, translate, par, bitgen), `pcf.js` (the PCF as a format of the constraints' model), `io.nextpnr.ice40` (`ice40Io`, `nextpnrIce40Node`) from YoWASP's `@yowasp/nextpnr-ice40`, an optional peer dependency; `isIseFamily`, `orderSteps` among the light exports (#2295).
- **nextpnr-spartan v0.12.0 (#2196):** the carry chain's delays in nextpnr's chip database are Silinx's slice arcs after
  #2286 (per side of the slice, the XB output's own); router 1 routes the critical connections first, the short ones
  inside a CLB too, and its estimate of a route left is the least a route takes, so the critical connections get the
  CLB's direct connections to the LUT pins. On the examples (28 builds, 8 placements each, Silinx's analysis): periods
  0.9 % shorter at best and 1.4 % on average, the slices unchanged; ISE's DRC clean and Silinx's `.bit` byte-identical to
  ISE's (CRC on and off) on all 28. The gap left is accepted (#2135): nextpnr stays the only engine.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js, test/silinx-fpga-package.test.js,
    test/toolchain-boundary.test.js and the third-party notices' check; test/silinx-fpga-cli.test.js: the README's
    blinky's best placement recorded anew (seed 1, 5.069 ns, was seed 2, 5.040 ns).

## 0.1.7

The first version published by npm's trusted publishing (#2428): 0.1.5 and 0.1.6 were tagged but not published.

In detail:

- **The nextpnr packages pinned at spartan3e 0.11.3 and spartan6 0.1.1 (#2441):** both declare the Node versions they
  run on, 22 and later (#2351); their engines are unchanged.
  - **Tests:** test/silinx-fpga-package.test.js, test/toolchain-boundary.test.js and the third-party notices' check,
    unchanged.

## 0.1.6

Tagged but not published: its release CI failed (a UI part's time limit, #2462; a test on Windows, #2465).

In short:

- **RAM64X1S with nextpnr:** a design with a RAM64X1S now builds with the nextpnr engine, instead of falling back to Silinx's.

In detail:

- **The Spartan-6's bit databases from any reader (#2103):** `src/fpga/s6/bitdb.js` makes the object `predictDesign`
  reads from the files' contents: `bitDbS6(read, part)`, which `loadBitDbS6` (node:fs) now uses, and `fetchBitDbS6(part,
  fetchJson)` for the browser, which fetches the part's files only (`s6DbNames(part)`), each once. Both are exported by
  the package's main module.
  - **Tests:** test/s6-bitdb-browser.test.js.
- **RAM64X1S in the nextpnr engine (#2218):** `nextpnrNetlist` lowers it to two RAM32X1S and the LUTs of their write enables and read multiplexer (`lowerRam64`), as `pack-prep.js` does.
  - **Tests:** test/nextpnr-engine.test.js (the lowering, its edge cases, a build with no warnings, the routed XDL simulated against the RAM64X1S).

## 0.1.5

In short:

- **nextpnr by default:** `silinx-fpga build` places and routes with nextpnr when it can implement the design, else with
  Silinx's own engine (`--engine auto`, now the default); `--engine silinx` keeps Silinx's engine.

In detail:

- **Published by npm's trusted publishing (#2428):** the release workflow authenticates by GitHub's OIDC token, with no
  stored token (npm 11.21.0, pinned, publishes it); its provenance as before.
- **The steps by family (#2387):** a back end lists its steps (`steps: [{ id, label, needs }]`) and its mount gives their
  functions (`{ steps: { id: run() } }`, in place of `runMap`, `runPar`, `runTiming`, `runPins`, `runPower`, `bitfile` and
  `runFpgaView`); `runFlow` runs the steps asked in the list's order, the synthesis and the simulation models its own, and
  names no other step. The Xilinx families keep ISE's steps, names and labels (`XILINX_STEPS`), so the IDE's processes do not
  change; `orderSteps(list, asked)` gives a run's steps from any list. A fake family runs `synth, pnr, timing, bitstream` in
  the tests; the Spartan-3E and Spartan-6 give the same output.
- **The synthesis by family (#2386):** the back end gives its synthesis and the names of its report's lines (`synth`,
  `synthName(id, resource)`, replacing `xstNames`): the Xilinx families' `synthesizeVerilog` (`synth_xilinx` and Silinx's
  mappings), another family's Yosys script through `scriptSynthesis({ script, files, utilization, quiet })` (`synth-script.js`),
  and Yosys's generic `synth` for a registered family that gives none. `runFlow` names no synthesis. `FAMILY_INFO` needs only a
  family's name (`xise`, `pm` optional). The Spartan-3E and Spartan-6 give the same netlists and reports; a fake family is
  synthesized with its own script into Yosys's generic cells in the tests.
- **One model of the constraints (#2385):** `constraints.js`: the pins, the clocks and what is not portable (as the format's
  own text), read by the format a back end says (`constraints: { id, read, write }`, UCF when it says none). `runFlow` and the
  steps no longer read UCF: a back end receives `ctx.constraints()`, the model or null, in place of `ctx.ucfText`. The
  Spartan-3E and Spartan-6 give the same output; a fake family reads a format of its own in the tests.
- **The routed design is the back end's (#2384):** `runFlow` no longer reads or names `open/routed.xdl`; a back end keeps its
  routed design in its own format and file, and its timing, bitstream, power and FPGA view read it again from an earlier run
  (`runFpgaView`, `routedOrEarlier` and `routedText` for the simulation models). The Spartan-3E and Spartan-6 give the same
  output; a fake family routes to a format of its own in the tests. A registered back end no longer receives `setRouted`,
  `routedText` or `routedOrEarlier` in its context.
- **The nextpnr engine's Design Summary: every resource (#2361):** its map report lists the RAMB16s, the MULT18X18SIOs and
  the DCMs too, used or not, in the MAP report's order, as the Silinx engine's (#795); it had the flip-flops, LUTs,
  slices, IOBs and BUFGMUXs only.
  - **Tests:** test/open-toolchain.test.js (blinky's report through the default engine, every resource).
- **The engine `auto` by default (#2136):** the command line's `--engine` defaults to `auto`, and `engineOf(impl)` reads a
  project with no engine as `auto` (it was `silinx`). The flow's `spec.engine` itself is unchanged: not set, the Silinx engine.
  `auto` loads nextpnr's chip database at Map; when it cannot (offline, a database not downloaded yet, #2329), the Silinx
  engine places and routes, with `WARNING:Map - the nextpnr engine could not start (…)`; `nextpnr` still fails there.
  - **Tests:** test/nextpnr-engine.test.js (`engineOf`, nextpnr not starting) and test/silinx-fpga-cli.test.js.
- **Spartan-6: the clock pads' BUFIO2s (#2025):** the routes from the clock pads U10, T9 and R8 into their BUFIO2s
  and on to a DCM or PLL, measured one PIP at a time with their far bits (30 PIPs, 6 with bits: the I/O words and
  the CMT column; `bitdb/s6/xc6slx16-pips-cmt.json`, `s6-pips-flow.json`). Each BUFIO2 also sets one I/O word bit of
  its own, whatever the CMT it drives. The CMTs' input table had it only in its (CMT site, BUFIO2) entries;
  `research/s6/ana-cmtinput6.mjs` now takes it apart (`bufio2` of `bitdb/s6/<device>-cmt-input.json`), and
  `cmtInputBits` (`src/fpga/s6/bitgen-cmt.js`) adds it. On the XC6SLX16's 203 CMT and example designs, all are bit for
  bit (196 before); the XC6SLX45's 184 stay exact.
  - **Tests:** test/s6-cmtpaths.test.js.
- **Spartan-6: #727's whole CMT paths retired (#2025):** a DCM at DCM_X0Y1 or a PLL at PLL_ADV_X0Y0 with #727's base
  settings was predicted from its base design's bits whole (`bitdb/s6/xc6slx16-cmt-paths.json`), which set its base's
  other BUFGMUX's REGC bit and outputs' bits in a design to other BUFGMUXes (44 bits ISE does not set). It is now
  predicted by the rules every other site has: its settings, its BUFGMUXes' REGC bits, the input table and its paths'
  PIPs. The database, `research/s6/ana-cmt6.mjs`, `cmtPath` and `predictCmt` (`src/fpga/s6/bitgen-cmt.js`) and
  `loadBitDbS6`'s `cmt` are gone. On the XC6SLX16's 203 CMT and example designs, all are bit for bit (199 before).
  - **Tests:** test/s6-cmtpaths.test.js, test/s6-clock.test.js, packages/silinx-fpga/test/s6-bitgen.test.js.

## 0.1.4

The first version on npm: 0.1.3 was tagged, but its CI failed on a UI test of Silinx ISE, fixed since (#2395).

In detail:

- **0.1.3 published (#1681):** the package is 0.1.3's, unchanged; 0.1.3 was not published, its tag's CI having failed on
  Silinx ISE's Preferred Language UI test (#2395).

## 0.1.3

0.1.2 was tagged and tested, but npm refused it with no repository in its package.json
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

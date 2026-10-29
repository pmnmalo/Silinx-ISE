# Spartan-3E bitstream: feasibility test (2026-10-10)

The first experiments towards an open toolchain for the Digilent Basys2 (Xilinx Spartan-3E
XC3S250E-4CP132), following the method in [docs/OPEN-TOOLCHAIN.md](../../docs/OPEN-TOOLCHAIN.md):
small test designs written in XDL, turned into bitstreams by ISE's command-line tools, and compared.

Tools: Xilinx ISE 14.7 (`xdl` P.20131013, `bitgen`), in a private Docker image (`xilinx/ise:14.7`,
linux/amd64, run under emulation on Apple Silicon: about 50 s per design); GHDL 7.0.0-dev and
Yosys 0.66 (`hdlc/ghdl:yosys` image); Node 22+.

## Files

| File | What it does |
|---|---|
| `bits.mjs` | Reads a `.bit`: header, configuration packets, the frame data written to FDRI; compares two bitstreams bit by bit |
| `run.sh` | Inside the ISE container: `xdl -xdl2ncd` + `bitgen -d -g CRC:Disable` for every `.xdl` of a folder, 4 at a time |
| `gen-lut.mjs`, `analyze-lut.mjs` | Step 2: LUT F / G memory bits of one slice (all-0, all-1 and 4 binary-coded designs per LUT) |
| `gen-sites.mjs`, `analyze-sites.mjs` | Step 2b: LUT F of several slices, one block of designs per slice |
| `top.v`, `top.ucf` | Step 4: the reference design, switch SW0 (pin P11) -> LED LD0 (pin M5) |
| `gen-e4.mjs`, `gen-e5.mjs`, `compose3.mjs` | Steps 3-4: the reference design taken apart (empty, pads, the net's pin connections, each routing switch in context), then rebuilt from those parts and compared with ISE's bitstream |

The scripts work on one part, `PART` in the environment (default `xc3s250ecp132-4`): its device
description (`packages/silinx-fpga/devices/`, or `~/.silinx/devices/`) gives the graph (`xdlrc-graph.mjs`
`loadGraph(part)`: the device reports of the larger chips are too large to read as one string) and
`db.mjs` its database.

Inputs the scripts expect (not in the repository: they come from your own ISE installation):
`device.xdlrc` (or `XDLRC=…`) from `xdl -report xc3s250ecp132-4 device.xdlrc`, and in `ref/` the
reference design implemented by ISE (`top.xdl`, `top.bit`, from `top.v` / `top.ucf`).

| More files | |
|---|---|
| `lib.mjs` | Shared helpers (LUT equation from its 16 bits) |
| `gen-map.mjs`, `decode-map.mjs` | Stage A: one design with every slice numbered in its LUT F (one per 4000 slices), and an empty design; the frame of every slice column, the bit of every slice row, the bitstream format |
| `gen-slice.mjs`, `analyze-slice.mjs` | Stage B: the settings inside a slice (flip-flops, inverters, multiplexers, carry), one design per setting |
| `gen-harness.mjs`, `gen-hvar.mjs` | Stage B2: the slice under test with all its pins connected, routed once by ISE; one variant per setting |
| `packages/silinx-fpga/bitdb/xc3s250e-slice.json` | Result of stages B and C: the bits of each slice setting, per slice position (any slice; a table generated from `packages/silinx-fpga/bitdb/s3e-tiles.json`) |
| `compare-sim.mjs` | Does the netlist of open synthesis behave like the design? Simulates both with Silinx |
| `packages/silinx-fpga/bitdb/<device>-lut.json` | Result of stage A (stage F for the XC3S100E, XC3S500E, XC3S1200E): where every LUT of the chip is in the bitstream |
| `xdlrc-graph.mjs`, `router.mjs` | The device's routing graph from `xdl -report -pips -all_conns` (cached), and a small router for test designs |
| `run-many.sh` | Inside the ISE container: `xdl -xdl2ncd -force` + `bitgen` for every `.xdl` of several folders, 3 at a time (`-c`: also with CRC) |
| `gen-pipdrop.mjs`, `gen-pipcover.mjs`, `gen-clock.mjs`, `ana-pipdrop.mjs`, `pips-to-db.mjs` | Stage C: routing switches in batches (variants remove PIPs by codewords); a design routed by ISE, designs routed by `router.mjs`, the global clock tree |
| `gen-iob.mjs`, `ana-pads.mjs`, `ana-iob.mjs`, `ana-io2.mjs` | Stage C: the I/O pads (direction, I/O standard, drive, slew, pull) |
| `gen-attrdrop.mjs`, `ana-attrdrop.mjs`, `gen-slicedb.mjs`, `gen-slicetable.mjs` | Stage C: slice settings in every slice position |
| `ana-residual.mjs`, `explain-diff.mjs` | What the database does not explain in designs implemented by ISE, per tile and feature |
| `measure-db.sh`, `want-pips.mjs`, `diff-db.mjs` | #48: the XC3S250E's experiments made again with ISE (the PIPs to measure: those of the database; resumable, also from the remote work folders), and the rebuilt database compared with the committed one (`--resolved`: as bitgen reads it; `--missing`: what the experiments do not reach) |
| `gen-layout.mjs`, `merge-db.mjs`, `build-db.sh`, `db.mjs` | Build the database (`packages/silinx-fpga/bitdb/*.json`) from the experiments' results; `db.mjs` gives the experiments the one loader, `packages/silinx-fpga/src/fpga/bitdb-node.js` (the open flow's and the interface's, #407: `loadDb(part)`); the pads of the package (pin -> I/O tile) are not in it: it takes them from the device description (`padsFromDevice`) |
| `measured/` | Results of the analyses that `build-db.sh` merges (slice harnesses, learned and corrected features: our own observations, no Xilinx files) |
| `learn-single.mjs`, `unify-io.mjs` | Features measured in the reference designs; shared switch boxes of the I/O tile types |
| `check-writer.mjs` | Acceptance test of the writer (`packages/silinx-fpga/src/fpga/bitgen.js`): byte comparison with ISE's bitgen |
| `fuzz-remote.sh` | Stage D: `run-many.sh` on another machine with Docker and the ISE image (`SILINX_FUZZ_HOST=user@host`, set on the command line only) |
| `share-sb.mjs`, `gen-branch.mjs`, `ana-perpad.mjs`, `ise-impl.sh` | Stage D: the CLB switch box shared by the I/O, block-RAM and DCM tiles; PIPs measured as dead-end branches of routed nets; I/O settings per pad (`gen-iob.mjs --perpad / --perstd`); designs implemented by ISE from HDL (reference designs) |
| `gen-bram.mjs`, `ana-bram.mjs`, `packages/silinx-fpga/bitdb/<device>-bram.json` | Stage D: every memory bit of the block RAMs, by binary codes |
| `gen-sitevar.mjs`, `ana-sitevar.mjs`, `sitevar-features.mjs`, `bram-features.mjs` | Stage D: the settings of block RAMs, multipliers and DCMs, changed one at a time in designs implemented by ISE |
| `packages/silinx-fpga/bitdb/<device>-layout.json`, `packages/silinx-fpga/bitdb/s3e-tiles.json`, `packages/silinx-fpga/bitdb/<device>-<package>-pads.json` | Result of stages C-F: where every tile is in the frame data and the bitstream format, per device; the bits of every measured feature (PIPs, site settings) per tile type, shared by the devices (`packages/silinx-fpga/bitdb/<device>-tiles.json`, if present, adds or replaces features of one device); the pads' own bits per device and package |
| `gen-dcmvcc.mjs` | #190: the DCM tiles' switches from their VCC site, one constant-1 net per DCM tile (then `gen-pipdrop.mjs`) |
| `gen-iobreg.mjs`, `gen-iobrand.mjs`, `ana-iobreg.mjs` | Stage G: designs with registers in the IOBs of every pad (implemented by ISE), their settings and input delays at random (xdl variants), the bits of each pad's settings solved |
| `gen-dcmhdl.mjs`, `gen-sidebufg.mjs` | Stage G: designs of several DCMs with settings of their own, and of subsets of the side global buffers, implemented by ISE from HDL (settings xdl refuses in an edited design; inputs in combination); `gen-sitevar.mjs` variants with other values on each instance (`perSite`) |
| `measure-671.sh` (`gen-iobreg.mjs --bufg`), `pad-clock-rows.mjs`, `pad-owners.mjs` | #671: the I/O registers' clocks from every global line: rd / rd2 with their clock buffer on each top / bottom BUFGMUX in turn, implemented by ISE and measured by PIP drop; the clock rows' bits out of the pads' features, each bit of R:ICLK2INV:#OFF to its pad |
| `gen-padbits.mjs`, `ana-padbits.mjs`, `gen-padalone.mjs`, `ana-padalone.mjs`, `measured/fix-897-owners.json` | #897: which pad a register bit belongs to: one design ISE routed with each setting of some pads (or each PIP of their tiles) removed in turn, ISE's bitgen on each; then an IDDR2 on one pad alone (ISE from HDL), against Silinx's writer; the bits a neighbour held moved to their pad (`pad-owners.mjs`) |
| `gen-pairdly.mjs`, `gen-paddly.mjs`, `gen-padrand.mjs`, `ana-pairdly.mjs`, `ana-paddly.mjs`, `pad-delays.mjs` | #751: the pads' input delays with each pad used on its own: designs written by the open flow, every pad's kind (unused, output, input register, direct input) and delay varied apart from its neighbours'; each delay bit to the one pad it follows; ISE's bitgen against Silinx's writer on held-out designs |
| `measure-846.sh` (`gen-sidebufg.mjs bufgmux1-846.json`) | #846: a BUFGMUX_1's DISABLE_ATTR HIGH on each of the 24 global buffers: BUFGMUX_1 designs implemented by ISE, the setting set back to LOW on one buffer at a time (`gen-sitevar.mjs`, `ana-sitevar.mjs`) |
| `dcm-pads.mjs`, `gen-dcmpad.mjs`, `measure-92.sh` | #92: every pad's dedicated path to a DCM's CLKIN and the switches on it the database lacks; designs whose DCMs take CLKIN from each of their clock pads in turn, implemented by ISE and measured by PIP drop |
| `gen-dcmomux.mjs`, `measure-dcmomux.sh` | #2: the DCMs' output multiplexer (`DCM_<output> -> OMUXk`); designs with every output of every DCM through each line, its BUFG LOC'd on the line's buffer, implemented by ISE and measured by PIP drop (`--list`: the pairs and the unknown ones) |
| `gen-bramclk.mjs`, `gen-clkpad.mjs`, `measure-bramclk.sh` | #2: the block RAMs' and multipliers' clock pins from every global line (`GCLKk -> BRAM_CLKj`) and the global clock pads' dedicated paths to the top and bottom buffers (`CKIk -> GCLKj`); designs implemented by ISE, measured by PIP drop (`--list`: the pairs and the unknown ones) |
| `gen-clkdata.mjs`, `measure-clkdata.sh` | #957: a clock into the fabric (`DCM_<output> -> OMUXk`, `CLK[TB]_GCLK_MAINk -> CLK[TB]_TO_OMUXj`): the unknown switches added as branches to designs ISE routed, measured by PIP drop |
| `pip-exceptions.mjs` | The PIPs a tile type's features offer that some or all of its tiles do not have (#74), from the device descriptions, checked with ISE's arc probe: `absent` / `absentIn` in `packages/silinx-fpga/bitdb/s3e-tiles.json` and `packages/silinx-fpga/bitdb/<device>-tiles.json`, honoured by the router |
| `impl-remote.sh`, `who-sets.mjs`, `gen-sitedrop.mjs`, `ana-sitedrop.mjs`, `gen-iorand.mjs`, `clkh-ll.mjs`, `ll-splitters.mjs`, `dcm-mirror.mjs` | Stage F: `ise-impl.sh` on the remote machine for any part (`PART`); which feature of the database sets a bit; the settings of I/O, DCM and clock-buffer sites removed one at a time from a design routed by ISE; every pad at random settings; the XC3S1200E's long-line splitters (CLKH_LL's; the others', #709); the other DCMs' settings as mirror images of the top-left one's |

## Results

### Bitstream structure (XC3S250E)

Sync word `AA995566`, then Type 1 / Type 2 packets as documented in UG332: FLR = 72 (frames of
73 words = 2336 bits), IDCODE `01C1A093`, one FDRI Type 2 packet with all 578 frames (42 194
words). With `-g CRC:Disable` the checksum is the constant `DEFC`.

### Step 1: open synthesis

lab11 (VHDL: 5 entities) synthesized with GHDL + Yosys (`synth_xilinx -family xc3se -ise
-flatten`, then `delete t:$scopeinfo` before `write_edif`) and implemented by ISE's
ngdbuild / map / par / bitgen: complete, all signals routed. The netlist is larger than
XST's: 886 LUTs and 522 slices against 309 and 180 (59 flip-flops against 71).

The netlist behaves like the design (`compare-sim.mjs`: Yosys's Verilog netlist with Silinx's
UNISIM cell models against the VHDL, both simulated by Silinx, registers starting at 0 as on the
FPGA): lab11's test bench `test01` gives identical signals over the whole run, and random
stimulus gives identical outputs at every one of 3 x 50 000 clock cycles. (Without the power-up
zeros the VHDL's display counter, which has no initial value, stays unknown; and a clock-like input
changed at the same instant as the data races differently through the two netlists in a zero-delay
simulation: the stimulus keeps them apart, as real buttons and switches are.)

### Step 2: LUT memory bits

Each 4-input LUT is 16 consecutive bits of one frame, in address order (address = A4 A3 A2 A1),
**stored inverted**. LUT G is the 16 bits just before LUT F.

| Slice | Frame | LUT F bits |
|---|---|---|
| SLICE_X31Y47 | 236 | 736-751 (LUT G 720-735) |
| SLICE_X31Y45 | 236 | 800-815 |
| SLICE_X30Y46 | 233 | 768-783 |
| SLICE_X33Y47 | 255 | 736-751 |
| SLICE_X0Y0 | 24 | 2240-2255 |

Within a column: bit = 736 + 64 * (23 - floor(Y / 2)) + 32 * (Y even). Between CLB columns: 19
frames per column, with the block-RAM / clock columns in between; the slices with an even X are 3
frames before the odd ones. To do: the frame of every column (one sample per column).

### Steps 3-4: routing and a whole design

Switch -> LED (ISE's placement and routing): input pad P11, output pad M5, one net with 5 routing
switches (PIPs) along the bottom edge. Measured separately against the empty design:

| Part | Bits |
|---|---|
| The two pads (IBUF P11, IOB M5) | 8 |
| The net's connections to the pads, without routing | 13 |
| `BIOIS_X13Y0 W2END4 -> IOIS_G3_B0` | 3 |
| `BIOIS_X15Y0 W2END4 -> W2BEG4` | 3 |
| `BIOIS_X17Y0 W6END4 -> W2BEG4` | 2 |
| `BIOIS_X23Y0 I2_PINWIRE -> IOIS_Y2` | 0 |
| `BIOIS_X23Y0 IOIS_Y2 -> W6BEG4` | 2 |

The empty bitstream with these parts added is **identical to ISE's bitstream of the whole design,
byte for byte**.

Learned on the way: a routing switch on a net without pins is not programmed at all; routing
switches must be measured in context (the design with and without that switch). The 13 bits of
the net's connections were measured together; they still have to be split per pin.

### Stage A: where every LUT is (full project)

One design numbers every one of the 2448 slices in its LUT F; one bitstream locates them all:
2448 found, each exactly once, consistent (one frame per slice column, one offset per slice row).

- Rows: LUT F of slice row Y starts at bit 2240 - 32 * Y of the frame (Y = 0 … 67); LUT G is the
  16 bits before.
- Columns: slice columns X = 0 … 51 in frames 24, 27, 43, 46, … The two slices of a CLB are 3
  frames apart; CLB columns are 19 frames apart, except where the block-RAM and clock columns
  are, so the order follows the device's column addresses rather than X (table in
  `packages/silinx-fpga/bitdb/xc3s250e-lut.json`).

### Stage B: the settings inside a slice

Measured on one slice in isolation (`gen-slice.mjs`), most settings did not change the
bitstream: bitgen only programs an inverter, a carry-chain setting or a multiplexer when its
pin has a net. So the slice is measured in a **harness** (`gen-harness.mjs`): every input pin of
SLICE_X31Y47 is driven by its own driver slice, every output goes to a load slice, and the carry
chain comes from the slice below and goes to the one above. ISE's `par -p` routes it once
(placement kept, 58 routing switches); every variant (`gen-hvar.mjs`) is that routed XDL with only
the slice's settings changed, so the routing never changes between variants.

All settings but CYINIT were measured (`packages/silinx-fpga/bitdb/xc3s250e-slice.json`): the five inverters (clock,
enable, set/reset, BX, BY) are one bit each in the frame 2 after the LUT frame; the flip-flop
settings (initial value, set or reset, synchronous, latch), the D-input and output multiplexers
and the carry-chain settings (CYSEL, CY0 with a 3-bit code) are in the frame before. Still to do:
CYINIT, the X / Y outputs, and checking the same layout on SLICEM and on the lower slice of a CLB.

### Stage C: the bit database and the bitstream writer (2026-10-10)

**Result: Silinx's writer (`packages/silinx-fpga/src/fpga/bitgen.js`) turns ISE's routed XDL of the switch -> LED
design, blinky and lab11 into `.bit` files byte-identical to the ones ISE's bitgen writes from the
same XDL, with `-g CRC:Disable` and with the default CRC** (`check-writer.mjs`).

**Packets and CRC.** The packet sequence is fixed (`packages/silinx-fpga/src/fpga/bitstream.js`): sync, CMD RCRC, FLR
72, COR, IDCODE, MASK, CMD SWITCH, FAR 0, CMD WCFG, one Type 2 FDRI write of all 578 frames,
the CRC check word, CMD GRESTORE, CMD LFRM, one frame of NOOPs, CMD START, CTL 0, CRC, CMD
DESYNC, 4 NOOPs. COR = `000031E5` (+ `20000000` with the CRC off, + `00010000` for
`StartUpClk:JtagClk`). The CRC is a CRC-16 (polynomial 0x8005, bit-reversed 0xA001) fed with the
32 data bits then the 5 register-address bits of every register write, least significant bit first;
RCRC and the check word reset it; with the CRC off both check words are `DEFC`.

**Model.** A design is a set of *features*, each of a tile: a routing switch (`from->to`, on nets
with pins only), a site setting (`SLICE2:CYSELF:F`, `IOB1:…`, `BUFGMUX_X2Y11:…`), a pad's
direction and I/O standard (`@M5 O:LVCMOS33`), plus the LUT contents (stage A). Every feature sets
a few bits at fixed offsets from its tile's first frame and bit (`packages/silinx-fpga/bitdb/xc3s250e-layout.json`:
`cols[x]`, `rows[y]` by the X / Y of the tile name; the I/O columns are 21 frames at frames 3 and
366, frames 0-2 hold the centre clock columns). The frame data of an empty design has 18 bits set
(`defaults`). Features compose by OR (and a few clears), which is what makes batch measurements
possible.

**Routing switches, in batches.** `gen-pipdrop.mjs`: a design routed by ISE (lab11, the I/O
designs) with PIPs removed by codewords: each PIP gets w ones out of L variants, different
codewords in the same tile; a bit that changes in exactly the variants of a codeword belongs to
that PIP (`xdl -xdl2ncd -force` accepts the broken routes; bitgen still programs the rest of a net
that has pins). 20 variants measured all 4072 PIPs of lab11 at once. `gen-pipcover.mjs`: test
designs routed by `router.mjs` (breadth-first search over the device graph of
`xdl -report -pips -all_conns`): up to 4-10 PIPs under test per tile, in every tile of the chosen
types at once, each on its own net from a slice output through the PIP to a slice input; 8
variants per design. `gen-clock.mjs`: 8 global buffers driving clock pins above and below every
horizontal clock row. A PIP measured in several tiles must have the same bits in all (majority
kept, conflicts reported by `pips-to-db.mjs`). Coverage: 2570 of the 2840 PIPs of the CLB tile
(the 50 route-throughs excluded), the switches of the I/O, terminal, block-RAM interconnect, DCM
and clock tiles that the test designs and the reference designs use: about 7100 PIP features in
80 tile types. The I/O tiles of one side share their switch box (`unify-io.mjs`).

**Global clock.** The horizontal clock rows (GCLKH) use one bit per line and direction in the I/O
rows of the frame (bits 3, 2, 2334, 2335 for the rows of CLB Y 29, 21, 13, 5), frames 1-16 of
the column (`GCLKk -> UPk` / `DNk`); the vertical spines (GCLKVC) need no bits; the centre tiles
GCLKVML / GCLKVMR / CLKC are frames 0 / 1 / 2. The BUFGMUX settings used here (`I0_USED`,
`SINV:S_B`, `DISABLE_ATTR:LOW`) set no bits beyond the switches into and out of the buffer.

**Slices** (`packages/silinx-fpga/bitdb/xc3s250e-slice.json`, any slice: position i = 2 x (X odd) + (Y odd) of the CLB
tile). The harness results of the four positions (SLICEM / SLICEL, lower / upper), plus rules
found by comparing whole designs with ISE (`ana-residual.mjs`, `explain-diff.mjs`) and by removing
one setting per slice position from a routed design (`gen-attrdrop.mjs`): a used slice of a SLICEM
sets 2 bits (`USED`); an unused LUT of a used slice holds the constant 0; a used LUT whose path to
the X / Y output and to the flip-flop (DXMUX / DYMUX = 1) is unused sets its output multiplexer to
all ones (`FXMUX:#OFF`); flip-flops without a clock enable set the enable bit (`CEINV:#OFF`);
F5USED, FXUSED, F5MUX, F6MUX, XUSED, YUSED and the carry elements set no bits of their own.

**I/O pads.** The pads do not repeat one pattern per tile type: an I/O tile configures its pads
partly in the frames of the tile next to it. So every bonded pad (92) has its own absolute bits
per direction and standard (`ana-pads.mjs`), from designs with every third I/O tile used (every
bit near a used tile is its own) and designs with one pad index in every other tile (which pad
of the tile). LVCMOS33 and LVCMOS25 inputs set the same bits; outputs differ in one bit. Measured
for LVCMOS33 / LVCMOS25, DRIVE 12, SLEW SLOW, no pull (what the Basys2 designs use);
`gen-iob.mjs` also has variants for the other standards, drives, FAST and the pulls (`ana-iob.mjs`,
not in the database yet: several of them change bits of the neighbouring pads).

**Measured in the reference designs themselves.** 27 PIPs and a few settings were found only in
the reference designs (a tile with exactly one unknown feature: its differing bits are that
feature, `learn-single.mjs`), and a few corrections from `explain-diff.mjs` (`fix-*.json` in
`build-db.sh`): BY -> BX bounce, `_GND_SOURCE`, `YB1->OMUX0` (one observation), `FX1->Y1`
(clears one bit of the GYMUX default), the clock pins of the CLB_BRK rows (same bits as in the
other rows). So the acceptance designs are not fully independent of the database. Designs not used to build it
(other placements of lab11, blinky and the switch -> LED design, routed by ISE): two are
byte-identical (switch -> LED placed by Silinx, `s4/top`), the others differ in 39-97 bits of
the 1.35 million (unknown PIPs of block-RAM interconnect, DCM and I/O tiles, the carry chain of
SLICEMs, and the open SLICEM bits below); lab11 synthesized by Yosys differs in 276 bits.

Open at the end of stage C (solved in stage D): in a SLICEM of an F6 multiplexer tree, ISE
sometimes sets 2 more bits per slice (SLICE0: 1,55 1,57; SLICE1: 1,23 1,25) and sometimes not, with
the same settings in the XDL (they are set for a `_GND_SOURCE::Y` SLICEM).

**Runtime.** About 185 ISE runs (`xdl -xdl2ncd` + `bitgen`, 3 at a time, about 1 minute each under
emulation), about 4 hours of wall time in batches; the analyses run in seconds.

**Open problems.** PIPs not reachable by the test router (long lines, TBUF, some I/O switches) and
the route-throughs; block RAM, multipliers, DCM settings (done in stage D); I/O standards other than LVCMOS33 / 25
and DRIVE / SLEW / PULL changes; IFF / OFF registers in the IOBs; SLICEM as RAM / shift register;
BUFGMUX with I1 / S used. A design using one of these reports it (`unknown` features of
`bitgen()`), the bitstream is then incomplete.

### Stage D: designs placed and routed by Silinx, and the rest of the chip (2026-10-11)

**Result: blinky and lab11 placed and routed by Silinx's own placer and router are byte-identical
to ISE's bitgen from the same XDL, and so are all 12 other reference designs** (ISE's placements of
switch -> LED, blinky, lab11 and lab11 synthesized by Yosys, with and without CRC; designs with
block RAMs, multipliers, distributed RAM, shift registers, a DCM and a BUFGMUX implemented by ISE
from HDL (`ise-impl.sh`: the fixtures of `test/fixtures/designs` and two designs of primitives) are
byte-identical too, but for one bit of an LVCMOS25 input in one design).

**Where.** ISE ran on a faster machine (an Intel Mac with Docker: about 9x faster than emulation)
through `fuzz-remote.sh`; the host is given on the command line only (`SILINX_FUZZ_HOST`).
About 1780 ISE runs (`xdl -xdl2ncd` + `bitgen`, 3-4 at a time, about 8 hours of container time in 5 hours
of wall time), plus 10 designs implemented from HDL (xst, map, par: 8 minutes).

**The PIPs of Silinx's own designs.** `gen-pipdrop.mjs` on Silinx's routed blinky and lab11 (20
variants each) measured all their 9370 PIPs at once.

**One switch box.** Every PIP measured both in a CLB and in an I/O, corner, block-RAM interconnect
or DCM tile has the same bits, at a fixed offset: the left I/O column 2 frames later, the top I/O row
16 bits further, the others none (`share-sb.mjs`; `makeDb`: `sameAs` + `shift`). The I/O tiles' own
pin wires are the CLB's under other names (`IOIS_X0` = `X0`, `IOIS_F1_B0` = `F1_B0`, `IOIS_VCC_WIRE` =
`VCC_PINWIRE`; not the clock pins `IOIS_CLK0-7`): `rename`. The I/O measurements without bits where
the CLB has bits were bits given to a neighbouring tile by the analysis (such as `W6END4->E2BEG4` of
the left I/O tiles): they are dropped. The four block-RAM interconnect tiles of a block RAM have the
same bits for the block-RAM pins (`unify-io.mjs`).

**PIPs without bits.** The terminal tiles' PIPs (…TERM…: thousands measured, none with bits of its
own; the few with bits were I/O bits in the same frames), the block-RAM site tiles' PIPs (pin wires),
the PIPs into the stub wires of the input-only I/O tiles, `VCC_PINWIRE -> pin` (the constant 1 is
the default) and the I/O sites' settings of standard / drive / slew / pull (their bits are the pad's
features) set no bits: `pipsWithoutBits`, `emptyFeatures`.

**New ways to reach PIPs.** `gen-pipcover.mjs`: the carry outputs XB / YB as sources (SLICEM: XBMUX
instead of XBUSED), clock pins as sinks, the tiles' VCC sites (nets of the constant 1), the long
lines, the block RAMs' and multipliers' pins (`--pins bram`), and `--nosink`: the PIP under test
ends its route (a net with only an output pin crashes `xdl -xdl2ncd`, so the net gets one unrouted
slice input): bitgen programs every PIP of a net with pins, also one that leads nowhere.
`gen-branch.mjs` adds PIPs as dead-end branches to the nets of a routed design: on the global clock
nets of `gen-clock.mjs` this measured the clock pins from every global line (`GCLKk->CLKn`, 32 per
CLB, and the I/O tiles' `GCLKk->IOIS_CLKn`). Measurements are cleaned of LUTs cleared by the
removal of their only route (`stripLutRuns`), and conflicting measurements are resolved by leaving
out such artefacts (`resolvePatterns`).

**The SLICEM bits (open in stage C).** A SLICEM site holds an instance of type SLICEM or SLICEL;
of 695 instances in SLICEM sites, the 142 of type SLICEM set the 2 bits (SLICE0 1,55 1,57; SLICE1
1,23 1,25), the 553 of type SLICEL do not: feature `SLICEk:SLICEM`. As found with RAMs, the 2 USED
bits of a SLICEM site mean "F / G is not a RAM", the 2 SLICEM bits "F / G is not a shift register".

**Slice settings.** XBUSED, YBUSED, XBMUX, YBMUX: no bits of their own (without them bitgen leaves
out the carry settings). SLICEM as RAM / shift register (`ise-impl.sh`: designs with RAM16X1S,
RAM16X1D, RAM32X1S, SRL16(E), SRLC16E and inferred distributed RAMs and shift registers implemented
by ISE; one setting changed per slice position, `gen-attrdrop.mjs ATTR=FROM>TO`): `F:#RAM`,
`F:#RAM:SHIFT_REG` (the LUT feature names the mode), `DIF_MUX`, `DIG_MUX`, `SLICEWE0USED`, `YBMUX:0`,
`WSGEN`; LUT initial values in hexadecimal (`D=0x…`).

**I/O.** `gen-iob.mjs --perpad`: every change of standard, drive, slew and pull on every pad, each
variant changing the pads of one index in every third I/O tile of each side; a changed bit belongs
to the changed pad whose own bits are nearest (a pad's bits are not always in its own tile's frames)
(`ana-perpad.mjs`). A standard is a whole pad feature (`O:LVCMOS18`), drive / slew / pull are changes
of the pad's bits (`O:DRIVE:8`, `O:SLEW:FAST`, `O:PULL:PULLUP`, `I:PULL:KEEPER`). Checked with all
92 pads at random settings: inputs of any standard with any pull, and LVCMOS33 outputs with any drive
/ slew / pull, are byte-identical; the drive and slew of another standard change other bits than
LVCMOS33's, so they are measured per standard (`--perstd`, features `O:LVTTL:DRIVE:8`…): LVTTL
outputs with any drive / slew / pull are byte-identical too. A setting xdl's DRC calls illegal (a
1.2-1.8 V output in a 3.3 V bank, which is every bank of the Basys2) is not a measurement and is left
out; LVCMOS25 16 mA with FAST does not compose yet.

**Block RAM** (`gen-bram.mjs`, `ana-bram.mjs`: all 12 block RAMs, 17 designs): every one of the
18432 memory bits (INIT_xx, INITP_xx) has the same place relative to its block RAM in all 12, stored
as is (`packages/silinx-fpga/bitdb/xc3s250e-bram.json`: a column frame per X, a row bit per Y, and the place of each bit).
The settings are in the interconnect column before the RAM's (`gen-sitevar.mjs` on a design of
block RAMs and multipliers, one instance changed at a time; `ana-sitevar.mjs --dx -1`,
`bram-features.mjs`): the port widths are a 3-bit code per port, the write modes one bit each, the
output latches' initial and reset values (INIT_A, SRVAL_B…) one bit per value bit at a place that
depends on the port width, stored inverted (`RAMB16:INIT_A@2048X9:3`…); the enable and write-enable
pins of an unused port count as not inverted. Multipliers: registers, B input and inverters, one bit
each. **DCM** (`sitevar-features.mjs`): every value of CLKDV_DIVIDE, CLKFX_MULTIPLY (2-32) and
CLKFX_DIVIDE (1-32), DESKEW_ADJUST (0-15), CLK_FEEDBACK, CLKOUT_PHASE_SHIFT, the frequency modes,
duty cycle correction, STARTUP_WAIT and the inverters, measured on the top-left DCM only (the other
three are not measured); PHASE_SHIFT only the 13 values measured; FACTORY_JF1 / JF2 set no bits;
CLKIN_PERIOD changes 2 bits (not in the database); STARTUP_WAIT also changes the COR register (not
written yet).

**Coverage.** Of the PIPs (without route-throughs) of one tile of each of the 85 tile types, 64329 in
all, the database gives 59177 (92%; the I/O tiles of one side share theirs): the CLB all but 4 (the
SLICEMs' RAM cascade pins), the I/O tiles all but their clock pins from the global lines and the
DDR / differential pairs, the block-RAM interconnect all but about 30. Left: the DCMs' own pins
(about 370 PIPs per DCM), the corner tiles' configuration-logic pins (LR, UR), the clock tiles'
pad / DCM inputs (CLKT, CLKB, CLKL, CLKR), the BUFGMUX I1 / S settings of 7 of the 8 buffers; IFF /
OFF and DDR registers in the IOBs; the DCMs other than the top-left one. A design using one of these
reports it (`unknown`). The 113 PIPs measured with different bits in different tiles are resolved
by majority and artefact rules (`resolvePatterns`, `stripLutRuns`, empty measurements against the
same bits in two tiles); the rest are BX / BY bounces and global clock pins with bits of the clock
rows, kept by majority.

### Stage E: block RAM, multipliers, distributed RAM, shift registers and the DCM in the open flow (2026-10-11)

**Result: designs with block RAMs, multipliers, distributed RAMs, shift registers in SRL16 and the
top-left DCM, synthesized, packed, placed, routed and written by Silinx, are converted by ISE
(`xdl -xdl2ncd`, `drc`, `bitgen`) to byte-identical .bit files (CRC on and off), with no DRC error
or warning** (`scripts/check-open-flow.mjs`): the projects of `test/fixtures/open-flow` (feat_bram:
an inferred block-RAM ROM; feat_mult: inferred multipliers; feat_srl: inferred SRL16E; feat_dcm: a
DCM_SP with CLK0, CLKDV, CLKFX, CLK2X; hard_prim: instantiated RAMB16_S9_S36, RAMB16_S18_S18,
RAMB16_S1_S4, MULT18X18SIO, MULT18X18S, RAM16X1D, RAM32X1S, SRL16E_1; feat_constmult:
multiplications by a constant and a 14-bit memory word, #35) and the fixtures bram_sp,
dram, srl and dcm of `test/fixtures/designs` (as XC3S250E-CP132 projects). No new measurement was
needed but two settings without bits (`measured/fix-16open.json`); what the database had from
stage D (the settings, and the PIPs of ISE's own designs with these blocks) was enough.

The XDL the packer writes is ISE's map's (`xdl -ncd2xdl` of ISE's designs of the same blocks).
What ISE's tools want, found on the way:

- **Element names are unique within an instance.** The two LUTs of one RAM16X1D or RAM32X1S named
  alike make `xdl -xdl2ncd` fail with an internal error ("Caught Xdm_Exception - Cannot continue:
  'X'"); ISE's names are `<ram>.SLICEM_F` / `<ram>.SLICEM_G`.
- **Block-RAM data inputs:** a data input tied to a constant whose output bit is not used is a DRC
  warning (812, "Dangling pin <DOA15>"): Yosys leaves the data bits beyond the memory's width
  undriven (x), and the packer leaves those inputs unconnected. The parity inputs of a port must
  all be connected (DRC error 1061 otherwise). A port that writes a signal into a parity input
  and does not read that parity output is a DRC warning (1060, "The block is configured to use
  input parity pins. There are dangling output parity pins."): Yosys's 18-bit word is DI0-7,
  DIP0, DI8-15, DIP1, so a 14-bit memory written on port A and read on port B writes bit 8 into
  DIPA0. ISE's map lays the same memory out on DI0-13 with the parity inputs tied to 0; the packer
  moves such a parity bit to a data bit no port uses (pins, contents, INIT / SRVAL), for ports of
  one width (#35, the stopwatch example; the variants were checked with ISE's DRC: parity inputs
  left open on a 1024X18 port are error 1061, tied to 0 with the bit on DI13 / DO13 are clean).
- **Multiplier inputs tied to 1** (a multiplication by a constant: the A / B pins of the
  constant's 1 bits): ISE ties each to the VCC site of the block-RAM interconnect tile the pin's
  wire comes from (`BRAM1_SMALL BRAM_VCC_WIRE -> BRAM_DIB_B16`, then `BRAMSITE2 BRAM_DIB_B16_INT1 ->
  MULT18X18SIO_B4`: two switches, both known). The router chose the VCC site by distance, and
  a multiplier's pins of the second to fourth interconnect tile then had no path on known switches
  (#35): it now prefers a site one or two switches from the pin.
- **Control pins tied to a constant** (#50; ISE's map and par on every combination of 1, 0 and a
  signal on a block RAM's EN / WE / SSR, a multiplier's CE / RST / CLK with and without registers,
  a DCM's RST / PSCLK / PSEN / PSINCDEC / DSSEN): ISE never uses the pin's inverter. A pin tied to
  1 is on VCC, from the VCC site of the block-RAM interconnect tile (`BRAM_VCC_WIRE ->
  BRAM_CE_B2`, `BRAM_CE_B2_INT1 -> RAMB16_ENA`) or of the DCM's tile (`DCM_VCC_WIRE ->
  DCM_G1_B3`, `DCM_G1_B3 -> DCM_RST_PINWIRE`); a pin tied to 0 on GND, from a slice through general
  routing; a DCM's DSSEN is left open either way. A MULT18X18S is a MULT18X18SIO with CE on CEA, CEB
  and CEP and R on RSTA, RSTB and RSTP; a MULT18X18 one with its enables and clock tied to 0 and its
  resets to 1. The packer does the same; the block-RAM tiles' VCC switches are known since #35, the
  DCM tiles' since #190: `DCM_VCC_WIRE -> DCM_G1_B1 / B2 / B3, DCM_PSCLK, DCM_CLKFB` of every DCM
  tile type of the four devices (one constant-1 net per DCM tile through all of them,
  `gen-dcmvcc.mjs`, removed by codewords: none sets a bit; `measured/learn-14dcm-vcc-pips.json`),
  so a DCM's pins tied to 1 come from the VCC site of its tile, as ISE routes them (feat_const_dcm:
  RST, PSCLK and PSINCDEC tied to 1, the same pins, sources and switches as ISE's own routed design,
  byte-identical; PSEN tied to 1 without a variable phase shift is a DRC warning of ISE's own,
  PhysDesignRules:774).
- **Multipliers without registers:** ISE's bitgen sets the bits of the CEA / CEB / CEP inverters
  ("not inverted") even when the XDL has no CEAINV (3 bits in the third block-RAM interconnect tile
  of the multiplier): `bitgen.js` does the same (as for the enables of a block RAM's unused port).
- **Unused inputs:** an input buffer whose output goes nowhere is a DRC warning (812, "Dangling pin
  <OUT>") and its pad bits differ: ISE's map trims it, and so does the packer.
- **A RAM64X1S** is two RAM32X1S and LUTs (the write enables by A5, the read multiplexer), as ISE's
  map builds it; RAM16X1D in one SLICEM (G the write port, F read at DPRA, `DIF_MUX::ALTDIF`);
  RAM32X1S with A4 on BX (F5 multiplexer and `SLICEWE0USED`).
- **A flip-flop beside an always-enabled shift register** (SR = 1, the shift enable): ISE's map
  packs it so (`FFX_SR_ATTR::SRLOW` with `FFX_INIT_ATTR::INIT1`): the flip-flops of a SLICEM whose
  LUTs are RAMs or shift registers do not see SR.
- **A multiplier and a block RAM in one tile** share its routing: the placer keeps a multiplier out
  of the tile of a block RAM with a 36-bit port (ISE's own placements pair multipliers with 18-bit
  or narrower block RAMs).
- **The DCM:** the PIPs of ISE's DCM design (pd-dcm) route CLKIN from the pad B8
  (`CLKT_CKI4->CLKT_DLL_CLKPAD4`, `DCM_DLL_CLKPAD0->DCM_CLKIN`), CLKFB from a global line, LOCKED to
  general routing, and each of CLK0, CLK2X, CLKDV, CLKFX to one global buffer of the top edge
  (`route.js bufgReach`: BUFGMUX_X2Y10, X1Y11, X2Y11, X1Y10); the placer gives those buffers to the
  outputs. `X_CLKIN_PERIOD` 20 ns sets no bits (ISE's own DCM design is byte-identical without it;
  other periods change 2 bits, not measured); `C2VDD` (the carry chain's constant 1 on the G side,
  never in ISE's designs) sets none either. DSSEN tied to 0 is left open, as ISE's map does.

After merging the timing-driven placer and the router's LUT input swapping (main 7f4ab2f) the
same designs are byte-identical again but dram at seed 1: one bit (frame +7, bit 79 of the bottom
I/O tile BIOIS_X24Y0) that ISE sets and the database does not, in a tile whose features are an
input pad and the PIPs `IOIS_Y1->OMUX10`, `OMUX_S3->IOIS_G3_B0` (a routing switch of the bottom I/O
tiles with one bit missing, not a block of this stage); at seed 2 dram is byte-identical. To
measure (gen-pipcover.mjs on that PIP in the bottom I/O tiles).

**What fails clearly** (the packer or placer stops with the reason): the DCM outputs CLK90, CLK180,
CLK270, CLK2X180, CLKFX180 on a global buffer and the other three DCMs (no measured path), CLKIN
from another pad, `STARTUP_WAIT` (it also changes the COR register), `CLKIN_DIVIDE_BY_2`,
`DESKEW_ADJUST = SOURCE_SYNCHRONOUS`, input periods other than 20 ns (the bitstream would lack
2 bits: "features not in the bit database"), BUFGMUX clock switching (I1 / S measured on one buffer
only; since: every buffer, #846), the SRLC16 cascade output and the multiplier cascade (BCIN / BCOUT) (since: the SRLC16E chains of up to
4 through Q15, #2).

### Stage F: the other Spartan-3E devices — XC3S100E, XC3S500E, XC3S1200E (2026-10-11)

**Result: the fully open flow writes byte-identical bitstreams (CRC on and off) for the Basys2-100
(XC3S100E-CP132), the Nexys2-500 (XC3S500E-FG320) and the Nexys2-1200 (XC3S1200E-FG320)**: blinky
and lab11 on each board, placed and routed by Silinx, are converted by ISE (`xdl -xdl2ncd`, `drc`,
`bitgen`) to the same .bit files, with no DRC error, no DRC warning and no xdl2ncd warning
(`scripts/check-open-flow.mjs`, which now also fails on a warning); the open flow itself gives no
warning on them. Designs implemented by ISE from HDL on each device (`ise-impl.sh` with `PART`:
blinky with the board's pins, bram_sp, brmul, bufgmux, dcm, dram, ramprim, srl) are byte-identical
too, but for what is listed below.

**The database per device** (`db.mjs`, the one loader of the open flow, the interface and the
experiments: `loadDb('xc3s500efg320-4')`):

| File | What | Per |
|---|---|---|
| `s3e-tiles.json` | the tile types' features (PIPs, site settings) | shared by the devices |
| `<device>-tiles.json` | features of one device only (the XC3S1200E's long-line splitters); the PIPs of the shared types its tiles do not have (#74) | device |
| `<device>-layout.json` | where every tile is, the bitstream format (IDCODE, frame length, frames), the bits of an empty design | device |
| `<device>-lut.json`, `<device>-bram.json` | where every LUT, every block-RAM memory bit is | device |
| `<device>-<package>-pads.json` | the pads' own bits (absolute, per direction, standard, drive, slew, pull) | device and package |

**Bitstream format** (an empty design written by bitgen; the packet sequence and the COR / CRC rules
are the XC3S250E's, `chkempty`: Silinx's writer gives ISE's empty and map designs byte for byte):

| Device | IDCODE | Frame (words) | Frames | Frame bits = 160 + 64 x CLB rows |
|---|---|---|---|---|
| XC3S100E | `01C10093` | 49 | 369 | 22 rows |
| XC3S250E | `01C1A093` | 73 | 578 | 34 rows |
| XC3S500E | `01C22093` | 97 | 730 | 46 rows |
| XC3S1200E | `01C2E093` | 125 | 959 | 60 rows |

**Layout** (`gen-map.mjs`: one design per 4000 slices numbers every slice in its LUT; `decode-map.mjs`;
`gen-layout.mjs` from the map, the empty design and the device grid): every slice found once, one
frame per slice column and one bit per slice row on every device. Every tile column but the I/O
columns has CLB tiles (the block-RAM columns at their top and bottom), so the map gives all the
columns: the global clock columns (3 frames; 4 on the XC3S1200E), the left I/O column (21 frames),
the CLB columns of the main block (19 each), the right I/O column, then the block-RAM columns' CLB
and content frames and their interconnect columns, as on the XC3S250E. The horizontal clock rows
(GCLKH) take one bit each in the I/O rows: the outermost row of each half first (top: bits 3, 2;
bottom: FB-1, FB-2); on the XC3S1200E the top rows start one bit further (bits 4, 3: its bits 1-3 are
the long-line splitters').

**The shared switch box hypothesis holds**: the XC3S250E's features, relative to their tiles, gave
byte-identical bitstreams on the three other devices for every design above. What was missing:

- **Tile types the XC3S250E does not have**: the XC3S100E's DCMAUX_BL / TL_CENTER (where it has no
  DCM) and the XC3S1200E's side DCMs (DCM_H_BL / BR / TL / TR_CENTER) have the CLB switch box (shift
  0,0, `share-sb.mjs`); the XC3S1200E's clock tiles CLKT_LL, CLKB_LL, CLKC_LL, CLKV_LL are CLKT, CLKB,
  CLKC, CLKV (`ALIASES`); the new terminal tiles (TTERM1, LTERM2/3, RTERM2/3, BTERM1, …_BRAM2,
  DCM_H_…_TERM) have no bits like the others.
- **The horizontal clock rows of the I/O and block-RAM columns** (GCLKH_PCI_CE_N / S, …UP_GCLKH…,
  …DN_GCLKH…) are GCLKH tiles with other names: the same switches and bits, one bit by row as GCLKH
  (`GCLKH_TYPES`). Measured on the XC3S250E as offsets from their own row, which held for one row of
  each type only; this also gives the bit that made `dram` (seed 1) differ in stage E
  (`BRAM2_DN_GCLKH_FEEDTHRUA_X24Y5 GCLK4->GCLK_DN4`, frame +7 of BIOIS_X24Y0's column, bit 79 of its
  row: the GCLKH bit FB-1; measured empty before, a bit given to a neighbouring tile). That design is
  byte-identical now.
- **The XC3S1200E's long-line splitters** (CLKH_LL, the centre row: each vertical long line joined
  across the centre in either direction, one bit each in the I/O rows; `gen-pipcover.mjs --types
  CLKH_LL --long 1`, 298 PIPs in 38 tiles, all 48 switches the same in every tile, `clkh-ll.mjs`;
  `packages/silinx-fpga/bitdb/xc3s1200e-tiles.json`). A routed design names them `a =- b` with the line's driver in another
  tile, so the writer could not tell the direction and the router did not use them (`noRoute`). Since
  #23 bitgen takes it from the device description (`pipFeatures`: the half of the line the net drives,
  by a PIP in any tile or its output pin, is the splitter's input), and the router uses them where they
  are faster; the placer's delay table leaves them out (`splitter`, `knownRouting` `delayPip`: counted
  there, they made the placements slower). ISE's own XC3S1200E routings (the I/O register designs, 861
  of 1031 using a splitter) are no longer byte-identical only for CLKH_LL: 0 before, 10 with the
  CLKV_LL bits below added; the others differ by input delays the database leaves out. The other
  splitters (CLKV_LL, CLKT_LL / CLKB_LL, CLKL_IOIS_LL / CLKR_IOIS_LL, CLKLH_DCM_LL / CLKRH_DCM_LL) came later,
  #709 (below).
- **REVUSED** (a flip-flop's REV pin used): one bit per slice position, seen in all four positions in
  ISE's designs of the three devices; the input pads' pin wires of the top I/O tiles (no bits).
- **Pads** per package (`gen-iob.mjs --third / --sparse`, `ana-pads.mjs`: the LVCMOS33 / 25 inputs
  and outputs of every bonded pad, 83 / 232 / 250 pads, every changed bit near exactly one used pad;
  `--perpad / --perstd`, `ana-perpad.mjs`: the other standards, drive, slew and pull of every pad:
  LVCMOS33 / LVTTL / LVCMOS25 outputs with every drive, slew and pull, inputs of every standard and
  pull, 430 runs per part; on the XC3S100E, then on the XC3S500E and XC3S1200E once the ISE machine
  was reachable again). The pads' bits follow the XC3S250E's patterns relative to the I/O tiles only
  in families that depend on the pad's place, so they were measured on each device. Checked with every
  pad at random settings (`gen-iorand.mjs`: LVCMOS33 and LVTTL outputs with random drive / slew /
  pull, inputs of random standards and pulls): byte-identical on all three. **The Spartan-3E Starter
  Kit's settings** (XC3S500E-FG320: LVTTL inputs with pull-ups and pull-downs, LVTTL outputs of drive
  8 slow and fast, LVCMOS33 of drive 4) work in the open flow: `test/fixtures/open-flow/feat_starter`
  (the kit's pins and UCF settings: switches and buttons, rotary encoder, RS-232, VGA, LCD lines) is
  byte-identical to ISE's bitgen, with no DRC error or warning.
- **Block RAM** (`gen-bram.mjs`, `ana-bram.mjs` with `PART`): every memory bit of all 4 / 20 / 28
  block RAMs has the same place relative to its RAM as on the XC3S250E; only the columns and rows
  differ.

**XC3S250E items of stage D measured here** (designs implemented by ISE: all 8 BUFGMUX of the top and
bottom with I0, I1 and S used; the 4 DCMs with every pin used; IOB flip-flops and DDR registers;
`gen-pipdrop.mjs` on each): the PIPs of the DCMs' pins (all four DCMs), of the BUFGMUX inputs and
select from the fabric, and of the I/O clock pins (`measured/learn-8stage-f-pips.json`); the select
inverter of each of the 8 BUFGMUX (one bit each, `gen-sitevar.mjs` per buffer; I1_USED none:
`fix-21stage-f-bufgmux.json`); with the DCM pins, CLK0 and CLKFX of the top-left DCM also reach
BUFGMUX_X2Y11 / X1Y11 (the placer now gives the buffers to the most constrained output first).

**The DCMs** (after the ISE machine was reachable again; the XC3S250E's design of the four DCMs,
settings changed with `gen-sitevar.mjs` on two DCMs at a time, `spec.sites`: bottom left + top right,
bottom right + top left, whose bits cannot mix; `ana-sitevar.mjs` now gives the patterns per tile type):

- **The other three DCMs are mirror images of the top-left one** (`dcm-mirror.mjs`, checked on 38
  values of each DCM: every DCM setting): relative to its tile, a bit (df, db) of the top-left DCM is
  (18 - df, db) in the top-right one, (df, 63 - db) in the bottom-left one, both in the bottom-right
  one; but the pin inverters (PSCLKINV…: the same bits in all four, in the tile's switch-box frames)
  and two bits that a pair of DCMs shares (top and bottom: frame 18 of the right DCM's column). The
  stage-D measurement of every value of the top-left DCM thus gives all four (`build-db.sh` mirrors it).
- **Each clock output used has its own enable bit** (`DCM:OUT:<pin>`; the nets of one output pin
  removed at a time from the design routed by ISE): CLK0, CLK90, CLK180, CLK270, CLK2X, CLK2X180,
  CLKDV one bit each; CLKFX, CLKFX180, LOCKED, PSDONE and STATUS none. CLK0, CLK2X and CLKDV were in
  `DCM:USED` (the outputs of the stage-D design): a design without them would have had wrong bits.
- **The input period** (`X_CLKIN_PERIOD`, 5-1000 ns and CLKFX settings around the limits: 40 runs;
  `packages/silinx-fpga/src/fpga/bitgen.js dcmPeriodFeatures`): `DCM:CLKIN:LOW` (two bits) for 25 ns or more (24.9 ns sets
  nothing); `DCM:CLKFX_IN:LOW` (the pair's two shared bits; what made CLKFX_DIVIDE 31 / 32 look like
  they had two more bits) when the CLKFX output is under 5 MHz, computed by ISE from CLKIN's period
  less a margin of 0.4-0.64 ns and CLKFX_MULTIPLY / CLKFX_DIVIDE as given, or when CLKIN is 3.33 MHz or
  less (5 MHz is not). All 86 cases measured follow this rule; where the margin or the CLKIN limit
  leave the choice open, the design is refused (`DCM:CLKFX_IN:?`). (Solved in stage G: the "margin" is
  the period truncated to whole nanoseconds.)
- **STARTUP_WAIT**: one bit of the DCM and the COR register: bitgen moves the startup cycles (0x31E5
  -> 0x211D, with Cclk and with JtagClk; `corValue({ startupWait })`), but only for a DCM at one of the
  sites DCM_X0Y0, X1Y0, X0Y1, X1Y1 (measured one DCM at a time on the XC3S250E, XC3S500E and
  XC3S1200E: of the XC3S1200E's eight only X0Y1 and X1Y0 change the COR register; probably a
  shortcut of ISE's bitgen, reproduced as it is). The packer accepts `STARTUP_WAIT => TRUE` now
  (`test/fixtures/open-flow/feat_dcm_wait`: STARTUP_WAIT, a CLKFX of 6.25 MHz, only CLK0 and CLKFX
  used; byte-identical to ISE).
- **The XC3S1200E's side DCMs** (DCM_H_…, the same campaign on its design of eight DCMs: every value
  on the bottom-left and top-right ones, the subset on the others, 219 runs) are the same four
  images: the bottom-right one is the top-left DCM, the bottom-left the top-right, the top-right the
  bottom-left, the top-left the bottom-right; each side's pair shares its two CLKFX-range bits
  (`MIRRORS` in `dcm-mirror.mjs`: every value measured on two of them is the mirror's).
- **The other devices**: designs of every DCM of each device implemented by ISE (`dcmall`: 2 / 4 / 4 /
  8 DCMs, every pin used) and `gen-pipdrop.mjs` on each gave 338 PIPs of the DCM pins and clock tiles
  the database did not have (`measured/learn-9stage-f-dcm-pips.json`, the same bits on every device).
  With them the XC3S100E's and XC3S250E's designs are byte-identical, and the stage-F DCM designs of
  the XC3S500E and XC3S1200E too (their DCM input pins: 4 PIPs more, 40 runs); the XC3S500E's design
  of four DCMs differs in one bit and the XC3S1200E's of eight in five: a global buffer of the side
  (below) and the long-line splitters, whose direction a routed design does not give. With these
  switches CLK90, CLK180 and CLK270 of the top-left DCM reach a global buffer too (`bufgReach`; the
  open flow's feat_dcm with CLK90 in place of CLK2X is byte-identical to ISE); CLK2X180 and CLKFX180
  still do not, and the open flow still places its one DCM on the top-left site.
- **The global buffers of the left and right sides** (a design of all 16 implemented by ISE, each
  driven from the fabric): their settings (SINV, DISABLE_ATTR: one buffer at a time, 32 runs) set no
  bits, the centre tiles' switches from them (GCLKVML / GCLKVMR) one bit each (`gen-pipdrop.mjs`); but
  the side clock tiles' input switches (CLKL_GCLKk -> CLKL_GCLKINkk, CLKL_VCC_WIRE -> CLKL_SELDUBk…)
  set bits that depend on the other inputs used: the database's values, measured in other designs,
  are wrong in this one (5 bits). Not solved: the side clock tiles need a campaign of their own
  (each buffer's inputs in combination). (Solved in stage G: those values were measured by removing
  the switches, which leaves a buffer's pin without its route.)

Not done: the settings of the IOB flip-flops and DDR registers (`gen-sitedrop.mjs` /
`ana-sitedrop.mjs` remove one setting at a time; the I/O registers' clock inverters, D multiplexers
and set / reset settings are consistent between instances, but the input delay settings are not,
being bits near the pads like the pads' own: they need a per-pad campaign like `--perpad`, on
designs whose IOB registers ISE placed); the side clock tiles' input switches (above); CLKIN_DIVIDE_BY_2 and DESKEW_ADJUST = SOURCE_SYNCHRONOUS (xdl refuses the variants: to measure
with designs implemented by ISE). A design using one of them is refused (`unknown`). (Stage G below.)

**Other things learned**: the device reports of the larger chips are too large to read as one string
(the XC3S1200E's is 595 MB): the experiments use the device description instead (`xdlrc-graph.mjs`
`graphFromDevice`, the same graph); two BUFGMUX in a pair of sites (X1Y10 / X1Y11) used as muxes need
each other's inputs swapped (ISE's placer refuses otherwise); a DCM_SP's STATUS(3..6) are not
connected (ISE's router reports them unroutable).

**Runtime** (ISE on the Intel Mac, 2-4 runs at a time): about 1100 runs (`xdl -xdl2ncd` + `bitgen`;
the XC3S100E's I/O settings per pad are 430 of them), 30 designs implemented from HDL, 30 checks of
the open flow, in about 6 hours of wall time. After the machine was reachable again: the FG320 pads
(about 650 runs left of the 860, at 3-4 a time; the XC3S1200E's take about 1.5 minutes each), the
DCMs and side buffers (about 500 runs), 5 designs implemented from HDL and 17 checks of the open
flow (blinky, lab11 on every board, the feature fixtures, feat_starter, feat_dcm_wait: all
byte-identical, CRC on and off, no DRC error or warning, no warning of the open flow), in about 3
hours of wall time.

### Stage G: the rest of the DCM, the side global buffers, the IOB registers (2026-10-12)

**#46: CLKIN_DIVIDE_BY_2, SOURCE_SYNCHRONOUS deskew and the DCM's frequency ranges.** Measured with
designs implemented by ISE from HDL (`ise-impl.sh`: the four DCMs of the XC3S250E with every setting
mixed, xdl refusing these settings in an edited design) and xdl variants of the input period:

- **DESKEW_ADJUST = SOURCE_SYNCHRONOUS** is `DESKEW_ADJUST::0` in ISE's map (SYSTEM_SYNCHRONOUS is
  7): the value measured in stage D, no bits of its own. The packer writes it so.
- **CLKIN_DIVIDE_BY_2**: one bit (`DCM:CLKIN_DIVIDE_BY_2:CLKIN_DIVIDE_BY_2`, 0,112 in the top-left
  DCM), the other DCMs' the top-left one's mirrored (`dcm-mirror.mjs`; seen on all four;
  `measured/fix-23dcm-divide.json`).
- **The frequency ranges** (`DCM:CLKIN:LOW`, `DCM:CLKFX_IN:LOW`): ISE takes the input period in whole
  nanoseconds, truncated, doubled by CLKIN_DIVIDE_BY_2 (T); CLKIN:LOW when T >= 25; CLKFX_IN:LOW when
  T > 200 (CLKIN under 5 MHz) or T x CLKFX_DIVIDE / CLKFX_MULTIPLY > 200 (CLKFX under 5 MHz); without a
  period neither. Stage F's "margin of 0.4-0.64 ns" was the truncation: 20.9 ns x 30 / 3 is "200 ns"
  and fast, 14.1 x 29 / 2 "203 ns" and slow (a margin would have made it fast), 12.9 ns halved "24 ns"
  and not LOW, 200.99 ns fast, 201 ns slow. All 164 cases measured (stage F's 86 and 78 new ones,
  `per*` variants of 2 DCMs of different pairs at a time) follow it (`packages/silinx-fpga/src/fpga/bitgen.js
  dcmPeriodFeatures`); nothing is refused any more.
- **The DCMs' own switches**: the designs of every DCM of each device with these settings (2 / 4 / 4 /
  8 DCMs, the phase-shift and reset pins from the fabric) and `gen-pipdrop.mjs` on each gave 125 PIPs
  of the DCM tiles the database did not have (`measured/learn-10dcm46-pips.json`, the same bits on
  every device). With them these designs are byte-identical to ISE's bitgen (CRC on and off) on the
  XC3S100E, XC3S250E and XC3S500E; the XC3S1200E's differs only in its side global buffers (#45) and
  long-line splitters.
- **The open flow**: `test/fixtures/open-flow/feat_dcm_div2` (Basys2-250: CLKIN_DIVIDE_BY_2,
  SOURCE_SYNCHRONOUS, CLKFX 25 MHz x 3 / 15 at the edge of its range; since #661 x 2 / 5, trce's edge) and `feat_dcm_fx` (Nexys2-500:
  a period of 20.9 ns, CLKFX x 3 / 30) are byte-identical to ISE's bitgen, CRC on and off, DRC 0
  errors and 0 warnings.

Runtime: 9 designs implemented from HDL, 111 xdl + bitgen runs (84 of them PIP batches), in
about 25 minutes of wall time.

**#45: the global buffers of the left and right sides.** Designs implemented by ISE from HDL
(`gen-sidebufg.mjs --random`: 28 designs on the four devices, each a random subset of the 16 side
buffers, as BUFG or BUFGMUX, driven from the fabric), each compared with the writer's frame data with
the side clock tiles' features (CLKL / CLKR) left out of the database: the bits of those tiles are
then exactly ISE's. Solved:

- **The switches into the buffers** (`GCLKk -> GCLKIN0k`, I0; `GCLKk -> GCLKIN1j`, I1 of the pair's
  other buffer), their select from the constant 1 (`VCC_WIRE -> SELDUBk`) or the fabric (`SELDUB_…
  _IOIS_Gn_B3 -> SELDUBk`) and out of them (`GCLK_PWOk -> GCLKH_MAINk`) **set no bits**. Stage F's
  values (`GCLK0 -> GCLKIN00` 6,24 6,29; `VCC_WIRE -> SELDUB7` 6,47 7,45) came from removing these
  switches (`gen-pipdrop.mjs`): a buffer's input pin left without its route makes bitgen set other
  bits. That was the "dependency on the other inputs used".
- **The inputs of the eight lines** (from the I/O tiles: pads or the fabric; from the XC3S1200E's
  side DCMs) one bit each, as measured before, but for `CLKR_DN_IOIS_F4_B3 -> CLKR_GCLK7` (20,2: it was
  empty, the bit of the XC3S500E's dcmall) and three side-DCM inputs measured now (`gen-pipdrop.mjs` on
  #46's XC3S1200E design: `CLKL_OUTB3 -> CLKL_GCLK7`, `CLKL_OUTT1 -> CLKL_GCLK1`, `CLKR_OUTB1 ->
  CLKR_GCLK5`).
- **A BUFGMUX that switches**: one bit per buffer, its select not inverted (`BUFGMUX_XxYy:SINV:S`, as
  on the top and bottom buffers; I1_USED none: xdl variants of SINV and I1_USED on one design), at
  the same place on the four devices: CLKL 4,-20 5,-62 4,-21 5,-61 4,44 5,2 4,43 5,3 for Y2-Y9, CLKR the
  same bits two frames earlier. A BUFG's settings (USED, SINV:S_B, I0_USED, DISABLE_ATTR:LOW) none.
  (ISE's map refuses a BUFGCE on a side buffer.)
- **The centre tiles** (`GCLKVML` / `GCLKVMR`: `GCLKLRk -> GCLKVMLR_GCLK_UPk / DNk`, a side line into
  the upper or lower quadrant of its half): the 11 not measured before (`gen-branch.mjs` on the design
  of the 16 side buffers, `learn-single.mjs` on the random designs); the left and right tiles have the
  same bits.

`measured/fix-24side-bufg.json`, `measured/learn-11side-bufg-pips.json`. With them all 28 designs and
the earlier ones with side buffers (bufgside, the DCM designs of the XC3S500E) are byte-identical to
ISE's bitgen, CRC on and off, but for the XC3S1200E's long-line splitters (`a =- b`, direction unknown).

**What placement needs to use them** (packages/silinx-fpga/src/fpga/place.js, not changed here): each side has eight
buffers, `BUFGMUX_X0Y(2+k)` / `BUFGMUX_X3Y(2+k)` on line k (k = 0-7), each reaching only the
flip-flops of its half of the chip (left / right: `route.js clockReach` gives that from the known
switches). In each half, the centre tile (`GCLKVML` / `GCLKVMR`) drives line k of the upper and of the
lower quadrant either from the top / bottom buffers (`GCLKCOREk`) or from the side buffer k
(`GCLKLRk`), not both: a side buffer k and the top / bottom buffer on line k cannot both clock
flip-flops in the same quadrant of that half (the open flow with twelve clocks fails in routing for
that reason: `GCLKVMLR_GCLK_UP1` driven by both). The input of a side buffer comes from the I/O
tiles beside the clock tile (`CLKL_UP_IOIS_F*_B3`, `…_DN_…`: a pad of the side's clock inputs or the
fabric) or, on the XC3S1200E, a side DCM. A BUFGMUX that switches (I1, S) is refused by the packer
on every buffer still; the database has its bits now (since #846 the open flow builds it: a switch is
kept off the other buffer of its pair, whose I0 line is its I1).

Runtime #45: 30 designs implemented from HDL (two with BUFGCE refused by map), 3 + 8 xdl + bitgen runs,
about 30 minutes of wall time.

**DCM: CLKIN from a global buffer, the frequency synthesizer idle** (#47 found `DCM:CLKIN:GCLK` and
`DCM:DFS:OFF`, derived at load time by `db.mjs` on the top / bottom DCMs): confirmed on every DCM of
the four devices, the XC3S1200E's side DCMs included (`gen-dcmhdl.mjs` with `clkBufg` and `NOFX`: the
DCMs' CLKIN from a BUFG, CLKFX unused on every other DCM, then on the others; 12 designs implemented by
ISE): byte-identical to ISE's bitgen, CRC on and off (the XC3S1200E's but for its long-line
splitters), now in the database (`measured/fix-25dcm-routed.json`, mirrored). The same designs gave
153 more PIPs of the DCM tiles (`gen-pipdrop.mjs`, 168 runs; `measured/learn-13dcm-routed-pips.json`).
With them a DCM output reaches more global buffers (`bufgReach`: CLK0 of the top-left DCM also
X1Y11) and the placer's choices change (the DCM fixtures of the open flow and blinky checked again:
byte-identical). The side buffers stay out of the placer's reach (`knownRouting` `allowBufg`: not the
CLKL / CLKR tiles) until it keeps a side buffer and the top / bottom one of the same line apart.

**#44: the IOB registers and the input delays.** The I/O registers' settings (input, output and
tristate flip-flops, DDR registers, their clock / enable / set-reset / data inverters, initial values,
synchronous or not) and the input delays are **bits of each pad's own**, near the pads like the I/O
standards' bits: removing one setting at a time from ISE's designs (`gen-sitedrop.mjs`) gave patterns
that differ from pad to pad of one tile type, and some settings' bits depend on others (a register
without a clock enable sets a bit of its own, as a slice's). Measured per pad on every bonded pad of
the four devices:

- **Designs** (`gen-iobreg.mjs`, implemented by ISE from HDL): ri (every pad an input register; the
  registers' kinds cycle: clear + enable, synchronous reset + enable, synchronous set, falling edge),
  ro / ro2 / ro3 (every pad that can drive one an output register, a third of them with a registered
  output enable too, a different third in each), rd / rd2 (IDDR2 on inputs and ODDR2 on outputs,
  alternately), rb (every pad a direct input): 28 designs.
- **Variants** (`gen-iobrand.mjs`, xdl + bitgen): every register's settings at random (only the
  settings of pins the design uses: nothing that changes the routing), the input delays at random or
  rotated through every value (`setDelay`: written as ISE's map writes each value, with the delay line's
  elements, else xdl's DRC refuses them; IFD_DELAY_VALUE 0-6 (ISE's map writes 7 and 8 as 0; from 5 on
  with the PRE_DELAY element) and IBUF_DELAY_VALUE 0-12 (from 8 on with PRE_DELAY), measured with
  designs of every value implemented by ISE).
- **Features** (`packages/silinx-fpga/src/fpga/bitgen.js iobRegFeatures`, the writer's names, all of the pad: `@M11`): the
  input register's delay (`IFD:DLY3`, with the delay line's multiplexers and elements), a direct
  input's (`IBUF:DLY5`), a registered output or tristate path (`OMUX:OFF1`, `OMUX:OFFDDR`,
  `TMUX:TFF1` and their inverters and DDR multiplexers), a direct output inverted (`O1INV:O1_B`), every
  other register setting (`R:IFF1_SR_ATTR:SRLOW`…) and the parts of a used register group left out
  (`R:ICEINV:#OFF`, `R:IFF2:#OFF`…).
- **Solved** (`ana-iobreg.mjs`): each design written with the register settings left out, every bit
  where ISE differs explained by the settings of the pads near it (the values of one setting that
  are each there only where the bit is and together exactly where it is: a delay line used is set by
  DLY1-6; else the fewest settings that are). All of the about 23 600 bits found are explained (training:
307-382 designs per device).
  The I/O tiles' clock pins from global line 4 the database lacked (34 PIPs, `gen-pipdrop.mjs` on rd /
  ro of each device, `measured/learn-12iob-clk-pips.json`) come first, else their bits would be taken
  for a register's.

**Validation.** The designs the features were solved from are byte-identical to ISE's bitgen (the
XC3S1200E's but for its long-line splitters). Designs held out (new random variants of the same bases,
not used to solve): with the registers' settings at random and the default input delay, all 112 (28 per
device) are byte-identical (the XC3S1200E's but for its long-line splitters; variants with the CRC off);
with random input delays too, about 60 % byte-identical and the others with wrong bits: the delay of a
pad interacts with its neighbours' (a bit set for some combinations of two pads' delays), which the
per-pad model does not hold. So the database keeps only **the delay ISE's map chooses by itself**
(IFD_DELAY_VALUE AUTO: DLY2 on the XC3S100E, DLY3 on the others; a direct input without delay): a design
with another input delay is refused (`IFD:DLY5`, `IBUF:DLY4`… not in the database). Coverage: a
setting measured on a pad only in the combinations the designs gave it (the registers' kinds cycle with
the pad's index): a register without a clock enable, for instance, is measured on about half the pads;
on the others it is refused.

**The Silinx toolchain (#96):** the packer puts input, output and output-enable registers in the IOBs on
request (`IOB = TRUE`; none by default, as ISE's flow runs map -pr off), with tristate outputs (OBUFT); the
placer keeps a port with IOB registers and no LOC on a pad where its settings are measured
(`knownRouting(db).allowPad`). Not done: IDDR2 / ODDR2 (`OMUX:OFFDDR` and the second registers are measured
on most pads, but the exact settings ISE's map writes for them are to be read from the XDL of rd / rd2, and
`IFFDDRBLACKBOX` is not measured), a tristate enable from the fabric (`TMUX:T1`) and bidirectional pads
(`IO:<standard>`), never measured. Input delays other than the default, and the register kinds not
measured on a pad, are refused.

Runtime #44: 30 designs implemented from HDL, about 1 900 xdl + bitgen runs (variants, site drops,
PIP batches), about 5 hours of wall time with two containers.

### The pads' dedicated paths to every DCM's CLKIN (2026-10-19, #92)

Until now only B8's path to the top-left DCM was known (`CLKT_CKI4 -> CLKT_DLL_CLKPAD4`, `DCM_DLL_CLKPAD0 ->
DCM_CLKIN`): any other DCM's CLKIN came from its pad through general routing, with a warning. `dcm-pads.mjs`
lists every pad's dedicated path to a DCM's CLKIN on a device (no general routing, no route-throughs) and the
switches on it the database lacks: 18 / 34 / 34 / 66 on the XC3S100E / 250E / 500E / 1200E (8 / 16 / 16 / 32
paths, 1 known). `gen-dcmpad.mjs` writes designs whose DCMs take CLKIN each from one of its pads, round r the
r-th pad of every DCM (4 rounds per device, every path once); `measure-92.sh` implements them with ISE, removes
every PIP by codewords (`gen-pipdrop.mjs`, 20 variants), and solves them (`ana-pipdrop.mjs`, `pips-to-db.mjs`):

- **The DCM tile's input multiplexer**: `DCM_DLL_CLKPADk -> DCM_CLKIN` (`DCM_H_DLL_CLKPADk` in the
  XC3S1200E's side DCMs) sets bit `5,(35 - k)` and the bit shared by the four, `5,36`, relative to its tile, in
  every DCM tile type of the four devices (B8's, measured before, is k = 0).
- **The clock tiles' and I/O tiles' switches** (`CLKT_CKIi -> CLKT_DLL_CLKPADj`, `CLKB…`, the `_LL` tiles of the
  XC3S1200E, `I1_PINWIRE -> IOIS_IBUF1` of the bottom tiles, the side I/O tiles' `IBUF0 / 1`): no bits.
- The same designs routed a few other switches the database lacked (the DCM tiles' fabric inputs to PSCLK and
  G1_B1-3, the XC3S1200E's side DCMs' CLK0 and CLKFB), measured with them: `measured/learn-15dcm-pad-pips.json`
  (117 features, the same bits on every device that has the type).

With them the 16 designs are byte-identical to ISE's bitgen (CRC on and off), the XC3S1200E's but for a bit
of its long-line splitters, and every pad's path to every DCM is known (`dcm-pads.mjs`: 72 paths, 0 unknown).
**The placer** (`packages/silinx-fpga/src/fpga/place.js` `DCM_PAD`) gives a clock with no LOC the pad ISE's placer gives it (designs
of one DCM on each site, the clock free, implemented by ISE: A9 / M6 on the XC3S100E, C8 / A9 / N5 / M6 on the
XC3S250E, B9 / A10 / V9 / U10 on the XC3S500E and the top / bottom DCMs of the XC3S1200E, K3 / J4 / K13 / J15 on
its side DCMs: the second pad of the top DCMs' paths, the first of the bottom ones', but J15), else the first
free pad of a path; no DCM's CLKIN goes through general routing any more. `test/fixtures/open-flow/feat_dcm_pads`
(Nexys2-1200: B8 to the top-left DCM, the clock socket U9 to the bottom-left one) and the no-constraint DCM
projects of `test/open-flow.test.js` pass `scripts/check-open-flow.mjs` (DRC clean, byte-identical).

Runtime: 16 designs implemented from HDL and 336 xdl + bitgen runs (about 25 minutes), 18 more designs
implemented for ISE's choice of pad (about 7 minutes).

### The DCMs' output multiplexer (2026-10-21, #2)

The Clocking Wizard (#793) found DCM outputs that reached no global buffer on switches of known bits (`bufgReach`): the
XC3S100E's top DCM's CLKDV and CLK90, the XC3S500E's DCM_X0Y1's CLKFX180. The placer then took another DCM, which the
board's clock pad reached through general routing only. A DCM drives its four global buffers through four lines of
its output multiplexer (`DCM_<output> -> OMUXk`, k = 10, 11, 12, 15, each line reaching one buffer on a dedicated
path). Of the 9 outputs x 4 lines, 194 switches of the 8 DCM tile types were not in the database: on the XC3S250E,
80 of its 144 (DCM, output, line) pairs.

- **Designs** (`gen-dcmomux.mjs`, implemented by ISE from HDL): every output of every DCM through each line of its
  multiplexer. Each round has every DCM it can (its CLKIN from its first clock pad, `dcm-pads.mjs`), CLK0 on a BUFG as
  its feedback and up to three other outputs, each on a BUFG LOC'd on the buffer the chosen line reaches. The pairs
  not measured yet come first, CLK0 trying each free line in turn. The bits are the tile type's, the same on every
  device, so 21 designs of the XC3S250E (the four corner types) and 14 of the XC3S1200E's side DCMs (`DCMS`, the four
  `DCM_H_` types) do: no pair left unscheduled.
- **Measured** (`measure-dcmomux.sh`): every PIP of each routed design removed by codewords (`gen-pipdrop.mjs`, 20
  variants, 700 xdl + bitgen runs), `ana-pipdrop.mjs`, `pips-to-db.mjs`. Kept in `measured/learn-16dcm-omux-pips.json`:
  the DCM tiles' and the clock tiles' switches (250 features: the multiplexer, the clock tiles' and centre tiles' global
  lines, the side clock tiles' inputs from the side DCMs: `CLKL_OUTB1 -> CLKL_GCLK5`, `CLKR_OUTT1 -> CLKR_GCLK1` one bit
  each). The fabric's other switches these designs routed were left out (three of them, a CLB's `Y2 ->`, had different
  bits on the two devices).
- **Result:** the 35 designs are byte-identical to ISE's bitgen, CRC on and off (one of the XC3S1200E's but for a bit
  of its long-line splitters, `CLKT_LL ... LH19`, as before). Every output of every DCM of the four devices reaches its
  four global buffers on known switches (`gen-dcmomux.mjs --list`: 72, 144, 144, 288 pairs, 0 unknown). On the
  XC3S100E the Basys2's clock pin B8 is still a dedicated clock pad of no DCM (#92 measured them all): its CLKIN goes
  through general routing, said.

Runtime: 35 designs implemented from HDL (about 4 minutes), 700 xdl + bitgen runs (about 2 hours).

### The IOB registers' kinds on every pad, the tristate enable from the fabric (2026-10-20, #96, #97)

#44's designs cycle the registers' kinds through the pads (`gen-iobreg.mjs`: clear + enable, synchronous reset +
enable, synchronous set, falling edge), so each kind was measured on a quarter of the pads; the plain register (no
clock enable, no set / reset: the open synthesis's usual kind, #96's packer) was refused on about three pads in four,
and the tristate output's enable from the fabric (`TMUX:T1`) was never measured. `measure-iobrot.sh` adds the
designs with the kinds moved by 1-3 pads (`--rot k`: rik, rok) and `rt` (every output pad a tristate output, its
enable from a flip-flop kept out of the IOB), implemented by ISE, with 24 random variants each (`gen-iobrand.mjs`).

- **Solved together with #44's designs.** Solved alone, the new designs give each bit to settings that differ from
  #44's on about 10 % of the features (the settings that always occur together share their bits one way or
  another); #44's numbers and the new ones do not combine (wrong bits on most new designs). #44's designs were not
  kept, so its seven bases (ri, ro, ro2, ro3, rd, rd2, rb) were written again by the same script and implemented
  by ISE, and `ana-iobreg.mjs` solves all 14 designs at once: 334 designs per device, every bit explained; the
  register features of the database are replaced by that solution (about 90 % of #44's keep their bits).
- **Checked.** Every one of the 334 designs per device, and 26 held out (2 more random variants of each design but
  rb, not used to solve, the IDDR2 / ODDR2 ones too), byte-identical to ISE's bitgen on the XC3S100E, 250E and
  500E; on the XC3S1200E every differing bit is one of its long-line splitters'. With 8 variants per design instead
  of 24, about one held-out design in five had wrong bits (the DDR ones mostly): #44 had used about 24 too.
- **Coverage**, with rtek0-3 (every output pad's enable registered, the four kinds) and rio, rio1-3 (ri with its outputs
  on the last pads: the eight that drive ri's outputs never had an input register): every register kind on every pad of
  the four devices: the plain input register on 80 / 89 / 229 / 247 pads (every pad with an input register) and the
  plain output and output-enable registers and `TMUX:T1` on 72 / 85 / 176 / 194 (every output pad), XC3S100E / 250E /
  500E / 1200E; 970 designs per device with the delay variants below, every bit explained, every one byte-identical to
  ISE's bitgen.
- **The packer** writes an output register as ISE's map does, with `O1_DDRMUX::1` (and `PCICE_MUX::OCE` with a clock
  enable): xdl -xdl2ncd refused it without on P6 / P7 of the XC3S250E-CP132. `test/fixtures/open-flow/feat_iob_plain`
  (Basys2-250: plain input and output registers, the enable from the fabric and from an IOB register) passes
  `scripts/check-open-flow.mjs` (DRC clean, byte-identical); an input register on a left or top pad did not yet
  (#671, below).

### Every input delay on every pad but the clock pins (2026-10-20, #97)

#44 kept only the delay ISE's map chooses by itself (DLY2 on the XC3S100E, DLY3 on the others): with random delays,
about 40 % of its held-out designs had wrong bits, which it read as an interaction between neighbouring pads.
`gen-iobdly.mjs` gives, on ISE's routed ri (input registers, IFD_DELAY_VALUE 0-6) and rb (direct inputs,
IBUF_DELAY_VALUE 0-12), every pair of values to the pads of each I/O tile (K x K variants: 49 / 169), each tile's
sequence of its own (no two tiles' pads with the same values), and `ana-iobdly.mjs` classifies every bit that changes:
**every one follows a single pad's delay** (288 / 288 and 370 / 370 on the XC3S100E), none the pair's. So the per-pad
model holds; #44 had too few values per pad. The delay variants (and those of rio, rbo: the eight pads ri and rb use
as outputs) are solved with the registers' designs (`ana-iobreg.mjs`, every delay kept: 970 designs per device, every
bit explained, every solved design byte-identical to ISE's bitgen).

**But for the global clock pins.** Held-out designs with every pad's delay at random (`gen-iobrand.mjs --delays`, seed
9) had wrong bits only on the pads with a dedicated path to a global buffer (32 on the CP132, 34 on the FG320:
`route.js bufgReach`): bits of the clock tiles (CLKT / CLKB / CLKL / CLKR) that depend on their delay. Those pads keep
only the delay ISE's map chooses (their other delays refused); on every other pad all of IFD_DELAY_VALUE 0-6 and
IBUF_DELAY_VALUE 1-12 are in the database. Then every design, solved or held out, is byte-identical to ISE's bitgen or
refused (a clock pin's other delay), never wrong (the XC3S1200E's but for its long-line splitters).

### The SRLC16E cascade between the SLICEMs of a CLB (2026-10-21, #2)

`gen-cascade.mjs` writes two designs per device: srl, 8 chains of 4 SRLC16E (each one's Q15 into the next one's D,
each stage read at a variable tap), and mult, a column of 4 MULT18X18SIO (each one's BCOUT into the next one's BCIN,
B_INPUT = CASCADE); `measure-2.sh` implements them with ISE on the four devices and removes every PIP by codewords.
ISE's map packs a chain of 4 on the two SLICEMs of a CLB: G then F of the upper one (F's data G's last stage through
SHIFTIN, DIF_MUX = SHIFTIN), its SHIFTOUT (SHIFTOUTUSED) into the lower one's SHIFTIN (DIG_MUX = SHIFTIN, the CLB's
switch `SHIFTOUT2 -> SHIFTIN0`), then G and F of the lower one. **None of these sets a bit**: every bit of ISE's
bitstreams is explained by the database's other features (`check-writer.mjs`, the four devices), and removing the
switch changes none (`measured/learn-16srl-cascade.json`). The multiplier cascade was in the database already (its
bits equal ISE's on the four devices).

The packer (`packages/silinx-fpga/src/fpga/pack.js`) now packs SRLC16E chains through Q15 as ISE's map does (up to 4, a macro of the two
slices for the placer, the SHIFTOUT -> SHIFTIN net); the lower slice's SHIFTOUT leaves the CLB only through XB (not
measured), so a longer chain, or Q15 into anything but the next shift register's D, is refused.

The multiplier cascade too: a MULT18X18SIO with B_INPUT = CASCADE takes B from the BCOUT of the multiplier below,
BCINk from BCOUTk on the block-RAM column's switches `MULT_CCARRY_BCOUTk -> MULT_CARRYB_BCOUTk` (the routing graph:
the site above, MULT18X18_XxY(y + 1), on every device), as ISE's map builds it; B is left open (connected, ISE's DRC
warns: PhysDesignRules:1135). The placer puts
a chain on consecutive sites of a column and keeps it there; BCOUT into anything but the BCIN of a cascading
multiplier is refused.

### The XC3S1200E's other long-line splitters (2026-10-21, #709)

Besides CLKH_LL's (stage F, #23), the XC3S1200E joins the halves of its long lines in seven more tile types:

- **CLKV_LL** (the centre column, one tile per row), **CLKT_LL** / **CLKB_LL** (its top and bottom tiles): the
  horizontal long lines LH0-23 across the centre column, `CLKV_LLL_LHk -> CLKV_LLR_LHk` and back;
- **CLKL_IOIS_LL** / **CLKR_IOIS_LL** (the I/O columns, centre row) and **CLKLH_DCM_LL** / **CLKRH_DCM_LL** (the side
  DCMs' columns, centre row, which the issue did not name): the vertical long lines LV0-23 across the centre row.

Measured with `gen-pipcover.mjs xc3s1200efg320-4 --types … --long 1`: a first pass of six rounds (`--k 8`, three of
them `--nosink 1`) measured 92 switches, and its search (up to 3 tiles from the tile under test) found no path through
the rest. The long lines are tapped every sixth tile, so a splitter's drivers and loads can lie 4-6 tiles away:
with `--radius 9` (`--radius 12 --nosink 1` for the 24 the router of the rounds reaches no sink from) every switch
is in a design. 40 more rounds, 360 designs (one direction of a line per tile and round, so two rounds per full
cover; the single-tile types again in rounds of their own, so that their codewords repeat in fewer tiles), about an
hour of ISE.

**The analysis** (`ll-splitters.mjs`, rewritten): a splitter's bit lies far from its tile (the centre column's in the
clock column's frame 3, the vertical lines' in the I/O rows at the top and bottom), and `gen-pipcover.mjs`'s codewords
repeat in tiles far apart, so `ana-pipdrop.mjs`'s rule (a bit to the nearest tile of its codeword) gave most of the
new rounds' bits to the wrong tile. Instead, each time a switch is in a round, the bits that change with its codeword
are its candidates, relative to its tile; its bit is the one candidate all its observations share (other tiles of
the type, other rounds with other codewords). The first pass, analysed again this way, gives the same 92 bits.

**Result** (`measured/ll-splitters-709.json`, merged into `packages/silinx-fpga/bitdb/xc3s1200e-tiles.json`): all 336 switches, one bit each,
no two of a type on one bit:

- CLKV_LL `-364,b` (the clock column's frame 3, the tile's row: LH0 62 / 61, … LH23 2 / 1), CLKT_LL and CLKB_LL the
  same frame and order in the top and bottom rows (16 bits further in the top one);
- the I/O columns' and the DCM columns' in the I/O row at the top (bits 1-3) or at the bottom of a frame of the
  column; the DCM columns' are CLKH_LL's switches on the same bits of the column's frames (all 96).

**The router uses them all** (`splitter`, as CLKH_LL's since #23; `build-db.sh` sets it on the eight types): bitgen
gives `a =- b` its direction from the device description, and the placer's delay table leaves out the splitter
types' own switches only (`knownRouting` `delayPip`; CLKV_LL's, CLKT_LL's and CLKB_LL's clock switches, which they
share with CLKV, CLKT and CLKB, stay in it).

**Checked against ISE**, its bitstreams of earlier XC3S1200E experiments (held out: the IOB designs of #96 / #97, the
DCM pad designs of #92 and their PIP-drop variants, the DCM output-multiplexer designs of #862 and theirs; 1427
designs): 480 byte-identical (150 before), none with a splitter unknown (505 before). The rest differ by settings the
database refuses (the input delays of #97, 542) or by one or two bits of the top I/O tiles' register clocks that main
has too (405). The open flow on the design corpus: below in research/s3e-route/README.md.

### The I/O registers' clocks from every global line (2026-10-21, #671)

`feat_iob_plain` with an input register on a left or top pad was DRC clean but 3 bits from ISE's bitgen. Two causes:
the horizontal clock rows of the I/O columns (GCLKH_PCI_CE_S / _N) took GCLKH's bits at GCLKH's frames, and the router
brought the top pad B4's register clock through general routing (`W2END4 -> IOIS_CLK0`; ISE's bitgen also set 3,71 of
the tile, which no switch changed: B4's own bit, below) although a global path of known bits was there: the clock search
kept to the GCLK wires and the sink, and an I/O register's clock pin is one switch further (`GCLKk -> IOIS_CLKj ->
ICLK1x`).
Besides, the left and right I/O tiles' clock pins were measured from line 4 only (#44).

`measure-671.sh`: rd and rd2 of `gen-iobreg.mjs` (IDDR2 / ODDR2 on every pad: every clock pin of every I/O tile) with
their clock buffer on each of the eight top and bottom BUFGMUXes in turn (`--bufg`: line k from BUFGMUX_X2Y1, X2Y0,
X1Y1, X1Y0, X2Y11, X2Y10, X1Y11, X1Y10, the same sites on the four devices), implemented by ISE, every PIP removed by
codewords (`gen-pipdrop.mjs`, 20 variants), solved (`ana-pipdrop.mjs`, `pips-to-db.mjs`): 48 designs and 1 008
xdl + bitgen runs on the XC3S250E (every bonded pad), the XC3S100E (a right-side tile's third IOB, K13, which the
XC3S250E does not bond) and the XC3S1200E (the RIBUFS_BRK pads); about 2 hours of wall time with two containers.

- **The switches the database had** (2 037 / 2 009 / 3 435 features on the XC3S100E / 250E / 1200E): the same bits,
  but for 7 far bits of the XC3S1200E's long-line splitters' and the clock rows below.
- **The I/O columns' clock rows** have GCLKH's 16 switches, every one in every row and on the three devices: in the
  right column at GCLKH's frames, in the left one **2 frames further** (the column's two extra frames come first;
  the writer had them 2 frames early there: GCLKH_PCI_CE_S_X0Y5 `GCLKH_GCLK4 -> GCLKH_GCLK_DN4` is frame 12, bit 2335,
  not 10). The layouts give these two types a column start of their own (`typeCols`, `gen-layout.mjs`): the left
  column's first frame + 2, the right one's.
- **The side I/O tiles' clock pins from every line**: `GCLKk -> IOIS_CLKj` (and `GCLKk_BRK` in the break rows'
  tiles), 3 bits each, the same in every tile type of a side, the right side's the left side's 2 frames earlier (50
  of 50 measured on both): 1 078 features given to every I/O tile type of their side (as `unify-io.mjs` shares the
  switch box), with 8 inputs of the clock tiles' CLKDUB the designs' clock pad took (CLOCK_DEDICATED_ROUTE = FALSE):
  `measured/learn-16iob-clk-lines.json`. What stays unknown are the third sites of the BRK tiles, which no package
  bonds.

**Two kinds of bits in the pads' own features** (#44 / #96's solution, from designs whose registers were all clocked
from line 4 and where both pads of every I/O tile had an input register), found by `scripts/check-open-flow.mjs` on the
designs below (DRC clean, but up to 7 bits from ISE's):

- **The clock rows' bits**: one pad of each clock row's group (B3, M2 on the XC3S250E) had in its `R:REVINV:…` line
  4's clock-row bits at the wrong frames cleared and at the right ones set: the writer's error, made up for. With a
  register on line 5 they cleared line 5's bits. `pad-clock-rows.mjs` removes every bit of the I/O columns' clock
  rows from the pads' features (24 / 42 / 48 / 12 bits on the XC3S100E / 250E / 500E / 1200E).
- **`R:ICLK2INV:#OFF`'s bits** (4 / 4 / 28 / 24) went to a pad other than their own: the other pad of the tile (the 3,71
  of TIOIS_X3Y35 the issue saw is B4's, given to C4) or a pad of the next tile (C17's to B18). Two designs per device, an
  input register on only the first, then only the second, pad of every tile where such a bit lies: each bit set in
  exactly one, by its owner (`measured/fix-27iclk2-owners.json`, applied by `pad-owners.mjs`; both scripts run at the
  end of `build-db.sh`).
- 5 bits of `IFD:DLY3` on the XC3S500E / 1200E that ISE set only when both pads of a pair had an input register:
  solved below (#751).

**The Silinx toolchain:** the router's clock search also takes an I/O tile's IOIS_CLKj on its way to the sink (a node
with a switch straight into it, as a DCM's CLKIN), and `knownRouting` never offers a switch from general routing into
IOIS_CLKj (ISE clocks the IOBs from the global lines); the packer keeps out of the IOB a register whose clock is not on
a global buffer (with a warning). The two IOBs of an I/O tile share each clock wire (`IOIS_CLK1 -> OTCLK10 /
OTCLK11`): two registers of one tile on different clocks do not route (#749). `feat_iob_plain` (its registers on pads
of the four sides) and `feat_iob_lines` (new: eight global clocks, lines 0-7, each clocking IOB registers of left and
right pads; on the four devices with pads of each picked by `test/ise/open-flow.test.js`) and the lone-register designs
pass `scripts/check-open-flow.mjs`: DRC clean, byte-identical to ISE's bitgen (CRC on and off).

### The input delays with each pad used on its own (2026-10-21, #751)

#97's delays were solved from designs where **every** pad had an input (ri: every pad an input register, rb: every pad a
direct input), so two pads always used together could not be told apart: a bit of one pad's delay could go to its
neighbour's. #671's lone-register designs found five such bits on the XC3S500E / 1200E, and designs with only some pads
used (`gen-padrand.mjs`: every pad unused, an output, an input register or a direct input at random, with random
delays; a design per kind pattern written by the open flow, then ISE's xdl -xdl2ncd + bitgen) found more on all four
devices: 15 / 1 / 44 / 48 bits differing from ISE's bitgen in 8 designs of the XC3S100E / 250E / 500E / 1200E, nearly
all bits of the pads' `IFD:` / `IBUF:` features, many in two neighbouring pads' at once.

- **The issue's five bits** (`gen-pairdly.mjs`: the pad, the input-only pad next to its I/O tile and the tile's other
  pad at every kind and every pair of delays, 623 designs per device): each is the **input-only pad's** (the IBUFS tile
  next to the I/O tile), never the other's. 46,31 (47,31 on the XC3S1200E) is A3's register at any delay (TIBUFS_X2Y47,
  given to B3); 538,356 is D18's IFD_DELAY_VALUE 1-3 and IBUF_DELAY_VALUE 1-5 (RIBUFS_X35Y42, given to E17 too, whose
  own bit is 538,420); on the XC3S1200E 767,740 and 767,996 are E17's and E18's (given to F14 and G13). ISE sets each
  as that one pad's setting, whatever the other pads do.
- **Every pad** (`gen-paddly.mjs`, two rounds per device, the designs' output pad moved between them so that it is
  measured too): 8 base designs, each pad an input register in 3, a direct input in 3, unused or an output in the
  others, in an order of its own; 11 variants of each giving every input pad a delay, every value about as often
  on every pad. `ana-paddly.mjs` gives each bit that changes between variants, and each bit the database gave a delay,
  to the one pad whose state (kind and delay) it is a function of; where several pads fit (two pads' kinds together in
  every base), the one the database gave it to, then the nearest. Solved from 184 / 184 / 822 / 830 designs: every bit
  one pad's, none ambiguous; 1 199 of the 10 051 delay features change (134 / 7 / 535 / 523), the rest are #97's.
  `measured/fix-28-pad-delays.json` lists the changed features, `pad-delays.mjs` applies them (at the end of
  `build-db.sh`).
- **Checked**: the 2 052 designs of the five rounds byte-identical to ISE's bitgen, the 32 held out (`gen-padrand.mjs`,
  new seeds, not used to solve) among them; before, every random design of the XC3S100E, 500E and 1200E differed. The
  global clock pins keep only the delay ISE's map chooses (#97). The board test `feat_iob_lone` (input registers on B3,
  E17, F14, G13 with their neighbours unused, on the XC3S500E and XC3S1200E) passes `scripts/check-open-flow.mjs`.
- The packer writes only the delay ISE's map chooses (DLY3, DLY2 on the XC3S100E) and direct inputs without delay, so
  in Silinx's own designs the difference was a lone input register (#751's five bits); the other delays matter for an
  XDL read with them.
- Still open: a bit of an IDDR2's second register (`R:IFF2:#FF`, U11 of the XC3S500E, 349,3078) that ISE sets only
  with the other pad of the tile registered too (#96's IDDR2 measurements).

### The side clock pads' dedicated paths (2026-10-21, #641)

`gen-sidepad.mjs` writes, per device, designs of the side clock pads (the pads whose graph reaches a side global
buffer), at most four of one side per design, each into a BUFG with no LOC: ISE's placer gives each pad its own
buffer (a pad LOC'd with its buffer elsewhere is `ERROR:Place:1018`). `measure-641.sh` implements them and removes
every PIP by codewords. ISE routes a pad on **its I/O tile's pin switch** (`I0_PINWIRE -> LIOIS_IBUF1`, no bits, as
the database had it) into the **side clock tile's `CKIk -> GCLKk`** (one bit each, the same on the four devices:
`measured/learn-17side-pad-pips.json`), not through the `IOIS_Yk -> IOIS_Fk_B3` switch #641 suspected. Two pads of
the XC3S500E / XC3S1200E (K2, K18) have no fast path to a side buffer (their designs failed with that error).

With those bits known, the nearest side buffer a side clock pad reaches on switches of known bits (`route.js
bufgReach`, breadth first) is, for each of the 58 measured, the one ISE gives it; the others it reaches go through its
OMUX into another pad's `IOIS_Fk_B3` (as a clock from the fabric does, #95). The pad's own `IOIS_Yk -> IOIS_Fk_B3` in
the CLK_PCI tiles (#641's switch: the shared CLB table's bits, none in ISE) is refused to the router (`noRoutePips`).
So the placer puts a clock on a side GCLK pin on its own side buffer, no longer on a top / bottom one through general
routing (#95's exception, with its warning).

### An IOB's second flip-flop alone (2026-10-21, #759)

The two IOBs of a differential pair (DIFFM / DIFFS) share each clock wire of their I/O tile: two registers of one kind
there on different clocks put the DIFFM's on its second flip-flop (IFF2 / OFF2 / TFF2, on the tile's second clock wire;
#749). The database had the second flip-flop's settings only with the first (the DDR registers'), so a LOC'd pair was
refused (`OMUX:OFF2`, `R:OFF1:#OFF`, `R:IFF1:#OFF`…). `measure-759.sh`:

- **Designs** (`gen-iobpair.mjs`): every pair of the device two registers of one kind, the DIFFS's on the clock pad's
  buffer, the DIFFM's on a buffer driven by a counter bit; `rpi0-3` input registers (the four kinds of gen-iobreg.mjs,
  moved by one pair in each), `rpo0-3` output registers, output-enable registers with the data straight from the fabric,
  or both, by turns. ISE's map put every DIFFM's register on its second flip-flop (34 / 40 / 91 / 98 pairs, XC3S100E /
  250E / 500E / 1200E), no warning; 8 random variants of each (`gen-iobrand.mjs`), 2 more held out.
- **Solved against the database** (`ana-iobreg.mjs --known`: the writer writes the settings the database has, only
  those it lacks on a pad are solved, a bit a new one clears written `!frame,bit`), with #96's IDDR2 / ODDR2 variants
  (rd, rd2), which have the second flip-flop with the first (`R:IFF2:#FF`, measured on 68 of the XC3S100E's 80 input
  pads before). Every pad bit explained on the four devices (280 / 336 / 765 / 815 bits); the features in
  `measured/pads-759-<device>.json`, merged by `build-db.sh`.
- **Checked:** solved first against the database before #751, a neighbour's delay bit went to the second flip-flop
  (A4's `R:IFF2:#FF` had C4's 564,11: the LOC'd pair below differed from ISE by it on the XC3S500E / 1200E); solved
  again against #751's delays, the held-out variants are byte-identical to ISE's bitgen but for the bits of switches the
  database does not have, outside the pads: the top clock tile's `CLKV_W2END7 / CLKV_E2BEG7 -> CLKT_CLKDUB3` (the second
  buffer's input from the fabric; frame 2 bits 17, 20, 21 on the XC3S250E) and, on the XC3S1200E, long-line splitters
  (`CLKV_LLL_LHk -> CLKV_LLR_LHk`…; its frame 445 bit 50 is a misplaced `R:ISR_USED:0` bit, given to its pad by #96's
  `ana-padowner.mjs`).

**The Silinx toolchain:** a LOC'd pair with registers of one kind on two clocks writes a complete bitstream (the placer's
warning of #749 is gone); pads without a LOC are still kept out of such a pair. `feat_iob_pair` LOC'd on two pairs of
each device: `test/ise/open-flow.test.js`.

### IDDR2 / ODDR2 and the bidirectional pads in the Silinx toolchain (2026-10-21, #96)

**IDDR2 / ODDR2.** Their bits were measured with the rest of the IOB registers (rd / rd2 above); the packer now writes
them as ISE's map does, read from its routed rd / rd2 on every pad: both flip-flops of the IOB (`<instance>/FF0` on C0,
`FF1` on C1), C1 = not C0 as `ICLK2INV::ICLK2_B` / `OTCLK2INV::OTCLK2_B` on C0's net (the inverter left out), an
IDDR2's set / reset parts always written (R on SR, S on REV, `SRLOW`), an ODDR2's the one of R / S used on SR (`SRHIGH`
for S), `OMUX::OFFDDR`, `OFFDDRBLACKBOX`; pins tied to a constant stay connected to it. Only `DDR_ALIGNMENT = NONE`
(C0 / C1 use the neighbouring IOB's registers: refused).

**IDDR2 on every pad** (`measure-iobddr.sh`). rd / rd2 had an IDDR2 on every input, but ISE's map trimmed those whose
outputs the design did not read (rd's XOR read the first ~90): the DDR input registers were measured on 68 / 85 / 142 /
158 pads of the XC3S100E / 250E / 500E / 1200E. `gen-iobddr.mjs`'s rdi0 / rdi1 read every output (an IDDR2 on every pad
in one of them), solved against the database (`ana-iobreg.mjs --known`, with #751's delays): 80 / 89 / 229 / 247 pads
(all but the clock pin and the two control inputs, the same pads in both designs). Their held-out variants, and rdi2 /
rdi3 (an IDDR2 on one pad of each I/O tile, its neighbour a plain input), showed **bits of a pad's IDDR2 that its
neighbour's features held** (U11's `R:IFF2:#FF` had T11's 349,3078 on the XC3S500E; C8's `R:IREV_USED:0` its tile
partner's…), as #751 found for the delays: the designs always registered both pads of a tile. `ana-padowner.mjs` gives
each bit any design gets wrong to the one register feature present exactly where ISE sets it (1 / 0 / 11 / 12 bits),
the features the single registers do not have first (R:IREV_USED, R:REVINV, R:IFF2…), then the pad nearest its old
holder: some are ties, between pads always registered together in these designs (B3 / A3's 45,29, D8 / F8 / F9's
178,49 on the XC3S500E). Then every one of the 150 designs per device (rd, rd2, rdi0-3, #759's) is byte-identical to
ISE's bitgen but for the switches the database does not have (the top clock tile's CLKDUB3 inputs, the XC3S1200E's
splitters); `measured/pads-96-iddr2-<device>.json`.

**Bidirectional pads (`IO:<standard>`, never measured before).** `measure-iobidir.sh`: designs with every pad that can
drive an output an IOBUF (`gen-iobidir.mjs`, one per standard; one pad in four with DRIVE = 4, SLEW = FAST or a
pull-up), implemented by ISE and compared with the writer (`ana-iobidir.mjs`). The union of a pad's `I:<standard>` and
`O:<standard>` bits was 2-3 bits off on every pad with the default drive: three bits of `I:<standard>` are the output
driver's (they belong to the `O:DRIVE:<n>` changes: an input pad's driver off). **`IO:<standard>` = `O:<standard>` and
`I:<standard>` but the bits of the standard's DRIVE changes**: every pad of the four devices byte-identical to ISE's
bitgen in LVCMOS33, LVCMOS25 and LVTTL, with every drive, slew and pull of the designs (72 / 85 / 176 / 194 pads). Kept in
`measured/pads-96-bidir-<device>.json`. LVCMOS18 / 15 / 12 are not in the database as outputs (`O:<standard>`), so not as
bidirectional pads either (ISE's par also refused the XC3S100E's designs of those, the clock's LVCMOS25 pad in their
bank: `gen-iobidir.mjs` now gives the clock the design's standard).

### Clock switching: a BUFGMUX with I1 and S, and BUFGMUX_1 (2026-10-21, #846)

- **The open flow builds a BUFGMUX that switches** (I0, I1, S: `packages/silinx-fpga/src/fpga/pack.js`, `place.js`): its settings as ISE's
  map writes them (`DISABLE_ATTR::LOW I0_USED::0 I1_USED::0 SINV::S GCLKMUX:<name>.GCLKMUX:`); the select inverter
  `SINV:S` of every buffer was measured in stages D and G, I1_USED and the switches into I1 (`GCLKk -> GCLKIN1j`) set
  no bits. The two buffers of a pair (`BUFGMUX_XxYy` and `XxY(y^1)`) share their input lines: buffer k's I1 is line
  k^1, the line of the other buffer's I0, so the placer keeps a switch off its pair's other buffer unless that one's
  I0 is the switch's I1.
- **BUFGMUX_1** (its output held high while it switches) is `DISABLE_ATTR::HIGH`: one bit per buffer
  (`measure-846.sh`: six designs of BUFGMUX_1 on one buffer of each pair, implemented by ISE for the XC3S250E, 30
  xdl variants; `measured/fix-29-bufgmux1.json`): CLKT 2,68 2,47 2,41 2,78 for X2Y11, X2Y10, X1Y11, X1Y10; CLKB 2,11
  2,32 2,38 2,1 for X2Y1, X2Y0, X1Y1, X1Y0; CLKL frame 0 and CLKR frame 19, bits -3 -5 -10 -11 4 3 2 1 for Y2-Y9
  (CLKR: -1 -2 -3 -4 8 9 3 2). ISE's two side designs are byte-identical to Silinx's writer with them; the top /
  bottom ones differ only by the switches from the fabric into CLKDUB / SELDUB that ISE's router took and the
  database lacks (the same bits in the base and in every variant).
- **Checked** (`npm run check:open-flow`): feat_bufgmux and feat_bufgmux_1 on the four devices (the measured bits
  at the same place on the XC3S100E, XC3S500E and XC3S1200E): byte-identical to ISE's bitgen, CRC on and off, no DRC error or warning, no
  warning of xdl2ncd or of the open flow.
- Runtime: 6 designs implemented by ISE (2 minutes), 30 xdl + bitgen runs (2 minutes), 8 checks of the open flow.

### The block RAMs' clocks and the clock pads' paths (2026-10-22, #2)

Found with the device's coverage, not in the issue's list: of the switches into the block RAMs' and multipliers' clock
pins (`GCLKk -> BRAM_CLKj` of the block-RAM interconnect tiles: BRAM1_SMALL's BRAM_CLK2 / BRAM_CLK3 are a RAMB16's CLKA /
CLKB, BRAM2_SMALL's BRAM_CLK0 a MULT18X18SIO's CLK) the database had 4 of 24, the lines the designs so far happened to
use. Of the eight top and bottom global buffers, two reached a CLKA and one a CLKB or a multiplier's CLK, so the placer
refused a design with two clocks on block-RAM ports B or on registered multipliers ("no block RAM site whose clock
pins the lines of … reach"). And of the sixteen dedicated paths from the global clock pads to those buffers
(`CLKT_CKIk -> CLKT_GCLKj`, `CLKB_CKIk -> CLKB_GCLKj`: two pads per buffer) it had 3.

- **Designs** (implemented by ISE from HDL): `gen-bramclk.mjs` gives every clock pin of every block RAM and multiplier
  the line of a switch not measured yet (eight clocks, each on a BUFG LOC'd on a top or bottom buffer, their pads
  through general routing: `CLOCK_DEDICATED_ROUTE = FALSE`); on the XC3S250E twice, the switches on other sites the
  second time, once on the XC3S1200E. `gen-clkpad.mjs` puts each buffer on each of its two pads (two rounds).
- **Measured** (`measure-bramclk.sh`): every PIP of the 10 routed designs removed by codewords (`gen-pipdrop.mjs`, 210
  xdl + bitgen runs), `ana-pipdrop.mjs`, `pips-to-db.mjs`. Kept in `measured/learn-18bram-clk-pips.json`: the 24
  block-RAM clock switches (two bits each, a row and a column of the tile's clock multiplexer: `GCLK0 -> BRAM_CLK2`
  `4,44 4,46`, … `GCLK7 -> BRAM_CLK2` `4,38 4,45`) and the 15 pad paths of CLKT / CLKB measured (one bit each), the same
  on both devices, the known ones as before.
- **Result:** every top and bottom buffer reaches every block RAM's CLKA and CLKB and every multiplier's CLK on the
  four devices, and every one of the sixteen pad paths is known. The 10 designs are byte-identical to ISE's bitgen
  (the XC3S1200E's with #709's splitters). `test/fixtures/open-flow/feat_bram_clocks` (four clocks, each on a block RAM's
  port B and a multiplier's registers) is refused with main's database and routes now, on lines 4-7. It and the
  fixtures of the block RAMs, multipliers and clocks (feat_bram, hard_prim, feat_mult, feat_mult_chain, feat_constmult,
  feat_const_bram, feat_const_mult, feat_clocks12, feat_manual_clock) are byte-identical to ISE's bitgen (CRC on and off),
  DRC 0 errors, 0 warnings.
- **The placer's choices that change:** a clock LOC'd on M4 / N9 (the bottom GCLK pin) takes its own buffer,
  BUFGMUX_X2Y1, on its dedicated path, also for block RAMs and multipliers (before: BUFGMUX_X2Y11 through general
  routing, with a warning, #56); feat_dcm_bufgin's clock goes on B7 / D9 and BUFGMUX_X1Y10 (before B8 / C8). Checked
  against ISE: the clock fixtures on the four devices (feat_dcm_bufgin, feat_clocks12), feat_constmult on M4, feat_dcm,
  feat_dcm_pads, feat_side_clock: byte-identical, DRC 0 errors, 0 warnings.

### A clock into the fabric (2026-10-24, #957)

A DCM output or a global clock read as data leaves its tile through the output multiplexer: the DCM tiles'
`DCM_<output> -> OMUXk` (other than the four lines to the global buffers, #862) and the clock tiles'
`CLKT_GCLK_MAINk -> CLKT_TO_OMUXj` (CLKB's). The database had a few of them (those ISE's routes happened to take), 636
were unknown: 288 on the XC3S250E's DCM and clock tiles, 348 on the XC3S1200E's side DCMs.

- **Designs:** #862's, which ISE routed (every DCM's outputs on global buffers), with each unknown switch added to the
  net that already drives its from-wire, as a branch that leads nowhere (bitgen programs every PIP of a net with
  pins), each output line of a tile once per design (`gen-clkdata.mjs`: 32 designs); two more ISE designs for the
  bottom DCMs' outputs none of #862's used (BR: CLK2X, CLK90, CLKDV, CLKFX; BL: CLK2X; four bottom buffers each).
- **Measured** (`measure-clkdata.sh`): every PIP removed by codewords (`gen-pipdrop.mjs`, 714 xdl + bitgen runs),
  `ana-pipdrop.mjs`, `pips-to-db.mjs`. Kept in `measured/learn-19clk-data-pips.json`: the 636 switches, one or two
  bits each (`DCM_CLK0 -> OMUX0` `6,60`), none against a switch the database had.
- **Result:** every DCM output's and every top and bottom buffer's switch into its tile's output multiplexer is known on
  the four devices. The 36 measured designs are byte-identical to ISE's bitgen; `feat_clock_data` (a global clock and a
  DCM output read as data) and the DCM and clock fixtures (feat_dcm, feat_dcm2, feat_dcm_fx, feat_dcm_phase,
  feat_clkwiz, feat_clocks12) are byte-identical, DRC 0 errors, 0 warnings. (Main routed such a design already, on the
  few switches it knew: the router now has every line, and ISE's own routings of these designs are byte-identical.)

### Register bits a neighbouring pad held (2026-10-24, #897)

ISE's bitstreams of #96 / #97's XC3S1200E register designs differed from the writer's by one bit or two that every
design had (frame 46 bit 29, TIBUFS_X2Y61; frame 354 bit 11, TIOIS_X22Y61). Both were bits of a pad's input register
that the database gave to a **neighbour's** feature: #96's `ana-padowner.mjs` and #759's solution worked from designs
that registered the two pads together, or against a database that did not have the bit yet.

- **Found** on 657 designs per device (`wrot`): 46,29 is set exactly when A3's register has a set / reset (184 designs);
  354,11 exactly when C9 and D9 have an input register at the delay ISE's map gives them (DLY3, 104 designs). One of
  those designs with each setting of A3, C9 and D9 removed in turn, and each PIP of their two tiles (`gen-padbits.mjs`,
  67 xdl + bitgen runs, `ana-padbits.mjs`): 354,11 goes with C9's IFD_DELAY_VALUE. (ISE's xdl -xdl2ncd puts ISR_USED
  back while the SR pin is connected, so A3's needed the next step.)
- **Measured** (`gen-padalone.mjs`, `ana-padalone.mjs`): an IDDR2 with R, then with S, on one pad alone, the other pads
  of the design far from it (xst, map and par with no warning), on the XC3S500E and XC3S1200E: A3 and B3, C9 and D9, B9
  and E9, C15 and A16, D13 and E12 (36 designs). Each bit is set by one pad's register only. The bits moved
  (`measured/fix-897-owners.json`, applied by `pad-owners.mjs` at the end of `build-db.sh`):
  - A3's `R:ISR_USED:0` and `R:IFF2:#FF` (46,29 / 46,30; 45,29 / 45,30 on the XC3S500E), held by B3's
    `R:IREV_USED:0` and `R:IFF2:#FF`; each goes to the feature it is in the input-only pads' layout (A8, G9…: ISR_USED
    at INIT0 − 3, IFF2 at INIT0 − 2), the first set with a set / reset alone in the 184 designs above;
  - C9's `IFD:DLY3` 354,11 (239,11), held by E9's `R:IFF2:#FF`, in another column;
  - B9's `R:IFF2:#FF` 369,49 (254,49), held by D9's; C15's 730,30 (501,30), held by A16's; on the XC3S500E D13's
    444,30, held by E12's.

  After the move no pad's register bit lies more than a few frames from its pad's own on either device.
- **Checked:** the 36 designs byte-identical to ISE's bitgen, and the 257 designs of #96 / #97 / #759 per device whose
  features the database has (801 with the others); before, 104 of them differed. The board test `feat_iob_owners`
  (IDDR2s on A3, C9, B9, C15 and D13, their neighbours unused) on the XC3S500E and XC3S1200E: DRC 0 errors, 0 warnings,
  byte-identical to ISE's bitgen (CRC on and off).
- The other designs of #897 (448 of 657) are XDL with input delays ISE's map refuses on the global clock pins (C9 / D9's
  IFD_DELAY_VALUE other than DLY3: the writer reports them as unknown features, #97); Silinx's packer writes only the
  map's delay there.

### The PIPs a tile does not have (2026-10-13, #74)

The database's PIP features are per tile type, and several types take another's: the I/O, corner,
block-RAM interconnect and DCM tiles have the CLB's switch box, the clock-row CLBs (CENTER_SMALL_BRK)
the CLB's features (`sameAs`). Not every tile of a type has every PIP its type's features offer: the
clock-row CLBs have no `GCLKk` (their clock lines are `GCLKk_BRK`), the CLBs of the top row and a few
others no `FX_S2` / `COUT_N1`, `COUT_N3` (nothing above them), the I/O tiles only part of the CLB's
switch box (`OMUX_W14 -> IOIS_STUB_F1_B3` of `LIOIS_PCI_X0Y16`, which ISE refused in the join tests of
research/s3e-device), and so on. `pip-exceptions.mjs` finds them all on each device's description
(built from ISE's `xdl -report -pips -all_conns`: the PIPs of every tile) and records them:

- `absent` of a type: the PIP features (`from->to`) and the wires (`GCLK0`: every PIP into or out of
  it) that none of its tiles has, in the type's wire names (an I/O tile's own `IOIS_F1_B0` is the
  CLB's `F1_B0`, `rename`); in `s3e-tiles.json` what every device's tiles miss, in
  `<device>-tiles.json` what one device's tiles all miss besides;
- `absentIn: [{ tiles, absent }]` of a type, in `<device>-tiles.json`: what only these tiles miss.

| Per type (every device) | Wires | PIPs |
|---|---|---|
| CENTER_SMALL_BRK (`GCLK0-7`), the horizontal clock rows' tiles of the block-RAM columns | 8 | 0 |
| I/O tiles (LIOIS…, RIBUFS…, TIOIS…, BIOIS…) | 96-108 | 422-452 |
| corners (LL, LR, UL, UR) | 140 | 250 |
| DCM tiles (and the XC3S100E's DCMAUX, the XC3S1200E's DCM_H) | 140 | 218-219 |
| block-RAM interconnect (BRAM0-3_SMALL…) | 140-148 | 0 |

Per device, only some tiles (`absentIn`): the CLBs with no `FX_S2` (20 / 34 / 42 / 54 on the XC3S100E /
250E / 500E / 1200E), no `COUT_N1`, `COUT_N3` (9 / 16 / 16 / 16; on the XC3S1200E 8 more with neither),
the clock column's tiles without the clock row's OMUX outputs (CLKV, CLKV_LL), the top and bottom I/O
tiles without `IOIS_IBUF0`; the XC3S100E's CLKT has no `CLKT_DLL_CLKPAD4` and its CLKV tiles no OUTL
wires. In all, 46 082 / 74 527 / 100 539 / 134 521 (tile, PIP or wire) facts per device, in 44 lists
of the shared file and a few per device. (With the pads' paths to the DCMs, #92: the top and bottom I/O tiles
without `IOIS_IBUF0` lack `IOIS_IBUF1` too, two `LIOIS_PCI` / `RIOIS_PCI` tiles of each side their `IBUF0 / 1`,
the XC3S100E's CLKT `CLKT_DLL_CLKPAD4-7`: 46 165 / 74 643 / 100 695 / 134 729 facts.)

**The router never takes them** (`packages/silinx-fpga/src/fpga/bitgen.js` `knownRouting`: `pipAbsent`). With ISE's own
descriptions (the shipped ones and those built from the user's ISE) the router only meets PIPs a tile
has, so no bitstream was wrong; a description built from the database's features per type (the
measured descriptions of research/s3e-device) offers them all. Shown on such descriptions
(`pip-exceptions.mjs --graph`: ISE's with the 26 498 / 27 784 / 27 784 / 28 656 missing PIPs between
two wires of a tile added): the examples blinky, pong and stopwatch on the four boards route, with the
exceptions, exactly as on ISE's descriptions (the same routed XDL and .bit), and
`scripts/check-open-flow.mjs` on them gives ISE's DRC 0 errors, 0 warnings and byte-identical .bit
files; without the exceptions the router takes 51 missing PIPs in 11 of the 12 designs (blinky on the
Basys2-250: `BIOIS_X13Y0 S2END3 -> IOIS_G3_B1`), which ISE's xdl -xdl2ncd refuses (`Could not find
arc`) and which would set the bits of another switch. Checked with ISE (the arc probe of
research/s3e-device, `pip-exceptions.mjs --probe`): ISE refuses every exception asked (each list of
a type in one tile of the type, on the first device that has the type, and every per-tile one: 12 382 /
2565 / 838 / 2554 on the XC3S100E / 250E / 500E / 1200E) and accepts every PIP the router may use in one
tile of each type (47 542 / 56 959 / 56 959 / 59 707).

### Rebuilding the database (2026-10-14, #48)

`build-db.sh` needed the folders of the stage A-E experiments, which were not kept; it also no longer
ran (it removed `packages/silinx-fpga/bitdb/s3e-tiles.json` before the analyses that load the database). The experiments are
now made again from nothing by `measure-db.sh`, with fixed parameters, on a machine with ISE's Docker
image (only Silinx's scripts' designs, the fixtures' HDL, and ISE's outputs left in the work folder,
never in the repository):

```
SILINX_FUZZ_HOST=user@host research/s3e-bitstream/measure-db.sh /path/W    # ISE: about 6-8 hours on one Intel Mac mini shared with other work
research/s3e-bitstream/build-db.sh /path/W                                   # seconds; rewrites packages/silinx-fpga/bitdb/ in place
node research/s3e-bitstream/diff-db.mjs <copy of the db before> packages/silinx-fpga/bitdb --resolved
```

| W | Experiment | ISE runs |
|---|---|---|
| `map/` | stage A: every slice numbered in its LUT, the empty design (`gen-map.mjs`) | 2 |
| `br1/` | block-RAM contents (`gen-bram.mjs`) | 17 |
| `io4/`, `io7/` | I/O settings per pad, per standard (`gen-iob.mjs --perpad / --perstd`) | 200 + 230 |
| `impl/`, `pips/pd-*` | the fixtures with block RAMs, a DCM, a BUFGMUX, distributed RAM and shift registers implemented by ISE, every PIP removed by codewords (`gen-pipdrop.mjs`, 20 variants; `bram_prim` and `mult` need more pads than the CP132 has: ISE's map refuses them, and they are not tried again) | 7 + 105 |
| `pips/k1` | the global clock tree (`gen-clock.mjs`) | 9 |
| `pips/c*` | test designs through the PIPs still to measure (`gen-pipcover.mjs --want`, rounds over the kinds of pins and lines; 22 of the 80 rounds reach some) | 9 per round |
| `pips/b*` | the rest as dead-end branches of those designs' nets (`gen-branch.mjs --want`; 11 batches) | 13 per batch |

The PIPs measured are those the committed database holds (`want-pips.mjs`: per type its own
features, one measurement serving the types that share a switch box), so that the rebuild can be
compared feature by feature. Kept as numbers in `measured/` (as the slice harnesses, learned and
corrected features already were): `pads-xc3s250e-cp132.json`, the pad features of #18 (I:NOLOAD) and
#44 (IOB registers, input delays: about 1 900 ISE runs, not repeated). `build-db.sh` now keeps each
file's description (`merge-db.mjs --reset-tiles / --reset-pads`), takes the graph from the device
description (no device report), writes the XC3S250E's LUT file too, and ends with
`pip-exceptions.mjs` (#74).

**Resuming.** Every step of `measure-db.sh` is skipped when its results are in `W`, and the rounds of
test designs count as they did when they ran (`pips/cNN/new`: the switches the round measured first;
`pips/cNN.txt`: a round without nets), so a run stopped half-way goes on as it would have. When the
local `W` is lost but the remote work folders are still there (`~/silinx-measure-db`,
`~/silinx-measure-db-impl` on the ISE machine), run `measure-db.sh` on a new, empty `W`: it writes the
same designs again (fixed parameters and seeds), and `fuzz-remote.sh` / `impl-remote.sh` reuse and
copy back the results the remote folder has **only for the same input** (the same `.xdl`, compared by
checksum; the same HDL and constraints for a design implemented by ISE); a design whose input there
differs loses its results there first and is run again. The ssh connections give up after 10 minutes
without an answer (a machine gone from the network stops the run, which can then be resumed).

**Result (2026-10-15).** The work folder of the first run was lost, its 581 remote results were not:
on a new `W`, 563 were reused (map, block-RAM contents, the I/O settings, the five `pd-*` batches, the
clock tree) and 18 discarded (rounds `c00`, `c01`: the earlier run's designs were not those the
committed scripts write); about 360 conversions were run anew (the rounds and branches after them, and
the three batches below again). Then `build-db.sh` and `diff-db.mjs --resolved` (bitgen's view: every
type's features with those it shares, `sameAs` / `shift` / `rename`):

- `xc3s250e-layout.json`, `-lut.json`, `-bram.json`, `-cp132-pads.json` and the other devices'
  layout, LUT, block-RAM and pad files: identical.
- `s3e-tiles.json`: of the 142 964 features bitgen resolves, every feature of the committed database is
  in the rebuild, all with the same bits but two (below); 94 more were measured (global line 4 into the
  I/O clock pins of every I/O tile type of the left and right sides, `GCLK4 -> IOIS_CLKk`, which
  `learn-12iob-clk-pips.json` had given to a few of them only; `GCLK5 -> BRAM_CLK2` of the block-RAM
  interconnect, `CLKT_CKI5 -> CLKT_GCLK1`, `I1_PINWIRE -> IOIS_IBUF1` of the top I/O tiles, no bits).
  The rebuilt file is now the committed one; a rebuild of it is identical (`22 files, 0 differ`).
- Two bits of the committed database were artefacts of the earlier measurements, now gone:
  `BIOIS / BIBUFS GCLK2 -> IOIS_CLK4` had `22,79` (the bit of the horizontal clock row, `GCLKH`, at
  the end of the tile's window: the top I/O tiles' same switch has `4,40 4,41 4,44` only) and
  `RIOIS… S6D4 -> IOIS_CLK5` had `20,2` (the bottom, left and top I/O tiles' have the one bit of the
  pattern, `5,25` / `7,25` / `5,41`; the rebuild measured it without that bit in 7 tiles of the four
  sides).
- Bugs found and fixed: (1) `gen-pipcover.mjs`, `gen-clock.mjs`, `gen-branch.mjs` and
  `gen-pipdrop.mjs` gave the same codeword to switches of two tiles that start at the same frame and
  bit (`CLKL_X0Y17` / `LIOIS_CLK_PCI_X0Y17`, `CLKR` / `RIBUFS_CLK_PCI`, `GCLKVC` / its CLB), so
  `ana-pipdrop.mjs` gave the bits of the clock tile's switch (`CLKL_UP_IOIS_F2_B3 -> CLKL_GCLK2`,
  `1,-2`) to the I/O tile's (`N6MID4 -> IOIS_CLK2`): `separateWindows` (lib.mjs) now gives them other
  codewords, which changed only `k1`, `c07` and `c15` (run again); (2) `share-sb.mjs` set the terminal
  tiles' "PIPs without bits" only on the types some measurement had touched (`TERMINAL_TYPES`);
  (3) `xc3s250e-slice.json` (a table made from `s3e-tiles.json`) had not been made again since
  `REVUSED:0` (stage F) and `C2VDD` (the open flow) were added: now it has them.
- Three CLB switches the rebuild measured once only, each with a side effect of the removal
  (`Y2 -> E2BEG7`: slice settings of the LUT whose only route was removed; `W2BEG4 -> BY3`: a cleared
  bit; `OMUX_N10 -> BX2`: a bit shared with another switch of the design), keep the earlier values,
  which fit the encoding of the other switches into the same pin: `measured/fix-26rebuild.json`.
- 258 features the new experiments do not reach (no design of `gen-pipcover.mjs` with any kind of
  pins, `gen-branch.mjs` or `gen-clock.mjs` routes through them, no fixture uses them): the block-RAM
  interconnect tiles' VCC switches (210, no bits) and global line 4 into their clock pins (15), the
  DCM tiles' switches into the DCMs' clock and fabric pins (21), centre clock buffer inputs (9), three
  BX / BY bounces: kept as the earlier experiments measured them, `measured/kept-xc3s250e.json`
  (written by `diff-db.mjs --missing`; merged only where nothing else measured them).
- The I/O tiles' `absent` / `absentIn` lists (#74) follow: `GCLK4_BRK` absent where the new
  `GCLK4_BRK -> IOIS_CLKk` features have no such wire, `IOIS_IBUF1` where the new top-tile feature does
  not exist.

With the rebuilt database, the six examples (blinky, clock, gates, pong, stopwatch, traffic) through
the open flow and `scripts/check-open-flow.mjs`: ISE's DRC 0 errors, 0 warnings, and `.bit` files
byte-identical to ISE's bitgen (CRC on and off). The other devices' files are rebuilt from `$W2`
(stage F) as before (not repeated here).

### Open synthesis on the board (2026-10-10)

lab11 and the blinky example, synthesized by Silinx's own front end (`core/synth-verilog.js`: the
elaborated design as Verilog) and Yosys (`synth_xilinx -family xc3se -ise -flatten`, no GHDL, no
XST), implemented by ISE's ngdbuild / map / par / bitgen (fully routed, timing constraints met:
lab11 393 slices, blinky 119), were programmed on a Digilent Basys2 and **work as the originals**.

## To do later: synthesis quality

Open synthesis (Silinx front end + Yosys `synth_xilinx -family xc3se`) is correct but its
netlists are much larger than XST's: lab11 needs 886 LUTs / 522 slices against XST's 309 / 180
(about 2.9x), mostly wide multiplexers built from many small LUTs (Yosys's Spartan-3E support is
marked experimental; no shift-register inference for xc3se either). Synthesis time is fine
(11 ms front end + 1.7 s Yosys for lab11, against XST's 5 s), but a larger circuit is slower
to place and route and slower on the chip. To improve later: Yosys options and scripts (ABC
settings, `-nowidelut`, `-widemux`, retiming), and / or Silinx's own mapping of multiplexers,
decoders and ROMs before Yosys. Measure on lab11 and the example designs against XST.

Done (15.10.2, research/synth-quality/README.md): the size came from synth_xilinx's LUT mapping
for the Spartan-3E (LUTs of up to 8 inputs, each split into LUT4s and MUXF5-8); with ABC mapping
onto LUTs of up to 6 inputs at their cost in LUT4s, and arithmetic of few input bits written as
tables, lab11 needs 278 LUTs / 165 slices (XST: 309 / 180).

## Conclusion

The method works for this device: LUT contents, I/O pads and routing switches can be located by
comparing bitstreams, and they combine independently into a valid bitstream. Stage C built the
database for what the Basys2 designs use and a writer whose output is byte-identical to ISE's
bitgen for the switch -> LED design, blinky and lab11. Next: the open problems of stage C, then
Silinx's own placer and router feeding the writer.

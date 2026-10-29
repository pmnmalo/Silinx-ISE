# Spartan-6: the plan of the open toolchain (2026-10-21)

The Silinx toolchain (synthesis, pack, place, route, static timing, bitgen without Xilinx ISE) works on
the Spartan-3E boards (Basys2, Nexys2). The Spartan-6 boards, the **Digilent Nexys3 (XC6SLX16-3CSG324)**
and **Atlys (XC6SLX45-3CSG324)**, are built with ISE only ([#1](https://github.com/pmnmalo/Silinx-ISE/issues/1)).
This note is the plan of that work: what the Spartan-6 needs that the Spartan-3E flow lacks, how each part
is measured with ISE, the order of the work and its issues. It follows the method of
[docs/OPEN-TOOLCHAIN.md](../../docs/OPEN-TOOLCHAIN.md) and of the Spartan-3E notes
([s3e-bitstream](../s3e-bitstream/README.md), [s3e-device](../s3e-device/README.md),
[s3e-place](../s3e-place/README.md), [s3e-route](../s3e-route/README.md)): black-box observation of ISE's
documented command-line tools, ISE as the oracle (byte-identical `.bit`, a clean DRC, trce's timing).

The architecture facts below come from Xilinx's public documentation: the Spartan-6 data sheets (DS160,
DS162), the CLB guide (UG384), the block RAM (UG383), DSP48A1 (UG389), clocking (UG382), SelectIO (UG381)
and configuration (UG380) user guides, and the Libraries Guide (UG615). Where a value is the documents' and
not yet measured it says so; the measurements replace it.

## What the Spartan-6 needs that the Spartan-3E flow lacks

| Part | Spartan-3E (what Silinx has) | Spartan-6 (what is new) | Issue |
|---|---|---|---|
| Synthesis | `synth_xilinx -family xc3se` and Silinx's mappings (depth, LUT6 split, MUXF, FSM…) for 4-input LUTs | `synth_xilinx -family xc6s` already runs (LUT1–LUT6, MUXF7 / MUXF8, CARRY4, FDRE…, DSP48A1, RAMB8BWER / RAMB16BWER); Silinx's own remaps are for LUT4 families only and stay so for now | — |
| Simulation models | UNISIM models of LUT1–6, MUXCY / XORCY, RAMB16_S*, MULT18X18, DCM… | **CARRY4, DSP48A1, RAMB8BWER, RAMB16BWER, SRLC32E** (the post-synthesis model of a Spartan-6 netlist cannot be simulated today) | [#720](https://github.com/pmnmalo/Silinx-ISE/issues/720) |
| Slices | one slice kind: 2 LUT4, 2 FF, MUXF5 / MUXF6…, carry (MUXCY / XORCY) | **SLICEX / SLICEL / SLICEM**: 4 LUT6 with O6 / O5 (two 5-input functions of shared inputs), 8 storage elements (AFF–DFF flip-flop or latch, A5FF–D5FF flip-flop), one control set per slice; SLICEL adds CARRY4 and F7AMUX / F7BMUX / F8MUX; SLICEM adds the LUTs as RAM (64 × 1 per LUT) and SRL32 | [#721](https://github.com/pmnmalo/Silinx-ISE/issues/721) |
| CLB | 4 slices (2 SLICEM, 2 SLICEL) | 2 slices: SLICEM + SLICEX (CLBLM) or SLICEL + SLICEX (CLBLL); half the slices are SLICEX; carry chains run up the columns of SLICEL / SLICEM | #721, #729 |
| Block RAM | RAMB16_S* (18 Kb) | RAMB16BWER (18 Kb, byte write enables, output registers) splitting into two RAMB8BWER (9 Kb, TDP or SDP of 36 bits) | #720, #728 |
| Multipliers | MULT18X18SIO | DSP48A1: pre-adder, 18 × 18 multiplier, 48-bit post-adder / accumulator, OPMODE, its pipeline registers, cascades | #720, #728 |
| Clocking | BUFGMUX, DCM | 16 BUFGMUX, BUFIO2 / BUFIO2FB from the clock pads (map inserts them), BUFH per clock region, CMTs of 2 DCM_SP + 1 PLL_BASE (2 CMTs in the LX16, 4 in the LX45), BUFPLL | #727 |
| I/O | IOB with its registers | IOB pairs (master / slave), the IOI tiles with ILOGIC2 / OLOGIC2 (registers, SERDES) and IODELAY2; the boards' banks at 3.3 V (and 1.8 / 2.5 V on the Atlys) | #727 |
| Routing fabric | singles, doubles, hexes, long lines, the Spartan-3E switch box | a new INT switch box: single, double and quad wires (the device report will say whether there is anything longer), its own logic inputs and outputs, the clock spines and BUFH rows; every tile type new | #723, #726, #730 |
| Device descriptions | the four Spartan-3E parts' (`packages/silinx-fpga/devices/`) | `xc6slx16csg324-3` and `xc6slx45csg324-3`, from `xdl -report -pips -all_conns`; `packages/silinx-fpga/src/fpga/device.js` taught the new tile types | [#723](https://github.com/pmnmalo/Silinx-ISE/issues/723) |
| Bitstream | UG332: 32-bit words, frames of 73 words (XC3S250E), FAR one word | UG380: **16-bit configuration words**, Type 1 headers with a 6-bit register address, FAR_MAJ (block type, row, major) and FAR_MIN (minor), frames of 65 words for every part, new registers (COR1 / COR2, CWDT, HC_OPT_REG, MODE_REG, GENERAL1–5…), the block RAM content in frames of its own | [#724](https://github.com/pmnmalo/Silinx-ISE/issues/724) |
| Bit database | LUT, slice, routing, I/O, block RAM, multiplier, DCM bits of the Spartan-3E tile types | all of it again for the Spartan-6 tile types | #725–#728 |
| Place, route, timing | `packages/silinx-fpga/src/fpga/place.js`, `route.js`, `timing.js` | placer and router on the new sites and graph, a delay model of the -3 speed grade fitted to trce | #729, #730, #731 |

The Spartan-3E code stays as it is: the Spartan-6 code goes into new files (`core/fpga/s6/`) or behind the
device's family, so that the Spartan-3E work of the other sessions is never disturbed.

### The devices

| Part (board) | IDCODE (UG380) | Configuration size (UG380) | Frame | Slices (DS160) | RAMB16BWER | DSP48A1 | CMTs |
|---|---|---|---|---|---|---|---|
| XC6SLX16 (Nexys3) | `04002093` | 3 731 264 bits | 65 words of 16 bits (1 040 bits) | 2 278 | 32 | 32 | 2 |
| XC6SLX45 (Atlys) | `04008093` | 11 939 296 bits | 65 words of 16 bits | 6 822 | 116 | 58 | 4 |

The IDCODEs and sizes are the documents' values: stage S6-A measures them on ISE's bitgen.

## How each part is measured with ISE

As for the Spartan-3E: test designs written in XDL (or HDL where XDL cannot express a setting), turned
into bitstreams by `xdl -xdl2ncd` and `bitgen`, compared; reference designs implemented by ISE from HDL
(xst, ngdbuild, map, par, trce). ISE runs in its Docker image (linux/amd64, emulated on Apple Silicon:
about 50 s per small Spartan-3E design). The Spartan-6 devices are larger (the XC6SLX16's configuration is
3.6 times the XC3S250E's, the XC6SLX45's 11.5 times), so the times below are estimates; night 1 measures
them and this table is corrected then.

| Stage | What | ISE runs | Estimated time | Scripts | Issue |
|---|---|---|---|---|---|
| **S6-0** (night 1) | device reports of both parts; an empty design's bitstream of each, with and without CRC; the seven examples implemented from their HDL on the Nexys3 and the Atlys (map's slice counts, the routed XDL, trce); the open synthesis's netlists of the examples implemented by ISE (the packer comparison) | 2 reports, 4 empty, 14 + 14 implementations | reports 1–3 h (the XC6SLX45's the longest, several GB before gzip); implementations 3–8 min each, 2–3 h at 3 containers | `night1.mjs`, `ise-s6.sh`, `night1-remote.sh`, `summarize-night1.mjs` (this folder) | [#733](https://github.com/pmnmalo/Silinx-ISE/issues/733) |
| S6-A | the bitstream format: the packet sequence, the FAR order and the frame count, the CRC, bitgen's options (StartUpClk, the PROM file) | about 20 | 1 h | the empty designs of S6-0, then one design per option | #724 |
| S6-B | where every LUT is: one design numbering every LUT (as `gen-map.mjs`), its binary-coded variants (64 bits per LUT) | about 15 per part | 1–2 h | to write from `gen-map.mjs` / `decode-map.mjs` | #725 |
| S6-C | the slice settings, per slice kind (X, L, M), in the slice harnesses of `gen-harness.mjs` | about 300 | 5–8 h | from `gen-slice.mjs`, `gen-hvar.mjs` | #725 |
| S6-D | the routing switches, by PIP drop in batches (the INT tile and the other tile types) | 1 500–3 000 | several nights | from `gen-pipdrop.mjs`, `gen-pipcover.mjs`, `pips-to-db.mjs` | #726 |
| S6-E | I/O and clocking: every pad's settings at random, the BUFIO2 / BUFG / BUFH paths, DCM and PLL settings | about 500 | 1–2 nights | from `gen-iob.mjs`, `gen-iorand.mjs`, `gen-sitevar.mjs`, `gen-dcmhdl.mjs` | #727 |
| S6-F | block RAM content and settings, DSP48A1 settings | about 300 | 1 night | from `gen-bram.mjs`, `gen-sitevar.mjs` | #728 |
| S6-G | timing: trce on the examples and on generated paths (each cell and wire kind) | about 200 | 1 night | from `research/s3e-route` (`ise-timing-check.sh`, `timing-fit.mjs`) | #731 |
| S6-G | the XC6SLX45 from the XC6SLX16's tile types (stage F of the Spartan-3E: the larger part's layout and residuals) | about 100 | 1 night | from `impl-remote.sh`, `ana-residual.mjs` | #725–#728 |

ISE's raw outputs (`.bit`, `.ncd`, `.xdl`, `.xdlrc`, the logs) never enter the repository: the scripts keep
them in a work folder outside it, and only Silinx's own records of the observations (counts, bit
positions, fitted delays) go into `research/s6/measured/` and, later, `research/s6/db/`. The machine ISE
runs on is given on the command line only (`SILINX_ISE_HOST=user@host`), never in a file.

### Night 1 (S6-0): how to run it

```sh
node research/s6/night1.mjs ~/s6-night1                      # the work folder: designs, UCFs, netlists
SILINX_ISE_HOST=user@host sh research/s6/night1-remote.sh ~/s6-night1
node research/s6/summarize-night1.mjs ~/s6-night1            # -> research/s6/measured/night1.json
```

`night1.mjs` writes, for each board (`nexys3`, `atlys`): `impl-<board>/<example>/` (the example's HDL, its
UCF from the board's pin assignment, `top.txt` naming its top) and `edif-<board>/<example>/` (the open
synthesis's netlist for the Spartan-6, `top.edf`, with the same UCF), and `empty/<part>.xdl`.
`ise-s6.sh` runs inside the ISE container (`report`, `empty`, `impl`, `edif`); `night1-remote.sh` copies the
work folder to the machine with Docker and ISE, runs it there (3 containers), copies the results back and
prints how long each part took. `summarize-night1.mjs` writes what the later stages need: per example and
board, map's slices (by kind), LUTs, flip-flops, block RAMs and DSP48A1s, par's routing result and trce's
minimum period; per part, the empty bitstream's packets (registers written, word counts, the frame data's
length) and the device report's tile, site and PIP counts.

## Results of night 1 (2026-10-21)

Run on the Mac mini with ISE 14.7 (09:32–11:10, with the measurement queue's other jobs waiting: next time take a
slot first). Silinx's record: [measured/night1.json](measured/night1.json) (`summarize-night1.mjs`: counts and
observations, no Xilinx file; the reports, bitstreams and XDL stay in the work folder, outside the repository).

**Times** (the estimates above were pessimistic): an example from HDL 1–2 min (xst 11–17 s, map 9–24 s, par
9–21 s), 516 s for the 14 at 3 containers; the 14 netlists 194–226 s; the empty designs 39 s; the device report of
the XC6SLX16 942 s (48 MB gzipped), of the XC6SLX45 2816 s (132 MB gzipped).

**The devices** (the reports' summaries; DS160's slices exactly):

| Part | Tiles | Sites | PIPs | SLICEX | SLICEL | SLICEM | RAMB16BWER | DSP48A1 | BUFGMUX | BUFH | BUFIO2 | DCM | PLL_ADV | ILOGIC2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| XC6SLX16-CSG324 | 4 526 | 5 378 | 5 782 505 | 1 139 | 595 | 544 | 32 | 32 | 16 | 128 | 32 | 4 | 2 | 248 |
| XC6SLX45-CSG324 | 12 690 | 13 830 | 16 299 860 | 3 411 | 1 809 | 1 602 | 116 | 58 | 16 | 256 | 32 | 8 | 4 | 376 |

The CLB tiles are CLEXL (SLICEL + SLICEX) and CLEXM (SLICEM + SLICEX); the switch boxes INT, INT_BRAM, IOI_INT, INT_TERM.

**The bitstream** (the empty designs, `bits6.mjs`, for #724): the packet sequence starts `CMD 0007` (RCRC), then FLR
`0430` (XC6SLX16) / `0628` (XC6SLX45), COR1 `3d10`, COR2 `09ee`, IDCODE `0400 2093` / `0400 8093` (UG380's), MASK,
CTL `0081`, CCLK_FREQ `3cc8`, PWRDN_REG, EYE_MASK, HC_OPT_REG `001f`, CWDT `ffff`, PU_GWE, PU_GTS, MODE_REG `0100`,
GENERAL1–5, SEU_OPT `1be2`, EXP_SIGN, FAR_MAJ / FAR_MIN `0000 0000`, CMD WCFG, then one Type 2 FDRI of 231 953 words
(XC6SLX16) / 742 057 (XC6SLX45), followed by two words `9876 defc` that the reader takes for unknown packets (the
auto-CRC words after the frame data, to be read as such), the end sequence (GRESTORE, LFRM, START, CRC, DESYNC).
FLR is not the frame length of 65 words: its meaning, and the frames' order, are #724's first questions.

**The examples on ISE** (all routed, every signal): occupied slices from HDL (XST) / from Silinx's netlist (open):

| Example | Nexys3 XST | Nexys3 open | Atlys XST | Atlys open | open: SLICEL map / packer | open: SLICEX map / packer |
|---|---|---|---|---|---|---|
| gates | 1 | 1 | 1 | 1 | 0 / 0 | 1 / 1 |
| traffic | 44 | 45 | 46 | 47 | 20 / 20 | 25 / 14 |
| blinky | 60 | 53 | 65 | 51 | 21 / 21 | 32 / 14 |
| pong | 114 | 141 | 114 | 141 | 57 / 57 | 84 / 60 |
| stopwatch | 85 | 113 | 82 | 113 | 42 / 42 | 71 / 42 |
| clock | 108 | 119 | 112 | 116 | 51 / 51 | 68 / 36 |
| vga | 57 | 61 | 58 | 60 | 30 / 30 | 31 / 22 |

**What it says about the packer (#721):**
- its SLICELs are map's exactly, on every example (the carry chains and the F7 / F8 as map packs them);
- map uses many more SLICEX than the packer: it places while it packs (Spartan-6's map), and spreads the logic: 14 of
  blinky's 32 SLICEX hold one LUT and nothing else; it never uses a 5FF; its SLICELs take DI from O5 in every
  position. Occupied slices are a placement result, not a packing one: the comparison with map is made by slice kind
  and by the cells in them, the SLICEX density being the placer's (#729) concern;
- map counts every LUT site it uses (the carry chain's constant and route-through LUTs at S too): pong 416 against
  the packer's 275 LUT cells;
- the netlist's unused inputs are gone from it, so its implementations need `ngdbuild -aul` (the LOC of a port that is
  not there);
- the clock example's 2-bit adder, whose sum and carry out both need BMUX (the packer's one warning): map sends the
  carry out by BMUX (`BOUTMUX::CY`) and the sum through the B storage element set as a gate (`BFF … #AND2L`,
  `BFFMUX::XOR`, "used as AND/OR logics" in its report), out by BQ: the rule the packer takes next (#721).

### The device descriptions (#723, 2026-10-21)

Built from the two reports by Silinx's generic builder (`research/s3e-route/build-device.mjs`, the Spartan-3E
one, unchanged: it reads any `xdl -report`): the XC6SLX16 in 5 s, 1.4 MB gzipped (307 tile templates, 509 302
nodes), the XC6SLX45 in 14 s, 2.9 MB (369 templates, 1 397 026 nodes, loaded in 136 ms); their tiles, sites by type
and PIPs exactly the reports'. Shipped in `packages/silinx-fpga/devices/` as the Spartan-3E boards' are. A slice's carry goes
up by a switch of its own tile (`XL_COUT -> XL_COUT_N`, the CIN of the slice above), not by a wire.

### The placer (#729, 2026-10-24)

`core/fpga/s6/`: `phys.js` (the packed slices and the cells of their own sites as site instances, the nets as site
pins, the constants as power nets), `sites.js` (the device's sites: a carry chain's next stage and a DSP cascade from
the routing graph, the 32 GCLK pads and the BUFGMUX each reaches, the banks), `place.js` / `place-moves.js` (the
annealing, as the Spartan-3E placer's), `place-timing.js` (a simple delay estimate until #731), `place-check.js`
(the rules) and `xdl.js` (the placed design as XDL, the sites' settings as ISE's primitive definitions name them).
What the slices' definitions in ISE's device report taught: a 5FF's D is O5's only (#1143); a 5FF is written
`A5FF:<name>:` with no value; a LUT equation names A1 … A6 in every position; a power net needs a source in XDL: the
TIEOFF of the pin's switch box (HARD1 / HARD0), or, for a pin no TIEOFF reaches (GND_WIRE does not go to the I/O
logic: an output tied to 0), a free LUT of a slice nearby (`_GND_SOURCE::C`), as ISE does; a position whose A6 is
tied high names it in its O6 equation (`(A6+~A6)*(…)`, an unused O6 too).

Every example is placed legally on both parts in under a second. Measured by the placer's own cost against ISE's
placement of the same netlists (`compare-place.mjs`, `measured/place-compare.json`), the wirelength per connection is
0.6 to 1.2 times ISE's (ISE's map trims the netlist further: fewer nets, so the totals are not comparable). ISE
reads every placement of the 7 examples on both boards (`xdl -xdl2ncd`), routes it completely keeping it (`par -k`)
and its DRC finds no error; its one warning is stopwatch's 9K block RAM note (PhysDesignRules:2410), which ISE's own
implementation of stopwatch has too (`ise-place-check.sh`, `summarize-ise-check.mjs`, `measured/ise-check.json`).
The first round taught the last two rules above: ISE refuses a power net without a source, and an A6 tied high that
the O6 equation does not name (PhysDesignRules:1709).

### The router (#730, 2026-10-24)

`packages/silinx-fpga/src/fpga/s6/route.js` (PathFinder, as the Spartan-3E router), `route-nets.js` (the general interconnect, which
the global clocks never take; the route-through sites; the TIEOFFs), `route-output.js` (the routed XDL, its
XDL_DUMMY instances: the I/O logic an input or output passes through, ILOGIC2 D -> FABRICOUT and OLOGIC2 D1 -> OQ, a
clock region's BUFH, the TIEOFFs), `route-check.js` (the rules against the graph). Every example routes completely
on both parts in 3 to 5 passes and under 3 s; against ISE's routing of the same netlists (`compare-route.mjs`,
`measured/route-compare.json`) it takes 1.0 to 1.2 times the switches per connection, more singles: ISE also swaps
a LUT's inputs to the pin its route reaches best, which the Silinx router does not yet. ISE reads every example's
routed XDL on both boards and its DRC finds no error and no warning but stopwatch's 9K block RAM note
(`measured/ise-check.json`). The first round found a route through the net's own slice by a LUT in use (D4 -> D,
PhysDesignRules:2066): out of its own slice a net takes only COUT -> DMUX.

### The bitstream format (#724, 2026-10-27)

Stage S6-A on the Mac mini (`ise-format.sh`, 2 minutes): the two empty designs through bitgen with the options of
Silinx's `.ut` for the Spartan-6 (`server/ise.js`: the CRC on, StartUpClk Cclk / JtagClk; UserClk is refused by
bitgen without a STARTUP_SPARTAN6 in the design), with `-g CRC:Disable`, and with `-g Compress`. The compressed
files write one frame and copy it everywhere with MFWR, one FAR per frame: they gave the frame order, and auto CRCs
a few words apart, from which the CRC was found. `packages/silinx-fpga/src/fpga/s6/bitstream.js` has the reader and the writer;
`check-writer6.mjs` reads an ISE `.bit` and writes it again from its frame data and options.

- **The CRC** is 22 bits and takes one step per word written to a register (not one per bit):
  `c = (c << 1) ^ (c[21] ? 0x9081 : 0)`, then `c ^= register << 16 | word`. RCRC (CMD 7) sets it to 0; bitgen writes
  it as two words (6 + 16 bits) after each Type 2 write of FDRI (the auto CRC, which does not reset it) and to the CRC
  register at the end; with `-g CRC:Disable` both are `9876 DEFC`. (The steps per word were found first: segments of
  identical writes in the XC6SLX16's and XC6SLX45's compressed files differ only in their starting CRC, so the
  difference of their ending CRCs is the starting one's through the step alone.)
- **COR1** `3d00`, StartUpClk in bits 1:0 (Cclk 0, UserClk 1, JtagClk 2), the CRC off in bit 4 (`3d10`).
- **FAR_MAJ** is block type [15:12] (0 the logic, 1 the block RAM), row [11:8], column [7:0]; **FAR_MIN** the minor.
  A two-word write to FAR_MAJ sets both.
- **FDRI**: for each row, its columns in order, each its frames of 65 words (minors), then 2 frames of pad (all ones);
  the XC6SLX16 has 4 rows of 26 columns (742 frames + 2), the XC6SLX45 8 of 39 (1134 + 2); the columns' frames:
  4 (the first), 30, 31, 25, 24. Then the block RAM's frames (576 on the XC6SLX16, 2304 on the XC6SLX45: 72 per block
  RAM column and row), the I/O words (as many as **FLR** says: `0430`, `0628`; FLR is not the frame length) and one
  word: 231 953 and 742 057 words.
- **The empty design** sets three words besides the pad frames: frame 3 word 4 (`0020`) of the even rows, frame 27
  word 64 (`3100`) of row 0.
- **A design with a block RAM** (stopwatch) has one frame of its block RAM column written again after the others
  (FAR, WCFG, a Type 2 FDRI of that frame and a pad frame, its auto CRC), equal to the frame in the main data but for
  two bits: the bit database's matter (#728).

All 42 files of ISE (the empty designs of night 1 and S6-A, the seven examples implemented on both boards with the
CRC on and off) are written again byte-identical, every CRC computed as bitgen wrote it. `measured/format.json` keeps
the empty designs' and stopwatch's size, SHA-256 and CRCs, which `test/s6-bitstream.test.js` checks the writer
against without ISE.

### The LUTs (#725, S6-B, 2026-10-27)

`gen-lutmap6.mjs` writes designs in XDL with the four LUTs of every slice set and no nets; `ise-xdl-bits.sh` turns
them into bitstreams on the Mac mini (`xdl -xdl2ncd -force`, `bitgen -d -g CRC:Disable`) and `ana-lutmap6.mjs` reads
them: every LUT `O6 = 1` (where all the LUT bits are), `O6 = 0` (the bits a used slice sets besides them), `O6 = A1`
… `A6` (which entry each bit is: entry e has bit k - 1 set in design a<k>) and the id designs (LUT n all ones when bit
j of n is 1: whose bit it is). `db/<device>-lut.json` keeps the map per slice kind and LUT, as (frame, bit) offsets
from the slice's base, and every slice's base.

- **The XC6SLX16**, every slice (22 designs, 50 minutes; the `a<k>` designs take 6 minutes each, `xdl`'s DRC
  checking every LUT's dangling inputs): all 9112 LUTs found, every entry at one place, every slice of a kind laid
  out alike. A slice's 4 × 64 bits are in 4 frames (SLICEX and SLICEL: minors 0 to 3 from its base, SLICEM: 0, 1, 3,
  4) and 64 bits of the frame.
- **A slice's base** follows from its column and its Y alone: its frame is the column's first frame (by X) plus
  `rowFrames × (Y div 16)`, its bit a function of `Y mod 16`, 64 bits per slice from Y15 (bit 0) down to Y0 (bit 976),
  with the frame's middle word (bits 512 to 527, the HCLK's) between Y8 and Y7.
- **The XC6SLX45** from a sample (`gen-lutmap6.mjs --sample`: the first row of CLBs and the top slice of every other
  row, 1204 of its 6822 slices, 21 designs, 40 minutes): its 4816 LUTs found, laid out as the XC6SLX16's, and the rule
  checked on it gives every slice's base (`extendBases`; the XC6SLX16's sample gives its measured map exactly, which
  the tests check).
- **The zero design** sets 8 bits besides the LUTs' in frame 4 of a SLICEL and frame 5 of a SLICEM (bits 9, 10, 15, 29,
  30, 44, 45, 47 from its base): they are the neighbouring SLICEX's (its frame before its LUTs' is that frame, S6-C
  below), its defaults when its flip-flops are not used. On the XC6SLX45 the zero design also sets 8 bits of the top
  row's HCLK word (bit 527) in minors 16 to 19 of columns 16 and 32: the clocking's (#727).

### The slice settings without nets (#725, S6-C, 2026-10-27)

`prim-defs6.mjs` reads the primitive definitions of an XDLRC (night 1's, the same for both parts):
`measured/prim-defs.json`, every site's elements and their options. `gen-slice6.mjs` writes one design per slice kind
for the XC6SLX16: a base slice (the four LUTs `O6 = A1 * A2`, the four flip-flops on O6, SRINIT0, CLK, SYNC, the
outputs, CE and SR used) at the first and the last place, and one slice per variant, the base with one element
changed (every option, its removal, every BEL without options added): 70 SLICEX, 114 SLICEL, 169 SLICEM variants, each
slice in a tile of its own. `ana-slice6.mjs` compares each slice's bits (its column's frames, its 64-bit band) with the
base's: `db/xc6slx16-slice.json`. Three designs, 3½ minutes.

- **Measured**: the flip-flops (a latch, AND2L or OR2L: one bit for the four; each SRINIT1: a bit of its own;
  SYNC_ATTR: one bit, set for SYNC), the flip-flops' sources (FFMUX: AX … DX on a SLICEX, F7 / F8, CY and XOR on a
  SLICEL or SLICEM, two or three bits each), `*OUTMUX = O6`, and a SLICEM's LUT modes (SPRAM / DPRAM 32 or 64,
  SRL16 / SRL32: one to three bits of frame 2, and the SRLs' contents written differently: bits of the LUT's moved).
  A SLICEL's and a SLICEM's settings are in frame 4 and 5 from their base, a SLICEX's in the frame before its LUTs
  (its neighbour's frame 4 or 5); a few are elsewhere in the column (the SLICEX's CFFSRINIT 6 frames before, the
  SLICEM's AFFSRINIT one before).
- **No bits without nets**: CLKINV, CEUSED, SRUSED, the outputs used (`*USED`), the other `*OUTMUX` options, the
  carry (CARRY4, `*CY0`, PRECYINIT, COUTUSED), F7 / F8, the 5-input LUTs and flip-flops, a SLICEM's DI muxes, WEMUX,
  WA7USED / WA8USED: they are written when a net uses the pin (as on the Spartan-3E): measured with nets
  below.

### The slice settings with nets (#725, S6-C, 2026-10-28)

`gen-slice6.mjs --nets`: the same designs with a net (unrouted) on every pin of the measured slices: the inputs (CLK,
CE, SR, AX … DX, a SLICEM's WE and AI … DI) from a driver slice's outputs, each slice's outputs to a sink slice of its
own, in tiles none of the measured slices is in; the base's outputs AMUX … DMUX on O6 (`*OUTMUX = O6`).
`ana-slice6.mjs --nets`: `db/xc6slx16-slice-nets.json`. Three designs, 7½ minutes (ISE's DRC reports the unrouted
nets and the incomplete settings; `-force` writes them anyway).

- **Measured now**: CLKINV (CLK_B one bit), CEUSED and SRUSED (one bit each, cleared when unused), every
  `*OUTMUX` option (O6 one bit, A5Q, XOR, CY, F7 / F8, a SLICEM's MC31: one or two bits; O5 none without a 5-input
  LUT, two bits with one: below), the flip-flops'
  sources AX … DX on a SLICEL or SLICEM, a SLICEM's ADI1MUX = AX, BDI1MUX = BX, CDI1MUX = CX, WEMUX = CE, WA7USED and
  WA8USED (frame 2). The settings measured without nets are the same.
- **Still no bits**: the outputs used (`*USED`: the routing's), the carry (CARRY4, CYINIT, `*CY0`, PRECYINIT,
  COUTUSED), F7 / F8, the 5-input flip-flops (ISE wants a net on their D) and the DI muxes' other options (their
  default): the next round's base has the carry chain, F7 / F8 and the 5-input flip-flops in use.

### The carry, F7 / F8 and the 5-input flip-flops (#725, S6-C, 2026-10-28)

`gen-slice6.mjs --full`: the designs with nets, their base also with the 5-input LUTs (O5 = A1 * A2) and flip-flops
(the outputs AMUX … DMUX on A5Q … D5Q) and, on a SLICEL or SLICEM, the carry chain (CARRY4 from CYINITGND,
PRECYINIT 0, every CY0 on O5, COUTUSED) and F7AMUX, F7BMUX, F8MUX. `ana-slice6.mjs --full`:
`db/xc6slx16-slice-full.json`. Three designs, 7 minutes.

- **The carry**: `*CY0 = O5` one bit per LUT (A 54, B 48, C 14, D 8 of frame 4 or 5), AX none; PRECYINIT 0 none, 1
  bit 52, AX bit 49; COUTUSED off (the chain unused) clears the four CY0 bits. CARRY4, CYINITGND / CYINITVCC and
  F7AMUX / F7BMUX / F8MUX have no bits of their own (their use shows in the muxes that take them).
- **The outputs**: A5Q bit 60, O6 63, O5 61 and 63 (with a 5-input LUT), XOR 62, CY 61 and 62, F7 61 (and A5Q's
  60): the same for B … D at their bits.
- **The 5-input flip-flops**: SRINIT1 a bit each, in frames before the slice's (a SLICEL's or SLICEM's one before,
  a SLICEX's six or seven); nothing else of their own.
- What remains without bits is the routing's (`*USED`, the pins' nets) or a default.

### The LUTs and slices checked against ISE's examples (#725, 2026-10-28)

`check-slice6.mjs` predicts every slice of a design ISE implemented (night 1's seven examples on both boards, their
`top.xdl` and `top.bit`) from the databases and compares it with ISE's bitstream, tile by tile (the two slices of a
tile together: a SLICEX's settings in frames before its LUTs are its neighbour's frames), at every position the
databases know: the LUTs from their equations, the settings as the `--full` round's base with each element that
differs changed. A slice's kind is its site's (ISE places a SLICEX on a SLICEL's site). The XC6SLX45 uses the
XC6SLX16's settings (the same tiles).

- **972 slices, 650 tiles: all 650 identical** at every position the databases know, the LUTs, the flip-flops, the
  carry, the shift registers and the outputs of every example on both boards (the XC6SLX45 with the XC6SLX16's
  settings: the tile types' bits shared).
- Learnt from the examples: ISE writes its route-throughs in a slice's cfg (`_ROUTETHROUGH:A:AMUX`: the output mux on
  O6, `_ROUTETHROUGH:A3:A`: the LUT as `O6 = A3`, often on an otherwise empty `XDL_DUMMY` slice); COUTUSED has no
  bit (off, it cleared the CY0 bits of a chain the harness did not use); the carry in from the slice below (CARRY4
  without PRECYINIT, no net on CIN in the harness) is bit 51 of the CY0s' frame; a shift register's settings (SRL16,
  its contents all zeros in the examples) as measured.
- **A SLICEX by its tile's type** (`gen-slice6.mjs --full --tiles CLEXM`, `--tiles CLEXL:13`, 2026-10-28, three
  designs, 6 minutes): its flip-flops' SRINIT bits (CFFSRINIT, the four 5-input flip-flops') are in minor 20 of the
  column, before its tile's frames: 6 frames before its base in a CLEXL tile (its base minor 26), 7 in a CLEXM
  (minor 27); the first rounds had mixed both (`db/xc6slx16-slice-full-clexl13.json`, `-clexm.json`, which the check
  uses for a SLICEX by its tile). Everything else is the same in both tile types and in another column (a SLICEL's
  too).
- **The residual** (the bits ISE sets in the used tiles' columns and bands that no position explains): none in the
  slices' frames (minors 21 to 29 / 30 of a CLB column); minors 0 to 20 are the routing's (#726), bit 17 of minor 19
  next to a SLICEL using F7B among them.
- Not measured: a LUT RAM's or ROM's contents other than zeros (the SRL modes move bits); Silinx does not write them
  yet (#1153).

### The INT switch box (#726, S6-D, 2026-10-29)

`gen-pipprobe6.mjs` probes whether ISE programs a routing switch (PIP) in isolation: on a net with no pins it does
not (no bit set anywhere), on a net with one outpin (the tile's TIEOFF, HARD1) it does, whether the PIP is on the
net's path or not (and an inpin changes nothing). So one design measures a PIP in each of the XC6SLX16's 1083 INT
tiles next to a CLB at once, each in its own tile's region (minors 0 to 20 of the CLB column, its 64-bit band:
`ana-pipprobe6.mjs`); `--int` writes a round of such designs, the switch box's PIPs in turn from an offset.

- **The round** (8 designs, 17 minutes): all 3449 PIPs of the INT switch box, all but one in two tiles or more,
  `db/xc6slx16-int.json`: 1 to 3 bits each (a mux's row and column), 87 with none.
- **On paths** (`gen-pipcover6.mjs`, one design, 36 seconds): a PIP whose source wire is not driven sets no bits
  alone: the continuations of a wire (`SR1E1 -> SR1B2`, `EE4E1 -> EE4B1`, …) and a bidirectional PIP's other
  direction (`LOGICIN_B51 -> GFAN1` sets other bits than `GFAN1 -> LOGICIN_B51`). Each of these 110 is the end of a
  path from a driver (a TIEOFF's HARD1, HARD0 or KEEP1, or a slice output, in its tile or the next ones) found by a
  breadth-first search over the device's graph, in a tile of its own; its bits are its tile's less those of every
  path's PIPs there: `db/xc6slx16-int-cover.json`, by the signal's direction. The KEEP1 PIPs and `LOGICIN_Bk ->
  LOGICINk` have no bits.
- **The other INT-like tiles** (`gen-pipprobe6.mjs --others`, three designs, 3 minutes): the same switch box in the
  clock-break rows (INT_BRK, INT_BRAM_BRK), the block RAM (INT_BRAM) and I/O (IOI_INT, LIOI_INT) columns, the DSP and
  edge columns' INT tiles and INT_GCLK, on nets of their TIEOFF; their regions follow the CLB columns' rule (the FAR
  column is the tile's X + 1, the row Y div 16, the band by Y mod 16: `tileRegion`), checked by a PIP of the INT
  switch box in each of the 517 tiles (514 as the INT database, 3 continuations at the top edge). Their own PIPs
  (the clock-break rows' `GCLKk_BRK`, the I/O tiles' `INT_IOI_GFANk`, the BUFPLL clocks: `db/xc6slx16-int-own.json`,
  190, in two tiles each but 40); an I/O tile's `INT_IOI_LOGICIN_Bk` is the INT tile's `LOGICIN_Bk` (its bits).
- **Checked** (`check-pips6.mjs`) on the examples ISE implemented, both boards (the XC6SLX45's INT tiles the same
  types): a tile's bits are its PIPs' (a bidirectional PIP's direction from its net, walked from its outpins) and its
  slices' settings in minor 20: **all 3106 INT-like tiles identical**, 24 407 PIPs.
- **The other tiles' PIPs** (`gen-pipdrop6.mjs`, `ana-pipdrop6.mjs`, 2026-10-29): by PIP drop on the examples ISE
  routed, both boards: each design again as it is and without the PIPs of the tiles other than the INT-like and
  CLB ones (the nets keep their pins), 24 designs, 6 minutes; then `--split 4`, a quarter of each tile's PIPs at a
  time (43 of 48 designs: 5 lose an output's constant source and bitgen stops), 22 minutes beside Vitis. A changed
  bit goes to the dropped PIPs' tiles whose region holds it (`gridRegion`: the device grid's column of the nearest
  INT-like tile at or left of it, the centre's clock column being FAR column 0, the band of its grid row's INT
  tiles, a clock row's 16 bits between the halves; the tiles of one region, an I/O tile and its pad's, together),
  and the PIPs are taken apart by peeling (a unit with no bits gives its PIPs none, one with one PIP open gives it
  its bits) and by intersections: `db/s6-pips-other.json`, **370 PIPs, 333 with no bits** (the site pins' of the
  block RAM, DSP and I/O tiles), with bits the clock rows' (HCLK_CLB, REG_V_HCLK, the feedthroughs) and the I/O
  tiles' (IOI); 5 still apart (an I/O tile's two together, always), 2 units with a bit more (a clock row's, in the
  CLB frames below it). Bits no dropped tile is near: the I/O words after the block RAM's frames (an output's
  settings when its path goes: #727) and one in a CLB frame.

### The residual of the examples (#725, #726, 2026-10-29)

`residual6.mjs` predicts every bit of the rows' frames of a design ISE implemented from all the databases (the
slices', the INT-like tiles' PIPs with their directions, the other tiles' PIPs placed by `gridRegion`) and compares
them with ISE's bitstream; a bit left over goes to the tile types whose regions hold it. On the seven examples of
both boards (about 121 000 bits set): **no bit predicted that ISE does not set, 209 left over**, none of them a
routing switch's:

- the clock rows' HCLK words, minors 16 to 19 (96: the bits the LUT map's zero design set already, with no net:
  the clock rows' settings), one bit of a REGC tile and one of the corner's in every design (26): the clocking (#727);
- the I/O tiles' (21: the outputs' and inputs' settings, with the 5 I/O PIPs that are always together with them,
  `OQ`, `PINW`, `IDATAIN`): the I/O (#727);
- the block RAM's and DSP's interface (66, stopwatch's): #728.

### The pads (#727, S6-E, 2026-10-29)

`gen-iob6.mjs` writes designs with every bonded pad of the package (232 on the XC6SLX16's CSG324) an IOB of the same
settings, as Silinx writes them (`packages/silinx-fpga/src/fpga/s6/xdl.js` iobCfg), no nets: an output (LVCMOS25, drive 12, SLOW: the
boards' UCFs give no I/O standard, so ISE's and Silinx's default), an input, a bidirectional pad, a tristate one, the
id designs (output and input, the pads whose index has bit j: which pad each bit is) and one design per variant
(drives 2 to 16, slews FAST and QUIETIO, the output and input standards LVCMOS33, LVTTL, LVCMOS18, 15, 12, the pulls);
41 designs, 8 minutes. `ana-iob6.mjs`: `db/xc6slx16-iob.json`.

- Every pad's bits are in the I/O words after the block RAM's frames: **6 for an output, 9 for an input**, each
  variant changing the same number on all 232 pads (drive 2: 3 set and 3 cleared, FAST: 4 set, LVCMOS33: 1 and 2,
  a pull-up: 1, …); an input's LVCMOS33 and LVTTL are its LVCMOS25's. Drive 24 is not LVCMOS25's: bitgen refuses it.
- One bit (frame 734, bit 988: the corner's of the residual) is set by any pad in use: the I/O's, not a pad's.
- **The XC6SLX45** (the same 41 designs, 10 minutes: `db/xc6slx45-iob.json`): its 218 pads as the XC6SLX16's, 6 and
  9 bits, the same variants; its globals also the top clock row's 8 bits (minors 16 to 19 of two columns, bit 527)
  the LUT map's zero design set already.
- **The I/O logic's route-throughs** (`gen-iologic6.mjs`: OLOGIC2 D1 -> OQ, T1 -> TQ, ILOGIC2 D -> FABRICOUT on every
  site, as ISE writes them) set no bits without a net, as a PIP does not: they come from the examples. In the
  residual (`residual6.mjs`, which now predicts the pads from their IOBs' settings): an output on a net sets the bit
  15 before its pad's first (every routed output of the examples, both boards: its path from the OLOGIC), and the I/O
  path's PIP pairs the PIP drop could not take apart, always together, have their bits in `db/s6-pips-io.json` (on
  the pair's first). With them no bit is left in the I/O tiles or words but the clock pad's (the clock path).

### The clock path, the DCM and the PLL (#727, S6-E, 2026-10-29)

Designs ISE implements (`ise-s6.sh impl`), as the routing of a global clock needs ISE's router:

- **The clock path** (`gen-clock6.mjs`): flip-flops at fixed slices clocked from the board's clock pad through a BUFG
  (one flip-flop, one in each clock row, one in each CLB column, two clocks), and k16: a clock on every BUFGMUX each
  to a flip-flop in another row and column, on both parts. The PIP drop of k16 (`gen-pipdrop6.mjs`, 20 designs) gives
  every global clock's spine, row and buffer PIPs (`db/s6-pips-other.json`: 522 PIPs now). What the residual leaves
  of a clock: a bit of the REGC tile per clock (in frame 1840 of the XC6SLX16, 5104 of the XC6SLX45, bits 976 to 1007:
  not the BUFGMUX's index alone, the pad-to-BUFG path's selection: to take apart), a bit in the clock pad's I/O
  words, and two of the centre column's (REG_V) for some clock indices.
- **The clock pads and the BUFGs** (`gen-clock6.mjs --bufg`: a BUFG LOC'd on each BUFGMUX from each of the two clock
  pads that reach it, 32 designs; `ana-clock6.mjs`: `db/s6-clocks.json`): a clock pad on a BUFG sets a bit of the REGC
  frame (1840 on the XC6SLX16, 5104 on the XC6SLX45; bits 976 to 1007, one per clock pad: the BUFGMUX's input
  selection) and a bit in its I/O words (its clock input, an offset from its first output bit, the same on both
  parts). The PIP drop of the 32 designs (64 more) resolves the spines' PIPs to 643; those of a BUFG's spine that are
  always together have their bits, in the centre's clock column, on the first of them (`db/s6-pips-clock.json`).
  With them the clock designs' and the examples' residual has no clock bit left but the clock example's HCLK bits
  (minors 16 to 19 of one column's clock row).
- **A shift register's clock** (four designs: an SRL16 in the upper or lower half of a clock row, in two columns, and a
  flip-flop): a SLICEM as a shift register or RAM on a clock sets minors 16 to 19 of its column's clock row word (bit
  527), a flip-flop does not. With it the examples' residual (both boards) has no clock bit left: only the block RAM's
  and DSP's (stopwatch's, #728).
- **A DCM's and a PLL's clock path** (`gen-dcm6.mjs --paths`: the base from the clock pads U10, T9, R8 and to BUFGs at
  three other BUFGMUXes, 12 designs; `ana-cmt6.mjs`, `cmt6.mjs`: `db/xc6slx16-cmt-paths.json`): a design's bits beyond
  the other databases' are the base's (the CMT's settings, its input from V10, its outputs' BUFGs) with its pad's
  change (5 bits of the pad's I/O words, its I/O tile's path, the CMT's input selection) and its BUFGMUX's (2 bits of
  the REGC frame, the centre column's path). Two designs of combinations never measured (U10 to BUFGMUX_X2Y1, T9 to
  X2Y9) are predicted bit for bit (142 and 187 bits). The other CMT sites, pads and BUFGs, and the XC6SLX45's: #1951.
- **The CMT sites**: a DCM's or a PLL's bits are at minor 30 of the CMT column (the XC6SLX16's column 12, frame 357
  in row 0; the XC6SLX45's column 19, 565) in its site's row, the same bits on both parts; a DCM of even Y (DCM_X0Y0,
  X0Y2) has them 283 bits on (measured on DCM_X0Y0 / X0Y2 / X0Y3 and PLL_ADV_X0Y1, and on the XC6SLX45).
- **The DCM_SP and the PLL_BASE** (`gen-dcm6.mjs`, `ana-dcm6.mjs`: `db/xc6slx16-cmt.json`): a DCM at DCM_X0Y1 and a PLL
  at PLL_ADV_X0Y0, one setting changed per design from the base's (16 designs; a PLL multiplier of 2 puts the VCO out
  of range and ISE refuses it). Each variant sets or clears 1 to 9 bits: the DCM's in frame 357 (CLKFX_MULTIPLY - 1
  and CLKFX_DIVIDE - 1 binary counters), the PLL's in frame 1101. `--fields` (28 designs; a PLL with a VCO out of range
  refused) sets each counter's other bits: CLKFX_MULTIPLY - 1 in bits 417, 416, 413, 412, 409 (1 … 16) of frame 357,
  CLKFX_DIVIDE - 1 in 432, 431, 429, 428, 425; the CLKDV divisors, the PLL's multiplier, divider, output divider
  and phase as their own bit patterns in the database.

### Static timing (#731, S6-G, 2026-10-29, the first part)

- **trce's reports read** (`twr6.mjs`): each constraint's detailed paths (the slow corner's maximum data path) with
  their slack, requirement, skew and uncertainty, and their elements in order (a logic arc: its site.pin, type and
  delay; a net: its load's site.pin, fanout and delay, its driver the element before).
- **The wires** (`timing-fit6.mjs`): each net of night 1's 28 reports (both boards, ISE's flow and the open
  synthesis's netlist through ISE) found in the routed XDL (the net's tree from its driver's pin, `timing.js`
  `netTree` / `treePath`, which the Spartan-6's device answers as the Spartan-3E's) and its nodes counted by class.
  A non-negative least-squares fit of delay = base + Σ count × class delay + fanout × load delay on the 341
  connections: rms 0.110 ns, 95% within 0.21 ns, max 0.38 ns (single 0.159, double 0.190, quad 0.233 ns, a logic
  input 0.203, a logic output 0.142). trce's verbose report gives only the 10 worst paths of a constraint: the
  delays of every connection (`reportgen -delay`) will widen it.
- **The logic arcs** read from the same reports are near constants by kind and context (Tilo 0.203 to 0.259 ns,
  Tcko 0.391 / 0.408 / 0.447 by the flip-flop, Tas 0.289 to 0.341, Tceck 0.276 to 0.363 by the flip-flop; a setup
  through the XOR 0.154 / 0.273).
- **trce's paths re-evaluated** (`timing6.mjs`, part 2): each path's arcs from a table (the median by arc, slice kind
  and, for a setup through the LUT, the flip-flop's input mux) and its nets from the wire model on ISE's routing; with
  trce's skew and uncertainty, its slack. On night 1's 240 paths the data path's rms error is 0.219 ns (95% within
  0.49 ns); each constraint's worst slack is within 5% of trce's in 14 of 24 constraints, the others the small slacks
  (0.2 ns of a 0.68 ns slack is 29%), every error under 6% of the period. Next: every connection's delay
  (`reportgen -delay`) for the wire fit, and the STA that finds the worst path itself (its own skew).

### The CMT sites (#1951, S6-E2, 2026-10-29)

- **Every CMT site** (`gen-cmtsites6.mjs`: a DCM or PLL at each of the XC6SLX16's six sites, from 4 clock pads of its
  half and 4 of the sides, three outputs through BUFGs at the BUFGMUXes in turn; 48 designs, 40 built: 8 side pads
  ISE does not pair with that DCM, `Place:1158`). Their PIP drop (`--split 2`, 120 XDL) resolves 420 more PIPs
  (`db/s6-pips-other.json`: 1079); the CMT tiles' own paths (an output's chain, always together) stay unresolved.
- **The settings** (`ana-cmtsites6.mjs`: `db/xc6slx16-cmt-settings.json`; `cmt6.mjs` predicts them): a DCM's or PLL's
  settings bits are in the 31-frame column its tile is in (frames 327 to 357 of each row), in its tile's row, the
  same at every site of a kind: the PLL's at both PLL sites, a DCM's at both DCMs of its parity (DCM_X0Y1 and
  X0Y3, DCM_X0Y0 and X0Y2), the two DCMs of a CMT tile with different bits (not a shift of each other: #727's "283
  bits on" held for its base only). A pattern per kind and setting (`cmtCfg`), from every design measured; the even
  DCM's settings measured as the odd one's were (`gen-dcm6.mjs --dcm DCM_X0Y0`, `ana-dcm6.mjs --dcm`: `dcmEven`).
- **Each output alone** (`gen-cmtsites6.mjs --outputs`: 44 designs, the pad and BUFGMUX fixed per site): in the CMT
  column a DCM's bits beyond its settings do not depend on the output (its input path, the same per site and pad)
  but for 2 when CLKFX or CLKFX180 is used (the DFS); an output's own bits, 1 to 3, are in the centre column (its
  path to the BUFGMUX).
- **The probe** (`gen-cmtprobe6.mjs`, `ana-cmtprobe6.mjs`: `db/s6-pips-probe.json`): the PIPs the PIP drop could not
  take apart, each on a TIEOFF net of its own (59 XDL designs, one PIP per region each): 222 PIPs, 148 with bits. The
  REG_V_HCLK tile's are left out: alone a BUFH route-through and a spine mux set bits they do not set in a design.
  The site designs' residual goes from 1404 to 1094 bits (about 27 a design), nothing predicted that ISE does not set.
- **The BUFGMUX designs** (`gen-cmtsites6.mjs --muxes`: per CMT site 8 designs from the board's clock pad, V10 for
  the bottom half and C10 for the top, two outputs on BUFGMUXes k and k + 8, the DCM's feedback on a fixed one; 48).
  **A BUFGMUX a CMT drives** sets one bit of the REGC frame (`cmt6.mjs`'s `CMT_REGC`, `cmtRegcBits`): 1008 + i for
  a CMT of the bottom half, 1024 + i for the top, the BUFGMUXes in one order (X3Y16, X3Y15 … X2Y1); exact on the 48.
- **The paths' PIPs one at a time** (`gen-cmtdrop6.mjs`: each PIP of the designs' other tiles the databases have no
  bits for, dropped alone from the first design that has it, 354 XDL; `ana-cmtdrop6.mjs`: `db/s6-pips-cmt.json`,
  331 PIPs, 94 with bits). The drop of many PIPs at once had given the CLKC tile's selections no bits (theirs are
  far from its region and went to other tiles); alone, each is its own (`CLKC_PLL_Ln -> CLKC_GCLKn`).
- **A CMT's input and outputs** (`ana-cmtinput6.mjs`: `db/xc6slx16-cmt-input.json`, from the BUFGMUX and one-output
  designs of the bottom half; `cmt6.mjs`'s `cmtUses`, `cmtInputBits`): what is left with the settings, the PIPs and
  the REGC bits predicted, by what the CMT uses. Each output that drives a net sets one bit of the CMT's frame (357
  of its row), the frequency synthesizer three (CLKFX and CLKFX180 alike); the BUFIO2 that drives its CLKIN a bit of
  the I/O words, V10's BUFIO2_X3Y7 3554,201, and another BUFIO2 also the CMT frame's input selection; any CMT of the
  bottom half the clock spine's 3,64 3,66 3,69 3,74 and 1491,74, the PLL also 1491,64 to 69.
- **The residual** (`residual6.mjs --no-cmt-paths`: a CMT by these rules, without #727's whole paths, which carry
  the bits of the design they were measured in): the 16 BUFGMUX designs of the bottom DCMs, those the Nexys3 uses,
  are exact; the PLL_ADV_X0Y0's leave 1 bit (1101,416, an output's enable its settings were measured without). On
  #727's 32 bottom-half CMT designs, which the rules were not derived from, nothing is predicted that ISE does not
  set; what is left is their output flip-flop's clock in the IOB (an OLOGIC2, 7 bits) and the BUFIO2s of the pads
  not measured. The examples stay exact on both boards. The top half's CMTs (their CMT_PLL_TOP paths are not in the
  drop) and the XC6SLX45's: #2025.

### The block RAM and the DSP48A1 (#728, S6-F, 2026-10-29)

XDL designs with no nets, every RAMB16BWER, RAMB8BWER or DSP48A1 site of the part holding an instance (`gen-hard6.mjs`;
`ise-xdl-bits.sh`; `ana-hard6.mjs`: `db/<device>-hard.json`; the prediction, `hard6.mjs`, in `residual6.mjs`):

- **The settings**: a base (the settings as `packages/silinx-fpga/src/fpga/s6/xdl.js` writes them), id designs (which site each bit is) and
  variants (one element's other option per site, from the primitive definitions). A site's bits are offsets from its
  tile's region (`gridRegion`; a BRAMSITE2 or MACCSITE2 tile spans its INT row and the 3 above), the same at every
  site: the RAMB16BWER's 50 base bits (its settings in two copies, one per half), the DSP48A1's 1. The RAMB8BWERs are two
  to a tile and share its rows, by slot (the lower and upper site): 24 bits each, 2 of them either one's. Their
  variants measured with the tile's other site empty (`a<slot>v<k>`) are the ones a RAM alone in its tile has; with
  the other site there (`s<slot>v<k>`) some options also change the other's bits, and the alone ones predict a tile of
  two RAMs of different settings bit for bit. A RAMB8BWER's SDP mode (36-bit ports) is measured as one combination
  (`HARD_COMBOS`). The inverters set no bit on a pin with no net (Silinx writes them uninverted).
- **The contents** (`c<j>`: INIT_xx, INITP_xx, INIT_A … with bit i set when bit j of i is; `cpar` the parity alone;
  `cf0` / `cf1` which of INIT_A, INIT_B, SRVAL_A, SRVAL_B; `cid<j>` which site): each site's 18432 bits (9216 a RAMB8's)
  in the BRAM frames from its first, the data bit i's and the parity bit i's offsets the same at every site.
  `w<j>`, each site on a pair of port widths (A alone, B alone, both, one at the widest): a RAMB16BWER with neither port
  36 bits wide has its contents in another order (`narrow`), on the same positions; a RAMB8BWER one order. INIT_x and
  SRVAL_x are as wide as their ports: value bit k below the width at index k, a 9- or 18-bit port's parity bits also
  at the parity's (`fieldIndices`, checked on every pair).
- **With nets** (`ise-s6.sh impl`: block RAMs in both slots, at 36 and 18 / 9 bits, on one clock or two, a DSP48A1
  with every register): a block RAM's clock pin with a net sets one bit per half (`--pins`: measured on the designs
  with one clock, checked on the others). With them the stopwatch (its RAMB8BWER and three DSP48A1s) and the nine
  designs on the XC6SLX16 have every bit explained, the BRAM frames included, but one PIP of routing (a
  BRAM_HCLK_FEEDTHRU's clock to the lower half of the clock row, `HCLK_GCLK12_INT -> HCLK_GCLK12`): #1957.
- **The XC6SLX45** (the same designs, 109 XDL and 6 HDL; `db/xc6slx45-hard.json`): the same offsets, options, fields,
  clock pins and contents' orders as the XC6SLX16's, on its 116 RAMB16BWER, 232 RAMB8BWER and 58 DSP48A1 sites. Its
  Atlys stopwatch has every bit explained; the HDL designs leave only its folded columns' HCLK PIPs (#1957). Its XDL
  designs of RAMB8BWERs or DSP48A1s also set minors 16 to 19 of two SLICEM columns' clock row words in the top row
  (`outside`; in no design ISE implemented).

## The order of the work

1. **Without ISE** (night 0, this one): the plan and the issues; the simulation models of the Spartan-6
   primitives, so the open synthesis's Spartan-6 netlists are simulated against the RTL in VHDL and
   Verilog (#720); the slice model and the packer (#721); the devices' entries behind a developer flag
   (#722); the scripts of night 1 (#733).
2. **Night 1** (S6-0): the reports and reference designs. Then the device descriptions (#723) and the
   packer's comparison with map (#721).
3. **The format** (S6-A, #724): an empty design byte-identical; nothing else can be checked before it.
4. **Logic** (S6-B, S6-C, #725), then **routing** (S6-D, #726): the gates example (no clock) can then be
   built end to end with a placer and a router of a first kind (#729, #730).
5. **I/O and clocks** (S6-E, #727): every example with a clock.
6. **Block RAM and DSP** (S6-F, #728): stopwatch.
7. **Timing** (S6-G, #731), the **XC6SLX45** (S6-G), and the **flow end to end** (#732): the examples
   byte-identical with ISE on both boards, the flag removed.

## The issues

| Issue | What | Needs ISE |
|---|---|---|
| [#720](https://github.com/pmnmalo/Silinx-ISE/issues/720) | simulation models of the open synthesis's Spartan-6 primitives | no |
| [#721](https://github.com/pmnmalo/Silinx-ISE/issues/721) | the slice model and the packer | the comparison only |
| [#722](https://github.com/pmnmalo/Silinx-ISE/issues/722) | the open flow's device entries behind a developer flag | no |
| [#723](https://github.com/pmnmalo/Silinx-ISE/issues/723) | device descriptions of the two parts | yes |
| [#724](https://github.com/pmnmalo/Silinx-ISE/issues/724) | the bitstream format, reader and writer | yes |
| [#725](https://github.com/pmnmalo/Silinx-ISE/issues/725) | bit database: LUTs and slices | yes |
| [#726](https://github.com/pmnmalo/Silinx-ISE/issues/726) | bit database: routing | yes |
| [#727](https://github.com/pmnmalo/Silinx-ISE/issues/727) | bit database: I/O and clocking | yes |
| [#728](https://github.com/pmnmalo/Silinx-ISE/issues/728) | bit database: block RAM and DSP48A1 | yes |
| [#729](https://github.com/pmnmalo/Silinx-ISE/issues/729) | the placer | the check only |
| [#730](https://github.com/pmnmalo/Silinx-ISE/issues/730) | the router | the check only |
| [#731](https://github.com/pmnmalo/Silinx-ISE/issues/731) | static timing | yes |
| [#732](https://github.com/pmnmalo/Silinx-ISE/issues/732) | the flow end to end on both boards | yes |
| [#733](https://github.com/pmnmalo/Silinx-ISE/issues/733) | this plan and night 1's scripts | the runs |

## Decisions

Recorded here because the work was planned without the author's answers (2026-10-21):

- **Both boards from the start**, the XC6SLX16 first: the tile types are shared, the XC6SLX45 is stage S6-G.
- **New files for the Spartan-6** (`core/fpga/s6/`, `research/s6/`), the Spartan-3E modules unchanged but
  for the shared models (UNISIM, the compiled primitives), whose new primitives add to them.
- **Silinx's synthesis remaps stay for the LUT4 families**: the Spartan-6 netlist is Yosys's `xc6s`
  mapping as it is, until the flow works end to end and its quality can be measured against XST.
- **A developer flag** (`SILINX_SPARTAN6_OPEN=1`) shows the parts of the flow that exist; the users see
  nothing new until #732.
- **The device descriptions** of the two parts will ship as the Spartan-3E boards' do, the decision of
  2026-10-11 (docs/OPEN-TOOLCHAIN.md) extended to the two Spartan-6 boards Silinx supports.

## Trying the parts that exist

The Spartan-6 parts of the flow are behind a developer flag (#722): with `SILINX_SPARTAN6_OPEN=1` in the server's
environment (`SILINX_SPARTAN6_OPEN=1 npm start`), a project on the Nexys3 or the Atlys in the Silinx toolchain mode
runs the steps that exist (the synthesis for the Spartan-6 and its Post-Synthesis Simulation Model) and refuses the
others; without it the Spartan-6 is refused as before. The browser edition has no flag.

## Files

| File | What it does |
|---|---|
| `README.md` | This plan, and the results as they come |
| `night1.mjs` | Night 1's work folder: the examples' HDL and UCFs on both boards, the open synthesis's EDIF netlists, the empty designs |
| `ise-s6.sh` | Inside the ISE container: `report`, `empty`, `impl`, `edif` |
| `night1-remote.sh` | Night 1 on the machine with Docker and ISE (`SILINX_ISE_HOST` on the command line) |
| `summarize-night1.mjs` | Night 1's results as `measured/night1.json` (counts and observations, no Xilinx file) |
| `bits6.mjs` | Reads a Spartan-6 `.bit`: its header and the UG380 packets (16-bit words) |
| `compare-place.mjs` | The placer against ISE's placement of the same netlists (night 1): `measured/place-compare.json` |
| `place-xdl.mjs` | The examples placed (and with `--route`, routed) as XDL, for ISE's check |
| `compare-route.mjs` | The router against ISE's routing of the same netlists (night 1): `measured/route-compare.json` |
| `ise-place-check.sh` | Inside the ISE container: `xdl -xdl2ncd`, `par -k` and `drc` of the placed XDL, `drc` of the routed one |
| `summarize-ise-check.mjs` | That check's logs as `measured/ise-check.json` (the messages by id and count) |
| `ise-format.sh` | Inside the ISE container: the empty designs through bitgen with Silinx's options and their variants (#724) |
| `gen-lutmap6.mjs` | The LUT map's designs in XDL (`--sample`: a sample of the slices) (#725) |
| `ise-xdl-bits.sh` | Inside the ISE container: XDL designs through `xdl -xdl2ncd` and bitgen (#725) |
| `ana-lutmap6.mjs` | The LUT map from their bitstreams: `db/<device>-lut.json` (#725) |
| `prim-defs6.mjs` | The sites' elements and options from an XDLRC: `measured/prim-defs.json` (#725) |
| `gen-slice6.mjs` | The slice settings' designs in XDL, one per slice kind (#725) |
| `ana-slice6.mjs` | The slice settings from their bitstreams: `db/<device>-slice.json` (#725) |
| `check-slice6.mjs` | The LUT and slice databases checked against ISE's implemented examples, tile by tile (#725) |
| `gen-pipprobe6.mjs` | The PIP probe and the INT switch box's rounds, a PIP per INT tile on a net of its TIEOFF (#726) |
| `gen-pipcover6.mjs` | The PIPs that need a driven source, on paths from a driver (#726) |
| `ana-pipprobe6.mjs` | Their bits: `db/<device>-int.json`, `-int-cover.json` (#726) |
| `check-pips6.mjs` | The INT PIP database checked against ISE's implemented examples, tile by tile (#726) |
| `gen-pipdrop6.mjs` | The examples routed by ISE without the other tiles' PIPs (`--split`: a quarter at a time) (#726) |
| `ana-pipdrop6.mjs` | Their bits by tile and PIP: `db/s6-pips-other.json` (#726) |
| `residual6.mjs` | Every bit of ISE's implemented examples predicted from the databases; what is left, by tile type (#725, #726) |
| `gen-iob6.mjs` | The pads' designs: every bonded pad an IOB of one setting, the id designs (#727) |
| `gen-clock6.mjs` | The clock path's designs (ISE implements them): one or more clocks to fixed flip-flops, k16 (#727) |
| `ana-clock6.mjs` | A clock pad's REGC and I/O bits, the spines' PIP groups: `db/s6-clocks.json`, `db/s6-pips-clock.json` (#727) |
| `ana-cmt6.mjs`, `cmt6.mjs` | A DCM's and PLL's clock path: `db/xc6slx16-cmt-paths.json`; the shared helpers (#727) |
| `gen-dcm6.mjs` | The DCM's and PLL's designs, one setting per design (`--fields`: the counters' bits) (#727) |
| `ana-dcm6.mjs` | Their settings' bits: `db/<device>-cmt.json` (#727) |
| `gen-cmtsites6.mjs` | Every CMT site's designs: pads of its half and the sides, outputs on the BUFGMUXes in turn; `--outputs` each alone, `--muxes` every BUFGMUX from the clock pad (#1951) |
| `ana-cmtsites6.mjs` | A CMT's settings at any site: `db/<device>-cmt-settings.json` (#1951) |
| `gen-cmtprobe6.mjs`, `ana-cmtprobe6.mjs` | The PIPs the drop could not take apart, probed one by one: `db/s6-pips-probe.json` (#1951) |
| `gen-cmtdrop6.mjs`, `ana-cmtdrop6.mjs` | The CMT paths' PIPs dropped one at a time in context: `db/s6-pips-cmt.json` (#1951) |
| `ana-cmtinput6.mjs` | A CMT's bits beyond its settings and PIPs, by its site, outputs and BUFIO2: `db/<device>-cmt-input.json` (#1951) |
| `twr6.mjs` | trce's report read: each constraint's paths, their figures and elements (#731) |
| `timing-fit6.mjs` | The wire delay model fitted to trce's nets on ISE's routing (#731) |
| `timing6.mjs` | The logic arcs' table; trce's paths re-evaluated by the model, their slack against trce's (#731) |
| `gen-hard6.mjs` | The block RAM's and DSP48A1's designs: base, ids, variants, contents by code, width pairs (#728) |
| `ana-hard6.mjs` | Their bits: `db/<device>-hard.json`; `--pins`: the clock pins' from designs ISE implemented (#728) |
| `hard6.mjs` | A block RAM's or DSP48A1's bits from its settings, pins and contents (`residual6.mjs`, #728) |
| `gen-iologic6.mjs` | The I/O logic's route-throughs on every site (they set no bits without a net) (#727) |
| `ana-iob6.mjs` | The pads' bits: `db/<device>-iob.json` (#727) |
| `check-writer6.mjs` | ISE's `.bit` files written again by `packages/silinx-fpga/src/fpga/s6/bitstream.js`, compared byte for byte; `--json` writes `measured/format.json` |

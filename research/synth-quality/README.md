# Quality of the open synthesis (size and speed against XST)

The open synthesis is Silinx's front end (`core/synth-verilog.js`: the elaborated design as one flat
SystemVerilog module) + Yosys (`core/synth-open.js`, YoWASP 0.70 since 15.10.23, 0.68 before) + Silinx's packer
(`core/fpga/pack.js`). Until 15.10.1 its netlists were about 2.5 times larger than XST's
(research/s3e-bitstream/README.md, "To do later"). This page says where the size came from, what
changed in 15.10.2 and what is left. `measure.mjs` reproduces the tables:

    node research/synth-quality/measure.mjs [--place] [project folder…]

## Where the size came from

1. **Yosys's LUT mapping for the Spartan-3E** (by far the largest part). `synth_xilinx -family
   xc3se` maps with ABC onto LUTs of up to **8** inputs and then splits each LUT5…LUT8 into LUT4s
   and MUXF5…MUXF8 (`lut_map.v`): an 8-input LUT is 16 LUT4s and 15 MUXFs, whatever the function.
   ABC took wide LUTs as cheap, so control decoding (the state and opcode bits of a control unit)
   exploded: lab11's 198 LUTs out of ABC became 542 LUT4s and 592 MUXFs. XST maps the same logic
   into 309 LUT4s and 19 MUXF5s.
2. **Arithmetic at the width of VHDL integers.** `shift_left(to_unsigned(1, 32), level) - 1` with
   a 3-bit `level` (the blinky example) is a 32-bit shifter and a 32-bit subtracter for Yosys (it
   does not know that bits 8 … 31 of the shift are 0): a 31-stage carry chain (16 slices) in series
   with the comparator, the critical path. XST builds each bit from `level` with one LUT. The same
   holds for `k + 1` of an `integer range 0 to 9`: a 32-bit adder before Yosys trims it.
3. **The packer** gave flip-flops fed by flip-flops (shift registers, registers loaded from
   registers: D through BX / BY) slices of their own, though the slices of carry chains and wide
   multiplexers often have both flip-flop slots and BX / BY free.
4. **Shift registers**: XST puts them in SRL16 LUTs; Yosys does not infer them for the Spartan-3E
   ("Shift register inference not yet supported for family xc3se"). Done in 15.10.2 for
   fixed-length chains (below, "Shift registers in SRL16").

The way the front end writes processes and case statements was not found to matter: with the LUT
mapping fixed, lab11's LUT and flip-flop counts are at or below XST's.

## What changed (15.10.2)

- **LUT mapping** (`core/synth-open.js` `synthCommands`, 4-input-LUT families): `synth_xilinx` up
  to its `map_luts` step, then the steps of `map_luts` with `abc -luts 1,1,1,1,2,4` (a LUT5 costs
  two LUT4s, a LUT6 four: what they cost once split), then `synth_xilinx` from `finalize`. Tried:
  `-nowidelut` (LUT4 only: lab11 316 LUTs / 166 slices but 16.2 ns), costs 1,1,1,1,2 / 1,1,1,1,3 /
  1,1,1,1,2,4,8 (LUT7 allowed: 326 slices) / 1,1,1,1,2,3 / 1,1,1,1,2,5 / 1,1,1,1,3,4 / 1,1,1,1,3,6;
  `-D 1`, `-dress`. 1,1,1,1,2,4 had the best slices and critical path on lab11 and a second course
  project; 1,1,1,1,2,5 is equivalent. `-abc9` and `-widemux` fail on xc3se in YoWASP 0.68 (`-abc9`
  runs in 0.70: measured below, "ABC9"; `-widemux` is for LUT6 architectures only).
- **Tables** (`core/synth-verilog.js` `tabulate`): an expression with arithmetic (+ - * / mod,
  comparisons, shifts by a variable amount) that reads at most 6 bits of signals and variables is
  written as a function with a case over those bits; its values come from the simulator's own
  evaluator (`interp.js evalE`), so the table computes exactly what the RTL computes. Taken when
  the table (its non-constant result bits, a LUT4 each, 2 / 4 for 5 / 6 inputs) is cheaper than
  the operators (their widths). `toVerilog(design, { tables: false })` turns it off.
- **Packer**: a flip-flop whose D comes through BX / BY first tries the free flip-flop slots of the
  carry-chain and multiplexer slices (one holding logic of its nets, else any).

## Shift registers in SRL16 (15.10.2)

`core/synth-open.js` (synthCommands, SRL_MAP, SRL_CELLS): `synth_xilinx … -run :map_ffs`, then
`xilinx_srl -fixed -minlen 3` on the bit-level flip-flops (before map_ffs: after it xc3se's
dfflegalize has made them `$_SDFFE_` cells with a reset, which xilinx_srl skips), then Silinx's
own map file for `$__XILINX_SHREG_` (`silinx_srl_map.v`, given to Yosys with the design): a chain
of up to 16 stages is one SRL16E (address = length - 1), a longer one an SRL16E of 16 stages
(address 15) followed by the rest (Yosys's own cells_map.v writes SRLC32E, which the Spartan-3E
does not have); a falling clock is `SRL16E_1`, a black box declared for Yosys (`silinx_srl_cells.v`:
its cell library has no SRL16E_1, and `IS_CLK_INVERTED` would become an inverter on the clock,
extractinv of `-ise`). Then `synth_xilinx -run map_ffs:map_luts` and the LUT mapping as before.
`synthCommands(top, family, { srl: false })` keeps the shift registers in flip-flops.

The packer puts an SRL16E in the F or G LUT of a SLICEM (`#RAM:D=0x…`, `F_ATTR::SHIFT_REG`, D
through BX / BY with DIF_MUX / DIG_MUX, the shift enable on SR through WSGEN, `CLKINV::CLK_B` for
SRL16E_1), two in a slice when they share the clock and the enable; an always-enabled one (SR = 1)
may feed the flip-flop of its side when that flip-flop has no CE and no set / reset (as ISE's map
packs them: `FFX_SR_ATTR::SRLOW`, the flip-flop does not see SR). The placer keeps SLICEM
instances on the SLICEM sites (the left column of a CLB); `core/fpga/timing.js` has their arcs
(clock to the output after a shift, setup of BX / BY and SR); both simulators of
`test/fpga-sim.js` model them; the bitstream has the measured shift-register features (stage D).
ISE converts the open flow's designs to the same .bit with no DRC error or warning (srl fixture,
test/fixtures/open-flow/feat_srl, hard_prim).

| design | shift registers in flip-flops | in SRL16 | XST |
|---|---|---|---|
| srl fixture | 102 FFs, 79 slices | 66 FFs, 2 SRL16E + 2 SRL16E_1, 63 slices; with variable taps (#5): 2 FFs, 6 SRL16E + 2 SRL16E_1 | 5 FFs + 8 SRL16, about 9 slices |
| lab11, blinky, cpu8 | | unchanged (no chain of 3 or more flip-flops without reset) | |

**Variable taps** (#5, `q <= sr(to_integer(tap))`, the srl fixture's 16 x 4 bits; `q = r[k]`):
Yosys infers them (`xilinx_srl -variable`) only from a 1-bit `$shiftx` over the chain, and only
before synth_xilinx's `fine` step maps the `$shiftx` to multiplexers. So:
- the front end writes a variable bit of a vector that is a shift chain (every write
  `r <= {r[w-2:0], x}` or `{x, r[w-1:1]}`) as `r[k]` (a `$shiftx`), not `1'(r >> k)` (a `$shr`;
  other vectors keep it: written `r[k]` everywhere, verilog-i2c-master was 8 % larger); and an array that is a shift chain (every word written is the next one's, `m[i] <= m[i-1]`
  with `i` a loop's variable, or is written at a constant index, `m[0] <= d`; 64 words at most),
  read at a variable tap, bit by bit: `wire [15:0] srl_tap0_b = {m[15][b], …, m[0][b]}` read at
  the tap. A RAM (written at an address) is not touched: it stays a distributed or block RAM;
- the script runs synth_xilinx up to `fine`, then `memory_map` (a shift-chain array's words as
  flip-flops), `xilinx_srl -variable -minlen 3` and Silinx's map, then synth_xilinx from `fine`
  (before its `map_cells`, whose own map writes SRLC32E). (Running fine's own `opt -full` first as
  well made t80 7 % larger.)
- the map (`_TECHMAP_CONSTMSK_L_`: a tap that is not constant): up to 16 stages one SRL16E (or
  SRL16E_1) addressed by the tap; more, per 16 stages one SRL16E read at the tap and one at stage 15
  that feeds the next 16, the tap's high bits choosing among them (multiplexers).
The srl fixture's 64 flip-flops of `dyn` become 4 SRL16E; a 16 x 8 Verilog array 8 SRL16E (it was 128
flip-flops and about 250 LUTs and MUXFs).

**Chains of 2 stages stay flip-flops (#51)**, where XST makes them SRL16 too. On the stopwatch
example XST finds six 2-bit shift registers: the four buttons' synchronisers (`db0`..`db3/sync`) and two
stages of the decimal conversion (`dec/d0_0`, `dec/d3_3`). With `xilinx_srl -fixed -minlen 2` Silinx
finds the same six, and the design is larger: 188 flip-flops instead of 200, but 395 LUTs instead of 389
and 200 occupied slices instead of 197 (an SRL16 takes a SLICEM's LUT, where the two flip-flops fitted
in slices used already; the critical path within the placement's noise). And a synchroniser should be
flip-flops: an SRL16 does not resolve metastability as two flip-flops in series do (Xilinx's advice:
no shift-register extraction on synchronisers). So the minimum stays 3 (the author's decision,
2026-10-15; `test/synth-quality.test.js` keeps a synchroniser in flip-flops).

**The SRLC16 cascade** (#24): a chain of 17 to 32 stages is the map's SRL16E of 16 stages, read at address 15,
followed by the rest. The packer puts the two in one SLICEM, as ISE's map does: G holds the first 16 stages and F
the rest, F's data being G's last stage through SHIFTIN (`DIF_MUX = SHIFTIN`, a bit of the database). So the chain
needs no net and no BX between them (the srl fixture's 20 stages; ISE converts it to the same .bit). Between
slices (`DIG_MUX = SHIFTIN`) the bits are not measured yet (#2), so a chain longer than 32 continues through
general routing, as does a variable tap past 16 stages (a second SRL16E per 16, read at stage 15).

## Results

Cells, LUTs, MUXF5-8, carry cells (MUXCY + XORCY), flip-flops, slices after the packer (as the open
flow packs), the placer's estimate of the critical path (seed 1). *stock*: 15.10.1's synthesis
(no tables, Yosys's own mapping; slices with the new packer); *luts*: the new LUT mapping only;
*now*: 15.10.2. lab11 and "project 2" (a second course project of the same kind) are user projects,
not in the repository.

| design | way | cells | LUTs | MUXF | carry | FFs | slices | est. ns |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| lab11 | stock | 1290 | 542 | 592 | 61 | 59 | 403 | 18.2 |
| lab11 | luts | 503 | 278 | 69 | 61 | 59 | 165 | 14.2 |
| lab11 | **now** | 503 | 278 | 69 | 61 | 59 | **165** | 14.2 |
| lab11 | XST | | 309 | 19 | 61 | 71 | 180 | |
| project 2 | stock | 1561 | 677 | 724 | 65 | 59 | 468 | 16.3 |
| project 2 | **now** | 528 | 290 | 78 | 65 | 59 | **174** | 13.9 |
| project 2 | XST | | 346 | | | 71 | 201 | |
| examples/blinky | stock | 445 | 79 | 16 | 225 | 97 | 104 | 11.2 |
| examples/blinky | luts | 445 | 79 | 16 | 225 | 97 | 104 | 11.2 |
| examples/blinky | **now** | 367 | 70 | 17 | 162 | 97 | **86** | 8.0 |
| examples/blinky | XST | | 104 | | | 97 | 99 | |
| cpu8 (fixture) | stock | 918 | 389 | 369 | 65 | 54 | 281 | 16.5 |
| cpu8 | **now** | 467 | 249 | 58 | 65 | 54 | **151** | 14.2 |
| blinky (fixture) | stock | 376 | 73 | 12 | 186 | 78 | 89 | 11.1 |
| blinky | **now** | 298 | 63 | 14 | 123 | 78 | **71** | 7.9 |
| blinky | XST | | 145 | 0 | 126 | 78 | | |
| fsm | stock | 84 | 34 | 24 | 5 | 8 | 20 | 5.7 |
| fsm | **now** | 42 | 12 | 3 | 5 | 8 | **9** | 4.6 |
| fsm | XST | | 16 | 2 | 0 | 8 | | |
| adder | stock | 297 | 63 | 15 | 105 | 29 | 63 | 3.6 |
| adder | **now** | 284 | 64 | 1 | 105 | 29 | **57** | 3.6 |
| adder | XST | | 101 | 0 | 128 | 29 | | |
| srl | stock | 335 | 59 | 156 | 0 | 102 | 129 (147 with the old packer) | 2.3 |
| srl | **now** | 240 | 65 | 55 | 0 | 102 | **79** | 2.0 |
| srl | XST | | 0 | 0 | 0 | 5 + 8 SRL16 | | |

(XST: lab11 and project 2 from ISE's map report; the fixtures' cells from their netgen
post-synthesis netlists, test/fixtures/netgen; the designs with block RAMs, DCM, multipliers,
distributed RAM or tri-state buffers are left out: the packer did not take those cells then. The
srl row: before SRL16; with them, below.)

The full open flow (`research/s3e-route/open-flow.mjs`: pack, place, route, static timing, a
complete bitstream) against ISE's place and route:

| design | 15.10.1 | 15.10.2 | ISE (XST + map + par) |
|---|---|---|---|
| lab11 | 403 slices, 17.6 ns | 165 slices, 14.1 ns | 180 slices, 10.9 ns |
| project 2 | 468 slices, 15.1 ns | 174 slices, 13.1 ns | 201 slices, 10.7 ns |
| examples/blinky | 104 slices, 11.8 ns | 86 slices, 7.7 ns | 99 slices, 6.7 ns |

## Logic depth (15.10.3)

The EPFL max benchmark (#52, four 128-bit numbers, gate-level Verilog) took 69.9 ns with the
Silinx toolchain against ISE's 25.7: its critical path was 45 levels of 6-input functions (LUT,
F5 and F6 multiplexers), a comparator's chain of gates mapped as written. ABC's default script for
LUTs (`strash; …; dc2; dretime; strash; dch -f; if; mfs2`) maps for depth, but only over the
structure it is given; nothing in it restructures a long chain.

Tried (each mapping packed and estimated with all connections at 0.45 ns, on the designs of the corpus and
the examples; LUTs / slices / estimated ns as geometric means against the default script):

| ABC script (with `-luts 1,1,1,1,2,4`) | EPFL max | all designs |
|---|---|---|
| default | 1090 LUTs, 66.2 ns | 1 / 1 / 1 |
| `strash; dc2; if -g; strash; dch -f; if; mfs2` | 1324 LUTs, 31.4 ns | |
| `…; &syn2; &if -g -K 6; &synch2; …` | 1723 LUTs, 24.4 ns | |
| `…; dch -f; if; speedup; if; mfs2` | 2300 LUTs, 22.8 ns | |
| **`strash; dc2; balance; dch -f; if -g; strash; dc2; dch -f; if; mfs2`** | **1168 LUTs, 31.5 ns** | **0.992 / 0.985 / 0.935** |
| the same with `&fraig -x; scorr` first | 1168 LUTs, 31.5 ns | 0.993 / 0.988 / 0.942 |
| `if -g` twice | 1494 LUTs, 23.3 ns | 0.997 / 0.995 / 0.929 |
| the bold one, then `strash; dch -f; if; mfs2` again | 1150 LUTs, 31.5 ns | 0.970 / 0.976 / 0.940 |

`if -g` (ABC's delay-oriented SOP balancing) then an area-oriented mapping of the balanced logic
halves max's depth for 7 % more LUTs, and on most designs it is as good or better; but not on all
(secworks-sha1 +4 %, verilog-uart +6 % by the estimate), and on AES (10 000 LUTs) it takes minutes
and 4 GB. ABC's `read_lut` (LUT delays by size) crashes in YoWASP, so ABC cannot be told that a
6-input function (LUT, F5, F6) is slower than a LUT4.

So the open synthesis (`core/synth-open.js`, `synthesizeOpen`) maps the 4-input-LUT families as
before, writes the design as it was before the LUT mapping (`write_rtlil`), maps that again with the
bold script (`DEPTH_ABC`, a second Yosys run from the LUT mapping on) and keeps the second netlist
when its estimated critical path (`criticalDelay`: the netlist's cells with the -4 logic delays of
`core/fpga/timing.js`, 0.45 ns per connection between slices, none inside one) is 3 % shorter
without more LUTs in proportion than it gains (10 % more at least), or when it is no slower and
smaller (`keepDepth`). Designs above 5000 LUTs keep the usual mapping. `r.depth` says what happened;
`depth: false` turns it off.

The open flow (pack, place, route; Silinx's timing analysis of the routed design, mean of placer seeds
1-3, the designs on the XC3S1200E, the examples on the XC3S250E), before -> after:

| design | ns | slices |
|---|---|---|
| epfl-max | 71.4 -> **37.0** (ISE: 25.7) | 610 -> 645 |
| epfl-priority | 43.2 -> **16.7** (ISE: 20.8) | 162 -> 144 |
| epfl-adder | 82.7 -> 75.5 (ISE: 12.3) | 264 -> 268 |
| vtr-stereovision3 | 8.51 -> 7.75 (ISE: 4.9) | 118 -> 113 |
| epfl-router | 9.81 -> 9.18 | 39 -> 38 |
| verilog-i2c-master | 11.30 -> 10.64 | 135 -> 128 |
| nandland-spi-vhdl | 10.95 -> 10.32 | 88 -> 85 |
| t80 | 24.04 -> 23.07 | 1539 -> 1528 |
| fpu-multiplier, serv | -4 % | -0 to -1 % |
| verilog-lfsr-crc, epfl-i2c, fpu-adder | +2 to +5 % (smaller netlists, placement noise) | -1 to -5 % |
| examples/blinky | 7.43 -> 7.48 (one LUT fewer) | 86 -> 86 |
| examples/pong, examples/stopwatch, verilog-uart and 14 others | unchanged (the usual netlist kept) | |
| **32 designs** | **-6.0 %** (geometric mean) | **-0.9 %** |

Left: EPFL adder (a 128-bit adder as gates: XST's netlist has 12.3 ns, ours 75); max is still 1.4
times ISE's.

## Carry chains of logic written as gates (#77)

An adder or a comparator written bit by bit (a schematic of full adders, a ripple-carry adder in HDL, the
EPFL benchmarks, which are AND-inverter graphs) reaches Yosys as gates; ABC maps them onto LUTs bit after
bit and never onto the carry chain (the EPFL adder: 84 ns estimated, 75 ns by trce, against XST's 12 ns).
Yosys's `extract_fa` finds almost none of the full adders of such a graph (1 chained full adder of 128 in
the EPFL adder: it takes half adders where the carry runs through AND gates).

`core/carry-chain.js` finds them on the netlist of Yosys's coarse synthesis (written as JSON at the start
of synth_xilinx's `fine` step, the rest of the flow then run from the rewritten JSON):

- the 3-cuts of every 1-bit logic cell, with their truth tables (k-cut enumeration, up to 48 cuts per
  node: the cut {a[i], b[i], c[i]} of a carry is often far down the list);
- a carry: a majority of three nets, each maybe inverted, the result too (`MAJ(~a, b, c)` is a borrow, a
  comparison); a net and its inverse are one carry; a 2-input AND / OR may start a chain (bit 0);
- a chain: carries each of which takes the one before as its third input, 4 at least; a carry with no
  carry before (a carry in port) heads it, any of its inputs taken as the carry in (MAJ is symmetric);
- the chain becomes one `$alu` (its A and B the bits' inputs, inverted where they are), the carries and
  the sums (XOR3 of a bit's inputs and its carry in) driven from its CO and Y; the old gates are left
  without loads.

Only designs with 24 1-bit gates at least are looked at (the examples have 1 to 16). When a chain is
found the design is mapped both ways, with the chains and as before (each with its depth-oriented
remapping), and the faster kept by the rule of the depth-oriented mapping (DEPTH_RULE); without a chain it
keeps its single run (the JSON round trip alone changes ABC's results a little: the order of the cells).
EPFL adder: 129 LUT2 + 128 MUXCY + 127 XORCY instead of ~640 LUTs and MUXFs, 17.4 ns estimated instead of
83.7. EPFL max: chains of 30 bits only (past them its comparators combine several bits at once, a
lookahead the majority does not match), slower than without them (41.8 ns estimated against 31.9): mapped
as before (#52 left).

## Logic depth: balanced once more (#52)

The depth-oriented mapping (above) took EPFL max from 66 to 32 ns by the estimate, ISE's 25.7 ns by its
trce still ahead. Tried on the design corpus (38 designs, the open flow to the routed design, seed 1),
against 15.10.15:

| ABC script of the depth-oriented mapping | EPFL max (routed) | all designs: period / LUTs / slices | synthesis time |
|---|---|---|---|
| `if -g` twice, then `strash; dch -f; if; mfs2` again, for every design | 30.2 ns, 898 slices | 0.961 / 0.995 / 0.997 | about 1.8 times |
| the same only after the depth-oriented mapping was kept (**kept**) | 30.2 ns, 898 slices | **0.968 / 0.998 / 1.000** | about 1.3 times (a loaded machine) |

The second `if -g` (ABC's delay-oriented SOP balancing) of the balanced logic halves the depth again
where the first left long paths; the area-oriented mapping after it brings the LUTs back (EPFL max alone:
22.6 ns estimated and 1410 LUTs, against 22.6 ns and 1658 LUTs without it). It takes long on large
designs (EPFL bar's synthesis four times as long, and not kept), so only the designs whose first
depth-oriented mapping was kept, their depth the limit, are balanced once more (`DEPTH_ABC2`). That
netlist is kept (`keepSecond`) when it is better than the first by the rule of the depth-oriented
mapping, or faster than it by the rule's 3 % and kept by the rule against the usual mapping: against the
first alone, max's would be refused (24 % faster for 37 % more LUTs), though its slices stay fewer than
ISE's (898 against 927).

Changed (period / LUTs): EPFL max -17 % / +39 %, EPFL priority -29 % / -12 %, serv -19 % / +3 %, EPFL
router -13 % / -3 %, femtorv32-quark -10 % / +8 %, neorv32 -7 %, vtr-stereovision3 -6 % / -10 %,
verilog-i2c-master -5 % / +8 %, EPFL int2float -21 % LUTs; the examples: the pedestrian crossing 7.1 ns
estimated instead of 7.9 and 94 LUTs instead of 114 (32 MUXF instead of 22), the others as before.
Against ISE, EPFL max is still slower (30.2 ns against 25.7, #52 left): its comparators.

### Balanced twice more: a third candidate (#52, 15.11)

Since #468 (Effort Normal maps the deep designs for speed) EPFL max is the same at both efforts: 1258 LUTs,
722 slices, 29.0 ns routed by Silinx's timing (its I/O wrapper, the XC3S1200E; ISE 1386 LUTs, 927 slices,
25.7 ns). ABC's scripts tried on max alone (LUT4s, its levels by Yosys's `ltp`):

| ABC script | LUT4s | levels |
|---|---:|---:|
| ABC's default (`strash; dch -f; if; mfs2`) | 868 | 36 |
| `DEPTH_ABC` | 997 | 22 |
| `DEPTH_ABC2` (`if -g` twice) | 1038 | 17 |
| `if -g` three times | 1142 | 15 |
| `if -g` four times | 1052 | 16 |
| `&sopb` / `&dsdb` (SOP / DSD balancing of the GIA) | 1245 / 1062 | 34 / 51 |
| `DEPTH_ABC2`, then `speedup -l` and `if` (twice) | 1061 to 1110 | 16 to 18 |

Each `if -g` more shortens a priority chain or a comparator tree; but in place of `DEPTH_ABC2` it made serv
7 % and the EPFL router 8 % slower by the estimate. So it is a third candidate (`DEPTH_ABC3`: `if -g` four
times, with the LUT delays), made beside the two of `DEPTH_ABC2` and kept as they are (`keepSecond`, a later
one in place of an earlier one when better by `DEPTH_RULE`). On the 16 designs of the corpus whose
depth-oriented mapping is kept (synthesis at High, the estimate; the others do not make it):

| design | before: ns / LUTs / slices | with the third candidate |
|---|---|---|
| EPFL priority | 16.5 / 209 / 118 | **8.8 / 213 / 117** (routed, I/O wrapper: 11.20 -> 9.08 ns at both efforts) |
| EPFL max (I/O wrapper) | 24.9 / 1258 / 722 | **22.9 / 1234 / 715** (routed 29.0 -> 28.1 ns at both efforts) |
| the pedestrian crossing (High) | 7.60 / 108 / 67 | **7.32 / 106 / 66** (routed 8.61 -> 8.16 ns) |
| the 13 others (serv, the EPFL router, ctrl, i2c, ITC'99 b10, b13, b14…) | | as before (the third refused) |

Unwrapped, max's third (21.1 ns, 1252 LUTs, 716 slices against 23.0, 1099, 589) is refused (22 % more
slices for 8 % of speed). The other examples are as before at both efforts. Synthesis time: one Yosys run
more for these designs only, beside the other two (EPFL max 9.4 -> 10.9 s, the others within 0.3 s).

What is left of #52: max's critical path is its two 128-bit comparisons in series, each followed by the
select of 128 multiplexers (a net of fanout 128, 2.2 ns); max's LUT-6 depth record is 6 levels where this
mapping has 15 to 17 LUT4 levels. Its logic is written as gates (an AND-inverter graph), so ABC's
balancing keeps the second comparison after the first one's multiplexers; recognising each comparator
(as a function of 256 nets, the multiplexers' outputs for the second) and putting it on the carry chain,
or comparing the four inputs pairwise at once, would restructure it. ISE could not be run for this
measurement (the ISE host was out of reach); Silinx's timing of the routed max was within 2 % of ISE's
trce in the last comparison (docs/QUALITY.md: 29.12 against 28.50 ns at High).

## SOP balancing of the GIA (#654, #655, #52)

The weekly comparison of 2026-10-20 left three EPFL benchmarks slower than ISE for their logic alone (*Where the
speed is lost*, below): the multiplier (87 levels of LUTs against ISE's 38, 1.40 times ISE's period; 7527 LUTs, above
DEPTH_RULE.maxLuts, so mapped for area at both efforts), the adder (its 128-bit carry chain, 1.09) and max (1.08).

The multiplier is a 64 x 64-bit multiplier as an AIG of 27 062 ANDs, 274 levels deep, each output bit two levels
deeper than the one before (f[k] at about 2k + 11): Booth-encoded partial products added row after row, the full
adders not left as nodes (of 3714 three-input XORs of its cuts, 1430 have a majority of the same three leaves, by
simulation; no two nodes are equivalent). A structural recovery of the adder tree (#77's carry chains, or a
Wallace tree) would need the arithmetic found through the Booth encoding first. ABC's own restructuring does it
without that: `&sopb`, the SOP balancing of the GIA (the AIG with structural choices), where `if -g` on the AIG (the
depth-oriented mappings, DEPTH_ABC…) keeps the array's structure. ABC alone on the AIG (yosys-abc 0.70, LUT4
levels / LUTs):

| ABC script (the multiplier) | levels | LUT4s | s |
|---|---:|---:|---:|
| `strash; dch -f; if -K 4` (the usual) | 87 | 7795 | 1.0 |
| `DEPTH_ABC` (`… if -g …`) | 87 | 7738 | 2.9 |
| `&syn2; &if -g -K 6; &synch2; &if -K 4` | 60 | 8524 | 2.7 |
| `&sopb; &if -K 4` | 57 | 9252 | 0.9 |
| `&sopb` twice / three times | 48 / 44 | 10233 / 11099 | 2.0 / 3.3 |
| `&sopb; &if -g -K 6; &synch2`, then `&if -K 4` | 50 | 8548 | 4.0 |
| **the same twice, then `&if -K 4`** (`DEPTH_SOPB`) | **45** | **8792** | 9.1 |

The same script on the others: max 57 -> 14 levels (1027 -> 1150 LUT4s), the adder 85 -> 8 (339 -> 491; ISE's
adder is 8 levels of LUTs too), priority 56 -> 21, sin 54 -> 47, voter and log2 a little. In the open synthesis
(`remapCommands` with the script, from the design before the LUT mapping; estimate / levels / LUTs / slices),
the final mapping onto LUT4s alone (`&if -K 4`) is the smallest: the multiplier 100.5 ns -> 52.2 / 45 / 8729 / 4365
in 19 s (with ABC's `if` onto LUT4_COSTS after it: 53.2 ns, 10362 LUTs, 5745 slices; its usual run takes 6 min).

So `DEPTH_SOPB` is one more candidate (`r.depth.sopb`), made for a design whose usual netlist is more than 16
levels deep, of 20 000 LUTs at most (`SOPB_RULE`), at both efforts, started beside the other mappings and kept when
better than the netlist they chose by DEPTH_RULE; at Normal, for a design too large for High's mappings
(DEEP_RULE.maxLuts), only when DEEP_RULE.gain (a quarter) faster, as High's mappings at Normal (#611). The routed
designs (XC3S1200E, the I/O wrapper, as the weekly comparison; ISE's trce, DRC clean, the .bit byte-identical to
ISE's bitgen), at both efforts (the same netlists):

| design | before: trce / LUTs / slices | with DEPTH_SOPB | ISE |
|---|---|---|---|
| epfl-multiplier | 93.22 ns / 7574 / 3787 | **61.63 ns** / 8719 / 4360 (estimate 100.8 -> 53.6) | 66.76 ns / 12245 / 6162 |
| epfl-max | 27.30 ns / 1234 / 715 | **22.53 ns** / 1344 / 672 (DEPTH_ABC3's netlist replaced) | 25.68 ns / 1386 / 927 |
| epfl-adder | 13.34 ns / 171 / 194 (the carry chain) | **11.45 ns** / 675 / 338 (8 levels of LUTs) | 12.25 ns / 696 / 446 |

The three are now faster than ISE's (0.92, 0.88 and 0.93 times its period); the adder's slices grow (still fewer
than ISE's). The other designs of more than 16 levels make the candidate and refuse it, their netlists as before
at both efforts: EPFL priority (15.7 ns against DEPTH_ABC3's 8.8), sin (51.3 against 60.5, but 37 % more LUTs),
log2 (100.8 against 116.9, 25 % more LUTs), voter, ITC'99 b05, b14 (High), b20, b21, b22. The examples (1 to 8
levels) and the other designs of the corpus do not make it (the examples' netlists checked identical at both
efforts). Synthesis time: one Yosys run more for those deep designs, beside the others (the multiplier 331 ->
350 s, log2 291 s with it, the others a few seconds more).

## LUT4s alone (#54)

ABC's LUT mapping (`abc -luts 1,1,1,1,2,4`) was given functions of 5 and 6 inputs at their cost in LUT4s
(two LUT4s and a MUXF5; four, two MUXF5 and a MUXF6), but it takes them for as fast as a LUT4 (its unit
delay; its LUT library, `read_lut`, crashes in YoWASP, #78), so a depth-optimal mapping makes them
wherever they save a level: multiplexers and shifters above all. A 32-bit shifter `d << s`: 213 LUTs and
120 MUXF5 / MUXF6 where a logarithmic shifter of 2:1 multiplexers takes 160 LUT3s; onto LUT4s alone
(`abc -luts 1,1,1,1`) 141 LUTs, no MUXF, the estimate 13 % longer; a rotator 313 LUTs instead of 485,
as fast; EPFL bar (128-bit barrel shifter, gates) 1156 instead of 1664, as fast.

On the design corpus (38 designs, routed, seed 1), the mapping onto LUT4s alone instead: LUTs and slices
7 % fewer (geometric mean), the period 0.6 % shorter; AES 25 % fewer LUTs, SHA-1 22 %, EPFL bar 30 %,
vtr-diffeq2 50 %; but the T80 8 % larger, and serv, neorv32 and verilog-uart 9 to 12 % slower.

So the usual mapping is onto LUT4s alone (`LUT4_ONLY`), and the one with the wider functions is a
candidate (`remapCommands(…, { script: false })`, from the same netlist before the LUT mapping, as the
depth-oriented one), kept when better by `DEPTH_RULE`: faster without being larger in proportion, no
slower and no larger, or (new) 5 % smaller at least and at most 1 % slower (`area`, `slack`: within the
estimate's error; the pong example's depth-oriented mapping is 12 % smaller and 0.6 % slower than the
LUT4s alone). The depth-oriented mapping, whose ABC script keeps the wider functions, is measured against
the LUT4s alone, or, faster than them, against the wider mapping as before (`keepSecond`: else a design
limited by its depth, the maximum of four 48-bit numbers, keeps the LUT4s alone at 41 ns instead of
21). The designs above `maxLuts` (5000) keep the LUT4s alone (AES).

Corpus, against 15.10.16's depth work: LUTs 6.5 % fewer, slices 6.2 %, the period as before (0.998);
EPFL bar 1201 LUTs (601 slices, ISE 534) instead of 1707, AES 11433 instead of 15324, SHA-256 17 %
fewer, siphash 14 %, light8080 23 %, vtr-diffeq2 half; the T80 as before (the wider mapping kept);
slower: serv +12 %, neorv32 +11 %, verilog-uart and nandland-spi-vhdl +9 % (smaller by 3 to 13 %). The
examples as before.

## LUT delays (#78)

ABC maps for depth taking every function as fast as a LUT4: `abc -luts` gives it costs, not delays.
Its LUT library (`read_lut`, lines of inputs / area / delay) can: here the -4 delays of
`core/fpga/timing.js` and a connection, 1.21 ns for a LUT4 (Tilo + 0.45), 1.60 for a 5-input function
(Tif5x + 0.45), 1.89 for a 6-input one (Tif5 + Tif6y + 0.45), at 1, 2 and 4 LUT4s (`LUT_LIB`).

YoWASP's ABC (0.68 and 0.70) crashes on `read_lut` in a script file (`abc -script x.abc`, which ABC
runs with `source`), whatever the library and wherever it is (reported upstream:
codeberg.org/YoWASP/yosys/issues/41); the same commands given inline (`abc -script
+read_lut,silinx_lut.lib;strash;if`) work (`abcInline`). (`abc -lut <file>` is no way round: Yosys's
`-lut` takes a width, and with a file name ABC maps onto gates.)

With the delays, every depth-oriented mapping instead: EPFL max 21.4 ns and 1055 LUTs (22.6 ns and
1410 without), but the first balancing of others worse (the pedestrian crossing 8.1 ns and 109 LUTs
instead of 7.1 and 94; pong 311 LUTs instead of 275). On the second balancing (`DEPTH_ABC2`) alone,
better or worse by design (serv 12 % faster, femtorv32 6 % faster for 9 % more LUTs, EPFL priority and
the pedestrian crossing as fast and larger). So the second balancing is made both ways, at once (two
Yosys in the application, #86), each kept by `keepSecond`, the one with the delays when both are and
it is better by `DEPTH_RULE`. Corpus, the designs concerned (routed): EPFL max 29.4 ns and 1232 LUTs
(30.2 and 1795), EPFL router 15 % smaller and 5 % slower, the others as before; the examples as before
but pong (11.2 ns estimated instead of 12.4, 311 LUTs instead of 275).

## ABC9 (#369)

`synth_xilinx -abc9` runs on xc3se since Yosys 0.70 (YoWASP 0.68 failed). `abc9.mjs` measures its LUT mapping
against the open synthesis's, on the examples and the design corpus's representative subset (DESIGN_SUBSET of
`scripts/yosys-update-report.mjs`), each netlist simulated against the RTL and taken through the open back end
(pack, place and route, seed 1; Silinx's timing analysis of the routed design):

    node research/synth-quality/abc9.mjs [--filter blinky,serv] [--ways now,abc9]
    node research/synth-quality/abc9.mjs --table research/synth-quality/abc9-results.json

The four mappings share the front end and the steps up to the LUT mapping (tables, SRL16E): *now* is what the
open synthesis does (`synthesizeOpen`), *lut4* its usual mapping alone (`abc -luts 1,1,1,1`), *abc9*
synth_xilinx's own `map_luts` with `-abc9` (ABC9's `&if` with Yosys's LUT delays, LUTs of up to 8 inputs then
split by `lut_map.v`), *abc9-4* the same with `-nowidelut` (LUT4s alone). Every netlist is equal to the RTL
(vtr-ch-intrinsics differs at cycle 199 in all four, as in the corpus's expectations). Geometric means over the 18
designs with a clock (2026-10-17, `abc9-results.json`):

| mapping | LUTs | slices | period | synthesis time |
|---|---:|---:|---:|---:|
| lut4 / now | 0.996 | 0.959 | 1.103 | 0.34 |
| abc9 / now | 1.232 | 1.280 | 1.118 | 0.62 |
| abc9-4 / now | 1.058 | 0.934 | 1.074 | 0.55 |
| **abc9-4 / lut4** | 1.062 | **0.974** | **0.973** | 1.61 |

- **abc9 is no candidate**: it maps onto LUTs of up to 8 inputs, each split into LUT4s and MUXF5-8 (the problem of
  15.10.1, "Where the size came from"): 23 % more LUTs, 28 % more slices and slower; EPFL dec 3840 MUXFs and
  340 slices (187 now), light8080 381 slices (192).
- **abc9-4 against lut4** (the same role, the usual mapping onto LUT4s): 6 % more LUTs but 2.6 % fewer slices and
  a 2.7 % shorter period, by design between -37 % (nandland-spi-vhdl) and +49 % (EPFL priority) slices and -19 %
  (vtr-ch-intrinsics) and +15 % (EPFL priority) period; the period of one seed (up to 12.5 % of placement noise,
  test/designs-corpus/README.md). Against *now*, which also tries the wider and the depth-oriented mappings, it
  is 7 % slower (EPFL priority 52 ns against 11).
- So abc9-4 would be one more candidate of the mappings kept by `DEPTH_RULE`, not a replacement: left to the
  synthesis-speed work (#377); not wired into `core/synth-open.js`.

Per design, abc9-4 against *now* (the 18 designs with a clock; better in bold). The last column is what
`keepDepth` (DEPTH_RULE) would keep between the two, given the routed periods and the LUTs. The open synthesis
gives it its own estimate (`criticalDelay`) instead, so it is only an indication. The rule weighs LUTs, not
slices: serv, secworks-siphash and vtr-stereovision3 keep *now* even though abc9-4 has 19 to 25 % fewer slices.

| design | slices: now → abc9-4 | | period (ns): now → abc9-4 | | LUTs: now → abc9-4 | kept by DEPTH_RULE |
|---|---|---:|---|---:|---|---|
| examples/traffic | 67 → 69 | +3.0 % | 8.05 → 10.35 | +28.5 % | 108 → 115 | now |
| examples/blinky | 86 → 79 | **−8.1 %** | 7.53 → 7.23 | **−3.9 %** | 69 → 72 | **abc9-4** |
| examples/pong | 247 → 253 | +2.4 % | 12.57 → 12.36 | **−1.6 %** | 282 → 299 | now |
| examples/stopwatch | 194 → 194 | +0.0 % | 12.49 → 12.79 | +2.4 % | 202 → 222 | now |
| examples/clock | 205 → 210 | +2.4 % | 8.82 → 8.58 | **−2.7 %** | 207 → 224 | now |
| serv | 208 → 168 | **−19.2 %** | 13.15 → 13.51 | +2.7 % | 273 → 261 | now |
| picorv32 | 791 → 749 | **−5.3 %** | 11.78 → 12.08 | +2.5 % | 1184 → 1275 | now |
| femtorv32-quark | 423 → 418 | **−1.2 %** | 17.27 → 18.72 | +8.4 % | 638 → 749 | now |
| light8080 | 192 → 207 | +7.8 % | 12.75 → 11.64 | **−8.8 %** | 313 → 343 | **abc9-4** |
| verilog-uart | 131 → 125 | **−4.6 %** | 10.27 → 9.30 | **−9.4 %** | 132 → 148 | now |
| verilog-i2c-master | 126 → 113 | **−10.3 %** | 10.96 → 9.74 | **−11.1 %** | 190 → 194 | **abc9-4** |
| nandland-spi-vhdl | 52 → 33 | **−36.5 %** | 5.49 → 5.35 | **−2.4 %** | 46 → 44 | **abc9-4** |
| fpu-adder | 341 → 344 | +0.9 % | 12.49 → 11.16 | **−10.6 %** | 480 → 514 | **abc9-4** |
| secworks-siphash | 913 → 707 | **−22.6 %** | 14.11 → 14.98 | +6.2 % | 1059 → 1060 | now |
| epfl-dec | 187 → 187 | +0.0 % | 6.51 → 6.45 | **−1.0 %** | 288 → 288 | **abc9-4** |
| epfl-priority | 115 → 130 | +13.0 % | 11.24 → 52.14 | +363.7 % | 209 → 254 | now |
| vtr-ch-intrinsics | 275 → 275 | +0.0 % | 7.59 → 6.16 | **−18.9 %** | 103 → 104 | **abc9-4** |
| vtr-stereovision3 | 112 → 84 | **−25.0 %** | 7.99 → 8.28 | +3.6 % | 135 → 140 | now |

abc9-4 would be kept on 7 of the 18 designs: blinky, light8080, verilog-i2c-master, nandland-spi-vhdl, fpu-adder,
EPFL dec and vtr-ch-intrinsics, where its period is 1 to 19 % shorter. On EPFL priority it would be refused
(52 ns against 11: without the depth-oriented mapping).

**ISE's trce** on the routed designs of the four designs where abc9-4 gains or loses most, with EPFL max added
(`abc9.mjs --routed dir`, then `research/s3e-route/ise-open-check.sh` on the ISE host; seed 1). The period is ISE's,
with Silinx's STA in parentheses:

| design | now | lut4 | abc9-4 | abc9-4 / now |
|---|---:|---:|---:|---:|
| vtr-ch-intrinsics | 7.771 (7.59) | 7.771 (7.59) | 6.105 (6.16) | **−21.4 %** |
| nandland-spi-vhdl | 5.493 (5.49) | 5.493 (5.49) | 5.447 (5.35) | −0.8 % |
| EPFL priority | 11.066 (11.24) | 44.314 (45.34) | 51.154 (52.14) | +362 % |
| EPFL max | 28.505 (28.88) | 64.405 (67.06) | 64.660 (65.19) | +127 % |

Silinx's STA is within 3 % of trce on all twelve, and ISE's DRC finds no error in any of them. The 21 warnings of
vtr-ch-intrinsics are its gated clocks (#80), the same in all three mappings. trce confirms the measurement:
- abc9-4 is clearly faster on vtr-ch-intrinsics;
- abc9-4 is as fast as the other mappings on nandland-spi-vhdl;
- on the two EPFL designs, abc9-4 is as slow as lut4, both without the depth-oriented mapping that only *now*
  tries.

### ABC9 as a candidate (#377)

At effort High, the open synthesis (`synthesizeOpen`) now also maps the design onto LUT4s alone with ABC9
(`abc9RemapCommands`). It works from the same netlist as the other mappings (`PREMAP_FILE`), reading the cells'
models and Silinx's SRL16E_1 first, because the RTLIL holds them as bare black boxes. The nets on the cells' clock
pins are marked `keep` during the mapping (#496): otherwise ABC9's alias of a clock net (`$abc$…$aiger$o…`) takes
its name, and the timing report names the clock by it. It is kept when better than
the netlist chosen by the other mappings, by `keepDepth` (DEPTH_RULE unchanged); `r.depth.abc9` says what
happened, and `abc9: false` leaves it out.

It runs after the others, or, when `run` has 4 Yosys at a time or more, right after the first two mappings and
before the second balancing. Its run takes about 2.5 times a remap's (blinky: 2.43 s against 0.97), so last in the
queue it would lengthen the synthesis most. Like the others, it is inside
the try of #401: if it fails, the usual mapping is kept.

Effort Normal, the app's default, doesn't run it.

Measured with `abc9.mjs --ways before,now` (`before`: `abc9: false`), seed 1, 2026-10-18. `now` here is the
synthesis with the candidate. The routed period is Silinx's STA; for wrapped designs (fpu-adder…) it is the
design inside the corpus's I/O wrapper. Synthesis time is one Yosys at a time (Node), so in the browser, with
several Yosys, the extra run is mostly in parallel.

| design | abc9-4 | LUTs | slices | period (ns) | synthesis (s) |
|---|---|---|---|---|---|
| examples/gates | **kept** | 2 → 1 | 1 → 1 | – → – | 5.6 → 7.7 |
| examples/traffic | not kept | 108 → 108 | 67 → 67 | 8.05 → 8.05 | 9.7 → 10.1 |
| examples/blinky | not kept | 69 → 69 | 86 → 86 | 7.53 → 7.53 | 4.1 → 6.8 |
| examples/pong | not kept | 282 → 282 | 247 → 247 | 12.57 → 12.57 | 4.9 → 7.8 |
| examples/stopwatch | not kept | 202 → 202 | 194 → 194 | 12.49 → 12.49 | 7.5 → 10.5 |
| examples/clock | not kept | 207 → 207 | 205 → 205 | 8.82 → 8.82 | 5.0 → 7.9 |
| serv | not kept | 273 → 273 | 208 → 208 | 13.15 → 13.15 | 8.6 → 11.5 |
| picorv32 | not kept | 1184 → 1184 | 757 → 757 | 12.55 → 12.55 | 8.7 → 12.6 |
| femtorv32-quark | not kept | 638 → 638 | 423 → 423 | 17.27 → 17.27 | 7.0 → 10.1 |
| light8080 | not kept | 313 → 313 | 192 → 192 | 12.75 → 12.75 | 7.2 → 10.3 |
| verilog-uart | **kept** | 132 → 148 | 131 → 125 | 10.27 → 9.30 | 6.7 → 9.6 |
| verilog-i2c-master | not kept | 190 → 190 | 126 → 126 | 10.96 → 10.96 | 7.3 → 10.1 |
| nandland-spi-vhdl | **kept** | 46 → 44 | 52 → 33 | 5.49 → 5.64 | 4.0 → 6.7 |
| fpu-adder | **kept** | 480 → 514 | 341 → 341 | 12.49 → 12.49 | 5.4 → 8.6 |
| secworks-siphash | not kept | 1059 → 1059 | 913 → 913 | 14.11 → 14.11 | 7.2 → 11.1 |
| epfl-dec | not kept | 288 → 288 | 187 → 187 | 6.51 → 6.51 | 5.0 → 7.6 |
| epfl-priority | not kept | 209 → 209 | 115 → 115 | 11.24 → 11.24 | 9.5 → 12.3 |
| epfl-ctrl | not kept | 43 → 43 | 25 → 25 | – → – | 6.7 → 9.3 |
| vtr-ch-intrinsics | not kept | 103 → 103 | 265 → 265 | 6.32 → 6.32 | 4.3 → 7.1 |
| vtr-stereovision3 | not kept | 135 → 135 | 112 → 112 | 7.99 → 7.99 | 4.5 → 7.3 |
| epfl-max | not kept | 1099 → 1099 | 722 → 722 | 28.88 → 28.88 | 20.3 → 27.9 |

- **Kept on 4 of 21 designs**: gates, verilog-uart, nandland-spi-vhdl and fpu-adder.
- **Geometric means over the 19 designs with a clock** (now / before): LUTs 1.007, slices 0.974, period 0.996.
  Synthesis time 1.47, about 2.5 to 3.9 s more per design with one Yosys at a time.
- **With 4 Yosys at a time** (`yosysWorkers(4)`, as the Node app runs them; the 7 examples, the subset and EPFL
  max, best of two runs): synthesis time 1.25, 0.9 to 1.4 s more per design (blinky 3.4 → 4.4 s, picorv32 7.2 →
  8.6 s, EPFL max 10.9 → 12.3 s). Started after the second balancing instead, it was 1.58.
- **ISE's trce on the routed designs, before → now:**
  - verilog-uart: 9.680 → 9.232 ns (−4.6 %);
  - nandland-spi-vhdl: 5.493 → 5.597 ns (+1.9 %), with 37 % fewer slices;
  - fpu-adder: 12.385 ns, unchanged (its wrapper's synthesis kept the same netlist).
- **Correctness:** every netlist is equal to the RTL, and the examples stay byte-identical with ISE's bitgen.
- **The gain is small** on these designs: most of the gain #369 measured for abc9-4 is already in the other
  mappings. A slices-aware DEPTH_RULE (#377) may keep it more often.

**The design corpus.** A synthesis of all 67 designs shows abc9-4 kept on 9 of them. The expected size and period
of those 9 are updated in test/designs-corpus/expected.json, routed, seed 1; the size is the packed slices and
LUTs, inside the I/O wrapper where there is one.

| design | slices | LUTs | period (ns) |
|---|---|---|---|
| iwls05-i2c | 215 → **140** | 429 → **279** | 8.80 → **8.64** |
| nandland-spi-verilog | 52 → **33** | 100 → **63** | 5.21 → 5.52 |
| nandland-spi-vhdl | 52 → **33** | 100 → **63** | 5.52 → 5.64 |
| verilog-uart | 131 → **125** | 259 → **246** | 10.29 → **9.30** |
| epfl-voter | 1177 → **1163** | 2353 → **2325** | 25.40 → **24.32** |
| itc99-b09 | 21 → **20** | 42 → **40** | 6.69 → **5.70** |
| verilog-lfsr-crc | 53 → **50** | 105 → **99** | 3.87 → 3.87 |
| fpu-adder, epfl-adder | unchanged (the I/O wrapper's synthesis keeps the same netlist) | | |

The netlists are equal to the RTL. The nandland SPI cores are 37 % smaller but 2 to 6 % slower (keepDepth's
"smaller" rule: 5 % fewer LUTs, at most 1 % slower by the estimate).

## Yosys 0.70 against 0.68, with today's synthesis (#377)

Yosys 0.70 (#368) made the open synthesis 1.6 % smaller and 3.2 % slower (geometric mean of the routed critical
paths of the update's comparison: pong 10.98 → 12.57 ns, vtr-ch-intrinsics 6.24 → 7.59, verilog-i2c-master +10 %,
epfl-dec +8 %). Measured again on 2026-10-19 with the synthesis and back end of that day: the same code (pack, place,
route, Silinx's STA, seed 1, the corpus's I/O wrapper where there is one), the same 7 examples and 14 corpus designs
as the update's comparison, only YoWASP differing (0.68.1207 installed apart, given to `synthesizeOpen` as its run).
Yosys 0.68 cannot map with ABC9 on the Spartan-3E, which makes High's optional mappings fail and keep the usual one
(#401), so High is compared without the ABC9 candidate (`abc9: false`), and 0.70 with it as it ships.

| comparison (19 designs with a clock) | period 0.70 / 0.68 | slices | LUTs |
|---|---:|---:|---:|
| High, both without ABC9 | 1.008 | 0.977 | 1.007 |
| **High: 0.70 as it ships (ABC9 candidate) / 0.68** | **0.995** | **0.974** | 1.020 |
| Normal (the app's default) | 0.926 (0.991 without epfl-priority) | 1.006 | 1.000 |

So the 3 % is won back: what changed since (the ABC9 candidate #459, the slices in the choice #478, the carry
chains at Normal, #468's deep designs at Normal, the packer) makes 0.70's netlists as fast as 0.68's and 2.6 %
smaller. vtr-ch-intrinsics is now as fast with either (6.12 / 6.05 ns), epfl-priority faster with 0.70 (11.80 →
11.44 at High; 41.8 → 11.4 at Normal, #468 keeping the depth-oriented mapping only with 0.70's levels).

High without ABC9, per design (slices, LUTs, period in ns):

| design | 0.68 | 0.70 | period |
|---|---|---|---:|
| examples/traffic | 68 / 94 / 8.16 | 67 / 108 / 8.44 | +3.5 % |
| examples/blinky | 79 / 72 / 7.18 | 80 / 73 / 7.39 | +3.0 % |
| examples/pong | 265 / 311 / 11.26 | 245 / 282 / 12.37 | +9.9 % |
| examples/stopwatch | 197 / 208 / 12.76 | 194 / 202 / 12.87 | +0.9 % |
| examples/clock | 231 / 208 / 7.93 | 204 / 207 / 8.21 | +3.5 % |
| examples/vga | 158 / 173 / 9.60 | 154 / 166 / 10.09 | +5.1 % |
| serv | 191 / 261 / 13.95 | 212 / 273 / 11.99 | −14.1 % |
| picorv32 | 697 / 1181 / 11.62 | 708 / 1184 / 11.07 | −4.7 % |
| femtorv32-quark | 498 / 677 / 16.33 | 409 / 689 / 16.81 | +2.9 % |
| light8080 | 189 / 307 / 11.80 | 192 / 313 / 12.33 | +4.5 % |
| verilog-uart | 120 / 129 / 10.94 | 131 / 132 / 10.27 | −6.1 % |
| verilog-i2c-master | 119 / 201 / 10.08 | 115 / 193 / 10.65 | +5.7 % |
| nandland-spi-vhdl | 31 / 42 / 5.33 | 31 / 42 / 5.36 | +0.5 % |
| fpu-adder | 342 / 471 / 11.19 | 342 / 480 / 11.35 | +1.4 % |
| secworks-siphash | 686 / 1059 / 15.53 | 686 / 1059 / 15.11 | −2.7 % |
| epfl-dec | 187 / 288 / 6.05 | 187 / 288 / 6.51 | +7.8 % |
| epfl-priority | 127 / 211 / 11.80 | 115 / 209 / 11.44 | −3.1 % |
| vtr-ch-intrinsics | 266 / 107 / 6.12 | 266 / 107 / 6.05 | −1.1 % |
| vtr-stereovision3 | 84 / 117 / 7.72 | 77 / 127 / 7.87 | +1.9 % |

**Pong** is the one design still clearly slower with 0.70 (+9.9 % at High, 11.26 → 12.37 ns; +1.6 % at Normal,
12.17 → 12.37). With 0.68 its depth-oriented mapping is kept and then the second balancing with the LUT delays
(311 LUTs, 11.26 ns). The usual mapping's two halves crossed (the design up to the LUT mapping from one Yosys, the
LUT mapping from the other) show that the difference is all in ABC: 0.70's netlist up to the LUT mapping mapped by
0.68's ABC is 0.68's netlist exactly (311 LUTs, 12.22 ns). And 0.70's ABC gives no mapping as fast, routed:

| pong, from the same netlist | 0.68 | 0.70 |
|---|---|---|
| usual (LUT4s alone) | 311 LUTs, 12.22 ns | 282 LUTs, 12.37 ns |
| depth-oriented (`DEPTH_ABC`) | 275, 12.65 | 251, 13.04 |
| balanced once more (`DEPTH_ABC2`) | 327, 13.09 | 242, 12.39 |
| the same with the LUT delays | **311, 11.26** | 273, 12.76 |
| the depth-oriented one with the LUT delays | 395, 12.39 | 253, 12.54 |

So nothing in the choice between mappings brings pong's 11.26 ns back with 0.70: it is ABC's own result (pong
still runs at 81 MHz, its clock is 50 MHz). Not changed.

## Effort Normal: the deep designs mapped for speed (#468)

At Optimization Effort Normal (#282) the open synthesis made the usual mapping alone: the designs limited by
their logic depth lost most of their speed against ISE (docs/QUALITY.md, critical paths by trce, Normal and High
against ISE: EPFL adder 6.81 and 1.15, max 2.40 and 1.11, priority 2.06 and 0.51). `effort-normal.mjs` synthesizes
each design of the corpus at both efforts (Normal as before: the usual mapping alone), with the estimated critical
path, the logic levels of the deepest path (`logicLevels`: LUTs and MUXF5s), the LUTs and the time
(`effort-normal-results.jsonl`, on an Apple-silicon Mac):

    node research/synth-quality/effort-normal.mjs results.jsonl [name,name…]

The designs of more than 12 levels (*auto*: what DEEP_RULE takes, more than 16 levels and 5000 LUTs at most):

| design | levels | LUTs | Normal ns | High ns | gain | Normal s | High s | auto |
|---|---:|---:|---:|---:|---:|---:|---:|:-:|
| epfl-log2 | 100 | 10682 | 115.5 | 115.5 | 1.00 | 370.8 | 457.4 | no |
| epfl-multiplier | 87 | 7527 | 100.5 | 100.5 | 1.00 | 328.7 | 403.4 | no |
| epfl-adder | 85 | 339 | 98.2 | 17.4 | 5.63 | 2.2 | 14.6 | yes |
| epfl-max | 57 | 1046 | 66.0 | 23.0 | 2.87 | 3.7 | 22.8 | yes |
| epfl-sin | 52 | 2001 | 60.2 | 60.2 | 1.00 | 6.4 | 30.8 | yes |
| epfl-priority | 44 | 171 | 51.0 | 16.5 | 3.09 | 3.9 | 9.9 | yes |
| itc99-b22 | 24 | 3297 | 34.9 | 34.9 | 1.00 | 10.3 | 22.3 | yes |
| itc99-b05 | 23 | 293 | 10.3 | 9.5 | 1.09 | 2.7 | 6.2 | yes |
| itc99-b14 | 23 | 1005 | 34.6 | 29.5 | 1.17 | 5.1 | 14.8 | yes |
| itc99-b20 | 23 | 2150 | 35.4 | 35.4 | 1.00 | 7.9 | 16.0 | yes |
| itc99-b21 | 23 | 2173 | 33.9 | 33.9 | 1.00 | 7.7 | 15.0 | yes |
| epfl-voter | 18 | 2353 | 21.1 | 21.1 | 1.00 | 12.9 | 69.2 | yes |
| t80 | 15 | 2153 | 20.4 | 20.4 | 1.00 | 5.9 | 16.1 | no |
| secworks-sha256 | 14 | 2849 | 23.0 | 22.1 | 1.04 | 5.2 | 14.9 | no |
| itc99-b15 | 13 | 2028 | 19.4 | 18.3 | 1.06 | 7.0 | 14.0 | no |
| itc99-b17 | 13 | 6338 | 19.7 | 19.7 | 1.00 | 17.3 | 21.2 | no |

The three designs High makes several times faster are the deepest that fit (44 to 85 levels): the carry chain of
the adder written as gates, the comparators of max, the priority encoder. Beyond 5000 LUTs (log2, multiplier)
High maps nothing for depth (DEPTH_RULE.maxLuts) and only adds its carry-chain runs: 75 to 86 s more for the
same netlist. Between 16 and 85 levels the others (sin, voter, ITC'99 b20 to b22) are as fast at High, for 7 to
56 s more, b14 17 % faster, b05 9 %. The 55 designs of 16 levels or fewer are 6 % faster at High (geometric mean;
the EPFL router 1.49, ctrl 1.27, uart-for-fpga 1.27, serv 1.22), for 4.7 s more each on average: not limited by
their depth, they keep Normal's one run (High is there for them). With DEEP_RULE, Normal maps the 10 designs of
more than 16 levels as High does; by the quality page's High column, Normal's critical path against ISE's goes
from +20 % to about +9 % (the adder, max and priority; the ITC'99 ones ISE cannot read).

### Deep designs of 1500 LUTs at most, kept when a quarter faster (#611)

The weekly comparison of 2026-10-19 (15.11.1 against 15.10.22, at Normal) found ITC'99 b14, b20 and b21 9 to 12 %
larger in slices and the corpus's synthesis 44 % longer. All three are 23 levels deep, so they took High's mappings
at Normal, and kept them. Measured on 2026-10-19 (synthesis at Normal, one Yosys at a time, slices after `pack.js`),
Normal with and without them:

| design | levels | LUTs | slices without → with | estimate (ns) without → with | synthesis (s) without → with |
|---|---:|---:|---|---|---|
| itc99-b14 | 23 | 1005 | 648 → 707 | 34.62 → 29.47 | 2.4 → 10.3 |
| itc99-b20 | 23 | 2153 | 1338 → 1452 | 34.62 → 32.37 | 4.5 → 22.1 |
| itc99-b21 | 23 | 2180 | 1366 → 1529 | 34.26 → 32.63 | 4.4 → 19.0 |
| itc99-b05 | 23 | 293 | 245 → 258 | 10.29 → 9.46 | 1.7 → 3.7 |
| itc99-b22 | 23 | 3265 | 2023 → 2023 | 35.31 → 35.31 | 7.7 → 17.3 |
| epfl-voter | 18 | 2353 | 1177 → 1164 | 21.15 → 21.15 | 22.0 → 67.8 |
| a priority encoder of 128 bits (`test/synth-open.test.js`) | 20 | 259 | 130 → 115 | 24.95 → 9.16 | 1.8 → 5.1 |

Depth alone does not tell them apart: the priority encoder, 20 levels, is 2.7 times faster with the mappings, the
ITC'99 cores, 23 levels, 0 to 15 %. Size does: the deep designs that gain nothing are of 2000 to 3300 LUTs (b20 to
b22, voter, EPFL sin), those that gain several times of 1100 at most (EPFL adder 339, max 1046, priority 171, the
encoder 259). So DEEP_RULE is now `{ levels: 16, maxLuts: 1500, gain: 0.25 }`: a deep design of more than 1500 LUTs
keeps Normal's one run, and High's mappings of a smaller one are kept only when a quarter faster than Normal's own
netlist, synthesized too (b14 and b05: their netlist as without the rule, for 3 to 4 s more; the console says so).
Normal with the rule:

| design | slices | estimate (ns) | synthesis (s) | |
|---|---:|---:|---:|---|
| itc99-b14 | 648 | 34.62 | 13.6 | tried, not kept |
| itc99-b05 | 245 | 10.29 | 4.3 | tried, not kept |
| itc99-b20 / b21 / b22 | 1338 / 1366 / 2023 | 34.62 / 34.26 / 35.31 | 5.2 / 5.2 / 8.0 | not tried |
| epfl-voter / sin | 1177 / 1001 | 21.15 / 60.25 | 22.0 / 11.4 | not tried |
| epfl-priority / max | 117 / 589 | 8.83 / 23.03 | 8.2 / 17.9 | kept, as before |
| epfl-adder | 66 | 17.43 | 9.6 | as before (its carry chain) |

The examples are 1 to 8 levels deep: unchanged.

## Synthesis time: the netlist's JSON (#86)

#86 found the depth-oriented mapping 2.5 to 3.7 times as long as the first run (secworks-sha256 60 s + 154 s of
CPU). Measured again on 2026-10-19 (Effort High, each Yosys run timed apart, one at a time, the 63 corpus designs of
5000 LUTs at most), the runs of the 63 designs summed: ABC9 290 s, the usual run 215 s, the depth-oriented mapping
137 s, the wider functions 129 s, the coarse run of the carry chains 41 s, the second balancing 29 s and with the
LUT delays 28 s, the wide multiplexers 17 s, the carry chains 16 s. The depth-oriented mapping (a remap from the
netlist before the LUT mapping) was already cheaper than the usual run, and even the smallest design's remap took
about 1 s, its LUT mapping a tenth of that.

The time was in `write_json`: synth_xilinx reads Yosys's Xilinx cell library (`cells_sim.v`, `cells_xtra.v`: about
430 black boxes of every family), and write_json wrote all of them into every run's netlist: 9 to 14 MB of JSON
whatever the design (blinky 13.4 MB, its own module 0.27 MB), about 0.9 s of every run (blinky's remap: 0.15 s
without writing, 1.10 s with the JSON, 0.17 s with the top module's alone). write_verilog and stat already leave the
black boxes out. So every run writes the top module alone (`outputs`: `select -module <top>; write_json -selected`);
every reader takes the top module anyway (core/fpga/netlist.js, sim-model.js, compiled-sim.js, compiled-prims.js,
the estimates of core/synth-open.js).

Before → after (the same machine, best of two; the netlist kept, the choices of r.depth, the statistics and the
warnings compared: identical on every design):

| designs | Yosys | before (s) | after (s) | after / before |
|---|---|---:|---:|---:|
| the 7 examples, High | one at a time | 63.4 | 20.4 | 0.32 |
| 18 corpus designs, High (the comparison's subset, EPFL max and adder, iwls05-spi, T80) | one at a time | 226.1 | 95.8 | 0.42 |
| 3 examples and 4 deep designs, Normal | one at a time | 59.6 | 27.4 | 0.46 |
| pong, stopwatch, picorv32, EPFL max, T80, High | 4 workers (the app) | 53.6 | 28.1 | 0.52 |

Per design between 0.26 (nandland-spi-vhdl, 8.7 → 2.2 s) and 0.63 (T80, 19.2 → 12.0 s with 4 workers): the
smaller the design, the larger the share the library took. The netlist file of the build (`open/<top>.json`) is 15
to 100 times smaller.

Left: ABC9's run reads the cell models again (`cells_xtra.v` about 0.35 s; block RAMs and DCMs need it), and the
netlist before the LUT mapping (`PREMAP_FILE`) still holds the black boxes (4 MB, about 0.2 s to write and read;
the remaps need them).

## What is left

- **Speed**: lab11's critical path now has XST's logic depth (state register -> control decoding
  -> ALU carry chain -> result multiplexer -> register, about 8 ns of logic), but had about 6 ns of
  routing against XST's 4: Silinx's placer and router, not the synthesis. Since closed to 4.3 ns
  (timing-driven placement with the device's delay table, LUT input swapping, branch loads in the
  router: lab11 11.6 ns by ISE's trce, blinky 7.4 ns; research/s3e-route/README.md, "Closing the
  routing gap"). Left: XST replicates the state register's flip-flops to cut their fanout (54 on
  lab11's critical path, about 0.5 ns of branch load); the open flow does since 15.10.3
  (research/s3e-route/README.md, "The design corpus against ISE").
- **Shift registers in SRL16**: done in 15.10.2 for fixed-length chains (above), in 15.10.15 for
  variable taps (#5, above), the cascade within a SLICEM in 15.10.23 (#24, above). What the prototype
  (before it) found:
  - fixed-length chains: `xilinx_srl -fixed -minlen 3` must run on the bit-level flip-flops
    before `map_ffs` (after it, xc3se's dfflegalize has made them $_SDFFE_ cells with a reset,
    which xilinx_srl skips), with Silinx's own map file for `$__XILINX_SHREG_` (Yosys's
    cells_map.v writes SRLC32E, which the Spartan-3E does not have, for chains of 17-32; the map
    splits chains into SRL16E of 16 stages, and writes SRL16E with IS_CLK_INVERTED, not
    SRL16E_1, which Yosys's cell library lacks). The srl fixture's 36 flip-flops of fixed chains
    become 4 SRL16E (about 63 slices instead of 79).
  - variable taps (`q <= sr(to_integer(tap))`, the srl fixture's 16 x 4 bits): Yosys infers them
    only from a 1-bit `$shiftx` over the chain. Silinx's array read gives a `$pmux` whose
    `tap = 0` case stays outside the `$shiftx` (so the first stage fans out elsewhere), and a
    4-bit-wide `$shiftx` that has to be split into 1-bit ones (a small techmap does it).
  - then: SRL16E in the packer (a SLICEM: the LUT as `#RAM` with `F_ATTR::SHIFT_REG`, D through
    BX / BY with DIF_MUX / DIG_MUX, the shift enable through SR (SRINV, WSGEN), no flip-flops in
    that slice since SR would reset them), slices of type SLICEM kept on SLICEM sites by the
    placer (place.js allowedAt), its clock-to-out and setup in core/fpga/timing.js, SRL16E in
    test/fpga-sim.js (netlistSim and packedSim), and a check of the bitstream against ISE's
    (the bit database has the SLICEM shift-register features, measured with ISE's designs).
- **Tri-state buffers in the packer** (distributed RAM, block RAM, multipliers and the DCM are in
  the open flow since 15.10.2: research/s3e-bitstream/README.md, stage E).
- **State machines** (#438): Yosys's `fsm` pass finds no state machine in lab11's control unit (its
  `state_id` output reads the state register); XST kept its binary encoding too. Nor in any other design:
  `fsm_detect` refuses every register with an initial value, and the front end gives every register its
  power-up value. A re-encoding has to keep that value.

## State machines: extraction and re-encoding (#438)

Yosys's `fsm` pass (in synth_xilinx's prepare step) extracts and re-encodes state machines, but `fsm_detect` refuses
a register that has an initial value ("Register has an initialization value."), and the front end gives every
register its power-up value. `fsm.mjs` measures what extracting them would give, without changing the open
synthesis: the open synthesis's own script, its first step split around `fsm`; the machines lose their init value
and are marked (`fsm_encoding auto`); `fsm -nodetect -encoding … -encfile` extracts and re-encodes them and writes
each one's old → new codes; each re-encoded register gets the new code of its old init state as its init; the rest
of the script runs as it is (Optimization Effort Normal, the app's default). Each netlist is simulated against the RTL
as the tests do (the resets held first) and from power-up with no reset, where a machine started in another state
shows (checked: without the new init values the one-hot traffic example fails at cycle 2); and taken through the
open back end (seeds 1-3, the mean of Silinx's timing analysis of the routed designs; the corpus on the XC3S1200E
as `compare-ise.mjs`). `fsm-ise.mjs` adds XST's side on the ISE host (the state machines of its report, the
encodings it chose; ISE's flow for the examples; the corpus's sizes and periods from
test/designs-corpus/ise-comparison.json):

    node research/synth-quality/fsm.mjs --detect               which registers fsm_detect marks (fsm-detect.json)
    node research/synth-quality/fsm.mjs [--filter a,b]         the measurement (fsm-results.json)
    node research/synth-quality/fsm.mjs --table                the tables
    node research/synth-quality/fsm-ise.mjs [--synth-only] [--projects dir] [--routed dir]    XST's side (fsm-ise.json)

The ways: *stock* the open synthesis as it is; *base* the split script with nothing extracted, the reference (the
same circuit, but the RTLIL round trip orders the cells otherwise and ABC's mapping moves with the order: stock →
base is the noise, up to 12 % of the slices on a small design); *binary* and *onehot* the marked machines
re-encoded by Yosys in binary or one-hot (*onehot* is Yosys's own `auto` choice: one-hot for a state register under
32 bits); *onehot-port* also the registers refused only because a port reads them.

**How many.** Of the 74 designs (the seven examples and the corpus), fsm_detect marks 21 registers today, all in
Verilog designs whose state registers have no initial value (picorv32, the secworks cores, the FPUs, T80, the IWLS
cores): Yosys extracts and re-encodes those already, in one-hot. Without the init values it marks 65, in 39 designs:
**44 kept out by their init value alone, in 24 designs**, the VHDL ones (the ITC'99 benchmarks, uart-for-fpga,
spi-fpga-master, neorv32) and two examples, traffic (7 states) and pong (4); gates, blinky, stopwatch, clock and vga
have no register it marks. Refused for other reasons: 18 "users don't benefit" (counters, mostly), 4 "connected to a
module port" (picorv32, ITC'99 b06).

- Six of the 44 cannot keep their power-up state: VHDL integers (ITC'99 b14, b15, b17, b20-22: `datawidth`,
  `p0_v17`) that start at integer'left, a value they never take again, so fsm_opt drops it from their states. They
  are left out (b14 and b20-22 then extract nothing).
- Marking a register that a port reads crashes Yosys 0.70 on ITC'99 b06 (`Assert … failed in kernel/rtlil.cc`);
  picorv32's two are extracted and keep their codes.
- Every netlist is equal to the RTL with the resets first; from power-up as well, except where the RTL itself starts
  undefined (picorv32 binary: `cpu_state` has no initial value in the Verilog, so its power-up is defined by the
  reset alone; ITC'99 b03, b14, b17 differ from power-up in every way, base included).

**Size and speed.** Geometric means against base, 2026-10-18 (main d805df1), LUTs / FFs / slices / period:

| designs | onehot | binary |
|---|---|---|
| all 36 measured every way | 1.011 / 1.091 / 1.006 / 1.009 | 1.042 / 0.990 / 1.031 / 1.041 |
| the 21 whose machines the init values keep out | 1.018 / 1.160 / 1.011 / 1.015 | 1.056 / 1.001 / 1.050 / 1.058 |
| the 12 that Yosys extracts today | 1.000 / 1.000 / 1.000 / 1.000 (the same netlist) | 1.028 / 0.969 / 1.007 / 1.023 |
| stock (the noise) | 1.008 / 1.000 / 0.994 / 1.002 | |

- **One-hot is not better on average**: 16 % more flip-flops, as many slices (the flip-flops fit in slices whose
  LUTs are used anyway), the period 1.5 % longer. By design it varies more than the noise: ITC'99 b10 −31 % slices
  and −9 % period, b07 −28 % / −4 %, b01 −17 % / −12 %, traffic −8 % / +0 %; but b02 +150 % / +92 % (2 slices to 5),
  b06 +60 % / +35 %, b12 +18 %, pong +0 % / +10 %.
- **Yosys's binary re-encoding is worse** (5 % more slices, 6 % slower): it renumbers the states and loses what the
  author's codes gave (traffic's phase output is its state code: +21 %).
- **Both tried, the better kept** (as the other mappings: DEPTH_RULE given the routed periods, LUTs and slices):
  one-hot kept on 8 of the 21, 0.957 / 1.069 / 0.956 / 0.974. But the same choice between stock and base (the same
  circuit twice) gives 0.989 / 0.999 / 0.985 / 0.986 by chance alone: the choice is worth about 3 % of the slices
  and 1 % of the period on these 21 designs, none on the examples.
- **Against XST** (21 designs that ISE builds, sizes and periods of ise-comparison.json and of the examples' ISE
  runs): base 0.979 of XST's slices and 1.166 of its period, onehot 1.007 / 1.179, the better kept 0.952 / 1.138.
  XST re-encodes almost every machine it finds, by its size: one-hot from 8 states (ITC'99 b01, b10, b11,
  verilog-i2c-master, the FPUs, siphash) and on some of 3 to 7 (b03-b05, b07), gray or sequential on most of 4 to 7
  (pong, uart-for-fpga, spi-fpga-master, b02, b06, b08, b09, the IWLS cores), "user" (the author's codes) on
  traffic and two of usb-phy's; Yosys's one-hot or binary are its only encodings (no gray).

The designs whose machines the init values keep out (base: slices / period in ns; onehot and binary against base;
XST's encodings and its slices / period):

| design | states | base | onehot | binary | XST | XST slices / ns |
|---|---|---|---|---|---|---|
| examples/traffic | 7 | 73 / 10.20 | −8 % / +0 % | −4 % / +21 % | user | 70 / 7.77 |
| examples/pong | 4 | 240 / 12.52 | +0 % / +10 % | −1 % / +2 % | gray | 267 / 10.56 |
| verilog-i2c-master | 12 | 123 / 10.93 | −3 % / +1 % | +10 % / +3 % | one-hot | 145 / 9.88 |
| nandland-spi-vhdl | 4 | 52 / 5.48 | +4 % / +0 % | +2 % / +2 % | (XST fails) | |
| neorv32 | 3 | 2181 / 15.62 | −0 % / +2 % | +0 % / −5 % | (XST fails) | |
| uart-for-fpga | 6, 5 | 39 / 5.11 | +5 % / −2 % | +26 % / +41 % | gray, gray | 38 / 4.69 |
| spi-fpga-master | 5 | 17 / 5.90 | +6 % / −18 % | +24 % / +21 % | gray | 17 / 4.99 |
| itc99-b01 | 8 | 6 / 3.21 | −17 % / −12 % | +33 % / +36 % | one-hot | 6 / 3.80 |
| itc99-b02 | 7 | 2 / 2.14 | +150 % / +92 % | +0 % / −5 % | gray | 2 / 3.19 |
| itc99-b03 | 3 | 16 / 5.81 | +0 % / −2 % | +0 % / −0 % | one-hot | 45 / 5.29 |
| itc99-b04 | 3 | 127 / 16.24 | −2 % / +2 % | −1 % / +0 % | one-hot | |
| itc99-b05 | 5 | 260 / 11.49 | −1 % / −5 % | −0 % / −1 % | one-hot | 123 / 9.82 |
| itc99-b06 | 7 | 5 / 3.06 | +60 % / +35 % | +0 % / +3 % | gray | 5 / 3.19 |
| itc99-b07 | 7 | 54 / 5.92 | −28 % / −4 % | −4 % / +5 % | one-hot | |
| itc99-b08 | 4 | 16 / 6.62 | +0 % / −2 % | +12 % / +5 % | sequential | 24 / 5.87 |
| itc99-b09 | 4 | 22 / 6.49 | +9 % / +2 % | −5 % / −16 % | gray | 24 / 5.90 |
| itc99-b10 | 11 | 29 / 6.12 | −31 % / −9 % | +7 % / +13 % | one-hot | 29 / 4.90 |
| itc99-b11 | 9 | 100 / 9.11 | −6 % / +4 % | +2 % / +6 % | one-hot | |
| itc99-b12 | 26 | 201 / 11.42 | +18 % / −0 % | +10 % / +0 % | (none found) | 214 / 7.79 |
| itc99-b13 | 4, 10, 4, 8 | 41 / 7.70 | +2 % / +8 % | +2 % / +13 % | gray, one-hot ×3 | |
| itc99-b15 | 10, 8 | 1271 / 20.27 | −3 % / −2 % | −0 % / −2 % | (XST fails) | |
| itc99-b17 | 10 ×3, 8 ×3 | 3818 / 22.24 | −0 % / −2 % | +1 % / −1 % | (XST fails) | |

(XST fails: its HDL parser or the corpus's constraints, as in ise-comparison.json; blank: ISE's flow did not complete there.)

**So**: extracting the machines and re-encoding them in one-hot, as XST does for the larger ones, would not make
the open synthesis smaller or faster on average, and not on the examples; it pays on a few control-heavy designs
(ITC'99 b01, b07, b10, 17 to 31 % fewer slices) and costs as much on others. Tried as one more candidate kept by
DEPTH_RULE, it gains about 3 % of the slices and 1 % of the period beyond the noise on the 21 designs concerned, for
one more Yosys run on each, a script in three runs (the init values written back between them), and Yosys's crash
on a port's register to avoid. Not wired into `core/synth-open.js` (#438: the author's decision); the larger machines
alone are, at High (#539, below).

### One-hot at Optimization Effort High (#539)

XST re-encodes one-hot from about 8 states, and in the table above one-hot won on the larger machines (b01, b10)
and lost on the 7-state ones (b02, b06). So at Optimization Effort High, `core/synth-fsm.js` tries the machines of
**8 states or more** that the init values alone keep out: a quiet run up to `fsm` finds them (the init values off,
fsm_detect, the machines extracted one-hot: their states and codes), and a design with some is synthesized once more
with them one-hot (their power-up state kept, as fsm.mjs does), High's mappings made on that netlist too, the better
of the two kept by DEPTH_RULE (with the slices) on the netlists' estimates. Smaller machines, Normal, and machines
whose init state fsm_opt drops (VHDL integers starting at integer'left) are left as they are. fsm.mjs measures it
as the way `core` against `stock` (the open synthesis with it off):

    node research/synth-quality/fsm.mjs --effort high --ways stock,core --results research/synth-quality/fsm-high-results.json --filter …

2026-10-19 (main e9d7794), Optimization Effort High, slices / period (ns, Silinx's timing analysis of the routed
designs, seeds 1-3):

| design | states | stock | core | |
|---|---|---|---|---|
| examples (traffic, pong, stopwatch, clock, vga) | (none of 8) | | the same netlists | |
| verilog-i2c-master | 12 | 114 / 9.95 | 114 / 9.95 | tried, not kept |
| itc99-b01 | 8 | 5 / 2.54 | 5 / 2.54 | tried, not kept |
| itc99-b10 | 11 | 26 / 5.48 | 21 / 4.99 | **−19.2 % / −8.9 %** |
| itc99-b11 | 9 | 97 / 9.47 | 94 / 9.39 | −3.1 % / −0.9 % |
| itc99-b12 | 26 | 169 / 9.87 | 169 / 9.87 | tried, not kept |
| itc99-b13 | 10, 8 | 44 / 8.60 | 44 / 8.60 | tried, not kept |
| itc99-b15 | 10, 8 | 1318 / 19.95 | 1352 / 19.20 | +2.6 % / −3.8 % |
| itc99-b17 | 10 ×3, 8 ×3 | 4095 / 21.56 | 3750 / 20.62 | **−8.4 % / −4.4 %** |

- On the 8 designs concerned: 0.962 of the slices and 0.977 of the period (geometric means); one-hot kept on 4.
  b01's 17 % of #438 (at Normal) is not there at High: High's mappings already make its binary machine 5 slices.
- Every netlist is equal to the RTL with the resets first and from power-up (b17 from power-up: as stock, the RTL
  itself starts undefined).
- The design corpus's own runs (test/designs-corpus/run.mjs, each design on its own part, seed 1 alone; main
  602932f, after #591's packing): b10 26 → 21 slices and 5.33 → 5.42 ns, b11 97 → 94 and 9.43 → 9.70, b15 1370 → 1237
  and 19.68 → 18.50, b17 4080 → 3735 and 20.93 → 20.74; i2c-master, b01, b12 and b13 the same netlists. (One seed's
  period moves by several per cent with the placement: the means of three seeds above are the measure.)
- The cost: one quiet run up to `fsm` on every design at High, started beside the usual run (the examples'
  synthesis as long as before, 1.7 to 2.6 s with the Yosys workers); a design with such a machine is synthesized
  twice (after #86: b10 2.5 → 5.1 s, b17 16 → 43 s, one Yosys at a time).
- ISE's trce on the routed designs (2026-10-20, main 2f6ca16, seed 1: `fsm.mjs --effort high --ways stock,core
  --seeds 1 --routed <dir>`, then `fsm-ise.mjs --no-flow --routed <dir>`; the DRC clean, 0 errors and 0 warnings,
  on all eight), minimum period stock → core: b10 5.959 → 4.812 ns (**−19.2 %**), b11 9.376 → 9.481 (+1.1 %), b15
  19.920 → 18.975 (−4.7 %), b17 21.923 → 20.923 (**−4.6 %**); 0.928 of the period (geometric mean). Silinx's timing
  analysis of the same routings: 5.85 → 4.62, 9.32 → 9.54, 20.10 → 19.36, 22.80 → 21.74 (0.928 as well), within
  4 % of trce's and the same direction on each design. (b11's +1.1 % is one seed's: −0.9 % in the
  mean of three seeds above.)

### State machines fsm_detect refuses for their users (#652)

iwls05-i2c was the corpus's slowest design against ISE (1.61 times XST's period at Normal): six LUT levels on its
critical path where ISE has four. The path starts at the I2C bit controller's state register, 18 states written
one-hot by hand (`parameter [16:0] … = 17'b0_0000_0000_0000_0001`, idle all zeros) and compared on all 17 bits in a
`case (c_state) // synopsys full_case parallel_case`: every state test is a 17-input AND, two levels of LUTs before
any logic. XST finds the machine and re-encodes it one-hot (its report: `c_state[1:18]: one-hot`), so a state is one
bit. Yosys's fsm_detect turns it down: "Users of register don't seem to benefit from recoding" (a heuristic on the
cells that read it; fsm-detect.json lists the corpus's 18 registers refused so, most of them counters).

A register marked by hand (`fsm_encoding`) is extracted whatever that heuristic says, so the search for state
machines (`core/synth-fsm.js`) now does it for these:

- run 1 (`fsmProbeCommands`) writes fsm_detect's messages too (`tee -q -o`); the registers refused for their users
  alone (`refusedForUsers`; not those a port reads, which crash Yosys 0.70 when forced, nor any other reason);
- run 1b (`fsmForceCommands`), only when there are some: run 1's netlist with them marked one-hot, extracted quietly
  as run 1 does: their states and codes;
- `fsmChosen`: those of `FSM_RULE.states` (8) or more, with their initial value, else state 0 (the flip-flops'
  power-up; a machine whose state 0 is not one of its states is left);
- then #539's runs, the netlist kept by `DEPTH_RULE`. Yosys's warning on a wire marked by hand ("Regarding the
  user-specified fsm_encoding attribute") is not said (`quietForced`).
- At Normal too (#539's machines, which the init values keep out, stay High's: #438 found them no better on average).
  The quiet run goes beside the usual one in the Yosys workers: the synthesis's time is the same where nothing is forced
  (pong 3.6 → 3.4 s, iwls05-sasc 2.6 → 2.7, itc99-b14 12.8 → 12.7), iwls05-i2c 2.6 → 5.3 s.

A defect found on the way: when the machine is read bit by bit as well (`busy <= st(0) or …`), `fsm` keeps a copy of
the old register for that reader (`$fsm$oldstate\st`), and the copy had lost its initial value with the marking (a
VHDL machine starting in state `a` powered up with `busy` low). `oldStateInits` gives it the old one;
test/synth-fsm.test.js checks that every flip-flop has its power-up value.

Measured (routed, Silinx's static timing, seed 1; the corpus's 53 designs of 1500 LUTs at most in their I/O wrapper
on the XC3S1200E and the 7 examples, against main of 2026-10-21, be58d33): **iwls05-i2c alone changes**:

| effort | LUTs | slices | levels | estimate (ns) | routed (ns) | |
|---|---|---|---|---|---|---:|
| Normal | 253 → 211 | 137 → 116 | 6 → 4 | 7.62 → 5.41 | 8.657 → 5.820 | −32.8 % |
| High | 260 → 205 | 141 → 123 | 5 → 5 | 7.34 → 5.41 | 8.678 → 6.322 | −27.1 % |

(ISE's own flow: 5.91 ns by trce.) Over the 60: Normal −0.66 % and High −0.53 % in geometric mean, slices 10788 →
10767 and 10750 → 10732. Tried and not kept: verilog-i2c-master's `phy_state_reg` (16 states, 9.60 ns estimated
against 8.85). The other registers refused for their users have fewer than 8 states or are no machine `fsm` can
extract (counters: run 1b extracts nothing for them).

**ISE's check** (on the Mac mini, the same routed designs, main against the change; seeds 1-3 at both efforts): every
DRC 0 errors and 0 warnings, xdl2ncd 0 warnings, the `.bit` byte-identical to ISE's bitgen (CRC on and off); trce's
period of iwls05-i2c 29.8 % shorter in geometric mean, all six faster: Normal 8.329 / 8.386 / 8.937 → 5.712 / 5.943 /
5.968 ns, High 8.561 / 8.236 / 8.562 → 5.913 / 6.032 / 6.236 ns (ISE's own flow 5.909).

## Where the speed is lost: logic or routing (#656)

The weekly comparison against ISE now records, for each critical path, trce's breakdown (#646): its levels of
logic, its LUT, carry, flip-flop and other logic delays and its routing delay, for ISE's flow and for Silinx's
routing at both efforts, all by ISE's trce. The run of 2026-10-20 (Silinx 15.11.2, main efe1a2e, the results on
the branch `quality-results` at 43efe87): critical path +3 % against ISE at Normal (as fast or faster on 14 of 40),
−2 % at High (20 of 40). The designs slower than ISE, slowest first (ns; *S / I*: Silinx's period / ISE's; *FF*:
the flip-flops' clock to out and setup; Δ: Silinx's less ISE's):

Normal:

| design | S / I | gap (ns) | levels S / I | logic S / I | LUT S / I | carry S / I | FF S / I | route S / I | Δ logic | Δ route |
|---|---:|---:|---|---|---|---|---|---|---:|---:|
| iwls05-i2c | 1.61 | 3.60 | 6 / 4 | 5.53 / 4.19 | 4.39 / 2.98 | 0.00 / 0.00 | 1.14 / 1.21 | 3.98 / 1.72 | +1.34 | +2.26 |
| epfl-multiplier | 1.40 | 26.66 | 87 / 38 | 63.40 / 31.33 | 62.81 / 28.10 | 0.00 / 0.00 | 0.59 / 1.75 | 30.00 / 35.40 | +32.08 | −5.41 |
| itc99-b10 | 1.32 | 1.57 | 3 / 3 | 3.31 / 2.89 | 2.17 / 2.30 | 0.00 / 0.00 | 1.15 / 0.59 | 3.16 / 2.01 | +0.42 | +1.15 |
| itc99-b08 | 1.31 | 1.82 | 4 / 5 | 4.07 / 4.41 | 2.93 / 3.82 | 0.00 / 0.00 | 1.15 / 0.59 | 3.62 / 1.47 | −0.33 | +2.15 |
| itc99-b12 | 1.23 | 1.82 | 6 / 5 | 5.60 / 4.86 | 4.39 / 4.27 | 0.00 / 0.00 | 1.21 / 0.59 | 4.02 / 2.94 | +0.74 | +1.08 |
| itc99-b05 | 1.22 | 2.20 | 8 / 8 | 7.45 / 6.82 | 2.98 / 4.21 | 2.14 / 1.96 | 1.15 / 0.65 | 4.56 / 2.99 | +0.62 | +1.56 |
| t80 | 1.21 | 3.83 | 14 / 18 | 11.71 / 12.00 | 8.72 / 8.91 | 2.03 / 2.50 | 0.95 / 0.59 | 10.23 / 6.13 | −0.29 | +4.10 |
| vtr-stereovision3 | 1.19 | 0.94 | 3 / 2 | 3.37 / 2.66 | 2.17 / 1.52 | 0.00 / 0.00 | 1.21 / 1.15 | 2.49 / 2.25 | +0.71 | +0.24 |
| spi-fpga-slave | 1.18 | 0.89 | 3 / 2 | 3.37 / 2.61 | 2.17 / 1.46 | 0.00 / 0.00 | 1.21 / 1.15 | 2.38 / 2.31 | +0.76 | +0.07 |
| epfl-bar | 1.17 | 1.56 | 6 / 4 | 5.28 / 4.87 | 4.63 / 4.22 | 0.00 / 0.00 | 0.65 / 0.65 | 5.36 / 4.20 | +0.41 | +1.15 |
| iwls05-sasc | 1.15 | 0.75 | 3 / 2 | 3.42 / 3.09 | 2.28 / 1.41 | 0.00 / 0.00 | 1.15 / 1.68 | 2.16 / 1.75 | +0.33 | +0.41 |
| verilog-uart | 1.14 | 1.29 | 6 / 13 | 5.92 / 6.70 | 2.98 / 1.60 | 1.44 / 4.51 | 1.50 / 0.59 | 4.61 / 2.53 | −0.77 | +2.07 |
| vtr-ch-intrinsics | 1.14 | 0.70 | 4 / 4 | 3.70 / 3.59 | 3.11 / 3.00 | 0.00 / 0.00 | 0.59 / 0.59 | 2.06 / 1.47 | +0.11 | +0.59 |
| iwls05-simple-spi | 1.12 | 0.78 | 4 / 4 | 4.13 / 4.58 | 2.98 / 2.87 | 0.00 / 0.00 | 1.15 / 1.71 | 2.81 / 1.63 | −0.45 | +1.18 |
| itc99-b09 | 1.11 | 0.66 | 4 / 5 | 4.13 / 4.46 | 2.98 / 3.87 | 0.00 / 0.00 | 1.15 / 0.59 | 2.43 / 1.44 | −0.34 | +0.99 |
| itc99-b06 | 1.09 | 0.30 | 1 / 1 | 1.97 / 1.43 | 0.76 / 0.84 | 0.00 / 0.00 | 1.21 / 0.59 | 1.52 / 1.48 | +0.54 | +0.05 |
| epfl-adder | 1.09 | 1.09 | 64 / 8 | 9.87 / 6.75 | 0.00 / 6.09 | 8.86 / 0.00 | 1.01 / 0.65 | 3.47 / 5.32 | +3.12 | −1.86 |
| iwls05-usb-phy | 1.09 | 0.44 | 3 / 2 | 3.37 / 3.23 | 2.17 / 1.46 | 0.00 / 0.00 | 1.21 / 1.77 | 2.05 / 1.74 | +0.14 | +0.31 |
| epfl-router | 1.08 | 0.79 | 9 / 6 | 7.33 / 6.34 | 6.74 / 4.78 | 0.00 / 0.00 | 0.59 / 1.56 | 2.81 / 3.01 | +0.99 | −0.19 |
| vtr-diffeq1 | 1.08 | 2.90 | 17 / 16 | 24.63 / 26.95 | 3.11 / 0.70 | 4.19 / 10.63 | 0.59 / 0.00 | 14.06 / 8.85 | −2.32 | +5.22 |
| epfl-max | 1.08 | 2.08 | 19 / 17 | 15.15 / 13.79 | 14.50 / 13.20 | 0.00 / 0.00 | 0.65 / 0.59 | 12.53 / 11.89 | +1.36 | +0.63 |
| epfl-i2c | 1.06 | 0.42 | 5 / 4 | 4.53 / 4.48 | 3.87 / 2.98 | 0.00 / 0.00 | 0.65 / 1.50 | 2.63 / 2.33 | +0.04 | +0.30 |
| uart-for-fpga | 1.04 | 0.20 | 2 / 2 | 2.48 / 3.02 | 0.84 / 1.52 | 0.00 / 0.00 | 0.59 / 1.50 | 2.41 / 1.67 | −0.54 | +0.74 |
| itc99-b03 | 1.04 | 0.22 | 3 / 4 | 3.42 / 3.70 | 2.28 / 3.11 | 0.00 / 0.00 | 1.15 / 0.59 | 2.08 / 1.58 | −0.28 | +0.50 |
| iwls05-spi | 1.02 | 0.28 | 11 / 9 | 9.37 / 7.21 | 3.17 / 3.97 | 5.61 / 0.00 | 0.59 / 0.59 | 3.95 / 5.83 | +2.16 | −1.88 |
| secworks-siphash | 1.02 | 0.21 | 27 / 34 | 9.50 / 9.29 | 2.30 / 1.60 | 6.61 / 7.11 | 0.59 / 0.59 | 4.68 / 4.66 | +0.21 | +0.02 |

High:

| design | S / I | gap (ns) | levels S / I | logic S / I | LUT S / I | carry S / I | FF S / I | route S / I | Δ logic | Δ route |
|---|---:|---:|---|---|---|---|---|---|---:|---:|
| iwls05-i2c | 1.48 | 2.86 | 5 / 4 | 4.89 / 4.19 | 3.74 / 2.98 | 0.00 / 0.00 | 1.15 / 1.21 | 3.88 / 1.72 | +0.70 | +2.16 |
| epfl-multiplier | 1.40 | 26.66 | 87 / 38 | 63.40 / 31.33 | 62.81 / 28.10 | 0.00 / 0.00 | 0.59 / 1.75 | 30.00 / 35.40 | +32.08 | −5.41 |
| itc99-b12 | 1.23 | 1.82 | 6 / 5 | 5.60 / 4.86 | 4.39 / 4.27 | 0.00 / 0.00 | 1.21 / 0.59 | 4.02 / 2.94 | +0.74 | +1.08 |
| t80 | 1.21 | 3.83 | 14 / 18 | 11.71 / 12.00 | 8.72 / 8.91 | 2.03 / 2.50 | 0.95 / 0.59 | 10.23 / 6.13 | −0.29 | +4.10 |
| vtr-stereovision3 | 1.19 | 0.94 | 3 / 2 | 3.37 / 2.66 | 2.17 / 1.52 | 0.00 / 0.00 | 1.21 / 1.15 | 2.49 / 2.25 | +0.71 | +0.24 |
| itc99-b03 | 1.19 | 1.00 | 3 / 4 | 3.43 / 3.70 | 2.22 / 3.11 | 0.00 / 0.00 | 1.21 / 0.59 | 2.85 / 1.58 | −0.27 | +1.27 |
| spi-fpga-slave | 1.18 | 0.89 | 3 / 2 | 3.37 / 2.61 | 2.17 / 1.46 | 0.00 / 0.00 | 1.21 / 1.15 | 2.38 / 2.31 | +0.76 | +0.07 |
| epfl-bar | 1.17 | 1.56 | 6 / 4 | 5.28 / 4.87 | 4.63 / 4.22 | 0.00 / 0.00 | 0.65 / 0.65 | 5.36 / 4.20 | +0.41 | +1.15 |
| vtr-ch-intrinsics | 1.14 | 0.70 | 4 / 4 | 3.70 / 3.59 | 3.11 / 3.00 | 0.00 / 0.00 | 0.59 / 0.59 | 2.06 / 1.47 | +0.11 | +0.59 |
| itc99-b05 | 1.10 | 0.96 | 7 / 8 | 6.57 / 6.82 | 2.49 / 4.21 | 1.76 / 1.96 | 1.15 / 0.65 | 4.21 / 2.99 | −0.25 | +1.21 |
| itc99-b06 | 1.09 | 0.30 | 1 / 1 | 1.97 / 1.43 | 0.76 / 0.84 | 0.00 / 0.00 | 1.21 / 0.59 | 1.52 / 1.48 | +0.54 | +0.05 |
| epfl-adder | 1.09 | 1.09 | 64 / 8 | 9.87 / 6.75 | 0.00 / 6.09 | 8.86 / 0.00 | 1.01 / 0.65 | 3.47 / 5.32 | +3.12 | −1.86 |
| iwls05-usb-phy | 1.09 | 0.44 | 3 / 2 | 3.37 / 3.23 | 2.17 / 1.46 | 0.00 / 0.00 | 1.21 / 1.77 | 2.05 / 1.74 | +0.14 | +0.31 |
| itc99-b08 | 1.09 | 0.52 | 4 / 5 | 4.11 / 4.41 | 2.96 / 3.82 | 0.00 / 0.00 | 1.15 / 0.59 | 2.28 / 1.47 | −0.30 | +0.81 |
| epfl-max | 1.08 | 2.08 | 19 / 17 | 15.15 / 13.79 | 14.50 / 13.20 | 0.00 / 0.00 | 0.65 / 0.59 | 12.53 / 11.89 | +1.36 | +0.63 |
| iwls05-sasc | 1.03 | 0.14 | 2 / 2 | 2.61 / 3.09 | 1.46 / 1.41 | 0.00 / 0.00 | 1.15 / 1.68 | 2.38 / 1.75 | −0.48 | +0.63 |
| iwls05-simple-spi | 1.02 | 0.14 | 3 / 4 | 3.32 / 4.58 | 2.11 / 2.87 | 0.00 / 0.00 | 1.21 / 1.71 | 3.03 / 1.63 | −1.26 | +1.40 |
| iwls05-spi | 1.02 | 0.28 | 11 / 9 | 9.37 / 7.21 | 3.17 / 3.97 | 5.61 / 0.00 | 0.59 / 0.59 | 3.95 / 5.83 | +2.16 | −1.88 |
| uart-for-fpga | 1.02 | 0.08 | 2 / 2 | 2.91 / 3.02 | 1.41 / 1.52 | 0.00 / 0.00 | 1.50 / 1.50 | 1.86 / 1.67 | −0.11 | +0.20 |
| secworks-siphash | 1.02 | 0.21 | 27 / 34 | 9.50 / 9.29 | 2.30 / 1.60 | 6.61 / 7.11 | 0.59 / 0.59 | 4.68 / 4.66 | +0.21 | +0.02 |

What the gap is made of:

- **Routing, more than logic.** Leaving out epfl-multiplier, the designs slower than ISE have, together, 8.7 ns more
  logic and 22.9 ns more routing at Normal (8.0 and 12.2 at High). The routing is the larger part on 17 designs;
  per connection, the critical path's routing is 1.10 times ISE's on average at Normal (1.03 at High), but 2.0
  times on t80 (14 levels, ISE 18, and 4.1 ns more routing) and 1.7 on iwls05-i2c.
- **Logic where it is a level more.** On small control paths (spi-fpga-slave, vtr-stereovision3, iwls05-usb-phy,
  iwls05-sasc: 3 levels against 2; iwls05-i2c 6 against 4) one LUT more is 10 to 20 % of the period. High removes
  it on epfl-router, epfl-i2c and iwls05-sasc, not on the others.
- **The flip-flops' clock enable.** On ITC'99 b03 to b12 Silinx's critical path ends on a flip-flop's CE: Tcko +
  Tceck, 0.591 + 0.555 = 1.15 ns, after the enable's LUT and its net, where ISE's goes through the LUT into D (its
  0.59 ns is Tcko alone, the setup in the LUT's Tfck). verilog-uart's ends on the SR (Tsrck 0.910).
- **One synthesis loss alone:** epfl-multiplier, 87 levels against 38 and 32 ns more logic, with *less* routing
  than ISE's; at 7527 LUTs it is above the depth mapping's limit, so High maps it as Normal (#468).
- **The carry chain:** epfl-adder's 128-bit chain (64 carry levels, 8.86 ns) against ISE's 8 levels of LUTs: 1.09
  times ISE's, less routing but a longer chain. iwls05-spi and secworks-siphash are within 2 %.

The causes ranked by what each could win: the geometric mean of the critical path against ISE (40 designs) with
that part of the affected designs' critical paths as ISE's (each alone; they overlap a little: an enable's net is
also routing):

| cause | issue | designs | Normal: +3.1 % → | High: −1.9 % → |
|---|---|---|---:|---:|
| routing of the critical path (placement, router) | #651 | t80, vtr-diffeq1, iwls05-i2c, itc99-b08, verilog-uart, itc99-b05, b09, b10, b12, iwls05-simple-spi, epfl-bar, fpu-adder, vtr-ch-intrinsics, and 4 more | −3.5 % (6.6 points) | −7.1 % (5.2) |
| a LUT level more on short control paths | #652 | iwls05-i2c, spi-fpga-slave, vtr-stereovision3, iwls05-usb-phy, iwls05-sasc, epfl-router, epfl-i2c, epfl-bar (#54), vtr-diffeq1 | +0.8 % (2.3) | −3.1 % (1.2) |
| the path ends on CE (Tceck) instead of through D | #653 | itc99-b03, b05, b06, b08, b09, b10, b12, verilog-uart, vtr-diffeq1 | +1.6 % (1.5) | −2.9 % (1.0) |
| epfl-multiplier's depth | #654 | epfl-multiplier | +2.2 % (0.9) | −2.7 % (0.8) |
| epfl-adder's long carry chain | #655 | epfl-adder | +2.9 % (0.2) | −2.1 % (0.2) |
| epfl-max's depth | #52 | epfl-max | +3.0 % (0.1) | −2.0 % (0.1) |

So place and route is the first target, about as large as all the synthesis causes together: the routing alone
would make Silinx 3.5 % faster than ISE at Normal and 7 % at High. The synthesis's largest share is the short
control paths, a LUT level and the clock enable (#652, #653: 3.8 points at Normal together), more than the deep
benchmarks (#52, #54, #370: one benchmark each, two of them about size).

The numbers are recomputed from `test/designs-corpus/ise-comparison.json` (`path` of each side); the weekly
comparison's page (docs/QUALITY.md, *The critical paths: logic and routing*) shows them for every design.

## The short control paths: the critical path mapped again, its enables folded (#652, #653)

Two of the causes above are the synthesis's on small control paths: a LUT level more than XST (#652) and a path that
ends on a flip-flop's clock enable (#653). Both come from how the mapping follows the logic as written.

**A level more (#652).** spi-fpga-slave's critical path is the enable of its shift register,
`load_data_en | (spi_clk_redge_en & ~cs_n_reg)`, with `load_data_en = din_vld & ((cs_n_reg & ~shreg_busy) | rx_data_vld)`
and `rx_data_vld` itself an AND of three flip-flops: a function of 6 inputs, which ABC maps as written, in 3 levels
(`rx_data_vld`, `load_data_en`, the OR). A Shannon split on `cs_n_reg` makes it 2 levels of LUT4s (for `cs_n_reg = 0` a
function of 4 inputs, for `cs_n_reg = 1` `din_vld & (~shreg_busy | rx_data_vld)`, the last LUT choosing), as XST has it
(2 levels, its path ends on CE too); a cut-based mapping sees only the cuts of the graph as it is, so not this one.
ABC's `speedup` (the LUTs of the critical path made gates again, their timing-critical cuts added as choices, then
mapped once more) finds such restructurings: `SPEED_ABC`, the usual mapping's script (Yosys's own for `-luts`) with
`speedup; if` after its first mapping. On spi-fpga-slave it gives the 2 levels (5.04 ns estimated → 3.89) but
duplicates the shared `load_data_en` into the 8 bits' multiplexers (21 LUTs → 33, 14 slices → 19), so the rule refuses
it; elsewhere it is a gain (below). The wider functions with the LUT delays (a 5-input function as two LUT4s and a MUXF5)
also give spi 2 levels, but double the slices of others (itc99-b12 168 → 316).

**The clock enable (#653).** Yosys makes a flip-flop whose next state is held under a condition an FDRE with that
condition on CE, mapped apart from the D logic: a path through the enable pays Tceck (0.555 ns) where the D LUT's
setup is 0.13 after it, and the enable's last LUT and the hold multiplexer cannot share a LUT. XST often has the
enable in the LUT before D. Folding every enable into D (`dffunmap -ce-only` before the mapping) is faster on 8 of the
13 designs but costs 20 to 90 % more slices (sasc 66 → 93, b12 168 → 216). `FOLD_CE_MAP` folds only the flip-flops
whose CE ends the critical path (`criticalEnables`, from the estimate's path ends `pathEnds`, within 0.05 ns of the
worst): their enable a `$_MUX_` before D, CE tied high, left to ABC with the rest of the next state's logic; where the
enable's last LUT and the hold fit in one LUT (itc99-b08, b12, iwls05-i2c, usb-phy, the traffic example) the path
ends on D.

**As candidates.** Both are remaps from the netlist before the LUT mapping, after every other mapping of either
effort, measured against the netlist chosen and kept by `DEPTH_RULE`: the speedup's, then the fold of the chosen
netlist's critical enables (with the speedup's script when it was kept), on designs of 1500 LUTs at most. At Normal
that is one or two Yosys runs more after the usual one: 0.3 to 1.1 s more synthesis (b08 1.13 → 1.62 s, picorv32
2.64 → 3.76, itc99-b14 9.17 → 10.13). Placed before the depth-oriented mappings instead, those were measured against
the faster netlist and the EPFL max (Normal, deep) ended 18 % slower; after them it is unchanged.

**Measured by ISE's trce** on the routed designs (the corpus's designs of 1500 LUTs at most, 53, and the examples;
the critical path in ns, before → after):

| design | Normal | Δ | High | Δ |
|---|---|---:|---|---:|
| itc99-b09 | 6.730 → 5.216 | −22.5 % | | |
| serv | 13.053 → 10.335 | −20.8 % | 12.670 → 10.335 | −18.4 % |
| itc99-b08 | 6.727 → 5.717 | −15.0 % | | |
| epfl-router | 9.906 → 8.666 | −12.5 % | | |
| iwls05-i2c | 9.514 → 8.345 | −12.3 % | | |
| iwls05-usb-phy | 5.461 → 4.804 | −12.0 % | 5.461 → 4.804 | −12.0 % |
| traffic (example) | 10.063 → 8.889 | −11.7 % | | |
| itc99-b10 | 6.660 → 5.920 | −11.1 % | | |
| vtr-diffeq1 | 38.865 → 35.500 | −8.7 % | | |
| itc99-b12 | 9.468 → 8.792 | −7.1 % | 9.468 → 8.792 | −7.1 % |
| itc99-b07 | 6.449 → 6.010 | −6.8 % | | |
| vtr-mkPktMerge | 7.135 → 6.665 | −6.6 % | 7.135 → 6.665 | −6.6 % |
| itc99-b13 | 7.920 → 7.565 | −4.5 % | 6.887 → 7.565 | +9.8 % |
| femtorv32-quark | 18.603 → 17.985 | −3.3 % | | |
| verilog-i2c-master | 9.820 → 9.639 | −1.8 % | | |
| vtr-stereovision3 | 5.495 → 5.502 | +0.1 % | 5.495 → 5.502 | +0.1 % |
| epfl-i2c | 7.005 → 7.100 | +1.4 % | | |
| epfl-bar | 10.410 → 10.568 | +1.5 % | | |
| light8080 | 12.216 → 12.567 | +2.9 % | 12.216 → 12.567 | +2.9 % |
| clock (example) | 8.094 → 8.431 | +4.2 % | 8.094 → 8.431 | +4.2 % |

The other designs' netlists are unchanged. Over the 53 designs the critical path is 2.8 % shorter at Normal (24 changed:
6.1 % shorter on average) and 0.7 % at High (7 changed); slices 10029 → 10015 at Normal, 9942 → 9904 at High. The
weekly comparison's 40 designs, their Silinx periods scaled by these ratios: Normal +3.1 % against ISE → about +0.3 %,
High −1.9 % → about −2.5 %. The slower ones are netlists the rule keeps as fast by the estimate and smaller (light8080
313 → 307 LUTs, the clock example 207 → 204, b13 at High 71 → 68): once routed some are slower and others faster
(b10 −11 %, diffeq1 −9 %, b07 −7 %, the same kind); together a gain, so the rule is kept as it is.

serv's speedup netlist also has 62 flip-flops fewer (355 → 293, in the corpus's I/O wrapper): its outputs `o_dbus_adr`
and `o_ext_rs1` are the same register, so their XOR into the wrapper's one pin cancels, which the remap's don't-care
optimisation (mfs2 after the new structure) finds; the netlist simulates as the design (the corpus's diff stage).

What is left: spi-fpga-slave (its enable shared by 8 flip-flops: the 2-level mapping duplicates it), vtr-stereovision3
and iwls05-sasc keep their extra level; itc99-b03, b05, b06 and sasc still end on CE (b03's and sasc's enable is shared
by 12 and 33 flip-flops: folding it costs 43 % more LUTs; b05's is slower folded); verilog-uart ends on the SR (Tsrck).
(Since then, spi-fpga-slave's and sasc's level: below.)

### The critical LUTs made shallower, their fan-out kept (#652)

What spi-fpga-slave needed is a mapping that changes only the critical cone and makes nothing shared again. It is done
after the LUT mapping, on the netlist (`core/lut-resynth.js`): the LUT that drives the end of a critical path, at level L,
is made again with level L-1 at most, its output kept (so its fan-out is), every other LUT left as it is.

- **Its cone, cut twice.** X: the cone's signals of level L-2 at most, where the cone stops (what the new last LUT, h,
  may read). Then cuts Z of the same cone with some of X's signals of level L-2 replaced by their LUTs' inputs (level L-3
  at most: what a new LUT g may read), the smallest first, of `RESYNTH_RULE.leaves` (8) leaves at most.
- **Two forms.** h alone, of up to 4 of X (a cone that converges again: two LUTs into one); or h(g(A), S): A up to 4
  leaves of Z of level L-3 at most, S up to 3 signals of X (the shared ones included: spi's `rx_data_vld`). F is such a
  function when, for each value of A and of S, F has one value, and the values of A fall into two classes that agree on
  every S both reach (a 2-colouring of their conflicts): g's two values. All by truth tables over Z (256 rows), so the
  new LUTs compute F by construction; `test/lut-resynth.test.js` checks the decomposition against functions built so
  and a netlist against its expressions on every input, and the corpus's diff stage simulates the netlists.
- **Rounds.** A round makes every end of the critical path (the estimate's ends within the worst, `pathEnds`) one level
  shallower, or it is undone and the pass ends; at most `RESYNTH_RULE.rounds` (16). The LUTs read only by the old
  ones are removed.
- **Nothing made twice.** A new g or h that the netlist already has (the same function of the same signals) is not
  made again: that LUT is read instead (h's: the root's readers moved to it). vtr-ch-intrinsics' 13 critical ends
  were 13 inverters of one LUT's output (Yosys's `extractinv`), each collapsed into the same LUT4: 13 new LUTs (141 →
  154 LUTs, 266 → 272 slices, its inputs loaded 14 times, 6.5 % slower once routed); one with the sharing (142, 266).
- **A candidate.** The last of the synthesis, on the netlist chosen of all the others (`depth.resynth`), at both
  efforts, designs of `SPEED_RULE.maxLuts` (1500) LUTs at most, kept by `DEPTH_RULE`; Yosys reads the new netlist back
  (`resynthCommands`: the cells' library, `read_json`) to write the Verilog netlist and the statistics as of any other.
  It takes milliseconds (vtr-ch-intrinsics 0.12 s) and that one Yosys run.

On spi-fpga-slave the shift register's enable becomes 2 levels with `load_data_en` kept: 21 LUTs → 23, 14 slices, 5.04 ns
estimated → 4.17 (its D logic, 3 levels into D, is the critical path then: making it 2 levels takes a LUT more per bit, the
speedup's 33). What it cannot do: iwls05-i2c's 24 critical ends (a counter's next state, 6 levels, 7 signals of level
L-2 at most) have no such decomposition; vtr-stereovision3's ends on two flip-flops' SR, one of them not.

Measured with Silinx's static timing (calibrated against trce, #457) on the routed designs: the corpus's 53 designs of
1500 LUTs at most (in their I/O wrapper on the XC3S1200E, as the weekly comparison builds them) and the 7 examples,
against main of the same day (after #714 and #716); the period in ns (a combinational design: its longest pad-to-pad
path), at placer seeds 1, 2 and 3, the mean of the three:

| design | effort | LUTs | slices | seed 1 | mean of 3 | Δ |
|---|---|---|---|---|---|---:|
| spi-fpga-slave | both | 21 → 23 | 14 → 14 | 5.905 → 4.937 | 5.74 → 4.71 | −17.9 % |
| clock (example) | both | 204 → 215 | 202 → 207 | 8.556 → 7.537 | 8.44 → 7.20 | −14.7 % |
| itc99-b13 | High | 68 → 71 | 41 → 42 | 7.161 → 6.131 | 7.17 → 6.15 | −14.2 % |
| verilog-uart | Normal | 133 → 137 | 131 → 133 | 9.838 → 8.882 | 9.83 → 8.69 | −11.6 % |
| iwls05-sasc | Normal | 89 → 94 | 66 → 65 | 5.509 → 4.966 | 5.52 → 4.92 | −10.9 % |
| vga (example) | both | 166 → 166 | 144 → 144 | 9.651 → 8.902 | 9.30 → 8.78 | −5.6 % |
| pong (example) | both | 282 → 279 | 245 → 243 | 12.497 → 11.794 | 12.33 → 11.75 | −4.7 % |
| light8080 | both | 307 → 307 | 189 → 189 | 12.289 → 11.623 | 12.67 → 12.10 | −4.5 % |
| iwls05-usb-phy | both | 102 → 102 | 63 → 64 | 5.026 → 4.664 | 4.93 → 4.73 | −4.1 % |
| traffic (example) | High | 106 → 106 | 66 → 66 | 8.179 → 7.801 | 8.28 → 7.97 | −3.7 % |
| fpu-adder | both | 486 → 486 | 338 → 338 | 10.468 → 9.981 | 10.84 → 10.43 | −3.7 % |
| itc99-b13 | Normal | 68 → 68 | 41 → 42 | 7.161 → 6.892 | 7.17 → 6.91 | −3.7 % |
| spi-fpga-master | both | 26 → 27 | 18 → 19 | 4.781 → 4.490 | 4.65 → 4.55 | −2.2 % |
| serv | both | 283 → 283 | 162 → 159 | 10.512 → 10.398 | 10.55 → 10.37 | −1.7 % |
| femtorv32-quark | High | 642 → 643 | 409 → 410 | 17.042 → 17.159 | 16.89 → 16.68 | −1.3 % |
| uart-for-fpga | Normal | 58 → 58 | 41 → 42 | 4.765 → 5.111 | 4.89 → 4.91 | +0.4 % |
| itc99-b09 | High | 40 → 41 | 20 → 21 | 5.542 → 5.773 | 5.42 → 5.46 | +0.6 % |
| iwls05-sasc | High | 104 → 104 | 66 → 66 | 5.003 → 5.032 | 4.88 → 5.03 | +3.2 % |
| vtr-ch-intrinsics | both | 141 → 142 | 266 → 266 | 5.684 → 5.842 | 5.75 → 5.94 | +3.3 % |
| verilog-uart | High | 148 → 148 | 125 → 125 | 8.104 → 9.052 | 8.06 → 8.48 | +5.2 % |

The other designs' netlists are the same. Over the 60, at seed 1: Normal 1.40 % shorter (14 changed, 5.8 % on average),
High 1.17 % (16 changed, 4.3 %); slices 10935 → 10940 at Normal, 10921 → 10926 at High; over the three seeds the
changed ones are 4.5 % shorter. The slower ones are netlists faster by the estimate (verilog-uart at High 7.28 → 6.92
ns, the same LUTs and slices) whose routing is slower, the kind the other candidates have (#653): together a gain, the
rule as it is. The designs #652 lists: spi-fpga-slave, iwls05-sasc (Normal) and usb-phy gain their level; vtr-stereovision3,
iwls05-i2c, the EPFL router, i2c and bar and vtr-diffeq1 are unchanged (no decomposition of every critical end).

**ISE's check** (on the Mac mini, the same routed designs of seed 1, before and after): trce 4.55 % shorter over the 20
changed builds; spi-fpga-slave 5.762 → 4.951 ns (−14.1 %; ISE's own flow 4.939), itc99-b13 at High −15.9 %, verilog-uart
at Normal −11.8 %, iwls05-sasc at Normal −10.1 %, spi-fpga-master −10.1 %, the clock example −9.7 %, vga −8.7 %,
light8080 −8.4 %, pong −6.7 %, itc99-b13 at Normal −6.4 %, traffic at High −2.7 %, iwls05-usb-phy and serv −2.3 %,
fpu-adder −1.5 %, femtorv32-quark at High +0.1 %, uart-for-fpga +1.4 %, iwls05-sasc at High +2.0 %, vtr-ch-intrinsics +3.2 %,
itc99-b09 at High +6.4 %, verilog-uart at High +11.5 % (the estimate's seed 1 too: +11.7 %; +5.2 % over three seeds).
Every bitstream byte-identical to ISE's bitgen (CRC on and off), every DRC 0 errors; vtr-ch-intrinsics's one DRC
warning (a gated clock, its latches) is main's too.

### A tree of LUT4s where one or two LUTs cannot do it (#652, 2026-10-22)

After #745 and #784 most critical ends of the corpus still had no shallower form of one or two LUTs: on the 120
syntheses (the corpus's 53 designs of 1500 LUTs at most and the 7 examples, both efforts) the critical ends' roots were
mostly functions of 5 to 16 leaves, and a pure AND or OR of literals (which balancing alone would fix) only on itc99-b10,
iwls05-ss-pcm and uart-for-fpga. Two other ideas measured first, on the cached netlists:

- the critical inputs of a root made shallower in its place (a recursive form, depth 1 to 4): 1-2 designs changed;
- an AND / OR of literals rebuilt balanced: 3 designs, each with another end that stays.

**The change** (`core/lut-resynth.js`, `shallowerTree`): when neither h nor h(g(A), S) exists, the root's cone is cut
(the latest LUT expanded first) at up to `RESYNTH_RULE.treeLeaves` (12) leaves, its function over them made a tree of
LUT4s by disjoint decompositions F = h(g(A), rest), A of 2 to 4 leaves (g's level the lowest first, then the larger A:
the first whose values give F two columns), then the same with h, until 4 inputs are left; kept when the root's level
is L-1 at most. An identical LUT already in the netlist is read instead of made again, as before. iwls05-sasc's receive
FIFO is the case: its full flag reads the pointers through two LUTs of level 2 (the write enable, a port's, and the next
pointer's equality), which one g cannot hold; the tree reads the pointers' XOR (a LUT the netlist has) and two new LUTs,
level 2 (`test/lut-resynth.test.js`, its LUTs as Yosys and ABC map them). 16 leaves would add itc99-b14 and
vtr-mkPktMerge but cost 11 s over the 120 syntheses (up to 1 s each), against 0.4 s for 12.

Measured as #745 was (main 1d895f9, seed 1, Silinx's static timing, routed): 6 of the 120 builds changed, all faster:

| design | effort | LUTs | slices | levels | estimate (ns) | routed (ns) | |
|---|---|---|---|---|---|---|---:|
| iwls05-sasc | High | 104 → 52 | 66 → 49 | 2 → 2 | 3.97 → 3.97 | 4.999 → 4.195 | −16.1 % |
| itc99-b13 | High | 71 → 70 | 42 → 42 | 4 → 3 | 5.81 → 4.69 | 6.008 → 5.389 | −10.3 % |
| fpu-adder | both | 486 → 488 | 338 → 339 | 6 → 6 | 8.86 → 8.07 | 9.981 → 9.639 | −3.4 % |
| iwls05-sasc | Normal | 94 → 95 | 65 → 65 | 3 → 2 | 4.17 → 3.97 | 4.912 → 4.860 | −1.1 % |
| itc99-b11 | Normal | 123 → 124 | 97 → 97 | 5 → 5 | 7.89 → 7.87 | 8.472 → 8.413 | −0.7 % |

iwls05-sasc at High: its shallower netlist lets the distributed RAM candidate (`lutram`) be kept, its two 4 × 8 FIFOs
in RAM16X1Ds instead of 64 flip-flops (the corpus: 118 → 54 flip-flops). Every changed netlist simulates as its RTL
(the corpus's diff stage); test/designs-corpus/expected.json has the four designs' new sizes. Over the 60 designs:
Normal −0.09 %, High −0.53 %; slices 10756 → 10757 and 10717 → 10701.

**ISE's check** (on the Mac mini, the 6 changed routings, main against the change): trce **5.80 % shorter** in geometric
mean: iwls05-sasc at High 5.048 → 4.409 ns (−12.7 %), itc99-b13 at High 6.329 → 5.720 (−9.6 %), fpu-adder 10.381 → 9.621
(−7.3 %, both efforts), itc99-b11 −1.4 %; iwls05-sasc at Normal 5.063 → 5.293 (+4.5 %: one level less by the estimate,
slower routed). Every DRC 0 errors and 0 warnings, xdl2ncd no warning, every `.bit` byte-identical to ISE's bitgen (CRC
on and off).

Still not shallower: vtr-stereovision3's set of a counter (a 7-leaf function of its state machine, no disjoint
decomposition), iwls05-usb-phy (10 of its 20 critical ends), the EPFL designs' ends of more than 12 leaves.

### Below an end with no shallower form: the descent (#652, 2026-10-24)

The T80 (#651's largest gap left, 1.17× ISE at Normal by Silinx's static timing) was the starting point. Its critical path
before the register file becomes distributed RAM is `mcycle` → 10 LUT levels of the instruction decode → the register
file's read (`regbusa`) → the ALU's carry chain → 3 LUTs → a flip-flop. The end's LUT is a function of 17 signals three
levels down: none of the forms above takes it, so the resynthesis stopped there, though the decode's LUTs on the way have
cones of 4-9 leaves. Now (`RESYNTH_RULE.descend`, `resynthCritical`), once a round makes no end shallower, the rounds go
on with a descent: an end with no form has the latest cell below it tried, down the path (through a carry chain too), up
to 40 cells, the first LUT with a form made shallower. The descent's rounds are kept only when the critical path ends up
`descendGain` (3 %) shorter than before them, the round of the shortest kept: a round below an end whose other inputs stay
as deep only adds LUTs (vtr-stereovision3's I2C sequencer: 126 → 137 LUTs at the same 7.62 ns when every round was kept;
light8080: 1.4 % shorter by the estimate, 5 LUTs more, routed 2 % slower over seeds 1-9).

The T80 itself does not gain: its 1816 LUTs are above `SPEED_RULE.maxLuts` (1500). Raised to 2500 for the test, the
descent gives 20.36 → 19.76 ns before the distributed RAM, but the netlists with the register file in RAM16X1Ds are then
the slower by the estimate and lose; made shallower too (19.81 ns), they route no faster (seeds 1-4: 21.74 against
21.85 ns). Tried there and dropped: the wide form on 8 leaves (MUXF8), nothing more; a lighter rule for the resynthesis
(1 % faster, 1 % more slices), the corpus +1.0 % at Normal.

The corpus's 53 designs of 1500 LUTs at most and the 7 examples (Silinx's static timing, seed 1): 4 routings change at
Normal, 3 at High, the others' netlists the same.

| design | Normal | High | estimate, LUTs |
|---|---:|---:|---|
| epfl-router | −10.5 % | | 8.77 → 7.62 ns, 68 → 75 |
| femtorv32-quark | −5.5 % | −8.7 % | 17.45 → 16.30, 740 → 751; High 16.07 → 13.77, 643 → 675 (394 slices, was 410) |
| the clock example | −4.8 % | −4.8 % | 6.19 → 5.46, 213 → 215 |
| the vga example | +2.0 % | −0.8 % | 9.02 → 8.11, 166 LUTs |

Over seeds 3, 5, 7 the vga example is 1-4 % faster at Normal (seed 1 the unlucky one). **ISE's trce** on the 7 changed
routings (main against the change): **−4.3 %** in geometric mean (femtorv32-quark −7.5 % and −7.2 %, epfl-router −6.1 %,
the clock example −4.8 % at both efforts, vga +2.0 % at Normal and −1.3 % at High); every DRC 0 errors, 0 warnings, every
`.bit` byte-identical to ISE's bitgen. The synthesis takes about 8 % longer on the corpus at Normal.

### A small design at Normal synthesized as at High too (#652, 2026-10-24)

ISE's trce of today's main on the corpus's 53 designs of 1500 LUTs at most and the 7 examples (the routings of the app's
flow, seed 1): the critical path 6.6 % shorter than ISE's at Normal (14 of 38 slower), 9.3 % at High (12 slower). The
largest gaps at Normal that are the synthesis's: itc99-b05 1.21× (logic 8.70 against 6.82 ns), but 1.05× at High. On
the 48 designs of 500 LUTs at most, High's netlists are 2.5 % faster than Normal's by trce with Normal's two placements
(3.3 % with High's three): epfl-router, itc99-b10 −19.3 %, itc99-b13 −18.0 %, iwls05-sasc −16.8 %, itc99-b05 −12.9 %, the
traffic example −12.6 %; slower: itc99-b08 +14.9 %, itc99-b11 +4.1 %, iwls05-i2c +3.5 %.

So Normal (`SMALL_RULE`) now synthesizes a design whose usual mapping has 250 LUTs at most both as at Normal and as at
High, side by side, and keeps High's netlist when the estimate says it is no slower than Normal's (compared with Normal's
final netlist, its remaps included: against the usual mapping alone itc99-b08's High netlist, 6.00 ns, looked faster than
6.19, while Normal's final one is 5.32). The two syntheses take two to three times as long as Normal's one (the app's worker
pool: blinky 2.0 → 4.3 s, pong 3.1 → 6.2, itc99-b11 2.6 → 8.4, epfl-i2c's 460 LUTs 5.5 → 13 s), hence 250 LUTs rather than
500: the designs that gain most are small.

ISE's check (the routings that change at Normal, 16; 14 timed): trce 8.0 % shorter in geometric mean (2.0 % over the 57
timed designs at Normal), every DRC 0 errors and 0 warnings, every `.bit` byte-identical to ISE's bitgen.

## 4:1 multiplexers in the wider mapping (#54)

The EPFL barrel shifter (`bar`, 128 bits shifted by 7, written as gates: decoded 4:1 multiplexers on the shift
amount's bit pairs) took 1201 LUTs and 601 slices onto LUT4s alone (its usual mapping), against XST's 939 and 534.
ABC's mapping with the wider functions (`LUT4_COSTS`) finds the structure: 128 LUT3s and 384 6-input functions,
each a 4:1 multiplexer. But Yosys's `lut_map.v` splits every 6-input function on its last two inputs, whatever the
function: four LUT4s, two MUXF5 and a MUXF6 (1664 LUTs and 1152 MUXFs, so the mapping was refused). Split on its
first select instead, a 4:1 multiplexer is two 2:1 multiplexers into a MUXF5: two LUT4s in one slice, as XST
builds it.

`LUT6_MAP` (`core/synth-open.js`, a techmap file given to the remaps on `LUT4_COSTS`, before `lut_map.v`, on the
6-input `$lut`s alone) finds the input whose two cofactors each depend on 4 of the other inputs at most and makes
those two LUT4s and a MUXF5; a function without such an input fails it and goes on to `lut_map.v` as before. Its
tables are computed by Yosys's constant functions (the dependencies on 64-bit words: about 1 s more per remap of
the T80, 0.8 s of bar's; bit by bit it was 7.7 s). Each 6-input function's split is checked against its table
on all 64 inputs (test/synth-open.test.js).

**The choice rule, twice.** The split makes the remaps on `LUT4_COSTS` smaller, so candidates the rule refused
before now pass it, and the estimate does not always tell right:
- verilog-uart was 22 % slower (8.39 → 10.26 ns, the same at seeds 2 and 3). Its depth-oriented netlist, now 130
  LUTs and 8.07 ns by the estimate, made ABC9's (148 LUTs, 125 slices, 7.28 ns) 14 % larger in LUTs than the rule's
  10 % allows, though it has fewer slices; it had been kept by a hair. So a netlist faster by the rule's `gain`
  with no more slices may have `luts` (10 %) more LUTs again.
- femtorv32-quark (in its I/O wrapper) was 9 % larger and slower once routed (816 → 887 LUTs, 410 → 445 slices,
  16.69 → 17.01 ns): #584's third balancing, with the split 680 LUTs and 445 slices instead of 724 and 468, became
  3.7 % faster by the estimate for 8.8 % more slices than the second balancing, inside the rule's flat 10 %. This
  reached main (#634) and was reverted (#649, the Nightly's #648): the PR's corpus run predated #570 and #584. So
  a faster netlist's slices may now grow no more in proportion than it is faster (they could grow by
  `max(luts, gain)` before; its LUTs keep that bound): femtorv32 keeps the second balancing again.

Measured on the whole design corpus (67 designs, effort High, routed, seed 1, the netlists simulated against the RTL),
against main of the same day without the change (both after #570, #584 and #611). The examples' netlists are the
same. Only the designs whose netlist changed:

| design | LUTs | slices | period (ns) |
|---|---|---|---|
| epfl-bar | 1201 → **941** (XST 939) | 601 → **471** (XST 534) | 10.60 → **9.38** (XST 9.08) |
| itc99-b14 | 1466 → **1358** | 740 → **686** | 32.67 → 32.38 |
| itc99-b20 | 2841 → **2691** | 1430 → **1355** | 35.48 → **34.70** |
| itc99-b21 | 3005 → **2804** | 1513 → **1412** | 35.79 → **33.96** |
| itc99-b13 | 87 → 83 | 44 → 42 | 7.73 → **6.83** |
| itc99-b05 | 476 → 468 | 258 → 254 | 10.82 → 10.76 |
| uart-for-fpga | 80 → 78 | 42 → 41 | 5.33 → **4.49** |
| serv | 346 → 342 | 212 → 209 | 12.17 → 12.54 (12.82 → 12.23 in an earlier measurement: placement) |
| epfl-router | 59 → 62 | 36 → 34 | 6.54 → 7.18 (+10 %) |
| itc99-b11 | 179 → 191 (+7 %) | 94 → 100 (+6 %) | 9.70 → **8.69** (−10 %) |
| itc99-b15 | 2465 → 2649 (+7.5 %) | 1237 → 1330 (+7.5 %) | 18.50 → 18.35 |

Geometric means over the 67 designs: LUTs 0.995, slices 0.993, period 0.991. ITC'99 b15's wider mapping is kept as
10 % faster by the estimate for 7.5 % more slices (within the new bound), the routed design 1 % faster only; the
EPFL router's I/O wrapper is the one design slower. Synthesis time: about 1 s more per remap of a design with many
6-input functions (the T80 18.0 s instead of 17.0).

The T80 (1.15 times XST's LUTs, #54) is not changed: its wider mapping is not kept (2204 LUTs, 1297 slices
against 2154 and 1146 onto LUT4s alone). Its 361 flip-flops against XST's 247 are most likely its register file
(T80_Reg: two arrays of 8 × 8 bits, written at one address, read asynchronously at three): 128 flip-flops in the open
synthesis, no distributed RAM; XST can make it RAM16X1Ds (not checked: ISE's map report is not in the comparison). Left.

### The wider mapping at effort Normal (#54)

At Normal a design that is not deep (#468) got the usual mapping alone (and the critical path's remaps, #652, #653):
the EPFL barrel shifter stayed at 1199 LUTs and 600 slices at the app's default effort, against 941 and 471 at High.
Normal now makes the mapping with the wider functions too (`LUT4_COSTS`, `LUT6_MAP`), one more remap from the netlist
before the LUT mapping, started beside the others, kept when better by `DEPTH_RULE` than the netlist chosen of the
others. It is measured last: measured first, the kept wider netlist then kept out a faster one of the critical path's
remaps (ITC'99 b08: the enables folded, 14 % faster by the estimate for 17 % more LUTs than the wider one, refused;
routed 11 % slower). Not after the wide multiplexers were kept (#511), as the critical path's remaps.

Measured on 2026-10-20 (synthesis at Normal, one Yosys at a time, the corpus's designs but the three largest, EPFL log2
and multiplier and AES, above `DEPTH_RULE.maxLuts`, where it is not tried; routed in the corpus's projects on the XC3S1200E, seeds 1 to 3, the period their mean).
8 designs change, all faster by the estimate:

| design | LUTs | slices | period (ns) |
|---|---|---|---|
| epfl-bar | 1199 → **941** (XST 939) | 600 → **471** (XST 534) | 10.28 → **8.76** |
| itc99-b01 | 13 → 9 | 7 → 5 | 3.12 → **2.52** |
| iwls05-simple-spi | 149 → 157 | 83 → 89 (+7 %) | 6.81 → **6.21** |
| verilog-axis-fifo | 16 → 16 | 19 → 19 | 6.16 → 5.87 |
| uart-for-fpga | 58 → 56 | 41 → 42 | 4.89 → 4.75 |
| itc99-b04 | 139 → 139 | 105 → 105 | 13.95 → 13.69 |
| verilog-uart | 129 → 133 | 120 → 131 (+9 %) | 9.93 → 9.83 |
| epfl-ctrl (no clock) | 50 → 44 | 25 → 26 | |

The 7 timed ones: 0.92 times the LUTs, 0.95 times the slices, 0.92 times the period (geometric means); none slower.
The examples keep their netlists. The corpus's synthesis at Normal took 356 s instead of 304 (one Yosys at a time;
with the app's 4 workers the remap runs beside the others).

### The T80's register file as distributed RAM (#54)

The T80 had 361 flip-flops against XST's 247 and 2153 LUTs against 1874. Its register file (T80_Reg: two arrays of
8 × 8 bits, written at one address, read asynchronously at three) was 128 flip-flops and their read multiplexers:
Yosys's `memory_libmap` prices a memory left to logic at 1 per bit (64) and as RAM16X1D at 84 (two copies for the
three read ports), and leaves the multiplexers out. XST maps it onto 32 RAM16X1D (its report: two 8 × 8 dual-port RAMs
per array, ports A + B and A + C), and its critical path goes through one: the first read address (`RegAddrA`) after 9
levels of LUTs, then the RAM's read (Tilo, 0.759 ns in trce, as a LUT's), then the 16-bit increment.

**The usual mapping is slower with the RAM.** With each bit priced at 2 (`-logic-cost-ram 2` in synth_xilinx's
memory step made by hand; 1 gives main's netlist exactly) the T80 gets the 32 RAM16X1D, but the usual mapping is
slower: the read address comes from 11 levels of LUTs, which the flip-flops' multiplexers absorbed (the late select
taken in their last level). By the estimate 22.71 ns against 20.36; routed at Normal 21.71 → 23.11 ns, trce 20.758 →
22.286 ns. Only the first read port limits it: the paths through the others end 18.52 ns at most.

**The balanced mappings are not.** From that netlist, High's depth-oriented mappings put the address logic in fewer
levels. Each candidate routed (XC3S250E, seeds 1 to 3, the means; trce: ISE 14.7 on the routed designs, DRC clean, the
.bit files byte-identical to ISE's bitgen):

| T80 at High | slices | FFs | LUTs | estimate (ns) | routed (ns) | trce (ns) |
|---|---:|---:|---:|---:|---:|---:|
| flip-flops (main) | 1146 | 361 | 2153 | 20.36 | 22.09 | 21.67 |
| RAM, the usual mapping | 1024 | 233 | 1846 | 22.71 | 23.87 | |
| RAM, balanced once more (DEPTH_ABC2) | 1177 | 233 | 1814 | 18.58 | 21.38 | 21.10 |
| RAM, the same with the LUT delays | 1106 | 233 | 1803 | 19.39 | 21.31 | |
| RAM, balanced twice more (DEPTH_ABC3) | 1065 | 233 | 1777 | 20.29 | 22.20 | |
| **RAM, balanced once more onto LUT4s alone** | **1009** | **233** | **1816** | 20.41 | **21.29** | **20.36** |
| XST | 1000 | 247 | 1874 | | | 18.13 |

(LUTs: the logic's; the RAM's 64 LUT sites apart.) The estimate ranks the netlists with many F-multiplexers too fast:
the second balancing has 598 MUXF5/MUXF6, its routed period 1.15 times its estimate, against 1.04 for the one onto LUT4s
alone. By DEPTH_RULE the second balancing would be kept (10 % faster by the estimate), 17 % more slices than the
one onto LUT4s alone, and slower by trce.

**What the open synthesis does.** At High (and a deep design at Normal), the usual run counts the memories written
to that it left to logic (`select -count t:$mem_v2 r:WR_PORTS>0 %i` between synth_xilinx's memory steps: it changes no
name, the netlist byte-identical; the extra passes on a copy first tried changed Yosys's automatic names, and with them
ABC's mapping). A design with some is synthesized once more with them priced at `LUTRAM_COST` (2); when that took
some, High's mappings are made from its netlist. It is a mapping for size: of its netlists, those kept by DEPTH_RULE
against the netlist chosen and no slower than it by the estimate (the rule's 1 % slack), the one with the fewest
slices is kept; else its own choice, when better by DEPTH_RULE.

On the examples and the design corpus at High (one Yosys at a time) every netlist is the same as before, byte for byte,
but two:

| design | slices | FFs | LUTs | routed (ns, seeds 1–3) | trce (ns) |
|---|---:|---:|---:|---:|---:|
| t80 | 1146 → **1009** | 361 → **233** | 2153 → **1816** | 22.09 → **21.29** | 21.67 → **20.36** |
| iwls05-simple-spi (its two FIFOs) | 89 → **79** | 131 → **67** | 157 → **108** | 6.16 → **6.07** | 6.05 → 6.16 |

iwls05-sasc's FIFOs as RAM are not kept (no smaller netlist as fast); neorv32's two memories written to are not taken by
the RAM (one more Yosys run, nothing else). A ROM is not counted (its price is `-logic-cost-rom`). The T80's synthesis at
High takes 42 → 80 s.

**At effort Normal.** A design that gets none of High's mappings makes two more Yosys runs when its usual run left
memories written to in logic: the RAM's usual mapping and, from its netlist, the one balanced onto LUT4s alone
(DEPTH_ABC2 on LUT4s, High's smallest balancing, #370), the same rule choosing (`lutram: false` leaves it out). The T80
then gets the netlist High kept (the same, byte for byte), its synthesis at Normal about 21 → 24 s. On the design
corpus at Normal three designs have such memories: the T80 and simple_spi change, sasc does not (its netlist the same);
neorv32's are not taken (one run more).

| design at Normal | slices | FFs | LUTs | routed (ns, seeds 1–3) | trce (ns) |
|---|---:|---:|---:|---:|---:|
| t80 | 1146 → **1009** | 361 → **233** | 2153 → **1816** | 22.09 → **21.29** | 21.67 → **20.36** |
| iwls05-simple-spi | 89 → **79** | 131 → **67** | 157 → **110** | 6.16 → **5.94** | 6.05 → **5.86** |

simple_spi's trce (seeds 1/2/3): before 6.094 / 5.924 / 6.142 ns; at High (the wider mapping with the RAM)
5.898 / 6.291 / 6.302, 1.8 % slower in the mean, within the seeds' spread (Silinx's own analysis has it 1.5 % faster);
at Normal (the balanced one onto LUT4s alone) 5.743 / 6.038 / 5.785, 3.3 % faster. At High it has no balanced
candidate (its depth-oriented mapping is not kept, so no second balancing is made), and of the two as fast by the
estimate (5.40 ns) the wider mapping has the fewer slices.

**After #370's wider mfs2 windows (`DEPTH_ABC2_LUT4`, High's fourth candidate).** The T80 at High then keeps another
netlist onto LUT4s alone: 1782 LUTs, **992 slices** (XST 1000), the same estimate (20.41 ns), but routed slower
(seeds 1–3): Silinx 21.88 / 22.94 / 22.10 ns (22.31; the one of #771 21.29, main 22.09), trce 20.836 / 21.951 /
21.246 ns (**21.34**; #771's 20.36, main's flip-flops 21.67). Still 1.5 % faster than main by trce, 13 % fewer slices.
At Normal its RAM remap stays on `DEPTH_ABC2` (tried with `DEPTH_ABC2_LUT4`: the same 992-slice netlist, 4.8 % slower
by trce for 17 slices): the T80 at Normal 1009 slices, 20.36 ns. simple_spi and sasc are the same with either.

## The EPFL arbiter: balanced once more onto LUT4s alone (#370)

The EPFL round-robin arbiter (256 inputs, 129 outputs, each grant a ring-shaped priority chain of about 88 gates; not
in the corpus, whose runner runs out of memory on it, #372) maps at High to the balanced mappings on the wider
functions (`LUT4_COSTS`). The second balancing onto LUT4s alone (#370's comment: 1972 LUTs and 986 slices against
2212 and 1254) was not one of the candidates. It is now a fourth one, beside DEPTH_ABC2 with and without the LUT delays
and DEPTH_ABC3, kept by the same rule (keepSecond, then the best by DEPTH_RULE).

Measured on 2026-10-20 at High:

| design | before: kept | LUTs | slices | ns (estimate) | ns (routed, seeds 1–3) |
|---|---|---:|---:|---:|---:|
| EPFL arbiter in the corpus's I/O wrapper (XC3S1200E) | DEPTH_ABC2, LUT delays | 2196 → **2019** | 1224 → **1010** | 9.86 → 9.92 | 13.60 → **13.39** |
| EPFL arbiter alone | DEPTH_ABC3 | 2163 (not kept: 1972) | 1214 (986) | 9.27 (9.65) | |
| a 24-request arbiter written as gates (`test/synth-open.test.js`) | DEPTH_ABC2 | 159 → 161 | 99 → **81** | 8.65 → **7.62** | |

On the arbiter alone the new netlist is 4 % slower by the estimate than DEPTH_ABC3's, outside the rule's 1 % for a
smaller one, so DEPTH_ABC3 stays; in the wrapper (where the build runs) the two are within it. On the design corpus at
High the candidate is made for the 18 designs that keep the depth-oriented mapping and is never kept (slower by the
estimate on each: the EPFL adder 76 ns against 9.7, max 66 against 16.6, the ITC'99 cores 10 to 16 %): the same
netlists, the same warnings, 221 s of synthesis instead of 208 for those 18 (one Yosys at a time).

Still far from the size record (259 LUT-6, about 520 LUT4s): each output's chain is mapped as its own tree; the record
needs the two shared prefix scans of a round-robin arbiter (a functional rewrite before ABC), which neither ABC script
finds.

### mfs2's windows (#370)

What kept the balanced mapping of the arbiter larger: ABC's don't-care optimization at the end of each script (`mfs2`)
looks at windows of 300 nodes at most (`-M`), and the terms of the requests and priorities that the balanced chains share
reach further. With `mfs2 -M 5000` (the same with no limit, `-M 0`, and with `-W 10`; `-M 1500` gains little) the
fourth candidate (`DEPTH_ABC2_LUT4`) maps the arbiter in the I/O wrapper to 1537 LUTs instead of 2019, as deep (8 levels,
9.92 ns estimated). A third round of mapping and mfs2 gives 1499. ABC's other area commands gain nothing on it:
`lutpack` 2016, `if -a` 2016 (and 13 levels), `&dsdb` 4137; the usual mapping with the wider window stays at 4090.

Measured on 2026-10-21, the arbiter in the corpus's I/O wrapper on the XC3S1200E, ISE 14.7's trce on the open flow's
routing (seeds 1–3, DRC 0 errors, 0 warnings), and XST + map + par on the same project:

| | LUTs | slices | trce (ns), seeds 1 / 2 / 3 | mean |
|---|---:|---:|---|---:|
| XST (Normal) | 3514 | 1864 | 13.602 (par) | |
| Silinx High, before | 2019 | 1010 | 13.239 / 12.735 / 13.101 | 13.03 |
| Silinx High, the wider window | **1537** | **769** | 12.924 / 12.839 / 12.960 | **12.91** |
| Silinx Normal (the SOP balancing) | 2579 | 1290 | 11.588 / 11.799 / 11.842 | 11.74 |
| Silinx Normal, the SOP balancing with the wider window (not kept) | 2217 | 1109 | 12.348 / 12.314 / 11.963 | 12.21 |

Tried and not kept:
- the wider window on every depth-oriented script: with the LUT delays (`DEPTH_ABC2` with them, `DEPTH_ABC3`) mfs2 keeps
  the levels but not the delays and makes 5- and 6-input functions of 4-input ones (a 48-request arbiter's third balancing
  9.54 -> 9.90 ns estimated, then lost to the fourth candidate);
- on the GIA's SOP balancing (`DEPTH_SOPB`): the EPFL max 672 -> 639 slices, trce 22.195 -> 21.901 ns, the multiplier
  1 % fewer LUTs, but the arbiter at Normal 4 % slower (above). On the rest of the corpus the netlists were the same.

With it the open synthesis is far below XST on the arbiter (1537 LUTs against 3514) but still about 3× the LUT-6 record's
equivalent: the shared prefix scans remain a functional rewrite.

### More area rounds, and how far a rewrite could go (#370)

**Each more round of the area mapping shares more.** The fourth candidate (`DEPTH_ABC2_LUT4`) now ends with four more
rounds of `strash; dch -f; if; mfs2 -M 5000`. The EPFL arbiter alone, onto LUT4s, all at 8 levels and 9.65 ns estimated:

| rounds of the area mapping at the end | 2 (before) | 3 | 4 | 6 (now) | 8 |
|---|---:|---:|---:|---:|---:|
| LUTs | 1500 | 1433 | 1404 | **1350** | 1347 |

Tried in the rounds and not kept: `dc2` in each round (1413 LUTs, 9 levels), the GIA's `&dch -f; &if -K 4` (1412),
`if -a` then `lutpack` (1540, 14 levels), `mfs2 -a` at the end (1403 after 4 rounds, as plain), `fx` on the SOP network
after the balancing (1632), the GIA's `&syn2; &if -a` (1672). `resyn2rs` and `compress2rs` are not commands of YoWASP's
ABC (they are aliases of abc.rc).

Measured at High (2026-10-22), the examples and the design corpus at both efforts (`synthesizeOpen`, one Yosys at a time;
routed by the open flow, seeds 1–3, Silinx's timing analysis):

| design | LUTs | slices | ns routed (mean of seeds 1–3) |
|---|---:|---:|---:|
| EPFL arbiter in the corpus's I/O wrapper (XC3S1200E) | 1537 → **1410** | 769 → **705** | 13.10 → 13.06 |
| T80 (its distributed-RAM mapping takes the candidate's netlist) | 1782 → **1720** | 992 → **961** | 22.36 → **20.69** |
| the stopwatch example | 197 → 196 | 182 → 181 | 12.72 → 12.75 |
| EPFL i2c alone (in the corpus's I/O wrapper: the same netlist) | 394 → 413 | 247 → 207 | estimate 5.76 → 5.05 |

The other 71 designs at High and all 74 at Normal keep their netlists and warnings. The candidate's remap of the arbiter
takes 16 s instead of 10.

**The bound of a functional rewrite at the same depth.** The arbiter's function (checked by simulation, then by Yosys's
SAT on a miter) is a ring-shaped carry chain: grant[i] = req[i] and, for some j, priority[j] with no request at j … i−1
(round the ring). With c[i] the carry into i, G and P the generate and propagate of a range (generate priority[j],
propagate ~req[j−1]), c[i] = G[0..i] | P[0..i] & G[i+1..127]: one forward and one backward prefix scan, shared by every
grant. Written so by hand (equal to the EPFL file by `sat -prove-asserts` on a miter) and mapped by the same scripts:

| the arbiter written as | LUTs | levels | ns estimated |
|---|---:|---:|---:|
| the EPFL file (today's fourth candidate) | 1350 | 8 | 9.65 |
| two Kogge-Stone scans | 1588 | 8 | 9.65 |
| two Sklansky scans | **779** | 8 | 9.65 |
| two ripple scans | 673 (643 balanced) | 85 | 98.2 |

So at the same speed about 780 LUT4s is the floor of this structure: the record (259 LUT-6, about 520 LUT4s) is a
ripple chain's size, not reachable without a deeper netlist. Finding the scans in the EPFL file would take a matcher of
functions, not of structure: each grant's cone is a chain of about 85 private AND stages (339 nodes, 768 of them shared
by about 42 grants each), with the positions grouped differently for each grant. Such a matcher would fire on this one
benchmark; not made.

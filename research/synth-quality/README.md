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

**The SRLC16 cascade** (Q15, DIF_MUX = SHIFTIN): a chain longer than 16 uses general routing between
its SRL16Es instead (and a variable tap past 16 stages a second SRL16E per 16, read at stage 15).

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
  variable taps (#5, above); the cascade left. What the prototype (before it) found:
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
- **State machines**: Yosys's `fsm` pass finds no state machine in lab11's control unit (its
  `state_id` output reads the state register); XST kept its binary encoding too.

# Quality of the Silinx toolchain against Xilinx ISE

How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx's
pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are
the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,
crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),
with the same top (a design with more ports than the package has pins goes through the same I/O
wrapper in both).

Measured 2026-10-17 (Silinx 15.10.22, ISE 14.7), with
`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as
tightly as it can (`-c 1`, as Silinx's packer always does) and the clock constraint is tightened to
5 ns, so that its place and route works for speed (ISE stops improving once a constraint
is met; the Silinx toolchain always places and routes for speed).

## Summary

- **Size:** 26 designs built by both. Logic LUTs: Silinx −25% against ISE; flip-flops
  −7%; slices −26% (geometric means of the ratios; below 0: Silinx is smaller). Silinx
  needs as few LUTs or fewer on 17 of 26.
- **Speed:** 23 designs timed by both. Critical path: Silinx +22% against ISE
  (above 0: Silinx is slower); Silinx is as fast or faster on 4 of 23. Both critical
  paths are measured by ISE's timing analyser (trce) on the routed design.
- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read 12 of the designs (`$clog2`, VHDL-2008
  and other constructs it predates, listed below); Silinx reads them.
- The Silinx toolchain is experimental: these numbers are tracked to improve it (the GitHub
  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).

## Size

4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices
after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the
ratio of logic LUTs (below 1: Silinx is smaller).

| design | LUTs Silinx | LUTs ISE | S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 384 | 696 | 0.55 | 386 | 386 | 193 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 1201 | 939 | 1.28 | 264 | 269 | 601 | 534 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 286 | 222 | 1.29 | 0 | – | 143 | 111 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 50 | 48 | 1.04 | 0 | – | 25 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 1.00 | 265 | 265 | 187 | 190 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 471 | 589 | 0.80 | 276 | 270 | 236 | 355 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 82 | 64 | 1.28 | 0 | – | 41 | 32 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1088 | 1386 | 0.78 | 643 | 643 | 544 | 927 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 174 | 417 | 0.42 | 137 | 137 | 87 | 257 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 63 | 125 | 0.50 | 64 | 64 | 32 | 87 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 710 | – | – | 224 | – | 433 | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 486 | 699 | 0.70 | 389 | 389 | 341 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 404 | 539 | 0.75 | 404 | 406 | 241 | 397 | 0 / 0 | 0 / 0 | 4 / 4 |
| light8080 | 313 | 855 | 0.37 | 206 | 237 | 192 | 482 | 0 / 0 | 2 / 1 | 0 / 0 |
| nandland-spi-verilog | 46 | – | – | 37 | – | 52 | – | 0 / – | 0 / – | 0 / – |
| nandland-spi-vhdl | 46 | – | – | 37 | – | 52 | – | 0 / – | 0 / – | 0 / – |
| neorv32 | 2900 | – | – | 1319 | – | 2158 | – | 0 / – | 6 / – | 0 / – |
| picorv32 | 1264 | – | – | 770 | – | 786 | – | 0 / – | 2 / – | 0 / – |
| secworks-aes | 8679 | – | – | 2996 | – | 5584 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha1 | 2064 | – | – | 1537 | – | 1466 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha256 | 2940 | – | – | 1809 | – | 1993 | – | 0 / – | 0 / – | 0 / – |
| secworks-siphash | 1228 | 1180 | 1.04 | 798 | 798 | 913 | 727 | 0 / 0 | 0 / 0 | 0 / 0 |
| serv | 309 | – | – | 354 | – | 193 | – | 1 / – | 1 / – | 0 / – |
| spi-fpga-master | 26 | 29 | 0.90 | 21 | 21 | 18 | 17 | 0 / 0 | 0 / 0 | 0 / 0 |
| spi-fpga-slave | 21 | 50 | 0.42 | 21 | 20 | 14 | 29 | 0 / 2 | 0 / 0 | 0 / 0 |
| t80 | 2153 | 1874 | 1.15 | 361 | 247 | 1296 | 1000 | 0 / 0 | 0 / 0 | 0 / 0 |
| uart-for-fpga | 60 | 52 | 1.15 | 53 | 52 | 42 | 38 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-axis-fifo | 16 | – | – | 32 | – | 19 | – | 0 / – | 1 / – | 0 / – |
| verilog-i2c-master | 193 | 266 | 0.73 | 72 | 91 | 115 | 145 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-lfsr-crc | 100 | – | – | 64 | – | 53 | – | 0 / – | 0 / – | 0 / – |
| verilog-lfsr-prbs | 16 | – | – | 31 | – | 16 | – | 0 / – | 0 / – | 0 / – |
| verilog-uart | 129 | 160 | 0.81 | 79 | 79 | 120 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-ch-intrinsics | 141 | 154 | 0.92 | 509 | 425 | 275 | 273 | 0 / 1 | 0 / 0 | 0 / 0 |
| vtr-diffeq1 | 410 | 346 | 1.18 | 451 | 451 | 262 | 321 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-diffeq2 | 309 | 312 | 0.99 | 258 | 258 | 160 | 208 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-mkPktMerge | 256 | 4018 | 0.06 | 962 | 8153 | 730 | 5812 | 0 / 153 | 0 / 0 | 0 / 0 |
| vtr-sha | 1583 | 2255 | 0.70 | 893 | 900 | 816 | 1149 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-stereovision3 | 127 | 109 | 1.17 | 121 | 101 | 99 | 92 | 0 / 4 | 0 / 0 | 0 / 0 |

## Speed

The critical path of the routed design (the minimum clock period, or the longest path of a
design without a clock; ns, shorter is faster), both by ISE's trce. *Silinx estimate*: Silinx's own
timing analysis (what its Design Summary shows).

| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate |
|---|---:|---:|---:|---:|
| epfl-adder | 83.37 | 12.25 | 6.81 | 87.28 |
| epfl-bar | 10.86 | 9.08 | 1.20 | 10.73 |
| epfl-dec | 6.32 | 6.12 | 1.03 | 6.24 |
| epfl-i2c | 7.64 | 6.81 | 1.12 | 7.67 |
| epfl-max | 61.75 | 25.68 | 2.40 | 64.22 |
| epfl-priority | 43.01 | 20.83 | 2.06 | 43.88 |
| epfl-router | 10.09 | 9.36 | 1.08 | 10.32 |
| femtorv32-quark | 18.72 | – | – | 19.61 |
| fpu-adder | 11.69 | 12.07 | 0.97 | 11.79 |
| fpu-multiplier | 15.10 | 14.61 | 1.03 | 15.19 |
| light8080 | 12.06 | 15.13 | 0.80 | 12.57 |
| nandland-spi-verilog | 5.38 | – | – | 5.35 |
| nandland-spi-vhdl | 5.51 | – | – | 5.51 |
| neorv32 | 15.50 | – | – | 15.61 |
| picorv32 | 11.41 | – | – | 11.47 |
| secworks-aes | 27.98 | – | – | 28.39 |
| secworks-sha1 | 17.06 | – | – | 17.36 |
| secworks-sha256 | 25.87 | – | – | 26.09 |
| secworks-siphash | 15.03 | 13.98 | 1.08 | 14.90 |
| serv | 13.39 | – | – | 13.58 |
| spi-fpga-master | 5.07 | 4.99 | 1.02 | 5.03 |
| spi-fpga-slave | 5.86 | 4.94 | 1.19 | 6.00 |
| t80 | 22.43 | 18.13 | 1.24 | 23.00 |
| uart-for-fpga | 5.90 | 4.69 | 1.26 | 5.94 |
| verilog-axis-fifo | 6.46 | – | – | 6.07 |
| verilog-i2c-master | 10.13 | 9.88 | 1.03 | 10.27 |
| verilog-lfsr-crc | 3.96 | – | – | 3.94 |
| verilog-lfsr-prbs | 2.36 | – | – | 2.33 |
| verilog-uart | 11.70 | 9.24 | 1.27 | 11.44 |
| vtr-ch-intrinsics | 6.31 | 5.06 | 1.25 | 6.57 |
| vtr-diffeq1 | 36.07 | 35.80 | 1.01 | 40.07 |
| vtr-diffeq2 | 27.64 | 26.74 | 1.03 | 29.27 |
| vtr-mkPktMerge | 8.03 | 9.27 | 0.87 | 7.95 |
| vtr-sha | 15.51 | 19.92 | 0.78 | 15.28 |
| vtr-stereovision3 | 5.58 | 4.92 | 1.13 | 8.22 |

## Not built by one of the flows

- femtorv32-quark: XST cannot read it (`ERROR:HDLCompilers:28 - "src/src/femtorv32_quark.v" line 63 'instr' has not been declared`); Silinx reads it.
- nandland-spi-verilog: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/SPI_Master.v" line 60 unexpected token: '$clog2'`); Silinx reads it.
- nandland-spi-vhdl: XST cannot read it (`ERROR:HDLParsers:1401 - "/work/src/src/SPI_Master.vhd" Line 161. Object o_TX_Ready of mode OUT can not be read.`); Silinx reads it.
- neorv32: XST cannot read it (`ERROR:HDLParsers:3317 - "/work/src/src/neorv32_imem.vhd" Line 16. Library neorv32 cannot be found.`); Silinx reads it.
- picorv32: XST cannot read it (`` ERROR:HDLCompilers:26 - "src/src/picorv32.v" line 549 Macro reference `assert is not defined ``); Silinx reads it.
- secworks-aes: XST cannot read it (`ERROR:Xst:1468 - "src/src/aes_key_mem.v" line 180: Unexpected event in always block sensitivity list.`); Silinx reads it.
- secworks-sha1: XST cannot read it (`ERROR:Xst:902 - "src/src/sha1_w_mem.v" line 146: Unexpected w_mem event in always block sensitivity list.`); Silinx reads it.
- secworks-sha256: XST cannot read it (`ERROR:Xst:902 - "src/src/sha256_w_mem.v" line 138: Unexpected w_mem event in always block sensitivity list.`); Silinx reads it.
- serv: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/serv_rf_ram.v" line 12 unexpected token: '$clog2'`); Silinx reads it.
- verilog-axis-fifo: XST cannot read it (`ERROR:HDLCompilers:26 - "src/src/axis_fifo.v" line 130 unexpected token: '$clog2'`); Silinx reads it.
- verilog-lfsr-crc: XST cannot read it (`ERROR:Xst:890 - "src/src/lfsr.v" line 271: For statement is only supported when the new step evaluation is based on one the following operator: +, -.`); Silinx reads it.
- verilog-lfsr-prbs: XST cannot read it (`ERROR:Xst:890 - "src/src/lfsr.v" line 235: For statement is only supported when the new step evaluation is based on one the following operator: +, -.`); Silinx reads it.

## Added after this comparison

epfl-sin, epfl-voter, epfl-multiplier, epfl-log2, itc99-b01, itc99-b02, itc99-b03, itc99-b04, itc99-b05, itc99-b06, itc99-b07, itc99-b08, itc99-b09, itc99-b10, itc99-b11, itc99-b12, itc99-b13, itc99-b14, itc99-b15, itc99-b17, itc99-b20, itc99-b21, itc99-b22, iwls05-sasc, iwls05-simple-spi, iwls05-spi, iwls05-i2c, iwls05-ss-pcm, iwls05-usb-phy: added to the design corpus after this comparison was run; the next weekly run compares them too.

## Against the best-known results (EPFL benchmarks, LUT-6)

The [EPFL combinational benchmarks](https://github.com/lsils/benchmarks) keep the best results of a logic
synthesis competition, in 6-input LUTs: the fewest LUTs (size) and the fewest levels of LUTs (depth). The
Spartan-3E has 4-input LUTs, so the table above does not compare with them; here Silinx's front end and its
Yosys / ABC mapping (core/synth-open.js) map each benchmark to LUT-6: *area*, ABC's default LUT mapping, against
the size record; *depth*, the logic balanced first as Silinx's depth-oriented mapping does, against the depth
record (geometric means: LUTs 1.82× the size records, levels 1.95× the depth records; the
records come from exact SAT-based resynthesis and long optimization runs, the targets of research, not of a
synthesis tool in seconds). Records: the best_results/README.md of lsils/benchmarks at 82d8cc6.

| benchmark | LUT-6 (area) | levels | best LUTs | LUTs / best | LUT-6 (depth) | levels | best levels | levels / best |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| adder | 273 | 51 | 129 | 2.12 | 332 | 25 | 5 | 5.00 |
| bar | 512 | 4 | 512 | 1.00 | 1664 | 4 | 4 | 1.00 |
| div | not mapped | – | 3082 | – | not mapped | – | 170 | – |
| hyp | not mapped | – | 36451 | – | not mapped | – | 458 | – |
| log2 | 8243 | 66 | 5986 | 1.38 | 8610 | 64 | 51 | 1.25 |
| max | 821 | 33 | 511 | 1.61 | 928 | 18 | 6 | 3.00 |
| multiplier | 5862 | 53 | 4282 | 1.37 | 6357 | 52 | 25 | 2.08 |
| sin | 1466 | 35 | 994 | 1.47 | 1659 | 34 | 10 | 3.40 |
| sqrt | 3869 | 1007 | 2958 | 1.31 | 5032 | 948 | 150 | 6.32 |
| square | 3975 | 50 | 2894 | 1.37 | 4045 | 49 | 10 | 4.90 |
| arbiter | 2722 | 18 | 259 | 10.51 | 1729 | 7 | 5 | 1.40 |
| ctrl | 30 | 2 | 25 | 1.20 | 28 | 2 | 2 | 1.00 |
| cavlc | 136 | 4 | 46 | 2.96 | 143 | 4 | 3 | 1.33 |
| dec | 272 | 2 | 264 | 1.03 | 272 | 2 | 2 | 1.00 |
| i2c | 306 | 3 | 173 | 1.77 | 282 | 4 | 3 | 1.33 |
| int2float | 51 | 3 | 17 | 3.00 | 50 | 3 | 2 | 1.50 |
| mem_ctrl | not mapped | – | 1669 | – | not mapped | – | 5 | – |
| priority | 184 | 26 | 86 | 2.14 | 183 | 12 | 4 | 3.00 |
| router | 46 | 5 | 18 | 2.56 | 44 | 5 | 3 | 1.67 |
| voter | 1625 | 12 | 1145 | 1.42 | 1839 | 12 | 11 | 1.09 |

Measured by `node research/epfl-records/measure.mjs` (research/epfl-records/results.json), by hand when the
synthesis changes.

## How it is measured

`node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>` writes a Silinx
project per design; `node test/designs-corpus/compare-ise.mjs <dir>` builds each with both flows (ISE
from its Docker image, both flows on the same machine) and writes `test/designs-corpus/ise-comparison.json`
and this page. It runs every week on a self-hosted runner with ISE (`.github/workflows/quality.yml`),
which pushes the new results to the branch `quality-results` (merged into main by a maintainer), and
by hand (Actions ▸ Quality ▸ Run workflow). The corpus's nightly
run checks the Silinx toolchain on every design without ISE.

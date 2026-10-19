# Quality of the Silinx toolchain against Xilinx ISE

How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx's
pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are
the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,
crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),
with the same top (a design with more ports than the package has pins goes through the same I/O
wrapper in both).

Measured 2026-10-19 (Silinx 15.11.1, ISE 14.7), with
`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as
tightly as it can (`-c 1`, as Silinx's packer always does) and the clock constraint is tightened to
5 ns, so that its place and route works for speed (ISE stops improving once a constraint
is met; the Silinx toolchain always places and routes for speed).

Silinx is built at its two Optimization Efforts (Process Properties of *Synthesize*): **Normal**, the
default (one mapping, the faster synthesis; since 15.11.1 also the mappings for speed of a deep design and of wide multiplexers), and **High**
(the mappings for speed for every design, the faster circuit); ISE at its default. *Silinx* in the tables is Normal,
*High* the other.

## Summary

- **Size:** 45 designs built by both. Logic LUTs: Silinx −18% against ISE; flip-flops
  −5%; slices −16% (geometric means of the ratios; below 0: Silinx is smaller). Silinx
  needs as few LUTs or fewer on 26 of 45.
- **Speed:** 40 designs timed by both. Critical path: Silinx +7% against ISE
  (above 0: Silinx is slower); Silinx is as fast or faster on 8 of 40. Both critical
  paths are measured by ISE's timing analyser (trce) on the routed design.
- **At Optimization Effort High:** logic LUTs −19%, slices −18% against ISE (45 designs);
  critical path +2%, as fast or faster on 16 of 40.
- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read 15 of the designs (`$clog2`, VHDL-2008
  and other constructs it predates, listed below); Silinx reads them.
- The Silinx toolchain is experimental: these numbers are tracked to improve it (the GitHub
  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).

## Size

4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices
after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the
ratio of logic LUTs (below 1: Silinx is smaller).

| design | LUTs Silinx | LUTs High | LUTs ISE | S / I | H / I | FFs Silinx | FFs ISE | slices Silinx | slices High | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 171 | 171 | 696 | 0.25 | 0.25 | 386 | 386 | 194 | 194 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 1201 | 1201 | 939 | 1.28 | 1.28 | 264 | 269 | 601 | 601 | 534 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 286 | 286 | 222 | 1.29 | 1.29 | 0 | – | 143 | 143 | 111 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 50 | 43 | 48 | 1.04 | 0.90 | 0 | – | 25 | 25 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 373 | 1.00 | 1.00 | 265 | 265 | 187 | 187 | 190 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 471 | 493 | 589 | 0.80 | 0.84 | 276 | 270 | 236 | 247 | 355 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 82 | 82 | 64 | 1.28 | 1.28 | 0 | – | 41 | 41 | 32 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-log2 | 10682 | 10682 | 9911 | 1.08 | 1.08 | 0 | – | 5341 | 5341 | 4959 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1258 | 1258 | 1386 | 0.91 | 0.91 | 643 | 643 | 722 | 722 | 927 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-multiplier | 7574 | 7574 | 12245 | 0.62 | 0.62 | 257 | 278 | 3787 | 3787 | 6162 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 214 | 214 | 417 | 0.51 | 0.51 | 137 | 137 | 115 | 115 | 257 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 63 | 47 | 125 | 0.50 | 0.38 | 64 | 64 | 32 | 36 | 87 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-sin | 2001 | 2001 | 1855 | 1.08 | 1.08 | 0 | – | 1001 | 1001 | 928 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-voter | 2325 | 2325 | 4170 | 0.56 | 0.56 | 1003 | 1003 | 1163 | 1163 | 2526 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 710 | 642 | – | – | – | 224 | – | 433 | 423 | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 486 | 486 | 699 | 0.70 | 0.70 | 389 | 389 | 341 | 341 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 404 | 385 | 539 | 0.75 | 0.71 | 404 | 406 | 241 | 231 | 397 | 0 / 0 | 0 / 0 | 4 / 4 |
| itc99-b01 | 13 | 9 | 12 | 1.08 | 0.75 | 5 | 10 | 7 | 5 | 6 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b02 | 4 | 4 | 4 | 1.00 | 1.00 | 4 | 4 | 2 | 2 | 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b03 | 28 | 29 | 78 | 0.36 | 0.37 | 30 | 35 | 16 | 15 | 45 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b04 | 139 | 139 | – | – | – | 66 | – | 127 | 127 | – | 0 / – | 0 / – | 0 / – |
| itc99-b05 | 294 | 294 | 241 | 1.22 | 1.22 | 34 | 43 | 258 | 258 | 123 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b06 | 10 | 10 | 9 | 1.11 | 1.11 | 8 | 8 | 5 | 5 | 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b07 | 79 | 78 | – | – | – | 43 | – | 51 | 56 | – | 0 / – | 0 / – | 0 / – |
| itc99-b08 | 34 | 29 | 37 | 0.92 | 0.78 | 21 | 21 | 17 | 17 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b09 | 42 | 40 | 47 | 0.89 | 0.85 | 28 | 28 | 21 | 20 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b10 | 50 | 45 | 53 | 0.94 | 0.85 | 17 | 24 | 25 | 26 | 29 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b11 | 123 | 123 | – | – | – | 31 | – | 97 | 97 | – | 0 / – | 0 / – | 0 / – |
| itc99-b12 | 315 | 315 | 362 | 0.87 | 0.87 | 119 | 141 | 168 | 168 | 214 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b13 | 68 | 69 | – | – | – | 53 | – | 41 | 44 | – | 0 / – | 0 / – | 0 / – |
| itc99-b14 | 1137 | 1137 | – | – | – | 334 | – | 749 | 749 | – | 0 / – | 0 / – | 2 / – |
| itc99-b15 | 1986 | 2157 | – | – | – | 528 | – | 1297 | 1379 | – | 0 / – | 0 / – | 0 / – |
| itc99-b17 | 6400 | 6400 | – | – | – | 1464 | – | 4128 | 4128 | – | 0 / – | 0 / – | 0 / – |
| itc99-b20 | 2234 | 2234 | – | – | – | 492 | – | 1452 | 1452 | – | 0 / – | 0 / – | 2 / – |
| itc99-b21 | 2341 | 2341 | – | – | – | 492 | – | 1529 | 1529 | – | 0 / – | 0 / – | 2 / – |
| itc99-b22 | 3265 | 3265 | – | – | – | 706 | – | 2023 | 2023 | – | 0 / – | 0 / – | 2 / – |
| iwls05-i2c | 251 | 259 | 225 | 1.12 | 1.15 | 129 | 127 | 195 | 140 | 121 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-sasc | 89 | 104 | 46 | 1.93 | 2.26 | 118 | 54 | 73 | 73 | 47 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-simple-spi | 149 | 157 | 124 | 1.20 | 1.27 | 131 | 67 | 103 | 109 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-spi | 745 | 745 | 717 | 1.04 | 1.04 | 229 | 229 | 397 | 397 | 430 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-ss-pcm | 33 | 33 | 35 | 0.94 | 0.94 | 79 | 78 | 68 | 42 | 44 | 1 / 2 | 0 / 0 | 0 / 0 |
| iwls05-usb-phy | 103 | 107 | 88 | 1.17 | 1.22 | 106 | 100 | 72 | 67 | 71 | 1 / 0 | 0 / 0 | 0 / 0 |
| light8080 | 313 | 313 | 855 | 0.37 | 0.37 | 206 | 237 | 192 | 192 | 482 | 0 / 0 | 2 / 1 | 0 / 0 |
| nandland-spi-verilog | 44 | 44 | – | – | – | 37 | – | 51 | 33 | – | 0 / – | 0 / – | 0 / – |
| nandland-spi-vhdl | 42 | 44 | – | – | – | 37 | – | 50 | 33 | – | 0 / – | 0 / – | 0 / – |
| neorv32 | 2900 | 2900 | – | – | – | 1319 | – | 2158 | 2158 | – | 0 / – | 6 / – | 0 / – |
| picorv32 | 1264 | 1264 | – | – | – | 767 | – | 752 | 752 | – | 0 / – | 2 / – | 0 / – |
| secworks-aes | 8679 | 8679 | – | – | – | 2996 | – | 5584 | 5584 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha1 | 2064 | 2031 | – | – | – | 1537 | – | 1466 | 1091 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha256 | 2819 | 2984 | – | – | – | 1809 | – | 1936 | 1498 | – | 0 / – | 0 / – | 0 / – |
| secworks-siphash | 1228 | 1268 | 1180 | 1.04 | 1.07 | 798 | 798 | 913 | 707 | 727 | 0 / 0 | 0 / 0 | 0 / 0 |
| serv | 309 | 314 | – | – | – | 355 | – | 193 | 209 | – | 1 / – | 1 / – | 0 / – |
| spi-fpga-master | 26 | 26 | 29 | 0.90 | 0.90 | 21 | 21 | 18 | 18 | 17 | 0 / 0 | 0 / 0 | 0 / 0 |
| spi-fpga-slave | 21 | 21 | 50 | 0.42 | 0.42 | 21 | 20 | 14 | 14 | 29 | 0 / 2 | 0 / 0 | 0 / 0 |
| t80 | 2153 | 2153 | 1874 | 1.15 | 1.15 | 361 | 247 | 1296 | 1296 | 1000 | 0 / 0 | 0 / 0 | 0 / 0 |
| uart-for-fpga | 58 | 56 | 52 | 1.12 | 1.08 | 53 | 52 | 41 | 42 | 38 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-axis-fifo | 16 | 16 | – | – | – | 32 | – | 19 | 19 | – | 0 / – | 1 / – | 0 / – |
| verilog-i2c-master | 193 | 193 | 266 | 0.73 | 0.73 | 72 | 91 | 115 | 115 | 145 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-lfsr-crc | 100 | 99 | – | – | – | 64 | – | 53 | 50 | – | 0 / – | 0 / – | 0 / – |
| verilog-lfsr-prbs | 16 | 16 | – | – | – | 31 | – | 16 | 16 | – | 0 / – | 0 / – | 0 / – |
| verilog-uart | 129 | 148 | 160 | 0.81 | 0.93 | 79 | 79 | 120 | 125 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-ch-intrinsics | 141 | 141 | 154 | 0.92 | 0.92 | 509 | 425 | 265 | 265 | 273 | 0 / 1 | 0 / 0 | 0 / 0 |
| vtr-diffeq1 | 410 | 408 | 346 | 1.18 | 1.18 | 451 | 451 | 262 | 261 | 321 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-diffeq2 | 309 | 309 | 312 | 0.99 | 0.99 | 258 | 258 | 160 | 160 | 208 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-mkPktMerge | 256 | 256 | 4018 | 0.06 | 0.06 | 962 | 8153 | 730 | 730 | 5812 | 0 / 153 | 0 / 0 | 0 / 0 |
| vtr-sha | 1583 | 1583 | 2255 | 0.70 | 0.70 | 893 | 900 | 816 | 816 | 1149 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-stereovision3 | 127 | 127 | 109 | 1.17 | 1.17 | 121 | 101 | 99 | 99 | 92 | 0 / 4 | 0 / 0 | 0 / 0 |

## Speed

The critical path of the routed design (the minimum clock period, or the longest path of a
design without a clock; ns, shorter is faster), both by ISE's trce. *Silinx estimate*: Silinx's own
timing analysis (what its Design Summary shows).

| design | Silinx (trce) | High (trce) | ISE (trce) | S / I | H / I | Silinx estimate | High estimate |
|---|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 14.12 | 14.12 | 12.25 | 1.15 | 1.15 | 14.07 | 14.07 |
| epfl-bar | 10.86 | 10.86 | 9.08 | 1.20 | 1.20 | 10.73 | 10.73 |
| epfl-dec | 6.32 | 6.32 | 6.12 | 1.03 | 1.03 | 6.24 | 6.24 |
| epfl-i2c | 7.64 | 6.67 | 6.81 | 1.12 | 0.98 | 7.67 | 6.78 |
| epfl-max | 28.50 | 28.50 | 25.68 | 1.11 | 1.11 | 29.12 | 29.12 |
| epfl-multiplier | 105.47 | 105.47 | 66.76 | 1.58 | 1.58 | 109.08 | 109.08 |
| epfl-priority | 10.58 | 10.58 | 20.83 | 0.51 | 0.51 | 10.82 | 10.82 |
| epfl-router | 10.09 | 7.32 | 9.36 | 1.08 | 0.78 | 10.32 | 7.47 |
| epfl-voter | 23.16 | 23.16 | 29.59 | 0.78 | 0.78 | 23.52 | 23.52 |
| femtorv32-quark | 18.72 | 18.36 | – | – | – | 19.61 | 18.12 |
| fpu-adder | 11.69 | 11.69 | 12.07 | 0.97 | 0.97 | 11.79 | 11.79 |
| fpu-multiplier | 15.10 | 15.52 | 14.61 | 1.03 | 1.06 | 15.19 | 15.59 |
| itc99-b01 | 3.23 | 2.74 | 3.80 | 0.85 | 0.72 | 3.17 | 2.54 |
| itc99-b02 | 2.29 | 2.29 | 3.19 | 0.72 | 0.72 | 2.16 | 2.16 |
| itc99-b03 | 5.71 | 5.22 | 5.29 | 1.08 | 0.99 | 5.81 | 5.24 |
| itc99-b04 | 15.77 | 15.77 | – | – | – | 16.27 | 16.27 |
| itc99-b05 | 11.55 | 11.55 | 9.82 | 1.18 | 1.18 | 11.02 | 11.02 |
| itc99-b06 | 3.44 | 3.44 | 3.19 | 1.08 | 1.08 | 3.08 | 3.08 |
| itc99-b07 | 6.15 | 5.59 | – | – | – | 6.09 | 5.56 |
| itc99-b08 | 6.77 | 6.40 | 5.87 | 1.15 | 1.09 | 6.64 | 6.26 |
| itc99-b09 | 6.57 | 5.14 | 5.90 | 1.11 | 0.87 | 6.84 | 5.39 |
| itc99-b10 | 6.06 | 5.78 | 4.90 | 1.24 | 1.18 | 5.97 | 5.53 |
| itc99-b11 | 9.77 | 9.77 | – | – | – | 9.55 | 9.55 |
| itc99-b12 | 9.44 | 9.44 | 7.79 | 1.21 | 1.21 | 10.01 | 10.01 |
| itc99-b13 | 7.98 | 7.75 | – | – | – | 8.35 | 8.16 |
| itc99-b14 | 33.79 | 33.79 | – | – | – | 34.27 | 34.27 |
| itc99-b15 | 20.38 | 20.60 | – | – | – | 21.04 | 21.40 |
| itc99-b17 | 23.54 | 23.54 | – | – | – | 24.16 | 24.16 |
| itc99-b20 | 35.31 | 35.31 | – | – | – | 35.77 | 35.77 |
| itc99-b21 | 34.24 | 34.24 | – | – | – | 34.52 | 34.52 |
| itc99-b22 | 35.84 | 35.84 | – | – | – | 36.43 | 36.43 |
| iwls05-i2c | 9.29 | 8.75 | 5.91 | 1.57 | 1.48 | 9.54 | 8.91 |
| iwls05-sasc | 6.24 | 5.04 | 4.85 | 1.29 | 1.04 | 6.16 | 5.04 |
| iwls05-simple-spi | 6.74 | 6.21 | 6.22 | 1.08 | 1.00 | 6.72 | 6.22 |
| iwls05-spi | 17.57 | 17.57 | 13.04 | 1.35 | 1.35 | 17.32 | 17.32 |
| iwls05-ss-pcm | 5.26 | 4.66 | 4.83 | 1.09 | 0.97 | 5.30 | 4.85 |
| iwls05-usb-phy | 5.47 | 5.65 | 4.99 | 1.10 | 1.13 | 5.59 | 5.67 |
| light8080 | 12.63 | 12.63 | 15.13 | 0.83 | 0.83 | 12.44 | 12.44 |
| nandland-spi-verilog | 5.30 | 5.32 | – | – | – | 5.34 | 5.31 |
| nandland-spi-vhdl | 5.32 | 6.08 | – | – | – | 5.52 | 6.16 |
| neorv32 | 15.50 | 15.50 | – | – | – | 15.61 | 15.61 |
| picorv32 | 12.18 | 12.18 | – | – | – | 12.32 | 12.32 |
| secworks-aes | 27.98 | 27.98 | – | – | – | 28.39 | 28.39 |
| secworks-sha1 | 17.06 | 16.84 | – | – | – | 17.36 | 17.17 |
| secworks-sha256 | 24.82 | 25.20 | – | – | – | 25.11 | 25.55 |
| secworks-siphash | 15.03 | 14.74 | 13.98 | 1.08 | 1.05 | 14.90 | 14.80 |
| serv | 13.38 | 14.30 | – | – | – | 13.73 | 14.23 |
| spi-fpga-master | 5.07 | 5.07 | 4.99 | 1.02 | 1.02 | 5.03 | 5.03 |
| spi-fpga-slave | 5.86 | 5.86 | 4.94 | 1.19 | 1.19 | 6.00 | 6.00 |
| t80 | 22.43 | 22.43 | 18.13 | 1.24 | 1.24 | 23.00 | 23.00 |
| uart-for-fpga | 5.53 | 4.47 | 4.69 | 1.18 | 0.95 | 5.61 | 4.38 |
| verilog-axis-fifo | 6.46 | 5.49 | – | – | – | 6.07 | 5.27 |
| verilog-i2c-master | 10.13 | 10.13 | 9.88 | 1.03 | 1.03 | 10.27 | 10.27 |
| verilog-lfsr-crc | 3.96 | 3.87 | – | – | – | 3.94 | 3.98 |
| verilog-lfsr-prbs | 2.36 | 2.36 | – | – | – | 2.33 | 2.33 |
| verilog-uart | 11.70 | 9.07 | 9.24 | 1.27 | 0.98 | 11.44 | 9.24 |
| vtr-ch-intrinsics | 6.43 | 6.43 | 5.06 | 1.27 | 1.27 | 6.22 | 6.22 |
| vtr-diffeq1 | 36.07 | 37.71 | 35.80 | 1.01 | 1.05 | 40.07 | 41.36 |
| vtr-diffeq2 | 27.64 | 27.64 | 26.74 | 1.03 | 1.03 | 29.27 | 29.27 |
| vtr-mkPktMerge | 7.89 | 7.89 | 9.27 | 0.85 | 0.85 | 7.64 | 7.64 |
| vtr-sha | 15.51 | 15.51 | 19.92 | 0.78 | 0.78 | 15.28 | 15.28 |
| vtr-stereovision3 | 5.58 | 5.58 | 4.92 | 1.13 | 1.13 | 8.22 | 8.22 |

## Not built by one of the flows

- femtorv32-quark: XST cannot read it (`ERROR:HDLCompilers:28 - "src/src/femtorv32_quark.v" line 63 'instr' has not been declared`); Silinx reads it.
- itc99-b04, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "data_in<8>" LOC = "C7" ;>`
- itc99-b07, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "punti_retta<8>" LOC = "B6" ;>`
- itc99-b11, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "x_in<6>" LOC = "D6" ;>`
- itc99-b13, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "canale<4>" LOC = "A7" ;>`
- itc99-b14: XST cannot read it (`ERROR:Xst:2587 - Port <addr> of instance <dut> has different type in definition <b14>.`); Silinx reads it.
- itc99-b15: XST cannot read it (`ERROR:Xst:2587 - Port <address> of instance <dut> has different type in definition <b15>.`); Silinx reads it.
- itc99-b17: XST cannot read it (`ERROR:Xst:2587 - Port <address1> of instance <dut> has different type in definition <b17>.`); Silinx reads it.
- itc99-b20, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "so<20>" LOC = "P17" ;>`
- itc99-b21, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "so<20>" LOC = "P17" ;>`
- itc99-b22, ISE: `ERROR:ConstraintSystem:59 - Constraint <NET "so<20>" LOC = "P17" ;>`
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

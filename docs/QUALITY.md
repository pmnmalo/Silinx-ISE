# Quality of the Silinx toolchain against Xilinx ISE

How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, Silinx's
pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are
the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,
crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),
with the same top (a design with more ports than the package has pins goes through the same I/O
wrapper in both).

Measured 2026-10-25 (Silinx 15.13.0, ISE 14.7), with
`test/designs-corpus/compare-ise.mjs`. ISE is given its best chance: its map packs the slices as
tightly as it can (`-c 1`, as Silinx's packer always does) and the clock constraint is tightened to
5 ns, so that its place and route works for speed (ISE stops improving once a constraint
is met; the Silinx toolchain always places and routes for speed).

Silinx is built at its two Optimization Efforts (Process Properties of *Synthesize*): **Normal**, the
default (one mapping, the faster synthesis; since 15.11.1 also the mappings for speed of a deep design and of wide multiplexers, and the one with the wider functions), and **High**
(the mappings for speed for every design, the faster circuit); ISE at its default. *Silinx* in the tables is Normal,
*High* the other.

## Summary

- **Size:** 45 designs built by both. Logic LUTs: Silinx −20% against ISE; flip-flops
  −7%; slices −20% (geometric means of the ratios; below 0: Silinx is smaller). Silinx
  needs as few LUTs or fewer on 32 of 45.
- **Speed:** 40 designs timed by both. Critical path: Silinx −7% against ISE
  (above 0: Silinx is slower); Silinx is as fast or faster on 26 of 40. Both critical
  paths are measured by ISE's timing analyser (trce) on the routed design.
- **At Optimization Effort High:** logic LUTs −22%, slices −22% against ISE (45 designs);
  critical path −9%, as fast or faster on 28 of 40.
- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read 15 of the designs (`$clog2`, VHDL-2008
  and other constructs it predates, listed below); Silinx reads them.
- These numbers are tracked to improve the Silinx toolchain (the GitHub
  [issues](https://github.com/pmnmalo/Silinx-ISE/issues) labelled *synthesis* and *place & route*).

## Size

4-input LUTs used as logic (not the LUTs a route passes through), flip-flops and occupied slices
after packing / map; SRL16 shift registers, block RAMs and multipliers. *S / I*: Silinx / ISE, the
ratio of logic LUTs (below 1: Silinx is smaller).

| design | LUTs Silinx | LUTs High | LUTs ISE | S / I | H / I | FFs Silinx | FFs ISE | slices Silinx | slices High | slices ISE | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 171 | 171 | 696 | 0.25 | 0.25 | 386 | 386 | 194 | 194 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 941 | 941 | 939 | 1.00 | 1.00 | 280 | 269 | 471 | 471 | 534 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 285 | 285 | 222 | 1.28 | 1.28 | 0 | – | 143 | 143 | 111 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 44 | 43 | 48 | 0.92 | 0.90 | 0 | – | 26 | 25 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 373 | 1.00 | 1.00 | 265 | 265 | 187 | 187 | 190 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 462 | 489 | 589 | 0.78 | 0.83 | 276 | 270 | 231 | 249 | 355 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 82 | 82 | 64 | 1.28 | 1.28 | 0 | – | 41 | 41 | 32 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-log2 | 10682 | 10682 | 9911 | 1.08 | 1.08 | 0 | – | 5341 | 5341 | 4959 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1344 | 1344 | 1386 | 0.97 | 0.97 | 643 | 643 | 672 | 672 | 927 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-multiplier | 8719 | 8719 | 12245 | 0.71 | 0.71 | 257 | 278 | 4360 | 4360 | 6162 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 214 | 214 | 417 | 0.51 | 0.51 | 137 | 137 | 117 | 117 | 257 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 75 | 55 | 125 | 0.60 | 0.44 | 64 | 64 | 38 | 34 | 87 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-sin | 2001 | 2001 | 1855 | 1.08 | 1.08 | 0 | – | 1001 | 1001 | 928 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-voter | 2353 | 2323 | 4170 | 0.56 | 0.56 | 1003 | 1003 | 1177 | 1162 | 2526 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 751 | 675 | – | – | – | 224 | – | 432 | 394 | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 488 | 488 | 699 | 0.70 | 0.70 | 389 | 389 | 339 | 339 | 446 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 404 | 384 | 539 | 0.75 | 0.71 | 404 | 406 | 241 | 231 | 397 | 0 / 0 | 0 / 0 | 4 / 4 |
| itc99-b01 | 9 | 9 | 12 | 0.75 | 0.75 | 5 | 10 | 5 | 5 | 6 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b02 | 4 | 4 | 4 | 1.00 | 1.00 | 4 | 4 | 2 | 2 | 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b03 | 28 | 29 | 78 | 0.36 | 0.37 | 30 | 35 | 16 | 15 | 45 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b04 | 139 | 139 | – | – | – | 66 | – | 99 | 99 | – | 0 / – | 0 / – | 0 / – |
| itc99-b05 | 295 | 282 | 241 | 1.22 | 1.17 | 34 | 43 | 246 | 255 | 123 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b06 | 10 | 10 | 9 | 1.11 | 1.11 | 8 | 8 | 5 | 5 | 5 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b07 | 77 | 78 | – | – | – | 43 | – | 50 | 56 | – | 0 / – | 0 / – | 0 / – |
| itc99-b08 | 34 | 29 | 37 | 0.92 | 0.78 | 21 | 21 | 18 | 17 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b09 | 44 | 41 | 47 | 0.94 | 0.87 | 28 | 28 | 22 | 21 | 24 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b10 | 49 | 38 | 53 | 0.92 | 0.72 | 17 | 24 | 25 | 21 | 29 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b11 | 124 | 119 | – | – | – | 31 | – | 97 | 100 | – | 0 / – | 0 / – | 0 / – |
| itc99-b12 | 335 | 335 | 362 | 0.93 | 0.93 | 119 | 141 | 178 | 178 | 214 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b13 | 68 | 70 | – | – | – | 53 | – | 42 | 42 | – | 0 / – | 0 / – | 0 / – |
| itc99-b14 | 1059 | 987 | – | – | – | 334 | – | 664 | 657 | – | 0 / – | 0 / – | 2 / – |
| itc99-b15 | 1854 | 1879 | – | – | – | 536 | – | 1231 | 1239 | – | 0 / – | 0 / – | 0 / – |
| itc99-b17 | 5925 | 5792 | – | – | – | 1488 | – | 3882 | 3804 | – | 0 / – | 0 / – | 0 / – |
| itc99-b20 | 2185 | 2185 | – | – | – | 492 | – | 1335 | 1335 | – | 0 / – | 0 / – | 2 / – |
| itc99-b21 | 2207 | 2207 | – | – | – | 492 | – | 1365 | 1363 | – | 0 / – | 0 / – | 2 / – |
| itc99-b22 | 3326 | 3326 | – | – | – | 706 | – | 2030 | 2030 | – | 0 / – | 0 / – | 2 / – |
| iwls05-i2c | 211 | 205 | 225 | 0.94 | 0.91 | 130 | 127 | 116 | 123 | 121 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-sasc | 95 | 52 | 46 | 2.07 | 1.13 | 118 | 54 | 65 | 49 | 47 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-simple-spi | 110 | 108 | 124 | 0.89 | 0.87 | 67 | 67 | 79 | 79 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-spi | 672 | 672 | 717 | 0.94 | 0.94 | 229 | 229 | 355 | 355 | 430 | 0 / 0 | 0 / 0 | 0 / 0 |
| iwls05-ss-pcm | 33 | 33 | 35 | 0.94 | 0.94 | 79 | 78 | 42 | 42 | 44 | 1 / 2 | 0 / 0 | 0 / 0 |
| iwls05-usb-phy | 104 | 104 | 88 | 1.18 | 1.18 | 106 | 100 | 64 | 64 | 71 | 1 / 0 | 0 / 0 | 0 / 0 |
| light8080 | 307 | 307 | 855 | 0.36 | 0.36 | 206 | 237 | 189 | 189 | 482 | 0 / 0 | 2 / 1 | 0 / 0 |
| nandland-spi-verilog | 44 | 44 | – | – | – | 37 | – | 32 | 32 | – | 0 / – | 0 / – | 0 / – |
| nandland-spi-vhdl | 42 | 42 | – | – | – | 37 | – | 31 | 31 | – | 0 / – | 0 / – | 0 / – |
| neorv32 | 2900 | 2900 | – | – | – | 1327 | – | 1679 | 1679 | – | 0 / – | 6 / – | 0 / – |
| picorv32 | 1264 | 1264 | – | – | – | 767 | – | 706 | 706 | – | 0 / – | 2 / – | 0 / – |
| secworks-aes | 8679 | 8679 | – | – | – | 2996 | – | 4346 | 4346 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha1 | 2064 | 2032 | – | – | – | 1528 | – | 1041 | 1025 | – | 0 / – | 0 / – | 0 / – |
| secworks-sha256 | 2860 | 2860 | – | – | – | 1809 | – | 1436 | 1436 | – | 0 / – | 0 / – | 0 / – |
| secworks-siphash | 1228 | 1228 | 1180 | 1.04 | 1.04 | 798 | 798 | 686 | 686 | 727 | 0 / 0 | 0 / 0 | 0 / 0 |
| serv | 283 | 283 | – | – | – | 293 | – | 159 | 159 | – | 1 / – | 1 / – | 0 / – |
| spi-fpga-master | 27 | 27 | 29 | 0.93 | 0.93 | 21 | 21 | 19 | 19 | 17 | 0 / 0 | 0 / 0 | 0 / 0 |
| spi-fpga-slave | 23 | 23 | 50 | 0.46 | 0.46 | 21 | 20 | 14 | 14 | 29 | 0 / 2 | 0 / 0 | 0 / 0 |
| t80 | 1816 | 1720 | 1874 | 0.97 | 0.92 | 233 | 247 | 1009 | 961 | 1000 | 0 / 0 | 0 / 0 | 0 / 0 |
| uart-for-fpga | 58 | 54 | 52 | 1.12 | 1.04 | 53 | 52 | 42 | 41 | 38 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-axis-fifo | 16 | 16 | – | – | – | 32 | – | 19 | 19 | – | 0 / – | 1 / – | 0 / – |
| verilog-i2c-master | 190 | 196 | 266 | 0.71 | 0.74 | 72 | 91 | 114 | 114 | 145 | 0 / 0 | 0 / 0 | 0 / 0 |
| verilog-lfsr-crc | 100 | 99 | – | – | – | 64 | – | 53 | 50 | – | 0 / – | 0 / – | 0 / – |
| verilog-lfsr-prbs | 16 | 16 | – | – | – | 31 | – | 16 | 16 | – | 0 / – | 0 / – | 0 / – |
| verilog-uart | 137 | 149 | 160 | 0.86 | 0.93 | 79 | 79 | 133 | 125 | 84 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-ch-intrinsics | 142 | 142 | 154 | 0.92 | 0.92 | 509 | 425 | 266 | 266 | 273 | 0 / 1 | 0 / 0 | 0 / 0 |
| vtr-diffeq1 | 408 | 408 | 346 | 1.18 | 1.18 | 451 | 451 | 262 | 261 | 321 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-diffeq2 | 309 | 309 | 312 | 0.99 | 0.99 | 258 | 258 | 160 | 160 | 208 | 0 / 0 | 0 / 0 | 13 / 13 |
| vtr-mkPktMerge | 257 | 257 | 4018 | 0.06 | 0.06 | 962 | 8153 | 719 | 719 | 5812 | 0 / 153 | 0 / 0 | 0 / 0 |
| vtr-sha | 1583 | 1583 | 2255 | 0.70 | 0.70 | 893 | 900 | 801 | 801 | 1149 | 0 / 0 | 0 / 0 | 0 / 0 |
| vtr-stereovision3 | 119 | 119 | 109 | 1.09 | 1.09 | 120 | 101 | 76 | 76 | 92 | 0 / 4 | 0 / 0 | 0 / 0 |

## Speed

The critical path of the routed design (the minimum clock period, or the longest path of a
design without a clock; ns, shorter is faster), both by ISE's trce. *Silinx estimate*: Silinx's own
timing analysis (what its Design Summary shows).

| design | Silinx (trce) | High (trce) | ISE (trce) | S / I | H / I | Silinx estimate | High estimate |
|---|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 13.38 | 13.38 | 12.25 | 1.09 | 1.09 | 12.72 | 12.72 |
| epfl-bar | 8.72 | 8.61 | 9.08 | 0.96 | 0.95 | 8.66 | 8.54 |
| epfl-dec | 6.24 | 6.19 | 6.12 | 1.02 | 1.01 | 6.23 | 6.04 |
| epfl-i2c | 6.94 | 6.34 | 6.81 | 1.02 | 0.93 | 7.21 | 6.45 |
| epfl-max | 22.54 | 22.86 | 25.68 | 0.88 | 0.89 | 23.08 | 22.88 |
| epfl-multiplier | 61.68 | 60.90 | 66.76 | 0.92 | 0.91 | 63.89 | 63.10 |
| epfl-priority | 8.36 | 8.59 | 20.83 | 0.40 | 0.41 | 8.72 | 8.67 |
| epfl-router | 8.13 | 6.57 | 9.36 | 0.87 | 0.70 | 7.85 | 6.58 |
| epfl-voter | 25.42 | 23.75 | 29.59 | 0.86 | 0.80 | 26.40 | 24.14 |
| femtorv32-quark | 16.62 | 14.96 | – | – | – | 16.78 | 15.00 |
| fpu-adder | 9.58 | 9.54 | 12.07 | 0.79 | 0.79 | 9.52 | 9.26 |
| fpu-multiplier | 14.45 | 13.76 | 14.61 | 0.99 | 0.94 | 14.06 | 13.70 |
| itc99-b01 | 2.66 | 2.66 | 3.80 | 0.70 | 0.70 | 2.50 | 2.50 |
| itc99-b02 | 2.08 | 2.08 | 3.19 | 0.65 | 0.65 | 1.95 | 1.95 |
| itc99-b03 | 5.37 | 5.73 | 5.29 | 1.01 | 1.08 | 5.35 | 5.52 |
| itc99-b04 | 11.53 | 11.53 | – | – | – | 11.55 | 11.55 |
| itc99-b05 | 11.89 | 10.34 | 9.82 | 1.21 | 1.05 | 11.91 | 10.37 |
| itc99-b06 | 3.52 | 3.30 | 3.19 | 1.10 | 1.03 | 3.19 | 3.04 |
| itc99-b07 | 5.83 | 5.35 | – | – | – | 5.87 | 5.43 |
| itc99-b08 | 5.72 | 6.34 | 5.87 | 0.97 | 1.08 | 5.63 | 6.18 |
| itc99-b09 | 5.22 | 5.10 | 5.90 | 0.88 | 0.86 | 5.14 | 5.14 |
| itc99-b10 | 5.92 | 4.78 | 4.90 | 1.21 | 0.98 | 5.89 | 4.62 |
| itc99-b11 | 8.21 | 8.55 | – | – | – | 8.47 | 8.31 |
| itc99-b12 | 8.92 | 8.60 | 7.79 | 1.14 | 1.10 | 8.86 | 8.76 |
| itc99-b13 | 6.98 | 5.72 | – | – | – | 6.88 | 5.39 |
| itc99-b14 | 34.11 | 31.91 | – | – | – | 34.12 | 31.51 |
| itc99-b15 | 18.92 | 18.24 | – | – | – | 18.84 | 18.32 |
| itc99-b17 | 20.01 | 20.07 | – | – | – | 19.94 | 20.28 |
| itc99-b20 | 32.94 | 32.94 | – | – | – | 33.26 | 33.26 |
| itc99-b21 | 33.18 | 32.46 | – | – | – | 33.49 | 33.00 |
| itc99-b22 | 36.22 | 33.96 | – | – | – | 36.31 | 34.93 |
| iwls05-i2c | 5.83 | 5.87 | 5.91 | 0.99 | 0.99 | 5.75 | 6.21 |
| iwls05-sasc | 5.30 | 4.41 | 4.85 | 1.09 | 0.91 | 4.86 | 4.20 |
| iwls05-simple-spi | 6.08 | 5.88 | 6.22 | 0.98 | 0.94 | 6.04 | 6.08 |
| iwls05-spi | 13.32 | 13.32 | 13.04 | 1.02 | 1.02 | 13.10 | 13.10 |
| iwls05-ss-pcm | 4.73 | 4.73 | 4.83 | 0.98 | 0.98 | 4.78 | 4.78 |
| iwls05-usb-phy | 4.62 | 4.44 | 4.99 | 0.93 | 0.89 | 4.65 | 4.55 |
| light8080 | 11.47 | 11.47 | 15.13 | 0.76 | 0.76 | 11.62 | 11.62 |
| nandland-spi-verilog | 5.51 | 5.40 | – | – | – | 5.38 | 5.25 |
| nandland-spi-vhdl | 5.37 | 5.37 | – | – | – | 5.27 | 5.27 |
| neorv32 | 15.07 | 15.07 | – | – | – | 14.82 | 14.82 |
| picorv32 | 11.67 | 10.83 | – | – | – | 11.43 | 10.82 |
| secworks-aes | 25.55 | 25.55 | – | – | – | 25.50 | 25.50 |
| secworks-sha1 | 16.07 | 15.65 | – | – | – | 16.25 | 15.81 |
| secworks-sha256 | 22.37 | 21.78 | – | – | – | 22.73 | 22.26 |
| secworks-siphash | 14.13 | 14.13 | 13.98 | 1.01 | 1.01 | 14.08 | 14.08 |
| serv | 10.23 | 10.23 | – | – | – | 10.43 | 10.43 |
| spi-fpga-master | 4.42 | 4.60 | 4.99 | 0.88 | 0.92 | 4.50 | 4.42 |
| spi-fpga-slave | 4.71 | 4.71 | 4.94 | 0.95 | 0.95 | 4.63 | 4.63 |
| t80 | 20.16 | 19.95 | 18.13 | 1.11 | 1.10 | 21.23 | 20.59 |
| uart-for-fpga | 4.48 | 4.61 | 4.69 | 0.96 | 0.98 | 4.50 | 4.55 |
| verilog-axis-fifo | 5.44 | 5.44 | – | – | – | 5.46 | 5.46 |
| verilog-i2c-master | 9.72 | 8.90 | 9.88 | 0.98 | 0.90 | 9.31 | 9.19 |
| verilog-lfsr-crc | 3.75 | 3.66 | – | – | – | 3.68 | 3.56 |
| verilog-lfsr-prbs | 2.16 | 2.16 | – | – | – | 2.08 | 2.08 |
| verilog-uart | 9.20 | 8.09 | 9.24 | 1.00 | 0.88 | 8.51 | 7.59 |
| vtr-ch-intrinsics | 5.79 | 5.73 | 5.06 | 1.15 | 1.13 | 5.89 | 5.84 |
| vtr-diffeq1 | 35.46 | 33.77 | 35.80 | 0.99 | 0.94 | 36.53 | 34.80 |
| vtr-diffeq2 | 25.60 | 25.60 | 26.74 | 0.96 | 0.96 | 25.75 | 25.75 |
| vtr-mkPktMerge | 6.47 | 6.71 | 9.27 | 0.70 | 0.72 | 6.40 | 6.38 |
| vtr-sha | 15.24 | 15.24 | 19.92 | 0.77 | 0.77 | 15.21 | 15.21 |
| vtr-stereovision3 | 5.06 | 5.06 | 4.92 | 1.03 | 1.03 | 6.73 | 6.73 |

### The critical paths: logic and routing

Each critical path above as trce details it: its levels of logic, its logic delay (the LUTs, the carry
chains, the flip-flops' clock to out and setup; *LUT*, *carry*: the LUTs' and the carry chains' share of it)
and its routing delay (ns). More levels or LUT delay than ISE's: the synthesis; more routing: the placement
and the routing.

- Silinx: 14 designs slower than ISE; against ISE's critical paths, on average, logic
  +0.56 ns, routing +0.18 ns.
- High: 12 designs slower than ISE; against ISE's critical paths, on average, logic
  +0.62 ns, routing −0.04 ns.

| design | levels Silinx | levels High | levels ISE | logic Silinx | logic High | logic ISE | LUT Silinx | LUT High | LUT ISE | carry Silinx | carry High | carry ISE | route Silinx | route High | route ISE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 64 | 64 | 8 | 10.59 | 10.59 | 6.75 | 0.00 | 0.00 | 6.09 | 9.69 | 9.69 | 0.00 | 2.80 | 2.80 | 5.32 |
| epfl-bar | 4 | 4 | 4 | 4.88 | 4.75 | 4.87 | 4.29 | 4.09 | 4.22 | 0.00 | 0.00 | 0.00 | 3.84 | 3.86 | 4.20 |
| epfl-dec | 4 | 4 | 4 | 3.65 | 3.65 | 3.65 | 3.06 | 3.06 | 3.06 | 0.00 | 0.00 | 0.00 | 2.59 | 2.47 | 2.43 |
| epfl-i2c | 5 | 4 | 4 | 4.58 | 3.60 | 4.48 | 3.93 | 2.95 | 2.98 | 0.00 | 0.00 | 0.00 | 2.36 | 2.66 | 2.33 |
| epfl-max | 14 | 14 | 17 | 11.14 | 10.91 | 13.79 | 10.48 | 10.32 | 13.20 | 0.00 | 0.00 | 0.00 | 11.33 | 11.96 | 11.89 |
| epfl-multiplier | 44 | 45 | 38 | 33.14 | 33.12 | 31.33 | 32.48 | 32.53 | 28.10 | 0.00 | 0.00 | 0.00 | 28.54 | 27.78 | 35.40 |
| epfl-priority | 6 | 5 | 18 | 5.94 | 4.45 | 14.67 | 5.29 | 2.87 | 13.17 | 0.00 | 0.00 | 0.00 | 2.41 | 4.06 | 6.15 |
| epfl-router | 6 | 5 | 6 | 5.11 | 4.79 | 6.34 | 4.52 | 4.13 | 4.78 | 0.00 | 0.00 | 0.00 | 3.02 | 1.77 | 3.01 |
| epfl-voter | 18 | 17 | 21 | 13.83 | 13.03 | 17.20 | 13.24 | 12.38 | 14.09 | 0.00 | 0.00 | 0.00 | 11.59 | 10.72 | 12.39 |
| femtorv32-quark | 20 | 14 | – | 11.73 | 10.18 | – | 5.04 | 3.63 | – | 3.33 | 2.79 | – | 4.81 | 4.67 | – |
| fpu-adder | 6 | 6 | 30 | 5.06 | 5.75 | 8.62 | 2.28 | 3.04 | 1.65 | 1.63 | 1.57 | 6.31 | 4.52 | 3.79 | 3.43 |
| fpu-multiplier | 10 | 15 | 16 | 10.32 | 10.91 | 11.15 | 0.00 | 0.00 | 0.00 | 4.86 | 5.39 | 5.62 | 4.10 | 2.84 | 3.46 |
| itc99-b01 | 1 | 1 | 3 | 1.88 | 1.88 | 2.90 | 1.28 | 1.28 | 2.25 | 0.00 | 0.00 | 0.00 | 0.79 | 0.79 | 0.91 |
| itc99-b02 | 1 | 1 | 1 | 1.43 | 1.43 | 1.48 | 0.84 | 0.84 | 0.89 | 0.00 | 0.00 | 0.00 | 0.65 | 0.65 | 0.65 |
| itc99-b03 | 2 | 3 | 4 | 2.62 | 3.43 | 3.70 | 1.41 | 2.22 | 3.11 | 0.00 | 0.00 | 0.00 | 2.74 | 2.30 | 1.58 |
| itc99-b04 | 12 | 12 | – | 9.19 | 9.19 | – | 2.75 | 2.75 | – | 5.85 | 5.85 | – | 2.34 | 2.34 | – |
| itc99-b05 | 9 | 6 | 8 | 8.70 | 6.78 | 6.82 | 4.33 | 3.58 | 4.21 | 2.04 | 2.04 | 1.96 | 3.19 | 3.56 | 2.99 |
| itc99-b06 | 1 | 1 | 1 | 1.91 | 1.85 | 1.43 | 0.76 | 0.70 | 0.84 | 0.00 | 0.00 | 0.00 | 1.61 | 1.44 | 1.48 |
| itc99-b07 | 3 | 3 | – | 3.37 | 3.75 | – | 2.22 | 2.55 | – | 0.00 | 0.00 | – | 2.45 | 1.58 | – |
| itc99-b08 | 4 | 3 | 5 | 3.65 | 4.35 | 4.41 | 3.06 | 3.20 | 3.82 | 0.00 | 0.00 | 0.00 | 2.06 | 1.99 | 1.47 |
| itc99-b09 | 3 | 3 | 5 | 3.43 | 3.31 | 4.46 | 2.22 | 2.17 | 3.87 | 0.00 | 0.00 | 0.00 | 1.79 | 1.79 | 1.44 |
| itc99-b10 | 3 | 2 | 3 | 3.37 | 2.88 | 2.89 | 2.22 | 1.73 | 2.30 | 0.00 | 0.00 | 0.00 | 2.55 | 1.89 | 2.01 |
| itc99-b11 | 6 | 7 | – | 5.46 | 6.38 | – | 3.76 | 0.76 | – | 0.00 | 4.16 | – | 2.75 | 2.17 | – |
| itc99-b12 | 6 | 6 | 5 | 4.95 | 5.17 | 4.86 | 4.36 | 4.58 | 4.27 | 0.00 | 0.00 | 0.00 | 3.98 | 3.36 | 2.94 |
| itc99-b13 | 5 | 4 | – | 4.72 | 3.74 | – | 2.22 | 1.65 | – | 1.36 | 1.44 | – | 2.25 | 1.98 | – |
| itc99-b14 | 25 | 28 | – | 20.43 | 19.16 | – | 12.74 | 8.62 | – | 3.81 | 5.83 | – | 13.61 | 12.75 | – |
| itc99-b15 | 15 | 25 | – | 12.00 | 13.12 | – | 9.48 | 5.15 | – | 1.38 | 3.87 | – | 6.92 | 5.04 | – |
| itc99-b17 | 26 | 17 | – | 12.90 | 12.53 | – | 6.74 | 8.26 | – | 3.83 | 3.68 | – | 7.08 | 7.53 | – |
| itc99-b20 | 35 | 35 | – | 21.54 | 21.54 | – | 12.41 | 12.41 | – | 5.23 | 5.23 | – | 11.40 | 11.40 | – |
| itc99-b21 | 37 | 36 | – | 21.70 | 21.17 | – | 12.57 | 11.81 | – | 5.23 | 5.39 | – | 11.49 | 11.30 | – |
| itc99-b22 | 37 | 36 | – | 21.46 | 21.92 | – | 12.13 | 13.11 | – | 5.49 | 6.55 | – | 14.75 | 12.04 | – |
| iwls05-i2c | 3 | 3 | 4 | 3.26 | 3.76 | 4.19 | 2.11 | 2.62 | 2.98 | 0.00 | 0.00 | 0.00 | 2.56 | 2.11 | 1.72 |
| iwls05-sasc | 2 | 3 | 2 | 2.62 | 3.51 | 3.09 | 1.41 | 0.89 | 1.41 | 0.00 | 2.03 | 0.00 | 2.68 | 0.90 | 1.75 |
| iwls05-simple-spi | 3 | 3 | 4 | 3.78 | 3.42 | 4.58 | 2.28 | 2.28 | 2.87 | 0.00 | 0.00 | 0.00 | 2.30 | 2.44 | 1.63 |
| iwls05-spi | 9 | 9 | 9 | 8.85 | 8.85 | 7.21 | 2.35 | 2.35 | 3.97 | 5.90 | 5.90 | 0.00 | 4.47 | 4.47 | 5.83 |
| iwls05-ss-pcm | 2 | 2 | 1 | 2.67 | 2.67 | 1.97 | 1.46 | 1.46 | 0.76 | 0.00 | 0.00 | 0.00 | 2.06 | 2.06 | 2.86 |
| iwls05-usb-phy | 3 | 3 | 2 | 2.83 | 2.95 | 3.23 | 2.25 | 2.30 | 1.46 | 0.00 | 0.00 | 0.00 | 1.78 | 1.49 | 1.74 |
| light8080 | 6 | 6 | 9 | 7.58 | 7.58 | 8.14 | 4.39 | 4.39 | 6.68 | 0.00 | 0.00 | 0.00 | 3.89 | 3.89 | 6.99 |
| nandland-spi-verilog | 4 | 4 | – | 4.21 | 4.27 | – | 1.60 | 1.65 | – | 2.03 | 2.03 | – | 1.29 | 1.13 | – |
| nandland-spi-vhdl | 4 | 4 | – | 4.20 | 4.20 | – | 1.60 | 1.60 | – | 2.01 | 2.01 | – | 1.16 | 1.16 | – |
| neorv32 | 10 | 10 | – | 8.14 | 8.14 | – | 2.93 | 2.93 | – | 1.85 | 1.85 | – | 6.85 | 6.85 | – |
| picorv32 | 12 | 13 | – | 7.30 | 7.60 | – | 3.58 | 3.69 | – | 2.23 | 2.41 | – | 4.35 | 3.24 | – |
| secworks-aes | 12 | 12 | – | 9.68 | 9.68 | – | 8.78 | 8.78 | – | 0.00 | 0.00 | – | 15.84 | 15.84 | – |
| secworks-sha1 | 15 | 10 | – | 9.25 | 8.56 | – | 6.04 | 6.09 | – | 2.62 | 1.87 | – | 6.72 | 7.09 | – |
| secworks-sha256 | 23 | 27 | – | 15.13 | 15.33 | – | 7.56 | 7.45 | – | 6.98 | 7.29 | – | 7.22 | 6.45 | – |
| secworks-siphash | 32 | 32 | 34 | 9.71 | 9.71 | 9.29 | 2.25 | 2.25 | 1.60 | 6.87 | 6.87 | 7.11 | 4.42 | 4.42 | 4.66 |
| serv | 6 | 6 | – | 7.33 | 7.33 | – | 4.52 | 4.52 | – | 0.00 | 0.00 | – | 2.81 | 2.81 | – |
| spi-fpga-master | 2 | 1 | 2 | 2.61 | 2.26 | 2.67 | 1.46 | 0.76 | 1.46 | 0.00 | 0.00 | 0.00 | 1.80 | 2.33 | 2.32 |
| spi-fpga-slave | 2 | 2 | 2 | 2.67 | 2.67 | 2.61 | 1.46 | 1.46 | 1.46 | 0.00 | 0.00 | 0.00 | 2.04 | 2.04 | 2.31 |
| t80 | 20 | 16 | 18 | 13.41 | 12.41 | 12.00 | 10.32 | 9.67 | 8.91 | 2.50 | 2.15 | 2.50 | 6.74 | 7.54 | 6.13 |
| uart-for-fpga | 2 | 2 | 2 | 2.73 | 2.61 | 3.02 | 1.52 | 1.46 | 1.52 | 0.00 | 0.00 | 0.00 | 1.74 | 1.98 | 1.67 |
| verilog-axis-fifo | 2 | 2 | – | 3.63 | 3.63 | – | 1.73 | 1.73 | – | 0.00 | 0.00 | – | 1.81 | 1.81 | – |
| verilog-i2c-master | 6 | 6 | 6 | 5.78 | 5.59 | 6.15 | 3.04 | 4.44 | 4.44 | 1.60 | 0.00 | 0.00 | 3.94 | 3.31 | 3.73 |
| verilog-lfsr-crc | 2 | 2 | – | 2.19 | 2.19 | – | 1.54 | 1.60 | – | 0.00 | 0.00 | – | 1.56 | 1.48 | – |
| verilog-lfsr-prbs | 1 | 1 | – | 1.54 | 1.54 | – | 0.89 | 0.89 | – | 0.00 | 0.00 | – | 0.62 | 0.62 | – |
| verilog-uart | 6 | 4 | 13 | 5.25 | 4.41 | 6.70 | 2.28 | 1.41 | 1.60 | 1.44 | 1.50 | 4.51 | 3.95 | 3.66 | 2.53 |
| vtr-ch-intrinsics | 1 | 4 | 4 | 1.91 | 3.65 | 3.59 | 0.76 | 3.06 | 3.00 | 0.00 | 0.00 | 0.00 | 3.89 | 2.08 | 1.47 |
| vtr-diffeq1 | 13 | 14 | 16 | 23.93 | 25.10 | 26.95 | 3.06 | 3.06 | 0.70 | 3.90 | 5.75 | 10.63 | 11.53 | 8.66 | 8.85 |
| vtr-diffeq2 | 14 | 14 | 9 | 16.60 | 16.60 | 17.80 | 2.88 | 2.88 | 0.00 | 2.33 | 2.33 | 5.93 | 9.00 | 9.00 | 8.94 |
| vtr-mkPktMerge | 4 | 5 | 4 | 3.59 | 4.89 | 3.65 | 3.00 | 2.11 | 3.06 | 0.00 | 1.63 | 0.00 | 2.88 | 1.82 | 5.62 |
| vtr-sha | 22 | 22 | 21 | 10.80 | 10.80 | 12.22 | 4.58 | 4.58 | 4.52 | 5.64 | 5.64 | 7.05 | 4.42 | 4.42 | 7.70 |
| vtr-stereovision3 | 3 | 3 | 2 | 3.43 | 3.43 | 2.66 | 2.22 | 2.22 | 1.52 | 0.00 | 0.00 | 0.00 | 1.63 | 1.63 | 2.25 |

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
Yosys / ABC mapping (packages/silinx-fpga/src/synth-open.js) map each benchmark to LUT-6: *area*, ABC's default LUT mapping, against
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

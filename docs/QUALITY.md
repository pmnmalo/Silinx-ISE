# Quality of the Silinx toolchain against Xilinx ISE

How small and how fast are the circuits the Silinx toolchain generates (Yosys synthesis, nextpnr's
pack, place and route), against Xilinx ISE 14.7 (XST, map, par) on the same designs? The designs are
the open-source ones of the [design corpus](../test/designs-corpus/README.md) (CPUs, peripherals,
crypto, benchmarks), each built by both flows for the same chip, the XC3S1200E-FG320 (Nexys2-1200),
with the same top (a design with more ports than the package has pins goes through the same I/O
wrapper in both).

Measured 2026-11-12 (Silinx 15.24.0, ISE 14.7), with
`test/designs-corpus/compare-ise.mjs`. Each design is built at each of Silinx's Optimizations (Process Properties
of *Synthesize*), and by ISE at the same goal:

- **Area** (the default of a new project: the smaller of the usual mapping's netlist and the mappings for speed, one placement), against ISE at XST's `-opt_mode Area -opt_level 2`;
- **Speed** (the mappings for speed for every design and several placements, the faster circuit), against ISE at XST's `-opt_mode Speed -opt_level 2`, ISE's *Timing Performance*;
- **Fast** (the usual mapping alone, one placement), against ISE at XST's `-opt_mode Speed -opt_level 1`, XST's default;

ISE's map and par are the same for every goal, its best chance: map packs the slices as tightly as it can
(`-c 1`, as nextpnr packs them) and the clock constraint is tightened to 5 ns, so that its place
and route works for speed (ISE stops improving once a constraint is met). nextpnr places and routes for speed
at every goal (timing-driven); at Speed it makes several placements (8, or 32 for a design of up to 100 slices),
each routed, and keeps the fastest by Silinx's own timing analysis (*Silinx estimate*); at Area and Fast, one.
The slices are nextpnr's after its packing and ISE map's; the LUTs, Silinx's synthesis' and ISE map's used as
logic. Both critical paths are measured by ISE's timing analyser (trce) on the routed design. The run times are
each flow's whole build (synthesis to bitstream) on its own machine, the Silinx toolchain's in WebAssembly: an
indication, not a benchmark.

## Summary

Geometric means of the ratios Silinx / ISE (below 0: Silinx is smaller, faster, quicker).

- **Partial:** 207 of the 402 builds are measured; the other 195 (under *Not measured yet*)
  are made by the next run of the comparison, which resumes this one.
- **Area:** 25 designs built by both. Logic LUTs −13%, flip-flops +9%, slices
  −16%; as few LUTs or fewer on 16 of 25. Critical path −20% (20 designs timed
  by both), as fast or faster on 15 of 20. Run time +37%.
- **Speed:** 25 designs built by both. Logic LUTs −19%, flip-flops −6%, slices
  −21%; as few LUTs or fewer on 17 of 25. Critical path −11% (20 designs timed
  by both), as fast or faster on 15 of 20. Run time +222%.
- **Fast:** 25 designs built by both. Logic LUTs −18%, flip-flops −8%, slices
  −21%; as few LUTs or fewer on 16 of 25. Critical path +4% (20 designs timed
  by both), as fast or faster on 7 of 20. Run time −29%.
- **Reading the design:** XST (ISE 14.7's synthesis, from 2013) cannot read 4 of the designs (`$clog2`, VHDL-2008
  and other constructs it predates, listed below); Silinx reads them.
- These numbers are tracked to improve the Silinx toolchain (the GitHub
  [issues](https://github.com/pmnmalo/Silinx/issues) labelled *synthesis* and *place & route*).

## Area: Silinx at Optimization Area against ISE at XST's `-opt_mode Area -opt_level 2`

### Size

| design | LUTs Silinx | LUTs ISE | LUTs S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | slices S / I | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 171 | 299 | 0.57 | 386 | 384 | 194 | 276 | 0.70 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 941 | 939 | 1.00 | 264 | 262 | 520 | 527 | 0.99 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 285 | 229 | 1.24 | 0 | – | 143 | 115 | 1.24 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 43 | 48 | 0.90 | 0 | – | 25 | 24 | 1.04 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 1.00 | 265 | 263 | 187 | 189 | 0.99 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 471 | 449 | 1.05 | 276 | 268 | 236 | 280 | 0.84 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 82 | 64 | 1.28 | 0 | – | 41 | 32 | 1.28 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-log2 | 10682 | 9911 | 1.08 | 0 | – | 5385 | 4959 | 1.09 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1088 | 989 | 1.10 | 643 | 641 | 544 | 677 | 0.80 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-multiplier | 6669 | 6709 | 0.99 | 257 | 255 | 3418 | 3397 | 1.01 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 174 | 380 | 0.46 | 137 | 135 | 87 | 236 | 0.37 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 63 | 89 | 0.71 | 64 | 62 | 32 | 66 | 0.48 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-sin | 2001 | 1855 | 1.08 | 0 | – | 1001 | 928 | 1.08 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-voter | 2323 | 3564 | 0.65 | 1003 | 1001 | 1162 | 2191 | 0.53 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 675 | – | – | 224 | – | 394 | – | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 481 | 699 | 0.69 | 389 | 387 | 331 | 445 | 0.74 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 379 | 540 | 0.70 | 404 | 402 | 227 | 397 | 0.57 | 0 / 0 | 0 / 0 | 4 / 4 |
| itc99-b01 | 9 | 12 | 0.75 | 5 | 8 | 5 | 6 | 0.83 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b02 | 4 | 4 | 1.00 | 4 | 3 | 2 | 2 | 1.00 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b03 | 29 | 66 | 0.44 | 30 | 31 | 15 | 36 | 0.42 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b04 | 139 | – | – | 66 | – | 101 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b05 | 272 | 231 | 1.18 | 34 | 36 | 194 | 117 | 1.66 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b06 | 10 | 9 | 1.11 | 8 | 3 | 5 | 5 | 1.00 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b07 | 79 | – | – | 43 | – | 57 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b08 | 29 | 31 | 0.94 | 21 | 9 | 19 | 17 | 1.12 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b09 | 41 | 47 | 0.87 | 28 | 28 | 21 | 24 | 0.88 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b10 | 38 | 51 | 0.75 | 24 | 20 | 22 | 26 | 0.85 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b11 | 120 | – | – | 31 | – | 88 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b12 | 315 | 344 | 0.92 | 119 | 141 | 168 | 205 | 0.82 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b13 | 68 | – | – | 53 | – | 41 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b14 | 987 | – | – | 334 | – | 657 | – | – | 0 / – | 0 / – | 2 / – |
| itc99-b15 | 1879 | – | – | 546 | – | 1233 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b17 | 5792 | – | – | 1516 | – | 3787 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b20 | 2139 | – | – | 492 | – | 1309 | – | – | 0 / – | 0 / – | 2 / – |
| itc99-b21 | 2114 | – | – | 492 | – | 1361 | – | – | 0 / – | 0 / – | 2 / – |

### Speed and run time

| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate | run time Silinx (s) | run time ISE (s) |
|---|---:|---:|---:|---:|---:|---:|
| epfl-adder | 14.64 | 113.30 | 0.13 | 14.34 | 243 | 62 |
| epfl-bar | 9.70 | 12.58 | 0.77 | 9.60 | 249 | 198 |
| epfl-dec | 6.48 | 7.39 | 0.88 | 6.53 | 49 | 61 |
| epfl-i2c | 7.62 | 8.43 | 0.90 | 7.94 | 173 | 73 |
| epfl-max | 68.66 | 117.47 | 0.58 | 71.46 | 751 | 89 |
| epfl-multiplier | 142.91 | 132.22 | 1.08 | 143.20 | 4765 | 980 |
| epfl-priority | 43.50 | 23.68 | 1.84 | 44.49 | 116 | 67 |
| epfl-router | 10.15 | 11.34 | 0.89 | 10.72 | 55 | 52 |
| epfl-voter | 27.04 | 32.46 | 0.83 | 27.74 | 993 | 567 |
| femtorv32-quark | 15.39 | – | – | 16.01 | 395 | – |
| fpu-adder | 10.68 | 12.36 | 0.86 | 11.14 | 209 | 158 |
| fpu-multiplier | 14.00 | 14.05 | 1.00 | 13.96 | 240 | 68 |
| itc99-b01 | 2.62 | 4.77 | 0.55 | 2.53 | 32 | 46 |
| itc99-b02 | 2.16 | 3.36 | 0.64 | 2.04 | 21 | 49 |
| itc99-b03 | 5.30 | 6.47 | 0.82 | 5.38 | 25 | 49 |
| itc99-b04 | 12.64 | – | – | 12.76 | 123 | – |
| itc99-b05 | 11.86 | 11.63 | 1.02 | 12.28 | 84 | 59 |
| itc99-b06 | 3.37 | 4.32 | 0.78 | 3.16 | 23 | 46 |
| itc99-b07 | 6.64 | – | – | 6.58 | 36 | – |
| itc99-b08 | 6.93 | 7.01 | 0.99 | 6.62 | 35 | 49 |
| itc99-b09 | 5.28 | 6.05 | 0.87 | 5.33 | 31 | 49 |
| itc99-b10 | 4.96 | 4.88 | 1.02 | 5.03 | 41 | 46 |
| itc99-b11 | 8.59 | – | – | 9.17 | 81 | – |
| itc99-b12 | 10.53 | 10.49 | 1.00 | 10.87 | 120 | 57 |
| itc99-b13 | 9.04 | – | – | 9.36 | 48 | – |
| itc99-b14 | 33.49 | – | – | 34.41 | 417 | – |
| itc99-b15 | 20.43 | – | – | 20.77 | 690 | – |
| itc99-b17 | 21.59 | – | – | 22.58 | 2066 | – |
| itc99-b20 | 39.97 | – | – | 40.10 | 1723 | – |
| itc99-b21 | 37.20 | – | – | 37.42 | 1748 | – |

### The critical paths: logic and routing

5 designs slower than ISE; against ISE's critical paths, on average, logic +2.48 ns, routing +3.67 ns.

| design | levels Silinx | levels ISE | logic Silinx | logic ISE | LUT Silinx | LUT ISE | carry Silinx | carry ISE | route Silinx | route ISE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 63 | 127 | 10.54 | 94.06 | 0.00 | 93.56 | 9.53 | 0.00 | 4.10 | 19.15 |
| epfl-bar | 4 | 7 | 4.68 | 5.98 | 4.09 | 5.39 | 0.00 | 0.00 | 5.01 | 6.60 |
| epfl-dec | 4 | 4 | 3.66 | 4.32 | 3.00 | 2.98 | 0.00 | 0.00 | 2.83 | 3.07 |
| epfl-i2c | 5 | 5 | 4.53 | 4.91 | 3.87 | 3.63 | 0.00 | 0.00 | 3.09 | 3.52 |
| epfl-max | 57 | 104 | 43.83 | 77.98 | 43.18 | 75.92 | 0.00 | 0.00 | 24.80 | 39.32 |
| epfl-multiplier | 88 | 115 | 84.62 | 85.14 | 24.95 | 84.56 | 16.00 | 0.00 | 58.28 | 47.08 |
| epfl-priority | 45 | 21 | 34.39 | 18.18 | 33.74 | 16.61 | 0.00 | 0.00 | 9.11 | 5.47 |
| epfl-router | 9 | 8 | 7.56 | 7.86 | 6.91 | 6.30 | 0.00 | 0.00 | 2.59 | 3.45 |
| epfl-voter | 17 | 25 | 13.30 | 20.57 | 12.71 | 19.07 | 0.00 | 0.00 | 13.74 | 11.89 |
| femtorv32-quark | 9 | – | 9.63 | – | 3.74 | – | 2.14 | – | 5.75 | – |
| fpu-adder | 6 | 29 | 5.71 | 8.34 | 2.93 | 1.60 | 1.64 | 6.15 | 4.97 | 4.02 |
| fpu-multiplier | 17 | 15 | 11.21 | 10.93 | 0.00 | 0.00 | 5.75 | 5.47 | 2.79 | 3.09 |
| itc99-b01 | 1 | 2 | 1.88 | 3.19 | 1.28 | 1.91 | 0.00 | 0.00 | 0.74 | 1.58 |
| itc99-b02 | 1 | 1 | 1.54 | 2.04 | 0.89 | 0.70 | 0.00 | 0.00 | 0.62 | 1.32 |
| itc99-b03 | 3 | 5 | 3.36 | 4.36 | 2.22 | 3.71 | 0.00 | 0.00 | 1.93 | 2.08 |
| itc99-b04 | 10 | – | 9.38 | – | 2.35 | – | 3.57 | – | 3.26 | – |
| itc99-b05 | 6 | 9 | 6.54 | 7.29 | 2.22 | 5.03 | 1.83 | 1.68 | 5.32 | 4.32 |
| itc99-b06 | 1 | 1 | 1.91 | 2.10 | 0.70 | 0.76 | 0.00 | 0.00 | 1.44 | 2.23 |
| itc99-b07 | 3 | – | 3.43 | – | 2.22 | – | 0.00 | – | 3.18 | – |
| itc99-b08 | 3 | 6 | 4.60 | 5.03 | 3.46 | 4.52 | 0.00 | 0.00 | 2.31 | 1.97 |
| itc99-b09 | 3 | 5 | 3.26 | 4.53 | 2.11 | 3.87 | 0.00 | 0.00 | 2.02 | 1.52 |
| itc99-b10 | 2 | 4 | 3.00 | 3.71 | 1.86 | 3.06 | 0.00 | 0.00 | 1.94 | 1.17 |
| itc99-b11 | 7 | – | 6.07 | – | 3.71 | – | 1.77 | – | 2.52 | – |
| itc99-b12 | 6 | 8 | 5.71 | 7.52 | 4.50 | 6.25 | 0.00 | 0.00 | 4.74 | 2.97 |
| itc99-b13 | 6 | – | 5.52 | – | 2.93 | – | 1.45 | – | 3.52 | – |
| itc99-b14 | 33 | – | 19.92 | – | 11.16 | – | 6.64 | – | 13.53 | – |
| itc99-b15 | 13 | – | 10.24 | – | 8.21 | – | 1.44 | – | 10.18 | – |
| itc99-b17 | 12 | – | 9.32 | – | 7.28 | – | 1.45 | – | 12.16 | – |
| itc99-b20 | 19 | – | 19.72 | – | 9.72 | – | 3.05 | – | 20.21 | – |
| itc99-b21 | 33 | – | 20.26 | – | 11.78 | – | 5.20 | – | 16.93 | – |

## Speed: Silinx at Optimization Speed against ISE at XST's `-opt_mode Speed -opt_level 2`

### Size

| design | LUTs Silinx | LUTs ISE | LUTs S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | slices S / I | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 270 | 696 | 0.39 | 386 | 386 | 197 | 446 | 0.44 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 941 | 939 | 1.00 | 264 | 269 | 520 | 534 | 0.97 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 285 | 229 | 1.24 | 0 | – | 143 | 115 | 1.24 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 43 | 48 | 0.90 | 0 | – | 25 | 24 | 1.04 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 1.00 | 265 | 265 | 187 | 190 | 0.98 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 489 | 473 | 1.03 | 276 | 270 | 248 | 301 | 0.82 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 82 | 64 | 1.28 | 0 | – | 41 | 32 | 1.28 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-log2 | 10682 | 9911 | 1.08 | 0 | – | 5385 | 4959 | 1.09 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1344 | 1386 | 0.97 | 643 | 643 | 672 | 928 | 0.72 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-multiplier | 8719 | 12245 | 0.71 | 257 | 278 | 4360 | 6162 | 0.71 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 214 | 417 | 0.51 | 137 | 137 | 117 | 256 | 0.46 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 55 | 125 | 0.44 | 64 | 64 | 39 | 87 | 0.45 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-sin | 2128 | 1855 | 1.15 | 0 | – | 1064 | 928 | 1.15 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-voter | 2323 | 4170 | 0.56 | 1003 | 1003 | 1162 | 2526 | 0.46 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 675 | – | – | 224 | – | 394 | – | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 481 | 699 | 0.69 | 389 | 389 | 331 | 447 | 0.74 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 379 | 539 | 0.70 | 404 | 406 | 227 | 398 | 0.57 | 0 / 0 | 0 / 0 | 4 / 4 |
| itc99-b01 | 9 | 12 | 0.75 | 5 | 10 | 5 | 6 | 0.83 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b02 | 4 | 4 | 1.00 | 4 | 4 | 2 | 2 | 1.00 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b03 | 29 | 78 | 0.37 | 30 | 35 | 15 | 45 | 0.33 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b04 | 139 | – | – | 66 | – | 101 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b05 | 272 | 241 | 1.13 | 34 | 43 | 194 | 123 | 1.58 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b06 | 10 | 9 | 1.11 | 8 | 8 | 5 | 5 | 1.00 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b07 | 78 | – | – | 43 | – | 62 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b08 | 29 | 37 | 0.78 | 21 | 21 | 19 | 24 | 0.79 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b09 | 41 | 47 | 0.87 | 28 | 28 | 21 | 24 | 0.88 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b10 | 38 | 53 | 0.72 | 24 | 24 | 22 | 29 | 0.76 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b11 | 124 | – | – | 31 | – | 89 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b12 | 335 | 387 | 0.87 | 119 | 141 | 178 | 227 | 0.78 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b13 | 70 | – | – | 64 | – | 42 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b14 | 987 | – | – | 334 | – | 657 | – | – | 0 / – | 0 / – | 2 / – |
| itc99-b15 | 1879 | – | – | 546 | – | 1233 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b17 | – | – | – | – | – | – | – | – | – / – | – / – | – / – |
| itc99-b20 | 2012 | – | – | 492 | – | 1325 | – | – | 0 / – | 0 / – | 2 / – |
| itc99-b21 | 2114 | – | – | 492 | – | 1361 | – | – | 0 / – | 0 / – | 2 / – |

### Speed and run time

| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate | run time Silinx (s) | run time ISE (s) |
|---|---:|---:|---:|---:|---:|---:|
| epfl-adder | 10.07 | 11.70 | 0.86 | 10.76 | 1938 | 119 |
| epfl-bar | 9.39 | 9.08 | 1.03 | 9.42 | 779 | 75 |
| epfl-dec | 5.99 | 6.12 | 0.98 | 6.06 | 204 | 59 |
| epfl-i2c | 6.81 | 6.51 | 1.05 | 6.96 | 497 | 71 |
| epfl-max | 23.24 | 26.85 | 0.87 | 24.66 | 1304 | 229 |
| epfl-multiplier | 70.75 | 80.92 | 0.87 | 72.35 | 6878 | 1389 |
| epfl-priority | 8.88 | 21.38 | 0.42 | 9.07 | 543 | 62 |
| epfl-router | 6.53 | 9.36 | 0.70 | 6.66 | 609 | 53 |
| epfl-voter | 25.70 | 29.50 | 0.87 | 26.49 | 1457 | 565 |
| femtorv32-quark | 15.08 | – | – | 15.62 | 2532 | – |
| fpu-adder | 10.68 | 11.95 | 0.89 | 11.14 | 1375 | 200 |
| fpu-multiplier | 13.90 | 14.01 | 0.99 | 13.96 | 1591 | 65 |
| itc99-b01 | 2.58 | 3.80 | 0.68 | 2.46 | 47 | 46 |
| itc99-b02 | 2.16 | 3.19 | 0.68 | 2.04 | 31 | 48 |
| itc99-b03 | 5.24 | 5.55 | 0.94 | 5.33 | 106 | 49 |
| itc99-b04 | 11.91 | – | – | 11.71 | 679 | – |
| itc99-b05 | 12.37 | 9.82 | 1.26 | 12.08 | 765 | 55 |
| itc99-b06 | 3.19 | 3.19 | 1.00 | 3.04 | 35 | 48 |
| itc99-b07 | 5.55 | – | – | 5.43 | 246 | – |
| itc99-b08 | 6.44 | 5.87 | 1.10 | 6.23 | 178 | 49 |
| itc99-b09 | 5.29 | 5.91 | 0.89 | 5.33 | 77 | 50 |
| itc99-b10 | 4.76 | 4.90 | 0.97 | 4.73 | 117 | 46 |
| itc99-b11 | 7.69 | – | – | 7.67 | 953 | – |
| itc99-b12 | 8.83 | 7.54 | 1.17 | 9.34 | 296 | 119 |
| itc99-b13 | 5.75 | – | – | 5.77 | 163 | – |
| itc99-b14 | 33.49 | – | – | 34.41 | 1439 | – |
| itc99-b15 | 19.44 | – | – | 19.80 | 1579 | – |
| itc99-b20 | 34.69 | – | – | 36.22 | 5585 | – |
| itc99-b21 | 36.07 | – | – | 36.94 | 6612 | – |

### The critical paths: logic and routing

5 designs slower than ISE; against ISE's critical paths, on average, logic +0.19 ns, routing +0.80 ns.

| design | levels Silinx | levels ISE | logic Silinx | logic ISE | LUT Silinx | LUT ISE | carry Silinx | carry ISE | route Silinx | route ISE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 19 | 8 | 6.45 | 6.58 | 2.35 | 5.99 | 3.45 | 0.00 | 3.61 | 5.08 |
| epfl-bar | 4 | 4 | 4.94 | 4.87 | 4.35 | 4.22 | 0.00 | 0.00 | 4.45 | 4.20 |
| epfl-dec | 4 | 4 | 3.60 | 3.65 | 2.95 | 3.06 | 0.00 | 0.00 | 2.39 | 2.43 |
| epfl-i2c | 4 | 4 | 3.82 | 4.53 | 3.17 | 3.04 | 0.00 | 0.00 | 2.91 | 1.98 |
| epfl-max | 14 | 16 | 10.80 | 13.05 | 10.21 | 10.17 | 0.00 | 0.00 | 12.37 | 13.76 |
| epfl-multiplier | 46 | 41 | 34.76 | 32.74 | 34.11 | 28.68 | 0.00 | 0.00 | 35.99 | 48.18 |
| epfl-priority | 7 | 18 | 5.86 | 14.61 | 4.66 | 13.11 | 0.00 | 0.00 | 2.94 | 6.75 |
| epfl-router | 5 | 6 | 4.47 | 6.34 | 3.82 | 4.78 | 0.00 | 0.00 | 2.06 | 3.01 |
| epfl-voter | 17 | 20 | 13.08 | 17.14 | 12.43 | 14.77 | 0.00 | 0.00 | 12.61 | 12.37 |
| femtorv32-quark | 12 | – | 9.91 | – | 3.63 | – | 2.53 | – | 5.09 | – |
| fpu-adder | 6 | 27 | 5.71 | 8.38 | 2.93 | 1.65 | 1.64 | 6.08 | 4.97 | 3.57 |
| fpu-multiplier | 17 | 17 | 11.21 | 10.83 | 0.00 | 0.00 | 5.75 | 5.30 | 2.69 | 3.15 |
| itc99-b01 | 1 | 3 | 1.88 | 2.90 | 1.28 | 2.25 | 0.00 | 0.00 | 0.70 | 0.91 |
| itc99-b02 | 1 | 1 | 1.54 | 1.48 | 0.89 | 0.89 | 0.00 | 0.00 | 0.62 | 0.65 |
| itc99-b03 | 3 | 4 | 3.37 | 3.82 | 2.17 | 3.17 | 0.00 | 0.00 | 1.86 | 1.73 |
| itc99-b04 | 9 | – | 9.24 | – | 1.92 | – | 3.77 | – | 2.67 | – |
| itc99-b05 | 8 | 8 | 7.45 | 6.82 | 2.82 | 4.21 | 2.14 | 1.96 | 4.92 | 2.99 |
| itc99-b06 | 2 | 1 | 2.19 | 1.43 | 1.60 | 0.84 | 0.00 | 0.00 | 1.00 | 1.48 |
| itc99-b07 | 2 | – | 3.38 | – | 2.18 | – | 0.00 | – | 2.17 | – |
| itc99-b08 | 3 | 5 | 4.60 | 4.41 | 3.46 | 3.82 | 0.00 | 0.00 | 1.82 | 1.47 |
| itc99-b09 | 3 | 5 | 3.32 | 4.41 | 2.11 | 3.82 | 0.00 | 0.00 | 1.96 | 1.48 |
| itc99-b10 | 2 | 3 | 2.88 | 2.89 | 1.73 | 2.30 | 0.00 | 0.00 | 1.87 | 2.01 |
| itc99-b11 | 7 | – | 6.26 | – | 1.65 | – | 4.01 | – | 1.43 | – |
| itc99-b12 | 6 | 5 | 5.17 | 4.41 | 4.58 | 3.82 | 0.00 | 0.00 | 3.66 | 3.13 |
| itc99-b13 | 4 | – | 3.62 | – | 1.60 | – | 1.44 | – | 2.11 | – |
| itc99-b14 | 33 | – | 19.92 | – | 11.16 | – | 6.64 | – | 13.53 | – |
| itc99-b15 | 12 | – | 9.98 | – | 8.10 | – | 0.00 | – | 9.46 | – |
| itc99-b20 | 29 | – | 19.30 | – | 10.94 | – | 4.84 | – | 15.39 | – |
| itc99-b21 | 33 | – | 21.00 | – | 12.04 | – | 5.20 | – | 15.07 | – |

## Fast: Silinx at Optimization Fast against ISE at XST's `-opt_mode Speed -opt_level 1`

### Size

| design | LUTs Silinx | LUTs ISE | LUTs S / I | FFs Silinx | FFs ISE | slices Silinx | slices ISE | slices S / I | SRL16 S / I | RAMB16 S / I | MULT S / I |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 171 | 696 | 0.25 | 386 | 386 | 194 | 446 | 0.43 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-bar | 1201 | 939 | 1.28 | 264 | 269 | 601 | 534 | 1.13 | 0 / 1 | 0 / 0 | 0 / 0 |
| epfl-cavlc | 286 | 222 | 1.29 | 0 | – | 143 | 111 | 1.29 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-ctrl | 50 | 48 | 1.04 | 0 | – | 25 | 24 | 1.04 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-dec | 373 | 373 | 1.00 | 265 | 265 | 187 | 190 | 0.98 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-i2c | 471 | 589 | 0.80 | 276 | 270 | 236 | 355 | 0.66 | 0 / 6 | 0 / 0 | 0 / 0 |
| epfl-int2float | 82 | 64 | 1.28 | 0 | – | 41 | 32 | 1.28 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-log2 | 10682 | 9911 | 1.08 | 0 | – | 5385 | 4959 | 1.09 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-max | 1344 | 1386 | 0.97 | 643 | 643 | 672 | 927 | 0.72 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-multiplier | 6669 | 12245 | 0.54 | 257 | 278 | 3418 | 6162 | 0.55 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-priority | 214 | 417 | 0.51 | 137 | 137 | 117 | 257 | 0.46 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-router | 63 | 125 | 0.50 | 64 | 64 | 32 | 87 | 0.37 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-sin | 2001 | 1855 | 1.08 | 0 | – | 1001 | 928 | 1.08 | 0 / 0 | 0 / 0 | 0 / 0 |
| epfl-voter | 2353 | 4170 | 0.56 | 1003 | 1003 | 1177 | 2526 | 0.47 | 0 / 0 | 0 / 0 | 0 / 0 |
| femtorv32-quark | 710 | – | – | 224 | – | 419 | – | – | 0 / – | 2 / – | 0 / – |
| fpu-adder | 483 | 699 | 0.69 | 389 | 389 | 332 | 446 | 0.74 | 0 / 0 | 0 / 0 | 0 / 0 |
| fpu-multiplier | 406 | 539 | 0.75 | 404 | 406 | 240 | 397 | 0.60 | 0 / 0 | 0 / 0 | 4 / 4 |
| itc99-b01 | 13 | 12 | 1.08 | 5 | 10 | 7 | 6 | 1.17 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b02 | 4 | 4 | 1.00 | 4 | 4 | 2 | 2 | 1.00 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b03 | 28 | 78 | 0.36 | 30 | 35 | 16 | 45 | 0.36 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b04 | 139 | – | – | 66 | – | 101 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b05 | 282 | 241 | 1.17 | 34 | 43 | 198 | 123 | 1.61 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b06 | 10 | 9 | 1.11 | 8 | 8 | 5 | 5 | 1.00 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b07 | 79 | – | – | 43 | – | 57 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b08 | 34 | 37 | 0.92 | 21 | 21 | 18 | 24 | 0.75 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b09 | 42 | 47 | 0.89 | 28 | 28 | 21 | 24 | 0.88 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b10 | 50 | 53 | 0.94 | 17 | 24 | 25 | 29 | 0.86 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b11 | 120 | – | – | 31 | – | 88 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b12 | 315 | 362 | 0.87 | 119 | 141 | 168 | 214 | 0.79 | 0 / 0 | 0 / 0 | 0 / 0 |
| itc99-b13 | 68 | – | – | 53 | – | 41 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b14 | 987 | – | – | 334 | – | 657 | – | – | 0 / – | 0 / – | 2 / – |
| itc99-b15 | 1973 | – | – | 528 | – | 1273 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b17 | 6408 | – | – | 1464 | – | 4076 | – | – | 0 / – | 0 / – | 0 / – |
| itc99-b20 | 2139 | – | – | 492 | – | 1309 | – | – | 0 / – | 0 / – | 2 / – |
| itc99-b21 | 2207 | – | – | 492 | – | 1363 | – | – | 0 / – | 0 / – | 2 / – |

### Speed and run time

| design | Silinx (trce) | ISE (trce) | S / I | Silinx estimate | run time Silinx (s) | run time ISE (s) |
|---|---:|---:|---:|---:|---:|---:|
| epfl-adder | 14.64 | 12.25 | 1.20 | 14.34 | 109 | 146 |
| epfl-bar | 10.98 | 9.08 | 1.21 | 11.00 | 212 | 73 |
| epfl-dec | 6.48 | 6.12 | 1.06 | 6.53 | 34 | 58 |
| epfl-i2c | 7.62 | 6.81 | 1.12 | 7.94 | 86 | 192 |
| epfl-max | 23.24 | 25.68 | 0.91 | 24.66 | 744 | 208 |
| epfl-multiplier | 142.91 | 66.76 | 2.14 | 143.20 | 3903 | 948 |
| epfl-priority | 9.41 | 20.83 | 0.45 | 9.73 | 108 | 67 |
| epfl-router | 10.15 | 9.36 | 1.08 | 10.72 | 28 | 53 |
| epfl-voter | 26.73 | 29.59 | 0.90 | 27.68 | 392 | 456 |
| femtorv32-quark | 19.25 | – | – | 20.10 | 398 | – |
| fpu-adder | 10.79 | 12.07 | 0.89 | 10.71 | 144 | 103 |
| fpu-multiplier | 14.02 | 14.61 | 0.96 | 14.54 | 202 | 61 |
| itc99-b01 | 2.99 | 3.80 | 0.79 | 2.92 | 9 | 45 |
| itc99-b02 | 2.16 | 3.19 | 0.68 | 2.04 | 9 | 45 |
| itc99-b03 | 5.89 | 5.29 | 1.11 | 5.82 | 12 | 52 |
| itc99-b04 | 12.64 | – | – | 12.76 | 104 | – |
| itc99-b05 | 12.29 | 9.82 | 1.25 | 12.72 | 92 | 56 |
| itc99-b06 | 3.37 | 3.19 | 1.06 | 3.16 | 9 | 46 |
| itc99-b07 | 6.64 | – | – | 6.58 | 18 | – |
| itc99-b08 | 6.78 | 5.87 | 1.15 | 6.67 | 15 | 49 |
| itc99-b09 | 6.08 | 5.90 | 1.03 | 6.15 | 13 | 48 |
| itc99-b10 | 6.40 | 4.90 | 1.31 | 6.58 | 14 | 46 |
| itc99-b11 | 8.59 | – | – | 9.17 | 24 | – |
| itc99-b12 | 10.53 | 7.79 | 1.35 | 10.87 | 39 | 68 |
| itc99-b13 | 9.04 | – | – | 9.36 | 15 | – |
| itc99-b14 | 33.49 | – | – | 34.41 | 523 | – |
| itc99-b15 | 21.83 | – | – | 23.02 | 464 | – |
| itc99-b17 | 25.80 | – | – | 26.33 | 2584 | – |
| itc99-b20 | 39.97 | – | – | 40.10 | 1654 | – |
| itc99-b21 | 36.76 | – | – | 38.27 | 1658 | – |

### The critical paths: logic and routing

13 designs slower than ISE; against ISE's critical paths, on average, logic +4.53 ns, routing +2.50 ns.

| design | levels Silinx | levels ISE | logic Silinx | logic ISE | LUT Silinx | LUT ISE | carry Silinx | carry ISE | route Silinx | route ISE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| epfl-adder | 63 | 8 | 10.54 | 6.75 | 0.00 | 6.09 | 9.53 | 0.00 | 4.10 | 5.32 |
| epfl-bar | 6 | 4 | 5.11 | 4.87 | 4.52 | 4.22 | 0.00 | 0.00 | 5.86 | 4.20 |
| epfl-dec | 4 | 4 | 3.66 | 3.65 | 3.00 | 3.06 | 0.00 | 0.00 | 2.83 | 2.43 |
| epfl-i2c | 5 | 4 | 4.53 | 4.48 | 3.87 | 2.98 | 0.00 | 0.00 | 3.09 | 2.33 |
| epfl-max | 14 | 17 | 10.80 | 13.79 | 10.21 | 13.20 | 0.00 | 0.00 | 12.37 | 11.89 |
| epfl-multiplier | 88 | 38 | 84.62 | 31.33 | 24.95 | 28.10 | 16.00 | 0.00 | 58.28 | 35.40 |
| epfl-priority | 6 | 18 | 5.95 | 14.67 | 5.36 | 13.17 | 0.00 | 0.00 | 3.45 | 6.15 |
| epfl-router | 9 | 6 | 7.56 | 6.34 | 6.91 | 4.78 | 0.00 | 0.00 | 2.59 | 3.01 |
| epfl-voter | 18 | 21 | 14.17 | 17.20 | 13.52 | 14.09 | 0.00 | 0.00 | 12.55 | 12.39 |
| femtorv32-quark | 26 | – | 12.71 | – | 7.85 | – | 3.70 | – | 6.52 | – |
| fpu-adder | 7 | 30 | 5.97 | 8.62 | 2.93 | 1.65 | 1.54 | 6.31 | 4.82 | 3.43 |
| fpu-multiplier | 17 | 16 | 10.73 | 11.15 | 0.00 | 0.00 | 5.27 | 5.62 | 3.29 | 3.46 |
| itc99-b01 | 2 | 3 | 2.24 | 2.90 | 1.65 | 2.25 | 0.00 | 0.00 | 0.74 | 0.91 |
| itc99-b02 | 1 | 1 | 1.54 | 1.48 | 0.89 | 0.89 | 0.00 | 0.00 | 0.62 | 0.65 |
| itc99-b03 | 3 | 4 | 3.37 | 3.70 | 2.22 | 3.11 | 0.00 | 0.00 | 2.52 | 1.58 |
| itc99-b04 | 10 | – | 9.38 | – | 2.35 | – | 3.57 | – | 3.26 | – |
| itc99-b05 | 6 | 8 | 6.32 | 6.82 | 2.22 | 4.21 | 1.77 | 1.96 | 5.97 | 2.99 |
| itc99-b06 | 1 | 1 | 1.91 | 1.43 | 0.70 | 0.84 | 0.00 | 0.00 | 1.44 | 1.48 |
| itc99-b07 | 3 | – | 3.43 | – | 2.22 | – | 0.00 | – | 3.18 | – |
| itc99-b08 | 4 | 5 | 4.13 | 4.41 | 2.98 | 3.82 | 0.00 | 0.00 | 2.64 | 1.47 |
| itc99-b09 | 4 | 5 | 3.96 | 4.46 | 2.82 | 3.87 | 0.00 | 0.00 | 2.12 | 1.44 |
| itc99-b10 | 3 | 3 | 3.42 | 2.89 | 2.28 | 2.30 | 0.00 | 0.00 | 2.97 | 2.01 |
| itc99-b11 | 7 | – | 6.07 | – | 3.71 | – | 1.77 | – | 2.52 | – |
| itc99-b12 | 6 | 5 | 5.71 | 4.86 | 4.50 | 4.27 | 0.00 | 0.00 | 4.74 | 2.94 |
| itc99-b13 | 6 | – | 5.52 | – | 2.93 | – | 1.45 | – | 3.52 | – |
| itc99-b14 | 33 | – | 19.92 | – | 11.16 | – | 6.64 | – | 13.53 | – |
| itc99-b15 | 13 | – | 11.38 | – | 8.94 | – | 0.00 | – | 10.45 | – |
| itc99-b17 | 14 | – | 11.25 | – | 8.72 | – | 1.38 | – | 14.55 | – |
| itc99-b20 | 19 | – | 19.72 | – | 9.72 | – | 3.05 | – | 20.21 | – |
| itc99-b21 | 26 | – | 19.78 | – | 12.35 | – | 4.00 | – | 16.98 | – |

## Not built by one of the flows

- femtorv32-quark: XST cannot read it (`ERROR:HDLCompilers:28 - "src/src/femtorv32_quark.v" line 63 'instr' has not been declared`); Silinx reads it.
- itc99-b04, ISE at Area, Speed, Fast: `ERROR:ConstraintSystem:59 - Constraint <NET "data_in<8>" LOC = "C7" ;>`
- itc99-b07, ISE at Area, Speed, Fast: `ERROR:ConstraintSystem:59 - Constraint <NET "punti_retta<8>" LOC = "B6" ;>`
- itc99-b11, ISE at Area, Speed, Fast: `ERROR:ConstraintSystem:59 - Constraint <NET "x_in<6>" LOC = "D6" ;>`
- itc99-b13, ISE at Area, Speed, Fast: `ERROR:ConstraintSystem:59 - Constraint <NET "canale<4>" LOC = "A7" ;>`
- itc99-b14: XST cannot read it (`ERROR:Xst:2587 - Port <addr> of instance <dut> has different type in definition <b14>.`); Silinx reads it.
- itc99-b15: XST cannot read it (`ERROR:Xst:2587 - Port <address> of instance <dut> has different type in definition <b15>.`); Silinx reads it.
- itc99-b17: XST cannot read it (`ERROR:Xst:2587 - Port <address1> of instance <dut> has different type in definition <b17>.`); Silinx reads it.
- itc99-b17, Silinx at Speed: `timed out after 120 min (--build-timeout)`
- itc99-b20, ISE at Area, Speed, Fast: `ERROR:ConstraintSystem:59 - Constraint <NET "so<20>" LOC = "P17" ;>`

## Not measured yet

The builds this run did not reach before its deadline, made by the next run:

- itc99-b21 (ISE at Area, Speed, Fast)
- itc99-b22 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- iwls05-i2c (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- iwls05-sasc (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- iwls05-simple-spi (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- iwls05-spi (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- iwls05-ss-pcm (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- iwls05-usb-phy (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- light8080 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- nandland-spi-verilog (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- nandland-spi-vhdl (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- neorv32 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- picorv32 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- secworks-aes (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- secworks-sha1 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- secworks-sha256 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- secworks-siphash (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- serv (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- spi-fpga-master (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- spi-fpga-slave (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- t80 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- uart-for-fpga (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- verilog-axis-fifo (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- verilog-i2c-master (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- verilog-lfsr-crc (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- verilog-lfsr-prbs (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- verilog-uart (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- vtr-ch-intrinsics (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- vtr-diffeq1 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- vtr-diffeq2 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- vtr-mkPktMerge (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- vtr-sha (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)
- vtr-stereovision3 (Silinx at Area, Speed, Fast; ISE at Area, Speed, Fast)

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

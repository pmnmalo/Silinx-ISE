# Design corpus: real open-source designs through the whole toolchain

The other tests check Silinx on its own examples and on small test designs. This corpus takes
**real open-source designs** — CPUs, peripherals, cryptographic cores, benchmark suites, in
Verilog and VHDL — through every stage of Silinx's toolchain, and records what each stage does
with them, how long it takes and which warnings it gives.

    npm run test:designs                 # all designs (the run times below)
    npm run test:designs -- --filter serv,epfl --jobs 4
    npm run test:designs -- --update     # record the results as the expectations

Not part of `npm test` (it needs the network once, and minutes).

## The designs: fetched, never committed

`manifest.json` lists each design: its repository and **pinned commit**, its licence, language,
top, files, clock / reset, generics, its own self-checking testbench when it has one, and its
expected size (the part it fits). `scripts/fetch-design-corpus.mjs` (`npm run fetch:designs`)
downloads exactly those files (and each repository's licence) from
`raw.githubusercontent.com/<repo>/<commit>/…` into `.cache/designs-corpus/` (git-ignored). No
third-party design file is in the repository; the files under `wrappers/` and `boards/` are
Silinx's own (AGPL-3.0-only).

**What the checkouts share** (#105): the fetched sources, never what a run writes.

- The sources are shared: a git worktree (`.claude/worktrees/…`, any `git worktree add`) reads
  and fetches them in its **main checkout's** `.cache/designs-corpus/`, so they are downloaded
  once. They are pinned (a commit, never a branch), so they never change once fetched; each file is
  written whole, then renamed, so a run in another checkout never reads half of one. A second clone
  (not a worktree) has its own.
- The results are each checkout's own: a run writes `results.json` into its checkout's
  `.cache/designs-results/` (or `--json file`), never under the sources: two checkouts' runs never
  overwrite each other's, even where `.cache/designs-corpus` is a link to a shared folder (as on
  the weekly comparison's runner, `.github/workflows/quality.yml`). `corpusPaths` in
  `scripts/fetch-design-corpus.mjs` gives both folders.
- What a run records is committed in its checkout's tree: `expected.json`, `times.json` and this
  README (`--update`, `--record-times`, `--table`).

Only designs under an open-source licence (permissive or copyleft) are used; `validateManifest`
refuses a source without one, or not pinned to a commit.

| source | designs | licence | language |
| --- | --- | --- | --- |
| [olofk/serv](https://github.com/olofk/serv) | SERV (bit-serial RV32I) | ISC | Verilog |
| [YosysHQ/picorv32](https://github.com/YosysHQ/picorv32) | PicoRV32 (small configuration) | ISC | Verilog |
| [BrunoLevy/learn-fpga](https://github.com/BrunoLevy/learn-fpga) | FemtoRV32 Quark | BSD-3-Clause | Verilog |
| [stnolting/neorv32](https://github.com/stnolting/neorv32) | NEORV32 (approm test setup) | BSD-3-Clause | VHDL-2008 |
| [jaruiz/light8080](https://github.com/jaruiz/light8080) | light8080 + mcu80 SoC, 'hello' program, testbench | LGPL-2.1 | VHDL |
| [freecores/t80](https://github.com/freecores/t80) | T80 (Z80), T80s top | BSD-3-Clause-style (in the sources) | VHDL |
| [alexforencich/verilog-uart](https://github.com/alexforencich/verilog-uart), [-i2c](https://github.com/alexforencich/verilog-i2c), [-lfsr](https://github.com/alexforencich/verilog-lfsr), [-axis](https://github.com/alexforencich/verilog-axis) | UART, I2C master, CRC-32, PRBS31, AXI-stream FIFO | MIT | Verilog |
| [jakubcabal/uart-for-fpga](https://github.com/jakubcabal/uart-for-fpga), [spi-fpga](https://github.com/jakubcabal/spi-fpga) | UART, SPI master, SPI slave, with self-checking testbenches | MIT | VHDL |
| [nandland/spi-master](https://github.com/nandland/spi-master) | SPI master, in Verilog and in VHDL | MIT | both |
| [secworks](https://github.com/secworks) aes, sha1, sha256, siphash | crypto cores with self-checking testbenches | BSD-2-Clause | Verilog |
| [dawsonjon/fpu](https://github.com/dawsonjon/fpu) | IEEE 754 adder, multiplier | MIT | Verilog |
| [VTR benchmarks](https://github.com/verilog-to-routing/vtr-verilog-to-routing) | sha, diffeq1, diffeq2, ch_intrinsics, stereovision3, mkPktMerge | open source, each under the terms in its own source (VTR's LICENSE.md); sha: OpenCores BSD-style | Verilog |
| [EPFL combinational suite](https://github.com/lsils/benchmarks) | ctrl, int2float, cavlc, router, priority, dec, i2c, adder, bar, max | MIT | Verilog (gates) |

The VTR benchmarks (sha, diffeq1, diffeq2, ch_intrinsics, stereovision3, mkPktMerge) carry no licence
of their own beyond VTR's LICENSE.md; the author decided (2026-10-11) to keep them in the corpus on
the condition that they are only downloaded for testing (scripts/fetch-design-corpus.mjs) and never
committed or redistributed with Silinx, as every design of the corpus.

Not included: ISCAS'85 / '89 (no repository with a licence found), the GHDL test suite (optional,
later), the larger VTR and EPFL designs (too large for the XC3S250E: kept for the XC3S500E /
1200E when their bit databases exist), Plasma (licence unclear).

`wrappers/` holds Silinx's own glue: `mcu80_hello.vhd` (light8080's SoC with its 'hello' program
as a top without an array generic) and `vtr_memories.v` (behavioural models of VTR's
`single_port_ram` / `dual_port_ram` hard blocks).

## The stages (`run.mjs`)

Each design runs in a worker thread; each stage records a status, its time and its warnings.

| stage | what | status |
| --- | --- | --- |
| `frontend` | Silinx parses and elaborates the design, then runs its design checks (lint) as *Check Syntax* does | `pass`, `unsupported: parse/elaborate: <first error>` (the full list in the results) |
| `tb` | the design's own self-checking testbench in Silinx's simulator, until it prints its pass (or fail) message | `pass`, `fail: <line>`, `unsupported: …`, `skip: no self-checking testbench` |
| `synth` | the open synthesis: Silinx's synthesis front end (`core/synth-verilog.js`) + Yosys (YoWASP) | `pass`, `unsupported: <construct>`, `error: <Yosys error>` |
| `diff` | the netlist simulated against the RTL cycle by cycle, seeded random stimulus (`test/diff-synth.js`) | `pass`, `mismatch: cycle N: <outputs>` (the report in the results) |
| `flow` | the open back end on the XC3S250E (Basys2-250), or the XC3S500E / XC3S1200E (Nexys2) for a design too large for it: pack, then place and route as the app's flow does (`core/fpga/place-route.js`: the placer with the delay table, routing on the PIPs of known bits, static timing, register replication), static timing against PERIOD 20 ns, bitgen | `complete` (every feature in the bit database), `too large: …`, `fail: route/bitgen: …`, `unsupported: …` |

For the flow, the clock goes on the Basys2's oscillator pin (B8, `boardClockUcf`). A design with
more port bits than the package has pins (92) is wrapped (`lib.mjs ioWrapper`): its inputs are
loaded serially from one pin by a shift register, its outputs registered and XOR-reduced to one
pin, so nothing is optimised away — the back end is tested on the real logic, the behaviour was
checked before on the design's own ports (`diff`). Cells the packer does not support yet (block
and distributed RAM, shift registers, multipliers) are recorded as a warning and the design is
synthesized again with `-nobram -nolutram -nosrl -nodsp` so the rest of the flow is still tested.
The place and route is the one of the app's flow and of `research/s3e-route/open-flow.mjs`
(`core/fpga/place-route.js`, #79, #88): the corpus measures what users get, register replication
(the flip-flops of many loads on the critical path copied, kept when faster) included.

### Expectations and warnings

`expected.json` holds, per design, the status of every stage and **every warning of every
stage** (normalized: no absolute paths, no Yosys-generated numbers, repeats counted as `(xN)`):
Silinx's own (`WARNING:Silinx - …`, the design checks `WARNING:Silinx:646 (unused-signal) - …`,
the simulator's, the flow's `WARNING:Silinx (pack|place|timing) - …`) and Yosys's (`Warning: …`). A run
**fails** on a regression (a stage expected `pass` / `complete` that is not), on a **new warning**
and on a **warning that vanished**; newly passing stages and other changes are listed. `--update`
records the run. `--stages frontend,tb` runs (and compares) only those stages. The full results
(times, cell counts, slices, timing per clock, mismatch reports, unreached nets, the flow's steps
with their times: `details.flowSteps`, the register replication pass's own among them) are written
to the checkout's `.cache/designs-results/results.json`.

### Quality guard: the size and speed of the circuits

For every design whose flow completes, `expected.json` also holds the **quality of the generated
circuit**, as the flow itself measures it:

    "quality": { "part": "xc3s250ecp132-4", "slices": 131, "luts": 259, "ffs": 79, "period": 5.625 }

`part`: the device it was built on; `slices`, `luts`, `ffs`: the packer's counts (of the circuit
kept: with the copies of register replication when it was kept);
`period`: the critical path in ns by Silinx's STA (`core/fpga/timing.js`, the worst clock; `null`
for a design without a clock). The run **fails when a design gets larger or slower** beyond the
placement noise:

    LARGER OR SLOWER (tolerance: size 5%, critical path 15%) (1):
      serv: critical path 13.199 -> 15.300 ns (+15.9%, tolerance 15.0%)

and **lists the designs that got smaller or faster** beyond it (`smaller or faster`), which
`--update` records. A design built on another device than recorded (it no longer fits, or fits a
smaller one: its flow status changes too) is not compared; a design without a recorded quality is
listed. The tolerances are options: `--size-tolerance 5` (slices, LUTs and FFs, %) and
`--period-tolerance 15` (%).

**To accept a change** (a smaller circuit, or a larger one that is the price of a fix): run the
designs concerned with `--update` (`--filter name --update`) and commit `expected.json`: the diff
shows the new numbers.

The numbers are reproducible: the placer's seed is fixed (1; `--seed n` runs another only to measure
the noise, never with `--update`), and the whole flow (Yosys in WebAssembly, pack, place, route,
STA) is deterministic for a seed: a second run of 17 designs with another `--jobs` gave exactly the
recorded numbers. A CI run's should equal a local one's (the same code; JavaScript's arithmetic and
V8's Math are the same on every platform); a first nightly run that differs everywhere would show
otherwise.

The tolerances come from the noise between placer seeds (2026-10-12, 17 designs, seeds 1-3): a
change elsewhere in the toolchain that perturbs the placement moves the critical path as a new seed
does. Size hardly depends on the seed (packing comes before placement; the copies of register
replication, a few flip-flops, depend on the placement), with one exception:
epfl-router's placement on seed 2 fits its ports on the pads, while seeds 1 and 3 need the I/O
wrapper (64 FFs more), a change of the flow's path, not noise. The critical path moves by up to
12.5 % from seed 1's (vtr-ch-intrinsics 6.33 / 7.12 / 6.82 ns; serv 9.1 %, epfl-priority 7.2 %,
epfl-dec and light8080 6.3 %, the others 0.9-5.2 %): its tolerance is 15 %. Size's is 5 %: any
real change of the netlist or of the packer shows.

### Run times

Each stage's time per design is in the results (`results.json`: `times`, ms). `times.json` holds
the times of a full run **per machine class** (they depend on the machine): `ci` (a CI runner:
`CI=true`), `local` (otherwise), or any name given with `--machine name` or
`SILINX_CORPUS_MACHINE`. A run compares its times with its class's and **warns (never fails)**
when a design's synthesis or flow takes more than 1.5 times its baseline and more than 30 s
longer; it prints its slowest designs against the baseline.

`--update` on a full run (all the stages) records the times of the designs that ran in its class.
CI never commits: its baseline is recorded from a nightly run's `designs-results` artifact, without
running anything:

    node test/designs-corpus/run.mjs --record-times designs-results/designs-results/results.json --machine ci

The baselines below are generated from `times.json` (`--update`, `--record-times` and `--table`
rewrite them; `test/designs-corpus.test.js` checks that they are the committed `times.json`'s, #105).
The times are each design's own, summed: a run with n jobs takes about 1/n of the sum, and at
least its slowest design's time (the testbench included: uart-for-fpga's is most of its total).

<!-- the run times: generated from times.json by `node test/designs-corpus/run.mjs --table`; do not edit by hand -->
| machine class | designs | synthesis (s) | flow (s) | all the stages (s) |
| --- | ---: | ---: | ---: | ---: |
| `ci` | 38 | 1614 | 2341 | 4423 |
| `local` | 38 | 536 | 1213 | 1871 |

The 8 slowest designs (s: synthesis / flow / all the stages):

| design | `ci` | `local` |
| --- | ---: | ---: |
| secworks-aes | 325 / 852 / 1253 | 105 / 535 / 658 |
| secworks-sha256 | 149 / 275 / 443 | 43 / 98 / 146 |
| secworks-sha1 | 102 / 194 / 309 | 29 / 99 / 132 |
| neorv32 | 158 / 81 / 261 | 60 / 35 / 99 |
| uart-for-fpga | 10 / 2 / 246 | 6 / 2 / 63 |
| t80 | 114 / 52 / 174 | 38 / 38 / 79 |
| picorv32 | 59 / 90 / 159 | 19 / 39 / 61 |
| secworks-siphash | 49 / 97 / 152 | 15 / 45 / 62 |
<!-- end of the run times -->

## Results (Yosys 0.70 / YoWASP)

Generated from `expected.json` (`node test/designs-corpus/run.mjs --table`; `--update` rewrites it
too; `test/designs-corpus.test.js` checks that it is the one the committed expectations give, #89).
`-`: not run (no self-checking testbench, or an earlier stage failed); `(r)`: synthesized again
without RAM / SRL / multiplier cells for the packer. Device: the smallest the flow fits (the
XC3S250E, else the XC3S500E or XC3S1200E); slices, LUTs, FFs: the packed circuit's; critical path:
by Silinx's STA (the worst clock; none for a combinational design), against 20 ns. Warnings: per
stage, repeats counted. The I/O wrapper, the times and the cell counts of Yosys are in the run's
`results.json`.

<!-- the results table: generated from expected.json by `node test/designs-corpus/run.mjs --table`; do not edit by hand -->
| design | lang | licence | frontend | tb | synth | diff | flow | device | slices | LUTs | FFs | critical path (ns) | warnings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| serv | Verilog | ISC | pass | - | pass | pass | complete | XC3S250E | 208 | 347 | 354 | 13.155 | 20 (frontend 20) |
| picorv32 | Verilog | ISC | pass | - | pass | pass | complete | XC3S250E | 791 | 1579 | 767 | 11.782 | 33 (frontend 28, synth 5) |
| femtorv32-quark | Verilog | BSD-3-Clause | pass | - | pass | pass | complete | XC3S250E | 423 | 843 | 226 | 17.271 | 0 |
| neorv32 | VHDL | BSD-3-Clause | pass | - | pass | pass | complete | XC3S250E | 2158 | 4306 | 1319 | 15.631 | 72 (frontend 47, synth 25) |
| light8080 | VHDL | LGPL-2.1 | pass | pass | pass | pass | complete | XC3S250E | 192 | 380 | 206 | 12.753 | 17 (frontend 17) |
| t80 | VHDL | BSD-3-Clause-style | pass | - | pass | pass | complete | XC3S250E | 1296 | 2584 | 361 | 23.123 | 6 (frontend 5, flow 1) |
| verilog-uart | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 131 | 259 | 79 | 10.286 | 0 |
| verilog-i2c-master | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 126 | 250 | 72 | 10.963 | 4 (frontend 4) |
| verilog-lfsr-crc | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 53 | 105 | 64 | 3.868 | 0 |
| verilog-lfsr-prbs | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 16 | 16 | 31 | 2.506 | 1 (frontend 1) |
| verilog-axis-fifo | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 19 | 33 | 32 | 5.269 | 11 (frontend 10, synth 1) |
| uart-for-fpga | VHDL | MIT | pass | pass | pass | pass | complete | XC3S250E | 42 | 80 | 53 | 4.811 | 1 (frontend 1) |
| spi-fpga-master | VHDL | MIT | pass | pass | pass | pass | complete | XC3S250E | 18 | 33 | 21 | 5.092 | 1 (frontend 1) |
| spi-fpga-slave | VHDL | MIT | pass | pass | pass | pass | complete | XC3S250E | 16 | 26 | 21 | 4.984 | 0 |
| nandland-spi-verilog | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 52 | 100 | 37 | 5.211 | 1 (frontend 1) |
| nandland-spi-vhdl | VHDL | MIT | pass | - | pass | pass | complete | XC3S250E | 52 | 100 | 37 | 5.524 | 2 (frontend 2) |
| secworks-sha1 | Verilog | BSD-2-Clause | pass | pass | pass | pass | complete | XC3S250E | 1879 | 3756 | 1560 | 17.545 | 2 (frontend 1, synth 1) |
| secworks-sha256 | Verilog | BSD-2-Clause | pass | pass | pass | pass | complete | XC3S250E | 2423 | 4845 | 1809 | 26.632 | 3 (frontend 1, synth 1, flow 1) |
| secworks-siphash | Verilog | BSD-2-Clause | pass | pass | pass | pass | complete | XC3S250E | 913 | 1824 | 798 | 14.085 | 0 |
| secworks-aes | Verilog | BSD-2-Clause | pass | pass | pass | pass | complete | XC3S1200E | 5584 | 11167 | 2996 | 28.385 | 4 (synth 3, flow 1) |
| fpu-adder | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 341 | 677 | 389 | 12.491 | 0 |
| fpu-multiplier | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 246 | 482 | 404 | 15.296 | 0 |
| vtr-sha | Verilog | VTR benchmarks | pass | - | pass | pass | complete | XC3S250E | 834 | 1665 | 893 | 15.700 | 0 |
| vtr-diffeq1 | Verilog | VTR benchmarks | pass | - | pass | pass | complete | XC3S500E | 263 | 414 | 451 | 42.614 | 1 (flow 1) |
| vtr-diffeq2 | Verilog | VTR benchmarks | pass | - | pass | pass | complete | XC3S500E | 144 | 282 | 96 | 29.308 | 1 (flow 1) |
| vtr-ch-intrinsics | Verilog | VTR benchmarks | pass | - | pass | mismatch | complete | XC3S250E | 275 | 178 | 509 | 7.592 | 21 (frontend 13, synth 8) |
| vtr-stereovision3 | Verilog | VTR benchmarks | pass | - | pass | pass | complete | XC3S250E | 112 | 223 | 120 | 7.993 | 3 (frontend 2, synth 1) |
| vtr-mkPktMerge | Verilog | VTR benchmarks | pass | - | pass | pass | complete | XC3S250E | 730 | 785 | 962 | 7.494 | 33 (frontend 33) |
| epfl-ctrl | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 25 | 49 | 0 |  | 0 |
| epfl-int2float | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 41 | 82 | 0 |  | 0 |
| epfl-cavlc | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 139 | 277 | 0 |  | 0 |
| epfl-router | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 36 | 61 | 64 | 7.786 | 0 |
| epfl-priority | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 115 | 229 | 137 | 11.244 | 0 |
| epfl-dec | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 187 | 373 | 265 | 6.515 | 0 |
| epfl-i2c | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 236 | 471 | 276 | 7.759 | 0 |
| epfl-adder | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 194 | 172 | 386 | 13.316 | 0 |
| epfl-bar | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 601 | 1201 | 272 | 10.697 | 0 |
| epfl-max | Verilog | MIT | pass | - | pass | pass | complete | XC3S250E | 722 | 1444 | 644 | 28.878 | 1 (flow 1) |

Summary: 38 designs; front end 38 / 38; own testbenches 8 / 8 pass; synthesis 38; netlist = RTL 37; fully open bitstream complete for 38 designs (35 on the XC3S250E, 2 on the XC3S500E, 1 on the XC3S1200E).
<!-- end of the results table -->

The epfl-priority / adder / max periods are those of the I/O wrapper around a combinational
design (the whole logic between two registers): the PERIOD warning is expected there.

### Checked against ISE

`SILINX_ISE_HOST=… node scripts/check-open-flow.mjs <projects>` (one ISE job, an Intel Mac mini
with ISE 14.7 in Docker): ISE converts each routed XDL, runs its DRC and bitgen; Silinx's .bit
must be byte-identical (CRC on and off). `run.mjs --projects dir` writes a Silinx project for each
design whose flow completed (the I/O wrapper and a wrapper setting the generics included);
`boards.mjs` the board versions below (a design synthesized again for the packer: its
`netlist.json`, given with `--json`).

Result (2026-10-11, the 24 corpus designs whose flow completes and the 4 board designs, one ISE
job): **every design passes ISE's DRC (0 errors, 0 warnings); 25 of 28 bitstreams are
byte-identical to ISE's bitgen** (CRC on and off), the 4 board bitstreams among them. The 3 others
(verilog-lfsr-prbs: 1 frame bit, spi-fpga-master: 6, verilog-axis-fifo: 57) differ only in the
tiles of **input pads whose input drives nothing** (ports the design declares but does not use:
`pause_req`, `s_axis_tid`…) and, for the FIFO, one left I/O tile's switches (`W6END6->E2BEG6`,
`LH6->E6BEG0`): bit-database cases (#18). Checked again since (2026-10-11): verilog-lfsr-prbs,
spi-fpga-master, verilog-axis-fifo and the board designs corpus-prbs, corpus-spi, corpus-int2float
and corpus-serv are byte-identical, DRC clean: the packer leaves out an input that drives nothing,
as ISE's map does, and bitgen writes such a pad, when an XDL has one, as ISE's bitgen does
(`I:NOLOAD`, measured on every pad of the four devices). Before the placer's VCCO fix, 4 designs
(verilog-i2c-master, uart-for-fpga, spi-fpga-slave, verilog-lfsr-crc) failed ISE's DRC
(PhysDesignRules:755). ISE's trce agrees with Silinx's STA within about 5% (vtr-sha 17.82 vs
17.55 ns, siphash 18.00 vs 17.89, i2c-master 13.24 vs 13.77, the SERV board 16.97 vs 16.15).

## Board versions (Basys2-250): `boards.mjs`

    node test/designs-corpus/boards.mjs <projects dir> <bit dir>

Our own top around a fetched design (`boards/*.v`), the Basys2's pins (`server/devices.js`), the
board design's own testbench in Silinx's simulator when it has one, and the fully open flow
(`research/s3e-route/open-flow.mjs`) to `<bit dir>/<name>.bit`.

| bitstream | design | on the board |
| --- | --- | --- |
| `corpus-serv.bit` | SERV (RISC-V) running an 8-instruction program from a ROM (`boards/serv_basys2.v`, testbench `serv_basys2_tb.v`) | LD7..LD0 count in binary, about one step a second; BTN0 held: reset, the count starts again from 1 |
| `corpus-prbs.bit` | verilog-lfsr PRBS31 generator | LD7..LD0: a new pseudo-random pattern about 3 times a second; SW0 freezes it; BTN0 restarts the sequence |
| `corpus-spi.bit` | nandland SPI master, MISO looped to MOSI | press BTN1: the switches' byte goes out and comes back; LD7..LD0 show it; BTN0: reset |
| `corpus-int2float.bit` | EPFL int2float | the integer {BTN2..0, SW7..0} as a float: LD3..0 mantissa, LD6..4 exponent, LD7 on |

## Bugs found and fixed (with a regression test in `test/designs-corpus-fixes.test.js`)

- **Open synthesis: a memory declared inside a function lost its words** (written as one vector):
  verilog-lfsr's `lfsr_mask` made the CRC-32 and the PRBS generator constant in the netlist
  (`core/synth-verilog.js`).
- **Verilog `?:` of strings** (`parameter S = (STYLE == "AUTO") ? "REDUCTION" : STYLE`) crashed
  elaboration ("Cannot read properties of undefined") in a generate condition (`core/interp.js`).
- **`$display("%02d")` padded with blanks** instead of zeros: secworks' testbenches print
  "All 03 test cases" and were judged failing (`core/interp.js`).
- **"function assigns signal" warned for Verilog tasks and VHDL procedures**, which may assign the
  signals they see (secworks testbenches: dozens of spurious warnings) (`core/elaborate.js`).
- **`ieee.math_real`** was missing: `ceil`, `floor`, `round`, `trunc`, `sqrt`, `log2`, `log10`,
  `log`, `exp`, `sign`, `realmax`, `realmin`, the `MATH_*` constants and the `UNIFORM` procedure
  (jakubcabal's UART / SPI and their testbenches) (`core/elaborate.js`, `core/interp.js`,
  `core/vhdl/math-real.js`, `core/vhdl/parser.js`, `core/compile.js`).
- **VHDL aggregates as port and generic actuals** (`DIN_ADDR => (others => '0')`,
  `DEV_01_BASE => (others => '0')`): "cannot determine the type of the aggregate"
  (`core/elaborate.js`).
- **VHDL `boolean(…)`** conversion and **generics of an unconstrained array type** (NEORV32,
  light8080) (`core/elaborate.js`).
- **Open synthesis: a for loop in an instance's process was dropped by Yosys**: the loop variable
  was written as an escaped name with a dot (`for (\u.j = 3; …)`), which Yosys 0.68 does not
  unroll: verilog-axis's FIFO inside another module (the I/O wrapper) lost its pipeline and its
  block RAM (`core/synth-verilog.js`: loop variables get a plain name).
- **Placer: I/O banks mixed voltages**: a 3.3 V clock on B8 and unconstrained (LVCMOS25) outputs in
  the same bank gave bitstreams ISE's DRC refuses (PhysDesignRules:755, "VCCO incompatible"); the
  placer now keeps one VCCO per bank and refuses fixed I/Os that mix them (`core/fpga/place.js`).
- **RAMB16 model**: port B reading the word port A writes at the same edge got the new word; the
  reads of both ports now come before the writes (old word, as Yosys's READ_FIRST mapping
  expects) (`core/unisim.js`; verilog-axis FIFO `diff`).
- **Design checks: `$clog2` warned at line 1** when it was in a declaration's or a parameter's
  range (serv, verilog-axis, nandland SPI); the checks without an XST number were labelled `Lint`,
  not `Silinx` (#16; `core/elaborate.js`, `core/verilog/parser.js`, `core/lint.js`; test in
  `test/lint.test.js`).
- Differential test: a block RAM never written gets `INIT_xx`, `INIT_A/B`, `SRVAL_A/B` = x from
  Yosys; 0 in the bitstream, so 0 in the netlist simulation (`test/diff-synth.js`).

## Open (with reproducers)

Front end (Verilog / VHDL):
- light8080: **slices of arrays** (`br(obj_size to size-1) := (others => x"00")` on an array of
  vectors): "array slices are not supported".
- secworks sha1 testbench: **hierarchical reference into a named block** (`dut.state_logic.f`);
  aes testbench: **a reference through the top's own name** (`tb_aes_core.dut.…`).

Open synthesis (`core/synth-verilog.js`, Yosys):
- NEORV32: "assignment of an array to a part of an array (line 544)" (unsupported).
- **Constant function calls are not folded**: verilog-lfsr's `wire mask = lfsr_mask(n)` (constant
  per generate iteration) is written as a call; Yosys evaluates the function per wire (110-150 s
  of synthesis) and warns "Replacing memory … with list of registers" ~160 times (spurious).
- **VHDL signals assigned a constant** (`w_CPOL <= '1' when SPI_MODE = 2 else '0'`) used as an
  asynchronous reset value: the netlist gets async-load flip-flop emulation. nandland's SPI master:
  258 LUTs in VHDL, 105 in Verilog for the same design, 12.5 ns vs 6.2 ns.
- Yosys's "Shift register inference not yet supported for family xc3se." on every design
  (spurious: `synth_xilinx -family xc3se` without `-nosrl`).
- Size: T80 2860 LUT4 + 3083 MUXF (ISE ~1.5k LUT for this core); secworks sha1 2660 LUT4 alone but
  6477 inside the I/O wrapper.

Differential test harness:
- vtr-ch-intrinsics: at power-up the RTL's `case` of an X state takes the `default` (X-optimism)
  while the netlist's register starts at 0 (`memory_controller_write_enable`).

Back end (`core/fpga`, bit database):
- ~~**Unused inputs**~~ (fixed, #18): an input pad whose buffer drives nothing set 3 bits per pad
  that ISE's bitgen clears (the pad's input-standard bits: ISE writes the pad without its input,
  whatever the standard; DRC warning PhysDesignRules:812, dangling pin). The packer leaves such
  inputs out, as ISE's map does, and bitgen writes the pad feature `I:NOLOAD` when an XDL has one.
- fpu-adder: bitgen: `SLICE0:C2VDD:` / `SLICE1:C2VDD:` (a carry chain whose first input is VCC)
  are not in the bit database.
- vtr-stereovision3: a **second clock from a pad** cannot reach a BUFGMUX on known PIPs (the
  BUFGMUX inputs of 7 of the 8 are not measured), and the placer puts an unconstrained clock on any
  pad.
- The packer does not support block RAM, distributed RAM, SRL16 or MULT18X18 yet: every CPU and
  FIFO is retried without them (much larger: SERV's register file in flip-flops, 1492 slices).

## Nightly CI (.github/workflows/nightly.yml, job `designs`)

    - uses: actions/cache@v4   (path: .cache/designs-corpus, key: hashFiles('test/designs-corpus/manifest.json'))
    - run: npm ci
    - run: npm run fetch:designs
    - run: npm run test:designs -- --jobs 4      (statuses, warnings, quality; times against 'ci')
    - run: node test/designs-corpus/boards.mjs .cache/designs-boards .cache/designs-boards/bits
                                                  (the board designs: testbench, open flow, bitstream;
                                                   fails when one does not build)
    - upload .cache/designs-results/results.json and the board bitstreams (always) as an artifact

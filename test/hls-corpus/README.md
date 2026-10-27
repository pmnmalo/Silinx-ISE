# HLS corpus: AMD's Vitis HLS examples through Silinx HLS

The C to HDL tests check Silinx HLS on designs written for them. This corpus (#1597) takes **AMD's Vitis HLS
Introductory Examples** ([Xilinx/Vitis-HLS-Introductory-Examples](https://github.com/Xilinx/Vitis-HLS-Introductory-Examples),
Apache-2.0: the examples of UG1399) through Silinx's HLS flow, as the design corpus (`test/designs-corpus`) takes real
designs through the toolchain:

    npm run test:hls                       # every design, compared with expected.json
    npm run test:hls -- --filter pointer
    npm run test:hls -- --update           # record the results as the expectations, and the table below

Not part of `npm test` (it needs the network once).

- **The designs**: `manifest.json`, written by `scripts/hls-corpus-manifest.mjs` from the repository at a **pinned
  commit**: one design per example folder with an `hls_config.cfg` (its `syn.top`, `syn.file`, `tb.file`), the
  headers beside its sources, its language (C when every source is `.c`). The files are fetched by
  `scripts/fetch-design-corpus.mjs` into `.cache/designs-corpus/` (git-ignored), never committed.
- **The stages**: the C simulation (the example's own test bench, `main()`: it passes when it returns 0), the C
  synthesis (VHDL and Verilog), the C/RTL co-simulation (its calls of the top function replayed on the VHDL), its
  latency; a C++ example is skipped (#1590). The first reason a design stops is recorded.
- **The expectations**: `expected.json`; a run fails on any difference (a design that passes a stage it did not, or
  no longer passes one): record an improvement with `--update`, and make an issue of a loss.

## The results

<!-- results -->
| Design | Language | C simulation | C synthesis | Co-simulation | Latency | Why not |
|---|---|---|---|---|---|---|
| array-array-partition-block-cyclic | C++ | fail | fail | skip | - | C simulation: matmul_partition_test.cpp:19: the header 'algorithm' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| array-array-partition-complete | C++ | fail | fail | skip | - | C simulation: matmul_partition_test.cpp:19: the header 'algorithm' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| dsp-fft-interface-array | C++ | fail | fail | skip | - | C simulation: fft_top.h:18: the header 'hls_fft.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| dsp-fft-interface-array-float-ssr2 | C++ | fail | fail | skip | - | C simulation: fft_top.h:17: the header 'hls_fft.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| dsp-fft-interface-stream | C++ | fail | fail | skip | - | C simulation: fft_top.h:18: the header 'hls_fft.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| dsp-fft-interface-stream-float-ssr2 | C++ | fail | fail | skip | - | C simulation: fft_top.h:17: the header 'hls_fft.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| dsp-fft-logicore-fft-float-ssr | C++ | fail | fail | skip | - | C simulation: fft_top.h:17: the header 'hls_fft.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| dsp-fir-decimator | C++ | fail | fail | skip | - | C simulation: fir_top.h:19: the header 'hls_fir.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-aggregation-disaggregation-aggregation-of-m-axi-ports | C++ | fail | fail | skip | - | C simulation: 26: 'A' is not declared |
| interface-aggregation-disaggregation-aggregation-of-nested-structs | C++ | pass | pass | pass | 83 |  |
| interface-aggregation-disaggregation-aggregation-of-struct | C++ | pass | pass | pass | 183 |  |
| interface-aggregation-disaggregation-auto-disaggregation-of-struct | C++ | fail | fail | skip | - | C simulation: 22: the number of iterations of this loop is not known: give its bound (a 'for' from a constant to a constant, its variable not changed in its body), or #pragma HLS LOOP_TRIPCOUNT max=N in it |
| interface-aggregation-disaggregation-disaggregation-of-axis-port | C++ | pass | pass | pass | 53 |  |
| interface-aggregation-disaggregation-struct-ii-issue | C++ | fail | fail | skip | - | C simulation: example.cpp:23: the pointer to a struct 'a_in' indexed: write the parameter as an array, a_in[N] |
| interface-memory-burst-rw | C++ | fail | fail | skip | - | C simulation: vadd_test.cpp:16: the header 'vector' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-memory-coefficient-filter | C | fail | fail | skip | - | C simulation: 43: 'real_val': floating point (float) is not supported in Silinx HLS yet: use integers or ap_int<W> |
| interface-memory-ecc-flags | C++ | pass | pass | pass | 118 |  |
| interface-memory-lmem-2rw | C++ | fail | fail | skip | - | C simulation: vadd_test.cpp:20: the header 'vector' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-memory-manual-burst-manual-burst-example-auto-burst-inference-failure | C++ | fail | fail | skip | - | C simulation: 19: 'NUM' is declared twice |
| interface-memory-manual-burst-manual-burst-example-manual-burst-inference-success | C++ | fail | fail | skip | - | C simulation: example.h:19: the header 'hls_burst_maxi.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-memory-manual-burst-manual-burst-with-conditionals | C++ | fail | fail | skip | - | C simulation: example.h:18: the header 'hls_burst_maxi.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-memory-max-widen-port-width | C++ | pass | pass | pass | 259 |  |
| interface-memory-ram-uram | C++ | pass | pass | pass | 4-5 |  |
| interface-memory-rom-lookup-table-math | C++ | fail | fail | skip | - | C simulation: 24: 'real_val': floating point (dint_t) is not supported in Silinx HLS yet: use integers or ap_int<W> |
| interface-memory-using-axi-master | C++ | fail | fail | skip | - | C simulation: 37: memcpy is a system call: not possible in the synthesized code (Silinx HLS, as Vitis HLS) |
| interface-register-using-axi-lite-with-user-defined-offset | C++ | pass | pass | pass | - |  |
| interface-streaming-axi-stream-custom-side-channel-data-2 | C++ | fail | fail | skip | - | C simulation: example.h:20: the header 'ap_axi_sdata.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-streaming-axi-stream-to-master | C++ | fail | fail | skip | - | C simulation: example.h:18: the header 'ap_axi_sdata.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-streaming-axis-array-stream-no-side-channel-data | C++ | pass | pass | pass | 203 |  |
| interface-streaming-using-array-of-streams | C++ | fail | fail | skip | - | C simulation: 23: '.write' is not a member function Silinx HLS knows (ap_int / ap_uint: range, to_double, to_float, to_int, to_uint, to_long, to_ulong, to_int64, to_uint64, length, and_reduce, or_reduce, xor_reduce) |
| interface-streaming-using-axi-stream-with-side-channel-data | C++ | fail | fail | skip | - | C simulation: example.h:20: the header 'ap_axi_sdata.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| interface-streaming-using-axi-stream-with-struct | C++ | fail | fail | skip | - | C simulation: example.h:1: the header 'ap_axi_sdata.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| migration-python-scripts | C | pass | pass | pass | 1 |  |
| migration-vitis-unified-cli | C | pass | pass | pass | 1 |  |
| misc-initialization-and-reset-static-array-rom | C++ | pass | pass | pass | 1 |  |
| misc-malloc-removed | C | fail | fail | skip | - | C simulation: 120: 'out_accum': a pointer variable is not possible in Silinx HLS (pointers only as arguments; use an array index) |
| misc-rtl-as-blackbox | C++ | fail | fail | skip | - | C simulation: 29: 'rtl_model' is declared but not defined |
| modeling-pointers-basic-arithmetic | C | fail | fail | skip | - | C simulation: 24: '*' reads a pointer parameter (Silinx HLS: pointers only as arguments) |
| modeling-pointers-multiple-pointers | C | fail | fail | skip | - | C simulation: 23: 'ptr': a pointer variable is not possible in Silinx HLS (pointers only as arguments; use an array index) |
| modeling-pointers-native-casts | C | fail | fail | skip | - | C simulation: 112: 'ptr': a pointer variable is not possible in Silinx HLS (pointers only as arguments; use an array index) |
| modeling-pointers-stream-better | C | pass | pass | pass | - |  |
| modeling-pointers-stream-good | C | fail | fail | skip | - | C simulation: 23: pointer arithmetic is not possible in Silinx HLS: index the array instead |
| modeling-pointers-using-double | C | fail | fail | skip | - | C simulation: 19: the parameter 'flagPtr': a pointer to a pointer is not possible (Silinx HLS: pointers only to arguments) |
| modeling-conditional-control-of-pragmas-using-defines | C++ | pass | pass | pass | 71 |  |
| modeling-conditional-control-of-pragmas-using-template-function | C++ | pass | pass | pass | 80 |  |
| modeling-cpp-templates-for-multiple-instances | C++ | pass | pass | pass | 1 |  |
| modeling-fixed-point-sqrt | C++ | pass | pass | pass | - |  |
| modeling-free-running-kernel-remerge-ii4to1 | C++ | fail | fail | skip | - | C simulation: 24: a type expected, not '"in_stream"' |
| modeling-using-arbitrary-precision-arith | C++ | pass | pass | pass | - |  |
| modeling-using-arbitrary-precision-casting | C++ | pass | pass | pass | - |  |
| modeling-using-array-stencil-1d | C++ | fail | fail | skip | - | C simulation: 23: the parameter 'in': floating point (float) is not supported in Silinx HLS yet: use integers or ap_int<W> |
| modeling-using-array-stencil-2d | C++ | fail | fail | skip | - | C simulation: test.cpp:19: the header 'malloc.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| modeling-using-cpp-templates | C++ | pass | pass | pass | - |  |
| modeling-using-fixed-point | C++ | pass | pass | pass | 1 |  |
| modeling-using-float-and-double | C | fail | fail | skip | - | C simulation: fp_mul_pow2.c:29: 'bexp' is not a member of float_num_t |
| modeling-using-vectors | C++ | fail | fail | skip | - | C simulation: example.h:20: the header 'hls_vector.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| modeling-variable-bound-loops | C++ | fail | fail | skip | - | C simulation: 26: the number of iterations of this loop is not known: give its bound (a 'for' from a constant to a constant, its variable not changed in its body), or #pragma HLS LOOP_TRIPCOUNT max=N in it |
| pipelining-functions-function-instantiate | C++ | pass | pass | pass | - |  |
| pipelining-functions-hier-func | C++ | fail | fail | skip | - | C simulation: 81: 'fp1': structures (FILE) are not supported in Silinx HLS yet |
| pipelining-loops-imperfect-loop | C++ | pass | pass | pass | 1723 |  |
| pipelining-loops-perfect-loop | C++ | pass | pass | pass | 1723 |  |
| pipelining-loops-using-free-running-pipeline | C++ | fail | fail | skip | - | C simulation: free_pipe_mult.h:18: the header 'ap_axi_sdata.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-control-driven-channels-autorestart | C++ | fail | fail | skip | - | C simulation: diamond_test.cpp:22: the header 'hls_task.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-control-driven-channels-merge-split-merge-load-balance | C++ | fail | fail | skip | - | C simulation: test.h:19: the header 'hls_np_channel.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-control-driven-channels-merge-split-merge-round-robin | C++ | fail | fail | skip | - | C simulation: test.h:19: the header 'hls_np_channel.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-control-driven-channels-merge-split-split-load-balance | C++ | fail | fail | skip | - | C simulation: test.h:20: the header 'hls_np_channel.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-control-driven-channels-merge-split-split-round-robin | C++ | fail | fail | skip | - | C simulation: test.h:20: the header 'hls_np_channel.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-control-driven-channels-simple-fifos | C++ | fail | pass | skip | - | C simulation: main() returned 1 |
| task-level-parallelism-control-driven-channels-using-fifos | C++ | fail | fail | skip | - | C simulation: diamond.h:20: the header 'hls_vector.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-control-driven-channels-using-stream-of-blocks | C++ | fail | fail | skip | - | C simulation: diamond.h:19: the header 'hls_streamofblocks.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-data-driven-mixed-control-and-data-driven | C++ | fail | fail | skip | - | C simulation: test.h:19: the header 'hls_np_channel.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-data-driven-simple-data-driven | C++ | fail | fail | skip | - | C simulation: test.h:17: the header 'hls_task.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |
| task-level-parallelism-data-driven-unique-task-regions | C++ | fail | fail | skip | - | C simulation: test.h:19: the header 'hls_task.h' is not one of Silinx HLS's (ap_int.h, ap_fixed.h, stdint.h, stdbool.h, stdio.h, stdlib.h, string.h, math.h, stddef.h, limits.h, assert.h) |

73 designs: 23 through co-simulation.
<!-- /results -->

## Against Vitis HLS

AMD's Vitis HLS is the oracle (#1624): `scripts/hls-vitis.mjs` runs each design through it on the ISE runner's machine
(its own Docker image, [scripts/vitis-hls-image](../../scripts/vitis-hls-image/README.md): Vivado ML Standard, free for
the small 7-series parts; a fixed Artix-7, the Vivado flow's interfaces) and compares its C simulation, its RTL ports
(by name, direction and width), its co-simulation and its latency with Silinx's. Vitis does not target the
Spartan-3E: the ports and the behaviour at them must be the same; the latency and the loops' II are a quality
reference (Silinx's schedule is its own). `--update` writes `vitis.json` (numbers and port names only, no Vitis file)
and this table:

<!-- vitis -->
Not run yet.
<!-- /vitis -->

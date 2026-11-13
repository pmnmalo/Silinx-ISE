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
  no longer passes one, or a co-simulation's latency that changed, #2614): record an improvement with `--update`, and
  make an issue of a loss.

## The results

<!-- results -->
| Design | Language | C simulation | C synthesis | Co-simulation | Latency | Why not |
|---|---|---|---|---|---|---|
| array-array-partition-block-cyclic | C++ | pass | pass | pass | 155005 |  |
| array-array-partition-complete | C++ | pass | pass | pass | 351661 |  |
| dsp-fft-interface-array | C++ | pass | pass | pass | 26626 |  |
| dsp-fft-interface-array-float-ssr2 | C++ | pass | pass | pass | 64002-64006 |  |
| dsp-fft-interface-stream | C++ | pass | pass | pass | 26626 |  |
| dsp-fft-interface-stream-float-ssr2 | C++ | pass | pass | pass | 61104-61106 |  |
| dsp-fft-logicore-fft-float-ssr | C++ | pass | pass | pass | 61104-61106 |  |
| dsp-fir-decimator | C++ | pass | pass | pass | 31 |  |
| interface-aggregation-disaggregation-aggregation-of-m-axi-ports | C++ | pass | pass | pass | 40 |  |
| interface-aggregation-disaggregation-aggregation-of-nested-structs | C++ | pass | pass | pass | 19 |  |
| interface-aggregation-disaggregation-aggregation-of-struct | C++ | pass | pass | pass | 13 |  |
| interface-aggregation-disaggregation-auto-disaggregation-of-struct | C++ | pass | pass | pass | 35 |  |
| interface-aggregation-disaggregation-disaggregation-of-axis-port | C++ | pass | pass | pass | 21 |  |
| interface-aggregation-disaggregation-struct-ii-issue | C++ | pass | pass | pass | 6501 |  |
| interface-memory-burst-rw | C++ | pass | pass | pass | 16531 |  |
| interface-memory-coefficient-filter | C | pass | pass | pass | 259 |  |
| interface-memory-ecc-flags | C++ | pass | pass | pass | 71 |  |
| interface-memory-lmem-2rw | C++ | pass | pass | pass | 41388 |  |
| interface-memory-manual-burst-manual-burst-example-auto-burst-inference-failure | C++ | pass | pass | pass | 20401 |  |
| interface-memory-manual-burst-manual-burst-example-manual-burst-inference-success | C++ | pass | pass | pass | 20401 |  |
| interface-memory-manual-burst-manual-burst-with-conditionals | C++ | pass | pass | pass | 8067 |  |
| interface-memory-max-widen-port-width | C++ | pass | pass | pass | 241 |  |
| interface-memory-ram-uram | C++ | pass | pass | pass | 10-28 |  |
| interface-memory-rom-lookup-table-math | C++ | pass | pass | pass | 2 |  |
| interface-memory-using-axi-master | C++ | pass | pass | pass | 387 |  |
| interface-register-using-axi-lite-with-user-defined-offset | C++ | pass | pass | pass | 24 |  |
| interface-streaming-axi-stream-custom-side-channel-data-2 | C++ | pass | pass | pass | 6 |  |
| interface-streaming-axi-stream-to-master | C++ | pass | pass | pass | 13062 |  |
| interface-streaming-axis-array-stream-no-side-channel-data | C++ | pass | pass | pass | 101 |  |
| interface-streaming-using-array-of-streams | C++ | pass | pass | pass | 71 |  |
| interface-streaming-using-axi-stream-with-side-channel-data | C++ | pass | pass | pass | 6 |  |
| interface-streaming-using-axi-stream-with-struct | C++ | pass | pass | pass | 32 |  |
| migration-python-scripts | C | pass | pass | pass | 23-25 |  |
| migration-vitis-unified-cli | C | pass | pass | pass | 23-25 |  |
| misc-initialization-and-reset-static-array-rom | C++ | pass | pass | pass | 2 |  |
| misc-malloc-removed | C | pass | pass | pass | 71 |  |
| misc-rtl-as-blackbox | C++ | pass | pass | pass | 5 |  |
| modeling-pointers-basic-arithmetic | C | pass | pass | pass | 44 |  |
| modeling-pointers-multiple-pointers | C | pass | pass | pass | 1 |  |
| modeling-pointers-native-casts | C | pass | pass | pass | 411 |  |
| modeling-pointers-stream-better | C | pass | pass | pass | 6-9 |  |
| modeling-pointers-stream-good | C | pass | pass | pass | 6 |  |
| modeling-pointers-using-double | C | pass | pass | pass | 21-23 |  |
| modeling-conditional-control-of-pragmas-using-defines | C++ | pass | pass | pass | 31 |  |
| modeling-conditional-control-of-pragmas-using-template-function | C++ | pass | pass | pass | 60 |  |
| modeling-cpp-templates-for-multiple-instances | C++ | pass | pass | pass | 21-25 |  |
| modeling-fixed-point-sqrt | C++ | pass | pass | pass | 65 |  |
| modeling-free-running-kernel-remerge-ii4to1 | C++ | pass | pass | pass | 80 |  |
| modeling-using-arbitrary-precision-arith | C++ | pass | pass | pass | 76-80 |  |
| modeling-using-arbitrary-precision-casting | C++ | pass | pass | pass | 4 |  |
| modeling-using-array-stencil-1d | C++ | pass | pass | pass | 62965 |  |
| modeling-using-array-stencil-2d | C++ | pass | pass | pass | 128848-128877 |  |
| modeling-using-cpp-templates | C++ | pass | pass | pass | 2 |  |
| modeling-using-fixed-point | C++ | pass | pass | pass | 1 |  |
| modeling-using-float-and-double | C | pass | pass | pass | 2 |  |
| modeling-using-vectors | C++ | pass | pass | pass | 6975 |  |
| modeling-variable-bound-loops | C++ | pass | pass | pass | 2-34 |  |
| pipelining-functions-function-instantiate | C++ | pass | pass | pass | - |  |
| pipelining-functions-hier-func | C++ | pass | pass | pass | - |  |
| pipelining-loops-imperfect-loop | C++ | pass | pass | pass | 563 |  |
| pipelining-loops-perfect-loop | C++ | pass | pass | pass | 1723 |  |
| pipelining-loops-using-free-running-pipeline | C++ | pass | pass | pass | 107 |  |
| task-level-parallelism-control-driven-channels-autorestart | C++ | pass | pass | pass | 322-325 |  |
| task-level-parallelism-control-driven-channels-merge-split-merge-load-balance | C++ | pass | pass | pass | 530 |  |
| task-level-parallelism-control-driven-channels-merge-split-merge-round-robin | C++ | pass | pass | pass | 530 |  |
| task-level-parallelism-control-driven-channels-merge-split-split-load-balance | C++ | pass | pass | pass | 120 |  |
| task-level-parallelism-control-driven-channels-merge-split-split-round-robin | C++ | pass | pass | pass | 120 |  |
| task-level-parallelism-control-driven-channels-simple-fifos | C++ | pass | pass | pass | 315 |  |
| task-level-parallelism-control-driven-channels-using-fifos | C++ | pass | pass | pass | 1965-1974 |  |
| task-level-parallelism-control-driven-channels-using-stream-of-blocks | C++ | pass | pass | pass | 431-433 |  |
| task-level-parallelism-data-driven-mixed-control-and-data-driven | C++ | pass | pass | pass | 139 |  |
| task-level-parallelism-data-driven-simple-data-driven | C++ | pass | pass | pass | 45 |  |
| task-level-parallelism-data-driven-unique-task-regions | C++ | pass | pass | pass | 76-77 |  |

73 designs: 73 through co-simulation.
<!-- /results -->

## Against Vitis HLS

AMD's Vitis HLS is the oracle (#1624): `scripts/hls-vitis.mjs` runs each design through it on the ISE runner's machine
(its own Docker image, [scripts/vitis-hls-image](../../scripts/vitis-hls-image/README.md): Vivado ML Standard, free for
the small 7-series parts; a fixed Artix-7, the Vivado flow's interfaces) and compares its C simulation, its RTL ports
(by name, direction and width), its co-simulation and its latency with Silinx's. Vitis does not target the
Spartan-3E: the ports and the behaviour at them must be the same; the latency and the loops' II are a quality
reference (Silinx's schedule is its own). Each side's modules are recorded too (#2244: Vitis's from `csynth.xml`'s RTL
hierarchy, Silinx's from its report's functions, `{ module, instance, of }`), the oracle of which functions Vitis HLS keeps
as modules of their own. `--update` writes `vitis.json` (numbers and port and module names only, no Vitis file) and this
table:

<!-- vitis -->
Vitis HLS (xilinx/vitis-hls:2025.2, xc7a35tcpg236-1) against Silinx HLS: the C simulation, the ports, the latency (cycles) and the loops' II (Vitis's pipelined loops).

| Design | C simulation (Vitis / Silinx) | Co-simulation (Vitis / Silinx) | Ports | Latency (Vitis / Silinx) | Loops' II (Vitis / Silinx) |
|---|---|---|---|---|---|
| array-array-partition-block-cyclic | pass / pass | pass / pass | same | 801-1337 / 155005 | readA 1 / 1 |
| array-array-partition-complete | pass / pass | pass / pass | same | - / 351661 | read_A 1 / 1 |
| dsp-fft-interface-array | pass / pass | pass / pass | same | 3198 / 26626 | VITIS_LOOP_2444_1 1 / - |
| dsp-fft-interface-array-float-ssr2 | pass / pass | skip / pass | - | - / 64002-64006 | - |
| dsp-fft-interface-stream | pass / pass | pass / pass | same | 3198 / 26626 | VITIS_LOOP_2407_1 1 / - |
| dsp-fft-interface-stream-float-ssr2 | pass / pass | skip / pass | - | - / 61104-61106 | - |
| dsp-fft-logicore-fft-float-ssr | pass / pass | skip / pass | - | - / 61104-61106 | - |
| dsp-fir-decimator | pass / pass | pass / pass | same | 32 / 31 | VITIS_LOOP_1083_2 1 / - |
| interface-aggregation-disaggregation-aggregation-of-m-axi-ports | pass / pass | pass / pass | same | 36 / 40 | VITIS_LOOP_25_1 2 / 1 |
| interface-aggregation-disaggregation-aggregation-of-nested-structs | pass / pass | pass / pass | same | 17 / 19 | top_label0 2 / 2 |
| interface-aggregation-disaggregation-aggregation-of-struct | pass / pass | pass / pass | missing arr_dout, arr_empty_n, arr_read; extra arr_address0, arr_ce0, arr_q0 | 24 / 13 | VITIS_LOOP_24_1 2 / 1 |
| interface-aggregation-disaggregation-auto-disaggregation-of-struct | pass / pass | pass / pass | same | - / 35 | VITIS_LOOP_22_1 2 / 2 |
| interface-aggregation-disaggregation-disaggregation-of-axis-port | pass / pass | pass / pass | same | 13 / 21 | VITIS_LOOP_26_1 1 / 1 |
| interface-aggregation-disaggregation-struct-ii-issue | pass / pass | pass / pass | same | 542 / 6501 | READ 2 / - |
| interface-memory-burst-rw | pass / pass | pass / pass | same | 4-50753 / 16531 | - |
| interface-memory-coefficient-filter | pass / pass | pass / pass | same | 516 / 259 | process_frame 2 / 1 |
| interface-memory-ecc-flags | pass / pass | skip / pass | - | - / 71 | - |
| interface-memory-lmem-2rw | pass / pass | pass / pass | same | 13-14513 / 41388 | - |
| interface-memory-manual-burst-manual-burst-example-auto-burst-inference-failure | pass / pass | pass / pass | same | - / 20401 | VITIS_LOOP_24_1 1 / 1 |
| interface-memory-manual-burst-manual-burst-example-manual-burst-inference-success | pass / pass | pass / pass | same | - / 20401 | VITIS_LOOP_29_1 1 / 1 |
| interface-memory-manual-burst-manual-burst-with-conditionals | pass / pass | pass / pass | same | 1663-1073743492 / 8067 | VITIS_LOOP_29_1 4 / 7 |
| interface-memory-max-widen-port-width | pass / pass | pass / pass | same | 81 / 241 | VITIS_LOOP_26_1 1 / 1 |
| interface-memory-ram-uram | pass / pass | skip / pass | - | - / 10-28 | - |
| interface-memory-rom-lookup-table-math | pass / pass | pass / pass | same | 6 / 2 | - |
| interface-memory-using-axi-master | pass / pass | pass / pass | same | 181 / 387 | Loop1 1 / - |
| interface-register-using-axi-lite-with-user-defined-offset | pass / pass | pass / pass | same | 1 / 24 | - |
| interface-streaming-axi-stream-custom-side-channel-data-2 | pass / pass | pass / pass | same | 2 / 6 | - |
| interface-streaming-axi-stream-to-master | pass / pass | pass / pass | same | - / 13062 | VITIS_LOOP_40_1 3 / - |
| interface-streaming-axis-array-stream-no-side-channel-data | pass / pass | pass / pass | same | 54 / 101 | VITIS_LOOP_24_1 1 / 1 |
| interface-streaming-using-array-of-streams | pass / pass | pass / pass | same | 96 / 71 | VITIS_LOOP_25_1_VITIS_LOOP_26_2 3 / - |
| interface-streaming-using-axi-stream-with-side-channel-data | pass / pass | pass / pass | same | 2 / 6 | - |
| interface-streaming-using-axi-stream-with-struct | pass / pass | pass / pass | same | - / 32 | VITIS_LOOP_25_1 1 / 6 |
| migration-python-scripts | pass / pass | pass / pass | same | 16 / 23-25 | - |
| migration-vitis-unified-cli | pass / pass | pass / pass | same | 16 / 23-25 | - |
| misc-initialization-and-reset-static-array-rom | pass / pass | pass / pass | same | 1 / 2 | - |
| misc-malloc-removed | pass / pass | pass / pass | same | 70 / 71 | LOOP_SHIFT 1 / 1 |
| misc-rtl-as-blackbox | pass / pass | pass / pass | same | 4 / 5 | - |
| modeling-pointers-basic-arithmetic | pass / pass | pass / pass | same | 26 / 44 | VITIS_LOOP_23_1 2 / 2 |
| modeling-pointers-multiple-pointers | pass / pass | pass / pass | same | 2 / 1 | - |
| modeling-pointers-native-casts | pass / pass | pass / pass | same | 826 / 411 | VITIS_LOOP_117_1 2 / 1 |
| modeling-pointers-stream-better | pass / pass | pass / pass | same | 5 / 6-9 | - |
| modeling-pointers-stream-good | pass / pass | pass / pass | same | 6 / 6 | - |
| modeling-pointers-using-double | pass / pass | pass / pass | missing m_axi_gmem_AWVALID, m_axi_gmem_AWREADY, m_axi_gmem_AWADDR, m_axi_gmem_AWID, m_axi_gmem_AWLEN, m_axi_gmem_AWSIZE, m_axi_gmem_AWBURST, m_axi_gmem_AWLOCK, m_axi_gmem_AWCACHE, m_axi_gmem_AWPROT, m_axi_gmem_AWQOS, m_axi_gmem_AWREGION, m_axi_gmem_AWUSER, m_axi_gmem_WVALID, m_axi_gmem_WREADY, m_axi_gmem_WDATA, m_axi_gmem_WSTRB, m_axi_gmem_WLAST, m_axi_gmem_WID, m_axi_gmem_WUSER, m_axi_gmem_ARVALID, m_axi_gmem_ARREADY, m_axi_gmem_ARADDR, m_axi_gmem_ARID, m_axi_gmem_ARLEN, m_axi_gmem_ARSIZE, m_axi_gmem_ARBURST, m_axi_gmem_ARLOCK, m_axi_gmem_ARCACHE, m_axi_gmem_ARPROT, m_axi_gmem_ARQOS, m_axi_gmem_ARREGION, m_axi_gmem_ARUSER, m_axi_gmem_RVALID, m_axi_gmem_RREADY, m_axi_gmem_RDATA, m_axi_gmem_RLAST, m_axi_gmem_RID, m_axi_gmem_RUSER, m_axi_gmem_RRESP, m_axi_gmem_BVALID, m_axi_gmem_BREADY, m_axi_gmem_BRESP, m_axi_gmem_BID, m_axi_gmem_BUSER | 59 / 21-23 | Loop1 2 / - |
| modeling-conditional-control-of-pragmas-using-defines | pass / pass | pass / pass | same | 18 / 31 | DP_LOOP 2 / 4 |
| modeling-conditional-control-of-pragmas-using-template-function | pass / pass | pass / pass | same | 20 / 60 | - |
| modeling-cpp-templates-for-multiple-instances | pass / pass | pass / pass | same | 17 / 21-25 | - |
| modeling-fixed-point-sqrt | pass / pass | pass / pass | same | 33 / 65 | - |
| modeling-free-running-kernel-remerge-ii4to1 | pass / pass | pass / pass | same | 78 / 80 | VITIS_LOOP_52_1 1 / - |
| modeling-using-arbitrary-precision-arith | pass / pass | pass / pass | same | 43 / 76-80 | - |
| modeling-using-arbitrary-precision-casting | pass / pass | pass / pass | same | 3 / 4 | - |
| modeling-using-array-stencil-1d | pass / pass | pass / pass | same | 10054 / 62965 | VITIS_LOOP_32_1_VITIS_LOOP_33_2 1 / - |
| modeling-using-array-stencil-2d | pass / pass | pass / pass | same | 45016 / 128848-128877 | load_coefs_VITIS_LOOP_40_1 1 / - |
| modeling-using-cpp-templates | pass / pass | pass / pass | same | 1 / 2 | - |
| modeling-using-fixed-point | pass / pass | pass / pass | same | 3 / 1 | - |
| modeling-using-float-and-double | pass / pass | pass / pass | same | 2 / 2 | - |
| modeling-using-vectors | pass / pass | pass / pass | m_axi_gmem0_WDATA: out 32, not out 512; m_axi_gmem0_WSTRB: out 4, not out 64; m_axi_gmem0_RDATA: in 32, not in 512; m_axi_gmem1_WDATA: out 32, not out 512; m_axi_gmem1_WSTRB: out 4, not out 64; m_axi_gmem1_RDATA: in 32, not in 512 | - / 6975 | - |
| modeling-variable-bound-loops | pass / pass | pass / pass | same | 1-63 / 2-34 | - |
| pipelining-functions-function-instantiate | pass / pass | pass / pass | same | 0 / - | - |
| pipelining-functions-hier-func | pass / pass | pass / pass | same | 0 / - | - |
| pipelining-loops-imperfect-loop | pass / pass | pass / pass | same | 405 / 563 | LOOP_I_LOOP_J 1 / - |
| pipelining-loops-perfect-loop | pass / pass | pass / pass | same | 405 / 1723 | LOOP_I_LOOP_J 1 / - |
| pipelining-loops-using-free-running-pipeline | pass / pass | pass / pass | same | 190 / 107 | VITIS_LOOP_63_1 1 / - |
| task-level-parallelism-control-driven-channels-autorestart | pass / pass | pass / pass | same | 303-306 / 322-325 | Loop0 2 / - |
| task-level-parallelism-control-driven-channels-merge-split-merge-load-balance | pass / pass | pass / pass | same | 66 / 530 | VITIS_LOOP_21_1 1 / - |
| task-level-parallelism-control-driven-channels-merge-split-merge-round-robin | pass / pass | pass / pass | same | 66 / 530 | VITIS_LOOP_21_1 1 / - |
| task-level-parallelism-control-driven-channels-merge-split-split-load-balance | pass / pass | pass / pass | same | 18 / 120 | VITIS_LOOP_22_1 1 / - |
| task-level-parallelism-control-driven-channels-merge-split-split-round-robin | pass / pass | pass / pass | same | 18 / 120 | VITIS_LOOP_22_1 1 / - |
| task-level-parallelism-control-driven-channels-simple-fifos | pass / pass | pass / pass | same | 109 / 315 | Loop0 1 / - |
| task-level-parallelism-control-driven-channels-using-fifos | pass / pass | pass / pass | m_axi_gmem_WDATA: out 32, not out 512; m_axi_gmem_WSTRB: out 4, not out 64; m_axi_gmem_RDATA: in 32, not in 512 | 27-91 / 1965-1974 | Loop_Ld 2 / - |
| task-level-parallelism-control-driven-channels-using-stream-of-blocks | pass / pass | pass / pass | same | 264 / 431-433 | funcA_Loop0 10 / - |
| task-level-parallelism-data-driven-mixed-control-and-data-driven | pass / pass | pass / pass | same | - / 139 | VITIS_LOOP_26_1 2 / - |
| task-level-parallelism-data-driven-simple-data-driven | pass / pass | pass / pass | same | 3 / 45 | - |
| task-level-parallelism-data-driven-unique-task-regions | pass / pass | pass / pass | same | - / 76-77 | - |

73 designs: 73 through Vitis's C simulation, 64 with Silinx's ports the same as Vitis's.
<!-- /vitis -->
